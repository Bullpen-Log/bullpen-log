import { isRestSession } from '@/lib/session-type';
import { intensityLevel } from '@/lib/exercise-meta';

/**
 * 운동으로 쓴 칼로리(OUT) — 그날 적어 둔 기록에서 대략 셈한다.
 *
 * 인아웃은 운동 시간과 강도를 따로 적게 하지만, 이 앱에는 이미 트레이닝 기록과
 * 투구 기록이 있다. 같은 것을 두 번 적게 하지 않고 거기서 가져온다.
 *
 *   쓴 칼로리 = (MET − 1) × 3.5 × 체중(kg) ÷ 200 × 분
 *
 * MET 는 쉬고 있을 때의 몇 배로 힘을 쓰는가다. 1 을 빼는 까닭: 쉬어도 쓰는
 * 몫(기초대사)은 하루 목표에 이미 들어 있어서, 그대로 더하면 두 번 센다.
 *
 * 어디까지나 짐작이다. 같은 45분이라도 사람마다 20~30% 는 다르다. 화면에도
 * '대략'이라고 적는다.
 */

export type BurnItem = {
  kind: 'training' | 'pitching';
  label: string;
  minutes: number;
  kcal: number;
};

/** 웨이트 트레이닝, 힘들게 — Compendium of Physical Activities 02050(5.0 MET) */
const STRENGTH_MET = 5;

/**
 * 공 하나에 드는 시간(초). 던지고, 받고, 숨 고르는 것까지.
 * 불펜 40구가 대략 15~20분 걸린다.
 */
const SECONDS_PER_PITCH = 25;

export function kcalFor(met: number, weightKg: number, minutes: number) {
  return Math.max(0, ((met - 1) * 3.5 * weightKg * minutes) / 200);
}

/** 한 판에서 한 운동 — 분류 · 강도(라이브러리 이름) · 남긴 세트 수 */
export type BurnMixItem = { category: string; intensity: string; sets: number };

/**
 * 운동 하나의 MET — 라이브러리 강도(매우 낮음 ~ 매우 높음)와 분류로(Compendium of Physical Activities 어림).
 *   스트레칭 · 가동성 2.3(02101) → 가벼운 맨몸 3.5 → 보통 웨이트 3.5~5(02054) → 힘든 웨이트 6(02050 위쪽)
 *   유산소는 걷기 3 ~ 힘든 자전거 · 달리기 10. 파워(점프 · 메디신볼)는 같은 강도의 웨이트보다 1 높게.
 */
export function exerciseMet(category: string, intensity: string): number {
  const level = Math.min(5, Math.max(1, intensityLevel(intensity)));
  if (category === '유산소') return [3, 4.5, 6, 8, 10][level - 1];
  if (category === '모빌리티' || category === '워밍업') return 2.3;
  const base = [2.3, 3, 4, 5, 6][level - 1];
  return category === '파워' ? base + 1 : base;
}

/**
 * 트레이닝 한 판. 본운동 시간만 센다(워밍업은 빠진다 — TrainingSession.activeSeconds).
 *
 * 2026-10-12 사용자: "오늘 수행한 운동들의 강도와 수행시간으로". 남긴 세트가 있으면 본운동 시간을 세트 수 몫으로 운동마다
 * 나눠 그 운동의 MET(exerciseMet)로 센다 — 세트 수 가중 평균 MET 와 같다. 세트가 없으면(옛 판 · 체크만 한 날) 예전처럼
 * 힘든 웨이트 하나(5 MET)로 본다.
 */
export function trainingBurn(
  activeSeconds: number,
  weightKg: number,
  mix: readonly BurnMixItem[] = []
): BurnItem | null {
  const minutes = Math.round(activeSeconds / 60);
  if (minutes < 1) return null;
  const sets = mix.reduce((n, m) => n + m.sets, 0);
  const met =
    sets > 0
      ? mix.reduce((sum, m) => sum + exerciseMet(m.category, m.intensity) * m.sets, 0) / sets
      : STRENGTH_MET;
  return {
    kind: 'training',
    label: `트레이닝 ${minutes}분`,
    minutes,
    kcal: Math.round(kcalFor(met, weightKg, minutes)),
  };
}

/**
 * 투구 한 번. 강도(세션 RPE 1~10)가 높을수록 MET 를 올린다 — 캐치볼 수준(3.5)에서
 * 전력 투구(6)까지.
 */
export function pitchingBurn(
  sessionType: string,
  pitchCount: number,
  intensity: number,
  weightKg: number
): BurnItem | null {
  if (isRestSession(sessionType) || pitchCount <= 0) return null;
  const rpe = Math.min(10, Math.max(1, intensity || 5));
  const met = 3.5 + (rpe - 1) * (2.5 / 9);
  const minutes = Math.max(1, Math.round((pitchCount * SECONDS_PER_PITCH) / 60));
  return {
    kind: 'pitching',
    label: `${sessionType} ${pitchCount}구`,
    minutes,
    kcal: Math.round(kcalFor(met, weightKg, minutes)),
  };
}

export function totalBurn(items: BurnItem[]) {
  return items.reduce((sum, i) => sum + i.kcal, 0);
}
