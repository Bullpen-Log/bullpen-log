import assert from 'node:assert/strict';
import { createEventOperations } from '../native/src/calendar/edit-operations.ts';
import { alarmIdsToRemove, createEventAlarmQueue } from '../native/src/calendar/alarm-queue.ts';
import { draftOf, toggleAllDay, eventInput, validDraft, draftChanged } from '../native/src/calendar/event-model.ts';
import { eventCommand, newEventId, type EventWriteResult, type EventVerification } from '@/lib/calendar-edit';

let passed = 0;
const check = (v: unknown, label: string) => { assert.ok(v, label);passed++; };
const today = '2026-11-02';
const input = { date: '2026-11-04', title: '불펜', time: '17:30', memo: null, remindMin: 30 };
const command = { op: 'create' as const, id: newEventId(), input };
const event = { ...input, id: command.id, version: '2026-11-02T00:00:00.000Z' };
const success: EventWriteResult = { ok: true, event, id: event.id, date: event.date };
const pending = { command, base: null };
const defer = <T,>() => { let resolve!: (v: T) => void;const promise = new Promise<T>((r) => { resolve = r; });return { promise, resolve }; };
const setup = () => {
  const memory = new Map<string, unknown>();let epoch = 0, writes = 0, verifies = 0, done = 0, failStore = false, failClear = false;
  let write: () => Promise<EventWriteResult> = async () => success;
  let verify: () => Promise<EventVerification> = async () => ({ ok: true, state: 'not-applied', event: null });
  const ops = createEventOperations({ epoch: () => epoch, read: async (k) => ({ ok: true, value: memory.get(k) }), store: async (k, v) => { if (failStore || (v == null && failClear)) return false;memory.set(k, v);return true; }, write: async (c) => { writes++;assert.deepEqual(memory.get('sinker:calendar-pending:a'), { command: c, base: null });return write(); }, verify: async () => { verifies++;return verify(); }, completed: () => { done++; }, rejected: () => false });
  return { ops, memory, stats: () => ({ writes, verifies, done }), bump: () => epoch++, write: (f: typeof write) => { write = f; }, verify: (f: typeof verify) => { verify = f; }, storeFailure: () => { failStore = true; }, clearFailure: () => { failClear = true; } };
};
{
  const d = draftOf(null, today);check(!validDraft(d, today), 'blank title invalid');
  const timed = toggleAllDay({ ...d, title: '연습' }, false);check(!validDraft(timed, today), 'time requires explicit selection');
  const withTime = { ...timed, time: '17:30', lastTime: '17:30' };
  check(toggleAllDay(toggleAllDay(withTime, true), false).time === '17:30', 'all-day toggle preserves chosen time');
  check(eventInput(d).remindMin === 0 && eventInput(withTime).remindMin === 30, 'defaults match all-day/timed');
  check(eventInput(toggleAllDay({ ...withTime, remind: null }, true)).remindMin === null, 'explicit none preserved');
  check(!draftChanged({ ...withTime, title: ' 연습 ' }, withTime), 'normalization avoids false dirty');
  check(!eventCommand({ ...command, input: { ...input, date: '2032-01-01' } }, today).ok, 'year boundary');
  check(!eventCommand({ ...command, input: { ...input, time: '25:00' } }, today).ok, 'invalid time');
  check(!eventCommand({ ...command, input: { ...input, date: '2026-02-30' } }, today).ok, 'invalid calendar date');
  check(!eventCommand({ ...command, input: { ...input, title: 'x'.repeat(41) } }, today).ok, 'title max');
  check(!eventCommand({ ...command, input: { ...input, memo: 'x'.repeat(301) } }, today).ok, 'memo max');
}
{
  const t = setup();await t.ops.open('a');await t.ops.send(pending);check(t.stats().writes === 1 && t.stats().done === 1 && !t.ops.snapshot().pending, 'durable journal before successful write, cleaned after');
}
{
  const t = setup();await t.ops.open('a');t.storeFailure();await t.ops.send(pending);check(t.stats().writes === 0 && !t.ops.snapshot().pending && !!t.ops.snapshot().error, 'storage failure prevents RPC');
}
{
  const t = setup();await t.ops.open('a');t.write(async () => { throw Error('lost ack'); });await t.ops.send(pending);
  check(!!t.ops.snapshot().pending, 'lost ack retained');await t.ops.send(pending);check(t.stats().writes === 1, 'no blind duplicate send');
  await t.ops.verify();check(t.stats().writes === 1 && t.stats().verifies === 1 && t.ops.snapshot().notApplied, 'verification reads only');
  t.write(async () => success);await t.ops.retry();check(t.stats().writes === 2 && t.stats().done === 1, 'explicit exact-command retry');
}
{
  const t = setup();await t.ops.open('a');t.write(async () => { throw Error(); });await t.ops.send(pending);await t.ops.open('b');check(!t.ops.snapshot().pending, 'per-account recovery');await t.ops.open('a');check(t.ops.snapshot().pending?.command.id === command.id, 'reopen restores exact id');
  t.verify(async () => ({ ok: true, state: 'applied', event }));await t.ops.verify();check(t.stats().writes === 1 && t.stats().done === 1, 'applied verification completes without write');
}
{
  const t = setup();await t.ops.open('a');t.clearFailure();await t.ops.send(pending);check(!!t.ops.snapshot().pending && t.stats().done === 0, 'journal cleanup failure remains recoverable');
}
{
  const t = setup();await t.ops.open('a');t.write(async () => ({ ok: false, conflict: true, error: '충돌' }));await t.ops.send(pending);check(t.ops.snapshot().conflict && !t.ops.snapshot().pending, 'definitive conflict preserves editor eligibility for latest read');
}
{
  const t = setup();const d = defer<EventWriteResult>();await t.ops.open('a');t.write(() => d.promise);const sending = t.ops.send(pending);await new Promise(r => setImmediate(r));t.bump();await t.ops.open('b');d.resolve(success);await sending;check(t.stats().done === 0 && !t.ops.snapshot().pending, 'late old-account response ignored');
}
{
  const t = setup();t.memory.set('sinker:calendar-pending:a', { broken: true });await t.ops.open('a');await t.ops.send(pending);check(!t.ops.snapshot().ready && t.stats().writes === 0, 'corrupt journal blocks new writes');
}
{
  let epoch = 0;const calls: string[] = [];let result = { scheduled: false, denied: true };let fail = false;
  const queue = createEventAlarmQueue({ epoch: () => epoch, now: () => 0, cancel: async id => { calls.push('cancel:' + id); }, schedule: async () => { calls.push('schedule');if (fail) throw Error();return result; }, armed: async (_, on) => { calls.push('armed:' + on); } });
  check(await queue.run(event) === 'denied' && !calls.includes('armed:true'), 'denied is not armed');result = { scheduled: true, denied: false };check(await queue.run(event) === 'ready', 'successful registration');
  fail = true;check(await queue.run(event) === 'failed', 'native alarm error separate');fail = false;
  check(await queue.run({ ...event, remindMin: null }) === 'off', 'none cancels');check(await queue.run({ ...event, owner: '관리자' }) === 'readonly', 'other owner never registers');
  const gate = defer<{ scheduled: boolean }>();const ordered: string[] = [];
  const q = createEventAlarmQueue({ epoch: () => epoch, now: () => 0, schedule: async () => { ordered.push('schedule');return gate.promise; }, cancel: async () => { ordered.push('cancel'); }, armed: async (_, on) => { ordered.push(String(on)); } });
  const a = q.run(event), b = q.cancel(event.id);gate.resolve({ scheduled: true });await Promise.all([a, b]);check(ordered.join(',') === 'schedule,true,cancel,false', 'delete cannot be overtaken by old alarm');
  const gate2 = defer<{ scheduled: boolean }>();const q2 = createEventAlarmQueue({ epoch: () => epoch, now: () => 0, schedule: () => gate2.promise, cancel: async () => { calls.push('late-cancel'); }, armed: async () => { throw Error('must not arm previous account'); } });const job = q2.run(event);await new Promise(r => setImmediate(r));epoch++;gate2.resolve({ scheduled: true });check(await job === 'failed' && calls.includes('late-cancel'), 'account change cancels late scheduling');
  check(alarmIdsToRemove(['a', 'b'], [], false).length === 0, 'truncated list cannot cancel absent alarms');check(alarmIdsToRemove(['a', event.id], [event], true).join(',') === 'a', 'complete list removes deleted alarms only');
}
console.log(`calendar edit: ${passed} checks passed`);
