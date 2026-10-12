#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# صحتي وسكري — تجهيز قاعدة بيانات PostgreSQL محلية (بيئة تطوير / عرض تجريبي)
# Creates a PostgreSQL cluster inside the project sandbox and starts it.
# For production use a managed PostgreSQL service instead (see README).
# ---------------------------------------------------------------------------
set -euo pipefail

PGDATA="${PGDATA:-/home/user/.pgdata}"
PGPORT="${PGPORT:-5432}"
APP_DB="${APP_DB:-sahati}"
APP_USER="${APP_USER:-sahati}"
APP_PASSWORD="${APP_PASSWORD:-sahati_dev_password}"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"

if [ -z "$BIN" ]; then
  echo "لم يتم العثور على PostgreSQL. ثبّته أولاً: sudo apt-get install -y postgresql" >&2
  exit 1
fi

if [ ! -f "$PGDATA/PG_VERSION" ]; then
  echo "→ إنشاء عنقود قاعدة البيانات في $PGDATA"
  mkdir -p "$PGDATA"
  "$BIN/initdb" -D "$PGDATA" -U postgres --auth-local=trust --auth-host=scram-sha-256 -E UTF8 --locale=C.UTF-8 >/dev/null
  cat >> "$PGDATA/postgresql.conf" <<CONF
port = $PGPORT
listen_addresses = '127.0.0.1'
timezone = 'UTC'
log_timezone = 'UTC'
shared_buffers = 128MB
max_connections = 100
CONF
fi

if ! "$BIN/pg_ctl" -D "$PGDATA" status >/dev/null 2>&1; then
  echo "→ تشغيل خادم PostgreSQL على المنفذ $PGPORT"
  "$BIN/pg_ctl" -D "$PGDATA" -l "$PGDATA/server.log" -o "-p $PGPORT -k /tmp" start >/dev/null
  sleep 1
fi

# local socket auth is "trust" for the bootstrap superuser (see initdb above)
psql_super() { "$BIN/psql" -h /tmp -p "$PGPORT" -U postgres -d postgres -v ON_ERROR_STOP=1 "$@"; }

psql_super -tAc "SELECT 1 FROM pg_roles WHERE rolname='$APP_USER'" | grep -q 1 || \
  psql_super -c "CREATE ROLE \"$APP_USER\" LOGIN PASSWORD '$APP_PASSWORD'"

psql_super -tAc "SELECT 1 FROM pg_database WHERE datname='$APP_DB'" | grep -q 1 || \
  psql_super -c "CREATE DATABASE \"$APP_DB\" OWNER \"$APP_USER\" ENCODING 'UTF8'"

psql_super -c "ALTER DATABASE \"$APP_DB\" SET timezone TO 'UTC'" >/dev/null

# صلاحية إنشاء قواعد بيانات الاختبار المعزولة (تُستخدم في npm test فقط)
psql_super -c "ALTER ROLE \"$APP_USER\" CREATEDB" >/dev/null
echo "✓ قاعدة البيانات جاهزة: postgres://$APP_USER@127.0.0.1:$PGPORT/$APP_DB"
