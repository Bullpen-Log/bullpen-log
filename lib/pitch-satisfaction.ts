/**
 * 투구 만족도 — 던진 뒤 스스로 매기는 1~5점과, 좋았던 것 · 아쉬웠던 것 칩.
 *
 * '잘 던진 날 찾기'의 결과 값이다. 구속은 스피드건이 없거나 카메라로 매번 못 재서 결과로 쓰지 못한다
 * (2026-10-06 사용자: "구속 측정은 재미로 쓰는 기능"). 대신 선수가 매긴 만족도를 체크인 · 운동 · 영양과 맞대
 * "나는 이런 날 잘 던진다"를 찾고, 만족도가 높은 날 남긴 메모를 다음 투구 전에 다시 보여 준다.
 *
 * 화면(입력 폼 · 홈 카드)과 서버(app/api/pitch-log · app/actions/pitch-satisfaction.ts)가 같은 규칙을 쓰도록 여기 모은다.
 */

/** 만족도를 받는 투구 종류 — 캐치볼은 가볍게 주고받는 날이라 결과를 흐린다. 휴식은 던지지 않았다. */
export const RATED_SESSION_TYPES = ['불펜', '라이브', '경기'] as const;

export function isRatedSession(sessionType: string) {
  return (RATED_SESSION_TYPES as readonly string[]).includes(sessionType);
}

export const SATISFACTION_MIN = 1;
export const SATISFACTION_MAX = 5;

/** 양 끝의 뜻 — 칸 밑에 작게 적는다 */
export const SATISFACTION_ENDS = { low: '아쉬움', high: '만족' } as const;

/** 고르개(Segmented) 칸 — 입력 폼과 홈 카드가 같이 쓴다 */
export const SATISFACTION_OPTIONS = Array.from(
  { length: SATISFACTION_MAX - SATISFACTION_MIN + 1 },
  (_, i) => {
    const v = String(SATISFACTION_MIN + i);
    return { value: v, label: v };
  }
);

/**
 * 좋았던 것 · 아쉬웠던 것으로 고르는 감각. 투수가 메모에 자주 적는 말에서 골랐다.
 * 값이 DB 에 그대로 남으므로 글자를 바꾸면 옛 기록과 어긋난다 — 바꾸지 말고 새로 더한다.
 */
export const PITCH_CUES = [
  '릴리스',
  '하체',
  '밸런스',
  '팔 스윙',
  '손끝 감각',
  '제구',
  '팔 무거움',
  '몸이 일찍 열림',
] as const;

/** 1~5 정수면 그 값, 비었으면 null, 그 밖은 오류 */
export function readSatisfaction(raw: unknown): { value: number | null } | { error: string } {
  if (raw === '' || raw == null) return { value: null };
  const n = Number(raw);
  if (!Number.isInteger(n) || n < SATISFACTION_MIN || n > SATISFACTION_MAX) {
    return { error: '투구 만족도는 1에서 5 사이로 골라 주세요' };
  }
  return { value: n };
}

/**
 * 칩 두 줄을 다듬는다 — 목록에 있는 것만, 같은 것은 한 번, 한 감각이 양쪽에 있으면 '아쉬웠던 것'에서 뺀다
 * (화면은 한쪽을 고르면 다른 쪽에서 풀지만, 화면을 거치지 않고 올 수 있다).
 */
export function cleanCues(good: unknown, bad: unknown): { cuesGood: string[]; cuesBad: string[] } {
  const pick = (raw: unknown) =>
    Array.isArray(raw)
      ? PITCH_CUES.filter((c) => raw.some((r) => String(r ?? '') === c))
      : [];
  const cuesGood = pick(good);
  const cuesBad = pick(bad).filter((c) => !cuesGood.includes(c));
  return { cuesGood, cuesBad };
}
