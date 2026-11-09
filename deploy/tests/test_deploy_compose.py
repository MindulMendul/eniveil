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

    def test_production_domain_is_used_for_runtime_and_web_build(self):
        target = deployment.TARGETS['production']
        config = deployment.definition(Path('/source'), target, 'a'*40)
        web = config['services']['festival']
        self.assertEqual(web['environment']['APP_ORIGIN'], 'https://eniveil.com')
        self.assertEqual(web['build']['args']['PUBLIC_SITE_URL'], 'https://eniveil.com')
        self.assertEqual(deployment.TARGETS['qa']['origin'], 'https://qa-mindul-murder-mystery.duckdns.org')
        self.assertEqual(web['build']['args']['PUBLIC_INDEXABLE'], 'true')
        qa = deployment.definition(Path('/source'), deployment.TARGETS['qa'], 'b'*40)
        self.assertEqual(qa['services']['festival-qa']['build']['args']['PUBLIC_INDEXABLE'], 'false')

    def test_invalid_commit_is_rejected_before_touching_server(self):
        with self.assertRaises(ValueError):
            deployment.deploy('production','main; bad')

    def test_failed_public_health_restores_previous_image_after_backup(self):
        import json
        import tempfile
        from types import SimpleNamespace
        from unittest.mock import patch
        sha='a'*40
        calls=[]
        def fake_run(*args, **kwargs):
            args=[str(a) for a in args]
            calls.append(args)
            if 'rev-parse' in args:
                return sha
            if args[:2]==['docker','info']:
                return '/var/lib/docker'
            if args[:2]==['docker','inspect']:
                return json.dumps([{'Image':'sha256:previous-image','Config':{
                    'Env':['APP_ORIGIN=https://old.example.org'],
                    'Labels':{'com.docker.compose.project.config_files':'/old/compose.yaml'}}}])
            if args[-3:]==['config','--format','json']:
                return json.dumps({'services':{'festival':{'image':'old:latest'}}})
            return ''
        with tempfile.TemporaryDirectory() as tmp, patch.object(deployment.Path,'home',return_value=Path(tmp)), \
             patch.object(deployment,'run',side_effect=fake_run), \
             patch.object(deployment.shutil,'disk_usage',return_value=SimpleNamespace(free=8*1024**3)), \
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


class BuildStorageTests(unittest.TestCase):
    def check_space(self, free_values, expected_calls, fails=False):
        from types import SimpleNamespace
        from unittest.mock import call, patch
        with patch.object(deployment.shutil, 'disk_usage', side_effect=[SimpleNamespace(free=n) for n in free_values]), patch.object(deployment, 'run') as run:
            if fails:
                with self.assertRaisesRegex(RuntimeError, 'Insufficient Docker storage'):
                    deployment.ensure_build_space(Path('/var/lib/docker'))
            else:
                deployment.ensure_build_space(Path('/var/lib/docker'))
            self.assertEqual(run.call_args_list, [call(*args) for args in expected_calls])

    def test_sufficient_space_does_not_prune(self):
        self.check_space([4*1024**3], [])

    def test_cache_cleanup_can_avoid_image_prune(self):
        self.check_space([1, 4*1024**3], [('docker','builder','prune','--all','--force')])

    def test_only_dangling_images_are_pruned_after_cache_is_insufficient(self):
        self.check_space([1, 2, 4*1024**3], [('docker','builder','prune','--all','--force'), ('docker','image','prune','--force')])

    def test_insufficient_space_still_aborts_after_both_safe_cleanups(self):
        self.check_space([1, 2, 3], [('docker','builder','prune','--all','--force'), ('docker','image','prune','--force')], fails=True)
