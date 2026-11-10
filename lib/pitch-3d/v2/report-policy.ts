/** 판정 기준과 처방 시작 정책의 버전. 엔진의 수치 계산·문턱 변경과 구분한다. */
/* 2026-11-10-hand — 스로잉을 착지 어깨 벌림(참고)에서 착지 손 높이(평가 · 처방)로 */
/* 2026-11-10-bands — 드리프트 · 드롭 · 몸통 회전 띠를 조임(아래 10 / 25 / 40%) */
export const REPORT_CRITERIA = '2026-11-10-bands';
export const RX_START_STAGE = '기초' as const;
export const LEGACY_FOCUS_NOTE = '이전 판정 기준으로 시작한 처방이에요. 새 기준의 리포트를 확인해 주세요.';
