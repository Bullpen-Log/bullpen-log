import { ARMCARE_CATEGORY, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { ARM_PAIN_ROUTINE_MIN_AGE, armPainSpotLabel } from '@/lib/checkin';
import { intensityLevel, minutesForSets } from '@/lib/exercise-meta';
import { canDo } from '@/lib/report/equipment';
import { withJosa } from '@/lib/korean';

/**
 * 재활 2편 — 아픈 부위(진단 없음) 또는 병명으로 하는 몇 주짜리 재활의 규칙. 순수 함수만(DB 를 모른다).
 *
 * 2026-10-03 사용자분과 정했다(설계: ~/.gstack/projects/…/specs/…-rehab-programs-region-and-diagnosis.md).
 * 규칙의 근거와 숫자는 docs/rehab-guideline.md 다 — 설계서와 숫자가 다르면 가이드라인을 따른다(2026-10-04 기간을 다시 맞춤).
 *
 *   부위 8곳(1편의 아픈 자리) × 4단계 운동 · 피할 것 · 허용 통증
 *   병명 6개 = 바탕 부위 + 차이(운동 더하기 · 빼기 · 허용 통증 · 투구 복귀표까지 바닥 기간)
 *   정도 3단계(가벼움 · 보통 · 심함) → 시작 단계 · 단계별 최소 기간 · 세트
 *   세션 끝 3문항 → 초록 · 노랑 · 빨강 · 진료(judgeSession), 빨강 뒤 쉬기 · 한 칸 낮춤 · 하루 걸러
 *   단계 올리기(stageGate) · 단계 시험(judgeStageTest) · 투구 복귀표 열기(judgeThrowingOpen)
 *   오늘 재활 세션(buildRehabSession) — 라이브러리 운동을 카테고리 상관없이 이름으로, 장비가 없으면 바꿔 넣기
 *
 * 읽는 쪽: lib/armcare/rehab-store.ts(DB) · lib/armcare/today.ts(암케어) · app/actions/rehab.ts(저장) ·
 * lib/report/gather.ts(웨이트 · 투구 계획이 재활을 안다 — rehabFacts). 매주 확인과 투구 복귀표 화면은 ②번이다.
 *
 * 진단하지 않는다. 모든 재활 화면에 '의사 · 치료사의 지시가 먼저'를 함께 둔다(가이드라인 머리말).
 */

/**
 * 재활 기능 전체의 스위치 — 끄면 들어가는 길 · 카드 · 웨이트 · 투구 계획 연결이 함께 꺼진다(설계 10절).
 * 끈 동안 진행 중이던 재활 줄은 그대로 남는다(지우지 않는다).
 */
export const REHAB_ENABLED = true;

/* ─────────────────────────────── 이름들 ─────────────────────────────── */

export type RehabSeverity = 'mild' | 'moderate' | 'severe';
export type RehabStage = 1 | 2 | 3 | 4;
export type RehabJoint = 'shoulder' | 'elbow';
/** 세션 3문항 ①: 지난번 뒤 남은 통증 — 0 없었음 · 1 하다 보니 사라짐 · 2 계속 있었음 */
export type RehabLeftover = 0 | 1 | 2;
/** 세션 3문항 ③: 어떤 느낌 */
export type RehabFeel = 'muscle' | 'sharp' | 'tingle' | 'slip';
export type RehabResult = 'green' | 'yellow' | 'red' | 'refer';

export const REHAB_SEVERITIES: readonly { key: RehabSeverity; label: string }[] = [
  { key: 'mild', label: '가벼움' },
  { key: 'moderate', label: '보통' },
  { key: 'severe', label: '심함' },
];

export function severityLabel(s: RehabSeverity): string {
  return REHAB_SEVERITIES.find((x) => x.key === s)?.label ?? s;
}

/** 단계 이름 · 목표(가이드라인 5절) */
export const REHAB_STAGES: Record<RehabStage, { name: string; goal: string }> = {
  1: {
    name: '진정 · 버티기',
    goal: '아프지 않은 범위에서 버티기(등척성)와 날개뼈 세우기, 필요한 스트레칭만 해요.',
  },
  2: {
    name: '근력 다시 만들기',
    goal: '가벼운 무게 · 밴드로 천천히, 팔은 어깨 높이 아래에서 해요.',
  },
  3: {
    name: '던지는 자세로 강하게',
    goal: '던지는 자세(90/90)에서 버티며 내리기 · 리바운드로 힘과 안정성을 키워요.',
  },
  4: {
    name: '던지기 준비',
    goal: '두 손 공 운동부터, 두 손이 아프지 않으면 한 손 공 운동으로 던질 준비를 해요.',
  },
};

export const REHAB_LEFTOVER_OPTIONS: readonly {
  value: RehabLeftover;
  label: string;
}[] = [
  { value: 0, label: '없었어요' },
  { value: 1, label: '처음엔 있었는데 하다 보니 사라졌어요' },
  { value: 2, label: '계속 있었어요' },
];

export const REHAB_FEEL_OPTIONS: readonly { value: RehabFeel; label: string }[] = [
  { value: 'muscle', label: '근육이 뻐근 · 지침' },
  { value: 'sharp', label: '관절이 찌르듯 · 끼임' },
  { value: 'tingle', label: '저리거나 감각이 이상함' },
  { value: 'slip', label: '빠질 것 같음' },
];

/** 매주 확인에서 점수를 매길 '내 활동' 보기(가이드라인 8절 ③) — 직접 적기도 된다 */
export const REHAB_ACTIVITY_PRESETS = [
  '캐치볼',
  '팔 들어 옷 입기',
  '가방 들기',
  '푸쉬업',
] as const;
export const REHAB_ACTIVITY_MAX_LENGTH = 20;

/* ─────────────────────────────── 부위 8곳 ─────────────────────────────── */

/** 운동 하나 — 이름은 라이브러리 제목 그대로, note 는 화면에 붙는 한마디('아프지 않은 높이까지') */
export type RehabMove = { name: string; note?: string };
type MoveSpec = string | readonly [string, string];

type RegionSpec = {
  /**
   * 1 · 2단계의 허용 통증(가이드라인 7절). 힘줄 · 근육형(어깨 위 · 뒤 · 견갑)은 3, 인대 · 불안정형(팔꿈치 안쪽 · 앞쪽)은 2.
   * 가이드라인이 정하지 않은 부위(어깨 앞쪽 · 팔꿈치 바깥쪽 · 뒤쪽)는 더 엄격한 2로 둔다 — 감독 없이 혼자 한다.
   */
  earlyPainLimit: 2 | 3;
  /** 초반에 피할 것(설계 5-1) */
  avoid: readonly string[];
  /** 이 부위 운동 전체에 붙는 한 줄 */
  note?: string;
  /** 18세 미만은 진단 없이 열지 않는다 — 연골 · 피로골절을 놓치지 않게 X-ray 먼저(가이드라인 2절) */
  youthNeedsDiagnosis: boolean;
  stages: readonly [
    readonly MoveSpec[],
    readonly MoveSpec[],
    readonly MoveSpec[],
    readonly MoveSpec[],
  ];
};

const UNTIL_NO_PAIN = '아프지 않은 범위에서';

export const REHAB_REGIONS: Record<ArmcareAreaKey, RegionSpec> = {
  'shoulder-back': {
    earlyPainLimit: 3,
    avoid: ['최대로 젖혀 던지기', '끼이는 슬리퍼 스트레칭'],
    youthNeedsDiagnosis: false,
    stages: [
      [
        '크로스바디 스트레칭',
        '어깨 외회전 등척성 밀기',
        '어깨 내회전 등척성 밀기',
        '밴드 스캡 핀치',
        '프론 막대 스캡 홀드',
      ],
      [
        '사이드라잉 외회전',
        '튜빙 외회전 0도',
        '프론 로우 + 외회전',
        '프론 Y',
        '튜빙 서라투스 펀치',
        '크로스바디 스트레칭',
      ],
      [
        '시티드 외회전 과부하 내리기',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
        '프론 외회전',
        '튜빙 대각선 굽힘',
        '메디신볼 벽 원 그리기',
      ],
      [
        '사이드라잉 외회전 리바운드',
        '톨 닐링 메디신볼 오버헤드 던지기',
        '90/90 플라이오볼 벽 드리블',
        '프론 90/90 플라이오볼 드롭',
        '한 팔 90/90 플라이오볼 벽 던지기',
        '튜빙 리버스 스로우',
      ],
    ],
  },
  'shoulder-front': {
    earlyPainLimit: 2,
    avoid: [
      '팔 벌리고 끝까지 바깥으로 돌리기',
      '문틀 가슴 스트레칭',
      '등 뒤 수건 스트레칭',
      '딥스',
      '무거운 컬',
      '친업',
    ],
    youthNeedsDiagnosis: false,
    stages: [
      [
        '어깨 내회전 등척성 밀기',
        '어깨 외회전 등척성 밀기',
        '밴드 스캡 핀치',
        '프론 막대 스캡 홀드',
        '크로스바디 스트레칭',
      ],
      [
        '튜빙 내회전 0도',
        '튜빙 외회전 0도',
        '사이드라잉 내회전',
        '사이드라잉 외회전',
        '프론 로우 + 외회전',
        '튜빙 서라투스 펀치',
      ],
      [
        '하프닐링 튜빙 내회전 90도',
        ['하프닐링 튜빙 외회전 90도', UNTIL_NO_PAIN],
        '누워서 덤벨 내회전 90도',
        '프론 Y',
        '다방향 스캡 푸쉬업',
        '메디신볼 벽 원 그리기',
      ],
      [
        '튜빙 내회전 0도 리바운드',
        '톨 닐링 메디신볼 체스트 패스',
        '톨 닐링 메디신볼 오버헤드 던지기',
        '90/90 플라이오볼 벽 드리블',
        '한 팔 90/90 플라이오볼 벽 던지기',
        '튜빙 리버스 스로우',
      ],
    ],
  },
  'shoulder-top': {
    earlyPainLimit: 3,
    avoid: ['아픈 각도의 머리 위 운동', '업라이트 로우', '비하인드넥 프레스', '엠티캔'],
    youthNeedsDiagnosis: false,
    stages: [
      [
        '어깨 외전 등척성 밀기',
        '어깨 외회전 등척성 밀기',
        '어깨 내회전 등척성 밀기',
        '밴드 스캡 핀치',
        '크로스바디 스트레칭',
      ],
      [
        '사이드라잉 외회전',
        '튜빙 외회전 0도',
        '튜빙 내회전 0도',
        ['덤벨 스캡션 레이즈', '아프지 않은 높이까지'],
        '벽 슬라이드',
        '튜빙 서라투스 펀치',
      ],
      [
        '시티드 외회전 과부하 내리기',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
        '프론 Y',
        '튜빙 대각선 굽힘',
        '푸쉬업 플러스',
      ],
      [
        '사이드라잉 외회전 리바운드',
        '톨 닐링 메디신볼 오버헤드 던지기',
        '90/90 플라이오볼 벽 드리블',
        '프론 90/90 플라이오볼 드롭',
        '한 팔 90/90 플라이오볼 벽 던지기',
        '튜빙 리버스 스로우',
      ],
    ],
  },
  scapula: {
    earlyPainLimit: 3,
    avoid: ['으쓱 위주 운동', '딱딱 소리 나는 동작'],
    youthNeedsDiagnosis: false,
    stages: [
      [
        '밴드 스캡 핀치',
        '프론 막대 스캡 홀드',
        '밴드 가슴 스트레치',
        '흉추 모빌리티 시리즈',
        '어깨 외회전 등척성 밀기',
      ],
      [
        '벽 슬라이드',
        '튜빙 서라투스 펀치',
        '프론 로우 + 외회전',
        '쿼드 Y',
        '쿼드 T',
        '톨닐링 밴드 페이스 풀',
      ],
      [
        '프론 Y',
        '프론 익스텐션',
        '푸쉬업 플러스',
        '다방향 스캡 푸쉬업',
        '튜빙 W',
        '메디신볼 벽 원 그리기',
      ],
      [
        '케틀벨 바텀업 웨이터 캐리',
        '프론 90/90 플라이오볼 드롭',
        '90/90 플라이오볼 벽 드리블',
        '톨 닐링 메디신볼 오버헤드 던지기',
        '한 팔 90/90 플라이오볼 벽 던지기',
        '튜빙 리버스 스로우',
      ],
    ],
  },
  'elbow-inner': {
    earlyPainLimit: 2,
    avoid: ['던지기', '팔꿈치 편 채 손목 굴곡근 스트레칭', '팔꿈치 꽉 굽혀 기대기'],
    note: '손목 운동은 팔꿈치를 30~45° 굽힌 채 해요.',
    youthNeedsDiagnosis: false,
    stages: [
      [
        '전완 굴곡 등척성 밀기',
        '전완 회내 등척성 밀기',
        '전완 척측 편위 등척성 밀기',
        '어깨 외회전 등척성 밀기',
        '밴드 스캡 핀치',
      ],
      [
        '튜빙 전완 굴곡',
        '튜빙 전완 회내',
        '튜빙 전완 척측 편위',
        '덤벨 핑거 컬',
        '사이드라잉 외회전',
        '튜빙 외회전 0도',
        '프론 로우 + 외회전',
      ],
      [
        '전완 굴곡 과부하 내리기',
        '전완 회내 과부하 내리기',
        '전완 척측 편위 과부하 내리기',
        '원판 핀치 잡기',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
      ],
      [
        '플라이오볼 손목 플립',
        '톨 닐링 메디신볼 체스트 패스',
        '톨 닐링 메디신볼 오버헤드 던지기',
        '90/90 플라이오볼 벽 드리블',
        '한 팔 90/90 플라이오볼 벽 던지기',
        '전완 회내 과부하 내리기',
      ],
    ],
  },
  'elbow-outer': {
    earlyPainLimit: 2,
    avoid: ['손 짚고 버티기(푸쉬업 · 플랭크 · TRX)', '편 팔로 세게 쥐기', '던지기'],
    youthNeedsDiagnosis: true,
    stages: [
      [
        '전완 신전 등척성 밀기',
        '전완 회외 등척성 밀기',
        '전완 요측 편위 등척성 밀기',
        '밴드 스캡 핀치',
        '어깨 외회전 등척성 밀기',
      ],
      [
        '튜빙 전완 신전',
        '튜빙 전완 회외',
        '튜빙 전완 요측 편위',
        '밴드 하이 이두컬',
        '사이드라잉 외회전',
        '프론 로우 + 외회전',
      ],
      [
        '전완 신전 과부하 내리기',
        '전완 회외 과부하 내리기',
        '전완 요측 편위 과부하 내리기',
        '덤벨 해머컬',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
      ],
      [
        '플라이오볼 손목 플립',
        '톨 닐링 메디신볼 오버헤드 던지기',
        '90/90 플라이오볼 벽 드리블',
        '한 팔 90/90 플라이오볼 벽 던지기',
        '전완 신전 과부하 내리기',
      ],
    ],
  },
  'elbow-back': {
    earlyPainLimit: 2,
    avoid: [
      '힘주어 끝까지 펴기(딥스 · 끝까지 펴는 삼두 · 공 던지기 운동은 4단계만)',
      '펴기 스트레칭',
      '던지기',
    ],
    youthNeedsDiagnosis: true,
    stages: [
      [
        '팔꿈치 굽힘 등척성 밀기',
        '팔꿈치 폄 등척성 밀기',
        '전완 굴곡 등척성 밀기',
        '전완 회내 등척성 밀기',
        '밴드 스캡 핀치',
      ],
      [
        '밴드 하이 이두컬',
        ['밴드 트라이셉스 푸쉬다운', '끝까지 펴지 않기'],
        '튜빙 전완 굴곡',
        '튜빙 전완 회내',
        '사이드라잉 외회전',
        '프론 로우 + 외회전',
      ],
      [
        '덤벨컬 과부하 내리기',
        '밴드 이두컬(버티며 내리기)',
        '전완 회내 과부하 내리기',
        '전완 굴곡 과부하 내리기',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
      ],
      [
        '덤벨컬 드롭 캐치',
        '플라이오볼 손목 플립',
        '톨 닐링 메디신볼 체스트 패스',
        '90/90 플라이오볼 벽 드리블',
        '한 팔 90/90 플라이오볼 벽 던지기',
      ],
    ],
  },
  'elbow-front': {
    earlyPainLimit: 2,
    avoid: ['억지로 과하게 펴기', '무거운 컬', '버티며 내리는 컬(1 · 2단계)', '친업'],
    youthNeedsDiagnosis: false,
    stages: [
      [
        '팔꿈치 굽힘 등척성 밀기',
        '전완 회외 등척성 밀기',
        '팔꿈치 폄 등척성 밀기',
        '밴드 스캡 핀치',
        '어깨 외회전 등척성 밀기',
      ],
      [
        '밴드 하이 이두컬',
        '덤벨 해머컬',
        '튜빙 전완 회외',
        '튜빙 전완 회내',
        '사이드라잉 외회전',
        '프론 로우 + 외회전',
      ],
      [
        '밴드 이두컬(버티며 내리기)',
        '덤벨컬 과부하 내리기',
        '전완 회외 과부하 내리기',
        '조트만 컬',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
      ],
      [
        '덤벨컬 드롭 캐치',
        '플라이오볼 손목 플립',
        '톨 닐링 메디신볼 체스트 패스',
        '90/90 플라이오볼 벽 드리블',
        '한 팔 90/90 플라이오볼 벽 던지기',
      ],
    ],
  },
};

/** 부위의 차례 — 1편의 아픈 자리와 같다(어깨 넷 → 팔꿈치 넷) */
export const REHAB_AREAS: readonly ArmcareAreaKey[] = [
  'shoulder-back',
  'shoulder-front',
  'shoulder-top',
  'scapula',
  'elbow-inner',
  'elbow-outer',
  'elbow-back',
  'elbow-front',
];

const SHOULDER_AREAS: readonly ArmcareAreaKey[] = [
  'shoulder-back',
  'shoulder-front',
  'shoulder-top',
  'scapula',
];

export function isRehabArea(value: unknown): value is ArmcareAreaKey {
  return (
    typeof value === 'string' && (REHAB_AREAS as readonly string[]).includes(value)
  );
}

/** 이 부위의 관절 — 체크인 · 웨이트가 보는 단위(어깨 넷 → shoulder, 팔꿈치 넷 → elbow) */
export function rehabJoint(area: ArmcareAreaKey): RehabJoint {
  return SHOULDER_AREAS.includes(area) ? 'shoulder' : 'elbow';
}

/** '팔꿈치 안쪽' — 1편의 아픈 자리 이름 그대로 */
export function areaLabel(area: ArmcareAreaKey): string {
  return armPainSpotLabel(area) ?? area;
}

/* ─────────────────────────────── 병명 6개 ─────────────────────────────── */

export type RehabConditionKey =
  | 'impingement'
  | 'cuff-tendinopathy'
  | 'slap'
  | 'ucl'
  | 'flexor-pronator'
  | 'posterior-impingement';

type ConditionSpec = {
  label: string;
  /** 바탕 부위 */
  area: ArmcareAreaKey;
  /** 1 · 2단계 허용 통증 — 없으면 바탕 부위의 것 */
  earlyPainLimit?: 2 | 3;
  /** 투구 복귀표까지 바닥(일) — 정도의 기간과 이것 중 긴 쪽, 앞당기기로 줄이지 않는다 */
  floorDays?: number;
  /** 정도가 이보다 가벼울 수 없다 — UCL 은 '보통 계획 이상'(가벼운 캐치볼도 하지 않는다) */
  minSeverity?: RehabSeverity;
  add?: Partial<Record<RehabStage, readonly MoveSpec[]>>;
  remove?: Partial<Record<RehabStage, readonly string[]>>;
  /** 바탕 부위의 피할 것에 더한다 */
  avoid?: readonly string[];
  /** 카드에 붙는 한 줄 */
  lines: readonly string[];
};

/** 병명별 차이(설계 5-2 · 가이드라인 4절) */
export const REHAB_CONDITIONS: Record<RehabConditionKey, ConditionSpec> = {
  impingement: { label: '어깨 충돌증후군', area: 'shoulder-top', lines: [] },
  'cuff-tendinopathy': {
    label: '회전근개 건염',
    area: 'shoulder-top',
    earlyPainLimit: 3,
    add: { 2: [['시티드 외회전 과부하 내리기', '가볍게']] },
    lines: [],
  },
  slap: {
    label: '관절와순 손상(SLAP)',
    area: 'shoulder-front',
    earlyPainLimit: 2,
    floorDays: 56,
    /* 1 · 2단계에 90/90 끝 범위 빼기 — 1단계에는 그런 운동이 없고, 2단계의 프론 로우 + 외회전이 그 자세다 */
    remove: { 2: ['프론 로우 + 외회전'] },
    add: {
      2: ['시티드 프레스업', '크로스바디 스트레칭'],
      3: [['밴드 하이 이두컬', '가볍게']],
    },
    avoid: ['팔을 끝까지 뒤로 젖히는 자세(90/90 끝, 1 · 2단계)'],
    lines: [
      '투수가 수술 없이 복귀한 경우는 약 40%예요. 나아지지 않으면 의사와 다시 상의하세요.',
    ],
  },
  ucl: {
    label: 'UCL 부분 손상',
    area: 'elbow-inner',
    earlyPainLimit: 2,
    floorDays: 42,
    minSeverity: 'moderate',
    lines: ['끝쪽(원위) · 고등급 파열이라고 들었다면 의사와 상의하세요.'],
  },
  'flexor-pronator': {
    label: '굴곡-회내근 손상',
    area: 'elbow-inner',
    earlyPainLimit: 3,
    floorDays: 14,
    lines: ['1년 안에 UCL 수술까지 간 투수가 19%라는 보고가 있어요.'],
  },
  'posterior-impingement': {
    label: '팔꿈치 후방 충돌',
    area: 'elbow-back',
    floorDays: 14,
    lines: [
      '18세 미만이면 피로골절이 아닌지 확인하세요(X-ray).',
      '걸려서 안 움직이거나 뼛조각이 걸리는 느낌이면 진료를 받으세요.',
    ],
  },
};

export const REHAB_CONDITION_KEYS = Object.keys(
  REHAB_CONDITIONS
) as RehabConditionKey[];

export function isRehabCondition(value: unknown): value is RehabConditionKey {
  return (
    typeof value === 'string' &&
    (REHAB_CONDITION_KEYS as readonly string[]).includes(value)
  );
}

/** 고른 부위에 맞는 병명 — 진단 칩(팔꿈치 안쪽 → UCL 부분 손상 · 굴곡-회내근 손상) */
export function conditionsFor(area: ArmcareAreaKey): RehabConditionKey[] {
  return REHAB_CONDITION_KEYS.filter((k) => REHAB_CONDITIONS[k].area === area);
}

/** 카드 제목 — 병명이 있으면 병명, 없으면 부위 */
export function rehabTitle(area: ArmcareAreaKey, condition: RehabConditionKey | null) {
  return condition ? REHAB_CONDITIONS[condition].label : areaLabel(area);
}

/* ─────────────────────────────── 정도 · 기간 ─────────────────────────────── */

const SEVERITY_RANK: Record<RehabSeverity, number> = {
  mild: 0,
  moderate: 1,
  severe: 2,
};
const SEVERITY_BY_RANK: readonly RehabSeverity[] = ['mild', 'moderate', 'severe'];

/**
 * 정도 — 1편의 세 질문과 '지난 일주일 가장 아팠을 때'(0~10) 중 더 심한 쪽(가이드라인 3절).
 *   가벼움  던질 때만 · 3 이하
 *   보통    평소 움직일 때도 · 4~6
 *   심함    가만히 있어도 · 밤에도 · 7 이상
 * 병명이 정한 바닥보다 가볍지 않다(UCL 은 보통 이상).
 */
export function rehabSeverity({
  level,
  worst,
  condition = null,
}: {
  /** 1편의 정도 1~3 */
  level: 1 | 2 | 3;
  /** 지난 일주일 가장 아팠을 때 0~10 */
  worst: number;
  condition?: RehabConditionKey | null;
}): RehabSeverity {
  const byWorst = worst <= 3 ? 0 : worst <= 6 ? 1 : 2;
  const min = condition ? REHAB_CONDITIONS[condition].minSeverity : undefined;
  const rank = Math.max(level - 1, byWorst, min ? SEVERITY_RANK[min] : 0);
  return SEVERITY_BY_RANK[rank];
}

/** 병명의 바닥까지 올린 정도 — 진단을 나중에 붙일 때(UCL 이면 가벼움 → 보통) */
export function atLeastConditionSeverity(
  severity: RehabSeverity,
  condition: RehabConditionKey | null
): RehabSeverity {
  const min = condition ? REHAB_CONDITIONS[condition].minSeverity : undefined;
  return min && SEVERITY_RANK[min] > SEVERITY_RANK[severity] ? min : severity;
}

/** 시작 단계 — 예민도가 높으면 1, 중간이면 2, 낮으면 3단계부터(HSS 지침) */
export function startStage(severity: RehabSeverity): RehabStage {
  return severity === 'severe' ? 1 : severity === 'moderate' ? 2 : 3;
}

/**
 * 단계별 최소 기간(일) — 2026-10-04 사용자 "너무 보수적"으로 다시 맞춘 표(가이드라인 3절).
 * 0 은 '–'(그 정도는 그 단계부터 시작하지 않는다 — 낮춰서 내려왔을 때는 기간 없이 조건만 본다).
 */
export const STAGE_DAYS: Record<
  RehabSeverity,
  readonly [number, number, number, number]
> = {
  mild: [0, 0, 3, 4],
  moderate: [0, 7, 5, 5],
  severe: [7, 10, 7, 7],
};

/**
 * 단계를 올리는 데 필요한 깨끗한(초록) 세션 수 — 그 단계의 최소 기간 안에 할 수 있는 만큼(1단계 매일, 2~4단계 하루 걸러), 2~5번.
 *
 * 2026-10-04 고침: 처음 설계는 1단계 5 · 2단계 6 · 3단계 6 이었는데, 하루 걸러 하면 6번에 11일이 걸려 정도별 기간 표
 * (가벼움 3단계 3일 · 보통 2단계 7일)와 어긋났다 — '가벼움 약 1주'가 실제로는 3주 넘게 걸렸다. 기간이 시간을, 이 수가
 * 그 기간 동안 꾸준히 했는지를 본다. 최소 기간이 0 인 단계(그 정도는 이 단계부터 시작하지 않는다 — 낮춰 내려왔을 때)는 3번.
 */
export function cleanSessionsNeeded(
  program: Pick<
    RehabProgramLike,
    'severity' | 'condition' | 'stage' | 'stageShortenDays'
  >
): number {
  const days = stageMinDays(program);
  if (days === 0) return 3;
  const possible = program.stage === 1 ? days : Math.ceil(days / 2);
  return Math.min(5, Math.max(2, possible));
}

/** 병명 바닥(일) — 없으면 0 */
export function conditionFloorDays(condition: RehabConditionKey | null): number {
  return condition ? (REHAB_CONDITIONS[condition].floorDays ?? 0) : 0;
}

/**
 * 병명 바닥을 단계마다 나눈 몫. 정도의 기간 합(T)이 바닥(F)보다 짧으면 모자란 만큼을 단계 기간의 비율대로 나눠
 * 더한다 — 마지막 단계에 몰아 두면 UCL 인데 12일째부터 한 팔 공 던지기를 하게 된다. 누적으로 올림해 합이 정확히 F.
 */
function floorShare(
  severity: RehabSeverity,
  condition: RehabConditionKey | null,
  stage: RehabStage
): number {
  const floor = conditionFloorDays(condition);
  const days = STAGE_DAYS[severity];
  const total = days.reduce((a, b) => a + b, 0);
  if (floor <= total || total === 0) return 0;
  const before = days.slice(0, stage - 1).reduce((a, b) => a + b, 0);
  const upTo = before + days[stage - 1];
  return Math.ceil((floor * upTo) / total) - Math.ceil((floor * before) / total);
}

/**
 * 이 단계의 최소 기간(일) — 정도의 기간에서 앞당긴 날을 빼고(그 기간의 절반까지만), 병명 바닥의 몫과 견줘 긴 쪽.
 * 병명 바닥은 앞당기기로 줄지 않는다(가이드라인 10절).
 */
export function stageMinDays({
  severity,
  condition,
  stage,
  stageShortenDays = 0,
}: {
  severity: RehabSeverity;
  condition: RehabConditionKey | null;
  stage: RehabStage;
  stageShortenDays?: number;
}): number {
  const base = STAGE_DAYS[severity][stage - 1];
  const shorten = Math.min(
    Math.max(0, Math.floor(stageShortenDays)),
    Math.floor(base / 2)
  );
  return Math.max(base - shorten, floorShare(severity, condition, stage));
}

/** 시작부터 투구 복귀표까지 대략(일) — 정도의 기간 합과 병명 바닥 중 긴 쪽 */
export function rehabEstimateDays(
  severity: RehabSeverity,
  condition: RehabConditionKey | null
): number {
  const total = STAGE_DAYS[severity].reduce((a, b) => a + b, 0);
  return Math.max(total, conditionFloorDays(condition));
}

/** '약 2.5주' — 반 주 단위 */
export function weeksText(days: number): string {
  const weeks = Math.max(0.5, Math.round((days / 7) * 2) / 2);
  return `약 ${weeks}주`;
}

/* ─────────────────────────────── 시작 막기 ─────────────────────────────── */

/** 이 나이(만) 밑이면 18세 미만 성장기 규칙 */
export const REHAB_YOUTH_AGE = 18;

/**
 * 재활을 열지 않는 까닭 — 열어도 되면 null. 나이를 모르면 연다(1편과 같다 — 생년월일은 안 적어도 되는 칸이다).
 *   만 15세 미만                                  성장판 — 진료가 먼저
 *   18세 미만 + 팔꿈치 바깥쪽/뒤쪽 + 진단 없음     X-ray 먼저(연골 · 피로골절)
 */
export function rehabStartBlock({
  age,
  area,
  condition,
}: {
  age: number | null;
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
}): { kind: 'young' | 'xray'; text: string } | null {
  if (age != null && age < ARM_PAIN_ROUTINE_MIN_AGE) {
    return {
      kind: 'young',
      text: `만 ${ARM_PAIN_ROUTINE_MIN_AGE}세 미만은 재활 프로그램을 열지 않아요. 성장판이 다쳤을 수 있어 진료가 먼저예요.`,
    };
  }
  if (
    age != null &&
    age < REHAB_YOUTH_AGE &&
    REHAB_REGIONS[area].youthNeedsDiagnosis &&
    !condition
  ) {
    return {
      kind: 'xray',
      text: `18세 미만이 ${withJosa(areaLabel(area), '이/가')} 아프면 X-ray 를 먼저 찍어 보세요. 연골 · 피로골절일 수 있어요. 진단을 받으면 병명으로 시작할 수 있어요.`,
    };
  }
  return null;
}

/* ─────────────────────────────── 단계별 운동 ─────────────────────────────── */

const toMove = (spec: MoveSpec): RehabMove =>
  typeof spec === 'string' ? { name: spec } : { name: spec[0], note: spec[1] };

/** 이 단계의 운동 — 바탕 부위에 병명의 차이(빼기 → 더하기)를 얹는다 */
export function stageExercises(
  area: ArmcareAreaKey,
  condition: RehabConditionKey | null,
  stage: RehabStage
): RehabMove[] {
  const base = REHAB_REGIONS[area].stages[stage - 1].map(toMove);
  const c = condition ? REHAB_CONDITIONS[condition] : null;
  if (!c) return base;
  const remove = c.remove?.[stage] ?? [];
  const kept = base.filter((m) => !remove.includes(m.name));
  for (const spec of c.add?.[stage] ?? []) {
    const move = toMove(spec);
    const at = kept.findIndex((m) => m.name === move.name);
    if (at >= 0) kept[at] = move.note ? move : kept[at];
    else kept.push(move);
  }
  return kept;
}

/** 피할 것 — 부위 + 병명 */
export function rehabAvoid(area: ArmcareAreaKey, condition: RehabConditionKey | null) {
  return [
    ...REHAB_REGIONS[area].avoid,
    ...(condition ? (REHAB_CONDITIONS[condition].avoid ?? []) : []),
  ];
}

/** 카드에 붙는 한 줄들 — 부위의 주의 + 병명의 한 줄 */
export function rehabNotes(area: ArmcareAreaKey, condition: RehabConditionKey | null) {
  const note = REHAB_REGIONS[area].note;
  return [
    ...(note ? [note] : []),
    ...(condition ? REHAB_CONDITIONS[condition].lines : []),
  ];
}

/**
 * 한 팔로 하는 플라이오볼 운동 — 플라이오볼이 없으면 두 손 메디신볼 운동으로 바꾼다(설계 5절).
 * 메디신볼(2kg 이상)로 한 팔 던지기를 하면 무거워 오히려 위험하다(lib/exercise-meta.ts 의 '플라이오볼').
 */
export const ONE_ARM_PLYO = [
  '90/90 플라이오볼 벽 드리블',
  '프론 90/90 플라이오볼 드롭',
  '한 팔 90/90 플라이오볼 벽 던지기',
  '플라이오볼 손목 플립',
] as const;
export const TWO_HAND_MEDBALL = [
  '톨 닐링 메디신볼 체스트 패스',
  '톨 닐링 메디신볼 오버헤드 던지기',
] as const;

/** 설계에 적힌 운동 이름 전부 — 자가 시험이 라이브러리에 다 있는지 본다 */
export function allRehabExerciseNames(): string[] {
  const names = new Set<string>();
  for (const area of REHAB_AREAS) {
    for (const stage of [1, 2, 3, 4] as const) {
      for (const m of stageExercises(area, null, stage)) names.add(m.name);
    }
  }
  for (const key of REHAB_CONDITION_KEYS) {
    const c = REHAB_CONDITIONS[key];
    for (const stage of [1, 2, 3, 4] as const) {
      for (const m of stageExercises(c.area, key, stage)) names.add(m.name);
    }
  }
  for (const name of TWO_HAND_MEDBALL) names.add(name);
  return [...names];
}

/* ─────────────────────────────── 오늘 세션 짜기 ─────────────────────────────── */

/** 재활 세션에 쓰는 라이브러리 줄 — 이만큼만 본다 */
export type RehabLibraryExercise = {
  id: string;
  title: string;
  category: string;
  intensity: string;
  equipment: string[];
  targetMuscles: string[];
  sets: number | null;
  reps: number | null;
  holdSeconds: number | null;
  restSeconds: number | null;
  perSide: boolean;
};

export type RehabSessionItem = {
  exerciseId: string;
  title: string;
  sets: number;
  /** 화면에 붙는 한마디('가볍게') */
  note?: string;
  /** 장비가 없어 대신 넣었으면 원래 운동 이름 */
  replaces?: string;
};

export type RehabSession = {
  /** 실제로 고른 운동의 단계 — 한 칸 낮춘 날은 아래 단계 */
  stage: RehabStage;
  lowered: boolean;
  items: RehabSessionItem[];
  /** 바꿔 넣은 것 · 뺀 것 · 세트를 줄인 까닭 — 한 줄씩 */
  notes: string[];
  estimatedMinutes: number;
};

/** 세트를 따로 안 적은 운동의 세트 — 암케어 강화 루틴과 같은 2세트 */
const DEFAULT_SETS = 2;
/** 운동을 바꾸는 데 드는 시간(분) — 암케어와 같다 */
const SWITCH_MINUTES = 0.5;

function sessionMinutes(ex: RehabLibraryExercise, sets: number): number {
  return (minutesForSets(ex, sets) ?? 3 * sets) + SWITCH_MINUTES;
}

/**
 * 오늘 재활 세션 — 그 단계(한 칸 낮춘 날은 아래 단계)의 운동을 라이브러리에서 **카테고리와 상관없이 이름으로** 찾는다.
 *
 *   가진 장비로 못 하는 운동
 *     한 팔 플라이오볼 운동  → 두 손 메디신볼 운동(톨 닐링 체스트 패스 → 오버헤드 던지기 차례로, 이미 든 것은 빼고)
 *     그 밖                  → 같은 주 근육 · 같거나 낮은 강도의 암케어 운동
 *     그래도 없으면          → 빼고 빠진 이름을 한 줄로
 *   라이브러리에 없는 이름 → 빼고 한 줄(자가 시험이 없게 지킨다)
 *   세트는 라이브러리 그대로, 심함은 1 · 2단계 세트 −1(최소 1)
 *
 * 가진 장비를 아직 안 골랐으면(빈 목록) 아무것도 빼지 않는다 — 안 고른 것과 없는 것은 다르다(lib/report/equipment.ts).
 */
export function buildRehabSession({
  area,
  condition,
  severity,
  stage,
  lowered,
  library,
  ownedEquipment,
}: {
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
  severity: RehabSeverity;
  /** 지금 단계 */
  stage: RehabStage;
  /** 한 칸 낮춘 날인가 — 아래 단계 운동으로(1단계는 그대로) */
  lowered: boolean;
  /** 보이는 라이브러리 운동(숨긴 것 빼고) */
  library: readonly RehabLibraryExercise[];
  ownedEquipment: readonly string[];
}): RehabSession {
  const effective = (lowered ? Math.max(1, stage - 1) : stage) as RehabStage;
  const byTitle = new Map(library.map((ex) => [ex.title, ex]));
  const owned = new Set(ownedEquipment);
  const doable = (ex: RehabLibraryExercise) =>
    ownedEquipment.length === 0 || canDo(ex, owned);

  const moves = stageExercises(area, condition, effective);
  const planned = new Set(moves.map((m) => m.name));
  const taken = new Set<string>();
  const items: RehabSessionItem[] = [];
  const missing: string[] = [];
  const dropped: string[] = [];
  const swapped: string[] = [];
  const lessSets = severity === 'severe' && effective <= 2;

  const put = (ex: RehabLibraryExercise, move: RehabMove, replaces?: string) => {
    const base = ex.sets ?? DEFAULT_SETS;
    items.push({
      exerciseId: ex.id,
      title: ex.title,
      sets: lessSets ? Math.max(1, base - 1) : base,
      ...(move.note && !replaces ? { note: move.note } : {}),
      ...(replaces ? { replaces } : {}),
    });
    taken.add(ex.id);
  };

  for (const move of moves) {
    const ex = byTitle.get(move.name);
    if (!ex) {
      missing.push(move.name);
      continue;
    }
    if (taken.has(ex.id)) continue;
    if (doable(ex)) {
      put(ex, move);
      continue;
    }
    let sub: RehabLibraryExercise | undefined;
    if ((ONE_ARM_PLYO as readonly string[]).includes(move.name)) {
      sub = TWO_HAND_MEDBALL.map((name) => byTitle.get(name)).find(
        (alt): alt is RehabLibraryExercise =>
          alt != null && !taken.has(alt.id) && !planned.has(alt.title) && doable(alt)
      );
    } else {
      const muscle = ex.targetMuscles[0];
      const level = intensityLevel(ex.intensity);
      sub = muscle
        ? library
            .filter(
              (alt) =>
                alt.category === ARMCARE_CATEGORY &&
                alt.id !== ex.id &&
                !taken.has(alt.id) &&
                !planned.has(alt.title) &&
                alt.targetMuscles[0] === muscle &&
                intensityLevel(alt.intensity) <= level &&
                doable(alt)
            )
            /* 원래 것에 가장 가까운 강도부터, 같으면 이름 차례 — 새로고침에 바뀌지 않게 */
            .sort(
              (a, b) =>
                intensityLevel(b.intensity) - intensityLevel(a.intensity) ||
                a.title.localeCompare(b.title, 'ko')
            )[0]
        : undefined;
    }
    if (sub) {
      put(sub, move, move.name);
      swapped.push(`${move.name} → ${sub.title}`);
    } else {
      dropped.push(move.name);
    }
  }

  const notes: string[] = [];
  if (lowered) {
    notes.push(
      stage === 1
        ? '오늘은 아파서 1단계 운동을 그대로, 아프지 않은 범위에서만 해요.'
        : `오늘은 한 칸 낮춰 ${effective}단계 운동으로 해요. 초록이 세 번 나오면 원래 단계로 돌아가요.`
    );
  }
  if (lessSets) {
    notes.push(
      '통증이 심한 편이라 세트를 하나씩 줄였어요. 버티기는 최대 힘의 절반 이하로 해요.'
    );
  }
  if (swapped.length > 0) {
    notes.push(`장비가 없어 바꿔 넣었어요 — ${swapped.join(' · ')}`);
  }
  if (dropped.length > 0) {
    notes.push(`장비가 없어 ${withJosa(dropped.join(' · '), '은/는')} 뺐어요.`);
  }
  if (missing.length > 0) {
    notes.push(
      `라이브러리에 아직 없어 ${withJosa(missing.join(' · '), '은/는')} 뺐어요.`
    );
  }

  const byId = new Map(library.map((ex) => [ex.id, ex]));
  const minutes = items.reduce(
    (sum, it) => sum + sessionMinutes(byId.get(it.exerciseId)!, it.sets),
    0
  );
  return {
    stage: effective,
    lowered,
    items,
    notes,
    estimatedMinutes: Math.max(1, Math.round(minutes)),
  };
}

/* ─────────────────────────────── 세션 판정 ─────────────────────────────── */

/** 이 통증부터 빨강 */
export const RED_PAIN = 5;

/**
 * 허용 통증(가이드라인 7절) — 1 · 2단계는 부위 · 병명(힘줄 · 근육형 3, 인대 · 불안정형 2), 3 · 4단계는 2(통증 없음).
 */
export function painAllowance({
  stage,
  area,
  condition,
}: {
  stage: RehabStage;
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
}): number {
  if (stage >= 3) return 2;
  const c = condition ? REHAB_CONDITIONS[condition] : null;
  return c?.earlyPainLimit ?? REHAB_REGIONS[area].earlyPainLimit;
}

/**
 * 세션 판정 — 3문항(남은 통증 · 가장 아팠던 정도 · 느낌)으로(가이드라인 7절).
 *   진료  저리거나 감각이 이상함 · 빠질 것 같음
 *   빨강  남은 통증이 계속 있었음 · 5 이상 · 3 · 4단계에서 관절이 찌르듯
 *   노랑  남은 통증이 하다 보니 사라짐 · 허용보다 높고 4 이하 · (1 · 2단계) 관절이 찌르듯
 *   초록  남은 통증 없음 + 허용 이하 + 근육 느낌
 */
export function judgeSession({
  leftover,
  pain,
  feel,
  stage,
  area,
  condition,
}: {
  leftover: RehabLeftover;
  pain: number;
  feel: RehabFeel;
  stage: RehabStage;
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
}): RehabResult {
  if (feel === 'tingle' || feel === 'slip') return 'refer';
  if (leftover === 2 || pain >= RED_PAIN || (stage >= 3 && feel === 'sharp'))
    return 'red';
  const allowed = painAllowance({ stage, area, condition });
  if (leftover === 1 || pain > allowed || feel !== 'muscle') return 'yellow';
  return 'green';
}

/** 세션 한 줄 — 판정 뒤처리 · 상태 계산이 보는 것 */
export type RehabSessionLike = {
  /** YYYY-MM-DD */
  date: string;
  stage: number;
  leftover: number;
  pain: number;
  feel: string;
  result: RehabResult;
  lowered: boolean;
};

/**
 * 빨강 · 진료 세션의 뒤처리(가이드라인 7절) — 그 밖은 null.
 *   남은 통증만으로 빨강  하루 쉬고 같은 것 [Fees 규칙 4]
 *   그 밖의 빨강          이틀 쉬고 한 칸 낮춤 [Fees 규칙 1 · 3]
 *   진료                  빨강처럼 이틀 쉬고 한 칸 낮춤 — 가이드라인이 정하지 않아 더 조심하는 쪽으로 [정리]
 */
export function afterBadSession(
  s: Pick<RehabSessionLike, 'result' | 'leftover' | 'pain' | 'feel' | 'stage'>
): { restDays: 1 | 2; lower: boolean } | null {
  if (s.result === 'refer') return { restDays: 2, lower: true };
  if (s.result !== 'red') return null;
  const leftoverOnly =
    s.leftover === 2 && s.pain < RED_PAIN && !(s.stage >= 3 && s.feel === 'sharp');
  return leftoverOnly ? { restDays: 1, lower: false } : { restDays: 2, lower: true };
}

/** 판정 한 줄 — 따라하기 끝에 보인다 */
export function sessionResultText(
  s: Pick<RehabSessionLike, 'result' | 'leftover' | 'pain' | 'feel' | 'stage'>
): string {
  const after = afterBadSession(s);
  switch (s.result) {
    case 'green':
      return '초록 — 잘했어요. 다음에도 이대로 해요.';
    case 'yellow':
      return '노랑 — 다음에도 같은 운동을 다시 해요. 아직 올리지 않아요.';
    case 'refer':
      return '진료 — 저리거나 빠질 것 같은 느낌은 진료를 받아보세요. 이틀은 팔을 쉬어요.';
    case 'red':
      if (after && !after.lower)
        return '빨강 — 내일은 쉬고, 그다음에 같은 운동을 해요.';
      return s.stage <= 1
        ? '빨강 — 이틀 쉬어요. 1단계에서도 아프면 진료를 받아보세요.'
        : '빨강 — 이틀 쉬고, 한 칸 낮춘 운동으로 해요.';
  }
}

/* ─────────────────────────────── 지금 상태 ─────────────────────────────── */

/** 상태 계산이 보는 재활 — DB 줄을 읽어 맞춘 것(lib/armcare/rehab-store.ts) */
export type RehabProgramLike = {
  area: ArmcareAreaKey;
  condition: RehabConditionKey | null;
  severity: RehabSeverity;
  stage: RehabStage;
  /** 이 단계를 시작한 날 YYYY-MM-DD */
  stageStartedOn: string;
  stageShortenDays: number;
  /** 재활을 시작한 날 YYYY-MM-DD */
  startedOn: string;
};

/** 상태 계산이 보는 체크인 — 최근 7일(오늘 포함) */
export type RehabCheckinLike = {
  date: string;
  shoulder: string;
  elbow: string;
  armPainLevel: number | null;
};

/** 'YYYY-MM-DD' 두 날 사이의 날 수(to − from) */
export function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

/** 단계 올리기 조건 하나 — 펼친 카드의 '올리는 조건'에 체크 표시와 함께 */
export type GateCheck = { label: string; ok: boolean };

export type StageGate = {
  /** 단계 시험을 해 볼 수 있는가(시험 통과는 따로 — judgeStageTest) */
  ready: boolean;
  checks: GateCheck[];
  minDays: number;
  elapsed: number;
  clean: number;
  cleanNeeded: number;
};

/** 심함이 1단계에 머무는 동안 보는 기간 — 밤 · 쉴 때 통증(체크인 정도 3)이 이만큼 없어야 */
export const NIGHT_PAIN_FREE_DAYS = 7;

export type RehabStatus = {
  /** 시작부터 며칠째(시작한 날이 1) */
  day: number;
  /** 이 단계를 시작하고 지난 날 */
  elapsed: number;
  minDays: number;
  /** 오늘 남긴 세션 — 없으면 null */
  today: RehabSessionLike | null;
  /** 오늘 쉬는 날이면 그 까닭 한 줄 */
  rest: string | null;
  /** 오늘 한 칸 낮춘 운동으로 하는가 */
  lowered: boolean;
  loweredReason: string | null;
  /** 진료 권유 한 줄 */
  refer: string | null;
  /** 심함 — 밤 · 쉴 때 통증이 7일 없을 때까지 1단계에 머무는 중 */
  nightHold: boolean;
  gate: StageGate;
  /** 카드 위에 뜨는 한 줄(하나만) */
  line: RehabLine | null;
};

export type RehabLineKind =
  'refer' | 'rest' | 'lowered' | 'stage-test' | 'weekly' | 'eased';
export type RehabLine = { kind: RehabLineKind; text: string };

/**
 * 카드 위에 뜨는 한 줄 — 하나만, 우선순위 순(설계 4-2): 진료 권유 > 쉬는 날 > 낮추기 > 단계 시험 > 매주 확인 > 정도가 낮아졌어요.
 * 매주 확인 · 정도 낮추기는 ②번이 채운다(지금은 늘 false).
 */
export function rehabCardLine({
  refer,
  rest,
  lowered,
  stageTest,
  weeklyDue = false,
  eased = false,
}: {
  refer: string | null;
  rest: string | null;
  lowered: string | null;
  stageTest: boolean;
  weeklyDue?: boolean;
  eased?: boolean;
}): RehabLine | null {
  if (refer) return { kind: 'refer', text: refer };
  if (rest) return { kind: 'rest', text: rest };
  if (lowered) return { kind: 'lowered', text: lowered };
  if (stageTest)
    return {
      kind: 'stage-test',
      text: '다음 단계로 갈 준비가 됐어요 — 단계 시험을 해 보세요.',
    };
  if (weeklyDue) return { kind: 'weekly', text: '이번 주 확인(1분)을 해 주세요.' };
  if (eased)
    return { kind: 'eased', text: '통증 정도가 낮아졌어요 — 기간이 짧아져요.' };
  return null;
}

/** 이 날 수 안의 빨강 셋이면 진료(가이드라인 10절) */
const REFER_WINDOW_DAYS = 14;
const REFER_RED_COUNT = 3;
/** 한 칸 낮춘 뒤 이만큼 초록이면 원래 단계로 */
const RETURN_GREENS = 3;

/**
 * 지금 상태 — 쉬는 날인가 · 낮춘 날인가 · 진료를 권할까 · 단계를 올릴 수 있는가 · 카드 한 줄.
 *
 *   쉬는 날   빨강 · 진료 뒤 하루/이틀, 2 · 3 · 4단계는 하루 걸러(어제 했으면 오늘 쉼), 오늘 체크인에서 그 관절이
 *             '통증'인데 정도가 1이 아님(평소에도 · 밤에도 · 모름) — 이때는 진료도 권한다
 *   낮춘 날   이 단계에서 낮추는 빨강이 나온 뒤 초록이 세 번 나오기 전, 또는 오늘 체크인에서 그 관절이 '던질 때만' 아픔
 *   진료      14일 안에 진료 판정 · 빨강(진료 포함) 셋 · 1단계에서 낮추기 조건
 *   깨끗한 세션  이 단계의 마지막 빨강 · 진료 뒤로 낮추지 않고 한 초록
 */
export function rehabStatus({
  program,
  sessions,
  checkins = [],
  todayKey,
}: {
  program: RehabProgramLike;
  /** 이 재활의 세션 전부(차례는 상관없다) */
  sessions: readonly RehabSessionLike[];
  /** 최근 7일(오늘 포함) 체크인 */
  checkins?: readonly RehabCheckinLike[];
  todayKey: string;
}): RehabStatus {
  const sorted = [...sessions].sort((a, b) => (a.date < b.date ? -1 : 1));
  const today = sorted.find((s) => s.date === todayKey) ?? null;
  const past = sorted.filter((s) => s.date < todayKey);
  const inStage = sorted.filter(
    (s) => s.stage === program.stage && s.date >= program.stageStartedOn
  );
  const joint = rehabJoint(program.area);
  const todayCheckin = checkins.find((c) => c.date === todayKey) ?? null;
  const jointPainToday = todayCheckin?.[joint] === '통증';

  /* 쉬는 날 — 지난 세션만 본다(오늘 이미 한 것은 '오늘 끝'이다) */
  let rest: string | null = null;
  for (const s of past) {
    const after = afterBadSession(s);
    if (!after) continue;
    const gap = daysBetween(s.date, todayKey);
    if (gap >= 1 && gap <= after.restDays) {
      rest =
        s.result === 'refer'
          ? '오늘은 쉬는 날이에요 — 저리거나 빠질 것 같은 느낌이 있었어요.'
          : `오늘은 쉬는 날이에요 — 지난번이 빨강이었어요(${after.restDays === 1 ? '하루' : '이틀'} 쉬기).`;
    }
  }
  const last = past.at(-1) ?? null;
  if (!rest && program.stage >= 2 && last && daysBetween(last.date, todayKey) === 1) {
    rest = '오늘은 쉬는 날이에요 — 2단계부터는 하루 걸러 해요.';
  }
  let refer: string | null = null;
  if (jointPainToday && todayCheckin?.armPainLevel !== 1) {
    rest = '오늘 체크인에 평소에도 아프다고 하셨어요 — 오늘은 쉬어요.';
    refer = '평소에도 아프거나 밤에도 아프면 진료를 받아보세요.';
  }

  /* 한 칸 낮춤 — 이 단계에서 낮추는 빨강 · 진료 뒤 초록 셋 전까지 */
  let lowerAt = -1;
  inStage.forEach((s, i) => {
    if (afterBadSession(s)?.lower) lowerAt = i;
  });
  const greensSince =
    lowerAt >= 0
      ? inStage.slice(lowerAt + 1).filter((s) => s.result === 'green').length
      : 0;
  const loweredBySession = lowerAt >= 0 && greensSince < RETURN_GREENS;
  const loweredByCheckin = jointPainToday && todayCheckin?.armPainLevel === 1;
  const lowered = loweredBySession || loweredByCheckin;
  const loweredReason = loweredBySession
    ? program.stage === 1
      ? '1단계에서도 아팠어요 — 아프지 않은 범위에서만 해요.'
      : `한 칸 낮춰 하는 중이에요 — 초록 ${RETURN_GREENS - greensSince}번 더면 돌아가요.`
    : loweredByCheckin
      ? '오늘 체크인에 던질 때 아프다고 하셨어요 — 한 칸 낮춰 해요.'
      : null;

  /* 진료 권유 */
  const recent = sorted.filter((s) => {
    const gap = daysBetween(s.date, todayKey);
    return gap >= 0 && gap < REFER_WINDOW_DAYS;
  });
  if (!refer) {
    if (recent.some((s) => s.result === 'refer')) {
      refer = '저리거나 빠질 것 같은 느낌이 있었어요 — 진료를 받아보세요.';
    } else if (
      recent.filter((s) => s.result === 'red' || s.result === 'refer').length >=
      REFER_RED_COUNT
    ) {
      refer = '2주 안에 빨강이 세 번 나왔어요 — 진료를 받아보세요.';
    } else if (loweredBySession && program.stage === 1) {
      refer = '1단계에서도 아파요 — 진료를 받아보세요.';
    }
  }

  /* 심함 — 밤 · 쉴 때 통증(체크인 정도 3)이 7일 없을 때까지 1단계에 머묾 */
  const nightPainFree = !checkins.some(
    (c) =>
      c.armPainLevel === 3 &&
      daysBetween(c.date, todayKey) >= 0 &&
      daysBetween(c.date, todayKey) < NIGHT_PAIN_FREE_DAYS
  );
  const nightHold =
    program.severity === 'severe' && program.stage === 1 && !nightPainFree;

  const gate = stageGate({
    program,
    inStage,
    todayKey,
    nightPainFree,
    blocked: lowered || refer != null,
  });

  return {
    day: daysBetween(program.startedOn, todayKey) + 1,
    elapsed: gate.elapsed,
    minDays: gate.minDays,
    today,
    rest,
    lowered,
    loweredReason,
    refer,
    nightHold,
    gate,
    line: rehabCardLine({
      refer,
      rest: today ? null : rest,
      lowered: today ? null : loweredReason,
      stageTest: gate.ready,
    }),
  };
}

/**
 * 단계를 올려도 되는가(시험을 해 볼 수 있는가) — 최소 기간 + 깨끗한 세션 수(cleanSessionsNeeded) + 최근 세 세션(필요한 수가
 * 셋보다 적으면 그만큼) 초록 + (심함 1단계) 밤 · 쉴 때 통증 7일 없음. 낮춘 날 · 진료를 권하는 날은 올리지 않는다. 4단계 다음은 투구 복귀표(②번).
 */
export function stageGate({
  program,
  inStage,
  todayKey,
  nightPainFree,
  blocked = false,
}: {
  program: RehabProgramLike;
  /** 이 단계의 세션 — 날짜 차례 */
  inStage: readonly RehabSessionLike[];
  todayKey: string;
  nightPainFree: boolean;
  /** 낮춘 날 · 진료를 권하는 날 */
  blocked?: boolean;
}): StageGate {
  const minDays = stageMinDays(program);
  const elapsed = Math.max(0, daysBetween(program.stageStartedOn, todayKey));
  if (program.stage === 4) {
    return { ready: false, checks: [], minDays, elapsed, clean: 0, cleanNeeded: 0 };
  }
  const cleanNeeded = cleanSessionsNeeded(program);
  let lastBad = -1;
  inStage.forEach((s, i) => {
    if (s.result === 'red' || s.result === 'refer') lastBad = i;
  });
  const clean = inStage
    .slice(lastBad + 1)
    .filter((s) => s.result === 'green' && !s.lowered).length;
  const recentNeeded = Math.min(3, cleanNeeded);
  const recent = inStage.slice(-recentNeeded);
  const threeGreen =
    recent.length === recentNeeded &&
    recent.every((s) => s.result === 'green' && !s.lowered);

  const checks: GateCheck[] = [
    { label: `이 단계 ${minDays}일 이상 (지금 ${elapsed}일)`, ok: elapsed >= minDays },
    {
      label: `깨끗한(초록) 세션 ${cleanNeeded}번 (지금 ${Math.min(clean, cleanNeeded)}번)`,
      ok: clean >= cleanNeeded,
    },
    { label: `최근 ${recentNeeded}번 모두 초록`, ok: threeGreen },
  ];
  if (program.severity === 'severe' && program.stage === 1) {
    checks.push({
      label: `밤 · 쉴 때 통증 없이 ${NIGHT_PAIN_FREE_DAYS}일`,
      ok: nightPainFree,
    });
  }
  return {
    ready: !blocked && checks.every((c) => c.ok),
    checks,
    minDays,
    elapsed,
    clean,
    cleanNeeded,
  };
}

/* ─────────────────────────────── 단계 시험 ─────────────────────────────── */

/**
 * 단계 시험(가이드라인 9절 — 던지는 팔 기준).
 *   1→2  양쪽 움직임 비교 — 다친 쪽이 아프지 않고 반대쪽과 비슷
 *   2→3  양쪽 힘 횟수 — 다친 쪽 ≥ 반대쪽 90% · 시험 중 통증 2 이하
 *   3→4  같은 힘 횟수 ≥ 100%(어깨 바깥 돌리기는 95%) + (어깨 부위) 팔굽혀 터치 15초(CKCUEST)가 통증 없이 내 첫 기록보다 늘어남
 */
export type StageTest =
  | { kind: 'rom'; from: 1; method: string }
  | {
      kind: 'strength';
      from: 2 | 3;
      /** 힘 비교에 쓰는 운동 */
      exercise: string;
      /** 통과선(반대쪽 대비, %) */
      percent: number;
      /** CKCUEST 를 함께 보는가(3→4 어깨 부위) */
      ckc: boolean;
      method: string;
    };

/** 시험 중 이 통증까지 '통증 없음'(3 · 4단계와 같은 선) */
export const TEST_PAIN_LIMIT = 2;

export const CKCUEST_METHOD =
  '손을 91cm 떨어진 두 줄에 두고 엎드려 버틴 채, 15초 동안 한 손씩 반대 줄을 번갈아 터치해요. 세 번 해서 평균을 적어요.';

/** 힘 비교 운동 — 어깨 넷: 사이드라잉 외회전, 팔꿈치 안쪽 · 뒤쪽: 덤벨 전완 굴곡, 바깥쪽: 덤벨 전완 신전, 앞쪽: 덤벨 해머컬 */
function strengthExercise(area: ArmcareAreaKey): string {
  if (SHOULDER_AREAS.includes(area)) return '사이드라잉 외회전';
  if (area === 'elbow-outer') return '덤벨 전완 신전';
  if (area === 'elbow-front') return '덤벨 해머컬';
  return '덤벨 전완 굴곡';
}

/** 이 단계에서 다음으로 가는 시험 — 4단계는 투구 복귀표 열기(judgeThrowingOpen)라 null */
export function stageTestFor(
  area: ArmcareAreaKey,
  stage: RehabStage
): StageTest | null {
  const shoulder = SHOULDER_AREAS.includes(area);
  if (stage === 1) {
    return {
      kind: 'rom',
      from: 1,
      method: shoulder
        ? '팔을 앞 · 옆으로 머리 위까지 올리고, 팔꿈치를 옆에 붙여 안팎으로 돌려 양쪽을 견줘요.'
        : '팔꿈치를 끝까지 굽히고 펴서 양쪽을 견줘요.',
    };
  }
  if (stage === 4) return null;
  const exercise = strengthExercise(area);
  return {
    kind: 'strength',
    from: stage,
    exercise,
    percent: stage === 2 ? 90 : shoulder ? 95 : 100,
    ckc: stage === 3 && shoulder,
    method: `같은 가벼운 덤벨(또는 밴드)로 ${withJosa(exercise, '을/를')} 지칠 때까지 해서, 양쪽 횟수를 세요.`,
  };
}

export type StageTestInput = {
  /** 1→2: 다친 쪽을 움직일 때 아프지 않았는가 */
  painFree?: boolean;
  /** 1→2: 반대쪽과 비슷하게 움직이는가 */
  similar?: boolean;
  /** 힘 비교: 다친 쪽 · 반대쪽 횟수 */
  injured?: number;
  other?: number;
  /** 시험 중 가장 아팠던 정도 0~10 */
  pain?: number;
  /** CKCUEST: 오늘 · 처음 기록(3번 평균) */
  ckcNow?: number | null;
  ckcFirst?: number | null;
};

/** a 가 b 의 percent% 이상인가 — 소수 오차 없이 정수로 견준다 */
export function atLeastPercent(a: number, b: number, percent: number): boolean {
  return Math.round(a * 1000) * 100 >= Math.round(b * 1000) * percent;
}

/** 단계 시험 판정 — 통과 못 한 까닭을 한 줄씩 */
export function judgeStageTest(
  test: StageTest,
  input: StageTestInput
): { pass: boolean; fails: string[] } {
  const fails: string[] = [];
  if (test.kind === 'rom') {
    if (input.painFree !== true) fails.push('움직일 때 아프지 않아야 해요.');
    if (input.similar !== true) fails.push('반대쪽과 비슷하게 움직여야 해요.');
    return { pass: fails.length === 0, fails };
  }
  const injured = input.injured ?? NaN;
  const other = input.other ?? NaN;
  if (!(injured >= 0) || !(other > 0)) {
    fails.push('양쪽 횟수를 적어 주세요.');
  } else if (!atLeastPercent(injured, other, test.percent)) {
    fails.push(`다친 쪽이 반대쪽의 ${test.percent}% 이상이어야 해요.`);
  }
  if (input.pain == null || input.pain > TEST_PAIN_LIMIT) {
    fails.push(`시험 중 통증이 ${TEST_PAIN_LIMIT} 이하여야 해요.`);
  }
  if (test.ckc) {
    const now = input.ckcNow ?? null;
    const first = input.ckcFirst ?? null;
    if (now == null || first == null) {
      fails.push(
        '팔굽혀 터치는 첫 기록과 오늘 기록이 둘 다 있어야 해요. 오늘 기록을 적어 두고 다음에 견줘요.'
      );
    } else if (!(now > first)) {
      fails.push('팔굽혀 터치가 첫 기록보다 늘어야 해요.');
    }
  }
  return { pass: fails.length === 0, fails };
}

/* ─────────────────────────────── 투구 복귀표 열기 ─────────────────────────────── */

/**
 * 4단계 공 운동을 이만큼 통증 없이 해야 한다(일) — 정도의 4단계 최소 기간(가벼움 4 · 보통 5 · 심함 7일).
 * 2026-10-04 고침: 처음에는 Wilk 의 '공 운동 2주'를 그대로 14일로 두었는데, 정도별 기간 표(사용자 "너무 보수적")와
 * 어긋났다. 진단받은 병은 병명 바닥(시작부터 UCL 6주 등)이 따로 지킨다.
 */
export function ballWorkPainFreeDays(severity: RehabSeverity): number {
  return STAGE_DAYS[severity][3];
}

/**
 * 투구 복귀표를 여는가(가이드라인 9절 마지막 줄 — 화면은 ②번).
 *   4단계 공 운동을 정도의 4단계 기간만큼 통증 없이 + 병명 바닥(시작부터) + 앉아서 한 팔 메디신볼 밀기 ≥ 100% +
 *   (플라이오볼이 있으면) 프론 볼 드롭 30초 ≥ 110% · 한 팔 90/90 벽 던지기 30초 ≥ 115% + 시험 중 통증 없이 +
 *   정상 대비 90% 이상 + 던질 자신감 7 이상
 * 플라이오볼이 없으면 볼 드롭 · 벽 던지기는 건너뛰고 밀기 · 힘 비교로 본다.
 */
export function judgeThrowingOpen(input: {
  severity: RehabSeverity;
  painFreeBallDays: number;
  daysSinceStart: number;
  condition: RehabConditionKey | null;
  hasPlyo: boolean;
  push: { injured: number; other: number };
  drop?: { injured: number; other: number } | null;
  wall?: { injured: number; other: number } | null;
  pain: number;
  normalPct: number;
  confidence: number;
}): { pass: boolean; fails: string[] } {
  const fails: string[] = [];
  const ballDays = ballWorkPainFreeDays(input.severity);
  if (input.painFreeBallDays < ballDays) {
    fails.push(`4단계 공 운동을 ${ballDays}일 통증 없이 해야 해요.`);
  }
  const floor = conditionFloorDays(input.condition);
  if (input.condition && input.daysSinceStart < floor) {
    const label = withJosa(REHAB_CONDITIONS[input.condition].label, '은/는');
    fails.push(`${label} 시작하고 ${floor / 7}주가 지나야 해요.`);
  }
  if (!atLeastPercent(input.push.injured, input.push.other, 100)) {
    fails.push('앉아서 한 팔 메디신볼 밀기가 반대쪽만큼 나가야 해요.');
  }
  if (input.hasPlyo) {
    const { drop, wall } = input;
    if (!drop || !atLeastPercent(drop.injured, drop.other, 110)) {
      fails.push('프론 볼 드롭이 반대쪽의 110% 이상이어야 해요.');
    }
    if (!wall || !atLeastPercent(wall.injured, wall.other, 115)) {
      fails.push('한 팔 90/90 벽 던지기가 반대쪽의 115% 이상이어야 해요.');
    }
  }
  if (input.pain > TEST_PAIN_LIMIT) fails.push('시험 중 아프지 않아야 해요.');
  if (input.normalPct < 90) fails.push('팔 상태가 다치기 전의 90% 이상이어야 해요.');
  if (input.confidence < 7) fails.push('세게 던질 자신감이 7 이상이어야 해요.');
  return { pass: fails.length === 0, fails };
}

/* ─────────────────────────────── 앱의 다른 곳 ─────────────────────────────── */

/**
 * 웨이트 · 투구 계획이 보는 재활(facts.condition.rehab) — DB 를 모르는 리포트 쪽이 이것만 받는다.
 * lib/report/facts.ts · plan.ts 는 이 파일을 값으로 읽지 않는다(투구 계획은 화면 부품에도 실려, 운동 목록까지 따라오지 않게).
 */
export type RehabFacts = {
  area: ArmcareAreaKey;
  /** 카드 제목과 같은 이름 — '팔꿈치 안쪽' · 'UCL 부분 손상' */
  label: string;
  stage: RehabStage;
  severity: RehabSeverity;
  joint: RehabJoint;
  /**
   * 투구 계획 대신 — 'light' 가벼운 캐치볼만(18m 안 · 25개 · 통증 2 이하) / 'none' 던지지 않기.
   * 가벼움만 캐치볼을 이어 간다(가이드라인 3절) — 팔꿈치 안쪽 · 뒤쪽은 첫 주 제외.
   */
  throwing: 'light' | 'none';
  /** 가벼움인데 팔꿈치 안쪽 · 뒤쪽이라 첫 주는 던지지 않는 중 */
  firstWeekNoThrow: boolean;
};

/** 가벼워도 첫 주는 던지지 않는 부위 — 인대 · 뼈일 수 있다(Wilk 2012) */
const FIRST_WEEK_NO_THROW: readonly ArmcareAreaKey[] = ['elbow-inner', 'elbow-back'];

export function rehabFacts(program: RehabProgramLike, todayKey: string): RehabFacts {
  const firstWeek =
    FIRST_WEEK_NO_THROW.includes(program.area) &&
    daysBetween(program.startedOn, todayKey) < 7;
  const light = program.severity === 'mild' && !firstWeek;
  return {
    area: program.area,
    label: rehabTitle(program.area, program.condition),
    stage: program.stage,
    severity: program.severity,
    joint: rehabJoint(program.area),
    throwing: light ? 'light' : 'none',
    firstWeekNoThrow: program.severity === 'mild' && firstWeek,
  };
}

/** DB 줄의 값을 읽는다 — 모르는 값이면 null(재활이 없는 것으로 본다) */
export function readRehabProgram(row: {
  area: string;
  condition: string | null;
  severity: string;
  stage: number;
  stageStartedOn: string;
  stageShortenDays: number;
  startedOn: string;
}): RehabProgramLike | null {
  if (!isRehabArea(row.area)) return null;
  if (!REHAB_SEVERITIES.some((s) => s.key === row.severity)) return null;
  const stage = Math.min(4, Math.max(1, Math.round(row.stage))) as RehabStage;
  const condition = isRehabCondition(row.condition) ? row.condition : null;
  return {
    area: row.area,
    condition:
      condition && REHAB_CONDITIONS[condition].area === row.area ? condition : null,
    severity: row.severity as RehabSeverity,
    stage,
    stageStartedOn: row.stageStartedOn,
    stageShortenDays: Math.max(0, row.stageShortenDays),
    startedOn: row.startedOn,
  };
}

/** 내 활동 두 개를 읽는다 — [{ label }] */
export function readRehabActivities(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((v) => (v && typeof v === 'object' ? (v as { label?: unknown }).label : null))
    .filter((l): l is string => typeof l === 'string' && l.trim() !== '')
    .slice(0, 2);
}

/** 폼에서 온 내 활동 — 두 개, 겹치지 않게, 한 줄 20자까지. 아니면 null */
export function normalizeRehabActivities(raw: readonly unknown[]): string[] | null {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    if (typeof v !== 'string') continue;
    const label = v.trim().replace(/\s+/g, ' ');
    if (!label || label.length > REHAB_ACTIVITY_MAX_LENGTH || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out.length === 2 ? out : null;
}
