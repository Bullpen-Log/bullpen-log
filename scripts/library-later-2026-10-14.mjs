/**
 * 나중에 촬영할 운동 63개를 '나중에 촬영' 분류로 옮기고, 원래 분류를 lib/shoot/later.json 에 남긴다(2026-10-14 사용자: "전부 다 나중에
 * 촬영할거야 … 어느 카테고리의 운동이었는지는 나중에 기억할 수 있게"). 촬영 계획(plan-data.json)에서는 같은 커밋이 뺀다. 백업 db-2026-10-14-13-07.
 * 풀업 · 친업 설명에는 '맨몸으로 안 되면 머신 또는 밴드 보조' 한 줄을 넣는다(사용자).
 *
 *   node --env-file=.env scripts/library-later-2026-10-14.mjs                 # 확인만
 *   node --env-file=.env scripts/library-later-2026-10-14.mjs --apply         # 옮기기 + later.json 쓰기
 *   node --env-file=.env scripts/library-later-2026-10-14.mjs --restore 이름…  # 찍은 운동을 원래 분류로(이름 없으면 전부) · later.json 에서 뺌
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const LATER = '나중에 촬영';
const FILE = new URL('../lib/shoot/later.json', import.meta.url);
const TITLES = [
  '밴드 굿모닝', '보수볼 포워드 런지', '밴드 저항 싱글렉 박스 스쿼트', '싱글렉 에센트릭 스쿼트 (원판)', '싱글렉 스쿼트 + 원판 프레스 아웃',
  '에센트릭 포즈 고블렛 스쿼트', '밴드 고블렛 스쿼트', '세이프티바 스쿼트', '세이프티바 리버스 런지', '케틀벨 프론트 스쿼트',
  '다이아몬드 푸시업', '중량 친업', '밴드 보조 친업', '밴드 보조 풀업', '밴드 보조 푸시업', '에센트릭 덤벨 벤치 프레스',
  '밴드 오버헤드 익스텐션', '레터럴 마치 + 회전', '포워드 마치 + 회전', '톨닐링 막대 펠빅 틸트', '톨닐링 막대 골반 회전',
  '쿼드 힙 플렉서 + 흉추 회전', '쿼드 힙 플렉서 + 광배 스트레치', '와이드 스탠스 버티컬 점프', '폭발적 밴드 스텝업', '폭발적 밴드 풀 스루',
  '밴드 오버스피드 감속 + 반등', '밴드 저항 더블 스케이터 + 점프', '워터볼 스케이터 스틱 랜딩', '워터볼 180도 연속 점프',
  '하프닐링 웨이터 캐리 + 흔들기', '워터볼 오버헤드 사이드 크런치', '워터볼 오버헤드 찹', '톨닐링 워터볼 로테이션',
  '프론 90/90 플라이오볼 드롭', '90/90 플라이오볼 벽 드리블', '래디얼 디비에이션 에센트릭 오버로드', '전완 수피네이션 에센트릭 오버로드',
  '전완 프로네이션 에센트릭 오버로드', '밴드 킥백 + 프로네이션', '3방향 밴드 풀 어파트', '하프닐링 페이스 풀', '하프닐링 90/90 버티기 + 흔들기',
  '스플릿 스탠스 90/90 버티기 + 흔들기', '울나 디비에이션 에센트릭 오버로드', '프론 숄더 익스텐션', '프론 외회전', '사이드라잉 외회전',
  '스플릿 스탠스 스캡 로우 + 싱글암 로우', '스플릿 스탠스 스캡 로우 + 프레스', '밴드 스캡 핀치', '튜빙 언더핸드 W', '튜빙 리버스 스로우',
  '튜빙 대각선 스로우', '튜빙 대각선 신전', '튜빙 대각선 굴곡', '시티드 발목 내·외번 (메디신볼)', '밴드 보조 고관절 내회전 (오버헤드)',
  '워터볼 스피드 마치', '밴드 풀다운 레그 로어링', '밴드 보조 고관절 내회전', '밴드 보조 고관절 외회전 (막대 지지)', '밴드 저항 고관절 외회전',
];
const ASSIST = [
  { title: '풀업', from: '· 반동 없이 올라가세요. 어려우면 밴드로 발을 받치거나 개수를 줄이세요.', to: '· 반동 없이 올라가세요. 맨몸으로 안 되면 어시스트 머신이나 밴드 보조로 하세요.' },
  { title: '친업', from: '· 반동으로 올라가지 마세요. 어려우면 밴드를 쓰거나 개수를 줄이세요.', to: '· 반동으로 올라가지 마세요. 맨몸으로 안 되면 어시스트 머신이나 밴드 보조로 하세요.' },
];

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const args = process.argv.slice(2);

if (args[0] === '--restore') {
  const saved = JSON.parse(readFileSync(FILE, 'utf8'));
  const want = args.slice(1);
  const pick = Object.entries(saved).filter(([, v]) => !want.length || want.includes(v.title));
  for (const [id, v] of pick) {
    await prisma.exerciseVideo.update({ where: { id }, data: { category: v.category } });
    delete saved[id];
    console.log(`되돌림 ${v.title} → ${v.category}`);
  }
  writeFileSync(FILE, JSON.stringify(saved, null, 1) + '\n');
  console.log('운동 캐시(lib/library-cache.ts 의 library:exercises:vN)를 하나 올리고, 촬영 계획에 다시 넣을지 정한다.');
} else {
  const rows = await prisma.exerciseVideo.findMany({
    where: { title: { in: TITLES } },
    select: { id: true, title: true, category: true },
  });
  const missing = TITLES.filter((t) => !rows.some((r) => r.title === t));
  const dup = TITLES.filter((t) => rows.filter((r) => r.title === t).length > 1);
  const assist = await prisma.exerciseVideo.findMany({
    where: { title: { in: ASSIST.map((a) => a.title) } },
    select: { id: true, title: true, description: true },
  });
  const noLine = ASSIST.filter((a) => !assist.find((r) => r.title === a.title)?.description.includes(a.from));
  if (missing.length || dup.length || noLine.length) {
    console.log('멈춤 — 없음:', missing, '겹침:', dup, '설명 줄 없음:', noLine.map((a) => a.title));
    process.exit(1);
  }
  const saved = {};
  for (const r of [...rows].sort((a, b) => TITLES.indexOf(a.title) - TITLES.indexOf(b.title)))
    if (r.category !== LATER) saved[r.id] = { title: r.title, category: r.category };
  console.log(`옮길 것 ${Object.keys(saved).length}개 · 설명 고칠 것 ${ASSIST.length}개`);
  if (args.includes('--apply')) {
    await prisma.$transaction([
      prisma.exerciseVideo.updateMany({ where: { id: { in: Object.keys(saved) } }, data: { category: LATER } }),
      ...ASSIST.map((a) => {
        const r = assist.find((x) => x.title === a.title);
        return prisma.exerciseVideo.update({ where: { id: r.id }, data: { description: r.description.replace(a.from, a.to) } });
      }),
    ]);
    const old = (() => {
      try {
        return JSON.parse(readFileSync(FILE, 'utf8'));
      } catch {
        return {};
      }
    })();
    writeFileSync(FILE, JSON.stringify({ ...old, ...saved }, null, 1) + '\n');
    console.log('옮김 · lib/shoot/later.json 씀');
  } else console.log('--apply 로 옮긴다.');
}
await prisma.$disconnect();
