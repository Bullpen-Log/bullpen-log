/**
 * 메커니즘 점검 판정 — mechChecks 값(한 구 또는 여러 구)을 '좋아요 · 보통 · 고칠 점 · 판정 안 함' 으로(순수).
 *
 * 규칙(docs/designs/pitch-mechanics-checks.md 3절):
 * - 공개 자료에 숫자가 있는 것만 문턱으로 쓰고, '고칠 점' 은 그 문턱에서 엔진 오차의 2배를 넘게 벗어날 때만.
 *   엔진 오차는 마커 정답지 15구(2026-10-12 촬영, 우투 한 명 · 약 70% 강도)로 잰 가운데값 — 다른 투수 · 촬영에서는 더 클 수 있다.
 * - 치우침(블록 무릎 펴짐 −5.6° 등)은 보정하지 않고 문턱을 넓혀 다룬다(김민 결정 2026-10-13 — 한 사람 · 하루 자료라).
 * - 여러 구면 값을 평균해 판정한다. 세 구 밑이면 참고용(tentative).
 * - 골반 수평은 엔진 정확도가 낮아(정답과 2.1° · 상관 0.33) 화면에 안 낸다(shown false).
 * 글은 해요체 · 줄표 없이 · 코칭 기관 이름 없이(2026-10-09 규칙).
 */
import type { FOCUS_POINTS } from '@/lib/exercise-meta';
import type { MechChecks } from '@/lib/pitch-3d/v2/mech-checks';

type FocusPoint = (typeof FOCUS_POINTS)[number];

/** 이 확신(0~100, 그 점검이 쓴 관절 · 장면 평균) 밑이면 판정하지 않는다 — 마커 15구는 35~67 */
export const MECH_CONF_MIN = 30;
/** 이만큼 구를 봐야 참고용 딱지를 뗀다 */
export const MECH_PITCHES_SURE = 3;
/** 점검이 잇는 드릴 요소(MechanicsGuide.focusPoints) — 화면이 이 요소들의 드릴만 미리 받는다 */
export const MECH_FOCUS_POINTS = [
  '드리프트',
  '상하체 분리',
  '브레이크',
] as const satisfies readonly FocusPoint[];

/**
 * 드리프트 — 니업 때 균형점이 투구판 앞 15~20cm(공개 자료). 우리 값은 골반 가운데가 축발 발목보다 앞(키 비율)이라
 * 키 175cm 투수의 15cm = 0.086. 엔진 오차 2.4cm(0.014) × 2 를 빼 0.06(175cm 에서 10.5cm) 밑이면 고칠 점. 많은 쪽은 숫자가 없어 안 본다.
 */
export const DRIFT_GOOD = 0.086;
export const DRIFT_LOW = 0.06;
/**
 * 상하체 분리(2026-10-13 김민: "드라이브라인 · 트레드 기준으로 정확하게") — 뜻은 드라이브라인과 같다: 골반 회전 − 몸통 회전(수직축, 골반이
 * 먼저 열리면 +). 숫자 기준은 드라이브라인이 공개한 투수 자료(OpenBiomechanics poi_metrics, 100명 · 411구, 대학 위주, 평균 84.7mph)뿐이다 —
 * 최대 분리 32.3 ± 6.6°, 최대는 착지 값보다 가운데 1.4° 큼(69% 가 3° 안 — 착지 무렵에 가장 크다), 구속과 상관 0.30(선수 평균).
 * **좌투가 같은 구속대에서도 약 3° 낮아**(78~84mph 30.4 · 27.6°, 84~88mph 34.8 · 31.7°) 기준을 손별로 둔다 —
 * 우투 78명 · 328구 아래 10 / 25 / 50% 24.8 / 28.2 / 33.3°, 좌투 22명 · 83구 22.0 / 24.3 / 30.2°(좌투는 표본이 작다).
 * 트레드는 숫자 없이 '착지 때 몸통이 닫혀 있어야 한다 · 일찍 열리면(flying open) 밀어 던진다', 그리고 '분리를 억지로 만들지 말 것'
 * (엉덩이 안쪽 돌림이 안 되는 투수가 분리 드릴로 3~5mph 잃은 예)을 가르친다 — 고칠 점 글이 '억지로 비틀기보다'로 시작하는 까닭.
 * - 크기: 그 손의 아래 25% 이상이면 좋아요, 그 밑은 보통, 아래 10% 에서 엔진 오차 3.4° × 2 를 더 뺀 값(우투 18.0 · 좌투 15.2°) 밑이면 고칠 점.
 *   주의 — 자료는 마커 몸통(흉곽) 틀, 우리는 어깨 · 엉덩이 점 선이라 절대값이 몇 도 다를 수 있다(마커 정답 K4 와는 3.4° · 치우침 −1.6°).
 *   같은 선수의 구마다 흔들림은 자료에서 0.9° 인데 엔진 한 구 오차는 3.4° — 여러 구 평균으로 봐야 한다(세 구 밑은 참고용).
 * - 시점: 착지 무렵(±50ms, 자료의 '착지 무렵'을 우리 오차 30ms 로 읽음)이 좋고, 착지 110ms(± + 오차 × 2) 넘게 이르면 몸통이 일찍 열린 것으로 고칠 점.
 *   늦은 쪽은 자료에 문턱이 없어 보통까지만. 골반 → 몸통 회전 속도 꼭대기 사이 0.05초는 2018년 한 선수 예시였고(드라이브라인도 0.039초를 '꽤 좋다'),
 *   공개 자료는 가운데 0.008초 · 0.05초 넘는 구 7% 라 쓰지 않는다. 우리 엔진은 각속도도 못 잰다(팔 가속 때 골반 오차 18~29°).
 * 찾는 구간이 착지 150ms 전부터라(mech-checks SEPARATION_PRE_PLANT_S) 아주 이른 투구는 −150 근처로 잡힌다 — 그래도 이른 쪽으로 판정된다.
 */
export const SEP_ERR_DEG = 3.4;
export const SEP_NORM = {
  R: { athletes: 78, p10: 24.8, p25: 28.2, p50: 33.3 },
  L: { athletes: 22, p10: 22.0, p25: 24.3, p50: 30.2 },
} as const;
/** 고칠 점 문턱 — 그 손 아래 10% 에서 엔진 오차 × 2 를 뺀 값 */
export const sepSmallDeg = (hand: 'R' | 'L') => SEP_NORM[hand].p10 - 2 * SEP_ERR_DEG;
export const SEP_NEAR_MS = 50;
export const SEP_FAR_MS = 110;
/**
 * 리드레그 블록 — 주 지표는 골반 앞 빠르기가 착지 전 최고 → 릴리스 사이 줄어든 몫, 무릎은 보조(주저앉음만).
 * 공개 자료는 '골반(무게중심)이 덜 멈추고 앞무릎이 착지보다 더 굽어 들어가는' 쪽이 고칠 여지가 가장 크다고 하지만 숫자 문턱은 없다.
 * 그래서 우리 문턱(가정): 골반 감속 70% 밑(엔진 오차 10%p · 치우침 −4.4%p, 마커 투수 79~105%) 그리고 앞무릎이 착지보다
 * 15° 넘게 더 굽음(엔진 오차 5° × 2 + 치우침 5.6°) — 둘 다일 때만 고칠 점, 하나만이면 보통.
 */
export const BLOCK_DECEL_LOW = 70;
export const BLOCK_COLLAPSE_DEG = 15;

export type MechKey = 'drift' | 'separation' | 'block' | 'pelvisLevel';
export type MechStatus = 'good' | 'fair' | 'improve' | 'unsure';
export type MechVerdict = {
  key: MechKey;
  title: string;
  status: MechStatus;
  /** 한 줄(해요체) */
  line: string;
  /** 숫자 한 줄 — 누르면 보이는 자세히 */
  detail: string;
  /** 드릴 꼬리표(MechanicsGuide.focusPoints) */
  focus: FocusPoint;
  /** false 면 화면에 안 낸다 */
  shown: boolean;
};
export type MechJudgement = {
  pitches: number;
  tentative: boolean;
  items: MechVerdict[];
};

const UNSURE = '영상에서 이 부분이 잘 안 보여 판정하지 않았어요';
const avg = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
const ok = (c: number | null | undefined) => c == null || c >= MECH_CONF_MIN;
const signMs = (ms: number) =>
  Math.abs(ms) < 1
    ? '착지 때'
    : ms < 0
      ? `착지 ${Math.round(-ms)}ms 전`
      : `착지 ${Math.round(ms)}ms 뒤`;

export function judgeMechanics(
  list: MechChecks[],
  heightCm?: number | null
): MechJudgement {
  const items: MechVerdict[] = [];

  /* 드리프트 */
  {
    const xs = list.flatMap((m) =>
      m.drift && ok(m.drift.conf) ? [m.drift.aheadAtKneeUp] : []
    );
    const base = {
      key: 'drift' as const,
      title: '드리프트',
      focus: '드리프트' as const,
      shown: true,
    };
    if (!xs.length) items.push({ ...base, status: 'unsure', line: UNSURE, detail: '' });
    else {
      const a = avg(xs);
      const amount = heightCm
        ? `${Math.round(a * heightCm)}cm`
        : `키의 ${Math.round(a * 100)}%`;
      const detail = `다리를 가장 높이 들었을 때 골반이 축발보다 ${amount} 앞`;
      if (a < DRIFT_LOW)
        items.push({
          ...base,
          status: 'improve',
          line: '다리를 들 때 몸이 투구판 위에 머물러요. 무게를 홈 쪽으로 옮겨 보세요',
          detail,
        });
      else if (a < DRIFT_GOOD)
        items.push({
          ...base,
          status: 'fair',
          line: '다리를 들 때 홈 쪽으로 조금 나가요',
          detail,
        });
      else
        items.push({
          ...base,
          status: 'good',
          line: '다리를 들 때 몸이 홈 쪽으로 잘 나가요',
          detail,
        });
    }
  }

  /* 상하체 분리 — 크기(최대) + 시점. 둘 중 나쁜 쪽 */
  {
    const use = list.filter((m) => ok(m.separation.conf));
    const base = {
      key: 'separation' as const,
      title: '상하체 분리',
      focus: '상하체 분리' as const,
      shown: true,
    };
    if (!use.length)
      items.push({ ...base, status: 'unsure', line: UNSURE, detail: '' });
    else {
      const t = avg(use.map((m) => m.separation.peakMs));
      const d = avg(use.map((m) => m.separation.peakDeg));
      const hand = use[0].hand;
      const N = SEP_NORM[hand];
      const detail = `가장 크게 벌어진 때 ${signMs(t)} · ${Math.round(d)}° (${hand === 'R' ? '우투' : '좌투'} ${N.athletes}명 자료 가운데 ${Math.round(N.p50)}°, 아래 10% ${Math.round(N.p10)}°)`;
      const v = (status: MechStatus, line: string) =>
        items.push({ ...base, status, line, detail });
      if (t < -SEP_FAR_MS)
        v(
          'improve',
          '착지 전에 몸통이 일찍 열려요. 골반이 먼저 돌고 몸통은 늦게 따라오게 해 보세요'
        );
      else if (d < sepSmallDeg(hand))
        v(
          'improve',
          '골반과 몸통이 거의 같이 돌아요. 억지로 비틀기보다 골반이 먼저 열리게 해 보세요'
        );
      else if (d < N.p25) v('fair', '골반과 몸통 사이 꼬임이 평균보다 적은 편이에요');
      else if (t > SEP_FAR_MS)
        v('fair', '골반과 몸통이 가장 크게 벌어지는 때가 착지보다 늦어요');
      else if (Math.abs(t) > SEP_NEAR_MS)
        v('fair', '골반과 몸통이 가장 크게 벌어지는 때가 착지에서 조금 떨어져 있어요');
      else v('good', '골반이 먼저 열리고 몸통이 늦게 따라와요');
    }
  }

  /* 리드레그 블록 */
  {
    const use = list.filter(
      (m) => ok(m.block.conf) && Number.isFinite(m.block.pelvisDecelPct)
    );
    const base = {
      key: 'block' as const,
      title: '앞다리 버티기',
      focus: '브레이크' as const,
      shown: true,
    };
    if (!use.length)
      items.push({ ...base, status: 'unsure', line: UNSURE, detail: '' });
    else {
      const decel = avg(use.map((m) => m.block.pelvisDecelPct));
      const ext = avg(use.map((m) => m.block.kneeExtensionDeg));
      const leak = decel < BLOCK_DECEL_LOW;
      const sink = -ext > BLOCK_COLLAPSE_DEG;
      const knee =
        Math.abs(ext) < 1
          ? '그대로'
          : ext > 0
            ? `${Math.round(ext)}° 펴짐`
            : `${Math.round(-ext)}° 더 굽음`;
      const detail = `착지 → 릴리스 골반 앞 빠르기 ${Math.round(decel)}% 줄어듦 · 앞무릎 ${knee}`;
      if (leak && sink)
        items.push({
          ...base,
          status: 'improve',
          line: '착지 뒤 앞무릎이 굽어 들어가고 골반이 계속 앞으로 나가요',
          detail,
        });
      else if (leak)
        items.push({
          ...base,
          status: 'fair',
          line: '착지 뒤 골반이 조금 덜 멈춰요',
          detail,
        });
      else if (sink)
        items.push({
          ...base,
          status: 'fair',
          line: '골반은 잘 멈추지만 앞무릎이 조금 굽어 들어가요',
          detail,
        });
      else
        items.push({
          ...base,
          status: 'good',
          line: '앞다리가 몸을 잘 멈춰요',
          detail,
        });
    }
  }

  /* 착지 골반 수평 — 계산만(화면에 안 냄) */
  {
    const xs = list.flatMap((m) =>
      ok(m.pelvisLevel.conf) ? [m.pelvisLevel.tiltDeg] : []
    );
    items.push({
      key: 'pelvisLevel',
      title: '착지 골반 수평',
      status: 'unsure',
      line: '아직 정확히 재지 못해 보여 드리지 않아요',
      detail: xs.length ? `착지 때 글러브 쪽 엉덩이가 ${avg(xs).toFixed(1)}° 높음` : '',
      focus: '드롭',
      shown: false,
    });
  }

  return { pitches: list.length, tentative: list.length < MECH_PITCHES_SURE, items };
}
