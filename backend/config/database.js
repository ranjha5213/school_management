const sqlite3 = require('sqlite3').verbose();
const path    = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'school_management.db');

const db = new sqlite3.Database(DB_PATH, (err) => {
    if (err) {
        console.error('[db] open failed:', err.message);
        process.exit(1);
    }
    console.log('[db] connected:', DB_PATH);
});

// ── Serialize so PRAGMAs run BEFORE any user query ──
db.serialize(() => {
    // Force FK enforcement (per connection — required by SQLite)
    db.run('PRAGMA foreign_keys = ON', (err) => {
        if (err) {
            console.error('[db] FAILED to enable foreign keys:', err.message);
            process.exit(1);
        }
        // Read back to confirm
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
});

// ── Promise wrappers (same API as before) ──
const run = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) return reject(err);
            resolve({ lastID: this.lastID, changes: this.changes });
        });
    });

const get = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });

const all = (sql, params = []) =>
    new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });

const close = () =>
    new Promise((resolve, reject) => {
        db.close((err) => (err ? reject(err) : resolve()));
    });

// ── Optional runtime verifier ──
const verify = async () => {
    const r = await get('PRAGMA foreign_keys');
    return r.foreign_keys === 1;
};

module.exports = { db, run, get, all, close, verify };
