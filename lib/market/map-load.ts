import 'server-only';
import { prisma } from '@/lib/prisma';
import { createPlaybackUrls } from '@/lib/storage';
import { venueKindLabel } from '@/lib/market/venues';
import { formatPrice } from '@/lib/market/specs';
import { specialtyLabel } from '@/lib/market/lessons';

/**
 * 덕아웃 지도(2026-10-24) — 공개된 연습장 · 구장(Venue)과 레슨장(코치 프로필 공개 Org)을 한 목록으로.
 * 좌표(lat · lng)는 저장할 때 카카오 주소 검색으로 채운 값 — 없는 곳은 목록에만 뜨고 지도에는 안 뜬다.
 */
export type MapPlace = {
  id: string;
  type: 'venue' | 'lesson';
  name: string;
  /** 종류 글('실내 연습장' · '레슨장') */
  kindLabel: string;
  kind: string;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  /** 한 줄(가격 · 예약 방식 · 전문) */
  sub: string;
  image: string | null;
  href: string;
  /** 바로 잡기 단추가 가는 곳 */
  bookHref: string;
  rating: number | null;
  reviews: number;
};

export async function loadMapPlaces(f: { q?: string; kind?: string } = {}): Promise<MapPlace[]> {
  const q = f.q?.trim();
  const wantVenue = f.kind !== 'lesson';
  const wantLesson = !f.kind || f.kind === 'lesson';
  const [venues, orgs] = await Promise.all([
    wantVenue
      ? prisma.venue.findMany({
          where: {
            publicProfile: true,
            hiddenAt: null,
            ...(f.kind && f.kind !== 'lesson' ? { kind: f.kind } : {}),
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { address: { contains: q, mode: 'insensitive' } },
                    { region: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          take: 300,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            kind: true,
            region: true,
            address: true,
            lat: true,
            lng: true,
            slotMin: true,
            pricePerSlot: true,
            approval: true,
            images: true,
          },
        })
      : [],
    wantLesson
      ? prisma.org.findMany({
          where: {
            kind: 'LESSON',
            publicProfile: true,
            ...(q
              ? {
                  OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { coachName: { contains: q, mode: 'insensitive' } },
                    { address: { contains: q, mode: 'insensitive' } },
                    { region: { contains: q, mode: 'insensitive' } },
                  ],
                }
              : {}),
          },
          take: 300,
          select: {
            id: true,
            name: true,
            coachName: true,
            region: true,
            address: true,
            lat: true,
            lng: true,
            priceFrom: true,
            specialties: true,
            reviews: { select: { rating: true } },
          },
        })
      : [],
  ]);
  const firsts = venues.flatMap((v) => (v.images[0] ? [v.images[0]] : []));
  const urls = firsts.length ? await createPlaybackUrls(firsts).catch(() => ({}) as Record<string, string>) : {};

  const out: MapPlace[] = [
    ...venues.map((v) => ({
      id: v.id,
      type: 'venue' as const,
      name: v.name,
      kindLabel: venueKindLabel(v.kind),
      kind: v.kind,
      region: v.region,
      address: v.address,
      lat: v.lat,
      lng: v.lng,
      sub: `${v.slotMin}분 ${v.pricePerSlot != null ? formatPrice(v.pricePerSlot) : '가격 문의'} · ${v.approval ? '승인 예약' : '바로 예약'}`,
      image: v.images[0] ? (urls[v.images[0]] ?? null) : null,
      href: `/venues/${v.id}`,
      bookHref: `/venues/${v.id}`,
      rating: null,
      reviews: 0,
    })),
    ...orgs.map((o) => {
      const n = o.reviews.length;
      return {
        id: o.id,
        type: 'lesson' as const,
        name: o.coachName ? `${o.name} · ${o.coachName}` : o.name,
        kindLabel: '레슨장',
        kind: 'lesson',
        region: o.region,
        address: o.address,
        lat: o.lat,
        lng: o.lng,
        sub: [o.priceFrom != null ? `${formatPrice(o.priceFrom)}부터` : null, o.specialties.slice(0, 2).map(specialtyLabel).join(' · ') || null]
          .filter(Boolean)
          .join(' · '),
        image: null,
        href: `/lessons/${o.id}`,
        bookHref: `/lessons/${o.id}/book`,
        rating: n ? Math.round((o.reviews.reduce((a, r) => a + r.rating, 0) / n) * 10) / 10 : null,
        reviews: n,
      };
    }),
  ];
  return out;
}
