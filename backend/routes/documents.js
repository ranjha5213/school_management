const express = require('express');
const router = express.Router();
const documentController = require('../controllers/documentController');
const { authenticate } = require('../middleware/auth');
const upload = require('../middleware/upload'); // Uses your updated multer configuration

// Middleware: Verify if user has permission to view/download documents
const checkDocumentViewPermission = (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  // 1. Admins have full access
  if (user.role === 'admin') return next();

  // 2. Students are allowed to view/download (controller will filter for their own records)
  if (user.role === 'student') return next();

  // 3. Teachers and Accountants require the `view_documents` permission flag
  if (user.role === 'teacher' || user.role === 'accountant') {
    try {
      let perms = user.permissions;
      if (typeof perms === 'string') {
        perms = JSON.parse(perms || '{}');
      }
      if (perms && perms.view_documents) return next();
    } catch (e) {
      console.error("Failed to parse user permissions:", e);
    }
  }

  return res.status(403).json({ 
    success: false, 
    message: 'Access denied. Requires document viewing privileges.' 
  });
};

// Middleware: Verify if user has permission to delete documents
const checkDocumentDeletePermission = (req, res, next) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }

  // 1. Students can never delete
  if (user.role === 'student') {
    return res.status(403).json({ success: false, message: 'Access denied. Students cannot delete documents.' });
  }

  // 2. Admins can delete any document
  if (user.role === 'admin') return next();

  // 3. Teachers and Accountants can delete any document if granted the delete_documents permission flag
  if (user.role === 'teacher' || user.role === 'accountant') {
    try {
      let perms = user.permissions;
      if (typeof perms === 'string') {
        perms = JSON.parse(perms || '{}');
      }
      if (perms && perms.delete_documents) return next();
    } catch (e) {
      console.error("Failed to parse user permissions:", e);
    }
  }

  return res.status(403).json({ success: false, message: 'Access denied. Missing delete document privilege.' });
};

// --- ROUTES ---

// List documents (filtered automatically in controller based on role)
router.get('/', authenticate, checkDocumentViewPermission, documentController.listDocuments);

// Upload a document (allowed for all authenticated users)
router.post('/', authenticate, upload.single('file'), documentController.uploadDocument);

// Download a document (secured with view permission & ownership check)
router.get('/:id/download', authenticate, checkDocumentViewPermission, documentController.downloadDocument);

// Delete a document (secured with admin or staff permission check)
router.delete('/:id', authenticate, checkDocumentDeletePermission, documentController.deleteDocument);

module.exports = router;

