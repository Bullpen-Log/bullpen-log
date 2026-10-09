'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fetchShootChecks, setShootStatus } from '@/app/actions/shoot';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import type { ShootCheckView, ShootStatus } from '@/lib/shoot/progress';

/** 다른 사람의 체크를 받아 오는 간격 — 둘이 폰 두 대로 찍을 때 15초 안에 맞춰진다 */
const POLL_MS = 15_000;

export type UndoToast = {
  seq: number;
  text: string;
  /** 되돌릴 것 — 없으면 알림만 */
  revert: { exerciseId: string; status: ShootStatus | null } | null;
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
  const latest = useRef(checks);
  useEffect(() => {
    latest.current = checks;
  }, [checks]);

  const map = useMemo(() => new Map(checks.map((c) => [c.exerciseId, c])), [checks]);

  const set = useCallback(
    async (
      exerciseId: string,
      status: ShootStatus | null,
      opts: { note?: string | null; label?: string; undoable?: boolean } = {}
    ) => {
      const prev = latest.current.find((c) => c.exerciseId === exerciseId) ?? null;
      const next: ShootCheckView | null = status
        ? {
            exerciseId,
            status,
            at: prev && prev.status === status ? prev.at : new Date().toISOString(),
            by: me,
            note:
              opts.note !== undefined
                ? opts.note?.trim() || null
                : (prev?.note ?? null),
          }
        : null;
      setChecks((cs) => apply(cs, exerciseId, next));
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
            revert: { exerciseId, status: prev?.status ?? null },
          }));
        }
        return true;
      }
      setChecks((cs) => apply(cs, exerciseId, prev));
      setError(res.error);
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
      const res = await orOffline(fetchShootChecks(), null);
      if (alive && res?.ok && inflight.current === 0) setChecks(res.checks);
    };
    const id = window.setInterval(tick, POLL_MS);
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
    const { exerciseId, status } = toast.revert;
    setToast(null);
    void set(exerciseId, status, { undoable: false });
  }, [toast, set]);

  /** 서버가 돌려준 체크로 바꾼다(영상을 붙이면 그 운동이 '찍음'이 된다) — 알림은 되돌리기 없이 */
  const adopt = useCallback((next: ShootCheckView[], label?: string) => {
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
