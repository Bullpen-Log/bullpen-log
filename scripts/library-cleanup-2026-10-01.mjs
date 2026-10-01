/**
 * 운동 라이브러리 정리 — 2026-10-01 김민(사용자) 검토 결과.
 *
 * 1. 숨기기 8개 — 혼자서는 할 수 없거나(파트너 · 보조자가 꼭 있어야 함) 특수 세팅이 필요한 것.
 *    지우지 않고 숨긴다(hiddenAt) — 지난 기록은 남고, 새 일정 · 목록에는 안 나온다. 되돌리려면 hiddenAt 을 비우면 된다.
 *    (보수 · 세이프티바 운동은 사용자가 그대로 두기로 했다.)
 * 2. 장비 표시 고침
 *    - 밴드를 위에 걸어야 하는 점프 셋: 철봉을 더한다(밴드만 가진 집에서는 못 한다).
 *    - '또는'인데 '그리고'로 적힌 넷: 앱은 장비를 모두 가져야 보여 준다(lib/report/equipment.ts 의 canDo) —
 *      '덤벨 또는 케틀벨'을 [덤벨, 케틀벨]로 적어 덤벨만 가진 사람에게 고블렛 스쿼트가 안 나왔다. 더 흔한 덤벨 하나로.
 *    - 꼭 필요하지 않은 받침: 6방향 덤벨 레터럴 레이즈의 벤치, 덤벨 스텝업의 박스(벤치 · 계단으로도 된다).
 * 3. 이름 — 상품 이름(3D 스트랩 · 쿡 밴드)을 '밴드'로. 실제로 긴 밴드로 한다.
 * 4. 설명 — 노르딕 햄스트링에 혼자 하는 방법, 밴드 보조 점프에 거는 자리.
 *
 * 쓰는 법: node --env-file=.env scripts/library-cleanup-2026-10-01.mjs        (바꿀 것만 보여 줌)
 *          node --env-file=.env scripts/library-cleanup-2026-10-01.mjs --apply
 * 여러 번 돌려도 같다(이미 바뀐 것은 건너뛴다). 바꾼 뒤에는 lib/library-cache.ts 의 캐시 이름을 올린다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const HIDE = [
  '행잉밴드 리버스 런지',
  '파트너 누워서 메디신볼 체스트 패스',
  '파트너 밴드 저항 스텝업',
  '싱글렉 케틀벨 교대 + 밴드 흔들기',
  '스플릿 스탠스 90/90 버티기 + 흔들기',
  '하프닐링 90/90 버티기 + 흔들기',
  '하프닐링 웨이터 캐리 + 흔들기',
  '바벨 드롭-캐치(버티며 내리기)',
];

const EQUIPMENT = {
  '밴드 보조 스쿼트 점프': ['밴드', '철봉'],
  '밴드 보조 포고': ['밴드', '철봉'],
  '밴드 어시스트 스플릿 스탠스 점프': ['밴드', '철봉'],
  '고블렛 스쿼트': ['덤벨'],
  '고릴라 로우': ['덤벨'],
  '편측 파머스 캐리': ['덤벨'],
  '사이드라잉 외회전 리바운드': ['덤벨'],
  '6방향 덤벨 레터럴 레이즈': ['덤벨'],
  '덤벨 스텝업': ['덤벨'],
};

const RENAME = {
  '3D 스트랩 흉추 회전': '밴드 흉추 회전 (여러 각도)',
  '3D 스트랩 보조 고관절 내회전': '밴드 보조 고관절 내회전',
  '3D 스트랩 보조 고관절 내회전 + 안정성': '밴드 보조 고관절 내회전 + 안정성',
  '3D 스트랩 보조 고관절 외회전 + 안정성': '밴드 보조 고관절 외회전 + 안정성',
  '3D 스트랩 저항 고관절 외회전': '밴드 저항 고관절 외회전',
  '스탠딩 쿡 밴드 마치': '스탠딩 밴드 마치',
  '쿡 밴드 + 다리 들어올리기': '밴드 고정 다리 들어올리기',
};

/** [운동 이름(바꾼 뒤), 옛 글, 새 글] */
const DESCRIPTION = [
  [
    '노르딕 햄스트링',
    '1. 무릎을 꿇고 파트너가 발목을 눌러 고정합니다.',
    '1. 무릎을 꿇고 발목을 고정합니다. 혼자라면 소파 · 침대처럼 무거운 가구 밑이나 원판을 끼운 바벨 아래에 발뒤꿈치를 걸고, 함께하는 사람이 있으면 발목을 눌러 달라고 합니다.',
  ],
  [
    '밴드 보조 스쿼트 점프',
    '밴드를 위쪽 기구에 걸고',
    '밴드를 철봉이나 랙 위쪽에 걸고',
  ],
  ['밴드 보조 포고', '밴드를 위쪽 기구에 걸어', '밴드를 철봉이나 랙 위쪽에 걸어'],
  ['덤벨 스텝업', '박스나 벤치 위로', '박스 · 벤치 · 계단 위로'],
];

const rows = await prisma.exerciseVideo.findMany({
  select: { id: true, title: true, equipment: true, description: true, hiddenAt: true },
});
const byTitle = (title) => {
  const found = rows.filter((r) => r.title === title);
  if (found.length > 1) throw new Error(`같은 이름이 둘 이상: ${title}`);
  return found[0] ?? null;
};

const ops = [];
const log = [];

for (const title of HIDE) {
  const r = byTitle(title);
  if (!r) throw new Error(`없는 운동: ${title}`);
  if (r.hiddenAt) continue;
  log.push(`숨김  ${title}`);
  ops.push(
    prisma.exerciseVideo.update({ where: { id: r.id }, data: { hiddenAt: new Date() } })
  );
}

for (const [title, equipment] of Object.entries(EQUIPMENT)) {
  const r = byTitle(title);
  if (!r) throw new Error(`없는 운동: ${title}`);
  if (JSON.stringify(r.equipment) === JSON.stringify(equipment)) continue;
  log.push(`장비  ${title}: ${r.equipment.join(',')} → ${equipment.join(',')}`);
  ops.push(prisma.exerciseVideo.update({ where: { id: r.id }, data: { equipment } }));
}

for (const [from, to] of Object.entries(RENAME)) {
  if (byTitle(to)) continue; // 이미 바꿈
  const r = byTitle(from);
  if (!r) throw new Error(`없는 운동: ${from}`);
  log.push(`이름  ${from} → ${to}`);
  ops.push(prisma.exerciseVideo.update({ where: { id: r.id }, data: { title: to } }));
}

for (const [title, before, after] of DESCRIPTION) {
  const r = byTitle(title);
  if (!r) throw new Error(`없는 운동: ${title}`);
  if (r.description.includes(after)) continue;
  if (!r.description.includes(before))
    throw new Error(`설명에 고칠 글이 없음: ${title} — ${before}`);
  log.push(`설명  ${title}: '${before}' → '${after}'`);
  ops.push(
    prisma.exerciseVideo.update({
      where: { id: r.id },
      data: { description: r.description.replace(before, after) },
    })
  );
}

console.log(log.length ? log.join('\n') : '바꿀 것 없음');
if (APPLY && ops.length) {
  await prisma.$transaction(ops);
  console.log(`\n${ops.length}건 적용`);
} else if (ops.length) {
  console.log(`\n(미리 보기 — 적용하려면 --apply)`);
}
await prisma.$disconnect();
