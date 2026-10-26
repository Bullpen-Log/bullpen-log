import { keepInput, type FormValues } from '@/lib/form-values';

/**
 * 글쓰기 · 고치기 초안(2026-10-26) — 긴 글 · 모집 양식을 쓰다가 화면을 떠나거나 신호가 끊겨도 이 기기에 남는다(localStorage, 이 기기에만).
 * 올리기를 누를 때 '보낸 초안' 표시를 남기고(sessionStorage), 글 화면에 닿으면 그 초안을 지운다 — 성공하면 서버가 글로 보내므로(redirect)
 * 폼 쪽에서는 성공을 알 수 없어서. 실패로 돌아오면 표시만 지운다. 사진 · 영상 · 기록 카드는 담지 않는다(올린 파일 경로라 다시 고른다).
 */
const PREFIX = 'bullpen-community-draft:';
const SUBMITTED = 'bullpen-community-draft-submitted';
const SKIP = new Set(['media', 'card', 'cardHide', 'id']);

export const draftKey = (postId?: string) => `${PREFIX}${postId ? `edit:${postId}` : 'new'}`;

type Draft = { values: FormValues; at: number };

export function saveDraft(key: string, form: HTMLFormElement) {
  const values = keepInput(new FormData(form));
  for (const k of SKIP) delete values[k];
  const filled = ['title', 'body', 'place', 'venue'].some((k) => String(values[k] ?? '').trim());
  try {
    if (!filled) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ values, at: Date.now() } satisfies Draft));
  } catch {
    /* 사생활 보호 창 · 저장 공간 가득 — 초안 없이 쓴다 */
  }
}

/** 14일 지난 초안은 버린다 */
export function loadDraft(key: string): Draft | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw) as Draft;
    if (!d?.values || Date.now() - d.at > 14 * 86_400_000) {
      localStorage.removeItem(key);
      return null;
    }
    return d;
  } catch {
    return null;
  }
}

export function clearDraft(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {}
}

export function markSubmitting(key: string) {
  try {
    sessionStorage.setItem(SUBMITTED, key);
  } catch {}
}
export function unmarkSubmitting() {
  try {
    sessionStorage.removeItem(SUBMITTED);
  } catch {}
}
/** 글 화면에서 — 방금 보낸 초안이 있으면 지운다 */
export function clearSubmittedDraft() {
  try {
    const key = sessionStorage.getItem(SUBMITTED);
    if (!key) return;
    localStorage.removeItem(key);
    sessionStorage.removeItem(SUBMITTED);
  } catch {}
}
