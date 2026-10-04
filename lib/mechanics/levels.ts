/**
 * 메커니즘 프로그램의 수준 — 입문 · 초급 · 중급 · 고급(2026-10-04 사용자분: "세션을 자동으로 만들지 말고, 기초부터 초급 ·
 * 중급 · 고급 같은 선택지를 두고 본인 수준에 맞는 프로그램을 골라 실행하게").
 *
 * 사용자분이 고른 틀: 수준 넷 · 주차별로 정해진 세션 · 쉬움이 쌓여도 저절로 올리지 않고 권하기만.
 * 수준마다 4주 × 주 3번 = 12세션. 1~2주차는 묶음 A · B · C, 3~4주차는 같은 수준에서 한 걸음 나아간 D · E · F 를 돌린다.
 * 세션은 드릴 셋을 투구 차례(하체 → 가운데 → 상체)로 두고, 두 주 묶음마다 여섯 요소가 모두 주 요소로 한 번 넘게 나온다
 * (시험: npm run mechanics:test).
 *
 * 수준을 가른 근거는 트레드의 드릴 진행표다(lib/mechanics/elements.ts [T7]): 느린 동작으로 다시 익히기 → 이어 하기 →
 * 전체 동작에 옮기기, 그리고 '쉬운 드릴이 편해질 때까지 몇 주가 걸려도 처음 드릴에 머문다'. 드릴의 단계(기초 · 연결 · 통합,
 * lib/exercise-meta.ts DRILL_STAGES)를 수준마다 이렇게 섞었다 — 입문: 기초만, 초급: 기초 + 연결, 중급: 연결 위주 + 통합,
 * 고급: 통합 위주 + 연결. 드릴 이름은 라이브러리의 묶음 이름(lib/mechanics/drills.ts familyTitle)이다.
 */
import type { DRILL_STAGE_NAMES } from '@/lib/exercise-meta';

type DrillStage = (typeof DRILL_STAGE_NAMES)[number];

export type LevelKey = 'intro' | 'beginner' | 'intermediate' | 'advanced';

export type MechanicsLevel = {
  key: LevelKey;
  name: '입문' | '초급' | '중급' | '고급';
  /** 한 줄 */
  line: string;
  /** 이런 분께 */
  who: string;
  /** 무엇을 · 어떻게 */
  what: string;
  /** 이 수준에 들어가는 드릴 단계 */
  stages: DrillStage[];
  /** [1~2주차 묶음 A · B · C, 3~4주차 묶음 D · E · F] — 세션마다 드릴 이름 셋(투구 차례) */
  blocks: [string[][], string[][]];
};

export const WEEKS = 4;
export const PER_WEEK = 3;
/** 한 수준의 세션 수 */
export const SESSIONS_PER_LEVEL = WEEKS * PER_WEEK;

export const MECHANICS_LEVELS: MechanicsLevel[] = [
  {
    key: 'intro',
    name: '입문',
    line: '제자리에서 자세를 하나씩 익혀요',
    who: '메커닉 드릴이 처음이거나, 동작을 하나씩 천천히 다시 익히고 싶을 때',
    what: '기초 드릴만 해요. 제자리에서 한 구간씩, 처음 몇 번은 느린 동작으로 하고 50~60% 힘으로 해요.',
    stages: ['기초'],
    blocks: [
      [
        ['지지 레그 리프트 드리프트', '힙 스위블', '스트레치 스로우'],
        ['레터럴 맥스뎁스 힌지', '레터럴 힌지 풋 스톰프', '암 패스 8자'],
        ['지지 레그 리프트 드리프트 → 힌지', '스플릿 스탠스 흉추 회전', '라소 드릴'],
      ],
      [
        ['레그 리프트 드리프트', '막대 스플릿 스탠스 분리 회전', '스플릿 스탠스 스로우'],
        ['레터럴 힌지 + 고관절 굴곡근 신전', '풋다운 로커', '90/90 월 드리블'],
        ['핸드홀드 힌지 + 내회전 → 흉추 신전', '레터럴 힌지 + 흉추 회전', '와이드 스트레치 스로우'],
      ],
    ],
  },
  {
    key: 'beginner',
    name: '초급',
    line: '두 구간을 이어 봐요',
    who: '기초 자세가 익숙하고, 이제 움직임을 이어 보고 싶을 때',
    what: '기초와 연결 드릴을 섞어요. 한 번 움직였다가 던지고, 60~70% 힘으로 해요.',
    stages: ['기초', '연결'],
    blocks: [
      [
        ['레그 리프트 드리프트 → 힌지', '리듬 로커', '라소 드릴'],
        ['레그 리프트 모멘텀 슬라이드', '레터럴 힌지 풋 스톰프', '스플릿 스탠스 암 패스 8자 스로우'],
        ['힌지 홉', '롤인 스로우', '스플릿 스탠스 피니시 스로우'],
      ],
      [
        ['레터럴 힌지 바운드', '포워드 스플릿 스탠스 스로우', '반대다리 스플릿 스탠스 스로우'],
        ['재니터 스로우', '레그 리프트 드리프트 → 힌지 + 반대회전', '8자 리듬 로커'],
        ['훅엠 드릴', '레터럴 힌지 바운드 + 정지', '스플릿 스탠스 스로우 + 모멘텀'],
      ],
    ],
  },
  {
    key: 'intermediate',
    name: '중급',
    line: '움직이며 던져요',
    who: '연결 드릴이 편하고, 앞으로 나가는 힘을 투구에 싣고 싶을 때',
    what: '연결 드릴 위주에 통합 드릴을 더해요. 60~75% 힘으로, 이어지는 타이밍을 지켜요.',
    stages: ['연결', '통합'],
    blocks: [
      [
        ['스위치 풋 드롭 힌지 스로우', '롤인 스로우', '8자 리듬 로커'],
        ['재니터 스로우', '힌지 스톰프 스로우', '턴 앤 번 스로우'],
        ['레터럴 힌지 바운드 → 내회전', '리듬 로커', '반대다리 스플릿 스탠스 스로우'],
      ],
      [
        ['스텝백 스로우 드릴', '레터럴 힌지 풋 스톰프 → 내회전', '스플릿 스탠스 암 패스 8자 스로우'],
        ['훅엠 드릴', '레그 리프트 드리프트 → 힌지 + 반대회전', '바우어 드릴'],
        ['KBO 로커', '포워드 스플릿 스탠스 스로우', '스플릿 스탠스 스로우 + 모멘텀'],
      ],
    ],
  },
  {
    key: 'advanced',
    name: '고급',
    line: '전체 동작에 옮겨요',
    who: '드릴이 대부분 편하고, 실제 투구 템포로 다듬고 싶을 때',
    what: '통합 드릴 위주예요. 앞으로 나가는 힘을 받아 전체 동작으로 던지고, 60~75% 힘으로 타이밍을 지켜요.',
    stages: ['연결', '통합'],
    blocks: [
      [
        ['기쿠치 드릴', '로테이셔널 스텝백 스로우', '턴 앤 번 스로우'],
        ['스텝백 스로우 드릴', '허들 착지 스로우', '스텝 비하인드 스로우'],
        ['KBO 로커', '롤인 스로우', '바우어 드릴'],
      ],
      [
        ['레터럴 셔플 스로우', '포워드 스플릿 스탠스 스로우 + 모멘텀', '8자 리듬 로커'],
        ['뎁스 드롭 힌지 스로우', '레그 리프트 드리프트 → 힌지 + 반대회전 → 내회전', '턴 앤 번 스로우'],
        ['힌지 드라이브 스로우', '다르빗슈 드릴', '워킹 와인드업'],
      ],
    ],
  },
];

export function isLevelKey(value: unknown): value is LevelKey {
  return MECHANICS_LEVELS.some((l) => l.key === value);
}

export function mechanicsLevel(key: LevelKey): MechanicsLevel {
  return MECHANICS_LEVELS.find((l) => l.key === key) ?? MECHANICS_LEVELS[0];
}

/** 바로 위 · 아래 수준 — 끝이면 null */
export function nextLevel(key: LevelKey): MechanicsLevel | null {
  const i = MECHANICS_LEVELS.findIndex((l) => l.key === key);
  return MECHANICS_LEVELS[i + 1] ?? null;
}
export function prevLevel(key: LevelKey): MechanicsLevel | null {
  const i = MECHANICS_LEVELS.findIndex((l) => l.key === key);
  return i > 0 ? MECHANICS_LEVELS[i - 1] : null;
}

/**
 * 몇 번째 세션인가(index = 이 수준에서 마친 세션 수, 0부터) — 주차 · 그 주의 몇 번째 · 드릴 이름.
 * 12번을 다 마쳤으면(index ≥ 12) null.
 */
export function levelSession(
  key: LevelKey,
  index: number
): { week: number; day: number; titles: string[] } | null {
  const n = Math.floor(index);
  if (!(n >= 0) || n >= SESSIONS_PER_LEVEL) return null;
  const level = mechanicsLevel(key);
  const week = Math.floor(n / PER_WEEK) + 1;
  const day = (n % PER_WEEK) + 1;
  const block = week <= WEEKS / 2 ? level.blocks[0] : level.blocks[1];
  return { week, day, titles: block[(day - 1) % block.length] };
}
