'use strict';

const { MongoClient } = require("mongodb");

const MONGODB_URL = process.env.MONGODB_URL;

class MongoConnector {
    constructor(conn) {
        this._conn = conn;
        this._visits = this._conn.db().collection("visits");
    }

    static async new(url) {
        url = url || MONGODB_URL;
        const conn = await MongoClient.connect(url, {
            useUnifiedTopology: true,
            useNewUrlParser: true,
        });
        return new MongoConnector(conn);
    }

    async close() {
        if (this._conn) {
            await this._conn.close().catch(err => console.error(err));
        }
    }

    async getVisitLogger(meta) {
        if (this._visits) {
            return await VisitLogger.new(this._visits, meta);
        } else {
            throw new Error('no connection?!');
        }
    }
}

class VisitLogger {
    constructor(col, id) {
        this._col = col;
        this._id = id;
    }

    static async new(col, meta) {
        const doc = Object.create(null);
        Object.assign(doc, meta);
	doc.counters = { complete: 0, failed: 0 };
        doc.visits = {};

        const { insertedId } = await col.insertOne(doc);
        return new VisitLogger(col, insertedId);
    }

    async visitComplete(tag, stats) {
        await this._col.updateOne({_id: this._id}, {
            $set: {
                [`visits.${tag}`]: {
                    stats: stats,
                    when: new Date(),
                }
            },
	    $inc: { 'counters.complete': 1 },
        });
    }

    async visitFailed(tag, err) {
        await this._col.updateOne({_id: this._id}, {
            $set: {
                [`visits.${tag}`]: {
                    err: err,
                    when: new Date(),
                }
            },
	    $inc: { 'counters.failed': 1 },
        });
    }
}

module.exports = {
    MongoConnector,
    VisitLogger,
};
