/** 오늘 맞춤 루틴의 교체 요청. 화면에 표시된 순서가 바뀌었으면 다시 확인한다. */
export type ArmcareSwapRequest = {
  dateKey: string;
  fromId: string;
  planIds: string[];
};

export type ArmcareSwapPick = {
  id: string;
  title: string;
  area: string;
  equipment: string;
  prescription: string | null;
};

export type ArmcareSwapOptions = {
  picks: ArmcareSwapPick[];
  similar: { id: string; reason: string }[];
};

export const ARMCARE_SWAP_TABS = [
  { value: 'similar', label: '비슷한 운동' },
  { value: 'search', label: '찾기' },
] as const;

export type ArmcareSwapTab = (typeof ARMCARE_SWAP_TABS)[number]['value'];

/**
 * 순서가 같은 목록만 편집한다. 응답만 끊겼으면 그 자리의 교체가 이미 저장됐는지 확인한다.
 */
export function armcareSwapPosition(
  current: readonly string[],
  expected: readonly string[],
  fromId: string,
  toId?: string
): { index: number; applied: boolean } | null {
  const index = expected.indexOf(fromId);
  if (index < 0 || current.length !== expected.length) return null;
  if (toId && expected.includes(toId)) return null;
  if (current.every((id, i) => id === expected[i])) return { index, applied: false };
  if (toId && current.every((id, i) => id === (i === index ? toId : expected[i]))) {
    return { index, applied: true };
  }
  return null;
}
