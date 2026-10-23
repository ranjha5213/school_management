#!/data/data/com.termux/files/usr/bin/bash
#
# SQLite backup with rotation. Keeps the last 14 days.
# Cron: 0 3 * * *  ~/school/backup.sh
#
set -u

SCHOOL="$HOME/school"
DB="$SCHOOL/backend/school_management.db"
BACKUP_DIR="$SCHOOL/backups"

mkdir -p "$BACKUP_DIR"

if [ ! -f "$DB" ]; then
  echo "$(date '+%F %T') ✗ database not found: $DB" >> "$BACKUP_DIR/backup.log"
  exit 1
fi

STAMP=$(date '+%F_%H%M%S')
OUT="$BACKUP_DIR/school_${STAMP}.db"

# Use sqlite3 .backup — safe even while server is running
if command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB" ".backup '$OUT'"
else
  # Fallback: file copy (safe because WAL is checkpointed on shutdown,
  # but not ideal. Install sqlite: pkg install sqlite)
  cp "$DB" "$OUT"
fi

# Verify the backup opens
if sqlite3 "$OUT" "PRAGMA integrity_check;" 2>/dev/null | grep -q "^ok$"; then
  SIZE=$(stat -c%s "$OUT" 2>/dev/null || stat -f%z "$OUT")
  echo "$(date '+%F %T') ✓ $OUT (${SIZE} bytes)" >> "$BACKUP_DIR/backup.log"
else
  echo "$(date '+%F %T') ✗ integrity check failed for $OUT" >> "$BACKUP_DIR/backup.log"
  rm -f "$OUT"
  exit 1
fi

# Rotate: keep the 14 most recent daily backups
cd "$BACKUP_DIR" || exit 1
ls -t school_*.db 2>/dev/null | tail -n +15 | while read -r old; do
  rm -f "$old"
  echo "$(date '+%F %T') · rotated out $old" >> "$BACKUP_DIR/backup.log"
done

exit 0
