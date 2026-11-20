import type { Library } from '@/lib/review-evidence/materialize';

/**
 * EX-REF04 — API 목록 응답(등록 도구의 확인 · 빠진 등록 찾기용). 요약 · 적용 글은 빼고 번호 · 링크 · 쓰임 열쇠만 보낸다.
 * apiVersion 2(R2): counts.foreignObjects, 쓰임마다 mine(지금 묻는 계정이 등록한 쓰임인가) · historicalReviewer(과거 기록의 검수자).
 * 계정 번호(쓰임의 ownerUserId · 묻는 사람의 id)는 내보내지 않는다 — mine 은 서버가 견준 참 · 거짓만.
 */
export const API_VERSION = 2;

export function apiLibraryView(lib: Library, summaryOnly: boolean, viewerId: string) {
  /* 쓰임 수는 거두지 않은 것만(useCounts) — 거둔 쓰임은 따로 센다 */
  const byDomain = { exercise: 0, mechanics: 0 };
  for (const s of lib.sources) {
    byDomain.exercise += s.useCounts.exercise;
    byDomain.mechanics += s.useCounts.mechanics;
  }
  const counts = {
    sources: lib.sources.length,
    uses: lib.useCount,
    withdrawnUses: lib.withdrawnCount,
    citations: lib.citationCount,
    ops: lib.opCount,
    skippedOps: lib.skippedOps,
    foreignObjects: lib.foreignObjects,
    ignoredWithdrawals: lib.ignoredWithdrawals,
    usesByDomain: byDomain,
  };
  if (summaryOnly) return { apiVersion: API_VERSION, counts };
  return {
    apiVersion: API_VERSION,
    counts,
    sources: lib.sources.map((s) => ({
      id: s.id,
      aliasIds: s.aliasIds,
      title: s.title,
      kind: s.kind,
      metadataStatus: s.metadataStatus,
      primaryHref: s.primaryHref,
      links: s.links.map((l) => l.href),
      identifiers: s.identifiers,
      latestConsultedOn: s.latestConsultedOn,
      uses: s.uses.map((u) => ({
        useId: u.useId,
        domain: u.domain,
        reviewId: u.reviewId,
        itemId: u.itemId,
        purpose: u.purpose,
        consultedOn: u.consultedOn,
        scope: u.scope,
        /* 과거 기록 쓰임은 늘 false(누가 가져왔든 그 사람의 쓰임이 아님) */
        mine: u.scope === 'user' && u.ownerUserId !== null && u.ownerUserId === viewerId,
        historicalReviewer: u.scope === 'historical' ? (u.historical?.reviewer ?? null) : null,
        reviewerLabel: u.reviewerLabel,
        href: u.href,
        otherHrefs: u.otherHrefs,
        withdrawn: !!u.withdrawn,
        revisions: u.revisions,
        lastReceivedAt: u.lastReceivedAt,
      })),
    })),
  };
}
