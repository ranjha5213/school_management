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
          Author: school.name || process.env.SCHOOL_NAME || 'School Management',
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
         .text(school.name || process.env.SCHOOL_NAME || 'School Management', L, 50, { width: COL, align: 'center' });
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
