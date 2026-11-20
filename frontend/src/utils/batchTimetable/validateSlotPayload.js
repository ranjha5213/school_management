const VALID_DAYS = new Set([
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
]);

const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?$/;

const isPositiveInt = (val) => {
  if (val === null || val === undefined || val === '' || typeof val === 'boolean') {
    return false;
  }
  const num = Number(val);
  return Number.isInteger(num) && num > 0;
};

const normalizeOptionalId = (val) => {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  return Number.isInteger(num) && num > 0 ? num : NaN;
};

const toMinutes = (timeStr) => {
  const match = String(timeStr).trim().match(TIME_REGEX);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
};

export function validateSlotPayload(payload = {}) {
  const reasons = [];

  const sectionIdNum = Number(payload.section_id);
  const subjectIdNum = Number(payload.subject_id);
  const normalizedTeacherId = normalizeOptionalId(payload.teacher_id);

  if (!isPositiveInt(payload.section_id)) {
    reasons.push(
      payload.section_id === undefined || payload.section_id === null || payload.section_id === ''
        ? 'missing section_id'
        : `invalid section_id (${payload.section_id})`
    );
  }

  if (!isPositiveInt(payload.subject_id)) {
    reasons.push(
      payload.subject_id === undefined || payload.subject_id === null || payload.subject_id === ''
        ? 'missing subject_id'
        : `invalid subject_id (${payload.subject_id})`
    );
  }

  if (Number.isNaN(normalizedTeacherId)) {
    reasons.push(`invalid teacher_id (${payload.teacher_id})`);
  }

  const day = typeof payload.day_of_week === 'string' ? payload.day_of_week.trim().toLowerCase() : '';
  if (!day) {
    reasons.push('missing day_of_week');
  } else if (!VALID_DAYS.has(day)) {
    reasons.push(`invalid day_of_week (${payload.day_of_week})`);
  }

  let normalizedPeriodNo = null;
  if (payload.period_no !== undefined && payload.period_no !== null && payload.period_no !== '') {
    const pNum = Number(payload.period_no);
    if (!Number.isInteger(pNum) || pNum <= 0) {
      reasons.push(`invalid period_no (${payload.period_no})`);
    } else {
      normalizedPeriodNo = pNum;
    }
  }

  const startTime = typeof payload.start_time === 'string' ? payload.start_time.trim() : '';
  const endTime = typeof payload.end_time === 'string' ? payload.end_time.trim() : '';

  if (!startTime) {
    reasons.push('missing start_time');
  } else if (!TIME_REGEX.test(startTime)) {
    reasons.push(`invalid start_time (${payload.start_time})`);
  }

  if (!endTime) {
    reasons.push('missing end_time');
  } else if (!TIME_REGEX.test(endTime)) {
    reasons.push(`invalid end_time (${payload.end_time})`);
  }

  const startMin = startTime ? toMinutes(startTime) : null;
  const endMin = endTime ? toMinutes(endTime) : null;
  if (startMin !== null && endMin !== null && endMin <= startMin) {
    reasons.push(`end_time (${endTime}) must be after start_time (${startTime})`);
  }

  return {
    valid: reasons.length === 0,
    reason: reasons.join('; '),
    reasons,
    cleanedPayload: {
      ...payload,
      section_id: isPositiveInt(payload.section_id) ? sectionIdNum : payload.section_id,
      subject_id: isPositiveInt(payload.subject_id) ? subjectIdNum : payload.subject_id,
      teacher_id: Number.isNaN(normalizedTeacherId) ? payload.teacher_id : normalizedTeacherId,
      day_of_week: day,
      period_no: normalizedPeriodNo,
      start_time: startTime,
      end_time: endTime,
    },
  };
}
