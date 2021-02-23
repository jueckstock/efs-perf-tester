#!/usr/bin/env node

const am = require('am');
const fs = require('fs-extra');

const path = require('path');

class _FrameCommitLogger {
    constructor(event) {
        this.pid = event.args.data.processId;
        this.ts = new Date(event.ts);
        this.frameId = event.args.data.frame;
        this.parentFrameId = event.args.data.parent || null;
        this.url = event.args.data.url;
    }

    async _open(logPrefix) {
        //const urlBuff = Buffer.from(this.url, 'utf-8');
        //const urlBase64 = urlBuff.toString('base64').replace(/[\+\/]/, s => (s == '+') ? '-' : '_');
        const fileName = `${logPrefix}${this.ts.valueOf()}_${this.pid}_${this.frameId}.json`;
        this._fd = await fs.open(fileName, "w");
        return this;
    }

    async add(event) {
        if (!this._fd) throw new Error('log not opened');
        return fs.write(this._fd, JSON.stringify(event));
    }

    async close() {
        if (this._fd) {
            const fd = this._fd;
            this._fd = undefined;
            return fs.close(fd);
        }
    }
}

const NewFrameCommitLogger = async (event, logPrefix) => {
    const fcl = new _FrameCommitLogger(event);
    return fcl._open(logPrefix);
};

am(async (traceFile) => {
    const logPrefix = path.parse(traceFile).name + '-';

    console.log(`loading JSON trace file "${traceFile}"...`);
    const rawTrace = await fs.readJSON(traceFile);
    const events = rawTrace.traceEvents || rawTrace;

    console.log(`sorting ${events.length} event records by .ts (timestamp)...`);
    events.sort((a, b) => a.ts - b.ts);

    console.log(`processing ${events.length} event records...`);
    const pidCommitMap = new Map();
    for (const event of events) {
        if (event.name === "FrameCommittedInBrowser") {
            const frameCommit = await NewFrameCommitLogger(event, logPrefix);
            console.log(`  new: ${frameCommit.pid} :: ${frameCommit.frameId} :: ${frameCommit.url}`)
            if (pidCommitMap.has(frameCommit.pid)) {
                const oldFrameCommit = pidCommitMap.get(frameCommit.pid);
                console.log(`  closing: ${oldFrameCommit.pid} :: ${oldFrameCommit.frameId} :: ${oldFrameCommit.url}`);
                await oldFrameCommit.close().catch(err => console.error(err));
            }
            pidCommitMap.set(frameCommit.pid, frameCommit);
        } else if (pidCommitMap.has(event.pid)) {
            await pidCommitMap.get(event.pid).add(event);
        }
    }

    console.log(`flushing ${pidCommitMap.length} open loggers...`);
    await Promise.all(Array.from(pidCommitMap.values()).map(f => {
        console.log(`  closing: ${f.pid} :: ${f.frameId} :: ${f.url}`);
        return f.close();
    })).catch(err => console.error(err));
});