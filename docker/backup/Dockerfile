# Backup tools: pg_dump and pg_restore of the same major version as the database, plus restic.
# restic comes from its official image (a pinned static binary), so the build needs no package
# downloads.
FROM restic/restic:0.18.1 AS restic

FROM postgres:18-alpine
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY backupctl.sh /usr/local/bin/backupctl
ENTRYPOINT ["backupctl"]
CMD ["backup"]
