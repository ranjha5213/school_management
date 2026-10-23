CREATE TABLE IF NOT EXISTS mcq_exams (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title VARCHAR(200) NOT NULL,
    class_id INTEGER REFERENCES classes(id) ON DELETE SET NULL,
    section_id INTEGER REFERENCES sections(id) ON DELETE SET NULL,
    subject_id INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
    total_questions INTEGER NOT NULL DEFAULT 0,
    marks_per_question REAL NOT NULL DEFAULT 1,
    negative_marks REAL NOT NULL DEFAULT 0,
    exam_date DATE,
    created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mcq_questions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mcq_exam_id INTEGER NOT NULL REFERENCES mcq_exams(id) ON DELETE CASCADE,
    q_number INTEGER NOT NULL,
    question_text TEXT,
    option_a TEXT,
    option_b TEXT,
    option_c TEXT,
    option_d TEXT,
    correct_option VARCHAR(1) NOT NULL CHECK(correct_option IN ('A','B','C','D')),
    UNIQUE(mcq_exam_id, q_number)
);

CREATE TABLE IF NOT EXISTS mcq_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    mcq_exam_id INTEGER NOT NULL REFERENCES mcq_exams(id) ON DELETE CASCADE,
    student_id INTEGER REFERENCES students(id) ON DELETE SET NULL,
    detected_roll VARCHAR(50),
    detected_name VARCHAR(200),
    extracted_answers TEXT,        -- JSON: {"1":"A","2":"B",...}
    score REAL,
    correct_count INTEGER,
    wrong_count INTEGER,
    blank_count INTEGER,
    image_path VARCHAR(255),
    raw_gemini_response TEXT,
    status VARCHAR(20) DEFAULT 'pending',  -- pending | confirmed | unmatched | failed
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_mcq_sub_exam ON mcq_submissions(mcq_exam_id);
CREATE INDEX IF NOT EXISTS idx_mcq_sub_student ON mcq_submissions(student_id);
