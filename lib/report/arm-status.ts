import {
  HARD_OUTING_MIN_PITCHES,
  isHardOuting,
  type HardOuting,
  type ReportFacts,
} from '@/lib/report/facts';
import { ADULT_AGE, dailyPitchCap, pendingOuting } from '@/lib/report/plan';
import { todayOutingRole } from '@/lib/checkin';
import { ACWR_ZONES, type AcwrZone } from '@/lib/pitch-stats';

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

/** 성장기 휴식표에서 이만큼 넘게 쉬어야 하는 등판의 오늘 · 다음 날은 '위험', 아니면 '주의' */
export const DANGER_REST_DAYS = 2;

/**
 * 팔 상태에 '세게 던졌어요'로 보일 평균 체감 강도(%) — 그날 Σ 투구수 × 체감 강도 ÷ 투구수가 이 아래면(롱토스 50구 · 65%,
 * 재활 캐치볼 49구 · 58%) 곱이 2,700 을 넘어도 팔 상태에는 안 띄운다(2026-10-16 베타 시뮬: 평범한 날마다 빨강). 매일 운동 엔진의
 * '세게 던진 날'(facts.ts isHardOuting)은 그대로다 — 여기는 보여 주는 것만.
 */
export const HARD_SHOWN_MIN_EFFORT_PCT = 70;

/**
 * 평소 투구량(facts.load.chronic — 주당 Σ 투구수 × 강도 1~10)이 이보다 적으면 부하 지수를 '위험'으로 읽지 않는다. 600 ≈ 한 주에
 * 전력 60구. 분모가 작으면 캐치볼 20구 하나로 지수가 3 을 넘고, 주말에만 던지는 사람은 경기 날마다 1.5 를 넘는다(2026-10-16 베타 시뮬:
 * 10년 쉬고 돌아온 45세가 19일 연속 빨강). 그때는 '양이 적어 크게 흔들린다'로. 매주 선발(약 1,100~1,200)은 그대로 지수를 본다.
 */
export const LOW_BASE_WEEKLY_LOAD = 600;
/** 평소도 적고 최근 1주(facts.load.acute)도 이보다 적으면 안전 — 300 ≈ 한 주에 전력 30구 */
export const LOW_ACUTE_WEEKLY_LOAD = 300;

/** 팔 상태에 '세게 던졌어요'로 띄울 날인가 — 엔진의 세게 던진 날 가운데 평균이 가벼운 날(롱토스 · 가벼운 캐치볼)은 뺀다 */
function shownHard(o: HardOuting): boolean {
  return (
    o.load == null ||
    o.load >= HARD_SHOWN_MIN_EFFORT_PCT * o.pitches ||
    (o.nearMaxPitches ?? 0) >= HARD_OUTING_MIN_PITCHES
  );
}

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
   * 2) 성장기(만 19세 미만 · 나이 모름) 휴식표 — 큰 등판 뒤 '전력 투구는 N일 뒤'. 2026-10-16 오전에 팔 상태에서 뺐다가(성인 포함 전부),
   * 같은 날 베타 시뮬(12세가 62구 다음 날에도 '주의'뿐)을 보고 사용자가 성장기만 되살렸다. 성인은 그대로 안 본다 — 세게 던진 날 ·
   * 부하 지수가 말한다. 표는 lib/report/plan.ts(만 14세 이하는 어린 표).
   */
  const youth = age == null || age < ADULT_AGE;
  const owed = youth ? pendingOuting(patterns, 0, age) : null;
  if (owed) {
    const need = owed.left + owed.elapsed;
    const heavy = need >= DANGER_REST_DAYS;
    if (owed.elapsed === 0) {
      signals.push({
        level: heavy ? 'danger' : 'caution',
        text: `오늘 ${owed.pitches}구 던졌어요. ${need}일은 전력 투구를 쉬어요.`,
      });
    } else if (owed.elapsed === 1) {
      signals.push({
        level: heavy ? 'danger' : 'caution',
        text:
          owed.left > 1
            ? `어제 ${owed.pitches}구 던져 오늘은 전력 투구를 쉬는 날이에요. 전력 투구는 ${owed.left}일 뒤부터예요.`
            : `어제 ${owed.pitches}구 던져 오늘은 전력 투구를 쉬는 날이에요.`,
      });
    } else {
      signals.push({
        level: 'caution',
        text: `${owed.elapsed}일 전 ${owed.pitches}구 던진 뒤 쉬는 중이에요. 전력 투구는 ${owed.left}일 뒤부터예요.`,
      });
    }
  }

  /*
   * 2') 세게 던진 날(오늘 · 어제 — facts.ts isHardOuting, 투구수 × 체감 강도 ≥ 2,700 또는 경기 · 강도 9~10 으로 30구). '주의'까지만 —
   * 할 만큼 던진 날이지 다친 날이 아니다(2026-10-16 베타 시뮬: 불펜 주 3번 투수가 30일 중 21일 빨강). 평균이 가벼운 날은 안 띄운다(shownHard).
   * 성장기는 휴식표 신호가 이미 같은 날을 말하면 겹쳐 적지 않는다.
   */
  const hard = (patterns.hardOutings ?? []).find(
    (o) => o.daysAgo <= 1 && isHardOuting(o) && shownHard(o)
  );
  if (hard && !(owed && owed.elapsed === hard.daysAgo)) {
    signals.push(
      hard.daysAgo === 0
        ? { level: 'caution', text: `오늘 ${hard.pitches}구를 세게 던졌어요. 오늘은 더 던지지 않아요.` }
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

  /*
   * 4') 오래 등판을 안 하다 오늘 등판 — 최근 4주 등판(경기 기록 · 그날 '오늘 등판' 답 · 달력 일정 — facts.patterns.lastOutingDate)이 없는데
   * 오늘 '등판'이라 했고 아직 안 던졌다. 부하 지수는 그날 아침 '적정'으로 나오기 쉽다(2026-10-16 베타 시뮬: 복귀 첫 전력 경기 날 아침이
   * '안전'). 칸이 없는 옛 facts(undefined)는 안 본다 — null 이 '4주 동안 없음'이다.
   */
  if (
    todayPitches === 0 &&
    patterns.lastOutingDate === null &&
    todayOutingRole(condition.throwPlanToday, condition.throwPlanYesterday) === 'game'
  ) {
    signals.push({
      level: 'caution',
      text: '최근 4주 동안 등판 기록이 없어요. 오늘 등판은 짧게 끊고 팔 상태를 봐요.',
    });
  }

  /* 5) 부하 지수 — 판정은 loadSignalOf 하나(홈 요약 칸 · 하이라이트도 같은 함수를 써서 서로 다른 말을 하지 않는다) */
  const ls = loadSignalOf(load);
  signals.push({ level: ls.level, text: ls.text });

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

/** 부하 지수 판정에 필요한 것 — facts.load(AcwrResult)가 그대로 맞는다. chronic · acute · estimated 가 없으면(옛 입력) 구간 그대로 */
export type LoadLike = {
  zone: AcwrZone | null;
  ratio: number | null;
  chronic?: number;
  acute?: number;
  estimated?: boolean;
};

export type LoadSignal = {
  level: ArmLevel;
  /** 어떤 판정인가 — lowBase = 평소 양이 적어 지수를 위험 · 주의로 안 읽음 */
  kind: 'danger' | 'caution' | 'optimal' | 'low' | 'lowBase' | 'unknown';
  /** 짧은 이름(홈 요약 칸 '1.62 · 위험'의 뒤) */
  label: string;
  /** 한 문장 — 지수 숫자 포함(팔 상태) */
  text: string;
  /** 한 문장 — 지수 숫자 없이(숫자를 따로 보이는 홈 요약 칸 밑줄) */
  plain: string;
};

/**
 * 부하 지수 한 판정 — 팔 상태 · 홈 요약 칸 부하 장 · 하이라이트가 같이 쓴다(2026-10-16 베타 100명: 홈은 '위험 · 쉬거나 줄여요', 투구 탭은
 * '안전'으로 서로 다른 말을 했다 — 42명). 평소 양이 아주 적으면(LOW_BASE_WEEKLY_LOAD) 지수가 작은 양에도 크게 뛰어 위험 · 주의로 읽지 않고,
 * 문진 추정이 섞여 흔들리는 동안(estimated) 위험은 주의로 낮춘다. 낮음은 '늘려요'를 권하지 않는다 — 주 1회 던지는 사람은 경기 전날마다 낮다.
 */
export function loadSignalOf(load: LoadLike): LoadSignal {
  const r = ratioText(load.ratio);
  const zoneLabel = load.zone ? ACWR_ZONES[load.zone].label : '';
  const lowBase = load.chronic != null && load.chronic < LOW_BASE_WEEKLY_LOAD;
  if (lowBase && (load.zone === 'danger' || load.zone === 'caution')) {
    const plain = '평소 던지는 양이 적어 지수가 크게 흔들려요. 늘릴 때는 한 주에 조금씩 늘려요.';
    return load.acute != null && load.acute < LOW_ACUTE_WEEKLY_LOAD
      ? { level: 'safe', kind: 'lowBase', label: '양이 적음', text: plain, plain }
      : {
          level: 'caution',
          kind: 'lowBase',
          label: '양이 적음',
          text: `평소 던지는 양이 적어 지수가 크게 흔들려요${r}. 늘릴 때는 한 주에 조금씩 늘려요.`,
          plain,
        };
  }
  if (load.zone === 'danger' && load.estimated) {
    return {
      level: 'caution',
      kind: 'caution',
      label: ACWR_ZONES.caution.label,
      text: `최근 투구가 평소보다 크게 늘었어요${r}. 아직 기록이 쌓이는 중이라 숫자가 크게 흔들려요.`,
      plain: '최근 투구가 평소보다 크게 늘었어요. 아직 기록이 쌓이는 중이라 숫자가 크게 흔들려요.',
    };
  }
  switch (load.zone) {
    case 'danger':
      return {
        level: 'danger',
        kind: 'danger',
        label: zoneLabel,
        text: `최근 투구가 평소보다 크게 늘었어요${r}.`,
        plain: '최근 투구가 평소보다 크게 늘었어요. 며칠은 쉬거나 줄여요.',
      };
    case 'caution':
      return {
        level: 'caution',
        kind: 'caution',
        label: zoneLabel,
        text: `최근 투구가 평소보다 늘었어요${r}.`,
        plain: '최근 투구가 평소보다 늘었어요. 며칠은 가볍게 던져요.',
      };
    case 'optimal':
      return {
        level: 'safe',
        kind: 'optimal',
        label: zoneLabel,
        text: `최근 투구량이 평소와 비슷해요${r}.`,
        plain: '최근 투구량이 평소와 비슷해요.',
      };
    case 'low':
      return {
        level: 'safe',
        kind: 'low',
        label: zoneLabel,
        text: `최근 1주가 평소보다 적어요${r}.`,
        plain: '최근 1주가 평소보다 적어요.',
      };
    default: {
      const unknown = '아직 기록이 적어요. 기록이 쌓이면 평소와 견줘 볼게요.';
      return { level: 'safe', kind: 'unknown', label: '', text: unknown, plain: unknown };
    }
  }
}
