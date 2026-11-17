import { focusPriority } from '@/lib/mechanics/focus-priority';
/**
 * 투구 드릴을 '동작' 단위로 묶는다 — 메카닉 칸 · 프로그램 · 따라 하기가 같이 쓴다(2026-10-04).
 *
 * 같은 동작을 도구만 바꾼 드릴이 많다 — 'P1 스트레치 스로우'는 야구공(스로잉 드릴) · 작은 메디신볼 · 큰 메디신볼 셋이다
 * (처음 113개 중 39개가 이렇게 겹쳤다). 화면에는 한 줄로, 도구는 칩으로 고른다.
 * 목적의 순위와 단계는 영상마다 보존한다. 추천할 때는 같은 목적·단계의 영상만 함께 보여 준다.
 */
import type { CachedGuide } from '@/lib/library-cache';
import { DRILL_STAGE_NAMES } from '@/lib/exercise-meta';
import { referenceThumbUrl } from '@/lib/reference-video';

/** 같은 동작의 도구 하나 — 야구공 · 작은 메디신볼 · 큰 메디신볼 … */
export type MechanicsVariant = {
  id: string;
  /** 드릴 분류 — 스로잉 드릴 · 메디신볼 드릴 · 무브먼트 패턴 드릴 */
  category: string;
  tool: string;
  equipment: string[];
  /** Optional only for older serialized views; new library rows always carry both fields. */
  focusPoints?: string[];
  stage?: string | null;
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
  if (/\(큰(?: 공| 메디신볼)\)\s*$/.test(g.title)) return '큰 메디신볼';
  if (/\(작은(?: 공| 메디신볼)\)\s*$/.test(g.title)) return '작은 메디신볼';
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
    .replace(/\s*\((큰|작은)(?: 공| 메디신볼)\)\s*$/, '')
    .replace(/^P\d+\s+/, '')
    .trim();

/** 도구 차례 — 실제 공에 가까운 것부터(야구공 → 작은 공 → 큰 공) */
const TOOL_ORDER = ['야구공', '플라이오볼', '작은 메디신볼', '메디신볼', '큰 메디신볼'];
export const toolPriority = (tool: string) => {
  const rank = TOOL_ORDER.indexOf(tool);
  return rank < 0 ? TOOL_ORDER.length : rank;
};

/** Project families into homogeneous recommendation views without copying purposes between videos. */
export function drillPurposeViews<T extends {
  focusPoints: string[];
  stage: string | null;
  variants: { focusPoints?: string[]; stage?: string | null }[];
}>(drills: T[]): T[] {
  return drills.flatMap((drill) => {
    if (!drill.variants.length) return [drill];
    const views = new Map<string, T>();
    for (const variant of drill.variants) {
      const focusPoints = variant.focusPoints ?? drill.focusPoints;
      const stage = variant.stage === undefined ? drill.stage : variant.stage;
      const key = JSON.stringify([focusPoints, stage]);
      const found = views.get(key);
      if (found) found.variants.push(variant);
      else views.set(key, { ...drill, focusPoints, stage, variants: [variant] });
    }
    return [...views.values()];
  });
}

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
      focusPoints: [...g.focusPoints],
      stage: g.stage,
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
  for (const d of byTitle.values()) {
    d.variants.sort((a, b) => toolPriority(a.tool) - toolPriority(b.tool) || a.id.localeCompare(b.id));
    // Default display is deterministic. Recommendation consumers use drillPurposeViews instead.
    d.focusPoints = [...d.variants[0].focusPoints!];
    d.stage = d.variants[0].stage!;
  }
  return [...byTitle.values()];
}

/** 3D 분석 '메카닉 점검' 카드가 고칠 요소마다 보여 줄 드릴 — 쉬운 단계부터, 같은 단계면 그 요소가 주 요소인 동작 먼저 */
export type DrillPick = { title: string; stage: string | null };

export function drillPicksFor(drills: MechanicsDrillView[], element: string, n = 3): { count: number; items: DrillPick[] } {
  const order: readonly string[] = DRILL_STAGE_NAMES;
  const stageRank = (s: string | null) => (s && order.includes(s) ? order.indexOf(s) : order.length);
  const mine = drillPurposeViews(drills).filter((d) => d.focusPoints.includes(element));
  const sorted = [...mine].sort(
    (a, b) =>
      stageRank(a.stage) - stageRank(b.stage) ||
      focusPriority(a.focusPoints, [element]) - focusPriority(b.focusPoints, [element]) ||
      a.title.localeCompare(b.title, 'ko')
  );
  const unique = sorted.filter((d, index) => sorted.findIndex((other) => other.title === d.title) === index);
  return { count: unique.length, items: unique.slice(0, n).map((d) => ({ title: d.title, stage: d.stage })) };
}
