#!/usr/bin/env python3
"""비민감 영상 검수 기록만 공유한다. 현재 HEAD/인덱스/가지와 다른 파일은 보존한다.

origin 접촉: status는 하지 않는다(로컬과 마지막 동기화 기록만). check와
publish/receive(--dry-run 포함)는 origin/main을 ls-remote·fetch한다(객체만 받고
가지·인덱스·기록 파일·동기화 기준은 쓰지 않는다). 실제 push는 publish만 한다.
삭제는 어느 쪽으로도 전파하지 않는다. Python 3.9+, POSIX(macOS/Linux), Git
필요. DB나 앱 실행 없이 사용한다.
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
import unicodedata
from urllib.parse import parse_qsl, urlsplit

ROOTS = tuple(f'docs/reviews/handoff/{s}/yunho' for s in ('exercise', 'mechanics'))
ROOTS_B = tuple(r.encode() for r in ROOTS)
RESUME_PATHS = frozenset(r + '/RESUME.txt' for r in ROOTS)
MAX_BYTES = 2 * 1024 * 1024
MAX_FILES = 2000
MAX_LISTED = 50
TIMEOUT = 45
KNOWN_PATCH_HOOK = 'da40e5e6d594ac6427b4425c703e08171dfa8160b496e9aeb2e16d876d080f0d'
OID = re.compile(r'^(?:[0-9a-f]{40}|[0-9a-f]{64})$')
SHA256 = re.compile(r'^[0-9a-f]{64}$')
# Base marker: both sides were seen absent, so a later deliberate re-creation is new.
ABSENT = 'absent'

EXIT_CONFLICT, EXIT_UNSAFE, EXIT_OFFLINE, EXIT_FAILURE, EXIT_LOCKED, EXIT_USAGE = 2, 3, 4, 5, 6, 64

# Only variables that relocate the repository or inject configuration are dropped.
# Caller safety settings (GIT_ALLOW_PROTOCOL, GIT_CONFIG_GLOBAL/NOSYSTEM, GIT_SSH*,
# GIT_ASKPASS, identity) are kept.
STRIP_ENV = frozenset((
    'GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY',
    'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE',
    'GIT_CEILING_DIRECTORIES', 'GIT_DISCOVERY_ACROSS_FILESYSTEM', 'GIT_PREFIX',
    'GIT_CONFIG', 'GIT_CONFIG_PARAMETERS', 'GIT_CONFIG_COUNT', 'GIT_QUARANTINE_PATH',
    'GIT_REPLACE_REF_BASE', 'GIT_NO_REPLACE_OBJECTS', 'GIT_SHALLOW_FILE',
    'GIT_GRAFT_FILE', 'GIT_EXEC_PATH', 'GIT_TEMPLATE_DIR', 'GIT_EDITOR',
))
# Commands that touch the temporary index must never write split/shared index
# files into the user's repository (core.splitIndex cleanup can delete the normal
# index's shared file).
TEMP_INDEX_CONFIG = ('-c', 'core.splitIndex=false', '-c', 'core.untrackedCache=false',
                     '-c', 'core.fsmonitor=false')


def _umask():
    mask = os.umask(0)
    os.umask(mask)
    return mask


UMASK = _umask()


class Stop(Exception):
    def __init__(self, message, code=EXIT_UNSAFE, **extra):
        super().__init__(message)
        self.code = code
        self.extra = extra


def digest(data):
    return hashlib.sha256(data).hexdigest() if data is not None else None


def name_key(name):
    """Collision key for case-insensitive / normalization-insensitive filesystems."""
    return unicodedata.normalize('NFC', name).casefold()


# --- secret heuristics -----------------------------------------------------------
# Heuristic only: a match blocks publication without echoing the content. A miss
# proves nothing; the caller's --reviewed-public-safe review is the real control.
# Every pattern starts at a token boundary so scanning stays linear.
SECRET_PATTERNS = tuple(re.compile(p) for p in (
    r'-----BEGIN [A-Z0-9 ]{0,40}PRIVATE KEY(?: BLOCK)?-----',
    r'(?<![A-Z0-9])(?:AKIA|ASIA)[0-9A-Z]{16}(?![0-9A-Z])',
    r'(?<![A-Za-z0-9_-])AIza[0-9A-Za-z_-]{35}',
    r'(?<![A-Za-z0-9])xox[abposr]-[A-Za-z0-9-]{10,}',
    r'(?<![A-Za-z0-9])[sr]k_(?:live|test)_[A-Za-z0-9]{16,}',
    r'(?<![A-Za-z0-9])sb_secret_[A-Za-z0-9_-]{16,}',
    r'(?<![A-Za-z0-9])(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})',
    r'(?<![A-Za-z0-9])gl(?:pat|ptt)-[A-Za-z0-9_-]{16,}',
    r'(?<![A-Za-z0-9])sk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}',
    r'(?<![A-Za-z0-9_-])eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}',
    r'(?<![A-Za-z0-9])Bearer\s{1,5}(?=[A-Za-z0-9_.~+/-]{0,200}[0-9])[A-Za-z0-9_.~+/-]{20,}',
    r'(?i)hooks\.slack\.com/services/[A-Za-z0-9/]{10,}',
    r'(?i)discord(?:app)?\.com/api/webhooks/[0-9]+/[A-Za-z0-9_-]{20,}',
    r'(?i)/storage/v1/object/sign/',
    r'''(?i)(?<![a-z0-9])(?:api[_-]?key|access[_-]?key(?:[_-]?id)?|secret(?:[_-]?access)?[_-]?key|'''
    r'''service[_-]?role[_-]?key|client[_-]?secret|password|passwd|secret|(?:access|refresh|auth|id)?[_-]?token|'''
    r'''private[_-]?key)["']?\s{0,5}[:=]\s{0,5}["']?(?=[A-Za-z0-9_./+=-]{0,200}[0-9])[A-Za-z0-9_./+=-]{16,}''',
))
URL_RE = re.compile(r'(?i)(?<![a-z0-9+.-])[a-z][a-z0-9+.-]{1,20}://[^\s<>"\'\\`]+')
SENSITIVE_PARAM = re.compile(
    r'(?i)^(?:.*token.*|.*signature.*|.*credential.*|.*secret.*|.*password.*|.*api.?key.*|'
    r'sig|key|policy|key-pair-id|auth|x-amz-.*|x-goog-.*)$')
PROTECTED_TOKENS = frozenset((
    'env', 'dotenv', 'secret', 'secrets', 'credential', 'credentials', 'password', 'passwords',
    'passwd', 'token', 'tokens', 'key', 'keys', 'pem', 'p12', 'pfx', 'jks', 'keystore',
    'keychain', 'rsa', 'dsa', 'ecdsa', 'ed25519', 'apikey', 'privatekey', 'serviceaccount',
))
PROTECTED_JOINED = ('apikey', 'privatekey', 'serviceaccount', 'idrsa', 'ided25519', 'idecdsa')


def looks_secret(text):
    return any(p.search(text) for p in SECRET_PATTERNS)


def unsafe_url(text):
    for raw in URL_RE.findall(text):
        try:
            url = urlsplit(raw)
            url.port  # may raise ValueError on garbage
        except ValueError:
            continue  # not a real URL (e.g. 'https://[링크 미정]'); nothing to leak
        if url.username or url.password:
            return True
        params = parse_qsl(url.query, keep_blank_values=True) + parse_qsl(url.fragment, keep_blank_values=True)
        if any(SENSITIVE_PARAM.match(k) for k, _ in params):
            return True
    return False


def _json_strings(value):
    stack, out = [value], []
    while stack:
        v = stack.pop()
        if isinstance(v, str):
            out.append(v)
        elif isinstance(v, dict):
            for k, x in v.items():
                out.append(k)
                stack.append(x)
        elif isinstance(v, list):
            stack.extend(v)
    return out


def protected_component(part):
    low = part.lower()
    tokens = set(t for t in re.split(r'[._\-\s]+', low) if t)
    joined = re.sub(r'[^a-z0-9]', '', low)
    return bool(tokens & PROTECTED_TOKENS) or any(j in joined for j in PROTECTED_JOINED)


def shaped(name):
    """Looks like a review record path (before safety validation)."""
    return any(name.startswith(root + '/') and
               (name.endswith(('.json', '.md')) or name == root + '/RESUME.txt')
               for root in ROOTS)


def eligible(name):
    try:
        validate_path(name)
        return True
    except Stop:
        return False


def validate_path(name):
    p = PurePosixPath(name)
    bad = (
        not isinstance(name, str) or not name or p.is_absolute() or p.as_posix() != name
        or not shaped(name)
        or unicodedata.normalize('NFC', name) != name
        or any(ord(c) < 32 or ord(c) == 0x7f or c == '\\' or
               unicodedata.category(c) in ('Cc', 'Cf', 'Zl', 'Zp', 'Cs', 'Co', 'Cn') for c in name)
        or any(x in ('', '.', '..') or x.startswith('.') or x.startswith('~') or protected_component(x)
               for x in p.parts[len(PurePosixPath(ROOTS[0]).parts):])
        or looks_secret(name)
    )
    if bad:
        raise Stop('Unsafe or unsupported review path (name redacted, no content read).')
    return name


def validate_content(name, data):
    if len(data) > MAX_BYTES or b'\0' in data:
        raise Stop(f'Invalid/oversized review file: {name}')
    try:
        text = data.decode('utf-8')
        corpus = [text, text.replace('\\/', '/')]
        if name.endswith('.json'):
            value = json.loads(text)
            if not isinstance(value, (dict, list)):
                raise ValueError()
            corpus.extend(_json_strings(value))
    except (UnicodeError, ValueError, RecursionError, MemoryError):
        raise Stop(f'Invalid UTF-8/JSON review file: {name}') from None
    for chunk in corpus:
        if looks_secret(chunk):
            raise Stop(f'Potential sensitive content: {name} (value redacted).')
        if unsafe_url(chunk):
            raise Stop(f'Potential private/signed URL: {name} (URL redacted).')


def check_collisions(names):
    seen = {}
    for n in names:
        seen.setdefault(name_key(n), set()).add(n)
    clashes = sorted(sorted(v) for v in seen.values() if len(v) > 1)
    if clashes:
        listed = ', '.join(' / '.join(group) for group in clashes[:10])
        raise Stop('Case- or Unicode-alias review paths cannot coexist on macOS; '
                   'rename one explicitly: ' + listed)


class Repo:
    def __init__(self, location):
        self.cwd = Path(location).resolve()
        self.env = {k: v for k, v in os.environ.items()
                    if k not in STRIP_ENV and not k.startswith(('GIT_CONFIG_KEY_', 'GIT_CONFIG_VALUE_'))}
        self.env.update(GIT_OPTIONAL_LOCKS='0', GIT_TERMINAL_PROMPT='0', GIT_LITERAL_PATHSPECS='1')
        self.root = Path(self.git('rev-parse', '--show-toplevel').decode().strip()).resolve()
        self.cwd = self.root
        common = self.git('rev-parse', '--path-format=absolute', '--git-common-dir').decode().strip()
        self.state_dir = Path(common) / 'video-review-sync-v1'
        remote = self.git('remote', 'get-url', '--all', 'origin')
        push_remote = self.git('remote', 'get-url', '--push', '--all', 'origin')
        if len(remote.splitlines()) != 1 or remote != push_remote:
            raise Stop('Origin fetch/push destinations must be the same single destination.')
        self.identity = digest(str(self.root).encode() + b'\0' + remote)

    def run_git(self, *args, data=None, extra=None, network=False):
        env = dict(self.env)
        env.update(extra or {})
        try:
            return subprocess.run(['git', '--no-pager', *args], cwd=self.cwd, env=env,
                                  input=data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  timeout=TIMEOUT)
        except subprocess.TimeoutExpired:
            raise Stop('Git timed out; no automatic retry.', EXIT_OFFLINE if network else EXIT_FAILURE) from None

    def git(self, *args, data=None, extra=None, network=False):
        r = self.run_git(*args, data=data, extra=extra, network=network)
        if r.returncode:
            # Remote errors may contain credentials/URLs or review content. Keep
            # the original code, never echo arbitrary Git output into public logs.
            sub = next((a for a in args if not a.startswith('-') and '=' not in a), args[0])
            raise Stop(f'Git {sub} failed (original exit {r.returncode}; output redacted).',
                       EXIT_OFFLINE if network else EXIT_FAILURE, git_exit=r.returncode)
        return r.stdout

    # --- local filesystem (no symlink following, exact on-disk spelling) ---------
    def _open_dir(self, fd, part, create):
        flags = os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW
        try:
            nxt = os.open(part, flags, dir_fd=fd)
        except FileNotFoundError:
            if not create:
                raise
            self._no_alias(fd, part)
            os.mkdir(part, mode=0o755, dir_fd=fd)
            nxt = os.open(part, flags, dir_fd=fd)
        if part not in os.listdir(fd):
            os.close(nxt)
            raise Stop('On-disk path spelling differs (case/Unicode alias); refused.')
        return nxt

    @staticmethod
    def _no_alias(fd, leaf):
        key = name_key(leaf)
        if any(e != leaf and name_key(e) == key for e in os.listdir(fd)):
            raise Stop('On-disk path spelling differs (case/Unicode alias); refused.')

    @contextlib.contextmanager
    def parent_fd(self, name, create=False):
        validate_path(name)
        fd = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)
        try:
            for part in PurePosixPath(name).parts[:-1]:
                nxt = self._open_dir(fd, part, create)
                os.close(fd)
                fd = nxt
            yield fd, PurePosixPath(name).name
        finally:
            os.close(fd)

    def _read_at(self, fd, leaf, name):
        """Returns (bytes, mode) or (None, None). Exact spelling, regular file only."""
        try:
            filefd = os.open(leaf, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK, dir_fd=fd)
        except FileNotFoundError:
            self._no_alias(fd, leaf)
            return None, None
        except OSError:
            raise Stop(f'Unsafe review path (symlink or unreadable): {name}') from None
        with os.fdopen(filefd, 'rb') as stream:
            st = os.fstat(stream.fileno())
            if not stat.S_ISREG(st.st_mode) or st.st_size > MAX_BYTES:
                raise Stop(f'Nonregular/oversized review file: {name}')
            if leaf not in os.listdir(fd):
                raise Stop('On-disk path spelling differs (case/Unicode alias); refused.')
            data = stream.read(MAX_BYTES + 1)
        validate_content(name, data)
        return data, stat.S_IMODE(st.st_mode)

    def read_local(self, name):
        try:
            with self.parent_fd(name) as (fd, leaf):
                return self._read_at(fd, leaf, name)[0]
        except FileNotFoundError:
            return None
        except OSError:
            raise Stop(f'Unsafe or unreadable review path: {name}') from None

    def scan_local(self):
        """Eligible local records plus a list of excluded entries (never read)."""
        names, excluded = set(), []

        def exclude(rel):
            excluded.append(rel if not looks_secret(rel) else '<redacted name>')

        for base in ROOTS:
            try:
                with self.parent_fd(base + '/RESUME.txt') as (fd, _):
                    pass  # validates every component of the root itself
            except FileNotFoundError:
                continue
            except OSError:
                raise Stop('Unsafe review root (symlink or nondirectory component).') from None
            for current, dirs, files in os.walk(self.root / base, followlinks=False):
                rel_dir = Path(current).relative_to(self.root).as_posix()
                keep = []
                for d in dirs:
                    rel = rel_dir + '/' + d
                    if os.path.islink(os.path.join(current, d)):
                        raise Stop('Symlinked directory in review roots; synchronization refused.')
                    if d.startswith(('.', '~')) or protected_component(d):
                        exclude(rel)
                    else:
                        keep.append(d)
                dirs[:] = keep
                for f in files:
                    rel = rel_dir + '/' + f
                    st = os.lstat(os.path.join(current, f))
                    if not shaped(rel) or f.startswith(('.', '~')):
                        exclude(rel)
                        continue
                    if not eligible(rel):
                        exclude(rel)
                        continue
                    if stat.S_ISLNK(st.st_mode) or not stat.S_ISREG(st.st_mode):
                        raise Stop('Symlink or nonregular review record; synchronization refused.')
                    names.add(rel)
        if len(names) > MAX_FILES:
            raise Stop('Too many review files.')
        return names, sorted(excluded)

    # --- remote ------------------------------------------------------------------
    def fresh_remote(self):
        def tip():
            fields = self.git('ls-remote', '--exit-code', 'origin', 'refs/heads/main', network=True).split()
            if len(fields) != 2 or not OID.fullmatch(fields[0].decode()):
                raise Stop('Remote main is absent or ambiguous.', EXIT_OFFLINE)
            return fields[0].decode()
        first = tip()
        self.git('-c', 'gc.auto=0', '-c', 'maintenance.auto=false', 'fetch', '--no-tags',
                 '--no-write-fetch-head', '--no-recurse-submodules', 'origin', first, network=True)
        if tip() != first:
            raise Stop('Remote main changed while fetching; retry explicitly.', EXIT_CONFLICT)
        return first

    def remote_files(self, tip, selected=None):
        """Validated remote records (selected or all) and every remote record-shaped name."""
        out, names, excluded = {}, set(), []
        sel_b = None if selected is None else tuple(n.encode() for n in selected)
        rows = self.git('ls-tree', '-r', '-z', '--full-tree', tip).split(b'\0')
        for row in filter(None, rows):
            meta, rawname = row.split(b'\t', 1)
            mode, kind, oid = meta.split()
            # A non-directory entry at a root or at one of its ancestors (ls-tree -r
            # lists only blobs/gitlinks) means the review tree itself is malformed.
            if any(rawname == rb or rb.startswith(rawname + b'/') for rb in ROOTS_B):
                raise Stop('Nonregular or misplaced entry at/above remote review roots.')
            if not any(rawname.startswith(rb + b'/') for rb in ROOTS_B):
                continue
            # With --paths only entries that are a selected file or sit at one of its
            # ancestors matter; other subjects are not read or materialized.
            relevant = sel_b is None or any(rawname == s or s.startswith(rawname + b'/') for s in sel_b)
            if sel_b is not None and any(s.startswith(rawname + b'/') for s in sel_b):
                raise Stop('Nonregular or misplaced entry above a selected review path.')
            if mode not in (b'100644', b'100755') or kind != b'blob':
                if relevant:
                    raise Stop('Nonregular entry in remote review roots (symlink/gitlink).')
                continue
            try:
                name = rawname.decode('utf-8')
            except UnicodeError:
                raise Stop('Non-UTF-8 entry name in remote review roots.') from None
            if not shaped(name) or not eligible(name):
                excluded.append(name if not looks_secret(name) else '<redacted name>')
                continue
            names.add(name)
            if selected is not None and name not in selected:
                continue
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
        return out, names, sorted(excluded)

    def existed_on_remote(self, tip, name):
        return bool(self.git('rev-list', '-1', tip, '--', name).strip())

    # --- publish -----------------------------------------------------------------
    def check_hook(self):
        # Config-defined hooks (hook.<name>.event) are also skipped by --no-verify.
        r = self.run_git('config', '--get-regexp', '-z', r'^hook\..*\.event$')
        if r.returncode not in (0, 1):
            raise Stop('Could not inspect hook configuration; bypass refused.')
        for entry in filter(None, r.stdout.split(b'\0')):
            if entry.split(b'\n', 1)[-1].strip().lower() == b'pre-push':
                raise Stop('A configured pre-push hook exists; bypass refused (not the known patch-note hook).')
        r = self.run_git('hook', 'list', '-z', 'pre-push', extra={'LC_ALL': 'C', 'LANG': 'C'})
        if r.returncode == 0:
            if any(e != b'hook from hookdir' for e in filter(None, r.stdout.split(b'\0'))):
                raise Stop('An unfamiliar pre-push hook is registered; bypass refused.')
        elif b'no hooks found' not in r.stderr:
            pass  # Older Git without `hook list`: config hooks are covered above.
        # --git-path honors the effective core.hooksPath (without changing it).
        hook = Path(self.git('rev-parse', '--git-path', 'hooks/pre-push').decode().strip())
        if not hook.is_absolute():
            hook = self.root / hook
        if hook.is_symlink():
            raise Stop('Unfamiliar pre-push hook; cannot skip safely.')
        if hook.exists():
            if not hook.is_file() or digest(hook.read_bytes()) != KNOWN_PATCH_HOOK:
                raise Stop('Pre-push hook differs from the reviewed patch-note-only hook; bypass refused.')

    def check_identity(self):
        for var in ('GIT_AUTHOR_IDENT', 'GIT_COMMITTER_IDENT'):
            r = self.run_git('-c', 'user.useConfigOnly=true', 'var', var)
            if r.returncode:
                raise Stop('Git user.name/user.email are not configured for this checkout; publication '
                           'refused so no automatic account/host identity becomes public.')

    def validate_tree(self, tip, tree, expected):
        raw = self.git('diff-tree', '-r', '-t', '--raw', '--no-renames', '-z', tip, tree).split(b'\0')
        dirs = set()
        for name in expected:
            parts = PurePosixPath(name).parts
            dirs.update('/'.join(parts[:i]) for i in range(1, len(parts)))
        seen, i = set(), 0
        while i < len(raw) - 1:
            meta, path = raw[i], raw[i + 1].decode('utf-8', 'surrogateescape')
            i += 2
            if not meta.startswith(b':'):
                raise Stop('Unparseable proposed tree diff; push refused.')
            old_mode, new_mode, _old, new_oid, status = meta[1:].decode().split()
            if path in expected:
                ok = (status in ('A', 'M') and new_mode == '100644' and new_oid == expected[path]
                      and (status == 'A' or old_mode == '100644'))
                seen.add(path)
            elif path in dirs:
                ok = status in ('A', 'M') and new_mode == '040000' and (status == 'A' or old_mode == '040000')
            else:
                ok = False
            if not ok:
                raise Stop('Proposed tree has an unexpected diff (only selected records may change); push refused.')
        if seen != set(expected):
            raise Stop('Proposed tree does not contain exactly the selected records; push refused.')

    def publish(self, tip, changes, local):
        self.check_hook()
        self.check_identity()
        expected = {}
        with tempfile.TemporaryDirectory(prefix='review-sync-index-') as tmp:
            extra = {'GIT_INDEX_FILE': str(Path(tmp) / 'index')}
            self.git(*TEMP_INDEX_CONFIG, 'read-tree', tip, extra=extra)
            records = b''
            for name, content in sorted(changes.items()):
                oid = self.git('hash-object', '-w', '--stdin', data=content).strip()
                expected[name] = oid.decode()
                records += b'100644 ' + oid + b'\t' + name.encode() + b'\0'
            self.git(*TEMP_INDEX_CONFIG, 'update-index', '-z', '--index-info', data=records, extra=extra)
            tree = self.git(*TEMP_INDEX_CONFIG, 'write-tree', extra=extra).decode().strip()
        self.validate_tree(tip, tree, expected)
        message = ('영상 검수 기록 공유\n\n'
                   '다른 컴퓨터에서 확정된 검수 위치와 메모를 이어 볼 수 있도록 비민감 기록만 공유합니다.\n\n'
                   'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>\n')
        commit = self.git('-c', 'user.useConfigOnly=true', 'commit-tree', tree, '-p', tip, '--no-gpg-sign',
                          data=message.encode()).decode().strip()
        if self.git('rev-list', '--parents', '-n', '1', commit).decode().split() != [commit, tip]:
            raise Stop('Unexpected commit parent; push refused.')
        for name, data in local.items():
            if self.read_local(name) != data:
                raise Stop(f'Local reviewed snapshot changed: {name}', EXIT_CONFLICT)
        remote = self.git('ls-remote', '--exit-code', 'origin', 'refs/heads/main', network=True).split()[0].decode()
        if remote != tip:
            raise Stop('Remote main changed before push; no overwrite.', EXIT_CONFLICT)
        # Scope is validated above; this one invocation skips the known DB
        # patch-note hook. No global config, force, '+' refspec, or branch changes.
        try:
            self.git('-c', 'push.followTags=false', 'push', '--no-verify', '--no-follow-tags',
                     '--recurse-submodules=no', 'origin', commit + ':refs/heads/main', network=True)
            return commit, False
        except Stop:
            try:
                latest = self.fresh_remote()
            except Stop:
                raise Stop('Push rejected or outcome unknown; base unchanged. Inspect remote before retry.',
                           EXIT_OFFLINE, proposed_commit=commit) from None
            if self.run_git('merge-base', '--is-ancestor', commit, latest).returncode == 0:
                return commit, True  # accepted; the response was lost
            if latest != tip:
                raise Stop('Concurrent remote update rejected the sync push; base unchanged.',
                           EXIT_CONFLICT) from None
            raise Stop('Push outcome unknown; base unchanged. Inspect remote before retry.',
                       EXIT_OFFLINE, proposed_commit=commit) from None

    # --- receive -----------------------------------------------------------------
    def write_local(self, name, data, expected):
        """Atomically create/replace one record if it still holds `expected` bytes."""
        with self.parent_fd(name, create=True) as (fd, leaf):
            current, mode = self._read_at(fd, leaf, name)
            if current != expected:
                raise Stop(f'Local record changed during receive: {name}', EXIT_CONFLICT)
            mode = mode if mode is not None else (0o666 & ~UMASK)
            temp = '.review-sync-' + os.urandom(12).hex()
            filefd = os.open(temp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=fd)
            try:
                with os.fdopen(filefd, 'wb') as stream:
                    stream.write(data)
                    stream.flush()
                    os.fchmod(stream.fileno(), mode & 0o777)
                    os.fsync(stream.fileno())
                if self._read_at(fd, leaf, name)[0] != expected:
                    raise Stop(f'Local record changed before replacement: {name}', EXIT_CONFLICT)
                if expected is None:
                    try:
                        os.link(temp, leaf, src_dir_fd=fd, dst_dir_fd=fd)  # create-only, never clobbers
                    except FileExistsError:
                        raise Stop(f'Local record appeared during receive: {name}', EXIT_CONFLICT) from None
                else:
                    os.replace(temp, leaf, src_dir_fd=fd, dst_dir_fd=fd)
                os.fsync(fd)
            finally:
                try:
                    os.unlink(temp, dir_fd=fd)
                except FileNotFoundError:
                    pass

    def remove_created(self, name, data):
        """Undo a file this run created, only if it still holds exactly our bytes."""
        with self.parent_fd(name) as (fd, leaf):
            if self._read_at(fd, leaf, name)[0] == data:
                os.unlink(leaf, dir_fd=fd)


@contextlib.contextmanager
def registry(repo):
    directory = repo.state_dir
    if directory.is_symlink():
        raise Stop('Unsafe sync state directory.')
    directory.mkdir(mode=0o700, exist_ok=True)
    try:
        fd = os.open(directory / 'lock', os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    except OSError:
        raise Stop('Unsafe sync lock file.') from None
    try:
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise Stop('Another review-sync process is active; try again after it finishes.', EXIT_LOCKED) from None
        path = directory / 'state.json'
        if path.is_symlink():
            raise Stop('Unsafe sync state file.')
        try:
            if path.exists() and path.stat().st_size > MAX_BYTES:
                raise ValueError()
            db = json.loads(path.read_bytes().decode('utf-8')) if path.exists() else {'version': 1, 'repos': {}}
            if (not isinstance(db, dict) or type(db.get('version')) is not int or db['version'] != 1
                    or not isinstance(db.get('repos'), dict) or set(db) != {'version', 'repos'}):
                raise ValueError()
            state = db['repos'].get(repo.identity, {'base': {}, 'remote_tip': None})
            if not isinstance(state, dict) or set(state) != {'base', 'remote_tip'}:
                raise ValueError()
            tip = state['remote_tip']
            if tip is not None and not (isinstance(tip, str) and OID.fullmatch(tip)):
                raise ValueError()
            if not isinstance(state['base'], dict) or any(
                    not isinstance(k, str) or not eligible(k) or not isinstance(v, str)
                    or not (v == ABSENT or SHA256.fullmatch(v))
                    for k, v in state['base'].items()):
                raise ValueError()
        except (ValueError, TypeError, AttributeError, KeyError, RecursionError):
            raise Stop('Malformed or unsupported synchronization registry; no reset.') from None
        yield db, state
    finally:
        os.close(fd)


def save_registry(repo, db, state):
    db['repos'][repo.identity] = state
    payload = (json.dumps(db, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    fd, name = tempfile.mkstemp(prefix='state-', dir=repo.state_dir)
    try:
        with os.fdopen(fd, 'wb') as f:
            f.write(payload)
            f.flush()
            os.fsync(f.fileno())
        os.replace(name, repo.state_dir / 'state.json')
    finally:
        if os.path.exists(name):
            os.unlink(name)


def classify(repo, tip, command, n, l, r, b):
    """One B/L/R row. Returns (state, action, conflict). Deletions never propagate."""
    lh, rh = digest(l), digest(r)
    acknowledged_absence = b == ABSENT
    if acknowledged_absence:
        b = None
    if l == r:
        return ('absent' if l is None else 'identical'), ('clear' if l is None else 'synced'), False
    if l is None:  # remote present
        if b is None:
            return 'remote-new', 'receive', False
        if rh == b:
            return 'local-deleted-held', None, False  # local deletion kept, not propagated
        return 'local-deleted-remote-changed', None, True
    if r is None:  # local present
        if b is None:
            if not acknowledged_absence and repo.existed_on_remote(tip, n):
                return 'remote-deleted-unbased', None, True
            return 'local-new', 'publish', False
        if lh == b:
            return 'remote-deleted-held', None, False  # remote deletion: keep local, never republish
        return 'remote-deleted-local-changed', None, True
    if b is None:
        return 'both-present-unbased-different', None, True
    if lh == b:
        return 'remote-change', 'receive', command == 'publish'  # publish: receive first
    if rh == b:
        return 'local-pending', 'publish', False
    return 'both-changed', None, True


def run(args):
    repo = Repo(args.repo)
    requested = set(map(validate_path, args.paths)) if args.paths else None
    if args.command == 'publish' and not args.dry_run and not args.reviewed_public_safe:
        raise Stop('publish requires --reviewed-public-safe after reviewing the exact public-safe records.')
    with registry(repo) as (db, previous):
        base = dict(previous['base'])
        if requested is None:
            scanned, excluded = repo.scan_local()
        else:
            scanned, excluded = set(requested), []
        if args.command == 'status':
            names = scanned | set(base) if requested is None else requested
            check_collisions(names)
            files = {}
            for n in sorted(names):
                l, b = digest(repo.read_local(n)), base.get(n)
                files[n] = ('absent-unbased' if l is None and b is None else
                            'absent-deletion-acknowledged' if l is None and b == ABSENT else
                            'local-deleted-since-base' if l is None else
                            'unbased-not-yet-synchronized' if b == ABSENT else
                            'unbased-not-yet-synchronized' if b is None else
                            'matches-base' if l == b else 'local-change-since-base')
            return {'status': 'local-only (origin not contacted)',
                    'last_synchronized_remote_tip': previous.get('remote_tip'),
                    'note': 'Remote state is not refreshed by status; use check or --dry-run to contact origin.',
                    'files': files, 'excluded': excluded[:MAX_LISTED]}
        tip = repo.fresh_remote()
        remote, remote_names, remote_excluded = repo.remote_files(tip, requested)
        if requested is None:
            names = scanned | set(remote) | set(base)
            check_collisions(names | remote_names)
        else:
            names = set(requested)
            check_collisions(names | remote_names | set(base))
        local = {n: repo.read_local(n) for n in sorted(names)}
        changes, synced, cleared, states, conflicts = {}, {}, set(), {}, []
        for n in sorted(names):
            state, action, conflict = classify(repo, tip, args.command, n, local[n], remote.get(n), base.get(n))
            states[n] = state
            if conflict:
                conflicts.append(n)
            elif action == 'synced':
                synced[n] = digest(local[n])
            elif action == 'clear' and n in base:
                cleared.add(n)  # remembered as an acknowledged absence
            elif action == args.command and action in ('publish', 'receive'):
                changes[n] = local[n] if action == 'publish' else remote[n]
        if conflicts:
            raise Stop('Review conflict; nothing written. Preserve both and resolve explicitly: '
                       + ', '.join(conflicts[:MAX_LISTED]), EXIT_CONFLICT,
                       files={n: states[n] for n in conflicts[:MAX_LISTED]})
        result = {'status': 'planned', 'command': args.command, 'remote_tip': tip,
                  'files': states, 'would_write': sorted(changes), 'dry_run': args.dry_run,
                  'excluded': sorted(set(excluded) | set(remote_excluded))[:MAX_LISTED]}
        if args.command == 'check' or args.dry_run:
            return result
        # Recheck the whole snapshot before any receive write/publication.
        for n, content in local.items():
            if repo.read_local(n) != content:
                raise Stop('Local files changed after planning; nothing overwritten.', EXIT_CONFLICT)
        if args.command == 'publish' and changes:
            commit, recovered = repo.publish(tip, changes, local)
            result['published_commit'] = commit
            if recovered:
                result['note'] = 'Push response was lost; acceptance confirmed on remote main.'
        if args.command == 'receive':
            done = []
            try:
                for n, content in changes.items():
                    repo.write_local(n, content, local[n])
                    done.append(n)
            except (Stop, OSError) as e:
                # Undo only our own unchanged bytes; never touch newer edits by others.
                for n in reversed(done):
                    try:
                        if local[n] is None:
                            repo.remove_created(n, changes[n])
                        elif repo.read_local(n) == changes[n]:
                            repo.write_local(n, local[n], changes[n])
                    except (Stop, OSError):
                        pass
                code = e.code if isinstance(e, Stop) else EXIT_FAILURE
                raise Stop('Receive interrupted and rolled back where safe; base unchanged.', code) from None
        synced.update({n: digest(v) for n, v in changes.items()})
        base.update(synced)
        for n in cleared:
            base[n] = ABSENT
        new_tip = result.get('published_commit', tip)
        try:
            save_registry(repo, db, {'base': base, 'remote_tip': new_tip})
        except OSError:
            if 'published_commit' in result:
                raise Stop('Published ' + new_tip + ' to origin/main, but the local sync base could not be '
                           'recorded. Do not republish; run check to confirm.', EXIT_FAILURE,
                           published_commit=new_tip) from None
            if changes:
                raise Stop('Received files were written, but the local sync base could not be recorded; '
                           'run check to confirm.', EXIT_FAILURE, written=sorted(changes)) from None
            raise
        result['status'] = 'published' if 'published_commit' in result else 'received' if changes else 'unchanged'
        return result


def emit(obj, stream):
    data = (json.dumps(obj, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    try:
        stream.buffer.write(data)
        stream.flush()
        return True
    except (BrokenPipeError, OSError, ValueError):
        with contextlib.suppress(OSError, ValueError):
            os.dup2(os.open(os.devnull, os.O_WRONLY), stream.fileno())
        return False


class Parser(argparse.ArgumentParser):
    def error(self, message):
        self.print_usage(sys.stderr)
        sys.stderr.write(f'{self.prog}: error: {message}\n')
        sys.exit(EXIT_USAGE)


def main():
    parser = Parser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter, epilog=(
        '각 파일 2MiB·합계 2000개 한도, Git 명령당 45초 제한(네트워크 포함, 자동 재시도 없음). '
        '--paths로 자기 파트의 파일만 선택하는 것을 권장합니다(생략하면 두 파트 모두 내용 확인 필요). '
        '예: publish --reviewed-public-safe --paths docs/reviews/handoff/exercise/yunho/checkpoint.json '
        'docs/reviews/handoff/exercise/yunho/video-records.json docs/reviews/handoff/exercise/yunho/RESUME.txt. '
        '비밀 탐지는 휴리스틱이라 완전하지 않으며 호출자가 공개 안전성을 확인해야 합니다. '
        '협조 잠금은 편집기를 잠그지 않으며 receive는 파일별 원자 교체입니다(중단 시 안전한 범위만 되돌림). '
        '삭제는 어느 쪽으로도 전파하지 않고 보류 상태로 보고합니다. '
        '종료: 0 성공, 2 충돌(원격 경쟁 포함), 3 안전/형식 거부, 4 통신 실패·결과 미확인, '
        '5 Git/IO 오류, 6 다른 동기화 실행 중, 64 사용법 오류. '
        '출력을 받지 못했으면 check로 결과를 확인하십시오. 일반 push 훅과 영상 검수 진행은 바꾸지 않습니다.'))
    parser.add_argument('command', choices=['status', 'check', 'publish', 'receive'])
    parser.add_argument('--repo', default='.', help='Existing checkout (temporary fixtures are supported)')
    parser.add_argument('--paths', nargs='+', help='Explicit eligible repository-relative files; default: both yunho roots')
    parser.add_argument('--dry-run', action='store_true', help='Contact origin and plan only; no file/base writes or push')
    parser.add_argument('--reviewed-public-safe', action='store_true',
                        help='Caller reviewed these exact records as safe for the PUBLIC repository; required for actual publish')
    args = parser.parse_args()
    try:
        result = run(args)
    except Stop as e:
        emit({'error': str(e), 'exit': e.code, **e.extra}, sys.stderr)
        return e.code
    except Exception:  # noqa: BLE001 - never print tracebacks/local paths
        emit({'error': 'Review sync failed safely (IO/state error; details redacted).', 'exit': EXIT_FAILURE},
             sys.stderr)
        return EXIT_FAILURE
    if not emit(result, sys.stdout):
        emit({'note': 'Completed but result output was lost; run check to confirm.',
              'status': result.get('status'), 'published_commit': result.get('published_commit')}, sys.stderr)
    return 0


if __name__ == '__main__':
    sys.exit(main())
