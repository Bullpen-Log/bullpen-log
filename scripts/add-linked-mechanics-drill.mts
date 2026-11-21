/** 검수용 참고 드릴 등록. ID를 하나 이상 지정하며 기본은 조회만 한다. */
import { readFileSync } from 'node:fs';
import { LATER_CATEGORY } from '@/lib/categories';
import { DRILL_EQUIPMENT, DRILL_STAGE_NAMES, FOCUS_POINTS } from '@/lib/exercise-meta';
import { YT_ID } from '@/lib/exercise-video-state';
import { canonicalInstagramLink, descriptionWithInstagram, splitInstagramReference } from '@/lib/mechanics/reference-draft';
import { prisma } from '@/lib/prisma';
import { itemOf } from '@/lib/shoot/plan';

type Candidate = {
  id: string;
  title: string;
  url?: string;
  youtubeId?: string;
  aspectRatio?: number;
  description: string;
  focusPoints: (typeof FOCUS_POINTS)[number][];
  equipment: (typeof DRILL_EQUIPMENT)[number][];
  stage: (typeof DRILL_STAGE_NAMES)[number];
};

function prepare(draft: Candidate) {
  const instagram = draft.url ? canonicalInstagramLink(draft.url) : null;
  const youtube = draft.youtubeId && YT_ID.test(draft.youtubeId) ? draft.youtubeId : null;
  const planned = itemOf(draft.id);
  if ((!instagram && !youtube) || (instagram && youtube) || !planned || planned.item.kind !== 'drill' ||
      !draft.title.trim() || !draft.description.trim() || !draft.focusPoints.length ||
      draft.focusPoints.some((focus) => !FOCUS_POINTS.includes(focus)) ||
      draft.equipment.some((name) => !DRILL_EQUIPMENT.includes(name)) || !DRILL_STAGE_NAMES.includes(draft.stage)) {
    throw new Error(`참고 링크, 설명, 분류 또는 촬영 계획을 확인해 주세요: ${draft.title}`);
  }
  return { draft, instagram, youtube, planned };
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.at(-1) === '--apply';
  const ids = apply ? args.slice(0, -1) : args;
  const catalog = JSON.parse(readFileSync(new URL('../lib/shoot/linked-drills.json', import.meta.url), 'utf8')) as Candidate[];
  const drafts = catalog.filter((entry) => ids.includes(entry.id));
  if (!drafts.length || drafts.length !== ids.length) throw new Error('드릴 ID를 하나 이상 지정하고 적용할 때는 마지막에 --apply를 쓰세요.');
  const candidates = drafts.map(prepare);

  const results = await prisma.$transaction(async (tx) => {
    const output = [];
    for (const { draft, instagram, youtube, planned } of candidates) {
      const title = { equals: draft.title, mode: 'insensitive' as const };
      const reference = youtube ? { referenceVideoId: youtube } : { description: { contains: instagram! } };
      const [drills, exercise] = await Promise.all([
        tx.mechanicsGuide.findMany({
          where: { OR: [{ id: draft.id }, { title }, reference] },
          select: { id: true, title: true, description: true, referenceVideoId: true, videoPath: true, source: true, hiddenAt: true },
        }),
        tx.exerciseVideo.findFirst({ where: { OR: [{ title }, reference] }, select: { title: true } }),
      ]);
      const duplicates = drills.filter((row) => row.id !== draft.id).map((row) => row.title);
      if (exercise) duplicates.push(exercise.title);
      if (duplicates.length) throw new Error(`같은 제목 또는 원본이 이미 있습니다: ${duplicates.join(', ')}`);

      const existing = drills[0];
      let result = 'ready';
      if (existing) {
        const sameSource = youtube
          ? existing.referenceVideoId === youtube
          : splitInstagramReference(existing.description).url === instagram;
        if (existing.hiddenAt || (!sameSource && !(existing.source === 'OWN' && existing.videoPath && existing.title === draft.title))) {
          throw new Error(`지정한 ID의 기존 드릴이 숨겨졌거나 다른 원본을 가리킵니다: ${draft.title}`);
        }
        result = 'already-added';
      } else if (apply) {
        await tx.mechanicsGuide.create({ data: {
          id: draft.id,
          title: draft.title,
          category: LATER_CATEGORY,
          description: instagram ? descriptionWithInstagram(draft.description, instagram) : draft.description,
          source: 'REFERENCE',
          referenceVideoId: youtube,
          aspectRatio: draft.aspectRatio,
          equipment: draft.equipment,
          focusPoints: draft.focusPoints,
          stage: draft.stage,
        } });
        result = 'created';
      }
      output.push({ result, id: draft.id, title: draft.title, week: planned.week, no: planned.item.no });
    }
    return output;
  }, { isolationLevel: 'Serializable', timeout: 20_000 });

  console.log(JSON.stringify(results));
}

try {
  await main();
} finally {
  await prisma.$disconnect();
}
