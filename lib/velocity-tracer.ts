/**
 * 결과 화면의 공 따라 그리기 — 순수 계산(화면 components/velocity/clip-player.tsx 와 시험 scripts/velocity-engine2-test.mts 가 같이 쓴다).
 *
 * 길은 엔진이 맞춘 궤적을 화면에 비춘 점들(장면 비율, t 는 궤적 시각 = 카메라 장면 시계)이고, 영상 클립 시각과는 offset 만큼 다르다
 * (클립 시각 = t + offset). 영상 파일 · 앱 동시 촬영은 그 영상을 그대로 쟀으니 0 이다. 카메라 실시간 클립은 벽시계로 잘라 offset 이
 * 어림이다 — '담는 중' 알림이 화면 스레드에 오기까지 장면 받기 · 계산 · 메시지로 몇 장 늦고 그 늦음이 폰마다 다르다. 그래서 첫 재생에서
 * 영상 장면을 받아 공이 실제로 있는 자리로 offset 을 맞춘다(alignTrail).
 */

/** 공 길의 한 점 — t 궤적 시각(초), x · y 장면 비율(0~1), d 공 지름 ÷ 장면 가로 */
export type TrailPoint = { t: number; x: number; y: number; d: number };

/** t 때의 공 자리(점 사이는 곧게) — 길 밖이면 null */
export function pointAt(points: TrailPoint[], t: number): TrailPoint | null {
  const n = points.length;
  if (!n || t < points[0].t || t > points[n - 1].t) return null;
  let i = 1;
  while (i < n - 1 && points[i].t < t) i++;
  const a = points[Math.max(0, i - 1)];
  const b = points[i] ?? a;
  const k = b.t > a.t ? (t - a.t) / (b.t - a.t) : 1;
  return {
    t,
    x: a.x + (b.x - a.x) * k,
    y: a.y + (b.y - a.y) * k,
    d: a.d + (b.d - a.d) * k,
  };
}

/** t 까지 지나온 길 — 마지막 점이 그때의 공. t 가 길 앞이면 빈 배열, 길 끝 뒤면 길 전체 */
export function trailUntil(points: TrailPoint[], t: number): TrailPoint[] {
  if (!points.length || t < points[0].t) return [];
  if (t >= points[points.length - 1].t) return points;
  const out = points.filter((p) => p.t < t);
  const head = pointAt(points, t);
  if (head) out.push(head);
  return out;
}

/** 길이 차지하는 네모(장면 비율, 공 크기까지 · 장면 안으로) — aspect = 장면 가로 ÷ 세로 */
export function trailBox(points: TrailPoint[], aspect: number) {
  let x0 = 1;
  let x1 = 0;
  let y0 = 1;
  let y1 = 0;
  for (const p of points) {
    const rx = p.d / 2;
    const ry = (p.d / 2) * aspect;
    x0 = Math.min(x0, p.x - rx);
    x1 = Math.max(x1, p.x + rx);
    y0 = Math.min(y0, p.y - ry);
    y1 = Math.max(y1, p.y + ry);
  }
  return {
    x0: Math.max(0, x0),
    y0: Math.max(0, y0),
    x1: Math.min(1, x1),
    y1: Math.min(1, y1),
  };
}

/**
 * 굵기가 바뀌는 관(SVG path d) — 점마다 반지름 r(px), 양 끝은 반원. 공이 멀어지며 작아지는 만큼 가늘어진다.
 * 한 덩어리로 칠하므로 반투명이어도 겹친 곳이 진해지지 않는다.
 */
export function tubePath(P: { x: number; y: number; r: number }[]): string {
  const n = P.length;
  if (!n) return '';
  const f = (v: number) => v.toFixed(1);
  if (n === 1) {
    const { x, y, r } = P[0];
    return `M${f(x - r)} ${f(y)}a${f(r)} ${f(r)} 0 1 0 ${f(2 * r)} 0a${f(r)} ${f(r)} 0 1 0 ${f(-2 * r)} 0Z`;
  }
  const L: string[] = [];
  const R: string[] = [];
  let nx = 0;
  let ny = 1;
  for (let i = 0; i < n; i++) {
    const a = P[Math.max(0, i - 1)];
    const b = P[Math.min(n - 1, i + 1)];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len > 1e-6) {
      nx = -(b.y - a.y) / len;
      ny = (b.x - a.x) / len;
    }
    const { x, y, r } = P[i];
    L.push(`${f(x + nx * r)} ${f(y + ny * r)}`);
    R.push(`${f(x - nx * r)} ${f(y - ny * r)}`);
  }
  const r0 = f(P[0].r);
  const r1 = f(P[n - 1].r);
  /* 끝 반원(L → R) · 앞 반원(R → L) 모두 화면에서 반시계(sweep 0)라 바깥으로 돈다 */
  return `M${L.join('L')}A${r1} ${r1} 0 0 0 ${R[n - 1]}L${R.slice(0, -1).reverse().join('L')}A${r0} ${r0} 0 0 0 ${L[0]}Z`;
}

/** 첫 재생에서 받은 영상 장면 — time 클립 시각(초), luma 는 잘라 낸 자리(crop)를 width × height 로 줄인 밝기 */
export type ClipSample = { time: number; luma: ArrayLike<number> };

/**
 * offset(클립 시각 = 궤적 시각 + offset)을 영상으로 맞춘다. offset ± range 를 1/240초씩 옮겨 보며, 받은 장면마다 그때의 길 위 자리
 * (공이 있어야 할 곳)의 공 크기 원 안이 배경(장면 15장의 칸별 중앙값 — 공은 한 칸에 한두 장만 머문다)과 얼마나 다른지 평균한다.
 * 가장 다른 곳이 공이 실제로 지나간 때다. 손에 붙은 앞 25% 는 팔 · 몸이 같이 움직여 뺀다.
 * 봉우리가 뚜렷하지 않으면(공이 안 보이는 영상) null — 받은 offset 을 그대로 쓴다.
 */
export function alignTrail(o: {
  samples: ClipSample[];
  width: number;
  height: number;
  /** 장면에서 잘라 낸 자리(장면 비율) — 가로세로 비를 지켜 줄였다 */
  crop: { x: number; y: number; w: number; h: number };
  points: TrailPoint[];
  offset: number;
  range?: number;
}): number | null {
  const { samples, width: W, height: H, crop, points, offset } = o;
  const range = o.range ?? 0.2;
  if (samples.length < 8 || points.length < 2) return null;
  const t1 = points[points.length - 1].t;
  const tLo = points[0].t + 0.25 * (t1 - points[0].t);
  const every = Math.max(1, Math.floor(samples.length / 15));
  const pick = samples.filter((_, i) => i % every === 0);
  const bg = new Int16Array(W * H).fill(-1);
  const tmp = new Uint8Array(pick.length);
  const bgAt = (k: number) => {
    if (bg[k] < 0) {
      for (let j = 0; j < pick.length; j++) tmp[j] = pick[j].luma[k];
      tmp.sort();
      bg[k] = tmp[tmp.length >> 1];
    }
    return bg[k];
  };
  /* 잘라 낸 그림의 px ÷ 장면 비율 — 가로 기준(d 도 장면 가로 기준) */
  const sx = W / crop.w;
  const sy = H / crop.h;
  const steps = Math.round(range * 240);
  const scores: number[] = [];
  let best = -1;
  let bestShift = 0;
  for (let s = -steps; s <= steps; s++) {
    const shift = s / 240;
    let sum = 0;
    let n = 0;
    for (const f of samples) {
      const p = pointAt(points, f.time - offset - shift);
      if (!p || p.t < tLo) continue;
      const cx = (p.x - crop.x) * sx;
      const cy = (p.y - crop.y) * sy;
      const r = Math.max(1.5, 0.85 * (p.d / 2) * sx);
      let acc = 0;
      let cnt = 0;
      for (
        let y = Math.max(0, Math.ceil(cy - r));
        y <= Math.min(H - 1, Math.floor(cy + r));
        y++
      )
        for (
          let x = Math.max(0, Math.ceil(cx - r));
          x <= Math.min(W - 1, Math.floor(cx + r));
          x++
        ) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          const k = y * W + x;
          acc += Math.abs(f.luma[k] - bgAt(k));
          cnt++;
        }
      if (cnt) {
        sum += acc / cnt;
        n++;
      }
    }
    const score = n >= 4 ? sum / n : 0;
    scores.push(score);
    if (score > best) {
      best = score;
      bestShift = shift;
    }
  }
  const med = [...scores].sort((a, b) => a - b)[scores.length >> 1];
  if (best < 8 || best < 1.5 * med) return null;
  return offset + bestShift;
}
