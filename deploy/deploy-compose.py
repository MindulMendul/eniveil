#!/usr/bin/env python3
"""Deploy an immutable Git commit to the existing Mindul Compose environments."""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time
import urllib.request

REPOSITORY = 'https://github.com/MindulMendul/murder-parker.git'
TARGETS = {
    'production': {'branch': 'main', 'project': 'deploy', 'service': 'festival',
                   'container': 'deploy-festival-1', 'volume': 'deploy_festival-data',
                   'origin': 'https://mindul-murder-mystery.duckdns.org',
                   'alias': 'mindul-murder-mystery', 'port': 3000},
    'qa': {'branch': 'qa', 'project': 'murder-parker-qa', 'service': 'festival-qa',
           'container': 'murder-parker-qa-festival-qa-1', 'volume': 'murder-parker-qa_festival-qa-data',
           'origin': 'https://qa-mindul-murder-mystery.duckdns.org',
           'alias': 'mindul-murder-mystery-qa', 'port': 3001},
}


def run(*args, capture=False, env=None):
    result = subprocess.run([str(a) for a in args], check=True, text=True,
                            stdout=subprocess.PIPE if capture else None, env=env)
    return result.stdout.strip() if capture else None


def definition(source, target, sha):
    service = target['service']
    return {'services': {service: {
        'image': 'mindul-murder-'+target['branch']+':'+sha,
        'build': {'context': str(source), 'dockerfile': 'deploy/Dockerfile',
                  'args': {'APP_RELEASE': sha, 'PUBLIC_GA_MEASUREMENT_ID': os.getenv('PUBLIC_GA_MEASUREMENT_ID', '')}},
        'restart': 'unless-stopped', 'mem_limit': '768m', 'cpus': 2,
        'ports': [f"127.0.0.1:{target['port']}:3000"],
        'env_file': [str(Path.home()/'murder-parker/deploy/.env')],
        'environment': {'APP_ORIGIN': target['origin'], 'APP_RELEASE': sha,
                        'OTEL_EXPORTER_OTLP_ENDPOINT': 'http://tempo:4318'},
        'volumes': ['data:/data'],
        'networks': {'mindul-net': {'aliases': [target['alias']]}},
        'healthcheck': {'test': ['CMD','bun','-e',"const r = await fetch('http://127.0.0.1:3000/api/health'); if (!r.ok) process.exit(1)"],
                        'interval': '10s', 'timeout': '5s', 'start_period': '20s', 'retries': 12}}},
        'volumes': {'data': {'external': True, 'name': target['volume']}},
        'networks': {'mindul-net': {'external': True, 'name': 'mindul-net'}}}


def wait_https(origin):
    last = None
    for _ in range(12):
        try:
            with urllib.request.urlopen(origin+'/api/health', timeout=10) as response:
                if response.status == 200:
                    return
        except Exception as error:
            last = error
        time.sleep(5)
    raise RuntimeError(f'Public HTTPS health check failed: {last}')


def deploy(environment, sha):
    if not re.fullmatch('[a-f0-9]{40}', sha):
        raise ValueError('Expected a full commit SHA')
    target = TARGETS[environment]
    root = Path.home()/'.local/share/mindul-murder-deploy'
    root.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Serialize production and QA builds on this four-core host.
    with (root/'deploy.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        release = root/environment/sha
        source = release/'source'
        release.mkdir(parents=True, exist_ok=True)
        if not source.exists():
            run('git','clone','--no-checkout',REPOSITORY,source)
        run('git','-C',source,'fetch','origin',target['branch'])
        current = run('git','-C',source,'rev-parse','FETCH_HEAD',capture=True)
        if current != sha:
            raise RuntimeError('Branch advanced: refusing to deploy an obsolete commit; deploy the current branch head')
        run('git','-C',source,'checkout','--detach',sha)
        run('docker','volume','inspect',target['volume'],capture=True)
        run('docker','network','inspect','mindul-net',capture=True)
        # Never edit the live source snapshots or rebuild a moving latest tag.
        previous = json.loads(run('docker','inspect',target['container'],capture=True))[0]
        labels = previous['Config']['Labels']
        old_command = ['docker','compose','-p',target['project']]
        for file in labels['com.docker.compose.project.config_files'].split(','):
            old_command += ['-f',file]
        old_env = dict(os.environ)
        old_env.update(v.split('=',1) for v in previous['Config']['Env'] if v.split('=',1)[0] in ('APP_ORIGIN','APP_RELEASE'))
        old_config = json.loads(run(*old_command,'config','--format','json',capture=True,env=old_env))
        old_config['services'][target['service']]['image'] = previous['Image']
        old_file = release/'rollback.json'
        old_file.write_text(json.dumps(old_config))
        old_file.chmod(0o600)
        config = definition(source,target,sha)
        # The existing env file is optional; environment-specific files take precedence.
        app_env = Path.home()/('murder-parker' if environment=='production' else 'murder-parker-qa')/'deploy/.env'
        config['services'][target['service']]['env_file'] = [str(app_env)] if app_env.exists() else []
        file = release/'compose.json'
        file.write_text(json.dumps(config))
        file.chmod(0o600)
        command = ['docker','compose','-p',target['project'],'-f',str(file)]
        run(*command,'config','--quiet')
        run(*command,'build')
        # Back up the live databases before executing new application code.
        run(sys.executable,Path.home()/'mindul-ai-infra/ops/mindul_ops.py','backup')
        try:
            run(*command,'up','-d','--no-build','--wait','--wait-timeout','180')
            wait_https(target['origin'])
        except BaseException:
            run('docker','compose','-p',target['project'],'-f',old_file,
                'up','-d','--no-build','--wait','--wait-timeout','180')
            raise
        state = root/environment/'current.json'
        temporary = state.with_suffix('.tmp')
        temporary.write_text(json.dumps({'commit':sha,'compose':str(file),'deployed_at':time.time()}))
        temporary.replace(state)
        print(f"Deployment successful: {environment} {sha} {target['origin']}")


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('environment', choices=TARGETS)
    parser.add_argument('sha')
    args = parser.parse_args()
    deploy(args.environment,args.sha)
