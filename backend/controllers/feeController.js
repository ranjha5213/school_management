const FeeModel = require('../models/feeModel');
const StudentModel = require('../models/studentModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');
const realtime = require('../realtime/socket');
const { get } = require('../config/database');

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

    // ─── Notify the student ───
    try {
      const st = await get(`SELECT user_id FROM students WHERE id = ?`, [inv.student_id]);
      if (st?.user_id) {
        realtime.emitToUser(st.user_id, 'fee:payment', {
          invoice_id: Number(invoice_id),
          amount: Number(amount_paid),
          status,
          at: new Date().toISOString(),
        });
      }
    } catch {}

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
