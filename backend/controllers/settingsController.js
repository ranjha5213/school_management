const SettingsModel = require('../models/systemSettingsModel');
const { all } = require('../config/database');

const PUBLIC_SETTINGS_KEYS = [
  'school_name',
  'school_address',
  'school_phone',
  'school_email',
  'school_logo_url',
];

exports.getSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const value = await SettingsModel.get(key, null);
    res.json(value);
  } catch (err) {
    next(err);
  }
};

exports.saveSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    const dataType = (typeof value === 'object' && value !== null) ? 'json' : 'string';
    await SettingsModel.save(key, value, dataType);
    res.json({ success: true, data: value });
  } catch (err) {
    next(err);
  }
};

exports.getPublicSettings = async (req, res, next) => {
  try {
    const entries = await Promise.all(
      PUBLIC_SETTINGS_KEYS.map(async (key) => [key, await SettingsModel.get(key, null)])
    );

    const data = {};
    for (const [key, rawVal] of entries) {
      const val =
        rawVal && typeof rawVal === 'object' && 'value' in rawVal ? rawVal.value : rawVal;
      if (val !== null && val !== undefined && val !== '') {
        data[key] = val;
      }
    }

    if (!data.school_name) {
      data.school_name = 'Jamia Hussania Anwar-ul-Quran';
    }
    if (!data.school_logo_url) {
      data.school_logo_url = '/static/school_logo.jpg';
    }

    res.json({ success: true, data });
  } catch (err) {
    next(err);
  }
};

exports.getAllSettings = async (req, res, next) => {
  try {
    const rows =
      typeof SettingsModel.getAll === 'function'
        ? await SettingsModel.getAll()
        : await all('SELECT setting_key, setting_value, setting_type FROM system_settings ORDER BY setting_key');
    res.json({ success: true, data: rows });
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

