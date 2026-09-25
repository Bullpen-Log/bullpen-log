import { isRestSession } from '@/lib/session-type';

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

/** 트레이닝 한 판. 본운동 시간만 센다(워밍업은 빠진다 — TrainingSession.activeSeconds). */
export function trainingBurn(activeSeconds: number, weightKg: number): BurnItem | null {
  const minutes = Math.round(activeSeconds / 60);
  if (minutes < 1) return null;
  return {
    kind: 'training',
    label: `트레이닝 ${minutes}분`,
    minutes,
    kcal: Math.round(kcalFor(STRENGTH_MET, weightKg, minutes)),
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
