import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site-url';

/** 검색 노출(2026-10-21 개편 7단계 7-2) — 덕아웃의 공개 화면만. 선수 · 관리 · 채팅 · 결제 · API 는 막는다 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/market', '/lessons', '/venues', '/u/', '/intro', '/terms', '/privacy'],
      // 조건이 붙은 주소(?…)와 코치 목록은 막는다 — 거르기 조합이 끝없이 많아 AI 크롤러가 11월에 수백만 번 긁어 Vercel 요금이 50달러 넘게 나왔다(2026-11-22)
      disallow: ['/*?*', '/lessons/list', '/today', '/videos', '/hitting', '/training', '/nutrition', '/sinker', '/manage', '/admin', '/chat', '/me', '/pay', '/notifications', '/login', '/link', '/api/', '/report/', '/submit'],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
