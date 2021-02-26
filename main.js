const fs = require('fs-extra');
const path = require('path');

const am = require('am');
const puppeteer = require('puppeteer-core');
const Xvfb = require('xvfb');
const { URL } = require('url');

const { extractTraceStats, ratioTraceStats } = require('./lib/events');


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

const blankTempProfile = async () => {
    const tmpdir = await fs.mkdtemp("seed");
    const profile = {
        cleanup() {
            return fs.rm(tmpdir, {
                force: true,
                recursive: true,
            });
        }
    };
    Object.defineProperty(profile, 'path', {
        value: tmpdir,
        writable: false,
        configurable: false,
    });
    return profile;
};

const clonedSeedProfile = async (seedPath) => {
    const profile = await blankTempProfile();
    await fs.copy(seedPath, profile.path, {
        recursive: true,
    });
    return profile;
};

const asyncSleep = (ms) => {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
};

const launchWithRetry = async (puppeteerArgs, retries, computeTimeout) => {
    // default to 5 retries with a base-2 exponential-backoff delay between each retry (1s, 2s, 4s, ...)
    retries = retries || 5;
    computeTimeout = computeTimeout || (tryIndex => Math.pow(2, tryIndex - 1) * 1000)

    try {
        return await puppeteer.launch(puppeteerArgs);
    } catch (err) {
        console.warn(`Failed to launch browser, ${retries} left;`, err);
    }

    for (let i = 1; i <= retries; ++i) {
        await asyncSleep(computeTimeout(i));
        try {
            return await puppeteer.launch(puppeteerArgs)
        } catch (err) {
            console.warn(`Failed to launch browser, ${retries - i} left;`, err);
        }
    }

    throw new Error(`Unable to launch browser after ${retries} retries!`)
}

const pageMonitor = (page) => {
    let monitor;
    const statusHack = (status) => {
        monitor._status = status;
    }
    monitor = new Promise((resolve, reject) => {
        page.on('close', () => {
            statusHack('close');
            resolve();
        });
        page.on('error', (err) => {
            statusHack('close');
            reject(err);
        });
    });
    statusHack('open');
    Object.defineProperty(monitor, 'status', {
        enumerable: false,
        configurable: false,
        get() {
            return monitor._status;
        }
    })
    return monitor;
};

const openTabAndMeasure = async (browser, url, tabTag, cliOptions) => {
    console.log(`PAGE[${url}::${tabTag}] starting...`);
    const page = await browser.newPage();
    const pageCrashedOrClosed = pageMonitor(page);
    try {
        const traceFilename = path.join(cliOptions.directory, `trace.${tabTag}.json`);
        await page.tracing.start({
            path: traceFilename,
            screenshots: false,
            categories: [
                'devtools.timeline', // for all page-load/request metrics records
                'disabled-by-default-devtools.timeline', // for useful "FrameCommittedInBrowser" control record (and a ton of other junk...)
                'blink.user_timing', // for domInteractive
                'v8', 'disabled-by-default-v8.runtime_stats', // contains all the "v8 slices" used by chrome://tracing to build the comprehensive V8 profiling numbers
            ],
        });
        const loadedResponse = page.goto(url, {
            waitUntil: 'load',
            timeout: cliOptions.navTimeout * 1000,
        });
        const waitingForLoaded = asyncSleep(cliOptions.timeout * 1000);
        await Promise.race([
            pageCrashedOrClosed,
            loadedResponse,
            waitingForLoaded,
        ]);
        const traceBuffer = await page.tracing.stop();
        return extractTraceStats(traceBuffer);
    } finally {
        console.log(`PAGE[${url}::${tabTag}] ending (${pageCrashedOrClosed.status})`);
        if (pageCrashedOrClosed.status == 'open') {
            await page.close();
        }
    }
}

const runColdHotCycle = async (url, cycleTag, cliOptions) => {
    const profile = (cliOptions.seed) ? await clonedSeedProfile(cliOptions.seed) : await blankTempProfile();
    try {
        const puppeteerArgs = {
            defaultViewport: null,
            args: [
                '--disable-brave-update',
                '--user-data-dir=' + profile.path,
                //'--enable-blink-features=BlinkRuntimeCallStats',
            ],
            executablePath: cliOptions.binary,
            ignoreDefaultArgs: [
                '--disable-sync'
            ],
            dumpio: cliOptions.verbose,
            headless: false
        }
        
        if (cliOptions.verbose) {
            puppeteerArgs.args.push('--enable-logging=stderr')
            puppeteerArgs.args.push('--v=0')
        }
        
        if (cliOptions.proxy) {
            const proxy = new URL(cliOptions.proxy);
            puppeteerArgs.args.push(`--proxy-server=${proxy.toString()}`)
            if (proxy.protocol === 'socks5') {
                puppeteerArgs.args.push(`--host-resolver-rules=MAP * ~NOTFOUND , EXCLUDE ${proxy.hostname}`)
            }
        }
        
        if (cliOptions.args) {
            puppeteerArgs.args.push(...JSON.parse(cliOptions.args));
        }
        
        const browser = await launchWithRetry(puppeteerArgs);
        try {

            coldStats = await openTabAndMeasure(browser, url, `${cycleTag}.cold`, cliOptions);
            await asyncSleep(cliOptions.wait * 1000);
            hotStats = await openTabAndMeasure(browser, url, `${cycleTag}.hot`, cliOptions);
            return {
                cold: coldStats,
                hot: hotStats,
                ratio: ratioTraceStats(coldStats, hotStats),
            };
        } finally {
            await browser.close();
        }
    } finally {
        profile.cleanup();
    }
};

const runTestSet = async (url, cliOptions) => {
    let xvfb = null;
    if (cliOptions.xvfb) {
        xvfb = new AsyncXvfb();
        await xvfb.start();
    }
    try {
        let timeLeft = 0;
        for (let i = 0; i < cliOptions.count; ++i) {
            try {
                if (timeLeft > 0) {
                    console.log(`waiting ${timeLeft}ms before next test...`);
                    await asyncSleep(timeLeft);
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
    program
        .arguments('<url>')
        .option('-a, --args <json_array>', 'pass additional CLI args to Chromium', '[]')
        .option('-b, --binary <path>', 'launch Chromium binary found at <path> instead of system-default')
        .option('-c, --count <n>', 'perform <n> repetitions of the test', 1)
        .option('-d, --directory <path>', 'save Lighthouse reports to <path>', '.')
        .option('-f, --format <name>', 'generate Lighthouse tests in <name> format (html, json)', 'html')
        .option('-n, --navTimeout <sec>', 'abort navigation after <sec>', 30)
        .option('-p, --proxy <url>', 'use <url> as an HTTP/SOCKS proxy server')
        .option('-s, --seed <path>', 'use a temp profile cloned from a seed profile at <path>')
        .option('-t, --timeout <sec>', 'wait up to <sec> for page "load" event', 60)
        .option('-v, --verbose', 'turn on verbose stderr logging from Chromium')
        .option('-w, --wait <sec>', 'wait <sec> between test reps to avoid throttling', 1)
        .option('-x, --xvfb', 'Launch Xvfb automagically')
        .action(runTestSet);
    await program.parseAsync();
});