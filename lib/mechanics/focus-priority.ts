/** Array order is training-purpose priority, not a list of every movement used. */
export function orderedFocus(values: readonly string[], allowed: readonly string[]): string[] {
  return [...new Set(values.filter((value) => allowed.includes(value)))];
}

/** No matching purpose sorts last. Earlier purposes are more specific recommendations. */
export function focusPriority(points: readonly string[], targets: readonly string[]): number {
  const ranks = targets.map((target) => points.indexOf(target)).filter((rank) => rank >= 0);
  return ranks.length ? Math.min(...ranks) : Number.POSITIVE_INFINITY;
}
