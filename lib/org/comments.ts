/**
 * 일지 · 숙제에 다는 말(2026-10-26 2단계, OrgComment) — 순수 상수만. 코치는 말(comment), 회원은 질문(question) · 정정 요청(fix).
 * 코치 '받은 것' = 회원이 쓴 말 가운데 안 푼 것. 코치가 그 자리에 답하면 그 자리의 회원 말은 푼 것으로 본다.
 * 숙제 영상(submit — 회원이 숙제에 영상을 보냄) · 영상 시점 말(코치가 영상의 몇 초에 단 말, atSec + videoPath)도 같은 표.
 */
export const COMMENT_MAX = 500;
export const COMMENT_KIND_LABEL = { comment: '코치', question: '질문', fix: '정정 요청', submit: '숙제 영상' } as const;
export type CommentKind = keyof typeof COMMENT_KIND_LABEL;
export const PLAYER_COMMENT_KINDS = ['question', 'fix', 'submit'] as const;
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

/** 조직 영상(일지 영상 · 숙제 영상) — 서로 봐야 해서 폰 안이 아니라 저장소에. 회원 영상 한도와 같은 50MB, 일지 하나에 두 개 */
export const ORG_VIDEO_MAX_BYTES = 50 * 1024 * 1024;
export const NOTE_VIDEOS_MAX = 2;

/** 조직 영상 파일 이름 앞말 — 투구 영상 · 사진과 갈라, 일지를 지울 때 이 파일만 지운다 */
export const ORG_VIDEO_PREFIX = 'org-';

/** 그 사람이 조직 영상으로 올린 경로인가 — `{userId}/org-{uuid}.확장자` 만 */
export function isOwnOrgVideoPath(path: unknown, userId: string): path is string {
  return typeof path === 'string' && new RegExp(`^${userId}/${ORG_VIDEO_PREFIX}[0-9a-f-]{36}\\.[a-z0-9]{1,5}$`).test(path);
}

/** 누가 올렸든 조직 영상 파일인가 — 일지를 지울 때 이것만 저장소에서 지운다 */
export function isOrgVideoPath(path: unknown): path is string {
  return typeof path === 'string' && new RegExp(`^[0-9a-f-]{36}/${ORG_VIDEO_PREFIX}[0-9a-f-]{36}\\.[a-z0-9]{1,5}$`).test(path);
}

/** 영상 시점(초) — 0~3600 */
export function readAtSec(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 3600 ? Math.round(n * 10) / 10 : null;
}
