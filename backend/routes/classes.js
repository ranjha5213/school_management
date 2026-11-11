const express = require('express');
const c = require('../controllers/classController');
const { authenticate, authorize, checkPermission } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

// ─── Classes ───
router.get('/', authorize('admin', 'teacher', 'accountant'), c.listClasses);

// 👇 Added checkPermission for Teachers
router.post('/', 
  authorize('admin', 'teacher'), 
  checkPermission('add_class'), 
  c.createClass
);

router.get('/:classId', authorize('admin', 'teacher', 'accountant'), c.getClass);

router.patch('/:classId', 
  authorize('admin', 'teacher'), 
  checkPermission('edit_class'), 
  c.updateClass
);

router.delete('/:classId', 
  authorize('admin', 'teacher'), 
  checkPermission('delete_class'), 
  c.deleteClass
);

// ─── Sections of a class ───
router.get('/:classId/sections', authorize('admin', 'teacher', 'accountant'), c.listSections);

router.post('/:classId/sections', 
  authorize('admin', 'teacher'), 
  checkPermission('add_class'), 
  c.createSection
);

router.post('/:classId/sections/bulk', 
  authorize('admin', 'teacher'), 
  checkPermission('add_class'), 
  c.bulkCreateSections
);

// ─── Sections directly ───
router.patch('/sections/:sectionId', 
  authorize('admin', 'teacher'), 
  checkPermission('edit_class'), 
  c.updateSection
);

router.delete('/sections/:sectionId', 
  authorize('admin', 'teacher'), 
  checkPermission('delete_class'), 
  c.deleteSection
);

router.post('/sections/:sectionId/students', 
  authorize('admin', 'teacher'), 
  checkPermission('add_student'), 
  c.addStudentToSection
);

router.get('/sections/:sectionId/students', authorize('admin', 'teacher', 'accountant'), c.listStudentsInSection);

module.exports = router;
