/**
 * 3D 근육 지도 — 우리 근육 이름과 3D 모델 속 근육 조각을 잇는 표.
 *
 * 모델은 public/models/armcare-upper.glb (scripts/build-arm-model.mjs 가 만든다). 모델의
 * 근육 조각마다 영어 key 와 좌우(side)가 붙어 있고, 우리 근육 하나는 조각 여러 개로
 * 되어 있기도 하다 — 손목 굴곡근은 요측 수근굴근 · 척측 수근굴근(두 갈래) · 장장근이다.
 *
 * parts 는 조각 key → 화면에 적는 이름. 한 근육 안에서 같은 이름이 둘이면(척측 수근굴근의
 * 두 갈래) 화면은 한 번만 적는다. 근육마다 조각이 하나 이상 있어야 한다 — 자체 시험이
 * 모델 파일과 맞춰 본다(scripts/training-selftest.mts).
 */
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';

export const MUSCLE_MODEL: Record<string, { parts: Record<string, string> }> = {
  극하근: { parts: { infraspinatus: '극하근' } },
  소원근: { parts: { teres_minor: '소원근' } },
  '후면 삼각근': { parts: { deltoid_posterior: '후면 삼각근' } },
  광배근: { parts: { latissimus_dorsi: '광배근' } },
  대원근: { parts: { teres_major: '대원근' } },
  견갑하근: { parts: { subscapularis: '견갑하근' } },
  극상근: { parts: { supraspinatus: '극상근' } },
  '중간 삼각근': { parts: { deltoid_lateral: '중간 삼각근' } },
  전거근: { parts: { serratus_anterior: '전거근' } },
  '중부 승모근': { parts: { trapezius_middle: '중부 승모근' } },
  '하부 승모근': { parts: { trapezius_lower: '하부 승모근' } },
  능형근: { parts: { rhomboid_major: '대능형근', rhomboid_minor: '소능형근' } },
  '손목 굴곡근': {
    parts: {
      flexor_carpi_radialis: '요측 수근굴근',
      humeral_head_of_flexor_carpi_ulnaris: '척측 수근굴근',
      ulnar_head_of_flexor_carpi_ulnaris: '척측 수근굴근',
      palmaris_longus_muscle: '장장근',
    },
  },
  '얕은 손가락 굴곡근': {
    parts: {
      humero_ulnar_head_of_flexor_digitorum_superficialis: '위팔자쪽 갈래',
      radial_head_of_flexor_digitorum_superficialis: '노쪽 갈래',
    },
  },
  '깊은 손가락 굴곡근': { parts: { flexor_digitorum_profundus: '깊은 손가락 굴곡근' } },
  원회내근: {
    parts: {
      superficial_head_of_pronator_teres: '얕은 갈래',
      deep_head_of_pronator_teres: '깊은 갈래',
    },
  },
  '손목 신전근': {
    parts: {
      extensor_carpi_radialis_longus: '장요측 수근신근',
      extensor_carpi_radialis_brevis: '단요측 수근신근',
      humeral_head_of_extensor_carpi_ulnaris: '척측 수근신근',
      ulnar_head_of_extensor_carpi_ulnaris: '척측 수근신근',
    },
  },
  회외근: { parts: { supinator: '회외근' } },
  완요골근: { parts: { brachioradialis_muscle: '완요골근' } },
  삼두근: {
    parts: {
      triceps_long: '긴갈래',
      triceps_lateral: '가쪽갈래',
      triceps_medial: '안쪽갈래',
    },
  },
  주근: { parts: { anconeus_muscle: '주근' } },
  이두근: {
    parts: { biceps_brachii_long: '긴갈래', biceps_brachii_short: '짧은갈래' },
  },
  상완근: { parts: { brachialis: '상완근' } },
};

/** 모델 조각 key → 우리 근육 이름 */
export const MODEL_KEY_TO_MUSCLE: ReadonlyMap<string, string> = new Map(
  Object.entries(MUSCLE_MODEL).flatMap(([name, m]) =>
    Object.keys(m.parts).map((key) => [key, name] as const)
  )
);

/**
 * 부위를 고르면 카메라가 가는 쪽 — 그 부위가 가장 잘 보이는 방향.
 *
 *   front 앞 · back 뒤 · side 던지는 팔 바깥 옆 · outer 팔 바깥 뒤쪽 · top 위에서
 */
export type MapView = 'front' | 'back' | 'side' | 'outer' | 'top';

export const AREA_VIEW: Record<ArmcareAreaKey, MapView> = {
  'shoulder-back': 'back',
  'shoulder-front': 'front',
  'shoulder-top': 'top',
  scapula: 'back',
  'elbow-inner': 'front',
  'elbow-outer': 'outer',
  'elbow-back': 'back',
  'elbow-front': 'front',
};

/** 던지는 팔 — 계정의 던지는 손('우투' · '좌투' · '양투')에서. 모르면 오른팔 */
export function throwingSide(hand: string | null | undefined): 'right' | 'left' {
  return hand === '좌투' ? 'left' : 'right';
}
