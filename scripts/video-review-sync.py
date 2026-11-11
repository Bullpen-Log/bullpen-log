#!/usr/bin/env python3
"""비민감 영상 검수 기록만 공유한다. 현재 HEAD/인덱스/가지와 다른 파일은 보존한다.

status는 로컬/캐시만 읽는다. check 및 publish/receive --dry-run은 원격 객체를
받지만 기록 파일·동기화 기준은 쓰지 않는다. 삭제 전파 없음. Python 3.9+,
POSIX(macOS/Linux), Git 필요. DB나 앱 실행 없이 사용한다.
"""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import stat
import subprocess
import sys
import tempfile
from urllib.parse import parse_qsl, urlsplit

ROOTS = tuple(f'docs/reviews/handoff/{s}/yunho' for s in ('exercise', 'mechanics'))
MAX_BYTES = 2 * 1024 * 1024
MAX_FILES = 2000
TIMEOUT = 45
KNOWN_PATCH_HOOK = 'da40e5e6d594ac6427b4425c703e08171dfa8160b496e9aeb2e16d876d080f0d'
OID = re.compile(r'^(?:[0-9a-f]{40}|[0-9a-f]{64})$')


class Stop(Exception):
    def __init__(self, message, code=3):
        super().__init__(message)
        self.code = code


def digest(data):
    return hashlib.sha256(data).hexdigest() if data is not None else None


def eligible(name):
    return any(name.startswith(root + '/') and
               (name.endswith(('.json', '.md')) or name == root + '/RESUME.txt')
               for root in ROOTS)


def validate_path(name):
    p = PurePosixPath(name)
    if (not name or p.is_absolute() or p.as_posix() != name or
            any(x in ('', '.', '..') or x.startswith('.') or
                re.search(r'(?i)(?:^|[_.-])(env|secrets?|credentials?|private[-_]?key)(?:$|[_.-])', x)
                or x.lower().endswith(('.pem', '.key', '.p12', '.pfx')) for x in p.parts) or
            any(ord(c) < 32 or c == '\\' for c in name) or not eligible(name)):
        raise Stop('Unsafe or unsupported review path (no content read).')
    return name


def validate_content(name, data):
    if len(data) > MAX_BYTES or b'\0' in data:
        raise Stop(f'Invalid/oversized review file: {name}')
    try:
        text = data.decode('utf-8')
        if name.endswith('.json'):
            value = json.loads(text)
            if not isinstance(value, (dict, list)):
                raise ValueError()
    except (UnicodeError, ValueError):
        raise Stop(f'Invalid UTF-8/JSON review file: {name}') from None
    patterns = [r'-----BEGIN [^-\n]*PRIVATE KEY-----',
                r'(?i)\bBearer\s+[A-Za-z0-9_.-]{16,}',
                r'\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}',
                r'\b(?:sk-|ghp_|github_pat_)[A-Za-z0-9_-]{16,}',
                r'''(?i)(?:api[_-]?key|service[_-]?role[_-]?key|password|client[_-]?secret)\s*["']?\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{16,}''']
    if any(re.search(p, text) for p in patterns):
        raise Stop(f'Potential sensitive content: {name} (value redacted).')
    for raw in re.findall(r'https?://[^\s<>"\x27]+', text):
        try:
            url = urlsplit(raw)
            sensitive = any(re.search(r'(?i)(token|signature|credential|api.?key|^sig$|^policy$|^key-pair-id$|^x-amz-|^x-goog-)', k)
                            for k, _ in parse_qsl(url.query))
            if url.username or url.password or sensitive:
                raise Stop(f'Potential private/signed URL: {name} (URL redacted).')
        except ValueError:
            raise Stop(f'Malformed URL in review file: {name}') from None


class Repo:
    def __init__(self, location):
        self.cwd = Path(location).resolve()
        self.env = {k: v for k, v in os.environ.items() if not k.startswith('GIT_')}
        self.env.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0')
        self.root = Path(self.git('rev-parse', '--show-toplevel').decode().strip()).resolve()
        self.cwd = self.root
        common = self.git('rev-parse', '--path-format=absolute', '--git-common-dir').decode().strip()
        self.state_dir = Path(common) / 'video-review-sync-v1'
        remote = self.git('remote', 'get-url', '--all', 'origin')
        push_remote = self.git('remote', 'get-url', '--push', '--all', 'origin')
        if len(remote.splitlines()) != 1 or remote != push_remote:
            raise Stop('Origin fetch/push destinations must be the same single destination.')
        self.identity = digest(str(self.root).encode() + b'\0' + remote)

    def git(self, *args, data=None, extra=None, network=False):
        env = dict(self.env)
        env.update(extra or {})
        try:
            r = subprocess.run(['git', '--no-pager', *args], cwd=self.cwd, env=env,
                               input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                               timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            raise Stop('Git timed out; no automatic retry.', 4) from None
        if r.returncode:
            # Remote errors may contain credentials/URLs or review content. Keep
            # the original code, never echo arbitrary Git output into public logs.
            raise Stop(f'Git {args[0]} failed (original exit {r.returncode}; output redacted).', 4 if network else 5)
        return r.stdout

    @contextlib.contextmanager
    def parent_fd(self, name, create=False):
        validate_path(name)
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        fd = os.open(self.root, flags)
        try:
            for part in PurePosixPath(name).parts[:-1]:
                try:
                    nxt = os.open(part, flags, dir_fd=fd)
                except FileNotFoundError:
                    if not create:
                        raise
                    os.mkdir(part, mode=0o755, dir_fd=fd)
                    nxt = os.open(part, flags, dir_fd=fd)
                os.close(fd)
                fd = nxt
            yield fd, PurePosixPath(name).name
        finally:
            os.close(fd)

    def read_local(self, name):
        try:
            with self.parent_fd(name) as (fd, leaf):
                filefd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
                with os.fdopen(filefd, 'rb') as stream:
                    st = os.fstat(stream.fileno())
                    if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_BYTES:
                        raise Stop(f'Nonregular/oversized review file: {name}')
                    data = stream.read(MAX_BYTES + 1)
                    validate_content(name, data)
                    return data
        except FileNotFoundError:
            return None
        except OSError:
            raise Stop(f'Unsafe or unreadable review path: {name}') from None

    def scan_local(self):
        names = set()
        for base in ROOTS:
            # Validate parent components even when the root does not exist yet.
            self.read_local(base + '/checkpoint.json')
            root = self.root / base
            if not root.exists():
                continue
            for current, dirs, files in os.walk(root, followlinks=False):
                for child in dirs + files:
                    p = Path(current) / child
                    if p.is_symlink():
                        raise Stop('Symlink in review roots; synchronization refused.')
                for child in files:
                    name = (Path(current) / child).relative_to(self.root).as_posix()
                    if eligible(name):
                        names.add(validate_path(name))
        if len(names) > MAX_FILES:
            raise Stop('Too many review files.')
        return names

    def fresh_remote(self):
        def tip():
            fields = self.git('ls-remote', '--exit-code', 'origin', 'refs/heads/main', network=True).split()
            if len(fields) != 2 or not OID.fullmatch(fields[0].decode()):
                raise Stop('Remote main is absent or ambiguous.', 4)
            return fields[0].decode()
        first = tip()
        self.git('fetch', '--no-tags', '--no-write-fetch-head', '--no-recurse-submodules',
                 'origin', first, network=True)
        if tip() != first:
            raise Stop('Remote main changed while fetching; retry explicitly.', 2)
        return first

    def remote_files(self, tip, selected=None):
        out = {}
        rows = self.git('ls-tree', '-r', '-z', tip).split(b'\0')
        for row in filter(None, rows):
            meta, rawname = row.split(b'\t', 1)
            try:
                name = rawname.decode('utf-8')
            except UnicodeError:
                continue  # Never selected or materialized.
            mode, kind, oid = meta.split()
            related = (any(name == n or n.startswith(name + '/') for n in selected) if selected is not None
                       else any(name == root or root.startswith(name + '/') or name.startswith(root + '/') for root in ROOTS))
            if related and (mode not in (b'100644', b'100755') or kind != b'blob'):
                raise Stop('Nonregular entry in/above remote review roots.')
            if not eligible(name):
                continue
            if selected is not None and name not in selected:
                continue
            validate_path(name)
            if mode != b'100644':
                raise Stop(f'Unexpected executable review mode: {name}')
            if len(out) >= MAX_FILES:
                raise Stop('Too many remote review files.')
            size = int(self.git('cat-file', '-s', oid.decode()))
            if size > MAX_BYTES:
                raise Stop(f'Oversized remote review file: {name}')
            data = self.git('cat-file', 'blob', oid.decode())
            validate_content(name, data)
            out[name] = data
        return out

    def check_hook(self):
        # --git-path honors the effective core.hooksPath (without changing it).
        hook = Path(self.git('rev-parse', '--git-path', 'hooks/pre-push').decode().strip())
        if not hook.is_absolute():
            hook = self.root / hook
        if hook.is_symlink():
            raise Stop('Unfamiliar pre-push hook; cannot skip safely.')
        if hook.exists():
            if not hook.is_file() or digest(hook.read_bytes()) != KNOWN_PATCH_HOOK:
                raise Stop('Pre-push hook differs from the reviewed patch-note-only hook; bypass refused.')

    def write_local(self, name, data, expected):
        if self.read_local(name) != expected:
            raise Stop(f'Local record changed during receive: {name}', 2)
        with self.parent_fd(name, create=True) as (fd, leaf):
            temp = '.review-sync-' + os.urandom(12).hex()
            filefd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
            try:
                with os.fdopen(filefd, 'wb') as stream:
                    stream.write(data)
                    stream.flush()
                    os.fsync(stream.fileno())
                if self.read_local(name) != expected:
                    raise Stop(f'Local record changed before replacement: {name}', 2)
                os.replace(temp, leaf, src_dir_fd=fd, dst_dir_fd=fd)
            finally:
                try:
                    os.unlink(temp, dir_fd=fd)
                except FileNotFoundError:
                    pass

    def publish(self, tip, changes, local):
        self.check_hook()
        with tempfile.TemporaryDirectory(prefix='review-sync-index-') as tmp:
            extra = {'GIT_INDEX_FILE': str(Path(tmp) / 'index')}
            self.git('read-tree', tip, extra=extra)
            records = b''
            for name, content in sorted(changes.items()):
                oid = self.git('hash-object', '-w', '--stdin', data=content).strip()
                records += b'100644 ' + oid + b'\t' + name.encode() + b'\0'
            self.git('update-index', '-z', '--index-info', data=records, extra=extra)
            tree = self.git('write-tree', extra=extra).decode().strip()
            diff = self.git('diff-tree', '--no-commit-id', '--no-renames', '--name-status', '-r', '-z', tip, tree).split(b'\0')
            pairs = [(diff[i].decode(), diff[i + 1].decode()) for i in range(0, len(diff) - 1, 2)]
            if {name for _, name in pairs} != set(changes) or any(s not in ('A', 'M') or not eligible(n) for s, n in pairs):
                raise Stop('Proposed tree has an unexpected diff; push refused.')
            message = ('영상 검수 기록 공유\n\n'
                       '다른 컴퓨터에서 확정된 검수 위치와 메모를 이어 볼 수 있도록 비민감 기록만 공유합니다.\n\n'
                       'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n')
            commit = self.git('commit-tree', tree, '-p', tip, '--no-gpg-sign',
                              data=message.encode()).decode().strip()
            if self.git('rev-list', '--parents', '-n', '1', commit).decode().split() != [commit, tip]:
                raise Stop('Unexpected commit parent; push refused.')
            for name, data in local.items():
                if self.read_local(name) != data:
                    raise Stop(f'Local reviewed snapshot changed: {name}', 2)
            remote = self.git('ls-remote', '--exit-code', 'origin', 'refs/heads/main', network=True).split()[0].decode()
            if remote != tip:
                raise Stop('Remote main changed before push; no overwrite.', 2)
            # Scope is validated above; this one invocation skips the known DB
            # patch-note hook. No global config, force, or branch changes.
            try:
                self.git('-c', 'push.followTags=false', 'push', '--no-verify', '--no-follow-tags',
                         '--recurse-submodules=no', 'origin', commit + ':refs/heads/main', network=True)
            except Stop:
                try:
                    latest = self.fresh_remote()
                except Stop:
                    raise Stop('Push rejected or outcome unknown; base unchanged. Inspect remote before retry.', 4) from None
                try:
                    self.git('merge-base', '--is-ancestor', commit, latest)
                except Stop:
                    if latest != tip:
                        raise Stop('Concurrent remote update rejected the sync push; base unchanged.', 2) from None
                    raise Stop('Push outcome unknown; base unchanged. Inspect remote before retry.', 4) from None
            return commit


@contextlib.contextmanager
def registry(repo):
    directory = repo.state_dir
    if directory.is_symlink():
        raise Stop('Unsafe sync state directory.')
    directory.mkdir(mode=0o700, exist_ok=True)
    fd = os.open(directory / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop('Another review-sync process is active.', 2) from None
        path = directory / 'state.json'
        if path.is_symlink():
            raise Stop('Unsafe sync state file.')
        try:
            if path.exists() and path.stat().st_size > MAX_BYTES:
                raise ValueError()
            db = json.loads(path.read_text()) if path.exists() else {'version': 1, 'repos': {}}
            if db.get('version') != 1 or not isinstance(db.get('repos'), dict):
                raise ValueError()
            state = db['repos'].get(repo.identity, {'base': {}, 'remote_tip': None})
            if not isinstance(state.get('base'), dict) or any(not eligible(k) or not re.fullmatch('[0-9a-f]{64}', v) for k, v in state['base'].items()):
                raise ValueError()
        except (ValueError, TypeError, AttributeError):
            raise Stop('Malformed or unsupported synchronization registry; no reset.') from None
        yield db, state
    finally:
        os.close(fd)


def save_registry(repo, db, state):
    db['repos'][repo.identity] = state
    fd, name = tempfile.mkstemp(prefix='state-', dir=repo.state_dir)
    try:
        with os.fdopen(fd, 'w') as f:
            json.dump(db, f, ensure_ascii=False, indent=2)
            f.write('\n')
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, repo.state_dir / 'state.json')
    finally:
        if os.path.exists(name):
            os.unlink(name)


def run(args):
    repo = Repo(args.repo)
    requested = set(map(validate_path, args.paths)) if args.paths else None
    with registry(repo) as (db, previous):
        base = dict(previous['base'])
        names = requested if requested is not None else repo.scan_local()
        if args.command == 'status':
            local = {n: repo.read_local(n) for n in names | set(base) if requested is None or n in requested}
            return {'status': 'local-cached-only', 'cached_remote_tip': previous.get('remote_tip'),
                    'files': {n: 'matches-base' if digest(v) == base.get(n) else 'local-change-or-unbased' for n, v in sorted(local.items())}}
        if args.command == 'publish' and not args.dry_run and not args.reviewed_public_safe:
            raise Stop('publish requires --reviewed-public-safe after reviewing the exact public-safe records.')
        tip = repo.fresh_remote()
        remote = repo.remote_files(tip, requested)
        names = requested if requested is not None else names | set(remote) | set(base)
        local = {n: repo.read_local(n) for n in sorted(names)}
        changes, synced, states, conflicts = {}, {}, {}, []
        for n in sorted(names):
            l, r, b = local[n], remote.get(n), base.get(n)
            lh, rh = digest(l), digest(r)
            if l == r:
                states[n] = 'identical' if l is not None else 'absent'
                if l is not None:
                    synced[n] = lh
            elif b is not None and (l is None or r is None):
                conflicts.append(n)
                states[n] = 'deletion-held-no-propagation'
            elif l is None:
                states[n] = 'remote-new'
                if args.command == 'receive':
                    changes[n] = r
            elif r is None:
                states[n] = 'local-new'
                if args.command == 'publish':
                    changes[n] = l
            elif b is None or (lh != b and rh != b):
                conflicts.append(n)
                states[n] = 'both-changed-or-unbased'
            elif lh == b:
                states[n] = 'remote-change'
                if args.command == 'publish':
                    conflicts.append(n)
                elif args.command == 'receive':
                    changes[n] = r
            else:
                states[n] = 'local-pending'
                if args.command == 'publish':
                    changes[n] = l
        if conflicts:
            raise Stop('Review conflict; preserve both and resolve explicitly: ' + ', '.join(conflicts), 2)
        result = {'status': 'planned', 'command': args.command, 'remote_tip': tip,
                  'files': states, 'would_write': sorted(changes), 'dry_run': args.dry_run}
        if args.command == 'check' or args.dry_run:
            return result
        # Recheck the whole snapshot before any receive write/publication.
        for n, content in local.items():
            if repo.read_local(n) != content:
                raise Stop('Local files changed after planning; nothing overwritten.', 2)
        if args.command == 'publish' and changes:
            result['published_commit'] = repo.publish(tip, changes, local)
        if args.command == 'receive':
            written = []
            try:
                for n, content in changes.items():
                    repo.write_local(n, content, local[n])
                    written.append(n)
            except (Stop, OSError):
                # Roll back only unchanged bytes written by us. A noncooperating
                # editor's newer bytes must never be replaced by this rollback.
                for n in reversed(written):
                    if local[n] is not None and repo.read_local(n) == changes[n]:
                        repo.write_local(n, local[n], changes[n])
                raise Stop('Receive interrupted; base unchanged. Inspect local files for partial new files.', 2) from None
        synced.update({n: digest(v) for n, v in changes.items()})
        base.update(synced)
        save_registry(repo, db, {'base': base, 'remote_tip': result.get('published_commit', tip)})
        result['status'] = 'published' if 'published_commit' in result else 'received' if changes else 'unchanged'
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__, epilog='각 파일 2MiB·합계 2000개 한도, Git 명령 45초 제한. --paths로 자기 파트의 파일만 선택하는 것을 권장합니다(생략하면 두 파트 모두 내용 확인 필요). 예: publish --reviewed-public-safe --paths docs/reviews/handoff/exercise/yunho/checkpoint.json docs/reviews/handoff/exercise/yunho/video-records.json docs/reviews/handoff/exercise/yunho/RESUME.txt. 비밀 탐지는 완전하지 않으며 호출자가 공개 안전성을 확인해야 합니다. 협조 잠금은 편집기를 잠그지 않으며 receive는 파일별 원자 교체입니다. 종료: 2 충돌, 3 안전/형식 거부, 4 통신/결과 미확인, 5 Git/IO 오류. 일반 push 훅과 영상 검수 진행은 바꾸지 않습니다.')
    parser.add_argument('command', choices=['status', 'check', 'publish', 'receive'])
    parser.add_argument('--repo', default='.', help='Existing checkout (temporary fixtures are supported)')
    parser.add_argument('--paths', nargs='+', help='Explicit eligible repository-relative files; default: both yunho roots')
    parser.add_argument('--dry-run', action='store_true', help='Fetch/plan only; no file/base writes or push')
    parser.add_argument('--reviewed-public-safe', action='store_true', help='Caller reviewed these exact records as safe for the PUBLIC repository; required for actual publish')
    args = parser.parse_args()
    try:
        print(json.dumps(run(args), ensure_ascii=False, indent=2))
        return 0
    except Stop as e:
        print(json.dumps({'error': str(e), 'exit': e.code}, ensure_ascii=False), file=sys.stderr)
        return e.code
    except (OSError, ValueError, KeyError):
        print('Review sync failed safely (IO/state error; details redacted).', file=sys.stderr)
        return 5


if __name__ == '__main__':
    sys.exit(main())
