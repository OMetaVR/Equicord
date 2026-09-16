#!/usr/bin/env python3
# Copyright (c) 2026 Equicord contributors
# SPDX-License-Identifier: GPL-3.0-or-later

import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile

source = Path(sys.argv[1]).resolve()
home = Path.home()
data = home / '.local/share/equicord-maintenance'
state = home / '.local/state/equicord-maintenance'
state.mkdir(parents=True, exist_ok=True)
environment = {**os.environ, 'CI': 'true'}


def run(*args, cwd=source, capture=False):
    result = subprocess.run(args, cwd=cwd, env=environment, check=True,
                            text=True, stdout=subprocess.PIPE if capture else None)
    return result.stdout.strip() if capture else None


with (state / 'update.lock').open('w') as lock:
    try:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        sys.exit(0)
    origin = run('git', 'remote', 'get-url', 'origin', capture=True)
    upstream = run('git', 'remote', 'get-url', 'upstream', capture=True)
    repository = run('gh', 'repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner', capture=True)
    with tempfile.TemporaryDirectory(prefix='fork-update-', dir=state) as temporary:
        checkout = Path(temporary) / 'source'
        run('git', 'clone', '--quiet', '--single-branch', '--branch', 'main', origin, str(checkout))
        run('git', 'remote', 'add', 'upstream', upstream, cwd=checkout)
        run('git', 'fetch', '--quiet', 'upstream', 'main', cwd=checkout)
        run('git', 'merge', '--no-edit', 'upstream/main', cwd=checkout)
        commit = run('git', 'rev-parse', 'HEAD', cwd=checkout, capture=True)
        tag = f'build-{commit}'
        release = json.loads(run('gh', 'api', f'repos/{repository}/releases/latest', capture=True))
        archive = data / 'custom/desktop.asar'
        if release['tag_name'] == tag and archive.is_file() and f'// Equicord {commit}'.encode() in archive.read_bytes():
            print(f'Fork is current: {commit}', flush=True)
            sys.exit(0)
        run('pnpm', 'install', '--frozen-lockfile', cwd=checkout)
        for script in ('testTsc', 'lint', 'lint-styles', 'buildStandalone', 'buildWebStandalone'):
            run('pnpm', script, cwd=checkout)
        run('pnpm', 'generatePluginJson', 'dist/plugins.json', cwd=checkout)
        run('git', 'push', 'origin', 'HEAD:main', cwd=checkout)
        current = run('gh', 'api', f'repos/{repository}/git/ref/heads/main', '--jq', '.object.sha', capture=True)
        if current != commit:
            sys.exit('The fork changed during validation. Keeping the installed build until the next check.')
        published = subprocess.run(['gh', 'release', 'view', tag, '--repo', repository,
                                    '--json', 'isDraft'], check=False, text=True, capture_output=True)
        assets = [str(checkout / 'dist' / name) for name in
                  ('desktop.asar', 'equibop.asar', 'extension-chrome.zip', 'extension-firefox.zip', 'plugins.json')]
        if published.returncode == 0:
            if json.loads(published.stdout)['isDraft']:
                run('gh', 'release', 'upload', tag, *assets, '--clobber', '--repo', repository)
                run('gh', 'release', 'edit', tag, '--draft=false', '--latest', '--repo', repository)
        else:
            run('gh', 'release', 'create', tag, *assets, '--target', commit,
                '--title', f'Latest {commit}', '--notes', f'Validated desktop and web builds from {commit}.',
                '--draft', '--repo', repository)
            run('gh', 'release', 'edit', tag, '--draft=false', '--latest', '--repo', repository)
        selection = data / 'build-path'
        if selection.is_file() and Path(selection.read_text().strip()) == archive:
            with (state / 'lock').open('w') as repair_lock:
                fcntl.flock(repair_lock, fcntl.LOCK_EX)
                if archive.exists():
                    shutil.copy2(archive, archive.with_name('previous-desktop.asar'))
                staged = archive.with_suffix('.asar.tmp')
                shutil.copy2(checkout / 'dist/desktop.asar', staged)
                os.replace(staged, archive)
            run(str(home / '.local/bin/equicord-maintain'))
            subprocess.run(['notify-send', 'Custom Equicord updated',
                            'The fork passed validation and was installed. Restart Discord to load it.'], check=False)
        print(f'Published and validated fork: {commit}', flush=True)
