const express = require('express');
const c = require('../controllers/libraryController');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();
router.use(authenticate);

router.get('/books', c.listBooks);
router.get('/books/:id', c.getBook);
router.post('/books', authorize('admin', 'teacher'), c.createBook);
router.patch('/books/:id', authorize('admin', 'teacher'), c.updateBook);
router.delete('/books/:id', authorize('admin'), c.deleteBook);

router.get('/issues', c.listIssues);
router.post('/issues', authorize('admin', 'teacher'), c.issueBook);
router.patch('/issues/:id/return', authorize('admin', 'teacher'), c.returnBook);

module.exports = router;
