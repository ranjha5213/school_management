#!/usr/bin/env python3
"""
Add sheet_mode to mcq_exams: 'full' (question+options) or 'tick_only'.
Updates model, controller, PDF generator, and frontend.
Run from ~/school:  python scripts/generate_sheet_mode.py
"""
import sys, subprocess
from pathlib import Path

HERE = Path(__file__).resolve()
ROOT = HERE.parent.parent if HERE.parent.name == "scripts" else Path.cwd()
BE = ROOT / "backend"
FE = ROOT / "frontend"


def banner(m): print(f"\n── {m} " + "─" * max(0, 60 - len(m)))


# ════════════════════════════════════════════════════════════
# 1. Migration
# ════════════════════════════════════════════════════════════

def migration():
    banner("migration")
    sql = "ALTER TABLE mcq_exams ADD COLUMN sheet_mode VARCHAR(20) DEFAULT 'full';\n"
    mig = BE / "migrations/016_sheet_mode.sql"
    mig.write_text(sql)
    print(f"  ✓ wrote {mig.relative_to(ROOT)}")

    # Apply
    db = BE / "school_management.db"
    r = subprocess.run(
        ["sqlite3", str(db), "ALTER TABLE mcq_exams ADD COLUMN sheet_mode VARCHAR(20) DEFAULT 'full';"],
        capture_output=True, text=True,
    )
    if r.returncode == 0:
        print("  ✓ applied (column added)")
    elif "duplicate column" in (r.stderr + r.stdout).lower():
        print("  · column already exists")
    else:
        print(f"  ! sqlite said: {r.stderr.strip() or r.stdout.strip()}")

    # Verify
    r = subprocess.run(
        ["sqlite3", str(db), "PRAGMA table_info(mcq_exams);"],
        capture_output=True, text=True,
    )
    if "sheet_mode" in r.stdout:
        print("  ✓ sheet_mode column present")
    else:
        print("  ✗ sheet_mode NOT in table — inspect manually")


# ════════════════════════════════════════════════════════════
# 2. Model — accept and return sheet_mode
# ════════════════════════════════════════════════════════════

def model_patch():
    banner("models/mcqModel.js")
    p = BE / "models/mcqModel.js"
    src = p.read_text()

    # createExam — add sheet_mode
    if "sheet_mode" not in src:
        src = src.replace(
            "INSERT INTO mcq_exams\n        (title, class_id, section_id, subject_id,\n"
            "         total_questions, marks_per_question, negative_marks, exam_date, created_by)\n"
            "       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            "INSERT INTO mcq_exams\n        (title, class_id, section_id, subject_id,\n"
            "         total_questions, marks_per_question, negative_marks, exam_date, created_by, sheet_mode)\n"
            "       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        src = src.replace(
            "[d.title, d.class_id, d.section_id, d.subject_id,\n"
            "       d.total_questions, d.marks_per_question, d.negative_marks, d.exam_date, d.created_by]",
            "[d.title, d.class_id, d.section_id, d.subject_id,\n"
            "       d.total_questions, d.marks_per_question, d.negative_marks, d.exam_date, d.created_by,\n"
            "       d.sheet_mode || 'full']",
        )
        p.write_text(src)
        print("  ✓ createExam supports sheet_mode")
    else:
        print("  · already patched")


# ════════════════════════════════════════════════════════════
# 3. Controller — accept sheet_mode in createExam + update
# ════════════════════════════════════════════════════════════

def controller_patch():
    banner("controllers/mcqController.js")
    p = BE / "controllers/mcqController.js"
    src = p.read_text()

    if "'sheet_mode'" in src:
        print("  · already patched")
        return

    # createExam
    src = src.replace(
        "            negative_marks = 0, exam_date = null } = req.body;",
        "            negative_marks = 0, exam_date = null, sheet_mode = 'full' } = req.body;",
    )
    src = src.replace(
        "      exam_date: exam_date || null,\n      created_by: req.user.id,",
        "      exam_date: exam_date || null,\n      sheet_mode: sheet_mode === 'tick_only' ? 'tick_only' : 'full',\n      created_by: req.user.id,",
    )

    # updateExam allowed list
    src = src.replace(
        "const allowed = ['title','class_id','section_id','subject_id','total_questions',\n"
        "                     'marks_per_question','negative_marks','exam_date'];",
        "const allowed = ['title','class_id','section_id','subject_id','total_questions',\n"
        "                     'marks_per_question','negative_marks','exam_date','sheet_mode'];",
    )

    p.write_text(src)
    print("  ✓ controller accepts sheet_mode")


# ════════════════════════════════════════════════════════════
# 4. PDF generator — both layouts
# ════════════════════════════════════════════════════════════

def pdf_generator():
    banner("utils/mcqPdfGenerator.js")
    p = BE / "utils/mcqPdfGenerator.js"

    new_code = r"""const PDFDocument = require('pdfkit');

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
        drawTickOnlySheet(doc, { L, COL, tableTop: instY + 22, questions });
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

function drawTickOnlySheet(doc, { L, COL, tableTop, questions }) {
  const rowH = 26;
  const qColW = 30;
  const optColW = (COL - qColW) / 4;

  // Header row
  doc.rect(L, tableTop, COL, 20).fill('#2c3e50');
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(9);
  doc.text('#', L + 4, tableTop + 6, { width: qColW - 8 });
  ['A', 'B', 'C', 'D'].forEach((opt, i) => {
    doc.text(opt, L + qColW + i * optColW, tableTop + 6,
             { width: optColW, align: 'center' });
  });

  let y = tableTop + 20;

  questions.forEach((q, idx) => {
    if (y + rowH > doc.page.height - 60) {
      doc.addPage();
      y = 40;
    }
    const bg = idx % 2 === 0 ? '#fafafa' : '#ffffff';
    doc.rect(L, y, COL, rowH).fill(bg).stroke('#cbd5e1');

    doc.fillColor('#000').font('Helvetica-Bold').fontSize(11)
       .text(String(q.q_number), L + 4, y + 7, { width: qColW - 8 });

    for (let i = 0; i < 4; i++) {
      const ox = L + qColW + i * optColW;
      doc.rect(ox + 4, y + 3, optColW - 8, rowH - 6).stroke('#cbd5e1');
      doc.circle(ox + optColW / 2, y + rowH / 2, 6).stroke('#334155');
    }
    y += rowH;
  });

  doc.y = y;
}

module.exports = { buildMcqSheet };
"""
    p.write_text(new_code)
    print("  ✓ rewrote mcqPdfGenerator.js with both layouts")


# ════════════════════════════════════════════════════════════
# 5. Frontend — New MCQ modal radio + exam header toggle
# ════════════════════════════════════════════════════════════

def frontend_patch():
    banner("frontend Mcq.jsx")
    p = FE / "src/pages/Mcq.jsx"
    src = p.read_text()

    if "sheet_mode" in src:
        print("  · already patched")
        return

    # 1. In NewMcqModal, add sheet_mode to form + select UI
    src = src.replace(
        "    total_questions: 20, marks_per_question: 1, negative_marks: 0, exam_date: '',",
        "    total_questions: 20, marks_per_question: 1, negative_marks: 0, exam_date: '',\n    sheet_mode: 'full',",
    )
    src = src.replace(
        "        exam_date: form.exam_date || null,\n      });",
        "        exam_date: form.exam_date || null,\n        sheet_mode: form.sheet_mode,\n      });",
    )

    # Insert radio after exam_date Input
    src = src.replace(
        '        <Input label="Exam date" name="exam_date" type="date" value={form.exam_date} onChange={onChange} />',
        '''        <Input label="Exam date" name="exam_date" type="date" value={form.exam_date} onChange={onChange} />

        <div>
          <label className="label">Sheet type</label>
          <div className="flex gap-2">
            {[
              { value: 'full', label: 'Full (with questions)' },
              { value: 'tick_only', label: 'Tick-only (separate question paper)' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setForm({ ...form, sheet_mode: opt.value })}
                className={`flex-1 px-3 py-2 rounded-lg text-xs font-medium border transition ${
                  form.sheet_mode === opt.value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>''',
    )

    # 2. Exam detail header — show current mode and allow toggle
    src = src.replace(
        """          {' · '}{data.exam.marks_per_question} mark(s) each
          {Number(data.exam.negative_marks) > 0 && ` · -${data.exam.negative_marks} per wrong`}
        </div>""",
        """          {' · '}{data.exam.marks_per_question} mark(s) each
          {Number(data.exam.negative_marks) > 0 && ` · -${data.exam.negative_marks} per wrong`}
          {' · '}<span className="badge badge-blue">
            {data.exam.sheet_mode === 'tick_only' ? 'Tick-only sheet' : 'Full sheet'}
          </span>
        </div>

        {canWrite && (
          <div className="mt-3 flex gap-2">
            {[
              { value: 'full', label: 'Full sheet (with questions)' },
              { value: 'tick_only', label: 'Tick-only sheet' },
            ].map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={async () => {
                  try {
                    await mcqApi.update(examId, { sheet_mode: opt.value });
                    toast.success('Sheet mode updated');
                    await load();
                  } catch (e) { toast.error(e.message); }
                }}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                  (data.exam.sheet_mode || 'full') === opt.value
                    ? 'border-brand-500 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-200 dark:border-slate-700 text-slate-500 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}""",
    )

    p.write_text(src)
    print("  ✓ added sheet_mode UI (modal + header toggle)")


# ════════════════════════════════════════════════════════════

def main():
    print(f"Add sheet_mode — root: {ROOT}")
    migration()
    model_patch()
    controller_patch()
    pdf_generator()
    frontend_patch()

    # Verify backend syntax
    banner("verify")
    ok = True
    for f in [BE / "utils/mcqPdfGenerator.js",
              BE / "models/mcqModel.js",
              BE / "controllers/mcqController.js"]:
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            ok = False

    if not ok:
        sys.exit(1)

    print("\n" + "═" * 62)
    print("✅ Sheet mode added.")
    print("═" * 62)
    print("\nRestart:")
    print("  ~/school/start.sh --stop")
    print("  ~/school/start.sh")
    print("\nUI:")
    print("  /mcq → New MCQ → choose 'Full' or 'Tick-only'")
    print("  /mcq/:id → toggle at the top to switch mode anytime")


if __name__ == "__main__":
    main()
