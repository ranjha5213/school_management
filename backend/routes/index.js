const express = require('express');
const router = express.Router();

router.use('/auth',       require('./auth'));
router.use('/students',   require('./students'));
router.use('/teachers',   require('./teachers'));
router.use('/classes',    require('./classes'));
router.use('/attendance', require('./attendance'));
router.use('/exams',      require('./exams'));
router.use('/homework',   require('./homework'));
router.use('/fees',       require('./fees'));
router.use('/library',    require('./library'));
router.use('/notices',    require('./notices'));
router.use('/timetable',  require('./timetable'));
router.use('/reports',    require('./reports'));
router.use('/audit',      require('./audit'));
router.use('/parent',     require('./parent'));
router.use('/search',     require('./search'));

router.use('/mcq',          require('./mcq'));
router.use('/users',        require('./users'));
router.use('/settings',     require('./settings'));
router.use('/materials',    require('./materials'));

module.exports = router;
