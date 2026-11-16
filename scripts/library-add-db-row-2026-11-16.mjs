/**
 * 상체 스트렝스에 '덤벨 벤트오버 로우'를 더한다(2026-11-16 김민: 최종 검토 뒤 "덤벨 벤트오버 로우 이거만 넣어줘").
 * 덤벨은 있고 벤치가 없으면 '중간' 이상 가로 당기기가 0개였다 — 덤벨 로우가 모두 벤치 · 박스를 썼다. 영상은 유튜브 참고 영상.
 * --apply 뒤 lib/library-cache.ts 의 library:exercises 이름을 하나 올린다(이 커밋에서 v52).
 *
 *   node --env-file=.env scripts/library-add-db-row-2026-11-16.mjs           # 확인만
 *   node --env-file=.env scripts/library-add-db-row-2026-11-16.mjs --apply   # 넣기(먼저 npm run backup)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

const ROW = {
  title: '덤벨 벤트오버 로우',
  referenceVideoId: 'JfcVsdTvbqQ',
  category: '상체 스트렝스',
  movementPattern: '당기기',
  bodyParts: ['등', '견갑', '이두', '코어'],
  equipment: ['덤벨'],
  intensity: '중간',
  difficulty: '초급',
  sets: 3,
  reps: 10,
  holdSeconds: null,
  restSeconds: 90,
  perSide: false,
  description: `■ 어떤 운동인가
두 손에 덤벨을 들고 엉덩이를 접어 상체를 숙인 채, 덤벨을 배꼽 옆으로 당기는 로우입니다. 벤치 없이 덤벨만 있으면 할 수 있는 기본 당기기입니다.

■ 이렇게 하세요
· 두 손에 덤벨을 들고 발을 엉덩이 너비로 섭니다.
· 무릎을 살짝 굽히고 엉덩이를 뒤로 보내 상체를 45도쯤 숙입니다. 등은 곧게, 덤벨은 어깨 아래에 둡니다.
· 날개뼈를 모으며 팔꿈치를 엉덩이 쪽으로 당겨 덤벨을 배꼽 옆까지 올립니다.
· 천천히 팔을 펴며 내립니다.
· 상체가 들리거나 반동을 쓰지 않습니다. 허리가 불편하면 한 손을 벤치에 짚는 싱글암 덤벨 로우로 바꿉니다.

■ 투수에게 왜 필요한가
투수는 미는 운동보다 당기는 운동을 더 해야 어깨 앞뒤 힘이 맞습니다. 덤벨만 있는 곳에서도 등 위쪽과 날개뼈 주변을 무겁게 기를 수 있고, 숙인 자세를 버티며 엉덩이와 허리 힘도 함께 씁니다.`,
};

const a = await probeAspect(ROW.referenceVideoId);
if (!a?.embeddable) throw new Error('참고 영상을 못 읽거나 앱에서 못 틂');
const have = await prisma.exerciseVideo.findFirst({ where: { title: ROW.title }, select: { id: true } });
console.log(`${have ? '있음 · 건너뜀' : '새로'} | ${ROW.title} | ${ROW.movementPattern} · ${ROW.intensity} · ${ROW.difficulty} · ${ROW.equipment.join('/')} · 비율 ${a.ratio}`);
if (!have && apply) {
  await prisma.exerciseVideo.create({
    data: { ...ROW, source: 'REFERENCE', aspectRatio: Math.round(a.ratio * 1000) / 1000, detailsFilledAt: new Date() },
  });
  console.log('넣음 — lib/library-cache.ts 의 library:exercises 이름을 올릴 것');
} else if (!apply) console.log('확인만 했다. 넣으려면 --apply');
await prisma.$disconnect();
