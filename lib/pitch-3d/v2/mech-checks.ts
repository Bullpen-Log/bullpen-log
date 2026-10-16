/**
 * 메커니즘 점검 넷 — 드리프트 · 착지 골반 수평 · 최대 상하체 분리 시점 · 리드레그 블록(순수 계산, 판정 없음).
 *
 * 설계 docs/designs/pitch-mechanics-checks.md. 식은 마커 정답지로 엔진 정확도를 잰 스크립트(scripts/pitch-lab/markers/selfcal/
 * mech_checks.py)와 같다 — 정확도 표(2절)는 이 식의 것이니 식을 바꾸면 그 스크립트도 같이 바꿔 다시 잰다.
 * 결과 좌표는 [앞, 위, 옆] · 키 = 1000mm(contract.ts) — 앞 = 니업 → 착지 사이 골반이 나아간 쪽(수평)이라 맞춤 스크립트의 F 와 같다.
 * 길이는 키 비율로 내고, 키(cm)를 알면 cm 도 함께 낸다. 판정 · 문턱은 이 파일 밖(3단계).
 */
import { V2J, plantFrame, type Pitch3dV2Ok, type V2JointName } from '@/lib/pitch-3d/v2/contract';
import { angleDeg, mid, sub, type Vec3 } from '@/lib/pitch-3d/linalg';

/** 최대 분리를 찾는 구간의 시작 — 착지 이만큼 전부터 릴리스까지(sep_timing.py '좁힘': 니업부터 찾으면 다리 들 때 평평한 투구가 튄다) */
export const SEPARATION_PRE_PLANT_S = 0.15;
/**
 * 몸통이 도는 때 — 어깨선(위에서 본 각)이 '착지 − 0.4구간 ~ 공 놓기 + 0.3구간' 동안 돈 양의 절반을 지나는 때를 착지 → 공 놓기 사이 %로.
 * 구간 = 착지 → 공 놓기 시간이라 슬로모 배수와 상관없다. 2026-10-14 김민: "대략적인 타이밍만 맞으면 된다".
 * 각속도 꼭대기는 우리 엔진이 어깨 회전을 시간으로 다듬어 정할 수 없었다(착지 뒤 두 번 비슷하게 높아 엔진 · 4대 교차가 다른 혹을 골랐다).
 * 절반 지점은 다듬기에 덜 흔들린다 — 마커 15구 엔진 vs 4대 교차 차이 +1 ± 6ms(상관 0.98), 착지 → 공 놓기 % 로 ±5%p.
 * 골반 쪽 시점은 엉덩이 점이 몸통에 붙어 돌아(15구 중 9구 골반 · 어깨 꼭대기가 같은 장면) 안 잰다.
 */
export const TRUNK_HALF_PRE = 0.4;
export const TRUNK_HALF_POST = 0.3;
/** 그 사이 어깨선이 이만큼(°)도 안 돌면 재지 않는다 */
export const TRUNK_HALF_MIN_DEG = 20;

export type MechChecksInput = Pick<Pitch3dV2Ok, 'joints' | 't' | 'events' | 'hand'> &
  Partial<Pick<Pitch3dV2Ok, 'conf'>>;

export type MechChecks = {
  /** 던지는 손 — 판정이 손별 기준을 고른다 */
  hand: 'R' | 'L';
  /** 니업이 없으면 null */
  drift: {
    /** 니업 때 골반 가운데가 축발 발목보다 앞(키 비율 · cm) */
    aheadAtKneeUp: number;
    aheadAtKneeUpCm: number | null;
    /** 첫 장면 → 니업 사이 골반이 축발 기준으로 앞으로 간 거리(키 비율 · cm) */
    travel: number;
    travelCm: number | null;
    /** 니업 때 골반이 앞으로 가는 빠르기(키/초 · m/s) */
    speed: number;
    speedMs: number | null;
    conf: number | null;
  } | null;
  /** 착지 때 엉덩이선 옆 기울기 — + = 글러브 쪽 엉덩이가 높음(°). 엔진 정확도가 낮아(스티커 정답과 4.5°) 화면에는 안 낸다 */
  pelvisLevel: { tiltDeg: number; conf: number | null };
  separation: {
    /** 최대 분리 장면 번호 · 착지 기준 시각(ms, − = 착지 전) */
    frame: number;
    peakMs: number;
    /** 그때 분리(°, 골반이 어깨보다 홈 쪽으로 더 열린 만큼) */
    peakDeg: number;
    /** 착지 순간 분리(°) — 드라이브라인 지표 '착지 때 골반-몸통 분리'와 같은 뜻 */
    atPlantDeg: number;
    /**
     * 착지 순간 몸통(어깨선) · 골반(엉덩이선)이 디딤 방향 쪽으로 열린 각도(°) — 0 = 옆으로 선 자세(앞 어깨 · 앞 엉덩이가 디딘 쪽을 봄), 90 = 마주 봄.
     * 드라이브라인 지표 torso_rotation_fp · pelvis_rotation_fp 와 같은 뜻(분리 = 골반 − 몸통). 몸통이 크게 열려 있으면 '일찍 열림'.
     */
    trunkOpenAtPlantDeg: number;
    pelvisOpenAtPlantDeg: number;
    /** 몸통(어깨선)이 돈 양의 절반을 지나는 때 — 착지 → 공 놓기 사이 %(0 = 착지, 100 = 공 놓기). 못 재면 null */
    trunkHalfPct: number | null;
    /** 그때와 가장 가까운 장면(그 순간 보기) */
    trunkHalfFrame: number | null;
    /** 몸통 점검(도는 때 · 착지 때 열림)이 쓴 어깨 확신 — 착지 ~ 공 놓기 평균 */
    trunkConf: number | null;
    conf: number | null;
  };
  block: {
    /** 골반 앞 빠르기가 착지 전 최고 → 릴리스 사이 줄어든 몫(%) — 블록의 주 지표 */
    pelvisDecelPct: number;
    /** 앞무릎 굽힘(°, 0 = 곧게) */
    kneeAtPlantDeg: number;
    kneeAtReleaseDeg: number;
    /** 착지 → 릴리스 펴진 만큼(°, + = 펴짐) */
    kneeExtensionDeg: number;
    /** 착지 뒤 더 굽어 들어간 만큼(°) — 주저앉음 */
    kneeCollapseDeg: number;
    conf: number | null;
  };
};

const wrap = (d: number) => ((((d + 180) % 360) + 360) % 360) - 180;
/** 수평면(앞 · 옆) 방향각 */
const yaw = (v: Vec3) => (Math.atan2(v[2], v[0]) * 180) / Math.PI;

export function mechChecks(r: MechChecksInput, heightCm?: number | null): MechChecks {
  const n = r.joints.length;
  /* 착지 = 앞발이 처음 닿은 장면(2026-10-16 김민 — 기준표 fp_10 과 같은 순간) — 옛 결과는 발목이 닿은 장면 */
  const fp = plantFrame(r.events);
  const rl = r.events.release;
  const ku = r.events.kneeUp;
  const P = (k: number, name: V2JointName): Vec3 => r.joints[k][V2J[name]] as Vec3;
  const hip = (k: number) => mid(P(k, 'lHip'), P(k, 'rHip'));
  // 던지는 쪽 = 축발 · 뒤 엉덩이, 반대쪽 = 앞다리 · 글러브 쪽
  const back = r.hand === 'R' ? 'r' : 'l';
  const lead = r.hand === 'R' ? 'l' : 'r';
  const J = (side: 'l' | 'r', part: 'Hip' | 'Kn' | 'An') =>
    (side + part) as V2JointName;
  const cm = (v: number) => (heightCm ? v * heightCm : null);
  const at = (k: number) => Math.min(n - 1, Math.max(0, k));
  /* 확신(0~100) — 그 점검이 쓴 관절 · 장면의 평균. 확신이 없는 옛 결과면 null */
  const confOf = (names: V2JointName[], ks: number[]) => {
    if (!r.conf) return null;
    let s = 0;
    let c = 0;
    for (const k of ks)
      for (const nm of names) {
        s += r.conf[at(k)][V2J[nm]];
        c++;
      }
    return c ? s / c : null;
  };
  /* 골반 앞 빠르기(키/초) — 앞뒤 한 장면 */
  const vFwd = (k: number) => {
    const a = at(k - 1);
    const b = at(k + 1);
    return (hip(b)[0] - hip(a)[0]) / 1000 / Math.max(r.t[b] - r.t[a], 1e-6);
  };

  /* 1 드리프트 */
  let drift: MechChecks['drift'] = null;
  if (ku != null) {
    const ahead = (k: number) => (hip(k)[0] - P(k, J(back, 'An'))[0]) / 1000;
    const a = at(ku - 2);
    const b = at(ku + 2);
    const speed = (hip(b)[0] - hip(a)[0]) / 1000 / Math.max(r.t[b] - r.t[a], 1e-6);
    const aheadAtKneeUp = ahead(ku);
    const travel = aheadAtKneeUp - ahead(0);
    drift = {
      aheadAtKneeUp,
      aheadAtKneeUpCm: cm(aheadAtKneeUp),
      travel,
      travelCm: cm(travel),
      speed,
      speedMs: heightCm ? (speed * heightCm) / 100 : null,
      conf: confOf(['lHip', 'rHip', J(back, 'An')], [0, ku]),
    };
  }

  /* 2 착지 골반 수평 */
  const hv = sub(P(fp, J(lead, 'Hip')), P(fp, J(back, 'Hip')));
  const pelvisLevel = {
    tiltDeg: (Math.atan2(hv[1], Math.hypot(hv[0], hv[2])) * 180) / Math.PI,
    conf: confOf(['lHip', 'rHip'], [fp]),
  };

  /* 3 최대 분리 시점 — 골반이 어깨보다 홈 쪽으로 더 열린 만큼(수평면, +). 어깨선 방향 − 엉덩이선 방향(왼 − 오른)이 우투는 그대로,
     좌투는 거울이라 부호만 바꾼다. 부호를 '니업 ~ 착지 가운데값'으로 정하면 그 구간 분리가 0 근처인 투구에서 뒤집혀
     릴리스 무렵 어깨가 골반을 지나가는 반대 분리를 잡았다(마커 정답 2026-10-13) — 손으로 정한다 */
  const sg = r.hand === 'R' ? 1 : -1;
  const sep = (k: number) =>
    sg *
    wrap(yaw(sub(P(k, 'lSh'), P(k, 'rSh'))) - yaw(sub(P(k, 'lHip'), P(k, 'rHip'))));
  /* 열림(°) — 앞쪽(글러브 쪽) − 뒤쪽 점 선이 앞 축에서 홈과 마주 보는 쪽으로 돈 만큼. 우투는 앞쪽이 왼쪽이라 방향각이 줄며 열린다 */
  /* 기준 방향 = 디딤 방향(니업 때 축발 발목 → 착지 때 앞발 발목, 수평). 결과의 앞 축(골반이 나아간 쪽)을 기준으로 하면 마커 정답과
     열림이 14° 어긋났다(상관 0.92) — 영상으로는 홈 방향을 모르니 둘 다 몸으로 정하는 디딤 방향으로 맞춘다 */
  const strideYaw = yaw(sub(P(fp, J(lead, 'An')), P(ku ?? 0, J(back, 'An'))));
  const open = (part: 'Sh' | 'Hip', k: number) =>
    -sg *
    wrap(
      yaw(sub(P(k, (lead + part) as V2JointName), P(k, (back + part) as V2JointName))) -
        strideYaw
    );
  let k0 = fp;
  while (k0 > 0 && r.t[fp] - r.t[k0 - 1] <= SEPARATION_PRE_PLANT_S + 1e-9) k0--;
  let kp = k0;
  for (let k = k0; k <= rl; k++) if (sep(k) > sep(kp)) kp = k;
  /* 몸통이 도는 때 — 어깨선이 돈 양의 절반 */
  const span = r.t[rl] - r.t[fp];
  let trunkHalfPct: number | null = null;
  let trunkHalfFrame: number | null = null;
  if (span > 0) {
    let a = fp;
    while (a > 0 && r.t[a - 1] >= r.t[fp] - TRUNK_HALF_PRE * span) a--;
    let b = rl;
    while (b < n - 1 && r.t[b + 1] <= r.t[rl] + TRUNK_HALF_POST * span) b++;
    const ys: number[] = [];
    for (let k = a; k <= b; k++) {
      const y = yaw(sub(P(k, 'lSh'), P(k, 'rSh')));
      ys.push(ys.length ? ys[ys.length - 1] + wrap(y - ys[ys.length - 1]) : y);
    }
    const total = ys[ys.length - 1] - ys[0];
    if (Math.abs(total) >= TRUNK_HALF_MIN_DEG) {
      for (let i = 1; i < ys.length; i++) {
        const f0 = (ys[i - 1] - ys[0]) / total;
        const f1 = (ys[i] - ys[0]) / total;
        if (f1 >= 0.5) {
          const w = f1 > f0 ? (0.5 - f0) / (f1 - f0) : 0;
          const th = r.t[a + i - 1] + w * (r.t[a + i] - r.t[a + i - 1]);
          trunkHalfPct = ((th - r.t[fp]) / span) * 100;
          trunkHalfFrame = w < 0.5 ? a + i - 1 : a + i;
          break;
        }
      }
    }
  }
  const separation = {
    frame: kp,
    peakMs: (r.t[kp] - r.t[fp]) * 1000,
    peakDeg: sep(kp),
    atPlantDeg: sep(fp),
    trunkOpenAtPlantDeg: open('Sh', fp),
    pelvisOpenAtPlantDeg: open('Hip', fp),
    trunkHalfPct,
    trunkHalfFrame,
    trunkConf: confOf(['lSh', 'rSh'], Array.from({ length: rl - fp + 1 }, (_, i) => fp + i)),
    conf: confOf(['lSh', 'rSh', 'lHip', 'rHip'], [kp]),
  };

  /* 4 리드레그 블록 */
  const knee = (k: number) =>
    180 -
    angleDeg(
      sub(P(k, J(lead, 'Hip')), P(k, J(lead, 'Kn'))),
      sub(P(k, J(lead, 'An')), P(k, J(lead, 'Kn')))
    );
  let pk = -Infinity;
  for (let k = ku ?? 0; k <= fp; k++) pk = Math.max(pk, vFwd(k));
  let worst = knee(fp);
  for (let k = fp; k <= rl; k++) worst = Math.max(worst, knee(k));
  const kneeAtPlantDeg = knee(fp);
  const kneeAtReleaseDeg = knee(rl);
  const plantToRelease = Array.from({ length: rl - fp + 1 }, (_, i) => fp + i);
  const block = {
    pelvisDecelPct: pk > 0 ? ((pk - vFwd(rl)) / pk) * 100 : NaN,
    kneeAtPlantDeg,
    kneeAtReleaseDeg,
    kneeExtensionDeg: kneeAtPlantDeg - kneeAtReleaseDeg,
    kneeCollapseDeg: worst - kneeAtPlantDeg,
    conf: confOf([J(lead, 'Hip'), J(lead, 'Kn'), J(lead, 'An')], plantToRelease),
  };

  return { hand: r.hand, drift, pelvisLevel, separation, block };
}
