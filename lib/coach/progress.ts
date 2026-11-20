import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { RATED_SESSION_TYPES } from '@/lib/pitch-satisfaction';
import { REVIEW_CHOICES, compareAnalysis, type MechanicsReview } from '@/lib/mechanics/comparison';
import type { GoodDayResult } from '@/lib/report/good-days';

/**
 * 코치가 보는 '늘고 있나'(2026-11-21 김민: AI 코치 검토 1번 — 기량 발전 고리의 측정 · 돌아보기가 비어 있었다). 이미 쌓인 기록에서 계산만 한다
 * (새 표 · AI 없음). 넷: 운동 무게 흐름 · 투구 만족도와 감각 칩 · 3D 다시 재기 · 잘 던진 날 패턴. 좋아졌다는 판정은 하지 않는다 — 기록 값을
 * 나란히 놓을 뿐이고, 3D 비교 · 잘 던진 날은 앱 화면이 이미 정한 결과만 옮긴다. 순수 파일(불러오기는 lib/coach/records.ts).
 */

/** 진척을 보는 창(오늘 포함) — 만족도는 앞 · 뒤 반씩 */
export const PROGRESS_DAYS = 28;
/** 무게 흐름에 싣는 운동 수 */
export const LIFTS_SHOWN = 3;
/** 감각 칩 위에서 몇 개 */
const CUES_SHOWN = 3;
/** 건강정보 동의가 있어야 보내는 감각 칩 · 잘 던진 날 항목(몸 상태) */
const HEALTH_CUE = '팔 무거움';
const HEALTH_GOOD_DAY_KEYS = new Set(['sleep', 'condition', 'soreness', 'arm']);

export type CoachAiProgress = {
  /** 무게를 적은 운동 — 4주에 2번 넘게 적은 것, 적은 날이 많은 순 */
  lifts: { name: string; first: string; last: string; days: number }[];
  /** 불펜 · 라이브 · 경기 만족도(1~5) 앞 2주 · 최근 2주, 4주 감각 칩 */
  pitch: { before: { avg: number; n: number } | null; recent: { avg: number; n: number } | null; good: [string, number][]; bad: [string, number][] };
  /** 지금 메커니즘 처방의 3D 다시 재기 — 'none' 기준 3D 없음 */
  recheck:
    | { base: string; followups: number; last: { date: string; kind: 'measurement' | 'held' | 'recomputation' } | null; choice: string | null }
    | 'none'
    | null;
  /** 잘 던진 날 패턴 글(앱이 찾은 것) — 모자라면 매긴 날 · 필요한 날 */
  goodDays: string[] | { rated: number; needed: number } | null;
};

const kg = (w: number, reps: number | null) => `${w}kg${reps ? `×${reps}` : ''}`;

/** 최근 4주 무게 흐름 — 같은 운동을 적은 첫날과 마지막 날(그날 가장 무거운 세트) */
export function liftTrendsOf(
  logs: readonly { date: string; name: string; weightKg: number | null; reps: number | null }[]
): CoachAiProgress['lifts'] {
  const byName = new Map<string, Map<string, { w: number; reps: number | null }>>();
  for (const l of logs) {
    if (!l.weightKg || l.weightKg <= 0) continue;
    const days = byName.get(l.name) ?? new Map();
    const prev = days.get(l.date);
    if (!prev || l.weightKg > prev.w) days.set(l.date, { w: l.weightKg, reps: l.reps });
    byName.set(l.name, days);
  }
  return [...byName.entries()]
    .filter(([, days]) => days.size >= 2)
    .map(([name, days]) => {
      const dates = [...days.keys()].sort();
      return { name, dates, f: days.get(dates[0])!, l: days.get(dates.at(-1)!)! };
    })
    .sort((a, b) => b.dates.length - a.dates.length || b.l.w - a.l.w)
    .slice(0, LIFTS_SHOWN)
    .map(({ name, dates, f, l }) => ({ name, first: `${dates[0]} ${kg(f.w, f.reps)}`, last: `${dates.at(-1)} ${kg(l.w, l.reps)}`, days: dates.length }));
}

const mean = (xs: number[]) => (xs.length ? { avg: Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10, n: xs.length } : null);
const topCues = (xs: string[], health: boolean): [string, number][] => {
  const n = new Map<string, number>();
  for (const c of xs) if (health || c !== HEALTH_CUE) n.set(c, (n.get(c) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).slice(0, CUES_SHOWN);
};

/** 투구 만족도 앞 2주 · 최근 2주(불펜 · 라이브 · 경기만, 기록마다 하나), 4주 감각 칩 */
export function pitchFeelOf(
  logs: readonly { date: string; sessionType: string; satisfaction: number | null; cuesGood: string[]; cuesBad: string[] }[],
  today: string,
  health: boolean
): CoachAiProgress['pitch'] {
  const half = shiftDateKey(today, -(PROGRESS_DAYS / 2 - 1));
  const rated = logs.filter((l) => l.satisfaction != null && (RATED_SESSION_TYPES as readonly string[]).includes(l.sessionType));
  return {
    before: mean(rated.filter((l) => l.date < half).map((l) => l.satisfaction!)),
    recent: mean(rated.filter((l) => l.date >= half).map((l) => l.satisfaction!)),
    good: topCues(logs.flatMap((l) => l.cuesGood), health),
    bad: topCues(logs.flatMap((l) => l.cuesBad), health),
  };
}

/** 지금 처방의 3D 다시 재기 — 마지막 비교의 종류(비교 화면과 같은 판정)와 선수가 고른 다음 */
export function recheckOf(review: MechanicsReview | null | undefined): CoachAiProgress['recheck'] {
  if (!review) return 'none';
  const last = review.followups.at(-1);
  const decided = review.decisions.at(-1);
  return {
    base: toDateKey(new Date(review.baseline.savedAt)),
    followups: review.followups.length,
    last: last ? { date: toDateKey(new Date(last.linkedAt)), kind: compareAnalysis(review.baseline, last.snapshot, last.conditions).kind } : null,
    choice: decided ? REVIEW_CHOICES[decided.choice] : null,
  };
}

/** 잘 던진 날 패턴 — 몸 상태 항목은 건강 동의가 있을 때만, 끼니는 영양을 쓸 때만 */
export function goodDayLinesOf(r: GoodDayResult, health: boolean, nutrition: boolean): CoachAiProgress['goodDays'] {
  if (r.rated < r.needed) return { rated: r.rated, needed: r.needed };
  return r.patterns
    .filter((p) => (health || (!HEALTH_GOOD_DAY_KEYS.has(p.key) && !p.key.endsWith(`:${HEALTH_CUE}`))) && (nutrition || p.key !== 'protein'))
    .map((p) => p.text);
}

const RECHECK_KIND = { measurement: '비교함(수치는 메커니즘 화면)', held: '비교 보류(까닭은 메커니즘 화면)', recomputation: '같은 영상이라 비교 안 함' } as const;
const avgText = (m: { avg: number; n: number } | null) => (m ? `${m.avg}(${m.n}번)` : '없음');
const cueText = (xs: [string, number][]) => (xs.length ? xs.map(([c, n]) => `${c} ${n}`).join(' · ') : '없음');

/** 맥락 덩이 줄 — p 가 없으면(옛 호출) '모름' */
export function progressLines(p: CoachAiProgress | null | undefined): string[] {
  if (!p) return ['진척(최근 4주): 모름'];
  const r = p.recheck;
  const g = p.goodDays;
  return [
    '진척(최근 4주, 기록 그대로 — 판정 아님):',
    ...(p.lifts.length ? p.lifts.map((l) => `- 무게 | ${l.name} | ${l.first} → ${l.last} | ${l.days}번 적음`) : ['- 무게 | 두 날 넘게 무게를 적은 운동 없음']),
    `- 투구 만족도(1~5, 불펜 · 라이브 · 경기) | 앞 2주 ${avgText(p.pitch.before)} → 최근 2주 ${avgText(p.pitch.recent)}`,
    `- 감각 칩(4주, 고른 횟수) | 좋았던: ${cueText(p.pitch.good)} | 아쉬웠던: ${cueText(p.pitch.bad)}`,
    `- 3D 다시 재기 | ${
      r == null
        ? '모름'
        : r === 'none'
          ? '기준 3D 없음'
          : `기준 ${r.base} · 다시 잰 것 ${r.followups}번${r.last ? ` · 마지막 ${r.last.date} ${RECHECK_KIND[r.last.kind]}` : ''}${r.choice ? ` · 선수가 고른 다음: ${r.choice}` : ''}`
    }`,
    `- 잘 던진 날(앱이 찾은 것) | ${
      g == null ? '모름' : Array.isArray(g) ? g.join(' / ') || '뚜렷한 차이 없음' : `만족도 매긴 날 ${g.rated}일 · ${g.needed}일부터 찾아요`
    }`,
  ];
}
