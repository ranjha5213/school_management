import os

controller_path = os.path.expanduser('~/school/backend/controllers/mcqController.js')

with open(controller_path, 'r') as f:
    content = f.read()

# Replace the insecure getExam implementation
old_get_exam = """const getExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');
    const [questions, submissions] = await Promise.all([
      McqModel.listQuestions(id),
      McqModel.listSubmissions(id),
    ]);
    return apiResponse(res, 200, true, 'MCQ exam', { exam, questions, submissions });
  } catch (e) { next(e); }
};"""

new_get_exam = """const getExam = async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const exam = await McqModel.findExam(id);
    if (!exam) return apiResponse(res, 404, false, 'MCQ exam not found');

    const isStudent = req.user && req.user.role === 'student';
    const questions = isStudent
      ? await McqModel.questionsWithoutAnswers(id)
      : await McqModel.listQuestions(id);

    const submissions = (!isStudent)
      ? await McqModel.listSubmissions(id)
      : [];

    return apiResponse(res, 200, true, 'MCQ exam', { exam, questions, submissions });
  } catch (e) { next(e); }
};"""

if old_get_exam in content:
    content = content.replace(old_get_exam, new_get_exam)
    with open(controller_path, 'w') as f:
        f.write(content)
    print("✔ Successfully patched controllers/mcqController.js!")
else:
    print("⚠ Could not automatically locate exact getExam block. Please verify the file.")

