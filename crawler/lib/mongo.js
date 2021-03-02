'use strict';

const { MongoClient } = require("mongodb");

const MONGODB_URL = process.env.MONGODB_URL;

class MongoConnector {
    constructor(url) {
        this._url = url || MONGODB_URL;
        this._conn = null;
        this._visits = null;
    }

    async connect() {
        this._conn = await MongoClient.connect(self._url, {
            useUnifiedTopology: true,
            useNewUrlParser: true,
        })

        this._visits = this._conn.db().collection("visits");
    }

    async close() {
        await this._conn.close().catch(err => console.error(err));
    }

    async getVisitLogger(meta) {
        return await VisitLogger.new(this._visits, meta);
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

        const { id } = await col.insertOne(doc);
        return new VisitLogger(col, id);
    }

    async visitComplete(tag, stats) {
        await self._col.updateOne({_id: self._id}, {
            $set: {
                [`visits.${tag}`]: {
                    stats: stats,
                    when: new Date(),
                }
            }
        });
    }

    async visitFailed(tag, err) {
        await self._col.updateOne({_id: self._id}, {
            $set: {
                [`visits.${tag}`]: {
                    err: err,
                    when: new Date(),
                }
            }
        });
    }
}

module.exports = {
    MongoConnector,
    VisitLogger,
};