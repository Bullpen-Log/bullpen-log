/**
 * 3D 결과 화면의 원본 영상 두 칸이 3D 시계를 따라가는 규칙(웹 lab-detail.tsx · 앱 embed 가 같이 쓴다 — 앱 쪽은 native/src/app/lab/[id].tsx 에 같은 식).
 *
 * 2026-10-20 김민: "애니메이션이랑 실제 투구 영상이 싱크가 안 맞아". 까닭 둘:
 *   1. 3D 시각은 원본 트랙 시각(편집 목록 무시)인데 재생기는 편집 목록대로 — 시간만 잘라 붙인 영상은 앞머리 0.1~1초만큼 영상이 앞섰다.
 *      → 앞머리(shift, lib/pitch-lab-file.ts videoEditShift)를 더해 재생기 시각으로.
 *   2. 재생 중엔 영상이 제 시계로 돌고 0.5초마다 0.25초 넘게 벌어져야 맞췄다(공 놓기 앞뒤 0.2초가 통째로 어긋남).
 *      → 0.1초마다 재생 빠르기를 살짝 바꿔 따라붙고, 많이 벌어지면 바로 그 시각으로.
 */

/** 3D 시각(옆 영상 트랙 시각)에서 두 영상의 트랙 시각 — 장면 사이는 선으로 나눈다 */
export function sourceTimesAt(
  t: readonly number[],
  tBack: readonly number[],
  time: number
): { side: number; back: number } {
  const n = t.length;
  if (n === 0) return { side: time, back: time };
  if (time <= t[0]) return { side: time, back: tBack[0] + (time - t[0]) };
  if (time >= t[n - 1]) return { side: time, back: tBack[n - 1] + (time - t[n - 1]) };
  let lo = 0;
  let hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (t[m] <= time) lo = m;
    else hi = m;
  }
  const f = t[hi] > t[lo] ? (time - t[lo]) / (t[hi] - t[lo]) : 0;
  return { side: time, back: tBack[lo] + f * (tBack[hi] - tBack[lo]) };
}

/** 영상 시각이 이만큼(초) 넘게 벌어지면 빠르기로 따라가지 않고 그 시각으로 옮긴다 */
export const FOLLOW_SEEK_S = 0.15;
/** 벌어진 만큼을 이 시간(실제 초) 안에 메우는 빠르기로 */
const FOLLOW_CATCH_S = 0.5;
/** 이만큼(초) 안으로 맞으면 빠르기를 3D 그대로 — 예전엔 조금만 벌어져도 0.1초마다 빠르기를 바꿔 영상 셋이 초당 27번 바뀌었다 */
const FOLLOW_DEADBAND_S = 0.04;
/** 한 번 옮긴 영상은 이 시간(실제 초) 동안 다시 안 옮긴다 — 옮기는 동안 영상이 멈춰 또 벌어지고 또 옮기는 되풀이를 끊는다 */
export const FOLLOW_SEEK_COOLDOWN_S = 0.6;

/**
 * 재생 중 한 번(0.1초마다) — 지금 영상 시각 · 있어야 할 시각 · 3D 빠르기 → 옮길지와 영상 빠르기.
 * 앞서면 느리게 · 뒤처지면 빠르게(빠르기의 0.4~2배, 재생기 바닥 0.0625).
 */
export function followStep(
  current: number,
  want: number,
  speed: number
): { seek: boolean; rate: number } {
  const ahead = current - want;
  if (Math.abs(ahead) > FOLLOW_SEEK_S) return { seek: true, rate: speed };
  if (Math.abs(ahead) < FOLLOW_DEADBAND_S) return { seek: false, rate: speed };
  const rate = speed - ahead / FOLLOW_CATCH_S;
  return { seek: false, rate: Math.max(0.0625, speed * 0.4, Math.min(speed * 2, rate)) };
}


/**
 * 재생 중 0.1초마다 영상 하나를 어떻게 건드릴지(웹 lab-detail.tsx · 앱 native/src/app/lab/[id].tsx 가 같이 쓴다). 2026-10-24 김민: "분석 결과 화면이 렉이 많이 걸려".
 * 받는 중 · 옮기는 중(ready=false)이면 안 건드린다 — 예전엔 앱이 영상이 받느라 멈춰 벌어지면 0.1초마다 다시 옮겨, 옮기기 → 멈춤 → 또 옮기기가 되풀이되며
 * 화면 전체가 버벅였다(마커 영상 셋 125MB). 옮긴 뒤 FOLLOW_SEEK_COOLDOWN_S 안에는 다시 안 옮기고, 빠르기는 3D 빠르기의 10% 넘게 다를 때만 바꾼다.
 */
export function followTick(
  v: { time: number; rate: number; ready: boolean; sinceSeekS: number },
  want: number,
  speed: number
): { seek: number | null; rate: number | null } {
  if (!v.ready) return { seek: null, rate: null };
  const step = followStep(v.time, want, speed);
  if (step.seek && v.sinceSeekS < FOLLOW_SEEK_COOLDOWN_S) return { seek: null, rate: null };
  /* 맞는 띠 안(빠르기 = 3D)이면 3D 빠르기로 되돌리고, 따라붙는 중이면 10% 넘게 다를 때만 바꾼다 */
  const back = step.rate === speed && Math.abs(v.rate - speed) > 0.005;
  const rate = back || Math.abs(v.rate - step.rate) > 0.1 * speed ? step.rate : null;
  return { seek: step.seek ? want : null, rate };
}
