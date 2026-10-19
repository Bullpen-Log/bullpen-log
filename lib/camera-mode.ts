/**
 * 카메라 화면의 모드 — 구속 측정 · ABS 판정(docs/designs/camera-modes.md). 같은 카메라 · 같은 틀에서 모드만 다르게 돈다
 * (아이폰 카메라의 동영상 ↔ 슬로모션처럼). 다른 것은 넷: 설정 단계 하나 · 셔터 글 · 공마다 결과 카드 · 세션 요약.
 * 웹(app/(session)/velocity)과 새 앱(native/src/velocity/mode.ts)이 같이 쓴다 — 순수 정의만, 저장은 각자.
 */
export type CameraMode = 'speed' | 'abs';

export type ModeInfo = {
  key: CameraMode;
  /** 위 줄 · 시트 카드 제목 */
  title: string;
  /** 모드 띠의 짧은 글 */
  short: string;
  /** 아이콘 이름 — 앱 shell/icon · 웹 components/icon 둘 다 있는 이름만 */
  icon: 'radar' | 'target';
  blurb: string;
  shutter: string;
  /** 검문 2(마커 리그) 전까지 관리자만 — 웹 lib/nav.ts 와 같다 */
  adminOnly: boolean;
};

export const MODES: readonly ModeInfo[] = [
  { key: 'speed', title: '구속 측정', short: '구속', icon: 'radar', blurb: '던진 공의 구속을 재요.', shutter: '측정 시작', adminOnly: false },
  { key: 'abs', title: 'ABS 판정', short: 'ABS', icon: 'target', blurb: '볼 · 스트라이크를 판정하고 구속도 같이 재요.', shutter: '판정 시작', adminOnly: true },
];

export const modeInfo = (mode: CameraMode): ModeInfo => MODES.find((m) => m.key === mode) ?? MODES[0];

/** 지난 번 고른 모드 — 모드 시트가 먼저 골라 두는 것(앱 저장소 · 웹 localStorage 같은 열쇠) */
export const LAST_MODE_KEY = 'bullpen-camera-mode';

export const parseMode = (raw: unknown): CameraMode => (raw === 'abs' ? 'abs' : 'speed');

/** 관리자만 쓰는 모드를 일반 사용자에게 보이는 모드로 */
export const allowedMode = (mode: CameraMode, isAdmin: boolean): CameraMode => (modeInfo(mode).adminOnly && !isAdmin ? 'speed' : mode);

/** 아이폰 카메라의 노란 선택색 — 모드 시트 · 띠 */
export const MODE_YELLOW = '#ffd60a';
