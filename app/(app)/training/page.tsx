import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription, usesWeight } from '@/lib/exercise-meta';
import { loadTodayCore } from '@/lib/report/today-data';
import { recentAmounts } from '@/lib/report/exercise-recent';
import { MIN_CANDIDATES } from '@/lib/report/prescription';
import { DEFAULT_WORKOUT_MINUTES } from '@/lib/report/theme';
import { Card, EmptyState, PageHeading } from '@/components/ui';
import { PlanForm } from '@/components/training-forms';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import { ExerciseChecklist, type TodayExercise } from './exercise-list';
import { AddExercise, type PickableExercise } from './add-exercise';
import { TrainingNote } from './training-note';
import { TrainingHistory } from './history';
import { TrainingSettingsButton } from './settings-button';
import { trainingSummaries } from '@/lib/report/training-history';

/**
 * 트레이닝 — 오늘 할 운동.
 *
 * 홈에서 갈라져 나온 화면이다. 예전에는 체크인·투구 기록·운동 목록이 한 화면에
 * 다 있어서, 운동 하나를 체크하려고 스크롤을 한참 내려야 했다.
 *
 * 나눈 기준은 '남기는 것'과 '하는 것'이다. 홈은 오늘 무엇을 남겼는지 보여주고
 * (체크인·투구 기록), 여기서는 오늘 무엇을 할지 보여준다. 일정 만들기만 양쪽에
 * 다 둔다 — 홈에서 하루를 시작하며 만들 수도 있고, 운동하러 들어와서 만들 수도
 * 있어야 한다.
 */

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
}

/**
 * 오늘 할 것과 지난 기록을 오가는 두 칸.
 *
 * 주소로 나눈다(?view=history). 화면 안에서 접었다 폈다 하면 오늘 것과 지난
 * 것을 둘 다 그려서 내려보내야 하는데, 지난 기록은 달력이라 짐이 따로 있다.
 * 주소로 나누면 보는 쪽만 그린다.
 */
const VIEWS = [
  { key: 'today', label: '오늘', href: '/training' },
  { key: 'history', label: '기록', href: '/training?view=history' },
] as const;

/**
 * 탭 줄.
 *
 * 오른쪽 끝에 트레이닝 설정을 붙인다. 홈에도 같은 것이 있지만, 설정을 고치고
 * 싶어지는 순간은 대개 여기다 — 운동 목록을 보다가 "이건 장비가 없어서 못
 * 하는데" 싶을 때. 그때 홈으로 건너갔다 돌아오게 하면 하던 일을 놓친다.
 *
 * 두 탭 모두에 둔다. 지난 기록을 보다가도 "다음부터는 목표를 바꿔야겠다"가
 * 나올 수 있다.
 */
function ViewTabs({
  current,
  settings,
}: {
  current: 'today' | 'history';
  settings: {
    trainingLevel: string | null;
    trainingGoal: string | null;
    ownedEquipment: string[];
  };
}) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex gap-1 rounded-xl border border-line bg-surface p-1">
        {VIEWS.map((v) => (
          <Link
            key={v.key}
            href={v.href}
            className={`rounded-lg px-6 py-2 text-center text-sm font-medium transition-colors ${
              current === v.key ? 'bg-sky text-white' : 'text-muted hover:text-ink'
            }`}
          >
            {v.label}
          </Link>
        ))}
      </div>
      <div className="ml-auto">
        <TrainingSettingsButton
          trainingLevel={settings.trainingLevel}
          trainingGoal={settings.trainingGoal}
          ownedEquipment={settings.ownedEquipment}
        />
      </div>
    </div>
  );
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  const today = now();
  const savedMinutes = user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES;

  const view = (await searchParams).view === 'history' ? 'history' : 'today';

  if (view === 'history') {
    const summaries = await trainingSummaries(user.id);
    return (
      <div className="space-y-6">
        <PageHeading
          eyebrow="Training"
          title="운동 기록"
          description="날짜를 누르면 그날 무엇을 얼마나 했는지 볼 수 있습니다."
        />
        <ViewTabs current="history" settings={user} />
        <TrainingHistory summaries={summaries} />
      </div>
    );
  }

  const core = await loadTodayCore(user, today);
  const { savedPlan, picked, doneIds, shownPicks, droppedForSafety } = core;

  /*
   * 오늘 만든 리포트가 있으면 거기에 훈련 설명이 들어 있다.
   * 여기서 AI를 새로 부르지는 않는다 — 저장된 것을 읽을 뿐이라 화면을 열
   * 때마다 돈이 나가지 않는다.
   */
  const [todayReport, trainingNote] = await Promise.all([
    prisma.aiReport.findUnique({
      where: { userId_asOf: { userId: user.id, asOf: core.midnight } },
      select: { halted: true, body: true },
    }),
    /* 오늘 운동이 어땠는지 — 하루에 하나. 목록 아래에 적는다. */
    prisma.dailyTrainingNote.findUnique({
      where: { userId_date: { userId: user.id, date: core.midnight } },
      select: { intensity: true, memo: true },
    }),
  ]);

  /*
   * 리포트를 만든 뒤에 통증을 입력했다면 처방이 멈춘다.
   * 그때는 예전 설명을 보여주면 안 되므로 함께 감춘다.
   */
  const aiTraining =
    !todayReport?.halted && !picked.halted
      ? ((todayReport?.body as AiReportBody | null)?.training ?? null)
      : null;

  /*
   * 화면에 그릴 운동만 자세히 가져온다.
   *
   * 오늘 일정에 담긴 것과, 오늘 완료 표시한 것. 완료한 것을 함께 부르는 이유는
   * 일정을 다시 만든 뒤에도 아까 체크한 운동이 목록에 남아야 하기 때문이다.
   * 사라지면 잘못 누른 체크를 풀 수가 없다.
   */
  const needed = [
    ...new Set([...shownPicks.map((p) => p.exerciseId), ...doneIds]),
  ];
  const detailed = needed.length
    ? await prisma.exerciseVideo.findMany({ where: { id: { in: needed } } })
    : [];
  const byId = new Map(detailed.map((ex) => [ex.id, ex]));

  const full = shownPicks
    .map((p) => ({
      slot: p.slot,
      manual: p.manual === true,
      unsafe: p.unsafe,
      ex: byId.get(p.exerciseId),
    }))
    .filter(
      (p): p is typeof p & { ex: NonNullable<(typeof p)['ex']> } => p.ex != null
    );

  const [thumbUrls, pastAmounts] = await Promise.all([
    createPlaybackUrls(
      full.map((p) => p.ex.thumbPath).filter((p): p is string => !!p)
    ),
    /*
     * 이 운동을 지난번에 얼마나 했는가.
     *
     * 오늘 그릴 운동만 묻는다. 400개를 다 물으면 볼 일 없는 것까지 읽게 된다.
     */
    recentAmounts(user.id, full.map((p) => p.ex.id), today),
  ]);

  const exercises: TodayExercise[] = full.map(({ slot, manual, unsafe, ex }) => ({
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
    manual,
    /*
     * 직접 넣은 운동만 여기 걸릴 수 있다. 우리가 고른 것 중 지금 기준을
     * 통과 못 하는 것은 이미 목록에서 빠진 뒤다.
     */
    unsafe,
    /*
     * 시간형(버티기)이면 횟수 대신 초를 적게 한다. 30초 플랭크에
     * "몇 회 했나요"를 물으면 답할 수가 없다.
     */
    isHold: ex.holdSeconds != null,
    // 적어 둔 값이 있으면 그대로 보여준다. 없으면 빈칸 — 미리 채우지 않는다.
    doneSets: core.doneAmounts.get(ex.id)?.setsDone?.toString() ?? '',
    doneReps: core.doneAmounts.get(ex.id)?.repsDone?.toString() ?? '',
    doneHoldSeconds:
      core.doneAmounts.get(ex.id)?.holdSecondsDone?.toString() ?? '',
    doneWeightKg: core.doneAmounts.get(ex.id)?.weightKg?.toString() ?? '',
    /* 맨몸·밴드 운동에는 무게 칸을 내지 않는다 — 적을 값이 없다. */
    usesWeight: usesWeight(ex.equipment),
    /*
     * 지난번에 얼마나 했는지. 처음 하는 운동이면 빈 목록이라 아무것도 안 나온다.
     */
    past: pastAmounts.get(ex.id) ?? [],
  }));

  /*
   * 목록에 더할 수 있는 운동.
   *
   * 안전 필터를 통과 못 한 것도 넣는다 — 무엇이 걸리는지 표시하고, 하고 말고는
   * 본인이 정한다. 설명 글과 영상 경로는 빼고 부른 목록(core.library)이라
   * 400개를 넘겨도 화면이 무겁지 않다.
   */
  const pickable: PickableExercise[] = core.library.map((ex) => ({
    id: ex.id,
    title: ex.title,
    category: ex.category,
    bodyParts: ex.bodyParts,
    intensity: ex.intensity,
    difficulty: ex.difficulty,
    equipment: ex.equipment,
    sets: ex.sets,
    reps: ex.reps,
    holdSeconds: ex.holdSeconds,
    restSeconds: ex.restSeconds,
    perSide: ex.perSide,
  }));

  /** 홈과 트레이닝 둘 다에서 만들 수 있다. 여기서 만들면 여기로 돌아온다. */
  const planForm = (generated: boolean, minutes: number) => (
    <PlanForm
      owned={user.ownedEquipment}
      availableToday={
        core.todaySetup?.availableEquipment.length
          ? core.todaySetup.availableEquipment
          : null
      }
      minutes={minutes}
      defaultMinutes={savedMinutes}
      generated={generated}
      returnTo="/training"
      clash={core.workoutClash}
    />
  );

  return (
    <div className="space-y-6">
      <PageHeading
        eyebrow="Training"
        title="트레이닝"
        description={
          savedPlan == null
            ? '오늘 할 운동을 만들어 드립니다. 하루에 한 번 만들고, 내일이 되면 새로 만듭니다.'
            : core.hasCheckinToday
              ? '오늘 몸 상태와 최근 투구량에 맞춰 고른 운동입니다. 마친 것은 눌러서 표시해주세요.'
              : '최근 투구량에 맞춰 고른 운동입니다. 마친 것은 눌러서 표시해주세요.'
        }
      />

      <ViewTabs current="today" settings={user} />

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
            <Link href="/today" className="font-semibold underline">
              홈의 오늘 체크인
            </Link>
            에서 상태를 고쳐주세요.
          </p>
        </Card>
      ) : !core.hasLogs ? (
        <EmptyState
          title="투구 기록이 있어야 운동을 고를 수 있습니다"
          description="최근 투구량과 몸 상태를 봐야 오늘 무리가 안 되는 운동을 고를 수 있습니다."
          action={
            <Link
              href="/today"
              className="rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
            >
              홈에서 투구 기록하기
            </Link>
          }
        />
      ) : savedPlan == null ? (
        /*
          아직 안 만든 날.

          예전에는 화면을 열면 일정이 이미 만들어져 있었다. 만든 적도 없는 것이
          떠 있으니 "이걸 하라는 건가" 싶고, 새로고침하면 내용이 달라지기도 했다.
          이제는 오늘 조건을 고르고 눌러야 생긴다.
        */
        <Card className="space-y-4">
          <div className="space-y-1">
            <p className="text-lg font-bold text-ink">오늘 운동 일정을 만들어보세요</p>
            <p className="text-sm leading-relaxed text-muted">
              최근 투구량{core.hasCheckinToday ? '과 오늘 몸 상태' : ''}에 맞춰 오늘 할
              운동을 골라드립니다. 만든 일정은 오늘 하루 그대로 남고, 내일이 되면
              다시 만들 수 있습니다.
            </p>
          </div>
          {planForm(false, savedMinutes)}
        </Card>
      ) : exercises.length === 0 ? (
        <Card className="space-y-4">
          <p className="text-sm font-bold text-ink">
            만들어 둔 일정에 남은 운동이 없습니다
          </p>
          <p className="text-sm leading-relaxed text-muted">
            {droppedForSafety > 0
              ? '일정을 만든 뒤 몸 상태가 바뀌어, 오늘 하기에 무리인 운동이 모두 빠졌습니다.'
              : '오늘 상태에서 안전하게 할 수 있는 운동이 라이브러리에 아직 없습니다.'}{' '}
            아래에서 다시 만들어보세요.
          </p>
          {planForm(false, savedPlan.requestedMinutes)}
        </Card>
      ) : (
        <>
          {/* 오늘의 일정 — 무엇을 위한 하루인지 먼저 말한다 */}
          <Card className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-lg font-bold text-ink">오늘은 {savedPlan.theme.label}</p>
              <p className="text-sm text-muted">
                {/*
                  시간은 만들 때 찍어 둔 값이 아니라 지금 목록에서 센다 —
                  운동을 빼도 "약 50분"이 그대로 남으면 안 된다. 홈도 같은
                  값을 쓴다(lib/report/today-data.ts).
                */}
                {exercises.length}종목 · 약 {core.shownMinutes}분
              </p>
            </div>
            <p className="text-sm leading-relaxed text-muted">{savedPlan.theme.reason}</p>
            {savedPlan.minutes < savedPlan.requestedMinutes && (
              <p className="text-xs text-warn">
                {savedPlan.requestedMinutes}분을 고르셨지만 회복 데이라{' '}
                {savedPlan.minutes}분으로 줄였습니다
              </p>
            )}

            {/*
              만든 뒤에 몸 상태가 나빠졌으면 그만큼 빠졌다고 말한다.
              말없이 줄어들면 앱이 잘못된 것으로 보인다.
            */}
            {droppedForSafety > 0 && (
              <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
                일정을 만든 뒤 몸 상태가 바뀌어, 오늘 하기에 무리인 운동{' '}
                {droppedForSafety}개를 뺐습니다.
              </p>
            )}

            {/* 조건을 바꿔 다시 만들 수 있게 — 시간과 오늘 장비를 함께 고른다 */}
            <div className="border-t border-line pt-3">
              {planForm(true, savedPlan.requestedMinutes)}
            </div>
          </Card>

          <ExerciseChecklist exercises={exercises}>
            {/*
              만들어 준 목록을 그대로 하는 사람은 없다. 빼는 것은 목록에서
              바로, 더하는 것은 여기서 찾아서.
            */}
            <AddExercise
              library={pickable}
              inPlanIds={savedPlan.picks.map((p) => p.exerciseId)}
              safeIds={picked.candidates.map((ex) => ex.id)}
              ownedEquipment={user.ownedEquipment}
            />
          </ExerciseChecklist>

          {/*
            오늘 운동이 어땠는지 — 하루에 하나.
            목록을 다 지나온 자리에 둔다. 운동을 하기 전에 "얼마나 힘들었나"를
            물으면 답할 것이 없다.
          */}
          <TrainingNote
            intensity={trainingNote?.intensity ?? null}
            memo={trainingNote?.memo ?? null}
            done={exercises.some((ex) => ex.done)}
          />

          {/* 후보가 빠듯하면 숨기지 않고 알린다. */}
          {picked.tooFew && (
            <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-[13px] leading-relaxed text-warn">
              오늘 조건을 통과한 운동이 {picked.candidates.length}개뿐입니다(권장{' '}
              {MIN_CANDIDATES}개 이상). 낮은 강도 운동이 더 채워지면 더 알맞게 고를 수
              있습니다.
            </p>
          )}

          {/*
            장비 때문에 많이 빠졌으면, 무엇 하나만 더 있으면 얼마나 늘어나는지
            알려준다. 목록이 왜 빈약한지 모른 채로 두지 않기 위해서다.

            "가진 것이 아니라서"와 "오늘 못 써서"는 다른 이야기다. 덤벨을 가진
            사람에게 "덤벨이 있으면"이라고 하면 틀린 말이 된다.
          */}
          {savedPlan.equipment.bestAddition && (
            <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] leading-relaxed text-muted">
              {savedPlan.equipment.narrowed ? '오늘 쓸 수 있는' : '가진'} 장비로 할 수
              없는 운동 {savedPlan.equipment.excludedCount}개를 뺐습니다.{' '}
              <span className="font-semibold text-ink">
                {savedPlan.equipment.bestAddition.name}
              </span>
              {savedPlan.equipment.narrowed
                ? `을 쓸 수 있는 날이면 ${savedPlan.equipment.bestAddition.unlocks}개를 더 할 수 있습니다.`
                : `이 있으면 ${savedPlan.equipment.bestAddition.unlocks}개를 더 할 수 있습니다.`}
            </p>
          )}

          {/*
            왜 이 운동들인지 — 만들 때 쓴 근거를 그대로 보여준다.

            여기서 다시 계산하지 않는다. 만든 뒤에 체크인을 하면 근거만 새로
            바뀌어서, "컨디션 3/10이라 무게 드는 운동을 뺐습니다"라고 적혀 있는데
            목록에는 데드리프트가 있는 상태가 된다.
          */}
          <details className="rounded-2xl border border-line bg-surface px-5 py-4">
            <summary className="cursor-pointer text-sm font-medium text-ink">
              왜 이 운동인가요?
            </summary>
            <ul className="mt-3 space-y-1.5">
              {[
                savedPlan.theme.reason,
                ...(savedPlan.goal ? [`목표 '${savedPlan.goal}'에 맞춰 시간을 배분`] : []),
                ...(savedPlan.levelExcludedCount > 0
                  ? [
                      `웨이트 경력 ${user.trainingLevel} → 아직 이른 운동 ${savedPlan.levelExcludedCount}개 제외`,
                    ]
                  : []),
                ...savedPlan.basis,
                ...savedPlan.notes,
              ].map((line) => (
                <li key={line} className="flex gap-2 text-[13px] leading-relaxed text-muted">
                  <span aria-hidden className="text-sky">—</span>
                  {line}
                </li>
              ))}
            </ul>
            {(savedPlan.excluded.length > 0 || savedPlan.equipment.excludedCount > 0) && (
              <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                제외:{' '}
                {[
                  ...(savedPlan.equipment.excludedCount > 0
                    ? [
                        `${savedPlan.equipment.narrowed ? '오늘 쓸 수 있는' : '가진'} 장비로 할 수 없음 ${savedPlan.equipment.excludedCount}개`,
                      ]
                    : []),
                  ...(savedPlan.levelExcludedCount > 0
                    ? [`경력 대비 이른 난이도 ${savedPlan.levelExcludedCount}개`]
                    : []),
                  ...savedPlan.excluded.map((e) => `${e.rule} ${e.count}개`),
                ].join(' · ')}
              </p>
            )}
          </details>
        </>
      )}
    </div>
  );
}
