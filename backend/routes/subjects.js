const express = require('express');
const router = express.Router();
const { all } = require('../config/database');
const { authenticate } = require('../middleware/auth');

router.get('/', authenticate, async (req, res, next) => {
    try {
        const rows = await all(
            `SELECT s.id, s.subject_name, s.subject_code, s.class_id,
                    c.class_name
             FROM subjects s
             LEFT JOIN classes c ON c.id = s.class_id
             ORDER BY c.class_name, s.subject_name`
        );
        res.json({ success: true, message: 'Subjects', data: rows });
    } catch (e) { next(e); }
});

module.exports = router;
