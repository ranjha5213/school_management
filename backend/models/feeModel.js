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
