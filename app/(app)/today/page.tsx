import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import { toDateKey } from '@/lib/pitch-stats';
import {
  gatherFactsAndPlan,
  lastStrengthDates,
  recentExerciseIds,
} from '@/lib/report/gather';
import { selectCandidates, MIN_CANDIDATES } from '@/lib/report/prescription';
import { RECENT_DAYS } from '@/lib/report/today-pick';
import {
  DEFAULT_WORKOUT_MINUTES,
  WORKOUT_MINUTES_CHOICES,
  decideTheme,
  effectiveMinutes,
  pickForTheme,
} from '@/lib/report/theme';
import { Card, EmptyState, PageHeading } from '@/components/ui';
import { saveWorkoutMinutes } from '@/app/actions/profile';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import { Sparkles } from 'lucide-react';
import { TodayList, type TodayExercise } from './today-client';

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
}

/** 주소의 ?time= 값을 허용 목록 안에서만 받는다. */
function readTimeParam(raw: string | string[] | undefined): number | null {
  const value = Number(Array.isArray(raw) ? raw[0] : raw);
  return (WORKOUT_MINUTES_CHOICES as readonly number[]).includes(value)
    ? value
    : null;
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const today = now();
  const todayKey = toDateKey(today);

  // 오늘 하루만 시간을 바꾸고 싶을 때 ?time=30 처럼 주소로 조절한다.
  const timeOverride = readTimeParam((await searchParams).time);
  const savedMinutes = user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES;
  const baseMinutes = timeOverride ?? savedMinutes;

  const { facts, plan, hasLogs } = await gatherFactsAndPlan(user, today);

  const [library, doneLogs, recentIds, strengthDates, todayReport] = await Promise.all([
    prisma.exerciseVideo.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.userExerciseLog.findMany({
      where: {
        userId: user.id,
        date: new Date(`${todayKey}T00:00:00.000Z`),
        completed: true,
      },
      select: { exerciseId: true },
    }),
    // 최근에 한 운동은 뒤로 미뤄, 매일 같은 것만 나오지 않게 한다.
    recentExerciseIds(user.id, today),
    // 하체·상체를 번갈아 돌리기 위한 최근 완료 기록.
    lastStrengthDates(user.id, today),
    /*
     * 오늘 만든 리포트가 있으면 거기에 훈련 설명이 들어 있다.
     * 여기서 AI를 새로 부르지는 않는다 — 저장된 것을 읽을 뿐이라
     * 화면을 열 때마다 돈이 나가지 않는다.
     */
    prisma.aiReport.findUnique({
      where: {
        userId_asOf: {
          userId: user.id,
          asOf: new Date(`${todayKey}T00:00:00.000Z`),
        },
      },
      select: { halted: true, body: true },
    }),
  ]);

  const picked = selectCandidates({ facts, plan, library });

  /*
   * 리포트를 만든 뒤에 통증을 입력했다면 처방이 멈춘다.
   * 그때는 예전 설명을 보여주면 안 되므로 함께 감춘다.
   */
  const aiTraining =
    !todayReport?.halted && !picked.halted
      ? ((todayReport?.body as AiReportBody | null)?.training ?? null)
      : null;
  const doneIds = new Set(doneLogs.map((d) => d.exerciseId));
  const todayPlan = plan.days[0] ?? null;

  // 후보에는 화면에 필요한 필드(설명·썸네일)가 없으므로 원본에서 다시 찾는다.
  const byId = new Map(library.map((ex) => [ex.id, ex]));

  /*
   * 오늘 체크인이 없으면 안전 규칙 중 컨디션·뻐근한 부위 두 가지가 빠진다.
   * 화면에서 "몸 상태에 맞췄다"고 말하면 안 되는 상태다.
   */
  const hasCheckinToday = facts.condition.today != null;

  /*
   * 오늘의 테마를 정하고, 시간에 맞춰 구성한다.
   * 테마는 안전 필터와 무관하다 — 위험한 운동은 이미 후보에서 빠져 있다.
   */
  const theme = decideTheme({
    facts,
    plan,
    lastLowerKey: strengthDates.lower,
    lastUpperKey: strengthDates.upper,
  });
  const minutes = effectiveMinutes(theme.key, baseMinutes);

  // 오늘 고른 부위가 있으면 본운동 안에서 그쪽을 앞으로 당긴다.
  const preferredParts = facts.condition.today?.preferredParts ?? [];
  const themed = pickForTheme({
    candidates: picked.candidates,
    theme: theme.key,
    minutes,
    doneIds,
    recentIds,
    preferredParts,
  });

  const full = themed.picks
    .map((p) => ({ slot: p.slot, ex: byId.get(p.exercise.id) }))
    .filter((p): p is { slot: (typeof p)['slot']; ex: NonNullable<(typeof p)['ex']> } =>
      p.ex != null
    );

  const thumbUrls = await createPlaybackUrls(
    full.map((p) => p.ex.thumbPath).filter((p): p is string => !!p)
  );

  const exercises: TodayExercise[] = full.map(({ slot, ex }) => ({
    id: ex.id,
    title: ex.title,
    category: ex.category,
    description: ex.description,
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    // 아직 세트·횟수를 안 채운 운동은 null 이라 화면에 아무것도 안 나온다.
    prescription: formatPrescription(ex),
    /*
     * 아직 촬영하지 않은 운동은 유튜브 참고 영상의 미리보기를 그대로 쓴다.
     * 우리 저장소에 담아 둔 것이 없어 발급받을 주소도 없다.
     */
    thumbUrl: ex.referenceVideoId
      ? referenceThumbUrl(ex.referenceVideoId)
      : ex.thumbPath
        ? (thumbUrls[ex.thumbPath] ?? null)
        : null,
    isReference: ex.source === 'REFERENCE',
    done: doneIds.has(ex.id),
    slot,
  }));

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="AI Training"
        title="AI 개인맞춤 트레이닝"
        description={
          hasCheckinToday
            ? '오늘 몸 상태와 최근 투구량에 맞춰 고른 운동입니다. 마친 것은 눌러서 표시해주세요.'
            : '최근 투구량에 맞춰 고른 운동입니다. 마친 것은 눌러서 표시해주세요.'
        }
      />

      {/*
        최근 통증이 있었지만 오늘은 괜찮다고 한 경우.
        운동이 왜 가벼운 것만 나오는지 모르면 고장으로 보인다.
      */}
      {plan.needsPainCheck && !picked.halted && (
        <Card className="space-y-2 border-warn-line bg-warn-bg py-4">
          <p className="text-sm font-bold text-warn">지금 통증이 있으신가요?</p>
          <p className="text-sm leading-relaxed text-warn">
            최근 투구 일지 메모에{' '}
            <strong>{facts.condition.painWordsInMemo.join(', ')}</strong> 같은 표현이
            있었습니다. 실제로 통증이 있는지 알 수 없어, 확인될 때까지 투구는 휴식으로
            두고 운동은 회복·가동성 수준만 골랐습니다.
          </p>
          <p className="text-sm leading-relaxed text-warn">
            통증이 있다면 던지지 말고 전문의와 상담하세요. 통증이 아니라면 오늘 체크인을
            남겨주시면 바로 평소 계획으로 돌아갑니다.
          </p>
          <Link
            href="/dashboard#checkin"
            className="inline-block rounded-lg border border-warn-line px-3 py-1.5 text-xs font-semibold text-warn transition-colors hover:bg-warn-line/20"
          >
            오늘 체크인하기
          </Link>
        </Card>
      )}

      {/*
        최근 통증이 있었지만 오늘은 괜찮다고 한 경우.
        운동이 왜 가벼운 것만 나오는지 모르면 고장으로 보인다.
      */}
      {plan.recovering && !plan.needsPainCheck && !picked.halted && (
        <Card className="space-y-1 border-warn-line bg-warn-bg py-4">
          <p className="text-sm font-bold text-warn">회복 수준으로 낮춰 배정했습니다</p>
          <p className="text-sm leading-relaxed text-warn">
            최근 체크인에 통증 기록이 있어, 오늘은 무게를 다루는 운동을 빼고 회복·가동성
            운동만 골랐습니다. 통증이 다시 느껴지면 오늘 체크인에 그대로 남겨주세요.
          </p>
        </Card>
      )}

      {/*
        체크인을 안 한 날은 몸 상태를 못 본 채 고른 것이므로 그대로 알린다.
        위의 두 안내(통증 확인·처방 중단)가 이미 체크인을 청하고 있으면 겹치지 않게 뺀다.
      */}
      {!hasCheckinToday && !plan.needsPainCheck && !picked.halted && (
        <Card className="flex flex-wrap items-center gap-x-3 gap-y-2 border-warn-line bg-warn-bg py-4">
          <p className="text-sm leading-relaxed text-warn">
            오늘 체크인을 하지 않으셔서 <strong>몸 상태는 반영되지 않았습니다.</strong>{' '}
            투구량만 보고 고른 운동입니다.
          </p>
          <Link
            href="/dashboard#checkin"
            className="rounded-lg border border-warn-line px-3 py-1.5 text-xs font-semibold text-warn transition-colors hover:bg-warn-line/20"
          >
            체크인하러 가기
          </Link>
        </Card>
      )}

      {/* 오늘의 투구 계획 — 운동과 같은 근거에서 나온다 */}
      {todayPlan && !plan.halted && (
        <Card className="flex flex-wrap items-center gap-x-3 gap-y-1 py-4">
          <span className="text-xs font-medium uppercase tracking-wider text-sky">
            오늘 투구
          </span>
          <span className="text-sm font-semibold text-ink">
            {todayPlan.throwing
              ? `${todayPlan.maxPitches}구 이하 · 강도 ${todayPlan.maxIntensity} 이하`
              : '휴식'}
          </span>
          <span className="text-xs text-muted">{todayPlan.reason}</span>
        </Card>
      )}

      {/* 왜 오늘 이런 구성인지 — 고르는 건 코드, 설명은 AI가 한다 */}
      {aiTraining && (
        <Card className="space-y-2 border-sky-soft/60 bg-sky-tint">
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-strong">
            <Sparkles className="h-3.5 w-3.5" />
            오늘의 훈련
          </p>
          <p className="text-base font-bold leading-snug text-ink">
            {aiTraining.focus}
          </p>
          <p className="text-sm leading-relaxed text-ink/80">{aiTraining.why}</p>
        </Card>
      )}

      {picked.halted ? (
        <Card className="space-y-2 border-warn-line bg-warn-bg">
          <p className="text-sm font-bold text-warn">
            오늘은 운동을 처방하지 않았습니다
          </p>
          <p className="text-sm leading-relaxed text-warn">
            {picked.haltReason ??
              '통증 신호가 있어 훈련 조언을 만들지 않았습니다.'}{' '}
            통증이 있는 날은 쉬는 것이 가장 좋은 훈련입니다. 통증이 아니라면{' '}
            <Link href="/dashboard" className="font-semibold underline">
              오늘 체크인
            </Link>
            에서 상태를 고쳐주세요.
          </p>
        </Card>
      ) : !hasLogs ? (
        <EmptyState
          title="투구 기록이 있어야 운동을 고를 수 있습니다"
          description="최근 투구량과 몸 상태를 봐야 오늘 무리가 안 되는 운동을 고를 수 있습니다."
          action={
            <Link
              href="/pitch-log"
              className="rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
            >
              투구 기록하러 가기
            </Link>
          }
        />
      ) : exercises.length === 0 ? (
        <EmptyState
          title="지금 조건에 맞는 운동이 없습니다"
          description="오늘 상태에서 안전하게 할 수 있는 운동이 라이브러리에 아직 없습니다. 낮은 강도의 회복·가동성 운동이 채워지면 이곳에 표시됩니다."
        />
      ) : (
        <>
          {/* 오늘의 테마 — 무엇을 위한 하루인지 먼저 말한다 */}
          <Card className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-lg font-bold text-ink">오늘은 {theme.label}</p>
              <p className="text-sm text-muted">
                {exercises.length}종목 · 약 {themed.estimatedMinutes}분
              </p>
            </div>
            <p className="text-sm leading-relaxed text-muted">{theme.reason}</p>

            {/* 시간 고르기 — 누르면 오늘에 적용되고, 저장 버튼으로 기본값이 된다 */}
            <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
              <span className="text-xs text-muted">운동 시간</span>
              {WORKOUT_MINUTES_CHOICES.map((m) => (
                <Link
                  key={m}
                  href={`/today?time=${m}`}
                  className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    m === baseMinutes
                      ? 'border-sky bg-sky-tint text-sky-strong'
                      : 'border-line text-muted hover:border-sky-soft'
                  }`}
                >
                  {m}분{m === savedMinutes ? ' (기본)' : ''}
                </Link>
              ))}
              {minutes < baseMinutes && (
                <span className="text-xs text-warn">
                  회복 데이라 {minutes}분으로 줄였습니다
                </span>
              )}
            </div>

            {/* 방금 고른 시간이 기본값과 다르면, 여기서 바로 굳힐 수 있게 한다 */}
            {timeOverride != null && timeOverride !== savedMinutes && (
              <form action={saveWorkoutMinutes} className="flex items-center gap-2">
                <input type="hidden" name="minutes" value={timeOverride} />
                <button
                  type="submit"
                  className="rounded-lg bg-sky px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-sky-strong"
                >
                  {timeOverride}분을 기본값으로 저장
                </button>
                <span className="text-xs text-muted">
                  저장하지 않으면 오늘만 {timeOverride}분으로 구성됩니다
                </span>
              </form>
            )}
          </Card>

          <TodayList exercises={exercises} />

          {/* 후보가 빠듯하면 숨기지 않고 알린다. */}
          {picked.tooFew && (
            <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-[13px] leading-relaxed text-warn">
              오늘 조건을 통과한 운동이 {picked.candidates.length}개뿐입니다(권장{' '}
              {MIN_CANDIDATES}개 이상). 낮은 강도 운동이 더 채워지면 더 알맞게 고를 수
              있습니다.
            </p>
          )}

          {/* 왜 이 운동들인지 — 숫자와 규칙을 그대로 보여준다 */}
          <details className="rounded-2xl border border-line bg-surface px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              왜 이 운동인가요?
            </summary>
            <ul className="mt-3 space-y-1.5">
              <li className="flex gap-2 text-[13px] leading-relaxed text-muted">
                <span aria-hidden className="text-sky">—</span>
                {theme.reason}
              </li>
              {picked.basis.map((b) => (
                <li key={b} className="flex gap-2 text-[13px] leading-relaxed text-muted">
                  <span aria-hidden className="text-sky">—</span>
                  {b}
                </li>
              ))}
              {themed.notes.map((n) => (
                <li key={n} className="flex gap-2 text-[13px] leading-relaxed text-muted">
                  <span aria-hidden className="text-sky">—</span>
                  {n}
                </li>
              ))}
              {recentIds.size > 0 && (
                <li className="flex gap-2 text-[13px] leading-relaxed text-muted">
                  <span aria-hidden className="text-sky">—</span>
                  최근 {RECENT_DAYS}일 안에 한 운동 {recentIds.size}개는 뒤로 미룸
                </li>
              )}
            </ul>
            {picked.excluded.length > 0 && (
              <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                제외:{' '}
                {picked.excluded.map((e) => `${e.rule} ${e.count}개`).join(' · ')}
              </p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
