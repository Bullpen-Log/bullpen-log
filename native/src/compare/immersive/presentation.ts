/**
 * 몰입 비교의 보기 상태(순수 — IM03 · IM04 · IM09). 분할/겹침 · 채움/전체 · 위 영상 · 진하기 · 반반(wipe)을 한곳에서.
 *
 * - '흐리게'는 블러가 아니라 위 영상의 진하기(불투명도)를 낮추는 것 — 공 · 손 · 관절 윤곽은 선명하게 남는다.
 * - 진하기 끝점: 0 = 아래 영상만, 1 = 위 영상만. 바꾸는 것은 위 영상 그림 하나뿐(조작 · 무대 · 두 부모를 흐리게 하지 않는다).
 * - 새 비교: 분할에서 기준을 맞춘 뒤 처음 한 번 겹침(위 B 45%)으로 연다. 사람이 분할을 고르면 그 뒤로는 그대로.
 * - 예전 문서(이 칸이 없음): 저장된 겹침 켬/끔 · 진하기 · 반반을 그대로 읽고, 표시는 새 기본 '채움'(사람이 고른 것이 아님으로 표시).
 *   확대 · 이동 · 기준 · 원본은 건드리지 않는다. DB 는 안 바뀐다(문서 JSON 의 선택 칸).
 *
 * doc.ts 짝의 선택 칸 `present` 로 저장하고 workbench 가 읽는다(2026-11-03 통합).
 */
import type { DisplayMode } from '~/compare/immersive/geometry';

export type CompareView = 'split' | 'overlay';
export type Layer = 'a' | 'b';

export type Presentation = {
  view: CompareView;
  display: DisplayMode;
  /** 표시(채움/전체)를 사람이 골랐는가 — 아니면 앞으로 기본값이 바뀌어도 따라간다 */
  displayChosen: boolean;
  /** 겹침에서 위에 놓는 영상(표시만 — 영상 A/B · 장면 · 기준 · 메모는 바뀌지 않는다) */
  top: Layer;
  /** 위 영상 진하기 0~1(5% 걸음) */
  opacity: number;
  /** 반반 비교 가름 자리(0~1) — 켜져 있으면 진하기는 쓰지 않는다 */
  wipe: number | null;
  /** 이 문서가 새로 만든 비교인가(예전 문서는 저장된 보기를 그대로 두고 자동 겹침을 하지 않는다) */
  origin: 'new' | 'legacy';
  /** 분할/겹침을 사람이 골랐는가 · 새 비교의 첫 자동 겹침을 했는가 */
  viewChosen: boolean;
  autoOverlayDone: boolean;
};

export const NEW_TOP_OPACITY = 0.45;
export const OPACITY_PRESETS = [0.25, 0.5, 0.75] as const;
export const OPACITY_STEP = 0.05;
const LABEL: Record<Layer, string> = { a: 'A', b: 'B' };

const fin = (n: unknown): number | null => (typeof n === 'number' && Number.isFinite(n) ? n : null);
/** 5% 걸음 · 0~1 */
export const snapOpacity = (o: number): number => Math.min(1, Math.max(0, Math.round(Math.round((Number.isFinite(o) ? o : NEW_TOP_OPACITY) / OPACITY_STEP) * OPACITY_STEP * 100) / 100));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** 새 비교의 시작 상태 — 기준 맞추기는 분할에서 */
export function newPresentation(): Presentation {
  return { view: 'split', display: 'fill', displayChosen: false, top: 'b', opacity: NEW_TOP_OPACITY, wipe: null, origin: 'new', viewChosen: false, autoOverlayDone: false };
}

/** 예전 짝의 겹침 칸(doc.PairState.overlay 모양) */
export type LegacyOverlay = { on: boolean; opacity: number; wipe: number | null };

/**
 * 저장 값 → 보기 상태. raw 가 없으면(예전 문서) 예전 겹침 칸을 그대로 옮기고 표시는 채움.
 * 깨진 칸은 하나씩 기본으로(통째로 버리지 않는다).
 */
export function parsePresentation(raw: unknown, legacy: LegacyOverlay | null): Presentation {
  const leg = legacy ?? { on: false, opacity: NEW_TOP_OPACITY, wipe: null };
  if (!raw || typeof raw !== 'object') {
    return {
      view: leg.on ? 'overlay' : 'split',
      display: 'fill',
      displayChosen: false,
      top: 'b',
      opacity: r2(Math.min(1, Math.max(0, fin(leg.opacity) ?? NEW_TOP_OPACITY))),
      wipe: fin(leg.wipe) != null ? Math.min(1, Math.max(0, leg.wipe as number)) : null,
      origin: 'legacy',
      viewChosen: true,
      autoOverlayDone: true,
    };
  }
  const p = raw as Record<string, unknown>;
  const opacity = fin(p.opacity);
  const wipe = fin(p.wipe);
  return {
    view: p.view === 'overlay' ? 'overlay' : 'split',
    display: p.display === 'full' ? 'full' : 'fill',
    displayChosen: p.displayChosen === true,
    top: p.top === 'a' ? 'a' : 'b',
    opacity: opacity != null ? snapOpacity(opacity) : NEW_TOP_OPACITY,
    wipe: wipe != null ? Math.min(1, Math.max(0, wipe)) : null,
    origin: p.origin === 'new' ? 'new' : 'legacy',
    viewChosen: p.viewChosen === true,
    autoOverlayDone: p.autoOverlayDone === true,
  };
}

/** 저장 칸(문서 JSON) — 선택 칸이라 옛 앱은 모른 채 지나간다. 예전 overlay 칸도 같이 맞춰 쓰면 옛 화면이 같은 보기를 연다 */
export function serializePresentation(p: Presentation): Record<string, unknown> {
  return { view: p.view, display: p.display, displayChosen: p.displayChosen, top: p.top, opacity: r2(p.opacity), wipe: p.wipe, origin: p.origin, viewChosen: p.viewChosen, autoOverlayDone: p.autoOverlayDone };
}
/** 예전 겹침 칸으로 옮길 값 — 옛 판은 진하기를 0.1~0.9 로만 읽는다(끝점은 옛 판에서 가까운 값으로 보인다) */
export const legacyOverlayOf = (p: Presentation): LegacyOverlay => ({ on: p.view === 'overlay', opacity: Math.min(0.9, Math.max(0.1, p.opacity)), wipe: p.wipe });

/**
 * 새 비교에서 기준을 다 맞춘 순간 — 처음 한 번만 겹침(위 B 45%)으로. 사람이 이미 보기를 골랐거나 예전 문서 · B 가 없으면 그대로.
 * 재생 시각 · 기준 · 반복 · 속도 · 구도 · 그림은 이 상태 밖이라 바뀌지 않는다.
 */
export function onAnchorsReady(p: Presentation, hasB: boolean): Presentation {
  if (!hasB || p.origin !== 'new' || p.viewChosen || p.autoOverlayDone) return p;
  return { ...p, view: 'overlay', top: 'b', opacity: NEW_TOP_OPACITY, autoOverlayDone: true };
}

/** 분할 ↔ 겹침 한 번에 — 사람이 고른 것으로 남긴다 */
export const toggleView = (p: Presentation): Presentation => ({ ...p, view: p.view === 'overlay' ? 'split' : 'overlay', viewChosen: true, autoOverlayDone: true });
export const setView = (p: Presentation, view: CompareView): Presentation => ({ ...p, view, viewChosen: true, autoOverlayDone: true });
export const setDisplay = (p: Presentation, display: DisplayMode): Presentation => ({ ...p, display, displayChosen: true });
export const toggleDisplay = (p: Presentation): Presentation => setDisplay(p, p.display === 'fill' ? 'full' : 'fill');
/** 위 영상 A/B 바꾸기 — 표시만. 영상 바꾸기(doc 의 소스 교환)와 다르다 */
export const swapTop = (p: Presentation): Presentation => ({ ...p, top: p.top === 'a' ? 'b' : 'a' });
export const setOpacity = (p: Presentation, o: number): Presentation => ({ ...p, opacity: snapOpacity(o) });
export const stepOpacity = (p: Presentation, dir: 1 | -1): Presentation => setOpacity(p, p.opacity + dir * OPACITY_STEP);
export const setWipe = (p: Presentation, wipe: number | null): Presentation => ({ ...p, wipe: wipe == null ? null : Math.min(1, Math.max(0, wipe)) });

export const baseLayer = (p: Presentation): Layer => (p.top === 'a' ? 'b' : 'a');
/** 진하기 조절이 뜻이 있는가 — 반반이 켜져 있으면 진하기는 쓰지 않는다(조절을 숨기고 까닭을 적는다) */
export const opacityApplies = (p: Presentation) => p.view === 'overlay' && p.wipe == null;

/** 그림마다의 불투명도 — 아래 영상은 늘 1, 위 영상만 진하기. 반반이면 위 영상도 1(잘라 보인다) */
export function layerOpacity(p: Presentation): Record<Layer, number> {
  if (p.view !== 'overlay') return { a: 1, b: 1 };
  const t = p.wipe != null ? 1 : p.opacity;
  return p.top === 'b' ? { a: 1, b: t } : { a: t, b: 1 };
}

const pct = (o: number) => `${Math.round(o * 100)}%`;
/** 조절 이름 — 무엇을 바꾸는지 그대로: 'B 진하기45%' */
export const opacityLabel = (p: Presentation) => `${LABEL[p.top]} 진하기${pct(p.opacity)}`;
/** 읽어 주는 글 — 끝점 뜻까지 */
export function opacityA11y(p: Presentation): string {
  const o = Math.round(p.opacity * 100);
  const tail = o === 0 ? `, ${LABEL[baseLayer(p)]}만 보임` : o === 100 ? `, ${LABEL[p.top]}만 보임` : '';
  return `${LABEL[p.top]} 영상 진하기 ${o}퍼센트${tail}`;
}
export const wipeNote = '반반 비교에서는 진하기를 쓰지 않아요';

/** 표시 상태 줄 — 채움에서 잘림이 있으면 꼭 알린다(손 · 공 · 발이 잘릴 수 있다) */
export function displayBadge(p: Presentation, cropped: boolean): string {
  if (p.display === 'full') return '전체';
  return cropped ? '채움 · 일부 잘림' : '채움';
}
/** 보기 바꾸기 단추 이름 */
export const viewToggleLabel = (p: Presentation) => (p.view === 'overlay' ? '분할로 보기' : '겹쳐 보기');
export const displayToggleLabel = (p: Presentation) => (p.display === 'fill' ? '전체 보기' : '채워 보기');
