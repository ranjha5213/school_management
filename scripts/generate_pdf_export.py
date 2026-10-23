#!/usr/bin/env python3
"""
Server-side PDF export for report cards.
Adds: utils/pdfGenerator.js (real), POST /api/reports/student/:id/pdf
Frontend: Download PDF button on ReportCard page.

Run from ~/school:  python scripts/generate_pdf_export.py
"""
import sys
import json
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parent.parent if HERE.parent.name == "scripts" else Path.cwd()
BE = ROOT / "backend"
FE = ROOT / "frontend"


def write(base, rel, content):
    p = base / rel
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(content.strip() + "\n", encoding="utf-8")
    print(f"  ✓ {p.relative_to(ROOT)}")


def banner(m):
    print(f"\n── {m} " + "─" * max(0, 60 - len(m)))


def add_dep():
    banner("package.json")
    p = BE / "package.json"
    pkg = json.loads(p.read_text())
    pkg.setdefault("dependencies", {})["pdfkit"] = "^0.15.0"
    p.write_text(json.dumps(pkg, indent=2) + "\n")
    print("  ✓ added pdfkit dependency")


def gen_pdf_util():
    banner("utils/pdfGenerator.js")

    write(BE, "utils/pdfGenerator.js", r"""
const PDFDocument = require('pdfkit');

/**
 * Renders a student report card PDF.
 * Returns a Buffer.
 */
const buildReportCard = ({ student, attendance, exams, fees, generated_at, school = {} }) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 50, bottom: 50, left: 50, right: 50 },
        info: {
          Title: `Report Card — ${student?.name || 'Student'}`,
          Author: school.name || 'School Management',
        },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;
      const L = 50;
      const R = W - 50;
      const COL = R - L;

      // ─── Header ───
      doc.fontSize(22).font('Helvetica-Bold')
         .text(school.name || 'School Management', L, 50, { width: COL, align: 'center' });
      doc.fontSize(11).font('Helvetica')
         .fillColor('#555')
         .text(school.address || 'Student Report Card', { width: COL, align: 'center' });
      doc.moveDown(0.5);
      doc.strokeColor('#cccccc').lineWidth(1)
         .moveTo(L, doc.y).lineTo(R, doc.y).stroke();
      doc.moveDown(1);

      // ─── Student info ───
      doc.fillColor('#000').fontSize(14).font('Helvetica-Bold')
         .text('Student Information', L, doc.y);
      doc.moveDown(0.3);

      const infoY = doc.y;
      const col1 = L;
      const col2 = L + COL / 2;

      doc.fontSize(10).font('Helvetica').fillColor('#333');
      doc.text(`Name: ${student?.name || '—'}`, col1, infoY);
      doc.text(`Admission #: ${student?.admission_number || '—'}`, col1, doc.y + 2);
      doc.text(`Roll #: ${student?.roll_number || '—'}`, col1, doc.y + 2);
      doc.text(`Class: ${student?.class_name || '—'}`, col1, doc.y + 2);
      doc.text(`Section: ${student?.section_name || '—'}`, col1, doc.y + 2);

      // reset y for column 2
      doc.text(`Guardian: ${student?.guardian_name || '—'}`, col2, infoY);
      doc.text(`Guardian Phone: ${student?.guardian_phone || '—'}`, col2, infoY + 14);
      doc.text(`Gender: ${student?.gender || '—'}`, col2, infoY + 28);
      doc.text(`DOB: ${student?.dob || '—'}`, col2, infoY + 42);

      doc.moveDown(2);

      // ─── Attendance ───
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000')
         .text('Attendance', L, doc.y);
      doc.moveDown(0.3);

      const att = attendance || {};
      const attY = doc.y;
      const attColW = COL / 5;
      const attLabels = ['Present', 'Absent', 'Late', 'Excused', 'Rate %'];
      const attValues = [
        att.present_days ?? 0,
        att.absent_days ?? 0,
        att.late_days ?? 0,
        att.excused_days ?? 0,
        `${att.attendance_percentage ?? 0}%`,
      ];

      doc.fontSize(9).font('Helvetica');
      attLabels.forEach((label, i) => {
        const x = L + attColW * i;
        doc.fillColor('#666').text(label.toUpperCase(), x + 4, attY, { width: attColW - 8, align: 'left' });
        doc.fillColor('#000').font('Helvetica-Bold').fontSize(13)
           .text(String(attValues[i]), x + 4, attY + 12, { width: attColW - 8 });
        doc.font('Helvetica').fontSize(9);
      });

      doc.y = attY + 42;
      doc.moveDown(1);

      // ─── Exam Results ───
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000')
         .text('Exam Results', L, doc.y);
      doc.moveDown(0.3);

      if (!exams || !exams.length) {
        doc.fontSize(10).font('Helvetica-Oblique').fillColor('#888')
           .text('No exam results recorded yet.', L, doc.y);
      } else {
        exams.forEach((exam) => {
          // Check space; add page if needed
          if (doc.y > doc.page.height - 150) {
            doc.addPage();
          }

          doc.fontSize(11).font('Helvetica-Bold').fillColor('#000')
             .text(exam.exam_name || 'Exam', L, doc.y);
          if (exam.start_date) {
            doc.fontSize(9).font('Helvetica').fillColor('#777')
               .text(`(${exam.start_date})`, { continued: false });
          }
          doc.moveDown(0.2);

          const tableTop = doc.y;
          const rowH = 20;
          const colWidths = [COL * 0.5, COL * 0.15, COL * 0.15, COL * 0.2];
          const cols = ['Subject', 'Obtained', 'Total', '%'];

          // header
          doc.font('Helvetica-Bold').fontSize(9).fillColor('#fff');
          doc.rect(L, tableTop, COL, rowH).fill('#2c3e50');

          let x = L;
          cols.forEach((c, i) => {
            doc.fillColor('#fff')
               .text(c, x + 6, tableTop + 6, { width: colWidths[i] - 12, align: i === 0 ? 'left' : 'right' });
            x += colWidths[i];
          });

          // rows
          let y = tableTop + rowH;
          exam.marks.forEach((m, idx) => {
            if (y > doc.page.height - 100) {
              doc.addPage();
              y = 50;
            }
            const bg = idx % 2 === 0 ? '#f5f5f5' : '#ffffff';
            doc.rect(L, y, COL, rowH).fill(bg);

            doc.font('Helvetica').fontSize(9).fillColor('#000');
            x = L;
            const vals = [
              m.subject || '—',
              String(m.obtained ?? '—'),
              String(m.total ?? '—'),
              `${m.percentage ?? 0}%`,
            ];
            vals.forEach((v, i) => {
              doc.fillColor(i === 3 ? (
                (m.percentage || 0) >= 80 ? '#16a34a' :
                (m.percentage || 0) >= 50 ? '#d97706' : '#dc2626'
              ) : '#000')
                 .text(v, x + 6, y + 6, { width: colWidths[i] - 12, align: i === 0 ? 'left' : 'right' });
              x += colWidths[i];
            });
            y += rowH;
          });

          doc.y = y + 10;
        });
      }

      doc.moveDown(1);

      // ─── Fees ───
      if (doc.y > doc.page.height - 150) doc.addPage();
      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000')
         .text('Fees', L, doc.y);
      doc.moveDown(0.3);

      const f = fees || {};
      const feeY = doc.y;
      const feeColW = COL / 3;
      [['Billed', f.total_billed], ['Paid', f.total_paid], ['Balance', f.pending]]
        .forEach(([label, value], i) => {
          const x = L + feeColW * i;
          doc.fontSize(9).font('Helvetica').fillColor('#666')
             .text(label.toUpperCase(), x, feeY, { width: feeColW, align: 'left' });
          doc.fontSize(13).font('Helvetica-Bold').fillColor(
            label === 'Balance' && value > 0 ? '#dc2626' : '#000'
          ).text(String(Number(value || 0).toFixed(2)), x, feeY + 12, { width: feeColW });
        });

      doc.y = feeY + 45;

      // ─── Footer ───
      doc.moveDown(2);
      doc.fontSize(8).font('Helvetica').fillColor('#888')
         .text(
           `Generated ${new Date(generated_at || Date.now()).toLocaleString()} — this is a computer-generated report.`,
           L, doc.page.height - 60, { width: COL, align: 'center' }
         );

      doc.end();
    } catch (e) {
      reject(e);
    }
  });

module.exports = { buildReportCard };
""".strip())


def gen_controller_patch():
    banner("patch reportController")

    p = BE / "controllers/reportController.js"
    if not p.exists():
        print("  ! reportController.js missing")
        return

    src = p.read_text()
    if "downloadReportCardPdf" in src:
        print("  · already patched")
        return

    # Add import
    if "pdfGenerator" not in src:
        src = src.replace(
            "const { apiResponse } = require('../utils/helpers');",
            "const { apiResponse } = require('../utils/helpers');\nconst pdfGenerator = require('../utils/pdfGenerator');",
            1,
        )

    # Add endpoint before module.exports
    new_endpoint = '''
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

    // Build exam-by-name grouping (same as JSON endpoint)
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
'''
    # insert before module.exports
    marker = "module.exports = {"
    if marker in src:
        src = src.replace(marker, new_endpoint + "\n" + marker, 1)

    # Add to exports
    src = src.replace(
        "module.exports = { dashboard, attendanceReport, studentReportCard };",
        "module.exports = { dashboard, attendanceReport, studentReportCard, downloadReportCardPdf };",
    )
    src = src.replace(
        "module.exports = { dashboard, attendanceReport, studentReportCard }",
        "module.exports = { dashboard, attendanceReport, studentReportCard, downloadReportCardPdf }",
    )

    p.write_text(src)
    print("  ✓ added downloadReportCardPdf to controller")


def gen_route_patch():
    banner("patch reports route")

    p = BE / "routes/reports.js"
    if not p.exists():
        print("  ! reports.js missing")
        return
    src = p.read_text()
    if "report-card.pdf" in src:
        print("  · already routed")
        return

    route = (
        "router.get('/student/:studentId/report-card.pdf', "
        "authorize('admin', 'teacher', 'parent', 'student'), c.downloadReportCardPdf);\n"
    )
    anchor = "router.get('/student/:studentId/report-card',"
    if anchor in src:
        src = src.replace(anchor, route + anchor, 1)
        p.write_text(src)
        print("  ✓ added PDF route")
    else:
        print("  ! anchor not found in reports.js")


def gen_frontend_patch():
    banner("patch ReportCard.jsx")

    p = FE / "src/pages/ReportCard.jsx"
    if not p.exists():
        print("  ! ReportCard.jsx missing")
        return
    src = p.read_text()
    if "Download PDF" in src:
        print("  · already has Download button")
        return

    # Add import for the icon
    if "Download" not in src:
        src = src.replace(
            "import { ArrowLeft, Printer, FileText, User, Calendar, DollarSign } from 'lucide-react';",
            "import { ArrowLeft, Printer, FileText, User, Calendar, DollarSign, Download } from 'lucide-react';",
            1,
        )

    # Add download button next to print
    old_btn = """        <Button icon={Printer} onClick={() => window.print()}>Print / Save PDF</Button>"""
    new_btn = """        <div className="flex gap-2">
          <Button icon={Printer} variant="secondary" onClick={() => window.print()}>Print</Button>
          <a
            href={`/api/reports/student/${studentId}/report-card.pdf`}
            onClick={(e) => {
              // Use fetch to attach auth header
              e.preventDefault();
              const token = localStorage.getItem('token');
              fetch(`/api/reports/student/${studentId}/report-card.pdf`, {
                headers: { Authorization: `Bearer ${token}` },
              })
                .then((r) => {
                  if (!r.ok) throw new Error('Download failed');
                  return r.blob();
                })
                .then((blob) => {
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `report-card-${studentId}.pdf`;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                })
                .catch((err) => alert(err.message));
            }}
          >
            <Button icon={Download} className="bg-brand-600 hover:bg-brand-700">
              Download PDF
            </Button>
          </a>
        </div>"""
    if old_btn in src:
        src = src.replace(old_btn, new_btn, 1)
        p.write_text(src)
        print("  ✓ added Download PDF button")
    else:
        print("  ! could not find Print button anchor")


def verify():
    banner("verify")
    import subprocess
    files = [
        BE / "utils/pdfGenerator.js",
        BE / "controllers/reportController.js",
        BE / "routes/reports.js",
    ]
    ok = True
    for f in files:
        if not f.exists():
            print(f"  ✗ missing: {f.relative_to(ROOT)}")
            ok = False
            continue
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            ok = False
    return ok


def main():
    print(f"PDF export — root: {ROOT}")
    add_dep()
    gen_pdf_util()
    gen_controller_patch()
    gen_route_patch()
    gen_frontend_patch()
    print()
    if not verify():
        sys.exit(1)
    print("\n" + "═" * 62)
    print("✅ PDF export added.")
    print("═" * 62)
    print("\nRun:")
    print("  cd ~/school/backend && npm install")
    print("  cd ~/school && ./start.sh")
    print("\nTest:")
    print("  curl -s -o /tmp/rc.pdf -w '%{http_code}\\n' \\")
    print("    http://localhost:5000/api/reports/student/4/report-card.pdf \\")
    print("    -H 'Authorization: Bearer $ADMIN'")
    print("\nUI:")
    print("  /students/4/report-card → [Print] [Download PDF]")


if __name__ == "__main__":
    main()
