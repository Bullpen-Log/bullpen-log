/**
 * 투구 일지 시뮬레이션 — 검토용.
 *
 *   node --import ./scripts/alias-register.mjs scripts/review-pitchlog.mts
 *
 * 자가 시험(training:test)이 "약속이 깨졌는가"를 보는 것과 달리, 이 파일은
 * "실제 선수의 한 시즌을 흘려보내면 무슨 일이 벌어지는가"를 본다. 통과·실패를
 * 가리지 않고 숫자를 뽑아 눈으로 이상한 곳을 찾는 용도다.
 *
 * DB를 건드리지 않는다. 전부 지어낸 기록으로만 돈다.
 */
import {
  ACWR_ZONES,
  buildDateRange,
  countMissingDays,
  countSessionTypes,
  dateKeyOf,
  effortAdjustedPitches,
  formatShortDate,
  groupByDay,
  isFutureDateKey,
  loadBySessionType,
  longestThrowStreak,
  shiftDateKey,
  summarize,
  toDateKey,
  zoneOf,
  type PitchLogLike,
} from '../lib/pitch-stats.ts';
import { computeAcwr } from '../lib/pitch-stats.ts';
import { REST_SESSION_TYPE } from '../lib/session-type.ts';

const problems: string[] = [];
const notes: string[] = [];
function bad(msg: string) {
  problems.push(msg);
  console.log(`  !! ${msg}`);
}
function note(msg: string) {
  notes.push(msg);
  console.log(`  -- ${msg}`);
}
function head(title: string) {
  console.log(`\n${'─'.repeat(70)}\n${title}\n${'─'.repeat(70)}`);
}

/* ════════════════════════ 1. 날짜 ════════════════════════ */
head('1. 날짜 계산 — 월·연 경계와 윤년');

const dateCases: [string, number, string][] = [
  ['2026-01-31', 1, '2026-02-01'],
  ['2026-02-28', 1, '2026-03-01'],
  ['2028-02-28', 1, '2028-02-29'], // 윤년
  ['2028-02-29', 1, '2028-03-01'],
  ['2026-12-31', 1, '2027-01-01'],
  ['2027-01-01', -1, '2026-12-31'],
  ['2026-03-01', -1, '2026-02-28'],
  ['2026-08-30', -365, '2025-08-30'],
];
for (const [from, offset, want] of dateCases) {
  const got = shiftDateKey(from, offset);
  console.log(`  ${from} ${offset >= 0 ? '+' : ''}${offset} → ${got}`);
  if (got !== want) bad(`shiftDateKey(${from}, ${offset}) = ${got}, 기대 ${want}`);
}

// ±왕복이 제자리로 오는가 (한 해 전체)
let roundTripFails = 0;
for (let i = 0; i < 400; i++) {
  const k = shiftDateKey('2026-01-01', i);
  if (shiftDateKey(shiftDateKey(k, 37), -37) !== k) roundTripFails++;
}
console.log(`  400일 ±37일 왕복: 어긋난 날 ${roundTripFails}개`);
if (roundTripFails > 0) bad('shiftDateKey 왕복이 어긋난다');

/* ════════════════════════ 2. 시간대 ════════════════════════ */
head('2. 시간대 — 서버가 UTC일 때 한국 새벽');

const tzCases: [string, string][] = [
  ['2026-08-29T14:59:59Z', '2026-08-29'], // 한국 23:59
  ['2026-08-29T15:00:00Z', '2026-08-30'], // 한국 00:00 → 날이 바뀐다
  ['2026-08-29T23:30:00Z', '2026-08-30'], // 한국 08:30
  ['2026-12-31T15:00:00Z', '2027-01-01'], // 연말 자정
];
for (const [iso, want] of tzCases) {
  const got = toDateKey(new Date(iso));
  console.log(`  ${iso} → ${got}`);
  if (got !== want) bad(`toDateKey(${iso}) = ${got}, 기대 ${want}`);
}

// 미래 차단이 한국 자정을 정확히 따르는가
const atMidnight = new Date('2026-08-29T15:00:00Z'); // 한국 8/30 00:00
console.log(`  한국 8/30 00:00 기준 — 오늘(8/30) 막힘? ${isFutureDateKey('2026-08-30', atMidnight)}`);
console.log(`  한국 8/30 00:00 기준 — 내일(8/31) 막힘? ${isFutureDateKey('2026-08-31', atMidnight)}`);
if (isFutureDateKey('2026-08-30', atMidnight)) bad('자정 직후 오늘 날짜가 막힌다');
if (!isFutureDateKey('2026-08-31', atMidnight)) bad('내일 날짜가 안 막힌다');

/* ════════════════════════ 3. 하루 합치기 ════════════════════════ */
head('3. 하루에 여러 번 기록했을 때');

function log(
  date: string,
  sessionType: string,
  pitchCount: number,
  intensity: number,
  maxVelocity: number | null = null,
  avgVelocity: number | null = null
): PitchLogLike {
  return { date, sessionType, pitchCount, intensity, maxVelocity, avgVelocity };
}

const multi = [
  log('2026-08-20', '불펜', 30, 7, 138, 130),
  log('2026-08-20', '캐치볼', 30, 3, null, null),
];
const g1 = groupByDay(multi).get('2026-08-20')!;
console.log(
  `  불펜30(강7) + 캐치볼30(강3) → ${g1.pitchCount}구 · 강도 ${g1.intensity.toFixed(2)}` +
    ` · 전력환산 ${g1.adjustedPitches.toFixed(1)}구 · 최고 ${g1.maxVelocity} · 평균 ${g1.avgVelocity}`
);
if (Math.abs(g1.intensity - 5) > 1e-9) bad(`가중평균 강도가 5가 아니다 (${g1.intensity})`);
if (Math.abs(g1.pitchCount * g1.intensity - (30 * 7 + 30 * 3)) > 1e-9) {
  bad('투구수×강도가 세션별 부하 합과 다르다');
}

// 같은 날에 휴식과 투구가 함께 남은 경우
const mixed = [log('2026-08-21', REST_SESSION_TYPE, 0, 0), log('2026-08-21', '불펜', 40, 8)];
const g2 = groupByDay(mixed).get('2026-08-21')!;
console.log(`  휴식 + 불펜40(강8) → ${g2.pitchCount}구 · 강도 ${g2.intensity.toFixed(2)}`);
if (g2.intensity !== 8) bad(`휴식이 섞이면 강도가 희석된다 (${g2.intensity})`);

// 휴식만 있는 날
const restOnly = groupByDay([log('2026-08-22', REST_SESSION_TYPE, 0, 0)]).get('2026-08-22')!;
console.log(`  휴식만 → ${restOnly.pitchCount}구 · 강도 ${restOnly.intensity} · 환산 ${restOnly.adjustedPitches}`);
if (restOnly.adjustedPitches !== 0) bad('휴식일이 전력환산에 부하를 더한다');

// 구속을 한 건만 적은 날
const partialVel = groupByDay([
  log('2026-08-23', '불펜', 40, 8, 140, 132),
  log('2026-08-23', '캐치볼', 20, 3, null, null),
]).get('2026-08-23')!;
console.log(
  `  구속 한 건만 적음 → 최고 ${partialVel.maxVelocity} · 평균 ${partialVel.avgVelocity?.toFixed(1)}`
);
note(
  `평균 구속은 적은 세션(불펜 40구)만으로 ${partialVel.avgVelocity?.toFixed(1)} — 캐치볼 20구는 안 섞인다. 의도된 동작`
);

/* ════════════════════════ 4. 값 범위 ════════════════════════ */
head('4. 말이 안 되는 값이 들어오면');

// API의 checkEntry 규칙을 그대로 옮겨 본다 (route.ts는 서버 전용이라 직접 못 부른다)
function checkLikeApi(pitchCount: unknown, intensity: unknown, maxV: unknown, avgV: unknown) {
  const pc = Number.parseInt(String(pitchCount), 10);
  const it = Number.parseInt(String(intensity), 10);
  if (Number.isNaN(pc) || Number.isNaN(it)) return '숫자 아님';
  if (pc < 1) return '투구수 1 미만';
  if (it < 1 || it > 10) return '강도 범위 밖';
  const rv = (raw: unknown) => {
    if (raw === '' || raw == null) return null;
    const v = Number.parseFloat(String(raw));
    return Number.isNaN(v) || v <= 0 ? 'ERR' : v;
  };
  const mx = rv(maxV);
  const av = rv(avgV);
  if (mx === 'ERR' || av === 'ERR') return '구속 숫자 아님';
  if (mx != null && av != null && (av as number) > (mx as number)) return '평균>최고';
  return `통과 (${pc}구 · 강도 ${it} · 최고 ${mx} · 평균 ${av})`;
}

const valueCases: [string, unknown, unknown, unknown, unknown][] = [
  ['정상', '45', '7', '138', '130'],
  ['투구수 0', '0', '7', '', ''],
  ['강도 11', '45', '11', '', ''],
  ['투구수 99999', '99999', '10', '', ''],
  ['최고 구속 500', '45', '7', '500', ''],
  ['최고 구속 0.1', '45', '7', '0.1', ''],
  ['투구수 소수 45.9', '45.9', '7', '', ''],
  ['강도 소수 7.9', '45', '7.9', '', ''],
];
for (const [label, pc, it, mx, av] of valueCases) {
  console.log(`  ${label.padEnd(16)} → ${checkLikeApi(pc, it, mx, av)}`);
}

/* ════════════════════════ 5. 한 시즌 흘려보내기 ════════════════════════ */
head('5. 한 시즌 시뮬레이션 — 부하 지수가 어떻게 움직이나');

type Pattern = { name: string; make: (i: number, key: string) => PitchLogLike | null };

const patterns: Pattern[] = [
  {
    name: '성실한 고교생 (주 2불펜 + 캐치볼, 쉰 날도 기록)',
    make: (i, key) => {
      const d = i % 7;
      if (d === 1 || d === 4) return log(key, '불펜', 45, 7);
      if (d === 2 || d === 5) return log(key, '캐치볼', 40, 3);
      if (d === 6) return log(key, '경기', 70, 9);
      return log(key, REST_SESSION_TYPE, 0, 0);
    },
  },
  {
    name: '기록을 띄엄띄엄 (던진 날만 적음)',
    make: (i, key) => {
      const d = i % 7;
      if (d === 1 || d === 4) return log(key, '불펜', 45, 7);
      if (d === 6) return log(key, '경기', 70, 9);
      return null;
    },
  },
  {
    name: '한 달 쉬고 복귀',
    make: (i, key) => {
      if (i < 30) return log(key, REST_SESSION_TYPE, 0, 0);
      const d = i % 7;
      if (d === 1 || d === 3 || d === 5) return log(key, '불펜', 50, 7);
      return log(key, REST_SESSION_TYPE, 0, 0);
    },
  },
  {
    name: '갑자기 몰아 던짐 (마지막 주에 폭증)',
    make: (i, key) => {
      const late = i >= 53;
      const d = i % 7;
      if (late) return log(key, '불펜', 80, 9);
      if (d === 1 || d === 4) return log(key, '불펜', 30, 5);
      return log(key, REST_SESSION_TYPE, 0, 0);
    },
  },
  {
    name: '캐치볼만 매일 (가벼운 것만)',
    make: (_i, key) => log(key, '캐치볼', 50, 2),
  },
];

const TODAY = new Date('2026-08-30T03:00:00Z');
const range60 = buildDateRange(60, TODAY);

for (const p of patterns) {
  const logs = range60
    .map((key, i) => p.make(i, key))
    .filter((l): l is PitchLogLike => l != null);
  const byDay = groupByDay(logs);
  const loadByDay = new Map([...byDay].map(([k, d]) => [k, d.pitchCount * d.intensity]));
  const acwr = computeAcwr(loadByDay, TODAY);
  const week = buildDateRange(7, TODAY);
  const s = summarize(byDay, week);
  const missing = countMissingDays(byDay, buildDateRange(28, TODAY));
  const streak = longestThrowStreak(byDay, range60);

  console.log(`\n  ▶ ${p.name}`);
  console.log(
    `    지수 ${acwr.ratio?.toFixed(2) ?? '—'} (${acwr.zone ? ACWR_ZONES[acwr.zone].short : '없음'})` +
      ` · 급성 ${Math.round(acwr.acute)} · 만성 ${Math.round(acwr.chronic)}`
  );
  console.log(
    `    최근 7일 ${s.totalPitches}구 / ${s.activeDays}일 · 평균강도 ${s.avgIntensity.toFixed(1)}` +
      ` · 28일 중 빈 날 ${missing} · 최장 연투 ${streak}일`
  );
  const types = countSessionTypes(
    logs.map((l) => ({ date: l.date, sessionType: l.sessionType!, pitchCount: l.pitchCount })),
    buildDateRange(28, TODAY)
  );
  console.log(`    28일 종류별: ${types.map((t) => `${t.name} ${t.count}회 ${t.pitches}구`).join(' · ')}`);
  const share = loadBySessionType(
    logs.map((l) => ({
      date: l.date,
      sessionType: l.sessionType!,
      pitchCount: l.pitchCount,
      intensity: l.intensity,
    })),
    buildDateRange(28, TODAY)
  );
  console.log(
    `    28일 부하 비중: ${share.map((t) => `${t.name} ${Math.round(t.share * 100)}%`).join(' · ')}`
  );
}

/* ════════════════════════ 6. 성실도 역전 ════════════════════════ */
head('6. 같은 훈련인데 기록 습관만 다르면 지수가 달라지는가');

const base = (key: string, i: number) => {
  const d = i % 7;
  if (d === 1 || d === 4) return log(key, '불펜', 45, 7);
  if (d === 6) return log(key, '경기', 70, 9);
  return null;
};

const diligent = range60.flatMap((key, i) => {
  const l = base(key, i);
  return l ? [l] : [log(key, REST_SESSION_TYPE, 0, 0)];
});
const lazy = range60.map((key, i) => base(key, i)).filter((l): l is PitchLogLike => l != null);
const split = range60.flatMap((key, i) => {
  const l = base(key, i);
  if (!l) return [];
  // 같은 양을 두 번에 나눠 적는 사람
  return [
    { ...l, pitchCount: Math.floor(l.pitchCount / 2) },
    { ...l, pitchCount: Math.ceil(l.pitchCount / 2) },
  ];
});

for (const [name, logs] of [
  ['쉰 날도 적음', diligent],
  ['던진 날만 적음', lazy],
  ['한 세션을 두 번에 나눠 적음', split],
] as const) {
  const byDay = groupByDay(logs);
  const loadByDay = new Map([...byDay].map(([k, d]) => [k, d.pitchCount * d.intensity]));
  const a = computeAcwr(loadByDay, TODAY);
  console.log(
    `  ${name.padEnd(24)} 지수 ${a.ratio?.toFixed(3) ?? '—'} · 급성 ${a.acute.toFixed(1)} · 만성 ${a.chronic.toFixed(1)}`
  );
}

/* ════════════════════════ 7. 달력 표시 ════════════════════════ */
head('7. 달력에 칠해지는 것');

function marksLike(logs: { date: string; sessionType: string; pitchCount: number; intensity: number; videoPaths: string[] }[]) {
  const byDay = logs.reduce<Record<string, { pitches: number; intensity: number; video: boolean; rested: boolean }>>(
    (acc, l) => {
      const key = l.date.slice(0, 10);
      const prev = acc[key] ?? { pitches: 0, intensity: 0, video: false, rested: true };
      acc[key] = {
        pitches: prev.pitches + l.pitchCount,
        intensity: Math.max(prev.intensity, l.intensity),
        video: prev.video || l.videoPaths.length > 0,
        rested: prev.rested && l.sessionType === REST_SESSION_TYPE,
      };
      return acc;
    },
    {}
  );
  return Object.fromEntries(
    Object.entries(byDay).map(([k, d]) => [
      k,
      { intensity: d.rested ? null : d.intensity, label: d.rested ? '휴식' : `${d.pitches}구`, dot: d.video },
    ])
  );
}

const calCases = [
  { date: '2026-08-01', sessionType: '불펜', pitchCount: 45, intensity: 7, videoPaths: [] },
  { date: '2026-08-02', sessionType: REST_SESSION_TYPE, pitchCount: 0, intensity: 0, videoPaths: [] },
  { date: '2026-08-03', sessionType: REST_SESSION_TYPE, pitchCount: 0, intensity: 0, videoPaths: [] },
  { date: '2026-08-03', sessionType: '캐치볼', pitchCount: 20, intensity: 2, videoPaths: ['a'] },
  { date: '2026-08-04', sessionType: '경기', pitchCount: 90, intensity: 10, videoPaths: [] },
];
for (const [k, m] of Object.entries(marksLike(calCases))) {
  console.log(`  ${k}  ${String(m.label).padEnd(6)} 강도표시 ${m.intensity ?? '점선'} ${m.dot ? '· 영상' : ''}`);
}

/* ════════════════════════ 8. 전력 환산 ════════════════════════ */
head('8. 전력 환산 — 종류와 강도에 따라');

for (const [type, intensity] of [
  ['불펜', 3],
  ['불펜', 5],
  ['불펜', 7],
  ['불펜', 10],
  ['캐치볼', 2],
  ['캐치볼', 8],
  ['경기', 1],
  ['경기', 5],
  ['경기', 10],
] as const) {
  console.log(
    `  ${type.padEnd(4)} 강도 ${String(intensity).padStart(2)} · 50구 → 전력환산 ${effortAdjustedPitches(50, intensity, type).toFixed(1)}구`
  );
}
note('경기는 강도를 1로 적어도 전력(계수 1.0)으로 본다 — 의도된 설계');

/* ════════════════════════ 마무리 ════════════════════════ */
head('요약');
console.log(`  깨진 약속 ${problems.length}개, 짚어둘 점 ${notes.length}개`);
for (const p of problems) console.log(`    !! ${p}`);
for (const n of notes) console.log(`    -- ${n}`);
