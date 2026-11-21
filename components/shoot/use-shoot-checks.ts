'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchShootChecks, setShootStatus } from '@/app/actions/shoot';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { isRescheduled, type ShootCheckView, type ShootStatus } from '@/lib/shoot/progress';

/** 다른 사람의 체크를 받아 오는 간격 — 둘이 폰 두 대로 찍을 때 15초 안에 맞춰진다 */
const POLL_MS = 15_000;

export type UndoToast = {
  seq: number;
  text: string;
  /** 되돌릴 것 — 없으면 알림만 */
  revert: { exerciseId: string; status: ShootStatus | null; note: string | null } | null;
};

function apply(
  list: ShootCheckView[],
  exerciseId: string,
  next: ShootCheckView | null
): ShootCheckView[] {
  const rest = list.filter((c) => c.exerciseId !== exerciseId);
  return next ? [next, ...rest] : rest;
}

/**
 * 촬영 체크 상태 — 누르면 화면을 먼저 바꾸고(낙관적) 저장한다. 실패하면 되돌리고 까닭을 띄운다.
 * 15초마다 · 화면을 다시 볼 때 서버의 체크를 받아 와 다른 폰에서 찍은 것도 보인다(저장 중에는 쉰다 — 깜박이지 않게).
 * 바꿀 때마다 '되돌리기' 알림을 띄운다(잘못 누른 것을 한 번에 돌린다).
 */
export function useShootChecks(
  initial: ShootCheckView[],
  { me, poll = true }: { me: string | null; poll?: boolean }
) {
  const [checks, setChecks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<UndoToast | null>(null);
  const [saving, setSaving] = useState(0);
  const inflight = useRef(0);
  const readVersion = useRef(0);
  const latest = useRef(checks);
  useEffect(() => {
    latest.current = checks;
  }, [checks]);

  const map = useMemo(() => new Map(checks.map((c) => [c.exerciseId, c])), [checks]);

  const set = useCallback(
    async (
      exerciseId: string,
      status: ShootStatus | null,
      opts: { note?: string | null; label?: string; undoable?: boolean; rescheduledAt?: string } = {}
    ) => {
      const prev = latest.current.find((c) => c.exerciseId === exerciseId) ?? null;
      const reopened = isRescheduled(opts, prev);
      const next: ShootCheckView | null = status
        ? {
            exerciseId,
            status,
            at: prev && prev.status === status && !reopened ? prev.at : new Date().toISOString(),
            by: me,
            note:
              opts.note !== undefined
                ? opts.note?.trim() || null
                : (prev?.note ?? null),
          }
        : null;
      // Keep the current exercise and its reason editor in place until the server accepts a postponement.
      const optimistic = status !== 'later';
      /*
       * 미룸은 앞 저장이 끝난 뒤에 보낸다 — 겹치면 대답의 체크를 못 받아(inflight) 미룸이 화면에 안 붙었다. 예전엔 그냥 false 를 돌려줘
       * [미루기] · 미룸으로 되돌리기가 아무 말 없이 안 먹었다(2026-11-21 검토). 15초 넘게 안 끝나면 그대로 보낸다.
       */
      if (!optimistic) {
        for (let waited = 0; inflight.current > 0 && waited < 15_000; waited += 100) {
          await new Promise((r) => window.setTimeout(r, 100));
        }
      }
      if (optimistic) setChecks((cs) => apply(cs, exerciseId, next));
      readVersion.current++;
      setError(null);
      inflight.current++;
      setSaving((n) => n + 1);
      const res = await orOffline(setShootStatus(exerciseId, status, opts.note), {
        ok: false as const,
        error: OFFLINE_MESSAGE,
      });
      inflight.current--;
      setSaving((n) => n - 1);
      if (res.ok) {
        if (inflight.current === 0) setChecks(res.checks);
        if (opts.undoable !== false && opts.label) {
          setToast((t) => ({
            seq: (t?.seq ?? 0) + 1,
            text: opts.label!,
            /* 다시 연 운동(미룬 날 뒤에 다시 짠 것)은 화면에 대기였다 — 되돌리면 대기로(예전엔 '다시 찍기 · 옛 미룸 사유'가 됐다) */
            revert: reopened
              ? { exerciseId, status: null, note: null }
              : { exerciseId, status: prev?.status ?? null, note: prev?.note ?? null },
          }));
        }
        return true;
      }
      if (optimistic) setChecks((cs) => apply(cs, exerciseId, prev));
      /* 어느 운동이 안 됐는지 — 촬영 모드는 저장을 기다리지 않고 다음으로 넘어가서, 번호가 없으면 무엇이 빠졌는지 몰랐다 */
      const no = opts.label?.split(' ')[0];
      setError(no && /^\d+-\d+$/.test(no) ? `${no} 저장 못 했어요 · ${res.error}` : res.error);
      return false;
    },
    [me]
  );

  /* 다른 폰의 체크 받기 */
  useEffect(() => {
    if (!poll) return;
    let alive = true;
    const tick = async () => {
      if (document.hidden || inflight.current > 0) return;
      const version = ++readVersion.current;
      const res = await orOffline(fetchShootChecks(), null);
      if (alive && res?.ok && version === readVersion.current && inflight.current === 0) setChecks(res.checks);
    };
    const id = window.setInterval(tick, POLL_MS);
    /* 열자마자 한 번 — 앞 화면 캐시(30초) · 앱의 뒤로 가기로 되살린 화면은 옛 체크라 다른 사람이 찍은 것을 15초 넘게 몰랐다 */
    void tick();
    const onShow = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('online', onShow);
    return () => {
      alive = false;
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('online', onShow);
    };
  }, [poll]);

  /* 알림은 6초 뒤에 거둔다 */
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 6000);
    return () => window.clearTimeout(t);
  }, [toast]);

  const undo = useCallback(() => {
    if (!toast?.revert) return;
    const { exerciseId, status, note } = toast.revert;
    setToast(null);
    void set(exerciseId, status, { note, undoable: false });
  }, [toast, set]);

  /** 서버가 돌려준 체크로 바꾼다(영상을 붙이면 그 운동이 '찍음'이 된다) — 알림은 되돌리기 없이 */
  const adopt = useCallback((next: ShootCheckView[], label?: string) => {
    readVersion.current++;
    if (inflight.current === 0) setChecks(next);
    setError(null);
    if (label) {
      setToast((t) => ({ seq: (t?.seq ?? 0) + 1, text: label, revert: null }));
    }
  }, []);

  return {
    checks,
    undo,
    map,
    set,
    adopt,
    saving: saving > 0,
    error,
    clearError: () => setError(null),
    toast,
    closeToast: () => setToast(null),
  };
}
