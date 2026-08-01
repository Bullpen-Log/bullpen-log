import { z } from 'zod';
import { ACWR_ZONES } from '@/lib/pitch-stats';
import type { ReportFacts } from '@/lib/report/facts';
import type { PitchPlan } from '@/lib/report/plan';

/**
 * 리포트 프롬프트와 검사 규칙.
 *
 * 서버 전용 코드(API 호출)와 떼어놓아, AI를 부르지 않고도
 * 프롬프트 내용과 검사 로직을 그대로 시험할 수 있게 한다.
 */

export const ReportSchema = z.object({
  /** 한 줄 요약 — 화면 맨 위에 크게 나간다 */
  headline: z.string(),
  /** 지금 상태를 2~3문장으로 해석 */
  assessment: z.string(),
  /** 앞으로 며칠간 실행할 것 */
  actions: z.array(
    z.object({
      title: z.string(),
      detail: z.string(),
    })
  ),
  /** 지켜볼 점 */
  watchouts: z.array(z.string()),
});

export type AiReportBody = z.infer<typeof ReportSchema>;

export const SYSTEM_PROMPT = `당신은 야구 투수의 훈련 부하를 관리하는 코치 보조입니다.
투수의 기록에서 계산된 수치와, 규칙으로 이미 확정된 투구 계획을 받아
그것을 선수가 이해할 수 있는 한국어 리포트 문장으로 옮기는 일을 합니다.

반드시 지킬 것:
1. 투구수·강도·일수는 이미 계획에 정해져 있습니다. 계획과 다른 수치를 제안하지 마세요.
2. 계획에 없는 새로운 숫자를 만들어내지 마세요. 주어진 수치만 인용할 수 있습니다.
3. 계획이 투구량을 줄이라고 하면 늘리거나 유지하라고 쓰지 마세요. 그 반대도 마찬가지입니다.
4. 진단하지 마세요. 부상명·질환명을 추측하거나 언급하지 않습니다.
5. 통증이 언급되면 훈련 조언 대신 휴식과 전문의 상담을 안내하세요.
6. 데이터가 부족하면 "아직 알 수 없다"고 쓰세요. 추측으로 채우지 마세요.

말투:
- 존댓말, 담백하고 단정하게. 과장하거나 몰아붙이지 않습니다.
- 선수를 격려하되 근거 없는 칭찬은 하지 않습니다.
- 각 문장은 받은 수치에 근거해야 합니다.`;

/** AI에게 넘길 자료를 사람이 읽을 수 있는 형태로 정리한다. */
export function buildUserPrompt(facts: ReportFacts, plan: PitchPlan): string {
  const { volume, load, patterns, condition, profile } = facts;
  const zone = load.zone ? ACWR_ZONES[load.zone] : null;

  const lines: string[] = [];

  lines.push(`# 선수 정보`);
  lines.push(`- 이름: ${profile.nickname}`);
  lines.push(`- 나이: ${profile.age != null ? `만 ${profile.age}세` : '미입력'}`);
  lines.push(`- 기준일: ${facts.asOf}`);

  lines.push(`\n# 최근 7일 투구`);
  lines.push(
    `- 총 투구수: ${volume.current.totalPitches}구 (던진 날 ${volume.current.activeDays}일)`
  );
  lines.push(`- 직전 7일: ${volume.previous.totalPitches}구`);
  lines.push(
    `- 변화: ${volume.changePercent != null ? `${volume.changePercent >= 0 ? '+' : ''}${Math.round(volume.changePercent)}%` : '비교할 이전 기록 없음'}`
  );
  lines.push(
    `- 평균 강도: ${volume.current.activeDays ? volume.current.avgIntensity.toFixed(1) : '기록 없음'} / 10`
  );
  lines.push(`- 최고 구속: ${volume.current.maxVelocity ?? '기록 없음'} km/h`);

  lines.push(`\n# 부하 지수`);
  if (load.ratio != null && zone) {
    lines.push(`- 지수: ${load.ratio.toFixed(2)} (${zone.label})`);
    lines.push(`- 뜻: ${zone.meaning}`);
    lines.push(
      `- 최근 7일 부하 ${Math.round(load.acute)} ÷ 평소 주당 ${Math.round(load.chronic)}`
    );
  } else {
    lines.push(
      `- 아직 계산할 수 없음 (기록 ${load.historyDays}일 / 필요 28일, ${load.daysNeeded}일 더 필요)`
    );
    lines.push(`- 최근 7일 부하: ${Math.round(load.acute)}`);
  }

  lines.push(`\n# 패턴`);
  lines.push(`- 최근 4주 이틀 연속 과부하: ${patterns.fatigueWindows}회`);
  lines.push(`- 최근 4주 최장 연투: ${patterns.longestStreak}일`);
  lines.push(
    `- 마지막 등판: ${patterns.lastThrowDate ?? '없음'}${patterns.lastOutingPitches != null ? ` (${patterns.lastOutingPitches}구)` : ''}${patterns.restDays != null ? `, ${patterns.restDays}일 경과` : ''}`
  );

  lines.push(`\n# 몸 상태 체크인`);
  if (condition.checkinDays > 0) {
    lines.push(`- 최근 7일 체크인 ${condition.checkinDays}일`);
    lines.push(`- 평균 컨디션: ${condition.avgCondition?.toFixed(1)} / 10 (10이 최상)`);
    lines.push(`- 수면 부족한 날: ${condition.poorSleepDays}일`);
    if (condition.today) {
      lines.push(
        `- 오늘: 어깨 ${condition.today.shoulder}, 팔꿈치 ${condition.today.elbow}, 컨디션 ${condition.today.condition}/10, 수면 ${condition.today.sleep}`
      );
    }
  } else {
    lines.push(`- 최근 7일 체크인 기록 없음`);
  }

  if (facts.memos.length > 0) {
    lines.push(`\n# 선수가 남긴 메모`);
    for (const memo of facts.memos) lines.push(`- ${memo.date}: ${memo.text}`);
  }

  lines.push(
    `\n# 확정된 투구 계획 (규칙으로 계산됨 — 이 수치를 그대로 써야 합니다)`
  );
  for (const day of plan.days) {
    lines.push(
      day.throwing
        ? `- ${day.label}(${day.dateKey}): 투구 가능, 최대 ${day.maxPitches}구, 강도 ${day.maxIntensity} 이하 — ${day.reason}`
        : `- ${day.label}(${day.dateKey}): 휴식 — ${day.reason}`
    );
  }
  lines.push(`- 3일 합계 상한: ${plan.threeDayTotal}구`);
  lines.push(`\n## 이 계획이 나온 근거`);
  for (const b of plan.basis) lines.push(`- ${b}`);
  if (plan.youthNote) lines.push(`- ${plan.youthNote}`);

  lines.push(
    `\n위 자료를 바탕으로 리포트를 작성하세요. 실행 항목(actions)은 3~4개, 지켜볼 점(watchouts)은 1~3개로 해주세요.`
  );

  return lines.join('\n');
}

/** 텍스트에서 "N구" 형태로 언급된 투구수를 모두 뽑는다. */
export function extractPitchCounts(text: string): number[] {
  return [...text.matchAll(/(\d+)\s*구/g)].map((m) => Number(m[1]));
}

/**
 * AI가 계획에 없는 투구수를 지어내지 않았는지 검사한다.
 * 자료에 등장한 숫자만 인용할 수 있다.
 */
export function checkPitchCounts(
  body: AiReportBody,
  facts: ReportFacts,
  plan: PitchPlan
): { ok: true } | { ok: false; offending: number[] } {
  const allowed = new Set<number>();
  for (const day of plan.days) {
    if (day.maxPitches != null) allowed.add(day.maxPitches);
  }
  allowed.add(plan.threeDayTotal);
  allowed.add(facts.volume.current.totalPitches);
  allowed.add(facts.volume.previous.totalPitches);
  allowed.add(facts.volume.current.maxDailyPitches);
  if (facts.patterns.baselinePitches != null) {
    allowed.add(facts.patterns.baselinePitches);
  }
  if (facts.patterns.lastOutingPitches != null) {
    allowed.add(facts.patterns.lastOutingPitches);
  }

  const text = [
    body.headline,
    body.assessment,
    ...body.actions.flatMap((a) => [a.title, a.detail]),
    ...body.watchouts,
  ].join('\n');

  const offending = extractPitchCounts(text).filter((n) => !allowed.has(n));
  return offending.length === 0 ? { ok: true } : { ok: false, offending };
}
