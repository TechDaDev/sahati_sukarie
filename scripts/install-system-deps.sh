#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# تثبيت مكتبات النظام التي يحتاجها Chromium لتوليد تقارير PDF العربية،
# إضافة إلى أدوات PostgreSQL. (لا تحتاج إلى تشغيلها إلا في بيئة جديدة أو
# بعد إعادة تهيئة البيئة، لأن ما يُثبَّت في /usr لا يُحفظ مع مساحة العمل.)
#
#   bash scripts/install-system-deps.sh
# ---------------------------------------------------------------------------
set -euo pipefail

SUDO=""
if [ "$(id -u)" -ne 0 ]; then SUDO="sudo"; fi

echo "→ تحديث فهارس الحزم…"
$SUDO apt-get update -qq

echo "→ تثبيت PostgreSQL 17…"
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq postgresql-17 postgresql-client-17

echo "→ تثبيت مكتبات Chromium…"
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
  libxkbcommon0 libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 \
  libpango-1.0-0 libcairo2 libasound2t64 fonts-liberation

echo "→ تثبيت أدوات الفحص (اختيارية: لفحص ملفات PDF)…"
$SUDO DEBIAN_FRONTEND=noninteractive apt-get install -y -qq poppler-utils

# متصفح Chromium لـ Puppeteer (يُخزَّن في ~/.cache/puppeteer)
if [ -d node_modules/puppeteer ]; then
  echo "→ التأكد من وجود متصفح Chromium لـ Puppeteer…"
  npx puppeteer browsers install chrome >/dev/null 2>&1 || echo "  (المتصفح موجود مسبقًا)"
fi

echo "✓ اكتمل تجهيز المتطلبات."
