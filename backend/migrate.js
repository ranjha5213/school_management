#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

// ─── .env loader (no external deps) ───
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith("'") && val.endsWith("'")) ||
      (val.startsWith('"') && val.endsWith('"'))
    ) {
      val = val.slice(1, -1);
    }
    if (!(key in process.env)) {
      process.env[key] = val;
    }
  }
}

function getUnpackedDir(dirPath) {
  return dirPath.replace(
    `${path.sep}app.asar${path.sep}`,
    `${path.sep}app.asar.unpacked${path.sep}`
  );
}

function resolvePathOption(raw) {
  if (!raw) return null;
  return path.isAbsolute(raw) ? raw : path.resolve(process.cwd(), raw);
}

function resolveDbPath(overridePath) {
  const raw =
    overridePath ||
    process.env.DB_PATH ||
    path.resolve(__dirname, "school_management.db");
  const resolved = resolvePathOption(raw);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

function resolveBackupDir(overrideDir) {
  const raw =
    overrideDir ||
    process.env.BACKUP_DIR ||
    path.resolve(__dirname, "../backups");
  const resolved = resolvePathOption(raw);
  fs.mkdirSync(resolved, { recursive: true });
  return resolved;
}

function resolveMigrationsDir(overrideDir) {
  const unpackedDir = getUnpackedDir(__dirname);
  const candidates = [
    resolvePathOption(overrideDir),
    resolvePathOption(process.env.MIGRATIONS_DIR),
    path.join(unpackedDir, "migrations"),
    path.join(__dirname, "migrations"),
    path.resolve(process.cwd(), "migrations"),
  ].filter(Boolean);

  return candidates.find((dir) => fs.existsSync(dir)) || candidates[0];
}

function resolveSchemaFile(overrideFile) {
  const unpackedDir = getUnpackedDir(__dirname);
  const candidates = [
    resolvePathOption(overrideFile),
    resolvePathOption(process.env.SCHEMA_FILE),
    path.join(unpackedDir, "schema.sql"),
    path.join(__dirname, "schema.sql"),
    path.resolve(process.cwd(), "schema.sql"),
  ].filter(Boolean);

  return candidates.find((file) => fs.existsSync(file)) || null;
}

// ─── SQL helpers ───
function formatExecError(err, context = "sqlite3") {
  const stderr = err?.stderr ? String(err.stderr).trim() : "";
  const stdout = err?.stdout ? String(err.stdout).trim() : "";
  const base = err?.message ? String(err.message).trim() : String(err);
  const details = [stderr, stdout].filter(Boolean).join(" | ");
  return details ? `${context}: ${base} (${details})` : `${context}: ${base}`;
}

function runSql(dbPath, sql, { json = false } = {}) {
  const args = [];
  if (json) args.push("-json");
  args.push(dbPath, sql);
  try {
    const out = execFileSync("sqlite3", args, {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
    return json ? JSON.parse(out.trim() || "[]") : out.trim();
  } catch (err) {
    throw new Error(formatExecError(err, "SQLite query failed"));
  }
}

function sqlEscape(val) {
  return String(val).replace(/'/g, "''");
}

function ensureDatabaseReady(dbPath, schemaFile) {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });

  if (!fs.existsSync(dbPath) || fs.statSync(dbPath).size === 0) {
    if (schemaFile && fs.existsSync(schemaFile)) {
      console.log(`Initializing new school database from ${schemaFile}...`);
      const schemaSql = fs.readFileSync(schemaFile, "utf8");
      try {
        execFileSync("sqlite3", [dbPath], {
          input: schemaSql,
          stdio: ["pipe", "inherit", "inherit"],
        });
      } catch (err) {
        throw new Error(formatExecError(err, `Failed initializing schema from ${schemaFile}`));
      }
    } else {
      throw new Error(
        `Database not found at ${dbPath} and schema.sql is missing (${schemaFile || "none"}).`
      );
    }
  }
}

function createBackup(dbPath, backupDir) {
  if (!fs.existsSync(dbPath)) return null;
  fs.mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = `${process.pid}_${Math.random().toString(36).slice(2, 6)}`;
  const base = path.basename(dbPath, path.extname(dbPath));
  let backupFile = path.join(backupDir, `${base}_${stamp}.db`);
  if (fs.existsSync(backupFile)) {
    backupFile = path.join(backupDir, `${base}_${stamp}_${suffix}.db`);
  }
  runSql(dbPath, `.backup '${sqlEscape(backupFile)}'`);
  if (!fs.existsSync(backupFile) || fs.statSync(backupFile).size === 0) {
    throw new Error(`Backup verification failed (empty file): ${backupFile}`);
  }
  console.log(`Backup created: ${backupFile}`);
  return backupFile;
}

function initMigrationsTable(dbPath) {
  runSql(
    dbPath,
    `
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id          INTEGER  PRIMARY KEY AUTOINCREMENT,
      name        TEXT     NOT NULL UNIQUE,
      status      TEXT     NOT NULL DEFAULT 'applied',
      applied_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `
  );

  // Backfill status column for older installs
  try {
    const cols = runSql(dbPath, `PRAGMA table_info("schema_migrations");`, { json: true });
    if (!cols.some((c) => c.name === "status")) {
      runSql(
        dbPath,
        `ALTER TABLE schema_migrations ADD COLUMN status TEXT NOT NULL DEFAULT 'applied';`
      );
    }
  } catch (_) {
    // Older SQLite: status column wasn't added; treat everything as applied.
  }
}

function hasColumn(dbPath, tableName, columnName) {
  const safeTable = String(tableName).replace(/"/g, '""');
  const rows = runSql(dbPath, `PRAGMA table_info("${safeTable}");`, { json: true });
  return rows.some((col) => col.name === columnName);
}

function addColumnIfMissing(dbPath, tableName, columnName, columnDefSql) {
  if (!hasColumn(dbPath, tableName, columnName)) {
    console.log(`  + Adding column ${tableName}.${columnName}`);
    runSql(
      dbPath,
      `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefSql};`
    );
  }
}

function getAppliedMigrations(dbPath) {
  const rows = runSql(
    dbPath,
    `SELECT name FROM schema_migrations WHERE status = 'applied' ORDER BY id ASC;`,
    { json: true }
  );
  return new Set(rows.map((r) => r.name));
}

function recordMigration(dbPath, name, status = "applied") {
  runSql(
    dbPath,
    `INSERT INTO schema_migrations (name, status, applied_at)
       VALUES ('${sqlEscape(name)}', '${sqlEscape(status)}', CURRENT_TIMESTAMP)
     ON CONFLICT(name) DO UPDATE SET status = excluded.status,
                                     applied_at = CURRENT_TIMESTAMP;`
  );
}

function buildBuiltinMigrations(dbPath) {
  return [
    {
      name: "001_sync_people_and_library_columns",
      up() {
        addColumnIfMissing(dbPath, "students", "status", "VARCHAR(20) NOT NULL DEFAULT 'active'");
        addColumnIfMissing(dbPath, "students", "is_active", "INTEGER NOT NULL DEFAULT 1");
        addColumnIfMissing(dbPath, "students", "name_en", "VARCHAR(100)");
        addColumnIfMissing(dbPath, "students", "guardian_name_en", "VARCHAR(100)");
        addColumnIfMissing(dbPath, "teachers", "permissions", "TEXT DEFAULT '{}'");
        addColumnIfMissing(dbPath, "book_issues", "fine_amount", "REAL DEFAULT 0");
        addColumnIfMissing(dbPath, "sms_log", "sent_on", "DATE");
        addColumnIfMissing(dbPath, "sms_log", "updated_at", "DATETIME");
        addColumnIfMissing(dbPath, "attendance", "period_number", "INTEGER DEFAULT NULL");
        addColumnIfMissing(dbPath, "attendance", "session", "TEXT DEFAULT 'full_day'");
      },
    },
    {
      name: "002_ensure_documents_and_ledger_tables",
      up() {
        runSql(
          dbPath,
          `
          CREATE TABLE IF NOT EXISTS documents (
            id          INTEGER      PRIMARY KEY AUTOINCREMENT,
            title       VARCHAR(200) NOT NULL,
            file_name   VARCHAR(255) NOT NULL,
            file_path   TEXT         NOT NULL,
            file_size   INTEGER      NOT NULL DEFAULT 0,
            uploaded_by INTEGER,
            created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at  DATETIME,
            FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
          );

          CREATE TABLE IF NOT EXISTS financial_ledger (
            id             INTEGER PRIMARY KEY AUTOINCREMENT,
            entry_date     TEXT    NOT NULL DEFAULT (DATE('now')),
            source         TEXT    NOT NULL DEFAULT 'donation',
            description    TEXT,
            donor_name     TEXT,
            donor_phone    TEXT,
            donor_email    TEXT,
            receipt_number TEXT    UNIQUE,
            income         REAL    NOT NULL DEFAULT 0,
            expenses       REAL    NOT NULL DEFAULT 0,
            balance        REAL    NOT NULL DEFAULT 0,
            created_at     TEXT    NOT NULL DEFAULT (DATETIME('now'))
          );
        `
        );
      },
    },
    {
      name: "003_ensure_indexes_and_triggers",
      up() {
        runSql(
          dbPath,
          `
          CREATE INDEX IF NOT EXISTS idx_students_status ON students(status);
          CREATE INDEX IF NOT EXISTS idx_students_active ON students(is_active);
          CREATE INDEX IF NOT EXISTS idx_sms_date ON sms_log(sent_on);
          CREATE INDEX IF NOT EXISTS idx_refresh_tokens_hash ON refresh_tokens(token_hash);
          CREATE INDEX IF NOT EXISTS idx_attendance_unique ON attendance(student_id, date, session, period_number);

          CREATE UNIQUE INDEX IF NOT EXISTS uq_sms_kind_student_ref_day
            ON sms_log(kind, student_id, COALESCE(ref_id, 0), sent_on)
            WHERE status IN ('queued','sent') AND student_id IS NOT NULL;

          CREATE TRIGGER IF NOT EXISTS trg_sms_log_updated_at
          AFTER UPDATE ON sms_log
          FOR EACH ROW
          WHEN NEW.updated_at IS OLD.updated_at OR NEW.updated_at IS NULL
          BEGIN
            UPDATE sms_log SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
          END;
        `
        );
      },
    },
  ];
}

function getFileMigrations(migrationsDir) {
  if (!migrationsDir || !fs.existsSync(migrationsDir)) return [];
  return fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: `sql:${file}`,
      filePath: path.join(migrationsDir, file),
    }));
}

// ─── Transaction executor ───
function executeInTransaction(dbPath, fnOrSql) {
  if (typeof fnOrSql === "function") {
    fnOrSql();
    return;
  }

  const sql = String(fnOrSql);
  const hasOwnBegin = /(^|\n)\s*BEGIN\b[^;]*;/i.test(sql);

  const wrapped = hasOwnBegin ? sql : `BEGIN IMMEDIATE;\n${sql}\nCOMMIT;`;

  try {
    execFileSync("sqlite3", [dbPath], {
      input: wrapped,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024,
    });
  } catch (err) {
    throw new Error(formatExecError(err, "SQL migration execution failed"));
  }
}

function listBackups(backupDir) {
  if (!fs.existsSync(backupDir)) return [];
  return fs
    .readdirSync(backupDir)
    .filter((f) => f.endsWith(".db"))
    .sort()
    .reverse();
}

function parseCliArgs(argv) {
  const parsed = {
    help: false,
    statusOnly: false,
    noBackup: false,
    listBackups: false,
    dbPath: null,
    backupDir: null,
    migrationsDir: null,
    schemaFile: null,
  };

  const valueFlags = new Map([
    ["--db", "dbPath"],
    ["--db-path", "dbPath"],
    ["--backup-dir", "backupDir"],
    ["--migrations-dir", "migrationsDir"],
    ["--schema", "schemaFile"],
    ["--schema-file", "schemaFile"],
  ]);

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      parsed.help = true;
    } else if (arg === "--status") {
      parsed.statusOnly = true;
    } else if (arg === "--no-backup") {
      parsed.noBackup = true;
    } else if (arg === "--list-backups") {
      parsed.listBackups = true;
    } else if (arg.includes("=")) {
      const eqIdx = arg.indexOf("=");
      const flag = arg.slice(0, eqIdx);
      const val = arg.slice(eqIdx + 1);
      const targetKey = valueFlags.get(flag);
      if (targetKey) {
        if (!val) throw new Error(`Missing value for flag ${flag}`);
        parsed[targetKey] = val;
      } else {
        throw new Error(`Unknown option: ${flag}`);
      }
    } else if (valueFlags.has(arg)) {
      const targetKey = valueFlags.get(arg);
      const nextVal = argv[i + 1];
      if (!nextVal || nextVal.startsWith("-")) {
        throw new Error(`Missing value for flag ${arg}`);
      }
      parsed[targetKey] = nextVal;
      i += 1;
    } else {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function runMigrations(options = {}) {
  const dbPath = resolveDbPath(options.dbPath);
  const backupDir = resolveBackupDir(options.backupDir);
  const migrationsDir = resolveMigrationsDir(options.migrationsDir);
  const schemaFile = resolveSchemaFile(options.schemaFile);
  const noBackup = Boolean(options.noBackup);
  const statusOnly = Boolean(options.statusOnly);
  const onProgress = typeof options.onProgress === "function" ? options.onProgress : null;
  const report = (msg) => (onProgress ? onProgress(msg) : console.log(msg));

  report(`Target DB: ${dbPath}`);
  report(`Backup Dir: ${backupDir}`);
  ensureDatabaseReady(dbPath, schemaFile);
  initMigrationsTable(dbPath);

  const applied = getAppliedMigrations(dbPath);
  const builtin = buildBuiltinMigrations(dbPath);
  const fileMigrations = getFileMigrations(migrationsDir);
  const allMigrations = [
    ...builtin.map((m) => ({ type: "fn", ...m })),
    ...fileMigrations.map((m) => ({ type: "sql", ...m })),
  ];

  if (statusOnly) {
    const allRows = runSql(
      dbPath,
      `SELECT name, status FROM schema_migrations ORDER BY id ASC;`,
      { json: true }
    );
    const statusByName = new Map(allRows.map((r) => [r.name, r.status]));

    report("\nMigration Status:");
    for (const m of allMigrations) {
      const st =
        statusByName.get(m.name) ||
        (applied.has(m.name) ? "applied" : "pending");
      const label =
        st === "applied" ? "APPLIED" : st === "failed" ? "FAILED " : "PENDING";
      report(`  [${label}] ${m.name}`);
    }
    return { dbPath, pending: [] };
  }

  const pending = allMigrations.filter((m) => !applied.has(m.name));
  if (pending.length === 0) {
    report("No pending migrations. Database is up to date.");
    return { dbPath, pending: [] };
  }

  const integrityBefore = runSql(dbPath, "PRAGMA integrity_check;");

  if (!noBackup) {
    createBackup(dbPath, backupDir);
  }

  for (const m of pending) {
    report(`Applying ${m.name}...`);
    try {
      if (m.type === "fn") {
        executeInTransaction(dbPath, m.up);
      } else {
        const sqlContent = fs.readFileSync(m.filePath, "utf8");
        executeInTransaction(dbPath, sqlContent);
      }
      recordMigration(dbPath, m.name, "applied");
      report(`  ✓ Applied ${m.name}`);
    } catch (err) {
      try {
        recordMigration(dbPath, m.name, "failed");
      } catch (recErr) {
        report(`  ! Could not record failed status for ${m.name}: ${recErr.message}`);
      }
      report(`  ✗ FAILED ${m.name}: ${err.message}`);
      const wrappedErr = new Error(
        `Migration "${m.name}" failed on ${dbPath}: ${err.message}`
      );
      wrappedErr.migrationName = m.name;
      wrappedErr.dbPath = dbPath;
      wrappedErr.cause = err;
      throw wrappedErr;
    }
  }

  const integrityAfter = runSql(dbPath, "PRAGMA integrity_check;");
  report(`Integrity check (before): ${integrityBefore}`);
  report(`Integrity check (after):  ${integrityAfter}`);
  if (integrityAfter !== "ok") {
    throw new Error(
      `Integrity check failed after migrations on ${dbPath}: ${integrityAfter}. ` +
        `Restore from the most recent backup in ${backupDir}.`
    );
  }
  report("All migrations completed successfully.");
  return { dbPath, pending };
}

if (require.main === module) {
  try {
    const cli = parseCliArgs(process.argv.slice(2));
    if (cli.help) {
      console.log(
        [
          "Usage: node migrate.js [flags]",
          "",
          "  --db <path>            Target SQLite database file",
          "  --backup-dir <dir>     Directory for pre-migration backups",
          "  --migrations-dir <dir> Directory containing .sql migration files",
          "  --schema <file>        Path to schema.sql for initializing new DBs",
          "  --status               List all migrations and their status",
          "  --no-backup            Skip pre-migration backup",
          "  --list-backups         Show files in the backup dir, newest first",
          "  --help, -h             Show this help message",
          "",
          "Env vars:",
          "  DB_PATH, BACKUP_DIR, MIGRATIONS_DIR, SCHEMA_FILE",
        ].join("\n")
      );
      process.exit(0);
    }
    if (cli.listBackups) {
      const backupDir = resolveBackupDir(cli.backupDir);
      const files = listBackups(backupDir);
      if (files.length === 0) {
        console.log(`No backups in ${backupDir}`);
      } else {
        console.log(`Backups in ${backupDir} (newest first):`);
        for (const f of files) console.log(`  ${f}`);
      }
      process.exit(0);
    }

    runMigrations({
      dbPath: cli.dbPath,
      backupDir: cli.backupDir,
      migrationsDir: cli.migrationsDir,
      schemaFile: cli.schemaFile,
      noBackup: cli.noBackup,
      statusOnly: cli.statusOnly,
    });
  } catch (err) {
    console.error("Migration failed:", err.message);
    process.exit(1);
  }
}

module.exports = {
  runMigrations,
  parseCliArgs,
  resolveDbPath,
  resolveBackupDir,
  resolveMigrationsDir,
  resolveSchemaFile,
};

