import type { BodyPart } from '@/lib/exercise-meta';

/**
 * 운동의 부위 태그(ExerciseVideo.bodyParts) → 전신 3D 모델에서 켤 근육.
 *
 * 2026-09-26 사용자분: 암케어 운동은 근육 칩을 누르면 3D 그림이 뜨는데, 다른 운동 영상에도
 * 그렇게 해 달라. 다른 운동에는 근육 이름이 없고 부위 태그만 있어서, 태그를 누르면 그
 * 부위의 근육을 전신 모델(public/models/body-full.glb)에서 켠다(components/body-parts.tsx).
 *
 * keys 는 모델 조각의 이름(glTF extras.key)이다 — 좌우를 가리지 않고 양쪽을 다 켠다. 모델에
 * 없는 이름을 적으면 그 칸만 안 켜진다(자체 시험이 모델과 맞춰 본다).
 *
 * 태그가 거칠다는 한계가 있다 — 예를 들어 '대퇴사두(허벅지 앞)' 태그가 없어서, 스쿼트처럼
 * 고관절·햄스트링·둔근으로 적힌 운동은 허벅지 앞에서 대퇴직근(고관절을 지나는 한 갈래라
 * '고관절'에 든다)만 켜지고 나머지 광근 셋은 안 켜진다. 운동마다 근육을 정확히 적는 일은
 * 따로 하기로 했다(같은 날, 암케어의 targetMuscles 처럼).
 *
 * 글(about)은 일반 해부학·투구 지식으로 새로 썼다. 부상을 막는다고 약속하지 않는다.
 */
export type BodyPartMap = {
  /** 켤 근육(모델 key) */
  keys: readonly string[];
  /** 처음 볼 쪽 */
  view: 'front' | 'back' | 'side';
  /** 무슨 근육들인지 — 창 제목 밑 한 줄 */
  muscles: string;
  /** 무엇을 하는 곳인지, 투수에게 왜 — 한두 문장 */
  about: string;
};

const FOREARM = [
  'abductor_pollicis_longus',
  'anconeus_muscle',
  'brachioradialis_muscle',
  'deep_head_of_pronator_teres',
  'superficial_head_of_pronator_teres',
  'extensor_carpi_radialis_brevis',
  'extensor_carpi_radialis_longus',
  'extensor_digiti_minimi',
  'extensor_digitorum',
  'extensor_indicis',
  'extensor_pollicis_brevis',
  'extensor_pollicis_longus',
  'flexor_carpi_radialis',
  'flexor_digitorum_profundus',
  'flexor_pollicis_longus',
  'humeral_head_of_extensor_carpi_ulnaris',
  'ulnar_head_of_extensor_carpi_ulnaris',
  'humeral_head_of_flexor_carpi_ulnaris',
  'ulnar_head_of_flexor_carpi_ulnaris',
  'humero_ulnar_head_of_flexor_digitorum_superficialis',
  'radial_head_of_flexor_digitorum_superficialis',
  'palmaris_longus_muscle',
  'pronator_quadratus',
  'supinator',
] as const;

const DELTOID = ['deltoid_anterior', 'deltoid_lateral', 'deltoid_posterior'] as const;
const CUFF = [
  'supraspinatus',
  'infraspinatus',
  'teres_minor',
  'subscapularis',
] as const;
const TRAPS = ['trapezius_upper', 'trapezius_middle', 'trapezius_lower'] as const;
const RHOMBOIDS = ['rhomboid_major', 'rhomboid_minor'] as const;
const PECS = [
  'pectoralis_major_clavicular',
  'pectoralis_major_sternocostal',
  'pectoralis_major_abdominal',
] as const;
const ERECTORS = [
  'iliocostalis_lumborum',
  'iliocostalis_thoracis',
  'longissimus_thoracis',
  'spinalis_thoracis',
] as const;
const ABS = [
  'rectus_abdominis',
  'external_oblique',
  'internal_oblique',
  'transversus_abdominis',
] as const;
const QUADS = [
  'rectus_femoris',
  'vastus_lateralis',
  'vastus_medialis',
  'vastus_intermedius',
] as const;
const HAMSTRINGS = [
  'biceps_femoris_long',
  'biceps_femoris_short',
  'semitendinosus',
  'semimembranosus',
] as const;
const TRICEPS = ['triceps_long', 'triceps_lateral', 'triceps_medial'] as const;

export const BODY_PART_MAP: Record<BodyPart, BodyPartMap> = {
  어깨: {
    keys: [...DELTOID, ...CUFF],
    view: 'side',
    muscles: '삼각근(앞·옆·뒤) · 회전근개',
    about:
      '팔을 들고 돌리는 관절입니다. 겉의 삼각근이 큰 힘을 내고, 속의 회전근개가 위팔뼈를 관절에 붙잡습니다. 투수에게는 공을 뿌리고 멈추는 순간 부담이 가장 큰 곳입니다.',
  },
  견갑: {
    keys: [
      ...TRAPS,
      ...RHOMBOIDS,
      'serratus_anterior',
      'levator_scapulae',
      'pectoralis_minor',
    ],
    view: 'back',
    muscles: '승모근 · 능형근 · 전거근 · 견갑거근',
    about:
      '날개뼈를 움직이고 붙잡는 근육들입니다. 어깨가 올라앉는 받침이라, 날개뼈가 팔을 잘 따라가야 팔을 높이 들고 던질 때 어깨가 끼지 않습니다.',
  },
  가슴: {
    keys: [...PECS, 'pectoralis_minor'],
    view: 'front',
    muscles: '대흉근 · 소흉근',
    about:
      '팔을 앞으로 모으고 안으로 돌리는 큰 근육입니다. 공을 뿌리는 순간 팔을 앞으로 끌어당기는 힘을 보탭니다.',
  },
  등: {
    keys: [
      'latissimus_dorsi',
      'teres_major',
      ...TRAPS,
      ...RHOMBOIDS,
      ...ERECTORS,
      'multifidus_lumborum',
    ],
    view: 'back',
    muscles: '광배근 · 대원근 · 승모근 · 능형근 · 척추기립근',
    about:
      '팔을 당기고 몸통을 곧게 세우는 근육들입니다. 광배근은 몸통의 힘을 팔로 잇고, 공을 놓은 뒤 팔을 멈추는 일도 거듭니다.',
  },
  이두: {
    keys: ['biceps_brachii_long', 'biceps_brachii_short', 'brachialis'],
    view: 'front',
    muscles: '이두근 · 상완근',
    about:
      '팔꿈치를 굽히는 근육입니다. 공을 놓은 뒤 빠르게 펴지는 팔꿈치를 붙잡아 속도를 줄입니다.',
  },
  삼두: {
    keys: [...TRICEPS, 'anconeus_muscle'],
    view: 'back',
    muscles: '삼두근 · 주근',
    about: '팔꿈치를 펴는 근육입니다. 공을 뿌릴 때 팔꿈치를 펴 마지막 힘을 보탭니다.',
  },
  팔꿈치: {
    keys: [
      'brachialis',
      'brachioradialis_muscle',
      'superficial_head_of_pronator_teres',
      'deep_head_of_pronator_teres',
      'anconeus_muscle',
      'supinator',
      'flexor_carpi_radialis',
      'humeral_head_of_flexor_carpi_ulnaris',
      'ulnar_head_of_flexor_carpi_ulnaris',
      'humero_ulnar_head_of_flexor_digitorum_superficialis',
      'radial_head_of_flexor_digitorum_superficialis',
      'extensor_carpi_radialis_longus',
      'extensor_carpi_radialis_brevis',
      'humeral_head_of_extensor_carpi_ulnaris',
      'ulnar_head_of_extensor_carpi_ulnaris',
    ],
    view: 'front',
    muscles: '상완근 · 완요골근 · 원회내근 · 손목을 굽히고 펴는 근육',
    about:
      '팔꿈치를 지나며 팔꿈치를 굽히고 펴고 아래팔을 돌리는 근육들입니다. 던질 때 팔꿈치 안쪽이 벌어지는 힘을 인대와 함께 나눠 받습니다.',
  },
  '손목·전완': {
    keys: FOREARM,
    view: 'front',
    muscles: '손목·손가락을 굽히고 펴는 근육 · 원회내근 · 회외근',
    about:
      '손목과 손가락을 움직이고 아래팔을 돌립니다. 공을 쥐고 채는 힘이자, 팔꿈치 안쪽을 받쳐 주는 근육입니다.',
  },
  코어: {
    keys: [...ABS, 'quadratus_lumborum', 'multifidus_lumborum'],
    view: 'front',
    muscles: '복직근 · 복사근 · 복횡근 · 요방형근',
    about:
      '몸통을 버티고 비트는 근육입니다. 하체에서 만든 힘을 흘리지 않고 팔까지 넘기는 통로입니다.',
  },
  고관절: {
    keys: [
      'iliacus',
      'psoas_major',
      'gluteus_medius',
      'gluteus_minimus',
      'tensor_fasciae_latae',
      'piriformis',
      'gemellus_superior',
      'gemellus_inferior',
      'obturator_internus',
      'obturator_externus',
      'quadratus_femoris',
      'adductor_longus',
      'adductor_brevis',
      'adductor_magnus',
      'pectineus',
      'gracilis',
      'sartorius',
      'rectus_femoris',
    ],
    view: 'front',
    muscles: '엉덩허리근 · 중·소둔근 · 내전근 · 고관절 회전근',
    about:
      '다리를 들고, 벌리고, 모으고, 돌리는 근육들입니다. 뒷다리로 버티다 앞다리로 디디며 골반이 돌아가는 투구의 회전을 이 근육들이 만들고 받아 냅니다.',
  },
  '햄스트링·둔근': {
    keys: ['gluteus_maximus', 'gluteus_medius', ...HAMSTRINGS],
    view: 'back',
    muscles: '대둔근 · 중둔근 · 햄스트링',
    about:
      '엉덩이와 허벅지 뒤 — 몸을 앞으로 밀어내고, 앞다리로 디딜 때 몸을 받아 세우는 힘입니다.',
  },
  '종아리·발목': {
    keys: [
      'gastrocnemius_medial',
      'gastrocnemius_lateral',
      'soleus',
      'plantaris',
      'tibialis_anterior',
      'tibialis_posterior',
      'fibularis_longus',
      'fibularis_brevis',
      'fibularis_tertius',
      'flexor_digitorum_longus',
      'flexor_hallucis_longus',
      'extensor_digitorum_longus',
      'extensor_hallucis_longus',
      'popliteus',
    ],
    view: 'back',
    muscles: '비복근 · 가자미근 · 전경골근 · 비골근',
    about:
      '발목을 버티고 밀어내는 근육입니다. 앞발로 착지해 버티는 순간 발목이 크게 일합니다.',
  },
  전신: {
    keys: [
      'gluteus_maximus',
      'gluteus_medius',
      ...QUADS,
      ...HAMSTRINGS,
      'gastrocnemius_medial',
      'gastrocnemius_lateral',
      'soleus',
      ...ABS,
      ...ERECTORS,
      'latissimus_dorsi',
      ...TRAPS,
      ...PECS,
      ...DELTOID,
      ...TRICEPS,
    ],
    view: 'front',
    muscles: '하체 · 몸통 · 상체를 함께',
    about:
      '하체에서 만든 힘을 몸통을 거쳐 팔까지 잇는 운동입니다 — 투구와 같은 흐름입니다.',
  },
};
