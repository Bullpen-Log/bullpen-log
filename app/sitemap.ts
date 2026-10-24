import type { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';
import { SITE_URL } from '@/lib/site-url';

/** sitemap(2026-10-21 개편 7단계 7-2) — 덕아웃 공개 화면 + 판매 중인 물건 · 공개한 레슨장 · 연습장 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [listings, orgs, venues] = await Promise.all([
    prisma.listing.findMany({
      where: { status: 'ACTIVE', hiddenAt: null },
      orderBy: { createdAt: 'desc' },
      take: 500,
      select: { id: true, updatedAt: true },
    }),
    prisma.org.findMany({
      where: { kind: 'LESSON', publicProfile: true },
      select: { id: true, createdAt: true },
    }),
    prisma.venue.findMany({
      where: { publicProfile: true, hiddenAt: null },
      select: { id: true, updatedAt: true },
    }),
  ]).catch(() => [[], [], []] as const);
  const now = new Date();
  const fixed: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, lastModified: now, changeFrequency: 'hourly', priority: 1 },
    {
      url: `${SITE_URL}/market`,
      lastModified: now,
      changeFrequency: 'hourly',
      priority: 0.9,
    },
    {
      url: `${SITE_URL}/lessons`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/venues`,
      lastModified: now,
      changeFrequency: 'daily',
      priority: 0.8,
    },
    {
      url: `${SITE_URL}/intro`,
      lastModified: now,
      changeFrequency: 'monthly',
      priority: 0.3,
    },
  ];
  return [
    ...fixed,
    ...listings.map((l) => ({
      url: `${SITE_URL}/market/${l.id}`,
      lastModified: l.updatedAt,
      changeFrequency: 'daily' as const,
      priority: 0.6,
    })),
    ...orgs.map((o) => ({
      url: `${SITE_URL}/lessons/${o.id}`,
      lastModified: o.createdAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
    ...venues.map((v) => ({
      url: `${SITE_URL}/venues/${v.id}`,
      lastModified: v.updatedAt,
      changeFrequency: 'weekly' as const,
      priority: 0.6,
    })),
  ];
}
