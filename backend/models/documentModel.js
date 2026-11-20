const sqlite3 = require('sqlite3').verbose();
const path = require('path');

// Connect directly to your SQLite database file to ensure `db.all`, `db.run`, and `db.get` are always available
const dbPath = path.join(__dirname, '../school_management.db'); // Adjust filename if your sqlite file has a different name (e.g. school.db)
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database for documents:', err.message);
  }
});

const Document = {
  create: (data, callback) => {
    const query = `
      INSERT INTO documents (title, file_name, file_path, file_size, uploaded_by, created_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `;
    db.run(query, [data.title, data.file_name, data.file_path, data.file_size, data.uploaded_by], function(err) {
      callback(err, this?.lastID);
    });
  },

  findAll: (callback) => {
    const query = `
      SELECT d.*, u.name as uploader_name, u.role as uploader_role 
      FROM documents d 
      LEFT JOIN users u ON d.uploaded_by = u.id
      ORDER BY d.created_at DESC
    `;
    db.all(query, [], callback);
  },

  findByUser: (userId, callback) => {
    const query = `
      SELECT d.*, u.name as uploader_name, u.role as uploader_role 
      FROM documents d 
      LEFT JOIN users u ON d.uploaded_by = u.id
      WHERE d.uploaded_by = ?
      ORDER BY d.created_at DESC
    `;
    db.all(query, [userId], callback);
  },

  findById: (id, callback) => {
    const query = `SELECT * FROM documents WHERE id = ?`;
    db.get(query, [id], callback);
  },

  remove: (id, callback) => {
    const query = `DELETE FROM documents WHERE id = ?`;
    db.run(query, [id], callback);
  }
};

module.exports = Document;

