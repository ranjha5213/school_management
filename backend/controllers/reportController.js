const { get, all } = require('../config/database');
const StudentDetailModel = require('../models/studentDetailModel');
const AttendanceModel = require('../models/attendanceModel');
const ExamModel = require('../models/examModel');
const HomeworkModel = require('../models/homeworkModel');
const { apiResponse } = require('../utils/helpers');
const pdfGenerator = require('../utils/pdfGenerator');

const dashboard = async (_req, res, next) => {
  try {
    const [students, teachers, classes, sections, todayAttendance] = await Promise.all([
      get(`SELECT COUNT(*) AS c FROM students`),
      get(`SELECT COUNT(*) AS c FROM teachers`),
      get(`SELECT COUNT(*) AS c FROM classes`),
      get(`SELECT COUNT(*) AS c FROM sections`),
      get(
        `SELECT SUM(CASE WHEN status='present' THEN 1 ELSE 0 END) AS present,
                SUM(CASE WHEN status='absent'  THEN 1 ELSE 0 END) AS absent,
                COUNT(*) AS total
         FROM attendance WHERE date = DATE('now')`
      ),
    ]);
    return apiResponse(res, 200, true, 'Dashboard', {
      students: students?.c || 0,
      teachers: teachers?.c || 0,
      classes: classes?.c || 0,
      sections: sections?.c || 0,
      attendanceToday: todayAttendance || { present: 0, absent: 0, total: 0 },
    });
  } catch (e) { next(e); }
};

const attendanceReport = async (req, res, next) => {
  try {
    const { section_id, from, to } = req.query;
    const rows = await AttendanceModel.classSummary(section_id, from, to);
    return apiResponse(res, 200, true, 'Attendance report', rows);
  } catch (e) { next(e); }
};

// ─── Full report card (JSON) ───
const studentReportCard = async (req, res, next) => {
  try {
    const id = Number(req.params.studentId);

    const [profile, attendance, exams, homework, fees] = await Promise.all([
      StudentDetailModel.profile(id),
      AttendanceModel.summary(id),
      ExamModel.marksForStudent(id),
      HomeworkModel.list({ class_id: null }).catch(() => []),
      StudentDetailModel.fees(id),
    ]);

    if (!profile) return apiResponse(res, 404, false, 'Student not found');

    const examsByName = {};
    (exams || []).forEach((e) => {
      const key = e.exam_name || 'Unnamed';
      examsByName[key] = examsByName[key] || {
        exam_name: key, type_name: e.type_name, start_date: e.start_date, marks: [],
      };
      examsByName[key].marks.push({
        subject: e.subject_name,
        obtained: e.marks_obtained,
        total: e.total_marks,
        remarks: e.remarks,
        percentage: e.total_marks
          ? Math.round((e.marks_obtained / e.total_marks) * 100)
          : 0,
      });
    });

    const fee_summary = {
      total_billed: (fees || []).reduce((a, f) => a + Number(f.total_amount || f.amount || 0), 0),
      total_paid: (fees || []).reduce((a, f) => a + Number(f.paid_amount || 0), 0),
    };
    fee_summary.pending = fee_summary.total_billed - fee_summary.total_paid;

    return apiResponse(res, 200, true, 'Report card', {
      generated_at: new Date().toISOString(),
      student: profile,
      attendance,
      exams: Object.values(examsByName),
      homework_count: homework.length,
      fees: fee_summary,
    });
  } catch (e) { next(e); }
};

// ─── Download PDF report card ───
const downloadReportCardPdf = async (req, res, next) => {
  try {
    const id = Number(req.params.studentId);

    const [profile, attendance, exams, fees] = await Promise.all([
      StudentDetailModel.profile(id),
      AttendanceModel.summary(id),
      ExamModel.marksForStudent(id),
      StudentDetailModel.fees(id),
    ]);

    if (!profile) return apiResponse(res, 404, false, 'Student not found');

    const examsByName = {};
    (exams || []).forEach((e) => {
      const key = e.exam_name || 'Unnamed';
      examsByName[key] = examsByName[key] || {
        exam_name: key, type_name: e.type_name, start_date: e.start_date, marks: [],
      };
      examsByName[key].marks.push({
        subject: e.subject_name,
        obtained: e.marks_obtained,
        total: e.total_marks,
        remarks: e.remarks,
        percentage: e.total_marks
          ? Math.round((e.marks_obtained / e.total_marks) * 100)
          : 0,
      });
    });

    const fee_summary = {
      total_billed: (fees || []).reduce((a, f) => a + Number(f.total_amount || f.amount || 0), 0),
      total_paid: (fees || []).reduce((a, f) => a + Number(f.paid_amount || 0), 0),
    };
    fee_summary.pending = fee_summary.total_billed - fee_summary.total_paid;

    const pdfBuffer = await pdfGenerator.buildReportCard({
      student: profile,
      attendance,
      exams: Object.values(examsByName),
      fees: fee_summary,
      generated_at: new Date().toISOString(),
      school: {
        name: process.env.SCHOOL_NAME || 'School Management',
        address: process.env.SCHOOL_ADDRESS || '',
      },
    });

    const filename = `report-card-${profile.admission_number || id}-${Date.now()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    return res.end(pdfBuffer);
  } catch (e) { next(e); }
};

module.exports = {
  dashboard,
  attendanceReport,
  studentReportCard,
  downloadReportCardPdf,
};
