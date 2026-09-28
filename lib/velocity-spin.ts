import type { ThrowingHand } from '@/components/velocity/session-types';
import type { PitchTypeKey } from '@/lib/velocity-meta';

/**
 * 구종별 "전형적인 회전축".
 *
 * 카메라는 공 크기만 보므로 회전을 재지 못한다. 그래서 회전축 그림은 고른 구종과 던지는 손으로
 * 정한 짐작값이다 — 화면은 그 사실을 꼭 적는다(components/velocity/spin-axis.tsx 의 SpinAxisNote).
 *
 * 나타내는 법은 Rapsodo · Trackman 이 쓰는 시계 방향(tilt) + 회전 효율(%). 시계는 투수가 마운드에서
 * 홈을 보는 방향 기준이다 — 12:00 이 순수 백스핀(직구), 6:00 이 순수 톱스핀(12-6 커브), 1:00 은
 * 우투수의 팔쪽 위. 공은 시계 바늘이 가리키는 쪽으로 휜다(마그누스 힘). 회전 효율은 진행 방향과
 * 직각인 회전의 비율 — 총알 회전(자이로)이 섞일수록 낮고, 낮을수록 늦게 · 덜 휜다.
 *
 * 값은 우투수 기준이고 좌투수는 12:00 을 축으로 거울이다(1:00 ↔ 11:00, 7:00 ↔ 5:00). 숫자는 측정기
 * 회사 자료 · 중계 해설에서 "일반적으로 알려진 범위"를 옮긴 것이지 이 앱이 잰 것이 아니다. 같은
 * 구종이라도 사람마다 다르므로 대푯값 하나와 흔한 rpm 범위만 둔다.
 */
export type SpinAxis = {
  /** 시계 방향 — "1:00" 꼴, 15분 단위 */
  clock: string;
  /** 시계 12시 = 0°, 시계 방향이 양수, -180~180 */
  tiltDeg: number;
  /** 회전 효율(%) — 진행 방향과 직각인 회전의 비율 */
  efficiencyPct: number;
  /** 흔한 회전수 범위(rpm) */
  rpm: [number, number];
  /** 공이 어떻게 움직이나 한 줄 — 손에 따라 안 바뀌게 '팔쪽' · '글러브쪽'으로 적는다 */
  movement: string;
  /** 왜 그런 축인지 한 줄 */
  note: string;
};

type Seed = Omit<SpinAxis, 'tiltDeg'>;

/** 우투수 기준 — '기타'는 축을 정할 수 없어 표에 없다 */
const RIGHT: Record<Exclude<PitchTypeKey, 'other'>, Seed> = {
  fastball: {
    clock: '12:45',
    efficiencyPct: 95,
    rpm: [2100, 2400],
    movement: '위로 뜨는 힘 · 팔쪽으로 살짝',
    note: '거의 순수한 백스핀 — 회전이 많을수록 덜 떨어져요',
  },
  'two-seam': {
    clock: '1:30',
    efficiencyPct: 90,
    rpm: [2000, 2300],
    movement: '팔쪽으로 달아나며 가라앉음',
    note: '옆 회전이 섞여 직구보다 팔쪽으로 흘러요',
  },
  cutter: {
    clock: '11:45',
    efficiencyPct: 40,
    rpm: [2200, 2500],
    movement: '글러브쪽으로 살짝 꺾임',
    note: '총알 회전(자이로)이 절반 넘게 섞여 직구처럼 오다 끝에서 꺾여요',
  },
  slider: {
    clock: '9:45',
    efficiencyPct: 30,
    rpm: [2200, 2600],
    movement: '글러브쪽으로 미끄러짐',
    note: '거의 총알 회전 — 효율이 낮아 옆으로 늦게 꺾여요',
  },
  curve: {
    clock: '7:00',
    efficiencyPct: 80,
    rpm: [2300, 2700],
    movement: '아래로 떨어지며 글러브쪽으로',
    note: '톱스핀 — 12-6 커브면 6:00, 옆으로 갈수록 7시 쪽',
  },
  changeup: {
    clock: '2:00',
    efficiencyPct: 85,
    rpm: [1600, 1900],
    movement: '팔쪽으로 흐르며 가라앉음',
    note: '직구와 같은 팔 스윙에 옆 회전이 더 섞여 느리게 가라앉아요',
  },
  splitter: {
    clock: '12:30',
    efficiencyPct: 60,
    rpm: [1200, 1500],
    movement: '끝에서 뚝 떨어짐',
    note: '회전이 적어 뜨는 힘이 약해요 — 직구처럼 오다 가라앉아요',
  },
};

/**
 * 구종 + 던지는 손 → 전형적인 회전축. '기타'와 안 고른 것은 null — 축을 그릴 근거가 없다.
 * 모르는 키(옛 자료)도 null.
 */
export function spinAxisFor(
  pitchType: string | null | undefined,
  hand: ThrowingHand
): SpinAxis | null {
  if (!pitchType || !(pitchType in RIGHT)) return null;
  const seed = RIGHT[pitchType as keyof typeof RIGHT];
  const rightDeg = clockToDeg(seed.clock);
  /* 좌투는 12:00 을 축으로 거울 — 부호만 뒤집는다. 0° 와 180° 는 그대로 */
  const tiltDeg = hand === 'left' ? normalizeDeg(-rightDeg) : rightDeg;
  return { ...seed, tiltDeg, clock: degToClock(tiltDeg) };
}

/** -180 < deg ≤ 180 으로 접는다(-180 은 180 으로) */
function normalizeDeg(deg: number): number {
  const d = ((((deg + 180) % 360) + 360) % 360) - 180;
  return d === -180 ? 180 : d;
}

/**
 * "1:00" → 30°. 12시가 0°, 시계 방향 양수, -180~180. 시계 한 바퀴(12시간 = 720분)가 360° 라
 * 1분이 0.5° 다. 읽을 수 없는 글자는 0(12:00) — 그림이 NaN 으로 깨지는 것보다 낫다.
 */
export function clockToDeg(clock: string): number {
  const m = /^(\d{1,2}):(\d{2})$/.exec(clock.trim());
  if (!m) return 0;
  const hours = Number(m[1]) % 12;
  const minutes = Number(m[2]);
  if (minutes < 0 || minutes >= 60) return 0;
  return normalizeDeg((hours * 60 + minutes) * 0.5);
}

/** 30° → "1:00". 15분 단위로 반올림한다 — 측정기들도 그렇게 적고, 그보다 잘게 적으면 짐작값이 정확해 보인다 */
export function degToClock(deg: number): string {
  const around = ((deg % 360) + 360) % 360;
  let minutes = Math.round((around * 2) / 15) * 15;
  if (minutes >= 720) minutes = 0;
  const h = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, '0');
  return `${h === 0 ? 12 : h}:${mm}`;
}
