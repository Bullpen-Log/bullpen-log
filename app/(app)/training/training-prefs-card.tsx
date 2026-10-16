'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { NO_WORKOUT_KIND, WORKOUT_KINDS } from '@/lib/checkin';
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
 */
export function TrainingPrefsCard({
  day,
  answer,
  parts,
}: {
  day: string;
  /** 오늘 답 — 아직이면 null. workout 은 파워 · 웨이트 · 회복, 앱에 맡겼으면 null */
  answer: { workout: string | null; parts: string[] } | null;
  /** 고를 수 있는 부위(라이브러리에 실제로 있는 것) */
  parts: string[];
}) {
  const summary = answer
    ? [answer.workout ?? NO_WORKOUT_KIND, ...answer.parts].join(' · ')
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
      {(close) => <PrefsForm day={day} initial={answer} parts={parts} onDone={close} />}
    </DayCard>
  );
}

function PrefsForm({
  day,
  initial,
  parts,
  onDone,
}: {
  day: string;
  initial: { workout: string | null; parts: string[] } | null;
  parts: string[];
  onDone: () => void;
}) {
  const router = useRouter();
  const [workout, setWorkout] = useState<string | null>(initial?.workout ?? null);
  const [picked, setPicked] = useState<string[]>(initial?.parts ?? []);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const togglePart = (p: string) =>
    setPicked((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]));

  const save = () =>
    start(async () => {
      setError(null);
      const r = await orOffline(
        saveTrainingPrefs({ date: day, workout, parts: picked }),
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
      {parts.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted">
            하고 싶은 부위 (없어도 돼요)
          </p>
          <div className="chip-grid flex flex-wrap gap-2">
            {parts.map((p) => (
              <Chip key={p} pressed={picked.includes(p)} onClick={() => togglePart(p)}>
                {p}
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
