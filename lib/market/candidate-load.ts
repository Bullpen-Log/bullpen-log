import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';

/**
 * 덕아웃 수집 후보 읽기(2026-10-26, 대표관리자만) — 목록 · 검색 · 지도 · 상세가 모두 여기를 거친다. 읽기마다 requireAdmin 을 다시 본다
 * (화면이 막아도, 다른 곳에서 이 함수를 불러도 새지 않게). 공개 지도(lib/market/map-load.ts) · 레슨 · 통합검색은 이 표를 읽지 않는다.
 */
export type CandidateFilter = { q?: string; region?: string; flag?: string };

/** 목록 거르기 — 검토 필요 · 좌표 없음 · 연락 전 · 레슨 공개 안내 · 배팅 */
export const CANDIDATE_FLAGS = [
  { key: 'review', label: '검토 필요' },
  { key: 'nocoords', label: '좌표 없음' },
  { key: 'todo', label: '연락 전' },
  { key: 'lesson', label: '레슨 공개 안내' },
  { key: 'batting', label: '배팅 · 연습공간' },
] as const;

function whereOf(f: CandidateFilter): Prisma.FacilityCandidateWhereInput {
  const q = f.q?.trim();
  const flag: Prisma.FacilityCandidateWhereInput =
    f.flag === 'review'
      ? { OR: [{ sharedPlaceGroup: { not: null } }, { duplicateGroup: { not: null } }, { lat: null }] }
      : f.flag === 'nocoords'
        ? { lat: null }
        : f.flag === 'todo'
          ? { contactStatus: 'NOT_CONTACTED' }
          : f.flag === 'lesson'
            ? { lessonNotice: 'PUBLIC_NOTICE_FOUND' }
            : f.flag === 'batting'
              ? { OR: [{ typeHint: { startsWith: '배팅' } }, { typeHint: '연습공간 후보' }] }
              : {};
  return {
    ...(f.region ? { region: f.region } : {}),
    ...(q
      ? {
          AND: [
            {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { roadAddress: { contains: q, mode: 'insensitive' } },
                { address: { contains: q, mode: 'insensitive' } },
                { district: { contains: q, mode: 'insensitive' } },
              ],
            },
            flag,
          ],
        }
      : flag),
  };
}

const LIST_SELECT = {
  id: true,
  name: true,
  typeHint: true,
  region: true,
  district: true,
  roadAddress: true,
  address: true,
  lat: true,
  lng: true,
  lessonNotice: true,
  rentalNotice: true,
  sharedPlaceGroup: true,
  duplicateGroup: true,
  contactStatus: true,
  consentStatus: true,
  approvedAt: true,
} satisfies Prisma.FacilityCandidateSelect;

export type CandidateListItem = Prisma.FacilityCandidateGetPayload<{ select: typeof LIST_SELECT }>;

export async function loadCandidates(f: CandidateFilter) {
  await requireAdmin();
  const [items, regions, totals] = await Promise.all([
    prisma.facilityCandidate.findMany({ where: whereOf(f), select: LIST_SELECT, orderBy: [{ region: 'asc' }, { name: 'asc' }], take: 500 }),
    prisma.facilityCandidate.groupBy({ by: ['region'], _count: true, orderBy: { region: 'asc' } }),
    prisma.facilityCandidate.groupBy({ by: ['contactStatus', 'consentStatus'], _count: true }),
  ]);
  const count = (pick: (r: (typeof totals)[number]) => boolean) => totals.filter(pick).reduce((n, r) => n + r._count, 0);
  return {
    items,
    regions: regions.map((r) => ({ region: r.region, count: r._count })),
    total: count(() => true),
    contacted: count((r) => r.contactStatus !== 'NOT_CONTACTED'),
    agreed: count((r) => r.consentStatus === 'AGREED'),
  };
}

export async function loadCandidate(id: string) {
  await requireAdmin();
  const c = await prisma.facilityCandidate.findUnique({ where: { id } });
  if (!c) return null;
  const groups = [c.sharedPlaceGroup && { sharedPlaceGroup: c.sharedPlaceGroup }, c.duplicateGroup && { duplicateGroup: c.duplicateGroup }].filter(
    Boolean
  ) as Prisma.FacilityCandidateWhereInput[];
  const siblings = groups.length
    ? await prisma.facilityCandidate.findMany({
        where: { id: { not: c.id }, OR: groups },
        select: { id: true, name: true, roadAddress: true, sharedPlaceGroup: true, duplicateGroup: true },
      })
    : [];
  return { c, siblings };
}
