#!/bin/sh
# Backups of the database and the encrypted attachments, with restic.
# Runs inside the backup image (docker/backup/Dockerfile), from Docker Compose:
#
#   docker compose run --rm backup                  dump + copy to the local and cloud repositories
#   docker compose run --rm backup snapshots cloud  list the copies of one repository
#   scripts/restore-test.sh [local|cloud]           restore test (uses fetch, load-test and clean)
#   docker compose run --rm recover local|cloud     disaster recovery onto an empty server
#
# What a snapshot holds: /dump/database.dump (pg_dump, custom format) and /data/attachments (the
# files as they are on disk, already encrypted by the app). restic encrypts the whole snapshot
# again with RESTIC_PASSWORD. Neither copy holds ENCRYPTION_KEY: keep it apart (docs/backups.md).

set -eu

LOCAL_REPOSITORY=/backups/restic
RESTORE_DIR=/restore

log() { printf '%s %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*"; }
die() { log "ERROR: $*" >&2; exit 1; }

require_password() {
  [ -n "${RESTIC_PASSWORD:-}" ] || die "RESTIC_PASSWORD is missing from .env (see docs/backups.md)."
}

repository() {
  case "${1:-local}" in
    local) echo "$LOCAL_REPOSITORY" ;;
    cloud)
      [ -n "${BACKUP_CLOUD_REPOSITORY:-}" ] || die "BACKUP_CLOUD_REPOSITORY is missing from .env."
      echo "$BACKUP_CLOUD_REPOSITORY"
      ;;
    *) die "Unknown repository '$1': use local or cloud." ;;
  esac
}

# Reports the result to a monitor (healthchecks.io or similar) when BACKUP_PING_URL is set, so a
# backup that stops running is noticed. A failed ping never fails the backup.
ping() {
  [ -n "${BACKUP_PING_URL:-}" ] || return 0
  wget -q -T 10 -O /dev/null "$BACKUP_PING_URL$1" || log "WARNING: could not reach BACKUP_PING_URL."
}

# Copies the dump and the attachments to one repository, creating it the first time, then applies
# the retention and checks the repository's structure.
copy_to() {
  name=$1
  export RESTIC_REPOSITORY="$2"
  log "[$name] $RESTIC_REPOSITORY"
  if ! restic cat config > /dev/null 2>&1; then
    log "[$name] the repository does not exist yet: creating it"
    restic init || return 1
  fi
  # A fixed host name: each run is a new container, and the retention groups snapshots by host.
  restic backup --host gestionador --tag gestionador --exclude '*.tmp' \
    /dump/database.dump /data/attachments || return 1
  # Retention: one copy a day for a week, one a week for a month, one a month for half a year.
  restic forget --tag gestionador --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune \
    || return 1
  restic check || return 1
}

backup() {
  require_password
  mkdir -p /dump
  log "dumping the database $PGDATABASE"
  pg_dump --format=custom --file=/dump/database.dump || { ping /fail; die "pg_dump failed."; }
  log "dump: $(du -h /dump/database.dump | cut -f1), attachments: $(find /data/attachments -type f ! -name '*.tmp' | wc -l) files"

  failed=""
  copy_to local "$LOCAL_REPOSITORY" || failed="$failed local"
  if [ -n "${BACKUP_CLOUD_REPOSITORY:-}" ]; then
    copy_to cloud "$BACKUP_CLOUD_REPOSITORY" || failed="$failed cloud"
  else
    log "WARNING: BACKUP_CLOUD_REPOSITORY is empty: there is no cloud copy."
  fi
  rm -f /dump/database.dump

  if [ -n "$failed" ]; then
    ping /fail
    die "the copy failed for:$failed"
  fi
  ping ""
  log "backup finished"
}

snapshots() {
  require_password
  RESTIC_REPOSITORY=$(repository "${1:-local}") restic snapshots --tag gestionador
}

# Restores a snapshot (the latest by default) into the scratch volume.
fetch() {
  require_password
  repo=$(repository "${1:-local}")
  snapshot=${2:-latest}
  clean
  log "restoring snapshot $snapshot of $repo"
  RESTIC_REPOSITORY="$repo" restic restore "$snapshot" --tag gestionador --target "$RESTORE_DIR"
  [ -f "$RESTORE_DIR/dump/database.dump" ] || die "the snapshot has no database dump."
}

wait_for_database() {
  for _ in $(seq 1 30); do
    pg_isready -q && return 0
    sleep 1
  done
  die "the database at $PGHOST does not answer."
}

# Loads the fetched dump into the throwaway restore-db database.
load_test() {
  export PGHOST="${RESTORE_PGHOST:?RESTORE_PGHOST is not set}"
  wait_for_database
  log "loading the dump into $PGHOST"
  pg_restore --no-owner --exit-on-error --dbname="$PGDATABASE" "$RESTORE_DIR/dump/database.dump"
}

# Disaster recovery: puts a snapshot back into the real database and the attachments volume. Only
# onto an empty database, so it can never overwrite live data.
recover() {
  wait_for_database
  tables=$(psql -tAc "select count(*) from information_schema.tables where table_schema = 'public'")
  [ "$tables" = "0" ] || die "the database $PGDATABASE is not empty: recover only runs on a new server (docs/backups.md)."
  fetch "${1:-local}" "${2:-latest}"
  log "loading the dump into $PGHOST"
  pg_restore --no-owner --exit-on-error --dbname="$PGDATABASE" "$RESTORE_DIR/dump/database.dump"
  log "copying the attachments"
  cp -a "$RESTORE_DIR/data/attachments/." /data/attachments/
  # The app runs as the image's "node" user (uid 1000).
  chown -R 1000:1000 /data/attachments
  clean
  log "recovered: start the app with docker compose up -d"
}

clean() {
  rm -rf "${RESTORE_DIR:?}"/*
}

command=${1:-backup}
[ $# -gt 0 ] && shift
case "$command" in
  backup) backup ;;
  snapshots) snapshots "$@" ;;
  fetch) fetch "$@" ;;
  load-test) load_test ;;
  recover) recover "$@" ;;
  clean) clean ;;
  *) die "Unknown command '$command': use backup, snapshots, fetch, load-test, recover or clean." ;;
esac
