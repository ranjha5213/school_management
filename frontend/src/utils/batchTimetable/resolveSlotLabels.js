export function buildLookupMaps(subjects = [], teachers = []) {
  const subjectMap = new Map();
  for (const subj of subjects) {
    if (subj && subj.id !== undefined && subj.id !== null) {
      const label =
        subj.name ||
        subj.title ||
        subj.subject_name ||
        `Subject #${subj.id}`;
      subjectMap.set(String(subj.id), label);
    }
  }

  const teacherMap = new Map();
  for (const t of teachers) {
    if (t && t.id !== undefined && t.id !== null) {
      const label =
        t.name ||
        t.full_name ||
        t.teacher_name ||
        `Teacher #${t.id}`;
      teacherMap.set(String(t.id), label);
    }
  }

  return { subjectMap, teacherMap };
}

function resolveSubjectLabel(rawId, subjectMap) {
  if (rawId === null || rawId === undefined || rawId === '') {
    return 'Missing Subject';
  }

  const strKey = String(rawId).trim();
  if (subjectMap.has(strKey)) {
    return subjectMap.get(strKey);
  }

  const num = Number(rawId);
  if (!Number.isInteger(num) || num <= 0) {
    return `Invalid Subject (${String(rawId)})`;
  }

  return `Subject #${num}`;
}

function resolveTeacherLabel(rawId, teacherMap) {
  if (rawId === null || rawId === undefined || rawId === '') {
    return 'No Teacher';
  }

  const strKey = String(rawId).trim();
  if (teacherMap.has(strKey)) {
    return teacherMap.get(strKey);
  }

  const num = Number(rawId);
  if (!Number.isInteger(num) || num <= 0) {
    return `Invalid Teacher (${String(rawId)})`;
  }

  return `Teacher #${num}`;
}

export function getSlotDisplayLabels(payload = {}, subjectMap, teacherMap) {
  return {
    subjectName: resolveSubjectLabel(payload.subject_id, subjectMap),
    teacherName: resolveTeacherLabel(payload.teacher_id, teacherMap),
  };
}

export function formatSlotToastText(item) {
  const meta = [item.subjectName, item.teacherName].filter(Boolean).join(' · ');
  return meta ? `${item.label} (${meta})` : item.label;
}
