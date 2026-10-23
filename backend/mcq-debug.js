const { buildMcqSheet } = require('./utils/mcqPdfGenerator');
const { all } = require('./config/database');

(async () => {
  const qs = await all('SELECT * FROM mcq_questions WHERE mcq_exam_id = 1 ORDER BY q_number');
  console.log('DB questions:', qs.length);
  console.log('First row:', JSON.stringify(qs[0]));

  const buf = await buildMcqSheet({
    exam: { title: 'T', class_name: 'n', section_name: 'A' },
    questions: qs,
    student: { name: 'Test', roll_number: '1' },
    school: { name: 'X', address: 'Y' },
  });

  console.log('PDF bytes:', buf.length);

  const s = buf.toString('latin1');
  const rects = (s.match(/ re /g) || []).length;
  console.log('Rect draw commands:', rects);

  require('fs').writeFileSync('./debug-sheet.pdf', buf);
  console.log('Wrote debug-sheet.pdf');
})();
