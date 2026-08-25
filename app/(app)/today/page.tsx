import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import { toDateKey } from '@/lib/pitch-stats';
import { gatherFactsAndPlan } from '@/lib/report/gather';
import { selectCandidates, MIN_CANDIDATES } from '@/lib/report/prescription';
import { equipmentForToday, filterByEquipment } from '@/lib/report/equipment';
import { readDailyPlan } from '@/lib/report/daily-plan';
import { filterByLevel } from '@/lib/report/personalize';
import { DEFAULT_WORKOUT_MINUTES } from '@/lib/report/theme';
import { Card, EmptyState, PageHeading } from '@/components/ui';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import { Sparkles } from 'lucide-react';
import { TodayList, type TodayExercise } from './today-client';
import { PlanForm, TrainingSettings } from './training-settings';
import { TodayChecklist } from './today-checklist';
import { TodayRecord } from './today-record';
import { CheckinCard, type CheckinData } from '@/components/checkin-card';
import { pickCheckinParts } from '@/lib/checkin';
import { availableParts } from '@/lib/report/today-pick';

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다. */
function now() {
  return new Date();
}

export default async function TodayPage() {
  const user = await requireUser();
  const today = now();
  const todayKey = toDateKey(today);
  const savedMinutes = user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES;

  const { facts, plan, hasLogs } = await gatherFactsAndPlan(user, today);

  /*
   * "오늘 계획대로 던졌나"를 견주기 위한, 오늘 기록을 빼고 낸 계획.
   *
   * 위의 plan 은 오늘 던진 것까지 넣고 계산한 것이라 45구를 남기는 순간
   * 오늘이 '휴식'으로 바뀐다(이미 던졌으니 더 쉬라는 뜻이다). 그걸 아침에
   * 본 계획인 양 견주면 "오늘은 쉬는 게 계획이었습니다"라는 엉뚱한 말이 나온다.
   */
  const { plan: planBeforeToday } = await gatherFactsAndPlan(user, today, {
    excludeToday: true,
  });

  const [library, doneLogs, todayReport, todaySetup, todayLog, recentCheckins] =
    await Promise.all([
    /*
     * 안전 재확인과 체크인 부위 목록에 쓸 가벼운 목록.
     *
     * 예전에는 여기서 415개를 통째로 불렀다. 설명 글과 영상 경로까지 딸려와
     * 화면 한 번 여는 데 짐이 컸는데, 정작 화면에 그리는 것은 오늘 일정에
     * 담긴 열댓 개뿐이다. 거르는 데 필요한 항목만 가져오고, 그릴 것은
     * 아래에서 따로 부른다.
     */
    prisma.exerciseVideo.findMany({
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        category: true,
        bodyParts: true,
        intensity: true,
        difficulty: true,
        equipment: true,
      },
    }),
    prisma.userExerciseLog.findMany({
      where: {
        userId: user.id,
        date: new Date(`${todayKey}T00:00:00.000Z`),
        completed: true,
      },
      select: { exerciseId: true },
    }),
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
    /*
     * 오늘 쓸 수 있는 장비. 장비는 날마다 다르므로 프로필의 '가진 것'과 따로 둔다.
     * 이 줄이 없는 날은 아직 안 고른 날이라, 가진 것을 다 쓸 수 있다고 본다.
     */
    prisma.dailyTrainingSetup.findUnique({
      where: {
        userId_date: {
          userId: user.id,
          date: new Date(`${todayKey}T00:00:00.000Z`),
        },
      },
      select: { availableEquipment: true, plan: true, generatedAt: true },
    }),
    /*
     * 오늘 남긴 투구 기록. 지난 날짜는 투구 일지에서 다루므로 오늘 것만 본다.
     * 하루에 여러 번 던진 날은 첫 기록을 보여주고, 나머지는 일지에서 본다.
     */
    prisma.pitchLog.findFirst({
      where: { userId: user.id, date: new Date(`${todayKey}T00:00:00.000Z`) },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        sessionType: true,
        pitchCount: true,
        intensity: true,
        maxVelocity: true,
        avgVelocity: true,
        memo: true,
      },
    }),
    /*
     * 체크인 카드가 최근 며칠을 함께 보여준다. 시간대 차이로 서버가 보는
     * '오늘'과 사용자가 보는 '오늘'이 다를 수 있어 넉넉히 가져온다.
     */
    prisma.dailyCheckin.findMany({
      where: {
        userId: user.id,
        date: { gte: new Date(new Date(`${todayKey}T00:00:00.000Z`).getTime() - 10 * 86400000) },
      },
      orderBy: { date: 'desc' },
      take: 3,
    }),
  ]);

  /*
   * 가진 장비로 할 수 없는 운동을 먼저 뺀다.
   *
   * 안전 필터보다 앞에 두는 이유가 있다. 뒤에 두면 "안전 규칙을 통과한 20개
   * 중 18개가 장비가 없어 빠졌다" 같은 상태가 되어, 안전 필터가 얼마나
   * 걸렀는지가 실제보다 커 보인다. 할 수 없는 것은 처음부터 없는 셈 치는 편이
   * 근거를 읽기 쉽다.
   */
  /*
   * 오늘 만들어 둔 일정을 읽는다.
   *
   * 화면을 열 때 새로 만들지 않는다. 예전에는 그렇게 해서, 만든 적도 없는
   * 일정이 늘 떠 있었고 새로고침만 해도 내용이 바뀌었다. 만드는 것은
   * generateTodayPlan 이 하고, 여기서는 만들어 둔 것을 보여주기만 한다.
   */
  const savedPlan = readDailyPlan(todaySetup?.plan);

  const todayEquipment = equipmentForToday(
    user.ownedEquipment,
    todaySetup?.availableEquipment
  );
  /*
   * 오늘 일부러 좁혀 놓았는가. 안내 문구가 달라진다 —
   * 덤벨을 가진 사람에게 "덤벨이 있으면"이라고 말하면 틀린 말이다.
   */
  const narrowedToday = todayEquipment.length < user.ownedEquipment.length;
  const usable = filterByEquipment(
    library,
    todayEquipment,
    // 오늘만 좁혀 놓았으면 '가지고 있지만 오늘 끈 것' 중에서 권한다.
    narrowedToday ? user.ownedEquipment : undefined
  );
  /*
   * 경력에 맞는 난이도만 남긴다. 장비와 같은 성격이라 같은 자리에 둔다 —
   * 위험해서가 아니라 아직 할 만한 것이 아니라서 빼는 것이다.
   * (경력이 입문일 때 최대 강도를 빼는 규칙은 안전 필터 쪽에 따로 있다.)
   */
  const leveled = filterByLevel(usable.pool, user.trainingLevel);
  const picked = selectCandidates({ facts, plan, library: leveled.pool });

  /*
   * 리포트를 만든 뒤에 통증을 입력했다면 처방이 멈춘다.
   * 그때는 예전 설명을 보여주면 안 되므로 함께 감춘다.
   */
  const aiTraining =
    !todayReport?.halted && !picked.halted
      ? ((todayReport?.body as AiReportBody | null)?.training ?? null)
      : null;
  /**
   * 오늘의 투구 계획. 오늘 기록을 넣기 전 기준이다.
   *
   * 넣은 뒤로 계산하면 던진 그 순간 '휴식'으로 바뀌어, 방금 남긴 기록과
   * 나란히 놓였을 때 서로 어긋나 보인다.
   */
  const plannedToday = planBeforeToday.days[0] ?? null;

  /*
   * 화면에 그릴 운동만 자세히 가져온다.
   *
   * 오늘 일정에 담긴 것과, 오늘 완료 표시한 것. 완료한 것을 함께 부르는 이유는
   * 일정을 다시 만든 뒤에도 아까 체크한 운동이 목록에 남아야 하기 때문이다.
   * 사라지면 잘못 누른 체크를 풀 수가 없다.
   */
  const planIds = (savedPlan?.picks ?? []).map((p) => p.exerciseId);
  const doneIds = new Set(doneLogs.map((d) => d.exerciseId));
  const needed = [...new Set([...planIds, ...doneIds])];
  const detailed = needed.length
    ? await prisma.exerciseVideo.findMany({ where: { id: { in: needed } } })
    : [];
  const byId = new Map(detailed.map((ex) => [ex.id, ex]));

  /*
   * 오늘 체크인이 없으면 안전 규칙 중 컨디션·뻐근한 부위 두 가지가 빠진다.
   * 화면에서 "몸 상태에 맞췄다"고 말하면 안 되는 상태다.
   */
  const hasCheckinToday = facts.condition.today != null;

  /*
   * 오늘 만들어 둔 일정을 읽는다.
   *
   * 화면을 열 때 새로 만들지 않는다. 예전에는 그렇게 해서, 만든 적도 없는
   * 일정이 늘 떠 있었고 새로고침만 해도 내용이 바뀌었다. 만드는 것은
   * generateTodayPlan 이 하고, 여기서는 만들어 둔 것을 보여주기만 한다.
   */
  // 체크인 카드가 쓰는 모양으로 바꾼다.
  const checkinData: CheckinData[] = recentCheckins.map((c) => ({
    date: c.date.toISOString().slice(0, 10),
    ...pickCheckinParts(c),
    condition: c.condition,
    sleep: c.sleep,
    preferredParts: c.preferredParts,
  }));
  /*
   * 체크인에서 '오늘 하고 싶은 부위'로 고를 수 있는 목록.
   * 코드에 적어두지 않고 라이브러리에 실제로 있는 것만 보여준다.
   */
  const libraryParts = availableParts(library);

  /*
   * 안전만은 볼 때마다 다시 본다.
   *
   * 아침에 일정을 만든 뒤 낮에 통증을 입력할 수 있다. 그때 저장해 둔 목록을
   * 그대로 보여주면, 던지지 말라고 해놓고 데드리프트를 시키는 꼴이 된다.
   * 지금 기준으로 통과하지 못하는 운동은 뺀다 — 단, 이미 마친 것은 남긴다.
   * 한 일을 감추면 잘못 누른 체크를 풀 수가 없다.
   */
  const safeIds = new Set(picked.candidates.map((ex) => ex.id));
  const shownPicks = (savedPlan?.picks ?? []).filter(
    (p) => safeIds.has(p.exerciseId) || doneIds.has(p.exerciseId)
  );
  const droppedForSafety = (savedPlan?.picks.length ?? 0) - shownPicks.length;

  const full = shownPicks
    .map((p) => ({ slot: p.slot, ex: byId.get(p.exerciseId) }))
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
        eyebrow="Training"
        title="개인맞춤 트레이닝"
        description={
          savedPlan == null
            ? '오늘 할 운동을 만들어 드립니다. 하루에 한 번 만들고, 내일이 되면 새로 만듭니다.'
            : hasCheckinToday
              ? '오늘 몸 상태와 최근 투구량에 맞춰 고른 운동입니다. 마친 것은 눌러서 표시해주세요.'
              : '최근 투구량에 맞춰 고른 운동입니다. 마친 것은 눌러서 표시해주세요.'
        }
      />

      {/*
        트레이닝 설정.

        맨 아래에 두었더니 운동 목록을 다 지나야 나와서, 설정이 있다는 것조차
        모르고 지나치기 쉬웠다. 접혀 있을 때는 한 줄이라 맨 위에 두어도
        아래 안내를 밀어내지 않는다.

        운동 목록이 안 나오는 날(통증·기록 없음)에도 보여야 한다 —
        가입하고 처음 들어온 사람은 여기서 처음 고르게 되기 때문이다.
      */}
      {/* 무엇이 남았는지 먼저 보여준다. 이 화면은 길어서 목차 노릇도 한다. */}
      <TodayChecklist
        checkedIn={hasCheckinToday}
        recorded={todayLog != null}
        exerciseTotal={exercises.length}
        exerciseDone={exercises.filter((e) => e.done).length}
      />

      <TrainingSettings
        trainingLevel={user.trainingLevel}
        trainingGoal={user.trainingGoal}
        ownedEquipment={user.ownedEquipment}
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
            href="#checkin"
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
        오늘 컨디션 체크인.

        예전에는 홈에 있었고 여기서는 "체크인하러 가기" 링크만 걸어 두었다.
        그런데 체크인은 이 화면의 결과(무엇을 고를지)를 정하는 입력이라,
        결과 옆에 있는 편이 맞다. 하고 나면 한 줄 요약으로 접힌다.
      */}
      <CheckinCard recent={checkinData} parts={libraryParts} />

      {/*
        오늘의 투구 — 계획과 기록을 한 카드에 둔다.

        계획만 세워주고 지켰는지 아무도 안 보면 그 계획은 장식이다.
        나란히 두면 넘겼는지 바로 보인다.
      */}
      <Card className="space-y-3 py-4">
        {/*
          계획은 오늘 기록을 넣기 전 기준으로 보여준다.

          넣고 나면 '휴식'으로 바뀌는데(이미 던졌으니 더 쉬라는 뜻이다),
          바로 아래 "45구 기록" 옆에 "오늘 계획: 휴식"이 있으면 서로 어긋나
          보인다. 아침에 본 계획을 그대로 두고, 넘겼으면 아래에서 알린다.
        */}
        {plannedToday && !planBeforeToday.halted && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-xs font-medium uppercase tracking-wider text-sky">
              오늘 투구
            </span>
            <span className="text-sm font-semibold text-ink">
              {plannedToday.throwing
                ? `${plannedToday.maxPitches}구 이하 · 강도 ${plannedToday.maxIntensity} 이하`
                : '휴식'}
            </span>
            <span className="text-xs text-muted">{plannedToday.reason}</span>
          </div>
        )}
        <div
          className={
            plannedToday && !planBeforeToday.halted ? 'border-t border-line pt-3' : ''
          }
        >
          <TodayRecord
            date={todayKey}
            log={todayLog}
            plan={
              plannedToday && !planBeforeToday.halted
                ? {
                    throwing: plannedToday.throwing,
                    maxPitches: plannedToday.maxPitches,
                    maxIntensity: plannedToday.maxIntensity,
                  }
                : null
            }
          />
        </div>
      </Card>

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
            <Link href="#checkin" className="font-semibold underline">
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
              최근 투구량{hasCheckinToday ? '과 오늘 몸 상태' : ''}에 맞춰 오늘 할
              운동을 골라드립니다. 만든 일정은 오늘 하루 그대로 남고, 내일이 되면
              다시 만들 수 있습니다.
            </p>
          </div>
          <PlanForm
            owned={user.ownedEquipment}
            availableToday={todaySetup?.availableEquipment.length ? todaySetup.availableEquipment : null}
            minutes={savedMinutes}
            defaultMinutes={savedMinutes}
            generated={false}
          />
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
          <PlanForm
            owned={user.ownedEquipment}
            availableToday={todaySetup?.availableEquipment.length ? todaySetup.availableEquipment : null}
            minutes={savedPlan.requestedMinutes}
            defaultMinutes={savedMinutes}
            generated={false}
          />
        </Card>
      ) : (
        <>
          {/* 오늘의 일정 — 무엇을 위한 하루인지 먼저 말한다 */}
          <Card className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <p className="text-lg font-bold text-ink">오늘은 {savedPlan.theme.label}</p>
              <p className="text-sm text-muted">
                {exercises.length}종목 · 약 {savedPlan.estimatedMinutes}분
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
              <PlanForm
                owned={user.ownedEquipment}
                availableToday={
                  todaySetup?.availableEquipment.length
                    ? todaySetup.availableEquipment
                    : null
                }
                minutes={savedPlan.requestedMinutes}
                defaultMinutes={savedMinutes}
                generated
              />
            </div>
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
