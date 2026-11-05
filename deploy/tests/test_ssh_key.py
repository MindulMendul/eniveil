import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('ssh_key',Path(__file__).resolve().parents[1]/'prepare-ssh-key.py')
key=importlib.util.module_from_spec(spec)
spec.loader.exec_module(key)


class SSHKeyTests(unittest.TestCase):
    def test_real_openssh_and_pem_keys_accept_raw_base64_and_escaped_lines(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for kind in ['openssh','pem']:
                source=root/kind
                command=['ssh-keygen','-q','-t','rsa','-b','2048','-N','','-f',str(source)]
                if kind=='pem':command+=['-m','PEM']
                subprocess.run(command,check=True)
                value=source.read_text()
                variants=[value,base64.b64encode(value.encode()).decode(),value.replace('\n',r'\n'),json.dumps(value)]
                for variant in variants:
                    with self.subTest(kind=kind,variant=variants.index(variant)):
                        target=root/'output'
                        key.write_key(target,variant)
                        self.assertEqual(target.read_text(),value)
                        self.assertEqual(target.stat().st_mode & 0o777,0o600)

    def test_generic_pkcs8_header_is_supported(self):
        value='-----BEGIN PRIVATE KEY-----\nplaceholder\n-----END PRIVATE KEY-----\n'
        self.assertEqual(key.normalize(value),value)

    def test_invalid_secret_is_not_echoed_in_error(self):
        with self.assertRaises(ValueError) as error:
            key.normalize('sensitive-invalid-value')
        self.assertNotIn('sensitive-invalid-value',str(error.exception))

    def test_invalid_private_key_is_removed(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'key'
            with self.assertRaises(ValueError):
                key.write_key(path,'-----BEGIN PRIVATE KEY-----\ninvalid\n-----END PRIVATE KEY-----')
            self.assertFalse(path.exists())
