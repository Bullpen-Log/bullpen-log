/*
 * 그래프 곡선 — 홈 그래프(app/(app)/today/home-trends.tsx)와 부하 지수 흐름(app/(app)/coach/load-trend.tsx)이 같이 쓴다.
 */

/**
 * 점들을 잇는 부드러운 곡선(단조 3차) — 점과 점 사이에서 위아래로 넘치지 않는다.
 * 그냥 곡선으로 이으면 오르다 내리는 자리에서 실제로 없던 봉우리가 생긴다.
 */
export function smoothPath(p: [number, number][]) {
  if (p.length === 0) return '';
  const f = (n: number) => Math.round(n * 10) / 10;
  if (p.length === 1) return `M${f(p[0][0])},${f(p[0][1])}`;
  const n = p.length;
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    m.push((p[i + 1][1] - p[i][1]) / (p[i + 1][0] - p[i][0]));
  }
  const t: number[] = [m[0]];
  for (let i = 1; i < n - 1; i++) {
    t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
  }
  t.push(m[n - 2]);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i];
      t[i + 1] = k * b * m[i];
    }
  }
  let d = `M${f(p[0][0])},${f(p[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (p[i + 1][0] - p[i][0]) / 3;
    d += ` C${f(p[i][0] + h)},${f(p[i][1] + t[i] * h)} ${f(p[i + 1][0] - h)},${f(
      p[i + 1][1] - t[i + 1] * h
    )} ${f(p[i + 1][0])},${f(p[i + 1][1])}`;
  }
  return d;
}
