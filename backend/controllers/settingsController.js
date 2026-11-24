// controllers/settingsController.js
const SettingsModel = require('../models/systemSettingsModel');
const { all } = require('../config/database');

const PUBLIC_SETTINGS_KEYS = [
  'school_name',
  'school_address',
  'school_phone',
  'school_email',
  'school_logo_url',
];

const TIMETABLE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const TIME_12H_REGEX = /^(0?[1-9]|1[0-2]):([0-5]\d)\s*(AM|PM)$/i;
const NO_PERIODS_MSG = 'You have not entered periods yet.';

function isBlank(val) {
  return val === null || val === undefined || String(val).trim() === '';
}

function parse12HourToMins(input) {
  if (typeof input !== 'string') return null;
  const match = input.trim().toUpperCase().match(TIME_12H_REGEX);
  if (!match) return null;

  let h = Number(match[1]);
  const m = Number(match[2]);
  const meridian = match[3];

  if (meridian === 'AM' && h === 12) h = 0;
  if (meridian === 'PM' && h !== 12) h += 12;

  return h * 60 + m;
}

function formatMinsTo12Hour(totalMins) {
  const mins = (((Math.round(totalMins) % 1440) + 1440) % 1440);
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
}

function parseMaybeJson(raw) {
  if (typeof raw !== 'string') return raw;
  const trimmed = raw.trim();
  if (!trimmed) return raw;
  try {
    return JSON.parse(trimmed);
  } catch {
    return raw;
  }
}

function validateTimetableSetting(key, rawValue) {
  const value = parseMaybeJson(rawValue);

  if (key === 'hidden_days') {
    if (!Array.isArray(value)) {
      return { ok: false, msg: 'hidden_days must be an array of day names.' };
    }
    const invalidDay = value.find((d) => !TIMETABLE_DAYS.includes(d));
    if (invalidDay) {
      return { ok: false, msg: `Invalid day "${invalidDay}" in hidden_days.` };
    }
    const activeDays = TIMETABLE_DAYS.filter((d) => !value.includes(d));
    if (activeDays.length === 0) {
      return { ok: false, msg: 'At least one active school day must remain selected.' };
    }
    return { ok: true, value };
  }

  if (key === 'period_counts') {
    if (!value || typeof value !== 'object') {
      return { ok: false, msg: 'period_counts must be an object with regular and friday counts.' };
    }
    const regular = Number(value.regular);
    const friday = Number(value.friday);
    if (!Number.isInteger(regular) || regular < 1 || !Number.isInteger(friday) || friday < 1) {
      return { ok: false, msg: NO_PERIODS_MSG };
    }
    return { ok: true, value: { regular, friday } };
  }

  if (key === 'default_periods' || key === 'default_friday_periods') {
    const label = key === 'default_friday_periods' ? 'Friday' : 'Monday–Saturday';
    if (!Array.isArray(value) || value.length === 0) {
      return { ok: false, msg: `${label}: ${NO_PERIODS_MSG}` };
    }

    const normalizedRows = [];
    for (let i = 0; i < value.length; i++) {
      const row = value[i] || {};
      const rowRef = `${label} Row ${i + 1}`;

      if (isBlank(row.name)) {
        return { ok: false, msg: `${rowRef}: Slot / Period Label is required.` };
      }

      const startMins = parse12HourToMins(row.start_time);
      if (startMins === null) {
        return {
          ok: false,
          msg: `${rowRef}: Start Time ("${row.start_time || ''}") must be a valid 12-hour time (e.g., 08:00 AM).`,
        };
      }

      const endMins = parse12HourToMins(row.end_time);
      if (endMins === null) {
        return {
          ok: false,
          msg: `${rowRef}: End Time ("${row.end_time || ''}") must be a valid 12-hour time (e.g., 08:35 AM).`,
        };
      }

      if (endMins <= startMins) {
        return {
          ok: false,
          msg: `${rowRef}: End Time (${row.end_time}) must be later than Start Time (${row.start_time}).`,
        };
      }

      normalizedRows.push({
        name: String(row.name).trim(),
        start_time: formatMinsTo12Hour(startMins),
        end_time: formatMinsTo12Hour(endMins),
        isBreak: Boolean(row.isBreak),
      });
    }

    return { ok: true, value: normalizedRows };
  }

  return { ok: true, value: rawValue };
}

async function persistSetting(req, res, next) {
  try {
    const key = req.body.key || req.params.key;
    const rawValue = req.body.value;

    if (!key || typeof key !== 'string' || !key.trim()) {
      return res.status(400).json({ success: false, message: 'Setting key is required.' });
    }
    if (rawValue === undefined || rawValue === null || (typeof rawValue === 'string' && !rawValue.trim())) {
      return res.status(400).json({ success: false, message: `Value is required for "${key}".` });
    }

    const checked = validateTimetableSetting(key, rawValue);
    if (!checked.ok) {
      return res.status(400).json({ success: false, message: checked.msg });
    }

    const finalValue = checked.value;
    const dataType = typeof finalValue === 'object' && finalValue !== null ? 'json' : 'string';
    await SettingsModel.save(key, finalValue, dataType);
    return res.json({ success: true, data: finalValue });
  } catch (err) {
    next(err);
  }
}

exports.getSetting = async (req, res, next) => {
  try {
    const { key } = req.params;
    const value = await SettingsModel.get(key, null);
    if (
      (key === 'default_periods' || key === 'default_friday_periods') &&
      (!Array.isArray(value) || value.length === 0)
    ) {
      return res.status(200).json([]);
    }
    res.json(value);
  } catch (err) {
    next(err);
  }
};

exports.saveSetting = persistSetting;

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

exports.updateSetting = persistSetting;

