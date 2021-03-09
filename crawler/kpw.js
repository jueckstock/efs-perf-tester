#!/usr/bin/env node
'use strict';

const am = require('am');
const express = require('express');
const fs = require('fs-extra');
const os = require('os');
const path = require('path');

const crawling = require('./lib/crawling');
const { runColdHotCycle } = require('./lib/experiments');
const { MongoConnector } = require('./lib/mongo');
const { addCommonOptions } = require('./lib/ui');

const BROWSER_BINARY_PATH = process.env.BROWSER_BINARY_PATH;
const VANILLA_PROFILE_SEED = process.env.VANILLA_PROFILE_SEED;
const BLOCK3P_PROFILE_SEED = process.env.BLOCK3P_PROFILE_SEED;
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
        // invert the selection logic viz. the CLI tool for Xvfb (default: false -> USE Xvfb; true -> NO Xvfb)
        if (!cliOptions.xvfb) {
            const xvfb = new crawling.AsyncXvfb();
            await xvfb.start();
            asyncCleanups.push(() => xvfb.stop());
        }

        // use the environment configuration for the browser executable if it's not specified in the launch CLI args
        cliOptions.binary = cliOptions.binary || BROWSER_BINARY_PATH;

        // establish DB connection and record this experiment's beginning
        const mongoConn = await MongoConnector.new(cliOptions.mongoUrl);
        asyncCleanups.push(() => mongoConn.close());
        const visitLogger = await mongoConn.getVisitLogger({
            url,
            policy,
            options: cliOptions,
        });

        // save raw traces to a temp directory (cleaned out at end of run; all we save here are the baked stats)
        cliOptions.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'traces-'));
        asyncCleanups.push(() => fs.rm(cliOptions.directory, { force: true, recursive: true}));

        let timeLeft = 0;
        let testEndedAt;
        for (let i = 0; i < cliOptions.count; ++i) {
            // honor inter-test waiting period
            if (timeLeft > 0) { await crawling.asyncSleep(timeLeft); }
            try {
                const cycleStats = await runColdHotCycle(url, i, cliOptions);
                testEndedAt = Date.now();

                // stash our baked cycle stats in Mongo
                console.error(`DONE: visit(url=${url}, policy=${policy}, cycle=${i})`);
                await visitLogger.visitComplete(`t${i}`, cycleStats);
            } catch (err) {
                console.error(`ERROR: visit(url=${url}, policy=${policy}, cycle=${i})`, err);
                await visitLogger.visitFailed(`t${i}`, err.toString());
            }
            // compute how much longer we should wait to keep our specified inter-test spacing
            timeLeft = (cliOptions.wait * 1000) - (Date.now() - testEndedAt);
        }
    } finally {
        await Promise.allSettled(asyncCleanups.map(thunk => thunk())).catch((err) => {
            console.error('Error cleaning up from test set:', err);
        })
    }
};

const serveKpw = async (port, cliOptions) => {
    const app = express();
    
    // Set up basic router to use JSON-body-parsing middleware and support health checks
    const routes = express.Router();
    routes.use(express.json());
    routes.get('/healthz', async (_, res) => {
        res.sendStatus(200);
    });

    // Handle request-to-perform-experiment (using KPW job dispatching)
    routes.post('/kpw/efs-perf-test', async (req, res) => {
        try {
            // Unpack arguments from JSON POST body
            const {
                url,
                policy,
                cache,
            } = req.body;

            // Construct a one-shot set of "CLI" options to drive this test (prototype'd by the actual CLI options we got)
            const tmpOptions = Object.create(cliOptions);

            // If a 'cache' job argument was provided, use it (must be boolean)
            if (typeof cache === "boolean") {
                tmpOptions.cache = cache;
            }

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

    app.use(routes).listen(port, () => {
        console.log(`Listening for KPW dispatches on port ${port}`);
    });
}

am(async () => {
    const  { program } = require('commander');
    addCommonOptions(program.arguments('<port>'))
        .option('-m, --mongoUrl <url>', 'connect to <url> for Mongo access instead of ENV/default')
        .action(serveKpw);
    await program.parseAsync();
});