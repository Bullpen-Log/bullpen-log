/** Deterministic review launch only. Never reads or updates reviewer progress/content. */
export type ReviewVideoItem = { id: string; videoPath: string | null };
export type ReviewSelection<T> = { status: 'none' | 'invalid' | 'missing' | 'ambiguous' | 'selected'; item: T | null };

export function reviewVideoTarget(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value) ? value : null;
}

export function reviewVideoHref(kind: 'exercise' | 'mechanics', id: string): string | null {
  const target = reviewVideoTarget(id);
  return target ? `/library/${kind === 'exercise' ? 'training' : 'mechanics'}?review=${encodeURIComponent(target)}` : null;
}

export function selectReviewVideo<T extends ReviewVideoItem>(items: readonly T[], requested: unknown): ReviewSelection<T> {
  if (requested == null) return { status: 'none', item: null };
  const target = reviewVideoTarget(requested);
  if (!target) return { status: 'invalid', item: null };
  // Only the already-authorized visible library is searched. IDs win over file IDs.
  const exact = items.filter((item) => item.id === target);
  const matches = exact.length ? exact : items.filter((item) => /^library\/([A-Za-z0-9_-]+)\.[A-Za-z0-9]+$/.exec(item.videoPath ?? '')?.[1] === target);
  if (matches.length !== 1) return { status: matches.length ? 'ambiguous' : 'missing', item: null };
  return { status: 'selected', item: matches[0] };
}
