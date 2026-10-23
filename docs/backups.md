# Backups

Gabriel's rule: a main copy, a local copy and a cloud copy, and restores that are actually tested
from time to time. This is how the app follows it.

| Copy | Where | What |
|---|---|---|
| Main | The server: the `db-data` and `attachments` Docker volumes | The live data |
| Local | `BACKUP_LOCAL_DIR`: another disk or a NAS mounted on the server | A restic repository |
| Cloud | `BACKUP_CLOUD_REPOSITORY`: a bucket (Backblaze B2 or any S3-compatible storage) | A restic repository |

Every night a backup dumps the database (`pg_dump`) and copies the dump, together with the
screenshot files, to both repositories with [restic](https://restic.net/). restic encrypts
everything with `RESTIC_PASSWORD`, only uploads what changed, and keeps 7 daily, 4 weekly and 6
monthly copies. Once a month a restore test puts the latest copy into a throwaway database and
checks that every secret and every screenshot still decrypts.

## What is not in the backups

Three things live outside the backups on purpose, so that a stolen backup is useless:

- `ENCRYPTION_KEY`: without it no secret field or screenshot can be decrypted, even with a perfect
  backup.
- `RESTIC_PASSWORD`: without it the backups cannot be opened.
- The cloud keys (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).

Keep them in a password manager **and** on a printed sheet in a safe place (not on the server).
When you write them down, check them against `.env` character by character: losing them, or a
typo, means losing everything.

## Setup

1. **Password.** Set `RESTIC_PASSWORD` in `.env` (`openssl rand -base64 32`) and store it as said
   above.
2. **Local copy.** Mount the second disk or the NAS on the server (for example at
   `/mnt/backups`, through `/etc/fstab` so it survives reboots) and set
   `BACKUP_LOCAL_DIR=/mnt/backups/gestionador`. Empty, it falls back to `./backups` next to
   `docker-compose.yml`, which is on the same disk as the data: fine for a first test, not as
   the real local copy.
3. **Cloud copy (Backblaze B2).**
   1. Create a B2 account and a **private** bucket, for example `gestionador-backups`.
   2. Create an application key restricted to that bucket, with read and write access.
   3. In `.env`:

      ```bash
      BACKUP_CLOUD_REPOSITORY=s3:https://s3.<region>.backblazeb2.com/gestionador-backups/gestionador
      AWS_ACCESS_KEY_ID=<keyID>
      AWS_SECRET_ACCESS_KEY=<applicationKey>
      ```

      The region is part of the bucket's endpoint (for example `us-west-004`). Any other
      S3-compatible storage works the same way with its own endpoint, and so does any other
      [restic repository](https://restic.readthedocs.io/en/stable/030_preparing_a_new_repo.html).
4. **First backup.** It creates both repositories:

   ```bash
   cd /opt/gestionador-clientes
   docker compose run --rm backup
   ```

   It ends with `backup finished`. A `WARNING: BACKUP_CLOUD_REPOSITORY is empty` means there is
   no cloud copy yet.
5. **Schedule.** Add to the crontab of the user that runs Docker (`crontab -e`):

   ```cron
   # Every night at 03:30: backup to the local and cloud copies
   30 3 * * * cd /opt/gestionador-clientes && docker compose run --rm -T backup >> backup.log 2>&1
   # The 1st of every month at 05:00: restore test of the cloud copy
   0 5 1 * * cd /opt/gestionador-clientes && scripts/restore-test.sh cloud >> backup.log 2>&1
   ```

6. **Monitoring (recommended).** A backup that silently stops running is the usual way of losing
   data. Create a free check at [healthchecks.io](https://healthchecks.io/) (daily, with a grace
   time of a few hours) and set its URL in `BACKUP_PING_URL`. Each backup reports to it, and
   failures are reported to `<url>/fail`; healthchecks.io emails when a backup fails or does not
   arrive.

7. **Run the first restore test** (next section) and write it down in the
   [log](#restore-test-log). Also add a monthly agenda item to the server's device on its map:
   "Revisar la prueba de restore".

## Restore test

```bash
scripts/restore-test.sh          # the local copy
scripts/restore-test.sh cloud    # the cloud copy
```

It starts a throwaway Postgres that keeps nothing on disk, restores the latest snapshot into it,
and then runs [`scripts/verify-restore.ts`](../scripts/verify-restore.ts) with the app's own code:
it counts customers, devices, fields, screenshots and so on, and decrypts every 2FA key, every
secret field and every screenshot with `ENCRYPTION_KEY`. Nothing decrypted is printed. The live
database and files are never touched, and the throwaway data is deleted at the end.

The result is appended to `restore-tests.log` next to `docker-compose.yml`. A failure lists what
did not restore or decrypt:

- `Nothing decrypts`: the `ENCRYPTION_KEY` in `.env` is not the one the backup was made with.
- `attachment ... has no file`: a screenshot deleted in the seconds between the database dump and
  the copy of the files. Run the backup and the test again; if it repeats, it is a real problem.

The monthly test runs on the same server, so it does not prove that the keys in the safe are
right. **Twice a year, do the full exercise**: on another machine, with only the printed sheet
and this repository, follow [Disaster recovery](#disaster-recovery) with the cloud copy and sign
in. Write it down in the log too.

## Disaster recovery

The server died, or the data is damaged. On a new server (or the same one, reinstalled):

1. Follow [deployment.md](deployment.md) sections 1 and 2, writing `.env` with the **same**
   `ENCRYPTION_KEY`, `RESTIC_PASSWORD` and backup settings as before (from the safe).
2. Start only the database and restore into it. `recover` refuses to run on a database that
   already has tables, so it can never overwrite live data:

   ```bash
   docker compose up -d db
   docker compose run --rm recover cloud     # or: local
   ```

3. Start everything and sign in as usual:

   ```bash
   docker compose up -d --build
   ```

To go back to an older copy, list them and pass the snapshot ID:

```bash
docker compose run --rm backup snapshots cloud
docker compose run --rm recover cloud <snapshot-id>
```

To restore over damaged data on a running server, stop the app, back the damaged state up just in
case (`docker compose run --rm backup`), remove the volumes (`docker compose down -v`, which
deletes the live database and screenshots) and follow step 2.

## Reference

| Task | Command |
|---|---|
| Backup now | `docker compose run --rm backup` |
| List the copies | `docker compose run --rm backup snapshots local` (or `cloud`) |
| Restore test | `scripts/restore-test.sh local` (or `cloud`) |
| Disaster recovery | `docker compose run --rm recover cloud [snapshot-id]` |

The backup image is [`docker/backup`](../docker/backup/Dockerfile): Postgres 18 client tools and
restic. Its commands are in [`backupctl.sh`](../docker/backup/backupctl.sh).

## Restore test log

The script writes `restore-tests.log` on its own; record here the full exercises and anything
worth remembering.

| Date | Copy | Result | Who | Notes |
|---|---|---|---|---|
| | | | | |
