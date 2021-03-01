'use strict';

const addCommonOptions = (program) => {
    return (program
        .option('-b, --binary <path>', 'launch Chromium binary found at <path> instead of system-default')
        .option('-c, --count <n>', 'perform <n> repetitions of the test', 1)
        .option('-n, --navTimeout <sec>', 'abort navigation after <sec>', 30)
        .option('-p, --proxy <url>', 'use <url> as an HTTP/SOCKS proxy server')
        .option('-t, --timeout <sec>', 'wait up to <sec> for page "load" event', 60)
        .option('-v, --verbose', 'turn on verbose stderr logging from Chromium')
        .option('-w, --wait <sec>', 'wait <sec> between test reps to avoid throttling', 1)
        .option('-x, --xvfb', 'Launch Xvfb automagically'));
};

module.exports = {
    addCommonOptions,
}