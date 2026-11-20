const { get, run } = require('../config/database');

const SystemSettingsModel = {
  get: async (key, defaultValue = null) => {
    try {
      console.log('[settings.get] start:', key);
      const row = await get(
        'SELECT setting_value, setting_type FROM system_settings WHERE setting_key = ?',
        [key]
      );
      console.log('[settings.get] done:', key, row);

      if (!row) return defaultValue;

      if (row.setting_type === 'json') {
        try {
          return JSON.parse(row.setting_value);
        } catch (e) {
          console.error('[settings.get] JSON parse failed for key:', key, e);
          return defaultValue;
        }
      }

      return row.setting_value;
    } catch (err) {
      console.error('[settings.get] Error fetching setting:', key, err);
      return defaultValue;
    }
  },

  save: async (key, value, type = 'json') => {
    const stringValue = type === 'json' ? JSON.stringify(value) : String(value);

    const query = `
      INSERT INTO system_settings (setting_key, setting_value, setting_type)
      VALUES (?, ?, ?)
      ON CONFLICT(setting_key) DO UPDATE SET
        setting_value = excluded.setting_value,
        setting_type = excluded.setting_type
    `;

    console.log('[settings.save] start:', key);
    const result = await run(query, [key, stringValue, type]);
    console.log('[settings.save] done:', key, result);
    return result;
  },
};

module.exports = SystemSettingsModel;

