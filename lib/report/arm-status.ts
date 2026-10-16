import type { ReportFacts } from '@/lib/report/facts';
import { dailyPitchCap } from '@/lib/report/plan';
import { hardOuting } from '@/lib/report/theme';

/**
 * 지금 팔 상태 — 위험 · 주의 · 안전(2026-10-14 사용자: "몇 구를 던져라 이런 식이 아니라 지금이 위험한 상태인지 안전한
 * 상태인지 알려 줘").
 *
 * 예전 화면은 투구 계획(lib/report/plan.ts buildPitchPlan)의 오늘 몫을 '40~55구 · 강도 60~80%'로 보였다. 이제 화면은
 * 숫자를 권하지 않고 지금 상태만 말한다. 계획 자체는 남는다 — 매일 운동 · 암케어 · 오늘 상태 한 장이 '오늘 공을 쉬는
 * 날인가'를 거기서 읽는다. 이 파일은 같은 재료(통증 · 재활 · 큰 등판의 여파 · 부하 지수 · 연투 · 성장기 하루 한도)를
 * 신호로 바꿔 가장 센 것 하나를 머리로 든다.
 *
 * '지금'이라 오늘 던진 기록까지 넣은 facts 를 받는다(gatherFactsAndPlan 의 excludeToday 를 쓰지 않는다) — 오늘 90구를
 * 던지고 나면 곧바로 '위험'이 된다.
 *
 * 화면 글은 해요체 · 줄표 없음. 권하는 투구수는 쓰지 않는다(지난 기록의 투구수 · 성장기 하루 한도는 사실이라 쓴다).
 */

export type ArmLevel = 'danger' | 'caution' | 'safe';

export const ARM_LEVEL_LABEL: Record<ArmLevel, string> = {
  danger: '위험',
  caution: '주의',
  safe: '안전',
};

export type ArmStatus = {
  level: ArmLevel;
  /** 머리 한 줄 — 가장 센 신호 */
  headline: string;
  /** 같이 걸린 신호(머리 빼고 센 순서), 많아야 셋 */
  details: string[];
};

type Signal = { level: ArmLevel; text: string };

const RANK: Record<ArmLevel, number> = { danger: 2, caution: 1, safe: 0 };

/** 이만큼 이어 던졌으면 '주의'(오늘 또는 어제까지 이어진 연투만 센다 — 넉 주 전 연투로 오늘을 막지 않는다) */
export const STREAK_CAUTION_DAYS = 3;

/** 오늘(daysAgo 0) 또는 어제부터 거꾸로 이어 던진 날 수 */
function currentStreak(outings: { daysAgo: number; pitches: number }[]): number {
  const days = new Set(outings.filter((o) => o.pitches > 0).map((o) => o.daysAgo));
  const start = days.has(0) ? 0 : days.has(1) ? 1 : -1;
  if (start < 0) return 0;
  let n = 0;
  while (days.has(start + n)) n++;
  return n;
}

function ratioText(ratio: number | null): string {
  return ratio == null ? '' : `(부하 지수 ${ratio.toFixed(2)})`;
}

export function armStatusOf(facts: ReportFacts): ArmStatus {
  const { condition, patterns, load, profile } = facts;
  const age = profile.age;
  const signals: Signal[] = [];

  /* 1) 통증 · 재활 — 어떤 부하 숫자보다 먼저다 */
  if (condition.painToday) {
    signals.push({
      level: 'danger',
      text: '오늘 체크인에 통증이 있어요. 아픈 동안에는 던지지 마세요.',
    });
  }
  if (condition.rehab) {
    const r = condition.rehab;
    signals.push({
      level: 'danger',
      text:
        r.throwing === 'light'
          ? `재활 중이에요(${r.label} · ${r.stage}단계). 가벼운 캐치볼만 해요.`
          : `재활 중이에요(${r.label} · ${r.stage}단계). 재활을 마칠 때까지 던지지 않아요.`,
    });
  }
  if (!condition.painToday && condition.painRecently) {
    signals.push({
      level: 'caution',
      text:
        condition.today == null
          ? '최근 체크인에 통증이 있었어요. 오늘 체크인으로 지금 상태를 알려 주세요.'
          : '최근 체크인에 통증이 있었어요. 다시 아프면 바로 쉬어요.',
    });
  }
  if (condition.painWordsInMemo.length > 0 && condition.today == null) {
    signals.push({
      level: 'caution',
      text: `최근 메모에 ‘${condition.painWordsInMemo.join(', ')}’ 같은 말이 있었어요. 체크인으로 확인해 주세요.`,
    });
  }

  /*
   * 2) (뺌 — 2026-10-16 사용자 결정) 투구수 휴식표(plan.ts REST_REQUIREMENTS)로 '전력 투구는 N일 뒤' 를 말하던 신호. 팔 상태는 이제
   * 통증 · 재활 · 부하 지수 · 세게 던진 날 · 연투 · 성장기 하루 한도만으로 정한다. 휴식표 자체는 성장기 투구 계획(buildPitchPlan)에 남는다.
   */

  /* 2') 세게 던진 날(오늘 · 어제 — theme.ts hardOuting, 투구수 × 체감 강도 ≥ 2,700 또는 경기 · 강도 9~10 으로 30구) */
  const hard = hardOuting(facts);
  if (hard) {
    signals.push(
      hard.daysAgo === 0
        ? { level: 'danger', text: `오늘 ${hard.pitches}구를 세게 던졌어요. 오늘은 더 던지지 않아요.` }
        : { level: 'caution', text: `어제 ${hard.pitches}구를 세게 던져 팔이 가장 지친 날이에요.` }
    );
  }

  /* 3) 성장기 하루 한도 — 오늘 던진 양이 넘었을 때만(성인은 한도가 없다) */
  const cap = dailyPitchCap(age);
  const todayPitches = (patterns.recentOutings ?? [])
    .filter((o) => o.daysAgo === 0)
    .reduce((n, o) => n + o.pitches, 0);
  if (cap != null && todayPitches > cap) {
    signals.push({
      level: 'danger',
      text:
        age == null
          ? `오늘 ${todayPitches}구로 하루 한도 ${cap}구를 넘었어요.`
          : `오늘 ${todayPitches}구로 만 ${age}세 하루 한도 ${cap}구를 넘었어요.`,
    });
  }

  /* 4) 연투 */
  const streak = currentStreak(patterns.recentOutings ?? []);
  if (streak >= STREAK_CAUTION_DAYS) {
    signals.push({
      level: 'caution',
      text: `${streak}일 이어 던졌어요. 하루 쉬어 가면 좋아요.`,
    });
  }

  /* 5) 부하 지수 — 최근 1주가 평소 4주에 견줘 얼마나 늘었나 */
  switch (load.zone) {
    case 'danger':
      signals.push({
        level: 'danger',
        text: `최근 투구가 평소보다 크게 늘었어요${ratioText(load.ratio)}.`,
      });
      break;
    case 'caution':
      signals.push({
        level: 'caution',
        text: `최근 투구가 평소보다 늘었어요${ratioText(load.ratio)}.`,
      });
      break;
    case 'optimal':
      signals.push({
        level: 'safe',
        text: `최근 투구량이 평소와 비슷해요${ratioText(load.ratio)}.`,
      });
      break;
    case 'low':
      signals.push({
        level: 'safe',
        text: `최근 평소보다 적게 던졌어요${ratioText(load.ratio)}. 다시 늘릴 때는 조금씩 늘려요.`,
      });
      break;
    default:
      signals.push({
        level: 'safe',
        text: '아직 기록이 적어요. 기록이 쌓이면 평소와 견줘 볼게요.',
      });
  }

  /* 센 순서로(같은 세기면 위에서 넣은 차례 — 통증이 부하보다 앞) */
  const sorted = signals
    .map((s, i) => ({ s, i }))
    .sort((a, b) => RANK[b.s.level] - RANK[a.s.level] || a.i - b.i)
    .map((x) => x.s);
  const top = sorted[0];
  /* 위험 · 주의일 때 '안전' 신호(부하가 적정)는 덧붙이지 않는다 — 머리와 서로 다른 말을 한다 */
  const rest = sorted
    .slice(1)
    .filter((s) => top.level === 'safe' || s.level !== 'safe')
    .slice(0, 3)
    .map((s) => s.text);
  return { level: top.level, headline: top.text, details: rest };
}
