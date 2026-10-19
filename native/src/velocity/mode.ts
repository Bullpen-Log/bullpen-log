import type { IconName } from '~/shell/icon';
import { loadJson, saveJson } from '~/lib/store';

/**
 * 카메라 화면의 모드 — 구속 측정 · ABS 판정(docs/designs/camera-modes.md). 같은 카메라 · 같은 틀에서 모드만 다르게 돈다
 * (아이폰 카메라의 동영상 ↔ 슬로모션처럼). 다른 것은 넷: 설정 단계 하나 · 셔터 글 · 공마다 결과 카드 · 세션 요약.
 */
export type CameraMode = 'speed' | 'abs';

export type ModeInfo = {
  key: CameraMode;
  /** 위 줄 · 시트 카드 제목 */
  title: string;
  /** 모드 띠의 짧은 글 */
  short: string;
  icon: IconName;
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

/** 지난 번 고른 모드 — 모드 시트가 먼저 골라 두는 것 */
const LAST_MODE_KEY = 'bullpen-camera-mode';

export async function loadLastMode(): Promise<CameraMode> {
  const raw = await loadJson(LAST_MODE_KEY);
  return raw === 'abs' ? 'abs' : 'speed';
}

export const saveLastMode = (mode: CameraMode) => saveJson(LAST_MODE_KEY, mode);

/** 지난 설정은 모드마다 따로 — 구속 측정은 옛 키 그대로(옛 판이 저장한 것이 그대로 보이게) */
export const setupKeyOf = (mode: CameraMode) => (mode === 'speed' ? 'bullpen-velocity-setup' : 'bullpen-velocity-setup:abs');
