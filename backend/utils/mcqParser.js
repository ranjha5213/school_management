// Parser for pasted MCQ text.
//
// Accepted format (loose):
//   1. What is 2+2?
//   A) 3
//   B) 4
//   C) 5
//   D) 6
//   Answer: B
//
// Also accepts:  1) / Q1 / Q1.  for question lines
//                A. / (A) / a)  for options
//                Answer: B / Ans: B / => B / Answer - B
//
// Blank lines between questions are optional.

const QUESTION_RE = /^\s*(?:Q\s*)?(\d+)\s*[.)\]:-]\s*(.*)$/i;
const OPTION_RE   = /^\s*\(?\s*([A-Da-d])\s*[.)\]:-]\s*(.*)$/;
const ANSWER_RE   = /^\s*(?:Answer|Ans|Correct|=>)\s*[:\-]?\s*([A-Da-d])\b/i;

function parseText(text) {
  if (!text || typeof text !== 'string') return [];

  const lines = text.replace(/\r\n?/g, '\n').split('\n');

  const questions = [];
  let cur = null;

  const pushCur = () => {
    if (!cur) return;
    // Trim options
    cur.option_a = (cur.option_a || '').trim();
    cur.option_b = (cur.option_b || '').trim();
    cur.option_c = (cur.option_c || '').trim();
    cur.option_d = (cur.option_d || '').trim();
    cur.question_text = (cur.question_text || '').trim();
    if (cur.correct_option) cur.correct_option = cur.correct_option.toUpperCase();

    // Only keep if we have some content
    if (cur.question_text || cur.option_a || cur.option_b || cur.option_c || cur.option_d) {
      questions.push(cur);
    }
    cur = null;
  };

  for (let raw of lines) {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) continue;

    // Answer line?
    const am = line.match(ANSWER_RE);
    if (am && cur) {
      cur.correct_option = am[1].toUpperCase();
      continue;
    }

    // Question line?
    const qm = line.match(QUESTION_RE);
    if (qm && (qm[2] || /[.?!]/.test(qm[2] || ''))) {
      // Heuristic: a real question line has digits followed by text OR ends with ?/.
      // Avoids treating "3 = 1+2" as a question line.
      const num = Number(qm[1]);
      const body = (qm[2] || '').trim();
      // If body is empty and it's not clearly a question, skip
      if (!body && !/[.?!]/.test(line)) continue;
      pushCur();
      cur = {
        q_number: num,
        question_text: body,
        option_a: '', option_b: '', option_c: '', option_d: '',
        correct_option: '',
      };
      continue;
    }

    // Option line?
    const om = line.match(OPTION_RE);
    if (om && cur) {
      const letter = om[1].toLowerCase();
      const text_ = (om[2] || '').trim();
      cur[`option_${letter}`] = text_;
      continue;
    }

    // Continuation line — append to question_text if we haven't started options
    if (cur) {
      const hasOptions = cur.option_a || cur.option_b || cur.option_c || cur.option_d;
      if (!hasOptions) {
        cur.question_text = (cur.question_text ? cur.question_text + ' ' : '') + line.trim();
      }
    }
  }
  pushCur();

  return questions;
}

module.exports = { parseText };
