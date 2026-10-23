const fs = require('fs');
const path = require('path');
const { db } = require('../config/database');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

const run = (sql) =>
  new Promise((resolve, reject) => {
    db.exec(sql, (err) => (err ? reject(err) : resolve()));
  });

(async () => {
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const f of files) {
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8');
    try {
      await run(sql);
      console.log(`✓ ${f}`);
    } catch (e) {
      if (/duplicate column|already exists/i.test(e.message)) {
        console.log(`· ${f} (skipped: ${e.message})`);
      } else {
        console.error(`✗ ${f}: ${e.message}`);
        process.exit(1);
      }
    }
  }

  console.log('\n✓ Migrations complete.');
  process.exit(0);
})();
