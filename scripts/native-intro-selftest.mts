/**
 * 앱 시작 연출(native/src/shell/intro-timeline.ts) 시험 — 2026-10-27 승인 2.20초 시안(싱커 · 덕아웃)이 시간표대로 걷히는지, 다시 재기 · 잃은 끝 알림 ·
 * 움직임 줄이기 · 화면 닫힘에서 두 번 걷거나 영영 안 걷히지 않는지. 상수 글자가 아니라 가짜 시계로 '언제 무엇이 일어났나'를 본다.
 * 실행: npm run native-intro:test
 * 실제 아이폰의 장면 · Reanimated 시계 · 시작 화면 걷힘은 이 시험이 보지 못한다(폰에서 확인).
 */
import assert from 'node:assert/strict';
import {
  INTRO_TIMING,
  REDUCED_HOLD_MS,
  SAFETY_MS,
  createIntroController,
  introTotalMs,
  leaveEase,
  letterEase,
  lettersDoneAt,
  markDone,
  markEase,
  type IntroTiming,
} from '~/shell/intro-timeline';

let n = 0;
const eq = (a: unknown, b: unknown, m: string) => {
  assert.deepEqual(a, b, m);
  n++;
};
const near = (a: number, b: number, m: string, eps = 1e-9) => {
  assert.ok(Math.abs(a - b) <= eps, `${m}: ${a} ≠ ${b}`);
  n++;
};

/* ── 가짜 시계 — 타이머 · 장면 · 애니메이션 끝 알림을 시각 순서대로 돌린다 ── */
type Job = { at: number; f: () => void; seq: number };
function world(tm: IntroTiming, reduced: boolean, opts: { loseAnimEnd?: boolean; splashMs?: number } = {}) {
  let now = 0;
  let seq = 0;
  let jobs: Job[] = [];
  const log: string[] = [];
  let goneAt: number | null = null;
  let leaveAt: number | null = null;
  let goneCount = 0;
  let clockStarts = 0;
  let leaveStarts = 0;
  let splashHides = 0;
  const at = (ms: number, f: () => void) => jobs.push({ at: now + ms, f, seq: seq++ });
  const c = createIntroController(tm, reduced, {
    frame: (f) => at(32, f),
    hideSplash: () => {
      splashHides++;
      /* 시작 화면 걷힘은 비동기 — 끝난 뒤 then 이 돈다 */
      return new Promise<void>((res) => at(opts.splashMs ?? 0, res));
    },
    later: (f, ms) => at(ms, f),
    runClock: () => {
      clockStarts++;
      log.push(`clock@${now}`);
    },
    runLeave: (delay, ms, done) => {
      leaveStarts++;
      leaveAt = now + delay;
      log.push(`leave@${now + delay}+${ms}`);
      if (!opts.loseAnimEnd) at(delay + ms, done);
    },
    gone: () => {
      goneCount++;
      goneAt = now;
    },
  });
  /* 시작 화면 걷힘 약속(Promise)의 then 을 돌리고 다음 일을 고른다 */
  const flush = async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  };
  const run = async (until: number) => {
    for (;;) {
      await flush();
      jobs.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const j = jobs[0];
      if (!j || j.at > until) break;
      jobs = jobs.slice(1);
      now = j.at;
      j.f();
    }
    now = until;
    await flush();
  };
  return {
    c,
    run,
    log,
    get now() {
      return now;
    },
    get goneAt() {
      return goneAt;
    },
    get leaveAt() {
      return leaveAt;
    },
    get goneCount() {
      return goneCount;
    },
    get clockStarts() {
      return clockStarts;
    },
    get leaveStarts() {
      return leaveStarts;
    },
    get splashHides() {
      return splashHides;
    },
  };
}

/* 시작 화면이 걷힌 때 = 시작(0) + 두 장면(32ms). 이 뒤부터 시간표를 센다 */
const T0 = 32;

/* 1. 시간표 — 승인 시안의 숫자가 곡선 함수에서 그대로 나오는지 */
{
  const tm = INTRO_TIMING;
  eq(introTotalMs(tm), 2200, '싱커 전체 2.2초');
  eq(tm.moveAt + tm.moveMs, 1000, '로고 이동 0.2 → 1.0초');
  eq(lettersDoneAt(tm, 5), 1400, '마지막 글자(R) 1.4초에 다 섬');
  eq(tm.settleMs - lettersDoneAt(tm, 5), 300, '이름 완성 뒤 0.3초 머묾');
  eq(lettersDoneAt(tm, 6), 1455, '덕아웃(D · U · G · O · U · T 여섯) 1.455초에 다 섬');
  assert.ok(lettersDoneAt(tm, 6) < tm.settleMs, '덕아웃도 걷기 전에 이름이 다 섬');
  n++;
  /* 로고 이동: in-out cubic */
  eq(markEase(199, tm), 0, '0.2초 전엔 안 움직임');
  near(markEase(600, tm), 0.5, '이동 한가운데 0.5');
  near(markEase(400, tm), 4 * 0.25 ** 3, '이동 ¼ 지점 = 4p³');
  near(markEase(800, tm), 1 - (-2 * 0.75 + 2) ** 3 / 2, '이동 ¾ 지점 = 1-(-2p+2)³/2');
  eq(markEase(1000, tm), 1, '1.0초에 다 옮김');
  eq([markDone(999, tm), markDone(1000, tm)], [false, true], '다 옮긴 순간에 선명한 로고로');
  /* 글자: out cubic, 0.055초 간격 */
  eq(letterEase(700, 0, tm), 0, 'I 는 0.7초에 시작');
  near(letterEase(700 + 240, 0, tm), 1 - 0.5 ** 3, 'I 절반 시간 = 1-(1-p)³');
  eq(letterEase(755, 1, tm), 0, 'N 은 0.055초 뒤 시작');
  eq(letterEase(700 + 55 * 4 + 480, 4, tm), 1, 'R 은 1.4초에 끝');
  near(letterEase(1399, 4, tm), 1 - (1 / 480) ** 3, 'R 이 1.4초 바로 전엔 거의 다 섬');
  /* 걷힘: out cubic, 1.015배 (예전 in quad 1.06배) */
  near(leaveEase(0.5), 1 - 0.5 ** 3, '걷힘 절반 = out cubic');
  eq([leaveEase(-1), leaveEase(2)], [0, 1], '걷힘 비율은 0~1 로 묶음');
  eq(tm.leaveScale, 1.015, '걷히며 1.015배');
}

/* 2. 시작 화면을 걷은 뒤 정확히 1.7초부터 0.5초 걷혀 2.2초에 치운다(사이트를 안 기다림) */
{
  const w = world(INTRO_TIMING, false);
  w.c.begin();
  await w.run(T0 + 2199);
  eq(w.goneAt, null, '2.2초 전엔 그대로');
  eq(w.leaveAt, T0 + 1700, '걷힘은 1.7초에 시작');
  await w.run(T0 + 2200);
  eq(w.goneAt, T0 + 2200, '2.2초에 치움');
  eq(w.c.life.phase, 'gone', '수명 끝');
  eq(w.splashHides, 1, '시작 화면은 한 번 걷음');
  /* 늦게 온 안전 타이머는 아무것도 안 함 */
  await w.run(T0 + 5000);
  eq(w.goneCount, 1, '두 번 치우지 않음');
  eq(w.leaveStarts, 1, '걷힘을 두 번 안 돌림');
}

/* 4. 다시 재기 · 늦은 시작 — 회전으로 칸을 다시 재 begin 이 또 와도, 대비 타이머(2.5초)가 와도 다시 시작하지 않음 */
{
  const w = world(INTRO_TIMING, false);
  w.c.begin();
  await w.run(800);
  w.c.begin();
  await w.run(2500);
  w.c.begin();
  await w.run(T0 + 2200);
  eq(w.splashHides, 1, '시작 화면은 한 번');
  eq(w.clockStarts, 1, '시계를 다시 안 돌림(애니메이션이 늘거나 처음부터 안 함)');
  eq(w.goneAt, T0 + 2200, '여전히 2.2초에 치움');
}

/* 5. 걷힘 끝 알림을 잃음(Reanimated 콜백 누락) — 안전 타이머가 2.2 + 0.4초에 치운다 */
{
  const w = world(INTRO_TIMING, false, { loseAnimEnd: true });
  w.c.begin();
  await w.run(T0 + 2200 + SAFETY_MS - 1);
  eq(w.goneAt, null, '안전 시간 전엔 아직');
  await w.run(T0 + 2200 + SAFETY_MS);
  eq(w.goneAt, T0 + 2600, '2.6초엔 반드시 치움');
}

/* 6. 시작 화면 걷힘이 느려도(0.3초) 시간표는 걷힌 뒤부터 센다 — 걷히기 전에 로고가 작아지지 않게 */
{
  const w = world(INTRO_TIMING, false, { splashMs: 300 });
  w.c.begin();
  await w.run(T0 + 300 + 2200);
  eq(w.log[0], `clock@${T0 + 300}`, '시계는 시작 화면이 걷힌 뒤');
  eq(w.goneAt, T0 + 300 + 2200, '그로부터 2.2초');
}

/* 7. 움직임 줄이기 — 완성된 이름 1.1초 → 걷힘 시간 0 으로 바로(2.2초를 기다리지 않음) */
{
  const w = world(INTRO_TIMING, true);
  w.c.begin();
  await w.run(T0 + REDUCED_HOLD_MS);
  eq(w.goneAt, T0 + REDUCED_HOLD_MS, '1.1초에 치움');
  eq(w.clockStarts, 0, '시계를 안 돌림(움직임 없음)');
  eq(w.log.at(-1), `leave@${T0 + REDUCED_HOLD_MS}+0`, '걷힘 시간 0');
}

/* 8. 화면이 닫힘(dispose) — 그 뒤 타이머 · 알림이 와도 치우기 · 걷기를 안 부른다 */
{
  const w = world(INTRO_TIMING, false);
  w.c.begin();
  await w.run(1000);
  w.c.dispose();
  await w.run(5000);
  eq(w.goneCount, 0, '닫힌 뒤엔 gone 안 부름');
  const w2 = world(INTRO_TIMING, false);
  w2.c.dispose();
  w2.c.begin();
  await w2.run(5000);
  eq(w2.splashHides, 0, '닫힌 뒤 begin 은 아무것도 안 함');
}

console.log(`native-intro: ${n}개 통과`);
