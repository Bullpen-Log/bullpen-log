/**
 * 받아온 채널 목록을 훑어 무엇을 넣을 수 있는지 센다.
 *
 *   node --env-file=.env scripts/analyze-channel-list.mjs scripts/lists/_rusin-videos.json
 *
 * 넣기 전에 판단할 것이 셋이다.
 *   1) 개별 운동인가, 강의·묶음 영상인가
 *   2) 우리 장비 17가지로 할 수 있는가
 *   3) 이미 라이브러리에 있는가
 *
 * 세는 것까지만 한다. 등록은 하지 않는다.
 */
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const listPath = process.argv[2];
if (!listPath) {
  console.error('사용법: node --env-file=.env scripts/analyze-channel-list.mjs <목록.json>');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(listPath, 'utf8'));

/* ─────────────── 1) 개별 운동이 아닌 것 ─────────────── */

/**
 * 운동 하나에 걸 수 없는 영상.
 *
 * "Full Body Workout" 같은 묶음 영상은 어느 운동에 붙일지 정할 수가 없고,
 * "Knee Valgus" 같은 강의 영상은 운동이 아니다.
 */
const NOT_EXERCISE = [
  /\b(workout|program|routine|circuit|complex|series)\b/i,
  /\b(tutorial|breakdown|explained|guide|tips?|why|how to|what is|vs\.?)\b/i,
  /\b(podcast|interview|q&a|announcement|webinar|seminar|course)\b/i,
  /\b(day \d|week \d|phase \d)\b/i,
];

/* ─────────────── 2) 장비 ─────────────── */

/** 영어 낱말 → 우리 장비 이름. 앞의 것이 먼저 잡힌다. */
const EQUIP_MAP = [
  [/\bsuspension trainer\b|\btrx\b/i, 'TRX'],
  [/\bphysioball\b|\bswiss ball\b|\bstability ball\b|\bexercise ball\b/i, '짐볼'],
  [/\bmed(icine)? ball\b/i, '메디신볼'],
  [/\bfoam roll/i, '폼롤러'],
  [/\blacrosse ball\b|\bmassage ball\b/i, '마사지볼'],
  [/\bkettlebell\b|\bkb\b/i, '케틀벨'],
  [/\bdumbbell\b|\bdb\b|\bgoblet\b/i, '덤벨'],
  [/\bbarbell\b|\bbb\b|\blandmine\b|\bhack squat\b/i, '바벨'],
  [/\bplate\b/i, '원판'],
  [/\bcable\b|\bpulley\b/i, '케이블'],
  [/\bband\b|\btubing\b/i, '밴드'],
  [/\bpull ?up\b|\bchin ?up\b|\bhanging\b|\bdead ?hang\b|\bhang\b/i, '철봉'],
  [/\bbench press\b|\bincline\b|\bdecline\b|\bbench\b/i, '벤치'],
  [/\bbox\b|\bstep ?up\b/i, '박스'],
  [/\bmachine\b|\bleg press\b|\bpulldown machine\b|\bsmith\b/i, '머신'],
  [/\bbaseball\b/i, '야구공'],
];

/**
 * 우리 17가지에 없는 장비.
 *
 * 이런 것이 제목에 있으면 넣지 않는다. 그 장비가 없는 사람에게 처방되면
 * 그냥 못 하는 운동이 된다.
 */
const OUTSIDE = [
  [/\btrap bar\b|\bhex bar\b/i, '트랩바'],
  [/\bsafety (squat )?bar\b|\bssb\b/i, '세이프티바'],
  [/\bchain(s)?\b/i, '체인'],
  [/\bsled\b|\bprowler\b/i, '슬레드'],
  [/\bslider(s)?\b|\bvalslide\b|\bglide disc\b/i, '슬라이더'],
  [/\bring(s)? (row|dip|pull)\b|\bgymnastic rings?\b/i, '링'],
  [/\bbattle rope\b|\bropes?\b(?! ?climb)/i, '배틀로프'],
  [/\breverse hyper\b|\bghd\b|\bglute ham\b/i, '전용 기구'],
  [/\bjammer\b/i, '재머'],
  [/\bbulgarian bag\b|\bmace\b|\bclub(bell)?\b/i, '특수 도구'],
  [/\bvest\b|\bweighted vest\b/i, '웨이트 조끼'],
  [/\bwheel\b|\bab wheel\b/i, '롤아웃 휠'],
  [/\bbike\b|\berg\b|\brower\b|\btreadmill\b|\bski\b/i, '유산소 기구'],
  [/\bsafety strap\b|\bpin\b/i, '랙 핀'],
];

/* ─────────────── 3) 갈래 어림 ─────────────── */

const CATEGORY = [
  [/\bpull ?up\b|\bchin ?up\b|\brow\b|\bpulldown\b|\bpull ?apart\b|\bface pull\b|\bpress\b|\bpush ?up\b|\bfly\b|\bcurl\b|\btricep\b|\bshrug\b|\blateral raise\b|\bdip\b/i, '상체 스트렝스'],
  [/\bsquat\b|\blunge\b|\bdeadlift\b|\brdl\b|\bhinge\b|\bhip thrust\b|\bglute bridge\b|\bstep ?up\b|\bcalf\b|\bleg curl\b|\bleg extension\b|\bsplit squat\b/i, '하체 스트렝스'],
  [/\bjump\b|\bhop\b|\bbound\b|\bthrow\b|\bslam\b|\bexplosive\b|\bpower\b|\bplyo\b|\bsprint\b/i, '파워'],
  [/\bplank\b|\bcore\b|\bab\b|\bdead ?bug\b|\bpallof\b|\bcarry\b|\bcrawl\b|\banti-?rotation\b|\bhollow\b/i, '코어'],
  [/\bexternal rotation\b|\binternal rotation\b|\bcuff\b|\by raise\b|\bt raise\b|\bw raise\b|\bscap\b|\bprone y\b|\bprone t\b/i, '암케어'],
  [/\bstretch\b|\bmobility\b|\bmobilization\b|\b90\/90\b|\bcars\b|\bopener\b|\bbreathing\b|\bactivation\b/i, '모빌리티'],
];

/* ─────────────── 세기 ─────────────── */

function analyze(title) {
  const notExercise = NOT_EXERCISE.some((re) => re.test(title));
  const outside = OUTSIDE.filter(([re]) => re.test(title)).map(([, name]) => name);
  const equip = EQUIP_MAP.filter(([re]) => re.test(title)).map(([, name]) => name);
  const cat = CATEGORY.find(([re]) => re.test(title))?.[1] ?? null;
  return { notExercise, outside, equip, cat };
}

const buckets = { 강의묶음: [], 장비밖: [], 쓸수있음: [] };
const byCat = new Map();
const byEquip = new Map();
const outsideCount = new Map();

for (const r of rows) {
  const a = analyze(r.title);
  if (a.notExercise) { buckets.강의묶음.push(r.title); continue; }
  if (a.outside.length) {
    buckets.장비밖.push(`${r.title}  [${a.outside.join('·')}]`);
    for (const o of a.outside) outsideCount.set(o, (outsideCount.get(o) ?? 0) + 1);
    continue;
  }
  buckets.쓸수있음.push({ ...r, ...a });
  const c = a.cat ?? '(갈래 불명)';
  byCat.set(c, (byCat.get(c) ?? 0) + 1);
  for (const e of (a.equip.length ? a.equip : ['맨몸'])) {
    byEquip.set(e, (byEquip.get(e) ?? 0) + 1);
  }
}

console.log(`전체 ${rows.length}개`);
console.log(`  강의·묶음 영상   ${buckets.강의묶음.length}개  (운동 하나에 못 붙임)`);
console.log(`  장비가 밖        ${buckets.장비밖.length}개`);
console.log(`  쓸 수 있음       ${buckets.쓸수있음.length}개`);

console.log('\n── 장비가 밖이라 뺀 것 ──');
for (const [k, v] of [...outsideCount].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(12)} ${v}개`);
}

console.log('\n── 쓸 수 있는 것의 갈래 ──');
for (const [k, v] of [...byCat].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(14)} ${v}개`);
}

console.log('\n── 쓸 수 있는 것의 장비 ──');
for (const [k, v] of [...byEquip].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(10)} ${v}개`);
}

/* ─────────────── 4) 우리 라이브러리와 겹치는가 ─────────────── */

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const mine = await prisma.exerciseVideo.findMany({ select: { title: true } });
await prisma.$disconnect();

console.log(`\n── 우리 라이브러리 ${mine.length}개와 견주기 ──`);
console.log('  (한글/영어라 제목으로 바로 못 견줍니다. 실제 중복은 등록 전에 한 건씩 봐야 합니다)');

console.log('\n── 상체 스트렝스로 잡힌 것 40개 미리보기 ──');
const upper = buckets.쓸수있음.filter((r) => r.cat === '상체 스트렝스');
for (const r of upper.slice(0, 40)) {
  console.log(`  ${(r.equip.join('·') || '맨몸').padEnd(12)} ${r.title}`);
}
console.log(`  … 상체로 잡힌 것 모두 ${upper.length}개`);
