const Document = require('../models/documentModel');
const path = require('path');
const fs = require('fs');

exports.listDocuments = (req, res) => {
  const user = req.user;

  // Students can only see their own documents
  if (user.role === 'student') {
    Document.findByUser(user.id, (err, rows) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      res.json(rows || []);
    });
  } else {
    // Admins, and authorized teachers/accountants see all
    Document.findAll((err, rows) => {
      if (err) return res.status(500).json({ success: false, message: 'Database error' });
      res.json(rows || []);
    });
  }
};

exports.uploadDocument = (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const { title } = req.body;
  const payload = {
    title: title?.trim() || req.file.originalname,
    file_name: req.file.filename,
    file_path: req.file.path,
    file_size: req.file.size,
    uploaded_by: req.user.id
  };

  Document.create(payload, (err, documentId) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Failed to save document record.' });
    }
    res.status(201).json({ 
      success: true, 
      message: 'Document uploaded successfully.',
      documentId 
    });
  });
};

exports.downloadDocument = (req, res) => {
  const docId = req.params.id;
  const user = req.user;

  Document.findById(docId, (err, doc) => {
    if (err || !doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    // Students can only download their own documents
    if (user.role === 'student' && doc.uploaded_by !== user.id) {
      return res.status(403).json({ success: false, message: 'Access denied.' });
    }

    const absolutePath = path.resolve(doc.file_path);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ success: false, message: 'File missing from server storage.' });
    }

    res.download(absolutePath, doc.file_name);
  });
};

exports.deleteDocument = (req, res) => {
  const docId = req.params.id;

  Document.findById(docId, (err, doc) => {
    if (err || !doc) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    // Remove physical file from disk
    const absolutePath = path.resolve(doc.file_path);
    if (fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
      } catch (e) {
        console.error('Failed to unlink file:', e);
      }
    }

    Document.remove(docId, (err) => {
      if (err) {
        return res.status(500).json({ success: false, message: 'Failed to delete document record.' });
      }
      res.json({ success: true, message: 'Document deleted successfully.' });
    });
  });
};

