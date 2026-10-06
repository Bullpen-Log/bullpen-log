/**
 * 잘 던진 날 찾기 — 선수가 매긴 투구 만족도(lib/pitch-satisfaction.ts)를 이미 쌓이는 기록과 맞대
 * "이런 날 잘 던졌어요"를 한두 개 찾는다(3단계, 화면은 4단계). DB 를 모른다 — 불러오기는 good-days-load.ts.
 *
 * 제일 중요한 것은 적은 기록으로 우연을 말하지 않는 것이다(2026-10-06 eng review).
 * - 하루 한 줄: 같은 날 여러 번 매기면 평균 하나 — 맥락이 같은 줄을 여러 번 세면 표본이 부풀어 우연이 진짜처럼 보인다.
 * - 항목이 25개쯤이라, 항목마다 따로 걸러면 차이가 전혀 없는 자료에서도 거의 늘 무언가 걸린다. 그래서 만족도를 섞을
 *   때마다 모든 항목의 차이 중 최댓값을 재 그 분포로 p 를 낸다(최대값 순열 — 묶음 안 어느 항목이든 우연히 걸릴 확률을 막음).
 * - 그 밖의 문턱: 매긴 날 8일 이상, 항목의 양쪽 3일 이상, 평균 차이 0.7점 이상, 높은 쪽의 절반 넘게가 잘 던진 날.
 *
 * 칩(좋았던 것 · 아쉬웠던 것)은 던진 뒤 적는 것이라 원인이 아니라 '잘 된 날의 느낌'이다 — 'feel' 묶음으로 따로 센다.
 */
import { shiftDateKey } from '@/lib/pitch-stats';
import { GOOD_DAY_MIN, PITCH_CUES, isRatedSession } from '@/lib/pitch-satisfaction';

/** 결과를 내기 시작하는 매긴 날 수 */
export const GOOD_DAYS_NEEDED = 8;
/** 항목의 양쪽에 있어야 하는 날 수 */
const MIN_SIDE = 3;
/** 평균 만족도 차이(1~5 척도) */
const MIN_DIFF = 0.7;
/** 묶음별 우연 허용(최대값 순열의 p) */
const ALPHA = 0.1;
const SHUFFLES = 2000;
/** 같은 자료 = 같은 결과(화면이 날마다 바뀌지 않게) */
const SEED = 20261006;
/** 보여 줄 수 — 몸 · 일정에서 둘, 느낌에서 하나 */
const SHOW = { before: 2, feel: 1 } as const;
/** 단백질 항목을 쓰려면 끼니를 적은 날이 이만큼 */
const MIN_PROTEIN_DAYS = 6;
/** 하체 운동으로 치는 부위(lib/exercise-meta.ts BODY_PARTS) */
const LOWER_PARTS = ['고관절', '햄스트링·둔근', '종아리·발목'];

/* ───────────────────────── 불러온 줄 → 하루 한 줄 ───────────────────────── */

/** 날짜는 모두 'YYYY-MM-DD'(한국 날짜) */
export type GoodDayRaw = {
  logs: {
    date: string;
    sessionType: string;
    pitchCount: number;
    satisfaction: number | null;
    cuesGood: string[];
    cuesBad: string[];
  }[];
  checkins: {
    date: string;
    sleep: string;
    sleepHours: number | null;
    condition: number;
    soreness: number | null;
    shoulder: string;
    elbow: string;
  }[];
  /** 완료한 운동 하나에 한 줄 */
  workouts: { date: string; bodyParts: string[] }[];
  /** 끼니 하나에 한 줄 — 단백질(g)은 양까지 곱한 값 */
  meals: { date: string; protein: number }[];
};

export type GoodDay = {
  date: string;
  /** 그날 매긴 만족도의 평균 */
  satisfaction: number;
  cuesGood: string[];
  cuesBad: string[];
  sleepHours: number | null;
  sleep: string | null;
  condition: number | null;
  soreness: number | null;
  /** 어깨 · 팔꿈치가 둘 다 '정상'이었나 — 체크인이 없으면 null */
  armFresh: boolean | null;
  /** 앞서 매긴 날과의 사이에 쉰 날 수 — 처음이면 null */
  restDays: number | null;
  /** 앞 7일(그날 빼고) 던진 공 수 — 캐치볼 포함 */
  pitches7: number;
  liftedYesterday: boolean;
  lowerYesterday: boolean;
  /** 전날 먹은 단백질(g) — 그날 끼니를 안 적었으면 null */
  proteinYesterday: number | null;
};

function dayIndex(key: string) {
  const [y, m, d] = key.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

/** from 이 있으면 그날부터의 매긴 날만 — 그 앞 기록은 투구수 · 쉰 날 계산에만 쓴다(맥락을 다 읽지 않은 날이 섞이지 않게) */
export function buildGoodDays(raw: GoodDayRaw, from?: string): GoodDay[] {
  const byDate = new Map<string, GoodDayRaw['logs']>();
  for (const l of raw.logs) {
    if (l.satisfaction == null || !isRatedSession(l.sessionType)) continue;
    if (from && l.date < from) continue;
    byDate.set(l.date, [...(byDate.get(l.date) ?? []), l]);
  }
  const pitchesOn = new Map<string, number>();
  for (const l of raw.logs)
    pitchesOn.set(l.date, (pitchesOn.get(l.date) ?? 0) + l.pitchCount);
  const checkinOn = new Map(raw.checkins.map((c) => [c.date, c]));
  const proteinOn = new Map<string, number>();
  for (const m of raw.meals)
    proteinOn.set(m.date, (proteinOn.get(m.date) ?? 0) + m.protein);

  /* 쉰 날은 앞서 던진 불펜 · 라이브 · 경기(매겼든 안 매겼든)부터 센다 */
  const thrown = [
    ...new Set(
      raw.logs
        .filter((l) => isRatedSession(l.sessionType) && l.pitchCount > 0)
        .map((l) => l.date)
    ),
  ].sort();
  const dates = [...byDate.keys()].sort();
  return dates.map((date) => {
    const before = thrown.filter((t) => t < date);
    const prev = before.length ? before[before.length - 1] : null;
    const rows = byDate.get(date)!;
    const good = PITCH_CUES.filter((c) => rows.some((r) => r.cuesGood.includes(c)));
    const bad = PITCH_CUES.filter(
      (c) => !good.includes(c) && rows.some((r) => r.cuesBad.includes(c))
    );
    const c = checkinOn.get(date);
    const yesterday = shiftDateKey(date, -1);
    const lifts = raw.workouts.filter((w) => w.date === yesterday);
    let pitches7 = 0;
    for (let k = 1; k <= 7; k++) pitches7 += pitchesOn.get(shiftDateKey(date, -k)) ?? 0;
    return {
      date,
      satisfaction: rows.reduce((s, r) => s + r.satisfaction!, 0) / rows.length,
      cuesGood: good,
      cuesBad: bad,
      sleepHours: c?.sleepHours ?? null,
      sleep: c?.sleep ?? null,
      condition: c?.condition ?? null,
      soreness: c?.soreness ?? null,
      armFresh: c ? c.shoulder === '정상' && c.elbow === '정상' : null,
      restDays: prev == null ? null : dayIndex(date) - dayIndex(prev) - 1,
      pitches7,
      liftedYesterday: lifts.length > 0,
      lowerYesterday: lifts.some((w) =>
        w.bodyParts.some((p) => LOWER_PARTS.includes(p))
      ),
      proteinYesterday: proteinOn.has(yesterday) ? proteinOn.get(yesterday)! : null,
    };
  });
}

/* ───────────────────────── 항목 ───────────────────────── */

type Kind = 'before' | 'feel';
type Context = { pitchesMedian: number; proteinMedian: number | null };
type Factor = {
  key: string;
  kind: Kind;
  /** 참인 날 · 거짓인 날의 이름 — 평균이 높은 쪽 이름으로 말한다 */
  yes: string;
  no: string;
  test: (d: GoodDay, ctx: Context) => boolean | null;
};

/** 받침이 있으면 '을', 없으면 '를' */
function objectParticle(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? '을' : '를';
}

const BEFORE: Factor[] = [
  {
    key: 'sleep',
    kind: 'before',
    yes: '잠을 충분히 잔 날',
    no: '잠이 모자랐던 날',
    /* 잔 시간을 적었으면 7시간, 아니면 느낌 '충분' */
    test: (d) =>
      d.sleepHours != null ? d.sleepHours >= 7 : d.sleep ? d.sleep === '충분' : null,
  },
  {
    key: 'condition',
    kind: 'before',
    yes: '컨디션이 7 이상인 날',
    no: '컨디션이 6 이하인 날',
    test: (d) => (d.condition == null ? null : d.condition >= 7),
  },
  {
    key: 'soreness',
    kind: 'before',
    yes: '근육통이 적은 날',
    no: '근육통이 있던 날',
    test: (d) => (d.soreness == null ? null : d.soreness <= 2),
  },
  {
    key: 'arm',
    kind: 'before',
    yes: '어깨 · 팔꿈치가 개운한 날',
    no: '어깨 · 팔꿈치가 뻐근했던 날',
    test: (d) => d.armFresh,
  },
  {
    key: 'rest',
    kind: 'before',
    yes: '이틀 이상 쉬고 던진 날',
    no: '하루 이하로 쉬고 던진 날',
    test: (d) => (d.restDays == null ? null : d.restDays >= 2),
  },
  {
    key: 'volume7',
    kind: 'before',
    yes: '앞 일주일에 적게 던진 날',
    no: '앞 일주일에 많이 던진 날',
    test: (d, ctx) => d.pitches7 <= ctx.pitchesMedian,
  },
  {
    key: 'lifted',
    kind: 'before',
    yes: '전날 운동한 날',
    no: '전날 운동을 쉰 날',
    test: (d) => d.liftedYesterday,
  },
  {
    key: 'lower',
    kind: 'before',
    yes: '전날 하체 운동한 날',
    no: '전날 하체 운동을 안 한 날',
    test: (d) => d.lowerYesterday,
  },
  {
    key: 'protein',
    kind: 'before',
    yes: '전날 단백질을 평소보다 많이 먹은 날',
    no: '전날 단백질이 평소보다 적었던 날',
    test: (d, ctx) =>
      ctx.proteinMedian == null || d.proteinYesterday == null
        ? null
        : d.proteinYesterday > ctx.proteinMedian,
  },
];

const FEEL: Factor[] = PITCH_CUES.flatMap((cue) => {
  const quoted = `'${cue}'${objectParticle(cue)}`;
  return [
    {
      key: `good:${cue}`,
      kind: 'feel' as const,
      yes: `${quoted} 좋았던 것으로 고른 날`,
      no: `${quoted} 좋았던 것으로 안 고른 날`,
      test: (d: GoodDay) => d.cuesGood.includes(cue),
    },
    {
      key: `bad:${cue}`,
      kind: 'feel' as const,
      yes: `${quoted} 아쉬웠던 것으로 고른 날`,
      no: `${quoted} 아쉬웠던 것으로 안 고른 날`,
      test: (d: GoodDay) => d.cuesBad.includes(cue),
    },
  ];
});

const FACTORS = [...BEFORE, ...FEEL];

/* ───────────────────────── 판정 ───────────────────────── */

export type FactorResult = {
  key: string;
  kind: Kind;
  /** 평균이 높은 쪽의 이름 */
  label: string;
  /** 높은 쪽 · 낮은 쪽 날 수와 평균 */
  nHigh: number;
  nLow: number;
  meanHigh: number;
  meanLow: number;
  diff: number;
  /** 높은 쪽 날 가운데 잘 던진 날(GOOD_DAY_MIN 이상) */
  goodHigh: number;
  /** 최대값 순열의 p — 견주지 않은 항목(한쪽이 모자람 · 묶음에 큰 차이가 없음)은 null */
  p: number | null;
};

export type GoodDayPattern = { key: string; kind: Kind; text: string };

export type GoodDayResult = {
  /** 매긴 날 수 */
  rated: number;
  needed: number;
  patterns: GoodDayPattern[];
  /** 모든 항목(4단계 '자세히') — 차이 큰 순 */
  all: FactorResult[];
};

function median(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** 시드가 같으면 늘 같은 수열(mulberry32) */
function random(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 참 · 거짓 표시(null 은 모름)로 나눈 두 평균의 차이 절댓값 */
function gap(groups: (boolean | null)[], scores: number[]) {
  let sy = 0;
  let ny = 0;
  let sn = 0;
  let nn = 0;
  for (let i = 0; i < scores.length; i++) {
    if (groups[i] === true) {
      sy += scores[i];
      ny++;
    } else if (groups[i] === false) {
      sn += scores[i];
      nn++;
    }
  }
  return Math.abs(sy / ny - sn / nn);
}

export function findGoodDayPatterns(days: GoodDay[]): GoodDayResult {
  if (days.length < GOOD_DAYS_NEEDED) {
    return { rated: days.length, needed: GOOD_DAYS_NEEDED, patterns: [], all: [] };
  }
  const proteins = days.flatMap((d) =>
    d.proteinYesterday == null ? [] : [d.proteinYesterday]
  );
  const ctx: Context = {
    pitchesMedian: median(days.map((d) => d.pitches7)),
    proteinMedian: proteins.length >= MIN_PROTEIN_DAYS ? median(proteins) : null,
  };
  const scores = days.map((d) => d.satisfaction);

  const rows = FACTORS.flatMap((f) => {
    const groups = days.map((d) => f.test(d, ctx));
    const yes = scores.filter((_, i) => groups[i] === true);
    const no = scores.filter((_, i) => groups[i] === false);
    if (yes.length < MIN_SIDE || no.length < MIN_SIDE) return [];
    const meanYes = yes.reduce((s, v) => s + v, 0) / yes.length;
    const meanNo = no.reduce((s, v) => s + v, 0) / no.length;
    const yesHigh = meanYes >= meanNo;
    const high = yesHigh ? yes : no;
    return [
      {
        factor: f,
        groups,
        result: {
          key: f.key,
          kind: f.kind,
          label: yesHigh ? f.yes : f.no,
          nHigh: high.length,
          nLow: (yesHigh ? no : yes).length,
          meanHigh: Math.max(meanYes, meanNo),
          meanLow: Math.min(meanYes, meanNo),
          diff: Math.abs(meanYes - meanNo),
          goodHigh: high.filter((v) => v >= GOOD_DAY_MIN).length,
          p: null as number | null,
        },
      },
    ];
  });

  /* 묶음마다 최대값 순열 — 큰 차이가 하나도 없으면 섞을 것도 없다 */
  for (const kind of ['before', 'feel'] as const) {
    const family = rows.filter((r) => r.factor.kind === kind);
    if (!family.some((r) => r.result.diff >= MIN_DIFF)) continue;
    const next = random(SEED);
    const shuffled = [...scores];
    const beat = family.map(() => 0);
    for (let s = 0; s < SHUFFLES; s++) {
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      let max = 0;
      for (const r of family) max = Math.max(max, gap(r.groups, shuffled));
      family.forEach((r, k) => {
        if (max >= r.result.diff - 1e-9) beat[k]++;
      });
    }
    family.forEach((r, k) => {
      r.result.p = (beat[k] + 1) / (SHUFFLES + 1);
    });
  }

  const all = rows.map((r) => r.result).sort((a, b) => b.diff - a.diff);
  const patterns: GoodDayPattern[] = [];
  for (const kind of ['before', 'feel'] as const) {
    all
      .filter(
        (r) =>
          r.kind === kind &&
          r.diff >= MIN_DIFF &&
          r.p != null &&
          r.p < ALPHA &&
          r.goodHigh * 2 > r.nHigh
      )
      .slice(0, SHOW[kind])
      .forEach((r) =>
        patterns.push({
          key: r.key,
          kind,
          text: `${r.label} 잘 던졌어요 · ${r.nHigh}번 중 ${r.goodHigh}번`,
        })
      );
  }
  return { rated: days.length, needed: GOOD_DAYS_NEEDED, patterns, all };
}
