// routes/donationLedgerRoutes.js
const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/donationLedgerController');

// Optional: uncomment if you want JWT auth from middleware/auth.js
// const { authenticate } = require('../middleware/auth');
// router.use(authenticate);

router.use(ctrl.init);

router.get('/ledger', ctrl.getLedger);
router.post('/ledger', ctrl.createLedgerEntry);
router.post('/donations', ctrl.createDonation);
router.get('/donations/:id/receipt.pdf', ctrl.downloadDonationReceiptPdf);

module.exports = router;

