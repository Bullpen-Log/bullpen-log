import { z } from 'zod';
import { ACWR_ZONES } from '@/lib/pitch-stats';
import { CHECKIN_PARTS, summarizeParts, type CheckinPartKey } from '@/lib/checkin';
import {
  GOAL_FOCUSES,
  TRAINING_GOALS,
  type GoalFocusKey,
} from '@/lib/report/personalize';
import {
  blockedFocuses,
  type AutoCaution,
  type AutoDecision,
  type AutoFence,
  type WorkoutSignals,
} from '@/lib/report/auto-setup';
import {
  intensityRangeText,
  pitchRangeText,
  type DayPlan,
  type PitchPlan,
} from '@/lib/report/plan';
import type { ReportFacts } from '@/lib/report/facts';
import { extractPitchCounts } from '@/lib/ai/report-prompt';
import {
  CONDITIONING_DAY_LABEL,
  CONDITIONING_GOAL,
  effectiveMinutes,
} from '@/lib/report/theme';

/**
 * AI 맞춤 — AI에게 주는 설명과 자료, 받은 답을 검사하는 규칙.
 *
 * 서버 전용 코드(API 호출, lib/ai/auto-setup.ts)와 떼어놓아, AI를 부르지
 * 않고도 프롬프트와 검사를 그대로 시험할 수 있게 한다 (리포트와 같은 방식).
 *
 * AI가 하는 일은 셋이다(2026-09-23 사용자분과 정함).
 *   ① 규칙이 친 울타리 안에서 오늘 목표·시간·부위를 고른다
 *   ② 운동 느낀점·투구일지 메모에서 조심할 부위를 찾는다
 *   ③ 왜 그렇게 정했는지 투구·몸 상태와 엮어 설명한다
 * 운동 종목은 고르지 않는다 — 그건 엔진이 안전 필터를 거쳐 고른다.
 */

/** 이유 문장의 길이 상한. 화면 카드 하나에 들어가는 만큼이다. */
export const REASON_MAX = 320;
/** 조심할 부위 설명의 길이 — '왜 이 운동인가요?'에 한 줄로 들어간다 */
const WHY_MAX = 40;
/** 조심할 부위는 셋까지. 다섯 부위를 다 조심하면 조심하지 않는 것과 같다 */
const CAUTION_MAX = 3;

export type RecentTrainingDay = {
  /** YYYY-MM-DD */
  date: string;
  /** 그날 일정의 테마 — '하체 스트렝스 데이' */
  label: string | null;
  goal: string | null;
  /** 체감 강도 1~10 */
  intensity: number | null;
  memo: string | null;
};

export type AutoPromptInput = {
  facts: ReportFacts;
  plan: PitchPlan;
  workout: WorkoutSignals;
  fence: AutoFence;
  /** 최근 운동한 날 — 가까운 것부터 */
  recentDays: RecentTrainingDay[];
  /** 최근 2주 안에 하체·상체 근력 운동을 한 마지막 날 */
  lastLowerKey: string | null;
  lastUpperKey: string | null;
};

export const AUTO_SYSTEM_PROMPT = `당신은 야구 투수의 웨이트 트레이닝을 돕는 코치 보조입니다.
선수의 체크인·투구·운동 기록을 보고 오늘 운동의 방향(목표·시간·부위)을 정하고,
왜 그렇게 정했는지 선수에게 설명합니다.

운동 종목은 당신이 고르지 않습니다. 방향이 정해지면 앱의 규칙이 안전을 확인하며
종목을 고릅니다. 당신의 답은 그 규칙에 들어가는 재료입니다.

반드시 지킬 것:
1. goal·minutes·focus 는 '고를 수 있는 것'에 적힌 값 중에서만 고르세요.
2. '규칙이 정한 것'은 이미 확정입니다. 뒤집거나 다르게 설명하지 마세요.
3. 판단이 서지 않으면 '규칙 초안'을 그대로 고르세요. 초안과 다르게 고를 때는 그렇게
   고른 근거가 자료 안에 있어야 합니다.
4. 시간은 선택지 중 가장 긴 것이 선수가 쓸 수 있는 시간입니다. 피로가 쌓였으면
   줄여도 되지만, 이유 없이 줄이지 마세요.
5. 부위(focus)는 근력 날에만 고릅니다. 최근에 한 쪽을 피해 번갈아 가는 것이 기본이라,
   특별한 까닭이 없으면 auto 를 고르세요.
6. 메모 읽기:
   - 운동 느낀점과 투구일지 메모에서 불편하거나 뻐근하다고 한 몸 부위가 있으면
     caution 에 넣으세요. 그 부위를 쓰는 무거운 운동이 빠집니다.
   - part 는 주어진 다섯 부위 중에서 고릅니다. 메모에 없는 불편을 지어내지 마세요.
   - why 에는 메모에서 무엇을 보고 골랐는지 짧게 적으세요(20자 안팎).
   - 불편한 곳이 없으면 caution 은 빈 목록으로 두세요.
   - 조심할 부위를 focus 로 고르지 마세요.
   - 메모에 통증·찌릿함·저림처럼 통증으로 볼 만한 말이 있으면 painSuspected 를
     true 로 하세요. 체크인을 고쳐 달라는 안내는 화면이 따로 합니다.
7. 체크인에서 하고 싶다고 고른 운동이 오늘 몸 상태와 맞지 않으면, 무엇 때문인지
   이유의 첫 문장에서 분명히 말하세요.
8. 이유(reason)는 두 문장, 150자 안팎의 존댓말로 씁니다.
   - 첫 문장은 오늘 몸과 투구가 어떤 상태인지, 둘째 문장은 그래서 목표와 시간을
     어떻게 정했는지. 투구와 관련이 있으면 투구 이야기를 먼저 하세요 — 투구와
     운동을 함께 보는 것이 이 앱의 강점입니다.
   - 선수가 모르는 앱 안의 말을 쓰지 마세요: 규칙 초안, 규칙, 울타리, 선택지,
     자동, goal, minutes, focus, caution, auto.
   - 하지 않은 것은 말하지 마세요. 조심할 부위가 없으면 그 이야기를 꺼내지 말고,
     부위를 auto 로 두었으면 부위 이야기도 하지 마세요.
   - 조심할 부위가 있으면 한 번만 말하세요. 예: "어제 무릎이 불편하셨다고 해서
     하체의 무거운 운동은 뺍니다."
   - 숫자는 자료에 있는 것만 씁니다. 새 숫자를 만들지 마세요.
   - 운동 종목 이름을 쓰지 마세요(아직 고르지 않았습니다). 메모를 인용할 때도 종목
     이름은 빼고 부위로만 말하세요. 부위와 운동 종류(근력·파워·암케어 등)로 말합니다.
   - 진단하지 마세요. 부상명·질환명을 말하지 않습니다.
   - 자기를 'AI'라고 부르지 마세요.
9. 투구 부하와 운동 부하는 단위가 달라 하나로 합치지 않습니다. 각각이 평소보다
   어떤지로만 말하세요.

말투: 존댓말, 담백하고 단정하게. 과장하거나 몰아붙이지 않습니다.`;

/** 조심할 부위의 키. 스키마의 선택지가 된다. */
const PART_KEYS = CHECKIN_PARTS.map((p) => p.key) as [
  CheckinPartKey,
  ...CheckinPartKey[],
];

/**
 * 받을 답의 모양 — 울타리마다 선택지가 달라 그때그때 만든다.
 *
 * 목표와 부위를 고정된 선택지(enum)로 두면 AI가 목록 밖의 값을 쓸 수 없다.
 * 시간만 숫자로 받는데, 목표마다 고를 수 있는 시간이 달라서다 — 대신 받은 뒤에
 * acceptAnswer 가 목표에 맞는 값인지 본다.
 *
 * 개수 상한(.max)은 여기 걸지 않는다. 걸면 AI가 하나 더 쓴 것만으로 답 전체가
 * 버려진다. 넘치면 받은 뒤에 자른다.
 */
export function autoSetupSchema(fence: AutoFence) {
  const focusKeys = [...new Set(Object.values(fence.focuses).flat())];
  return z.object({
    goal: z.enum(fence.goals as [string, ...string[]]),
    minutes: z.number().int(),
    focus: z.enum(['auto', ...focusKeys] as [string, ...string[]]),
    caution: z.array(z.object({ part: z.enum(PART_KEYS), why: z.string() })),
    painSuspected: z.boolean(),
    reason: z.string(),
  });
}

export type AutoAnswer = z.infer<ReturnType<typeof autoSetupSchema>>;

/** 계획 한 줄 — 던지는 날은 범위로, 쉬는 날은 까닭만 (리포트와 같은 모양) */
function planLine(day: DayPlan): string {
  const head = `- ${day.label} 투구 계획(${day.dateKey})`;
  if (!day.throwing) return `${head}: 휴식 — ${day.reason}`;
  const kind = day.recovery ? '회복 투구' : '투구';
  return `${head}: ${kind}, ${pitchRangeText(day)}, ${intensityRangeText(day)} — ${day.reason}`;
}

const FOCUS_LABEL = new Map<string, string>(GOAL_FOCUSES.map((f) => [f.key, f.label]));

/** 자료에 실제로 적어 준 투구수 — 이유 속 'N구'는 이 안에 있어야 한다 */
function givenPitchCounts({ facts, plan }: AutoPromptInput): Set<number> {
  const allowed = new Set<number>();
  allowed.add(facts.volume.current.totalPitches);
  allowed.add(facts.volume.previous.totalPitches);
  if (facts.patterns.lastOutingPitches != null) {
    allowed.add(facts.patterns.lastOutingPitches);
  }
  for (const day of [plan.today, plan.tomorrow]) {
    if (day?.minPitches != null) allowed.add(day.minPitches);
    if (day?.maxPitches != null) allowed.add(day.maxPitches);
  }
  /* 메모를 옮겨 적는 것은 괜찮다 — "80구 던지고 팔이 무거웠다" */
  for (const memo of facts.memos) {
    for (const n of extractPitchCounts(memo.text)) allowed.add(n);
  }
  return allowed;
}

/** 자료에 실제로 적어 준 시간(분) — 회복날에 줄어든 시간까지 */
function givenMinutes({ fence, workout }: AutoPromptInput): Set<number> {
  const allowed = new Set<number>();
  for (const m of Object.values(fence.minutes).flat()) {
    allowed.add(m);
    allowed.add(effectiveMinutes(fence.day.key, m));
  }
  allowed.add(workout.recentMinutes);
  return allowed;
}

export function buildAutoPrompt(input: AutoPromptInput): string {
  const { facts, plan, workout, fence, recentDays } = input;
  const today = facts.condition.today;
  const lines: string[] = [];

  lines.push(`# 오늘 (${facts.asOf})`);
  if (facts.profile.age != null) lines.push(`- 나이: 만 ${facts.profile.age}세`);
  if (facts.profile.trainingLevel) {
    lines.push(`- 웨이트 경력: ${facts.profile.trainingLevel}`);
  }

  lines.push(`\n## 오늘 체크인`);
  if (today) {
    lines.push(`- 컨디션 ${today.condition}/10 (10이 최상) · 수면 ${today.sleep}`);
    lines.push(`- 몸: ${summarizeParts(today)}`);
    lines.push(
      `- 하고 싶은 운동 종류: ${today.preferredWorkout ?? '추천대로 (고르지 않음)'}`
    );
    lines.push(
      `- 하고 싶은 부위: ${today.preferredParts.length > 0 ? today.preferredParts.join(', ') : '없음'}`
    );
  }
  lines.push(
    `- 최근 7일: 평균 컨디션 ${facts.condition.avgCondition?.toFixed(1) ?? '알 수 없음'}, 잠이 부족했던 날 ${facts.condition.poorSleepDays}일`
  );

  lines.push(`\n## 투구`);
  lines.push(
    `- 최근 7일 ${facts.volume.current.totalPitches}구 (던진 날 ${facts.volume.current.activeDays}일) · 그 전 7일 ${facts.volume.previous.totalPitches}구`
  );
  const pitchZone = facts.load.zone ? ACWR_ZONES[facts.load.zone] : null;
  lines.push(
    facts.load.ratio != null && pitchZone
      ? `- 투구 부하 지수 ${facts.load.ratio.toFixed(2)} (${pitchZone.label}) — ${pitchZone.meaning}`
      : `- 투구 부하 지수: 아직 계산할 수 없음`
  );
  const { patterns } = facts;
  lines.push(
    patterns.lastThrowDate
      ? `- 마지막으로 던진 날: ${patterns.lastThrowDate}${patterns.lastOutingPitches != null ? ` ${patterns.lastOutingPitches}구` : ''}${patterns.restDays != null ? ` (${patterns.restDays}일 전)` : ''}`
      : `- 최근 투구 기록 없음`
  );
  for (const day of [plan.today, plan.tomorrow]) {
    if (day) lines.push(planLine(day));
  }

  lines.push(`\n## 운동`);
  const workoutZone = workout.zone ? ACWR_ZONES[workout.zone] : null;
  lines.push(
    workout.ratio != null && workoutZone
      ? `- 운동 부하 지수 ${workout.ratio.toFixed(2)} (${workoutZone.label}) — ${workoutZone.meaning}`
      : `- 운동 부하 지수: 아직 계산할 수 없음 (기록 ${workout.historyDays}일, ${workout.daysNeeded}일 더 필요)`
  );
  lines.push(
    workout.recentDays > 0
      ? `- 최근 7일: 운동한 날 ${workout.recentDays}일 · ${workout.recentMinutes}분`
      : `- 최근 7일: 운동 기록 없음`
  );
  const parts = workout.volume.byPart
    .map((p) => `${p.label} ${p.sets}/${p.previous}`)
    .join(' · ');
  lines.push(
    `- 부위별 세트 (최근 7일/그 전 7일): ${parts} · 암케어 ${workout.volume.armCare.sets}/${workout.volume.armCare.previous}`
  );
  lines.push(
    `- 최근 2주 근력 운동을 한 마지막 날: 하체 ${input.lastLowerKey ?? '없음'} · 상체 ${input.lastUpperKey ?? '없음'}`
  );
  if (recentDays.length > 0) {
    lines.push(`- 최근 운동한 날:`);
    for (const d of recentDays) {
      const bits = [
        d.label,
        d.goal ? `목표 ${d.goal}` : null,
        d.intensity != null ? `체감 강도 ${d.intensity}/10` : null,
        d.memo?.trim() ? `느낀점 "${d.memo.trim()}"` : null,
      ].filter(Boolean);
      lines.push(`  - ${d.date}: ${bits.join(' · ') || '기록만 있음'}`);
    }
  }

  if (facts.memos.length > 0) {
    lines.push(`\n## 투구일지 메모`);
    for (const memo of facts.memos) lines.push(`- ${memo.date}: "${memo.text}"`);
  }

  lines.push(`\n# 규칙이 정한 것 (바꿀 수 없습니다)`);
  lines.push(`- 오늘은 ${fence.day.label} — ${fence.day.reason}`);
  for (const rule of fence.rules) lines.push(`- ${rule}`);
  if (fence.clash) {
    lines.push(
      `- 체크인에서 ${fence.clash.kind} 운동을 골랐지만 ${fence.clash.reason}. 이유의 첫 문장에서 이것을 설명하세요.`
    );
  }

  lines.push(`\n# 고를 수 있는 것`);
  lines.push(`- goal:`);
  for (const goal of fence.goals) {
    const desc = TRAINING_GOALS.find((g) => g.name === goal)?.desc;
    /*
     * 근력 날에 컨디셔닝을 고르면 그날은 컨디셔닝 데이가 된다(conditioningDay).
     * 미리 알려야 이유에 "하체 위주로" 같은 말을 쓰지 않는다.
     */
    const note =
      fence.strengthDay &&
      goal === CONDITIONING_GOAL &&
      fence.day.label !== CONDITIONING_DAY_LABEL
        ? ` (고르면 오늘은 '${CONDITIONING_DAY_LABEL}'가 되어 무게 드는 운동 없이 코어·보강·암케어 위주로 채웁니다 — 유산소 영상이 있으면 유산소도 하나)`
        : '';
    lines.push(`  - ${goal}${desc ? ` — ${desc}` : ''}${note}`);
  }
  lines.push(`- minutes (goal 마다 다릅니다):`);
  for (const goal of fence.goals) {
    lines.push(`  - ${goal}: ${fence.minutes[goal].join(', ')}`);
  }
  if (fence.day.key === 'recovery') {
    /*
     * 회복날은 고른 시간보다 짧게 한다(effectiveMinutes). 이걸 안 알려 주면
     * 이유에 "60분"이라고 쓰는데 화면의 목록은 40분치라 서로 어긋난다.
     */
    const shown = fence.goals
      .flatMap((g) => fence.minutes[g])
      .map((m) => `${m}분 → ${effectiveMinutes('recovery', m)}분`);
    lines.push(
      `  - 회복날이라 실제로 하는 시간은 줄어듭니다 (${[...new Set(shown)].join(', ')}). 이유에는 줄어든 시간을 쓰세요.`
    );
  }
  lines.push(
    `- focus (goal 마다 다릅니다. auto = 최근 기록을 보고 앱이 상체·하체를 번갈아):`
  );
  for (const goal of fence.goals) {
    const keys = fence.focuses[goal];
    lines.push(
      `  - ${goal}: auto${keys.map((k) => `, ${k}(${FOCUS_LABEL.get(k) ?? k})`).join('')}`
    );
  }
  lines.push(
    `- caution.part: ${CHECKIN_PARTS.map((p) => `${p.key}(${p.label})`).join(', ')}`
  );

  lines.push(`\n# 규칙 초안 — 판단이 서지 않으면 이대로`);
  lines.push(
    `- goal ${fence.draft.goal} · minutes ${fence.draft.minutes} · focus auto`
  );
  lines.push(`- 까닭: ${fence.draft.reason}`);

  return lines.join('\n');
}

export type AcceptResult =
  { ok: true; decision: AutoDecision } | { ok: false; reason: string };

/**
 * 받은 답을 검사한다. 하나라도 어긋나면 답 전체를 버리고 규칙 초안으로 간다.
 *
 * 선택지 밖의 값, 자료에 없는 숫자, 운동 종목 이름 — 프롬프트로 막아 두어도
 * 나온 글은 다시 봐야 한다(리포트의 checkPitchCounts 와 같은 이유). 일부만
 * 고쳐 쓰면 "AI가 정했다"는 말이 반만 맞게 된다.
 *
 * allTitles 는 라이브러리의 모든 운동 이름이다. 이유에 종목 이름이 나오면
 * 버린다 — 종목은 아직 안 골랐고, 안전 규칙으로 뺄 운동을 권하는 말이 될 수 있다.
 */
export function acceptAnswer(
  answer: AutoAnswer,
  input: AutoPromptInput,
  allTitles: string[]
): AcceptResult {
  const { fence } = input;
  const fail = (reason: string): AcceptResult => ({ ok: false, reason });

  if (!fence.goals.includes(answer.goal))
    return fail(`고를 수 없는 목표(${answer.goal})`);
  if (!(fence.minutes[answer.goal] ?? []).includes(answer.minutes)) {
    return fail(`고를 수 없는 시간(${answer.minutes}분)`);
  }
  const focus = answer.focus === 'auto' ? null : (answer.focus as GoalFocusKey);
  if (focus != null && !(fence.focuses[answer.goal] ?? []).includes(focus)) {
    return fail(`고를 수 없는 부위(${answer.focus})`);
  }

  /* 조심할 부위 — 같은 것은 한 번만, 셋까지, 설명은 짧게 */
  const caution: AutoCaution[] = [];
  for (const c of answer.caution) {
    if (caution.some((x) => x.part === c.part)) continue;
    const why = c.why.trim().slice(0, WHY_MAX);
    caution.push({ part: c.part, why: why || '메모' });
    if (caution.length >= CAUTION_MAX) break;
  }
  if (focus != null && blockedFocuses(caution.map((c) => c.part)).has(focus)) {
    return fail(`조심할 부위를 오늘 할 부위로 골랐음(${answer.focus})`);
  }

  let reason = answer.reason.trim();
  if (!reason) return fail('이유가 비어 있음');
  if (reason.length > REASON_MAX) return fail(`이유가 너무 김(${reason.length}자)`);

  const pitchCounts = givenPitchCounts(input);
  const strayPitches = extractPitchCounts(reason).filter((n) => !pitchCounts.has(n));
  if (strayPitches.length > 0) {
    return fail(`자료에 없는 투구수(${strayPitches.join(', ')}구)`);
  }
  const minutes = givenMinutes(input);
  const strayMinutes = [...reason.matchAll(/(\d+)\s*분/g)]
    .map((m) => Number(m[1]))
    .filter((n) => !minutes.has(n));
  if (strayMinutes.length > 0) {
    return fail(`자료에 없는 시간(${strayMinutes.join(', ')}분)`);
  }

  const text = [reason, ...caution.map((c) => c.why)].join('\n');
  const named = allTitles.filter((t) => t.length >= 2 && text.includes(t));
  if (named.length > 0) return fail(`운동 종목 이름을 썼음(${named.join(', ')})`);

  /*
   * 체크인에서 고른 운동과 몸 상태가 부딪힌 날은 그 이야기가 꼭 있어야 한다
   * (사용자분과 정함). 빠뜨렸으면 규칙이 한 문장을 앞에 붙인다 — 이것 때문에
   * 답 전체를 버리기에는 나머지가 멀쩡하다.
   */
  if (fence.clash && !reason.includes(fence.clash.kind)) {
    reason = `${fence.clash.kind} 운동을 하고 싶다고 하셨는데, ${fence.clash.reason}. ${reason}`;
  }

  return {
    ok: true,
    decision: {
      goal: answer.goal,
      minutes: answer.minutes,
      focus,
      caution,
      painSuspected: answer.painSuspected,
      reason,
    },
  };
}
