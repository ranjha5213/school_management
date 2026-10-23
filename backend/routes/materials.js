const express = require('express');
const c = require('../controllers/materialController');
const { authenticate, authorize, attachStudentId } = require('../middleware/auth');
const { materialUpload } = require('../middleware/uploadMaterial');

const router = express.Router();
router.use(authenticate);

router.get('/',    authorize('admin', 'teacher', 'student', 'accountant'),
                   attachStudentId, c.listMaterials);
router.get('/my',  authorize('admin', 'teacher'), c.myMaterials);
router.get('/:id', authorize('admin', 'teacher', 'student', 'accountant'),
                   attachStudentId, c.getMaterial);

router.post('/',   authorize('admin', 'teacher'), materialUpload, c.uploadMaterial);
router.delete('/:id', authorize('admin', 'teacher'), c.deleteMaterial);

module.exports = router;
