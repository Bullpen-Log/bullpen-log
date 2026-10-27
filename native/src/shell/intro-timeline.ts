/**
 * 앱 시작 연출의 시간표 · 곡선 · 수명 — 순수(시험: scripts/native-intro-selftest.mts). shell/intro.tsx 가 UI 스레드(worklet)에서 그대로 부른다.
 *
 * 2026-10-27 김민이 재생해 보고 고른 2.20초 시안(SINKER_TIMING) — 큰 로고 0.2초 → 0.8초 동안 이름의 S 칸으로(in-out cubic) → 0.7초부터 I · N · K · E · R 가
 * 0.055초 간격으로 0.48초씩(out cubic) → 1.4초에 이름 완성 · 0.3초 머묾 → 1.7초부터 0.5초 동안 옅어지며 1.015배(out cubic) = 2.2초.
 * 로고 이동과 글자 등장은 겹친다(따로 더하면 2.2초를 넘는다). 덕아웃 앱은 예전 3.45초 그대로(LEGACY_TIMING).
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
  leaveCurve: 'in-quad' | 'out-cubic';
  /**
   * 다 선 뒤 사이트가 그려지길 기다리는 상한(ms). 0 이면 안 기다리고 시간표대로 걷는다 — 그 뒤 아직 받는 중이면 밑의 화면이 제 로딩 표시를 보인다
   * (싱커 app/index.tsx 의 첫 불러오기 판). 브랜드 이름만 붙잡고 몇 초씩 세워 두지 않는다.
   */
  readyWaitMs: number;
};

/** 싱커 — 2026-10-27 승인 시안 */
export const SINKER_TIMING: IntroTiming = {
  moveAt: 200,
  moveMs: 800,
  letterAt: 700,
  letterGap: 55,
  letterMs: 480,
  settleMs: 1700,
  leaveMs: 500,
  leaveScale: 1.015,
  leaveCurve: 'out-cubic',
  readyWaitMs: 0,
};

/** 예전(약 3.45초 + 사이트 기다림 7초) — 덕아웃 앱(src/dugout/app/_layout.tsx)이 그대로 쓴다 */
export const LEGACY_TIMING: IntroTiming = {
  moveAt: 400,
  moveMs: 1000,
  letterAt: 1250,
  letterGap: 75,
  letterMs: 650,
  settleMs: 2900,
  leaveMs: 550,
  leaveScale: 1.06,
  leaveCurve: 'in-quad',
  readyWaitMs: 7000,
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
/** 걷힘(u = 0~1, 시간 비율) → 곡선 값 */
export function leaveEase(u: number, tm: IntroTiming): number {
  'worklet';
  const p = clamp01(u);
  return tm.leaveCurve === 'out-cubic' ? outCubic(p) : p * p;
}

export const lettersDoneAt = (tm: IntroTiming, count: number) => tm.letterAt + tm.letterGap * (count - 1) + tm.letterMs;
export const introTotalMs = (tm: IntroTiming) => tm.settleMs + tm.leaveMs;

/**
 * 한 번만 — 시작 · 걷기 · 끝. 화면 크기가 바뀌어 칸을 다시 재도 다시 시작하지 않고(아이패드 회전 · 창 크기), 늦게 온 '사이트 다 그림' · 안전 타이머가
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
  /** 타임라인 0 → settleMs(직선). done 은 끝났을 때 */
  runClock: (durationMs: number, done?: () => void) => void;
  /** 걷힘 0 → 1(직선) — delayMs 뒤 durationMs 동안. done 은 끝났을 때 */
  runLeave: (delayMs: number, durationMs: number, done: () => void) => void;
  gone: () => void;
  isReady: () => boolean;
  onReady: (f: () => void) => void;
};

/**
 * 시작 · 걷기 결정 — 언제 시계를 돌리고, 언제 걷고, 언제 치우나. 화면(intro.tsx)과 시험이 같은 것을 쓴다.
 * - 싱커(readyWaitMs 0): 시작 화면을 걷은 뒤 시계와 걷힘을 한 번에 건다 — 1700 부터 500 동안 걷혀 2200 에 치운다. 늦게 온 '다 그림'은 무시.
 * - 덕아웃(readyWaitMs > 0): 다 선 뒤 사이트가 그려졌으면 걷고, 아니면 그려질 때까지(상한 readyWaitMs).
 * - 움직임 줄이기: 완성된 이름 REDUCED_HOLD_MS → 곧바로 걷힘(걷힘 시간 0).
 * 시작 · 걷기 · 치우기는 한 번씩(createIntroLife), 치운 뒤(dispose 포함) 오는 알림 · 타이머는 아무것도 안 한다.
 */
export function createIntroController(tm: IntroTiming, reduced: boolean, fx: IntroEffects) {
  const life = createIntroLife();
  let disposed = false;
  const finish = () => {
    if (!disposed && life.finish()) fx.gone();
  };
  const leaveNow = () => {
    if (disposed || !life.leave()) return;
    const ms = reduced ? 0 : tm.leaveMs;
    fx.runLeave(0, ms, finish);
    fx.later(finish, ms + SAFETY_MS);
  };
  const settle = () => {
    if (disposed) return;
    if (fx.isReady() || tm.readyWaitMs <= 0) return leaveNow();
    fx.onReady(leaveNow);
    fx.later(leaveNow, tm.readyWaitMs);
  };
  return {
    life,
    begin() {
      if (disposed || !life.start()) return;
      fx.frame(() => {
        void fx.hideSplash().then(() => {
          if (disposed) return;
          if (reduced) return fx.later(settle, REDUCED_HOLD_MS);
          if (tm.readyWaitMs > 0) return fx.runClock(tm.settleMs, settle);
          life.leave();
          fx.runClock(tm.settleMs);
          fx.runLeave(tm.settleMs, tm.leaveMs, finish);
          fx.later(finish, tm.settleMs + tm.leaveMs + SAFETY_MS);
        });
      });
    },
    dispose() {
      disposed = true;
    },
  };
}
