import { appNow } from '@/lib/clock';
import type { ReactNode } from 'react';
import { favoriteExerciseIds } from '@/lib/favorites';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireUser } from '@/lib/dal';
import { featureLocks, SETUP_PATH } from '@/lib/feature-locks';
import { ChevronDown, Dumbbell } from '@/components/icon';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import { formatPrescription } from '@/lib/exercise-meta';
import { planPrescription } from '@/lib/report/volume';
import { planReasonLines } from '@/lib/report/daily-plan';
import { pickReasonLineOf } from '@/lib/report/score';
import { loadTodayCore } from '@/lib/report/today-data';
import { toDateKey } from '@/lib/pitch-stats';
import { TRAINING_SCREEN_TEXT, trainingScreenOf } from '@/lib/report/training-screen';
import { remakeFieldsOf, stateNoticeOf } from '@/lib/report/state-notice';
import { programDayText } from '@/lib/engine/arbiter';
import { StartWorkout } from './start-workout';
import { StateNoticeBand } from './state-notice-band';
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
import { TrainingSettingsButton } from './settings-button';
import { RememberTrainingApp } from './remember-app';
import { TrainingHome } from './training-home';
import { ArmcareTabs, type ArmcareTab } from './armcare-tabs';
import { ArmcareSection } from './armcare-section';
import { MechanicsTabs, type MechanicsTab } from './mechanics-tabs';
import { MechanicsSection } from './mechanics-section';
import { BodyPartsProvider } from '@/components/body-parts';
import { TrainingCheckin } from './training-checkin';
import { TrainingPrefsCard } from './training-prefs-card';
import { OpenCheckinButton } from '@/components/notice-bell';
import { OutingLine } from '@/components/outing-line';
import { availableParts } from '@/lib/report/today-pick';
import { exercisesByIds } from '@/lib/library-cache';
import {
  PROGRAMS_ENABLED,
  profileBlock,
  programChoiceList,
} from '@/lib/program/program';
import {
  activeProgram,
  buildProgramDay,
  hasFinishedBasics,
  programCardProps,
  programResult,
  programTodayOf,
  recentlyDoneProgram,
} from '@/lib/program/load';
import { ageFromBirthDate } from '@/lib/profile';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
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
  return appNow();
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
      {/*
        '‹ 트레이닝'은 휴대폰에서 위 막대에 선다(BackLink) — 이 줄은 PC 에서만. 예전엔 휴대폰에서 이 줄에 설정 단추만 남아 제목 위에 홀로
        떠 있었다(2026-10-15 김민 "상단이 부자연스럽다") → 휴대폰은 설정을 제목 오른쪽 알약으로(투구의 '분석'처럼).
      */}
      <div className="hidden min-h-11 items-center gap-3 desk:flex">
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
      <PageHeading
        eyebrow="Training"
        title={title}
        inlineAction
        action={
          settings && (
            <div className="desk:hidden">
              <TrainingSettingsButton
                trainingLevel={settings.trainingLevel}
                ownedEquipment={settings.ownedEquipment}
                returnTo={returnTo}
                pill
              />
            </div>
          )
        }
      />
    </div>
  );
}

/**
 * 근력 프로그램이 오늘 주인인 날의 일정 자리 한 줄(2판 P6-4, 사용자 결정 D6) — 그날 운동은 맨 위 프로그램 카드가 다 말하고(목록 · 무게 · [운동 시작]),
 * 여기서는 왜 따로 일정을 안 짜는지만 말한다. 글은 중재와 일정 까닭의 한 곳(lib/engine/arbiter.ts programDayText). 바로 위 다음 등판 한 줄
 * (components/outing-line.tsx)과 같은 줄 모양이라 둘이 이어 읽힌다. 그 전에 만든 매일 일정이 남아 있으면 그 일정은 오늘 쉰다고 둘째 줄로 알린다.
 */
function ProgramDayLine({
  label,
  planResting,
}: {
  label: string | null;
  planResting: boolean;
}) {
  return (
    <div className="flex min-h-12 items-center gap-2.5 rounded-2xl border border-line bg-surface px-(--block-pad) py-1.5 text-sm desk:min-h-11">
      <Dumbbell aria-hidden className="h-4 w-4 shrink-0 text-sky" />
      <p className="min-w-0 flex-1 break-keep">
        <span className="block font-semibold text-ink">{programDayText(label)}</span>
        {planResting && (
          <span className="block text-xs text-muted">
            {TRAINING_SCREEN_TEXT.planResting}
          </span>
        )}
      </p>
    </div>
  );
}

export default async function TrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const user = await requireUser();
  /* 처음 가입한 사람은 첫 설정(2026-10-09, lib/feature-locks.ts)을 마쳐야 연다 — 홈 · 암케어 · 메커니즘 모든 분기 앞 */
  if (featureLocks(user).training) redirect(SETUP_PATH.training);
  /* 첫 설정 뒤 탭 사용법(TabTutorial)은 2026-10-12 사용자 요청으로 뺐다 — 감싸기 자리만 남긴다 */
  const withTutorial = (node: ReactNode) => node;
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
    return withTutorial(
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
    return withTutorial(
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
    return withTutorial(
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

  /*
   * 오늘 자료와 오늘 메모 · 별 · 오늘 판을 같이 읽는다 — 셋은 오늘 자료를 기다릴 까닭이 없다(예전엔 차례로 기다렸다).
   * midnight 는 loadTodayCore 의 core.midnight 와 같은 값이다. 지난 판 닫기(loadTodayCore 첫머리)는 지난 날짜의 판만 건드려
   * 오늘 판 · 메모 · 별과 겹치지 않는다. 프로그램 줄은 그 닫기가 바꿀 수 있어(lib/program/advance.ts) 아래에서 오늘 자료 뒤에 읽는다.
   */
  const midnight = new Date(`${toDateKey(today)}T00:00:00.000Z`);
  const [core, trainingNote, favExercises, todaySession] = await Promise.all([
    loadTodayCore(user, today),
    /* 오늘 운동이 어땠는지 — 하루에 하나. 목록 아래에 적는다. */
    prisma.dailyTrainingNote.findUnique({
      where: { userId_date: { userId: user.id, date: midnight } },
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
      where: { userId_date: { userId: user.id, date: midnight } },
      select: { id: true, status: true, plan: true, activeSeconds: true },
    }),
  ]);
  const { savedPlan, picked, doneIds, shownPicks, droppedForSafety } = core;
  /*
   * 근력 · 파워 프로그램(lib/program) — 진행 중이면 맨 위 카드, 끝난 지 사흘 안이면 결과 카드, 아니면 입구 한 줄(설계 §13-1).
   * 카드의 목록 · 무게는 운동 시작(app/actions/program.ts)이 얼리는 것과 같은 함수에서 나온다.
   */
  const programRow = PROGRAMS_ENABLED ? await activeProgram(user.id) : null;
  /* 기본기 4주를 마쳤나(아래 basicsDone) — 진행 중인 줄이 없으면 programView 가 늘 없으니 미리 같이 묻는다 */
  const asksBasics = PROGRAMS_ENABLED && user.trainingLevel === '입문';
  const [programView, doneProgram, basicsEarly] = await Promise.all([
    programRow ? buildProgramDay(core, programRow, user) : Promise.resolve(null),
    PROGRAMS_ENABLED && !programRow
      ? recentlyDoneProgram(user.id, today)
      : Promise.resolve(null),
    asksBasics && !programRow ? hasFinishedBasics(user.id) : Promise.resolve(null),
  ]);
  const programCard = programView ? programCardProps(programView, core.library) : null;
  const doneResult = doneProgram
    ? await programResult(doneProgram, core.library)
    : null;
  const programAge = user.birthDate ? ageFromBirthDate(user.birthDate, today) : null;
  /* 성인 입문만 — 기본기 4주를 마쳤으면 성인 프로그램이 열린다(program.ts 의 profileBlock) */
  const basicsDone =
    asksBasics && !programView
      ? (basicsEarly ?? (await hasFinishedBasics(user.id)))
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
          /* 고르기 화면의 막힘 — 시작 자격(app/actions/program.ts)과 같은 함수 */
          blocked: profileBlock({ audience: 'adult', ...knownProfile }),
          basicsBlocked: profileBlock({ audience: 'basics', ...knownProfile }),
          basicsDone,
        }
      : null;

  const resume = todaySession?.status === 'ACTIVE';
  const finished = todaySession?.status === 'FINISHED';
  /*
   * 근력 프로그램 카드와 일정 카드가 같은 날 겹치지 않게(2판 P6-4, lib/report/training-screen.ts) — 프로그램이 오늘 주인이면(중재의 매일 일정 몫,
   * 일정 만들기와 같은 판정) 일정 자리는 한 줄이고 매일 [운동 시작] · 다시 만들기 · 체크 목록 · '운동 더 하기'는 없다. 프로그램 날로 짜였는데 지금은
   * 프로그램이 주인이 아닌 일정(스러진 일정)은 만들기 전처럼 다시 만들게 한다.
   */
  const screen = trainingScreenOf({
    halted: picked.halted,
    daily: programView?.arbitration.daily,
    savedPlan,
    shownCount: shownPicks.length,
    /*
     * 할 프로그램 운동이 있는 날만 프로그램 날 — 일정 만들기(app/actions/training-setup.ts)가 프로그램 날로 짜는 바로 그 판정(programTodayOf).
     * 판정 'go' 인데 그날 운동이 다 빠진 날 폼을 숨기면 시작할 운동이 하나도 없었다(2판 P6 검토).
     */
    programWork: programView ? programTodayOf(programView) != null : false,
  });
  /*
   * 상태 바뀜 띠(2판 P6-6, lib/report/state-notice.ts) — 일정을 만든 뒤 판단 입력이 바뀌었으면 일정 카드 위에 바뀐 줄 · '지금 상태로 다시 만들기'.
   * 일정 카드를 쓰는 날(screen.usesPlan — 멈춤 · 프로그램 주인 · 스러진 프로그램 날 일정이 아닌 날)만 그린다. 아픈 부위만 바뀌어 이미 뺀 날은 띠 대신
   * 카드 안의 '무리인 운동 N개를 뺐어요' 한 줄만(두 알림이 겹치지 않게), 마친 날은 띄우지 않고, 운동 중 · 체크인 없는 날은 단추 없이 까닭 한 줄.
   */
  const notice = stateNoticeOf(core.stateChanges, {
    programOwns: screen.programOwns,
    droppedForSafety,
    session: finished ? 'finished' : resume ? 'active' : 'none',
    checkedIn: core.hasCheckinToday,
  });

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
      /* 만들 때 얼린 고르기 점수(2판 P5-j) — 일정에 든 것만 있다. 오늘 마쳐서 도로 넣은 것(strays)에는 없다 */
      score: 'score' in p ? p.score : undefined,
      ex: byId.get(p.exerciseId),
    }))
    .filter((p): p is typeof p & { ex: NonNullable<(typeof p)['ex']> } => p.ex != null);

  const [thumbUrls, pastAmounts, doneSets] = await Promise.all([
    createPlaybackUrls([
      ...full.map((p) => p.ex.thumbPath),
      /* 근력 프로그램 '앞으로 할 세션'의 썸네일도 같은 한 번에 */
      ...(programCard?.upcoming.flatMap((u) => u.items.map((it) => it.thumbPath)) ?? []),
    ].filter((p): p is string => !!p)),
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
  for (const it of programCard?.upcoming.flatMap((u) => u.items) ?? []) {
    if (it.thumbPath) it.thumbUrl = thumbUrls[it.thumbPath] ?? null;
  }

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
    ({ slot, manual, unsafe, score, ex }) => ({
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
       * 그날 양을 줄였으면 세트도 줄인 값(처방 한 길 — lib/report/volume.ts planPrescription, 운동 시작 때 얼리는 값과 같다).
       */
      prescription: formatPrescription(planPrescription(ex, savedPlan)),
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
       * 왜 이 운동인지 한 줄(2판 P5-k) — 오늘 상태로 앞에 당긴 것만(lib/report/score.ts pickReasonLineOf: 2주 안 한 동작 · 뻐근한 곳
       * 풀기 · 즐겨찾기). 뒤로 민 신호는 위 '오늘 이렇게 짰어요'가 한 번 말한다. 권하지 않는 운동이면 경고 한 줄만 둔다(둘이 엇갈려 읽힌다).
       */
      reason: unsafe
        ? null
        : pickReasonLineOf(ex, score, { favorite: favExercises.has(ex.id) }),
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
   * 일정 카드의 '오늘 이렇게 짰어요'(2판 P5-k) — 저장한 까닭, 옛 줄은 양 조절 · 힘듦 넘김만. 앞으로 당긴 줄은 지금 보이는 줄과 지금 별로
   * 거른다(2판 P5 검토) — 그 운동을 빼거나 안전 재확인으로 빠지거나 별을 떼면 '앞에 뒀어요'가 거짓이 된다(운동 줄의 이유와 같은 원칙).
   */
  const planReasons = savedPlan
    ? planReasonLines(savedPlan, { shown: shownPicks, favoriteIds: favExercises })
    : [];

  /*
   * 목록에 더할 수 있는 운동.
   *
   * 안전 필터를 통과 못 한 것도 넣는다 — 무엇이 걸리는지 표시하고, 하고 말고는
   * 본인이 정한다. 설명 글과 영상 경로는 빼고 부른 목록(core.library)이라
   * 400개를 넘겨도 화면이 무겁지 않다.
   */
  const pickable: PickableExercise[] = core.library.map((raw) => {
    /* 더하고 나서 목록에 보일 횟수와 같게 — 오늘 목표 · 양 조절에 맞춘다(처방 한 길, lib/report/volume.ts) */
    const ex = planPrescription(raw, savedPlan);
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
  /*
   * '오늘 하고 싶은 운동' 카드(체크인 3판, 2026-10-13) — 체크인 상세에서 옮겨 온 질문. 일정을 만들 수 있는 날(체크인이 있는 날)에만
   * 만들기 폼 위에 선다. 답은 facts 로 폼(preferredWorkout)과 일정 만들기에 들어간다(lib/report/gather.ts).
   */
  const prefsCard = core.hasCheckinToday ? (
    <TrainingPrefsCard
      day={core.todayKey}
      answer={core.trainingPrefs}
      parts={availableParts(core.library)}
    />
  ) : null;
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
      /* 최근 운동 힘듦 급증 — 직접 고르기에 경고 한 줄 · '그래도 고른 대로'(2판 P5-e, lib/report/today-data.ts) */
      effortSpike={core.effortSpike}
      preferredWorkout={core.preferredWorkout}
      /* 오늘 직접 골라 만들었으면 다시 만들 때도 그쪽으로 연다 */
      startMode={savedPlan && !savedPlan.auto && !savedPlan.program ? 'manual' : 'auto'}
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
  /* 만들기 폼 위에 '오늘 하고 싶은 운동' 카드 — 세 자리(처음 만들기 · 빈 일정 · 조건 바꿔 다시 만들기)가 같이 쓴다 */
  const planBlock = (generated: boolean, minutes: number) => (
    <>
      {prefsCard}
      {planForm(generated, minutes)}
    </>
  );

  /* 운동의 부위 태그를 누르면 전신 3D 창(components/body-parts.tsx) — 목록과 운동 추가 창이 쓴다 */
  return withTutorial(
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
        상태 바뀜 띠 — [운동 시작]보다 위. 만든 뒤 바뀐 상태를 보고 다시 만들지 먼저 고르게(시작하면 그 판은 얼어 다시 만들어도 안 바뀐다).
      */}
        {screen.usesPlan && savedPlan && (
          <StateNoticeBand
            notice={notice}
            fields={remakeFieldsOf(savedPlan, {
              returnTo: '/training',
              availableToday: core.todaySetup?.availableEquipment,
            })}
          />
        )}

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
            /* 프로그램 날에는 다시 열지 않는다 — 다시 열면 마친 프로그램 판 뒤에 매일 운동이 붙는다(D6 — 보조를 더하지 않는다, 2판 P6-4) */
            canResume={screen.canResume}
          />
        ) : (
          /* 프로그램이 오늘 주인이면(진행 중인 프로그램 판 포함) 시작 · 이어 하기는 프로그램 카드가 한다(2판 P6-4) */
          screen.canStart && <StartWorkout resume={resume} />
        )}

        {/* 오늘 일정을 만든 날에는 프로그램 고르기를 숨긴다(2026-10-12 사용자) — 만들기 전에만 */}
        {programStart && savedPlan == null && <ProgramStart props={programStart} />}

        {/* 다음 등판 한 줄(2판 P4) — 일정 카드 위. 짐작한 등판이면 '바꾸기'가 체크인을 연다(components/outing-line.tsx) */}
        <OutingLine outing={core.state.outing} />

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
        ) : screen.programOwns ? (
          /*
          근력 프로그램 날(2판 P6-4, D6) — 프로그램 카드가 주인이고 일정 자리는 한 줄. 마친 날은 그것도 안 그린다(위 완료 카드와 프로그램 카드가
          오늘 한 것을 말한다).
        */
          done ? null : (
            <ProgramDayLine
              label={
                programView?.arbitration.program?.today?.label ??
                programView?.dayLabel ??
                null
              }
              planResting={screen.planResting}
            />
          )
        ) : savedPlan == null || screen.stalePlan ? (
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
              <p className="text-sm text-muted">
                {/* 프로그램 날로 짜였는데 지금은 프로그램이 쉬는 일정이면 그 까닭을(2판 P6-4) */}
                {screen.stalePlan
                  ? TRAINING_SCREEN_TEXT.stalePlan
                  : '투구량과 몸 상태에 맞춰 골라요.'}
              </p>
            </div>
            {planBlock(false, savedMinutes)}
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
            {planBlock(false, savedPlan.requestedMinutes)}
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
              {/*
                오늘 목표와 까닭 — 2026-10-12 사용자: "필요한 오늘의 운동목표와 설정이유만, 보기 간편하게". 자동 맞춤이면 그
                까닭(auto.reason)이 테마 까닭보다 구체적이라 그것 하나만, 아니면 테마 까닭.
              */}
              {savedPlan.goal && (
                <p className="text-sm font-semibold text-ink">
                  목표 · {savedPlan.goal}
                </p>
              )}
              <p className="text-sm leading-relaxed break-keep text-muted">
                {savedPlan.auto?.reason ?? savedPlan.theme.reason}
              </p>
              {/*
                '오늘 이렇게 짰어요' — 일정 까닭 최대 3줄(2판 P5-k, lib/report/daily-plan.ts planReasonLines). 하는 양이 바뀐 까닭(세트
                줄임 · 힘듦 경고 넘김)이 먼저, 그다음 오늘 상태로 운동 차례를 바꾼 까닭(score.ts planReasonItemsOf). 만들 때 저장한 글이라
                다시 셈하지 않고, 앞으로 당긴 줄만 지금 보이는 줄 · 지금 별로 거른다(위 planReasons). 목표 · 까닭이 먼저 읽히게 한 단 작은
                글로 덧붙인다.
              */}
              {planReasons.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-ink/80">
                    오늘 이렇게 짰어요
                  </p>
                  <ul className="list-disc space-y-0.5 pl-4 text-xs leading-relaxed break-keep text-muted marker:text-sky">
                    {planReasons.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                </div>
              )}
              {savedPlan.auto?.painSuspected && <AutoNote auto={savedPlan.auto} />}
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

              {/* 조건을 바꿔 다시 만들기 — 접어 둔다(펴야 시간 · 장비 고르개가 보인다) */}
              <details className="group border-t border-sky-soft/30 pt-3">
                <summary className="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold text-sky-strong">
                  조건 바꿔 다시 만들기
                  <ChevronDown
                    aria-hidden
                    className="h-4 w-4 transition-transform group-open:rotate-180"
                  />
                </summary>
                <div className="pt-3">
                  {planBlock(true, savedPlan.requestedMinutes)}
                </div>
              </details>
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
              <p className="rounded-2xl border border-warn-line bg-warn-bg p-(--block-pad) text-footnote text-warn">
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
              <p className="rounded-2xl border border-warn-line bg-warn-bg p-(--block-pad) text-footnote text-warn">
                오늘 조건에 맞는 운동이 {picked.candidates.length}개뿐이에요(권장{' '}
                {MIN_CANDIDATES}개 이상).
              </p>
            )}
          </>
        )}
      </div>
    </BodyPartsProvider>
  );
}
