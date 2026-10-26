const { run, get, all } = require('../config/database');

// Money helpers: API uses PKR (decimal), DB stores cents (integer)
const toCents = (v) => (v == null ? 0 : Math.round(Number(v) * 100));
const toPkr   = (c) => (c == null ? 0 : c / 100);

const FeeModel = {
  // ─── Invoices ───
  listInvoices: (filters = {}) => {
    let sql = `
      SELECT i.*,
             u.name AS student_name, s.admission_number, s.roll_number,
             sec.section_name, c.class_name,
             (SELECT COALESCE(SUM(p.amount_paid_cents), 0)
                FROM payments p WHERE p.invoice_id = i.id) AS paid_cents
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

    return all(sql, params).then((rows) =>
      rows.map((r) => ({
        ...r,
        amount:       toPkr(r.amount_cents),
        total_amount: toPkr(r.total_cents),
        paid_amount:  toPkr(r.paid_cents),
        balance:      toPkr((r.total_cents || 0) - (r.paid_cents || 0)),
      }))
    );
  },

  findInvoice: (id) =>
    get(
      `SELECT i.*,
              u.name AS student_name, s.admission_number, s.roll_number,
              sec.section_name, c.class_name,
              (SELECT COALESCE(SUM(p.amount_paid_cents), 0)
                 FROM payments p WHERE p.invoice_id = i.id) AS paid_cents
       FROM invoices i
       JOIN students s ON i.student_id = s.id
       JOIN users u ON s.user_id = u.id
       LEFT JOIN sections sec ON s.section_id = sec.id
       LEFT JOIN classes c ON sec.class_id = c.id
       WHERE i.id = ?`,
      [id]
    ).then((r) => r ? {
      ...r,
      amount:       toPkr(r.amount_cents),
      total_amount: toPkr(r.total_cents),
      paid_amount:  toPkr(r.paid_cents),
      balance:      toPkr((r.total_cents || 0) - (r.paid_cents || 0)),
    } : null),

  // Accepts `amount` in PKR, stores in cents
  createInvoice: ({ student_id, amount, due_date = null, status = 'unpaid',
                    invoice_number = null, description = null }) =>
    run(
      `INSERT INTO invoices
         (student_id, invoice_number, amount_cents, total_cents, due_date, status)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [student_id, invoice_number, toCents(amount), toCents(amount), due_date, status]
    ),

  // Accepts `amount` / `total_amount` in PKR, stores in cents
  updateInvoice: (id, patch) => {
    const clean = { ...patch };
    if (clean.amount != null)       { clean.amount_cents = toCents(clean.amount); delete clean.amount; }
    if (clean.total_amount != null) { clean.total_cents  = toCents(clean.total_amount); delete clean.total_amount; }

    const allowed = ['amount_cents', 'total_cents', 'due_date', 'status', 'invoice_number'];
    const keys = allowed.filter((k) => k in clean);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE invoices SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => clean[k]), id]);
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
    ).then((rows) => rows.map((r) => ({
      ...r,
      amount_paid: toPkr(r.amount_paid_cents),
    }))),

  // Accepts `amount_paid` in PKR, stores in cents
  recordPayment: ({ invoice_id, amount_paid, payment_method, paid_by, notes = null }) =>
    run(
      `INSERT INTO payments
         (invoice_id, amount_paid_cents, payment_method, paid_by, notes)
       VALUES (?, ?, ?, ?, ?)`,
      [invoice_id, toCents(amount_paid), payment_method, paid_by, notes]
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

  // ─── Summary (returns PKR) ───
  summary: () =>
    get(
      `SELECT
         COUNT(*) AS total_invoices,
         SUM(CASE WHEN status='paid' THEN 1 ELSE 0 END) AS paid_count,
         SUM(CASE WHEN status='unpaid' THEN 1 ELSE 0 END) AS unpaid_count,
         SUM(CASE WHEN status='partial' THEN 1 ELSE 0 END) AS partial_count,
         COALESCE(SUM(total_cents), 0) AS total_billed_cents,
         COALESCE((SELECT SUM(amount_paid_cents) FROM payments), 0) AS total_paid_cents
       FROM invoices`
    ).then((r) => ({
      ...r,
      total_billed: toPkr(r.total_billed_cents),
      total_paid:   toPkr(r.total_paid_cents),
      balance:      toPkr((r.total_billed_cents || 0) - (r.total_paid_cents || 0)),
    })),
};

module.exports = FeeModel;
