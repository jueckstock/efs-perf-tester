'use strict';

const matchName = (/** @type {String[]} */...matchNames) => {
    return (event) => {
        return matchNames.includes(event.name);
    }
}

const matchCatAny = (/** @type {String[]} */...matchCategories) => {
    return (event) => {
        for (const cat of event.cat) {
            if (matchCategories.includes(cat)) {
                return true;
            }
        }
        return false;
    }
}

const eventProcessorRules = [{
    matches: matchName('domContentLoadedEventStart', 'domInteractive', 'loadEventStart', 'firstPaint', 'firstContentfulPaint'), 
    process: (event, stats, extra) => {
        const { 
            args: {
                frame,
            },
            name, 
            ts,
        } = event;
        const frameEpoch = (extra.frameEpochMap && extra.frameEpochMap[frame]);
        if (frameEpoch) {
            stats.loading = stats.loading || {};
            stats.loading[name] = ts - frameEpoch;
        }
    }
}, {
    matches: matchName('largestContentfulPaint::Candidate'), 
    process: (event, stats, extra) => {
        const {
            args: {
                data: {
                    isMainFrame,
                    size,
                },
                frame,
            },
            ts,
        } = event;
        if (isMainFrame) {
            const frameEpoch = (extra.frameEpochMap && extra.frameEpochMap[frame]);
            if (frameEpoch) {
                const sload = (stats.loading = stats.loading || {});
                const oldSize = extra.lcpSize || 0;
                if (size > oldSize) {
                    sload.largestContentfulPaint = ts - frameEpoch;
                    extra.lcpSize = size;
                }
            }
        }
    }
}, {
    matches: matchName('navigationStart'),
    process: (event, _, extra) => {
        const {
            args: {
                data: {
                    documentLoaderURL,
                    isLoadingMainFrame,
                },
                frame,
            },
            pid,
            ts,
        } = event;

        // ignore sub-frame loads 
        if (isLoadingMainFrame) {
            extra.frameEpochMap = extra.frameEpochMap || {};
            extra.frameEpochMap[frame] = ts;

            // ignore non-URLs when considering execution context origin per renderer pid
            if  ((documentLoaderURL !== '') && (documentLoaderURL !== 'about:blank')) {
                const navUrl = new URL(documentLoaderURL);
                extra.pidOriginMap = extra.pidOriginMap || {};
                extra.pidOriginMap[pid] = navUrl.origin;
            }
        }
    }
}, /*{
    matches: matchName('FrameCommittedInBrowser'),
    process: (event, _, extra) => {
        const {
            args: {
                data: {
                    processId: pid,
                    frame,
                    parent,
                    url
                }
            },
            ts,
        } = event;

        // stash url/frame-d/parent-frame-id in our extra state map (keyed by PID)
        const pidOriginMap = (extra.pidOriginMap = extra.pidOriginMap || {});
        pidOriginMap[pid] = {
            url: new URL(url),
            frame,
            parent,
        };

        // detect the root frame (no parent) navigation commit; we will use this as the epoch for all loading times
        if (typeof parent === 'undefined') {
            if (typeof extra.loadingEpoch !== 'undefined') {
                throw new Error(`duplicate loading epoch ${ts} (previous was ${extra.loadingEpoch})`);
            }
            extra.loadingEpoch = ts;
        }
    }
},*/ {
    matches: matchCatAny('v8', 'disabled-by-default-v8.runtime_stats'),
    process: (event, stats, extra) => {
        if (('args' in event) && ('runtime-call-stats' in event.args)) {
            const executionOrigin = extra.pidOriginMap && extra.pidOriginMap[event.pid];
            if (!executionOrigin) {
                console.warn(`STATS[v8]: unable to lookup execution context origin for pid=${event.pid}?!`);
                return;
            }

            const v8Stats = (stats.v8 = stats.v8 || {});
            const v8OriginStats = (v8Stats[executionOrigin] = v8Stats[executionOrigin] || {
                count: 0,
                microseconds: 0,
            });
            const rcs = event.args['runtime-call-stats'];
            for (const key in rcs) {
                if (rcs.hasOwnProperty(key)) {
                    const [ eventCount, eventMicroseconds ] = rcs[key];
                    v8OriginStats.count += eventCount;
                    v8OriginStats.microseconds += eventMicroseconds;
                }
            }
        }
    }
}, {
    matches: matchName('ResourceSendRequest'),
    process: (event, stats, extra) => {
        const {
            args: {
                data: {
                    url,
                    requestId,
                }
            }
        } = event;
        const origin = (new URL(url)).origin;
        const requestStats = (stats.req = stats.req || {});
        const originStats = (requestStats[origin] = requestStats[origin] || {
            count: 0,
            bytes: 0,
        });
        ++originStats.count;
        
        extra.reqOriginMap = extra.reqOriginMap || {};
        extra.reqOriginMap[requestId] = origin;
    }
}, {
    matches: matchName('ResourceFinish'),
    process: (event, stats, extra) => {
        const {
            args: {
                data: {
                    encodedDataLength,
                    requestId,
                }
            }
        } = event;
        const origin = extra.reqOriginMap[requestId];
        if (origin) {
            stats.req[origin].bytes += encodedDataLength;
            delete extra.reqOriginMap[requestId];
        } else {
            console.warn(`STATS[req]: unable to lookup context origin for requestId=${requestId}?!`);
        }
    }
}];


const extractTraceStats = (buffer) => {
    const events = JSON.parse(buffer).traceEvents;
    
    // sort by timestamp
    events.sort((a, b) => a.ts - b.ts);

    // process the event slices to identify the records of interest and extract the essential state/stats
    const stats = Object.create(null);
    const extra = Object.create(null);
    for (const event of events) {
        event.cat = event.cat.split(','); // parse category tokens into an array for filtering/matching
        for (const { matches, process } of eventProcessorRules) {
            if (matches(event)) {
                process(event, stats, extra);
            }
        }
    }

    // 
    
    return stats;
}

const diffTraceStats = (coldStats, hotStats, delta) => {
    // default delta function: simple diff (cold - hot)
    delta = delta || ((cold, hot) => cold - hot);

    // recursive parallel-object walker (compute deltas only on parallel/matched elements)
    const objWalker = (cold, hot, ratio) => {
        for (const key in cold) {
            if (Object.prototype.hasOwnProperty.call(cold, key) && Object.prototype.hasOwnProperty.call(hot, key)) {
                const cval = cold[key];
                const hval = hot[key];
                if (typeof cval === typeof hval) {
                    if (typeof cval === 'number') {
                        /* found parallel stat entry; compute delta */
                        ratio[key] = delta(cval, hval);
                    } else if (typeof cval === 'object') {
                        /* recurse */
                        objWalker(cval, hval, ratio[key] = Object.create(null));
                    }
                }
            }
        }
        return ratio;
    }
    return objWalker(coldStats, hotStats, Object.create(null));
};

module.exports = {
    extractTraceStats,
    diffTraceStats,
};
