const SettingsModel = require('../models/systemSettingsModel');

exports.getSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const value = await SettingsModel.get(key, null); // 👈 added await
    res.json(value);
  } catch (err) {
    next(err);
  }
};

exports.saveSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const dataType = (typeof value === 'object' && value !== null) ? 'json' : 'string';
    await SettingsModel.save(key, value, dataType); // 👈 added await
    res.json({ success: true, data: value });
  } catch (err) {
    next(err);
  }
};

exports.getPublicSettings = async (req, res, next) => {
  try {
    res.json({ success: true, data: {} });
  } catch (err) {
    next(err);
  }
};

exports.getAllSettings = async (req, res, next) => {
  try {
    res.json({ success: true, data: [] });
  } catch (err) {
    next(err);
  }
};

exports.updateSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const dataType = (typeof value === 'object' && value !== null) ? 'json' : 'string';
    await SettingsModel.save(key, value, dataType);
    res.json({ success: true, data: value });
  } catch (err) {
    next(err);
  }
};

