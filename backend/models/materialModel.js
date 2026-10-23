const { run, get, all } = require('../config/database');

const MaterialModel = {
  list: (filters = {}) => {
    let sql = `
      SELECT m.*, u.name AS uploaded_by_name,
             c.class_name, sec.section_name,
             sub.subject_name
        FROM materials m
        LEFT JOIN users    u   ON m.uploaded_by  = u.id
        LEFT JOIN classes  c   ON m.class_id     = c.id
        LEFT JOIN sections sec ON m.section_id   = sec.id
        LEFT JOIN subjects sub ON m.subject_id   = sub.id
    `;
    const where = [];
    const params = [];

    if (filters.kind)       { where.push('m.kind = ?');         params.push(filters.kind); }
    if (filters.class_id)   { where.push('m.class_id = ?');     params.push(filters.class_id); }
    if (filters.section_id) { where.push('m.section_id = ?');   params.push(filters.section_id); }
    if (filters.subject_id) { where.push('m.subject_id = ?');   params.push(filters.subject_id); }
    if (filters.uploaded_by){ where.push('m.uploaded_by = ?');  params.push(filters.uploaded_by); }
    if (filters.q) {
      where.push('(m.title LIKE ? OR m.description LIKE ?)');
      params.push(`%${filters.q}%`, `%${filters.q}%`);
    }
    if (where.length) sql += ' WHERE ' + where.join(' AND ');
    sql += ' ORDER BY m.created_at DESC, m.id DESC LIMIT 300';
    return all(sql, params);
  },

  findById: (id) =>
    get(
      `SELECT m.*, u.name AS uploaded_by_name
         FROM materials m
         LEFT JOIN users u ON m.uploaded_by = u.id
        WHERE m.id = ?`,
      [id]
    ),

  create: ({ title, description = null, kind = 'other',
             class_id = null, section_id = null, subject_id = null,
             file_url, original_name = null, mime_type = null, size_bytes = null,
             uploaded_by }) =>
    run(
      `INSERT INTO materials
         (title, description, kind, class_id, section_id, subject_id,
          file_url, original_name, mime_type, size_bytes, uploaded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [title, description, kind, class_id, section_id, subject_id,
       file_url, original_name, mime_type, size_bytes, uploaded_by]
    ),

  remove: (id) => run(`DELETE FROM materials WHERE id = ?`, [id]),

  canView: (material, user) => {
    if (!material) return false;
    if (user.role === 'admin' || user.role === 'teacher' || user.role === 'accountant') return true;
    // Students: own section only, and only if material is scoped to their section or class
    if (user.role === 'student') {
      if (material.section_id && user.studentSectionId === material.section_id) return true;
      if (material.class_id   && user.studentClassId   === material.class_id)   return true;
      // If material is unscoped (general), allow
      if (!material.section_id && !material.class_id) return true;
    }
    return false;
  },
};

module.exports = MaterialModel;
