#!/bin/sh
# Deploy บน server (รันในโฟลเดอร์โปรเจกต์) แล้วรอจน API healthy
# migration รันอัตโนมัติใน docker/entrypoint.sh ตอน container start
# ใช้:
#   sh scripts/deploy.sh                                   pull branch main แล้ว build image บน server
#   DEPLOY_REF=<commit> API_IMAGE=<image> sh scripts/deploy.sh   checkout commit แล้วใช้ image จาก GHCR (GitHub Actions ใช้แบบนี้)
set -eu

cd "$(dirname "$0")/.."

if [ -n "${DEPLOY_REF:-}" ]; then
  echo "Checking out $DEPLOY_REF..."
  git fetch --quiet origin "$DEPLOY_REF"
  git checkout --quiet --detach "$DEPLOY_REF"
else
  BRANCH="${DEPLOY_BRANCH:-main}"
  echo "Pulling $BRANCH..."
  git fetch origin "$BRANCH"
  git checkout "$BRANCH"
  git pull --ff-only origin "$BRANCH"
fi

if [ -n "${API_IMAGE:-}" ]; then
  # docker-compose.yml อ่าน API_IMAGE เป็นชื่อ image ของ service api
  export API_IMAGE
  echo "Pulling $API_IMAGE..."
  docker compose pull api
  echo "Starting containers..."
  docker compose up -d --no-build
else
  echo "Building and starting containers..."
  docker compose up -d --build
fi

# รอ healthcheck ของ api สูงสุดประมาณ 2 นาที
echo "Waiting for API to become healthy..."
i=0
while [ $i -lt 24 ]; do
  status="$(docker inspect -f '{{.State.Health.Status}}' smart-carpark-api 2>/dev/null || echo unknown)"
  if [ "$status" = "healthy" ]; then
    echo "API is healthy ($(docker inspect -f '{{.Config.Image}}' smart-carpark-api))."
    # ลบ image ที่ไม่ได้ใช้และเก่ากว่า 7 วัน (เก็บ image ล่าสุดไว้ rollback ได้เร็ว)
    docker image prune -af --filter "until=168h" >/dev/null
    exit 0
  fi
  i=$((i + 1))
  sleep 5
done

echo "API did not become healthy. Recent logs:"
docker compose logs --tail=100 api
exit 1
