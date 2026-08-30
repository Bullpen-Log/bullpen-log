/**
 * 채널 목록에서 실제로 등록할 만한 것만 추린다.
 *
 *   node scripts/pick-candidates.mjs scripts/lists/_rusin-videos.json scripts/lists/_picked.json
 *
 * 넉넉히 뽑아 놓고 사람이 하나씩 보는 것이 아니라, 확실히 아닌 것을 먼저
 * 기계로 걷어낸다. 남은 것만 썸네일로 확인한다 — 사백 장을 다 볼 수는 없다.
 *
 * 걷어내는 기준은 겪으면서 늘어났다. 처음에는 '컬'을 이두로 봤는데 햄스트링
 * 컬이 무더기로 섞여 들어왔고, '프레스'에는 팔로프 프레스(코어)가 섞였다.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [inPath, outPath] = process.argv.slice(2);
if (!inPath) {
  console.error('사용법: node scripts/pick-candidates.mjs <목록.json> [저장.json]');
  process.exit(1);
}
const rows = JSON.parse(readFileSync(inPath, 'utf8'));

/* ───────────────── 확실히 아닌 것 ───────────────── */

const REJECT = [
  // 운동이 아니다 — 강의·설명·평가
  [/\b(tutorial|breakdown|explained|guide|tips?|why|how to|what is|vs\.?)\b/i, '강의'],
  [/\b(test|testing|assess(ing|ment)?|screening|diagnostics?|demo)\b/i, '평가·시연 설명'],
  [/\b(workout|program|routine|circuit|complex|series|protocol)\b/i, '묶음'],
  [/\b(podcast|interview|q&a|webinar|seminar|announcement)\b/i, '기타'],
  [/mountain dog diet|jrfs hands on|smr\b/i, '기타'],

  // 한 영상에 운동이 둘 — 어느 쪽에 걸지 정할 수 없다
  [/\bsuperset\b|\bcombo\b|\s\+\s/i, '두 운동이 한 영상에'],

  // 방법을 보여주는 영상이지 운동 자체가 아니다
  [/\bdrop set\b|\binterval\b|\b\d+ rep set\b|\bpartials?\b|\bfinisher\b|\bwarm-?up\b/i, '방법 영상'],
  [/\bpoor form\b/i, '잘못된 자세 예시'],

  // 우리 17가지 밖 장비
  [/\btrap bar\b|\bhex bar\b/i, '트랩바'],
  [/\bsafety (squat )?bar\b|\bssb\b/i, '세이프티바'],
  [/\bez ?bar\b/i, 'EZ바'],
  [/\bfat (grip|bar)\b|\bcambered bar\b|\bneutral bar\b|\bmulti ?grip bar\b|\bstraight bar\b/i, '특수 바'],
  [/\bhammer strength\b|\bmachine\b|\bcage\b|\bsmith\b/i, '전용 머신'],
  [/\bbfr\b|\bblood flow\b/i, 'BFR 밴드'],
  [/\bchain(s)?\b|\bsled\b|\bprowler\b|\bslider|\bvalslide|\bbattle rope|\bghd\b|\bglute ham\b|\breverse hyper\b|\bjammer\b|\bmace\b|\bclubbell\b|\bab wheel\b|\bvest\b|\bring\b|\bpin(s)?\b|\bearthquake|\bbamboo|\brope\b/i, '기타 특수 장비'],
  [/\bphysio-?ball\b|\bswiss ball\b/i, '짐볼(있지만 흔치 않음)'],

  // 이름만 컬이지 상체가 아니다
  [/\b(hamstring|leg|prone|lying|seated|heel slide).{0,12}curl\b/i, '햄스트링 컬'],
  [/\bcurl\b(?!.*\b(biceps?|hammer|dumbbell|band|zottman|preacher|reverse|supinated|incline|cross body|single arm)\b)/i, '이두 컬 아님'],

  // 코어지 상체가 아니다
  [/\bpallof\b/i, '팔로프(코어)'],
];

/* ───────────────── 갈래 나누기 ───────────────── */

/**
 * 우리 라이브러리의 경계를 그대로 따른다.
 *
 * 암케어에는 이미 이두컬·삼두 익스텐션·T/Y 레이즈·페이스풀이 들어 있다.
 * 어깨 관절과 팔꿈치를 직접 다루는 작은 근육 운동이 암케어이고, 등·가슴을
 * 주동으로 쓰는 큰 동작이 상체 스트렝스다.
 */
const BUCKETS = [
  ['암케어 · 이두', /\bcurl\b/i],
  ['암케어 · 삼두', /\btricep|\bskull ?crusher|\bpushdown|\bkickback|\boverhead extension/i],
  ['암케어 · 어깨 측면', /\blateral raise\b|\bscaption\b/i],
  ['암케어 · 어깨 후면', /\brear delt\b|\bface pull\b|\breverse fly\b/i],
  ['상체 · 딥', /\bdip\b/i],
  ['상체 · 철봉', /\bpull ?up\b|\bchin ?up\b/i],
  ['상체 · 로우', /\brow\b/i],
  ['상체 · 풀다운', /\bpulldown\b|\bpull ?over\b|\bpull ?apart\b/i],
  ['상체 · 푸쉬업', /\bpush ?up\b/i],
  ['상체 · 프레스', /\bpress\b|\bfly\b/i],
];

/* ───────────────── 장비 알아내기 ───────────────── */

const EQUIP = [
  [/\bsuspension trainer\b|\btrx\b/i, 'TRX'],
  [/\bkettlebell\b|\bkb\b/i, '케틀벨'],
  [/\bdumbbell\b|\bdb\b/i, '덤벨'],
  [/\bbarbell\b|\bbb\b|\bpendlay\b|\bmeadows\b/i, '바벨'],
  [/\bplate\b/i, '원판'],
  [/\bcable\b/i, '케이블'],
  [/\bband(ed)?\b|\btubing\b/i, '밴드'],
  [/\bpull ?up\b|\bchin ?up\b|\bhang/i, '철봉'],
  [/\bbench press\b|\bincline\b|\bdecline\b|\bbench\b/i, '벤치'],
  [/\bfoam roll/i, '폼롤러'],
  [/\bmed ?ball\b|\bmedicine ball\b/i, '메디신볼'],
];

/** 같은 운동을 여러 번 올린 것을 하나로. */
function normalize(t) {
  return t
    .toLowerCase()
    .replace(/^(bm|jrx|jrfs)-?\s*/i, '')
    .replace(/\|/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const rejected = new Map();
const picked = new Map(); // 갈래 → 목록
const seenNorm = new Set();

for (const r of rows) {
  const hit = REJECT.find(([re]) => re.test(r.title));
  if (hit) {
    const why = hit[1];
    rejected.set(why, (rejected.get(why) ?? 0) + 1);
    continue;
  }
  const bucket = BUCKETS.find(([, re]) => re.test(r.title));
  if (!bucket) continue;

  const key = normalize(r.title);
  if (seenNorm.has(key)) continue;
  seenNorm.add(key);

  const equip = EQUIP.filter(([re]) => re.test(r.title)).map(([, n]) => n);
  const list = picked.get(bucket[0]) ?? [];
  list.push({ ...r, equip: equip.length ? equip : ['맨몸'] });
  picked.set(bucket[0], list);
}

console.log('── 걷어낸 것 ──');
for (const [why, n] of [...rejected].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${why.padEnd(20)} ${n}개`);
}

console.log('\n── 남은 후보 ──');
let total = 0;
for (const [name] of BUCKETS) {
  const list = picked.get(name) ?? [];
  total += list.length;
  console.log(`\n[${name}]  ${list.length}개`);
  for (const r of list) console.log(`  ${r.videoId}  ${(r.equip.join('·')).padEnd(12)} ${r.title}`);
}
console.log(`\n합계 ${total}개`);

if (outPath) {
  const flat = [];
  for (const [name] of BUCKETS) {
    for (const r of picked.get(name) ?? []) flat.push({ bucket: name, ...r });
  }
  writeFileSync(outPath, JSON.stringify(flat, null, 1), 'utf8');
  console.log(`→ ${outPath}`);
}
