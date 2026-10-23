const { GoogleGenAI } = require('@google/genai');
const fs = require('fs');
const logger = require('./logger');

const MODEL = process.env.GEMINI_MODEL || 'gemini-2.0-flash';

let client = null;
const getClient = () => {
  if (client) return client;
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set in backend/.env');
  client = new GoogleGenAI({ apiKey: key });
  return client;
};

/**
 * Extract answers from an MCQ answer sheet.
 * Returns: { roll, name, answers: {"1":"A",...}, confidence, notes, raw }
 */
const extractMcqSheet = async ({ imagePath, totalQuestions, examTitle, className, sectionName }) => {
  const ai = getClient();

  const prompt = `You are an OCR system reading a completed MCQ answer sheet.

Context:
- Exam: ${examTitle || 'MCQ Test'}
- Class: ${className || '—'} / Section: ${sectionName || '—'}
- Total questions: ${totalQuestions}

The sheet has:
- Printed fields: "Roll No: ___", "Name: ___", "Class: ___", "Section: ___"
- ${totalQuestions} numbered questions with options A / B / C / D
- The student has placed a TICK (✓) or CROSS (X) next to exactly ONE option per question

Your job:
1. Read the roll number written/printed at the top (under "Roll No:").
2. Read the student name written/printed at the top (under "Name:").
3. For each question 1 to ${totalQuestions}, determine which single option the student ticked.

Rules per question:
- Exactly one tick → return that letter (A / B / C / D)
- No tick → return "X"
- Multiple ticks or unreadable → return "?"

Return ONLY valid JSON — no markdown, no commentary:
{
  "roll": "string or empty",
  "name": "string or empty",
  "answers": { "1": "A", "2": "B", "3": "X", ... up to ${totalQuestions} },
  "confidence": 0.0-1.0,
  "notes": "optional short note"
}`;

  const imageData = fs.readFileSync(imagePath);

  const result = await ai.models.generateContent({
    model: MODEL,
    contents: [
      {
        role: 'user',
        parts: [
          { text: prompt },
          {
            inlineData: {
              data: imageData.toString('base64'),
              mimeType: guessMime(imagePath),
            },
          },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
    },
  });

  const text =
    result.text ||
    result.candidates?.[0]?.content?.parts?.[0]?.text ||
    '';

  const json = extractJson(text);
  if (!json) {
    logger.error(`[gemini] non-JSON response: ${text.slice(0, 300)}`);
    throw new Error('Gemini did not return valid JSON');
  }

  const answers = {};
  for (let i = 1; i <= totalQuestions; i++) {
    const raw = json.answers?.[String(i)] ?? json.answers?.[i];
    answers[String(i)] = normalizeAnswer(raw);
  }

  return {
    roll: String(json.roll || '').trim(),
    name: String(json.name || '').trim(),
    answers,
    confidence: Number(json.confidence) || 0,
    notes: json.notes || '',
    raw: text,
  };
};

const normalizeAnswer = (v) => {
  if (!v) return 'X';
  const s = String(v).trim().toUpperCase();
  if (['A', 'B', 'C', 'D'].includes(s)) return s;
  if (s === '' || s === 'X' || s === 'BLANK' || s === 'NONE') return 'X';
  return '?';
};

const guessMime = (p) => {
  const ext = p.toLowerCase().split('.').pop();
  return {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp',
  }[ext] || 'image/jpeg';
};

const extractJson = (text) => {
  try { return JSON.parse(text); } catch {}
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch {}
  return null;
};

module.exports = { extractMcqSheet };
