#!/usr/bin/env python3
"""
Bulk question import for MCQ exams.
Backend: POST /api/mcq/:id/import  — accepts { text } or { raw }
Frontend: "Bulk Import" button in the Questions tab → paste text → preview → save

Formats supported:
  1. 2+2=?
  A) 3
  B) 4
  C) 5
  D) 6
  Answer: B

  Also accepts:
  - No question text (just options)
  - "Ans:" / "Correct:" / "=>" prefix
  - Numbered or unnumbered
  - Blank line between questions OR consecutive questions

Run from ~/school:  python scripts/generate_bulk_import.py
"""
import sys
import subprocess
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


# ════════════════════════════════════════════════════════════
# BACKEND — parser + endpoint
# ════════════════════════════════════════════════════════════

def gen_parser():
    banner("utils/mcqParser.js")

    write(BE, "utils/mcqParser.js", r"""
/**
 * Parse a block of text into MCQ questions.
 *
 * Accepted input (flexible):
 *
 *   1. 2+2=?
 *   A) 3
 *   B) 4
 *   C) 5
 *   D) 6
 *   Answer: B
 *
 *   or without question text:
 *   Q1
 *   A. Apple
 *   B. Banana
 *   C. Cherry
 *   D. Date
 *   Ans: C
 *
 * Rules:
 * - A new question starts when a line begins with:
 *     "1." / "1)" / "Q1" / "Question 1" / "Q 1." (case-insensitive)
 *   OR when we see the first option after "Answer:" of the previous question.
 * - Options are lines starting with "A)" / "A." / "(A)" / "A:"
 * - Correct answer is a line matching /^(answer|ans|correct|=>)\s*[:\-]?\s*([A-D])/i
 * - Question text is any non-option line before the first option
 */

const OPTION_RE = /^\s*[\(\[]?([A-Da-d])[\)\].:\-]\s*(.*)$/;
const ANSWER_RE = /^\s*(?:answer|ans|correct|=>|⇒)\s*[:\-]?\s*([A-Da-d])\b/i;
const QUESTION_START_RE = /^\s*(?:q(?:uestion)?\s*)?(\d+)\s*[\.\)\:\-]\s*(.*)$/i;
const QNUM_ONLY_RE = /^\s*q(?:uestion)?\s*(\d+)\s*[\.\)]?\s*$/i;

function parseText(text) {
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trimEnd());

  const questions = [];
  let current = null;

  const pushCurrent = () => {
    if (!current) return;
    const hasText = (current.question_text || '').trim();
    const hasAnyOption = ['a', 'b', 'c', 'd'].some((k) => (current['option_' + k] || '').trim());
    const hasAnswer = !!current.correct_option;

    if (hasAnyOption && hasAnswer) {
      // Give a fallback text if empty
      current.question_text = hasText ? current.question_text.trim() : '';
      questions.push(current);
    } else if (hasAnyOption && !hasAnswer) {
      // Options but no answer — keep with warning marker
      current.warning = 'No correct answer specified — defaulted to A';
      current.correct_option = 'A';
      current.question_text = hasText ? current.question_text.trim() : '';
      questions.push(current);
    }
    // else: empty / incomplete → drop
    current = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();

    if (!line) continue; // skip blank lines

    // ─── Correct answer? ───
    const ansMatch = line.match(ANSWER_RE);
    if (ansMatch) {
      if (current) current.correct_option = ansMatch[1].toUpperCase();
      continue;
    }

    // ─── Option line? ───
    const optMatch = line.match(OPTION_RE);
    if (optMatch && current) {
      const key = optMatch[1].toLowerCase();
      current['option_' + key] = optMatch[2].trim();
      continue;
    }

    // ─── Question start? ───
    const qStart = line.match(QUESTION_START_RE);
    if (qStart) {
      // Check it's a real question start, not just "A) ..." (already handled above)
      // A question start must have a number and either empty or text after
      pushCurrent();
      current = {
        q_number: parseInt(qStart[1], 10) || (questions.length + 1),
        question_text: (qStart[2] || '').trim(),
        option_a: '', option_b: '', option_c: '', option_d: '',
        correct_option: null,
      };
      continue;
    }

    // "Q1" alone on a line
    const qnumOnly = line.match(QNUM_ONLY_RE);
    if (qnumOnly) {
      pushCurrent();
      current = {
        q_number: parseInt(qnumOnly[1], 10) || (questions.length + 1),
        question_text: '',
        option_a: '', option_b: '', option_c: '', option_d: '',
        correct_option: null,
      };
      continue;
    }

    // ─── Continuation of current question text ───
    if (current && !current.option_a) {
      current.question_text = (current.question_text ? current.question_text + ' ' : '') + line;
    } else if (!current) {
      // Options before any question header — start an implicit question
      current = {
        q_number: questions.length + 1,
        question_text: '',
        option_a: '', option_b: '', option_c: '', option_d: '',
        correct_option: null,
      };
      // Re-run this line through option match
      const m2 = line.match(OPTION_RE);
      if (m2) {
        current['option_' + m2[1].toLowerCase()] = m2[2].trim();
      }
    }
    // else: line inside an option block that doesn't match anything — ignore
  }

  pushCurrent();

  // Renumber sequentially so there are no gaps
  questions.forEach((q, idx) => { q.q_number = idx + 1; });

  return questions;
}

module.exports = { parseText };
""".strip())


def gen_controller_patch():
    banner("controllers/mcqController.js — import endpoint")

    p = BE / "controllers/mcqController.js"
    src = p.read_text()

    if "bulkImport" in src:
        print("  · already patched")
        return

    # Add import at top
    if "mcqParser" not in src:
        src = src.replace(
            "const logger = require('../utils/logger');",
            "const logger = require('../utils/logger');\nconst { parseText } = require('../utils/mcqParser');",
            1,
        )

    # Add endpoint function before module.exports
    new_fn = '''
// ─── Bulk import questions from pasted text ───
const bulkImport = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const { text, replace = false } = req.body;
    if (!text || !text.trim())
      return apiResponse(res, 400, false, 'text required');

    const parsed = parseText(text);

    if (!parsed.length)
      return apiResponse(res, 400, false,
        'No questions found. Check the format: questions start with "1." and options with "A)" etc.');

    const bad = parsed.filter((q) => !['A', 'B', 'C', 'D'].includes(q.correct_option));
    if (bad.length)
      return apiResponse(res, 400, false,
        `${bad.length} question(s) missing or invalid Answer. Each needs "Answer: A/B/C/D".`);

    // Optionally wipe existing
    if (replace) {
      const { run } = require('../config/database');
      await run(`DELETE FROM mcq_questions WHERE mcq_exam_id = ?`, [id]);
    }

    // Determine starting q_number if not replacing
    let startNumber = 1;
    if (!replace) {
      const { get } = require('../config/database');
      const row = await get(
        `SELECT COALESCE(MAX(q_number), 0) + 1 AS next FROM mcq_questions WHERE mcq_exam_id = ?`,
        [id]
      );
      startNumber = row?.next || 1;
    }

    for (let i = 0; i < parsed.length; i++) {
      const q = parsed[i];
      await McqModel.upsertQuestion(id, {
        q_number: replace ? (i + 1) : (startNumber + i),
        question_text: q.question_text || null,
        option_a: q.option_a || null,
        option_b: q.option_b || null,
        option_c: q.option_c || null,
        option_d: q.option_d || null,
        correct_option: q.correct_option,
      });
    }

    // Update total_questions on the exam
    const { get } = require('../config/database');
    const cnt = await get(
      `SELECT COUNT(*) AS c FROM mcq_questions WHERE mcq_exam_id = ?`,
      [id]
    );
    await McqModel.updateExam(id, { total_questions: cnt.c });

    logger.audit(`MCQ bulk import: ${parsed.length} question(s) into exam ${id} by ${req.user.name}`);
    return apiResponse(res, 200, true,
      `${parsed.length} question(s) imported`,
      { imported: parsed.length, preview: parsed.slice(0, 3) });
  } catch (e) { next(e); }
};

// ─── Preview (no DB write) ───
const previewImport = async (req, res, next) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return apiResponse(res, 400, false, 'text required');
    const parsed = parseText(text);
    return apiResponse(res, 200, true, `${parsed.length} question(s) parsed`, { questions: parsed });
  } catch (e) { next(e); }
};
'''
    marker = "module.exports = {"
    src = src.replace(marker, new_fn + "\n" + marker, 1)

    # Extend exports
    src = src.replace(
        "  scan, confirmSubmission, deleteSubmission,\n};",
        "  scan, confirmSubmission, deleteSubmission,\n  bulkImport, previewImport,\n};",
    )

    p.write_text(src)
    print("  ✓ added bulkImport + previewImport to controller")


def gen_routes_patch():
    banner("routes/mcq.js")

    p = BE / "routes/mcq.js"
    src = p.read_text()

    if "bulkImport" in src:
        print("  · already routed")
        return

    # Add import + preview routes before the /scan route
    anchor = "router.post('/:id/scan'"
    new_lines = (
        "router.post('/:id/import/preview', authorize('admin', 'teacher'), c.previewImport);\n"
        "router.post('/:id/import', authorize('admin', 'teacher'), c.bulkImport);\n"
    )
    src = src.replace(anchor, new_lines + anchor, 1)
    p.write_text(src)
    print("  ✓ mounted import routes")


# ════════════════════════════════════════════════════════════
# FRONTEND
# ════════════════════════════════════════════════════════════

def gen_frontend_api():
    banner("api/endpoints.js")

    p = FE / "src/api/endpoints.js"
    src = p.read_text()

    if "importPreview" in src:
        print("  · already patched")
        return

    old = "  saveQuestions: (id, questions) =>\n    unwrap(client.post(`/mcq/${id}/questions`, { questions })),"
    new = (
        "  saveQuestions: (id, questions) =>\n    unwrap(client.post(`/mcq/${id}/questions`, { questions })),\n"
        "  importPreview: (id, text) =>\n    unwrap(client.post(`/mcq/${id}/import/preview`, { text })),\n"
        "  importQuestions: (id, text, replace = false) =>\n    unwrap(client.post(`/mcq/${id}/import`, { text, replace })),"
    )

    if old in src:
        src = src.replace(old, new, 1)
        p.write_text(src)
        print("  ✓ added importPreview + importQuestions to mcqApi")
    else:
        print("  ! anchor not found — patch mcqApi manually")


def gen_frontend_modal():
    banner("BulkImportModal component")

    write(FE, "src/components/BulkImportModal.jsx", r"""
import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, Eye, Check, FileText, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { mcqApi } from '../api/endpoints';

const SAMPLE = `1. 2+2=?
A) 3
B) 4
C) 5
D) 6
Answer: B

2. What color is the sky on a clear day?
A) Red
B) Blue
C) Green
D) Pink
Answer: B

3. 5 x 2 = ?
A) 8
B) 9
C) 10
D) 11
Answer: C`;

export default function BulkImportModal({ examId, onClose, onImported }) {
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const parsePreview = async () => {
    if (!text.trim()) return toast.error('Paste questions first');
    setPreviewing(true);
    try {
      const res = await mcqApi.importPreview(examId, text);
      setPreview(res.questions || []);
      toast.success(`${res.questions?.length || 0} question(s) detected`);
    } catch (e) {
      toast.error(e.message);
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  };

  const doImport = async () => {
    if (!text.trim()) return toast.error('Paste questions first');
    setImporting(true);
    try {
      const res = await mcqApi.importQuestions(examId, text, replace);
      toast.success(res?.message || 'Imported');
      onImported?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const useSample = () => {
    setText(SAMPLE);
    setPreview(null);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk Import Questions"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={Eye} onClick={parsePreview} loading={previewing}>
            Preview
          </Button>
          <Button icon={Upload} onClick={doImport} loading={importing} disabled={!text.trim()}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
          <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Format</div>
          <pre className="font-mono text-[11px] whitespace-pre-wrap">
1. 2+2=?
A) 3
B) 4
C) 5
D) 6
Answer: B</pre>
          <div className="mt-2">
            • Question starts with <code>1.</code>, <code>1)</code>, or <code>Q1</code><br/>
            • Options start with <code>A)</code>, <code>A.</code>, or <code>(A)</code><br/>
            • Correct answer: <code>Answer: B</code> or <code>Ans: B</code> or <code>=&gt; B</code><br/>
            • Blank lines between questions are optional
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={useSample}
            className="text-xs text-brand-600 hover:underline">
            Paste sample
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          rows={12}
          className="input font-mono text-xs"
          placeholder="Paste questions here..."
        />

        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={replace}
                 onChange={(e) => setReplace(e.target.checked)}
                 className="rounded" />
          Replace all existing questions in this exam
        </label>

        {preview && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-80 overflow-auto">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-xs font-medium flex items-center justify-between">
              <span>Preview — {preview.length} question(s)</span>
              <span className="text-slate-400">not saved yet</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {preview.map((q, i) => (
                <div key={i} className="p-3 text-xs">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      Q{q.q_number}
                    </span>
                    <span>{q.question_text || <em className="text-slate-400">no text</em>}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {['a','b','c','d'].map((opt) => {
                      const val = q['option_' + opt];
                      const isCorrect = (q.correct_option || '').toLowerCase() === opt;
                      if (!val) return null;
                      return (
                        <div key={opt} className={isCorrect ? 'text-green-600 font-medium' : 'text-slate-600 dark:text-slate-400'}>
                          {opt.toUpperCase()}) {val} {isCorrect && '✓'}
                        </div>
                      );
                    })}
                  </div>
                  {!q.correct_option && (
                    <div className="text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> No answer specified
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
""".strip())


def patch_mcq_page():
    banner("pages/Mcq.jsx — import button")

    p = FE / "src/pages/Mcq.jsx"
    src = p.read_text()

    if "BulkImportModal" in src:
        print("  · already patched")
        return

    # Import the modal + Upload icon
    src = src.replace(
        "import ConfirmDelete from '../components/ConfirmDelete';",
        "import ConfirmDelete from '../components/ConfirmDelete';\nimport BulkImportModal from '../components/BulkImportModal';",
        1,
    )
    # Upload icon
    src = src.replace(
        "  Printer, Camera, CheckCircle2, XCircle, AlertCircle, Upload, Users,",
        "  Printer, Camera, CheckCircle2, XCircle, AlertCircle, Upload, Users, FileUp,",
    )

    # Add state to McqDetail
    src = src.replace(
        "  const [tab, setTab] = useState('builder'); // builder | print | scan",
        "  const [tab, setTab] = useState('builder'); // builder | print | scan\n  const [importOpen, setImportOpen] = useState(false);",
        1,
    )

    # Add the button in the Questions tab header
    old_header = '''          <div className="flex justify-between items-center mb-3">
            <h3 className="font-semibold">Questions ({questions.length})</h3>
            {canWrite && (
              <Button onClick={saveAll} loading={saving} icon={Save}>Save All</Button>
            )}
          </div>'''

    new_header = '''          <div className="flex justify-between items-center mb-3 flex-wrap gap-2">
            <h3 className="font-semibold">Questions ({questions.length})</h3>
            {canWrite && (
              <div className="flex gap-2">
                <Button variant="secondary" icon={FileUp} onClick={() => setImportOpen(true)}>
                  Bulk Import
                </Button>
                <Button onClick={saveAll} loading={saving} icon={Save}>Save All</Button>
              </div>
            )}
          </div>'''

    if old_header in src:
        src = src.replace(old_header, new_header, 1)
    else:
        print("  ! Questions header anchor not found — add button manually")

    # Add modal render at the bottom of McqDetail
    # Find the closing of McqDetail — before "// ═══ PrintTab"
    marker = "// ════════════════════════════════════════════════════════════\n// PRINT TAB"
    if marker in src:
        src = src.replace(
            marker,
            '''      {importOpen && (
        <BulkImportModal
          examId={examId}
          onClose={() => setImportOpen(false)}
          onImported={async () => { setImportOpen(false); await load(); }}
        />
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// PRINT TAB''',
            1,
        )
    else:
        print("  ! marker not found — add modal render manually")

    p.write_text(src)
    print("  ✓ added Bulk Import button + modal")


def verify():
    banner("verify")
    ok = True
    for f in [BE / "utils/mcqParser.js",
              BE / "controllers/mcqController.js",
              BE / "routes/mcq.js"]:
        r = subprocess.run(["node", "-c", str(f)], capture_output=True, text=True)
        if r.returncode == 0:
            print(f"  ✓ {f.relative_to(ROOT)}")
        else:
            print(f"  ✗ {f.relative_to(ROOT)}: {(r.stderr or r.stdout).strip()[:200]}")
            ok = False
    return ok


def main():
    print(f"Bulk question import — root: {ROOT}")
    gen_parser()
    gen_controller_patch()
    gen_routes_patch()
    gen_frontend_api()
    gen_frontend_modal()
    patch_mcq_page()

    if not verify():
        sys.exit(1)

    print("\n" + "═" * 62)
    print("✅ Bulk import added.")
    print("═" * 62)
    print("\nRestart:")
    print("  ~/school/start.sh --stop")
    print("  ~/school/start.sh")
    print("\nUI:")
    print("  /mcq/:id → Questions tab → [Bulk Import]")


if __name__ == "__main__":
    main()
