#!/usr/bin/env bash
# 마이그레이션과 권한 규칙 테스트를 임시 PostgreSQL에서 실행한다.
# 필요: PostgreSQL 15 이상 (initdb, pg_ctl, psql)
# 실행: npm run db:test
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls -d /usr/lib/postgresql/*/bin/initdb 2>/dev/null | sort -V | tail -1)")}"
WORK="$(mktemp -d)"
PORT="${PG_TEST_PORT:-54329}"

cleanup() {
  "$PG_BIN/pg_ctl" -D "$WORK/data" -m immediate stop >/dev/null 2>&1 || true
  rm -rf "$WORK"
}
trap cleanup EXIT

# root로 실행하면 PostgreSQL이 거부하므로 일반 사용자로 바꿔 실행한다
RUN=()
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd --system --no-create-home postgres
  chown -R postgres "$WORK"
  chmod 755 "$WORK"
  RUN=(su postgres -s /bin/bash -c)
fi

run() {
  if [ ${#RUN[@]} -gt 0 ]; then "${RUN[@]}" "$*"; else bash -c "$*"; fi
}

run "'$PG_BIN/initdb' -D '$WORK/data' -U postgres --auth=trust -E UTF8 --no-locale >/dev/null"
run "'$PG_BIN/pg_ctl' -D '$WORK/data' -o \"-p $PORT -k '$WORK' -c listen_addresses=''\" -l '$WORK/log' -w start >/dev/null"

PSQL=(psql -X -q -v ON_ERROR_STOP=1 -h "$WORK" -p "$PORT" -U postgres -d postgres)

"${PSQL[@]}" -f "$ROOT/supabase/tests/supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "apply $(basename "$f")"
  "${PSQL[@]}" -f "$f"
done
"${PSQL[@]}" -f "$ROOT/supabase/tests/helpers.sql"
for f in "$ROOT"/supabase/tests/*_rls.sql; do
  echo "test  $(basename "$f")"
  "${PSQL[@]}" -t -A -f "$f" 2>&1 | sed 's/^psql:[^ ]* NOTICE:  /  /' | grep -v '^$'
done
