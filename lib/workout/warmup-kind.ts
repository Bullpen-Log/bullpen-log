/**
 * 오늘 할 운동에 맞는 워밍업 루틴 고르기.
 *
 * 워밍업은 날마다 새로 뽑지 않는다. 루틴 넷을 미리 짜 두고(WarmupRoutine)
 * 그중 오늘 목적에 맞는 하나에 전신 루틴을 더해 보여준다 — 그래서 '고정'이다.
 *
 * 무엇이 맞는지는 본운동의 동작 계열로 정한다. 테마 이름으로 정하지 않는
 * 이유는 '상체 스트렝스 데이'가 밀기로 채워질 수도 당기기로 채워질 수도
 * 있어서다. 실제로 오늘 할 운동을 세는 쪽이 맞는다.
 */

/** 동작 계열 → 어느 루틴이 맞는가. 회전·운반은 어디에도 안 붙는다. */
const KIND_BY_PATTERN: Record<string, string> = {
  힌지: 'LOWER',
  스쿼트: 'LOWER',
  런지: 'LOWER',
  카프: 'LOWER',
  밀기: 'UPPER_PUSH',
  당기기: 'UPPER_PULL',
};

/** 언제나 함께 뜨는 전신 루틴 */
export const COMMON_WARMUP_KIND = 'COMMON';

type Countable = { slot: string; movementPattern: string | null };

/**
 * 오늘 목적에 맞는 루틴 하나. 붙일 것이 없으면 null.
 *
 * 회복 데이에는 워밍업 자체를 만들지 않는다 — 그날 목록이 이미 가볍게 푸는
 * 운동들이라, 그 앞에 또 푸는 순서를 두면 그날 할 일이 두 배가 된다.
 *
 * 밀기와 당기기가 섞인 날에는 많은 쪽을 고른다. 같으면 앞에 오는 쪽이다.
 * 둘 다 띄우면 본운동 전에 루틴 셋을 지나야 해서, 그럴 바에는 건너뛰게 된다.
 */
export function warmupKindFor(
  themeKey: string,
  exercises: readonly Countable[]
): string | null {
  if (themeKey === 'recovery') return null;

  /* 본운동으로 센다. 코어·암케어까지 세면 보조 운동이 그날 성격을 정해 버린다. */
  const main = exercises.filter((e) => e.slot === 'main');
  const pool = main.length > 0 ? main : exercises;

  const count = new Map<string, number>();
  for (const e of pool) {
    const kind = e.movementPattern ? KIND_BY_PATTERN[e.movementPattern] : undefined;
    if (kind) count.set(kind, (count.get(kind) ?? 0) + 1);
  }

  let best: string | null = null;
  let most = 0;
  /* Map 은 넣은 순서대로 돈다 — 같은 수면 목록에서 먼저 나온 계열이 이긴다 */
  for (const [kind, n] of count) {
    if (n > most) {
      best = kind;
      most = n;
    }
  }
  return best;
}
