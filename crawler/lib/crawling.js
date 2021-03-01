'use strict';
const os = require('os');
const path = require('path');

const fs = require('fs-extra');
const puppeteer = require('puppeteer-core');
const Xvfb = require('xvfb');

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
    const tmpdir = await fs.mkdtemp(path.join(os.tmpdir(), "temp-profile-"));
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
            statusHack('error');
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

module.exports = {
    AsyncXvfb,
    asyncSleep,
    pageMonitor,
    launchWithRetry,
    blankTempProfile,
    clonedSeedProfile,
}