#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# تشغيل خادم PostgreSQL الخاص بالمنصة بشكل موثوق.
# يعالج حالتين متكرّرتين في بيئات التشغيل المعزولة:
#   1) فقدان المجلدات الفارغة داخل مجلد البيانات بعد استعادة لقطة (snapshot).
#   2) تعذّر الكتابة في مجلد المقبس الافتراضي /var/run/postgresql.
#
#   bash scripts/start-postgres.sh
# ---------------------------------------------------------------------------
set -euo pipefail

PGBIN="${PGBIN:-/usr/lib/postgresql/17/bin}"
PGDATA="${PGDATA:-/home/user/.pgdata}"
SOCKET_DIR="${PG_SOCKET_DIR:-/tmp}"

if [ ! -d "$PGDATA" ]; then
  echo "✗ مجلد البيانات غير موجود: $PGDATA"
  echo "  أنشئ قاعدة البيانات أولًا عبر: bash scripts/setup-postgres.sh"
  exit 1
fi

echo "→ التحقق من مجلد البيانات…"
chmod 0700 "$PGDATA"

# مجلدات لازمة لتشغيل الخادم (فارغة بطبيعتها، وقد تُفقد عند استعادة اللقطات)
for dir in pg_notify pg_stat pg_stat_tmp pg_tblspc pg_replslot pg_serial \
           pg_snapshots pg_dynshmem pg_commit_ts pg_twophase \
           pg_wal/archive_status pg_wal/summaries \
           pg_logical/snapshots pg_logical/mappings \
           pg_multixact/members pg_multixact/offsets; do
  mkdir -p "$PGDATA/$dir"
done

# مجلد مقبس قابل للكتابة (الافتراضي /var/run/postgresql قد لا يكون متاحًا)
if ! grep -q "unix_socket_directories" "$PGDATA/postgresql.auto.conf" 2>/dev/null; then
  printf "unix_socket_directories = '%s'\n" "$SOCKET_DIR" >> "$PGDATA/postgresql.auto.conf"
fi

if "$PGBIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
  echo "✓ الخادم يعمل بالفعل على 127.0.0.1:5432"
  exit 0
fi

echo "→ تشغيل PostgreSQL…"
"$PGBIN/pg_ctl" -D "$PGDATA" -l /tmp/pg.log start >/dev/null

for _ in $(seq 1 20); do
  if "$PGBIN/pg_isready" -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    echo "✓ PostgreSQL جاهز على 127.0.0.1:5432"
    exit 0
  fi
  sleep 1
done

echo "✗ فشل تشغيل PostgreSQL — راجع السجل /tmp/pg.log"
tail -20 /tmp/pg.log || true
exit 1
