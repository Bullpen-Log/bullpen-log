/**
 * "한 번 한 운동이 알맞은 때에 다시 나오는가" 를 확인한다.
 *
 *   npm run rotation:check
 *
 * 왜 재나. 무게를 올릴지 횟수를 늘릴지는 지난번 숫자를 봐야 정하는데, 같은
 * 운동이 다시 안 나오면 견줄 것이 없다. 고치기 전에는 본운동의 6~8%만
 * 견줄 것이 있었다.
 *
 * 두 사람으로 잰다. 매일 하는 사람과 주 2~3회 하는 사람 — 앞서 한쪽으로만
 * 재고 결론을 낸 적이 있어서다. 같은 설정이 한쪽은 넉 달에 167개, 다른 쪽은
 * 81개를 썼다. 세션으로 세는 지금 규칙은 둘에게 비슷하게 나와야 맞다.
 *
 * 앱과 똑같은 함수(pickForTheme)를 부른다. 여기서 따로 고르면 확인하는
 * 의미가 없다 — 앱은 앱대로, 확인은 확인대로 맞다고 나올 수 있어서다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pickForTheme, type ThemeKey } from '../lib/report/theme.ts';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const library = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  orderBy: { createdAt: 'asc' },
});
await prisma.$disconnect();

/** 최근 며칠 안에 한 것은 뒤로 — lib/report/today-pick.ts 의 RECENT_DAYS 와 같다 */
const RECENT_DAYS = 3;

/* ── 넘겨야 하는 선 ────────────────────────────────────────── */
/** 본운동에서 "지난번 몇 kg" 를 보여줄 수 있어야 하는 최소 비율 */
const MIN_COMPARABLE = 0.6;
/**
 * 첫 서른 세션에서도 이만큼은 견줄 수 있어야 한다.
 *
 * 1년치 평균만 보다가 놓친 적이 있다. 한 줄로 세우는 규칙은 1년 평균 90%가
 * 나왔는데 처음 서른 세션에는 7%였다 — 재등장이 마흔 세션 뒤에나 시작됐다.
 * 사람이 계속 쓸지 정하는 것은 그 처음 몇 달이므로 따로 잰다.
 */
const MIN_EARLY_COMPARABLE = 0.35;
/** 처음 몇 세션까지를 '초반'으로 볼 것인가 */
const EARLY_SESSIONS = 30;
/**
 * 한 운동이 1년에 몇 번까지 나와도 되는가.
 *
 * 예전에는 '1년에 쓰는 운동이 250개 이상'으로 봤다. 그 숫자는 한 세션에
 * 열두어 개가 들어가던 때 정한 것이다. 세션이 여섯에서 아홉 개로 줄자
 * 1년에 만나는 가짓수도 따라 줄어, 규칙이 굳지 않았는데도 걸렸다.
 *
 * 재는 것을 바꾼다. '몇 가지를 만났나'가 아니라 '같은 것을 몇 번 만나나'다.
 * 라이브러리가 굳는다는 것은 좁은 목록을 돌려 쓴다는 뜻이고, 그것은 뽑은
 * 횟수를 가짓수로 나누면 바로 드러난다. 세션 크기가 달라져도 뜻이 흔들리지
 * 않는다.
 *
 * 지금은 매일 하는 사람이 8회, 사회인이 5회쯤이다. 열두 번을 넘으면 스무 개
 * 남짓을 돌려 쓰고 있다는 뜻이라 그때 잡는다.
 */
const MAX_YEARLY_REUSE = 12;
/**
 * 하체 본운동 중 힌지(고관절 접기) 계열이 차지해야 하는 최소 비율.
 *
 * 처음에는 '무릎 계열만 나온 날'을 셌다. 그런데 45분이면 본운동이 평균 1.9개라
 * 한 개뿐인 날이 적지 않고, 그런 날은 하나가 스쿼트면 그냥 '무릎만'이 된다 —
 * 균형을 맞출 자리가 없는 날을 세고 있었던 셈이다.
 *
 * 하루가 아니라 며칠에 걸친 균형을 본다.
 *
 * 문턱은 '고르게 나뉜 수준'에 둔다. 하체 본운동의 계열은 힌지·스쿼트·런지·카프
 * 넷이므로 고르게 나오면 25%다. 후보 풀에서 힌지는 40%지만 그만큼 뽑히지는
 * 않는다 — 같은 계열이 몰리지 않게 한 바퀴 미루는 규칙이 있어서, 뽑히는 쪽은
 * 풀의 비율이 아니라 고른 쪽으로 끌린다. 풀 비율을 문턱으로 두면 규칙이
 * 제대로 도는데도 걸린다.
 *
 * 그래서 '고르게(25%)에서 크게 밑돌지 않는가'로 본다. 힌지가 빠지기 시작하면
 * 20% 아래로 내려가므로 그때 잡힌다.
 */
const MIN_HINGE_SHARE = 0.23;

/*
 * 왜 후보 풀 비율(36%)보다 낮게 잡나.
 *
 * 한 해를 한 번 돌린 값이라 실제로 30~39% 사이에서 흔들린다. 36%에 맞춰
 * 놓으면 아무것도 안 고쳐도 어느 날은 실패한다 — 그런 검사는 곧 무시하게 된다.
 * 진짜 무너진 것(20%대 초반 아래)을 잡을 자리에 선을 긋는다.
 */
/**
 * 힌지가 한 번도 안 나오고 지나가도 되는 하체날 연속 길이의 상한.
 *
 * 비율이 맞아도 몰려 있으면 안 되니 함께 본다. 다만 이쪽은 느슨하게 잡는다 —
 * 45분이면 본운동이 평균 1.9개라, 비율이 맞아도 우연히 몇 번 이어질 수 있다.
 * 진짜 지켜야 하는 것은 위의 비율이고, 이것은 크게 벌어지는 것만 잡는다.
 *
 * '오래 안 한 계열을 먼저 본다'는 규칙도 넣어 봤는데 거꾸로 갔다. 계열의
 * '가장 최근'으로 재면 운동이 많은 계열이 불리해진다 — 힌지 55개 중 하나만
 * 최근에 했어도 힌지 전체가 뒤로 밀려, 비율이 49%에서 10%로 떨어졌다.
 */
const MAX_HINGE_DROUGHT = 5;

/**
 * 하체 본운동이 한쪽으로 몰렸는가를 재는 기준.
 *
 * 고관절을 접는 계열(힌지)이 얼마나 들어가는지를 본다. 구속은 뒤쪽 사슬 —
 * 햄스트링과 둔근 — 에서 나오는데, 무릎 계열(스쿼트·런지)로만 채우면 그쪽이
 * 통째로 빠진다.
 */
const HINGE_PATTERN = '힌지';

/*
 * 한 해만 돌리면 답이 운에 달린다.
 *
 * 뽑는 순서는 날짜를 씨앗으로 섞기 때문에, 시작 연도가 다르면 같은 규칙이라도
 * 다른 해가 나온다. 사회인 쪽은 하체날이 쉰 날뿐이라 힌지 비율이 해마다
 * 19%에서 47%까지 널뛰었다 — 규칙을 고치지 않아도 통과와 실패가 갈렸다.
 * 여러 해를 돌려 평균을 본다. 이래야 재는 것이 규칙이지 운이 아니다.
 */
const YEARS = 8;

const dayIn = (startYear: number) => (n: number) =>
  new Date(Date.UTC(startYear, 0, 5) + n * 86400000).toISOString().slice(0, 10);
const gap = (from: string, to: string) =>
  (Date.parse(to) - Date.parse(from)) / 86400000;

/**
 * 사회인야구 선수의 한 해.
 *
 * 처음 6주는 의욕이 있어 주 3회, 그 뒤 두 주는 통째로 쉬고(야근·여행),
 * 그 뒤로는 주 2회에 다섯 번에 한 번은 빠진다. 실제로 흔한 모양이다.
 */
function irregularDay(i: number): boolean {
  const week = Math.floor(i / 7) % 17;
  const d = i % 7;
  if (week === 6 || week === 7) return false;
  if (week < 6) return d === 1 || d === 3 || d === 5;
  if (!(d === 2 || d === 6)) return false;
  return (i * 2654435761) % 5 !== 0;
}

type Result = {
  sessions: number;
  comparable: number;
  earlyComparable: number;
  coverage: number;
  /** 뽑은 횟수를 가짓수로 나눈 값 — 같은 운동을 1년에 몇 번 만나나 */
  reuse: number;
  hingeShare: number;
  /** 상체 스트렝스가 둘 이상인 날 중, 밀기와 당기기가 둘 다 들어간 비율 */
  upperBalance: number;
  upperDaysWithTwo: number;
  upperDays: number;
  /** 한 해 안에서 힌지 없이 이어진 하체날의 최대 — 여러 해면 그 평균 */
  drought: number;
  /** 여러 해 중 가장 나빴던 해의 값 */
  droughtWorst: number;
  lowerDays: number;
  meanSessionGap: number | null;
};

/**
 * theme.ts 의 mix 와 같은 식(FNV-1a).
 *
 * 예전 규칙을 되살려 견주는 데만 쓴다. 같은 순서가 나와야 견줄 수 있다.
 */
function mix(id: string, seed: string): number {
  let h = 0x811c9dc5;
  const text = `${id}:${seed}`;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * 고치기 전의 순서 규칙.
 *
 * 안 해본 것이 언제나 앞 → 예전에 한 것은 오래된 날짜부터 → 최근 사흘은 맨 뒤.
 * pickForTheme 은 recentIds·sessionsAgo·rotationSeed 를 모두 비우면 후보 순서를
 * 그대로 쓰므로(orderCandidates 의 첫 줄), 여기서 매긴 순서가 그대로 들어간다.
 *
 * 새 규칙이 동작 편중을 더 나쁘게 만들지 않았는지 견주려고 남겨 둔다.
 */
function orderOldWay(
  today: string,
  lastDay: Map<string, string>,
  recentIds: Set<string>
) {
  const rank = (ex: (typeof library)[number], index: number): [number, number] => {
    if (recentIds.has(ex.id)) return [2, index];
    const last = lastDay.get(ex.id);
    if (last == null) return [0, mix(ex.id, today)];
    return [1, Number(last.replace(/-/g, ''))];
  };
  return library
    .map((ex, index) => ({ ex, key: rank(ex, index), index }))
    .sort((a, b) =>
      a.key[0] !== b.key[0]
        ? a.key[0] - b.key[0]
        : a.key[1] !== b.key[1]
          ? a.key[1] - b.key[1]
          : a.index - b.index
    )
    .map((v) => v.ex);
}

function run(days: number, regular: boolean, oldWay = false, startYear = 2026): Result {
  const day = dayIn(startYear);
  /** 운동 → 마지막으로 한 세션 번호 (1부터) */
  const lastSession = new Map<string, number>();
  /** 운동 → 마지막으로 한 날 (최근 사흘 규칙에 쓴다) */
  const lastDay = new Map<string, string>();
  const seen = new Set<string>();
  const returns: number[] = [];
  let session = 0;
  let mainPicks = 0;
  let totalPicks = 0;
  let comparable = 0;
  let earlyMain = 0;
  let earlyComparable = 0;
  let lowerDays = 0;
  let lowerMain = 0;
  let hingeMain = 0;
  let upperDays = 0;
  let upperDaysWithTwo = 0;
  let upperBalanced = 0;
  let drought = 0;
  let worstDrought = 0;

  for (let i = 0; i < days; i++) {
    if (!regular && !irregularDay(i)) continue;
    const today = day(i);
    session++;
    const theme: ThemeKey = session % 2 === 1 ? 'lower' : 'upper';

    const recentIds = new Set(
      [...lastDay.entries()]
        .filter(([, d]) => gap(d, today) <= RECENT_DAYS)
        .map(([id]) => id)
    );
    // gather.ts 의 exerciseSessionsAgo 와 같은 뜻 — 몇 세션 전에 했는가
    const sessionsAgo = new Map(
      [...lastSession.entries()].map(([id, at]) => [id, session - at])
    );

    const picked = oldWay
      ? pickForTheme({
          candidates: orderOldWay(today, lastDay, recentIds),
          theme,
          minutes: 60,
          doneIds: new Set<string>(),
          goal: '균형 잡힌 관리',
        })
      : pickForTheme({
          candidates: library,
          theme,
          minutes: 60,
          doneIds: new Set<string>(),
          recentIds,
          sessionsAgo,
          rotationSeed: today,
          goal: '균형 잡힌 관리',
        });

    const mainPatterns: (string | null)[] = [];
    /* 상체날 본운동의 밀기/당기기 — 파워는 빼고 스트렝스만 센다 */
    const upperStrength: (string | null)[] = [];
    for (const p of picked.picks) {
      const id = p.exercise.id;
      totalPicks++;
      if (p.slot === 'main') {
        if (p.exercise.category === '상체 스트렝스') {
          upperStrength.push(p.exercise.movementPattern);
        }
        const had = lastSession.has(id);
        mainPicks++;
        if (had) comparable++;
        if (session <= EARLY_SESSIONS) {
          earlyMain++;
          if (had) earlyComparable++;
        }
        mainPatterns.push(p.exercise.movementPattern);
      }
      const before = lastSession.get(id);
      if (before != null) returns.push(session - before);
      lastSession.set(id, session);
      lastDay.set(id, today);
      seen.add(id);
    }

    if (theme === 'upper') {
      /*
       * 상체날에 밀기와 당기기가 둘 다 들어갔는가.
       *
       * 벤치프레스만 두 개 나오는 날은 가슴만 하고 등을 안 한 날이다. 투수의
       * 어깨는 미는 쪽만 키우면 앞으로 말리므로, 하루 안에서 갈라야 한다.
       * 스트렝스만 센다 — 파워의 밀기·당기기는 성격이 달라 셈에서 뺀다.
       */
      upperDays++;
      const kinds = new Set(upperStrength.filter((x): x is string => !!x));
      if (upperStrength.length >= 2) {
        upperDaysWithTwo++;
        if (kinds.has('밀기') && kinds.has('당기기')) upperBalanced++;
      }
    }

    if (theme === 'lower') {
      lowerDays++;
      lowerMain += mainPatterns.filter((p) => p != null).length;
      hingeMain += mainPatterns.filter((p) => p === HINGE_PATTERN).length;
      if (mainPatterns.some((p) => p === HINGE_PATTERN)) drought = 0;
      else worstDrought = Math.max(worstDrought, ++drought);
    }
  }

  return {
    sessions: session,
    comparable: mainPicks ? comparable / mainPicks : 0,
    earlyComparable: earlyMain ? earlyComparable / earlyMain : 0,
    coverage: seen.size,
    reuse: seen.size ? totalPicks / seen.size : 0,
    hingeShare: lowerMain ? hingeMain / lowerMain : 0,
    upperBalance: upperDaysWithTwo ? upperBalanced / upperDaysWithTwo : 0,
    upperDaysWithTwo,
    upperDays,
    drought: worstDrought,
    droughtWorst: worstDrought,
    lowerDays,
    meanSessionGap: returns.length
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : null,
  };
}

/**
 * 여러 해를 하나로 모은다.
 *
 * '힌지 없이 지나간 하체날'은 평균과 최악을 따로 낸다. 판정은 평균으로 한다 —
 * 문턱이 '한 해 안에서 몇 번까지'라는 뜻이라, 여러 해 중 최악을 갖다 대면
 * 해를 늘릴수록 무조건 나빠진다(더 나쁜 해를 만날 기회가 늘어날 뿐이다).
 * 가장 나쁜 해는 옆에 같이 적어 눈으로 보게 둔다.
 */
function average(runs: readonly Result[]): Result {
  const mean = (pick: (r: Result) => number) =>
    runs.reduce((sum, r) => sum + pick(r), 0) / runs.length;
  const gaps = runs.map((r) => r.meanSessionGap).filter((g) => g != null);
  return {
    sessions: Math.round(mean((r) => r.sessions)),
    comparable: mean((r) => r.comparable),
    earlyComparable: mean((r) => r.earlyComparable),
    coverage: Math.round(mean((r) => r.coverage)),
    reuse: mean((r) => r.reuse),
    hingeShare: mean((r) => r.hingeShare),
    upperBalance: mean((r) => r.upperBalance),
    upperDaysWithTwo: Math.round(mean((r) => r.upperDaysWithTwo)),
    upperDays: Math.round(mean((r) => r.upperDays)),
    drought: mean((r) => r.drought),
    droughtWorst: Math.max(...runs.map((r) => r.droughtWorst)),
    lowerDays: Math.round(mean((r) => r.lowerDays)),
    meanSessionGap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : null,
  };
}

/** 해마다 시작 연도를 바꿔 YEARS 해를 돌린 평균 */
const runYears = (regular: boolean, oldWay: boolean) =>
  average(Array.from({ length: YEARS }, (_, i) => run(365, regular, oldWay, 2020 + i)));

const pct = (v: number) => `${Math.round(v * 100)}%`;
let failed = false;

for (const [label, regular] of [
  ['매일 하는 사람', true],
  ['사회인 사용자 (주 2~3회 · 2주 공백)', false],
] as const) {
  const before = runYears(regular, true);
  const now = runYears(regular, false);
  console.log('');
  console.log(`■ ${label} — 1년에 실제 운동 ${now.sessions}회 · ${YEARS}해 평균`);
  console.log('');
  console.log('                                     예전 규칙      지금');
  console.log('  ' + '─'.repeat(52));
  console.log(
    `  지난 기록을 볼 수 있음 · 첫 ${EARLY_SESSIONS}세션  ${pct(before.earlyComparable).padStart(8)}  ${pct(now.earlyComparable).padStart(8)}`
  );
  console.log(
    `  지난 기록을 볼 수 있음 · 1년 전체   ${pct(before.comparable).padStart(8)}  ${pct(now.comparable).padStart(8)}`
  );
  console.log(
    `  1년 동안 쓴 운동 (전체 ${library.length}개)       ${(before.coverage + '개').padStart(8)}  ${(now.coverage + '개').padStart(8)}`
  );
  console.log(
    `  같은 운동을 1년에 몇 번            ${(before.reuse.toFixed(1) + '번').padStart(8)}  ${(now.reuse.toFixed(1) + '번').padStart(8)}`
  );
  console.log(
    `  같은 운동이 다시 나오기까지        ${((before.meanSessionGap?.toFixed(1) ?? '—') + '세션').padStart(8)}  ${((now.meanSessionGap?.toFixed(1) ?? '—') + '세션').padStart(8)}`
  );
  console.log(
    `  하체 본운동 중 힌지 계열           ${pct(before.hingeShare).padStart(8)}  ${pct(now.hingeShare).padStart(8)}`
  );
  console.log(
    `  상체날 밀기+당기기 둘 다           ${pct(before.upperBalance).padStart(8)}  ${pct(now.upperBalance).padStart(8)}`
  );
  console.log(
    `     (상체날 ${now.upperDays}일 중 스트렝스가 둘 이상인 날 ${now.upperDaysWithTwo}일)`
  );
  console.log(
    `  힌지 없이 지나간 하체날 최대       ${(before.drought.toFixed(1) + '일').padStart(8)}  ${(now.drought.toFixed(1) + '일').padStart(8)}   (가장 나쁜 해 ${now.droughtWorst}일)`
  );

  if (now.comparable < MIN_COMPARABLE) {
    console.log(`  ✗ 1년 전체 지난 기록 비율이 ${pct(MIN_COMPARABLE)}보다 낮습니다.`);
    failed = true;
  }
  if (now.earlyComparable < MIN_EARLY_COMPARABLE) {
    console.log(
      `  ✗ 첫 ${EARLY_SESSIONS}세션 지난 기록 비율이 ${pct(MIN_EARLY_COMPARABLE)}보다 낮습니다 — 재등장이 너무 늦게 시작됩니다.`
    );
    failed = true;
  }
  if (now.reuse > MAX_YEARLY_REUSE) {
    console.log(
      `  ✗ 같은 운동을 1년에 ${now.reuse.toFixed(1)}번 만납니다 (${MAX_YEARLY_REUSE}번까지) — 라이브러리가 굳고 있습니다.`
    );
    failed = true;
  }
  if (now.hingeShare < MIN_HINGE_SHARE) {
    console.log(
      `  ✗ 하체 본운동 중 힌지가 ${pct(now.hingeShare)} 뿐입니다 (${pct(MIN_HINGE_SHARE)} 이상이어야 합니다).`
    );
    failed = true;
  }
  if (now.drought > MAX_HINGE_DROUGHT) {
    console.log(
      `  ✗ 힌지 없이 하체날이 ${now.drought.toFixed(1)}번 이어졌습니다 (${MAX_HINGE_DROUGHT}번까지).`
    );
    failed = true;
  }
}

console.log('');
console.log(
  failed
    ? '실패 — 재등장 규칙(lib/report/theme.ts 의 RETURN_SESSIONS·NEW_EXERCISE_BONUS)을 다시 보세요.'
    : '모두 통과 — 지난 기록을 견줄 수 있고, 라이브러리도 굳지 않고, 동작 계열도 골고루 들어갑니다.'
);
console.log('');
if (failed) process.exit(1);
