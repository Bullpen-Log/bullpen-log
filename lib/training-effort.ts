/**
 * 운동 체감 강도 기준표(1~10, 오늘 운동 전체) — 웹 마치기 창(components/intensity-guide.tsx) · 앱 마치기 창 · 오늘 운동 메모가 같이 쓴다.
 * 까닭(세트가 아니라 오늘 전체 · 5–6 이 부하 계산의 1.0배)은 intensity-guide.tsx 머리 주석.
 */
export const TRAINING_EFFORT_LEVELS = [
  { range: '1 – 2', max: 2, label: '아주 가벼움', detail: '몸을 푸는 정도로 끝났어요. 끝나고도 피로가 거의 없어요.' },
  { range: '3 – 4', max: 4, label: '가벼움', detail: '땀은 났지만 여유가 많았어요. 같은 운동을 한 번 더 해도 될 것 같아요.' },
  { range: '5 – 6', max: 6, label: '보통', detail: '평소대로 제대로 한 날이에요. 끝날 즈음 지쳤지만 무리는 아니었어요.' },
  { range: '7 – 8', max: 8, label: '힘듦', detail: '후반부는 버티면서 했어요. 끝나고 한동안 쉬어야 했어요.' },
  { range: '9 – 10', max: 10, label: '최대', detail: '오늘 쓸 수 있는 힘을 다 썼어요. 한 세트도 더 못 할 것 같아요.' },
] as const;

/** 고른 숫자의 단계 */
export const trainingEffortLevel = (n: number) => TRAINING_EFFORT_LEVELS.find((l) => n <= l.max) ?? null;

export const TRAINING_EFFORT_ASK = '강도를 어떻게 정하나요?';

/** 끝나자마자 물으면 마지막 운동으로 답하기 쉬워 붙이는 한 줄(경고가 아니라 안내) */
export const TRAINING_EFFORT_NOTE = {
  strong: '오늘 운동 전체를 합쳐서 떠올려 주세요.',
  rest: '마지막 운동이 아니라 처음부터 끝까지 합친 느낌이 기준이에요.',
};
