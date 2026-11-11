const { get, all, run } = require('../config/database');
const { apiResponse } = require('../utils/helpers');

// ─── Public Settings ───
const getPublicSettings = (_req, res) => {
  return apiResponse(res, 200, true, 'Public settings', {
    school_name: process.env.SCHOOL_NAME || 'School Management',
    school_address: process.env.SCHOOL_ADDRESS || '',
    school_phone: process.env.SCHOOL_PHONE || '',
    school_email: process.env.SCHOOL_EMAIL || '',
    school_logo_url: process.env.SCHOOL_LOGO_URL || null,
  });
};

// ─── Admin Settings ───
const getAllSettings = async (req, res, next) => {
  try {
    // 👇 ALIASING: Map the DB columns to 'key' and 'value' for the frontend
    const rows = await all(`
      SELECT setting_key AS key, setting_value AS value, description 
      FROM system_settings
    `);
    return apiResponse(res, 200, true, 'Settings fetched', rows);
  } catch (e) {
    next(e);
  }
};

const updateSetting = async (req, res, next) => {
  try {
    const { key, value } = req.body;
    
    if (!key) {
      return apiResponse(res, 400, false, 'Setting key is required');
    }

    // 👇 UPSERT using your actual database column names
    await run(
      `INSERT INTO system_settings (setting_key, setting_value) 
       VALUES (?, ?) 
       ON CONFLICT(setting_key) DO UPDATE SET 
         setting_value = excluded.setting_value,
         updated_at = CURRENT_TIMESTAMP`,
      [key, value]
    );

    return apiResponse(res, 200, true, 'Setting updated successfully');
  } catch (e) {
    next(e);
  }
};

module.exports = {
  getPublicSettings,
  getAllSettings,
  updateSetting,
};
