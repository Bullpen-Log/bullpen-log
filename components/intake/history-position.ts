/**
 * 접수 화면의 브라우저 기록 위치(R04) — 이 화면이 쌓은 기록 항목마다 깊이(depth)를 적어 둔다.
 * 뒤로 · 앞으로 어느 쪽이든 popstate 가 오면 그 항목의 깊이를 그대로 읽는다. 예전에는 popstate 마다 개수를 하나씩 빼서,
 * 앞으로 가기에도 줄어 '이전' 단추가 기록 대신 앞 단계(옆 · 뒤 영상)로 빠졌다.
 * 깊이가 0 이면(이 화면이 쌓기 전의 항목) '이전'은 브라우저 기록이 아니라 앞 단계로 간다.
 */
export type IntakeHistoryState = { intakeStep?: string; reviewPanel?: string; intakeDepth?: number };

/** 새로 쌓을 항목 — 지금 깊이 + 1 */
export const historyEntry = (depth: number, intakeStep: string, reviewPanel?: string): IntakeHistoryState => ({ intakeStep, reviewPanel, intakeDepth: depth + 1 });

/** 기록 항목의 깊이 — 이 화면이 쌓지 않은 항목(null · 다른 모양)은 0 */
export const depthOf = (state: unknown): number => {
  const d = (state as IntakeHistoryState | null)?.intakeDepth;
  return typeof d === 'number' && Number.isInteger(d) && d > 0 ? d : 0;
};
