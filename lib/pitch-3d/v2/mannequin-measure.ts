import { add, cross, dot, normalize, scale, sub, type Vec3 } from '@/lib/pitch-3d/linalg';
import type { Metric, MetricKey } from '@/lib/pitch-3d/metrics';
import type { MannequinJoints } from '@/lib/pitch-3d/v2/mannequin-prep';
import type { Frame } from '@/lib/pitch-3d/v2/mannequin-frames';

/**
 * 데생 인형 — 멈췄을 때 보이는 잰 값 다섯과 선 · 호 · 이름표 명세(설계 docs/designs/pitch-3d-mannequin.md §1). 순수 — 화면(lines.ts)과
 * 시험이 같은 코드. 예시 page.js 의 draw '잰 값' · '멈췄을 때' 부분을 그대로 옮겼다(좌표: 미터 · x 홈 쪽 · y 왼쪽 · z 위, 우투 꼴).
 *
 * 숫자의 출처(2026-10-12 김민 결정): 이름표는 늘 보기용 관절로 잰 값 — 그림에 보이는 각도와 같고, 순간에서 숫자가 튀지 않는다.
 * 결과 표(`result.metrics`)는 숫자 칸의 공식 값으로 따로 둔다. 순간(착지 · 릴리스)에 표 값이 있고 둘이 OFF_DEG 넘게 벌어지면 이름표를
 * 흐리게 하고, 누르면 표 값을 보인다(보기용 관절은 떨림 고르기 · 착지 잇기를 거쳐 엔진 원 관절과 몇 도 다를 수 있다).
 */

export type MeasureKey = 'separation' | 'trunk' | 'knee' | 'arm' | 'elbow';

export const MEASURE_LABEL: Record<MeasureKey, string> = {
  separation: '상하체 분리',
  trunk: '몸통 기울기',
  knee: '앞무릎 굽힘',
  arm: '어깨 벌림',
  elbow: '팔꿈치 굽힘',
};

/** 선 · 면 색(예시 LC 그대로) — ref 는 기준선(회색) */
export const MEASURE_COLOR: Record<MeasureKey | 'pelvis' | 'chest' | 'ref', number> = {
  pelvis: 0xff9a4a,
  chest: 0x5cb4ff,
  separation: 0x7be0a8,
  trunk: 0x7be0a8,
  knee: 0xffd166,
  arm: 0xf27bd1,
  elbow: 0xc49bff,
  ref: 0xdfe6ee,
};

export type Measures = Record<MeasureKey, number>;

export type Segment = { a: Vec3; b: Vec3; color: keyof typeof MEASURE_COLOR };
export type Dot = { p: Vec3; color: keyof typeof MEASURE_COLOR };
/** 부채꼴 — 가운데 c 에서 u 쪽부터 v 쪽까지 반지름 r(점들은 호 위, 가운데 점 mid) */
export type Arc = { c: Vec3; points: Vec3[]; mid: Vec3; key: MeasureKey };
/** 이름표와 결과 표가 이만큼(도) 넘게 벌어지면 이름표를 흐리게 */
export const OFF_DEG = 8;

/** 이름표 값 — value 는 보기용(그림) 값, table 은 순간의 표 값(있을 때), off 는 둘이 OFF_DEG 넘게 벌어짐 */
export type LabelValue = { value: number; table?: number; off: boolean };

export type Label = { p: Vec3; key: MeasureKey; name: string } & LabelValue;

export type MeasureSpec = {
  measures: Measures;
  segments: Segment[];
  dots: Dot[];
  arcs: Arc[];
  labels: Label[];
};

const deg = (r: number) => (r * 180) / Math.PI;
const flat = (v: Vec3): Vec3 => normalize([v[0], v[1], 0]);
const mid3 = (a: Vec3, b: Vec3): Vec3 => scale(add(a, b), 0.5);
const angle = (a: Vec3, b: Vec3) => Math.acos(Math.max(-1, Math.min(1, dot(normalize(a), normalize(b)))));
function rotateAxis(v: Vec3, k: Vec3, th: number): Vec3 {
  const c = Math.cos(th);
  const s = Math.sin(th);
  return add(add(scale(v, c), scale(cross(k, v), s)), scale(k, dot(k, v) * (1 - c)));
}

/** 잰 값 다섯(도) — 예시 page.js 와 같은 식 */
export function measureAngles(J: MannequinJoints): Measures {
  const hm = mid3(J.rh, J.lh);
  const shm = mid3(J.sh, J.gs);
  const Tr = normalize(sub(shm, hm));
  let sp = deg(Math.atan2(J.rh[1] - J.lh[1], J.rh[0] - J.lh[0]) - Math.atan2(J.sh[1] - J.gs[1], J.sh[0] - J.gs[0]));
  while (sp > 180) sp -= 360;
  while (sp < -180) sp += 360;
  return {
    separation: Math.abs(sp),
    trunk: Math.abs(deg(Math.atan2(Tr[0], Tr[2]))),
    knee: 180 - deg(angle(sub(J.lh, J.lk), sub(J.la, J.lk))),
    arm: deg(angle(sub(J.el, J.sh), scale(Tr, -1))),
    elbow: 180 - deg(angle(sub(J.sh, J.el), sub(J.wr, J.el))),
  };
}

/**
 * 순간마다 결과 표에서 가져올 지표 — 표의 숫자와 그림의 숫자가 같게(2026-10-11 검토). 팔꿈치 굽힘은 표에 없어 늘 라이브.
 * 니업 순간은 표에 맞는 지표가 없다.
 */
export const MOMENT_METRIC: Record<'footPlant' | 'release', Partial<Record<MeasureKey, MetricKey>>> = {
  footPlant: { separation: 'separationAtPlant', knee: 'leadKneeAtPlant' },
  release: { knee: 'leadKneeAtRelease', arm: 'shoulderAbduction', trunk: 'trunkForwardTilt' },
};

/** 이 장면이 어느 순간인가(아니면 null) */
export function momentOf(
  frame: number,
  events: { kneeUp: number | null; footPlant: number; release: number }
): 'kneeUp' | 'footPlant' | 'release' | null {
  if (frame === events.footPlant) return 'footPlant';
  if (frame === events.release) return 'release';
  if (events.kneeUp != null && frame === events.kneeUp) return 'kneeUp';
  return null;
}

/** 이름표에 붙일 값 — 늘 보기용 값, 순간이면 표 값을 곁에(벌어짐 판정용) */
export function labelValues(
  live: Measures,
  moment: 'kneeUp' | 'footPlant' | 'release' | null,
  metrics: readonly Metric[]
): Record<MeasureKey, LabelValue> {
  const out = {} as Record<MeasureKey, LabelValue>;
  const map = moment === 'footPlant' || moment === 'release' ? MOMENT_METRIC[moment] : {};
  for (const key of Object.keys(live) as MeasureKey[]) {
    const mk = map[key];
    const m = mk ? metrics.find((x) => x.key === mk) : undefined;
    const table = m ? Math.abs(m.value) : undefined;
    out[key] = { value: live[key], table, off: table != null && Math.abs(live[key] - table) > OFF_DEG };
  }
  return out;
}

function arcOf(c: Vec3, u0: Vec3, v0: Vec3, r: number, key: MeasureKey): Arc {
  const u = normalize(u0);
  const v = normalize(v0);
  const th = angle(u, v);
  const ax = cross(u, v);
  if (dot(ax, ax) < 1e-10) {
    const p = add(c, scale(u, r));
    return { c, points: [p], mid: p, key };
  }
  const k = normalize(ax);
  const n = Math.max(6, Math.ceil(th * 20));
  const points: Vec3[] = [];
  for (let i = 0; i <= n; i++) points.push(add(c, scale(rotateAxis(u, k, (th * i) / n), r)));
  return { c, points, mid: add(c, scale(rotateAxis(u, k, th / 2), r)), key };
}

/**
 * 멈춤 화면의 선 · 호 · 이름표 — 예시 page.js draw 의 '멈췄을 때' 그대로. k = 키 / 1.8.
 * 값은 labelValues 로 정한 것(보기용 값 · 순간의 표 값)을 쓴다.
 */
export function measureSpec(
  J: MannequinJoints,
  pelvis: Frame,
  chest: Frame,
  k: number,
  values: Record<MeasureKey, LabelValue>
): MeasureSpec {
  const hm = mid3(J.rh, J.lh);
  const shm = mid3(J.sh, J.gs);
  const Tr = normalize(sub(shm, hm));
  const hz: Vec3 = [0, 0, 1];
  const segments: Segment[] = [];
  const dots: Dot[] = [];
  const arcs: Arc[] = [];
  const labels: Label[] = [];
  const label = (p: Vec3, key: MeasureKey, off: Vec3) =>
    labels.push({ p: add(p, off), key, name: MEASURE_LABEL[key], ...values[key] });

  /* 골반 · 어깨 선(실제 자리) */
  const pd = scale(sub(J.rh, J.lh), 0.5);
  const sd = scale(sub(J.sh, J.gs), 0.5);
  segments.push({ a: sub(hm, scale(pd, 1.6)), b: add(hm, scale(pd, 1.6)), color: 'pelvis' });
  dots.push({ p: J.rh, color: 'pelvis' }, { p: J.lh, color: 'pelvis' });
  segments.push({ a: sub(shm, scale(sd, 1.45)), b: add(shm, scale(sd, 1.45)), color: 'chest' });
  dots.push({ p: J.sh, color: 'chest' }, { p: J.gs, color: 'chest' });

  /* 분리: 위에서 본 두 방향을 허리 높이 한 판에 */
  const wc: Vec3 = [hm[0], hm[1], J.td[2]];
  const u = flat(pd);
  const v = flat(sd);
  const rr = 0.36 * k;
  segments.push({ a: wc, b: add(wc, scale(u, rr * 1.12)), color: 'pelvis' });
  segments.push({ a: wc, b: add(wc, scale(v, rr * 1.12)), color: 'chest' });
  const sa = arcOf(wc, u, v, rr * 0.8, 'separation');
  arcs.push(sa);
  label(sa.mid, 'separation', scale(normalize(sub(sa.mid, wc)), 0.13 * k));

  /* 몸통 기울기: 수직선과 몸통 축 */
  segments.push({ a: hm, b: add(hm, scale(Tr, Math.hypot(...sub(shm, hm)) * 1.3)), color: 'trunk' });
  segments.push({ a: hm, b: add(hm, scale(hz, 0.36 * k)), color: 'ref' });
  const ta = arcOf(hm, hz, Tr, 0.22 * k, 'trunk');
  arcs.push(ta);
  label(ta.mid, 'trunk', add([0, 0, 0.05 * k], scale(flat(Tr), 0.12 * k)));

  /* 앞무릎 굽힘: 허벅지 연장선과 정강이 */
  const th = normalize(sub(J.lk, J.lh));
  const sn = sub(J.la, J.lk);
  segments.push({ a: J.lk, b: add(J.lk, scale(th, 0.2 * k)), color: 'ref' });
  const ka = arcOf(J.lk, th, sn, 0.14 * k, 'knee');
  arcs.push(ka);
  label(ka.mid, 'knee', scale(normalize(sub(ka.mid, J.lk)), 0.12 * k));

  /* 어깨 벌림: 몸통 아래쪽과 위팔 */
  const ua = sub(J.el, J.sh);
  segments.push({ a: J.sh, b: sub(J.sh, scale(Tr, 0.2 * k)), color: 'ref' });
  const aa = arcOf(J.sh, scale(Tr, -1), ua, 0.15 * k, 'arm');
  arcs.push(aa);
  label(aa.mid, 'arm', scale(normalize(sub(aa.mid, J.sh)), 0.12 * k));

  /* 팔꿈치 굽힘: 위팔 연장선과 아래팔 */
  segments.push({ a: J.el, b: add(J.el, scale(normalize(ua), 0.16 * k)), color: 'ref' });
  const ea = arcOf(J.el, ua, sub(J.wr, J.el), 0.1 * k, 'elbow');
  arcs.push(ea);
  label(ea.mid, 'elbow', scale(normalize(sub(ea.mid, J.el)), 0.11 * k));

  return { measures: measureAngles(J), segments, dots, arcs, labels };
}

/** 몸통 축(골반 가운데 → 어깨 가운데) — 화면의 뼈 · 선도 같은 것을 쓴다 */
export function trunkAxis(J: MannequinJoints): Vec3 {
  return normalize(sub(mid3(J.sh, J.gs), mid3(J.rh, J.lh)));
}

/** 골반 · 가슴 틀은 선 명세에 안 쓰지만, 화면이 뼈 고리를 놓을 때 같이 넘긴다 — 타입만 다시 내보냄 */
export type { Frame as MeasureFrame };
