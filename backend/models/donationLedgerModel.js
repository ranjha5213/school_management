// models/donationLedgerModel.js
const { db, run, get, all } = require('../config/database');

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS financial_ledger (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entry_date TEXT NOT NULL DEFAULT (DATE('now')),
  source TEXT NOT NULL DEFAULT 'donation',
  description TEXT,
  donor_name TEXT,
  donor_phone TEXT,
  donor_email TEXT,
  receipt_number TEXT UNIQUE,
  income REAL NOT NULL DEFAULT 0,
  expenses REAL NOT NULL DEFAULT 0,
  balance REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (DATETIME('now'))
);
`;

const ensureTable = () => run(CREATE_TABLE_SQL);

const getLatestBalance = async () => {
  const row = await get('SELECT balance FROM financial_ledger ORDER BY id DESC LIMIT 1');
  return Number(row?.balance || 0);
};

const getEntryById = (id) =>
  get('SELECT * FROM financial_ledger WHERE id = ?', [Number(id)]);

const listLedgerEntries = ({ source, fromDate, toDate } = {}) => {
  const clauses = [];
  const params = [];

  if (source) {
    clauses.push('LOWER(source) = LOWER(?)');
    params.push(String(source).trim());
  }
  if (fromDate) {
    clauses.push('entry_date >= ?');
    params.push(String(fromDate).trim());
  }
  if (toDate) {
    clauses.push('entry_date <= ?');
    params.push(String(toDate).trim());
  }

  const whereSql = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  return all(
    `SELECT id, entry_date, source, description, donor_name, donor_phone, donor_email,
            receipt_number, income, expenses, balance, created_at
     FROM financial_ledger
     ${whereSql}
     ORDER BY entry_date DESC, id DESC`,
    params
  );
};

const getSummary = async () => {
  const [currentBalance, agg] = await Promise.all([
    getLatestBalance(),
    get(
      `SELECT
         COALESCE(SUM(income), 0) AS total_income,
         COALESCE(SUM(expenses), 0) AS total_expenses,
         COALESCE(SUM(CASE WHEN LOWER(source) = 'donation' THEN income ELSE 0 END), 0) AS total_donations,
         COUNT(CASE WHEN LOWER(source) = 'donation' AND income > 0 THEN 1 END) AS donation_count
       FROM financial_ledger`
    ),
  ]);

  return {
    total_income: Number(agg?.total_income || 0),
    total_expenses: Number(agg?.total_expenses || 0),
    total_donations: Number(agg?.total_donations || 0),
    donation_count: Number(agg?.donation_count || 0),
    current_balance: currentBalance,
  };
};

const insertLedgerEntry = (entry) =>
  new Promise((resolve, reject) => {
    const incomeVal = Number(entry.income ?? 0);
    const expensesVal = Number(entry.expenses ?? 0);
    const dateVal = entry.entry_date || new Date().toISOString().slice(0, 10);
    const sourceVal = String(
      entry.source || (expensesVal > 0 ? 'expense' : 'donation')
    ).trim();
    const receiptVal =
      entry.receipt_number ||
      (incomeVal > 0 && sourceVal.toLowerCase() === 'donation'
        ? `DON-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`
        : null);

    db.serialize(() => {
      db.run('BEGIN IMMEDIATE TRANSACTION', (beginErr) => {
        if (beginErr) return reject(beginErr);

        db.get(
          'SELECT balance FROM financial_ledger ORDER BY id DESC LIMIT 1',
          (balErr, lastRow) => {
            if (balErr) {
              return db.run('ROLLBACK', () => reject(balErr));
            }

            const prevBalance = Number(lastRow?.balance || 0);
            const nextBalance = Number((prevBalance + incomeVal - expensesVal).toFixed(2));

            db.run(
              `INSERT INTO financial_ledger
                 (entry_date, source, description, donor_name, donor_phone, donor_email, receipt_number, income, expenses, balance)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                dateVal,
                sourceVal,
                entry.description ? String(entry.description).trim() : null,
                entry.donor_name ? String(entry.donor_name).trim() : null,
                entry.donor_phone ? String(entry.donor_phone).trim() : null,
                entry.donor_email ? String(entry.donor_email).trim() : null,
                receiptVal,
                incomeVal,
                expensesVal,
                nextBalance,
              ],
              function (insertErr) {
                if (insertErr) {
                  return db.run('ROLLBACK', () => reject(insertErr));
                }

                const newId = this.lastID;
                db.run('COMMIT', (commitErr) => {
                  if (commitErr) return reject(commitErr);
                  getEntryById(newId).then(resolve).catch(reject);
                });
              }
            );
          }
        );
      });
    });
  });

module.exports = {
  ensureTable,
  listLedgerEntries,
  getEntryById,
  getSummary,
  insertLedgerEntry,
};

