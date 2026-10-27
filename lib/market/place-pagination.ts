/** Page numbers are one-based and independent of display names or client input. */
export const PLACE_PAGE_SIZE = 100;

export function placePage(value: string | undefined): number {
  if (!value || !/^[1-9]\d{0,5}$/.test(value)) return 1;
  return Number(value);
}

export function pageSlice<T>(items: T[], limit = PLACE_PAGE_SIZE): { items: T[]; hasMore: boolean } {
  return { items: items.slice(0, limit), hasMore: items.length > limit };
}
