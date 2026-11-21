const express = require('express');
const router = express.Router();
const donationLedgerRoutes = require('./donationLedgerRoutes');

router.use('/attendance', require('./attendance'));
router.use('/audit',      require('./audit'));
router.use('/classes',    require('./classes'));
router.use('/documents',  require('./documents'));
router.use(donationLedgerRoutes);
router.use('/exams',      require('./exams'));
router.use('/fees',       require('./fees'));
router.use('/homework',   require('./homework'));
router.use('/library',    require('./library'));
router.use('/materials',  require('./materials'));
router.use('/mcq',        require('./mcq'));
router.use('/notices',    require('./notices'));
router.use('/parent',     require('./parent'));
router.use('/reports',    require('./reports'));
router.use('/search',     require('./search'));
router.use('/settings',   require('./settings'));
router.use('/students',   require('./students'));
router.use('/subjects',   require('./subjects'));
router.use('/teachers',   require('./teachers'));
router.use('/timetable',  require('./timetable'));
router.use('/users',      require('./users'));
router.use('/auth',       require('./auth'));

module.exports = router;

