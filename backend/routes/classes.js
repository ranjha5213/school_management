const express = require('express');
const c = require('../controllers/classController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// Classes
router.get('/', authorize('admin', 'teacher', 'accountant'), c.listClasses);
router.post('/', authorize('admin'), c.createClass);
router.get('/:classId', authorize('admin', 'teacher', 'accountant'), c.getClass);
router.patch('/:classId', authorize('admin'), c.updateClass);
router.delete('/:classId', authorize('admin'), c.deleteClass);

// Sections of a class
router.get('/:classId/sections', authorize('admin', 'teacher', 'accountant'), c.listSections);
router.post('/:classId/sections', authorize('admin'), c.createSection);
router.post('/:classId/sections/bulk', authorize('admin'), c.bulkCreateSections);

// Sections directly
router.patch('/sections/:sectionId', authorize('admin'), c.updateSection);
router.delete('/sections/:sectionId', authorize('admin'), c.deleteSection);
router.post('/sections/:sectionId/students', authorize('admin', 'teacher'), c.addStudentToSection);
router.get('/sections/:sectionId/students', authorize('admin', 'teacher', 'accountant'), c.listStudentsInSection);

module.exports = router;
