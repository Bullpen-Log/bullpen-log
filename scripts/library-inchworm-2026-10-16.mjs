/**
 * 운동 라이브러리 워밍업에 인치웜을 더한다(2026-10-16 김민: 워밍업 루틴 ② 동적 가동에 쓸 것 — "인치웜만 추가해줘").
 *
 * id 는 야외 촬영 계획의 같은 워밍업(lib/shoot/warmups.ts warmup-common-05)에 미리 정해 둔 uuid — 나중에 그 촬영 영상을 올리면
 * attachShootClip 이 이 줄에 붙인다(app/actions/shoot.ts). 그때까지는 참고 영상(크레시 · 야구 훈련)으로 보인다.
 * 이미 있으면 건너뛴다. --apply 뒤 lib/library-cache.ts 의 library:exercises 이름을 하나 올려 커밋한다.
 *
 *   node --env-file=.env scripts/library-inchworm-2026-10-16.mjs           # 확인만
 *   node --env-file=.env scripts/library-inchworm-2026-10-16.mjs --apply   # 넣기(먼저 npm run backup)
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
const apply = process.argv.includes('--apply');

const ROW = {
  id: 'adca4350-7368-4d1f-97a5-26caae35c749',
  title: '인치웜',
  category: '워밍업',
  source: 'REFERENCE',
  referenceVideoId: 'GraVklbg1qo',
  movementPattern: null,
  intensity: '매우 낮음',
  difficulty: '초급',
  equipment: ['맨몸'],
  bodyParts: ['햄스트링·둔근', '어깨', '코어'],
  sets: 1,
  reps: 5,
  restSeconds: 0,
  perSide: false,
  description: `■ 어떤 운동인가
서서 손을 바닥에 짚고 손으로 걸어 나가 엎드려뻗친 자세까지 갔다가, 발로 걸어 손에 다가가 다시 서는 동적 워밍업입니다. 다리 뒤쪽을 늘이면서 어깨와 몸통을 깨웁니다.

■ 이렇게 하세요
1. 똑바로 서서 무릎을 살짝 굽힌 채 손을 바닥에 짚습니다.
2. 손으로 한 걸음씩 걸어 나가 엎드려뻗친 자세가 되게 합니다.
3. 허리가 처지지 않게 배에 힘을 주고 1초 멈춥니다.
4. 발로 작게 걸어 손 쪽으로 다가간 뒤 천천히 일어섭니다.
5. 다리 뒤가 당기면 무릎을 더 굽혀도 됩니다.

■ 투수에게 왜 필요한가
투구는 다리 뒤쪽이 늘어나며 힘을 받고, 어깨가 몸무게를 지탱하며 안정돼야 합니다. 본운동 전에 이 둘을 한 동작으로 함께 준비합니다.`,
};

const a = await probeAspect(ROW.referenceVideoId);
if (!a?.embeddable) throw new Error('참고 영상을 못 읽거나 앱에서 못 틂');
const row = { ...ROW, aspectRatio: Math.round(a.ratio * 1000) / 1000 };
const have = await prisma.exerciseVideo.findFirst({
  where: { OR: [{ id: row.id }, { title: row.title }] },
  select: { id: true, title: true },
});
console.log(`${have ? `있음 · 건너뜀(${have.id})` : '새로'} | ${row.title} | ${row.category} · ${row.intensity} · 비율 ${row.aspectRatio}`);
if (!have && apply) {
  await prisma.exerciseVideo.create({ data: { ...row, detailsFilledAt: new Date() } });
  console.log('넣음 — lib/library-cache.ts 의 library:exercises 이름을 올릴 것');
} else if (!apply) console.log('확인만 했다. 넣으려면 --apply');
await prisma.$disconnect();
