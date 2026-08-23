/**
 * 투구 세션의 종류.
 *
 * 같은 20구라도 불펜과 경기는 성격이 다르다. 경기는 쉬는 간격을
 * 내 마음대로 못 정하고 전력으로 던지게 되므로, 나중에 돌아볼 때
 * 무엇을 하다 아팠는지 구분이 되어야 한다.
 *
 * 다만 부하 계산식(투구수 × 강도)은 건드리지 않는다. 경기의 힘든
 * 정도는 이미 '강도'가 담고 있어서 여기에 배수를 또 곱하면
 * 같은 사실을 두 번 세는 셈이 된다.
 */

export const SESSION_TYPES = [
  { name: '불펜', hint: '마운드에서 던지는 연습' },
  { name: '라이브', hint: '타자를 세워두고 던지기' },
  { name: '경기', hint: '실제 시합' },
  { name: '캐치볼', hint: '가볍게 주고받기' },
  /*
   * 던지지 않은 날.
   *
   * 부하 지수는 기록이 없는 날을 0으로 친다. 그래서 '안 던졌다'와 '적는 걸
   * 깜빡했다'가 똑같이 보인다. 매일 던졌는데 닷새 안 적은 선수에게 앱이
   * "부하가 낮으니 서서히 올리세요"라고 말하게 되는데, 이건 그냥 틀린 정도가
   * 아니라 위험한 쪽으로 틀린 것이다.
   *
   * 그래서 쉰 날을 한 번 눌러 남길 수 있게 한다. 이렇게 남긴 0은 진짜 0이다.
   */
  { name: '휴식', hint: '이날은 던지지 않았습니다' },
] as const;

/** 던지지 않은 날. 투구수와 강도가 0이고, 부하에 아무것도 더하지 않는다. */
export const REST_SESSION_TYPE = '휴식';

export function isRestSession(sessionType: string) {
  return sessionType === REST_SESSION_TYPE;
}

export type SessionTypeName = (typeof SESSION_TYPES)[number]['name'];

export const SESSION_TYPE_NAMES: readonly string[] = SESSION_TYPES.map((t) => t.name);

/** 기본값. 예전 기록과 종류를 안 고른 기록이 모두 여기로 들어간다. */
export const DEFAULT_SESSION_TYPE: SessionTypeName = '불펜';

export function isSessionType(value: string): value is SessionTypeName {
  return SESSION_TYPE_NAMES.includes(value);
}

/**
 * 폼에서 온 값을 검사한다.
 * 비어 있으면 기본값으로 본다 — 종류 때문에 기록을 못 남기면 안 된다.
 */
export function validateSessionType(
  raw: string
): { error: string } | { value: SessionTypeName } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: DEFAULT_SESSION_TYPE };
  if (!isSessionType(trimmed)) return { error: '투구 종류를 다시 선택해주세요.' };
  return { value: trimmed };
}
