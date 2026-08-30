/**
 * "지금 일정이 트레이너가 짠 것처럼 보이는가" 를 실제 운동으로 재본다.
 *
 *   node --env-file=.env --import ./scripts/alias-register.mjs scripts/review-trainer-gap.mts
 *
 * 앱과 똑같은 함수(pickForTheme)를 부른다. 여기서 따로 고르면 확인하는
 * 의미가 없다 — 앱은 앱대로, 확인은 확인대로 맞다고 나올 수 있어서다.
 *
 * 재는 것은 네 가지다.
 *   1) 동작 패턴이 골고루 들어가는가 (무릎 지배 / 고관절 지배 / 밀기 / 당기기)
 *   2) 복합운동이 고립운동보다 앞에 오는가
 *   3) 주마다 볼륨(환산 세트)이 얼마나 흔들리는가
 *   4) 같은 운동이 며칠 만에 다시 나오는가
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { pickForTheme, type ThemeKey } from '../lib/report/theme.ts';
import { isCompound } from '../lib/exercise-meta.ts';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const library = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  orderBy: { createdAt: 'asc' },
});
await prisma.$disconnect();

/* ── 동작 패턴 분류 ───────────────────────────────────────────
 * 트레이너가 하체를 짤 때 반드시 나누는 축이다. 스쿼트 계열만 세 개를
 * 넣는 프로그램은 없다 — 무릎을 지배하는 동작과 고관절을 지배하는 동작을
 * 같은 날 함께 넣는다. 제목으로 가른다(앱에 동작 패턴 항목이 없다).
 */
const PATTERNS: [string, RegExp][] = [
  ['무릎 지배(스쿼트류)', /스쿼트|런지|스텝업|스플릿|레그 ?프레스|시시|리버스 런지|박스 점프|카프/],
  ['고관절 지배(힌지류)', /데드리프트|RDL|힌지|굿모닝|힙 ?쓰러스트|브리지|스윙|풀 ?스루|햄스트링|노르딕/],
  ['밀기', /프레스|푸쉬업|푸시업|딥스|익스텐션|푸시 ?프레스/],
  ['당기기', /로우|풀업|친업|풀 ?다운|컬|페이스 ?풀|풀 ?어파트|슈러그/],
];
function patternOf(title: string): string | null {
  for (const [name, re] of PATTERNS) if (re.test(title)) return name;
  return null;
}

const day = (n: number) => {
  const d = new Date(Date.UTC(2026, 0, 5) + n * 86400000);
  return d.toISOString().slice(0, 10);
};

/* ── 28일치를 만든다 ──────────────────────────────────────────
 * 실제 앱처럼 완료 기록을 남기며 돈다. 완료를 남겨야 '몇 세션 전에 했는가'가
 * 쌓여 재등장 규칙이 작동한다.
 */
type Row = { date: string; theme: ThemeKey; titles: string[]; main: string[]; sets: number };
const lastSession = new Map<string, number>();
const lastDay = new Map<string, string>();
const rows: Row[] = [];
const seen = new Map<string, string[]>(); // 운동 → 나온 날들

for (let i = 0; i < 28; i++) {
  const date = day(i);
  // 실제 decideTheme 이 몸 상태가 좋을 때 내는 순서 — 하체와 상체를 번갈아
  const theme: ThemeKey = i % 2 === 0 ? 'lower' : 'upper';
  const recentIds = new Set(
    [...lastDay.entries()]
      .filter(([, d]) => (Date.parse(date) - Date.parse(d)) / 86400000 <= 3)
      .map(([id]) => id)
  );
  const sessionsAgo = new Map(
    [...lastSession.entries()].map(([id, at]) => [id, i + 1 - at])
  );
  const picked = pickForTheme({
    candidates: library,
    theme,
    minutes: 60,
    doneIds: new Set<string>(),
    recentIds,
    sessionsAgo,
    rotationSeed: date,
    goal: '균형 잡힌 관리',
  });
  const titles = picked.picks.map((p) => p.exercise.title);
  const main = picked.picks.filter((p) => p.slot === 'main').map((p) => p.exercise.title);
  for (const p of picked.picks) {
    lastSession.set(p.exercise.id, i + 1);
    lastDay.set(p.exercise.id, date);
    const at = seen.get(p.exercise.title) ?? [];
    at.push(date);
    seen.set(p.exercise.title, at);
  }
  const sets = picked.picks.reduce((s, p) => s + (p.exercise.sets ?? 3), 0);
  rows.push({ date, theme, titles, main, sets });
}

/* ── 1) 하체 데이의 동작 패턴 ─────────────────────────────── */
console.log('■ 1. 하체 데이 본운동의 동작 패턴\n');
let kneeOnly = 0;
let both = 0;
const lowerDays = rows.filter((r) => r.theme === 'lower');
for (const r of lowerDays.slice(0, 7)) {
  const pats = r.main.map((t) => `${t} [${patternOf(t) ?? '분류 안 됨'}]`);
  const set = new Set(r.main.map(patternOf).filter(Boolean));
  const hasKnee = set.has('무릎 지배(스쿼트류)');
  const hasHinge = set.has('고관절 지배(힌지류)');
  if (hasKnee && !hasHinge) kneeOnly++;
  if (hasKnee && hasHinge) both++;
  console.log(`  ${r.date}  ${pats.join('\n              ')}`);
}
for (const r of lowerDays.slice(7)) {
  const set = new Set(r.main.map(patternOf).filter(Boolean));
  const hasKnee = set.has('무릎 지배(스쿼트류)');
  const hasHinge = set.has('고관절 지배(힌지류)');
  if (hasKnee && !hasHinge) kneeOnly++;
  if (hasKnee && hasHinge) both++;
}
console.log(
  `\n  하체 데이 ${lowerDays.length}일 중 — 무릎만: ${kneeOnly}일 · 무릎+고관절 함께: ${both}일\n`
);

/* ── 2) 복합운동이 앞에 오는가 ─────────────────────────────── */
console.log('■ 2. 본운동 안에서 복합운동이 고립운동보다 앞에 오는가\n');
let wrongOrder = 0;
const byTitle = new Map(library.map((e) => [e.title, e]));
for (const r of rows) {
  const flags = r.main.map((t) => isCompound(byTitle.get(t)?.bodyParts ?? []));
  // 고립이 먼저 나오고 그 뒤에 복합이 오면 순서가 뒤집힌 것이다
  const firstIso = flags.indexOf(false);
  const lastComp = flags.lastIndexOf(true);
  if (firstIso !== -1 && lastComp > firstIso) wrongOrder++;
}
console.log(`  28일 중 ${wrongOrder}일에서 고립운동이 복합운동보다 앞에 왔습니다.`);
console.log('  예시:');
for (const r of rows.slice(0, 3)) {
  console.log(
    `  ${r.date}  ${r.main
      .map((t) => `${t}(${isCompound(byTitle.get(t)?.bodyParts ?? []) ? '복합' : '고립'})`)
      .join(' → ')}`
  );
}

/* ── 3) 주간 볼륨 ─────────────────────────────────────────── */
console.log('\n■ 3. 주마다 총 세트 수\n');
for (let w = 0; w < 4; w++) {
  const week = rows.slice(w * 7, w * 7 + 7);
  const total = week.reduce((s, r) => s + r.sets, 0);
  console.log(`  ${w + 1}주차: ${total}세트`);
}
const weeks = [0, 1, 2, 3].map((w) =>
  rows.slice(w * 7, w * 7 + 7).reduce((s, r) => s + r.sets, 0)
);
console.log(
  `  → 최소 ${Math.min(...weeks)} · 최대 ${Math.max(...weeks)} (차이 ${Math.max(...weeks) - Math.min(...weeks)}세트)`
);
console.log('  트레이너라면 3주 올리고 4주차에 내립니다(디로드). 지금은 그런 흐름이 없습니다.');

/* ── 4) 같은 운동이 다시 나오기까지 ───────────────────────── */
console.log('\n■ 4. 28일 동안 나온 운동\n');
const counts = [...seen.entries()].sort((a, b) => b[1].length - a[1].length);
console.log(`  서로 다른 운동 ${counts.length}개 / 라이브러리 ${library.length}개`);
console.log(`  가장 자주 나온 것: ${counts.slice(0, 5).map(([t, d]) => `${t}(${d.length}회)`).join(', ')}`);
const once = counts.filter(([, d]) => d.length === 1).length;
console.log(`  한 번만 나온 것: ${once}개`);

/* ── 5) 같은 운동을 반복할 수 있는가 (점진적 과부하) ──────────
 * 근력이 늘려면 같은 운동을 반복하며 무게를 올려야 한다. 매번 다른 운동이
 * 나오면 견줄 지난 기록이 없어 무게를 올릴 근거가 생기지 않는다.
 */
console.log('\n■ 5. 본운동이 다시 나오기까지 (점진적 과부하가 되는가)\n');
const mainSeen = new Map<string, string[]>();
for (const r of rows) {
  for (const t of r.main) {
    const at = mainSeen.get(t) ?? [];
    at.push(r.date);
    mainSeen.set(t, at);
  }
}
const mainPicks = rows.reduce((s, r) => s + r.main.length, 0);
const repeated = [...mainSeen.values()].filter((d) => d.length > 1);
console.log(`  본운동으로 나온 횟수: ${mainPicks}회 (서로 다른 운동 ${mainSeen.size}개)`);
console.log(`  두 번 이상 나온 운동: ${repeated.length}개`);
console.log(
  `  → 본운동의 ${Math.round(((mainPicks - mainSeen.size) / mainPicks) * 100)}% 만 "지난번 기록"을 볼 수 있습니다.`
);
const gaps = repeated.flatMap((d) =>
  d.slice(1).map((cur, i) => (Date.parse(cur) - Date.parse(d[i])) / 86400000)
);
if (gaps.length) {
  console.log(`  다시 나오기까지 평균 ${Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)}일`);
}
