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
 * 최대 분리 시점 — 착지 무렵 · 직후(공개 자료, 숫자 없음)를 착지 ±50ms 로 두고, 엔진 오차 30ms × 2 를 더한 ±110ms 밖이면 고칠 점.
 * 찾는 구간이 착지 150ms 전부터라(mech-checks SEPARATION_PRE_PLANT_S) 아주 이른 투구는 −150 근처로 잡힌다 — 그래도 이른 쪽으로 판정된다.
 */
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

  /* 최대 분리 시점 */
  {
    const ms = list.flatMap((m) =>
      ok(m.separation.conf) ? [m.separation.peakMs] : []
    );
    const deg = list.flatMap((m) =>
      ok(m.separation.conf) ? [m.separation.peakDeg] : []
    );
    const base = {
      key: 'separation' as const,
      title: '상하체 분리',
      focus: '상하체 분리' as const,
      shown: true,
    };
    if (!ms.length) items.push({ ...base, status: 'unsure', line: UNSURE, detail: '' });
    else {
      const t = avg(ms);
      const detail = `골반과 어깨가 가장 크게 벌어진 때 ${signMs(t)} · ${Math.round(avg(deg))}°`;
      if (t < -SEP_FAR_MS)
        items.push({
          ...base,
          status: 'improve',
          line: '착지 전에 상체가 일찍 열려요. 골반이 먼저 돌고 어깨는 늦게 따라오게 해 보세요',
          detail,
        });
      else if (t > SEP_FAR_MS)
        items.push({
          ...base,
          status: 'improve',
          line: '골반과 어깨가 가장 크게 벌어지는 때가 착지보다 늦어요',
          detail,
        });
      else if (Math.abs(t) <= SEP_NEAR_MS)
        items.push({
          ...base,
          status: 'good',
          line: '골반과 어깨가 착지 무렵에 가장 크게 벌어져요',
          detail,
        });
      else
        items.push({
          ...base,
          status: 'fair',
          line: '골반과 어깨가 가장 크게 벌어지는 때가 착지에서 조금 떨어져 있어요',
          detail,
        });
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
