CREATE TABLE IF NOT EXISTS allowed_emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('teacher','student','parent','accountant')),
    full_name TEXT,
    invited_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
    used BOOLEAN DEFAULT 0,
    used_at DATETIME,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
