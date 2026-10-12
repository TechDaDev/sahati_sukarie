#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# تجهيز وتشغيل منصة «صحتي وسكري» بالكامل في بيئة جديدة أو بعد إعادة تهيئة.
# يتولّى: مكتبات النظام (PostgreSQL + Chromium) → اعتماديات npm → قاعدة البيانات
# → ترحيلات → بناء الإنتاج → تشغيل الخادم → تشغيل حارس التشغيل.
#
#   bash scripts/bootstrap.sh              # كل شيء + تشغيل الخادم
#   bash scripts/bootstrap.sh --prepare    # تجهيز وبناء فقط (بدون تشغيل)
# ---------------------------------------------------------------------------
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-3000}"
PREPARE_ONLY=false
[ "${1:-}" = "--prepare" ] && PREPARE_ONLY=true

log() { echo "[bootstrap] $*"; }

# 1) مكتبات النظام (لا تُحفظ مع مساحة العمل، لذلك نتحقق منها في كل مرة)
if ! ls /usr/lib/postgresql/*/bin/pg_ctl >/dev/null 2>&1; then
  log "تثبيت PostgreSQL ومكتبات Chromium…"
  bash scripts/install-system-deps.sh
else
  log "مكتبات PostgreSQL موجودة."
  if ! ldconfig -p 2>/dev/null | grep -q libnspr4; then
    log "تثبيت مكتبات Chromium الناقصة…"
    bash scripts/install-system-deps.sh
  fi
fi

# 2) متصفح Chromium لـ Puppeteer (يُخزَّن في ~/.cache/puppeteer)
if [ ! -x "$(ls /home/user/.cache/puppeteer/chrome/*/chrome-linux64/chrome 2>/dev/null | head -1 || true)" ]; then
  log "تنزيل متصفح Chromium لتوليد PDF…"
  [ -d node_modules ] || npm ci --no-audit --no-fund
  npx puppeteer browsers install chrome >/dev/null 2>&1 || log "تعذّر تنزيل Chromium (سيبقى تقرير PDF غير متاح)"
fi

# 3) اعتماديات npm
if [ ! -d node_modules ]; then
  log "تثبيت اعتماديات npm…"
  npm ci --no-audit --no-fund
fi

# 4) قاعدة البيانات + الترحيلات
bash scripts/start-postgres.sh
log "تطبيق الترحيلات…"
npm run db:migrate >/dev/null

# 5) بناء الإنتاج
if [ ! -d .next ] || [ -n "${REBUILD:-}" ]; then
  log "بناء الإنتاج…"
  npx next build
fi

if [ "$PREPARE_ONLY" = true ]; then
  log "✓ اكتمل التجهيز (بدون تشغيل الخادم)."
  exit 0
fi

# 6) تشغيل الخادم إن لم يكن يعمل
if (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null; then
  log "الخادم يعمل بالفعل على $PORT"
else
  log "تشغيل الخادم على 0.0.0.0:$PORT…"
  nohup npx next start -H 0.0.0.0 -p "$PORT" >>/tmp/next.log 2>&1 &
  for _ in $(seq 1 20); do
    (exec 3<>"/dev/tcp/127.0.0.1/$PORT") 2>/dev/null && break
    sleep 1
  done
fi

# 7) حارس التشغيل
if ! pgrep -f "keepalive.sh" >/dev/null 2>&1; then
  log "تشغيل حارس التشغيل…"
  nohup bash scripts/keepalive.sh >>/tmp/keepalive.log 2>&1 &
fi

log "✓ المنصة جاهزة على المنفذ $PORT"
