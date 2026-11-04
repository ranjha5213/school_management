#!/usr/bin/env python3
"""
seed_subjects.py

Creates 10 subjects per class for classes 6..10 (50 rows total):
  Tarjmat-ul-Quran, Math, English, Urdu, Pak Studies, Islamiyat,
  Physics, Chemistry, Biology, Computer

Schema (subjects):
  id, subject_name (NN), subject_code, class_id (nullable), created_at

The `subjects.class_id` column is used. Codes are class-suffixed:
  TQ6, MATH6, ENG6, URDU6, PS6, ISL6, PHY6, CHEM6, BIO6, COMP6
  … and similarly for 7, 8, 9, 10.

Idempotent: any (class_id, subject_name) that already exists is skipped,
even with different casing.

Orphan rows with class_id = NULL (from the earlier teacher seed) can be
deleted before or after running — they are NOT used by any timetable or
MCQ exam in the current database (verified: 0 references).
"""

import sqlite3
import sys
from pathlib import Path

DB = Path("school_management.db")

SUBJECTS = [
    ("Tarjmat-ul-Quran", "TQ"),
    ("Math",             "MATH"),
    ("English",          "ENG"),
    ("Urdu",             "URDU"),
    ("Pak Studies",      "PS"),
    ("Islamiyat",        "ISL"),
    ("Physics",          "PHY"),
    ("Chemistry",        "CHEM"),
    ("Biology",          "BIO"),
    ("Computer",         "COMP"),
]

CLASSES = [6, 7, 8, 9, 10]


def find_class_id(cur, num):
    cur.execute(
        "SELECT id FROM classes WHERE class_name = ? OR class_code = ?",
        (f"Class {num}", f"C{num}"),
    )
    r = cur.fetchone()
    return r[0] if r else None


def main():
    if not DB.exists():
        print(f"✗ {DB} not found in {Path.cwd()}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    cur = con.cursor()

    inserted = 0
    skipped  = 0

    for num in CLASSES:
        class_id = find_class_id(cur, num)
        if not class_id:
            print(f"⚠ Class {num} not found — skipping")
            continue

        print(f"\nClass {num} (id={class_id}):")

        for name, code in SUBJECTS:
            # Check for existing (class_id, subject_name), case-insensitive
            cur.execute(
                "SELECT id FROM subjects "
                "WHERE class_id = ? AND LOWER(subject_name) = LOWER(?)",
                (class_id, name),
            )
            if cur.fetchone():
                skipped += 1
                print(f"  · {name:<20} (already exists)")
                continue

            subject_code = f"{code}{num}"
            cur.execute(
                "INSERT INTO subjects (subject_name, subject_code, class_id) "
                "VALUES (?, ?, ?)",
                (name, subject_code, class_id),
            )
            inserted += 1
            print(f"  ✓ {name:<20} code={subject_code}")

    con.commit()

    # ── report ──
    print("\n=== SUBJECTS BY CLASS (6..10) ===")
    cur.execute(
        """
        SELECT c.class_name, s.id, s.subject_name, s.subject_code
          FROM subjects s
          JOIN classes c ON c.id = s.class_id
         WHERE c.id IN (6, 7, 8, 9, 10)
         ORDER BY c.id, s.subject_name
        """
    )
    current = None
    per_class = {}
    for cname, sid, sname, scode in cur.fetchall():
        if cname != current:
            print(f"\n{cname}:")
            current = cname
        print(f"  - {sname:<20} {scode or ''}")
        per_class[cname] = per_class.get(cname, 0) + 1

    print("\n── summary ──")
    total = 0
    for num in CLASSES:
        cname = f"Class {num}"
        n = per_class.get(cname, 0)
        print(f"  {cname:<10} {n} subject(s)")
        total += n
    print(f"  {'TOTAL':<10} {total} subject(s) for classes 6..10")

    # orphan check
    cur.execute("SELECT COUNT(*) FROM subjects WHERE class_id IS NULL")
    orphans = cur.fetchone()[0]
    if orphans:
        print(f"\n  ⚠ {orphans} row(s) still have class_id = NULL")
        print(f"    (safe to delete — no timetable/mcq references):")
        print(f'    sqlite3 school_management.db "DELETE FROM subjects WHERE class_id IS NULL;"')

    print(f"\nInserted: {inserted}  Skipped: {skipped}")
    con.close()


if __name__ == "__main__":
    main()
