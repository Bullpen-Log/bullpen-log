/**
 * 체크인의 '불편한 곳' — 큰 부위 넷(어깨 · 팔꿈치 · 몸통 · 하체)을 누르면 그 부위의 자리 그림 카드가 펼쳐지고, 카드를 골라
 * 뻐근한지 아픈지 고른다(2026-11-06 김민: "3D 근육이 너무 디테일하고 복잡 — 큰 부위로 묶어 단순하게, 2D 그림 카드로").
 * 예전(2026-10-12)에는 3D 전신 모델의 근육 109개를 골랐다 — 그 값은 cleanBodySpots 가 자리로 옮겨 읽는다(LEGACY).
 *
 * 고른 것은 DailyCheckin.bodySpots 에 { "R:elbow-inner": "통증" } 꼴로 남고, 예전 다섯 부위 칸(shoulder …)은 그 부위에
 * 속한 자리 중 가장 센 값으로 채운다(partsFromSpots). 운동 추천 · 통증 관문 · 암케어는 지금처럼 부위 칸만 읽는다.
 * 어깨 · 팔꿈치 여덟 자리의 key 는 팔 통증 자리(lib/checkin.ts ARM_PAIN_SPOTS) · 암케어 부위별 보강 여덟과 같다 —
 * 그래서 팔 통증 자리를 따로 묻지 않고 여기서 고른 '통증' 자리로 채운다(armSpotsFromSpots).
 * 여기 key 를 바꾸면 저장된 값이 버려진다.
 */
import type { CheckinPartKey } from '@/lib/checkin';

export const SPOT_LEVELS = ['뻐근', '통증'] as const;
export type SpotLevel = (typeof SPOT_LEVELS)[number];

/** R 오른쪽 · L 왼쪽 */
export type SpotSide = 'R' | 'L';

/** 체크인에서 먼저 고르는 큰 부위 넷 — 엔진의 다섯 칸과 다르다(손목 · 아래팔은 팔꿈치 안에, 허리는 몸통) */
export const SPOT_GROUPS = [
  { key: 'shoulder', label: '어깨' },
  { key: 'elbow', label: '팔꿈치' },
  { key: 'trunk', label: '몸통' },
  { key: 'lower', label: '하체' },
] as const;
export type SpotGroupKey = (typeof SPOT_GROUPS)[number]['key'];

/**
 * 자리 그림 — public/checkin-body/<이름>.jpg. 오른쪽 몸 기준으로 그렸고 왼쪽은 좌우로 뒤집어 쓴다.
 * 2026-11-06 GPT Image 2.5(힉스필드)로 만든 선 그림(같은 기준 그림으로 그림체를 맞춤). 빨간 번짐은 그림에 없고 화면이 얹는다.
 */
export type SpotPicture = 'front' | 'back' | 'arm-inner' | 'arm-outer' | 'arm-back' | 'legs-front' | 'legs-back';

export type SpotDef = {
  key: string;
  /** 카드 위 짧은 이름('안쪽') */
  chip: string;
  /** 칩 · 요약에 쓰는 이름('팔꿈치 안쪽') */
  label: string;
  group: SpotGroupKey;
  /** 엔진이 읽는 다섯 칸 중 어디 */
  part: CheckinPartKey;
  picture: SpotPicture;
  /** 그림 속 번짐 가운데(%, 오른쪽 몸 기준) */
  x: number;
  y: number;
};

export const SPOT_DEFS: readonly SpotDef[] = [
  { key: 'shoulder-front', chip: '앞쪽', label: '어깨 앞쪽', group: 'shoulder', part: 'shoulder', picture: 'front', x: 26, y: 27 },
  { key: 'shoulder-back', chip: '뒤쪽', label: '어깨 뒤쪽', group: 'shoulder', part: 'shoulder', picture: 'back', x: 74, y: 26 },
  { key: 'shoulder-top', chip: '위쪽', label: '어깨 위쪽', group: 'shoulder', part: 'shoulder', picture: 'front', x: 27, y: 17 },
  { key: 'scapula', chip: '날개뼈', label: '날개뼈', group: 'shoulder', part: 'shoulder', picture: 'back', x: 61, y: 33 },
  { key: 'elbow-inner', chip: '안쪽', label: '팔꿈치 안쪽', group: 'elbow', part: 'elbow', picture: 'arm-inner', x: 40, y: 42 },
  { key: 'elbow-outer', chip: '바깥쪽', label: '팔꿈치 바깥쪽', group: 'elbow', part: 'elbow', picture: 'arm-outer', x: 36, y: 44 },
  { key: 'elbow-back', chip: '뒤쪽', label: '팔꿈치 뒤쪽', group: 'elbow', part: 'elbow', picture: 'arm-back', x: 75, y: 9 },
  { key: 'elbow-front', chip: '앞쪽', label: '팔꿈치 앞쪽', group: 'elbow', part: 'elbow', picture: 'front', x: 17, y: 47 },
  { key: 'forearm', chip: '아래팔', label: '아래팔', group: 'elbow', part: 'wrist', picture: 'arm-inner', x: 58, y: 44 },
  { key: 'wrist', chip: '손목·손', label: '손목·손', group: 'elbow', part: 'wrist', picture: 'arm-outer', x: 80, y: 46 },
  { key: 'low-back', chip: '허리', label: '허리', group: 'trunk', part: 'lowerBack', picture: 'back', x: 50, y: 64 },
  { key: 'flank', chip: '옆구리', label: '옆구리', group: 'trunk', part: 'lowerBack', picture: 'front', x: 31, y: 56 },
  { key: 'abs', chip: '배', label: '배', group: 'trunk', part: 'lowerBack', picture: 'front', x: 50, y: 52 },
  { key: 'glute', chip: '엉덩이', label: '엉덩이', group: 'lower', part: 'lowerBody', picture: 'legs-back', x: 58, y: 13 },
  { key: 'hip-front', chip: '고관절', label: '고관절', group: 'lower', part: 'lowerBody', picture: 'legs-front', x: 37, y: 15 },
  { key: 'thigh-front', chip: '허벅지 앞', label: '허벅지 앞', group: 'lower', part: 'lowerBody', picture: 'legs-front', x: 37, y: 32 },
  { key: 'thigh-back', chip: '허벅지 뒤', label: '허벅지 뒤', group: 'lower', part: 'lowerBody', picture: 'legs-back', x: 61, y: 33 },
  { key: 'knee', chip: '무릎', label: '무릎', group: 'lower', part: 'lowerBody', picture: 'legs-front', x: 36, y: 45 },
  { key: 'calf', chip: '종아리', label: '종아리', group: 'lower', part: 'lowerBody', picture: 'legs-back', x: 61, y: 58 },
  { key: 'ankle', chip: '발목·발', label: '발목·발', group: 'lower', part: 'lowerBody', picture: 'legs-back', x: 64, y: 80 },
];

const DEF_BY_KEY = new Map(SPOT_DEFS.map((d) => [d.key, d]));

export const pictureSrc = (p: SpotPicture) => `/checkin-body/${p}.jpg`;

export type BodySpots = Record<string, SpotLevel>;

export function spotId(side: SpotSide, key: string) {
  return `${side}:${key}`;
}

export function spotOf(id: string): { side: SpotSide; def: SpotDef } | null {
  const [side, key] = id.split(':');
  const def = DEF_BY_KEY.get(key ?? '');
  if (!def) return null;
  if (side !== 'R' && side !== 'L') return null;
  return { side: side as SpotSide, def };
}

/** '오른쪽 팔꿈치 안쪽' */
export function spotLabel(id: string) {
  const s = spotOf(id);
  if (!s) return id;
  return `${s.side === 'R' ? '오른쪽' : '왼쪽'} ${s.def.label}`;
}

/**
 * 예전 3D 근육(2026-10-12 ~ 11-06) → 자리. 위에서부터 처음 맞는 것. 다리의 긴 폄근 · 굽힘근(extensor_digitorum_longus 등)이
 * 아래팔 규칙에 걸리지 않게 발목 줄을 먼저 둔다. 모르는 이름은 null(버린다).
 */
const LEGACY: readonly [RegExp, string][] = [
  [/^(tibialis|fibularis|extensor_digitorum_longus|extensor_hallucis|flexor_digitorum_longus|flexor_hallucis)/, 'ankle'],
  [/^(deltoid_anterior|pectoralis|coracobrachialis|subscapularis|serratus_anterior)/, 'shoulder-front'],
  [/^(deltoid_posterior|infraspinatus|teres_)/, 'shoulder-back'],
  [/^(deltoid_lateral|supraspinatus|trapezius_upper|levator_scapulae|sternocleidomastoid|scalenus|splenius)/, 'shoulder-top'],
  [/^serratus_posterior_inferior/, 'low-back'],
  [/^(trapezius|rhomboid|latissimus|serratus_posterior)/, 'scapula'],
  [/^(biceps_brachii|brachialis)/, 'elbow-front'],
  [/^(triceps|anconeus)/, 'elbow-back'],
  [/pronator_teres/, 'elbow-inner'],
  [/^brachioradialis/, 'elbow-outer'],
  [/(carpi|digitorum|pollicis|indicis|digiti|supinator|pronator_quadratus|palmaris)/, 'forearm'],
  [/^(rectus_abdominis|transversus)/, 'abs'],
  [/oblique/, 'flank'],
  [/^(iliocostalis|longissimus|spinalis|multifidus|quadratus_lumborum)/, 'low-back'],
  [/^(gluteus|piriformis|gemellus|obturator|quadratus_femoris)/, 'glute'],
  [/^(iliacus|psoas|tensor_fasciae|pectineus|adductor|gracilis|sartorius)/, 'hip-front'],
  [/^(rectus_femoris|vastus)/, 'thigh-front'],
  [/^(biceps_femoris|semitendinosus|semimembranosus)/, 'thigh-back'],
  [/^popliteus/, 'knee'],
  [/^(gastrocnemius|soleus|plantaris)/, 'calf'],
];
export function legacySpotKey(muscle: string): string | null {
  return LEGACY.find(([re]) => re.test(muscle))?.[1] ?? null;
}

const RANK = { 정상: 0, 뻐근: 1, 통증: 2 } as const;

/** 모르는 자리 · 값은 버린다(DB 의 옛 값 · 폼에서 온 값 둘 다). 옛 근육 값은 자리로 옮기고, 한 자리에 둘이 오면 센 쪽 */
export function cleanBodySpots(raw: unknown): BodySpots {
  const out: BodySpots = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  for (const [id, level] of Object.entries(raw as Record<string, unknown>)) {
    if (!(SPOT_LEVELS as readonly unknown[]).includes(level)) continue;
    const [side, key = ''] = id.split(':');
    if (side !== 'R' && side !== 'L') continue;
    const area = DEF_BY_KEY.has(key) ? key : legacySpotKey(key);
    if (!area) continue;
    const to = spotId(side, area);
    const lv = level as SpotLevel;
    if (!out[to] || RANK[lv] > RANK[out[to]]) out[to] = lv;
  }
  return out;
}

/** 폼의 숨은 칸(JSON) → 고른 자리. 깨진 값은 빈 것으로 */
export function parseBodySpots(text: string): BodySpots {
  try {
    return cleanBodySpots(JSON.parse(text));
  } catch {
    return {};
  }
}

/** 자리 → 다섯 부위 칸. 고른 것이 없는 부위는 '정상' */
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

/**
 * 팔 통증 자리(DailyCheckin.armPainSpots) — 어깨 · 팔꿈치 자리 가운데 '통증'으로 고른 것. 좌우는 묻지 않던 칸이라 뗀다.
 * 그 관절이 '통증'일 때만 서버가 받으니(parseArmPain) 늘 하나 이상 나온다.
 */
export function armSpotsFromSpots(spots: BodySpots): string[] {
  const out = new Set<string>();
  for (const [id, level] of Object.entries(spots)) {
    const s = spotOf(id);
    if (level === '통증' && s && (s.def.part === 'shoulder' || s.def.part === 'elbow')) out.add(s.def.key);
  }
  return SPOT_DEFS.filter((d) => out.has(d.key)).map((d) => d.key);
}
