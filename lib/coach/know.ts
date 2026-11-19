import { ADULT_AGE, AGE_PITCH_LIMITS, HIGH_VOLUME_MIN_REST, HIGH_VOLUME_PITCHES, REST_REQUIREMENTS, REST_REQUIREMENTS_YOUTH, UNKNOWN_AGE_DAILY_MAX, YOUTH_AGE_THRESHOLD, YOUTH_REST_TABLE_THROUGH_AGE } from '@/lib/report/plan';
import { HARD_OUTING_MIN_LOAD, HARD_OUTING_MIN_PITCHES, BELOW_USUAL_GAP } from '@/lib/report/facts';
import { HIGH_SORENESS, LOW_CONDITION_THRESHOLD, SHORT_SLEEP_QUALITY, SORENESS_LEVELS } from '@/lib/checkin';
import { VOLUME_MAX_SETS, VOLUME_MIN_SETS } from '@/lib/report/volume';
import {
  BREAK_LONG_FROM_DAYS,
  BREAK_LONG_RATIO,
  BREAK_SHORT_FROM_DAYS,
  BREAK_SHORT_RATIO,
  CAUTIOUS_RESERVE,
  LOWER_RATIO,
  RAISE_BIG_LOWER,
  RAISE_OTHER,
  REP_FLOOR_RATIO,
  STREAK_MAX_GAP_DAYS,
} from '@/lib/workout/free-weight';
import { LONG_BREAK_DAYS } from '@/lib/program/next-weight';

/**
 * 앱 기준(개인 비서 5단계, 2026-11-20 김민: "웨이트 · 트레이닝 · 투구 · 컨디셔닝 · 수면 모든 부분에서 전문가처럼") — 코치가 '왜 · 얼마나'를
 * 설명할 때 쓰는 숫자를 엔진 숫자표에서 그대로 꺼내 글로. 숫자를 여기 따로 적지 않는다 — 엔진 값이 바뀌면 이 글도 같이 바뀐다(D1 '숫자는 엔진만').
 * 오늘 이 사람에게 맞춘 값(맥락의 '오늘 투구 계획' · '오늘 운동')이 늘 먼저고, 이 덩이는 일반 기준을 설명할 때만. 순수 파일 — 고정 글이라
 * 지시문 · 지식 카드와 한 덩이로 캐시에 올라간다.
 */

const pct = (ratio: number) => `${Math.round(Math.abs(1 - ratio) * 1000) / 10}%`;
const restRow = (t: readonly { minPitches: number; restDays: number }[]) =>
  t.filter((r) => r.restDays > 0).map((r) => `${r.minPitches}구 이상 ${r.restDays}일`).join(' · ');

export function knowBlock(): string {
  let from = 0;
  const caps = AGE_PITCH_LIMITS.filter((r) => r.throughAge < ADULT_AGE).map((r) => {
    const line = `${from ? `${from}~` : ''}${r.throughAge}세 ${r.dailyMax}구`;
    from = r.throughAge + 1;
    return line;
  });
  const floorPct = Math.round(REP_FLOOR_RATIO * 100);
  return [
    "앱 기준(엔진이 실제로 쓰는 숫자 — 투구 · 웨이트 · 회복 · 잠을 설명할 때 숫자는 여기와 맥락에서만 쓴다. 이 사람의 오늘 값은 맥락의 '오늘 투구 계획' · '오늘 운동'이 먼저다):",
    `- 투구 하루 한도(만 나이): ${caps.join(' · ')} · 만 ${ADULT_AGE}세부터는 나이 한도 없이 평소 투구량 · 최근 부하로 정한다 · 나이를 모르면 ${UNKNOWN_AGE_DAILY_MAX}구.`,
    `- 던진 뒤 쉬는 날(체감 강도로 환산한 공 수): 만 ${YOUTH_REST_TABLE_THROUGH_AGE + 1}세 이상 ${restRow(REST_REQUIREMENTS)}, 만 ${YOUTH_REST_TABLE_THROUGH_AGE}세 이하 ${restRow(REST_REQUIREMENTS_YOUTH)}. 강도와 상관없이 ${HIGH_VOLUME_PITCHES}구 이상이면 적어도 ${HIGH_VOLUME_MIN_REST}일.`,
    `- 세게 던진 날: 투구 수 × 체감 강도(%)가 ${HARD_OUTING_MIN_LOAD.toLocaleString('en-US')} 이상이거나 전력에 가까운 공이 ${HARD_OUTING_MIN_PITCHES}구 이상. 다음 날 운동은 팔로 던지는 것 없이 가볍게 짠다.`,
    `- 성장기(만 ${YOUTH_AGE_THRESHOLD}세 미만)는 운동량을 늘리지 않는다. 성장기와 웨이트 입문은 무게를 한 단위씩만 올리고, 세트마다 ${CAUTIOUS_RESERVE}개 남기고 끝까지 짜내지 않는다.`,
    `- 오늘 양 줄이기: 컨디션이 평소보다 ${BELOW_USUAL_GAP}점 이상 낮음 · 잠의 질 ${SHORT_SLEEP_QUALITY} 이하 · 근육통 '${SORENESS_LEVELS[HIGH_SORENESS - 1]}' 이상 · 최근 운동 힘듦 급증 중 하나면 본운동을 한 세트씩 줄인다(${VOLUME_MIN_SETS}세트 밑으로는 안 줄임). 몸 신호면 가장 센 운동을 빼고 그날 무게도 안 올린다. 컨디션 ${LOW_CONDITION_THRESHOLD} 이하 · 근육통 '${SORENESS_LEVELS[SORENESS_LEVELS.length - 1]}'인 날은 보통 회복 위주로 짠다. 늘릴 때는 한 세트(${VOLUME_MAX_SETS}세트까지).`,
    `- 무게 올리기(자유 운동): 처방 횟수가 위 끝, 그 ${floorPct}%가 아래 끝. ${STREAK_MAX_GAP_DAYS}일 안에 두 번 이어 처방 세트를 다 채우면 하체 큰 운동 ${pct(RAISE_BIG_LOWER)} · 그 밖 ${pct(RAISE_OTHER)} 올리고, 아래 끝을 못 채우면 바로 ${pct(LOWER_RATIO)} 내린다. ${BREAK_SHORT_FROM_DAYS}~${BREAK_LONG_FROM_DAYS - 1}일 쉬면 ${pct(BREAK_SHORT_RATIO)} · ${BREAK_LONG_FROM_DAYS}~${LONG_BREAK_DAYS - 1}일 쉬면 ${pct(BREAK_LONG_RATIO)} 낮추고, ${LONG_BREAK_DAYS}일 넘게 쉬면 처음처럼 가볍게 다시 잡는다. 근력 프로그램은 '몇 개 더 할 수 있었나'로 올리고 내린다.`,
    `- 잠: 체크인의 잠의 질 1~5 중 ${SHORT_SLEEP_QUALITY} 이하를 짧은 밤으로 본다(위 양 줄이기). 몇 시간을 자라는 숫자는 앱에 없으니 말하지 않는다.`,
  ].join('\n');
}
