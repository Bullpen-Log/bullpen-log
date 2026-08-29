/**
 * 부하 지수가 요일 때문에 흔들리는가.
 *
 *   node --import ./scripts/alias-register.mjs scripts/review-acwr-wobble.mts
 *
 * 매주 똑같은 훈련을 반복하는 선수라면 지수는 늘 1.0 근처여야 한다. 그런데
 * EWMA는 최근 며칠에 크게 반응하므로, 훈련이 하나도 안 바뀌어도 오늘이 무슨
 * 요일이냐에 따라 값이 달라질 수 있다. 얼마나 달라지는지 재본다.
 */
import {
  ACWR_ZONES,
  buildDateRange,
  computeAcwr,
  groupByDay,
  longestThrowStreak,
  countMissingDays,
  shiftDateKey,
  toDateKey,
  type PitchLogLike,
} from '../lib/pitch-stats.ts';
import { REST_SESSION_TYPE } from '../lib/session-type.ts';

const WEEKDAY = ['일', '월', '화', '수', '목', '금', '토'];

function log(date: string, sessionType: string, pitchCount: number, intensity: number): PitchLogLike {
  return { date, sessionType, pitchCount, intensity, maxVelocity: null, avgVelocity: null };
}

/** 요일(0=일)로 그날 훈련을 정한다. 주마다 똑같다. */
type Week = (weekday: number, key: string) => PitchLogLike;

const weeklyPlans: { name: string; week: Week }[] = [
  {
    name: '주2 불펜 + 주2 캐치볼 + 주말 경기',
    week: (w, key) => {
      if (w === 2 || w === 5) return log(key, '불펜', 45, 7);
      if (w === 3 || w === 6) return log(key, '캐치볼', 40, 3);
      if (w === 0) return log(key, '경기', 70, 9);
      return log(key, REST_SESSION_TYPE, 0, 0);
    },
  },
  {
    name: '주3 불펜만 (월·수·금)',
    week: (w, key) =>
      w === 1 || w === 3 || w === 5 ? log(key, '불펜', 50, 7) : log(key, REST_SESSION_TYPE, 0, 0),
  },
  {
    name: '매일 캐치볼 50구',
    week: (_w, key) => log(key, '캐치볼', 50, 2),
  },
];

console.log('\n같은 훈련을 12주 반복한 뒤, 오늘이 무슨 요일이냐에 따라 지수가 어떻게 나오는가\n');

for (const plan of weeklyPlans) {
  console.log(`▶ ${plan.name}`);
  const ratios: number[] = [];

  for (let offset = 0; offset < 7; offset++) {
    // 오늘을 하루씩 옮겨가며, 그 앞 84일(12주)을 같은 주간 계획으로 채운다
    const today = new Date(Date.UTC(2026, 7, 30 + offset, 3, 0, 0));
    const keys = buildDateRange(84, today);
    const logs = keys.map((key) => {
      const [y, m, d] = key.split('-').map(Number);
      return plan.week(new Date(Date.UTC(y, m - 1, d)).getUTCDay(), key);
    });
    const byDay = groupByDay(logs);
    const loads = new Map([...byDay].map(([k, v]) => [k, v.pitchCount * v.intensity]));
    const a = computeAcwr(loads, today);
    const key = toDateKey(today);
    const [y, m, d] = key.split('-').map(Number);
    const wd = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];

    ratios.push(a.ratio ?? 0);
    console.log(
      `   ${key} (${wd})  지수 ${a.ratio?.toFixed(2)}  ${ACWR_ZONES[a.zone!].short.padEnd(3)}` +
        `  급성 ${Math.round(a.acute)}  만성 ${Math.round(a.chronic)}` +
        `   ← ${ACWR_ZONES[a.zone!].advice.slice(0, 34)}…`
    );
  }

  const lo = Math.min(...ratios);
  const hi = Math.max(...ratios);
  const zones = new Set(ratios.map((r) => ACWR_ZONES[r < 0.8 ? 'low' : r <= 1.3 ? 'optimal' : r <= 1.5 ? 'caution' : 'danger'].short));
  console.log(
    `   → 한 주 안에서 ${lo.toFixed(2)} ~ ${hi.toFixed(2)} (폭 ${(hi - lo).toFixed(2)}), 구간 ${[...zones].join('/')}\n`
  );
}

/* ─────────────────────────────────────────────────────────── */
console.log('─'.repeat(72));
console.log('연투와 빈 날은 잡히는가');
console.log('─'.repeat(72));

const today = new Date('2026-08-30T03:00:00Z');
const cases: { name: string; make: (i: number, key: string) => PitchLogLike | null }[] = [
  {
    name: '60일 연속 캐치볼 (하루도 안 쉼)',
    make: (_i, key) => log(key, '캐치볼', 50, 2),
  },
  {
    name: '30일 연속 불펜 40구',
    make: (i, key) => (i >= 30 ? log(key, '불펜', 40, 6) : log(key, REST_SESSION_TYPE, 0, 0)),
  },
  {
    name: '28일 중 20일을 안 적음',
    make: (i, key) => (i % 7 === 1 ? log(key, '불펜', 45, 7) : null),
  },
];

for (const c of cases) {
  const keys = buildDateRange(60, today);
  const logs = keys.map((k, i) => c.make(i, k)).filter((l): l is PitchLogLike => l != null);
  const byDay = groupByDay(logs);
  const loads = new Map([...byDay].map(([k, v]) => [k, v.pitchCount * v.intensity]));
  const a = computeAcwr(loads, today);
  console.log(
    `  ${c.name.padEnd(28)} 지수 ${a.ratio?.toFixed(2)} ${ACWR_ZONES[a.zone!].short}` +
      ` · 최장 연투 ${longestThrowStreak(byDay, keys)}일` +
      ` · 28일 중 빈 날 ${countMissingDays(byDay, buildDateRange(28, today))}`
  );
}

/* ─────────────────────────────────────────────────────────── */
console.log('\n' + '─'.repeat(72));
console.log('기록 첫날 — 문진 기준선이 없는 사람은 며칠을 기다리나');
console.log('─'.repeat(72));

for (const days of [1, 3, 7, 14, 21, 27, 28, 35]) {
  const keys = buildDateRange(days, today);
  const logs = keys.map((k, i) => (i % 2 === 0 ? log(k, '불펜', 45, 7) : log(k, REST_SESSION_TYPE, 0, 0)));
  const byDay = groupByDay(logs);
  const loads = new Map([...byDay].map(([k, v]) => [k, v.pitchCount * v.intensity]));
  const noSeed = computeAcwr(loads, today);
  const withSeed = computeAcwr(loads, today, { seedDailyLoad: 150 });
  console.log(
    `  기록 ${String(days).padStart(2)}일치 → 문진 없음: ${noSeed.ratio?.toFixed(2) ?? `— (${noSeed.daysNeeded}일 더)`}` +
      `   |  문진 있음: ${withSeed.ratio?.toFixed(2)} (실측반영 ${Math.round(withSeed.realWeight * 100)}%)`
  );
}
