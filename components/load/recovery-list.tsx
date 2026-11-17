'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { logSet } from '@/app/actions/workout';
import { loadRecoveryContext, resolveSessionOwnership, type RecoveryContext } from '@/app/(app)/training/recovery/actions';
import { ConfirmDialog } from '@/components/confirm-delete';
import { CircleAlert, CloudOff, Pencil, RefreshCw, Trash2 } from '@/components/icon';
import { RecoveryEditor } from '@/components/load/recovery-row';
import { drainSets } from '@/components/load/set-outbox';
import { toast } from '@/components/toast';
import { extraKey, quarantineKey } from '@/lib/outbox';
import { quietRefresh } from '@/lib/quiet-refresh';
import { formatWeight, readWeightUnit, serverWeightUnit, subscribeUnits, type WeightUnit } from '@/lib/units-storage';
import { describeSet, heldReasonOf, ownerGroupOf, recoveryActionsOf } from '@/lib/workout/load/describe';
import { outbox, type PendingSet } from '@/lib/workout/outbox';

/**
 * EX-LOAD01-R1 — 못 보낸 운동 세트 복구(웹, /training/recovery). 이 기기에 남아 있는 세트를 계정마다 갈라 보인다:
 *   - 내 세트: 날짜 · 운동 · 그 판 · 원래 무게 기록(밴드 · 섞임 · 양손 다른 무게 · 기구 이름 그대로) · 횟수 · 붙든 까닭과 [다시 보내기] [고치기] [버리기].
 *     다시 보내기는 같은 판 · 같은 번호 · 같은 시각으로만 보낸다(새 운동을 만들지 않는다). 서버가 또 받지 않으면 원래 값이 그대로 다시 붙들린다.
 *   - 어느 계정 것인지 모르는 옛 세트: 수만. 내 기록으로 보이지 않고 보내지도 않는다. [내 기록으로 확인하기]를 누르면 세트 내용 없이 판 번호만
 *     서버에 물어(읽기만 — resolveSessionOwnership) 이 계정의 판으로 확인된 줄만 내 세트로 옮긴다. 이 기기에서 버릴 수 있다.
 *   - 다른 계정의 세트: 수만. 보내기 · 고치기 · 버리기 없음 — 그 계정으로 로그인하면 보낸다.
 *   - 읽을 수 없는 줄 · 깨진 저장 값: 수만. 보내지 않는다. 사람이 버릴 때만 지운다.
 * 버리기는 모두 확인을 받는다. 나이로는 아무것도 지우지 않는다(lib/workout/outbox.ts).
 *
 * 계정: ownerId 가 바뀌면(화면이 떠 있는 채로 다른 계정) 고치기 창 · 확인 창 · 맥락을 걷는다. 동작은 누르는 순간 대기열이 줄의 계정을 다시 본다
 * (release · correct · discardOwned · bindOwner 에 화면의 계정을 넘김 — 다르면 아무것도 바꾸지 않는다). 고치기는 줄의 계정을 그대로 둔다.
 * 새 판(약속 · 해석기 · 카탈로그 · 모르는 칸)의 줄은 고치기를 내놓지 않는다(recoveryEditOf) — 다시 보내기는 원래 값 그대로.
 */

const noSubscribe = () => () => {};
const MINUTE = 60_000;
const minuteSubs = new Set<() => void>();
let minuteTimer: ReturnType<typeof setInterval> | null = null;
const subscribeMinute = (cb: () => void) => {
  minuteSubs.add(cb);
  minuteTimer ??= setInterval(() => minuteSubs.forEach((l) => l()), MINUTE);
  return () => {
    minuteSubs.delete(cb);
    if (!minuteSubs.size && minuteTimer) {
      clearInterval(minuteTimer);
      minuteTimer = null;
    }
  };
};
const minuteNow = () => Math.floor(Date.now() / MINUTE) * MINUTE;

const keyOf = (p: { sessionId: string; exerciseId: string; setNo: number }) => `${p.sessionId}|${p.exerciseId}|${p.setNo}`;

function when(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '시각 모름';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getMonth() + 1}월 ${d.getDate()}일 ${hh}:${mm}`;
}

const STATUS_WORD: Record<string, string> = { ACTIVE: '운동 중', FINISHED: '마친 운동', ABANDONED: '저절로 닫힌 운동' };

export function RecoveryList({ ownerId }: { ownerId: string }) {
  const router = useRouter();
  const client = useSyncExternalStore(noSubscribe, () => true, () => false);
  const rows = useSyncExternalStore(outbox.subscribe, outbox.snapshot, outbox.serverSnapshot);
  const extras = useSyncExternalStore(outbox.subscribe, outbox.extras, outbox.serverExtras);
  const unit = useSyncExternalStore(subscribeUnits, readWeightUnit, serverWeightUnit);
  useSyncExternalStore(subscribeMinute, minuteNow, () => 0);

  const mine = useMemo(
    () => rows.filter((p) => ownerGroupOf(p, ownerId) === 'mine').sort((a, b) => b.recordedAt.localeCompare(a.recordedAt)),
    [rows, ownerId]
  );
  const unknownRows = useMemo(() => rows.filter((p) => ownerGroupOf(p, ownerId) === 'unknown'), [rows, ownerId]);
  const otherCount = useMemo(() => rows.filter((p) => ownerGroupOf(p, ownerId) === 'other').length, [rows, ownerId]);

  /* 내 줄의 판 · 운동 맥락 — 읽기만. 못 읽어도 줄은 그대로 보인다 */
  const sessionIds = useMemo(() => [...new Set(mine.map((p) => p.sessionId))].sort(), [mine]);
  const exerciseIds = useMemo(() => [...new Set(mine.map((p) => p.exerciseId))].sort(), [mine]);
  const ctxKey = `${sessionIds.join(',')}#${exerciseIds.join(',')}`;
  const [ctx, setCtx] = useState<{ key: string; value: RecoveryContext | null; failed: boolean } | null>(null);
  useEffect(() => {
    /* 열쇠(판 · 운동 번호 글)가 바뀔 때만 다시 읽는다 — 줄의 값만 바뀐 것으로는 안 읽는다 */
    const [sIds, eIds] = ctxKey.split('#').map((x) => (x ? x.split(',') : []));
    if (!sIds.length) return;
    let alive = true;
    loadRecoveryContext({ sessionIds: sIds, exerciseIds: eIds }).then(
      (value) => alive && setCtx({ key: ctxKey, value, failed: false }),
      (err: unknown) => {
        unstable_rethrow(err);
        if (alive) setCtx({ key: ctxKey, value: null, failed: true });
      }
    );
    return () => {
      alive = false;
    };
  }, [ctxKey]);
  const context = ctx?.key === ctxKey ? ctx : null;

  const [busy, setBusy] = useState<string | null>(null);
  /* 고치는 줄과 창을 연 계정 */
  const [editing, setEditing] = useState<{ row: PendingSet; owner: string } | null>(null);
  const [confirm, setConfirm] = useState<
    { kind: 'one'; row: PendingSet; owner: string } | { kind: 'unknown' } | { kind: 'malformed' } | { kind: 'corrupt' } | null
  >(null);
  /* 계정이 바뀌면 열린 창 · 맥락을 걷는다(앞 계정의 줄 · 동작이 남지 않게) */
  const [seenOwner, setSeenOwner] = useState(ownerId);
  if (seenOwner !== ownerId) {
    setSeenOwner(ownerId);
    setEditing(null);
    setConfirm(null);
    setCtx(null);
  }
  /* 서버에 묻는 사이 계정이 바뀌었는지 — 응답이 온 뒤 견준다 */
  const liveOwner = useRef(ownerId);
  useEffect(() => {
    liveOwner.current = ownerId;
  }, [ownerId]);
  const changed = () => toast('계정이 바뀌었거나 이미 없는 세트라 아무것도 바꾸지 않았어요', 'error');

  const exerciseOf = (p: PendingSet) =>
    context?.value?.sessions[p.sessionId]?.exercises[p.exerciseId] ?? context?.value?.library[p.exerciseId] ?? null;

  /* 보내기 — 같은 보내기(drainSets)로, 이 판의 붙들지 않은 내 세트만. 결과는 줄이 남았는지 · 다시 붙들렸는지로 알린다 */
  const sendNow = async (p: PendingSet) => {
    setBusy(keyOf(p));
    let result: 'done' | 'offline' | 'busy' = 'busy';
    try {
      result = await drainSets({ owner: ownerId, sessionId: p.sessionId, send: logSet, handle: () => undefined, rethrow: unstable_rethrow });
    } finally {
      setBusy(null);
    }
    const now = outbox.snapshot().find((x) => keyOf(x) === keyOf(p));
    if (!now) {
      toast('보냈어요');
      quietRefresh(router);
    } else if (now.held) toast(heldReasonOf(now.held)?.title ?? '보내지 못했어요', 'error');
    else if (result === 'offline') toast('신호가 돌아오면 다시 보내요', 'error');
    else toast('잠시 뒤에 다시 보내요', 'error');
  };

  /* 계정을 모르는 줄 — 판 번호만 물어 이 계정의 판으로 확인된 줄에만 계정을 붙인다(세트 내용은 보내지 않는다) */
  const [checking, setChecking] = useState(false);
  const claim = async () => {
    const who = ownerId;
    setChecking(true);
    try {
      const { mine: confirmed } = await resolveSessionOwnership({ sessionIds: [...new Set(unknownRows.map((p) => p.sessionId))] });
      if (liveOwner.current !== who) return changed();
      const ok = new Set(confirmed);
      let bound = 0;
      for (const p of unknownRows) if (ok.has(p.sessionId) && outbox.bindOwner(p, who)) bound++;
      toast(bound ? `${bound}개를 이 계정의 세트로 확인했어요` : '이 계정의 운동 기록에서 찾지 못했어요', bound ? 'success' : 'error');
    } catch (err) {
      unstable_rethrow(err);
      toast('지금 확인하지 못했어요. 신호가 돌아오면 다시 눌러 주세요.', 'error');
    } finally {
      setChecking(false);
    }
  };

  const retry = (p: PendingSet) => {
    if (!outbox.release(p, ownerId)) return changed();
    void sendNow(p);
  };

  if (!client) return <p className="text-sm text-muted">이 기기에 남은 세트를 확인하고 있어요.</p>;

  const nothing = !mine.length && !unknownRows.length && !otherCount && !extras.malformed.length && !extras.corrupt.length;
  const fmtKg = (kg: number) => formatWeight(kg, unit) ?? `${kg}kg`;

  return (
    <div className="stack-page">
      {nothing ? (
        <div className="empty-well rounded-2xl p-(--block-pad) text-sm text-muted">이 기기에 못 보낸 운동 세트가 없어요.</div>
      ) : null}

      {mine.length ? (
        <section className="stack-block" aria-labelledby="recovery-mine">
          <h2 id="recovery-mine" className="text-base font-bold text-ink">
            내 세트 {mine.length}개
          </h2>
          {context?.failed ? <p className="text-footnote text-muted">운동 이름과 기록 날짜를 지금 불러오지 못했어요. 세트는 그대로 있어요.</p> : null}
          <ul className="stack-block">
            {mine.map((p) => {
              const ex = exerciseOf(p);
              const session = context?.value?.sessions[p.sessionId];
              const reason = heldReasonOf(p.held);
              const k = keyOf(p);
              const acts = recoveryActionsOf(p, ownerId);
              return (
                <li key={k} className="rounded-2xl bg-surface p-(--block-pad) shadow-[0_1px_0_0_rgba(255,255,255,0.03)_inset] desk:border desk:border-line">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <p className="text-base font-semibold text-ink">
                        {ex?.title ?? '운동'} · {p.setNo}번 세트
                      </p>
                      <p className="text-footnote text-muted">
                        {when(p.recordedAt)}에 남김
                        {session
                          ? ` · ${session.dateKey} ${STATUS_WORD[session.status] ?? '운동'}`
                          : context?.value
                            ? ' · 이 계정의 운동 기록에서 찾지 못했어요'
                            : ''}
                      </p>
                      <p className="text-sm text-ink">{describeSet(p, { contract: ex?.contract ?? null, fmtKg })}</p>
                    </div>
                  </div>
                  {reason ? (
                    <div className="mt-3 flex gap-2 rounded-xl bg-warn-bg px-3 py-2 text-footnote text-ink">
                      <CircleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
                      <div>
                        <p className="font-semibold">{reason.title}</p>
                        {reason.message ? <p className="text-muted">{reason.message}</p> : null}
                      </div>
                    </div>
                  ) : (
                    <p className="mt-3 flex items-center gap-2 text-footnote text-muted">
                      <CloudOff aria-hidden className="h-4 w-4" />
                      아직 서버로 가지 않았어요
                    </p>
                  )}
                  {acts.readOnlyReason ? <p className="mt-2 text-footnote text-muted">{acts.readOnlyReason}</p> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() => (p.held ? retry(p) : void sendNow(p))}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      <RefreshCw aria-hidden className={`h-4 w-4 ${busy === k ? 'motion-safe:animate-spin' : ''}`} />
                      {busy === k ? '보내는 중' : p.held ? '다시 보내기' : '지금 보내기'}
                    </button>
                    {acts.correct ? (
                      <button
                        type="button"
                        disabled={busy != null}
                        onClick={() => setEditing({ row: p, owner: ownerId })}
                        className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-ink/6 px-4 text-sm font-semibold text-ink disabled:opacity-50"
                      >
                        <Pencil aria-hidden className="h-4 w-4" />
                        고치기
                      </button>
                    ) : null}
                    <button
                      type="button"
                      disabled={busy != null}
                      onClick={() => setConfirm({ kind: 'one', row: p, owner: ownerId })}
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-danger-bg px-4 text-sm font-semibold text-danger disabled:opacity-50"
                    >
                      <Trash2 aria-hidden className="h-4 w-4" />
                      버리기
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {unknownRows.length ? (
        <section className="space-y-2 rounded-2xl bg-ink/4 p-(--block-pad)">
          <h2 className="text-base font-bold text-ink">어느 계정 것인지 모르는 세트 {unknownRows.length}개</h2>
          <p className="text-footnote leading-relaxed text-muted">
            예전 앱이 계정 표시 없이 남긴 세트예요. 이 계정의 기록으로 보이지 않고 보내지도 않아요. 확인하기를 누르면 세트 내용은 보내지 않고 운동 번호만
            서버에 물어, 이 계정의 운동으로 확인된 것만 내 세트로 옮겨요.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={checking}
              onClick={() => void claim()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sky px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {checking ? '확인하는 중' : '내 기록으로 확인하기'}
            </button>
            <button
              type="button"
              onClick={() => setConfirm({ kind: 'unknown' })}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-danger-bg px-4 text-sm font-semibold text-danger"
            >
              <Trash2 aria-hidden className="h-4 w-4" />이 기기에서 버리기
            </button>
          </div>
        </section>
      ) : null}

      {otherCount ? (
        <section className="space-y-1 rounded-2xl bg-ink/4 p-(--block-pad)">
          <h2 className="text-base font-bold text-ink">다른 계정의 세트 {otherCount}개</h2>
          <p className="text-footnote leading-relaxed text-muted">
            이 기기에서 다른 계정으로 남긴 세트예요. 그 계정으로 로그인하면 보내요. 여기서는 보내거나 고치거나 버릴 수 없어요.
          </p>
        </section>
      ) : null}

      {extras.malformed.length || extras.corrupt.length ? (
        <section className="space-y-2 rounded-2xl bg-ink/4 p-(--block-pad)">
          <h2 className="text-base font-bold text-ink">읽을 수 없는 기록 {extras.malformed.length + extras.corrupt.length}개</h2>
          <p className="text-footnote leading-relaxed text-muted">
            이 앱이 읽지 못하는 모양으로 저장된 기록이에요. 보내지 않고 그대로 두었어요. 앱을 업데이트하면 다시 읽을 수 있을지도 몰라요.
          </p>
          <div className="flex flex-wrap gap-2">
            {extras.malformed.length ? (
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'malformed' })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-danger-bg px-4 text-sm font-semibold text-danger"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
                읽을 수 없는 줄 {extras.malformed.length}개 버리기
              </button>
            ) : null}
            {extras.corrupt.length ? (
              <button
                type="button"
                onClick={() => setConfirm({ kind: 'corrupt' })}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-danger-bg px-4 text-sm font-semibold text-danger"
              >
                <Trash2 aria-hidden className="h-4 w-4" />
                깨진 저장 값 {extras.corrupt.length}개 버리기
              </button>
            ) : null}
          </div>
        </section>
      ) : null}

      {editing && editing.owner === ownerId ? (
        <RecoveryEditor
          open
          row={editing.row}
          title={exerciseOf(editing.row)?.title ?? '운동'}
          contract={exerciseOf(editing.row)?.contract ?? null}
          ownerId={editing.owner}
          unit={unit as WeightUnit}
          onClose={() => setEditing(null)}
          onSave={(next) => {
            const opened = editing;
            setEditing(null);
            /* 창을 연 계정 · 지금 계정 · 줄의 계정이 같을 때만 바꾼다 — 줄의 계정은 그대로 둔다 */
            if (opened.owner !== liveOwner.current || !outbox.correct(opened.row, next, opened.owner)) return changed();
            void sendNow(next);
          }}
        />
      ) : null}

      <ConfirmDialog
        open={confirm != null}
        onClose={() => setConfirm(null)}
        pending={false}
        confirmLabel="버리기"
        title={
          confirm?.kind === 'one'
            ? '이 세트를 버릴까요?'
            : confirm?.kind === 'unknown'
              ? `계정을 모르는 세트 ${unknownRows.length}개를 버릴까요?`
              : confirm?.kind === 'malformed'
                ? `읽을 수 없는 줄 ${extras.malformed.length}개를 버릴까요?`
                : `깨진 저장 값 ${extras.corrupt.length}개를 버릴까요?`
        }
        detail="이 기기에서만 지워요. 서버에 이미 들어간 기록은 그대로예요. 지운 뒤에는 되돌릴 수 없어요."
        onConfirm={() => {
          const c = confirm;
          setConfirm(null);
          if (!c) return;
          if (c.kind === 'one') {
            if (c.owner !== liveOwner.current || !outbox.discardOwned(c.row, c.owner)) return changed();
          } else if (c.kind === 'unknown') for (const p of unknownRows) outbox.discardOwned(p, null);
          else if (c.kind === 'malformed') for (const v of [...extras.malformed]) outbox.discardMalformed(extraKey(v));
          else for (const q of [...extras.corrupt]) outbox.discardCorrupt(quarantineKey(q));
          toast('버렸어요');
        }}
      />
    </div>
  );
}
