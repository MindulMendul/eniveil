import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location('deployment', Path(__file__).resolve().parents[1]/'deploy-compose.py')
deployment = importlib.util.module_from_spec(spec)
spec.loader.exec_module(deployment)


class ComposeDeploymentTests(unittest.TestCase):
    def test_existing_volume_and_network_identity_are_preserved(self):
        for env, volume, port in [('production','deploy_festival-data',3000),('qa','murder-parker-qa_festival-qa-data',3001)]:
            with self.subTest(environment=env):
                target = deployment.TARGETS[env]
                config = deployment.definition(Path('/releases/source'),target,'a'*40)
                self.assertEqual(config['volumes']['data'],{'external':True,'name':volume})
                web=config['services'][target['service']]
                self.assertEqual(web['ports'],[f'127.0.0.1:{port}:3000'])
                self.assertEqual(web['networks']['mindul-net']['aliases'],[target['alias']])
                self.assertEqual(web['environment']['APP_ORIGIN'],target['origin'])
                self.assertEqual(web['environment']['OTEL_EXPORTER_OTLP_ENDPOINT'],'http://tempo:4318')

    def test_environments_have_distinct_images_volumes_ports(self):
        prod=deployment.definition(Path('/p'),deployment.TARGETS['production'],'a'*40)
        qa=deployment.definition(Path('/q'),deployment.TARGETS['qa'],'a'*40)
        self.assertNotEqual(prod['volumes'],qa['volumes'])
        self.assertNotEqual(prod['services']['festival']['image'],qa['services']['festival-qa']['image'])

    def test_invalid_commit_is_rejected_before_touching_server(self):
        with self.assertRaises(ValueError):
            deployment.deploy('production','main; bad')

    def test_failed_public_health_restores_previous_image_after_backup(self):
        import json
        import tempfile
        from unittest.mock import patch
        from types import SimpleNamespace
        sha='a'*40
        calls=[]
        def fake_run(*args, **kwargs):
            args=[str(a) for a in args]
            calls.append(args)
            if 'rev-parse' in args:
                return sha
            if args[:3]==['docker','info','--format']:
                return '/docker-root'
            if args[:2]==['docker','inspect']:
                return json.dumps([{'Image':'sha256:previous-image','Config':{
                    'Env':['APP_ORIGIN=https://old.example.org'],
                    'Labels':{'com.docker.compose.project.config_files':'/old/compose.yaml'}}}])
            if args[-3:]==['config','--format','json']:
                return json.dumps({'services':{'festival':{'image':'old:latest'}}})
            return ''
        with tempfile.TemporaryDirectory() as tmp, patch.object(deployment.Path,'home',return_value=Path(tmp)), \
             patch.object(deployment,'run',side_effect=fake_run), \
             patch.object(deployment.shutil,'disk_usage',return_value=SimpleNamespace(free=5 * 1024 ** 3)), \
             patch.object(deployment,'wait_https',side_effect=RuntimeError('HTTPS failed')):
            with self.assertRaisesRegex(RuntimeError,'HTTPS failed'):
                deployment.deploy('production',sha)
            rollback=json.loads((Path(tmp)/'.local/share/mindul-murder-deploy/production'/sha/'rollback.json').read_text())
            self.assertEqual(rollback['services']['festival']['image'],'sha256:previous-image')
            self.assertFalse((Path(tmp)/'.local/share/mindul-murder-deploy/production/current.json').exists())
        backup=next(i for i,c in enumerate(calls) if c[-1]=='backup')
        up=next(i for i,c in enumerate(calls) if 'up' in c)
        self.assertLess(backup,up)
        self.assertTrue(any('rollback.json' in ' '.join(c) and 'up' in c for c in calls))
