PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;

-- ─── USERS & AUTH ─────────────────────────────────────────────
CREATE TABLE users (
    id               INTEGER      PRIMARY KEY AUTOINCREMENT,
    name             VARCHAR(100) NOT NULL,
    email            VARCHAR(150) NOT NULL UNIQUE COLLATE NOCASE,
    password_hash    VARCHAR(255) NOT NULL,
    role             VARCHAR(20)  NOT NULL
                     CHECK (role IN ('admin','teacher','accountant','student','parent')),
    phone            VARCHAR(20),
    avatar_url       VARCHAR(255),
    status           VARCHAR(20)  NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active','pending','rejected','suspended')),
    approved_by      INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    approved_at      DATETIME,
    rejection_reason VARCHAR(255),
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME
);
CREATE INDEX idx_users_role   ON users(role);
CREATE INDEX idx_users_status ON users(status);

CREATE TABLE refresh_tokens (
    id          INTEGER      PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL,
    expires_at  DATETIME     NOT NULL,
    revoked_at  DATETIME,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_refresh_tokens_user   ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_hash   ON refresh_tokens(token_hash);
CREATE INDEX idx_refresh_tokens_expiry ON refresh_tokens(expires_at);

CREATE TABLE allowed_emails (
    id          INTEGER      PRIMARY KEY AUTOINCREMENT,
    email       TEXT         NOT NULL UNIQUE COLLATE NOCASE,
    role        TEXT         NOT NULL
                CHECK (role IN ('teacher','student','parent','accountant')),
    full_name   TEXT,
    invited_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    used        BOOLEAN      NOT NULL DEFAULT 0,
    used_at     DATETIME,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE invites (
    id          INTEGER      PRIMARY KEY AUTOINCREMENT,
    email       VARCHAR(150) NOT NULL COLLATE NOCASE,
    role        VARCHAR(20)  NOT NULL
                CHECK (role IN ('teacher','student','parent','accountant')),
    invited_by  INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    token_hash  VARCHAR(255) NOT NULL,
    used        BOOLEAN      NOT NULL DEFAULT 0,
    used_at     DATETIME,
    expires_at  DATETIME     NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invites_email ON invites(email);
CREATE INDEX idx_invites_token ON invites(token_hash);

CREATE TABLE pending_registrations (
    id            INTEGER      PRIMARY KEY AUTOINCREMENT,
    name          VARCHAR(100) NOT NULL,
    email         VARCHAR(150) NOT NULL UNIQUE COLLATE NOCASE,
    password_hash VARCHAR(255) NOT NULL,
    role          VARCHAR(20)  NOT NULL
                  CHECK (role IN ('teacher','student','parent','accountant')),
    token_hash    VARCHAR(255) NOT NULL,
    expires_at    DATETIME     NOT NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE password_resets (
    id          INTEGER      PRIMARY KEY AUTOINCREMENT,
    email       VARCHAR(150) NOT NULL COLLATE NOCASE,
    otp_hash    VARCHAR(255) NOT NULL,
    reset_token VARCHAR(255),
    attempts    INTEGER      NOT NULL DEFAULT 0,
    expires_at  DATETIME     NOT NULL,
    used        BOOLEAN      NOT NULL DEFAULT 0,
    purpose     VARCHAR(20)  NOT NULL DEFAULT 'password_reset'
                CHECK (purpose IN ('password_reset','email_verify','2fa')),
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_pwreset_email ON password_resets(email);

-- ─── ACADEMIC STRUCTURE ──────────────────────────────────────
CREATE TABLE academic_years (
    id          INTEGER     PRIMARY KEY AUTOINCREMENT,
    year_name   VARCHAR(20) NOT NULL UNIQUE,
    start_date  DATE        NOT NULL,
    end_date    DATE        NOT NULL,
    is_active   BOOLEAN     NOT NULL DEFAULT 0,
    created_at  DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date > start_date)
);

CREATE TABLE departments (
    id              INTEGER      PRIMARY KEY AUTOINCREMENT,
    department_name VARCHAR(100) NOT NULL UNIQUE,
    created_at      DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE classes (
    id         INTEGER      PRIMARY KEY AUTOINCREMENT,
    class_name VARCHAR(50)  NOT NULL,
    class_code VARCHAR(20)  UNIQUE,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE sections (
    id           INTEGER      PRIMARY KEY AUTOINCREMENT,
    class_id     INTEGER      NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
    section_name VARCHAR(20)  NOT NULL,
    room_number  VARCHAR(20),
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (class_id, section_name)
);
CREATE INDEX idx_sections_class ON sections(class_id);

CREATE TABLE subjects (
    id           INTEGER      PRIMARY KEY AUTOINCREMENT,
    subject_name VARCHAR(100) NOT NULL,
    subject_code VARCHAR(20)  UNIQUE,
    class_id     INTEGER      REFERENCES classes(id) ON DELETE SET NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_subjects_class ON subjects(class_id);

-- ─── PEOPLE ──────────────────────────────────────────────────
CREATE TABLE students (
    id                INTEGER      PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    admission_number  VARCHAR(30)  NOT NULL UNIQUE,
    section_id        INTEGER      REFERENCES sections(id) ON DELETE SET NULL,
    roll_number       VARCHAR(20),
    gender            VARCHAR(10)  CHECK (gender IN ('male','female','other')),
    dob               DATE,
    guardian_name     VARCHAR(100),
    guardian_phone    VARCHAR(20),
    created_at        DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        DATETIME,
    UNIQUE (section_id, roll_number)
);
CREATE INDEX idx_students_section ON students(section_id);

CREATE TABLE teachers (
    id             INTEGER      PRIMARY KEY AUTOINCREMENT,
    user_id        INTEGER      NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    employee_code  VARCHAR(30)  NOT NULL UNIQUE,
    department_id  INTEGER      REFERENCES departments(id) ON DELETE SET NULL,
    qualification  VARCHAR(100),
    join_date      DATE,
    salary_cents   INTEGER      NOT NULL DEFAULT 0 CHECK (salary_cents >= 0),
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME
);
CREATE INDEX idx_teachers_department ON teachers(department_id);

CREATE TABLE parent_students (
    parent_user_id INTEGER NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
    student_id     INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    relationship   VARCHAR(20) DEFAULT 'guardian'
                   CHECK (relationship IN ('father','mother','guardian','other')),
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (parent_user_id, student_id)
);
CREATE INDEX idx_parent_students_student ON parent_students(student_id);

-- ─── ATTENDANCE ──────────────────────────────────────────────
CREATE TABLE attendance (
    id              INTEGER      PRIMARY KEY AUTOINCREMENT,
    student_id      INTEGER      NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date            DATE         NOT NULL,
    status          VARCHAR(10)  NOT NULL
                    CHECK (status IN ('present','absent','late','excused')),
    remarks         VARCHAR(255),
    marked_by       INTEGER      REFERENCES users(id)      ON DELETE SET NULL,
    superseded_by   INTEGER      REFERENCES attendance(id) ON DELETE SET NULL,
    marked_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    superseded_at   DATETIME,
    UNIQUE (student_id, date)
);
CREATE INDEX idx_attendance_date      ON attendance(date);
CREATE INDEX idx_attendance_student   ON attendance(student_id);
CREATE INDEX idx_attendance_marked_by ON attendance(marked_by);

-- ─── COMMUNICATION ───────────────────────────────────────────
CREATE TABLE notices (
    id                INTEGER      PRIMARY KEY AUTOINCREMENT,
    title             VARCHAR(255) NOT NULL,
    content           TEXT         NOT NULL,
    target_role       VARCHAR(20)  NOT NULL DEFAULT 'all'
                      CHECK (target_role IN ('all','admin','teacher','student','parent','accountant')),
    target_class_id   INTEGER      REFERENCES classes(id)  ON DELETE SET NULL,
    target_section_id INTEGER      REFERENCES sections(id) ON DELETE SET NULL,
    posted_by         INTEGER      REFERENCES users(id)    ON DELETE SET NULL,
    expires_at        DATE,
    is_active         BOOLEAN      NOT NULL DEFAULT 1,
    posted_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notices_active ON notices(is_active, posted_at);

CREATE TABLE notifications (
    id         INTEGER  PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER  NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
    notice_id  INTEGER  NOT NULL REFERENCES notices(id) ON DELETE CASCADE,
    is_read    BOOLEAN  NOT NULL DEFAULT 0,
    read_at    DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user_id, notice_id)
);
CREATE INDEX idx_notifications_user ON notifications(user_id, is_read);

CREATE TABLE materials (
    id            INTEGER      PRIMARY KEY AUTOINCREMENT,
    title         TEXT         NOT NULL,
    description   TEXT,
    kind          TEXT         NOT NULL DEFAULT 'other'
                  CHECK (kind IN ('lecture','notice','assignment','other')),
    class_id      INTEGER      REFERENCES classes(id)  ON DELETE SET NULL,
    section_id    INTEGER      REFERENCES sections(id) ON DELETE SET NULL,
    subject_id    INTEGER      REFERENCES subjects(id) ON DELETE SET NULL,
    file_url      TEXT         NOT NULL,
    original_name TEXT,
    mime_type     TEXT,
    size_bytes    INTEGER      CHECK (size_bytes IS NULL OR size_bytes >= 0),
    uploaded_by   INTEGER      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_materials_kind     ON materials(kind);
CREATE INDEX idx_materials_class    ON materials(class_id, section_id);
CREATE INDEX idx_materials_uploader ON materials(uploaded_by);

-- ─── EXAMS (marks-based) ─────────────────────────────────────
CREATE TABLE exam_types (
    id         INTEGER      PRIMARY KEY AUTOINCREMENT,
    type_name  VARCHAR(50)  NOT NULL UNIQUE,
    weightage  REAL         CHECK (weightage IS NULL OR (weightage >= 0 AND weightage <= 1))
);

CREATE TABLE exams (
    id               INTEGER      PRIMARY KEY AUTOINCREMENT,
    exam_name        VARCHAR(100) NOT NULL,
    exam_type_id     INTEGER      REFERENCES exam_types(id)    ON DELETE SET NULL,
    academic_year_id INTEGER      REFERENCES academic_years(id) ON DELETE CASCADE,
    class_id         INTEGER      REFERENCES classes(id)        ON DELETE CASCADE,
    start_date       DATE,
    end_date         DATE,
    total_marks      REAL         CHECK (total_marks IS NULL OR total_marks > 0),
    passing_marks    REAL         CHECK (passing_marks IS NULL OR passing_marks >= 0),
    is_active        BOOLEAN      NOT NULL DEFAULT 1,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
    CHECK (passing_marks IS NULL OR total_marks IS NULL OR passing_marks <= total_marks)
);
CREATE INDEX idx_exams_class ON exams(class_id, academic_year_id);

CREATE TABLE exam_marks (
    id             INTEGER      PRIMARY KEY AUTOINCREMENT,
    exam_id        INTEGER      NOT NULL REFERENCES exams(id)    ON DELETE CASCADE,
    student_id     INTEGER      NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    subject_id     INTEGER      NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    marks_obtained REAL         NOT NULL CHECK (marks_obtained >= 0),
    total_marks    REAL         NOT NULL CHECK (total_marks > 0),
    remarks        VARCHAR(255),
    entered_by     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    entered_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (exam_id, student_id, subject_id),
    CHECK (marks_obtained <= total_marks)
);
CREATE INDEX idx_exam_marks_student ON exam_marks(student_id);

CREATE TABLE grade_system (
    id             INTEGER      PRIMARY KEY AUTOINCREMENT,
    grade          VARCHAR(5)   NOT NULL UNIQUE,
    min_percentage REAL         NOT NULL CHECK (min_percentage >= 0 AND min_percentage <= 100),
    max_percentage REAL         NOT NULL CHECK (max_percentage >= 0 AND max_percentage <= 100),
    grade_point    REAL         CHECK (grade_point IS NULL OR (grade_point >= 0 AND grade_point <= 5)),
    remarks        VARCHAR(50),
    CHECK (max_percentage > min_percentage)
);

-- ─── TIMETABLE & HOMEWORK ────────────────────────────────────
CREATE TABLE timetables (
    id           INTEGER      PRIMARY KEY AUTOINCREMENT,
    section_id   INTEGER      NOT NULL REFERENCES sections(id) ON DELETE CASCADE,
    subject_id   INTEGER      NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id   INTEGER      REFERENCES teachers(id) ON DELETE SET NULL,
    day_of_week  VARCHAR(15)  NOT NULL
                 CHECK (day_of_week IN ('monday','tuesday','wednesday','thursday','friday','saturday','sunday')),
    start_time   TIME         NOT NULL,
    end_time     TIME         NOT NULL,
    is_active    BOOLEAN      NOT NULL DEFAULT 1,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (section_id, day_of_week, start_time),
    CHECK (end_time > start_time)
);
CREATE INDEX idx_timetable_teacher ON timetables(teacher_id, day_of_week);
CREATE INDEX idx_timetable_section ON timetables(section_id, day_of_week);
CREATE UNIQUE INDEX uq_teacher_slot
    ON timetables(teacher_id, day_of_week, start_time)
    WHERE is_active = 1 AND teacher_id IS NOT NULL;

CREATE TABLE homework (
    id             INTEGER      PRIMARY KEY AUTOINCREMENT,
    subject_id     INTEGER      NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    teacher_id     INTEGER      REFERENCES teachers(id) ON DELETE SET NULL,
    title          VARCHAR(255) NOT NULL,
    description    TEXT,
    due_date       DATE         NOT NULL,
    attachment_url VARCHAR(255),
    updated_by     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at     DATETIME
);
CREATE INDEX idx_homework_subject ON homework(subject_id, due_date);

CREATE TABLE homework_submissions (
    id              INTEGER      PRIMARY KEY AUTOINCREMENT,
    homework_id     INTEGER      NOT NULL REFERENCES homework(id) ON DELETE CASCADE,
    student_id      INTEGER      NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    submission_date DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    attachment_url  VARCHAR(255),
    remarks         VARCHAR(255),
    grade           VARCHAR(20),
    graded_by       INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    graded_at       DATETIME,
    UNIQUE (homework_id, student_id)
);
CREATE INDEX idx_hwsub_student ON homework_submissions(student_id);

-- ─── MCQ EXAMS ───────────────────────────────────────────────
CREATE TABLE mcq_exams (
    id                 INTEGER      PRIMARY KEY AUTOINCREMENT,
    title              VARCHAR(200) NOT NULL,
    class_id           INTEGER      REFERENCES classes(id)  ON DELETE SET NULL,
    section_id         INTEGER      REFERENCES sections(id) ON DELETE SET NULL,
    subject_id         INTEGER      REFERENCES subjects(id) ON DELETE SET NULL,
    total_questions    INTEGER      NOT NULL DEFAULT 0 CHECK (total_questions >= 0),
    marks_per_question REAL         NOT NULL DEFAULT 1 CHECK (marks_per_question > 0),
    negative_marks     REAL         NOT NULL DEFAULT 0 CHECK (negative_marks >= 0),
    exam_date          DATE,
    sheet_mode         VARCHAR(20)  NOT NULL DEFAULT 'full'
                       CHECK (sheet_mode IN ('full','answers_only','custom')),
    is_published       INTEGER      NOT NULL DEFAULT 0 CHECK (is_published IN (0,1)),
    access_code        TEXT,
    time_limit_minutes INTEGER      CHECK (time_limit_minutes IS NULL OR time_limit_minutes > 0),
    proctoring_enabled INTEGER      NOT NULL DEFAULT 1 CHECK (proctoring_enabled IN (0,1)),
    scheduled_start_at TEXT,
    scheduled_end_at   TEXT,
    schedule_state     TEXT         NOT NULL DEFAULT 'draft'
                       CHECK (schedule_state IN ('draft','scheduled','open','closed','archived')),
    created_by         INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    created_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mcq_exams_schedule ON mcq_exams(schedule_state, scheduled_start_at, scheduled_end_at);

CREATE TABLE mcq_questions (
    id             INTEGER      PRIMARY KEY AUTOINCREMENT,
    mcq_exam_id    INTEGER      NOT NULL REFERENCES mcq_exams(id) ON DELETE CASCADE,
    q_number       INTEGER      NOT NULL CHECK (q_number > 0),
    question_text  TEXT,
    option_a       TEXT,
    option_b       TEXT,
    option_c       TEXT,
    option_d       TEXT,
    correct_option VARCHAR(1)   NOT NULL CHECK (correct_option IN ('A','B','C','D')),
    UNIQUE (mcq_exam_id, q_number)
);

CREATE TABLE mcq_submissions (
    id                  INTEGER      PRIMARY KEY AUTOINCREMENT,
    mcq_exam_id         INTEGER      NOT NULL REFERENCES mcq_exams(id) ON DELETE CASCADE,
    student_id          INTEGER      REFERENCES students(id) ON DELETE SET NULL,
    detected_roll       VARCHAR(50),
    detected_name       VARCHAR(200),
    extracted_answers   TEXT,
    score               REAL         CHECK (score IS NULL OR score >= 0),
    correct_count       INTEGER      CHECK (correct_count IS NULL OR correct_count >= 0),
    wrong_count         INTEGER      CHECK (wrong_count IS NULL OR wrong_count >= 0),
    blank_count         INTEGER      CHECK (blank_count IS NULL OR blank_count >= 0),
    image_path          VARCHAR(255),
    raw_gemini_response TEXT,
    status              VARCHAR(20)  NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','confirmed','unmatched','failed')),
    created_at          DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mcq_sub_exam    ON mcq_submissions(mcq_exam_id);
CREATE INDEX idx_mcq_sub_student ON mcq_submissions(student_id);
CREATE INDEX idx_mcq_sub_status  ON mcq_submissions(status);

CREATE TABLE mcq_attempts (
    id                      INTEGER  PRIMARY KEY AUTOINCREMENT,
    mcq_exam_id             INTEGER  NOT NULL REFERENCES mcq_exams(id) ON DELETE CASCADE,
    student_id              INTEGER  NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    started_at              DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    submitted_at            DATETIME,
    answers                 TEXT,
    score                   INTEGER  NOT NULL DEFAULT 0 CHECK (score >= 0),
    correct_count           INTEGER  NOT NULL DEFAULT 0 CHECK (correct_count >= 0),
    wrong_count             INTEGER  NOT NULL DEFAULT 0 CHECK (wrong_count >= 0),
    blank_count             INTEGER  NOT NULL DEFAULT 0 CHECK (blank_count >= 0),
    status                  TEXT     NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress','submitted','flagged','invalidated')),
    time_limit_seconds      INTEGER  CHECK (time_limit_seconds IS NULL OR time_limit_seconds > 0),
    total_questions         INTEGER  CHECK (total_questions IS NULL OR total_questions >= 0),
    flagged_count           INTEGER  NOT NULL DEFAULT 0 CHECK (flagged_count >= 0),
    exam_scheduled_start_at TEXT,
    reviewed_by             INTEGER  REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at             DATETIME,
    review_note             TEXT,
    UNIQUE (mcq_exam_id, student_id)
);
CREATE INDEX idx_attempts_exam    ON mcq_attempts(mcq_exam_id);
CREATE INDEX idx_attempts_student ON mcq_attempts(student_id);
CREATE INDEX idx_attempts_status  ON mcq_attempts(status);

-- ─── PROCTORING ──────────────────────────────────────────────
CREATE TABLE proctoring_events (
    id          INTEGER  PRIMARY KEY AUTOINCREMENT,
    attempt_id  INTEGER  NOT NULL REFERENCES mcq_attempts(id) ON DELETE CASCADE,
    kind        TEXT     NOT NULL,
    payload     TEXT,
    at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_proctor_attempt ON proctoring_events(attempt_id);
CREATE INDEX idx_proctor_kind    ON proctoring_events(kind);

CREATE TABLE proctoring_recordings (
    id          INTEGER      PRIMARY KEY AUTOINCREMENT,
    attempt_id  INTEGER      NOT NULL REFERENCES mcq_attempts(id) ON DELETE CASCADE,
    seq         INTEGER      NOT NULL CHECK (seq > 0),
    file_url    TEXT         NOT NULL,
    size_bytes  INTEGER      CHECK (size_bytes IS NULL OR size_bytes >= 0),
    mime_type   TEXT         NOT NULL DEFAULT 'video/webm',
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (attempt_id, seq)
);
CREATE INDEX idx_proctor_rec_attempt ON proctoring_recordings(attempt_id, seq);

CREATE TRIGGER trg_mcq_state_invariant
BEFORE UPDATE OF is_published, schedule_state ON mcq_exams
FOR EACH ROW
WHEN NEW.is_published = 1 AND NEW.schedule_state NOT IN ('scheduled', 'open')
BEGIN
    SELECT RAISE(ABORT,
        'invariant violated: is_published=1 requires schedule_state in (scheduled,open)');
END;

-- ─── LIBRARY ─────────────────────────────────────────────────
CREATE TABLE books (
    id               INTEGER      PRIMARY KEY AUTOINCREMENT,
    title            VARCHAR(255) NOT NULL,
    author           VARCHAR(100),
    isbn             VARCHAR(20)  UNIQUE,
    publisher        VARCHAR(100),
    publication_year INTEGER      CHECK (publication_year IS NULL OR (publication_year BETWEEN 1000 AND 9999)),
    total_copies     INTEGER      NOT NULL DEFAULT 1 CHECK (total_copies >= 0),
    available_copies INTEGER      NOT NULL DEFAULT 1 CHECK (available_copies >= 0),
    category         VARCHAR(50),
    shelf_location   VARCHAR(50),
    is_active        BOOLEAN      NOT NULL DEFAULT 1,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (available_copies <= total_copies)
);

CREATE TABLE book_issues (
    id           INTEGER      PRIMARY KEY AUTOINCREMENT,
    book_id      INTEGER      NOT NULL REFERENCES books(id)    ON DELETE CASCADE,
    student_id   INTEGER      NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    issue_date   DATE         NOT NULL,
    due_date     DATE         NOT NULL,
    return_date  DATE,
    status       VARCHAR(20)  NOT NULL DEFAULT 'issued'
                 CHECK (status IN ('issued','returned','overdue','lost')),
    fine_cents   INTEGER      NOT NULL DEFAULT 0 CHECK (fine_cents >= 0),
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (due_date >= issue_date),
    CHECK (return_date IS NULL OR return_date >= issue_date)
);
CREATE INDEX idx_book_issues_student ON book_issues(student_id, status);
CREATE INDEX idx_book_issues_book    ON book_issues(book_id, status);

-- ─── FINANCE ─────────────────────────────────────────────────
CREATE TABLE invoices (
    id             INTEGER      PRIMARY KEY AUTOINCREMENT,
    student_id     INTEGER      NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    invoice_number VARCHAR(50)  NOT NULL UNIQUE,
    amount_cents   INTEGER      NOT NULL CHECK (amount_cents >= 0),
    total_cents    INTEGER      NOT NULL CHECK (total_cents >= 0),
    due_date       DATE,
    status         VARCHAR(20)  NOT NULL DEFAULT 'unpaid'
                   CHECK (status IN ('unpaid','partial','paid','cancelled','overdue')),
    created_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_invoices_student ON invoices(student_id, status);

CREATE TABLE payments (
    id                INTEGER      PRIMARY KEY AUTOINCREMENT,
    invoice_id        INTEGER      NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    amount_paid_cents INTEGER      NOT NULL CHECK (amount_paid_cents > 0),
    payment_method    VARCHAR(20)
                      CHECK (payment_method IN ('cash','card','bank_transfer','online','other')),
    paid_by           INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    notes             TEXT,
    paid_at           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);

-- ─── SYSTEM ──────────────────────────────────────────────────
CREATE TABLE approvals (
    id             INTEGER  PRIMARY KEY AUTOINCREMENT,
    resource_type  TEXT     NOT NULL,
    action         TEXT     NOT NULL
                   CHECK (action IN ('create','update','delete')),
    resource_id    INTEGER,
    payload        TEXT,
    status         TEXT     NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','cancelled')),
    requested_by   INTEGER  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    requested_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_by    INTEGER  REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at    DATETIME,
    review_note    TEXT
);
CREATE INDEX idx_approvals_status ON approvals(status, resource_type);
CREATE INDEX idx_approvals_req    ON approvals(requested_by, status);

CREATE TABLE audit_logs (
    id          INTEGER      PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER      REFERENCES users(id) ON DELETE SET NULL,
    action      VARCHAR(50)  NOT NULL,
    entity      VARCHAR(50),
    entity_id   INTEGER,
    details     TEXT,
    ip          VARCHAR(45),
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_audit_user   ON audit_logs(user_id);
CREATE INDEX idx_audit_entity ON audit_logs(entity, entity_id);

CREATE TABLE system_settings (
    id            INTEGER      PRIMARY KEY AUTOINCREMENT,
    setting_key   VARCHAR(100) NOT NULL UNIQUE,
    setting_value TEXT,
    setting_type  VARCHAR(20)  NOT NULL DEFAULT 'string'
                  CHECK (setting_type IN ('string','number','boolean','json')),
    description   VARCHAR(255),
    updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
