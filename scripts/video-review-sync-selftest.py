#!/usr/bin/env python3
"""Local-only integration tests: temporary bare origin + two synthetic clones."""
import argparse
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name('video-review-sync.py').resolve()
spec = importlib.util.spec_from_file_location('review_sync', SCRIPT)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)
RECORD = 'docs/reviews/handoff/exercise/yunho/checkpoint.json'
MECH = 'docs/reviews/handoff/mechanics/yunho/checkpoint.json'
RESUME = 'docs/reviews/handoff/exercise/yunho/RESUME.txt'


def data(n):
    return json.dumps({'schema_version': 1, 'current': n}).encode() + b'\n'


class Integration(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='review-sync-fixture-')
        self.base = Path(self.tmp.name)
        self.origin = self.base / 'origin.git'
        self.a, self.b = self.base / 'a', self.base / 'b'
        self.env = dict(os.environ)
        # Fixture transports are local paths only, with no production remotes.
        self.g(None, 'init', '--bare', '-q', '--initial-branch=main', str(self.origin))
        self.g(None, 'clone', '-q', str(self.origin), str(self.a))
        for name, val in [('user.name', 'Fixture User'), ('user.email', 'fixture@example.invalid')]:
            self.g(self.a, 'config', name, val)
        self.put(self.a, 'product.txt', b'initial product\n')
        self.commit(self.a, 'initial')
        self.g(self.a, 'push', '-q', 'origin', 'main')
        self.g(None, 'clone', '-q', str(self.origin), str(self.b))
        self.g(self.b, 'config', 'user.name', 'Second Fixture')
        self.g(self.b, 'config', 'user.email', 'second@example.invalid')

    def tearDown(self):
        self.tmp.cleanup()

    def g(self, repo, *args):
        result = subprocess.run(['git', '--no-pager', *args], cwd=repo or self.base,
                                env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=15)
        if result.returncode:
            self.fail('Fixture Git command failed: ' + str(args[:2]) + ' exit=' + str(result.returncode))
        return result.stdout

    def put(self, repo, name, content):
        p = repo / name
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(content)

    def commit(self, repo, message):
        self.g(repo, 'add', '-A')
        self.g(repo, 'commit', '-q', '-m', message)

    def cli(self, repo, action, *args, code=0):
        r = subprocess.run([sys.executable, str(SCRIPT), action, '--repo', str(repo), *args],
                           env=self.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=20)
        self.assertEqual(r.returncode, code, (r.stdout + r.stderr).decode())
        return json.loads(r.stdout if r.returncode == 0 else r.stderr)

    def normal_state(self, repo):
        return (self.g(repo, 'rev-parse', 'HEAD'), self.g(repo, 'symbolic-ref', 'HEAD'),
                (repo / '.git/index').read_bytes(), (repo / 'product.txt').read_bytes())

    def registry(self, repo):
        p = repo / '.git/video-review-sync-v1/state.json'
        return p.read_bytes() if p.exists() else None

    def publish(self, repo):
        return self.cli(repo, 'publish', '--reviewed-public-safe')

    def setup_synced(self):
        self.put(self.a, RECORD, data(1))
        self.publish(self.a)
        self.cli(self.b, 'receive')

    def remote_tip(self):
        return self.g(self.origin, 'rev-parse', 'refs/heads/main').decode().strip()

    def remote_blob(self, path):
        return self.g(self.origin, 'show', 'refs/heads/main:' + path)

    def advance_b(self, name='remote-code.txt', content=b'remote\n'):
        # Deliberate mutation of a disposable fixture only.
        self.g(self.b, 'fetch', '-q', 'origin')
        self.g(self.b, 'reset', '--hard', '-q', 'origin/main')
        self.put(self.b, name, content)
        self.commit(self.b, 'concurrent fixture change')
        self.g(self.b, 'push', '-q', 'origin', 'main')

    def test_roundtrip_stale_head_and_exact_resume(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, RESUME, b'Resume this video, do not auto-advance.\n')
        self.put(self.a, 'docs/reviews/handoff/mechanics/yunho/nested/note.md', b'# Synthetic note\n')
        before_a, before_b = self.normal_state(self.a), self.normal_state(self.b)
        result = self.publish(self.a)
        self.assertEqual(self.remote_blob(RECORD), data(1))
        self.cli(self.b, 'receive')
        self.assertEqual((self.b / RECORD).read_bytes(), data(1))
        self.assertEqual((self.b / RESUME).read_bytes(), (self.a / RESUME).read_bytes())
        self.assertEqual(self.normal_state(self.a), before_a)
        self.assertEqual(self.normal_state(self.b), before_b)
        tip = self.remote_tip()
        self.assertEqual(self.publish(self.b)['status'], 'unchanged')
        self.assertEqual(self.remote_tip(), tip)
        self.assertEqual(result['published_commit'], tip)
        message = self.g(self.origin, 'show', '-s', '--format=%B', tip).decode()
        self.assertTrue(message.startswith('영상 검수 기록 공유'))
        self.assertIn('Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>', message)

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
        paths = self.g(self.origin, 'ls-tree', '-r', '--name-only', 'main').decode().splitlines()
        self.assertNotIn('staged.txt', paths)
        self.assertNotIn('untracked.txt', paths)
        self.assertNotIn('unpublished.txt', paths)
        self.assertEqual(self.normal_state(self.a), before)
        self.assertEqual((self.a / 'staged.txt').read_bytes(), b'staged\n')

    def test_status_check_dry_run_no_base_or_files_write(self):
        self.put(self.a, RECORD, data(1))
        before = self.normal_state(self.a)
        tip = self.remote_tip()
        for cmd in [('status',), ('check',), ('publish', '--dry-run'), ('receive', '--dry-run')]:
            self.cli(self.a, *cmd)
            self.assertEqual(self.normal_state(self.a), before)
            self.assertIsNone(self.registry(self.a))
            self.assertEqual(self.remote_tip(), tip)
        self.cli(self.a, 'publish', code=3)

    def test_receive_dry_run_remote_new_does_not_create_file(self):
        self.put(self.a, RECORD, data(4))
        self.publish(self.a)
        result = self.cli(self.b, 'receive', '--dry-run')
        self.assertIn(RECORD, result['would_write'])
        self.assertFalse((self.b / RECORD).exists())
        self.assertIsNone(self.registry(self.b))

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

    def test_local_deletion_not_propagated_or_restored(self):
        self.setup_synced()
        (self.b / RECORD).unlink()
        for action in ['receive', 'publish']:
            self.cli(self.b, action, '--reviewed-public-safe', code=2)
        self.assertFalse((self.b / RECORD).exists())
        self.assertEqual(self.remote_blob(RECORD), data(1))

    def test_remote_deletion_does_not_remove_or_republish_local(self):
        self.setup_synced()
        self.g(self.b, 'fetch', '-q', 'origin')
        self.g(self.b, 'reset', '--hard', '-q', 'origin/main')
        self.g(self.b, 'rm', '-q', RECORD)
        self.g(self.b, 'commit', '-q', '-m', 'remote deletion fixture')
        self.g(self.b, 'push', '-q', 'origin', 'main')
        tip = self.remote_tip()
        self.cli(self.a, 'receive', code=2)
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=2)
        self.assertEqual((self.a / RECORD).read_bytes(), data(1))
        self.assertEqual(self.remote_tip(), tip)

    def test_forbidden_paths_and_secret_defense(self):
        forbidden = ['../checkpoint.json', '/tmp/checkpoint.json',
                     'docs/reviews/handoff/exercise/min/checkpoint.json',
                     'docs/reviews/handoff/README.md',
                     'docs/reviews/handoff/exercise/yunho/a.txt',
                     'docs/reviews/handoff/exercise/yunho/nested/RESUME.txt',
                     'docs/reviews/handoff/exercise/yunho/.env.json']
        for path in forbidden:
            self.cli(self.a, 'publish', '--dry-run', '--paths', path, code=3)
        samples = [b'{"note":"https://example.invalid/a?token=abcdefghijklmnop"}',
                   b'{"note":"-----BEGIN PRIVATE KEY-----"}', b'not json', b'\xff']
        for content in samples:
            self.put(self.a, RECORD, content)
            r = self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)
            self.assertNotIn('abcdefghijklmnop', json.dumps(r))
        self.put(self.a, RECORD, b'x' * (sync.MAX_BYTES + 1))
        self.cli(self.a, 'check', code=3)

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

    def test_offline_and_malformed_registry(self):
        self.setup_synced()
        before = self.normal_state(self.b), self.registry(self.b)
        self.g(self.b, 'remote', 'set-url', 'origin', str(self.base / 'missing.git'))
        self.cli(self.b, 'receive', code=4)
        self.assertEqual((self.normal_state(self.b), self.registry(self.b)), before)
        self.g(self.b, 'remote', 'set-url', 'origin', str(self.origin))
        (self.b / '.git/video-review-sync-v1/state.json').write_text('{"version":999,"repos":{}}')
        self.cli(self.b, 'receive', code=3)

    def test_cooperative_lock(self):
        directory = self.a / '.git/video-review-sync-v1'
        directory.mkdir()
        with (directory / 'lock').open('w') as f:
            fcntl.flock(f, fcntl.LOCK_EX | fcntl.LOCK_NB)
            self.cli(self.a, 'status', code=2)
        self.assertIsNone(self.registry(self.a))

    def test_patch_hook_skip_is_per_sync_push_only(self):
        hook = SCRIPT.parent.parent / '.githooks/pre-push'
        target = self.a / '.githooks/pre-push'
        target.parent.mkdir()
        target.write_bytes(hook.read_bytes())
        target.chmod(0o755)
        self.g(self.a, 'config', 'core.hooksPath', '.githooks')
        (self.a / '.env').write_text('')  # Synthetic fixture only; no credentials.
        bin_dir = self.base / 'bin'
        bin_dir.mkdir()
        sentinel = self.base / 'patch-note-called'
        node = bin_dir / 'node'
        node.write_text('#!/bin/sh\ntouch "' + str(sentinel) + '"\n')
        node.chmod(0o755)
        self.env['PATH'] = str(bin_dir) + os.pathsep + os.environ['PATH']
        self.put(self.a, RECORD, data(1))
        self.publish(self.a)
        self.assertFalse(sentinel.exists())
        self.g(self.a, 'push', '-q', 'origin', 'HEAD:refs/heads/ordinary-fixture')
        self.assertTrue(sentinel.exists())
        self.assertEqual(self.g(self.a, 'config', 'core.hooksPath').strip(), b'.githooks')

    def test_unknown_hook_is_not_bypassed(self):
        hook = self.a / '.git/hooks/pre-push'
        hook.write_text('#!/bin/sh\nexit 1\n')
        hook.chmod(0o755)
        self.put(self.a, RECORD, data(1))
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)
        self.assertIsNone(self.registry(self.a))

    def test_explicit_paths_do_not_read_or_publish_other_subject(self):
        self.put(self.a, RECORD, data(1))
        self.put(self.a, MECH, b'not json and not selected')
        self.cli(self.a, 'publish', '--reviewed-public-safe', '--paths', RECORD)
        paths = self.g(self.origin, 'ls-tree', '-r', '--name-only', 'main').decode().splitlines()
        self.assertNotIn(MECH, paths)
        self.assertEqual((self.a / MECH).read_bytes(), b'not json and not selected')
        # A malformed remote record in another subject must not be read/materialized.
        self.advance_b(MECH, b'not valid JSON')
        self.cli(self.a, 'receive', '--paths', RECORD)

    def test_different_push_destination_refused(self):
        self.g(self.a, 'remote', 'set-url', '--push', 'origin', str(self.base / 'wrong.git'))
        self.cli(self.a, 'publish', '--reviewed-public-safe', code=3)

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
        repo = sync.Repo(self.a)
        original = repo.git
        advanced = False

        def racing(*args, **kw):
            nonlocal advanced
            if 'push' in args and '--no-verify' in args and not advanced:
                advanced = True
                self.advance_b()
            return original(*args, **kw)

        repo.git = racing
        with self.assertRaises(sync.Stop):
            repo.publish(repo.fresh_remote(), {RECORD: data(1)}, {RECORD: data(1)})
        self.assertTrue(advanced)
        self.assertEqual(self.remote_blob('remote-code.txt'), b'remote\n')
        self.assertIsNone(self.registry(self.a))

    def test_post_acceptance_lost_response_reconciles(self):
        self.put(self.a, RECORD, data(1))
        repo = sync.Repo(self.a)
        original = repo.git

        def losing(*args, **kw):
            result = original(*args, **kw)
            if 'push' in args and '--no-verify' in args:
                raise sync.Stop('fixture lost response', 4)
            return result

        repo.git = losing
        commit = repo.publish(repo.fresh_remote(), {RECORD: data(1)}, {RECORD: data(1)})
        self.assertEqual(self.remote_tip(), commit)

    def test_source_changes_before_push_are_not_published(self):
        self.put(self.a, RECORD, data(1))
        repo = sync.Repo(self.a)
        original = repo.git

        def changing(*args, **kw):
            value = original(*args, **kw)
            if args[0] == 'commit-tree':
                self.put(self.a, RECORD, data(7))
            return value

        repo.git = changing
        tip = self.remote_tip()
        with self.assertRaises(sync.Stop) as e:
            repo.publish(repo.fresh_remote(), {RECORD: data(1)}, {RECORD: data(1)})
        self.assertEqual(e.exception.code, 2)
        self.assertEqual(self.remote_tip(), tip)
        self.assertEqual((self.a / RECORD).read_bytes(), data(7))

    def test_receive_target_change_is_preserved(self):
        repo = sync.Repo(self.a)
        self.put(self.a, RECORD, data(1))
        with self.assertRaises(sync.Stop) as e:
            repo.write_local(RECORD, data(2), data(0))
        self.assertEqual(e.exception.code, 2)
        self.assertEqual((self.a / RECORD).read_bytes(), data(1))


if __name__ == '__main__':
    unittest.main(verbosity=2)
