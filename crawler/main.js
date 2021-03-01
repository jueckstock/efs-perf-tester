#!/usr/bin/env node
'use strict';
const path = require('path');

const am = require('am');
const fs = require('fs-extra');

const crawling = require('./crawling');
const { runColdHotCycle } = require('./lib/experiments');


const runTestSet = async (url, cliOptions) => {
    let xvfb = null;
    if (cliOptions.xvfb) {
        xvfb = new crawling.AsyncXvfb();
        await xvfb.start();
    }
    try {
        let timeLeft = 0;
        for (let i = 0; i < cliOptions.count; ++i) {
            try {
                if (timeLeft > 0) {
                    console.log(`waiting ${timeLeft}ms before next test...`);
                    await crawling.asyncSleep(timeLeft);
                }
                const cycleStats = await runColdHotCycle(url, i, cliOptions);
                const testEndedAt = Date.now();

                // stash our cycle stats
                const statsFilename = path.join(cliOptions.directory, `stats.${i}.json`);
                await fs.writeFile(statsFilename, JSON.stringify(cycleStats));

                // compute how much longer we should wait to keep our specified inter-test spacing
                timeLeft = (cliOptions.wait * 1000) - (Date.now() - testEndedAt);
            } catch (testErr) {
                console.error(`Fatal error running test ${i + 1}/${cliOptions.count}:`, testErr);
            }
        }

    } finally {
        if (xvfb) {
            await xvfb.stop();
        }
    }
};

am(async () => {
    const  { program } = require('commander');
    addCommonOptions(program.arguments('<url>'))
        .option('-a, --args <json_array>', 'pass additional CLI args to Chromium', '[]')
        .option('-d, --directory <path>', 'save reports to <path>', '.')
        .option('-s, --seed <path>', 'use a temp profile cloned from a seed profile at <path>')
        .action(runTestSet);
    await program.parseAsync();
});