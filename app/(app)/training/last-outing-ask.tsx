'use client';

import { useState, useSyncExternalStore, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Chip } from '@/components/day-card';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE } from '@/lib/action-offline';
import { YESTERDAY_OUTING_SESSION } from '@/lib/outing-line';
import { shiftDateKey } from '@/lib/pitch-stats';
import { quietRefresh } from '@/lib/quiet-refresh';

/**
 * 시즌 중 선발 카드의 '마지막 등판이 언제였어요?'(2026-10-14) — 경기 기록 · 체크인 답 · 달력 어디에도 등판 날이 없을 때만 뜬다
 * (lib/program/load.ts askLastOuting). 고르면 그날 '경기' 투구 기록 한 줄로 남겨 세션 종류 · 부하 지수 · 휴식표가 같이 맞는다.
 * 기록은 투구 기록 API 하나로(검사 · 2분 안 같은 값 막기가 거기 있다). '5일 넘게'는 고를 세션이 전신 그대로라 남기지 않고 일주일 접는다.
 */

const HIDE_KEY = 'bullpen-last-outing-ask';
const HIDE_DAYS = 7;
const AGO = [1, 2, 3, 4] as const;

const noSubscribe = () => () => {};
const readHidden = () => {
  try {
    return localStorage.getItem(HIDE_KEY);
  } catch {
    return null;
  }
};

export function LastOutingAsk({ today }: { today: string }) {
  const router = useRouter();
  const hiddenSince = useSyncExternalStore(noSubscribe, readHidden, () => null);
  const [dismissed, setDismissed] = useState(false);
  const [ago, setAgo] = useState<number | null>(null);
  const [pitches, setPitches] = useState('');
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  const hidden =
    dismissed ||
    (hiddenSince != null && /^\d{4}-\d{2}-\d{2}$/.test(hiddenSince) && shiftDateKey(hiddenSince, HIDE_DAYS) > today);
  if (hidden) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(HIDE_KEY, today);
    } catch {
      /* 못 적어도 이번 화면에서는 접힌다 */
    }
    setDismissed(true);
  };

  const save = () =>
    start(async () => {
      setError(undefined);
      const n = Number(pitches.trim());
      if (ago == null) return;
      if (!Number.isInteger(n) || n < 1) {
        setError('던진 공은 1구부터 적어 주세요.');
        return;
      }
      try {
        const res = await fetch('/api/pitch-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          /* 경기는 체감 강도 100%(facts isHardOuting 과 같은 말) */
          body: JSON.stringify({
            date: shiftDateKey(today, -ago),
            sessionType: YESTERDAY_OUTING_SESSION,
            pitchCount: n,
            effortPct: 100,
            videoPaths: [],
          }),
        });
        if (!res.ok) {
          const data: { error?: unknown } = await res.json().catch(() => ({}));
          setError(typeof data.error === 'string' ? data.error : '기록하지 못했어요. 다시 눌러 주세요.');
          return;
        }
        quietRefresh(router);
      } catch {
        setError(OFFLINE_MESSAGE);
      }
    });

  return (
    <div className="space-y-2 rounded-2xl bg-ink/4 p-3">
      <p className="text-sm font-semibold text-ink">마지막 등판이 언제였어요?</p>
      <p className="text-xs text-muted">등판 날로 오늘 세션을 골라요. 경기 기록으로 남아요.</p>
      <div className="flex flex-wrap gap-2">
        {AGO.map((n) => (
          <Chip key={n} pressed={ago === n} onClick={() => setAgo(n)}>
            {n === 1 ? '어제' : `${n}일 전`}
          </Chip>
        ))}
        <Chip pressed={false} onClick={dismiss}>
          5일 넘게 · 등판 없음
        </Chip>
      </div>
      {ago != null && (
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={pitches}
            onChange={(e) => setPitches(e.target.value)}
            placeholder="던진 공"
            aria-label="던진 공 수"
            className="min-h-11 w-28 rounded-xl border border-line bg-surface px-3 text-ink"
          />
          <span className="text-sm text-muted">구</span>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="ml-auto min-h-11 rounded-2xl bg-sky px-4 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? '남기는 중' : '기록하기'}
          </button>
        </div>
      )}
      {error && <ErrorLine>{error}</ErrorLine>}
    </div>
  );
}
