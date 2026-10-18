/**
 * 지금 팔 상태(lib/report/arm-status.ts) 자가 시험 — npm run arm-status:test
 *
 * facts 는 판정이 읽는 칸만 지어 넣는다(buildFacts 를 거치면 투구 기록 · 체크인 줄을 다 지어내야 해서).
 */
import type { ReportFacts } from '@/lib/report/facts';
import { armStatusOf } from '@/lib/report/arm-status';

let failed = 0;
let passed = 0;
function check(name: string, ok: boolean, detail = '') {
  if (ok) passed++;
  else {
    failed++;
    console.log(`✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

type Outing = { daysAgo: number; pitches: number; adjusted: number };
type Hard = { daysAgo: number; pitches: number; load?: number; nearMaxPitches?: number };
function facts(o: {
  age?: number | null;
  zone?: 'danger' | 'caution' | 'optimal' | 'low' | null;
  ratio?: number | null;
  outings?: Outing[];
  /** 세게 던진 날(facts.patterns.hardOutings — theme.ts hardOuting 이 오늘 · 어제 것을 읽는다) */
  hard?: Hard[];
  painToday?: boolean;
  painRecently?: boolean;
  checkinToday?: boolean;
  memo?: string[];
  rehab?: boolean;
  /** 주당 전력 환산 — 평소(만성) · 최근 1주(급성). 안 주면 칸 없음(옛 시험과 같다) */
  chronic?: number;
  acute?: number;
  estimated?: boolean;
  throwPlanToday?: string | null;
  /** 최근 4주 마지막 등판 날(null = 4주 동안 없음) — 안 주면 칸 없음(옛 facts) */
  lastOutingDate?: string | null;
}): ReportFacts {
  return {
    profile: { age: o.age === undefined ? 25 : o.age },
    load: {
      zone: o.zone === undefined ? 'optimal' : o.zone,
      ratio: o.ratio ?? 1.05,
      chronic: o.chronic,
      acute: o.acute,
      estimated: o.estimated ?? false,
    },
    patterns: {
      recentOutings: o.outings ?? [],
      hardOutings: o.hard ?? [],
      ...(o.lastOutingDate !== undefined ? { lastOutingDate: o.lastOutingDate } : {}),
    },
    condition: {
      painToday: o.painToday ?? false,
      painRecently: o.painRecently ?? false,
      today: o.checkinToday === false ? null : {},
      painWordsInMemo: o.memo ?? [],
      throwPlanToday: o.throwPlanToday ?? null,
      throwPlanYesterday: null,
      rehab: o.rehab
        ? { area: 'elbow', label: '팔꿈치 안쪽', stage: 2, throwing: 'none', firstWeekNoThrow: true }
        : null,
    },
  } as unknown as ReportFacts;
}

const NUM_PITCH = /\d+\s*~\s*\d+\s*구|구 이하|강도 \d/;

{
  const s = armStatusOf(facts({}));
  check('아무 신호 없음 → 안전', s.level === 'safe', s.headline);
}
{
  const s = armStatusOf(facts({ painToday: true, zone: 'optimal' }));
  check('오늘 통증 → 위험 · 통증이 머리', s.level === 'danger' && s.headline.includes('통증'));
  check('위험일 때 안전 신호는 안 붙음', !s.details.some((d) => d.includes('평소와 비슷')));
}
{
  const s = armStatusOf(facts({ rehab: true }));
  check('재활 중 → 위험', s.level === 'danger' && s.headline.includes('재활'));
}
{
  const s = armStatusOf(facts({ painRecently: true, checkinToday: false }));
  check('최근 통증 · 오늘 체크인 없음 → 주의', s.level === 'caution' && s.headline.includes('체크인'));
}
{
  const s = armStatusOf(facts({ memo: ['결림'], checkinToday: false }));
  check('메모 통증 표현 · 체크인 없음 → 주의', s.level === 'caution' && s.headline.includes('결림'));
}
/*
 * 2026-10-16 사용자 결정: 투구수 휴식표(전력 투구는 N일 뒤)는 팔 상태에서 뺐다. 이제 큰 등판은 '세게 던진 날'(투구수 × 체감 강도 ≥ 2,700
 * 또는 거의 전력 30구)만 신호다 — 오늘이면 위험, 어제면 주의. 양만 많고 가볍게 던진 날(90구 · 강도 5)은 부하 지수가 말한다.
 */
{
  const s = armStatusOf(facts({ hard: [{ daysAgo: 1, pitches: 90, load: 7200, nearMaxPitches: 90 }] }));
  check('어제 세게 90구 → 주의 · 가장 지친 날', s.level === 'caution' && s.headline.includes('어제 90구'), s.headline);
}
{
  const s = armStatusOf(facts({ hard: [{ daysAgo: 0, pitches: 85, load: 7650, nearMaxPitches: 85 }] }));
  check('오늘 세게 85구(성인) → 주의 · 더 던지지 않음(할 만큼 던진 날, 위험 아님 — 2026-10-16 베타)', s.level === 'caution' && s.headline.includes('오늘 85구'), s.headline);
}
/* 2026-10-16 베타 시뮬 뒤 고침 — 성장기 휴식표 되살림 · '세게'는 평균 70% 부터 · 평소 양이 적으면 지수로 빨강 안 냄 · 오래 쉰 등판 */
{
  const s = armStatusOf(facts({ age: 12, outings: [{ daysAgo: 1, pitches: 62, adjusted: 62 }] }));
  check('만 12세 어제 62구 → 위험 · 오늘은 전력 투구 쉬는 날', s.level === 'danger' && s.headline.includes('쉬는 날'), s.headline);
}
{
  const s = armStatusOf(facts({ age: 14, outings: [{ daysAgo: 3, pitches: 71, adjusted: 71 }] }));
  check('만 14세 사흘 전 71구 → 주의 · 전력 투구는 1일 뒤', s.level === 'caution' && s.headline.includes('1일 뒤부터'), s.headline);
}
{
  const s = armStatusOf(facts({ age: 17, outings: [{ daysAgo: 0, pitches: 40, adjusted: 40 }] }));
  check('만 17세 오늘 40구 → 주의 · 1일 쉼(15~18세 표)', s.level === 'caution' && s.headline.includes('1일은 전력 투구를 쉬어요'), s.headline);
}
{
  const s = armStatusOf(facts({ age: 25, outings: [{ daysAgo: 1, pitches: 90, adjusted: 90 }] }));
  check('성인 어제 90구(세게 던진 날 기록 없음) → 휴식표 안 봄 · 안전', s.level === 'safe', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(
    facts({ age: 12, outings: [{ daysAgo: 1, pitches: 62, adjusted: 62 }], hard: [{ daysAgo: 1, pitches: 62, load: 6200, nearMaxPitches: 62 }] })
  );
  check('성장기는 휴식 신호와 세게 던진 날을 겹쳐 적지 않음', ![s.headline, ...s.details].some((t) => t.includes('세게')), [s.headline, ...s.details].join(' / '));
}
{
  const s = armStatusOf(facts({ hard: [{ daysAgo: 0, pitches: 50, load: 3250, nearMaxPitches: 0 }] }));
  check('롱토스 50구 · 65%(곱 2,700 넘음) → 세게 던진 날로 안 띄움 · 안전', s.level === 'safe', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ hard: [{ daysAgo: 0, pitches: 35, load: 2800, nearMaxPitches: 0 }] }));
  check('불펜 35구 · 80% → 주의', s.level === 'caution' && s.headline.includes('세게'), `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ zone: 'danger', ratio: 3.62, chronic: 200, acute: 500 }));
  check('평소 양이 적은데 늘었음(지수 3.62) → 위험 아님 · 주의 · 흔들림', s.level === 'caution' && s.headline.includes('흔들려요'), `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ zone: 'danger', ratio: 1.64, chronic: 150, acute: 240 }));
  check('평소도 최근도 적음(캐치볼 20구 한 번) → 안전', s.level === 'safe', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ zone: 'danger', ratio: 1.6, chronic: 1200, acute: 1900 }));
  check('평소 양이 충분하고 크게 늘었음 → 위험 그대로', s.level === 'danger', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ zone: 'danger', ratio: 1.6, chronic: 1200, acute: 1900, estimated: true }));
  check('문진 추정이 섞여 흔들리는 동안 → 위험을 주의로', s.level === 'caution' && s.headline.includes('흔들려요'), `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ throwPlanToday: '오늘 등판', lastOutingDate: null }));
  check('최근 4주 등판 없이 오늘 등판 → 주의 · 짧게', s.level === 'caution' && s.headline.includes('등판 기록이 없어요'), `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ throwPlanToday: '오늘 등판', lastOutingDate: '2026-10-10' }));
  check('최근 등판이 있으면 등판 주의 없음', s.level === 'safe', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ throwPlanToday: '오늘 등판' }));
  check('마지막 등판 칸이 없는 옛 facts 는 등판 주의 안 띄움', s.level === 'safe', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ outings: [{ daysAgo: 0, pitches: 35, adjusted: 33 }] }));
  check('오늘 가벼운 35구(세게 던진 날 아님) → 안전', s.level === 'safe', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ outings: [{ daysAgo: 1, pitches: 90, adjusted: 45 }] }));
  check('어제 90구인데 가볍게(세게 던진 날 아님) → 휴식표를 안 읽어 안전', s.level === 'safe', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ hard: [{ daysAgo: 2, pitches: 80, load: 7000 }] }));
  check('이틀 전 세게 던진 날 → 오늘 · 어제가 아니라 신호 없음', s.level === 'safe', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ outings: [{ daysAgo: 5, pitches: 80, adjusted: 80 }] }));
  check('닷새 전 80구 → 여파 끝 · 안전', s.level === 'safe', s.headline);
}
{
  const s = armStatusOf(facts({ zone: 'danger', ratio: 1.62 }));
  check('부하 위험 → 위험 · 지수', s.level === 'danger' && s.headline.includes('1.62'));
}
{
  const s = armStatusOf(facts({ zone: 'caution', ratio: 1.35 }));
  check('부하 주의 → 주의', s.level === 'caution');
}
{
  const s = armStatusOf(facts({ zone: null, ratio: null }));
  check('부하 모름 → 안전 · 기록이 적음', s.level === 'safe' && s.headline.includes('기록이 적어요'));
}
{
  const outings = [0, 1, 2].map((d) => ({ daysAgo: d, pitches: 20, adjusted: 10 }));
  const s = armStatusOf(facts({ outings }));
  check('사흘 연투 → 주의', s.level === 'caution' && s.headline.includes('3일 이어'), s.headline);
}
{
  const outings = [5, 6, 7].map((d) => ({ daysAgo: d, pitches: 20, adjusted: 10 }));
  const s = armStatusOf(facts({ outings }));
  check('지난 연투는 안 셈', s.level === 'safe', s.headline);
}
{
  const s = armStatusOf(facts({ age: 15, outings: [{ daysAgo: 0, pitches: 100, adjusted: 100 }] }));
  check('만 15세 오늘 100구 → 하루 한도 넘음 신호', s.level === 'danger' && [s.headline, ...s.details].some((t) => t.includes('하루 한도 95구')));
}
{
  const s = armStatusOf(facts({ age: 25, outings: [{ daysAgo: 0, pitches: 130, adjusted: 130 }] }));
  check('성인은 하루 한도 신호 없음', ![s.headline, ...s.details].some((t) => t.includes('한도')));
}
{
  /* 어떤 조합에서도 권하는 투구수('40~55구', '60구 이하', '강도 60%')를 쓰지 않는다 */
  let bad = '';
  for (const painToday of [false, true])
    for (const zone of ['danger', 'caution', 'optimal', 'low', null] as const)
      for (const d of [0, 1, 2, 3, 9])
        for (const p of [20, 45, 70, 110]) {
          const s = armStatusOf(
            facts({ painToday, zone, outings: [{ daysAgo: d, pitches: p, adjusted: p }], age: 14 })
          );
          for (const t of [s.headline, ...s.details]) if (NUM_PITCH.test(t)) bad = t;
          if (s.details.length > 3) bad = 'details > 3';
        }
  check('권하는 투구수 글 없음', bad === '', bad);
}

console.log(`arm-status: ${passed} 통과 · ${failed} 실패`);
if (failed) process.exit(1);
