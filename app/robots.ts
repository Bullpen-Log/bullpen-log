import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

/** 검색 노출(2026-10-21 개편 7단계 7-2) — 덕아웃의 공개 화면만. 선수 · 관리 · 채팅 · 결제 · API 는 막는다 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/market', '/lessons', '/venues', '/u/', '/intro', '/terms', '/privacy'],
      disallow: ['/today', '/videos', '/hitting', '/training', '/nutrition', '/sinker', '/manage', '/admin', '/chat', '/me', '/pay', '/notifications', '/login', '/link', '/api/', '/report/'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
