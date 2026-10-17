'use server';

import { appNow } from '@/lib/clock';
import { revalidatePath } from 'next/cache';
import { redirect, RedirectType } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/dal';
import { toDateKey } from '@/lib/pitch-stats';
import { pickMany } from '@/lib/exercise-meta';
import { ALWAYS_OWNED, SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import {
  readOwnedEquipment,
  readTrainingFocus,
  readTrainingGoal,
  readTrainingProfile,
} from '@/lib/report/personalize';
import {
  armOnlyBudgetOf,
  buildDailyPlan,
  isHalted,
  planBudgetOf,
  type DailyPlan,
  type StrengthHistory,
} from '@/lib/report/daily-plan';
import { armBudget } from '@/lib/engine/arbiter';
import { painStateUnknown } from '@/lib/report/prescription';
import { carrySwaps, swappedOutOf } from '@/lib/report/plan-swaps';
import { fingerprintOf } from '@/lib/report/plan-fingerprint';
import { visibleExercises, type CachedExercise } from '@/lib/library-cache';
import {
  gatherFactsAndPlan,
  lastStrengthDates,
  exerciseSessionsAgo,
  recentExerciseIds,
  swappedOutRecently,
} from '@/lib/report/gather';
import { favoriteExerciseIds } from '@/lib/favorites';
import {
  activeProgram,
  buildProgramDay,
  pitchTypesToday,
  programTodayOf,
  type ProgramRow,
} from '@/lib/program/load';
import {
  PROGRAMS_ENABLED,
  parseProgram,
  patternsOfProgramDay,
  readPinned,
} from '@/lib/program/program';
import {
  withProgramCommitment,
  type ProgramCommitmentInput,
} from '@/lib/engine/day-state';
import {
  DEFAULT_WORKOUT_MINUTES,
  minutesChoicesFor,
  nearestMinutesChoice,
} from '@/lib/report/theme';
import {
  decideAutoFence,
  type AutoCaution,
  type AutoRecord,
} from '@/lib/report/auto-setup';
import { trainingLoad } from '@/lib/report/training-acwr';
import type { ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';
import { validateWorkoutBaseline } from '@/lib/baseline';
import {
  checkTrainingAnswers,
  formOfRows,
  ownedEquipmentToSave,
  readTrainingAnswers,
} from '@/lib/training/setup-answers';

/**
 * 트레이닝 화면의 설정과 일정 만들기.
 *
 * 예전에는 경력·목표·장비를 프로필에서 골랐는데, 정작 그 결과를 보는 곳은
 * 트레이닝 화면이라 "왜 이 운동이지?" 싶을 때마다 다른 화면으로 건너가야 했다.
 * 그래서 고르는 곳을 결과 옆으로 옮겼다.
 *
 * 세 가지를 나눠 둔다.
 *   오래 가는 것 — 경력·가지고 있는 장비 (User)
 *   그날만인 것 — 오늘 쓸 수 있는 장비        (DailyTrainingSetup)
 *   눌러야 생기는 것 — 오늘의 운동 일정        (DailyTrainingSetup.plan)
 */

/** 날짜 하나를 DB에 넣을 형태로. 시간대는 서비스 기준(한국)으로 센다. */
function dateOnly(today: Date) {
  return new Date(`${toDateKey(today)}T00:00:00.000Z`);
}

/*
 * 저장한 뒤 돌아갈 곳. 일정은 홈 · 트레이닝에서 만들고, 설정 창은 어느 화면 위에서나 열리므로 누른 그 화면으로 돌아와야
 * 한다 — 트레이닝에서 눌렀는데 홈으로 튕기면 방금 만든 목록을 보러 다시 들어가야 한다.
 *
 * 폼이 보낸 값을 그대로 redirect 에 넘기지는 않는다. 주소를 마음대로 넣을 수 있으면 남의 사이트로 보내는 링크를 만들 수
 * 있다. 이 사이트 안의 주소 — '/' 로 시작하고 둘째 글자가 '/' 나 '\'(다른 사이트로 읽힘)가 아니며 주소에 쓰는 글자만 — 만
 * 받고, 그 밖은 홈으로 떨어뜨린다. 예전에는 아는 주소 몇 개만 받아 영양 · 라이브러리 · 코치 · 투구 기록 팝업에서 설정을
 * 저장하면 홈으로 튕겼다.
 */
const SAME_SITE_PATH = /^\/(?![/\\])[\w\-./?=&%~]*$/;

function returnPath(formData: FormData): string {
  const asked = String(formData.get('returnTo') ?? '');
  return SAME_SITE_PATH.test(asked) ? asked : '/today';
}

/**
 * 경력과 목표를 저장한다.
 *
 * 값이 목록에 없으면 readTrainingProfile 이 버린다. 여기서 걸러진 값은
 * 그대로 DB에 남아 운동을 고르는 데 쓰이므로, 걸러내는 일이 중요하다.
 *
 * 장비는 건드리지 않는다 — 그쪽은 saveOwnedEquipment 가 맡는다. 한 폼에 묶여
 * 있던 때는 경력만 고치러 열었다가 저장해도 장비까지 저장돼서, 있지도 않은
 * 장비를 가지고 있다고 남겼다.
 *
 * 이미 만들어 둔 오늘 일정은 건드리지 않는다. 설정을 고쳤다고 눈앞의 일정이
 * 말없이 바뀌면, 하던 운동이 어디 갔는지 알 수 없다. 새 설정으로 받고 싶으면
 * '다시 만들기'를 누르면 된다.
 */
export async function saveTrainingSettings(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await prisma.user.update({
    where: { id: user.id },
    data: readTrainingProfile(formData),
  });

  const back = returnPath(formData);
  revalidatePath('/today');
  revalidatePath('/training');
  /* 누른 화면으로 돌아간다 — 같은 주소라 기록(뒤로 가기)에 한 칸 더 쌓지 않는다 */
  redirect(back, RedirectType.replace);
}

/** 가지고 있는 장비만 저장한다. 경력은 건드리지 않는다. */
export async function saveOwnedEquipment(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  await prisma.user.update({
    where: { id: user.id },
    data: readOwnedEquipment(formData),
  });

  const back = returnPath(formData);
  revalidatePath('/today');
  revalidatePath('/training');
  /* 누른 화면으로 돌아간다 — 같은 주소라 기록(뒤로 가기)에 한 칸 더 쌓지 않는다 */
  redirect(back, RedirectType.replace);
}

/*
 * 아이폰 앱(native/src/app/training/settings.tsx)의 트레이닝 설정 — 웹 saveTrainingSettings · saveOwnedEquipment 와 같은 칸 · 같은 거름
 * (readTrainingProfile · readOwnedEquipment)을 JSON 으로 받는다. 웹은 저장 뒤 redirect 하지만 앱은 결과로 받는다(화면을 앱이 쥔다).
 */
type AppSettingsResult = { ok: true } | { ok: false; error: string };

export async function saveAppTrainingLevel(level: unknown): Promise<AppSettingsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const fd = new FormData();
  fd.set('trainingLevel', typeof level === 'string' ? level : '');
  const data = readTrainingProfile(fd);
  if (!data.trainingLevel) return { ok: false, error: '경력을 골라 주세요.' };
  await prisma.user.update({ where: { id: user.id }, data });
  revalidatePath('/today');
  revalidatePath('/training');
  return { ok: true };
}

export async function saveAppOwnedEquipment(names: unknown): Promise<AppSettingsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const fd = new FormData();
  if (Array.isArray(names)) for (const n of names) if (typeof n === 'string') fd.append('ownedEquipment', n);
  await prisma.user.update({ where: { id: user.id }, data: readOwnedEquipment(fd) });
  revalidatePath('/today');
  revalidatePath('/training');
  return { ok: true };
}

/** 앱 트레이닝 설정 화면을 열 때 — 지금 경력 · 가진 장비(한 번도 안 골랐으면 빈 목록, 웹처럼 화면이 전부 켜서 보인다) */
export async function loadAppTrainingSettings(): Promise<
  { ok: true; trainingLevel: string | null; ownedEquipment: string[] } | { ok: false; to: string }
> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, to: '/login' };
  return { ok: true, trainingLevel: user.trainingLevel ?? null, ownedEquipment: user.ownedEquipment ?? [] };
}

/**
 * 오늘의 운동 일정을 만든다.
 *
 * 폼에서 오늘 쓸 수 있는 장비와 운동 시간을 함께 받는다. 둘 다 일정을 만드는
 * 재료라 따로 저장했다가 따로 만들 이유가 없다.
 *
 * 통증 등으로 처방을 멈춰야 하는 날에는 아무것도 저장하지 않는다. 그런 날
 * 빈 일정을 남겨두면, 나중에 몸이 괜찮아졌을 때 '이미 만든 날'로 보여서
 * 다시 만들 수가 없다.
 */
/**
 * 저장해 둔 일정에서 운동 id 만 꺼낸다.
 *
 * plan 은 Json 이라 모양을 믿을 수 없다. 기대한 모양이 아니면 빈 목록으로 둔다 —
 * 씨앗이 날짜만 남을 뿐 아무것도 깨지지 않는다.
 */
function readPlanExerciseIds(plan: unknown): string[] {
  if (!plan || typeof plan !== 'object') return [];
  const picks = (plan as { picks?: unknown }).picks;
  if (!Array.isArray(picks)) return [];
  return picks
    .map((p) => (p as { exerciseId?: unknown })?.exerciseId)
    .filter((id): id is string => typeof id === 'string');
}

export async function generateTodayPlan(formData: FormData) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  /*
   * 오늘 쓸 수 있는 장비. 가지고 있는 것 중에서만 고를 수 있다 — 설정에서
   * 장비를 뺐는데 폼에는 남아 있는 경우가 생긴다.
   */
  const owned = new Set(user.ownedEquipment);
  const chosen = pickMany(
    formData.getAll('availableEquipment').map(String),
    SELECTABLE_EQUIPMENT
  ).filter((name) => owned.has(name));
  /*
   * 고른 그대로 지킨다. 하나도 안 고른 것은 '맨몸만'이라는 뜻이다.
   *
   * 예전에는 하나도 안 고르면 빈 목록으로 두었고, 빈 목록은 '아직 안 고른 날'
   * 과 같은 뜻이라 가진 것을 전부 쓰는 쪽으로 갔다. 그래서 헬스장에 안 가는
   * 날이라 체크를 전부 끄고 만들어도 바벨 운동이 그대로 나왔다 — 끄는 행동에
   * 아무 효과가 없었다.
   *
   * 맨몸은 언제나 들어간다. 장비가 없다고 할 수 있는 운동까지 없어지는 것은
   * 아니다.
   */
  const availableEquipment = [ALWAYS_OWNED, ...chosen];

  /*
   * 자동 맞춤인가, 직접 고르기인가.
   *
   * 자동 맞춤이면 아래의 목표·부위·시간은 폼에서 읽지 않고 앱이 정한다
   * (decideAutoSetup). 장비는 두 방식 모두 사람이 고른다 — 오늘 무엇을 쓸 수
   * 있는지는 앱이 알 수 없다.
   */
  const auto = formData.get('mode') === 'auto';

  /*
   * 오늘의 훈련 목표. 목록에 없는 이름이 오면 버리고 지난번 값으로 돌아간다 —
   * 폼은 누구나 고쳐 보낼 수 있고, 목록 밖 이름이 오면 어떤 배분 규칙에도
   * 걸리지 않는 상태가 된다.
   */
  const trainingGoal = readTrainingGoal(formData, user.trainingGoal);

  /*
   * 목표 안에서 좁힌 부위.
   *
   * 목표에 없는 값은 readTrainingFocus 가 비워서 준다. 지난번 값으로
   * 되돌리지 않는다 — 목표를 바꿨는데 옛 부위가 되살아나면, 고른 적 없는
   * 쪽으로 일정이 나온다.
   */
  const trainingFocus = readTrainingFocus(formData, trainingGoal);

  /*
   * 고를 수 있는 시간은 목표마다 다르다.
   *
   * 무게를 드는 두 목표는 45·60·75·90분, 컨디셔닝은 45·60·75분이다. 화면에서도
   * 목표에 맞춰 바꿔 주지만, 폼은 누구나 고쳐 보낼 수 있으므로 여기서 한 번 더
   * 본다. 맞지 않으면 저장해 둔 기본 시간을 그 목표 안에서 가장 가까운 값으로
   * 짚는다 — 컨디셔닝에 90분이 저장돼 있으면 75분이 된다.
   */
  const rawMinutes = Number.parseInt(String(formData.get('minutes') ?? ''), 10);
  const requestedMinutes = minutesChoicesFor(trainingGoal).includes(rawMinutes)
    ? rawMinutes
    : nearestMinutesChoice(
        user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES,
        trainingGoal
      );

  const today = appNow();
  const { facts, plan, state: gathered } = await gatherFactsAndPlan(user, today);

  /*
   * 오늘 체크인을 남긴 날에만 만든다 (2026-09-23 사용자분과 정함).
   *
   * 일정은 오늘 몸 상태를 보고 짠다. 체크인이 없으면 뻐근한 곳도 컨디션도
   * 모른 채 짜게 되고, 무엇보다 오늘 통증이 있어도 멈추지 못한다. 화면도 폼
   * 대신 '체크인 먼저'를 내지만, 폼은 누구나 보낼 수 있어 여기서 한 번 더 막는다.
   */
  if (!facts.condition.today) redirect(returnPath(formData), RedirectType.replace);

  const [
    library,
    recentIds,
    sessionsAgo,
    strengthDates,
    before,
    swappedOut,
    favoriteIds,
    programRow,
    typesToday,
  ] = await Promise.all([
    /* 누가 보든 같은 목록이라 캐시에서 꺼낸다 (lib/library-cache.ts) */
    visibleExercises(),
    recentExerciseIds(user.id, today),
    /*
     * 운동별로 몇 세션 전에 했는가. 오래 안 한 것부터 내보내려고 함께 읽는다.
     * 이것이 없으면 등록순 앞자리 몇 개만 영원히 돈다.
     */
    exerciseSessionsAgo(user.id, today),
    lastStrengthDates(user.id, today),
    /* 지금 저장돼 있는 오늘 일정 — 순서 씨앗 · 오늘 뺀 운동(고르기 점수)에 쓴다 */
    prisma.dailyTrainingSetup.findUnique({
      where: { userId_date: { userId: user.id, date: dateOnly(today) } },
      select: { plan: true },
    }),
    /*
     * 고르기 점수의 재료(2판 P5-j, lib/report/score.ts) — 같은 Promise.all 에 넣어 만들기 한 번에 왕복이 늘지 않게. 최근 60일 '바꿔서 뺀'
     * 횟수(두 번부터 뒤로), 즐겨찾기(앞으로), 진행 중인 근력 프로그램(내일 프로그램과 같은 동작은 뒤로). 60일 셈은 세션 판을 통째로 읽어
     * 무겁다(gather.ts 주석) — 만들기를 누를 때만 돈다.
     */
    swappedOutRecently(user.id, today),
    favoriteExerciseIds(user.id),
    activeProgram(user.id),
    /*
     * 오늘 투구 기록의 세션 종류 — 프로그램이 없는 사람의 팔 예산(오늘 경기 기록이면 팔 플라이오를 뺀다, 2판 P6 검토). 프로그램이 있으면
     * buildProgramDay 가 같은 조회를 한 번 더 하지만, 프로그램 줄을 받기 전이라 갈라 묻지 않는다(같은 Promise.all 이라 왕복은 안 는다).
     */
    pitchTypesToday(user.id, toDateKey(today)),
  ]);

  /*
   * 진행 중인 프로그램을 오늘 상태 한 장에 얹는다 — 고르기 점수가 commitments.program 하나로 '최근에 따르는 프로그램인가 · 다음이 언제인가'를
   * 읽는다(score.ts programNextOf). 장을 만드는 gather.ts 는 화면마다 불려 프로그램 줄을 안 읽는다.
   */
  const program = programScoreInputOf(programRow, library);
  const state = withProgramCommitment(gathered, program.commitment);

  /*
   * 근력 프로그램이 있으면 오늘 프로그램 날을 카드와 같은 길로 정한다(2판 P6-3, lib/program/load.ts buildProgramDay — 판정 · 오늘 판 · 중재).
   * 중재가 오늘을 프로그램 날로 두면(daily.role 'program') 매일 일정은 그날 프로그램 운동 그대로다(사용자 결정 D6 — 보조 운동은 더하지 않는다,
   * programTodayOf). 그 밖의 날은 중재의 하체 · 팔 예산을 지키며 짠다(planBudgetOf — 어제 · 내일 프로그램 큰 하체와 48시간 안에 겹치지 않게).
   * 오늘 자료는 위에서 읽은 facts · 장 · 라이브러리를 그대로 넘긴다(loadTodayCore 를 다시 부르면 같은 것을 두 번 읽는다). 프로그램이 없는
   * 사람은 조회가 늘지 않고 일정도 P6 전과 같다.
   */
  const programDay =
    PROGRAMS_ENABLED && programRow
      ? await buildProgramDay(
          {
            todayKey: toDateKey(today),
            midnight: dateOnly(today),
            facts,
            plan,
            state: gathered,
            library,
            hasCheckinToday: facts.condition.today != null,
            picked: { halted: painStateUnknown(facts) },
            /* 오늘 고른 장비 — 프로그램 날도 오늘 쓸 수 있는 장비로 짠다(2026-10-16 점검 15번, 카드 · 운동 시작과 같은 값) */
            todaySetup: { availableEquipment },
          },
          programRow,
          user
        )
      : null;
  const programToday = programDay ? programTodayOf(programDay) : null;

  /*
   * '다시 만들기'를 누르면 다른 목록이 나오게 한다.
   *
   * 순서를 섞는 씨앗이 날짜뿐이면 같은 날에는 늘 같은 결과가 나온다. 실제로
   * 눌러보니 여덟 개 중 일곱이 그대로였다 — 버튼을 누른 사람 기대와 다르다.
   *
   * 그래서 지금 저장돼 있는 일정을 씨앗에 섞는다. 같은 날이라도 지금 목록과는
   * 다른 것이 나오고, 만들고 나면 그것이 저장되므로 다음에 또 눌러도 계속
   * 달라진다. 아직 아무것도 없으면 사용자 id 와 날짜만으로 간다.
   *
   * 사용자 id 를 맨 앞에 둔다(2026-10-11, 트레이닝 추천 2판 P1). 씨앗이 날짜뿐이면 경력 · 장비 · 목표 ·
   * 시간이 같은 두 사람은 같은 날 글자 하나 안 다른 목록을 받았다(가상 선수 기준선 ④ 168/168일). 맨 앞인
   * 까닭은 theme.ts 의 mix 주석 — 씨앗은 앞에 붙어야 차이가 뒤따르는 계산 전체로 퍼진다.
   */
  const previousIds = readPlanExerciseIds(before?.plan);
  const rotationSeed = [user.id, toDateKey(today), ...previousIds].join('|');

  /*
   * 자동 맞춤이면 여기서 목표·시간을 규칙으로 정한다.
   *
   * 통증인 날(투구 계획이 멈춘 날 — plan.halted)은 정하지 않는다. 2026-10-03 부터 그런 날도 아픈 곳을
   * 피해서 일정을 만드는데(prescription.ts · theme.ts), 고른 목표 · 시간으로 그대로 만든다.
   *
   * 재활 때문에 멈춘 날(plan.rehab — 오늘 통증은 아님)은 정한다. 투구 계획만 멈췄고, 재활 관절의 무거운
   * 운동은 규칙이 이미 뺀다(prescription.ts 의 rehabEasingParts).
   */
  /* 프로그램 날은 목표 · 시간을 정할 것이 없다(그날 운동은 프로그램이 정했다) — 자동 맞춤의 까닭이 프로그램 날 글을 가리지 않게 안 부른다 */
  const made =
    auto && !programToday && (!plan.halted || plan.rehab)
      ? await decideAutoSetup({ user, facts, plan, today, strengthDates })
      : null;
  const choice: {
    goal: string | null;
    focus: string | null;
    minutes: number;
    caution: AutoCaution[];
  } = made
    ? {
        goal: made.goal,
        focus: made.focus,
        minutes: made.minutes,
        caution: made.caution,
      }
    : {
        goal: trainingGoal,
        focus: trainingFocus,
        minutes: requestedMinutes,
        caution: [],
      };
  const built = buildDailyPlan({
    user,
    facts,
    plan,
    library,
    /* 폼을 거쳤으면 최소한 맨몸은 들어 있다. 빈 목록이 될 일이 없다. */
    availableToday: availableEquipment,
    requestedMinutes: choice.minutes,
    trainingGoal: choice.goal,
    trainingFocus: choice.focus,
    caution: choice.caution,
    recentIds,
    sessionsAgo,
    rotationSeed,
    lastLowerKey: strengthDates.lower,
    lastUpperKey: strengthDates.upper,
    /*
     * 고르기 점수의 재료(2판 P5-j) — 기준선 도구의 inputsOf 가 같은 칸을 같은 규칙으로 모은다. 오늘 뺀 운동은 '다시 만들기' 전 일정(before)에서
     * — 60일 셈은 두 번부터라 방금 한 번 뺀 운동을 못 잡는다. 2주 계열은 하체 · 상체 차례와 같은 조회(lastStrengthDates)에서.
     */
    score: {
      programPatterns: program.patterns,
      patternsDone14d: strengthDates.patternsDone14d,
      swappedOut,
      swappedOutToday: swappedOutOf(before?.plan),
      favoriteIds,
    },
    /*
     * 최근 운동 힘듦 급증(2판 P5-e) — 직접 고르기는 본운동 세트를 한 개씩 줄이고, 폼의 '그래도 고른 대로'(overrideEffort)면 그 몫만
     * 되돌린다. 급증인지는 buildDailyPlan 이 오늘 상태(state.load.effortSpike)로 다시 본다 — 폼이 보낸 체크는 급증인 날에만 뜻이 있다.
     * 자동 맞춤은 세트 대신 시간을 한 단계 줄인다(decideAutoFence) — 두 번 줄이지 않게 여기는 끈다. override 처럼 저장하지 않는다.
     */
    reduceForEffort: !auto,
    overrideEffort: !auto && formData.get('overrideEffort') === 'on',
    /*
     * "몸 상태 경고를 봤고 그래도 하겠다."
     *
     * 오늘 하루만의 결정이라 저장하지 않는다. 내일 또 같은 상황이면 경고를
     * 다시 보여주고 다시 고르게 하는 편이 맞다.
     *
     * 자동 맞춤에는 없다. 그쪽은 몸 상태에 맞춰 가고 이유를 말한다 — 그래도
     * 원하는 대로 하고 싶으면 직접 고르기에서 넘기면 된다.
     */
    override: !auto && formData.get('overrideCondition') === 'on',
    /* 오늘 상태 한 장 — 같은 facts · plan 으로 만든 것. 양 조절(본운동 세트 −1, 2판 P5-d · e)이 body · 힘듦 급증을 읽는다 */
    state,
    /*
     * 프로그램 날이면 그날 프로그램 운동 그대로(2판 P6-3 · D6). 프로그램이 있는 사람은 중재의 하체 · 팔 예산을 넘긴다 — 프로그램 날이 아닌 날,
     * 그리고 프로그램 날인데 그날 운동이 모두 안전 거르기에 걸려 매일 일정 길로 갈 때 지킨다(프로그램 날 길에서는 안 읽는다). 프로그램이 없는
     * 사람은 팔 예산만(armOnlyBudgetOf, 2판 P6 검토) — 등판 보호 층(오늘 등판 · 경기 기록 · 세게 던진 날의 팔 플라이오 빼기)은 '그래도 하기'로도
     * 안 풀리는데, 예전에는 프로그램이 있는 사람에게만 걸렸다. 팔을 안 쓴 날은 예전과 글자까지 같은 일정이다.
     */
    programToday,
    budget: programDay
      ? planBudgetOf(programDay.arbitration)
      : armOnlyBudgetOf(armBudget({ state, typesToday })),
  });

  const date = dateOnly(today);

  if (isHalted(built)) {
    // 만들 수 없는 날. 고른 장비만 남기고 일정은 비워 둔다.
    await prisma.dailyTrainingSetup.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: { availableEquipment, plan: Prisma.DbNull, generatedAt: null },
      create: { userId: user.id, date, availableEquipment },
    });
  } else {
    /*
     * 그날 뺀 · 바꾼 기록은 '다시 만들기'가 지우지 않는다(P2, carrySwaps) — 지금 저장돼 있던 일정의 swaps 를 새 일정에
     * 잇는다. 뺀 운동은 새 일정에서 뒤로 간다(2판 P5-j — 오늘 뺀 것은 최근 사흘 무리처럼 맨 뒤 · 60일에 두 번 넘게 뺀 것은 점수 −2,
     * daily-plan.ts). 빼지는 않아서 대신할 것이 없으면 다시 나올 수 있다. 통증으로 멈춘 날(위 DbNull)은
     * 그날 기록이 사라진다 — 드물고 그날은 어차피 처방을 안 한다.
     */
    const withAuto: DailyPlan = carrySwaps(
      made ? { ...built, auto: made } : built,
      before?.plan
    );
    /*
     * 만들 때 본 오늘 상태의 지문(P2, lib/report/plan-fingerprint.ts) — 위에서 일정을 만든 바로 그 facts 로 찍는다. 읽을 때
     * (today-data.ts)가 지금 facts 로 다시 찍어 견준다. buildDailyPlan 안이 아니라 여기서 넣는 까닭은 daily-plan.ts 주석.
     */
    const toSave: DailyPlan = { ...withAuto, fingerprint: fingerprintOf(facts) };
    const saved = {
      availableEquipment,
      plan: toSave as unknown as Prisma.InputJsonValue,
      generatedAt: appNow(),
    };
    await prisma.dailyTrainingSetup.upsert({
      where: { userId_date: { userId: user.id, date } },
      update: saved,
      create: { userId: user.id, date, ...saved },
    });
  }

  /*
   * 이 조건을 앞으로도 쓰겠다고 했으면 기본값으로 굳힌다.
   *
   * 굳히지 않아도 목표는 다음에 열 때 미리 짚어져 있다 — 아래에서 늘 저장하기
   * 때문이다. 여기 체크는 '시간'을 굳히는 뜻이다.
   */
  if (!auto && formData.get('saveDefaults') === 'on') {
    await prisma.user.update({
      where: { id: user.id },
      data: { dailyWorkoutMinutes: requestedMinutes },
    });
  }

  /*
   * 목표는 체크와 상관없이 늘 남긴다. 다음에 폼을 열었을 때 지난번에 고른
   * 것이 짚여 있어야 매번 처음부터 고르지 않는다. 저장해 둔 값은 기본값일
   * 뿐이고, 그날 고른 것이 일정 안에 함께 저장된다.
   */
  /*
   * 자동 맞춤이 정한 목표는 남기지 않는다 (사용자분과 정함). 고른 적 없는 목표가
   * 다음 '직접 고르기'에 짚여 있으면 헷갈린다.
   */
  if (
    !auto &&
    (trainingGoal !== user.trainingGoal || trainingFocus !== user.trainingFocus)
  ) {
    await prisma.user.update({
      where: { id: user.id },
      data: { trainingGoal, trainingFocus },
    });
  }

  const back = returnPath(formData);
  revalidatePath('/today');
  revalidatePath('/training');
  /* 누른 화면으로 돌아간다 — 같은 주소라 기록(뒤로 가기)에 한 칸 더 쌓지 않는다 */
  redirect(back, RedirectType.replace);
}

/**
 * 아이폰 앱(native/src/app/training-today.tsx)의 일정 만들기 — 앱은 폼(FormData)을 못 보내 [이름, 값] 줄로 받아, 웹 폼(components/training-forms.tsx
 * PlanForm 의 자동 맞춤 · 상태 바뀜 띠의 remakeFieldsOf)이 보내는 것과 같은 칸으로 옮겨 같은 만들기(generateTodayPlan)를 탄다. 돌아갈 곳은 늘
 * '/training' — 끝나면 웹처럼 redirect 하고, 앱은 그 답을 '만들었어요'로 받아 다시 읽는다. 글자 아닌 줄은 버린다(검사는 generateTodayPlan 이 한다).
 */
export async function generateAppTodayPlan(fields: unknown) {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  const formData = new FormData();
  if (Array.isArray(fields))
    for (const f of fields)
      if (Array.isArray(f) && typeof f[0] === 'string' && typeof f[1] === 'string' && f[0] !== 'returnTo')
        formData.append(f[0], f[1]);
  formData.set('returnTo', '/training');
  return generateTodayPlan(formData);
}

/**
 * 자동 맞춤 — 오늘 방향(목표·시간)을 규칙 초안으로 정한다(lib/report/auto-setup.ts).
 * 2026-10-07 AI 를 뺐다(사용자) — 예전에는 이 울타리 안에서 AI 가 골랐다.
 *
 * 2판 P5-f(2026-10-12)부터 2주 기록(lastStrengthDates 의 StrengthHistory)을 통째로 받는다 — 하체 · 상체 차례와 한 주에 15분씩
 * 늘리는 시간의 위 끝(weeklyMinutesCap)이 같은 조회에서 온다. 위 끝은 자동 맞춤에만 건다 — 직접 고르기는 사람이 고른 시간 그대로다.
 */
async function decideAutoSetup({
  user,
  facts,
  plan,
  today,
  strengthDates,
}: {
  user: {
    id: string;
    baselineWorkoutFreq: string | null;
    dailyWorkoutMinutes: number | null;
  };
  facts: ReportFacts;
  plan: PitchPlan;
  today: Date;
  strengthDates: StrengthHistory;
}): Promise<AutoRecord> {
  const workout = await trainingLoad(user, today);
  const fence = decideAutoFence({
    facts,
    plan,
    workout,
    defaultMinutes: user.dailyWorkoutMinutes ?? DEFAULT_WORKOUT_MINUTES,
    lastLowerKey: strengthDates.lower,
    lastUpperKey: strengthDates.upper,
    weeklyCap: strengthDates.weeklyMinutesCap,
  });
  return { ...fence.draft, by: 'rules', rules: fence.rules };
}

/* ─────────────────────────── 트레이닝 첫 설정(/training/setup) ─────────────────────────── */

/**
 * 트레이닝 첫 설정의 저장 — 경력 · 웨이트 횟수 · 장비 · 하루 운동 시간 · [던지는 손](숨은 칸 모양, lib/training/setup-answers.ts)
 * 을 한 번에. 처음 가입한 사람은 이 저장이 트레이닝 탭의 잠금을 푼다 — 잠금은 trainingSetupAt 의 유무(lib/feature-locks.ts
 * featureLocks). 이미 마친 사람이 다시 와서 저장하면 값만 바뀌고 그 시각은 처음 것을 둔다.
 *
 * 검사는 화면과 같은 함수(checkTrainingAnswers) — 경력은 TRAINING_LEVELS 안, 횟수는 validateWorkoutBaseline, 분은
 * WORKOUT_MINUTES_CHOICES 안, 손은 있을 때만 THROWING_HANDS 안. 목록 밖의 값은 읽을 때 비워져 '골라 주세요'가 된다 —
 * 이 값들로 부하 기준선이 만들어지고 운동이 걸러지니 저장하면 안 된다.
 *
 * 던지는 손은 계정에 없을 때만 받고(화면도 그때만 묻는다), 있을 때는 건드리지 않는다 — 투구 기록 설정이 맡는 값이다.
 * 장비는 맨몸을 앞에 붙여 저장한다(readOwnedEquipment 와 같은 규칙). 하나도 안 골랐으면 ['맨몸'].
 *
 * field 는 막힌 칸 — 화면이 그 칸이 있는 화면으로 되돌아간다.
 */
export async function finishTrainingSetup(
  fields: [string, string][]
): Promise<{ ok: true } | { ok: false; error: string; field?: string }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: '로그인이 필요해요.' };
  const form = formOfRows(fields);
  if (!form) {
    return { ok: false, error: '답이 올바르지 않아요. 새로고침한 뒤 다시 해 주세요.' };
  }
  const answers = readTrainingAnswers(form);
  const askHand = user.throwingHand == null;
  const bad = checkTrainingAnswers(answers, { askHand });
  if (bad) return { ok: false, ...bad };
  /* 가입 문진과 같은 검사 — 이 값으로 운동 부하의 기준선을 세운다(lib/baseline.ts) */
  const workout = validateWorkoutBaseline({
    baselineWorkoutFreq: answers.baselineWorkoutFreq ?? '',
  });
  if ('error' in workout) return { ok: false, ...workout };

  await prisma.user.update({
    where: { id: user.id },
    data: {
      trainingLevel: answers.trainingLevel,
      baselineWorkoutFreq: workout.value.baselineWorkoutFreq,
      ownedEquipment: ownedEquipmentToSave(answers),
      dailyWorkoutMinutes: Number(answers.dailyWorkoutMinutes),
      ...(askHand && answers.throwingHand ? { throwingHand: answers.throwingHand } : {}),
      trainingSetupAt: user.trainingSetupAt ?? appNow(),
    },
  });

  revalidatePath('/training');
  revalidatePath('/today');
  /* 막대 · 탭의 트레이닝 잠금(흐림 · 자물쇠)이 걷혀야 한다 — 레이아웃이 내려보낸다 */
  revalidatePath('/', 'layout');
  return { ok: true };
}

/**
 * 진행 중인 근력 프로그램 줄 → 오늘 상태 한 장에 얹을 약속(day-state.ts withProgramCommitment)과 다음 일차의 동작 열쇠(program.ts
 * patternsOfProgramDay — 고정 운동을 알면 그 운동의 열쇠로). 고르기 점수(2판 P5-j)의 프로그램 항목이 읽는다. 줄이 없거나 모르는 키면
 * 약속 없음 · 빈 집합. 'use server' 파일이라 내보내지 않는다(내보내면 브라우저가 부를 수 있는 동작이 된다).
 */
function programScoreInputOf(
  row: ProgramRow | null,
  library: readonly CachedExercise[]
): { commitment: ProgramCommitmentInput | null; patterns: Set<string> } {
  if (!row) return { commitment: null, patterns: new Set() };
  const plan = parseProgram(row.programKey);
  const pinned = readPinned(row.pinned);
  const byId = new Map(library.map((e) => [e.id, e]));
  return {
    commitment: {
      key: row.programKey,
      nextDay: row.nextDay,
      totalDays: plan?.totalDays ?? null,
      lastDoneDate: row.lastDoneDate
        ? row.lastDoneDate.toISOString().slice(0, 10)
        : null,
    },
    patterns: patternsOfProgramDay(plan, row.nextDay, (v) => {
      const id = pinned[v];
      return id ? byId.get(id) : undefined;
    }),
  };
}
