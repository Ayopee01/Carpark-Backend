#!/bin/sh
# Backup database และไฟล์ uploads ของ Smart Carpark (รันบน host ในโฟลเดอร์โปรเจกต์ เช่นผ่าน cron)
# ใช้: sh scripts/backup.sh            (ค่า default เก็บที่ /srv/smart-carpark/backups นาน 14 วัน)
#      BACKUP_DIR=/mnt/backup KEEP_DAYS=30 sh scripts/backup.sh
set -eu

cd "$(dirname "$0")/.."

BACKUP_DIR="${BACKUP_DIR:-/srv/smart-carpark/backups}"
KEEP_DAYS="${KEEP_DAYS:-14}"
STAMP="$(date +%Y%m%d-%H%M%S)"

# อ่าน UPLOADS_HOST_PATH จาก .env (ถ้าไม่ได้ตั้งใช้ ./uploads เหมือน docker-compose.yml)
UPLOADS_HOST_PATH="$(grep -E '^UPLOADS_HOST_PATH=' .env 2>/dev/null | tail -n 1 | cut -d= -f2- || true)"
UPLOADS_HOST_PATH="${UPLOADS_HOST_PATH:-./uploads}"

mkdir -p "$BACKUP_DIR"

# Dump database จาก db container ด้วย user/db ที่ตั้งไว้ใน container เอง
echo "Backing up database..."
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --clean --if-exists' \
  | gzip > "$BACKUP_DIR/db-$STAMP.sql.gz"

# Backup ไฟล์ uploads
if [ -d "$UPLOADS_HOST_PATH" ]; then
  echo "Backing up uploads from $UPLOADS_HOST_PATH..."
  tar -czf "$BACKUP_DIR/uploads-$STAMP.tar.gz" -C "$UPLOADS_HOST_PATH" .
fi

# ลบ backup ที่เก่ากว่า KEEP_DAYS วัน
find "$BACKUP_DIR" -name 'db-*.sql.gz' -mtime +"$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'uploads-*.tar.gz' -mtime +"$KEEP_DAYS" -delete

echo "Backup completed: $BACKUP_DIR (*-$STAMP.*)"
