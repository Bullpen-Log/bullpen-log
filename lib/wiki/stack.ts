/**
 * 싱커위키 읽기 창의 쌓임 — 웹(components/wiki/wiki-glossary.tsx)과 앱(native/src/wiki/reader.tsx)이 같은 규칙을 쓴다.
 *
 *  open    낱말 · 목록에서 새로 연다 → 그 글 하나(낱말은 짧은 뜻, 목록 · 주소는 전체 글)
 *  go      창 안의 이어진 글 · 낱말 → 위에 쌓는다(지금 글과 같으면 그대로 — 같은 글이 겹겹이 쌓이지 않게)
 *  expand  짧은 뜻 → 전체 글(같은 칸)
 *  back    [이전: 글 이름] → 한 칸 뒤로(맨 아래 글에서는 그대로 — 닫지 않는다)
 *  close   [닫기] · Esc · 창 밖 누름 · 웹 브라우저 뒤로 → 모두 닫힘
 *  request-close  앱 안드로이드 뒤로 · iOS 시트 끌어내리기 → 앞 글이 있으면 한 칸 뒤로, 없으면 닫힘
 * 쌓임은 MAX_DEPTH 까지 — 넘으면 가장 오래된 글부터 빠진다(이전 단추가 끝없이 길어지지 않게).
 */
export type WikiStackEntry = { id: string; view: 'brief' | 'full' };
export type WikiStackAction =
  | { type: 'open'; id: string; view?: 'brief' | 'full' }
  | { type: 'go'; id: string }
  | { type: 'expand' }
  | { type: 'back' }
  | { type: 'close' }
  | { type: 'request-close' };

export const WIKI_STACK_MAX_DEPTH = 8;

export function wikiStack(state: readonly WikiStackEntry[], action: WikiStackAction): WikiStackEntry[] {
  switch (action.type) {
    case 'open':
      return [{ id: action.id, view: action.view ?? 'brief' }];
    case 'go': {
      if (state.length === 0) return [{ id: action.id, view: 'brief' }];
      if (state[state.length - 1].id === action.id) return [...state];
      return [...state, { id: action.id, view: 'brief' as const }].slice(-WIKI_STACK_MAX_DEPTH);
    }
    case 'expand':
      return state.map((e, i) => (i === state.length - 1 ? { ...e, view: 'full' as const } : e));
    case 'back':
      return state.length > 1 ? state.slice(0, -1) : [...state];
    case 'close':
      return [];
    case 'request-close':
      return state.length > 1 ? state.slice(0, -1) : [];
  }
}
