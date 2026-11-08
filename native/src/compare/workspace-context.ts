/**
 * 영상 비교 한 화면의 도구 상태(UI05~UI08 — 순수). 한 번에 도구 하나(context)와 작은 창 하나(inspector)만.
 * 뒤로는 작은 창 → 도구 → 단계(compare-math 의 nav) → 나가기 차례다. 단계 오가기(고르기 · 맞추기 · 함께 보기)는 compare-math 가 맡는다.
 */
export type ToolContext = 'view' | 'draw' | 'events' | 'notes' | 'output';
export type Inspector =
  | 'more'
  | 'playback'
  | 'loop'
  | 'compareSet'
  | 'drawTools'
  /** 선 색 · 굵기를 한 창에(SS01 — 좁은 도구 줄은 '모양' 단추 하나) */
  | 'style'
  | 'color'
  | 'width'
  | 'drawSet'
  | 'shape'
  | 'eventPick'
  | 'eventResults'
  | 'notes'
  | 'storyboard'
  | 'info'
  | 'markers'
  | 'trim'
  /** 재생 대상 고르기(SS06 — 좁은 화면은 누를 때마다 도는 단추 대신 고르는 창) */
  | 'target';
export type WorkspaceUi = { context: ToolContext; inspector: Inspector | null };
export const INITIAL_UI: WorkspaceUi = { context: 'view', inspector: null };

export const CONTEXT_LABEL: Record<ToolContext, string> = { view: '보기', draw: '그리기', events: '장면', notes: '메모', output: '모음' };

/** 도구 고르기 — 같은 도구를 다시 누르면 보기로. 창은 닫는다(겹쳐 쌓지 않게) */
export const openContext = (ui: WorkspaceUi, ctx: ToolContext): WorkspaceUi => ({ context: ui.context === ctx ? 'view' : ctx, inspector: null });
/** 작은 창 — 같은 창을 다시 누르면 닫고, 다른 창이면 바꾼다(하나만) */
export const toggleInspector = (ui: WorkspaceUi, name: Inspector): WorkspaceUi => ({ ...ui, inspector: ui.inspector === name ? null : name });
export const closeInspector = (ui: WorkspaceUi): WorkspaceUi => (ui.inspector ? { ...ui, inspector: null } : ui);

/** 뒤로 한 걸음 — 이 화면 안에서 처리했으면 next, 아니면 null(단계 뒤로 · 나가기로 넘긴다) */
export function backStep(ui: WorkspaceUi): WorkspaceUi | null {
  if (ui.inspector) return { ...ui, inspector: null };
  if (ui.context !== 'view') return { context: 'view', inspector: null };
  return null;
}

/** 그리기 도구 — 빠른 넷과 전체(쪽으로). 마지막에 쓴 도구로 바로 들어간다 */
export const QUICK_DRAW = ['line', 'angle', 'free', 'point'] as const;

/** 재생 대상 — 함께(두 영상) · A · B 만 따로. 맞추기 단계는 A · B 만 */
export type PlayTarget = 'both' | 'a' | 'b';
export const TARGET_LABEL: Record<PlayTarget, string> = { both: '함께', a: 'A', b: 'B' };
export function targetsFor(opts: { single: boolean; aligning: boolean; bErr: boolean; aErr: boolean }): PlayTarget[] {
  if (opts.single) return ['a'];
  const sides = (['a', 'b'] as const).filter((s) => !(s === 'a' ? opts.aErr : opts.bErr));
  return opts.aligning ? [...sides] : ['both', ...sides];
}
/** 고를 수 없게 된 대상(영상 오류 · 단계 바뀜)이면 쓸 수 있는 첫 대상으로 */
export const fixTarget = (t: PlayTarget, allowed: readonly PlayTarget[]): PlayTarget => (allowed.includes(t) ? t : (allowed[0] ?? 'a'));
