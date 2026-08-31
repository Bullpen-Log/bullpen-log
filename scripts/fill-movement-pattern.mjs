/**
 * 운동 445개에 동작 패턴을 채운다.
 *
 *   node --env-file=.env scripts/fill-movement-pattern.mjs        (무엇이 채워지는지 보기만)
 *   node --env-file=.env scripts/fill-movement-pattern.mjs --save (실제로 저장)
 *
 * 제목으로 가른다. 앱에 관절 정보가 없어 이름에 드러난 동작을 읽는 수밖에 없다.
 * 그래서 이 스크립트가 낸 답은 초안이고, 사람이 한 번 봐야 한다 —
 * 못 가른 것은 목록으로 따로 내준다.
 *
 * 이미 채워진 것은 건드리지 않는다. 손으로 고친 값을 덮어쓰면 안 된다.
 * (--force 를 주면 덮어쓴다.)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const save = process.argv.includes('--save');
const force = process.argv.includes('--force');

/*
 * 제목에서 동작을 읽는 규칙. 위에서부터 먼저 맞는 것을 쓴다.
 *
 * 순서가 중요하다. '스플릿 스쿼트'는 한 발로 하는 운동이라 런지 계열인데,
 * '스쿼트'만 보면 스쿼트로 잘못 들어간다. 그래서 좁은 규칙을 위에 둔다.
 */
const RULES = [
  // ── 런지 (편측 무릎 지배) — '스쿼트'가 들어간 이름이 있어 먼저 본다
  [/스플릿 ?스쿼트|불가리안|런지|스텝 ?업|스텝업|피스톨|시시|스케이터|사이드 ?스텝|몬스터 ?워크|스타 ?스텝|워킹/, '런지'],
  // 한 발로 하는 스쿼트도 런지 계열이다 — 실리는 다리가 하나다
  [/싱글렉.*스쿼트|싱글 ?레그.*스쿼트|한 ?발.*스쿼트/, '런지'],
  /*
   * 한 발로 뛰는 것도 편측이다.
   *
   * 아래 스쿼트 규칙에 '홉'·'포고'·'뎁스 드롭'이 있어 그냥 두면 양발 계열로
   * 들어간다. 한 발로 뛰거나 한 발로 내려앉는 동안 몸은 런지처럼 한쪽에
   * 실린다 — 양발 점프와 같이 세면 하루 구성이 "무릎 계열은 양쪽 다 채웠다"고
   * 잘못 센다.
   */
  [/(싱글렉|싱글 ?레그|한 ?발).*(홉|포고|뎁스|드롭)/, '런지'],
  // 옆으로 움직이는 파워 동작도 한 발에 실린다. '레터럴 레이즈'(어깨)와 섞이지
  // 않게 뒤에 오는 말까지 함께 본다.
  [/레터럴 ?(미니 ?)?허들|레터럴 ?미디얼|레터럴 ?셔플|레터럴 ?바운드|레터럴 ?홉|레터럴 ?점프|레터럴 ?드라이브|측면 ?홉|레터럴 ?원판|스플릿 ?스탠스|스케이트/, '런지'],
  // ── 힌지 (고관절 지배)
  [/데드리프트|RDL|힌지|굿모닝|굿 ?모닝|힙 ?쓰러스트|힙 ?스러스트|브리지|스윙|풀 ?스루|햄스트링|노르딕|킥백|힙 ?익스텐션|백 ?익스텐션|스내치|클린|스냅다운|글루트[·ㆍ・]?햄|글루트 ?햄/, '힌지'],
  // ── 스쿼트 (양측 무릎 지배)
  [/스쿼트|레그 ?프레스|박스 ?점프|점프 ?스쿼트|뎁스 ?드롭|포고|홉|바운드|브로드 ?점프|월 ?싯|드롭[- ]?캐치/, '스쿼트'],
  /*
   * 종아리는 제 계열을 갖는다. 무릎도 고관절도 아니라서 '스쿼트'로 적으면
   * 하루 구성이 "무릎 계열은 채웠다"고 잘못 세지만, 비워 두면 겹침 판정을
   * 아예 안 받아 무한정 들어온다 — 하체 근력 날 본운동의 32%가 이것이었다.
   */
  [/카프 ?레이즈|종아리/, '카프'],
  // ── 밀기
  [/프레스|푸쉬업|푸시업|팔굽혀|딥스|딥 |익스텐션|푸시 ?아웃|푸쉬 ?아웃|푸시다운|푸쉬다운|체스트 ?패스/, '밀기'],
  // ── 당기기
  // '컬'만 쓰면 '버티(컬) 점프'가 당기기로 들어온다 — 컬은 이름을 붙여 좁힌다
  [/로우|풀업|친업|풀 ?다운|풀다운|이두 ?컬|해머 ?컬|덤벨 ?컬|바벨 ?컬|프리처|페이스 ?풀|풀 ?어파트|풀 ?오버|밴드 ?풀|슈러그|랫 |당기기|데드행|행잉/, '당기기'],
  // ── 회전 (몸통을 돌리거나, 돌아가지 않게 버티거나)
  [/회전|로테이|초핑|촙|찹|리프트|팔로프|파로프|비틀|트위스트|스로우|던지|토스|슬램|디스로테|안티 ?로테|사이드 ?플랭크|러시안|180도/, '회전'],
  // ── 운반 (들고 버티거나 걷는다)
  [/캐리|파머스|웨이터|수트케이스|행진|마치/, '운반'],
];

/**
 * 이 카테고리에서만 채운다.
 *
 * 본운동 자리를 채우는 셋이다. 편중이 실제로 문제가 된 곳이 거기다 —
 * 60일 중 25일이 무릎 계열로만 채워졌다.
 *
 * 나머지는 일부러 비운다. 모빌리티·암케어·회복 및 보강은 이 축으로 가를 것이
 * 없고, 코어는 이 축과 아예 다른 축(버티기·항회전)이 필요하다. 스트레칭을
 * 억지로 '힌지'라고 적어두면 하루 구성에서 "힌지가 이미 있다"고 잘못 세게 된다.
 */
const FILL_CATEGORIES = ['하체 스트렝스', '상체 스트렝스', '파워'];

function patternOf(title) {
  // null 을 돌려주는 규칙이 있다 — 일부러 비우는 것과 못 가른 것을 여기서는 같게 본다.
  for (const [re, name] of RULES) if (re.test(title)) return name;
  return null;
}

const all = await prisma.exerciseVideo.findMany({
  where: { hiddenAt: null },
  select: { id: true, title: true, category: true, movementPattern: true },
  orderBy: [{ category: 'asc' }, { title: 'asc' }],
});

const target = all.filter((e) => FILL_CATEGORIES.includes(e.category));
const filled = [];
const missed = [];

for (const ex of target) {
  if (ex.movementPattern && !force) continue;
  const p = patternOf(ex.title);
  if (p) filled.push({ ...ex, pattern: p });
  else missed.push(ex);
}

const byPattern = {};
for (const f of filled) byPattern[f.pattern] = (byPattern[f.pattern] ?? 0) + 1;

console.log(`대상 ${target.length}개 (${FILL_CATEGORIES.join(' · ')})`);
console.log(`  가른 것 ${filled.length}개 —`, JSON.stringify(byPattern));
console.log(`  못 가른 것 ${missed.length}개\n`);

if (missed.length) {
  console.log('── 사람이 봐야 하는 것 ──');
  for (const m of missed) console.log(`  [${m.category}] ${m.title}`);
  console.log('');
}

if (!save) {
  console.log('── 채울 내용 (앞부분) ──');
  for (const f of filled.slice(0, 40)) {
    console.log(`  ${f.pattern.padEnd(4)} │ [${f.category}] ${f.title}`);
  }
  if (filled.length > 40) console.log(`  … 그리고 ${filled.length - 40}개 더`);
  console.log('\n실제로 저장하려면 --save 를 붙이세요.');
} else {
  for (const f of filled) {
    await prisma.exerciseVideo.update({
      where: { id: f.id },
      data: { movementPattern: f.pattern },
    });
  }
  console.log(`${filled.length}개를 저장했습니다.`);
}

await prisma.$disconnect();
