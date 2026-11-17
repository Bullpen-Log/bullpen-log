/** Local guide position, never authorization or evidence of a selected file. */
import type { IntakeView } from '@/lib/intake/state';

export const PREPARATION_VERSION = 1;
export const PREPARATION_TTL = 24 * 60 * 60 * 1000;
export const PREPARATION_STAGES = ['share', 'select', 'confirm'] as const;
export type PreparationStage = (typeof PREPARATION_STAGES)[number];
export type PreparationReturn = 'side' | 'rear' | 'review' | 'recovery' | 'correction';
export type Preparation = {
  view: IntakeView;
  stage: PreparationStage;
  route: 'apple' | 'other';
  returnTo: PreparationReturn;
};
export type PreparationBook = {
  version: 1;
  updatedAt: number;
  active: Preparation;
  positions: Partial<Record<IntakeView, Preparation>>;
};
const RETURNS = ['side', 'rear', 'review', 'recovery', 'correction'];
export function preparationOf(value: unknown): Preparation | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Partial<Preparation>;
  const storedStage = (value as { stage?: unknown }).stage;
  const storedRoute = (value as { route?: unknown }).route;
  // Old app-choice checkpoints are navigation hints only, never a reason to
  // send a recipient out of the public website or to discard their draft.
  const route = storedRoute === 'gallery' ? 'apple' : storedRoute;
  const stage =
    storedStage === 'method'
      ? route === 'other'
        ? 'select'
        : 'share'
      : storedStage === 'export' || storedStage === 'save'
        ? 'share'
        : p.stage;
  if (
    (p.view !== 'side' && p.view !== 'rear') ||
    !PREPARATION_STAGES.includes(stage as PreparationStage) ||
    (route !== 'apple' && route !== 'other') ||
    !RETURNS.includes(p.returnTo ?? '')
  )
    return null;
  return { view: p.view, stage: stage!, route, returnTo: p.returnTo! };
}
export const safePreparation = (p: Preparation, hasFile: boolean): Preparation =>
  p.stage === 'confirm' && !hasFile ? { ...p, stage: 'select' } : p;
export const preparationKey = (id: string) => `intake-preparation:${id}`;
export function parsePreparationBook(
  raw: string | null,
  now = Date.now()
): PreparationBook | null {
  try {
    const b = JSON.parse(raw ?? 'null');
    if (
      b?.version !== PREPARATION_VERSION ||
      !Number.isFinite(b.updatedAt) ||
      b.updatedAt > now + 60_000 ||
      now - b.updatedAt > PREPARATION_TTL
    )
      return null;
    const active = preparationOf(b.active);
    if (!active) return null;
    const positions: PreparationBook['positions'] = {};
    for (const view of ['side', 'rear'] as const) {
      const p = preparationOf(b.positions?.[view]);
      if (p?.view === view) positions[view] = p;
    }
    return { version: 1, updatedAt: b.updatedAt, active, positions };
  } catch {
    return null;
  }
}
export function readPreparation(id: string): PreparationBook | null {
  try {
    return parsePreparationBook(sessionStorage.getItem(preparationKey(id)));
  } catch {
    return null;
  }
}
export function writePreparation(id: string, p: Preparation) {
  try {
    const before = readPreparation(id);
    const book: PreparationBook = {
      version: 1,
      updatedAt: Date.now(),
      active: p,
      positions: { ...before?.positions, [p.view]: p },
    };
    sessionStorage.setItem(preparationKey(id), JSON.stringify(book));
  } catch {
    /* Private/blocked storage does not block intake. */
  }
}
export function clearPreparation(id: string) {
  try {
    sessionStorage.removeItem(preparationKey(id));
  } catch {
    /* No storage is also safe. */
  }
}

/** Server screens and real in-memory files outrank a navigation/checkpoint hint. */
export function preparationForState(
  p: Preparation | null,
  state: {
    screen: string;
    needsReconsent: boolean;
    draft: { athleteName: string | null };
    correction: { views: readonly string[] } | null;
  },
  files: { side: boolean; rear: boolean }
): Preparation | null {
  if (!p || state.needsReconsent) return null;
  if (state.screen === 'correction')
    return p.returnTo === 'correction' && state.correction?.views.includes(p.view)
      ? safePreparation(p, files[p.view])
      : null;
  if (state.screen === 'upload_recovery')
    return p.returnTo === 'recovery' ? safePreparation(p, files[p.view]) : null;
  if (
    !['welcome', 'side'].includes(state.screen) ||
    !state.draft.athleteName ||
    !['side', 'rear', 'review'].includes(p.returnTo)
  )
    return null;
  if (p.view === 'rear' && !files.side)
    return { ...p, view: 'side', stage: 'select', returnTo: 'side' };
  return safePreparation(
    {
      ...p,
      returnTo:
        p.returnTo === 'review' && (!files.side || !files.rear) ? p.view : p.returnTo,
    },
    files[p.view]
  );
}
