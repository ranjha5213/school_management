const { run, get, all } = require('../config/database');

const LibraryModel = {
  listBooks: (filters = {}) => {
    let sql = `SELECT * FROM books WHERE is_active = 1`;
    const params = [];
    if (filters.q) {
      sql += ` AND (title LIKE ? OR author LIKE ? OR isbn LIKE ?)`;
      const like = `%${filters.q}%`;
      params.push(like, like, like);
    }
    sql += ' ORDER BY title';
    return all(sql, params);
  },

  findBook: (id) => get(`SELECT * FROM books WHERE id = ?`, [id]),

  createBook: ({ title, author = null, isbn = null, publisher = null,
                 publication_year = null, total_copies = 1, category = null,
                 shelf_location = null }) =>
    run(
      `INSERT INTO books (title, author, isbn, publisher, publication_year,
                          total_copies, available_copies, category, shelf_location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, author, isbn, publisher, publication_year,
       total_copies, total_copies, category, shelf_location]
    ),

  updateBook: (id, patch) => {
    const allowed = ['title', 'author', 'isbn', 'publisher', 'publication_year',
                     'total_copies', 'available_copies', 'category', 'shelf_location', 'is_active'];
    const keys = allowed.filter((k) => k in patch);
    if (!keys.length) return Promise.resolve({ changes: 0 });
    const sql = `UPDATE books SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`;
    return run(sql, [...keys.map((k) => patch[k]), id]);
  },

  removeBook: (id) => run(`UPDATE books SET is_active = 0 WHERE id = ?`, [id]),

  // ─── Issues ───
  listIssues: (filters = {}) => {
    let sql = `
      SELECT bi.*, b.title AS book_title, b.author,
             u.name AS student_name, s.admission_number, s.roll_number
      FROM book_issues bi
      JOIN books b ON bi.book_id = b.id
      JOIN students s ON bi.student_id = s.id
      JOIN users u ON s.user_id = u.id
    `;
    const where = [];
    const params = [];
    if (filters.status)     { where.push('bi.status = ?');     params.push(filters.status); }
    if (filters.student_id) { where.push('bi.student_id = ?'); params.push(filters.student_id); }
    if (filters.book_id)    { where.push('bi.book_id = ?');    params.push(filters.book_id); }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY bi.issue_date DESC LIMIT 300';
    return all(sql, params);
  },

  issueBook: ({ book_id, student_id, issue_date, due_date }) =>
    run(
      `INSERT INTO book_issues (book_id, student_id, issue_date, due_date, status)
       VALUES (?, ?, ?, ?, 'issued')`,
      [book_id, student_id, issue_date, due_date]
    ),

  returnBook: ({ id, return_date, fine_amount = 0 }) =>
    run(
      `UPDATE book_issues
       SET return_date = ?, status = 'returned', fine_amount = ?
       WHERE id = ?`,
      [return_date, fine_amount, id]
    ),

  findIssue: (id) => get(`SELECT * FROM book_issues WHERE id = ?`, [id]),

  decrementAvailable: (book_id) =>
    run(`UPDATE books SET available_copies = available_copies - 1
         WHERE id = ? AND available_copies > 0`, [book_id]),

  incrementAvailable: (book_id) =>
    run(`UPDATE books SET available_copies = available_copies + 1
         WHERE id = ? AND available_copies < total_copies`, [book_id]),
};

module.exports = LibraryModel;
