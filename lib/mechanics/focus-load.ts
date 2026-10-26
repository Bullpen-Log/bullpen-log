import 'server-only';
import type { ElementRx } from '@/lib/pitch-3d/v2/report';
import type { AnalysisSnapshot } from '@/lib/mechanics/comparison';

export type FocusOffer = { criteria: string; reportId: string; jobId: string; rx: ElementRx[]; snapshot: AnalysisSnapshot };
type Viewer = { id: string; role: string; heightCm?: number | null; birthDate?: Date | null };

/** 리포트는 3주 처방 대신 한 번 보는 개선 드릴을 보인다(2026-10-26 김민) — 새 처방은 시작하지 않고, 이미 시작한 처방은 끝까지 간다 */
export const NEW_FOCUS_CLOSED = '이제 리포트에서 개선 드릴을 바로 보여 드려요. 3주 처방은 새로 시작하지 않아요.';

/**
 * 새 처방 제안 — 시작(startMechanicsFocus) · 확인 시트(웹 mechanics-section · 앱 loadMechanicsFocusOffer)가 모두 이 함수를 지나 여기서 막는다.
 * 옛 본문(분석 스냅숏 + 처방 베끼기)은 git 이력에. ponytail: 진행 중 처방이 모두 끝나면 확인 시트 · startMechanicsFocus 도 같이 걷는다.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 부르는 곳(시작 · 확인 시트)의 모양을 그대로 두려고
export async function loadFocusOffer(viewer: Viewer, reportId: unknown): Promise<FocusOffer | { error: string }> {
  return { error: NEW_FOCUS_CLOSED };
}
