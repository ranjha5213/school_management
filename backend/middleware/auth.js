const jwt = require('jsonwebtoken');
const { get } = require('../config/database');

// ─── Authenticate (Fetch fresh user & permissions from DB) ───
const authenticate = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'secret');
    
    // Fetch fresh permissions from DB on every request
    const dbUser = await get(`
      SELECT u.id, u.role, u.name, u.email, t.permissions 
      FROM users u 
      LEFT JOIN teachers t ON u.id = t.user_id 
      WHERE u.id = ?
    `, [decoded.id]);

    if (!dbUser) return res.status(401).json({ success: false, message: 'User not found' });

    req.user = dbUser; // Now req.user has permissions!
    next();
  } catch (err) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// ─── Authorize (Check Roles) ───
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden: Not authorized' });
    }
    next();
  };
};

// ─── Check Permission (Check JSON Permissions for Teachers) ───
const checkPermission = (permissionName) => {
  return (req, res, next) => {
    // 1. Admins bypass all permission checks
    if (req.user.role === 'admin') return next();

    // 2. Teachers must have the specific permission
    if (req.user.role === 'teacher') {
      let perms = {};
      try {
        if (typeof req.user.permissions === 'string') {
          perms = JSON.parse(req.user.permissions);
        } else if (req.user.permissions && typeof req.user.permissions === 'object') {
          perms = req.user.permissions;
        }
      } catch (e) {
        console.error("JSON Parse Error in Permissions:", e);
      }

      if (perms[permissionName] === true) {
        return next();
      }

      return res.status(403).json({ 
        success: false, 
        message: `Forbidden: Missing ${permissionName} permission. Please log out and log back in.` 
      });
    }

    // 3. Other roles (students, accountants) are blocked by default
    return res.status(403).json({ success: false, message: 'Forbidden: Not authorized' });
  };
};

// ─── Attach Student ID (Helper for student routes) ───
// Assuming you had this in your original file, I am adding a basic version.
// If your original one does something else, keep it.
const attachStudentId = async (req, res, next) => {
  try {
    const student = await get(`SELECT id FROM students WHERE user_id = ?`, [req.user.id]);
    if (!student) return res.status(404).json({ success: false, message: 'Student profile not found' });
    req.params.studentId = student.id;
    next();
  } catch (e) {
    next(e);
  }
};

module.exports = {
  authenticate,
  authorize,
  checkPermission,
  attachStudentId
};
