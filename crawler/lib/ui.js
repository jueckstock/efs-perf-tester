'use strict';

const addCommonOptions = (program) => {
    return (program
        .option('-b, --binary <path>', 'launch Chromium binary found at <path>')
        .option('-e, --cache', 'Visit pages with caches on', false)
        .option('-c, --count <n>', 'perform <n> repetitions of the test', 1)
        .option('-n, --navTimeout <sec>', 'abort navigation after <sec>', 30)
        .option('-p, --proxy <url>', 'use <url> as an HTTP/SOCKS proxy server')
        .option('-t, --timeout <sec>', 'wait up to <sec> for page "load" event', 60)
        .option('-v, --verbose', 'turn on verbose stderr logging from Chromium', false)
        .option('-w, --wait <sec>', 'wait <sec> between test reps to avoid throttling', 1)
        .option('-x, --xvfb', 'Launch Xvfb automagically', false));
};

module.exports = {
    addCommonOptions,
}