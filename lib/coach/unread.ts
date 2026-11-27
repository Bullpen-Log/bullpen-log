// Proactive messages never carry schedule adjustments. Older clients already treat
// non-array metadata in this JSON column as an empty list of proposals.
export const UNREAD_NUDGE = { kind: 'unread-coach-nudge' } as const;
export function unreadNudge(value: unknown) {
  return !!value && typeof value === 'object' && 'kind' in value && value.kind === UNREAD_NUDGE.kind;
}
export const unreadMessagesOf = (userId: string) => ({
  userId,
  role: 'coach',
  adjusts: { equals: UNREAD_NUDGE },
  createdAt: { gte: new Date(Date.now() - 30 * 86_400_000) },
});
