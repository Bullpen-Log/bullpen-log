/** 트레이닝 하위 카테고리 — 이 순서대로 페이지에 노출된다. */
export const TRAINING_CATEGORIES = [
  {
    name: '하체 스트렝스',
    desc: '스쿼트·힌지·런지로 투구 추진력의 바탕을 만드는 운동',
  },
  {
    name: '상체 스트렝스',
    desc: '당기기와 밀기 근력 — 투수는 당기기를 두 배로',
  },
  {
    name: '모빌리티',
    desc: '어깨·고관절·흉추 가동 범위를 확보하는 운동',
  },
  {
    name: '파워',
    desc: '폭발적인 힘 전달을 위한 플라이오·스피드 훈련',
  },
  {
    name: '코어',
    desc: '상하체를 연결하고 회전력을 버티는 몸통 훈련',
  },
  {
    name: '암케어',
    desc: '던지는 팔을 지키는 어깨·팔꿈치·전완 관리 운동',
  },
  {
    name: '회복 및 보강',
    desc: '하체·고관절 보강과 폼롤링 등 회복·부상 예방 운동',
  },
] as const;

/** 투구 메커니즘 하위 카테고리 */
export const MECHANICS_CATEGORIES = [
  {
    name: '스로잉 드릴',
    desc: '실제 던지는 동작을 나눠 교정하는 드릴',
  },
  {
    name: '메디신볼 드릴',
    desc: '메디신볼로 회전과 체중 이동을 익히는 드릴',
  },
  {
    name: '무브먼트 패턴 드릴',
    desc: '투구 전반의 움직임 패턴을 다듬는 드릴',
  },
] as const;

export type TrainingCategory = (typeof TRAINING_CATEGORIES)[number]['name'];
export type MechanicsCategory = (typeof MECHANICS_CATEGORIES)[number]['name'];

export const TRAINING_CATEGORY_NAMES: readonly string[] = TRAINING_CATEGORIES.map(
  (c) => c.name
);
export const MECHANICS_CATEGORY_NAMES: readonly string[] = MECHANICS_CATEGORIES.map(
  (c) => c.name
);
