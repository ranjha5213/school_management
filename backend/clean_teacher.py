#!/usr/bin/env python3
"""
cleanup_teachers.py

Removes every teacher except the 11 seeded from the GHS Dhori PDF.

Kept (by email):
  hafiz.mati@school.local
  hafiz.atar@school.local
  qari.tahir@school.local
  m.shabbir@school.local
  m.ameer@school.local
  m.tahir@school.local
  asad.waqar@school.local
  m.umar.farooq@school.local
  m.akram@school.local
  m.tariq@school.local
  m.abu.bakar.zia@school.local

For every other teacher user:
  - delete their teachers row (FK cascade: timetables.teacher_id → SET NULL,
    homework.teacher_id → SET NULL — those rows are preserved, teacher
    unassigned)
  - delete their users row (cascade: refresh_tokens)

Shows exactly what will be deleted before doing it. Prompts for confirmation.
"""

import sqlite3
import sys
from pathlib import Path

DB = Path("school_management.db")

KEEP_EMAILS = [
    "hafiz.mati@school.local",
    "hafiz.atar@school.local",
    "qari.tahir@school.local",
    "m.shabbir@school.local",
    "m.ameer@school.local",
    "m.tahir@school.local",
    "asad.waqar@school.local",
    "m.umar.farooq@school.local",
    "m.akram@school.local",
    "m.tariq@school.local",
    "m.abu.bakar.zia@school.local",
]


def main():
    if not DB.exists():
        print(f"✗ {DB} not found in {Path.cwd()}", file=sys.stderr)
        sys.exit(1)

    con = sqlite3.connect(DB)
    con.execute("PRAGMA foreign_keys = ON")
    cur = con.cursor()

    placeholders = ",".join("?" * len(KEEP_EMAILS))

    # ── what's there now ──
    cur.execute(f"""
        SELECT u.id, u.name, u.email
          FROM users u
         WHERE u.role = 'teacher'
         ORDER BY u.id
    """)
    all_teachers = cur.fetchall()
    print(f"Teachers currently in DB: {len(all_teachers)}\n")

    # ── which are kept ──
    cur.execute(f"""
        SELECT u.id, u.name, u.email
          FROM users u
         WHERE u.role = 'teacher' AND u.email IN ({placeholders})
         ORDER BY u.id
    """, KEEP_EMAILS)
    keep = cur.fetchall()
    print(f"KEEP ({len(keep)}):")
    for uid, name, email in keep:
        print(f"  {uid:>4}  {name:20} {email}")

    # ── which will be deleted ──
    cur.execute(f"""
        SELECT u.id, u.name, u.email
          FROM users u
         WHERE u.role = 'teacher' AND u.email NOT IN ({placeholders})
         ORDER BY u.id
    """, KEEP_EMAILS)
    drop = cur.fetchall()
    print(f"\nDELETE ({len(drop)}):")
    for uid, name, email in drop:
        print(f"  {uid:>4}  {name:20} {email}")

    if not drop:
        print("\nNothing to delete. Done.")
        con.close()
        return

    # ── side effects: which tables reference these teachers? ──
    drop_ids = [r[0] for r in drop]
    teacher_placeholders = ",".join("?" * len(drop_ids))

    cur.execute(f"""
        SELECT COUNT(*) FROM timetables
         WHERE teacher_id IN (
           SELECT id FROM teachers WHERE user_id IN ({teacher_placeholders})
         )
    """, drop_ids)
    n_timetable = cur.fetchone()[0]

    cur.execute(f"""
        SELECT COUNT(*) FROM homework
         WHERE teacher_id IN (
           SELECT id FROM teachers WHERE user_id IN ({teacher_placeholders})
         )
    """, drop_ids)
    n_homework = cur.fetchone()[0]

    print(f"\nSide effects of deletion:")
    print(f"  timetable rows → teacher_id will be SET NULL: {n_timetable}")
    print(f"  homework  rows → teacher_id will be SET NULL: {n_homework}")
    print(f"  (sections/subjects/classes unaffected)")

    # ── confirm ──
    answer = input("\nProceed with deletion? [y/N] ").strip().lower()
    if answer != "y":
        print("Aborted.")
        con.close()
        return

    try:
        # delete teachers rows (cascade → timetables.teacher_id / homework.teacher_id SET NULL)
        cur.execute(f"""
            DELETE FROM teachers
             WHERE user_id IN ({teacher_placeholders})
        """, drop_ids)
        n_teachers = cur.rowcount

        # delete users rows (cascade → refresh_tokens)
        cur.execute(f"""
            DELETE FROM users
             WHERE id IN ({teacher_placeholders}) AND role = 'teacher'
        """, drop_ids)
        n_users = cur.rowcount

        con.commit()
        print(f"\nDeleted:")
        print(f"  teachers rows : {n_teachers}")
        print(f"  users rows    : {n_users}")

    except Exception as e:
        con.rollback()
        print(f"\n✗ Error: {e}")
        con.close()
        sys.exit(1)

    # ── final state ──
    print("\n=== FINAL STATE ===")
    cur.execute("""
        SELECT u.id, u.name, u.email, t.id AS teacher_id, t.employee_code
          FROM users u
          LEFT JOIN teachers t ON t.user_id = u.id
         WHERE u.role = 'teacher'
         ORDER BY u.id
    """)
    for uid, name, email, tid, emp in cur.fetchall():
        print(f"  {uid:>4}  {name:20} {email:38} teacher_id={tid} emp={emp or '-'}")

    con.close()


if __name__ == "__main__":
    main()
