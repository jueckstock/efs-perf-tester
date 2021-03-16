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
        
        if (frame === extra.navEpochFrame) {
            stats.loading = stats.loading || {};
            stats.loading[name] = ts - extra.navEpochTs;
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
            // frame-id check should be redundant/automatic condition...
            if (frame === extra.navEpochFrame) {
                const sload = (stats.loading = stats.loading || {});
                const oldSize = extra.lcpSize || 0;
                if (size > oldSize) {
                    sload.largestContentfulPaint = ts - extra.navEpochTs;
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

        // ignore non-URLs (don't change anything for pid/SOP mappings, and are spurious [for our purposes] for main-frame navs)
        if  ((documentLoaderURL !== '') && (documentLoaderURL !== 'about:blank')) {
            // mark nav-start only for the main frame (and remember its frame ID)
            if (isLoadingMainFrame) {
                extra.navEpochTs = ts;
                extra.navEpochFrame = frame;
                console.log(`EVENTS: navigationStart(frame=${frame}, pid=${pid}, ts=${ts}, url=${documentLoaderURL})`);
            }

            // mark execution context for all non-null navigtations, by pid context
            const navUrl = new URL(documentLoaderURL);
            extra.pidOriginMap = extra.pidOriginMap || {};
            extra.pidOriginMap[pid] = navUrl.origin;
        }
    }
}, {
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
