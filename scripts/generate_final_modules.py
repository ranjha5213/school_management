#!/usr/bin/env python3
"""
Final modules bundle:
  - Fees (invoices + payments)
  - Library (books + issues)
  - Report card (per-student printable view)
  - Dashboard drill-down (clickable tiles)
  - Topbar bell with unread notice count

Run from ~/school:  python scripts/generate_final_modules.py
"""
import sys
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parent.parent if HERE.parent.name == "scripts" else Path.cwd()
BE = ROOT / "backend"
FE = ROOT / "frontend"


def write(base, rel, content):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ {p.relative_to(ROOT)}")


def banner(m):
    print(f"\n── {m} " + "─" * max(0, 60 - len(m)))


# ════════════════════════════════════════════════════════════
# BACKEND — FEES
# ════════════════════════════════════════════════════════════

def gen_fees_backend():
    banner("Fees backend")

    write(BE, "models/feeModel.js", r"""
const { run, get, all } = require('../config/database');

const FeeModel = {
  // ─── Invoices ───
  listInvoices: (filters = {}) => {
    let sql = `
      SELECT i.*,
             u.name AS student_name, s.admission_number, s.roll_number,
             sec.section_name, c.class_name,
             (SELECT COALESCE(SUM(p.amount_paid), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid_amount
      FROM invoices i
      JOIN students s ON i.student_id = s.id
      JOIN users u ON s.user_id = u.id
      LEFT JOIN sections sec ON s.section_id = sec.id
      LEFT JOIN classes c ON sec.class_id = c.id
    `;
    const where = [];
    const params = [];
    if (filters.student_id) { where.push('i.student_id = ?'); params.push(filters.student_id); }
    if (filters.status)     { where.push('i.status = ?');     params.push(filters.status); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY i.created_at DESC LIMIT 500';
    return all(sql, params);
  },

  findInvoice: (id) =>
    get(
      `SELECT i.*,
              u.name AS student_name, s.admission_number, s.roll_number,
              sec.section_name, c.class_name,
              (SELECT COALESCE(SUM(p.amount_paid), 0) FROM payments p WHERE p.invoice_id = i.id) AS paid_amount
       FROM invoices i
       JOIN students s ON i.student_id = s.id
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE i.id = ?`,
      [id]
    ),

  createInvoice: ({ student_id, amount, due_date = null, status = 'unpaid',
                    invoice_number = null, description = null }) =>
    run(
      `INSERT INTO invoices (student_id, invoice_number, amount, total_amount, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [student_id, invoice_number, amount, amount, due_date, status]
    ),

  updateInvoice: (id, patch) => {
    const allowed = ['amount', 'total_amount', 'due_date', 'status', 'invoice_number'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE invoices SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  removeInvoice: (id) => run(`DELETE FROM invoices WHERE id = ?`, [id]),

  // ─── Payments ───
  listPayments: (invoice_id) =>
    all(
      `SELECT p.*, u.name AS recorded_by_name
       FROM payments p
       LEFT JOIN users u ON p.paid_by = u.id
       WHERE p.invoice_id = ?
       ORDER BY p.paid_at DESC`,
      [invoice_id]
    ),

  recordPayment: ({ invoice_id, amount_paid, payment_method, paid_by, notes = null }) =>
    run(
      `INSERT INTO payments (invoice_id, amount_paid, payment_method, paid_by, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [invoice_id, amount_paid, payment_method, paid_by, notes]
    ),

  // Recompute invoice status based on payments
  recomputeInvoiceStatus: async (invoice_id) => {
    const inv = await FeeModel.findInvoice(invoice_id);
    if (!inv) return;
    const paid = Number(inv.paid_amount || 0);
    const total = Number(inv.total_amount || inv.amount || 0);
    let status = 'unpaid';
    if (paid >= total && total > 0) status = 'paid';
    else if (paid > 0) status = 'partial';
    await FeeModel.updateInvoice(invoice_id, { status });
    return status;
  },

  // ─── Summary ───
  summary: () =>
    get(
      `SELECT
         COUNT(*) AS total_invoices,
         SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid_count,
         SUM(CASE WHEN status='unpaid' THEN 1 ELSE 0 END) AS unpaid_count,
         SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) AS partial_count,
         COALESCE(SUM(total_amount), 0) AS total_billed,
         COALESCE((SELECT SUM(amount_paid) FROM payments), 0) AS total_paid
       FROM invoices`
    ),
};

module.exports = FeeModel;
""".strip())

    write(BE, "controllers/feeController.js", r"""
const FeeModel = require('../models/feeModel');
const StudentModel = require('../models/studentModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── Invoices ───
const listInvoices = async (req, res, next) => {
  try {
    const rows = await FeeModel.listInvoices({
      student_id: req.query.student_id ? Number(req.query.student_id) : undefined,
      status: req.query.status || undefined,
    });
    return apiResponse(res, 200, true, 'Invoices', rows);
  } catch (e) { next(e); }
};

const getInvoice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const inv = await FeeModel.findInvoice(id);
    if (!inv) return apiResponse(res, 404, false, 'Invoice not found');
    const payments = await FeeModel.listPayments(id);
    return apiResponse(res, 200, true, 'Invoice', { invoice: inv, payments });
  } catch (e) { next(e); }
};

const createInvoice = async (req, res, next) => {
  try {
    const { student_id, amount, due_date = null } = req.body;
    if (!student_id) return apiResponse(res, 400, false, 'student_id required');
    if (!amount || Number(amount) <= 0) return apiResponse(res, 400, false, 'amount must be > 0');

    const student = await StudentModel.findById(Number(student_id));
    if (!student) return apiResponse(res, 404, false, 'Student not found');

    const invoice_number = req.body.invoice_number
      || `INV-${Date.now().toString().slice(-8)}`;

    const { lastID } = await FeeModel.createInvoice({
      student_id: Number(student_id),
      amount: Number(amount),
      due_date,
      invoice_number,
    });

    logger.audit(`Invoice created: ${invoice_number} ($${amount}) for student ${student_id}`);
    return apiResponse(res, 201, true, 'Invoice created', { id: lastID, invoice_number });
  } catch (e) { next(e); }
};

const updateInvoice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const inv = await FeeModel.findInvoice(id);
    if (!inv) return apiResponse(res, 404, false, 'Invoice not found');
    await FeeModel.updateInvoice(id, req.body);
    return apiResponse(res, 200, true, 'Invoice updated');
  } catch (e) { next(e); }
};

const deleteInvoice = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const inv = await FeeModel.findInvoice(id);
    if (!inv) return apiResponse(res, 404, false, 'Invoice not found');
    await FeeModel.removeInvoice(id);
    logger.audit(`Invoice deleted: ${inv.invoice_number} (id=${id})`);
    return apiResponse(res, 200, true, 'Invoice deleted');
  } catch (e) { next(e); }
};

// ─── Payments ───
const recordPayment = async (req, res, next) => {
  try {
    const { invoice_id, amount_paid, payment_method, notes = null } = req.body;
    if (!invoice_id) return apiResponse(res, 400, false, 'invoice_id required');
    if (!amount_paid || Number(amount_paid) <= 0)
      return apiResponse(res, 400, false, 'amount_paid must be > 0');
    if (!payment_method) return apiResponse(res, 400, false, 'payment_method required');

    const inv = await FeeModel.findInvoice(Number(invoice_id));
    if (!inv) return apiResponse(res, 404, false, 'Invoice not found');

    const total = Number(inv.total_amount || inv.amount || 0);
    const paid_before = Number(inv.paid_amount || 0);
    const new_total = paid_before + Number(amount_paid);
    if (new_total > total + 0.01)
      return apiResponse(res, 400, false,
        `Payment exceeds balance. Remaining: ${(total - paid_before).toFixed(2)}`);

    const { lastID } = await FeeModel.recordPayment({
      invoice_id: Number(invoice_id),
      amount_paid: Number(amount_paid),
      payment_method,
      paid_by: req.user.id,
      notes,
    });

    const status = await FeeModel.recomputeInvoiceStatus(Number(invoice_id));
    logger.audit(`Payment recorded: invoice ${invoice_id}, $${amount_paid}, method ${payment_method}`);
    return apiResponse(res, 201, true, `Payment recorded (status: ${status})`, { id: lastID, status });
  } catch (e) { next(e); }
};

const summary = async (_req, res, next) => {
  try { return apiResponse(res, 200, true, 'Fee summary', await FeeModel.summary()); }
  catch (e) { next(e); }
};

module.exports = {
  listInvoices, getInvoice, createInvoice, updateInvoice, deleteInvoice,
  recordPayment, summary,
};
""".strip())

    write(BE, "routes/fees.js", r"""
const express = require('express');
const c = require('../controllers/feeController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/summary', authorize('admin', 'accountant'), c.summary);
router.get('/invoices', authorize('admin', 'accountant', 'teacher', 'student', 'parent'), c.listInvoices);
router.get('/invoices/:id', authorize('admin', 'accountant', 'teacher', 'student', 'parent'), c.getInvoice);
router.post('/invoices', authorize('admin', 'accountant'), c.createInvoice);
router.patch('/invoices/:id', authorize('admin', 'accountant'), c.updateInvoice);
router.delete('/invoices/:id', authorize('admin', 'accountant'), c.deleteInvoice);

router.post('/payments', authorize('admin', 'accountant'), c.recordPayment);

module.exports = router;
""".strip())


# ════════════════════════════════════════════════════════════
# BACKEND — LIBRARY
# ════════════════════════════════════════════════════════════

def gen_library_backend():
    banner("Library backend")

    write(BE, "models/libraryModel.js", r"""
const { run, get, all } = require('../config/database');

const LibraryModel = {
  listBooks: (filters = {}) => {
    let sql = `SELECT * FROM books WHERE is_active = 1`;
    const params = [];
    if (filters.q) {
      sql += ` AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)`;
      const like = `%${filters.q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY title';
    return all(sql, params);
  },

  findBook: (id) => get(`SELECT * FROM books WHERE id = ?`, [id]),

  createBook: ({ title, author = null, isbn = null, publisher = null,
                 publication_year = null, total_copies = 1, category = null,
                 shelf_location = null }) =>
    run(
      `INSERT INTO books (title, author, isbn, publisher, publication_year,
                          total_copies, available_copies, category, shelf_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, author, isbn, publisher, publication_year,
       total_copies, total_copies, category, shelf_location]
    ),

  updateBook: (id, patch) => {
    const allowed = ['title', 'author', 'isbn', 'publisher', 'publication_year',
                     'total_copies', 'available_copies', 'category', 'shelf_location', 'is_active'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE books SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  removeBook: (id) => run(`UPDATE books SET is_active = 0 WHERE id = ?`, [id]),

  // ─── Issues ───
  listIssues: (filters = {}) => {
    let sql = `
      SELECT bi.*, b.title AS book_title, b.author,
             u.name AS student_name, s.admission_number, s.roll_number
      FROM book_issues bi
      JOIN books b ON bi.book_id = b.id
      JOIN students s ON bi.student_id = s.id
      JOIN users u ON s.user_id = u.id
    `;
    const where = [];
    const params = [];
    if (filters.status)     { where.push('bi.status = ?');     params.push(filters.status); }
    if (filters.student_id) { where.push('bi.student_id = ?'); params.push(filters.student_id); }
    if (filters.book_id)    { where.push('bi.book_id = ?');    params.push(filters.book_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY bi.issue_date DESC LIMIT 300';
    return all(sql, params);
  },

  issueBook: ({ book_id, student_id, issue_date, due_date }) =>
    run(
      `INSERT INTO book_issues (book_id, student_id, issue_date, due_date, status)
       VALUES (?, ?, ?, ?, 'issued')`,
      [book_id, student_id, issue_date, due_date]
    ),

  returnBook: ({ id, return_date, fine_amount = 0 }) =>
    run(
      `UPDATE book_issues
       SET return_date = ?, status = 'returned', fine_amount = ?
       WHERE id = ?`,
      [return_date, fine_amount, id]
    ),

  findIssue: (id) => get(`SELECT * FROM book_issues WHERE id = ?`, [id]),

  decrementAvailable: (book_id) =>
    run(`UPDATE books SET available_copies = available_copies - 1
         WHERE id = ? AND available_copies > 0`, [book_id]),

  incrementAvailable: (book_id) =>
    run(`UPDATE books SET available_copies = available_copies + 1
         WHERE id = ? AND available_copies < total_copies`, [book_id]),
};

module.exports = LibraryModel;
""".strip())

    write(BE, "controllers/libraryController.js", r"""
const LibraryModel = require('../models/libraryModel');
const StudentModel = require('../models/studentModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── Books ───
const listBooks = async (req, res, next) => {
  try { return apiResponse(res, 200, true, 'Books', await LibraryModel.listBooks({ q: req.query.q })); }
  catch (e) { next(e); }
};

const getBook = async (req, res, next) => {
  try {
    const b = await LibraryModel.findBook(Number(req.params.id));
    if (!b) return apiResponse(res, 404, false, 'Book not found');
    return apiResponse(res, 200, true, 'Book', b);
  } catch (e) { next(e); }
};

const createBook = async (req, res, next) => {
  try {
    const { title, total_copies = 1 } = req.body;
    if (!title || !title.trim()) return apiResponse(res, 400, false, 'title required');
    if (Number(total_copies) < 1) return apiResponse(res, 400, false, 'total_copies must be >= 1');

    const { lastID } = await LibraryModel.createBook({
      ...req.body, title: title.trim(), total_copies: Number(total_copies),
    });
    logger.audit(`Book added: "${title}" (id=${lastID})`);
    return apiResponse(res, 201, true, 'Book added', { id: lastID });
  } catch (e) { next(e); }
};

const updateBook = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = await LibraryModel.findBook(id);
    if (!b) return apiResponse(res, 404, false, 'Book not found');
    await LibraryModel.updateBook(id, req.body);
    return apiResponse(res, 200, true, 'Book updated');
  } catch (e) { next(e); }
};

const deleteBook = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = await LibraryModel.findBook(id);
    if (!b) return apiResponse(res, 404, false, 'Book not found');

    // check for open issues
    const open = await LibraryModel.listIssues({ book_id: id, status: 'issued' });
    if (open.length) return apiResponse(res, 409, false,
      `${open.length} copy/copies still issued — return them first`);

    await LibraryModel.removeBook(id);
    logger.audit(`Book removed: ${b.title} (id=${id})`);
    return apiResponse(res, 200, true, 'Book removed');
  } catch (e) { next(e); }
};

// ─── Issues ───
const listIssues = async (req, res, next) => {
  try {
    const rows = await LibraryModel.listIssues({
      status: req.query.status,
      student_id: req.query.student_id ? Number(req.query.student_id) : undefined,
      book_id: req.query.book_id ? Number(req.query.book_id) : undefined,
    });
    return apiResponse(res, 200, true, 'Issues', rows);
  } catch (e) { next(e); }
};

const issueBook = async (req, res, next) => {
  try {
    const { book_id, student_id, due_date } = req.body;
    if (!book_id) return apiResponse(res, 400, false, 'book_id required');
    if (!student_id) return apiResponse(res, 400, false, 'student_id required');
    if (!due_date) return apiResponse(res, 400, false, 'due_date required');

    const book = await LibraryModel.findBook(Number(book_id));
    if (!book) return apiResponse(res, 404, false, 'Book not found');
    if (book.available_copies < 1)
      return apiResponse(res, 409, false, 'No copies available');

    const student = await StudentModel.findById(Number(student_id));
    if (!student) return apiResponse(res, 404, false, 'Student not found');

    const issue_date = new Date().toISOString().slice(0, 10);
    const { lastID } = await LibraryModel.issueBook({
      book_id: Number(book_id),
      student_id: Number(student_id),
      issue_date,
      due_date,
    });
    await LibraryModel.decrementAvailable(Number(book_id));

    logger.audit(`Book issued: "${book.title}" to ${student.name}`);
    return apiResponse(res, 201, true, 'Book issued', { id: lastID });
  } catch (e) { next(e); }
};

const returnBook = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const issue = await LibraryModel.findIssue(id);
    if (!issue) return apiResponse(res, 404, false, 'Issue not found');
    if (issue.status === 'returned') return apiResponse(res, 400, false, 'Already returned');

    const return_date = req.body.return_date || new Date().toISOString().slice(0, 10);

    // Simple fine: 5 per day overdue
    const due = new Date(issue.due_date);
    const ret = new Date(return_date);
    const overdue_days = Math.max(0, Math.floor((ret - due) / 86400000));
    const fine = overdue_days * 5;

    await LibraryModel.returnBook({ id, return_date, fine_amount: fine });
    await LibraryModel.incrementAvailable(issue.book_id);

    logger.audit(`Book returned: issue ${id}, ${overdue_days} day(s) overdue, fine ${fine}`);
    return apiResponse(res, 200, true,
      `Book returned${overdue_days ? ` (${overdue_days} day(s) late, fine ${fine})` : ''}`,
      { overdue_days, fine_amount: fine });
  } catch (e) { next(e); }
};

module.exports = { listBooks, getBook, createBook, updateBook, deleteBook,
                   listIssues, issueBook, returnBook };
""".strip())

    write(BE, "routes/library.js", r"""
const express = require('express');
const c = require('../controllers/libraryController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/books', c.listBooks);
router.get('/books/:id', c.getBook);
router.post('/books', authorize('admin', 'teacher'), c.createBook);
router.patch('/books/:id', authorize('admin', 'teacher'), c.updateBook);
router.delete('/books/:id', authorize('admin'), c.deleteBook);

router.get('/issues', c.listIssues);
router.post('/issues', authorize('admin', 'teacher'), c.issueBook);
router.patch('/issues/:id/return', authorize('admin', 'teacher'), c.returnBook);

module.exports = router;
""".strip())


# ════════════════════════════════════════════════════════════
# BACKEND — REPORT CARD
# ════════════════════════════════════════════════════════════

def gen_report_backend():
    banner("Report card backend")

    write(BE, "controllers/reportController.js", r"""
const { get, all } = require('../config/database');
const StudentDetailModel = require('../models/studentDetailModel');
const AttendanceModel = require('../models/attendanceModel');
const ExamModel = require('../models/examModel');
const HomeworkModel = require('../models/homeworkModel');
const { apiResponse } = require('../utils/helpers');

const dashboard = async (_req, res, next) => {
  try {
    const [students, teachers, classes, sections, todayAttendance] = await Promise.all([
      get(`SELECT COUNT(*) AS c FROM students`),
      get(`SELECT COUNT(*) AS c FROM teachers`),
      get(`SELECT COUNT(*) AS c FROM classes`),
      get(`SELECT COUNT(*) AS c FROM sections`),
      get(
        `SELECT SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN status='absent'  THEN 1 ELSE 0 END) AS absent,
                COUNT(*) AS total
         FROM attendance WHERE date = DATE('now')`
      ),
    ]);
    return apiResponse(res, 200, true, 'Dashboard', {
      students: students?.c || 0,
      teachers: teachers?.c || 0,
      classes: classes?.c || 0,
      sections: sections?.c || 0,
      attendanceToday: todayAttendance || { present: 0, absent: 0, total: 0 },
    });
  } catch (e) { next(e); }
};

const attendanceReport = async (req, res, next) => {
  try {
    const { section_id, from, to } = req.query;
    const rows = await AttendanceModel.classSummary(section_id, from, to);
    return apiResponse(res, 200, true, 'Attendance report', rows);
  } catch (e) { next(e); }
};

// ─── Full report card for one student ───
const studentReportCard = async (req, res, next) => {
  try {
    const id = Number(req.params.studentId);

    const [profile, attendance, exams, homework, fees] = await Promise.all([
      StudentDetailModel.profile(id),
      AttendanceModel.summary(id),
      ExamModel.marksForStudent(id),
      HomeworkModel.list({ class_id: null }).catch(() => []),
      StudentDetailModel.fees(id),
    ]);

    if (!profile) return apiResponse(res, 404, false, 'Student not found');

    // Group exams by exam_name
    const examsByName = {};
    (exams || []).forEach((e) => {
      const key = e.exam_name || 'Unnamed';
      examsByName[key] = examsByName[key] || {
        exam_name: key, type_name: e.type_name, start_date: e.start_date, marks: [],
      };
      examsByName[key].marks.push({
        subject: e.subject_name,
        obtained: e.marks_obtained,
        total: e.total_marks,
        remarks: e.remarks,
        percentage: e.total_marks
          ? Math.round((e.marks_obtained / e.total_marks) * 100)
          : 0,
      });
    });

    const fee_summary = {
      total_billed: (fees || []).reduce((a, f) => a + Number(f.total_amount || f.amount || 0), 0),
      total_paid: (fees || []).reduce((a, f) => a + Number(f.paid_amount || 0), 0),
      pending: 0,
    };
    fee_summary.pending = fee_summary.total_billed - fee_summary.total_paid;

    return apiResponse(res, 200, true, 'Report card', {
      generated_at: new Date().toISOString(),
      student: profile,
      attendance,
      exams: Object.values(examsByName),
      homework_count: homework.length,
      fees: fee_summary,
    });
  } catch (e) { next(e); }
};

module.exports = { dashboard, attendanceReport, studentReportCard };
""".strip())

    write(BE, "routes/reports.js", r"""
const express = require('express');
const c = require('../controllers/reportController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/dashboard', c.dashboard);
router.get('/attendance', authorize('admin', 'teacher'), c.attendanceReport);
router.get('/student/:studentId/report-card',
  authorize('admin', 'teacher', 'parent', 'student'),
  c.studentReportCard);

module.exports = router;
""".strip())


# ════════════════════════════════════════════════════════════
# FRONTEND — API
# ════════════════════════════════════════════════════════════

def gen_frontend_api():
    banner("frontend api")

    p = FE / "src/api/endpoints.js"
    if not p.exists():
        print("  ! endpoints.js missing")
        return
    src = p.read_text()

    import re

    # feesApi
    pattern = re.compile(r"export const feesApi = \{.*?\n\};", re.DOTALL)
    new_fees = """export const feesApi = {
  summary: () => unwrap(client.get('/fees/summary')),
  invoices: (params) => unwrap(client.get('/fees/invoices', { params })),
  invoice: (id) => unwrap(client.get(`/fees/invoices/${id}`)),
  createInvoice: (p) => unwrap(client.post('/fees/invoices', p)),
  updateInvoice: (id, p) => unwrap(client.patch(`/fees/invoices/${id}`, p)),
  removeInvoice: (id) => unwrap(client.delete(`/fees/invoices/${id}`)),
  pay: (p) => unwrap(client.post('/fees/payments', p)),
};"""
    if pattern.search(src): src = pattern.sub(new_fees, src, count=1)
    else: src += "\n" + new_fees

    # libraryApi
    pattern = re.compile(r"export const libraryApi = \{.*?\n\};", re.DOTALL)
    new_lib = """export const libraryApi = {
  books: (params) => unwrap(client.get('/library/books', { params })),
  book: (id) => unwrap(client.get(`/library/books/${id}`)),
  createBook: (p) => unwrap(client.post('/library/books', p)),
  updateBook: (id, p) => unwrap(client.patch(`/library/books/${id}`, p)),
  removeBook: (id) => unwrap(client.delete(`/library/books/${id}`)),
  issues: (params) => unwrap(client.get('/library/issues', { params })),
  issue: (p) => unwrap(client.post('/library/issues', p)),
  returnBook: (id, return_date) =>
    unwrap(client.patch(`/library/issues/${id}/return`, { return_date })),
};"""
    if pattern.search(src): src = pattern.sub(new_lib, src, count=1)
    else: src += "\n" + new_lib

    # reportsApi
    pattern = re.compile(r"export const reportsApi = \{.*?\n\};", re.DOTALL)
    new_rep = """export const reportsApi = {
  dashboard: () => unwrap(client.get('/reports/dashboard')),
  attendance: (params) => unwrap(client.get('/reports/attendance', { params })),
  reportCard: (studentId) =>
    unwrap(client.get(`/reports/student/${studentId}/report-card`)),
};"""
    if pattern.search(src): src = pattern.sub(new_rep, src, count=1)
    else: src += "\n" + new_rep

    p.write_text(src)
    print("  ✓ expanded fees/library/reports APIs")


# ════════════════════════════════════════════════════════════
# FRONTEND — FEES
# ════════════════════════════════════════════════════════════

def gen_fees_frontend():
    banner("Fees UI")

    write(FE, "src/components/InvoiceModal.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { feesApi, studentsApi } from '../api/endpoints';

export default function InvoiceModal({ initial = null, onClose, onSaved }) {
  const [form, setForm] = useState({
    student_id: initial?.student_id || '',
    amount: initial?.amount || '',
    due_date: initial?.due_date || '',
  });
  const [students, setStudents] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    studentsApi.list().then((d) => setStudents(d || [])).catch(() => setStudents([]));
  }, []);

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.student_id) return toast.error('Pick a student');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Amount must be > 0');
    setSaving(true);
    try {
      await feesApi.createInvoice({
        student_id: Number(form.student_id),
        amount: Number(form.amount),
        due_date: form.due_date || null,
      });
      toast.success('Invoice created');
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title="New Invoice"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>Create</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Student *</label>
          <select name="student_id" value={form.student_id} onChange={onChange} className="input">
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.student_name} ({s.admission_number})
              </option>
            ))}
          </select>
        </div>
        <Input label="Amount *" name="amount" type="number" value={form.amount} onChange={onChange} />
        <Input label="Due date" name="due_date" type="date" value={form.due_date} onChange={onChange} />
      </form>
    </Modal>
  );
}
""".strip())

    write(FE, "src/components/PaymentModal.jsx", r"""
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { feesApi } from '../api/endpoints';

const METHODS = ['cash', 'card', 'bank_transfer', 'online', 'cheque'];

export default function PaymentModal({ invoice, onClose, onSaved }) {
  const balance = Number(invoice.total_amount || invoice.amount || 0) - Number(invoice.paid_amount || 0);
  const [amount, setAmount] = useState(balance > 0 ? balance : 0);
  const [method, setMethod] = useState('cash');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!amount || Number(amount) <= 0) return toast.error('Amount must be > 0');
    if (Number(amount) > balance + 0.01) return toast.error(`Max: ${balance}`);
    setSaving(true);
    try {
      const res = await feesApi.pay({
        invoice_id: invoice.id,
        amount_paid: Number(amount),
        payment_method: method,
        notes: notes || null,
      });
      toast.success(`Payment recorded (${res?.status || 'ok'})`);
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose}
      title={`Record Payment — ${invoice.student_name}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>Record Payment</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 text-sm">
          <div className="flex justify-between"><span>Invoice</span><b>{invoice.invoice_number}</b></div>
          <div className="flex justify-between mt-1"><span>Total</span><b>{invoice.total_amount || invoice.amount}</b></div>
          <div className="flex justify-between mt-1"><span>Paid</span><b>{invoice.paid_amount || 0}</b></div>
          <div className="flex justify-between mt-1 text-brand-600 dark:text-brand-300"><span>Balance</span><b>{balance.toFixed(2)}</b></div>
        </div>

        <Input label="Amount *" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />

        <div>
          <label className="label">Method *</label>
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value)}>
            {METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="label">Notes</label>
          <textarea className="input" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}
""".strip())

    write(FE, "src/pages/Fees.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { DollarSign, Plus, Trash2, Wallet, CheckCircle2, AlertCircle } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import InvoiceModal from '../components/InvoiceModal';
import PaymentModal from '../components/PaymentModal';
import { feesApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

export default function Fees() {
  const { user } = useAuth();
  const canWrite = ['admin', 'accountant'].includes(user?.role);

  const [rows, setRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [invoiceModal, setInvoiceModal] = useState(false);
  const [paymentTarget, setPaymentTarget] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, sum] = await Promise.all([
        feesApi.invoices(statusFilter ? { status: statusFilter } : {}),
        canWrite ? feesApi.summary().catch(() => null) : Promise.resolve(null),
      ]);
      setRows(inv || []);
      setSummary(sum);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(load, [statusFilter]);

  const handleDelete = async () => {
    try {
      await feesApi.removeInvoice(confirm.id);
      toast.success('Invoice deleted');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const badgeFor = (s) => ({
    paid: 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300',
    partial: 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300',
    unpaid: 'bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300',
  }[s] || 'bg-slate-100 text-slate-700');

  return (
    <div className="space-y-4 animate-fade-in">
      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Stat label="Invoices" value={summary.total_invoices} />
          <Stat label="Billed" value={Number(summary.total_billed || 0).toFixed(0)} tone="blue" />
          <Stat label="Collected" value={Number(summary.total_paid || 0).toFixed(0)} tone="green" icon={CheckCircle2} />
          <Stat label="Pending" value={Number((summary.total_billed || 0) - (summary.total_paid || 0)).toFixed(0)} tone="amber" icon={AlertCircle} />
        </div>
      )}

      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-brand-600" /> Invoices ({rows.length})
          </h3>
          <div className="flex gap-2 items-center">
            <select className="input py-1.5 text-sm" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="unpaid">Unpaid</option>
            </select>
            {canWrite && (
              <Button size="sm" icon={Plus} onClick={() => setInvoiceModal(true)}>New Invoice</Button>
            )}
          </div>
        </div>

        {loading ? <Loader /> : rows.length === 0 ? (
          <Empty title="No invoices" hint={canWrite ? 'Create one to get started' : null} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800">
                <tr>
                  <th className="text-left p-3">Invoice</th>
                  <th className="text-left p-3">Student</th>
                  <th className="text-right p-3">Total</th>
                  <th className="text-right p-3">Paid</th>
                  <th className="text-right p-3">Balance</th>
                  <th className="text-center p-3">Status</th>
                  <th className="text-right p-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                {rows.map((r) => {
                  const total = Number(r.total_amount || r.amount || 0);
                  const paid = Number(r.paid_amount || 0);
                  const bal = total - paid;
                  return (
                    <tr key={r.id}>
                      <td className="p-3 font-mono text-xs">{r.invoice_number}</td>
                      <td className="p-3">
                        <div className="font-medium">{r.student_name}</div>
                        <div className="text-xs text-slate-500">
                          {r.class_name} · {r.section_name} · {r.admission_number}
                        </div>
                      </td>
                      <td className="p-3 text-right">{total.toFixed(2)}</td>
                      <td className="p-3 text-right">{paid.toFixed(2)}</td>
                      <td className="p-3 text-right font-medium">{bal.toFixed(2)}</td>
                      <td className="p-3 text-center">
                        <span className={`badge capitalize ${badgeFor(r.status)}`}>{r.status}</span>
                      </td>
                      <td className="p-3 text-right">
                        <div className="flex justify-end gap-2">
                          {canWrite && bal > 0 && (
                            <button onClick={() => setPaymentTarget(r)}
                              className="text-xs text-green-600 font-medium flex items-center gap-1">
                              <Wallet className="w-3.5 h-3.5" /> Pay
                            </button>
                          )}
                          {canWrite && (
                            <button onClick={() => setConfirm({ id: r.id, name: r.invoice_number })}
                              className="text-xs text-red-600 font-medium flex items-center gap-1">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {invoiceModal && (
        <InvoiceModal onClose={() => setInvoiceModal(false)}
          onSaved={async () => { setInvoiceModal(false); await load(); }} />
      )}

      {paymentTarget && (
        <PaymentModal invoice={paymentTarget}
          onClose={() => setPaymentTarget(null)}
          onSaved={async () => { setPaymentTarget(null); await load(); }} />
      )}

      <ConfirmDelete open={!!confirm} title="Delete invoice?"
        message={`${confirm?.name || ''} and all its payments will be removed.`}
        onClose={() => setConfirm(null)} onConfirm={handleDelete} />
    </div>
  );
}

function Stat({ label, value, tone = 'slate', icon: Icon }) {
  const map = {
    slate: 'bg-slate-50 dark:bg-slate-800',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    blue:  'bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return (
    <div className={`p-3 rounded-xl ${map[tone]}`}>
      <div className="text-xs uppercase text-slate-500 flex items-center gap-1">
        {Icon && <Icon className="w-3 h-3" />} {label}
      </div>
      <div className="text-lg font-bold">{value ?? '—'}</div>
    </div>
  );
}
""".strip())


# ════════════════════════════════════════════════════════════
# FRONTEND — LIBRARY
# ════════════════════════════════════════════════════════════

def gen_library_frontend():
    banner("Library UI")

    write(FE, "src/components/BookModal.jsx", r"""
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { libraryApi } from '../api/endpoints';

export default function BookModal({ initial = null, onClose, onSaved }) {
  const mode = initial ? 'edit' : 'create';
  const [form, setForm] = useState({
    title: initial?.title || '',
    author: initial?.author || '',
    isbn: initial?.isbn || '',
    publisher: initial?.publisher || '',
    publication_year: initial?.publication_year || '',
    total_copies: initial?.total_copies || 1,
    category: initial?.category || '',
    shelf_location: initial?.shelf_location || '',
  });
  const [saving, setSaving] = useState(false);
  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) return toast.error('Title required');
    setSaving(true);
    try {
      const payload = {
        ...form,
        total_copies: Number(form.total_copies || 1),
        publication_year: form.publication_year ? Number(form.publication_year) : null,
      };
      if (mode === 'create') {
        await libraryApi.createBook(payload);
        toast.success('Book added');
      } else {
        await libraryApi.updateBook(initial.id, payload);
        toast.success('Book updated');
      }
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={mode === 'create' ? 'Add Book' : 'Edit Book'}
      size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>{mode === 'create' ? 'Add' : 'Save'}</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <Input label="Title *" name="title" value={form.title} onChange={onChange} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Author" name="author" value={form.author} onChange={onChange} />
          <Input label="ISBN" name="isbn" value={form.isbn} onChange={onChange} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Publisher" name="publisher" value={form.publisher} onChange={onChange} />
          <Input label="Year" name="publication_year" type="number" value={form.publication_year} onChange={onChange} />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Input label="Total copies" name="total_copies" type="number" value={form.total_copies} onChange={onChange} />
          <Input label="Category" name="category" value={form.category} onChange={onChange} />
          <Input label="Shelf" name="shelf_location" value={form.shelf_location} onChange={onChange} />
        </div>
      </form>
    </Modal>
  );
}
""".strip())

    write(FE, "src/components/IssueModal.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Save } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import Input from './Input';
import { libraryApi, studentsApi } from '../api/endpoints';

export default function IssueModal({ book, onClose, onSaved }) {
  const today = new Date().toISOString().slice(0, 10);
  const in14 = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);

  const [studentId, setStudentId] = useState('');
  const [dueDate, setDueDate] = useState(in14);
  const [students, setStudents] = useState([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    studentsApi.list().then((d) => setStudents(d || [])).catch(() => setStudents([]));
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    if (!studentId) return toast.error('Pick a student');
    setSaving(true);
    try {
      await libraryApi.issue({ book_id: book.id, student_id: Number(studentId), due_date: dueDate });
      toast.success('Book issued');
      onSaved?.();
    } catch (e2) { toast.error(e2.message); }
    finally { setSaving(false); }
  };

  return (
    <Modal open onClose={onClose} title={`Issue — ${book.title}`}
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button onClick={submit} loading={saving} icon={Save}>Issue</Button>
      </>}>
      <form onSubmit={submit} className="space-y-3">
        <div>
          <label className="label">Student *</label>
          <select className="input" value={studentId} onChange={(e) => setStudentId(e.target.value)}>
            <option value="">Select student</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.student_name} ({s.admission_number})</option>
            ))}
          </select>
        </div>
        <Input label="Due date" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        <div className="text-xs text-slate-500">Fine: 5/day after due date</div>
      </form>
    </Modal>
  );
}
""".strip())

    write(FE, "src/pages/Library.jsx", r"""
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import {
  Library as LibraryIcon, Plus, Pencil, Trash2, BookOpen, Undo2,
} from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Input from '../components/Input';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import ConfirmDelete from '../components/ConfirmDelete';
import BookModal from '../components/BookModal';
import IssueModal from '../components/IssueModal';
import { libraryApi } from '../api/endpoints';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { id: 'books', label: 'Books', icon: BookOpen },
  { id: 'issues', label: 'Issued', icon: Undo2 },
];

export default function Library() {
  const { user } = useAuth();
  const canWrite = ['admin', 'teacher'].includes(user?.role);
  const isAdmin = user?.role === 'admin';

  const [tab, setTab] = useState('books');
  const [books, setBooks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [bookModal, setBookModal] = useState(null);
  const [issueTarget, setIssueTarget] = useState(null);
  const [confirm, setConfirm] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, i] = await Promise.all([
        libraryApi.books(q ? { q } : {}),
        libraryApi.issues({}),
      ]);
      setBooks(b || []);
      setIssues(i || []);
    } catch (e) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(load, [tab]);

  useEffect(() => {
    const t = setTimeout(() => { if (tab === 'books') load(); }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const handleDelete = async () => {
    try {
      if (confirm.type === 'book') await libraryApi.removeBook(confirm.id);
      toast.success('Removed');
      setConfirm(null);
      await load();
    } catch (e) { toast.error(e.message); }
  };

  const returnBook = async (issue) => {
    try {
      const res = await libraryApi.returnBook(issue.id);
      toast.success(res?.message || 'Returned');
      await load();
    } catch (e) { toast.error(e.message); }
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold flex items-center gap-2">
            <LibraryIcon className="w-4 h-4 text-brand-600" /> Library
          </h3>
          {canWrite && tab === 'books' && (
            <Button size="sm" icon={Plus} onClick={() => setBookModal({ mode: 'create' })}>
              Add Book
            </Button>
          )}
        </div>

        <div className="flex gap-1 border-b border-slate-200 dark:border-slate-800 mb-3">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`px-3 py-2 text-sm font-medium flex items-center gap-1.5 border-b-2 -mb-px transition ${
                tab === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}>
              <Icon className="w-3.5 h-3.5" /> {label}
            </button>
          ))}
        </div>

        {tab === 'books' && (
          <>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, author, ISBN…" />
            <div className="mt-3">
              {loading ? <Loader /> : books.length === 0 ? (
                <Empty title="No books" hint={canWrite ? 'Add one to start' : null} />
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                  {books.map((b) => (
                    <div key={b.id} className="relative group rounded-xl border border-slate-200 dark:border-slate-700 p-3">
                      <div className="font-medium text-sm pr-16">{b.title}</div>
                      <div className="text-xs text-slate-500 mt-0.5">{b.author || '—'}</div>
                      <div className="text-xs mt-1 flex items-center gap-2">
                        <span className={b.available_copies > 0
                          ? 'text-green-600 font-medium'
                          : 'text-red-600 font-medium'}>
                          {b.available_copies}/{b.total_copies} available
                        </span>
                      </div>
                      {canWrite && (
                        <div className="absolute right-2 top-2 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                          <button onClick={() => setIssueTarget(b)}
                            className="p-1 rounded bg-white dark:bg-slate-800 text-brand-600 text-xs"
                            disabled={b.available_copies < 1}>
                            Issue
                          </button>
                          <button onClick={() => setBookModal({ mode: 'edit', data: b })}
                            className="p-1 rounded bg-white dark:bg-slate-800 text-slate-600">
                            <Pencil className="w-3 h-3" />
                          </button>
                          {isAdmin && (
                            <button onClick={() => setConfirm({ type: 'book', id: b.id, name: b.title })}
                              className="p-1 rounded bg-white dark:bg-slate-800 text-red-600">
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'issues' && (
          <>
            {loading ? <Loader /> : issues.length === 0 ? (
              <Empty title="No issues yet" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-left p-3">Book</th>
                      <th className="text-left p-3">Student</th>
                      <th className="text-left p-3">Issued</th>
                      <th className="text-left p-3">Due</th>
                      <th className="text-left p-3">Returned</th>
                      <th className="text-center p-3">Status</th>
                      <th className="text-right p-3">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {issues.map((i) => {
                      const overdue = i.status === 'issued' && i.due_date < new Date().toISOString().slice(0, 10);
                      return (
                        <tr key={i.id}>
                          <td className="p-3">{i.book_title}</td>
                          <td className="p-3">
                            <div>{i.student_name}</div>
                            <div className="text-xs text-slate-500">{i.admission_number}</div>
                          </td>
                          <td className="p-3 font-mono text-xs">{i.issue_date}</td>
                          <td className={`p-3 font-mono text-xs ${overdue ? 'text-red-600 font-bold' : ''}`}>{i.due_date}</td>
                          <td className="p-3 font-mono text-xs">{i.return_date || '—'}</td>
                          <td className="p-3 text-center">
                            <span className={`badge ${i.status === 'returned' ? 'badge-gray' : overdue ? 'bg-red-100 text-red-700' : 'badge-blue'}`}>
                              {i.status === 'issued' && overdue ? 'overdue' : i.status}
                            </span>
                          </td>
                          <td className="p-3 text-right">
                            {canWrite && i.status === 'issued' && (
                              <button onClick={() => returnBook(i)}
                                className="text-xs text-brand-600 font-medium">
                                Return
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </Card>

      {bookModal && (
        <BookModal initial={bookModal.data}
          onClose={() => setBookModal(null)}
          onSaved={async () => { setBookModal(null); await load(); }} />
      )}

      {issueTarget && (
        <IssueModal book={issueTarget}
          onClose={() => setIssueTarget(null)}
          onSaved={async () => { setIssueTarget(null); await load(); }} />
      )}

      <ConfirmDelete open={!!confirm} title="Remove book?"
        message={`${confirm?.name || ''}`}
        onClose={() => setConfirm(null)} onConfirm={handleDelete} />
    </div>
  );
}
""".strip())


# ════════════════════════════════════════════════════════════
# FRONTEND — REPORT CARD
# ════════════════════════════════════════════════════════════

def gen_report_frontend():
    banner("Report card UI")

    write(FE, "src/pages/ReportCard.jsx", r"""
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Printer, FileText, User, Calendar, DollarSign } from 'lucide-react';
import Card from '../components/Card';
import Button from '../components/Button';
import Loader from '../components/Loader';
import Empty from '../components/Empty';
import { reportsApi } from '../api/endpoints';

export default function ReportCard() {
  const { studentId } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    reportsApi.reportCard(studentId).then(setData).catch(() => setData(null)).finally(() => setLoading(false));
  }, [studentId]);

  if (loading) return <Loader />;
  if (!data?.student) return <Card><Empty title="Student not found" /></Card>;

  const s = data.student;
  const a = data.attendance || {};
  const f = data.fees || {};

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex justify-between items-center print:hidden">
        <button onClick={() => nav(-1)} className="text-sm text-slate-500 hover:text-slate-800 flex items-center gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <Button icon={Printer} onClick={() => window.print()}>Print / Save PDF</Button>
      </div>

      <Card className="p-6 print:shadow-none print:border-0">
        <div className="text-center border-b border-slate-200 dark:border-slate-700 pb-4">
          <h1 className="text-2xl font-bold">School Management</h1>
          <p className="text-sm text-slate-500">Student Report Card</p>
        </div>

        {/* Student info */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 text-sm">
          <div className="space-y-1">
            <div><span className="text-slate-500">Name:</span> <b>{s.name}</b></div>
            <div><span className="text-slate-500">Admission #:</span> {s.admission_number}</div>
            <div><span className="text-slate-500">Roll #:</span> {s.roll_number || '—'}</div>
          </div>
          <div className="space-y-1">
            <div><span className="text-slate-500">Class:</span> {s.class_name || '—'}</div>
            <div><span className="text-slate-500">Section:</span> {s.section_name || '—'}</div>
            <div><span className="text-slate-500">Guardian:</span> {s.guardian_name || '—'}</div>
          </div>
        </div>

        {/* Attendance */}
        <h2 className="text-base font-semibold mt-6 mb-2 flex items-center gap-2">
          <Calendar className="w-4 h-4" /> Attendance
        </h2>
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
          <Cell label="Present" value={a.present_days || 0} />
          <Cell label="Absent"  value={a.absent_days || 0} />
          <Cell label="Late"    value={a.late_days || 0} />
          <Cell label="Excused" value={a.excused_days || 0} />
          <Cell label="Rate" value={`${a.attendance_percentage || 0}%`} strong />
        </div>

        {/* Exams */}
        <h2 className="text-base font-semibold mt-6 mb-2 flex items-center gap-2">
          <FileText className="w-4 h-4" /> Exam Results
        </h2>
        {!data.exams?.length ? (
          <div className="text-sm text-slate-500 italic">No exams recorded yet.</div>
        ) : (
          <div className="space-y-4">
            {data.exams.map((exam, i) => (
              <div key={i}>
                <div className="font-medium text-sm mb-1">
                  {exam.exam_name}
                  {exam.start_date && <span className="text-xs text-slate-500 ml-2">({exam.start_date})</span>}
                </div>
                <table className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded overflow-hidden">
                  <thead className="bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="text-left p-2">Subject</th>
                      <th className="text-right p-2">Obtained</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-right p-2">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
                    {exam.marks.map((m, j) => (
                      <tr key={j}>
                        <td className="p-2">{m.subject}</td>
                        <td className="p-2 text-right">{m.obtained}</td>
                        <td className="p-2 text-right">{m.total}</td>
                        <td className={`p-2 text-right font-medium ${
                          m.percentage >= 80 ? 'text-green-600' :
                          m.percentage >= 50 ? 'text-amber-600' : 'text-red-600'
                        }`}>{m.percentage}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}

        {/* Fees */}
        <h2 className="text-base font-semibold mt-6 mb-2 flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Fees
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <Cell label="Billed" value={(f.total_billed || 0).toFixed(2)} />
          <Cell label="Paid" value={(f.total_paid || 0).toFixed(2)} tone="green" />
          <Cell label="Balance" value={(f.pending || 0).toFixed(2)} tone={f.pending > 0 ? 'amber' : 'green'} />
        </div>

        {/* Footer */}
        <div className="mt-8 pt-4 border-t border-slate-200 dark:border-slate-700 flex justify-between text-xs text-slate-400">
          <span>Generated {new Date(data.generated_at).toLocaleString()}</span>
          <span>{s.class_name} · {s.section_name}</span>
        </div>
      </Card>
    </div>
  );
}

function Cell({ label, value, tone = 'slate', strong = false }) {
  const map = {
    slate: 'bg-slate-50 dark:bg-slate-800',
    green: 'bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300',
    amber: 'bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300',
  };
  return (
    <div className={`p-3 rounded-xl ${map[tone]}`}>
      <div className="text-xs uppercase text-slate-500">{label}</div>
      <div className={`text-lg ${strong ? 'font-bold' : 'font-medium'}`}>{value}</div>
    </div>
  );
}
""".strip())


# ════════════════════════════════════════════════════════════
# FRONTEND — DASHBOARD DRILL-DOWN
# ════════════════════════════════════════════════════════════

def gen_dashboard_frontend():
    banner("Dashboard drill-down")

    write(FE, "src/pages/Dashboard.jsx", r"""
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users, GraduationCap, School, CalendarCheck, DollarSign, ClipboardList,
  BookOpen, Bell, TrendingUp, AlertCircle, CheckCircle2,
} from 'lucide-react';
import Card from '../components/Card';
import Loader from '../components/Loader';
import {
  classesApi, reportsApi, feesApi, noticesApi, attendanceApi,
} from '../api/endpoints';

export default function Dashboard() {
  const nav = useNavigate();
  const [classes, setClasses] = useState([]);
  const [stats, setStats] = useState(null);
  const [feeSummary, setFeeSummary] = useState(null);
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [inbox, setInbox] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      classesApi.list().catch(() => []),
      reportsApi.dashboard().catch(() => null),
      feesApi.summary().catch(() => null),
      noticesApi.inbox().catch(() => null),
    ]).then(([c, s, f, n]) => {
      setClasses(Array.isArray(c) ? c : []);
      setStats(s);
      setFeeSummary(f);
      setInbox(n);
      setTodayAttendance(s?.attendanceToday);
    }).finally(() => setLoading(false));
  }, []);

  const tiles = [
    { label: 'Students',     value: stats?.students ?? '—',    icon: Users,        to: '/students',   color: 'from-green-500' },
    { label: 'Teachers',     value: stats?.teachers ?? '—',    icon: GraduationCap,to: '/teachers',   color: 'from-amber-500' },
    { label: 'Classes',      value: stats?.classes ?? '—',     icon: School,       to: '/classes',    color: 'from-blue-500' },
    { label: 'Sections',     value: stats?.sections ?? '—',    icon: School,       to: '/classes',    color: 'from-purple-500' },
    { label: 'Attendance',   value: todayAttendance?.total ?? '—', icon: CalendarCheck, to: '/attendance', color: 'from-red-500' },
    { label: 'Homework',     value: 'Open',                    icon: ClipboardList,to: '/homework',   color: 'from-teal-500' },
    { label: 'Timetable',    value: 'Open',                    icon: BookOpen,     to: '/timetable',  color: 'from-indigo-500' },
    { label: 'Notices',      value: inbox?.unread_count ?? 0,  icon: Bell,         to: '/notices',    color: 'from-pink-500' },
  ];

  if (loading) return <Loader />;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* ─── Stat tiles ─── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {tiles.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.label}
              onClick={() => nav(t.to)}
              className="group relative overflow-hidden text-left p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:shadow-lg hover:-translate-y-0.5 transition"
            >
              <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${t.color} to-transparent opacity-70`} />
              <div className="flex items-center justify-between">
                <Icon className="w-5 h-5 text-brand-600" />
                <span className="text-2xl font-bold">{t.value}</span>
              </div>
              <div className="mt-2 text-sm text-slate-500">{t.label}</div>
            </button>
          );
        })}
      </div>

      {/* ─── Attendance snapshot ─── */}
      {todayAttendance && todayAttendance.total > 0 && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-brand-600" /> Today's Attendance
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300">
              <div className="text-xs uppercase flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Present
              </div>
              <div className="text-2xl font-bold">{todayAttendance.present || 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-300">
              <div className="text-xs uppercase flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Absent
              </div>
              <div className="text-2xl font-bold">{todayAttendance.absent || 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="text-xs uppercase">Total Marked</div>
              <div className="text-2xl font-bold">{todayAttendance.total || 0}</div>
            </div>
          </div>
        </Card>
      )}

      {/* ─── Fee snapshot ─── */}
      {feeSummary && (
        <Card className="p-5">
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-brand-600" /> Fees Overview
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800">
              <div className="text-xs uppercase text-slate-500">Invoices</div>
              <div className="text-lg font-bold">{feeSummary.total_invoices || 0}</div>
            </div>
            <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-500/10 text-blue-700 dark:text-blue-300">
              <div className="text-xs uppercase">Billed</div>
              <div className="text-lg font-bold">{Number(feeSummary.total_billed || 0).toFixed(0)}</div>
            </div>
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-500/10 text-green-700 dark:text-green-300">
              <div className="text-xs uppercase">Collected</div>
              <div className="text-lg font-bold">{Number(feeSummary.total_paid || 0).toFixed(0)}</div>
            </div>
            <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-300">
              <div className="text-xs uppercase">Pending</div>
              <div className="text-lg font-bold">
                {Number((feeSummary.total_billed || 0) - (feeSummary.total_paid || 0)).toFixed(0)}
              </div>
            </div>
          </div>
          <button onClick={() => nav('/fees')} className="text-xs text-brand-600 hover:underline mt-3">
            Manage fees →
          </button>
        </Card>
      )}

      {/* ─── Classes grid ─── */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">Classes</h3>
          <button onClick={() => nav('/classes')} className="text-xs text-brand-600 hover:underline">
            View all →
          </button>
        </div>
        {classes.length === 0 ? (
          <div className="text-sm text-slate-500">No classes yet</div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {classes.map((c) => (
              <button
                key={c.id}
                onClick={() => nav(`/classes/${c.id}`)}
                className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-left transition"
              >
                <div className="font-medium">{c.class_name}</div>
                <div className="text-xs text-slate-500">
                  {c.section_count} sections · {c.student_count} students
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
""".strip())


# ════════════════════════════════════════════════════════════
# FRONTEND — BELL IN TOPBAR
# ════════════════════════════════════════════════════════════

def gen_bell_topbar():
    banner("Topbar bell")

    write(FE, "src/components/NoticeBell.jsx", r"""
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { noticesApi } from '../api/endpoints';

export default function NoticeBell() {
  const nav = useNavigate();
  const [data, setData] = useState({ notices: [], unread_count: 0 });
  const [open, setOpen] = useState(false);
  const ref = useRef();

  const load = () => {
    noticesApi.inbox({ unread: true }).then(setData).catch(() => {});
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onDoc = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const count = data?.unread_count || 0;

  const openNotice = async (n) => {
    setOpen(false);
    await noticesApi.markRead(n.id).catch(() => {});
    nav(`/notices/${n.id}`);
    setTimeout(load, 400);
  };

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen(!open)}
        className="relative p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
        title="Notices">
        <Bell className="w-4 h-4" />
        {count > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full
                           bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-1 w-80 bg-white dark:bg-slate-900
                        border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg
                        max-h-96 overflow-auto z-40">
          <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-800 text-xs font-medium text-slate-500">
            {count > 0 ? `${count} unread notice${count === 1 ? '' : 's'}` : 'No unread notices'}
          </div>
          {data?.notices?.length === 0 ? (
            <div className="p-4 text-sm text-slate-500 text-center">All caught up ✓</div>
          ) : (
            data.notices.map((n) => (
              <button key={n.id} onClick={() => openNotice(n)}
                className="w-full text-left px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800 border-b border-slate-50 dark:border-slate-800 last:border-0">
                <div className="font-medium text-sm line-clamp-1">{n.title}</div>
                <div className="text-xs text-slate-500 line-clamp-2 mt-0.5">{n.content}</div>
                <div className="text-[10px] text-slate-400 mt-1">
                  {n.posted_by_name || '—'} · {n.posted_at?.slice(0, 16)}
                </div>
              </button>
            ))
          )}
          <button onClick={() => { setOpen(false); nav('/notices'); }}
            className="w-full text-center text-xs text-brand-600 hover:underline py-2 border-t border-slate-100 dark:border-slate-800">
            View all notices →
          </button>
        </div>
      )}
    </div>
  );
}
""".strip())

    # Patch Topbar to include the bell
    p = FE / "src/components/Topbar.jsx"
    if not p.exists():
        print("  ! Topbar.jsx missing")
        return
    src = p.read_text()

    if "NoticeBell" not in src:
        src = src.replace(
            "import SearchCombobox from './SearchCombobox';",
            "import SearchCombobox from './SearchCombobox';\nimport NoticeBell from './NoticeBell';",
            1,
        )
        # insert Bell before theme toggle
        anchor = '<button onClick={toggle}'
        idx = src.find(anchor)
        if idx != -1:
            src = src[:idx] + "<NoticeBell />\n      " + src[idx:]
            p.write_text(src)
            print("  ✓ patched Topbar.jsx with NoticeBell")
        else:
            print("  ! couldn't find theme toggle anchor in Topbar")
    else:
        print("  · Topbar already has NoticeBell")


# ════════════════════════════════════════════════════════════
# FRONTEND — ROUTES PATCH
# ════════════════════════════════════════════════════════════

def gen_routes_patch():
    banner("App routes")

    p = FE / "src/App.jsx"
    if not p.exists():
        print("  ! App.jsx missing")
        return
    src = p.read_text()

    added = []

    if "ReportCard" not in src:
        src = src.replace(
            "import Fees from './pages/Fees';",
            "import Fees from './pages/Fees';\nimport ReportCard from './pages/ReportCard';",
            1,
        )
        src = src.replace(
            '<Route path="fees" element={<Fees />} />',
            '<Route path="fees" element={<Fees />} />\n'
            '              <Route path="students/:studentId/report-card" element={<ReportCard />} />',
            1,
        )
        added.append("ReportCard")

    p.write_text(src)
    if added:
        print(f"  ✓ added routes: {', '.join(added)}")
    else:
        print("  · routes already present")


def verify():
    banner("verify")
    import subprocess
    files = [
        BE / "models/feeModel.js",
        BE / "controllers/feeController.js",
        BE / "routes/fees.js",
        BE / "models/libraryModel.js",
        BE / "controllers/libraryController.js",
        BE / "routes/library.js",
        BE / "controllers/reportController.js",
        BE / "routes/reports.js",
    ]
    ok = True
    for f in files:
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            ok = False
    return ok


def main():
    print(f"Final modules — root: {ROOT}")
    gen_fees_backend()
    gen_library_backend()
    gen_report_backend()
    gen_frontend_api()
    gen_fees_frontend()
    gen_library_frontend()
    gen_report_frontend()
    gen_dashboard_frontend()
    gen_bell_topbar()
    gen_routes_patch()
    print()
    if not verify():
        sys.exit(1)
    print("\n" + "═" * 62)
    print("✅ Final modules generated.")
    print("═" * 62)
    print("\nRestart:")
    print("  ~/school/start.sh --stop")
    print("  ~/school/start.sh")
    print("\nUI:")
    print("  /fees                invoices + payments + summary")
    print("  /library             books + issue/return")
    print("  /students/:id/report-card   printable PDF")
    print("  /dashboard           clickable tiles + snapshots")
    print("  Topbar               bell with unread notice badge")


if __name__ == "__main__":
    main()
