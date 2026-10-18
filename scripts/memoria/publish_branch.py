#!/usr/bin/env python3
"""Publish only a validated static bundle to memoria-web; never force-push."""
import argparse
import hashlib
import json
import re
import shutil
import subprocess
from pathlib import Path

BRANCH = 'memoria-web'
ALLOWED_SUFFIXES = {'.json', '.docx', '.pdf', '.webp'}


def git(*args, **kwargs):
    return subprocess.run(['git', *args], check=True, text=True, **kwargs)


def validate_bundle(root):
    root = root.resolve()
    manifest = json.loads((root / 'manifest.json').read_text(encoding='utf-8'))
    if manifest.get('schemaVersion') != 1 or not manifest.get('documents'):
        raise ValueError('Invalid or empty publication manifest')
    paths = []
    for path in root.rglob('*'):
        if path.is_symlink() or any(p.startswith('.') for p in path.relative_to(root).parts):
            raise ValueError('Hidden files and symlinks are forbidden in a publication')
        if path.is_file():
            if path.suffix.lower() not in ALLOWED_SUFFIXES:
                raise ValueError('Unsupported publication file type')
            paths.append(path)
    if len(paths) > 5000:
        raise ValueError('Unexpectedly large publication')
    declared = manifest.get('files')
    if not isinstance(declared, list) or not declared:
        raise ValueError('Missing asset integrity manifest')
    indexed = {}
    for item in declared:
        relative = item.get('path', '')
        if not relative or relative.startswith('/') or any(p.startswith('.') for p in Path(relative).parts) or '\\' in relative or relative in indexed:
            raise ValueError('Invalid or duplicate asset path')
        indexed[relative] = item
    actual = {p.relative_to(root).as_posix() for p in paths if p.name != 'manifest.json'}
    if actual != set(indexed):
        raise ValueError('Unexpected or missing publication assets')
    for relative, item in indexed.items():
        asset = root / relative
        if asset.stat().st_size != item.get('size') or hashlib.sha256(asset.read_bytes()).hexdigest() != item.get('sha256'):
            raise ValueError('Publication integrity check failed')
    for doc in manifest['documents']:
        if not re.fullmatch(r'[a-z0-9]+(?:-[a-z0-9]+)*', doc['id']):
            raise ValueError('Invalid document id')
        if Path(doc['filename']).name != doc['filename']:
            raise ValueError('Invalid download name')
        for path in (root / doc['filename'], root / doc['id'] / 'document.json', root / doc['id'] / (doc['id'] + '.pdf')):
            if not path.is_file():
                raise ValueError('Incomplete generated publication')
    return manifest


def publish(assets, revision):
    assets = assets.resolve()
    validate_bundle(assets)
    repository = Path(git('rev-parse', '--show-toplevel', capture_output=True).stdout.strip()).resolve()
    if repository == assets or repository in assets.parents:
        raise ValueError('Assets must be outside checkout to survive branch switching')
    # Checkout must be clean and disposable: CI only. Refuse a local worktree.
    import os
    if os.environ.get('GITHUB_ACTIONS') != 'true':
        raise RuntimeError('Branch publisher is restricted to the disposable GitHub Actions checkout')
    if git('status', '--porcelain', capture_output=True).stdout.strip():
        raise RuntimeError('Refusing to replace a dirty checkout')
    found = git('ls-remote', '--heads', 'origin', 'refs/heads/' + BRANCH, capture_output=True).stdout.strip()
    if found:
        git('fetch', '--depth=1', 'origin', f'refs/heads/{BRANCH}:refs/remotes/origin/{BRANCH}')
        git('switch', '--force-create', BRANCH, 'refs/remotes/origin/' + BRANCH)
    else:
        git('switch', '--orphan', BRANCH)
    if git('branch', '--show-current', capture_output=True).stdout.strip() != BRANCH:
        raise RuntimeError('Not on the generated branch')
    # This checkout is ephemeral and confirmed to contain only the generated branch.
    git('rm', '-r', '--ignore-unmatch', '--', '.')
    for entry in assets.iterdir():
        target = repository / entry.name
        if entry.is_dir():
            shutil.copytree(entry, target, dirs_exist_ok=True)
        else:
            shutil.copy2(entry, target)
    git('add', '--all')
    if not git('diff', '--cached', '--name-only', capture_output=True).stdout.strip():
        print('Publication unchanged')
        return
    git('-c', 'user.name=github-actions[bot]', '-c', 'user.email=41898282+github-actions[bot]@users.noreply.github.com',
        'commit', '-m', 'Publish memoria from ' + revision[:12])
    git('push', 'origin', 'HEAD:refs/heads/' + BRANCH)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--assets', type=Path, required=True)
    parser.add_argument('--revision', required=True)
    args = parser.parse_args()
    publish(args.assets, args.revision)
