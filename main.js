const fs = require('fs-extra');
const path = require('path');

const am = require('am');
const chromeLauncher = require('chrome-launcher');
const lighthouse = require('lighthouse');
const Xvfb = require('xvfb');
const { rm } = require('fs');
const { BADFLAGS } = require('dns');


class AsyncXvfb {
    constructor(...args) {
        this._xvfb = new Xvfb(...args);
        this._started = false;
    }

    async start() {
        if (this._started) {
            throw new Error('already started');
        }

        return new Promise((resolve, reject) => {
            this._started = true;
            this._xvfb.start((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }

    async stop() {
        if (!this._started) {
            throw new Error('not started');
        }

        return new Promise((resolve, reject) => {
            this._xvfb.stop((err) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });
    }
}

const clonedSeedProfile = async (path) => {
    const tmpdir = await fs.mkdtemp("seed");
    await fs.copy(path, tmpdir, {
        recursive: true,
    })
    const obj = {
        cleanup() {
            return fs.rm(tmpdir, {
                force: true,
                recursive: true,
            });
        }
    };
    Object.defineProperty(obj, 'path', {
        value: tmpdir,
        writable: false,
        configurable: false,
    });
    return obj
};


const runSingleTest = async (url, profileOption, cliOptions) => {
    const blockedDefaultFlags = [
        '--single-process',
        '--disable-features=site-per-process',
    ];
    const clOpts = {
        chromeFlags: chromeLauncher.Launcher.defaultFlags().filter(a => !blockedDefaultFlags.includes(a)),
        userDataDir: profileOption,
        logLevel: 'info',
        ignoreDefaultFlags: true,
    };
    if (cliOptions.args) {
        clOpts.chromeFlags.push(...JSON.parse(cliOptions.args));
    }
    if (cliOptions.binary) {
        clOpts.chromePath = cliOptions.binary;
    }

    const chrome = await chromeLauncher.launch(clOpts);
    const lhOpts = {
        logLevel: 'info',
        output: cliOptions.format || 'html',
        onlyCategories: ['performance'],
        port: chrome.port
    };
    const runnerResult = await lighthouse(url, lhOpts);
    await chrome.kill().catch(err => console.error(err));
    return runnerResult;
};


const lookupJPath = (obj, jpath) => {
    const segs = jpath.split('.');
    for (const seg of segs) {
        if (!(seg in obj)) {
            throw new Error(`failed to lookup "${jpath}": missing "${seg}"`);
        }
        obj = obj[seg];
    }
    return obj;
};


// Extract desired elements from a full Lighthouse report JS object
const cookLighthouseReport = (lhr) => {
    const globalStatRules = [
        ['fcp', 'audits.first-contentful-paint.numericValue'],
        ['lcp', 'audits.largest-contentful-paint.numericValue'],
        ['tbt', 'audits.total-blocking-time.numericValue'],
        ['fcidle', 'audits.first-cpu-idle.numericValue'],
        ['crcmax', 'audits.critical-request-chains.details.longestChain.duration'],
        ['mwsum', 'audits.mainthread-work-breakdown.numericValue'],
    ];

    const globalStats = {};
    for (const [tag, jpath] of globalStatRules) {
        globalStats[tag] = lookupJPath(lhr, jpath);
    }

    const mainthreadWorkGroups = ['scriptEvaluation', 'other', 'scriptParseCompile', 'garbageCollection'];
    const mainthreadWorkItems = lookupJPath(lhr, 'audits.mainthread-work-breakdown.details.items');
    const mainthreadWorkStats = {};
    for (const {group, duration} of mainthreadWorkItems) {
        if (mainthreadWorkGroups.includes(group)) {
            mainthreadWorkStats[group] = duration;
        }
    }

    const bootupItems = lookupJPath(lhr, 'audits.bootup-time.items');
    return {
        global: globalStats,
        mainthreadWork: mainthreadWorkStats,
        bootup: bootupItems,
    };
};

const asyncSleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

const runTestSet = async (url, cliOptions) => {
    const raii = [];
    try {
        let profileOption = true; // default: use a temp/blank profile
        if (cliOptions.seed) {
            const profile = await clonedSeedProfile(cliOptions.seed);
            profileOption = profile.path;
            raii.push(() => profile.cleanup());
        }

        let xvfb = null;
        if (cliOptions.xvfb) {
            xvfb = new AsyncXvfb();
            await xvfb.start();
            raii.push(() => xvfb.stop());
        }

        const aggStats = [];
        let timeLeft = 0;
        for (let i = 0; i < cliOptions.count; ++i) {
            try {
                if (timeLeft > 0) {
                    console.log(`waiting ${timeLeft}ms before next test...`);
                    await asyncSleep(timeLeft);
                }
                const runnerResult = await runSingleTest(url, profileOption, cliOptions);
                const testEndedAt = Date.now();

                // `.lhr` is the Lighthouse Result as a JS object
                const resultStats = cookLighthouseReport(runnerResult.lhr);
                resultStats.url = url;
                resultStats.visit = i + 1;
                aggStats.push(resultStats);

                // `.report` is the HTML/JSON report as a string
                const reportHtml = runnerResult.report;
                const reportFilename = path.join(cliOptions.directory, `lhreport.${i}.${cliOptions.format || 'html'}`);
                await fs.writeFile(reportFilename, reportHtml).catch(err => console.error(err));

                // compute how much longer we should wait to keep our specified inter-test spacing
                timeLeft = (cliOptions.wait * 1000) - (Date.now() - testEndedAt);
            } catch (testErr) {
                console.error(`Fatal error running test ${i + 1}/${cliOptions.count}:`, testErr);
            }
        }

        const aggStatFilename = path.join(cliOptions.directory, 'aggstats.json');
        await fs.writeFile(aggStatFilename, JSON.stringify(aggStats, undefined, 4));
    } finally {
        await Promise.allSettled(raii.map(x => x()));
    }
};

am(async () => {
    const  { program } = require('commander');
    program
        .arguments('<url>')
        .option('-a, --args <json_array>', 'pass additional CLI args to Chromium', '[]')
        .option('-b, --binary <path>', 'launch Chromium binary found at <path> instead of system-default')
        .option('-d, --directory <path>', 'save Lighthouse reports to <path>', '.')
        .option('-c, --count <n>', 'perform <n> repetitions of the test', 1)
        .option('-f, --format <name>', 'generate Lighthouse tests in <name> format (html, json)', 'html')
        .option('-s, --seed <path>', 'use a temp profile cloned from a seed profile at <path>')
        .option('-x, --xvfb', 'Launch Xvfb automagically')
        .option('-w, --wait <sec>', 'wait <sec> between test reps to avoid throttling', 1)
        .action(runTestSet);
    await program.parseAsync();
});