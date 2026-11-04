#!/usr/bin/env python3
"""
seed_teachers.py (v3 — final, schema-matched)

Classes 6..10, 9 subjects each, one teacher per (class, subject).
Password: Mmaf09m032.

`teachers` schema:
  id, user_id (NN), employee_code (NN), department_id, qualification,
  join_date, salary_cents (NN default 0), created_at, updated_at

There is no `subject_id` on `teachers`, so subject association lives in
`subjects` / `class_subjects` if that table exists — we seed `subjects`
rows and store the subject in the employee_code / qualification path.
"""

import sqlite3
import subprocess
import sys
from datetime import date
from pathlib import Path

DB = Path("school_management.db")
DEFAULT_PASS = "Mmaf09m032."


def bcrypt_hash(pw):
    out = subprocess.check_output(
        ["node", "-e",
         "console.log(require('bcryptjs').hashSync(process.argv[1],10))",
         pw],
        text=True,
    )
    h = out.strip()
    if len(h) != 60 or not h.startswith(("$2a$", "$2b$")):
        print(f"✗ bcrypt failed: {h!r}", file=sys.stderr)
        sys.exit(1)
    return h


def col_names(cur, table):
    cur.execute(f"PRAGMA table_info({table})")
    return [r[1] for r in cur.fetchall()]


def find_subject_id(cur, name):
    cur.execute("SELECT id FROM subjects WHERE LOWER(subject_name) = LOWER(?)", (name,))
    r = cur.fetchone()
    return r[0] if r else None


def ensure_subject(cur, name):
    sid = find_subject_id(cur, name)
    if sid:
        return sid
    cur.execute("INSERT INTO subjects (subject_name) VALUES (?)", (name,))
    print(f"  + subject '{name}'")
    return cur.lastrowid


def ensure_department(cur, name, dcols):
    col = "department_name" if "department_name" in dcols else ("name" if "name" in dcols else None)
    if not col:
        return None
    cur.execute(f"SELECT id FROM departments WHERE LOWER({col}) = LOWER(?)", (name,))
    r = cur.fetchone()
    if r:
        return r[0]
    cur.execute(f"INSERT INTO departments ({col}) VALUES (?)", (name,))
    print(f"  + department '{name}'")
    return cur.lastrowid


def upsert_teacher(cur, hash_, *, name, email, employee_code,
                   department_id, qualification, join_date):
    # 1) users row
    cur.execute("SELECT id FROM users WHERE email = ?", (email,))
    u = cur.fetchone()
    if u:
        user_id = u[0]
        cur.execute(
            "UPDATE users SET name = ?, password_hash = ?, role = 'teacher', "
            "status = 'active' WHERE id = ?",
            (name, hash_, user_id),
        )
    else:
        cur.execute(
            "INSERT INTO users (name, email, password_hash, role, status) "
            "VALUES (?, ?, ?, 'teacher', 'active')",
            (name, email, hash_),
        )
        user_id = cur.lastrowid

    # 2) teachers row — exactly the NOT NULL columns we must supply
    cur.execute("SELECT id FROM teachers WHERE user_id = ?", (user_id,))
    t = cur.fetchone()
    if t:
        tid = t[0]
        cur.execute(
            "UPDATE teachers SET employee_code = ?, department_id = ?, "
            "qualification = ?, join_date = ? WHERE id = ?",
            (employee_code, department_id, qualification, join_date, tid),
        )
        return tid
    cur.execute(
        "INSERT INTO teachers "
        "(user_id, employee_code, department_id, qualification, join_date, salary_cents) "
        "VALUES (?, ?, ?, ?, ?, 0)",
        (user_id, employee_code, department_id, qualification, join_date),
    )
    return cur.lastrowid


SUBJECT_DEPT = {
    "Tarjmatul Quran": "Islamic Studies",
    "Islamiyat":       "Islamic Studies",
    "Math":            "Mathematics",
    "English":         "Languages",
    "Physics":         "Science",
    "Chemistry":       "Science",
    "Biology":         "Science",
    "Computer":        "Computer Science",
    "Pak Studies":     "Social Sciences",
}

CLASS_SUBJECTS = {c: [
    "Tarjmatul Quran", "Math", "English", "Physics",
    "Chemistry", "Biology", "Computer", "Islamiyat", "Pak Studies",
] for c in (6, 7, 8, 9, 10)}

NAMES = {
    "Tarjmatul Quran": ["Qari Ahmed", "Hafiz Bilal", "Qari Saeed", "Hafiz Imran", "Qari Yasir"],
    "Math":            ["Anil Kumar", "Rehan Ali", "Zubair Khan", "Kamran Jamil", "Salman Yousaf"],
    "English":         ["Sara Iqbal", "Mariam Shah", "Ayesha Noor", "Hassan Raza", "Rabia Nasir"],
    "Physics":         ["Hamid Raza", "Bilal Aslam", "Kiran Shahid", "Faisal Hussain", "Zafar Ali"],
    "Chemistry":       ["Tehreem Akhtar", "Waqas Iqbal", "Adeel Butt", "Bushra Kausar", "Ali Hamza"],
    "Biology":         ["Shazia Batool", "Imran Akhtar", "Sadia Malik", "Nasir Mehmood", "Rukhsana Bibi"],
    "Computer":        ["Usman Ghani", "Farhan Malik", "Sohail Abbas", "Nabeel Anwar", "Zainab Rizvi"],
    "Islamiyat":       ["M. Faizan", "Iqbal Hussain", "Umar Farooq", "Tariq Javed", "Faryal Siddiqui"],
    "Pak Studies":     ["Sadia Malik", "Asad Iqbal", "Nadia Bukhari", "Waseem Akram", "Samina Riaz"],
}

QUALIFICATIONS = {
    "Tarjmatul Quran": "Shahadat-ul-Almiya / Hafiz-e-Quran",
    "Math":            "MSc Mathematics",
    "English":         "MA English",
    "Physics":         "MSc Physics",
    "Chemistry":       "MSc Chemistry",
    "Biology":         "MSc Biology",
    "Computer":        "MSc Computer Science",
    "Islamiyat":       "MA Islamic Studies",
    "Pak Studies":     "MA Pakistan Studies",
}

SUBJ_ABBR = {
    "Tarjmatul Quran": "TQ",
    "Islamiyat":       "ISL",
    "Math":            "MATH",
    "English":         "ENG",
    "Physics":         "PHY",
    "Chemistry":       "CHEM",
    "Biology":         "BIO",
    "Computer":        "COMP",
    "Pak Studies":     "PS",
}


def email_for(name, subject, class_num):
    slug = name.lower().replace(" ", ".").replace("m.", "m")
    subj = SUBJ_ABBR[subject].lower()
    return f"{slug}.{subj}{class_num}@school.local"


def main():
    if not DB.exists():
        print(f"✗ {DB} not found", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    cur = con.cursor()

    print("teachers columns:   ", col_names(cur, "teachers"))
    print("departments columns:", col_names(cur, "departments"))

    # Ensure the 9 subjects exist
    for subj in set(s for v in CLASS_SUBJECTS.values() for s in v):
        ensure_subject(cur, subj)

    dcols = col_names(cur, "departments")
    dept_ids = {dept: ensure_department(cur, dept, dcols)
                for dept in set(SUBJECT_DEPT.values())}

    hash_ = bcrypt_hash(DEFAULT_PASS)
    print(f"password hash: {hash_[:7]}… len={len(hash_)}")

    used = {s: 0 for s in NAMES}
    total = 0

    for class_num in sorted(CLASS_SUBJECTS):
        print(f"\nclass {class_num}:")
        for subj in CLASS_SUBJECTS[class_num]:
            pool = NAMES[subj]
            name = pool[used[subj] % len(pool)]
            used[subj] += 1
            idx = used[subj]

            employee_code = f"TCH-{class_num:02d}-{SUBJ_ABBR[subj]}-{idx:02d}"
            email = email_for(name, subj, class_num)

            upsert_teacher(
                cur, hash_,
                name=name,
                email=email,
                employee_code=employee_code,
                department_id=dept_ids.get(SUBJECT_DEPT[subj]),
                qualification=QUALIFICATIONS[subj],
                join_date=f"{2020 + (class_num - 6)}-04-01",
            )
            total += 1
            print(f"  ✓ {email:<45} → {subj:<18} [{employee_code}]")

    con.commit()

    # ── report ──
    print("\n=== FINAL TEACHERS ===")
    cur.execute("""
        SELECT u.email, u.name, t.employee_code,
               (SELECT department_name FROM departments WHERE id=t.department_id) AS dept,
               t.qualification
          FROM users u JOIN teachers t ON t.user_id = u.id
         WHERE u.role = 'teacher'
         ORDER BY t.employee_code
    """)
    rows = cur.fetchall()
    print(f"total: {len(rows)}\n")
    for email, name, code, dept, qual in rows:
        print(f"  {code:<24} {email:<45} {(dept or '-'):<18} {name}")

    con.close()
    print(f"\nDone. {total} teacher(s) seeded. Password: {DEFAULT_PASS}")


if __name__ == "__main__":
    main()
