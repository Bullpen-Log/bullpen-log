#!/usr/bin/env python3
"""Local-only integration tests: temporary bare origin + synthetic clones.

Never touches the real checkout, its origin or real review records. The test
process drops every inherited GIT_* variable and uses an empty temporary HOME and
global config, with Git transport restricted to local files.
"""
import argparse
import atexit
import contextlib
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unicodedata
import unittest

# --- isolation (before anything runs git) ----------------------------------------
for _k in [k for k in os.environ if k.startswith('GIT_')]:
    del os.environ[_k]
_HOME = tempfile.mkdtemp(prefix='review-sync-home-')
atexit.register(shutil.rmtree, _HOME, True)
Path(_HOME, 'gitconfig').write_text('')
os.environ.update(HOME=_HOME, GIT_CONFIG_GLOBAL=str(Path(_HOME, 'gitconfig')), GIT_CONFIG_NOSYSTEM='1',
                  GIT_ALLOW_PROTOCOL='file', GIT_TERMINAL_PROMPT='0', LC_ALL='en_US.UTF-8')

SCRIPT = Path(__file__).with_name('video-review-sync.py').resolve()
REAL_HOOK = SCRIPT.parent.parent / '.githooks/pre-push'
spec = importlib.util.spec_from_file_location('review_sync', SCRIPT)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)
EX = 'docs/reviews/handoff/exercise/yunho'
ME = 'docs/reviews/handoff/mechanics/yunho'
RECORD = EX + '/checkpoint.json'
MECH = ME + '/checkpoint.json'
RESUME = EX + '/RESUME.txt'
MRESUME = ME + '/RESUME.txt'
NOTE = ME + '/nested/note.md'


def data(n):
    return json.dumps({'schema_version': 1, 'current': n}).encode() + b'\n'


def sub(args):
    return next((a for a in args if not a.startswith('-') and '=' not in a), args[0])


class Integration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='review-sync-fixture-')
        self.base = Path(self.tmp.name).resolve()
        self.origin = self.base / 'origin.git'
        self.a, self.b = self.base / 'a', self.base / 'b'
        self.env = dict(os.environ)
        self.g(None, 'init', '--bare', '-q', '--initial-branch=main', str(self.origin))
        self.g(None, 'clone', '-q', str(self.origin), str(self.a))
        self.ident(self.a, 'Fixture User', 'fixture@example.invalid')
        self.put(self.a, 'product.txt', b'initial product\n')
        self.commit(self.a, 'initial')
        self.g(self.a, 'push', '-q', 'origin', 'main')
        self.g(None, 'clone', '-q', str(self.origin), str(self.b))
        self.ident(self.b, 'Second Fixture', 'second@example.invalid')
        for repo in (self.a, self.b):  # every fixture lives inside the temporary directory
            gitdir = Path(self.g(repo, 'rev-parse', '--absolute-git-dir').decode().strip()).resolve()
            self.assertTrue(str(gitdir).startswith(str(self.base) + os.sep))

    def tearDown(self):
        self.tmp.cleanup()

    # --- helpers -------------------------------------------------------------------
    def ident(self, repo, name, email):
        self.g(repo, 'config', 'user.name', name)
        self.g(repo, 'config', 'user.email', email)

    def g(self, repo, *args, data=None, code=0):
        result = subprocess.run(['git', '--no-pager', *args], cwd=repo or self.base, input=data,
                                env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
        if code is not None and result.returncode != code:
            self.fail('Fixture Git command failed: ' + str(args[:2]) + ' exit=' + str(result.returncode)
                      + ' ' + result.stderr.decode(errors='replace')[-300:])
        return result.stdout

    def put(self, repo, name, content):
        p = repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)

    def commit(self, repo, message):
        self.g(repo, 'add', '-A')
        self.g(repo, 'commit', '-q', '-m', message)

    def cli(self, repo, action, *args, code=0, env=None):
        r = subprocess.run([sys.executable, str(SCRIPT), action, '--repo', str(repo), *args],
                           env=env or self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        self.assertEqual(r.returncode, code, (r.stdout + r.stderr).decode())
        self.assertNotIn(b'Traceback', r.stderr)
        return json.loads(r.stdout if r.returncode == 0 else r.stderr)

    def tool(self, repo, command, paths=None, dry=False, ack=True):
        """In-process run() for fault injection. Returns (exit code, result)."""
        ns = argparse.Namespace(command=command, repo=str(repo), paths=paths, dry_run=dry,
                                reviewed_public_safe=ack)
        try:
            return 0, sync.run(ns)
        except sync.Stop as e:
            return e.code, {'error': str(e), **e.extra}

    @contextlib.contextmanager
    def inject(self, fn):
        """Test-local fault boundary: fn(original, repo, args, kw) wraps Repo.git."""
        original = sync.Repo.git
        sync.Repo.git = lambda repo, *args, **kw: fn(original, repo, args, kw)
        try:
            yield
        finally:
            sync.Repo.git = original

    def normal_state(self, repo):
        hooks = sorted(p.name for p in (repo / '.git/hooks').iterdir())
        return (self.g(repo, 'rev-parse', 'HEAD'), self.g(repo, 'symbolic-ref', 'HEAD'),
                (repo / '.git/index').read_bytes(), (repo / 'product.txt').read_bytes(),
                (repo / '.git/config').read_bytes(), hooks,
                self.g(repo, 'for-each-ref', '--format=%(refname) %(objectname)', 'refs/heads', 'refs/tags'))

    def registry(self, repo):
        p = repo / '.git/video-review-sync-v1/state.json'
        return p.read_bytes() if p.exists() else None

    def publish(self, repo, *paths):
        return self.cli(repo, 'publish', '--reviewed-public-safe', *(('--paths',) + paths if paths else ()))

    def setup_synced(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, MECH, data(10))
        self.publish(self.a)
        self.cli(self.b, 'receive')

    def remote_tip(self):
        return self.g(self.origin, 'rev-parse', 'refs/heads/main').decode().strip()

    def remote_blob(self, path, code=0):
        return self.g(self.origin, 'show', 'refs/heads/main:' + path, code=code)

    def remote_paths(self):
        return self.g(self.origin, 'ls-tree', '-r', '--name-only', 'main').decode().splitlines()

    def fresh_c(self):
        c = self.base / ('c' + str(len(list(self.base.glob('c*')))))
        self.g(None, 'clone', '-q', str(self.origin), str(c))
        self.ident(c, 'Third Fixture', 'third@example.invalid')
        return c

    def push_index_entries(self, entries, message='plumbing fixture'):
        """Push raw index entries (mode, content bytes or gitlink oid, raw path) from a disposable clone."""
        c = self.fresh_c()
        info = b''
        for mode, payload, path in entries:
            oid = payload if mode == b'160000' else self.g(c, 'hash-object', '-w', '--stdin', data=payload).strip()
            info += mode + b' ' + oid + b'\t' + path + b'\0'
        self.g(c, 'update-index', '-z', '--index-info', data=info)
        self.g(c, 'commit', '-q', '-m', message)
        self.g(c, 'push', '-q', 'origin', 'HEAD:main')
        return c

    def advance_b(self, name='remote-code.txt', content=b'remote\n'):
        # Deliberate mutation of a disposable fixture only.
        self.g(self.b, 'fetch', '-q', 'origin')
        self.g(self.b, 'reset', '--hard', '-q', 'origin/main')
        self.put(self.b, name, content)
        self.commit(self.b, 'concurrent fixture change')
        self.g(self.b, 'push', '-q', 'origin', 'main')

    # --- round trip / preservation ---------------------------------------------------
    def test_roundtrip_stale_head_and_exact_resume(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, RESUME, b'Resume this video, do not auto-advance.\n')
        self.put(self.a, MRESUME, '메커니즘 재개 지점\n'.encode())
        self.put(self.a, NOTE, b'# Synthetic note\n')
        before_a, before_b = self.normal_state(self.a), self.normal_state(self.b)
        result = self.publish(self.a)
        self.assertEqual(self.remote_blob(RECORD), data(1))
        self.cli(self.b, 'receive')
        for path in (RECORD, RESUME, MRESUME, NOTE):
            self.assertEqual((self.b / path).read_bytes(), (self.a / path).read_bytes(), path)
        self.assertEqual(self.normal_state(self.a), before_a)
        self.assertEqual(self.normal_state(self.b), before_b)
        tip = self.remote_tip()
        self.assertEqual(self.publish(self.b)['status'], 'unchanged')
        self.assertEqual(self.remote_tip(), tip)
        self.assertEqual(result['published_commit'], tip)
        message = self.g(self.origin, 'show', '-s', '--format=%B', tip).decode()
        self.assertTrue(message.startswith('영상 검수 기록 공유'))
        self.assertIn('Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', message)
        author = self.g(self.origin, 'show', '-s', '--format=%an <%ae>', tip).decode().strip()
        self.assertEqual(author, 'Fixture User <fixture@example.invalid>')

    def test_bootstrap_identical_files_with_old_head(self):
        self.setup_synced()
        shutil.rmtree(self.b / '.git/video-review-sync-v1')
        before = self.normal_state(self.b)
        self.assertEqual(self.cli(self.b, 'receive')['status'], 'unchanged')
        self.assertIsNotNone(self.registry(self.b))
        self.assertEqual(self.normal_state(self.b), before)

    def test_fresh_parent_and_dirty_index_preserved(self):
        self.advance_b('product.txt', b'new remote product\n')
        parent = self.remote_tip()
        remote_before = set(self.remote_paths())
        self.put(self.a, 'unpublished.txt', b'local commit\n')
        self.commit(self.a, 'unpublished branch commit')
        self.put(self.a, 'staged.txt', b'staged\n')
        self.g(self.a, 'add', 'staged.txt')
        self.put(self.a, 'product.txt', b'dirty product\n')
        self.put(self.a, 'untracked.txt', b'untracked\n')
        self.put(self.a, RECORD, data(2))
        before = self.normal_state(self.a)
        self.publish(self.a)
        self.assertEqual(self.g(self.origin, 'rev-parse', 'main^').decode().strip(), parent)
        self.assertEqual(self.remote_blob('product.txt'), b'new remote product\n')
        self.assertEqual(set(self.remote_paths()), remote_before | {RECORD})
        changed = self.g(self.origin, 'diff-tree', '-r', '--name-status', 'main^', 'main').decode().split()
        self.assertEqual(changed, ['A', RECORD])
        self.assertEqual(self.normal_state(self.a), before)
        self.assertEqual((self.a / 'staged.txt').read_bytes(), b'staged\n')
        self.assertEqual((self.a / 'untracked.txt').read_bytes(), b'untracked\n')
        self.assertIn(b'staged.txt', self.g(self.a, 'diff', '--cached', '--name-only'))

    def test_split_index_user_index_survives(self):
        self.g(self.a, 'config', 'core.splitIndex', 'true')
        self.g(self.a, 'config', 'splitIndex.maxPercentChange', '0')
        self.g(self.a, 'update-index', '--split-index')
        self.put(self.a, 'staged.txt', b'staged\n')
        self.g(self.a, 'add', 'staged.txt')
        shared = sorted((self.a / '.git').glob('sharedindex.*'))
        old = time.time() - 30 * 86400  # older than the default 2-week shared index expiry
        for p in shared:
            os.utime(p, (old, old))
        self.put(self.a, RECORD, data(1))
        self.publish(self.a)
        self.assertEqual(sorted((self.a / '.git').glob('sharedindex.*')), shared)
        self.g(self.a, 'status', '--porcelain')
        self.assertIn(b'staged.txt', self.g(self.a, 'diff', '--cached', '--name-only'))

    def test_status_check_dry_run_no_base_or_files_write(self):
        self.put(self.a, RECORD, data(1))
        before = self.normal_state(self.a)
        tip = self.remote_tip()
        for cmd in [('status',), ('check',), ('publish', '--dry-run'), ('receive', '--dry-run')]:
            self.cli(self.a, *cmd)
            self.assertEqual(self.normal_state(self.a), before)
            self.assertIsNone(self.registry(self.a))
            self.assertEqual(self.remote_tip(), tip)
        r = self.cli(self.a, 'status', '--paths', RECORD, MECH)
        self.assertIn('not contacted', r['status'])
        self.assertEqual(r['files'], {RECORD: 'unbased-not-yet-synchronized', MECH: 'absent-unbased'})
        self.cli(self.a, 'publish', code=3)

    def test_receive_dry_run_remote_new_does_not_create_file(self):
        self.put(self.a, RECORD, data(4))
        self.publish(self.a)
        result = self.cli(self.b, 'receive', '--dry-run')
        self.assertIn(RECORD, result['would_write'])
        self.assertFalse((self.b / RECORD).exists())
        self.assertIsNone(self.registry(self.b))

    def test_received_file_modes(self):
        self.setup_synced()
        new = self.b / RECORD
        self.assertEqual(new.stat().st_mode & 0o777, 0o666 & ~sync.UMASK)
        new.chmod(0o640)
        self.put(self.a, RECORD, data(2))
        self.publish(self.a)
        self.cli(self.b, 'receive')
        self.assertEqual(new.read_bytes(), data(2))
        self.assertEqual(new.stat().st_mode & 0o777, 0o640)

    # --- B/L/R --------------------------------------------------------------------
    def test_divergent_changes_conflict_and_bases_preserved(self):
        self.setup_synced()
        self.put(self.a, RECORD, data(2))
        self.publish(self.a)
        self.put(self.b, RECORD, data(3))
        before = self.normal_state(self.b), self.registry(self.b)
        for action in ['receive', 'publish']:
            extra = ['--reviewed-public-safe'] if action == 'publish' else []
            self.cli(self.b, action, *extra, code=2)
            self.assertEqual((self.b / RECORD).read_bytes(), data(3))
            self.assertEqual((self.normal_state(self.b), self.registry(self.b)), before)

    def test_disjoint_changes_preserved(self):
        self.setup_synced()
        self.put(self.a, RECORD, data(2))
        self.publish(self.a)
        self.put(self.b, MECH, data(8))
        self.cli(self.b, 'receive')
        self.assertEqual((self.b / MECH).read_bytes(), data(8))
        self.publish(self.b)
        self.assertEqual(self.remote_blob(RECORD), data(2))
        self.assertEqual(self.remote_blob(MECH), data(8))

    def test_unbased_different_file_conflicts(self):
        self.put(self.a, RECORD, data(1))
        self.publish(self.a)
        self.put(self.b, RECORD, data(9))
        self.cli(self.b, 'receive', code=2)
        self.assertIsNone(self.registry(self.b))
        self.assertEqual((self.b / RECORD).read_bytes(), data(9))

    def test_local_deletion_held_without_blocking_other_records(self):
        self.setup_synced()
        (self.b / RECORD).unlink()
        self.put(self.a, MECH, data(11))
        self.publish(self.a)
        r = self.cli(self.b, 'receive')
        self.assertEqual(r['files'][RECORD], 'local-deleted-held')
        self.assertFalse((self.b / RECORD).exists())
        self.assertEqual((self.b / MECH).read_bytes(), data(11))
        self.put(self.b, MECH, data(12))
        r = self.publish(self.b)
        self.assertEqual(r['files'][RECORD], 'local-deleted-held')
        self.assertEqual(self.remote_blob(RECORD), data(1))
        self.assertEqual(self.remote_blob(MECH), data(12))
        # Local deletion + remote change of the same record is a real conflict.
        self.put(self.a, RECORD, data(3))
        self.cli(self.a, 'receive')
        self.publish(self.a)
        self.cli(self.b, 'receive', code=2)
        self.assertFalse((self.b / RECORD).exists())

    def test_remote_deletion_held_never_republished(self):
        self.setup_synced()
        self.g(self.b, 'fetch', '-q', 'origin')
        self.g(self.b, 'reset', '--hard', '-q', 'origin/main')
        self.g(self.b, 'rm', '-q', RECORD)
        self.put(self.b, MECH, data(20))
        self.g(self.b, 'add', MECH)
        self.g(self.b, 'commit', '-q', '-m', 'remote deletion fixture')
        self.g(self.b, 'push', '-q', 'origin', 'main')
        r = self.cli(self.a, 'receive')
        self.assertEqual(r['files'][RECORD], 'remote-deleted-held')
        self.assertEqual((self.a / RECORD).read_bytes(), data(1))
        self.assertEqual((self.a / MECH).read_bytes(), data(20))
        self.publish(self.a)
        self.assertNotIn(RECORD, self.remote_paths())
        self.put(self.a, RECORD, data(5))
        tip = self.remote_tip()
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=2)
        self.assertEqual(self.remote_tip(), tip)

    def test_both_absent_clears_base_and_recreation_syncs(self):
        self.setup_synced()
        self.g(self.b, 'fetch', '-q', 'origin')
        self.g(self.b, 'reset', '--hard', '-q', 'origin/main')
        self.g(self.b, 'rm', '-q', RECORD)
        self.g(self.b, 'commit', '-q', '-m', 'remove record')
        self.g(self.b, 'push', '-q', 'origin', 'main')
        self.assertEqual(self.cli(self.b, 'receive')['files'][RECORD], 'absent')  # b acknowledges too
        (self.a / RECORD).unlink()
        self.assertEqual(self.cli(self.a, 'receive')['files'][RECORD], 'absent')
        self.assertEqual(json.loads(self.registry(self.a))['repos'].popitem()[1]['base'][RECORD], 'absent')
        # After an acknowledged absence a deliberate re-creation is published normally...
        self.put(self.a, RECORD, data(30))
        self.publish(self.a)
        self.assertEqual(self.remote_blob(RECORD), data(30))
        # ...and received by a machine that also acknowledged the absence.
        self.assertEqual(self.cli(self.b, 'receive')['files'][RECORD], 'remote-new')
        self.assertEqual((self.b / RECORD).read_bytes(), data(30))

    def test_remote_deletion_unbased_is_not_republished(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, NOTE, b'# retired\n')
        self.publish(self.a)
        self.g(self.b, 'pull', '-q', '--ff-only')  # records via normal Git, no sync base
        self.g(self.a, 'fetch', '-q', 'origin')
        c = self.fresh_c()
        self.g(c, 'rm', '-q', NOTE)
        self.g(c, 'commit', '-q', '-m', 'retire note')
        self.g(c, 'push', '-q', 'origin', 'main')
        r = self.cli(self.b, 'receive', code=2)
        self.assertEqual(r['files'][NOTE], 'remote-deleted-unbased')
        self.cli(self.b, 'publish', '--reviewed-public-safe', code=2)
        self.assertNotIn(NOTE, self.remote_paths())
        self.assertTrue((self.b / NOTE).exists())

    # --- path / content safety ------------------------------------------------------
    def test_forbidden_paths_and_secret_defense(self):
        forbidden = ['../checkpoint.json', '/tmp/checkpoint.json',
                     'docs/reviews/handoff/exercise/min/checkpoint.json',
                     'docs/reviews/handoff/README.md', EX + '/a.txt', EX + '/nested/RESUME.txt',
                     EX + '/resume.txt', EX + '/RESUME.TXT', EX + '/.env.json', EX + '/id_rsa.json',
                     EX + '/server.key.json', EX + '/token.json', EX + '/service-account.json',
                     EX + '/a\x7f.json', EX + '/Checkpoint.json​',
                     EX + '/gh' + 'p_' + 'A1' * 18 + '.json']
        for path in forbidden:
            r = self.cli(self.a, 'publish', '--dry-run', '--paths', path, code=3)
            self.assertNotIn('A1A1A1', json.dumps(r))

    def test_secret_scanner_samples_and_false_positives(self):
        rejected = [
            'AK' + 'IA' + 'ABCDEFGHIJKLMNOP', 'AI' + 'za' + 'x' * 35, 'xo' + 'xb-' + '1234567890-abcdef',
            'sk' + '_live_' + 'a1' * 12, 'sb_' + 'secret_' + 'a1' * 10, 'gh' + 'p_' + 'a1' * 18,
            'glp' + 'at-' + 'a1' * 10, 'sk-' + 'ant-' + 'a1' * 15,
            'eyJ' + 'a' * 10 + '.' + 'eyJ' + 'b' * 10 + '.' + 'c' * 10,
            '-----BEGIN PGP PRIVATE KEY BLOCK-----', 'AWS_SECRET_ACCESS_KEY=' + 'abcd1234' * 4,
            'password: ' + 'hunter2hunter2hunter2', 'postgresql://user:pa' + 'ss@db.example.invalid:5432/x',
            'https://example.invalid/a?token=abcdef', 'HTTPS://EXAMPLE.INVALID/A?TOKEN=abc',
            'https://hooks.slack.com/services/' + 'T000/B000/xxxxxxxxxx',
            'https://example.invalid/#refresh_token=abc', 'Bearer ' + 'abc123' * 5,
            'https://x.example.invalid/storage/v1/object/sign/b/v.mp4',
        ]
        for sample in rejected:
            with self.assertRaises(sync.Stop, msg=sample[:12]) as e:
                sync.validate_content(RECORD, json.dumps({'note': sample}).encode())
            self.assertNotIn(sample, str(e.exception))
        escaped = (b'{"u":"https:\\/\\/x.example.invalid\\/a?to\\u006ben=abc"}')
        with self.assertRaises(sync.Stop):
            sync.validate_content(RECORD, escaped)
        accepted = [
            'the bearer responsibilities-of-load are discussed here', '자료 https://[링크 미정] 확인 필요',
            'https://www.youtube.com/watch?v=abc&t=30s&si=xyz123', 'https://doi.org/10.1000/xyz123',
            'key points: keep the hips square', 'token economy is unrelated', 'https://youtu.be/abc?si=q1',
        ]
        for sample in accepted:
            sync.validate_content(RECORD, json.dumps({'note': sample}).encode())
            sync.validate_content(EX + '/memo.md', sample.encode())
        start = time.monotonic()
        sync.validate_content(EX + '/big.md', b'-eyJ' * 500000)
        self.assertLess(time.monotonic() - start, 10)
        with self.assertRaises(sync.Stop):
            sync.validate_content(RECORD, b'[' * 100000 + b']' * 100000)

    def test_cli_rejects_secret_and_deep_json_without_echo(self):
        samples = [b'{"note":"https://example.invalid/a?token=abcdefghijklmnop"}',
                   b'{"note":"-----BEGIN PRIVATE KEY-----"}', b'not json', b'\xff',
                   b'[' * 100000 + b']' * 100000]
        for content in samples:
            self.put(self.a, RECORD, content)
            r = self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)
            self.assertNotIn('abcdefghijklmnop', json.dumps(r))
        self.put(self.a, RECORD, b'x' * (sync.MAX_BYTES + 1))
        self.cli(self.a, 'check', code=3)
        self.assertNotIn(RECORD, self.remote_paths())

    def test_scan_excludes_sidecars_without_blocking(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, EX + '/._checkpoint.json', b'\x00\x05AppleDouble')
        self.put(self.a, EX + '/secret-santa-notes.md', b'x')
        self.put(self.a, EX + '/other.txt', b'x')
        self.put(self.a, EX + '/nested/RESUME.txt', b'x')
        self.put(self.a, EX + '/clip.mp4', b'x')
        os.symlink('/nonexistent-lock', self.a / EX / '.#checkpoint.json')
        r = self.cli(self.a, 'check')
        for p in ('._checkpoint.json', 'secret-santa-notes.md', 'other.txt', 'nested/RESUME.txt', 'clip.mp4'):
            self.assertIn(EX + '/' + p, r['excluded'])
        self.publish(self.a)
        self.assertEqual([p for p in self.remote_paths() if p.startswith(EX)], [RECORD])
        self.cli(self.a, 'publish', '--dry-run', '--paths', EX + '/secret-santa-notes.md', code=3)

    def test_symlink_file_and_parent_rejected(self):
        self.put(self.a, 'outside.json', data(99))
        p = self.a / RECORD
        p.parent.mkdir(parents=True)
        p.symlink_to(self.a / 'outside.json')
        self.cli(self.a, 'check', code=3)
        p.unlink()
        p.parent.rmdir()
        p.parent.symlink_to(self.a)
        self.cli(self.a, 'receive', '--paths', RECORD, code=3)
        self.assertEqual((self.a / 'outside.json').read_bytes(), data(99))

    def test_remote_symlink_rejected(self):
        self.put(self.a, 'outside.json', data(99))
        p = self.a / RECORD
        p.parent.mkdir(parents=True)
        p.symlink_to('../../../outside.json')
        self.commit(self.a, 'unsafe tree fixture')
        self.g(self.a, 'push', '-q', 'origin', 'main')
        self.cli(self.b, 'receive', code=3)
        self.assertFalse((self.b / RECORD).exists())

    def test_malformed_remote_entries_rejected_before_writes(self):
        good = data(1)
        commit = self.g(self.a, 'rev-parse', 'HEAD').strip()
        cases = [
            [(b'160000', commit, (EX + '/sub').encode())],
            [(b'100755', good, (EX + '/exec.json').encode())],
            [(b'120000', b'../../../../../product.txt', EX.encode() + b'/bad\xff.json')],
            [(b'100644', good, EX.encode() + b'/name\xfe.json')],
            [(b'100644', b'{"note":"https://e.invalid/?token=abc"}', (EX + '/leak.json').encode())],
            [(b'100644', good, (EX + '/a.json').encode()), (b'100644', good, (EX + '/A.json').encode())],
        ]
        for entries in cases:
            c = self.push_index_entries([(b'100644', good, RECORD.encode())] + entries)
            before = self.registry(self.b)
            self.cli(self.b, 'receive', code=3)
            self.assertFalse((self.b / RECORD).exists())
            self.assertEqual(self.registry(self.b), before)
            self.g(c, 'rm', '-q', '--cached', '-r', '--ignore-unmatch', EX)
            self.g(c, 'commit', '-q', '-m', 'revert fixture')
            self.g(c, 'push', '-q', 'origin', 'HEAD:main')

    def test_case_and_unicode_aliases_refused(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, EX + '/sub/x.md', b'# x\n')
        self.publish(self.a)
        tip = self.remote_tip()
        # A --paths case typo must not publish a second, colliding remote path.
        self.cli(self.a, 'publish', '--reviewed-public-safe', '--paths', EX + '/Checkpoint.json', code=3)
        self.assertEqual(self.remote_tip(), tip)
        # Remote Sub/ vs local sub/ must not be materialized into the other directory.
        self.cli(self.b, 'receive')
        self.push_index_entries([(b'100644', b'# a\n', (EX + '/Sub/a.md').encode())])
        self.cli(self.b, 'receive', code=3)
        self.assertEqual(sorted(p.name for p in (self.b / EX / 'sub').iterdir()), ['x.md'])
        # NFD local name: excluded locally; an NFC remote twin is refused instead of aliased.
        nfc = EX + '/' + unicodedata.normalize('NFC', '검수.json')
        nfd = EX + '/' + unicodedata.normalize('NFD', '검수.json')
        self.put(self.a, nfd, data(5))
        self.push_index_entries([(b'100644', data(6), nfc.encode())])
        self.cli(self.a, 'receive', '--paths', nfc, code=3)
        self.assertEqual((self.a / nfd).read_bytes(), data(5))

    # --- registry / lock / exit codes ------------------------------------------------
    def test_offline_and_malformed_registry(self):
        self.setup_synced()
        self.g(self.b, 'remote', 'set-url', 'origin', str(self.base / 'missing.git'))
        before = self.normal_state(self.b), self.registry(self.b)
        self.cli(self.b, 'receive', code=4)
        self.assertEqual((self.normal_state(self.b), self.registry(self.b)), before)
        self.g(self.b, 'remote', 'set-url', 'origin', str(self.origin))
        state = self.b / '.git/video-review-sync-v1/state.json'
        good = json.loads(state.read_bytes())
        ident = next(iter(good['repos']))
        variants = [b'{"version":999,"repos":{}}', b'{"version":true,"repos":{}}', b'not json',
                    json.dumps({'version': 1, 'repos': {ident: {'base': {}, 'remote_tip': {'a': 1}}}}).encode(),
                    json.dumps({'version': 1, 'repos': {ident: {'base': {RECORD: 'zz'}, 'remote_tip': None}}}).encode(),
                    json.dumps({'version': 1, 'repos': {ident: {'base': {'x.json': '0' * 64}, 'remote_tip': None}}}).encode()]
        for raw in variants:
            state.write_bytes(raw)
            self.cli(self.b, 'status', code=3)
            self.cli(self.b, 'receive', code=3)
            self.assertEqual(state.read_bytes(), raw)

    def test_cooperative_lock(self):
        directory = self.a / '.git/video-review-sync-v1'
        directory.mkdir()
        with (directory / 'lock').open('w') as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.cli(self.a, 'status', code=6)
            self.cli(self.a, 'publish', '--reviewed-public-safe', code=6)
        self.assertIsNone(self.registry(self.a))

    def test_usage_error_has_distinct_exit(self):
        r = subprocess.run([sys.executable, str(SCRIPT), 'publish', '--bogus'], env=self.env,
                           stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        self.assertEqual(r.returncode, 64)

    def test_caller_transport_restriction_respected(self):
        env = dict(self.env, GIT_ALLOW_PROTOCOL='ssh')
        self.cli(self.a, 'check', code=4, env=env)

    def test_non_utf8_locale_and_korean_name(self):
        name = EX + '/메모.md'
        self.put(self.a, name, '# 메모\n'.encode())
        self.publish(self.a)
        env = dict(self.env, LC_ALL='en_US.ISO8859-1', LANG='en_US.ISO8859-1')
        self.cli(self.b, 'receive', env=env)
        self.assertEqual((self.b / name).read_bytes(), '# 메모\n'.encode())
        self.cli(self.b, 'check', env=env)

    def test_lost_stdout_still_reports_completion(self):
        self.put(self.a, RECORD, data(1))
        r_fd, w_fd = os.pipe()
        os.close(r_fd)
        try:
            r = subprocess.run([sys.executable, str(SCRIPT), 'publish', '--reviewed-public-safe', '--repo',
                                str(self.a)], env=self.env, stdout=w_fd, stderr=subprocess.PIPE, timeout=60)
        finally:
            os.close(w_fd)
        self.assertEqual(r.returncode, 0)
        self.assertIn(b'output was lost', r.stderr)
        self.assertEqual(self.remote_blob(RECORD), data(1))

    # --- hooks / identity ------------------------------------------------------------
    def install_known_hook(self, repo):
        target = repo / '.githooks/pre-push'
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(REAL_HOOK.read_bytes())
        target.chmod(0o755)
        self.g(repo, 'config', 'core.hooksPath', '.githooks')
        (repo / '.env').write_text('')  # Synthetic, empty, unreadable fixture file only.
        (repo / '.env').chmod(0)
        bin_dir = self.base / 'bin'
        bin_dir.mkdir(exist_ok=True)
        sentinel = self.base / 'patch-note-called'
        node = bin_dir / 'node'
        node.write_text('#!/bin/sh\ntouch "' + str(sentinel) + '"\n')
        node.chmod(0o755)
        self.env['PATH'] = str(bin_dir) + os.pathsep + os.environ['PATH']
        return sentinel

    def test_patch_hook_skip_is_per_sync_push_only(self):
        sentinel = self.install_known_hook(self.a)
        config = (self.a / '.git/config').read_bytes()
        self.put(self.a, RECORD, data(1))
        self.publish(self.a)
        self.assertFalse(sentinel.exists())
        self.assertEqual((self.a / '.git/config').read_bytes(), config)
        self.g(self.a, 'push', '-q', 'origin', 'HEAD:refs/heads/ordinary-fixture')
        self.assertTrue(sentinel.exists())
        self.assertEqual(self.g(self.a, 'config', 'core.hooksPath').strip(), b'.githooks')

    def test_unknown_hooks_are_not_bypassed(self):
        self.put(self.a, RECORD, data(1))
        tip = self.remote_tip()
        hook = self.a / '.git/hooks/pre-push'
        hook.write_text('#!/bin/sh\nexit 1\n')
        hook.chmod(0o755)
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)
        hook.unlink()
        sentinel = self.install_known_hook(self.a)
        known = (self.a / '.githooks/pre-push')
        known.write_bytes(known.read_bytes() + b'# extra safety line\n')
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)
        known.write_bytes(REAL_HOOK.read_bytes())
        guard = self.base / 'config-hook-ran'
        self.g(self.a, 'config', 'hook.guard.command', 'touch ' + str(guard))
        self.g(self.a, 'config', 'hook.guard.event', 'pre-push')
        config = (self.a / '.git/config').read_bytes()
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)
        self.assertEqual((self.a / '.git/config').read_bytes(), config)
        self.assertFalse(guard.exists())
        self.assertFalse(sentinel.exists())
        self.assertEqual(self.remote_tip(), tip)
        self.assertIsNone(self.registry(self.a))

    def test_missing_identity_refused(self):
        self.g(self.a, 'config', '--unset', 'user.name')
        self.g(self.a, 'config', '--unset', 'user.email')
        self.put(self.a, RECORD, data(1))
        tip = self.remote_tip()
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)
        self.assertEqual(self.remote_tip(), tip)

    def test_explicit_paths_do_not_read_or_publish_other_subject(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, MECH, b'not json and not selected')
        self.cli(self.a, 'publish', '--reviewed-public-safe', '--paths', RECORD)
        self.assertNotIn(MECH, self.remote_paths())
        self.assertEqual((self.a / MECH).read_bytes(), b'not json and not selected')
        # A malformed remote record in another subject must not be read/materialized.
        self.advance_b(MECH, b'not valid JSON')
        self.cli(self.a, 'receive', '--paths', RECORD)

    def test_different_push_destination_refused(self):
        self.g(self.a, 'remote', 'set-url', '--push', 'origin', str(self.base / 'wrong.git'))
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)

    def test_empty_remote_subtree_is_not_silently_dropped(self):
        c = self.fresh_c()
        empty = self.g(c, 'mktree', data=b'').strip()
        listing = self.g(c, 'ls-tree', 'HEAD') + b'040000 tree ' + empty + b'\tplaceholder-dir\n'
        tree = self.g(c, 'mktree', data=listing).strip()
        commit = self.g(c, 'commit-tree', tree.decode(), '-p', 'HEAD', data=b'empty dir fixture\n').strip()
        self.g(c, 'push', '-q', 'origin', commit.decode() + ':refs/heads/main')
        tip = self.remote_tip()
        self.put(self.a, RECORD, data(1))
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)
        self.assertEqual(self.remote_tip(), tip)

    # --- races / faults (in-process, test-local injection) -------------------------
    def test_receive_new_target_symlink_swap_refused(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, 'outside.json', data(99))
        repo = sync.Repo(self.a)
        expected = repo.read_local(RECORD)
        (self.a / RECORD).unlink()
        (self.a / RECORD).symlink_to(self.a / 'outside.json')
        with self.assertRaises(sync.Stop):
            repo.write_local(RECORD, data(7), expected)
        self.assertEqual((self.a / 'outside.json').read_bytes(), data(99))

    def test_server_race_rejects_without_losing_remote_code(self):
        self.put(self.a, RECORD, data(1))
        state = {'done': False}

        def racing(original, repo, args, kw):
            if sub(args) == 'push' and not state['done']:
                state['done'] = True
                self.advance_b()
            return original(repo, *args, **kw)

        with self.inject(racing):
            code, r = self.tool(self.a, 'publish')
        self.assertTrue(state['done'])
        self.assertEqual(code, 2, r)
        self.assertEqual(self.remote_blob('remote-code.txt'), b'remote\n')
        self.assertNotIn(RECORD, self.remote_paths())
        self.assertIsNone(self.registry(self.a))

    def test_remote_advance_before_recheck_refused(self):
        self.put(self.a, RECORD, data(1))
        calls = {'ls-remote': 0}

        def racing(original, repo, args, kw):
            if sub(args) == 'ls-remote':
                calls['ls-remote'] += 1
                if calls['ls-remote'] == 3:  # 1-2: fresh_remote, 3: recheck before push
                    self.advance_b()
            return original(repo, *args, **kw)

        with self.inject(racing):
            code, r = self.tool(self.a, 'publish')
        self.assertEqual(code, 2, r)
        self.assertNotIn(RECORD, self.remote_paths())
        self.assertIsNone(self.registry(self.a))

    def test_post_acceptance_lost_response_reconciles(self):
        self.put(self.a, RECORD, data(1))
        parent = self.remote_tip()

        def losing(original, repo, args, kw):
            result = original(repo, *args, **kw)
            if sub(args) == 'push':
                raise sync.Stop('fixture lost response', 4)
            return result

        with self.inject(losing):
            code, r = self.tool(self.a, 'publish')
        self.assertEqual(code, 0, r)
        self.assertEqual(self.remote_tip(), r['published_commit'])
        self.assertEqual(self.g(self.origin, 'rev-parse', 'main^').decode().strip(), parent)
        reg = json.loads(self.registry(self.a))['repos'].popitem()[1]
        self.assertEqual(reg['remote_tip'], r['published_commit'])
        self.assertEqual(self.cli(self.a, 'publish', '--reviewed-public-safe')['status'], 'unchanged')

    def test_unknown_outcome_keeps_base_then_reconciles_without_duplicate(self):
        self.setup_synced()
        before = self.registry(self.a)
        self.put(self.a, RECORD, data(2))
        state = {'offline': False}

        def failing(original, repo, args, kw):
            if state['offline'] and sub(args) in ('ls-remote', 'fetch'):
                raise sync.Stop('fixture offline', 4)
            if sub(args) == 'push':
                original(repo, *args, **kw)  # accepted by the server...
                state['offline'] = True      # ...but the network dies before any confirmation
                raise sync.Stop('fixture lost response', 4)
            return original(repo, *args, **kw)

        with self.inject(failing):
            code, r = self.tool(self.a, 'publish')
        self.assertEqual(code, 4, r)
        self.assertEqual(self.registry(self.a), before)
        accepted = self.remote_tip()
        self.assertEqual(self.remote_blob(RECORD), data(2))
        self.assertEqual(self.cli(self.a, 'publish', '--reviewed-public-safe')['status'], 'unchanged')
        self.assertEqual(self.remote_tip(), accepted)

    def test_source_changes_before_push_are_not_published(self):
        self.put(self.a, RECORD, data(1))
        tip = self.remote_tip()

        def changing(original, repo, args, kw):
            value = original(repo, *args, **kw)
            if sub(args) == 'commit-tree':
                self.put(self.a, RECORD, data(7))
            return value

        with self.inject(changing):
            code, r = self.tool(self.a, 'publish')
        self.assertEqual(code, 2, r)
        self.assertEqual(self.remote_tip(), tip)
        self.assertEqual((self.a / RECORD).read_bytes(), data(7))
        self.assertIsNone(self.registry(self.a))

    def test_registry_save_failure_after_push_is_reported_as_published(self):
        self.put(self.a, RECORD, data(1))
        original = sync.save_registry

        def broken(*a, **k):
            raise OSError('fixture disk full')

        sync.save_registry = broken
        try:
            code, r = self.tool(self.a, 'publish')
        finally:
            sync.save_registry = original
        self.assertEqual(code, 5, r)
        self.assertEqual(r['published_commit'], self.remote_tip())
        self.assertIn('Published', r['error'])
        self.assertEqual(self.cli(self.a, 'publish', '--reviewed-public-safe')['status'], 'unchanged')

    def test_receive_target_change_is_preserved(self):
        repo = sync.Repo(self.a)
        self.put(self.a, RECORD, data(1))
        with self.assertRaises(sync.Stop) as e:
            repo.write_local(RECORD, data(2), data(0))
        self.assertEqual(e.exception.code, 2)
        self.assertEqual((self.a / RECORD).read_bytes(), data(1))

    def test_receive_target_change_after_planning_via_run(self):
        self.setup_synced()
        self.put(self.a, RECORD, data(2))
        self.publish(self.a)
        before = self.registry(self.b)

        def editing(original, repo, args, kw):
            value = original(repo, *args, **kw)
            if sub(args) == 'cat-file' and 'blob' in args:
                self.put(self.b, RECORD, data(55))  # a concurrent editor writes after planning reads
            return value

        with self.inject(editing):
            code, r = self.tool(self.b, 'receive')
        self.assertEqual(code, 2, r)
        self.assertEqual((self.b / RECORD).read_bytes(), data(55))
        self.assertEqual(self.registry(self.b), before)

    def test_multi_file_receive_rolls_back_on_io_failure(self):
        self.setup_synced()
        self.put(self.a, RECORD, data(2))
        self.put(self.a, NOTE, b'# new note\n')
        self.put(self.a, MECH, data(13))
        self.publish(self.a)
        before = self.registry(self.b)
        original = sync.Repo.write_local
        calls = {'n': 0}

        def flaky(repo, name, content, expected):
            calls['n'] += 1
            if calls['n'] == 3:
                raise OSError('fixture write failure')
            return original(repo, name, content, expected)

        sync.Repo.write_local = flaky
        try:
            code, r = self.tool(self.b, 'receive')
        finally:
            sync.Repo.write_local = original
        self.assertEqual(code, 5, r)
        self.assertEqual((self.b / RECORD).read_bytes(), data(1))
        self.assertEqual((self.b / MECH).read_bytes(), data(10))
        self.assertFalse((self.b / NOTE).exists())
        self.assertEqual(self.registry(self.b), before)

    def test_timeout_is_bounded(self):
        self.put(self.a, RECORD, data(1))
        original = sync.TIMEOUT
        sync.TIMEOUT = 2
        hang = self.base / 'hang.sh'
        hang.write_text('#!/bin/sh\nexec 2>/dev/null\nsleep 30\n')
        hang.chmod(0o755)
        self.g(self.a, 'remote', 'set-url', 'origin', 'ext::' + str(hang))
        self.g(self.a, 'remote', 'set-url', '--push', 'origin', 'ext::' + str(hang))
        try:
            start = time.monotonic()
            os.environ['GIT_ALLOW_PROTOCOL'] = 'file:ext'
            code, r = self.tool(self.a, 'check')
        finally:
            os.environ['GIT_ALLOW_PROTOCOL'] = 'file'
            sync.TIMEOUT = original
        self.assertEqual(code, 4, r)
        self.assertLess(time.monotonic() - start, 15)


if __name__ == '__main__':
    unittest.main(verbosity=2)
