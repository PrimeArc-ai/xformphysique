#!/usr/bin/env bash
# Always a fresh, socket-only PostgreSQL cluster; never connects to a live DB.
set -euo pipefail
repo_dir=$(cd "$(dirname "$0")/.." && pwd)
pg_bin=${XFORM_TEST_PG_BIN:-/usr/lib/postgresql/18/bin}
test_dir=$(mktemp -d /tmp/xform-progress-pg.XXXXXX)
"$pg_bin/initdb" -D "$test_dir/data" -A trust --no-locale > "$test_dir/init.log"
"$pg_bin/pg_ctl" -D "$test_dir/data" -l "$test_dir/server.log" -o "-k $test_dir -c listen_addresses=''" -w start
trap '"$pg_bin/pg_ctl" -D "$test_dir/data" -m fast -w stop' EXIT
psql_args=(-X -v ON_ERROR_STOP=1 -h "$test_dir" -d postgres)
psql "${psql_args[@]}" -f "$repo_dir/backend/tests/sql/supabase_test_bootstrap.sql" > "$test_dir/migrations.log"
for migration in "$repo_dir"/supabase/migrations/*.sql; do
  if [[ "${migration##*/}" == '202609090001_progress_photo_poses.sql' ]]; then
    psql "${psql_args[@]}" -f "$repo_dir/backend/tests/sql/progress_legacy_fixture.sql" >> "$test_dir/migrations.log"
  fi
  printf 'Apply %s\n' "${migration##*/}"
  psql "${psql_args[@]}" -f "$migration" >> "$test_dir/migrations.log"
done
if [[ -f "$repo_dir/backend/tests/sql/progress_acceptance.sql" ]]; then
  psql "${psql_args[@]}" -f "$repo_dir/backend/tests/sql/progress_acceptance.sql"
fi
printf 'Preserved local test cluster and evidence: %s\n' "$test_dir"
