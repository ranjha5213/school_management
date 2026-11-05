#!/usr/bin/env python3
"""
seed_class10_students.py

Creates 15 students in Class 10 Section A from the roster provided.

Each student gets:
  - a users row (role='student', status='active',
    email = firstname.lastname@school.local)
  - a students row with:
      admission_number = ADM-10A-<roll>
      roll_number      = the number from the roster (1, 2, 3, …)
      section_id       = Class 10 Section A

Password for all seeded students: Mmaf09m032.

Idempotent — skips any student whose email already exists.
"""

import sqlite3
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

DB = Path("school_management.db")
DEFAULT_PASS = "Mmaf09m032."
SECTION_CLASS = "Class 10"
SECTION_NAME  = "A"

# (roll, name_urdu, father_urdu, phone)
ROSTER = [
    (1,  "عمر احمد",          "محمد احسان",      "0302-5088896"),
    (2,  "بلال حسن",          "شاہد عمران",      None),
    (3,  "علی اصغر",          "تنویر عباس",      "0307-5250732"),
    (4,  "ذیشان",             "محمد ریاض",       "0308-0213282"),
    (5,  "محمد حذیفہ",        "محمد قاسم",       "0308-6188215"),
    (6,  "محمد حسن",          "سکندر حیات",      "0342-5682456"),
    (8,  "غلام مصطفی",        "محمد ظفر",        "0320-0148355"),
    (10, "محمد عاصم",         "امتیاز احمد",     "0345-4238807"),
    (11, "محمد الیاس",        "محمد رمضان",      None),
    (12, "محمد حمزہ",         "محمد ریاض",       "0345-3313961"),
    (13, "محمد اویس",         "محمد اکرم",       "0303-4137152"),
    (16, "شاہ زیب علی",       "بشیر احمد",       "0346-1751003"),
    (19, "محمد نعمان",        "نذیر احمد",       None),
    (22, "محمد عبد اللہ",     "شاہد اقبال",      "0312-7883902"),
    (23, "آفنان اقبال",       "محمد اقبال",      "0329-1239089"),
]

# English transliterations — used to build emails.
# Kept explicit so the email is stable even if the Urdu name is edited.
ENGLISH_NAMES = {
    1:  ("Umar Ahmad",         "umar.ahmad"),
    2:  ("Bilal Hassan",       "bilal.hassan"),
    3:  ("Ali Asghar",         "ali.asghar"),
    4:  ("Zeeshan",            "zeeshan"),
    5:  ("Muhammad Huzaifa",   "muhammad.huzaifa"),
    6:  ("Muhammad Hassan",    "muhammad.hassan"),
    8:  ("Ghulam Mustafa",     "ghulam.mustafa"),
    10: ("Muhammad Asim",      "muhammad.asim"),
    11: ("Muhammad Ilyas",     "muhammad.ilyas"),
    12: ("Muhammad Hamza",     "muhammad.hamza"),
    13: ("Muhammad Awais",     "muhammad.awais"),
    16: ("Shahzaib Ali",       "shahzaib.ali"),
    19: ("Muhammad Numan",     "muhammad.numan"),
    22: ("Muhammad Abdullah",  "muhammad.abdullah"),
    23: ("Afnan Iqbal",        "afnan.iqbal"),
}


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


def find_section_id(cur):
    cur.execute(
        """
        SELECT s.id FROM sections s
        JOIN classes c ON c.id = s.class_id
        WHERE c.class_name = ? AND s.section_name = ?
        LIMIT 1
        """,
        (SECTION_CLASS, SECTION_NAME),
    )
    r = cur.fetchone()
    if not r:
        raise SystemExit(f"section {SECTION_CLASS} / {SECTION_NAME} not found")
    return r[0]


def main():
    if not DB.exists():
        print(f"✗ {DB} not found in {Path.cwd()}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    cur = con.cursor()

    section_id = find_section_id(cur)
    print(f"Target section: {SECTION_CLASS} / Section {SECTION_NAME} (id={section_id})")

    hash_ = bcrypt_hash(DEFAULT_PASS)
    print(f"Password hash: {hash_[:7]}… len={len(hash_)}")

    created = 0
    skipped = 0

    for roll, name_ur, father_ur, phone in ROSTER:
        english_name, slug = ENGLISH_NAMES[roll]
        email = f"{slug}@school.local"

        # 1) users row
        cur.execute("SELECT id FROM users WHERE email = ?", (email,))
        u = cur.fetchone()
        if u:
            user_id = u[0]
            cur.execute(
                "UPDATE users SET name = ?, password_hash = ?, role = 'student', "
                "status = 'active', phone = ? WHERE id = ?",
                (english_name, hash_, phone, user_id),
            )
            print(f"  · {roll:>2}  {english_name:22} user exists  ({email})")
        else:
            cur.execute(
                "INSERT INTO users (name, email, password_hash, role, status, phone) "
                "VALUES (?, ?, ?, 'student', 'active', ?)",
                (english_name, email, hash_, phone),
            )
            user_id = cur.lastrowid
            print(f"  + {roll:>2}  {english_name:22} user created ({email})")

        # 2) students row
        cur.execute("SELECT id FROM students WHERE user_id = ?", (user_id,))
        s = cur.fetchone()
        if s:
            cur.execute(
                "UPDATE students SET section_id = ?, roll_number = ?, "
                "admission_number = ?, guardian_name = ?, guardian_phone = ? "
                "WHERE id = ?",
                (section_id, str(roll), f"ADM-10A-{roll:02d}",
                 father_ur, phone, s[0]),
            )
            print(f"       → student row updated (section_id={section_id}, roll={roll})")
            skipped += 1
        else:
            cur.execute(
                "INSERT INTO students (user_id, admission_number, section_id, "
                "roll_number, guardian_name, guardian_phone) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                (user_id, f"ADM-10A-{roll:02d}", section_id,
                 str(roll), father_ur, phone),
            )
            print(f"       → student row created (section_id={section_id}, roll={roll})")
            created += 1

    con.commit()

    # ── report ──
    print(f"\n=== DONE ===")
    print(f"  new student rows : {created}")
    print(f"  existing updated : {skipped}")

    print(f"\n=== {SECTION_CLASS} / Section {SECTION_NAME} ROSTER ===")
    cur.execute(
        """
        SELECT s.roll_number, u.name, u.email, u.phone,
               s.guardian_name, s.guardian_phone
          FROM students s
          JOIN users u ON u.id = s.user_id
         WHERE s.section_id = ?
         ORDER BY CAST(s.roll_number AS INTEGER)
        """,
        (section_id,),
    )
    for rn, name, email, phone, gn, gp in cur.fetchall():
        print(f"  {rn:>3}  {name:24} {email:32}  phone={phone or '-'}")
        if gn:
            print(f"       guardian: {gn}  {gp or ''}")

    con.close()
    print(f"\nAll seeded students have password: {DEFAULT_PASS}")


if __name__ == "__main__":
    main()
