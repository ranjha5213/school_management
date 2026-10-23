const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const TPL = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'config', 'mcq_template.json'), 'utf8'));

/**
 * buildMcqSheet({ exam, questions, student, school })
 * exam.sheet_mode: 'full' (question + options) | 'tick_only' (numbers + A/B/C/D)
 * Returns Buffer.
 */
const buildMcqSheet = ({ exam, questions, student, school = {} }) =>
  new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({
        size: 'A4',
        margins: { top: 40, bottom: 40, left: 40, right: 40 },
        info: { Title: `MCQ — ${student?.name || 'Student'}` },
      });

      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W = doc.page.width;
      const L = 40;
      const R = W - 40;
      const COL = R - L;

      // ─── Corner anchor markers (for OpenCV warp) ───
      drawAnchors(doc);
      doc.y = 80;  // start content below anchors

      // ─── Header ───
      doc.fontSize(18).font('Helvetica-Bold').fillColor('#000')
         .text(school.name || 'School Management', L, 40, { width: COL, align: 'center' });
      doc.fontSize(10).font('Helvetica').fillColor('#666')
         .text(school.address || '', { width: COL, align: 'center' });
      doc.moveDown(0.4);

      doc.fontSize(14).font('Helvetica-Bold').fillColor('#000')
         .text(exam.title || 'MCQ Test', { width: COL, align: 'center' });
      doc.moveDown(0.3);
      doc.strokeColor('#cccccc').lineWidth(1).moveTo(L, doc.y).lineTo(R, doc.y).stroke();
      doc.moveDown(0.7);

      // ─── Student info boxes ───
      const infoY = doc.y;
      const boxH = 26;
      const boxes = [
        { label: 'Roll No', value: student?.roll_number || '' },
        { label: 'Name', value: student?.name || '' },
        { label: 'Class', value: exam.class_name || '' },
        { label: 'Section', value: exam.section_name || '' },
      ];
      const bw = COL / 4;
      boxes.forEach((b, i) => {
        const x = L + i * bw;
        doc.fontSize(8).font('Helvetica').fillColor('#666')
           .text(b.label.toUpperCase(), x, infoY, { width: bw - 6 });
        doc.rect(x, infoY + 12, bw - 8, boxH).stroke('#888');
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#000')
           .text(b.value, x + 4, infoY + 17, { width: bw - 14 });
      });

      // ─── Instructions ───
      const instY = infoY + boxH + 18;
      doc.fontSize(9).font('Helvetica-Oblique').fillColor('#555')
         .text('Instructions: Tick (✓) exactly ONE option for each question. Do not make multiple marks.',
               L, instY, { width: COL });

      // ─── Mode: full vs tick_only ───
      const mode = exam.sheet_mode === 'tick_only' ? 'tick_only' : 'full';

      if (mode === 'full') {
        drawFullSheet(doc, { L, COL, tableTop: instY + 22, questions });
      } else {
        drawTickOnlySheet(doc, { questions });
      }

      // ─── Footer ───
      doc.fontSize(8).font('Helvetica').fillColor('#888')
         .text(
           `Generated ${new Date().toLocaleString()} — ${exam.title || 'MCQ Test'} (${mode})`,
           L, doc.page.height - 30, { width: COL, align: 'center' }
         );

      doc.end();
    } catch (e) { reject(e); }
  });


// ════════════════════════════════════════════════════════════
// Layout A — Full sheet (question + options + tick boxes)
// ════════════════════════════════════════════════════════════

function drawFullSheet(doc, { L, COL, tableTop, questions }) {
  const numW = 26;
  const tickBoxW = 22;
  const tickAreaW = tickBoxW * 4 + 16;
  const textW = COL - numW - tickAreaW;
  const baseRowH = 30;

  // Header row
  doc.rect(L, tableTop, COL, 20).fill('#2c3e50');
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
  doc.text('#', L + 4, tableTop + 6, { width: numW - 8 });
  doc.text('Question', L + numW + 4, tableTop + 6, { width: textW - 8 });
  ['A', 'B', 'C', 'D'].forEach((opt, i) => {
    doc.text(opt, L + numW + textW + i * tickBoxW, tableTop + 6,
             { width: tickBoxW, align: 'center' });
  });

  let y = tableTop + 20;

  questions.forEach((q, idx) => {
    const opts = [
      q.option_a ? `A) ${q.option_a}` : '',
      q.option_b ? `B) ${q.option_b}` : '',
      q.option_c ? `C) ${q.option_c}` : '',
      q.option_d ? `D) ${q.option_d}` : '',
    ].filter(Boolean).join('   ');
    const qText = q.question_text || '';
    const fullText = qText ? `${qText}\n${opts}` : opts;

    doc.fontSize(10).font('Helvetica');
    const textHeight = doc.heightOfString(fullText, { width: textW - 10 });
    const thisRowH = Math.max(baseRowH, textHeight + 14);

    if (y + thisRowH > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }

    const bg = idx % 2 === 0 ? '#fafafa' : '#ffffff';
    doc.rect(L, y, COL, thisRowH).fill(bg).stroke('#cbd5e1');

    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11)
       .text(String(q.q_number), L + 4, y + 8, { width: numW - 8 });

    if (qText) {
      doc.fillColor('#000').font('Helvetica-Bold').fontSize(10)
         .text(qText, L + numW + 4, y + 6, { width: textW - 10 });
    }
    doc.font('Helvetica').fontSize(9).fillColor('#444')
       .text(opts, L + numW + 4, y + 6 + (qText ? 14 : 0), { width: textW - 10 });

    // Tick boxes
    for (let i = 0; i < 4; i++) {
      const bx = L + numW + textW + i * tickBoxW + 2;
      const by = y + (thisRowH - 16) / 2;
      doc.rect(bx, by, 16, 16).stroke('#64748b');
    }

    y += thisRowH;
  });

  doc.y = y;
}


// ════════════════════════════════════════════════════════════
// Layout B — Tick-only (numbers + A/B/C/D circles)
// ════════════════════════════════════════════════════════════

// ─── Corner anchors (must be at fixed positions) ───
function drawAnchors(doc) {
  const size = TPL.anchors.size_pt;
  const m = TPL.anchors.margin_pt;
  const W = doc.page.width, H = doc.page.height;
  doc.save().fillColor('#000');
  doc.rect(m, m, size, size).fill();
  doc.rect(W - m - size, m, size, size).fill();
  doc.rect(m, H - m - size, size, size).fill();
  doc.rect(W - m - size, H - m - size, size, size).fill();
  doc.restore();
}

function drawTickOnlySheet(doc, { questions }) {
  const pageW = doc.page.width, pageH = doc.page.height;
  const m = TPL.paper.margin_pt;
  const g = TPL.grid;

  // Header text
  doc.fillColor('#000').font('Helvetica-Bold').fontSize(14)
     .text('MCQ Test — Tick the correct bubble', m, m + TPL.anchors.size_pt + 8,
           { width: pageW - 2 * m, align: 'center' });

  // Column headers
  doc.font('Helvetica-Bold').fontSize(10);
  doc.text('Q', 60, g.first_row_y_pt - 20);
  doc.text('A    B    C    D', g.left_column_x_pt - 12, g.first_row_y_pt - 20);
  doc.text('Q', 300, g.first_row_y_pt - 20);
  doc.text('A    B    C    D', g.right_column_x_pt - 12, g.first_row_y_pt - 20);

  // 2 columns × 10 rows
  for (let i = 0; i < g.questions_per_column; i++) {
    const y = g.first_row_y_pt + i * g.row_height_pt;

    // Left column: Q1-10
    const qLeft = i + 1;
    doc.fillColor('#000').font('Helvetica').fontSize(11)
       .text(String(qLeft), 60, y - 4);
    for (let j = 0; j < 4; j++) {
      const cx = g.left_column_x_pt + j * g.bubble_spacing_pt;
      doc.circle(cx, y, g.bubble_radius_pt)
         .strokeColor('#000000').lineWidth(1).stroke();
    }

    // Right column: Q11-20
    const qRight = i + 11;
    doc.fillColor('#000').font('Helvetica').fontSize(11)
       .text(String(qRight), 300, y - 4);
    for (let j = 0; j < 4; j++) {
      const cx = g.right_column_x_pt + j * g.bubble_spacing_pt;
      doc.circle(cx, y, g.bubble_radius_pt)
         .strokeColor('#000000').lineWidth(1).stroke();
    }
  }
}

module.exports = { buildMcqSheet };
