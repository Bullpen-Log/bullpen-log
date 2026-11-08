/**
 * 도구 숨김(몰입) 상태(순수 — IM06 · IM07 · IM09). 같은 비교 화면의 상태다 — 새 화면 · 새 재생기가 아니다.
 *
 * - '도구 숨기기' 한 번으로 들어가고, 늘 남는 '도구 보이기'(44pt) 한 번으로 돌아온다. 일부러 누른 영상 탭도 돌아오게 한다.
 * - 숨김이면 머리 · 타임라인 · 재생 · 도구 줄의 높이 · 폭 예약을 모두 푼다(자리만 남는 opacity 0 이 아니다). 숨긴 것은 읽어 주기에서도 뺀다.
 * - 이 상태는 재생을 시작 · 멈춤 · 되감기 · 다시 만들지 않는다 — 결과(effects)에 그런 명령이 없다(시험이 지킨다).
 * - 뒤로: 숨김이면 먼저 숨김만 끝내고(소비), 다음 뒤로부터 기존 계약(창 → 화면)을 따른다.
 * - 메모 · 자판 · 창이 필요해지면 먼저 도구를 되살린다(보이지 않는 조작면을 두지 않는다). 그리기 · 두 손가락 · 끌기 중에는 숨기지 않는다.
 * - 숨김은 저장하지 않는다(다시 열면 늘 도구가 보인다). 처음엔 자동 숨김이 없다.
 *
 * 화면(workbench)이 이 규칙을 쓴다(2026-11-03 통합).
 */

export type ChromeState = { hidden: boolean };
export const CHROME_SHOWN: ChromeState = { hidden: false };

/** 지금 무엇을 하고 있나 — 화면이 넘긴다 */
export type ChromeContext = {
  /** 메모 편집 · 자판이 열림 */
  editing: boolean;
  /** 창(도구 창 · 고르기 창)이 열림 */
  inspector: boolean;
  /** 그리기 · 두 손가락 확대 · 영상 이동 · 타임라인 끌기 중 */
  manipulating: boolean;
};
export const IDLE: ChromeContext = { editing: false, inspector: false, manipulating: false };

/** 한 번의 손짓 기록 — 탭인지 가른다 */
export type GestureSample = { pointers: number; dx: number; dy: number; ms: number; drawing: boolean; scrubbing: boolean };
export const TAP_SLOP = 10;
export const TAP_MS = 300;
export const isDeliberateTap = (g: GestureSample) =>
  g.pointers === 1 && !g.drawing && !g.scrubbing && Math.hypot(g.dx, g.dy) < TAP_SLOP && g.ms >= 0 && g.ms < TAP_MS;

export type ChromeEvent =
  | { type: 'hide' }
  | { type: 'show' }
  | { type: 'back' }
  | { type: 'tapVideo'; gesture: GestureSample }
  /** 메모 · 자판 · 창이 열려야 함 */
  | { type: 'needControls' }
  /** 화면을 떠남(뒤로 · 다른 탭) — 숨김은 들고 가지 않는다 */
  | { type: 'leave' };

/** 화면이 할 일 — 초점 돌리기 · 알림만. 재생 명령은 없다 */
export type ChromeEffect = { kind: 'focus'; target: 'restoreButton' | 'hideButton' } | { kind: 'announce'; text: string };
export type ChromeResult = { state: ChromeState; handled: boolean; blocked?: 'editing' | 'inspector' | 'manipulating'; effects: ChromeEffect[] };

const same = (s: ChromeState, handled = false): ChromeResult => ({ state: s, handled, effects: [] });
const show = (): ChromeResult => ({ state: { hidden: false }, handled: true, effects: [{ kind: 'focus', target: 'hideButton' }, { kind: 'announce', text: '도구를 보여요' }] });

export function chromeReduce(s: ChromeState, e: ChromeEvent, ctx: ChromeContext = IDLE): ChromeResult {
  switch (e.type) {
    case 'hide': {
      if (s.hidden) return same(s, true);
      const blocked = ctx.editing ? 'editing' : ctx.inspector ? 'inspector' : ctx.manipulating ? 'manipulating' : undefined;
      if (blocked) return { state: s, handled: false, blocked, effects: [] };
      return { state: { hidden: true }, handled: true, effects: [{ kind: 'focus', target: 'restoreButton' }, { kind: 'announce', text: '도구를 숨겼어요. 도구 보이기로 돌아와요' }] };
    }
    case 'show':
    case 'needControls':
      return s.hidden ? show() : same(s, e.type === 'show');
    case 'back':
      /* 숨김이면 뒤로는 숨김만 끝낸다 — 다음 뒤로는 기존 계약 */
      return s.hidden ? show() : same(s, false);
    case 'tapVideo':
      /* 일부러 누른 탭만 — 그리기 · 확대 · 이동 · 끌기가 끝나며 남는 손짓은 넘긴다. 보일 때 탭으로 숨기지는 않는다 */
      return s.hidden && !ctx.manipulating && isDeliberateTap(e.gesture) ? show() : same(s, false);
    case 'leave':
      return { state: { hidden: false }, handled: false, effects: [] };
  }
}

/** 화면 틀이 예약할 크기 — 숨김이면 모두 0(풀린 자리를 영상이 쓴다) */
export function chromeReservation(s: ChromeState, measured: { header: number; bottom: number; side: number }) {
  return s.hidden ? { header: 0, bottom: 0, side: 0 } : { header: Math.max(0, measured.header), bottom: Math.max(0, measured.bottom), side: Math.max(0, measured.side) };
}

/** 읽어 주기 — 숨긴 도구는 탐색에서 빼고, 되살리기 단추는 늘 닿는다 */
export function chromeA11y(s: ChromeState) {
  return {
    toolsHidden: s.hidden,
    restoreVisible: s.hidden,
    restoreLabel: '도구 보이기',
    hideLabel: '도구 숨기기',
    hint: s.hidden ? '영상만 보여요. 도구 보이기를 누르거나 뒤로 가면 도구가 돌아와요' : null,
  };
}

/** 틀 전환 시간 — 짧게, '동작 줄이기'면 바로 */
export const CHROME_MS = 200;
export const chromeTransitionMs = (reduceMotion: boolean) => (reduceMotion ? 0 : CHROME_MS);

/** 저장된 값 → 늘 보임(숨김은 들고 다니지 않는다) */
export const restoreChrome = (_saved?: unknown): ChromeState => ({ ...CHROME_SHOWN });
