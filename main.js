const fs = require('fs-extra');
const path = require('path');

const am = require('am');
const chromeLauncher = require('chrome-launcher');
const lighthouse = require('lighthouse');
const Xvfb = require('xvfb');
const { rm } = require('fs');


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


const runSingleTest = async (url, options) => {
    const clOpts = {
        chromeFlags: [],
        logLevel: 'error',
    };
    if (options.args) {
        clOpts.chromeFlags.push(...JSON.parse(options.args));
    }
    if (options.binary) {
        clOpts.chromePath = options.binary;
    }

    let profile = null;
    if (options.seed) {
        profile = await clonedSeedProfile(options.seed);
        clOpts.userDataDir = profile.path;
    }

    const chrome = await chromeLauncher.launch(clOpts);
    const lhOpts = {
        logLevel: 'info',
        output: options.format || 'html',
        onlyCategories: ['performance'],
        port: chrome.port
    };
    const runnerResult = await lighthouse(url, lhOpts);

    const waiters = [chrome.kill()];
    if (profile) {
        waiters.push(profile.cleanup());
    }
    await Promise.all(waiters);

    return runnerResult;
};

const runTestSet = async (url, options) => {
    let xvfb = null;
    if (options.xvfb) {
        xvfb = new AsyncXvfb();
        await xvfb.start();
    }
    try {
        for (let i = 0; i < options.count; ++i) {
            const runnerResult = await runSingleTest(url, options);

            // `.report` is the HTML report as a string
            const reportHtml = runnerResult.report;
            const reportFilename = path.join(options.directory, `lhreport.${i}.${options.format || 'html'}`);
            await fs.writeFile(reportFilename, reportHtml).catch(err => console.error(err));

            // `.lhr` is the Lighthouse Result as a JS object
            console.log(`Report for ${runnerResult.lhr.finalUrl} saved in ${reportFilename}`);
            console.log(`Performance score was ${runnerResult.lhr.categories.performance.score * 100}`);
        }
    } finally {
        await xvfb.stop();
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
        .action(runTestSet);
    await program.parseAsync();
});