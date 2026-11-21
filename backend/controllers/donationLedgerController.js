// controllers/donationLedgerController.js
const {
  ensureTable,
  listLedgerEntries,
  getEntryById,
  getSummary,
  insertLedgerEntry,
} = require('../models/donationLedgerModel');
const { buildDonationReceipt } = require('../utils/pdfGenerator');

async function init(_req, _res, next) {
  try {
    await ensureTable();
    next();
  } catch (err) {
    next(err);
  }
}

async function getLedger(req, res, next) {
  try {
    const { source, from_date, to_date } = req.query;
    const [entries, summary] = await Promise.all([
      listLedgerEntries({ source, fromDate: from_date, toDate: to_date }),
      getSummary(),
    ]);
    res.json({ summary, entries });
  } catch (err) {
    next(err);
  }
}

async function createDonation(req, res, next) {
  try {
    const amount = Number(req.body.income ?? req.body.amount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Donation amount (income) must be greater than 0' });
    }

    const row = await insertLedgerEntry({
      entry_date: req.body.entry_date || req.body.date,
      source: req.body.source || 'donation',
      description: req.body.description || req.body.notes || 'Donation received',
      donor_name: req.body.donor_name || 'Anonymous Donor',
      donor_phone: req.body.donor_phone || '',
      donor_email: req.body.donor_email || '',
      receipt_number: req.body.receipt_number || undefined,
      income: amount,
      expenses: 0,
    });

    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

async function createLedgerEntry(req, res, next) {
  try {
    const income = Number(req.body.income ?? 0);
    const expenses = Number(req.body.expenses ?? 0);

    if (!Number.isFinite(income) || income < 0 || !Number.isFinite(expenses) || expenses < 0) {
      return res.status(400).json({ error: 'Income and expenses must be non-negative numbers' });
    }
    if (income === 0 && expenses === 0) {
      return res.status(400).json({ error: 'Provide either income or expenses greater than 0' });
    }

    const row = await insertLedgerEntry({
      entry_date: req.body.entry_date || req.body.date,
      source: req.body.source || (expenses > 0 ? 'expense' : 'donation'),
      description: req.body.description || '',
      donor_name: req.body.donor_name || '',
      donor_phone: req.body.donor_phone || '',
      donor_email: req.body.donor_email || '',
      receipt_number: req.body.receipt_number || undefined,
      income,
      expenses,
    });

    res.status(201).json(row);
  } catch (err) {
    next(err);
  }
}

async function downloadDonationReceiptPdf(req, res, next) {
  try {
    const entry = await getEntryById(req.params.id);
    if (!entry) {
      return res.status(404).json({ error: 'Ledger / donation entry not found' });
    }

    const pdfBuffer = await buildDonationReceipt({
      entry,
      school: {
        name: process.env.SCHOOL_NAME || 'Jamia Hussania Anwar-ul-Quran',
        address: process.env.SCHOOL_ADDRESS || 'Hujjan, Tehsil Kot Momin',
      },
    });

    const filename = `donation-receipt-${entry.receipt_number || entry.id}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdfBuffer);
  } catch (err) {
    next(err);
  }
}

module.exports = {
  init,
  getLedger,
  createDonation,
  createLedgerEntry,
  downloadDonationReceiptPdf,
};

