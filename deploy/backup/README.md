# Remote SQLite backup operations

This implements the #256 target: backup at most every 15 minutes (RPO 15m), retain seven days, and verify a restore monthly. The backup is a SQLite `backup()` snapshot, so WAL state is included consistently without stopping the app.

## One-time OCI host setup

Install `rclone`, configure an encrypted remote, then copy the four unit files and `eniveil-backup.py` to the paths declared by the units. Create `/etc/eniveil/backup.env` (mode `0600`):

```sh
DATABASE_PATH=/absolute/path/to/festival.sqlite
BACKUP_REMOTE=remote:eniveil/production
BACKUP_WORK_DIR=/var/lib/eniveil-backup
BACKUP_KEEP_DAYS=7
```

`BACKUP_REMOTE` must be an rclone crypt remote or an encrypted bucket path. Do not store its credentials in this repository. Enable the timers with:

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now eniveil-backup.timer eniveil-restore-verify.timer
sudo systemctl start eniveil-backup.service
systemctl status eniveil-backup.service
cat /var/lib/eniveil-backup/status.json
```

## Alerting and recovery

The systemd service exits non-zero and writes `status.json` on transfer, integrity, or retention failure; connect that failure state to the existing OCI alerting channel. Restore drills run on the first of each month and update the same status file. Record the measured start-to-usable-service duration in the operations log; the target is under one hour.

To restore, stop the app, download the selected `.sqlite` and matching manifest with rclone, verify SHA-256, replace the database only after preserving the current file, then start the app and check `/api/health`.
