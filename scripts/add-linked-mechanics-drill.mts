/** 검수용 메커니즘 드릴 등록. 기본은 조회만, 실제 등록은 ID와 --apply를 함께 준다. */
import { readFileSync } from 'node:fs';
import { LATER_CATEGORY } from '@/lib/categories';
import { DRILL_EQUIPMENT, DRILL_STAGE_NAMES, FOCUS_POINTS } from '@/lib/exercise-meta';
import { canonicalInstagramLink, descriptionWithInstagram, splitInstagramReference } from '@/lib/mechanics/reference-draft';
import { prisma } from '@/lib/prisma';
import { itemOf } from '@/lib/shoot/plan';

type Candidate = {
  id: string;
  title: string;
  url: string;
  description: string;
  focusPoints: (typeof FOCUS_POINTS)[number][];
  equipment: (typeof DRILL_EQUIPMENT)[number][];
  stage: (typeof DRILL_STAGE_NAMES)[number];
};

async function main() {
  const args = process.argv.slice(2);
  const drafts = JSON.parse(readFileSync(new URL('../lib/shoot/linked-drills.json', import.meta.url), 'utf8')) as Candidate[];
  const draft = drafts.find((entry) => entry.id === args[0]);
  if (!draft || args.length > 2 || (args.length === 2 && args[1] !== '--apply')) {
    throw new Error('등록할 드릴 ID와 필요할 때 --apply를 지정하세요.');
  }
  const url = canonicalInstagramLink(draft.url);
  const planned = itemOf(draft.id);
  if (!url || !planned || planned.item.kind !== 'drill' || !draft.title.trim() || !draft.description.trim() ||
      !draft.focusPoints.length || draft.focusPoints.some((focus) => !FOCUS_POINTS.includes(focus)) ||
      draft.equipment.some((name) => !DRILL_EQUIPMENT.includes(name)) || !DRILL_STAGE_NAMES.includes(draft.stage)) {
    throw new Error('참고 링크, 설명, 분류 또는 촬영 계획을 확인해 주세요.');
  }

  const result = await prisma.$transaction(async (tx) => {
    const matches = await tx.mechanicsGuide.findMany({
      where: { OR: [{ id: draft.id }, { title: { equals: draft.title, mode: 'insensitive' } }, { description: { contains: url } }] },
      select: { id: true, title: true, description: true, hiddenAt: true },
    });
    if (matches.some((row) => row.id !== draft.id)) {
      throw new Error(`같은 제목 또는 원본이 이미 있습니다: ${matches.map((row) => row.title).join(', ')}`);
    }
    const existing = matches[0];
    if (existing) {
      if (existing.hiddenAt || splitInstagramReference(existing.description).url !== url) {
        throw new Error('지정한 ID의 기존 드릴이 숨겨졌거나 다른 원본을 가리킵니다.');
      }
      return 'already-added';
    }
    if (args[1] !== '--apply') return 'ready';
    await tx.mechanicsGuide.create({ data: {
      id: draft.id,
      title: draft.title,
      category: LATER_CATEGORY,
      description: descriptionWithInstagram(draft.description, url),
      source: 'REFERENCE',
      equipment: draft.equipment,
      focusPoints: draft.focusPoints,
      stage: draft.stage,
    } });
    return 'created';
  }, { isolationLevel: 'Serializable' });

  const row = result === 'ready' ? null : await prisma.mechanicsGuide.findUniqueOrThrow({
    where: { id: draft.id },
    select: { id: true, title: true, description: true, category: true, source: true, stage: true, focusPoints: true, videoPath: true },
  });
  if (row && splitInstagramReference(row.description).url !== url) throw new Error('등록한 원본 링크가 일치하지 않습니다.');
  console.log(JSON.stringify({ result, id: draft.id, title: draft.title, week: planned.week, no: planned.item.no, category: row?.category, source: row?.source }));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
