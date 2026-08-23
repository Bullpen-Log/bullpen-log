/**
 * AI 트레이닝 자가 시험.
 *
 *   npm run training:test
 *
 * 화면이 하는 일을 그대로 코드로 밟아본다.
 *   장비 거르기 → 경력 거르기 → 안전 필터 → 테마 정하기 → 시간에 맞춰 고르기
 *
 * 확인 스크립트(theme:check 등)가 "보기에 그럴듯한가"를 보여준다면, 이 파일은
 * "지켜야 할 약속이 깨졌는가"를 본다. 통과와 실패가 분명해야 해서, 사람이 눈으로
 * 보고 판단할 일을 남기지 않는다.
 *
 * 운동 자료는 실제 DB에서 가져오고, 사람 쪽 자료(체크인·투구일지)는 여기서
 * 지어낸다. 실제 사용자 기록에 기대면 그 사람이 기록을 지웠을 때 시험이 깨지는데,
 * 그건 코드가 잘못된 것이 아니다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { buildFacts, type CheckinLike } from '../lib/report/facts.ts';
import type { PitchLogLike } from '../lib/pitch-stats.ts';
import { buildPitchPlan } from '../lib/report/plan.ts';
import { selectCandidates } from '../lib/report/prescription.ts';
import { equipmentForToday, filterByEquipment } from '../lib/report/equipment.ts';
import {
  TRAINING_GOALS,
  TRAINING_LEVELS,
  filterByLevel,
  readTrainingProfile,
} from '../lib/report/personalize.ts';
import {
  WORKOUT_MINUTES_CHOICES,
  decideTheme,
  effectiveMinutes,
  estimateMinutes,
  pickForTheme,
  SLOT_ORDER,
  type ThemeKey,
} from '../lib/report/theme.ts';
import { intensityLevel } from '../lib/exercise-meta.ts';
import {
  buildDailyPlan,
  isHalted,
  readDailyPlan,
} from '../lib/report/daily-plan.ts';

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) {
    passed++;
    console.log(`  OK   ${name}${detail ? ' — ' + detail : ''}`);
  } else {
    failed++;
    console.log(`  실패 ${name}${detail ? ' — ' + detail : ''}`);
  }
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const library = await prisma.exerciseVideo.findMany({ orderBy: { createdAt: 'asc' } });
await prisma.$disconnect();

/* 날짜는 고정값이라 언제 돌려도 같은 결과가 나온다. */
const TODAY = new Date('2026-06-15T09:00:00+09:00');
const dayBefore = (n: number) => new Date(TODAY.getTime() - n * 86400000).toISOString();

type Person = {
  condition?: number;
  pain?: boolean;
  /** 최근 며칠간 하루 투구수 (0번째가 어제) */
  pitches?: number[];
  age?: number | null;
  trainingLevel?: string | null;
  /**
   * 가입 문진으로 추정한 하루 평균 부하.
   *
   * 이 값이 없으면 기록이 28일 쌓이기 전에는 부하 지수가 아예 안 나온다.
   * 처음에 빠뜨렸더니 부하 위험 구간 시험이 '구간을 못 냈으므로 통과'로
   * 조용히 넘어갔다. 시험이 아무것도 안 보면서 통과하는 것이 가장 나쁘다.
   */
  baselineDailyLoad?: number;
};

function factsFor(p: Person) {
  const pitches = p.pitches ?? [40, 0, 35, 0, 40, 0, 30];
  return buildFacts({
    nickname: '시험',
    age: p.age === undefined ? 22 : p.age,
    heightCm: 180,
    trainingLevel: p.trainingLevel ?? null,
    baselineDailyLoad: p.baselineDailyLoad ?? 100,
    today: TODAY,
    logs: pitches.map<PitchLogLike>((count, i) => ({
      date: dayBefore(i + 1),
      pitchCount: count,
      // 강도는 1~10 숫자다. 부하 지수가 여기서 나오므로 값이 어긋나면 안 된다.
      intensity: 7,
      maxVelocity: 130,
      avgVelocity: 120,
    })),
    checkins:
      p.condition == null
        ? []
        : [
            {
              date: dayBefore(0).slice(0, 10),
              condition: p.condition,
              sleep: '보통',
              shoulder: p.pain ? '통증' : '괜찮음',
              elbow: '괜찮음',
              wrist: '괜찮음',
              lowerBack: '괜찮음',
              lowerBody: '괜찮음',
              preferredParts: [],
            } satisfies CheckinLike,
          ],
    memos: [],
  });
}

/** 화면이 하는 일을 그대로 밟는다. */
function planFor({
  person = {} as Person,
  owned = [] as string[],
  level = null as string | null,
  goal = null as string | null,
  minutes = 45,
  doneIds = new Set<string>(),
}) {
  const facts = factsFor({ ...person, trainingLevel: level });
  const plan = buildPitchPlan(facts);
  const usable = filterByEquipment(library, owned);
  const leveled = filterByLevel(usable.pool, level);
  const picked = selectCandidates({ facts, plan, library: leveled.pool });

  // 화면과 같이, 이미 완료한 운동은 걸러진 뒤에도 목록에 남긴다.
  const inCandidates = new Set(picked.candidates.map((ex) => ex.id));
  const candidates = [
    ...picked.candidates,
    ...library.filter((ex) => doneIds.has(ex.id) && !inCandidates.has(ex.id)),
  ];

  const theme = decideTheme({ facts, plan, lastLowerKey: null, lastUpperKey: null });
  const themed = pickForTheme({
    candidates,
    theme: theme.key,
    minutes: effectiveMinutes(theme.key, minutes),
    doneIds,
    goal,
  });
  return { facts, plan, picked, theme, themed, usable, leveled };
}

console.log('\n[안전] 몸이 안 좋은 날 무거운 운동이 섞이지 않는가');
{
  const { picked, theme } = planFor({ person: { condition: 3 } });
  const tooHard = picked.candidates.filter((e) => intensityLevel(e.intensity) > 3);
  check(
    '컨디션 3/10 → 무게 드는 운동 없음',
    tooHard.length === 0,
    `남은 후보 ${picked.candidates.length}개`
  );
  check('컨디션 3/10 → 회복 테마', theme.key === 'recovery', theme.label);
}
{
  const { picked, plan } = planFor({ person: { condition: 6, pain: true } });
  check(
    '오늘 통증 → 처방 자체를 멈춤',
    plan.halted && picked.halted && picked.candidates.length === 0
  );
}
{
  // 평소 조금만 던지던 사람이 갑자기 많이 던지면 부하가 위험 구간으로 간다.
  const spike = [200, 190, 180, 170, 190, 180, 200];
  const { facts, picked } = planFor({
    person: { condition: 8, pitches: spike, baselineDailyLoad: 20 },
  });
  const tooHard = picked.candidates.filter((e) => intensityLevel(e.intensity) > 2);
  check('부하가 위험 구간으로 계산됨', facts.load.zone === 'danger', String(facts.load.zone));
  check('부하 위험 구간 → 회복 수준까지만', tooHard.length === 0, `강도 3 이상 ${tooHard.length}개`);
}
{
  /*
   * 반대로, 평소만큼 던지는 사람은 강도 제한이 없어야 한다.
   *
   * 부하 지수 = 최근 부하 / 평소 부하 이므로, 문진 추정치를 실제 투구량에
   * 맞춰야 '적정' 구간이 나온다. 하루 부하는 투구수 × 강도라, 이틀에 한 번
   * 60개씩 강도 7로 던지면 하루 평균 150쯤이 된다.
   */
  const steady = [60, 0, 55, 0, 60, 0, 55];
  const { facts, picked } = planFor({
    person: { condition: 8, pitches: steady, baselineDailyLoad: 150 },
  });
  const hasHeavy = picked.candidates.some((e) => intensityLevel(e.intensity) >= 4);
  check(
    `부하 ${facts.load.zone} 구간 → 무게 드는 운동이 남아 있음`,
    hasHeavy,
    `후보 ${picked.candidates.length}개`
  );
}
{
  const { picked } = planFor({ person: { age: 14, condition: 8 } });
  const maxed = picked.candidates.filter((e) => intensityLevel(e.intensity) > 4);
  check('만 14세(성장기) → 최대 강도 제외', maxed.length === 0);
}
{
  const { picked } = planFor({ person: { condition: 8 }, level: '입문' });
  const maxed = picked.candidates.filter((e) => intensityLevel(e.intensity) > 4);
  const hard = picked.candidates.filter(
    (e) => e.difficulty === '상급' || e.difficulty === '중급'
  );
  check('경력 입문 → 최대 강도 제외', maxed.length === 0);
  check('경력 입문 → 초급 난이도만', hard.length === 0, `후보 ${picked.candidates.length}개`);
}

console.log('\n[장비] 못 하는 운동이 나오지 않는가');
for (const owned of [['맨몸'], ['맨몸', '밴드'], ['맨몸', '밴드', '덤벨']]) {
  const { themed } = planFor({ person: { condition: 8 }, owned });
  const impossible = themed.picks.filter((p) =>
    p.exercise.equipment.some((e: string) => e !== '맨몸' && !owned.includes(e))
  );
  check(
    `${owned.join('+')} → 없는 장비 운동 0개`,
    impossible.length === 0,
    `운동 ${themed.picks.length}개`
  );
}
{
  const { usable } = planFor({ person: { condition: 8 }, owned: [] });
  check('장비를 안 골랐으면 아무것도 안 뺀다', usable.pool.length === library.length);
}

console.log('\n[시간] 고른 시간에 맞는가');
for (const minutes of WORKOUT_MINUTES_CHOICES) {
  const { themed, theme } = planFor({ person: { condition: 8 }, minutes });
  const target = effectiveMinutes(theme.key, minutes);
  const gap = Math.abs(themed.estimatedMinutes - target) / target;
  check(
    `${minutes}분 요청 → ${themed.estimatedMinutes}분`,
    gap <= 0.15,
    `${theme.label}, 오차 ${Math.round(gap * 100)}%`
  );
}

console.log('\n[목표] 고른 목표가 실제로 배분을 바꾸는가');
{
  const minutesOf = (goal: string, slot: string) => {
    const { themed } = planFor({ person: { condition: 8 }, goal });
    return themed.picks
      .filter((p) => p.slot === slot)
      .reduce((sum, p) => sum + estimateMinutes(p.exercise), 0);
  };

  const pairs: [string, string, string][] = [
    ['armcare', '부상 방지', '암케어'],
    ['main', '근력 향상', '본운동'],
    ['prehab', '부상 방지', '보강'],
  ];
  for (const [slot, goal, label] of pairs) {
    const base = minutesOf('균형 잡힌 관리', slot);
    const withGoal = minutesOf(goal, slot);
    check(
      `${goal} → ${label} 시간이 늘어남`,
      withGoal > base,
      `${base.toFixed(1)}분 → ${withGoal.toFixed(1)}분`
    );
  }
}
{
  // 목표를 바꿨다고 전체 시간이 달라지면 "45분"이 거짓말이 된다.
  const totals = TRAINING_GOALS.map((g) => {
    const { themed } = planFor({ person: { condition: 8 }, goal: g.name });
    return themed.estimatedMinutes;
  });
  const worst = Math.max(...totals.map((t) => Math.abs(t - 45) / 45));
  check('목표를 바꿔도 전체 시간은 45분 근처', worst <= 0.15, `${totals.join(' / ')}분`);
}

console.log('\n[완료 표시] 체크한 운동이 사라지지 않는가');
{
  /*
   * 하체 운동을 마친 뒤 컨디션 저하로 회복 테마가 되는 경우.
   * 회복 테마에는 본운동 구간이 없어서, 예전에는 이 운동이 목록에서 사라져
   * 잘못 누른 체크를 풀 수 없었다.
   */
  const lower = library.find((e) => e.category === '하체 스트렝스')!;
  const { themed, theme } = planFor({
    person: { condition: 3 },
    doneIds: new Set([lower.id]),
  });
  check('회복 테마인지 확인', theme.key === 'recovery');
  check(
    '완료한 하체 운동이 목록에 남아 있다',
    themed.picks.some((p) => p.exercise.id === lower.id),
    lower.title
  );
  const slots = new Set(SLOT_ORDER);
  check(
    '모든 운동이 실제로 있는 구간에 들어간다',
    themed.picks.every((p) => slots.has(p.slot))
  );
}
{
  // 모든 테마에서, 완료한 운동은 어떤 카테고리든 목록에 남아야 한다.
  const themes: ThemeKey[] = ['lower', 'upper', 'assist', 'recovery'];
  const cats = [...new Set(library.map((e) => e.category))];
  let lost = 0;
  for (const t of themes) {
    for (const cat of cats) {
      const ex = library.find((e) => e.category === cat)!;
      const { picks } = pickForTheme({
        candidates: library,
        theme: t,
        minutes: 45,
        doneIds: new Set([ex.id]),
      });
      if (!picks.some((p) => p.exercise.id === ex.id)) lost++;
    }
  }
  check(
    `테마 ${themes.length}가지 × 카테고리 ${cats.length}가지 모두 남는다`,
    lost === 0,
    `잃어버린 것 ${lost}개`
  );
}

console.log('\n[일정 만들기] 눌러야 생기고, 만든 것은 그대로 남는가');
{
  const make = (person: Person = { condition: 8 }, minutes = 45) => {
    const facts = factsFor(person);
    return buildDailyPlan({
      user: { ownedEquipment: [], trainingLevel: null, trainingGoal: null },
      facts,
      plan: buildPitchPlan(facts),
      library,
      availableToday: null,
      requestedMinutes: minutes,
      recentIds: new Set<string>(),
      lastLowerKey: null,
      lastUpperKey: null,
    });
  };

  const built = make();
  check('만들면 일정이 나온다', !isHalted(built));
  if (!isHalted(built)) {
    check('운동이 담겨 있다', built.picks.length > 0, `${built.picks.length}개`);
    check('근거도 함께 담긴다', built.basis.length > 0);
    check(
      '고른 시간이 남아 있다',
      built.requestedMinutes === 45,
      `${built.requestedMinutes}분 → 실제 ${built.estimatedMinutes}분`
    );

    /*
     * 저장했다 다시 읽어도 같아야 한다. Json 으로 오갈 때 모양이 깨지면
     * 화면에서 값이 비어 터진다.
     */
    const roundTrip = readDailyPlan(JSON.parse(JSON.stringify(built)));
    check('저장했다 읽어도 그대로다', roundTrip != null);
    check(
      '읽은 것의 운동이 같다',
      roundTrip?.picks.map((p) => p.exerciseId).join(',') ===
        built.picks.map((p) => p.exerciseId).join(',')
    );
  }

  // 같은 조건이면 몇 번을 만들어도 같아야 한다. 새로고침으로 바뀌면 안 된다.
  const again = make();
  check(
    '같은 조건이면 같은 일정이 나온다',
    !isHalted(built) &&
      !isHalted(again) &&
      built.picks.map((p) => p.exerciseId).join(',') ===
        again.picks.map((p) => p.exerciseId).join(',')
  );

  // 통증인 날에는 만들어지지 않는다. 빈 일정을 남기면 '이미 만든 날'이 된다.
  const painDay = make({ condition: 6, pain: true });
  check('통증인 날에는 일정이 만들어지지 않는다', isHalted(painDay));

  // 모양이 아닌 것은 없는 것으로 본다 — 옛 기록을 억지로 읽으면 화면이 터진다.
  check('모양이 다른 기록은 없는 것으로 본다', readDailyPlan({ version: 0 }) === null);
  check('빈 값도 없는 것으로 본다', readDailyPlan(null) === null);
}

console.log('\n[오늘 장비] 날마다 다른 장비가 반영되는가');
{
  const owned = ['맨몸', '밴드', '덤벨', '바벨', '벤치'];

  check(
    '오늘 것을 안 골랐으면 가진 것을 다 쓴다',
    equipmentForToday(owned, null).join(',') === owned.join(','),
    equipmentForToday(owned, null).join(',')
  );
  check(
    '빈 목록도 안 고른 것으로 본다',
    equipmentForToday(owned, []).length === owned.length
  );

  /*
   * 설정에서 장비를 뺐는데 오늘 목록에는 남아 있는 경우.
   * 그대로 두면 없는 기구로 하는 운동이 나온다.
   */
  const today = equipmentForToday(owned, ['맨몸', '밴드', '케이블']);
  check(
    '가진 것이 아닌 장비는 오늘 목록에서도 뺀다',
    !today.includes('케이블') && today.includes('밴드'),
    today.join(',')
  );

  check(
    '가진 장비를 아직 안 골랐으면 아무것도 안 거른다',
    equipmentForToday([], ['밴드']).length === 0
  );

  // 헬스장 가는 날과 집에서 하는 날의 훈련이 실제로 달라야 한다.
  const gymPlan = planFor({ person: { condition: 8 }, owned });
  const homeOnly = equipmentForToday(owned, ['맨몸', '밴드']);
  const homePlan = planFor({ person: { condition: 8 }, owned: homeOnly });
  const usesGymGear = homePlan.themed.picks.filter((p) =>
    p.exercise.equipment.some((e: string) => e !== '맨몸' && !homeOnly.includes(e))
  );
  check('오늘 못 쓰는 장비 운동은 안 나온다', usesGymGear.length === 0);
  check(
    '헬스장 가는 날과 집에서 하는 날의 후보가 다르다',
    homePlan.picked.candidates.length < gymPlan.picked.candidates.length,
    `집 ${homePlan.picked.candidates.length}개 · 헬스장 ${gymPlan.picked.candidates.length}개`
  );
  check('장비가 줄어도 훈련은 나온다', homePlan.themed.picks.length > 0);
}

console.log('\n[프로필 저장] 폼에서 온 값을 제대로 걸러내는가');
{
  const form = new FormData();
  form.set('trainingLevel', '중급');
  form.set('trainingGoal', '구속 향상');
  for (const v of ['밴드', '덤벨', '바벨', '없는장비']) form.append('ownedEquipment', v);
  const saved = readTrainingProfile(form);
  check('경력을 그대로 저장', saved.trainingLevel === '중급', String(saved.trainingLevel));
  check('목표를 그대로 저장', saved.trainingGoal === '구속 향상', String(saved.trainingGoal));
  check('맨몸은 항상 들어간다', saved.ownedEquipment.includes('맨몸'));
  check(
    '목록에 없는 장비는 버린다',
    !saved.ownedEquipment.includes('없는장비'),
    saved.ownedEquipment.join(',')
  );
}
{
  // 아무것도 안 고르고 저장한 경우
  const empty = readTrainingProfile(new FormData());
  check('경력을 안 고르면 비워 둔다', empty.trainingLevel === null);
  check('목표를 안 고르면 비워 둔다', empty.trainingGoal === null);
  check(
    '장비를 안 고르면 맨몸만 남는다',
    empty.ownedEquipment.length === 1 && empty.ownedEquipment[0] === '맨몸',
    empty.ownedEquipment.join(',')
  );
  /*
   * "맨몸만 있다"와 "아직 안 골랐다"는 달라야 한다. 둘을 같게 두면, 프로필을
   * 한 번도 안 연 사람과 맨몸밖에 없는 사람이 같은 취급을 받는다.
   */
  check(
    '맨몸만 있는 것과 안 고른 것이 구별된다',
    filterByEquipment(library, empty.ownedEquipment).pool.length < library.length
  );
}
{
  // 목록에 없는 이름을 억지로 보낸 경우
  const bad = new FormData();
  bad.set('trainingLevel', '초고수');
  bad.set('trainingGoal', '아무거나');
  const saved = readTrainingProfile(bad);
  check('목록에 없는 경력은 버린다', saved.trainingLevel === null);
  check('목록에 없는 목표는 버린다', saved.trainingGoal === null);
}

console.log('\n[가장 빠듯한 경우] 그래도 훈련이 나오는가');
{
  let empty = 0;
  for (const level of TRAINING_LEVELS) {
    for (const goal of TRAINING_GOALS) {
      const { themed } = planFor({
        person: { condition: 8 },
        owned: ['맨몸'],
        level: level.name,
        goal: goal.name,
        minutes: 30,
      });
      if (themed.picks.length === 0) empty++;
    }
  }
  check(
    `맨몸만 · 30분 · 경력 ${TRAINING_LEVELS.length}가지 × 목표 ${TRAINING_GOALS.length}가지`,
    empty === 0,
    `빈 훈련 ${empty}개`
  );
}

console.log(`\n${passed}개 통과, ${failed}개 실패`);
process.exit(failed === 0 ? 0 : 1);
