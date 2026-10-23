const LibraryModel = require('../models/libraryModel');
const StudentModel = require('../models/studentModel');
const { apiResponse } = require('../utils/helpers');
const logger = require('../utils/logger');

// ─── Books ───
const listBooks = async (req, res, next) => {
  try { return apiResponse(res, 200, true, 'Books', await LibraryModel.listBooks({ q: req.query.q })); }
  catch (e) { next(e); }
};

const getBook = async (req, res, next) => {
  try {
    const b = await LibraryModel.findBook(Number(req.params.id));
    if (!b) return apiResponse(res, 404, false, 'Book not found');
    return apiResponse(res, 200, true, 'Book', b);
  } catch (e) { next(e); }
};

const createBook = async (req, res, next) => {
  try {
    const { title, total_copies = 1 } = req.body;
    if (!title || !title.trim()) return apiResponse(res, 400, false, 'title required');
    if (Number(total_copies) < 1) return apiResponse(res, 400, false, 'total_copies must be >= 1');

    const { lastID } = await LibraryModel.createBook({
      ...req.body, title: title.trim(), total_copies: Number(total_copies),
    });
    logger.audit(`Book added: "${title}" (id=${lastID})`);
    return apiResponse(res, 201, true, 'Book added', { id: lastID });
  } catch (e) { next(e); }
};

const updateBook = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = await LibraryModel.findBook(id);
    if (!b) return apiResponse(res, 404, false, 'Book not found');
    await LibraryModel.updateBook(id, req.body);
    return apiResponse(res, 200, true, 'Book updated');
  } catch (e) { next(e); }
};

const deleteBook = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const b = await LibraryModel.findBook(id);
    if (!b) return apiResponse(res, 404, false, 'Book not found');

    // check for open issues
    const open = await LibraryModel.listIssues({ book_id: id, status: 'issued' });
    if (open.length) return apiResponse(res, 409, false,
      `${open.length} copy/copies still issued — return them first`);

    await LibraryModel.removeBook(id);
    logger.audit(`Book removed: ${b.title} (id=${id})`);
    return apiResponse(res, 200, true, 'Book removed');
  } catch (e) { next(e); }
};

// ─── Issues ───
const listIssues = async (req, res, next) => {
  try {
    const rows = await LibraryModel.listIssues({
      status: req.query.status,
      student_id: req.query.student_id ? Number(req.query.student_id) : undefined,
      book_id: req.query.book_id ? Number(req.query.book_id) : undefined,
    });
    return apiResponse(res, 200, true, 'Issues', rows);
  } catch (e) { next(e); }
};

const issueBook = async (req, res, next) => {
  try {
    const { book_id, student_id, due_date } = req.body;
    if (!book_id) return apiResponse(res, 400, false, 'book_id required');
    if (!student_id) return apiResponse(res, 400, false, 'student_id required');
    if (!due_date) return apiResponse(res, 400, false, 'due_date required');

    const book = await LibraryModel.findBook(Number(book_id));
    if (!book) return apiResponse(res, 404, false, 'Book not found');
    if (book.available_copies < 1)
      return apiResponse(res, 409, false, 'No copies available');

    const student = await StudentModel.findById(Number(student_id));
    if (!student) return apiResponse(res, 404, false, 'Student not found');

    const issue_date = new Date().toISOString().slice(0, 10);
    const { lastID } = await LibraryModel.issueBook({
      book_id: Number(book_id),
      student_id: Number(student_id),
      issue_date,
      due_date,
    });
    await LibraryModel.decrementAvailable(Number(book_id));

    logger.audit(`Book issued: "${book.title}" to ${student.name}`);
    return apiResponse(res, 201, true, 'Book issued', { id: lastID });
  } catch (e) { next(e); }
};

const returnBook = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const issue = await LibraryModel.findIssue(id);
    if (!issue) return apiResponse(res, 404, false, 'Issue not found');
    if (issue.status === 'returned') return apiResponse(res, 400, false, 'Already returned');

    const return_date = req.body.return_date || new Date().toISOString().slice(0, 10);

    // Simple fine: 5 per day overdue
    const due = new Date(issue.due_date);
    const ret = new Date(return_date);
    const overdue_days = Math.max(0, Math.floor((ret - due) / 86400000));
    const fine = overdue_days * 5;

    await LibraryModel.returnBook({ id, return_date, fine_amount: fine });
    await LibraryModel.incrementAvailable(issue.book_id);

    logger.audit(`Book returned: issue ${id}, ${overdue_days} day(s) overdue, fine ${fine}`);
    return apiResponse(res, 200, true,
      `Book returned${overdue_days ? ` (${overdue_days} day(s) late, fine ${fine})` : ''}`,
      { overdue_days, fine_amount: fine });
  } catch (e) { next(e); }
};

module.exports = { listBooks, getBook, createBook, updateBook, deleteBook,
                   listIssues, issueBook, returnBook };
