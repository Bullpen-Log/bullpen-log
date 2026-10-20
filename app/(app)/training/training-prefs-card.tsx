'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { NO_WORKOUT_KIND, WORKOUT_KINDS } from '@/lib/checkin';
import { findFocus, focusesFor, goalForUnchosen } from '@/lib/report/personalize';
import { saveTrainingPrefs } from '@/app/actions/day-cards';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { Chip, DayCard } from '@/components/day-card';
import { buzz } from '@/lib/haptics';
import { Button } from '@/components/ui';

/**
 * 트레이닝 탭 — '오늘 하고 싶은 운동이 있나요?' 카드(체크인 3판, 2026-10-13).
 *
 * 2판까지 체크인 상세에 있던 운동 종류 · 부위 질문의 새 집. 일정을 만들 수 있는 날(체크인이 있는 날)에 만들기 폼 위에 한 번 묻고,
 * 답은 DailyTrainingSetup 에 적힌다(app/actions/day-cards.ts saveTrainingPrefs). 매일 일정은 facts 로 그 답을 읽는다
 * (lib/report/gather.ts). '추천대로'는 앱에 맡기는 답이다.
 *
 * 2026-10-20(김민): 몸 부위 여러 개 고르기('하고 싶은 부위')를 빼고, 만들기 폼의 '직접 고르기'에 있던 간단한 '오늘 할 부위'(하체 · 상체 …)를
 * 여기로 옮겼다 — 직접 고르기는 없앴다. 고른 부위는 preferredParts 맨 앞에 열쇠로 담기고 자동 맞춤이 읽는다(lib/report/auto-setup.ts).
 */
export function TrainingPrefsCard({
  day,
  answer,
}: {
  day: string;
  /** 오늘 답 — 아직이면 null. workout 은 파워 · 웨이트 · 회복, 앱에 맡겼으면 null. parts 맨 앞의 부위 열쇠가 '오늘 할 부위' */
  answer: { workout: string | null; parts: string[] } | null;
}) {
  const focus = answer?.parts.map(findFocus).find((f) => f != null) ?? null;
  const summary = answer
    ? [answer.workout ?? NO_WORKOUT_KIND, ...(focus ? [focus.label] : [])].join(' · ')
    : null;
  return (
    <DayCard
      storageKey="training"
      day={day}
      title="오늘 하고 싶은 운동이 있나요?"
      hint="고르면 그쪽으로 일정을 짜요. 아픈 날은 고른 것과 상관없이 회복으로 가요."
      answer={summary}
      folded
    >
      {(close) => <PrefsForm day={day} initial={answer} initialFocus={focus?.key ?? null} onDone={close} />}
    </DayCard>
  );
}

function PrefsForm({
  day,
  initial,
  initialFocus,
  onDone,
}: {
  day: string;
  initial: { workout: string | null; parts: string[] } | null;
  initialFocus: string | null;
  onDone: () => void;
}) {
  const router = useRouter();
  const [workout, setWorkout] = useState<string | null>(initial?.workout ?? null);
  const [focus, setFocus] = useState<string | null>(initialFocus);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  /* 고른 종류의 목표에 있는 부위만(회복은 부위 없음) — 종류를 바꿔 목록에 없게 된 부위는 안 보낸다 */
  const focuses = workout === '회복' ? [] : focusesFor(goalForUnchosen(workout));
  const pickedFocus = focuses.some((f) => f.key === focus) ? focus : null;

  const save = () =>
    start(async () => {
      setError(null);
      const r = await orOffline(
        saveTrainingPrefs({ date: day, workout, parts: [], focus: pickedFocus }),
        {
          ok: false as const,
          error: OFFLINE_MESSAGE,
        }
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      buzz(20);
      router.refresh();
      onDone();
    });

  return (
    <div className="space-y-3">
      <div className="chip-grid flex flex-wrap gap-2" data-cols="4">
        <Chip pressed={workout == null} onClick={() => setWorkout(null)}>
          {NO_WORKOUT_KIND}
        </Chip>
        {WORKOUT_KINDS.map((k) => (
          <Chip
            key={k.name}
            pressed={workout === k.name}
            onClick={() => setWorkout(k.name)}
            title={k.desc}
          >
            {k.name}
          </Chip>
        ))}
      </div>
      <p className="text-xs text-muted">
        {WORKOUT_KINDS.find((k) => k.name === workout)?.desc ??
          '앱이 투구량과 몸 상태를 보고 골라요.'}
      </p>
      {focuses.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted">
            오늘 할 부위 (안 고르면 상체 · 하체를 번갈아 골라요)
          </p>
          <div className="chip-grid flex flex-wrap gap-2">
            {focuses.map((f) => (
              <Chip
                key={f.key}
                pressed={pickedFocus === f.key}
                /* 다시 누르면 비운다 — 앱이 상체 · 하체를 번갈아 정한다 */
                onClick={() => setFocus(pickedFocus === f.key ? null : f.key)}
              >
                {f.desc ? `${f.label} · ${f.desc}` : f.label}
              </Chip>
            ))}
          </div>
        </div>
      )}
      {error && <p className="text-xs text-danger">{error}</p>}
      <Button
        type="button"
        disabled={pending}
        onClick={save}
        className="w-full pad:w-auto pad:px-6 desk:min-h-10 desk:w-auto"
      >
        {pending ? '저장 중…' : '이대로 할래요'}
      </Button>
    </div>
  );
}
