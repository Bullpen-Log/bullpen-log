/**
 * 비교 재생 한 줄기(순수 상태 기계 — R06 · R08 · R38). 화면은 재생기 알림을 이 기계에 넣고, 기계가 정한 phase 로만 재생기를 부른다.
 *
 * - gen(세대): 새 재생 요청 · 멈춤 · B 바꾸기 · 화면 떠남마다 올린다. 늦게 도착한 옛 탐색 완료(seekDone)는 gen 이 달라 버린다
 *   — 그래서 바꾼 B 의 옛 재생기 · 닫힌 화면의 늦은 답이 재생을 시작하지 않는다.
 * - 탐색 완료는 실제 확인(두 재생기 위치 · 준비)이 와야 성공이다. 시간 초과는 실패(error)로, 재생하지 않는다.
 * - 한쪽이 받는 중(buffering)이면 둘 다 멈추고, 둘 다 준비되면 사용자가 아직 재생을 원할 때(intent)만 다시 맞춰 재생한다.
 *   다시 맞출 자리(target)는 받기가 시작된 그 순간의 공통 자리다(F03 — 재생을 처음 누른 자리로 되감지 않는다).
 * - target 은 상대 자리(초). 재생 요청 · 받기 시작이 저마다 자리를 싣고 온다 — 화면은 기계의 target 으로만 옮긴다.
 * - 공통 구간 끝(end)에서는 둘 다 멈춘다 — 한쪽만 되풀이하지 않는다.
 * - 뒤로 감(background)은 멈추고 intent 를 지운다(돌아와도 저절로 다시 틀지 않음).
 */
export type Phase = 'idle' | 'seeking' | 'playing' | 'buffering' | 'ended' | 'error';
export type TransportState = { phase: Phase; gen: number; intent: boolean; error: 'seek' | 'player' | null; target: number };
export const INITIAL_TRANSPORT: TransportState = { phase: 'idle', gen: 0, intent: false, error: null, target: 0 };

export type TransportEvent =
  | { type: 'play'; rel: number }
  | { type: 'pause' }
  | { type: 'seekDone'; gen: number; ok: boolean }
  /** rel = 받기가 시작된 순간의 공통 자리(모르면 null — 그때는 지난 target 그대로) */
  | { type: 'buffering'; rel: number | null }
  | { type: 'bothReady' }
  | { type: 'end' }
  | { type: 'playerError' }
  | { type: 'background' }
  | { type: 'sourceChanged' }
  | { type: 'scrub' };

/** 기계가 화면에 시키는 일 */
export type TransportEffect = 'seekThenConfirm' | 'pauseBoth' | 'playBoth' | 'none';

export function step(s: TransportState, e: TransportEvent): { state: TransportState; effect: TransportEffect } {
  switch (e.type) {
    case 'play':
      if (s.phase === 'seeking' || s.phase === 'playing') return { state: s, effect: 'none' };
      return { state: { phase: 'seeking', gen: s.gen + 1, intent: true, error: null, target: e.rel }, effect: 'seekThenConfirm' };
    case 'pause':
    case 'scrub':
      return { state: { ...s, phase: 'idle', gen: s.gen + 1, intent: false, error: null }, effect: 'pauseBoth' };
    case 'background':
    case 'sourceChanged':
      return { state: { ...s, phase: 'idle', gen: s.gen + 1, intent: false }, effect: 'pauseBoth' };
    case 'seekDone':
      if (e.gen !== s.gen || s.phase !== 'seeking') return { state: s, effect: 'none' };
      if (!e.ok) return { state: { ...s, phase: 'error', intent: false, error: 'seek' }, effect: 'pauseBoth' };
      if (!s.intent) return { state: { ...s, phase: 'idle' }, effect: 'none' };
      return { state: { ...s, phase: 'playing' }, effect: 'playBoth' };
    case 'buffering':
      if (s.phase !== 'playing') return { state: s, effect: 'none' };
      return { state: { ...s, phase: 'buffering', target: e.rel ?? s.target }, effect: 'pauseBoth' };
    case 'bothReady':
      if (s.phase !== 'buffering' || !s.intent) return { state: s, effect: 'none' };
      return { state: { ...s, phase: 'seeking', gen: s.gen + 1 }, effect: 'seekThenConfirm' };
    case 'end':
      if (s.phase !== 'playing' && s.phase !== 'buffering') return { state: s, effect: 'none' };
      return { state: { ...s, phase: 'ended', gen: s.gen + 1, intent: false, error: null }, effect: 'pauseBoth' };
    case 'playerError':
      return { state: { ...s, phase: 'error', gen: s.gen + 1, intent: false, error: 'player' }, effect: 'pauseBoth' };
  }
}

export const isBusy = (p: Phase) => p === 'seeking' || p === 'buffering';
export const phaseLabel = (p: Phase): string =>
  p === 'playing' ? '함께 멈춤' : p === 'seeking' ? '맞추는 중' : p === 'buffering' ? '불러오는 중' : p === 'ended' ? '처음부터 다시' : '함께 재생';
