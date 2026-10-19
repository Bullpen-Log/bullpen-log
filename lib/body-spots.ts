/**
 * 체크인의 '불편한 곳' — 몸 그림에서 고르는 근육(2026-10-12 사용자: "불편한 곳 있어요를 누르면 부위 목록 대신
 * 신체 그래픽으로, 불편한 근육을 고르고 어느 정도 불편한지 고르게").
 *
 * 고른 것은 DailyCheckin.bodySpots 에 { "R:deltFront": "뻐근" } 꼴로 남고, 예전 다섯 부위 칸(shoulder …)은 그 부위에
 * 속한 근육 중 가장 센 값으로 채운다(partsFromSpots). 운동 추천 · 통증 관문 · 암케어는 지금처럼 부위 칸만 읽는다 —
 * 그래서 근육마다 무엇을 빼는지는 아직 없다(부위 단위 그대로).
 *
 * 근육은 3D 전신 모델(public/models/body-full.glb)의 조각 그대로다 — id 는 '좌우:조각 이름'(R:deltoid_anterior).
 * 여기 key 를 바꾸면 저장된 옛 값이 버려진다.
 */
import type { CheckinPartKey } from '@/lib/checkin';

export const SPOT_LEVELS = ['뻐근', '통증'] as const;
export type SpotLevel = (typeof SPOT_LEVELS)[number];

/** R 오른쪽 · L 왼쪽 */
export type SpotSide = 'R' | 'L';

export type SpotDef = {
  /** 3D 모델 조각 이름(public/models/body-full.glb 의 extras.key) */
  key: string;
  label: string;
  part: CheckinPartKey;
}

/*
 * 모델의 근육 109개 — 모두 좌우 한 쌍. 부위는 투구에서 아픈 자리로 가른다: 목 · 등 위 근육은 어깨, 원회내근 · 완요골근은
 * 팔꿈치(안쪽 팔꿈치 통증 자리), 나머지 아래팔은 손목 · 전완, 배 · 척추 근육은 허리.
 */
const MUSCLES: [string, string, CheckinPartKey][] = [
  ['deltoid_anterior', '삼각근 앞', 'shoulder'],
  ['deltoid_lateral', '삼각근 옆', 'shoulder'],
  ['deltoid_posterior', '삼각근 뒤', 'shoulder'],
  ['supraspinatus', '극상근', 'shoulder'],
  ['infraspinatus', '극하근', 'shoulder'],
  ['subscapularis', '견갑하근', 'shoulder'],
  ['teres_minor', '소원근', 'shoulder'],
  ['teres_major', '대원근', 'shoulder'],
  ['pectoralis_major_clavicular', '대흉근 위', 'shoulder'],
  ['pectoralis_major_sternocostal', '대흉근 가운데', 'shoulder'],
  ['pectoralis_major_abdominal', '대흉근 아래', 'shoulder'],
  ['pectoralis_minor', '소흉근', 'shoulder'],
  ['serratus_anterior', '전거근', 'shoulder'],
  ['trapezius_upper', '승모근 위', 'shoulder'],
  ['trapezius_middle', '승모근 가운데', 'shoulder'],
  ['trapezius_lower', '승모근 아래', 'shoulder'],
  ['latissimus_dorsi', '광배근', 'shoulder'],
  ['rhomboid_major', '대능형근', 'shoulder'],
  ['rhomboid_minor', '소능형근', 'shoulder'],
  ['levator_scapulae', '견갑거근', 'shoulder'],
  ['serratus_posterior_superior', '상후거근', 'shoulder'],
  ['sternocleidomastoid', '흉쇄유돌근(목 앞)', 'shoulder'],
  ['scalenus_anterior', '전사각근(목)', 'shoulder'],
  ['scalenus_medius', '중사각근(목)', 'shoulder'],
  ['scalenus_posterior', '후사각근(목)', 'shoulder'],
  ['splenius_capitis', '두판상근(목 뒤)', 'shoulder'],
  ['splenius_colli', '경판상근(목 뒤)', 'shoulder'],
  ['coracobrachialis', '오훼완근', 'shoulder'],
  ['biceps_brachii_long', '이두근 긴갈래', 'elbow'],
  ['biceps_brachii_short', '이두근 짧은갈래', 'elbow'],
  ['brachialis', '상완근', 'elbow'],
  ['triceps_long', '삼두근 긴갈래', 'elbow'],
  ['triceps_lateral', '삼두근 바깥갈래', 'elbow'],
  ['triceps_medial', '삼두근 안쪽갈래', 'elbow'],
  ['anconeus_muscle', '주근(팔꿈치 뒤)', 'elbow'],
  ['brachioradialis_muscle', '완요골근', 'elbow'],
  ['superficial_head_of_pronator_teres', '원회내근(팔꿈치 안쪽)', 'elbow'],
  ['deep_head_of_pronator_teres', '원회내근 깊은갈래', 'elbow'],
  ['flexor_carpi_radialis', '요측수근굴근', 'wrist'],
  ['palmaris_longus_muscle', '장장근', 'wrist'],
  ['humeral_head_of_flexor_carpi_ulnaris', '척측수근굴근', 'wrist'],
  ['ulnar_head_of_flexor_carpi_ulnaris', '척측수근굴근 척골갈래', 'wrist'],
  ['humero_ulnar_head_of_flexor_digitorum_superficialis', '천지굴근', 'wrist'],
  ['radial_head_of_flexor_digitorum_superficialis', '천지굴근 요골갈래', 'wrist'],
  ['flexor_digitorum_profundus', '심지굴근', 'wrist'],
  ['flexor_pollicis_longus', '장무지굴근', 'wrist'],
  ['pronator_quadratus', '방형회내근', 'wrist'],
  ['supinator', '회외근', 'wrist'],
  ['extensor_digitorum', '지신근', 'wrist'],
  ['ulnar_head_of_extensor_carpi_ulnaris', '척측수근신근', 'wrist'],
  ['humeral_head_of_extensor_carpi_ulnaris', '척측수근신근 위갈래', 'wrist'],
  ['extensor_carpi_radialis_longus', '장요측수근신근', 'wrist'],
  ['extensor_carpi_radialis_brevis', '단요측수근신근', 'wrist'],
  ['extensor_digiti_minimi', '소지신근', 'wrist'],
  ['abductor_pollicis_longus', '장무지외전근', 'wrist'],
  ['extensor_indicis', '시지신근', 'wrist'],
  ['extensor_pollicis_brevis', '단무지신근', 'wrist'],
  ['extensor_pollicis_longus', '장무지신근', 'wrist'],
  ['iliocostalis_lumborum', '장늑근(허리)', 'lowerBack'],
  ['iliocostalis_thoracis', '장늑근(등)', 'lowerBack'],
  ['longissimus_thoracis', '최장근', 'lowerBack'],
  ['spinalis_thoracis', '극근', 'lowerBack'],
  ['multifidus_lumborum', '다열근', 'lowerBack'],
  ['quadratus_lumborum', '요방형근', 'lowerBack'],
  ['serratus_posterior_inferior', '하후거근', 'lowerBack'],
  ['rectus_abdominis', '복직근', 'lowerBack'],
  ['external_oblique', '외복사근', 'lowerBack'],
  ['internal_oblique', '내복사근', 'lowerBack'],
  ['transversus_abdominis', '복횡근', 'lowerBack'],
  ['gluteus_maximus', '대둔근', 'lowerBody'],
  ['gluteus_medius', '중둔근', 'lowerBody'],
  ['gluteus_minimus', '소둔근', 'lowerBody'],
  ['iliacus', '장골근', 'lowerBody'],
  ['psoas_major', '대요근', 'lowerBody'],
  ['tensor_fasciae_latae', '대퇴근막장근', 'lowerBody'],
  ['piriformis', '이상근', 'lowerBody'],
  ['quadratus_femoris', '대퇴방형근', 'lowerBody'],
  ['obturator_internus', '내폐쇄근', 'lowerBody'],
  ['obturator_externus', '외폐쇄근', 'lowerBody'],
  ['gemellus_superior', '상쌍자근', 'lowerBody'],
  ['gemellus_inferior', '하쌍자근', 'lowerBody'],
  ['rectus_femoris', '대퇴직근', 'lowerBody'],
  ['vastus_lateralis', '외측광근', 'lowerBody'],
  ['vastus_medialis', '내측광근', 'lowerBody'],
  ['vastus_intermedius', '중간광근', 'lowerBody'],
  ['sartorius', '봉공근', 'lowerBody'],
  ['biceps_femoris_long', '대퇴이두근 긴갈래', 'lowerBody'],
  ['biceps_femoris_short', '대퇴이두근 짧은갈래', 'lowerBody'],
  ['semitendinosus', '반건양근', 'lowerBody'],
  ['semimembranosus', '반막양근', 'lowerBody'],
  ['adductor_magnus', '대내전근', 'lowerBody'],
  ['adductor_longus', '장내전근', 'lowerBody'],
  ['adductor_brevis', '단내전근', 'lowerBody'],
  ['gracilis', '박근', 'lowerBody'],
  ['pectineus', '치골근', 'lowerBody'],
  ['gastrocnemius_medial', '비복근 안쪽', 'lowerBody'],
  ['gastrocnemius_lateral', '비복근 바깥', 'lowerBody'],
  ['soleus', '가자미근', 'lowerBody'],
  ['plantaris', '족척근', 'lowerBody'],
  ['popliteus', '슬와근', 'lowerBody'],
  ['tibialis_anterior', '전경골근', 'lowerBody'],
  ['tibialis_posterior', '후경골근', 'lowerBody'],
  ['fibularis_longus', '장비골근', 'lowerBody'],
  ['fibularis_brevis', '단비골근', 'lowerBody'],
  ['fibularis_tertius', '제3비골근', 'lowerBody'],
  ['extensor_digitorum_longus', '장지신근', 'lowerBody'],
  ['extensor_hallucis_longus', '장무지신근(발)', 'lowerBody'],
  ['flexor_digitorum_longus', '장지굴근', 'lowerBody'],
  ['flexor_hallucis_longus', '장무지굴근(발)', 'lowerBody'],
];

export const SPOT_DEFS: readonly SpotDef[] = MUSCLES.map(([key, label, part]) => ({
  key,
  label,
  part,
}));

const DEF_BY_KEY = new Map(SPOT_DEFS.map((d) => [d.key, d]));

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

/** '오른쪽 어깨 앞' */
export function spotLabel(id: string) {
  const s = spotOf(id);
  if (!s) return id;
  return `${s.side === 'R' ? '오른쪽' : '왼쪽'} ${s.def.label}`;
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

/**
 * 키워드로 좁히기 — 체크인 '어디가 불편해요?'에서 먼저 고르는 자리(2026-10-20 김민: "3D 가 너무 넓어 아픈 곳을 고르기 힘들다 — 키워드를
 * 주고 그 부위만 확대"). 고르면 3D 가 그 근육들로 다가가고 나머지는 흐리게 · 못 누르게. view 는 그 자리가 잘 보이는 쪽.
 */
export type SpotRegion = { key: string; label: string; view: 'front' | 'back'; keys: readonly string[] };
export const SPOT_REGIONS: readonly SpotRegion[] = [
  { key: 'neck', label: '목', view: 'front', keys: ['sternocleidomastoid', 'scalenus_anterior', 'scalenus_medius', 'scalenus_posterior', 'splenius_capitis', 'splenius_colli', 'levator_scapulae', 'trapezius_upper'] },
  { key: 'shoulder', label: '어깨', view: 'front', keys: ['deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior', 'supraspinatus', 'infraspinatus', 'subscapularis', 'teres_minor', 'teres_major', 'coracobrachialis'] },
  { key: 'chest', label: '가슴', view: 'front', keys: ['pectoralis_major_clavicular', 'pectoralis_major_sternocostal', 'pectoralis_major_abdominal', 'pectoralis_minor', 'serratus_anterior'] },
  { key: 'upperBack', label: '등 · 날개뼈', view: 'back', keys: ['trapezius_middle', 'trapezius_lower', 'rhomboid_major', 'rhomboid_minor', 'latissimus_dorsi', 'serratus_posterior_superior', 'infraspinatus', 'teres_minor', 'teres_major'] },
  { key: 'upperArm', label: '위팔', view: 'front', keys: ['biceps_brachii_long', 'biceps_brachii_short', 'brachialis', 'triceps_long', 'triceps_lateral', 'triceps_medial'] },
  { key: 'elbow', label: '팔꿈치', view: 'front', keys: ['anconeus_muscle', 'brachioradialis_muscle', 'superficial_head_of_pronator_teres', 'deep_head_of_pronator_teres', 'brachialis', 'triceps_medial'] },
  { key: 'forearm', label: '아래팔 · 손목', view: 'front', keys: keysOfPart('wrist') },
  { key: 'lowerBack', label: '허리 · 배', view: 'back', keys: keysOfPart('lowerBack') },
  { key: 'hip', label: '엉덩이 · 고관절', view: 'back', keys: ['gluteus_maximus', 'gluteus_medius', 'gluteus_minimus', 'iliacus', 'psoas_major', 'tensor_fasciae_latae', 'piriformis', 'quadratus_femoris', 'obturator_internus', 'obturator_externus', 'gemellus_superior', 'gemellus_inferior'] },
  { key: 'thigh', label: '허벅지', view: 'front', keys: ['rectus_femoris', 'vastus_lateralis', 'vastus_medialis', 'vastus_intermedius', 'sartorius', 'biceps_femoris_long', 'biceps_femoris_short', 'semitendinosus', 'semimembranosus', 'adductor_magnus', 'adductor_longus', 'adductor_brevis', 'gracilis', 'pectineus'] },
  { key: 'lowerLeg', label: '종아리 · 발목', view: 'back', keys: ['gastrocnemius_medial', 'gastrocnemius_lateral', 'soleus', 'plantaris', 'popliteus', 'tibialis_anterior', 'tibialis_posterior', 'fibularis_longus', 'fibularis_brevis', 'fibularis_tertius', 'extensor_digitorum_longus', 'extensor_hallucis_longus', 'flexor_digitorum_longus', 'flexor_hallucis_longus'] },
];
function keysOfPart(part: CheckinPartKey): string[] {
  return MUSCLES.filter((m) => m[2] === part).map((m) => m[0]);
}
