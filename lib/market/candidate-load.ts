import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { requireAdmin } from '@/lib/dal';
import type { MapPlace } from '@/lib/market/map-load';
import { PLACE_PAGE_SIZE, pageSlice } from '@/lib/market/place-pagination';
import { CONSENT_STATUS, CONTACT_STATUS, HARDBALL_NOTICE, LESSON_NOTICE, RENTAL_NOTICE, isPracticeType, labelOf, reviewFlags } from '@/lib/market/candidates';
import { ACCESS_NOTICE, FIELD_OPERATION_NOTICE, FIELD_TYPE_HINT, IDENTITY_NOTICE, isFieldType } from '@/lib/market/field-candidates';

/**
 * 덕아웃 수집 후보 읽기(2026-10-26, 대표관리자만) — 목록 · 검색 · 지도 · 상세가 모두 여기를 거친다. 읽기마다 requireAdmin 을 다시 본다
 * (화면이 막아도, 다른 곳에서 이 함수를 불러도 새지 않게). 공개 지도(lib/market/map-load.ts) · 레슨 · 통합검색은 이 표를 읽지 않는다.
 * 통합된 이전 기록(mergedIntoId)은 목록 · 지도 · 수에서 빼고 대표 기록의 상세에서만 보인다.
 */
export type CandidateFilter = {
  q?: string;
  /** 'lesson' 레슨 · 연습장 · 'field' 야구장(분류 '야구장 후보') — 없으면 둘 다 */
  kind?: string;
  region?: string;
  origin?: string;
  flag?: string;
  lesson?: string;
  hardball?: string;
  rental?: string;
  operation?: string;
  contact?: string;
  consent?: string;
  /** 야구장만 — 이용 경로 · 장소 대응(lib/market/field-candidates.ts) */
  access?: string;
  identity?: string;
};

export const CANDIDATE_KINDS = [
  { key: 'lesson', label: '레슨 · 연습장' },
  { key: 'field', label: '야구장' },
] as const;
const kindWhere = (kind?: string): Prisma.FacilityCandidateWhereInput =>
  kind === 'field' ? { typeHint: FIELD_TYPE_HINT } : kind === 'lesson' ? { NOT: { typeHint: FIELD_TYPE_HINT } } : {};

/** 빠른 거르기 — 확인 우선 · 위치 확인 필요 · 연락 전 · 배팅 */
export const CANDIDATE_FLAGS = [
  { key: 'review', label: '확인 우선' },
  { key: 'nocoords', label: '위치 확인 필요' },
  { key: 'todo', label: '연락 전' },
  { key: 'batting', label: '배팅 · 연습공간' },
  { key: 'field', label: '야구장' },
] as const;

function whereOf(f: CandidateFilter): Prisma.FacilityCandidateWhereInput {
  const q = f.q?.trim();
  const flag: Prisma.FacilityCandidateWhereInput =
    f.flag === 'review'
      ? { reviewTags: { isEmpty: false } }
      : f.flag === 'nocoords'
        ? { lat: null }
        : f.flag === 'todo'
          ? { contactStatus: 'NOT_CONTACTED' }
          : f.flag === 'batting'
            ? { OR: [{ typeHint: { startsWith: '배팅' } }, { typeHint: { startsWith: '연습' } }] }
            : f.flag === 'field'
              ? kindWhere('field')
              : {};
  const and: Prisma.FacilityCandidateWhereInput[] = [{ mergedIntoId: null }, flag, kindWhere(f.kind)];
  if (q)
    and.push({
      OR: [
        { name: { contains: q, mode: 'insensitive' } },
        { address: { contains: q, mode: 'insensitive' } },
        { roadAddress: { contains: q, mode: 'insensitive' } },
        { district: { contains: q, mode: 'insensitive' } },
      ],
    });
  return {
    AND: and,
    ...(f.region ? { region: f.region } : {}),
    ...(f.origin ? { originGroup: f.origin } : {}),
    ...(f.lesson ? { lessonNotice: f.lesson } : {}),
    ...(f.hardball ? { hardballNotice: f.hardball } : {}),
    ...(f.rental ? { rentalNotice: f.rental } : {}),
    ...(f.operation ? { operationNotice: f.operation } : {}),
    ...(f.contact ? { contactStatus: f.contact } : {}),
    ...(f.consent ? { consentStatus: f.consent } : {}),
    ...(f.access ? { accessNotice: f.access } : {}),
    ...(f.identity ? { identityNotice: f.identity } : {}),
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
  coordsEdited: true,
  coordsSource: true,
  lessonNotice: true,
  rentalNotice: true,
  hardballNotice: true,
  operationNotice: true,
  accessNotice: true,
  identityNotice: true,
  reviewTags: true,
  mergedIntoId: true,
  contactStatus: true,
  consentStatus: true,
  approvedAt: true,
} satisfies Prisma.FacilityCandidateSelect;

export type CandidateListItem = Prisma.FacilityCandidateGetPayload<{ select: typeof LIST_SELECT }>;

const LIMIT = PLACE_PAGE_SIZE;

/** 지도용은 통계 계산을 하지 않는다. 각 요청마다 관리자 권한을 확인한다. */
export async function loadCandidateMapPage(f: CandidateFilter, page = 1) {
  await requireAdmin();
  const rows = await prisma.facilityCandidate.findMany({
    where: whereOf(f), select: LIST_SELECT,
    orderBy: [{ region: 'asc' }, { name: 'asc' }, { id: 'asc' }],
    skip: (page - 1) * LIMIT, take: LIMIT + 1,
  });
  return pageSlice(rows, LIMIT);
}

export async function loadCandidates(f: CandidateFilter, page = 1) {
  await requireAdmin();
  const live = { mergedIntoId: null } satisfies Prisma.FacilityCandidateWhereInput;
  const [items, regions, totals, fields] = await Promise.all([
    prisma.facilityCandidate.findMany({ where: whereOf(f), select: LIST_SELECT, orderBy: [{ region: 'asc' }, { name: 'asc' }, { id: 'asc' }], skip: (page - 1) * LIMIT, take: LIMIT + 1 }),
    prisma.facilityCandidate.groupBy({ by: ['region'], where: { ...live, ...kindWhere(f.kind) }, _count: true, orderBy: { region: 'asc' } }),
    prisma.facilityCandidate.groupBy({ by: ['contactStatus', 'consentStatus'], where: live, _count: true }),
    prisma.facilityCandidate.count({ where: { ...live, ...kindWhere('field') } }),
  ]);
  const count = (pick: (r: (typeof totals)[number]) => boolean) => totals.filter(pick).reduce((n, r) => n + r._count, 0);
  return {
    ...pageSlice(items, LIMIT),
    limit: LIMIT,
    regions: regions.map((r) => ({ region: r.region, count: r._count })),
    total: count(() => true),
    fields,
    contacted: count((r) => r.contactStatus !== 'NOT_CONTACTED'),
    agreed: count((r) => r.consentStatus === 'AGREED'),
  };
}

/**
 * 후보 → 지도 점 — 수집 후보 지도(/manage/places) · 공개 지도의 관리자 전환(/venues?view=candidates) · 덕아웃 앱 지도(/api/places?view=candidates)가
 * 같이 쓴다. 예약 단추(bookHref)는 없다 — 누르면 후보 상세(/manage/places/<id>)로.
 */
export function candidateMapPlaces(items: CandidateListItem[]): MapPlace[] {
  return items.map((c) => ({
    id: c.id,
    type: isFieldType(c.typeHint) ? 'field' : isPracticeType(c.typeHint) ? 'venue' : 'lesson',
    name: c.name,
    kindLabel: c.typeHint,
    kind: c.typeHint,
    region: c.region,
    address: c.roadAddress ?? c.address,
    lat: c.lat,
    lng: c.lng,
    /* 근거 이름표는 근거 수준만('공개 안내 있음 · 근거 미확보') — 실제 제공 확정이 아니다. 수집 좌표는 건물 참조라고 밝힌다 */
    sub: [
      c.approvedAt ? '승인함' : labelOf(CONSENT_STATUS, c.consentStatus),
      labelOf(CONTACT_STATUS, c.contactStatus),
      ...(isFieldType(c.typeHint)
        ? [
            /* 야구장 — 이용 경로 · 운영 근거도 공개 출처를 본 수준일 뿐 대관 가능 · 운영 확정이 아니다 */
            `이용 ${labelOf(ACCESS_NOTICE, c.accessNotice)}`,
            labelOf(FIELD_OPERATION_NOTICE, c.operationNotice),
            /* 불확실 · 출처 못 찾음은 확인 우선 꼬리표가 이미 말한다 */
            c.identityNotice === 'WHOLE_SITE' && labelOf(IDENTITY_NOTICE, c.identityNotice),
          ]
        : [
            `레슨 ${labelOf(LESSON_NOTICE, c.lessonNotice)}`,
            c.rentalNotice && c.rentalNotice !== 'NOT_ESTABLISHED' && `대관 ${labelOf(RENTAL_NOTICE, c.rentalNotice)}`,
            c.hardballNotice && c.hardballNotice !== 'NOT_ESTABLISHED' && `경식구 ${labelOf(HARDBALL_NOTICE, c.hardballNotice)}`,
          ]),
      c.lat != null && !c.coordsEdited && '건물 참조 좌표',
      c.lat != null && (c.coordsSource === 'KAKAO_PLACE' || c.coordsSource === 'KAKAO_ADDRESS') && '자동 좌표(위치 확인 전)',
      ...reviewFlags(c).map((f) => `⚠ ${f}`),
    ]
      .filter(Boolean)
      .join(' · '),
    image: null,
    href: `/manage/places/${encodeURIComponent(c.id)}`,
    rating: null,
    reviews: 0,
  }));
}

export async function loadCandidate(id: string) {
  await requireAdmin();
  const c = await prisma.facilityCandidate.findUnique({ where: { id } });
  if (!c) return null;
  const pick = { id: true, name: true, address: true, roadAddress: true, mergedIntoId: true } as const;
  const [mergedInto, mergedFrom] = await Promise.all([
    c.mergedIntoId ? prisma.facilityCandidate.findUnique({ where: { id: c.mergedIntoId }, select: pick }) : null,
    prisma.facilityCandidate.findMany({ where: { mergedIntoId: c.id }, select: pick }),
  ]);
  return { c, mergedInto, mergedFrom };
}
