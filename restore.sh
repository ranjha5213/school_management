#!/data/data/com.termux/files/usr/bin/bash
set -e
LATEST="${1:-$(ls -t ~/school/backups/school_*.db | head -1)}"
if [ -z "$LATEST" ] || [ ! -f "$LATEST" ]; then
  echo "✗ No backup found."
  exit 1
fi
echo "Stopping servers..."
~/school/start.sh --stop 2>/dev/null || true
sleep 1
echo "Backing up current DB (in case)..."
cp ~/school/backend/school_management.db ~/school/backend/school_management.db.pre-restore 2>/dev/null || true
echo "Restoring from $LATEST"
cp "$LATEST" ~/school/backend/school_management.db
rm -f ~/school/backend/school_management.db-wal ~/school/backend/school_management.db-shm
echo "Restarting..."
~/school/start.sh
echo "✓ Restored from $LATEST"
