#!/usr/bin/env node
'use strict';

const am = require('am');
const express = require('express');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const crawling = require('./crawling');
const { runColdHotCycle } = require('./lib/experiments');
const { MongoConnector } = require('./lib/mongo');
const { addCommonOptions } = require('./lib/ui');

const VANILLA_PROFILE_SEED = process.env.VANILLA_PROFILE_SEED || '/work/data/vanilla';
const BLOCK3P_PROFILE_SEED = process.env.BLOCK3P_PROFILE_SEED || '/work/data/block3p';
const POLICY_MAP = {
    'vanilla': {
        seed: VANILLA_PROFILE_SEED,
        args: [],
    },
    'page-length': {
        seed: VANILLA_PROFILE_SEED,
        args: ['--ephemeral-frame-storage'],
    },
    'split-key': {
        seed: VANILLA_PROFILE_SEED,
        args: ['--ephemeral-frame-storage', '--efs-top-origin', '--efs-persist'],
    },
    'block3p': {
        seed: BLOCK3P_PROFILE_SEED,
        args: [],
    }
};


const runTestSet = async (url, policy, cliOptions) => {
    const asyncCleanups = [];
    try {
        if (cliOptions.xvfb) {
            const xvfb = new crawling.AsyncXvfb();
            await xvfb.start();
            asyncCleanups.push(() => xvfb.stop());
        }

        const mongoConn = new MongoConnector();
        asyncCleanups.push(() => mongoConn.close());
        const visitLogger = await mongoConn.getVisitLogger({
            url,
            policy,
            options: cliOptions,
        });

        cliOptions.directory = await fs.mkdtemp(path.join(os.tmpdir()), 'traces-');
        asyncCleanups.push(() => fs.rm(cliOptions.directory, { force: true, recursive: true}));

        let timeLeft = 0;
        for (let i = 0; i < cliOptions.count; ++i) {
            try {
                if (timeLeft > 0) {
                    await crawling.asyncSleep(timeLeft);
                }
                const cycleStats = await runColdHotCycle(url, i, cliOptions);
                const testEndedAt = Date.now();

                // stash our cycle stats in Mongo
                await visitLogger.visitComplete(i, cycleStats);

                // compute how much longer we should wait to keep our specified inter-test spacing
                timeLeft = (cliOptions.wait * 1000) - (Date.now() - testEndedAt);
            } catch (err) {
                await visitLogger.visitFailed(i, err.toString());
            }
        }
    } finally {
        await Promise.allSettled(asyncCleanups.map(thunk => thunk())).catch((err) => {
            console.error('Error cleaning up from test set:', err);
        })
    }
};

const serveKpw = async (cliOptions) => {
    const app = express();
    
    // Set up basic router to use JSON-body-parsing middleware and support health checks
    const routes = express.Router();
    routes.use(express.json());
    routes.get('/healthz', async (_, res) => {
        res.sendStatus(200);
    });

    // Handle request-to-perform-experiment (using KPW job dispatching)
    routes.post('/kpw/:endpoint', async (req, res) => {
        try {
            // Unpack arguments from JSON POST body
            const {
                url,
                policy,
            } = req.body;

            // Construct a one-shot set of "CLI" options to drive this test (prototype'd by the actual CLI options we got)
            const tmpOptions = Object.create(cliOptions);

            // Set the Chromium args and seed-profile
            const { seed, args } = POLICY_MAP[policy];
            tmpOptions.args = args;
            tmpOptions.seed = seed;

            // Run the test set!
            await runTestSet(url, policy, tmpOptions);

            // Return success to KPW
            res.status(200).send('OK').end();
        } catch (err) {
            console.error("fatal error consuming job:", err);
            res.status(500).send(`fatal error consuming job: ${err}`).end();
        }
    });

    app.use(routes).listen(PORT, () => {
        console.log(`Listening for KPW dispatches on port ${PORT}`);
    });
}

am(async () => {
    const  { program } = require('commander');
    addCommonOptions(program.arguments('<port>'))
        .action(serveKpw);
    await program.parseAsync();
});