#!/bin/sh
# Entrypoint ของ API container: เตรียมสิทธิ์โฟลเดอร์ uploads, รัน migration แล้ว start server เป็น user node
set -e

UPLOAD_DIR=/app/uploads

# รันเป็น root เฉพาะช่วงเตรียมสิทธิ์ แล้วสลับไปเป็น node (bind mount จาก host มักเป็นของ root)
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$UPLOAD_DIR"
  chown -R node:node "$UPLOAD_DIR"
  exec su-exec node sh "$0" "$@"
fi

# รัน migration ที่ยังไม่ได้ apply ทุกครั้งที่ start (ไม่มี migration ใหม่ก็ไม่แตะ database)
echo "Running database migrations..."
./node_modules/.bin/prisma migrate deploy

# exec เพื่อให้ node เป็น PID 1 และได้รับ SIGTERM ตอน redeploy
exec "$@"
