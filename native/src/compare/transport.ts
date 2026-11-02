/**
 * 비교 재생 한 줄기(순수 상태 기계 — R06 · R08 · R38). 화면은 재생기 알림을 이 기계에 넣고, 기계가 정한 phase 로만 재생기를 부른다.
 *
 * - gen(세대): 새 재생 요청 · 멈춤 · B 바꾸기 · 화면 떠남마다 올린다. 늦게 도착한 옛 탐색 완료(seekDone)는 gen 이 달라 버린다
 *   — 그래서 바꾼 B 의 옛 재생기 · 닫힌 화면의 늦은 답이 재생을 시작하지 않는다.
 * - 탐색 완료는 실제 확인(두 재생기 위치 · 준비)이 와야 성공이다. 시간 초과는 실패(error)로, 재생하지 않는다.
 * - 한쪽이 받는 중(buffering)이면 둘 다 멈추고, 둘 다 준비되면 사용자가 아직 재생을 원할 때(intent)만 다시 맞춰 재생한다.
 * - 공통 구간 끝(end)에서는 둘 다 멈춘다 — 한쪽만 되풀이하지 않는다.
 * - 뒤로 감(background)은 멈추고 intent 를 지운다(돌아와도 저절로 다시 틀지 않음).
 */
export type Phase = 'idle' | 'seeking' | 'playing' | 'buffering' | 'ended' | 'error';
export type TransportState = { phase: Phase; gen: number; intent: boolean; error: 'seek' | 'player' | null };
export const INITIAL_TRANSPORT: TransportState = { phase: 'idle', gen: 0, intent: false, error: null };

export type TransportEvent =
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'seekDone'; gen: number; ok: boolean }
  | { type: 'buffering' }
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
      return { state: { phase: 'seeking', gen: s.gen + 1, intent: true, error: null }, effect: 'seekThenConfirm' };
    case 'pause':
    case 'scrub':
      return { state: { phase: 'idle', gen: s.gen + 1, intent: false, error: null }, effect: 'pauseBoth' };
    case 'background':
    case 'sourceChanged':
      return { state: { phase: 'idle', gen: s.gen + 1, intent: false, error: s.error }, effect: 'pauseBoth' };
    case 'seekDone':
      if (e.gen !== s.gen || s.phase !== 'seeking') return { state: s, effect: 'none' };
      if (!e.ok) return { state: { ...s, phase: 'error', intent: false, error: 'seek' }, effect: 'pauseBoth' };
      if (!s.intent) return { state: { ...s, phase: 'idle' }, effect: 'none' };
      return { state: { ...s, phase: 'playing' }, effect: 'playBoth' };
    case 'buffering':
      if (s.phase !== 'playing') return { state: s, effect: 'none' };
      return { state: { ...s, phase: 'buffering' }, effect: 'pauseBoth' };
    case 'bothReady':
      if (s.phase !== 'buffering' || !s.intent) return { state: s, effect: 'none' };
      return { state: { ...s, phase: 'seeking', gen: s.gen + 1 }, effect: 'seekThenConfirm' };
    case 'end':
      if (s.phase !== 'playing' && s.phase !== 'buffering') return { state: s, effect: 'none' };
      return { state: { phase: 'ended', gen: s.gen + 1, intent: false, error: null }, effect: 'pauseBoth' };
    case 'playerError':
      return { state: { phase: 'error', gen: s.gen + 1, intent: false, error: 'player' }, effect: 'pauseBoth' };
  }
}

export const isBusy = (p: Phase) => p === 'seeking' || p === 'buffering';
export const phaseLabel = (p: Phase): string =>
  p === 'playing' ? '함께 멈춤' : p === 'seeking' ? '맞추는 중' : p === 'buffering' ? '불러오는 중' : p === 'ended' ? '처음부터 다시' : '함께 재생';
