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
/** 1년 동안 적어도 이만큼은 라이브러리를 써야 한다 */
const MIN_YEAR_COVERAGE = 250;
/**
 * 동작 편중이 예전보다 이만큼 넘게 나빠지면 알린다.
 *
 * 실패로 치지 않는다. 재등장 텀을 넣으면 후보 풀이 좁아져 같은 계열이 몰리는
 * 것은 알고 받아들인 대가이고, 이건 동작 패턴 항목이 생겨야 풀린다.
 * 다만 눈에서 사라지면 안 되므로 계속 적어 둔다.
 */
const KNEE_ONLY_SLACK = 0.05;

/** 제목으로 하체 동작을 가른다 — 앱에는 아직 동작 패턴 항목이 없다. */
const KNEE = /스쿼트|런지|스텝업|스플릿|레그 ?프레스|시시|박스 점프|카프/;
const HINGE = /데드리프트|RDL|힌지|굿모닝|힙 ?쓰러스트|브리지|스윙|풀 ?스루|햄스트링|노르딕/;

const day = (n: number) =>
  new Date(Date.UTC(2026, 0, 5) + n * 86400000).toISOString().slice(0, 10);
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
  kneeOnly: number;
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

function run(days: number, regular: boolean, oldWay = false): Result {
  /** 운동 → 마지막으로 한 세션 번호 (1부터) */
  const lastSession = new Map<string, number>();
  /** 운동 → 마지막으로 한 날 (최근 사흘 규칙에 쓴다) */
  const lastDay = new Map<string, string>();
  const seen = new Set<string>();
  const returns: number[] = [];
  let session = 0;
  let mainPicks = 0;
  let comparable = 0;
  let earlyMain = 0;
  let earlyComparable = 0;
  let lowerDays = 0;
  let kneeOnly = 0;

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
          minutes: 45,
          doneIds: new Set<string>(),
          goal: '균형 잡힌 관리',
        })
      : pickForTheme({
          candidates: library,
          theme,
          minutes: 45,
          doneIds: new Set<string>(),
          recentIds,
          sessionsAgo,
          rotationSeed: today,
          goal: '균형 잡힌 관리',
        });

    const mainTitles: string[] = [];
    for (const p of picked.picks) {
      const id = p.exercise.id;
      if (p.slot === 'main') {
        const had = lastSession.has(id);
        mainPicks++;
        if (had) comparable++;
        if (session <= EARLY_SESSIONS) {
          earlyMain++;
          if (had) earlyComparable++;
        }
        mainTitles.push(p.exercise.title);
      }
      const before = lastSession.get(id);
      if (before != null) returns.push(session - before);
      lastSession.set(id, session);
      lastDay.set(id, today);
      seen.add(id);
    }

    if (theme === 'lower') {
      lowerDays++;
      const knee = mainTitles.some((t) => KNEE.test(t));
      const hinge = mainTitles.some((t) => HINGE.test(t));
      if (knee && !hinge) kneeOnly++;
    }
  }

  return {
    sessions: session,
    comparable: mainPicks ? comparable / mainPicks : 0,
    earlyComparable: earlyMain ? earlyComparable / earlyMain : 0,
    coverage: seen.size,
    kneeOnly,
    lowerDays,
    meanSessionGap: returns.length
      ? returns.reduce((a, b) => a + b, 0) / returns.length
      : null,
  };
}

const pct = (v: number) => `${Math.round(v * 100)}%`;
let failed = false;

for (const [label, regular] of [
  ['매일 하는 사람', true],
  ['사회인 사용자 (주 2~3회 · 2주 공백)', false],
] as const) {
  const before = run(365, regular, true);
  const now = run(365, regular, false);
  console.log('');
  console.log(`■ ${label} — 1년에 실제 운동 ${now.sessions}회`);
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
    `  같은 운동이 다시 나오기까지        ${((before.meanSessionGap?.toFixed(1) ?? '—') + '세션').padStart(8)}  ${((now.meanSessionGap?.toFixed(1) ?? '—') + '세션').padStart(8)}`
  );
  console.log(
    `  무릎 동작만 나온 하체날            ${(before.kneeOnly + '/' + before.lowerDays).padStart(8)}  ${(now.kneeOnly + '/' + now.lowerDays).padStart(8)}`
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
  if (now.coverage < MIN_YEAR_COVERAGE) {
    console.log(`  ✗ 1년에 쓰는 운동이 ${MIN_YEAR_COVERAGE}개보다 적습니다 — 라이브러리가 굳고 있습니다.`);
    failed = true;
  }
  const beforeRate = before.kneeOnly / before.lowerDays;
  const nowRate = now.kneeOnly / now.lowerDays;
  if (nowRate > beforeRate + KNEE_ONLY_SLACK) {
    console.log(
      `  ⚠ 무릎 동작만 나온 날이 예전보다 늘었습니다 (${pct(beforeRate)} → ${pct(nowRate)}).`
    );
    console.log('    받아들인 대가입니다 — 동작 패턴 항목이 생기면 풀립니다.');
  }
}

console.log('');
console.log(
  failed
    ? '실패 — 재등장 규칙(lib/report/theme.ts 의 RETURN_SESSIONS·NEW_EXERCISE_BONUS)을 다시 보세요.'
    : '모두 통과 — 지난 기록을 견줄 수 있고, 라이브러리도 굳지 않습니다.'
);
console.log('');
if (failed) process.exit(1);
