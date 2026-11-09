#!/usr/bin/env python3
"""Local cooperative file ownership; no network, app execution, or secret reads."""
import argparse
import datetime
import fcntl
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def git(*args):
    return subprocess.check_output(['git', *args])


ROOT = Path(git('rev-parse', '--show-toplevel').decode().strip()).resolve()
COMMON = Path(git('rev-parse', '--git-common-dir').decode().strip()).resolve()
STATE = COMMON / 'sinker-session-coordination'


def safe_path(raw):
    p = Path(raw)
    if p.is_absolute() or '..' in p.parts or not p.parts or p.parts[0] == '.git':
        raise ValueError('Use repository-relative file/directory paths without ..')
    return p.as_posix().rstrip('/')


def secret(path):
    return any(p.startswith('.env') or p.lower() in {'secrets', 'credentials'}
               or p.lower().endswith(('.pem', '.key', '.p12', '.pfx'))
               for p in Path(path).parts)


def snapshot():
    # Hash only changed tracked/nonignored files. Never open environment/key files.
    names = set(git('ls-files', '-m', '-o', '--exclude-standard', '-z').decode().split('\0'))
    names.update(git('diff', '--cached', '--name-only', '-z').decode().split('\0'))
    files = {}
    for name in sorted(names - {''}):
        if secret(name):
            continue
        p = ROOT / name
        if not p.resolve().is_relative_to(ROOT):
            continue
        if p.is_symlink():
            files[name] = 'symlink'
        elif p.is_file():
            h = hashlib.sha256()
            with p.open('rb') as stream:
                for chunk in iter(lambda: stream.read(65536), b''):
                    h.update(chunk)
            files[name] = h.hexdigest()
        else:
            files[name] = 'missing'
    return {'head': git('rev-parse', 'HEAD').decode().strip(),
            'branch': git('branch', '--show-current').decode().strip(), 'files': files}


def overlap(a, b):
    return a == b or a.startswith(b + '/') or b.startswith(a + '/')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action', choices=['check', 'claim', 'release'])
    parser.add_argument('--session', required=True, help='Stable unique chat ID, not just a role name')
    parser.add_argument('--paths', nargs='*', default=[])
    parser.add_argument('--note', default='', help='Public-safe purpose or change summary')
    args = parser.parse_args()
    paths = [safe_path(p) for p in args.paths]
    if any(secret(p) for p in paths):
        parser.error('Environment/credential files are outside this tool scope')
    if args.action == 'claim' and not paths:
        parser.error('claim requires --paths; claim exact files or narrowly scoped directories')
    STATE.mkdir(exist_ok=True)
    with (STATE / 'mutex').open('a') as lock:
        # OS lock is released on process exit; do not steal another session's claims.
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        dbpath = STATE / 'registry.json'
        db = json.loads(dbpath.read_text()) if dbpath.exists() else {'sessions': {}}
        sessions = db['sessions']
        own = sessions.get(args.session, {})
        now = snapshot()
        before = own.get('snapshot')
        changed = sorted(k for k in set(now['files']) | set((before or {}).get('files', {}))
                         if now['files'].get(k) != (before or {}).get('files', {}).get(k))
        others = {k: v for k, v in sessions.items() if k != args.session and v.get('paths')}
        conflicts = [{'session': sid, 'path': p, 'claimed': q}
                     for sid, record in others.items() for p in paths
                     for q in record['paths'] if overlap(p, q)]
        result = {'session': args.session, 'checkout': str(ROOT),
                  'head': now['head'], 'branch': now['branch'],
                  'headChanged': before is not None and before['head'] != now['head'],
                  'changedSinceLastCheck': changed, 'firstCheck': before is None,
                  'activeClaims': others, 'conflicts': conflicts,
                  'sessionUpdates': {k: {f: v.get(f) for f in ['paths', 'note', 'updated', 'checkout']}
                                     for k, v in sessions.items()},
                  'warning': 'Cooperative local registry, not a filesystem lock or remote notification. Re-read diffs before writing.'}
        # Omit other snapshots to keep output compact and avoid exposing hashes unnecessarily.
        result['activeClaims'] = {k: {f: v.get(f) for f in ['paths', 'note', 'updated', 'checkout']}
                                 for k, v in others.items()}
        if conflicts:
            print(json.dumps(result, ensure_ascii=False, indent=2))
            return 2
        claimed = own.get('paths', [])
        if args.action == 'claim':
            claimed = sorted(set(claimed + paths))
        elif args.action == 'release':
            claimed = [p for p in claimed if p not in paths] if paths else []
        sessions[args.session] = {'paths': claimed, 'note': args.note or own.get('note', ''),
                                  'updated': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                  'checkout': str(ROOT), 'snapshot': now}
        temp = dbpath.with_suffix('.tmp')
        temp.write_text(json.dumps(db, ensure_ascii=False, indent=2) + '\n')
        temp.replace(dbpath)
        result['ownClaims'] = claimed
        print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, BlockingIOError) as error:
        print('STOP: coordination unavailable: ' + str(error), file=sys.stderr)
        sys.exit(2)
