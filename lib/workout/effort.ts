/**
 * 운동 끝 힘듦 한 번 — 칩 네 개의 뜻과 '최근 힘듦 급증' 셈(트레이닝 추천 2판 P2, 2026-10-12).
 *
 * 왜 두는가. 체감 강도(DailyTrainingNote.intensity, 1~10)는 마치기 창에서 열 칸을 눌러야 남았고, 실제로는 마친 판 6개 중
 * 3줄뿐이었다(설계 문서 '되먹임(P2 근거)'). 마친 뒤 축하 화면에서 칩 하나(가벼움 · 보통 · 힘듦 · 아주 힘듦)만 누르면
 * 같은 1~10 눈금으로 남긴다 — 눈금을 바꾸지 않는 까닭은 부하 계산(lib/training-load.ts 의 intensityFactor)과 트레이닝 탭의
 * '강도 N/10' · 투구 강도가 모두 이 눈금을 읽기 때문이다.
 *
 * 칩 → 눈금은 3 · 5 · 7 · 9(2026-10-12 사용자 결정). 기준표(components/intensity-guide.tsx)의 띠 가운데 값이다 —
 * 가벼움 3~4 · 보통 5~6 · 힘듦 7~8 · 최대 9~10. 부하 배수로는 0.7 · 0.9 · 1.1 · 1.3(intensityFactor = 0.4 + n/10) —
 * '보통'이 1.0(= 6)이 아니라 0.9 인 것은 알고 둔 것이다(눈금 가운데를 고르는 쪽이 사람 말과 맞는다).
 *
 * 급증 깃발(trainingEffortOf): 최근 7일(오늘 포함)에 3개 이상 남겼고 그 평균이 28일 평균보다 2 이상 높으면 true
 * (검토안 '7일 중 3개'). 읽는 곳은 아직 없다 — P5 에서 '경고와 그래도 하기'. 여기서는 숫자만 둔다.
 *
 * 순수 파일 — server-only · prisma · 날짜 함수(appNow) 없음. lib/report/facts.ts 가 가져다 쓰고, 자체 시험 · 기준선 도구가
 * node 로 그대로 부른다.
 */

export type EffortKey = 'light' | 'normal' | 'hard' | 'max';

export type EffortLevel = {
  key: EffortKey;
  /** 칩에 쓰는 말 */
  label: string;
  /** 저장하는 1~10 눈금 */
  intensity: number;
  /** 고를 때 참고하는 한 줄(해요체 · 줄표 없음) */
  hint: string;
};

/** 칩 넷 — 가벼운 것부터 */
export const EFFORT_LEVELS: readonly EffortLevel[] = [
  { key: 'light', label: '가벼움', intensity: 3, hint: '땀은 났지만 여유가 많았어요' },
  { key: 'normal', label: '보통', intensity: 5, hint: '평소대로 한 날이에요' },
  { key: 'hard', label: '힘듦', intensity: 7, hint: '후반은 버티면서 했어요' },
  { key: 'max', label: '아주 힘듦', intensity: 9, hint: '쓸 수 있는 힘을 다 썼어요' },
];

/** 칩 → 눈금. 모르는 값(옛 화면 · 손으로 만든 요청)은 null */
export function intensityOfEffort(key: unknown): number | null {
  if (typeof key !== 'string') return null;
  return EFFORT_LEVELS.find((l) => l.key === key)?.intensity ?? null;
}

/**
 * 눈금 → 칩(되돌림). 띠는 기준표와 같다 — 1~4 가벼움 · 5~6 보통 · 7~8 힘듦 · 9~10 아주 힘듦.
 * 범위 밖은 가장 가까운 끝으로 둔다(1 밑은 가벼움, 10 위는 아주 힘듦).
 */
export function effortOf(intensity: number): EffortKey {
  const n = Math.round(intensity);
  if (n <= 4) return 'light';
  if (n <= 6) return 'normal';
  if (n <= 8) return 'hard';
  return 'max';
}

/** 하루 하나의 힘듦 — DailyTrainingNote 의 날짜(YYYY-MM-DD)와 1~10 */
export type TrainingNoteLike = { date: string; intensity: number };

/**
 * 최근 힘듦 — facts.condition.trainingEffort 의 모양.
 *
 * last7 · last28 은 그 날 수 안(오늘 포함)에 남긴 강도를 날짜 오름차순으로. last28 은 last7 을 품는다(7일 평균 ↔ 28일 평균을
 * 견주는 검토안 그대로). spikeFlag 는 last7 이 3개 이상이고 7일 평균 − 28일 평균 ≥ 2 일 때만 true.
 */
export type TrainingEffort = {
  last7: number[];
  last28: number[];
  spikeFlag: boolean;
};

/** 급증을 보는 짧은 창 · 긴 창(날, 오늘 포함) — facts 의 급성 · 만성 창과 같은 7 · 28 */
export const EFFORT_WINDOW_SHORT_DAYS = 7;
export const EFFORT_WINDOW_LONG_DAYS = 28;
/** 7일 안에 이보다 적게 남겼으면 급증을 말하지 않는다(검토안 '7일 중 3개') */
export const EFFORT_SPIKE_MIN_NOTES = 3;
/** 7일 평균이 28일 평균보다 이만큼(1~10 눈금) 높으면 급증 */
export const EFFORT_SPIKE_DIFF = 2;

/** 날짜 키 둘의 차이(날). from 이 앞이면 양수 */
function daysBetweenKeys(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split('-').map(Number);
  const [ty, tm, td] = toKey.split('-').map(Number);
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

function average(values: readonly number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * 최근 힘듦을 센다. asOf 는 '오늘'(YYYY-MM-DD). 앞날 · 28일 밖 · 숫자가 아닌 줄은 뺀다. 같은 날 두 줄이면 뒤에 온 것이 이긴다
 * (DailyTrainingNote 는 하루 한 줄이라 실제로는 없다).
 */
export function trainingEffortOf(
  notes: readonly TrainingNoteLike[],
  asOf: string
): TrainingEffort {
  const byDay = new Map<string, number>();
  for (const n of notes) {
    if (!Number.isFinite(n.intensity)) continue;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(n.date)) continue;
    const ago = daysBetweenKeys(n.date, asOf);
    if (ago < 0 || ago >= EFFORT_WINDOW_LONG_DAYS) continue;
    byDay.set(n.date, n.intensity);
  }
  const days = [...byDay.keys()].sort();
  const last28 = days.map((d) => byDay.get(d) as number);
  const last7 = days
    .filter((d) => daysBetweenKeys(d, asOf) < EFFORT_WINDOW_SHORT_DAYS)
    .map((d) => byDay.get(d) as number);
  /* 1e-9 는 부동소수 오차 몫 — 9 와 7(42/6)의 차이가 1.9999… 로 읽혀 경계가 빠지지 않게 */
  const spikeFlag =
    last7.length >= EFFORT_SPIKE_MIN_NOTES &&
    average(last7) - average(last28) >= EFFORT_SPIKE_DIFF - 1e-9;
  return { last7, last28, spikeFlag };
}
