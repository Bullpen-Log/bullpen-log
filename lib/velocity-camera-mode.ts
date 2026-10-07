/**
 * 구속 측정 카메라의 화질 · 프레임 — 늘 1080p · 60fps 로 고정한다(사용자 2026-10-08: "무조건 1080 에 60 프레임으로 고정, 통일").
 * 엔진 2.x 를 맞춘 영상과 같은 조건이다. 예전에는 오른쪽 위 카메라 정보를 눌러 화질 · 프레임을 골랐다(2026-10-03 ~ 10-07).
 *
 * 카메라가 60fps 를 못 내면 막지 않고 주황 경고로 알린다(사용자 2026-10-04: "경고는 띄우되 막지는 않게").
 */

/** 화질(짧은 변 픽셀) · 프레임 */
export type CamMode = { short: number; fps: number };

/** 측정이 잘 되는 가장 낮은 fps — 이보다 낮으면 주황 경고(59.94 를 받게 59). 막지는 않는다 */
const MIN_MEASURE_FPS = 59;

/** 측정 카메라 — 1080p · 60fps */
export const DEFAULT_CAM_MODE: CamMode = { short: 1080, fps: 60 };

const sizeLabel = (short: number) => (short >= 2160 ? '4K' : `${short}p`);

export const camModeLabel = (m: CamMode) => `${sizeLabel(m.short)} · ${m.fps}fps`;

/** 측정이 잘 되는 fps 인가 — 아니면 주황 경고 */
export const fpsGood = (fps: number) => fps >= MIN_MEASURE_FPS;
