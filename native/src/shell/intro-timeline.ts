/**
 * 앱 시작 연출의 시간표 · 곡선 · 수명 — 순수(시험: scripts/native-intro-selftest.mts). shell/intro.tsx 가 UI 스레드(worklet)에서 그대로 부른다.
 *
 * 2026-10-27 김민이 재생해 보고 고른 2.20초 시안(INTRO_TIMING) — 큰 로고 0.2초 → 0.8초 동안 이름의 S 칸으로(in-out cubic) → 0.7초부터 I · N · K · E · R 가
 * 0.055초 간격으로 0.48초씩(out cubic) → 1.4초에 이름 완성 · 0.3초 머묾 → 1.7초부터 0.5초 동안 옅어지며 1.015배(out cubic) = 2.2초.
 * 로고 이동과 글자 등장은 겹친다(따로 더하면 2.2초를 넘는다). 같은 날 김민: 덕아웃 앱도 같은 2.2초(글자가 여섯이라 1.455초에 다 서고 0.245초 머묾).
 * 사이트가 다 그려지길 기다리지 않는다 — 아직이면 밑의 화면(app/index.tsx · dugout/app/index.tsx)이 첫 불러오기 판을 보인다.
 */
export type IntroTiming = {
  moveAt: number;
  moveMs: number;
  letterAt: number;
  letterGap: number;
  letterMs: number;
  /** 이름이 다 서는 때 — 여기서 걷기 시작(또는 사이트를 기다림) */
  settleMs: number;
  leaveMs: number;
  /** 걷히며 커지는 끝 배율 */
  leaveScale: number;
};

/** 2026-10-27 승인 시안 — 싱커 · 덕아웃 앱 */
export const INTRO_TIMING: IntroTiming = {
  moveAt: 200,
  moveMs: 800,
  letterAt: 700,
  letterGap: 55,
  letterMs: 480,
  settleMs: 1700,
  leaveMs: 500,
  leaveScale: 1.015,
};

export function clamp01(x: number): number {
  'worklet';
  return Math.min(1, Math.max(0, x));
}
export function inOutCubic(p: number): number {
  'worklet';
  return p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
}
export function outCubic(p: number): number {
  'worklet';
  return 1 - Math.pow(1 - p, 3);
}

/** 큰 로고 → S 칸 이동(0~1) */
export function markEase(t: number, tm: IntroTiming): number {
  'worklet';
  return inOutCubic(clamp01((t - tm.moveAt) / tm.moveMs));
}
/** 이동이 끝났나 — 끝나면 큰 그림을 감추고 칸 크기의 선명한 로고로 바꾼다 */
export function markDone(t: number, tm: IntroTiming): boolean {
  'worklet';
  return t >= tm.moveAt + tm.moveMs;
}
/** i 번째 글자(0~1) — 진하기 = 이 값, 왼쪽에서 0.245 글자폭 밀려 나온다 */
export function letterEase(t: number, i: number, tm: IntroTiming): number {
  'worklet';
  return outCubic(clamp01((t - (tm.letterAt + tm.letterGap * i)) / tm.letterMs));
}
/** 걷힘(u = 0~1, 시간 비율) → 곡선 값(out cubic — 예전 in quad) */
export function leaveEase(u: number): number {
  'worklet';
  return outCubic(clamp01(u));
}

export const lettersDoneAt = (tm: IntroTiming, count: number) => tm.letterAt + tm.letterGap * (count - 1) + tm.letterMs;
export const introTotalMs = (tm: IntroTiming) => tm.settleMs + tm.leaveMs;

/**
 * 한 번만 — 시작 · 걷기 · 끝. 화면 크기가 바뀌어 칸을 다시 재도 다시 시작하지 않고(아이패드 회전 · 창 크기), 늦게 온 안전 타이머가
 * 걷기를 두 번 돌리거나 다 걷힌 가림막을 다시 건드리지 않게.
 */
export function createIntroLife() {
  let started = false;
  let leaving = false;
  let gone = false;
  return {
    start(): boolean {
      if (started) return false;
      started = true;
      return true;
    },
    leave(): boolean {
      if (!started || leaving || gone) return false;
      leaving = true;
      return true;
    },
    finish(): boolean {
      if (gone) return false;
      gone = true;
      return true;
    },
    get phase(): 'waiting' | 'playing' | 'leaving' | 'gone' {
      return gone ? 'gone' : leaving ? 'leaving' : started ? 'playing' : 'waiting';
    },
  };
}

/** 움직임 줄이기면 완성된 이름을 이만큼 세운 뒤 걷는다(움직임 없이 — 2.2초를 기다리게 하지 않는다) */
export const REDUCED_HOLD_MS = 1100;
/** 걷힘 애니메이션 끝 알림을 잃어도 이만큼 더 뒤엔 가림막을 치운다(밑 화면이 영영 막히지 않게) */
export const SAFETY_MS = 400;

/** 제어기가 바깥에 시키는 일 — intro.tsx 는 Reanimated · 시작 화면 · 타이머로, 시험은 가짜 시계로 채운다 */
export type IntroEffects = {
  /** 큰 로고가 그려진 다음 장면(두 장면 뒤)에 */
  frame: (f: () => void) => void;
  hideSplash: () => Promise<unknown>;
  later: (f: () => void, ms: number) => void;
  /** 타임라인 0 → settleMs(직선) */
  runClock: (durationMs: number) => void;
  /** 걷힘 0 → 1(직선) — delayMs 뒤 durationMs 동안. done 은 끝났을 때 */
  runLeave: (delayMs: number, durationMs: number, done: () => void) => void;
  gone: () => void;
};

/**
 * 시작 · 걷기 결정 — 언제 시계를 돌리고, 언제 걷고, 언제 치우나. 화면(intro.tsx)과 시험이 같은 것을 쓴다.
 * - 시작 화면을 걷은 뒤 시계와 걷힘을 한 번에 건다 — settleMs 부터 leaveMs 동안 걷혀 2.2초에 치운다. 걷힘 끝 알림을 잃어도 SAFETY_MS 뒤 치운다.
 * - 움직임 줄이기: 완성된 이름 REDUCED_HOLD_MS → 곧바로 걷힘(걷힘 시간 0).
 * 시작 · 걷기 · 치우기는 한 번씩(createIntroLife), 치운 뒤(dispose 포함) 오는 타이머는 아무것도 안 한다.
 */
export function createIntroController(tm: IntroTiming, reduced: boolean, fx: IntroEffects) {
  const life = createIntroLife();
  let disposed = false;
  const finish = () => {
    if (!disposed && life.finish()) fx.gone();
  };
  const leaveAfter = (delay: number, ms: number) => {
    if (disposed || !life.leave()) return;
    fx.runLeave(delay, ms, finish);
    fx.later(finish, delay + ms + SAFETY_MS);
  };
  return {
    life,
    begin() {
      if (disposed || !life.start()) return;
      fx.frame(() => {
        void fx.hideSplash().then(() => {
          if (disposed) return;
          if (reduced) return fx.later(() => leaveAfter(0, 0), REDUCED_HOLD_MS);
          fx.runClock(tm.settleMs);
          leaveAfter(tm.settleMs, tm.leaveMs);
        });
      });
    },
    dispose() {
      disposed = true;
    },
  };
}
