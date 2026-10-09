import { favoriteExerciseIds } from '@/lib/favorites';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import { goalPrescription } from '@/lib/report/goal-prescription';
import { loadTodayCore } from '@/lib/report/today-data';
import { StartWorkout } from './start-workout';
import { DoneCard, DoneFold, type DoneLine } from './done-card';
import { AutoNote } from './auto-note';
import { readFrozenPlan } from '@/lib/workout/session-plan';
import { summarizeSets, totalVolumeKg } from '@/lib/workout/summarize';
import { recentAmounts } from '@/lib/report/exercise-recent';
import { MIN_CANDIDATES } from '@/lib/report/prescription';
import { DEFAULT_WORKOUT_MINUTES, SLOT_ORDER } from '@/lib/report/theme';
import { orderSession } from '@/lib/report/exercise-order';
import { BackLink, Card, PageHeading } from '@/components/ui';
import { PlanForm } from '@/components/training-forms';
import { ExerciseChecklist, type TodayExercise } from './exercise-list';
import { AddExercise, type PickableExercise } from './add-exercise';
import { TrainingNote } from './training-note';
import { josa } from '@/lib/korean';
import { TrainingSettingsButton } from './settings-button';
import { RememberTrainingApp } from './remember-app';
import { TrainingHome } from './training-home';
import { ArmcareTabs, type ArmcareTab } from './armcare-tabs';
import { ArmcareSection } from './armcare-section';
import { MechanicsTabs, type MechanicsTab } from './mechanics-tabs';
import { MechanicsSection } from './mechanics-section';
import { BodyPartsProvider } from '@/components/body-parts';
import { TrainingCheckin } from './training-checkin';
import { OpenCheckinButton } from '@/components/notice-bell';
import { availableParts } from '@/lib/report/today-pick';
import { exercisesByIds } from '@/lib/library-cache';
import {
  PROGRAMS_ENABLED,
  parseProgram,
  profileBlock,
  programChoiceList,
} from '@/lib/program/program';
import {
  activeProgram,
  buildProgramDay,
  hasFinishedBasics,
  programCardProps,
  programResult,
  recentlyDoneProgram,
} from '@/lib/program/load';
import { ageFromBirthDate } from '@/lib/profile';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { isSeasonPhase } from '@/lib/nutrition/diet-prefs';
import { ProgramCard } from './program-card';
import { ProgramDone } from './program-done';
import { ProgramStart, type ProgramStartProps } from './program-start';
import {
  TRAINING_HOME_HREF,
  TRAINING_PART_COOKIE,
  TRAINING_PART_HREF,
  readTrainingPart,
  type TrainingPart,
} from '@/lib/training-part';

/**
 * 트레이닝 — 오늘 할 운동과 암케어, 두 칸.
 *
 * 2026-09-26 [오늘 | 기록 | 암케어]에서 [트레이닝 | 암케어]로 바꿨다. 둘은 서로
 * 독립이다 — 암케어는 운동 일정에 붙여 하는 것이 아니라 언제든 따로 한다(사용자분과
 * 정함). 그래서 트레이닝 칸에 암케어로 이끄는 카드를 두지 않고, 아래 탭으로 들어오면
 * 마지막으로 보던 칸을 연다(lib/training-part.ts). 지난 기록은 홈 캘린더에서 본다.
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
 * 앱의 머리 — '‹ 트레이닝'(트레이닝 홈으로) · 큰 제목 · 오른쪽 트레이닝 설정(2026-10-04).
 *
 * 예전에는 [트레이닝 | 암케어 | 메커니즘] 고르개가 여기 있어 셋이 한 화면의 탭처럼 보였다. 이제 셋은 트레이닝 홈
 * (training-home.tsx)의 앱 카드에서 들어가는 따로 된 앱이고, 머리에는 돌아가는 길만 둔다. 보고 있는 앱을 쿠키에
 * 적어 홈이 그 카드를 맨 위에 둔다(remember-app.tsx).
 *
 * 트레이닝 설정은 운동 · 암케어에 둔다 — 운동 목록을 보다가 "이건 장비가 없어서 못 하는데" 싶을 때 여기서 고친다.
 * 메커니즘은 장비 · 목표 설정을 읽지 않아 두지 않는다.
 */
function AppHead({
  app,
  title,
  settings,
  returnTo,
}: {
  app: TrainingPart;
  title: string;
  settings?: {
    trainingLevel: string | null;
    ownedEquipment: string[];
  };
  /** 설정을 저장한 뒤 돌아올 곳 — 지금 보는 칸 */
  returnTo: string;
}) {
  return (
    <div className="space-y-1">
      <RememberTrainingApp part={app} />
      <div className="flex min-h-11 items-center gap-3">
        <BackLink href={TRAINING_HOME_HREF}>트레이닝</BackLink>
        {settings && (
          <div className="ml-auto">
            <TrainingSettingsButton
              trainingLevel={settings.trainingLevel}
              ownedEquipment={settings.ownedEquipment}
              returnTo={returnTo}
            />
          </div>
        )}
      </div>
      <PageHeading eyebrow="Training" title={title} />
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

  const params = await searchParams;
  /* 예전 [기록] 칸의 주소 — 지난 기록은 이제 홈 캘린더에 있다 */
  if (params.view === 'history') redirect('/today');
  /*
   * 트레이닝 홈 — 아래 탭 · 메뉴(?view=home, 예전 ?view=last). 앱 카드 셋, 마지막으로 쓴 앱이 맨 위(training-home.tsx).
   * 그냥 /training 은 늘 운동 앱이다(lib/training-part.ts).
   */
  if (params.view === 'home' || params.view === 'last') {
    return (
      <TrainingHome
        user={user}
        today={today}
        lastApp={readTrainingPart((await cookies()).get(TRAINING_PART_COOKIE)?.value)}
      />
    );
  }
  const view: TrainingPart =
    readTrainingPart(typeof params.view === 'string' ? params.view : null) ?? 'today';

  /*
   * 암케어 — 운동 일정과 따로, 그날 몸 상태에 맞춘 루틴과 부위별 보강.
   * 운동 일정 자료(loadTodayCore)는 읽지 않는다. 필요한 것은 따로 모은다
   * (lib/armcare/today.ts).
   */
  if (view === 'armcare') {
    /* 없앤 '훈련 방식' 칸(?tab=methods)으로 들어오면 루틴 칸을 연다 */
    const tab: ArmcareTab = params.tab === 'guide' ? 'guide' : 'today';
    return (
      <div className="stack-page">
        <AppHead
          app="armcare"
          title="암케어"
          settings={user}
          returnTo={
            tab === 'today'
              ? '/training?view=armcare'
              : `/training?view=armcare&tab=${tab}`
          }
        />
        <ArmcareTabs current={tab} />
        <ArmcareSection
          user={user}
          tab={tab}
          today={today}
          focusMuscle={typeof params.muscle === 'string' ? params.muscle : null}
          openRehab={params.rehab === 'start'}
        />
      </div>
    );
  }

  /*
   * 메커니즘 — 투구 드릴로 투구 동작을 키운다(2026-10-04). 암케어처럼 운동 일정과 따로다(사용자분).
   * [프로그램 | 요소별 드릴], 요소 카드는 ?el= 로 열어 둘 수 있다.
   */
  if (view === 'mechanics') {
    const tab: MechanicsTab = params.tab === 'elements' ? 'elements' : 'program';
    return (
      <div className="stack-page">
        <AppHead
          app="mechanics"
          title="메커니즘"
          returnTo={
            tab === 'program'
              ? '/training?view=mechanics'
              : '/training?view=mechanics&tab=elements'
          }
        />
        <MechanicsTabs current={tab} />
        <MechanicsSection
          user={user}
          tab={tab}
          focus={typeof params.el === 'string' ? params.el : null}
        />
      </div>
    );
  }

  const core = await loadTodayCore(user, today);
  const { savedPlan, picked, doneIds, shownPicks, droppedForSafety } = core;

  const [trainingNote, favExercises, todaySession] = await Promise.all([
    /* 오늘 운동이 어땠는지 — 하루에 하나. 목록 아래에 적는다. */
    prisma.dailyTrainingNote.findUnique({
      where: { userId_date: { userId: user.id, date: core.midnight } },
      select: { intensity: true, memo: true },
    }),
    /* 별을 달아 둔 것 — 목록에 표시하고, 고르는 창에서 위로 올린다 */
    favoriteExerciseIds(user.id),
    /*
     * 오늘의 운동 판. 진행 중이면 단추가 '이어서 하기'가 되고, 마쳤으면 단추
     * 자리에 완료 카드가 선다.
     *
     * 예전에는 진행 중인 판만 찾았다. 그래서 마친 판은 없는 것과 같아, 운동을
     * 마치고 돌아와도 처음처럼 [운동 시작]이 떠 있었다.
     */
    prisma.trainingSession.findUnique({
      where: { userId_date: { userId: user.id, date: core.midnight } },
      select: { id: true, status: true, plan: true, activeSeconds: true },
    }),
  ]);
  /*
   * 근력 · 파워 프로그램(lib/program) — 진행 중이면 맨 위 카드, 끝난 지 사흘 안이면 결과 카드, 아니면 입구 한 줄(설계 §13-1).
   * 카드의 목록 · 무게는 운동 시작(app/actions/program.ts)이 얼리는 것과 같은 함수에서 나온다.
   */
  const programRow = PROGRAMS_ENABLED ? await activeProgram(user.id) : null;
  const [programView, doneProgram, nutritionSeason] = await Promise.all([
    programRow ? buildProgramDay(core, programRow, user) : Promise.resolve(null),
    PROGRAMS_ENABLED && !programRow
      ? recentlyDoneProgram(user.id, today)
      : Promise.resolve(null),
    PROGRAMS_ENABLED && (!programRow || !parseProgram(programRow.programKey))
      ? prisma.nutritionProfile.findUnique({
          where: { userId: user.id },
          select: { seasonPhase: true },
        })
      : Promise.resolve(null),
  ]);
  const programCard = programView ? programCardProps(programView, core.library) : null;
  const doneResult = doneProgram
    ? await programResult(doneProgram, core.library)
    : null;
  const programAge = user.birthDate ? ageFromBirthDate(user.birthDate, today) : null;
  /* 성인 입문만 — 기본기 4주를 마쳤으면 성인 프로그램이 열린다(program.ts 의 profileBlock) */
  const basicsDone =
    PROGRAMS_ENABLED && !programView && user.trainingLevel === '입문'
      ? await hasFinishedBasics(user.id)
      : false;
  const knownProfile = {
    age: programAge,
    trainingLevel: user.trainingLevel,
    basicsDone,
  };
  /* 진행 중인 줄의 키를 모르면(지운 프로그램) 카드가 없으니 고르기를 다시 보인다 — 시작하면 그 줄은 바뀜으로 닫힌다 */
  const programStart: ProgramStartProps | null =
    PROGRAMS_ENABLED && !programView
      ? {
          programs: programChoiceList(),
          needBirth: user.birthDate == null,
          level: user.trainingLevel,
          levels: TRAINING_LEVELS.map((l) => ({ name: l.name, desc: l.desc })),
          owned: user.ownedEquipment,
          equipment: [...SELECTABLE_EQUIPMENT],
          season:
            nutritionSeason?.seasonPhase && isSeasonPhase(nutritionSeason.seasonPhase)
              ? nutritionSeason.seasonPhase
              : null,
          /* 고르기 화면의 막힘 — 시작 자격(app/actions/program.ts)과 같은 함수 */
          blocked: profileBlock({ audience: 'adult', ...knownProfile }),
          basicsBlocked: profileBlock({ audience: 'basics', ...knownProfile }),
          basicsDone,
        }
      : null;

  const resume = todaySession?.status === 'ACTIVE';
  const finished = todaySession?.status === 'FINISHED';

  /*
   * 화면에 그릴 운동만 자세히 가져온다.
   *
   * 오늘 일정에 담긴 것과, 오늘 완료 표시한 것. 완료한 것을 함께 부르는 이유는
   * 일정을 다시 만든 뒤에도 아까 체크한 운동이 목록에 남아야 하기 때문이다.
   * 사라지면 잘못 누른 체크를 풀 수가 없다.
   */
  const needed = [...new Set([...shownPicks.map((p) => p.exerciseId), ...doneIds])];
  const detailed = needed.length ? await exercisesByIds(needed) : [];
  const byId = new Map(detailed.map((ex) => [ex.id, ex]));

  const full = shownPicks
    .map((p) => ({
      slot: p.slot,
      manual: p.manual === true,
      unsafe: p.unsafe,
      ex: byId.get(p.exerciseId),
    }))
    .filter((p): p is typeof p & { ex: NonNullable<(typeof p)['ex']> } => p.ex != null);

  const [thumbUrls, pastAmounts, doneSets] = await Promise.all([
    createPlaybackUrls(full.map((p) => p.ex.thumbPath).filter((p): p is string => !!p)),
    /*
     * 이 운동을 지난번에 얼마나 했는가.
     *
     * 오늘 그릴 운동만 묻는다. 400개를 다 물으면 볼 일 없는 것까지 읽게 된다.
     */
    recentAmounts(
      user.id,
      full.map((p) => p.ex.id),
      today
    ),
    /* 마친 날의 완료 카드에 쓸 세트 — 마치지 않은 날은 읽지 않는다 */
    finished && todaySession
      ? prisma.userExerciseSet.findMany({
          where: { sessionId: todaySession.id },
          select: { exerciseId: true, weightKg: true, reps: true, holdSeconds: true },
        })
      : Promise.resolve([]),
  ]);

  /*
   * 완료 카드에 쓸 것. 종료 요약과 같은 함수로 접는다 — 방금 본 요약과
   * 여기 숫자가 다르면 어느 쪽을 믿을지 모른다.
   *
   * 줄은 운동할 때 찍어 둔 목록의 순서대로다. 오늘 일정은 그 뒤에 다시
   * 만들었을 수도 있으니, 이름도 거기서 가져온다.
   */
  const done = (() => {
    if (!finished || !todaySession) return null;
    const frozen = readFrozenPlan(todaySession.plan)?.exercises ?? [];
    const order = new Map(frozen.map((e, i) => [e.id, i]));
    const titleOf = new Map(frozen.map((e) => [e.id, e.title]));
    const lines: DoneLine[] = summarizeSets(doneSets)
      .sort(
        (a, b) => (order.get(a.exerciseId) ?? 999) - (order.get(b.exerciseId) ?? 999)
      )
      .map((sum) => ({
        id: sum.exerciseId,
        title: titleOf.get(sum.exerciseId) ?? '목록에서 뺀 운동',
        summary: sum,
      }));
    return {
      minutes: Math.round(todaySession.activeSeconds / 60),
      sets: doneSets.length,
      volumeKg: totalVolumeKg(doneSets),
      lines,
    };
  })();

  /*
   * 하는 차례로 줄 세운다(lib/report/exercise-order.ts — 파워(가벼운 것부터) → 본 운동(센 것부터) → 보조, 가동성은 가벼운 것부터).
   * 저장해 둔 일정은 고른 차례 그대로라, 이미 만든 일정도 열 때 이 차례로 보이게 여기서 한 번 더 세운다.
   */
  const exercises: TodayExercise[] = orderSession(full, SLOT_ORDER).map(
    ({ slot, manual, unsafe, ex }) => ({
      favorite: favExercises.has(ex.id),
      id: ex.id,
      title: ex.title,
      category: ex.category,
      description: ex.description,
      bodyParts: ex.bodyParts,
      intensity: ex.intensity,
      difficulty: ex.difficulty,
      equipment: ex.equipment,
      /*
       * 처방은 이제 모든 구간에 적는다. 아직 세트·횟수를 안 채운 운동은 null 이라 화면에 아무것도 안 나온다.
       *
       * 예전에는 워밍업에만 숨겼다 — 세트를 세며 하는 것이 아니라 관절을 한 번씩
       * 지나가는 것이라, 숫자를 적어 두면 지켜야 할 것처럼 읽혔다. 워밍업을 아예
       * 안 뽑게 된 지금 남은 것은 회복 데이의 가동성뿐이고, 그것은 그날의 운동
       * 자체라 몇 세트 몇 회인지가 필요하다.
       *
       * 횟수는 오늘 목표에 맞춘다(lib/report/goal-prescription.ts — 근력 향상이면 무거운 운동 4세트 × 5회).
       */
      prescription: formatPrescription(goalPrescription(ex, savedPlan?.goal)),
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
      /* '영상 보기'가 펼칠 영상(exercise-list.tsx) — 누르기 전에는 받지 않는다 */
      videoPath: ex.videoPath,
      referenceVideoId: ex.referenceVideoId,
      aspectRatio: ex.aspectRatio ?? null,
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
      /*
       * 지난번에 얼마나 했는지. 처음 하는 운동이면 빈 목록이라 아무것도 안 나온다.
       */
      past: pastAmounts.get(ex.id) ?? [],
    })
  );

  /*
   * 목록에 더할 수 있는 운동.
   *
   * 안전 필터를 통과 못 한 것도 넣는다 — 무엇이 걸리는지 표시하고, 하고 말고는
   * 본인이 정한다. 설명 글과 영상 경로는 빼고 부른 목록(core.library)이라
   * 400개를 넘겨도 화면이 무겁지 않다.
   */
  const pickable: PickableExercise[] = core.library.map((raw) => {
    /* 더하고 나서 목록에 보일 횟수와 같게 — 오늘 목표에 맞춘다(goal-prescription.ts) */
    const ex = goalPrescription(raw, savedPlan?.goal);
    return {
      favorite: favExercises.has(ex.id),
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
    };
  });

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
      goal={user.trainingGoal}
      focus={user.trainingFocus}
      generated={generated}
      checkedIn={core.hasCheckinToday}
      returnTo="/training"
      clash={core.workoutClash}
      preferredWorkout={core.preferredWorkout}
      /* 오늘 직접 골라 만들었으면 다시 만들 때도 그쪽으로 연다 */
      startMode={savedPlan && !savedPlan.auto ? 'manual' : 'auto'}
      /*
       * 체크인이 없으면 이 자리에서 체크인 창을 연다 — 홈으로 보내지 않는다.
       * 상세 체크인의 '하고 싶은 부위'는 라이브러리에 실제로 있는 부위만 고른다(홈과 같다).
       */
      checkinAction={
        core.hasCheckinToday ? undefined : (
          <TrainingCheckin parts={availableParts(core.library)} />
        )
      }
    />
  );

  /* 운동의 부위 태그를 누르면 전신 3D 창(components/body-parts.tsx) — 목록과 운동 추가 창이 쓴다 */
  return (
    <BodyPartsProvider>
      <div className="stack-page">
        <AppHead
          app="today"
          title="트레이닝"
          settings={user}
          returnTo={TRAINING_PART_HREF.today}
        />

        {programCard && <ProgramCard props={programCard} />}
        {doneResult && <ProgramDone result={doneResult} />}

        {/*
        운동 시작.
        목록이 있는 날에만 낸다 — 통증인 날과 아직 안 만든 날에는 시작할 것이
        없다. 목록 위에 두는 것은, 스크롤을 내려 운동을 훑기 전에 먼저 눈에
        들어와야 하기 때문이다.
      */}
        {done ? (
          /*
          마친 날에는 오늘 한 것이 맨 위다. 통증을 입력해 목록이 멈춘 뒤에도
          카드는 낸다 — 운동을 한 것은 사실이다. 다시 열기만 막는다.
        */
          <DoneCard
            {...done}
            intensity={trainingNote?.intensity ?? null}
            canResume={!picked.halted && shownPicks.length > 0}
          />
        ) : (
          !picked.halted &&
          shownPicks.length > 0 &&
          /* 프로그램 판이 열려 있으면 이어 하기는 프로그램 카드가 한다 */
          programView?.todayState !== 'active' && <StartWorkout resume={resume} />
        )}

        {programStart && <ProgramStart props={programStart} />}

        {picked.halted ? (
          <Card className="space-y-2 border-warn-line bg-warn-bg">
            <p className="text-sm font-bold text-warn">
              오늘은 운동을 처방하지 않았어요
            </p>
            {/*
            까닭과 할 일을 한 번씩만 말한다. 예전에는 haltReason 안에 이미
            "체크인을 다시 저장해주세요"가 들어 있는데 뒤에서 또 "체크인에서
            상태를 고쳐주세요"라고 해, 같은 말을 두 번 하는 문단이 됐다.
          */}
            <p className="text-sm leading-relaxed text-warn">
              {picked.haltReason ?? '통증 신호가 있어 훈련 조언을 만들지 않았어요.'}
            </p>
            {/*
            2026-10-03 부터 통증이 있는 날도 아픈 곳을 피해서 일정을 만든다. 여기 오는 것은 최근에 아팠는데
            오늘 체크인이 없어 나았는지 모르는 날뿐이라, 할 일은 체크인을 남기는 것이다.
          */}
            <OpenCheckinButton className="text-sm font-semibold text-sky-strong">
              오늘 체크인 남기기
            </OpenCheckinButton>
          </Card>
        ) : savedPlan == null ? (
          /*
          아직 안 만든 날.

          예전에는 화면을 열면 일정이 이미 만들어져 있었다. 만든 적도 없는 것이
          떠 있으니 "이걸 하라는 건가" 싶고, 새로고침하면 내용이 달라지기도 했다.
          이제는 오늘 조건을 고르고 눌러야 생긴다.

          투구 기록이 없어도 만들 수 있다(2026-10-03 사용자 결정). 예전에는 최근 45일에
          투구 기록이 없으면 이 앞에서 막아, 공을 쉬는 비시즌에 운동을 못 골랐다. 기록이
          없을 때 무엇을 거르는지는 lib/report/prescription.ts 의 '부하 구간에 따른 강도 상한'.
        */
          <Card className="space-y-4">
            <div className="space-y-1">
              <p className="text-lg font-bold text-ink">
                오늘 운동 일정을 만들어보세요
              </p>
              <p className="text-sm text-muted">투구량과 몸 상태에 맞춰 골라요.</p>
            </div>
            {planForm(false, savedMinutes)}
          </Card>
        ) : exercises.length === 0 ? (
          <Card className="space-y-4">
            <p className="text-sm font-bold text-ink">
              만들어 둔 일정에 남은 운동이 없어요
            </p>
            <p className="text-sm text-muted">
              {droppedForSafety > 0
                ? '몸 상태가 바뀌어 무리인 운동이 모두 빠졌어요.'
                : '지금 할 수 있는 운동이 아직 없어요.'}
            </p>
            {planForm(false, savedPlan.requestedMinutes)}
          </Card>
        ) : (
          <>
            {/*
            오늘의 일정 — 무엇을 위한 하루인지 먼저 말한다.

            이 화면에서 가장 위에 오는 카드인데 운동 한 줄과 똑같은 흰 상자였다.
            엷은 하늘색 바탕을 깔고 제목을 키워, 훑어봤을 때 여기가 머리라는
            것이 보이게 한다.
          */}
            <Card className="space-y-3 border-sky-soft/40 bg-gradient-to-br from-sky/[0.07] via-surface to-surface">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-heading text-xl text-ink sm:text-2xl">
                  오늘은 {savedPlan.theme.label}
                </p>
                <p className="text-sm text-muted">
                  {/*
                  시간은 만들 때 찍어 둔 값이 아니라 지금 목록에서 센다 —
                  운동을 빼도 "약 50분"이 그대로 남으면 안 된다. 홈도 같은
                  값을 쓴다(lib/report/today-data.ts).
                */}
                  <span className="text-numeric text-base text-ink">
                    {exercises.length}
                  </span>
                  종목 · 약{' '}
                  <span className="text-numeric text-base text-ink">
                    {core.shownMinutes}
                  </span>
                  분
                </p>
              </div>
              <p className="text-sm leading-relaxed break-keep text-muted">
                {savedPlan.theme.reason}
              </p>
              {/* 자동 맞춤이 정한 목표·시간과 그 이유 */}
              {savedPlan.auto && <AutoNote auto={savedPlan.auto} />}
              {savedPlan.minutes < savedPlan.requestedMinutes && (
                <p className="text-xs text-warn">
                  회복 데이라 {savedPlan.requestedMinutes}분 → {savedPlan.minutes}분
                </p>
              )}

              {/*
              만든 뒤에 몸 상태가 나빠졌으면 그만큼 빠졌다고 말한다.
              말없이 줄어들면 앱이 잘못된 것으로 보인다.
            */}
              {droppedForSafety > 0 && (
                <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs text-warn">
                  몸 상태가 바뀌어 무리인 운동 {droppedForSafety}개를 뺐어요.
                </p>
              )}

              {/* 조건을 바꿔 다시 만들 수 있게 — 시간과 오늘 장비를 함께 고른다 */}
              <div className="border-t border-sky-soft/30 pt-3">
                {planForm(true, savedPlan.requestedMinutes)}
              </div>
            </Card>

            {/*
            장비를 한 번도 안 고른 사람에게 알린다.

            안 고르면 '전부 가지고 있다'로 본다 — 빈 목록을 그대로 믿으면 저장도
            안 한 사람에게 맨몸 운동만 나가기 때문이다. 그 대신, 처음 쓰는 사람은
            케틀벨도 벤치도 없는데 케틀벨 운동을 받게 된다.

            빠진 것이 없으니 아래의 '장비로 할 수 없는 운동 N개를 뺐습니다'도 안
            뜬다. 그래서 목록에 없는 장비가 섞인 이유를 알 길이 없었다.
            아래 안내들과 나란히 두지 않고 목록 위에 두는 이유는, 이것을 볼 사람이
            처음 쓰는 사람이기 때문이다. 운동 열여섯 개 밑에 있으면 닿지 않는다.
          */}
            {user.ownedEquipment.length === 0 && (
              <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-[13px] text-warn">
                장비를 안 골라 전부 있다고 보고 골랐어요. 위 ‘트레이닝 설정’에서
                고르세요.
              </p>
            )}

            <DoneFold folded={done != null} count={exercises.length}>
              <ExerciseChecklist exercises={exercises} dateKey={core.todayKey}>
                {/*
                만들어 준 목록을 그대로 하는 사람은 없다. 빼는 것은 목록에서
                바로, 더하는 것은 여기서 찾아서.
              */}
                <AddExercise
                  library={pickable}
                  inPlanIds={savedPlan.picks.map((p) => p.exerciseId)}
                  /* 몸 상태로만 가른 안전 — 장비 · 경력은 창이 따로 표시한다(lib/report/today-data.ts) */
                  safeIds={core.safeIds}
                  ownedEquipment={user.ownedEquipment}
                />
              </ExerciseChecklist>
            </DoneFold>

            {/*
            오늘 운동이 어땠는지 — 하루에 하나.
            목록을 다 지나온 자리에 둔다. 운동을 하기 전에 "얼마나 힘들었나"를
            물으면 답할 것이 없다.
          */}
            <TrainingNote
              intensity={trainingNote?.intensity ?? null}
              memo={trainingNote?.memo ?? null}
              done={exercises.some((ex) => ex.done)}
              dateKey={core.todayKey}
            />

            {/* 후보가 빠듯하면 숨기지 않고 알린다. */}
            {picked.tooFew && (
              <p className="rounded-lg border border-warn-line bg-warn-bg px-4 py-3 text-[13px] text-warn">
                오늘 조건에 맞는 운동이 {picked.candidates.length}개뿐이에요(권장{' '}
                {MIN_CANDIDATES}개 이상).
              </p>
            )}

            {/*
            장비 때문에 많이 빠졌으면, 무엇 하나만 더 있으면 얼마나 늘어나는지
            알려준다. 목록이 왜 빈약한지 모른 채로 두지 않기 위해서다.

            "가진 것이 아니라서"와 "오늘 못 써서"는 다른 이야기다. 덤벨을 가진
            사람에게 "덤벨이 있으면"이라고 하면 틀린 말이 된다.
          */}
            {savedPlan.equipment.bestAddition && (
              <p className="rounded-lg border border-line bg-surface px-4 py-3 text-[13px] text-muted">
                <span className="font-semibold text-ink">
                  {savedPlan.equipment.bestAddition.name}
                </span>
                {/*
                조사를 글자로 박아두면 반드시 틀린다. '벤치이 있으면'이 실제로
                화면에 나왔다 — 받침이 없는 이름에는 '가'가 붙어야 한다.
              */}
                {savedPlan.equipment.narrowed
                  ? `${josa(savedPlan.equipment.bestAddition.name, '을/를')} 쓸 수 있으면 운동 ${savedPlan.equipment.bestAddition.unlocks}개가 더 나와요.`
                  : `${josa(savedPlan.equipment.bestAddition.name, '이/가')} 있으면 운동 ${savedPlan.equipment.bestAddition.unlocks}개가 더 나와요.`}
              </p>
            )}

            {/*
            왜 이 운동들인지 — 만들 때 쓴 근거를 그대로 보여준다.

            여기서 다시 계산하지 않는다. 만든 뒤에 체크인을 하면 근거만 새로
            바뀌어서, "컨디션 3/10이라 무게 드는 운동을 뺐습니다"라고 적혀 있는데
            목록에는 데드리프트가 있는 상태가 된다.
          */}
            <details className="rounded-2xl border border-line bg-surface p-(--block-pad)">
              <summary className="cursor-pointer text-sm font-medium text-ink">
                왜 이 운동인가요?
              </summary>
              <ul className="mt-3 space-y-1.5">
                {[
                  savedPlan.theme.reason,
                  /* 자동 맞춤 — 규칙이 정한 것 */
                  ...(savedPlan.auto?.rules ?? []),
                  ...(savedPlan.goal
                    ? [
                        savedPlan.auto
                          ? `자동 맞춤이 정한 목표 '${savedPlan.goal}'에 맞춰 시간을 배분`
                          : `목표 '${savedPlan.goal}'에 맞춰 시간을 배분`,
                      ]
                    : []),
                  ...(savedPlan.levelExcludedCount > 0
                    ? [
                        `웨이트 경력 ${user.trainingLevel} → 아직 이른 운동 ${savedPlan.levelExcludedCount}개 제외`,
                      ]
                    : []),
                  ...savedPlan.basis,
                  ...savedPlan.notes,
                ].map((line) => (
                  <li
                    key={line}
                    className="flex gap-2 text-[13px] leading-relaxed text-muted"
                  >
                    <span aria-hidden className="text-sky">
                      ·
                    </span>
                    {line}
                  </li>
                ))}
              </ul>
              {(savedPlan.excluded.length > 0 ||
                savedPlan.equipment.excludedCount > 0) && (
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
    </BodyPartsProvider>
  );
}
