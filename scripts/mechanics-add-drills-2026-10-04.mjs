/**
 * 투구 드릴 12개를 더한다(2026-10-04) — 6요소로 나눠 보니 비어 있던 자리를 채운다.
 *
 * 나눠 본 결과(docs/mechanics/drill-classification.md): 스로잉은 팔 돌리기뿐이고 통합 단계가 없었다 · 상하체 분리 드릴은
 * 하나도 공을 던지지 않았다 · 몸통 회전에 통합이 없었다 · 드롭에 야구공 드릴이 적었다 · 플라이오볼 드릴이 없었다.
 * 그 빈칸에 맞는 널리 쓰는 드릴을 찾아(Tread Athletics · Driveline 위주, 영상이 실제로 그 드릴을 보이는지 장면으로 확인)
 * 사용자분이 고른 12개다. 수건 드릴은 뺐다(작은 채널 · 트레드가 낮게 봄 · 장비 목록에 수건이 없다).
 *
 * 영상은 유튜브 참고 영상(REFERENCE)이고 비율은 비워 둔다 — 넣은 뒤 scripts/fill-video-aspect.mjs 가 잰다.
 * 같은 제목이 이미 있으면 건너뛴다(여러 번 돌려도 같다).
 *
 * 쓰는 법: node --env-file=.env scripts/mechanics-add-drills-2026-10-04.mjs          (넣을 것만 보여 줌)
 *          node --env-file=.env scripts/mechanics-add-drills-2026-10-04.mjs --apply
 */
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});
const apply = process.argv.includes('--apply');
const drills = JSON.parse(
  readFileSync(new URL('./mechanics-add-drills-2026-10-04.json', import.meta.url), 'utf8')
);

let added = 0;
for (const d of drills) {
  const exists = await prisma.mechanicsGuide.findFirst({ where: { title: d.title } });
  if (exists) {
    console.log(`  있음  ${d.title}`);
    continue;
  }
  added += 1;
  console.log(`  더함  [${d.category}] ${d.title} — ${d.focusPoints.join(',')} · ${d.stage} · ${d.equipment.join('·')}`);
  if (apply) {
    await prisma.mechanicsGuide.create({
      data: {
        title: d.title,
        category: d.category,
        description: d.description,
        focusPoints: d.focusPoints,
        stage: d.stage,
        equipment: d.equipment,
        source: 'REFERENCE',
        referenceVideoId: d.referenceVideoId,
      },
    });
  }
}
console.log(`\n${apply ? '더함' : '더할 것'} ${added}개${apply ? '' : ' — --apply 로 적용'}`);
await prisma.$disconnect();
