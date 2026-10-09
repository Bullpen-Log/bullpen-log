import { type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { armPainSpotLabel } from '@/lib/checkin';

/** 재활 규칙 — 스위치 · 이름들 · 부위 8곳. 밖에서는 입구 '@/lib/armcare/rehab' 로 가져다 쓴다. */

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
    goal: '아프지 않은 범위에서 버티기(아이소메트릭)와 날개뼈 세우기, 필요한 스트레칭만 해요.',
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
  '푸시업',
] as const;
export const REHAB_ACTIVITY_MAX_LENGTH = 20;

/* ─────────────────────────────── 부위 8곳 ─────────────────────────────── */

/** 운동 하나 — 이름은 라이브러리 제목 그대로, note 는 화면에 붙는 한마디('아프지 않은 높이까지') */
export type RehabMove = { name: string; note?: string };
export type MoveSpec = string | readonly [string, string];

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
        '크로스바디 스트레치',
        '어깨 외회전 아이소메트릭 프레스',
        '어깨 내회전 아이소메트릭 프레스',
        '밴드 스캡 핀치',
        '프론 막대 스캡 홀드',
      ],
      [
        '사이드라잉 외회전',
        '튜빙 외회전 0도',
        '프론 로우 + 외회전',
        '프론 Y 레이즈',
        '튜빙 서라투스 펀치',
        '크로스바디 스트레치',
        '케틀벨 바텀업 캐리',
      ],
      [
        '시티드 외회전 에센트릭 오버로드',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
        '프론 외회전',
        '튜빙 대각선 굴곡',
      ],
      [
        '사이드라잉 외회전 리바운드',
        '톨닐링 메디신볼 오버헤드 스로우',
        '90/90 플라이오볼 벽 드리블',
        '프론 90/90 플라이오볼 드롭',
        '싱글암 90/90 플라이오볼 벽 던지기',
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
        '어깨 내회전 아이소메트릭 프레스',
        '어깨 외회전 아이소메트릭 프레스',
        '밴드 스캡 핀치',
        '프론 막대 스캡 홀드',
        '크로스바디 스트레치',
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
        '수파인 덤벨 내회전 90도',
        '프론 Y 레이즈',
        '푸시업 플러스',
        '케틀벨 바텀업 캐리',
      ],
      [
        '튜빙 내회전 0도 리바운드',
        '톨닐링 메디신볼 체스트 패스',
        '톨닐링 메디신볼 오버헤드 스로우',
        '90/90 플라이오볼 벽 드리블',
        '싱글암 90/90 플라이오볼 벽 던지기',
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
        '어깨 외전 아이소메트릭 프레스',
        '어깨 외회전 아이소메트릭 프레스',
        '어깨 내회전 아이소메트릭 프레스',
        '밴드 스캡 핀치',
        '크로스바디 스트레치',
      ],
      [
        '사이드라잉 외회전',
        '튜빙 외회전 0도',
        '튜빙 내회전 0도',
        '월 슬라이드',
        '튜빙 서라투스 펀치',
        ['싱글암 Y 레이즈', '아프지 않은 높이까지'],
      ],
      [
        '시티드 외회전 에센트릭 오버로드',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
        '프론 Y 레이즈',
        '튜빙 대각선 굴곡',
        '푸시업 플러스',
      ],
      [
        '사이드라잉 외회전 리바운드',
        '톨닐링 메디신볼 오버헤드 스로우',
        '90/90 플라이오볼 벽 드리블',
        '프론 90/90 플라이오볼 드롭',
        '싱글암 90/90 플라이오볼 벽 던지기',
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
        '흉추 3방향 모빌리티',
        '어깨 외회전 아이소메트릭 프레스',
      ],
      [
        '월 슬라이드',
        '튜빙 서라투스 펀치',
        '프론 로우 + 외회전',
        '쿼드러펫 Y 레이즈',
        '쿼드러펫 T 레이즈',
        '톨닐링 밴드 페이스 풀',
      ],
      [
        '프론 Y 레이즈',
        '프론 숄더 익스텐션',
        '푸시업 플러스',
        '튜빙 W',
        '케틀벨 바텀업 캐리',
      ],
      [
        '케틀벨 바텀업 웨이터 캐리',
        '프론 90/90 플라이오볼 드롭',
        '90/90 플라이오볼 벽 드리블',
        '톨닐링 메디신볼 오버헤드 스로우',
        '싱글암 90/90 플라이오볼 벽 던지기',
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
        '리스트 플렉션 아이소메트릭 프레스',
        '전완 프로네이션 아이소메트릭 프레스',
        '어깨 외회전 아이소메트릭 프레스',
        '밴드 스캡 핀치',
        '엘보 플렉션 아이소메트릭 프레스',
      ],
      [
        '튜빙 리스트 플렉션',
        '튜빙 전완 프로네이션',
        '튜빙 울나 디비에이션',
        '덤벨 핑거 컬',
        '사이드라잉 외회전',
        '튜빙 외회전 0도',
        '프론 로우 + 외회전',
      ],
      [
        '리스트 플렉션 에센트릭 오버로드',
        '전완 프로네이션 에센트릭 오버로드',
        '울나 디비에이션 에센트릭 오버로드',
        '원판 핀치 홀드',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
      ],
      [
        '톨닐링 메디신볼 체스트 패스',
        '톨닐링 메디신볼 오버헤드 스로우',
        '90/90 플라이오볼 벽 드리블',
        '싱글암 90/90 플라이오볼 벽 던지기',
        '전완 프로네이션 에센트릭 오버로드',
        '튜빙 대각선 스로우',
      ],
    ],
  },
  'elbow-outer': {
    earlyPainLimit: 2,
    avoid: ['손 짚고 버티기(푸쉬업 · 플랭크 · TRX)', '편 팔로 세게 쥐기', '던지기'],
    youthNeedsDiagnosis: true,
    stages: [
      [
        '리스트 익스텐션 아이소메트릭 프레스',
        '전완 수피네이션 아이소메트릭 프레스',
        '밴드 스캡 핀치',
        '어깨 외회전 아이소메트릭 프레스',
        '엘보 플렉션 아이소메트릭 프레스',
      ],
      [
        '튜빙 리스트 익스텐션',
        '튜빙 전완 수피네이션',
        '튜빙 래디얼 디비에이션',
        '밴드 하이 바이셉스 컬',
        '사이드라잉 외회전',
        '프론 로우 + 외회전',
      ],
      [
        '리스트 익스텐션 에센트릭 오버로드',
        '전완 수피네이션 에센트릭 오버로드',
        '래디얼 디비에이션 에센트릭 오버로드',
        '덤벨 해머 컬',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
      ],
      [
        '톨닐링 메디신볼 오버헤드 스로우',
        '90/90 플라이오볼 벽 드리블',
        '싱글암 90/90 플라이오볼 벽 던지기',
        '리스트 익스텐션 에센트릭 오버로드',
        '튜빙 대각선 스로우',
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
        '엘보 플렉션 아이소메트릭 프레스',
        '리스트 플렉션 아이소메트릭 프레스',
        '전완 프로네이션 아이소메트릭 프레스',
        '밴드 스캡 핀치',
        '어깨 외회전 아이소메트릭 프레스',
      ],
      [
        '밴드 하이 바이셉스 컬',
        ['밴드 트라이셉스 푸시다운', '끝까지 펴지 않기'],
        '튜빙 리스트 플렉션',
        '튜빙 전완 프로네이션',
        '사이드라잉 외회전',
        '프론 로우 + 외회전',
      ],
      [
        '덤벨 컬 에센트릭 오버로드',
        '에센트릭 밴드 바이셉스 컬',
        '전완 프로네이션 에센트릭 오버로드',
        '리스트 플렉션 에센트릭 오버로드',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
      ],
      [
        '덤벨 컬 드롭 캐치',
        '톨닐링 메디신볼 체스트 패스',
        '90/90 플라이오볼 벽 드리블',
        '싱글암 90/90 플라이오볼 벽 던지기',
        '튜빙 대각선 스로우',
      ],
    ],
  },
  'elbow-front': {
    earlyPainLimit: 2,
    avoid: ['억지로 과하게 펴기', '무거운 컬', '버티며 내리는 컬(1 · 2단계)', '친업'],
    youthNeedsDiagnosis: false,
    stages: [
      [
        '엘보 플렉션 아이소메트릭 프레스',
        '전완 수피네이션 아이소메트릭 프레스',
        '밴드 스캡 핀치',
        '어깨 외회전 아이소메트릭 프레스',
        '리스트 플렉션 아이소메트릭 프레스',
      ],
      [
        '밴드 하이 바이셉스 컬',
        '덤벨 해머 컬',
        '튜빙 전완 수피네이션',
        '튜빙 전완 프로네이션',
        '사이드라잉 외회전',
        '프론 로우 + 외회전',
      ],
      [
        '에센트릭 밴드 바이셉스 컬',
        '덤벨 컬 에센트릭 오버로드',
        '전완 수피네이션 에센트릭 오버로드',
        '조트만 컬',
        '하프닐링 튜빙 외회전 90도',
        '하프닐링 튜빙 내회전 90도',
      ],
      [
        '덤벨 컬 드롭 캐치',
        '톨닐링 메디신볼 체스트 패스',
        '90/90 플라이오볼 벽 드리블',
        '싱글암 90/90 플라이오볼 벽 던지기',
        '튜빙 대각선 스로우',
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

export const SHOULDER_AREAS: readonly ArmcareAreaKey[] = [
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
