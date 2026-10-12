#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# حارس تشغيل (watchdog): يبقى خلفية ويضمن أن قاعدة البيانات والتطبيق يعملان.
#   - إن توقف PostgreSQL → يعيد تشغيله (scripts/start-postgres.sh).
#   - إن توقف خادم Next.js على المنفذ 3000 → يعيد تشغيله (بعد بناء إن لزم).
#
#   bash scripts/keepalive.sh          # يعمل في المقدمة (يُدار كعملية خلفية)
# ---------------------------------------------------------------------------
set -uo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3000}"
INTERVAL="${INTERVAL:-15}"
LOG=/tmp/keepalive.log
PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"

log() { echo "[$(date -u +%H:%M:%S)] $*" | tee -a "$LOG"; }

log "بدأ الحارس — المجلد: $APP_DIR (كل ${INTERVAL}s)"

while true; do
  # 1) قاعدة البيانات
  if ! "$PGBIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    log "PostgreSQL متوقف — إعادة التشغيل…"
    (cd "$APP_DIR" && bash scripts/start-postgres.sh >>"$LOG" 2>&1) || log "فشل تشغيل PostgreSQL"
  fi

  # 2) خادم التطبيق
  if ! (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
    log "خادم التطبيق متوقف على $PORT — إعادة التشغيل…"
    cd "$APP_DIR" || exit 1
    if [ ! -d node_modules ]; then
      log "تثبيت الاعتماديات…"
      npm ci --no-audit --no-fund >>"$LOG" 2>&1 || log "فشل npm ci"
    fi
    if [ ! -d .next ]; then
      log "بناء التطبيق…"
      npx next build >>"$LOG" 2>&1 || log "فشل البناء"
    fi
    nohup npx next start -H 0.0.0.0 -p "$PORT" >>/tmp/next.log 2>&1 &
    sleep 6
    if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
      log "✓ خادم التطبيق يعمل من جديد على $PORT"
    else
      log "✗ تعذّر تشغيل خادم التطبيق — راجع /tmp/next.log"
    fi
  fi

  sleep "$INTERVAL"
done
