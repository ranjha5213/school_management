import client from './client';

const unwrap = (p) => p.then((r) => r.data?.data ?? r.data);
export const authApi = {
  login: (p) => unwrap(client.post('/auth/login', p)),
  me: () => unwrap(client.get('/auth/me')),
  logout: (refresh) => client.post('/auth/logout', { refresh }),
  register: (p) => unwrap(client.post('/auth/register', p)),
  verifyRegisterOtp: (email, code) =>
    unwrap(client.post('/auth/verify-register-otp', { email, code })),
  resendRegisterOtp: (email) =>
    unwrap(client.post('/auth/resend-register-otp', { email })),

  // password reset
  sendOtp: (email) => unwrap(client.post('/auth/send-otp', { email })),
  verifyOtp: (email, code) => unwrap(client.post('/auth/verify-otp', { email, code })),
  resetPassword: (reset_token, newPassword) =>
    unwrap(client.post('/auth/reset-password', { reset_token, newPassword })),

  // authenticated
  changePassword: (oldPassword, newPassword) =>
    unwrap(client.patch('/auth/change-password', { oldPassword, newPassword })),

  // admin
  listPending: () => unwrap(client.get('/auth/pending')),
  approve: (id) => unwrap(client.post(`/auth/approve/${id}`)),
  reject: (id, reason) => unwrap(client.post(`/auth/reject/${id}`, { reason })),
};

export const classesApi = {
  get: (classId) => unwrap(client.get(`/classes/${classId}`)),
  update: (classId, p) => unwrap(client.patch(`/classes/${classId}`, p)),
  remove: (classId, cascade) =>
    unwrap(client.delete(`/classes/${classId}${cascade ? '?cascade=true' : ''}`)),
  createSectionBulk: (classId, sections) =>
    unwrap(client.post(`/classes/${classId}/sections/bulk`, { sections })),
  updateSection: (sectionId, p) =>
    unwrap(client.patch(`/classes/sections/${sectionId}`, p)),
  removeSection: (sectionId, force) =>
    unwrap(client.delete(`/classes/sections/${sectionId}${force ? '?force=true' : ''}`)),
  list: () => unwrap(client.get('/classes')),
  sections: (classId) => unwrap(client.get(`/classes/${classId}/sections`)),
  students: (sectionId) => unwrap(client.get(`/classes/sections/${sectionId}/students`)),
  addStudentToSection: (sectionId, p) =>
    unwrap(client.post(`/classes/sections/${sectionId}/students`, p)),
  createClass: (p) => unwrap(client.post('/classes', p)),
  createSection: (classId, p) => unwrap(client.post(`/classes/${classId}/sections`, p)),
};

export const studentsApi = {
  list: (params) => unwrap(client.get('/students', { params })),
  byClassSection: (classId, sectionId) =>
    unwrap(client.get(`/classes/sections/${sectionId}/students`)),
  overview: (id) => unwrap(client.get(`/students/${id}/overview`)),
  attendance: (id, params) => unwrap(client.get(`/students/${id}/attendance`, { params })),
  create: (p) => unwrap(client.post('/students', p)),
  update: (id, p) => unwrap(client.patch(`/students/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/students/${id}`)),
};

export const teachersApi = {
  list: (params) => unwrap(client.get('/teachers', { params })),
  get: (id) => unwrap(client.get(`/teachers/${id}`)),
  overview: (id) => unwrap(client.get(`/teachers/${id}/overview`)),
  departments: () => unwrap(client.get('/teachers/departments')),
  create: (p) => unwrap(client.post('/teachers', p)),
  update: (id, p) => unwrap(client.patch(`/teachers/${id}`, p)),
  remove: (id, force) =>
    unwrap(client.delete(`/teachers/${id}${force ? '?force=true' : ''}`)),
};

export const attendanceApi = {
  byDate: (date, sectionId) =>
    unwrap(client.get('/attendance/date', { params: { date, section_id: sectionId } })),
  bulk: (records, sectionId) =>
    unwrap(client.post('/attendance/bulk', { records, section_id: sectionId })),
  updateRemarks: (studentId, date, remarks) =>
    unwrap(client.patch('/attendance/remarks', { student_id: studentId, date, remarks })),
  summary: (studentId) => unwrap(client.get(`/attendance/summary/${studentId}`)),
  classSummary: (params) => unwrap(client.get('/attendance/class-summary', { params })),
};

export const examsApi = {
  list: (params) => unwrap(client.get('/exams', { params })),
  get: (id) => unwrap(client.get(`/exams/${id}`)),
  create: (p) => unwrap(client.post('/exams', p)),
  update: (id, p) => unwrap(client.patch(`/exams/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/exams/${id}`)),
  types: () => unwrap(client.get('/exams/types')),
  createType: (p) => unwrap(client.post('/exams/types', p)),
  saveMarks: (exam_id, marks) => unwrap(client.post('/exams/marks', { exam_id, marks })),
  deleteMark: (markId) => unwrap(client.delete(`/exams/marks/${markId}`)),
  studentMarks: (studentId) => unwrap(client.get(`/exams/student/${studentId}`)),
};

export const homeworkApi = {
  list: (params) => unwrap(client.get('/homework', { params })),
  get: (id) => unwrap(client.get(`/homework/${id}`)),
  create: (p) => unwrap(client.post('/homework', p)),
  update: (id, p) => unwrap(client.patch(`/homework/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/homework/${id}`)),
  submit: (id, p) => unwrap(client.post(`/homework/${id}/submit`, p)),
  grade: (id, p) => unwrap(client.post(`/homework/${id}/grade`, p)),
};

export const feesApi = {
  summary: () => unwrap(client.get('/fees/summary')),
  invoices: (params) => unwrap(client.get('/fees/invoices', { params })),
  invoice: (id) => unwrap(client.get(`/fees/invoices/${id}`)),
  createInvoice: (p) => unwrap(client.post('/fees/invoices', p)),
  updateInvoice: (id, p) => unwrap(client.patch(`/fees/invoices/${id}`, p)),
  removeInvoice: (id) => unwrap(client.delete(`/fees/invoices/${id}`)),
  pay: (p) => unwrap(client.post('/fees/payments', p)),
};

export const libraryApi = {
  books: (params) => unwrap(client.get('/library/books', { params })),
  book: (id) => unwrap(client.get(`/library/books/${id}`)),
  createBook: (p) => unwrap(client.post('/library/books', p)),
  updateBook: (id, p) => unwrap(client.patch(`/library/books/${id}`, p)),
  removeBook: (id) => unwrap(client.delete(`/library/books/${id}`)),
  issues: (params) => unwrap(client.get('/library/issues', { params })),
  issue: (p) => unwrap(client.post('/library/issues', p)),
  returnBook: (id, return_date) =>
    unwrap(client.patch(`/library/issues/${id}/return`, { return_date })),
};

export const noticesApi = {
  list: (params) => unwrap(client.get('/notices', { params })),
  get: (id) => unwrap(client.get(`/notices/${id}`)),
  create: (p) => unwrap(client.post('/notices', p)),
  update: (id, p) => unwrap(client.patch(`/notices/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/notices/${id}`)),
  inbox: (params) => unwrap(client.get('/notices/inbox', { params })),
  markRead: (id) => unwrap(client.post(`/notices/${id}/read`)),
};

export const timetableApi = {
  list: (params) => unwrap(client.get('/timetable', { params })),
  bySection: (sectionId) => unwrap(client.get(`/timetable/section/${sectionId}`)),
  get: (id) => unwrap(client.get(`/timetable/${id}`)),
  create: (p) => unwrap(client.post('/timetable', p)),
  update: (id, p) => unwrap(client.patch(`/timetable/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/timetable/${id}`)),
};

export const reportsApi = {
  dashboard: () => unwrap(client.get('/reports/dashboard')),
  attendance: (params) => unwrap(client.get('/reports/attendance', { params })),
  reportCard: (studentId) =>
    unwrap(client.get(`/reports/student/${studentId}/report-card`)),
};

export const searchApi = {
  query: (q) => unwrap(client.get('/search', { params: { q } })),
};

export const parentApi = {
  children: () => unwrap(client.get('/parent/children')),
};

export const userApi = {
  uploadAvatar: (file) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return client
      .post('/users/avatar', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data?.data ?? r.data);
  },
  removeAvatar: () =>
    client.delete('/users/avatar').then((r) => r.data?.data ?? r.data),
};
export const mcqApi = {
updateExamSettings: (id, p) => unwrap(client.patch(`/mcq/${id}/`, p)),  
updateExamSchedule: (id, body) => unwrap(client.patch(`/mcq/${id}/schedule`, body)),
  getExamResults:     (id)       => unwrap(client.get(`/mcq/${id}/results`)),

  list: () => unwrap(client.get('/mcq')),
  get: (id) => unwrap(client.get(`/mcq/${id}`)),
  create: (p) => unwrap(client.post('/mcq', p)),
  update: (id, p) => unwrap(client.patch(`/mcq/${id}`, p)),
  remove: (id) => unwrap(client.delete(`/mcq/${id}`)),
  saveQuestions: (id, questions) =>
    unwrap(client.post(`/mcq/${id}/questions`, { questions })),
  importPreview: (id, text) =>
    unwrap(client.post(`/mcq/${id}/import/preview`, { text })),
  importQuestions: (id, text, replace = false) =>
    unwrap(client.post(`/mcq/${id}/import`, { text, replace })),
  printUrl: (id, studentId) => `/api/mcq/${id}/print/${studentId}`,
  scan: (id, files) => {
    const fd = new FormData();
    files.forEach((f) => fd.append('sheets', f));
    return unwrap(client.post(`/mcq/${id}/scan`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }));
  },
  confirm: (submissionId, p) =>
    unwrap(client.post(`/mcq/submissions/${submissionId}/confirm`, p)),
  removeSubmission: (submissionId) =>
    unwrap(client.delete(`/mcq/submissions/${submissionId}`)),

  // ─── In-app attempts (Stage 5) ───
  startAttempt: (examId, access_code) =>
    unwrap(client.post(`/mcq/${examId}/attempt/start`, { access_code })),
  submitAttempt: (attemptId, answers) =>
    unwrap(client.post(`/mcq/attempts/${attemptId}/submit`, { answers })),
  logProctorEvent: (attemptId, kind, payload) =>
    unwrap(client.post(`/mcq/attempts/${attemptId}/proctor`, { kind, payload })),
  uploadSnapshot: (attemptId, dataUrl) =>
    unwrap(client.post(`/mcq/attempts/${attemptId}/snapshot`, { dataUrl })),
  uploadRecordingChunk: (attemptId, blob) => {
    const fd = new FormData();
    fd.append('chunk', blob, `chunk-${Date.now()}.webm`);
    return unwrap(client.post(`/mcq/attempts/${attemptId}/recording`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }));
  },
  myAttempts: () => unwrap(client.get('/mcq/my-attempts')),
  listExamAttempts: (examId) => unwrap(client.get(`/mcq/${examId}/attempts`)),
  attemptDetail: (attemptId) => unwrap(client.get(`/mcq/attempts/${attemptId}`)),
  reviewAttempt: (attemptId, p) =>
    unwrap(client.post(`/mcq/attempts/${attemptId}/review`, p)),
  listRecordings: (attemptId) =>
    unwrap(client.get(`/mcq/attempts/${attemptId}/recordings`)),
};
