#!/usr/bin/env python3
"""
seed_timetable.py

Populates teachers, subjects, and timetables from the GHS Dhori PDF.

Scope: ONLY Section A of classes 6, 7, 8, 9, 10.
Section B is left for the admin to fill based on the school's actual shift
(there's only one teacher per subject per class in the PDF, so populating
both A and B would double-book every teacher).

Period times:
  Mon-Thu: 1st 8:55-9:15  | 2nd 9:15-9:45  | 3rd 9:45-10:15 |
           4th 10:15-10:45 | 5th 10:45-11:15 | 6th 11:15-11:45 |
           7th 12:10-12:40 | 8th 12:40-13:10 | 9th 13:10-13:30
  Friday:  1st 8:55-9:25  | 2nd 9:25-10:00  | 3rd 10:00-10:30 |
           4th 10:30-11:00 | 5th 11:00-11:30 | 6th 11:30-12:00 |
           7th 12:00-12:30   (no 8th or 9th on Friday)

'1-5' in the PDF = Mon-Fri; '1-4' = Mon-Thu; '3-4' = Wed-Thu.

Idempotent — safe to re-run.
All seeded teachers have password Mmaf09m032.
"""

import sqlite3
import subprocess
import sys
from pathlib import Path

DB = Path("school_management.db")
DEFAULT_PASS = "Mmaf09m032."

# ─────────────────────────────────────────────────────────────────────
# Period times
# ─────────────────────────────────────────────────────────────────────
PERIODS_MON_THU = {
    1: ("08:55", "09:15"),   # 20 min (assembly 8:45-8:55)
    2: ("09:15", "09:45"),
    3: ("09:45", "10:15"),
    4: ("10:15", "10:45"),
    5: ("10:45", "11:15"),
    6: ("11:15", "11:45"),
    # break 11:45 - 12:10
    7: ("12:10", "12:40"),
    8: ("12:40", "13:10"),
    9: ("13:10", "13:30"),
}
PERIODS_FRI = {
    1: ("08:55", "09:25"),   # 30 min
    2: ("09:25", "10:00"),
    3: ("10:00", "10:30"),
    4: ("10:30", "11:00"),
    5: ("11:00", "11:30"),
    6: ("11:30", "12:00"),
    7: ("12:00", "12:30"),
    # Friday has no 8th or 9th period
}

DAY_CODES = {1: "monday", 2: "tuesday", 3: "wednesday", 4: "thursday", 5: "friday"}

# ─────────────────────────────────────────────────────────────────────
# Timetable grid (from the PDF)
# (class_num, period, subject, teacher, (day_from, day_to))
# day_from / day_to: 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri
# ─────────────────────────────────────────────────────────────────────
GRID = [
    # ── CLASS 6 ──
    (6, 1, "Tarjuma Quran",    "Hafiz Mati",       (1, 5)),
    (6, 2, "Math",             "Hafiz Mati",       (1, 5)),
    (6, 3, "Islamiyat",        "Qari Tahir",       (1, 5)),
    (6, 4, "G.Science",        "M. Shabbir",       (1, 5)),
    (6, 5, "English",          "M. Ameer",         (1, 5)),
    (6, 6, "Urdu",             "M. Shabbir",       (1, 5)),
    (6, 7, "Social Studies",   "M. Shabbir",       (1, 5)),
    (6, 8, "Computer",         "M. Tahir",         (1, 2)),
    (6, 8, "History",          "M. Shabbir",       (3, 4)),
    (6, 9, "English Grammar",  "M. Umar Farooq",   (1, 4)),

    # ── CLASS 7 ──
    (7, 1, "Tarjuma Quran",    "M. Umar Farooq",   (1, 5)),
    (7, 2, "English",          "M. Umar Farooq",   (1, 5)),
    (7, 3, "Urdu",             "M. Shabbir",       (1, 5)),
    (7, 4, "Math",             "Hafiz Mati",       (1, 5)),
    (7, 5, "Social Studies",   "M. Ameer",         (1, 5)),
    (7, 6, "G.Science",        "M. Ameer",         (1, 5)),
    (7, 7, "English Grammar",  "M. Umar Farooq",   (1, 5)),
    (7, 8, "Islamiyat",        "Qari Tahir",       (1, 4)),
    (7, 9, "Computer",         "Asad Waqar",       (1, 2)),
    (7, 9, "History",          "Qari Tahir",       (3, 4)),

    # ── CLASS 8 ──
    (8, 1, "Tarjuma Quran",    "Hafiz Atar",       (1, 5)),
    (8, 2, "Math",             "Hafiz Atar",       (1, 5)),
    (8, 3, "Urdu",             "M. Ameer",         (1, 5)),
    (8, 4, "English",          "M. Akram",         (1, 5)),
    (8, 5, "G.Science",        "Hafiz Mati",       (1, 5)),
    (8, 6, "Islamiyat",        "M. Akram",         (1, 5)),
    (8, 7, "Social Studies",   "Qari Tahir",       (1, 5)),
    (8, 8, "English Grammar",  "M. Akram",         (1, 4)),
    (8, 8, "Computer",         "Asad Waqar",       (1, 2)),
    (8, 9, "History",          "Qari Tahir",       (3, 4)),

    # ── CLASS 9 ──
    (9, 1, "Tarjuma Quran",    "M. Tariq",         (1, 5)),
    (9, 2, "Urdu",             "M. Tariq",         (1, 5)),
    (9, 3, "English",          "M. Abu Bakar Zia", (1, 5)),
    (9, 4, "Islamic Studies",  "M. Abu Bakar Zia", (1, 5)),
    (9, 5, "Math (A)",         "Asad Waqar",       (1, 5)),
    (9, 6, "G.Science",        "Hafiz Atar",       (1, 5)),
    (9, 7, "Computer (A)",     "Asad Waqar",       (1, 5)),
    (9, 8, "English Grammar",  "M. Abu Bakar Zia", (1, 4)),
    (9, 9, "Islamiyat (C)",    "M. Abu Bakar Zia", (1, 4)),

    # ── CLASS 10 ──
    (10, 1, "Tarjuma Quran",   "M. Abu Bakar Zia", (1, 5)),
    (10, 2, "Math (A)",        "M. Tahir",         (1, 5)),
    (10, 3, "English",         "M. Umar Farooq",   (1, 5)),
    (10, 4, "G.Science",       "M. Umar Farooq",   (1, 5)),
    (10, 5, "Islamic Studies", "M. Tariq",         (1, 5)),
    (10, 6, "English Grammar", "M. Umar Farooq",   (1, 5)),
    (10, 7, "Urdu",            "M. Tariq",         (1, 5)),
    (10, 8, "Punjabi",         "M. Tariq",         (1, 4)),
    (10, 9, "Pak Study",       "Hafiz Atar",       (1, 4)),
]

# ─────────────────────────────────────────────────────────────────────
# Teachers
# (display_name, short_slug_for_employee_code, email)
# ─────────────────────────────────────────────────────────────────────
TEACHERS = [
    ("Hafiz Mati",       "HM",  "hafiz.mati@school.local"),
    ("Hafiz Atar",       "HA",  "hafiz.atar@school.local"),
    ("Qari Tahir",       "QT",  "qari.tahir@school.local"),
    ("M. Shabbir",       "MS",  "m.shabbir@school.local"),
    ("M. Ameer",         "MA",  "m.ameer@school.local"),
    ("M. Tahir",         "MT",  "m.tahir@school.local"),
    ("Asad Waqar",       "AW",  "asad.waqar@school.local"),
    ("M. Umar Farooq",   "MUF", "m.umar.farooq@school.local"),
    ("M. Akram",         "MAK", "m.akram@school.local"),
    ("M. Tariq",         "MTR", "m.tariq@school.local"),
    ("M. Abu Bakar Zia", "MAB", "m.abu.bakar.zia@school.local"),
]

# ─────────────────────────────────────────────────────────────────────
# Subjects referenced by the timetable
# ─────────────────────────────────────────────────────────────────────
SUBJECTS = [
    "Tarjuma Quran", "Math", "English", "Urdu", "G.Science", "Islamiyat",
    "Social Studies", "Computer", "History", "English Grammar",
    "Islamic Studies", "Punjabi", "Pak Study",
    "Math (A)", "Computer (A)", "Islamiyat (C)",
]

TARGET_CLASSES = (6, 7, 8, 9, 10)


# ─────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────
def bcrypt_hash(pw):
    out = subprocess.check_output(
        ["node", "-e",
         "console.log(require('bcryptjs').hashSync(process.argv[1],10))", pw],
        text=True,
    )
    h = out.strip()
    if len(h) != 60:
        raise SystemExit(f"bad bcrypt hash length: {len(h)}")
    return h


def ensure_teacher(cur, hash_, name, slug, email):
    cur.execute("SELECT id FROM users WHERE email = ?", (email,))
    u = cur.fetchone()
    if u:
        user_id = u[0]
        cur.execute(
            "UPDATE users SET name=?, password_hash=?, role='teacher', status='active' WHERE id=?",
            (name, hash_, user_id),
        )
    else:
        cur.execute(
            "INSERT INTO users (name, email, password_hash, role, status) "
            "VALUES (?, ?, ?, 'teacher', 'active')",
            (name, email, hash_),
        )
        user_id = cur.lastrowid

    cur.execute("SELECT id FROM teachers WHERE user_id = ?", (user_id,))
    t = cur.fetchone()
    if t:
        return t[0]

    emp = f"TCH-{slug}-{user_id}"
    cur.execute(
        "INSERT INTO teachers (user_id, employee_code, salary_cents) VALUES (?, ?, 0)",
        (user_id, emp),
    )
    return cur.lastrowid


def ensure_subject(cur, name, class_id):
    cur.execute(
        "SELECT id FROM subjects WHERE LOWER(subject_name)=LOWER(?) AND class_id IS ?",
        (name, class_id),
    )
    r = cur.fetchone()
    if r:
        return r[0]
    cur.execute(
        "INSERT INTO subjects (subject_name, class_id) VALUES (?, ?)",
        (name, class_id),
    )
    return cur.lastrowid


def section_a_of_class(cur, class_num):
    cur.execute(
        """
        SELECT s.id FROM sections s
        JOIN classes c ON c.id = s.class_id
        WHERE c.class_name = ? AND s.section_name = 'A'
        LIMIT 1
        """,
        (f"Class {class_num}",),
    )
    r = cur.fetchone()
    return r[0] if r else None


def period_time(period, day_code):
    if day_code == "friday":
        return PERIODS_FRI.get(period)
    return PERIODS_MON_THU.get(period)


# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────
def main():
    if not DB.exists():
        print(f"✗ {DB} not found in {Path.cwd()}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    cur = con.cursor()

    hash_ = bcrypt_hash(DEFAULT_PASS)
    print(f"password hash: {hash_[:7]}… len={len(hash_)}")

    # ── 1) teachers ──
    print("\n=== TEACHERS ===")
    teacher_ids = {}
    for name, slug, email in TEACHERS:
        tid = ensure_teacher(cur, hash_, name, slug, email)
        teacher_ids[name] = tid
        print(f"  {name:20} → id={tid}  ({email})")

    # ── 2) subjects per target class ──
    print("\n=== SUBJECTS ===")
    subject_ids = {}
    for class_num in TARGET_CLASSES:
        cur.execute("SELECT id FROM classes WHERE class_name=?", (f"Class {class_num}",))
        row = cur.fetchone()
        if not row:
            print(f"  ⚠ Class {class_num} not found — skipping")
            continue
        class_id = row[0]
        print(f"  Class {class_num} (class_id={class_id}):")
        for subj_name in SUBJECTS:
            sid = ensure_subject(cur, subj_name, class_id)
            subject_ids[(class_num, subj_name)] = sid
            print(f"    {subj_name:20} → id={sid}")

    # ── 3) timetable rows ──
    print("\n=== TIMETABLE ===")
    created = 0
    skipped = 0
    warnings = 0

    for class_num, period, subj_name, teacher_name, (d1, d2) in GRID:
        subject_id = subject_ids.get((class_num, subj_name))
        if not subject_id:
            print(f"  ✗ missing subject: class {class_num} / {subj_name}")
            warnings += 1
            continue
        teacher_id = teacher_ids.get(teacher_name)
        if not teacher_id:
            print(f"  ✗ missing teacher: {teacher_name}")
            warnings += 1
            continue

        section_id = section_a_of_class(cur, class_num)
        if not section_id:
            print(f"  ✗ no section A for class {class_num}")
            warnings += 1
            continue

        for day_num in range(d1, d2 + 1):
            day_code = DAY_CODES[day_num]
            t = period_time(period, day_code)
            if not t:
                # e.g. Friday 8th/9th don't exist — expected skip
                skipped += 1
                continue
            start, end = t

            # idempotency: skip if this (section, day, start) already exists
            cur.execute(
                "SELECT id FROM timetables "
                "WHERE section_id=? AND day_of_week=? AND start_time=?",
                (section_id, day_code, start),
            )
            if cur.fetchone():
                skipped += 1
                continue

            try:
                cur.execute(
                    "INSERT INTO timetables "
                    "(section_id, subject_id, teacher_id, day_of_week, start_time, end_time, is_active) "
                    "VALUES (?, ?, ?, ?, ?, ?, 1)",
                    (section_id, subject_id, teacher_id, day_code, start, end),
                )
                created += 1
            except sqlite3.IntegrityError as e:
                print(f"  ⚠ {class_num}/{day_code}/p{period} — {e}")
                warnings += 1

    con.commit()

    # ── 4) report ──
    print("\n=== DONE ===")
    print(f"  timetable rows created : {created}")
    print(f"  skipped (existing/off-day): {skipped}")
    print(f"  warnings               : {warnings}")

    print("\n=== PER-SECTION COUNTS ===")
    cur.execute(
        """
        SELECT c.class_name, sec.section_name, COUNT(*) AS n
          FROM timetables t
          JOIN sections sec ON sec.id = t.section_id
          JOIN classes c    ON c.id  = sec.class_id
         WHERE c.class_name IN ('Class 6','Class 7','Class 8','Class 9','Class 10')
         GROUP BY c.id, sec.id
         ORDER BY c.id, sec.section_name
        """
    )
    for class_name, section_name, count in cur.fetchall():
        print(f"  {class_name} / Section {section_name}: {count} slot(s)")

    con.close()
    print(f"\nAll seeded teachers have password: {DEFAULT_PASS}")


if __name__ == "__main__":
    main()
