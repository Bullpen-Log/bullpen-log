'use client';

import { useState, useTransition } from 'react';
import { Check } from 'lucide-react';
import { rateWorkoutEffort } from '@/app/actions/workout';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { haptic } from '@/lib/haptics';
import { EFFORT_LEVELS, effortOf, type EffortKey } from '@/lib/workout/effort';

/**
 * 운동 끝 힘듦 한 번 — 칩 넷(가벼움 · 보통 · 힘듦 · 아주 힘듦) 가운데 하나를 누르면 바로 저장되고 그대로 고정된다
 * (트레이닝 추천 2판 P2, 2026-10-12). 저장 단추가 따로 없다 — 한 번 누르는 것이 이 카드의 전부다.
 *
 * 마치기 창(run/finish-sheet.tsx)의 1~10 열 칸은 선택이 됐다. 거기서 안 골랐을 때만 이 카드가 뜬다(done/page.tsx 가 그날
 * DailyTrainingNote 유무를 읽어 넘긴다). '건너뛰기'는 서버에 안 가고 카드만 접는다 — 트레이닝 탭에서 나중에 적을 수 있다.
 *
 * 칩은 role="radio" 라 누름 떨림이 저절로 난다(components/haptic-feedback.tsx — 이미 골라진 것 · 꺼진 것은 안 떤다).
 * 신호가 끊기면 한 줄로 알리고 칩을 다시 누를 수 있게 둔다(lib/action-offline.ts). 서버가 '그새 적은 줄이 있다'고 값을
 * 돌려주면 그 값의 칩을 고정한다.
 */
export function EffortCard({ sessionId }: { sessionId: string }) {
  const [picked, setPicked] = useState<EffortKey | null>(null);
  const [saved, setSaved] = useState<EffortKey | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (skipped) return null;

  const pick = (key: EffortKey) => {
    if (saved || pending) return;
    setError(null);
    setPicked(key);
    startTransition(async () => {
      const res = await orOffline(rateWorkoutEffort({ sessionId, effort: key }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in res) {
        setError(res.error);
        setPicked(null);
        return;
      }
      setSaved(effortOf(res.intensity));
      haptic('success');
    });
  };

  const current = saved ?? picked;
  const level = saved ? EFFORT_LEVELS.find((l) => l.key === saved) : null;

  return (
    <div className="rise-in mx-auto mb-3 max-w-md rounded-2xl bg-surface px-4 py-3 [--rise-delay:1050ms]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-subhead font-semibold text-ink">
          {saved ? '오늘 힘듦을 남겼어요' : '오늘 얼마나 힘들었나요?'}
        </p>
        {saved ? (
          <span className="inline-flex items-center gap-1 text-xs font-semibold text-sky">
            <Check className="h-3.5 w-3.5" strokeWidth={3} />
            {level?.intensity}/10
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setSkipped(true)}
            disabled={pending}
            className="-mr-2 min-h-9 shrink-0 px-2 text-xs font-medium text-muted transition-colors hover:text-ink disabled:opacity-40"
          >
            건너뛰기
          </button>
        )}
      </div>
      <p className="mt-0.5 text-xs text-muted">
        {saved
          ? '트레이닝 탭에서 고칠 수 있어요.'
          : '한 번만 눌러 주세요. 운동 전체를 합친 느낌이에요.'}
      </p>

      <div
        role="radiogroup"
        aria-label="오늘 힘듦"
        className="mt-3 grid grid-cols-4 gap-1.5"
      >
        {EFFORT_LEVELS.map((l) => {
          const on = current === l.key;
          return (
            <button
              key={l.key}
              type="button"
              role="radio"
              aria-checked={on}
              title={l.hint}
              disabled={saved != null || pending}
              onClick={() => pick(l.key)}
              className={`h-11 rounded-full px-1 text-sm font-semibold whitespace-nowrap transition ${
                on
                  ? 'bg-sky text-white motion-safe:scale-105'
                  : saved
                    ? 'bg-ink/6 text-muted opacity-60'
                    : 'bg-ink/6 text-ink active:bg-ink/12'
              }`}
            >
              {l.label}
            </button>
          );
        })}
      </div>

      {error && (
        <p role="alert" className="mt-2 text-center text-xs text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
