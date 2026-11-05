#!/usr/bin/env python3
"""Normalize a private-key secret without logging its contents."""
import base64
import json
import os
from pathlib import Path
import re
import subprocess
import sys


def normalize(value):
    value = value.strip()
    if value.startswith('"'):
        try:
            decoded = json.loads(value)
            if isinstance(decoded, str):
                value = decoded
        except ValueError:
            pass
    value = value.replace('\\r\\n', '\n').replace('\\n', '\n').replace('\r', '')
    if '-----BEGIN ' not in value:
        try:
            value = base64.b64decode(''.join(value.split()), validate=True).decode()
        except (ValueError, UnicodeError):
            raise ValueError('SSH_PRIVATE_KEY must contain an OpenSSH/PEM private key or its base64 encoding') from None
        value = value.replace('\\n', '\n').replace('\r', '').strip()
    if not re.match(r'^-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----\n', value):
        raise ValueError('SSH_PRIVATE_KEY does not have a supported private-key header')
    return value.strip()+'\n'


def write_key(path, value):
    data = normalize(value)
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        os.fchmod(fd, 0o600)
        with os.fdopen(fd, 'w') as handle:
            handle.write(data)
        result = subprocess.run(['ssh-keygen', '-y', '-P', '', '-f', str(path)],
                                stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)
        if result.returncode:
            raise ValueError('SSH_PRIVATE_KEY is invalid or passphrase-protected; use a valid unencrypted deployment key')
    except BaseException:
        Path(path).unlink(missing_ok=True)
        raise


if __name__ == '__main__':
    try:
        write_key(sys.argv[1], os.environ.get('SSH_PRIVATE_KEY', ''))
    except (ValueError, OSError) as error:
        sys.exit(str(error))
