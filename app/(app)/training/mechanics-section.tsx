import { favoriteDrillIds } from '@/lib/favorites';
import { visibleGuides, type CachedGuide } from '@/lib/library-cache';
import { createPlaybackUrls } from '@/lib/storage';
import { referenceThumbUrl } from '@/lib/reference-video';
import type { MechanicsTab } from './mechanics-tabs';
import { MechanicsGuide, MechanicsProgramIntro } from './mechanics-guide';
import type { MechanicsDrillView, MechanicsVariant } from './mechanics-drill';

/**
 * 메커니즘 칸 — [프로그램 | 요소별 드릴](2026-10-04).
 *
 * 투구 드릴(라이브러리의 '투구 드릴', MechanicsGuide)을 투구 요소 여섯으로 묶어 보여 준다. 암케어의 부위별 보강과 같은
 * 모양이다 — 요소 → 증상 · 설명 → 단계별 드릴. 글은 lib/mechanics/elements.ts.
 *
 * 프로그램 칸(쉬운 단계부터 올라가는 과정)은 다음 작업이다. 그때까지는 '투구 한눈에'와 요소별 드릴로 가는 길만 둔다.
 */
export async function MechanicsSection({
  user,
  tab,
  focus,
}: {
  user: { id: string; role: string; throwingHand: string | null };
  tab: MechanicsTab;
  /** 주소의 ?el= — 그 요소 카드를 열어 둔다 */
  focus: string | null;
}) {
  if (tab === 'program') {
    return <MechanicsProgramIntro />;
  }

  const [guides, favorites] = await Promise.all([visibleGuides(), favoriteDrillIds(user.id)]);
  const ownThumbs = await createPlaybackUrls(
    guides.filter((g) => !g.referenceVideoId && g.thumbPath).map((g) => g.thumbPath as string)
  );

  return (
    <MechanicsGuide
      drills={groupDrills(guides, favorites, ownThumbs)}
      hand={user.throwingHand}
      isAdmin={user.role === 'ADMIN'}
      focus={focus}
    />
  );
}

/** 도구 표시 — 제목 끝의 (큰 공) · (작은 공), 아니면 드릴 분류 · 장비로 */
function toolOf(g: CachedGuide): string {
  if (g.title.endsWith('(큰 공)')) return '큰 메디신볼';
  if (g.title.endsWith('(작은 공)')) return '작은 메디신볼';
  if (g.category === '메디신볼 드릴') return '메디신볼';
  if (g.category === '스로잉 드릴') return g.equipment.includes('야구공') ? '야구공' : (g.equipment[0] ?? '야구공');
  return g.equipment.join(' · ') || '맨몸';
}

/** 도구만 다른 드릴의 묶음 이름 — 제목 끝의 (큰 공) · (작은 공)을 뗀다 */
const familyTitle = (title: string) => title.replace(/\s*\((큰|작은) 공\)\s*$/, '').trim();

/** 도구 차례 — 실제 공에 가까운 것부터(야구공 → 작은 공 → 큰 공) */
const TOOL_ORDER = ['야구공', '플라이오볼', '작은 메디신볼', '메디신볼', '큰 메디신볼'];

/**
 * 같은 동작을 한 줄로 — 'P1 스트레치 스로우'는 야구공 · 작은 메디신볼 · 큰 메디신볼 셋이다(113개 중 39개가 이렇게 겹쳤다).
 * 요소 · 단계는 묶음의 첫 드릴 것을 쓴다 — 분류할 때 묶음마다 같게 넣었다(scripts/mechanics-classify-2026-10-04.json).
 */
function groupDrills(
  guides: CachedGuide[],
  favorites: Set<string>,
  ownThumbs: Record<string, string>
): MechanicsDrillView[] {
  const byTitle = new Map<string, MechanicsDrillView>();
  for (const g of guides) {
    if (g.focusPoints.length === 0) continue;
    const title = familyTitle(g.title);
    const variant: MechanicsVariant = {
      id: g.id,
      tool: toolOf(g),
      equipment: g.equipment,
      referenceVideoId: g.referenceVideoId,
      videoPath: g.videoPath,
      aspectRatio: g.aspectRatio,
      thumbUrl: g.referenceVideoId
        ? referenceThumbUrl(g.referenceVideoId)
        : g.thumbPath
          ? (ownThumbs[g.thumbPath] ?? null)
          : null,
      isReference: g.source === 'REFERENCE',
      favorite: favorites.has(g.id),
    };
    const found = byTitle.get(title);
    if (found) found.variants.push(variant);
    else byTitle.set(title, { title, focusPoints: g.focusPoints, stage: g.stage, variants: [variant] });
  }
  const rank = (tool: string) => {
    const i = TOOL_ORDER.indexOf(tool);
    return i < 0 ? TOOL_ORDER.length : i;
  };
  for (const d of byTitle.values()) d.variants.sort((a, b) => rank(a.tool) - rank(b.tool));
  return [...byTitle.values()];
}
