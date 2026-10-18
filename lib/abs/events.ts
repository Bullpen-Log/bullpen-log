/**
 * 타격 · 투구 가리기 — 공 하나의 관측(분석 px)과 맞춘 궤적으로. 타격이면 판정하지 않는다('타격'). 헛스윙은 공만으로는 안 친 것과 같아 'pitch'.
 *
 * 규칙(1차): 통과 순간 뒤 관측이 맞춘 궤적에서 CONTACT_RESID_PX 넘게 벗어난 것이 둘 이상이거나, 통과 앞뒤로 화면 속 공의 진행 방향이 뒤집히면 타격.
 * 통과 뒤 관측이 하나도 없고 외삽이면 'unknown'(공이 가려졌거나 쳤거나 모름) — 판정은 내되 믿음을 내린다(judge.ts 가 extrapolated 를 본다).
 */
export type Obs = { t: number; u: number; v: number };
export type PitchEvent = 'pitch' | 'contact' | 'unknown';

/** 분석 px 기준(짧은 변 720) — 공 지름 7px 남짓의 2배 */
export const CONTACT_RESID_PX = 12;

export function classifyPitch(
  obs: Obs[],
  project: (t: number) => [number, number],
  tCross: number,
  frameSec: number
): PitchEvent {
  const after = obs.filter((o) => o.t > tCross + frameSec * 0.5).sort((a, b) => a.t - b.t);
  const before = obs.filter((o) => o.t <= tCross + frameSec * 0.5).sort((a, b) => a.t - b.t);
  if (!after.length) return 'unknown';
  /*
   * 60fps 에서 공은 중간면을 지나 1~2장이면 미트에 든다 — 통과 뒤 관측은 보통 하나뿐이다. 하나라도 궤적에서 두 배 넘게 벗어나면 타격, 둘이면
   * 한 배로도. 세게 친 공은 엔진이 궤적을 못 맞춰 여기까지 안 오고(측정 불가 → ABS 'unknown'), 여기서 잡는 것은 빗맞은 공 · 파울 쪽이다.
   */
  let off = 0;
  let far = 0;
  for (const o of after) {
    const [pu, pv] = project(o.t);
    const r = Math.hypot(pu - o.u, pv - o.v);
    if (r > CONTACT_RESID_PX) off++;
    if (r > CONTACT_RESID_PX * 2) far++;
  }
  if (off >= 2 || far >= 1) return 'contact';
  /* 방향 뒤집힘 — 통과 앞 두 점의 진행과 통과 뒤 두 점의 진행이 반대(내각 > 100°) */
  if (before.length >= 2 && after.length >= 2) {
    const b1 = before[before.length - 2];
    const b2 = before[before.length - 1];
    const a1 = after[0];
    const a2 = after[1];
    const d1 = [b2.u - b1.u, b2.v - b1.v];
    const d2 = [a2.u - a1.u, a2.v - a1.v];
    const n1 = Math.hypot(d1[0], d1[1]);
    const n2 = Math.hypot(d2[0], d2[1]);
    if (n1 > 1 && n2 > 1) {
      const cos = (d1[0] * d2[0] + d1[1] * d2[1]) / (n1 * n2);
      if (cos < -0.17) return 'contact';
    }
  }
  return 'pitch';
}
