#!/usr/bin/env python3
"""Create a consistent SQLite backup and copy it to an rclone remote.

Required environment: DATABASE_PATH and BACKUP_REMOTE (for example
oci:eniveil-backups/production).  The script never deletes a source database.
"""
import argparse, hashlib, json, os, shutil, sqlite3, subprocess, sys, time
from pathlib import Path

DB = Path(os.environ.get("DATABASE_PATH", "/data/festival.sqlite"))
REMOTE = os.environ.get("BACKUP_REMOTE", "")
WORK = Path(os.environ.get("BACKUP_WORK_DIR", "/var/lib/eniveil-backup"))
KEEP_DAYS = int(os.environ.get("BACKUP_KEEP_DAYS", "7"))

def run(*command):
    subprocess.run(command, check=True)

def status(**value):
    WORK.mkdir(parents=True, exist_ok=True)
    (WORK / "status.json").write_text(json.dumps({"at": int(time.time()), **value}) + "\n")

def backup():
    if not REMOTE: raise RuntimeError("BACKUP_REMOTE is required")
    if not DB.is_file(): raise RuntimeError(f"database not found: {DB}")
    staging = WORK / "staging"; staging.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    copy = staging / f"festival-{stamp}.sqlite"
    source = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
    target = sqlite3.connect(copy)
    try: source.backup(target)
    finally: target.close(); source.close()
    digest = hashlib.sha256(copy.read_bytes()).hexdigest()
    manifest = copy.with_suffix(".json")
    manifest.write_text(json.dumps({"file": copy.name, "sha256": digest, "createdAt": stamp}) + "\n")
    run("rclone", "copy", "--immutable", str(copy), REMOTE)
    run("rclone", "copy", "--immutable", str(manifest), REMOTE)
    run("rclone", "delete", "--min-age", f"{KEEP_DAYS}d", REMOTE)
    status(ok=True, file=copy.name, sha256=digest, remote=REMOTE)
    for old in staging.glob("festival-*"):
        if old != copy and old != manifest: old.unlink(missing_ok=True)

def verify():
    candidates = sorted((WORK / "staging").glob("festival-*.sqlite"), reverse=True)
    if not candidates: raise RuntimeError("no local backup available for restore verification")
    restored = WORK / "restore-check.sqlite"; shutil.copy2(candidates[0], restored)
    db = sqlite3.connect(f"file:{restored}?mode=ro", uri=True)
    try: db.execute("PRAGMA integrity_check").fetchone()[0] == "ok" or (_ for _ in ()).throw(RuntimeError("integrity check failed"))
    finally: db.close(); restored.unlink(missing_ok=True)
    status(ok=True, restoreVerified=True, file=candidates[0].name)

try:
    parser = argparse.ArgumentParser(); parser.add_argument("--verify", action="store_true")
    args = parser.parse_args(); verify() if args.verify else backup()
except Exception as error:
    status(ok=False, error=str(error)); print(error, file=sys.stderr); sys.exit(1)
