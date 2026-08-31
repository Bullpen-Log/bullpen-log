/**
 * 참고 영상의 가로세로 비율을 채운다.
 *
 *   node --env-file=.env scripts/fill-video-aspect.mjs        (미리보기)
 *   node --env-file=.env scripts/fill-video-aspect.mjs --yes  (저장)
 *
 * 비율 칸을 나중에 만들었으므로 이미 등록된 것들은 비어 있다. 비어 있으면
 * 화면이 가로로 보므로 당장 망가지지는 않지만, 그중에 세로 영상이 섞여 있으면
 * 좌우가 검게 막힌 채로 나온다. 한 번 재서 채워 둔다.
 *
 * 유튜브 페이지를 한 편씩 열어 보므로 시간이 걸린다(383편에 2분쯤). 한꺼번에
 * 던지면 막힐 수 있어 사이를 둔다.
 *
 * 이미 채워진 것은 건드리지 않는다. --all 을 붙이면 전부 다시 잰다.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { probeAspect } from './youtube-aspect.mjs';

const apply = process.argv.includes('--yes');
const redoAll = process.argv.includes('--all');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

/** 두 표를 같은 방식으로 다룬다. */
const TABLES = [
  { name: '운동 영상', model: prisma.exerciseVideo },
  { name: '투구 드릴', model: prisma.mechanicsGuide },
];

let total = 0;
let portrait = 0;
let blocked = 0;
let failed = 0;

for (const { name, model } of TABLES) {
  const rows = await model.findMany({
    where: {
      referenceVideoId: { not: null },
      ...(redoAll ? {} : { aspectRatio: null }),
    },
    select: { id: true, title: true, referenceVideoId: true },
  });

  if (rows.length === 0) {
    console.log(`[${name}] 잴 것이 없습니다.`);
    continue;
  }

  console.log(`[${name}] ${rows.length}편을 잽니다…`);

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const got = await probeAspect(row.referenceVideoId);
    total++;

    if (!got) {
      failed++;
      console.log(`  ✗ ${row.title} — 못 읽음 (영상이 없거나 비공개일 수 있습니다)`);
    } else {
      if (got.ratio < 0.95) {
        portrait++;
        console.log(`  ↕ ${row.title} — 세로 ${got.width}x${got.height}`);
      }
      /*
       * 삽입이 막힌 영상은 우리 화면에서 재생이 안 된다. 지우지는 않고
       * 알리기만 한다 — 지울지 바꿀지는 사람이 정할 일이다.
       */
      if (!got.embeddable) {
        blocked++;
        console.log(`  ⚠ ${row.title} — 다른 사이트에서 재생이 막힌 영상입니다`);
      }
      if (apply) {
        await model.update({
          where: { id: row.id },
          data: { aspectRatio: got.ratio },
        });
      }
    }

    if (i > 0 && i % 50 === 0) console.log(`     … ${i}/${rows.length}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

console.log(
  `\n총 ${total}편 · 세로 ${portrait}편 · 재생 막힘 ${blocked}편 · 못 읽음 ${failed}편`
);
if (!apply) console.log('미리보기입니다. 저장하려면 --yes 를 붙이세요.');
else console.log('저장했습니다.');

await prisma.$disconnect();
