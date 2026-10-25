/**
 * 일지 · 숙제에 다는 말(2026-10-26 2단계, OrgComment) — 순수 상수만. 코치는 말(comment), 회원은 질문(question) · 정정 요청(fix).
 * 코치 '받은 것' = 회원이 쓴 말 가운데 안 푼 것. 코치가 그 자리에 답하면 그 자리의 회원 말은 푼 것으로 본다.
 * 숙제 영상(submit) · 영상 시점(atSec)은 칸만 있고 화면은 다음에(영상 올리기를 붙일 때).
 */
export const COMMENT_MAX = 500;
export const COMMENT_KIND_LABEL = { comment: '코치', question: '질문', fix: '정정 요청', submit: '숙제 영상' } as const;
export type CommentKind = keyof typeof COMMENT_KIND_LABEL;
export const PLAYER_COMMENT_KINDS = ['question', 'fix'] as const;
export const isPlayerCommentKind = (v: unknown): v is (typeof PLAYER_COMMENT_KINDS)[number] => PLAYER_COMMENT_KINDS.includes(v as 'question');

/** 말을 다는 자리 — 일지 하나 또는 숙제 하나 */
export type CommentTarget = { noteId: string } | { assignmentId: string };
/** 앱이 보내는 자리 — ('note' | 'homework', id) */
export function commentTarget(kind: unknown, id: unknown): CommentTarget | null {
  if (typeof id !== 'string' || !id) return null;
  return kind === 'note' ? { noteId: id } : kind === 'homework' ? { assignmentId: id } : null;
}
export function cleanCommentBody(raw: unknown): string | null {
  const s = typeof raw === 'string' ? raw.trim().slice(0, COMMENT_MAX) : '';
  return s || null;
}
