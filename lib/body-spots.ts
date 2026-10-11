/**
 * 체크인의 '불편한 곳' — 몸 그림에서 고르는 근육(2026-10-12 사용자: "불편한 곳 있어요를 누르면 부위 목록 대신
 * 신체 그래픽으로, 불편한 근육을 고르고 어느 정도 불편한지 고르게").
 *
 * 고른 것은 DailyCheckin.bodySpots 에 { "R:deltFront": "뻐근" } 꼴로 남고, 예전 다섯 부위 칸(shoulder …)은 그 부위에
 * 속한 근육 중 가장 센 값으로 채운다(partsFromSpots). 운동 추천 · 통증 관문 · 암케어는 지금처럼 부위 칸만 읽는다 —
 * 그래서 근육마다 무엇을 빼는지는 아직 없다(부위 단위 그대로).
 *
 * 그림(components/body-spot-picker.tsx)의 모양과 짝이다. 여기 key 를 바꾸면 저장된 옛 값이 버려진다.
 */
import type { CheckinPartKey } from '@/lib/checkin';

export const SPOT_LEVELS = ['뻐근', '통증'] as const;
export type SpotLevel = (typeof SPOT_LEVELS)[number];

/** R 오른쪽 · L 왼쪽 · C 가운데(하나뿐) */
export type SpotSide = 'R' | 'L' | 'C';

export type SpotDef = {
  key: string;
  label: string;
  part: CheckinPartKey;
  view: 'front' | 'back';
  /** 좌우 한 쌍인가 — 아니면 가운데 하나 */
  paired: boolean;
};

export const SPOT_DEFS: readonly SpotDef[] = [
  { key: 'deltFront', label: '어깨 앞', part: 'shoulder', view: 'front', paired: true },
  { key: 'chest', label: '가슴', part: 'shoulder', view: 'front', paired: true },
  { key: 'biceps', label: '위팔 앞', part: 'elbow', view: 'front', paired: true },
  { key: 'elbowIn', label: '팔꿈치 안쪽', part: 'elbow', view: 'front', paired: true },
  { key: 'forearmIn', label: '전완 안쪽', part: 'wrist', view: 'front', paired: true },
  { key: 'wrist', label: '손목 · 손', part: 'wrist', view: 'front', paired: true },
  { key: 'abs', label: '배', part: 'lowerBack', view: 'front', paired: false },
  { key: 'oblique', label: '옆구리', part: 'lowerBack', view: 'front', paired: true },
  { key: 'hipFront', label: '고관절 · 사타구니', part: 'lowerBody', view: 'front', paired: true },
  { key: 'quad', label: '허벅지 앞', part: 'lowerBody', view: 'front', paired: true },
  { key: 'knee', label: '무릎', part: 'lowerBody', view: 'front', paired: true },
  { key: 'shin', label: '정강이', part: 'lowerBody', view: 'front', paired: true },
  { key: 'ankle', label: '발목 · 발', part: 'lowerBody', view: 'front', paired: true },
  { key: 'traps', label: '목 · 승모근', part: 'shoulder', view: 'back', paired: false },
  { key: 'deltBack', label: '어깨 뒤', part: 'shoulder', view: 'back', paired: true },
  { key: 'scapula', label: '날개뼈', part: 'shoulder', view: 'back', paired: true },
  { key: 'triceps', label: '위팔 뒤', part: 'elbow', view: 'back', paired: true },
  { key: 'elbowOut', label: '팔꿈치 바깥', part: 'elbow', view: 'back', paired: true },
  { key: 'forearmOut', label: '전완 바깥', part: 'wrist', view: 'back', paired: true },
  { key: 'lowBack', label: '허리', part: 'lowerBack', view: 'back', paired: false },
  { key: 'glute', label: '엉덩이', part: 'lowerBody', view: 'back', paired: true },
  { key: 'hamstring', label: '허벅지 뒤', part: 'lowerBody', view: 'back', paired: true },
  { key: 'calf', label: '종아리', part: 'lowerBody', view: 'back', paired: true },
];

const DEF_BY_KEY = new Map(SPOT_DEFS.map((d) => [d.key, d]));

export type BodySpots = Record<string, SpotLevel>;

export function spotId(side: SpotSide, key: string) {
  return `${side}:${key}`;
}

export function spotOf(id: string): { side: SpotSide; def: SpotDef } | null {
  const [side, key] = id.split(':');
  const def = DEF_BY_KEY.get(key ?? '');
  if (!def) return null;
  if (def.paired ? side !== 'R' && side !== 'L' : side !== 'C') return null;
  return { side: side as SpotSide, def };
}

/** '오른쪽 어깨 앞' */
export function spotLabel(id: string) {
  const s = spotOf(id);
  if (!s) return id;
  return s.side === 'C' ? s.def.label : `${s.side === 'R' ? '오른쪽' : '왼쪽'} ${s.def.label}`;
}

/** 모르는 근육 · 값은 버린다(DB 의 옛 값 · 폼에서 온 값 둘 다) */
export function cleanBodySpots(raw: unknown): BodySpots {
  const out: BodySpots = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, level] of Object.entries(raw as Record<string, unknown>)) {
    if (spotOf(id) && (SPOT_LEVELS as readonly unknown[]).includes(level)) {
      out[id] = level as SpotLevel;
    }
  }
  return out;
}

/** 폼의 숨은 칸(JSON) → 고른 근육. 깨진 값은 빈 것으로 */
export function parseBodySpots(text: string): BodySpots {
  try {
    return cleanBodySpots(JSON.parse(text));
  } catch {
    return {};
  }
}

const RANK = { 정상: 0, 뻐근: 1, 통증: 2 } as const;

/** 근육 → 다섯 부위 칸. 고른 것이 없는 부위는 '정상' */
export function partsFromSpots(spots: BodySpots): Record<CheckinPartKey, string> {
  const parts: Record<CheckinPartKey, '정상' | SpotLevel> = {
    shoulder: '정상',
    elbow: '정상',
    wrist: '정상',
    lowerBack: '정상',
    lowerBody: '정상',
  };
  for (const [id, level] of Object.entries(spots)) {
    const s = spotOf(id);
    if (s && RANK[level] > RANK[parts[s.def.part]]) parts[s.def.part] = level;
  }
  return parts;
}
