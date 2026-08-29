/**
 * 구속 관련.
 *
 * 예전에는 여기서 구속 추이(개인 최고·최근 흐름)를 통째로 계산했다. 분석
 * 화면에 큰 구속 카드가 있어서였는데, 스피드건이 없어 못 적는 사용자가
 * 대부분이라 그 자리를 뒷받침 카드 하나로 줄였다.
 *
 * 지금 필요한 것은 '전체 기간 개인 최고' 하나뿐이고, 그건 DB에 가장 빠른 줄을
 * 물어보면 된다(app/(app)/coach/page.tsx). 그래서 계산 부분은 지웠고, 목표
 * 구속을 검사하는 것만 남았다.
 */

export const TARGET_VELOCITY_MIN = 60;
export const TARGET_VELOCITY_MAX = 180;

export function validateTargetVelocity(
  raw: string
): { error: string } | { value: number | null } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: null };

  const n = Number(trimmed);
  if (!Number.isInteger(n)) return { error: '목표 구속은 정수로 입력해주세요.' };
  if (n < TARGET_VELOCITY_MIN || n > TARGET_VELOCITY_MAX) {
    return {
      error: `목표 구속은 ${TARGET_VELOCITY_MIN}~${TARGET_VELOCITY_MAX}km/h 사이로 입력해주세요.`,
    };
  }
  return { value: n };
}
