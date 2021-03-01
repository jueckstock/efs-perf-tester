'use strict';
const path = require('path');

const am = require('am');
const fs = require('fs-extra');

const events = require('./lib/events');

const TRACE_FILE_PATTERN = /^trace\.(\d+)\.(cold|hot)\.json$/;

am(async (...traceDirs) => {
    for (const traceDir of traceDirs) {
        const cycleSet = {};
        const passMap = { cold: {}, hot: {}};
        const baseNames = await fs.readdir(traceDir, { encoding: 'utf-8' });
        for (const baseName of baseNames) {
            const nameMatch = TRACE_FILE_PATTERN.exec(baseName);
            if (nameMatch) {
                const [_, cycle, pass] = nameMatch;
                cycleSet[cycle] = true;
                passMap[pass][cycle] = path.join(traceDir, baseName);
            }
        }

        for (const cycle in cycleSet) {
            const coldTraceFile = passMap.cold[cycle];
            const hotTraceFile = passMap.hot[cycle];
            if (coldTraceFile && hotTraceFile) {
                const coldBuffer = await fs.readFile(coldTraceFile);
                const hotBuffer = await fs.readFile(hotTraceFile);
                
                const coldStats = events.extractTraceStats(coldBuffer);
                const hotStats = events.extractTraceStats(hotBuffer);

                const statsFile = path.join(traceDir, `stats.${cycle}.json`);
                await fs.writeJSON(statsFile, {
                    cold: coldStats,
                    hot: hotStats,
                    ratio: events.ratioTraceStats(coldStats, hotStats),
                });
                console.log(statsFile);
            } else {
                console.warn(`missing cold/hot pass data for ${traceDir} (cycle=${cycle})!`);
            }
        }
    }
});