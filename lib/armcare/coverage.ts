/**
 * 내 팔 지도 — 최근 2주 암케어 기록을 근육 · 부위별로 세고, 비어 있는 부위로 짧은 루틴을 짠다(2026-10-04). 순수 계산.
 * 시험: npm run armcare-map:test
 *
 * 부위별 보강의 3D 지도는 잘 만들었지만 '한 번 보고 마는 해부 그림'이었다(사용자분: "어떻게 하면 더 유용하게").
 * 내 기록을 칠하면 열 때마다 내 상태가 보인다 — 많이 한 곳은 진하게, 2주째 안 한 곳은 따로 표시하고, 그 부위로
 * 10분 루틴을 바로 짜서 따라 하기로 간다. 자료는 이미 있다(운동 기록 + 운동마다 키우는 근육) — DB 를 바꾸지 않는다.
 */
import { ARMCARE_AREAS, areaOfMuscle, primaryArea, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { armcareMinutes, type ArmcareCandidate, type ArmcareItem } from '@/lib/armcare/routine';

/** 몇 날을 보나 */
export const COVERAGE_DAYS = 14;

/** 2주에 이만큼(주 2번) 했으면 '많이' — 3D 의 가장 진한 색 */
export const COVERAGE_FULL = 4;

/**
 * 빈 곳의 기준 — 그 부위가 '주 부위'인 운동(맨 앞 근육이 그 부위)을 이보다 적게 했으면 빈 곳. 곁다리로 쓰인 것까지 치는
 * 점수(areas)로 잡았더니, 견갑 운동이 어깨 후방 근육을 함께 쓰는 것만으로 어깨 후방이 '했다'가 되어 빈 곳이 거의 안
 * 남았다(2026-10-04 화면 확인). 3D 진하기는 곁다리까지 친다.
 */
export const GAP_BELOW = 1;

/**
 * 비어 있는 부위를 고르는 차례 — 던질 때 감속을 맡는 곳부터. 어깨 후방(외회전근)과 팔꿈치 내측(굴곡 · 회내근)은
 * 투수에게 가장 흔히 다치는 곳을 받치고, 견갑이 그 다음이다. 같은 날 비어 있으면 앞의 것을 먼저 권한다.
 */
export const GAP_PRIORITY: ArmcareAreaKey[] = [
  'shoulder-back',
  'elbow-inner',
  'scapula',
  'shoulder-front',
  'shoulder-top',
  'elbow-outer',
  'elbow-back',
  'elbow-front',
];

export type ArmcareCoverage = {
  /** 근육마다 점수 — 주로 키운 근육 1, 함께 쓴 근육 0.5 를 기록마다 더한다 */
  muscles: Record<string, number>;
  /** 부위마다 점수 — 그 부위 근육 점수의 합(곁다리 포함) */
  areas: Record<ArmcareAreaKey, number>;
  /** 부위마다 그 부위가 '주 부위'인 운동을 한 수 — 빈 곳은 이것으로 가른다(GAP_BELOW) */
  primary: Record<ArmcareAreaKey, number>;
  /** 3D 칠하기 — 근육마다 0~1(COVERAGE_FULL 에서 1) */
  heat: Record<string, number>;
  /** 이 기간에 한 암케어 기록 수 */
  total: number;
};

type ExerciseLike = { id: string; targetMuscles: string[] };

/** 기록(운동 id)과 운동의 근육으로 근육 · 부위 점수를 낸다. 근육이 안 적힌 운동은 세지 않는다 */
export function armcareCoverage(
  logs: { exerciseId: string }[],
  exercises: ExerciseLike[]
): ArmcareCoverage {
  const byId = new Map(exercises.map((ex) => [ex.id, ex]));
  const muscles: Record<string, number> = {};
  const zero = () =>
    Object.fromEntries(ARMCARE_AREAS.map((a) => [a.key, 0])) as Record<ArmcareAreaKey, number>;
  const areas = zero();
  const primary = zero();
  let total = 0;
  for (const log of logs) {
    const ex = byId.get(log.exerciseId);
    if (!ex || ex.targetMuscles.length === 0) continue;
    total += 1;
    const main = primaryArea(ex.targetMuscles);
    if (main) primary[main.key] += 1;
    ex.targetMuscles.forEach((name, i) => {
      const w = i === 0 ? 1 : 0.5;
      muscles[name] = (muscles[name] ?? 0) + w;
      const area = areaOfMuscle(name);
      if (area) areas[area.key] += w;
    });
  }
  const heat = Object.fromEntries(
    Object.entries(muscles).map(([name, v]) => [name, Math.min(1, v / COVERAGE_FULL)])
  );
  return { muscles, areas, primary, heat, total };
}

/**
 * 비어 있는 부위 — 이 기간에 그 부위가 주 부위인 운동을 GAP_BELOW 번보다 적게 한 부위를 GAP_PRIORITY 차례로 max 개까지.
 * 기록이 하나도 없으면(처음 쓰는 사람) 차례의 앞 둘을 낸다 — '어디부터'를 알려 준다.
 */
export function gapAreas(c: ArmcareCoverage, max = 2): ArmcareAreaKey[] {
  if (c.total === 0) return GAP_PRIORITY.slice(0, max);
  return GAP_PRIORITY.filter((key) => c.primary[key] < GAP_BELOW).slice(0, max);
}

/**
 * 고른 부위로 짧은 루틴 — 부위마다 그 부위를 주로 키우는 운동을 오래 안 한 것부터, 부위를 번갈아 담아 minutes 를
 * 넘으면 멈춘다. 부위마다 많아야 셋. 세트는 둘(짧게 자주).
 *
 * candidates 는 가진 장비 · 경력으로 거른 암케어 운동(lib/armcare/today.ts 와 같은 거르기). lastDone 은 운동마다
 * 마지막으로 한 날(YYYY-MM-DD) — 없으면 한 번도 안 한 것으로 맨 앞.
 */
export function buildFocusRoutine({
  areas,
  candidates,
  lastDone = new Map(),
  minutes = 10,
  sets = 2,
}: {
  areas: ArmcareAreaKey[];
  candidates: ArmcareCandidate[];
  lastDone?: Map<string, string>;
  minutes?: number;
  sets?: number;
}): ArmcareItem[] {
  const pools = areas.map((area) =>
    candidates
      .filter((ex) => primaryArea(ex.targetMuscles)?.key === area)
      .sort((a, b) => {
        const da = lastDone.get(a.id) ?? '';
        const db = lastDone.get(b.id) ?? '';
        return da < db ? -1 : da > db ? 1 : a.id < b.id ? -1 : 1;
      })
  );
  const items: ArmcareItem[] = [];
  let spent = 0;
  for (let round = 0; round < 3; round++) {
    for (let i = 0; i < areas.length; i++) {
      const ex = pools[i][round];
      if (!ex) continue;
      if (spent >= minutes && items.length >= areas.length) return items;
      items.push({ exerciseId: ex.id, area: areas[i], sets });
      spent += armcareMinutes(ex, sets);
    }
  }
  return items;
}

/** 주소의 ?areas=a,b → 부위 키(모르는 값 · 겹친 값은 버림, 넷까지) */
export function parseAreas(value: unknown): ArmcareAreaKey[] {
  if (typeof value !== 'string') return [];
  const known = new Set<string>(ARMCARE_AREAS.map((a) => a.key));
  return [...new Set(value.split(','))].filter((v) => known.has(v)).slice(0, 4) as ArmcareAreaKey[];
}
