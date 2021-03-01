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
    process: (event, stats) => {
        const { name, ts } = event;
        stats.loading = stats.loading || {};
        stats.loading[name] = ts;
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
            },
            ts,
        } = event;
        if (isMainFrame) {
            const sload = (stats.loading = stats.loading || {});
            const oldSize = extra.lcpSize || 0;
            if (size > oldSize) {
                sload.largestContentfulPaint = ts;
                extra.lcpSize = size;
            }
        }
    }
}, {
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
            }
        } = event;
        const pidOriginMap = (extra.pidOriginMap = extra.pidOriginMap || {});
        pidOriginMap[pid] = {
            url: new URL(url),
            frame,
            parent,
        };
    }
}, {
    matches: matchCatAny('v8', 'disabled-by-default-v8.runtime_stats'),
    process: (event, stats, extra) => {
        if (('args' in event) && ('runtime-call-stats' in event.args)) {
            const pidOriginMap = (extra.pidOriginMap = extra.pidOriginMap || {});
            const executionContext = pidOriginMap[event.pid];
            if (!executionContext) {
                console.warn(`STATS[v8]: unable to lookup execution context origin for pid=${event.pid}?!`);
                return;
            }
            const executionOrigin = executionContext.url.origin;

            const v8Stats = (stats.v8 = stats.v8 || {});
            const v8OriginStats = (v8Stats[executionOrigin] = v8Stats[executionOrigin] || {
                //total: {
                    count: 0,
                    microseconds: 0,
                //},
                //slice: {},
            });
            const grandTotal = v8OriginStats; //.total;
            const rcs = event.args['runtime-call-stats'];
            for (const key in rcs) {
                if (rcs.hasOwnProperty(key)) {
                    const [ eventCount, eventMicroseconds ] = rcs[key];
                    /*const rcsSlice = v8OriginStats.slice[key] || (v8OriginStats.slice[key] = { count: 0, microseconds: 0});
                    rcsSlice.count += eventCount;
                    rcsSlice.microseconds += eventMicroseconds;*/
                    grandTotal.count += eventCount;
                    grandTotal.microseconds += eventMicroseconds;
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
    
    //console.log(`EXTRACT: sorting ${events.length} event records by .ts (timestamp)...`);
    events.sort((a, b) => a.ts - b.ts);

    //console.log(`EXTRACT: processing ${events.length} event records...`);
    const stats = Object.create(null);
    const extra = Object.create(null);
    for (const event of events) {
        event.cat = event.cat.split(',');
        for (const { matches, process } of eventProcessorRules) {
            if (matches(event)) {
                process(event, stats, extra);
            }
        }
    }
    
    return stats;
}

const ratioTraceStats = (coldStats, hotStats) => {
    const objWalker = (cold, hot, ratio) => {
        for (const key in cold) {
            if (Object.prototype.hasOwnProperty.call(cold, key) && Object.prototype.hasOwnProperty.call(hot, key)) {
                const cval = cold[key];
                const hval = hot[key];
                if (typeof cval === typeof hval) {
                    if (typeof cval === 'number') {
                        /* found parallel stat entry; compute hot/cold ratio */
                        ratio[key] = hval / cval;
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
    ratioTraceStats,
};
