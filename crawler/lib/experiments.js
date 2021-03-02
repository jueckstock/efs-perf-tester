'use strict';
const path = require('path');
const { URL } = require('url');

const crawling = require('./crawling');
const events = require('./events');

const openTabAndMeasure = async (browser, url, tabTag, cliOptions) => {
    console.log(`PAGE[${url}::${tabTag}] starting...`);
    const page = await browser.newPage();
    const pageCrashedOrClosed = crawling.pageMonitor(page);
    try {
        await page.setCacheEnabled(false);
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
        const waitingForLoaded = crawling.asyncSleep(cliOptions.timeout * 1000);
        await Promise.race([
            pageCrashedOrClosed,
            loadedResponse,
            waitingForLoaded,
        ]);
        const traceBuffer = await page.tracing.stop();
        return events.extractTraceStats(traceBuffer);
    } finally {
        console.log(`PAGE[${url}::${tabTag}] ending (${pageCrashedOrClosed.status})`);
        if (pageCrashedOrClosed.status == 'open') {
            await page.close();
        }
    }
}

const runColdHotCycle = async (url, cycleTag, cliOptions) => {
    const profile = (cliOptions.seed) ? await crawling.clonedSeedProfile(cliOptions.seed) : await crawling.blankTempProfile();
    try {
        const puppeteerArgs = {
            defaultViewport: null,
            args: [
                '--disable-brave-update',
                '--user-data-dir=' + profile.path,
                //'--enable-blink-features=BlinkRuntimeCallStats',
            ],
            executablePath: cliOptions.binary,
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
            const theArgs = (typeof cliOptions.args === 'string') ? JSON.parse(cliOptions.args) : cliOptions.args;
            puppeteerArgs.args.push(...theArgs);
        }
        
        const browser = await crawling.launchWithRetry(puppeteerArgs);
        try {

            const coldStats = await openTabAndMeasure(browser, url, `${cycleTag}.cold`, cliOptions);
            await crawling.asyncSleep(cliOptions.wait * 1000);
            const hotStats = await openTabAndMeasure(browser, url, `${cycleTag}.hot`, cliOptions);
            return {
                cold: coldStats,
                hot: hotStats,
                diff: events.diffTraceStats(coldStats, hotStats),
            };
        } finally {
            await browser.close();
        }
    } finally {
        profile.cleanup();
    }
};

module.exports = {
    runColdHotCycle,
};