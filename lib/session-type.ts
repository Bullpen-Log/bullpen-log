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
] as const;

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
