/**
 * ABS(볼 · 스트라이크 자동 판정) 규칙표 — 한 곳.
 *
 * 존의 위 · 아래는 타자 신장의 비율, 좌우는 홈플레이트 폭 + 여유. 판정 면은 플레이트의 어느 깊이에서 보나(중간면 · 앞면 · 둘 다).
 * 숫자는 보도 기준(2026-10-17 조사)이고 **출시 전 원문 대조가 필요하다** — 바뀌면 여기만 고친다. 사용자 결정(2026-10-18): 기본은 KBO.
 */

export type RuleSetId = 'kbo-2025' | 'mlb-2026';
export type JudgePlane = 'mid' | 'front' | 'both';

export type RuleSet = {
  id: RuleSetId;
  label: string;
  /** 존 위 · 아래 선 = 타자 신장 × 비율(지면 기준) */
  topPct: number;
  bottomPct: number;
  /** 좌우 = 플레이트 폭 + 양쪽 여유(m) */
  sideMarginM: number;
  judgePlane: JudgePlane;
  /** 공의 일부가 걸치면 스트라이크('any-part') · 공 중심이 들어와야('center') */
  ballCountsIf: 'any-part' | 'center';
  note: string;
};

/** 홈플레이트 — 앞변 17in, 옆 8.5in, 뒤 빗변 12in 둘이 꼭지에서 만남. 깊이 = 8.5 + √(12² − 8.5²) ≈ 16.97in */
export const PLATE_WIDTH_M = 0.4318;
export const PLATE_SIDE_M = 0.2159;
export const PLATE_DEPTH_M = 0.431;
/** 공 지름 73mm */
export const BALL_RADIUS_M = 0.0365;
/** 투수판 앞면 → 플레이트 꼭지(m) */
export const RUBBER_TO_APEX_M = 18.44;

export const RULES: Record<RuleSetId, RuleSet> = {
  'kbo-2025': {
    id: 'kbo-2025',
    label: 'KBO 2025',
    topPct: 0.5575,
    bottomPct: 0.2704,
    sideMarginM: 0.02,
    judgePlane: 'mid',
    ballCountsIf: 'any-part',
    note: 'KBO 2024 도입 · 2025 유지(상단 56.35 → 55.75%). 공식 규정은 중간면 · 끝면 둘 다 — 1차는 중간면 하나, 끝면은 2차(P5).',
  },
  'mlb-2026': {
    id: 'mlb-2026',
    label: 'MLB 2026',
    topPct: 0.535,
    bottomPct: 0.27,
    sideMarginM: 0,
    judgePlane: 'mid',
    ballCountsIf: 'any-part',
    note: 'MLB 2026 챌린지 ABS: 17in 폭 그대로 · 중간면 · 공 일부.',
  },
};

export const DEFAULT_RULE: RuleSetId = 'kbo-2025';

/** 오차 띠(cm) — 이 안이면 '경계' 배지. P4 실측 2σ 로 바꾼다(지금은 계획서의 보통 조건 예산 × 2 남짓) */
export const DEFAULT_BANDS = { lateralCm: 3, verticalCm: 6 } as const;
export type Bands = { lateralCm: number; verticalCm: number };

/** 신장을 안 넣고 '평균 신장'을 고르면 쓰는 값(cm) — 사용자 결정 2026-10-18: 처음 고르면 세션 내내 유지 */
export const AVERAGE_HEIGHT_CM = 175;
export const HEIGHT_MIN_CM = 120;
export const HEIGHT_MAX_CM = 210;

/** ABS 세션 영상 보관(일) — 시작 안내 · 처리방침에 같은 숫자 */
export const ABS_CLIP_RETENTION_DAYS = 30;
