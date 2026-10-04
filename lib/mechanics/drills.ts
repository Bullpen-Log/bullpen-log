/**
 * 투구 드릴을 '동작' 단위로 묶는다 — 메커니즘 칸 · 프로그램 · 따라 하기가 같이 쓴다(2026-10-04).
 *
 * 같은 동작을 도구만 바꾼 드릴이 많다 — 'P1 스트레치 스로우'는 야구공(스로잉 드릴) · 작은 메디신볼 · 큰 메디신볼 셋이다
 * (처음 113개 중 39개가 이렇게 겹쳤다). 화면에는 한 줄로, 도구는 칩으로 고른다. 요소 · 단계는 묶음의 첫 드릴 것을 쓴다 —
 * 분류할 때 묶음마다 같게 넣었다(scripts/mechanics-classify-2026-10-04.json).
 */
import type { CachedGuide } from '@/lib/library-cache';
import { referenceThumbUrl } from '@/lib/reference-video';

/** 같은 동작의 도구 하나 — 야구공 · 작은 메디신볼 · 큰 메디신볼 … */
export type MechanicsVariant = {
  id: string;
  /** 드릴 분류 — 스로잉 드릴 · 메디신볼 드릴 · 무브먼트 패턴 드릴 */
  category: string;
  tool: string;
  equipment: string[];
  referenceVideoId: string | null;
  videoPath: string | null;
  aspectRatio: number | null;
  thumbUrl: string | null;
  isReference: boolean;
  favorite: boolean;
};

/** 동작 하나 */
export type MechanicsDrillView = {
  title: string;
  /** 맨 앞이 주 요소, 뒤가 보조 */
  focusPoints: string[];
  stage: string | null;
  variants: MechanicsVariant[];
};

/** 도구 표시 — 제목 끝의 (큰 공) · (작은 공), 아니면 드릴 분류 · 장비로 */
function toolOf(g: CachedGuide): string {
  if (g.title.endsWith('(큰 공)')) return '큰 메디신볼';
  if (g.title.endsWith('(작은 공)')) return '작은 메디신볼';
  if (g.category === '메디신볼 드릴') return '메디신볼';
  if (g.category === '스로잉 드릴') {
    return g.equipment.includes('야구공') ? '야구공' : (g.equipment[0] ?? '야구공');
  }
  return g.equipment.join(' · ') || '맨몸';
}

/**
 * 도구만 다른 드릴의 묶음 이름 — 제목 끝의 (큰 공) · (작은 공)을 떼고, 앞의 P1~P5 도 뗀다.
 * P1~P5 는 참고 영상 채널(Paradigm Pitching)의 구간 번호라 처음 보는 사람에겐 뜻이 없는 말이었다(2026-10-04 검토) —
 * 요소 · 단계 칩이 같은 일을 한다. 떼어도 96가지가 겹치지 않는다. 라이브러리(DB)의 이름은 그대로다.
 */
export const familyTitle = (title: string) =>
  title
    .replace(/\s*\((큰|작은) 공\)\s*$/, '')
    .replace(/^P\d+\s+/, '')
    .trim();

/** 도구 차례 — 실제 공에 가까운 것부터(야구공 → 작은 공 → 큰 공) */
const TOOL_ORDER = ['야구공', '플라이오볼', '작은 메디신볼', '메디신볼', '큰 메디신볼'];

/** 숨기지 않은 드릴 → 동작 묶음. 요소를 아직 안 정한 드릴은 뺀다 */
export function groupDrills(
  guides: CachedGuide[],
  favorites: Set<string> = new Set(),
  ownThumbs: Record<string, string> = {}
): MechanicsDrillView[] {
  const byTitle = new Map<string, MechanicsDrillView>();
  for (const g of guides) {
    if (g.focusPoints.length === 0) continue;
    const title = familyTitle(g.title);
    const variant: MechanicsVariant = {
      id: g.id,
      category: g.category,
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
