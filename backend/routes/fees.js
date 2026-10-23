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
