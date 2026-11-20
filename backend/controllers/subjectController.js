// controllers/subjectController.js
const SubjectModel = require('../models/subjectModel');

const SubjectController = {
  // Get all subjects with class names
  list: async (req, res, next) => {
    try {
      const subjects = await SubjectModel.list();
      return res.json({ success: true, message: 'Subjects retrieved successfully', data: subjects });
    } catch (e) {
      next(e);
    }
  },

  // Get a single subject by ID
  getById: async (req, res, next) => {
    try {
      const subject = await SubjectModel.findById(req.params.id);
      if (!subject) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
      }
      return res.json({ success: true, message: 'Subject found', data: subject });
    } catch (e) {
      next(e);
    }
  },

  // Create a new subject
  create: async (req, res, next) => {
    try {
      const { subject_name, subject_code, class_id } = req.body;
      const result = await SubjectModel.create({ subject_name, subject_code, class_id });
      return res.status(201).json({ 
        success: true, 
        message: 'Subject created successfully', 
        data: { id: result.lastID, subject_name, subject_code, class_id } 
      });
    } catch (e) {
      next(e);
    }
  },

  // Update an existing subject
  update: async (req, res, next) => {
    try {
      const result = await SubjectModel.update(req.params.id, req.body);
      if (result.changes === 0) {
        return res.status(404).json({ success: false, message: 'Subject not found or no changes made' });
      }
      return res.json({ success: true, message: 'Subject updated successfully' });
    } catch (e) {
      next(e);
    }
  },

  // Delete a subject
  remove: async (req, res, next) => {
    try {
      const result = await SubjectModel.remove(req.params.id);
      if (result.changes === 0) {
        return res.status(404).json({ success: false, message: 'Subject not found' });
      }
      return res.json({ success: true, message: 'Subject deleted successfully' });
    } catch (e) {
      next(e);
    }
  }
};

module.exports = SubjectController;

