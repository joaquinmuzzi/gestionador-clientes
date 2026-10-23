#!/bin/sh
# Restore test (docs/backups.md): restores the latest snapshot of one repository into a throwaway
# database, checks that the data is there and that every secret and screenshot decrypts with
# ENCRYPTION_KEY, and throws everything away. The live database and files are never touched.
#
#   scripts/restore-test.sh          test the local copy
#   scripts/restore-test.sh cloud    test the cloud copy
#
# Run it from the directory that holds docker-compose.yml and .env. Each run appends one line to
# restore-tests.log there.

set -eu

repository=${1:-local}
log_file=restore-tests.log
compose="docker compose --profile restore-test"
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)

[ -f .env ] || { echo "Run this from the directory with docker-compose.yml and .env." >&2; exit 1; }

cleanup() {
  $compose run --rm -T backup clean > /dev/null 2>&1 || true
  $compose rm --stop --force restore-db > /dev/null 2>&1 || true
}

result=FAILED
report() {
  echo "$started $repository $result" >> "$log_file"
  echo "Restore test of the $repository copy: $result (logged in $log_file)"
}
trap 'report; cleanup' EXIT

echo "== Starting a throwaway database"
$compose up --detach --wait restore-db

echo "== Restoring the latest snapshot of the $repository copy"
$compose run --rm -T backup fetch "$repository"
$compose run --rm -T backup load-test

echo "== Checking the restored data"
$compose run --rm -T verify-restore

result=OK
