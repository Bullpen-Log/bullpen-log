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
function facts(o: {
  age?: number | null;
  zone?: 'danger' | 'caution' | 'optimal' | 'low' | null;
  ratio?: number | null;
  outings?: Outing[];
  painToday?: boolean;
  painRecently?: boolean;
  checkinToday?: boolean;
  memo?: string[];
  rehab?: boolean;
}): ReportFacts {
  return {
    profile: { age: o.age === undefined ? 25 : o.age },
    load: { zone: o.zone === undefined ? 'optimal' : o.zone, ratio: o.ratio ?? 1.05 },
    patterns: { recentOutings: o.outings ?? [] },
    condition: {
      painToday: o.painToday ?? false,
      painRecently: o.painRecently ?? false,
      today: o.checkinToday === false ? null : {},
      painWordsInMemo: o.memo ?? [],
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
{
  const s = armStatusOf(facts({ outings: [{ daysAgo: 1, pitches: 90, adjusted: 90 }] }));
  check('어제 90구 → 위험', s.level === 'danger' && s.headline.includes('어제 90구'), s.headline);
}
{
  const s = armStatusOf(facts({ outings: [{ daysAgo: 0, pitches: 85, adjusted: 85 }] }));
  check('오늘 85구 → 위험 · 4일', s.level === 'danger' && s.headline.includes('4일'), s.headline);
}
{
  const s = armStatusOf(facts({ outings: [{ daysAgo: 0, pitches: 35, adjusted: 33 }] }));
  check('오늘 가벼운 35구(하루 쉼) → 주의', s.level === 'caution', `${s.level} ${s.headline}`);
}
{
  const s = armStatusOf(facts({ outings: [{ daysAgo: 2, pitches: 80, adjusted: 80 }] }));
  check(
    '이틀 전 80구 → 주의 · 회복 중',
    s.level === 'caution' && s.headline.includes('회복 중') && s.headline.includes('2일 뒤'),
    s.headline
  );
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
