// config/database.js
const sqlite3 = require('sqlite3').verbose();
const path    = require('path');
const fs      = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'school_management.db');
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '..', 'backups');

if (!fs.existsSync(BACKUP_DIR)) fs.mkdirSync(BACKUP_DIR, { recursive: true });

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[db] open failed:', err.message);
        process.exit(1);
    }
    console.log('[db] connected:', DB_PATH);
});

db.serialize(() => {
    db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
            console.error('[db] FAILED to enable foreign keys:', err.message);
            process.exit(1);
        }
        db.get('PRAGMA foreign_keys', (e, row) => {
            if (e) return console.error('[db] verify FK failed:', e.message);
            if (row.foreign_keys !== 1) {
                console.error('[db] ⚠️ FK is', row.foreign_keys, '— expected 1!');
            } else {
                console.log('[db] PRAGMA foreign_keys = 1 ✅');
            }
        });
    });

    db.run('PRAGMA journal_mode = WAL', (err) => {
        if (err) console.error('[db] WAL failed:', err.message);
        else     console.log('[db] PRAGMA journal_mode = WAL ✅');
    });

    db.run('PRAGMA busy_timeout = 5000', (err) => {
        if (err) console.error('[db] busy_timeout failed:', err.message);
    });
});

function assertParams(sql, params, label = '') {
    const count = (sql.match(/\?/g) || []).length;
    if (count !== params.length) {
        const msg = `[SQL PARAM MISMATCH ${label}] placeholders=${count} params=${params.length}`;
        console.error(msg);
        console.error(sql);
        console.error(params);
        throw new Error(msg);
    }
}

const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
        try { assertParams(sql, params, 'run'); } catch (e) { return reject(e); }
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });

const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
        try { assertParams(sql, params, 'get'); } catch (e) { return reject(e); }
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
        try { assertParams(sql, params, 'all'); } catch (e) { return reject(e); }
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

const exec = (sql) =>
    new Promise((resolve, reject) => {
        db.exec(sql, (err) => (err ? reject(err) : resolve()));
    });

// ── Serialized transaction queue ──
let txQueue = Promise.resolve();
let isClosed = false;

const transaction = (fn) => {
    if (isClosed) {
        return Promise.reject(new Error('Database is closed'));
    }
    const runTx = txQueue.then(async () => {
        await exec('BEGIN IMMEDIATE');
        try {
            const result = await fn();
            await exec('COMMIT');
            return result;
        } catch (err) {
            try { await exec('ROLLBACK'); } catch (_) { /* ignore */ }
            throw err;
        }
    });
    txQueue = runTx.catch(() => {});
    return runTx;
};

// ── close: mark closed, drain queue, then shut down ──
const close = () => {
    if (isClosed) return txQueue;  // idempotent
    isClosed = true;               // gate future transaction() calls BEFORE chaining
    txQueue = txQueue.then(() =>
        new Promise((resolve, reject) => {
            db.close((err) => (err ? reject(err) : resolve()));
        })
    );
    return txQueue;
};

const verify = async () => {
    const r = await get('PRAGMA foreign_keys');
    return r.foreign_keys === 1;
};

module.exports = {
    db,
    run,
    get,
    all,
    exec,
    transaction,
    close,
    verify,
    DB_PATH,
    BACKUP_DIR,
};
