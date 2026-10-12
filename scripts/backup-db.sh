#!/usr/bin/env bash
# نسخة احتياطية من قاعدة البيانات (pg_dump بصيغة مخصصة) + إرشادات الاستعادة.
set -euo pipefail
cd "$(dirname "$0")/.."

[ -f .env.local ] && set -a && . ./.env.local && set +a
: "${DATABASE_URL:?DATABASE_URL غير محدد}"

OUT_DIR="${1:-backups}"
mkdir -p "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/sahati-$STAMP.dump"

BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
PG_DUMP="${BIN:+$BIN/pg_dump}"; PG_DUMP="${PG_DUMP:-pg_dump}"

"$PG_DUMP" --format=custom --no-owner --no-privileges --file "$FILE" "$DATABASE_URL"
echo "✓ تم إنشاء النسخة الاحتياطية: $FILE"
echo "  للاستعادة:  pg_restore --clean --if-exists --no-owner -d \"\$DATABASE_URL\" $FILE"
echo "  ⚠ احتفظ بالنسخ في مكان آمن ومشفّر، لأنها تحتوي بيانات صحية."
