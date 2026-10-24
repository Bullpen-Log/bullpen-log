import 'server-only';
import { prisma } from '@/lib/prisma';
import { loadListings, type ListingCard, type Viewer } from '@/lib/market/load';
import { loadCoaches, type CoachCard } from '@/lib/market/lesson-load';
import type { SpecialtyKey } from '@/lib/market/lessons';
import { loadVenues, type VenueCard } from '@/lib/market/venue-load';
import { matchFeatures, type Feature } from '@/lib/dugout-features';
import { CATEGORIES, type CategoryKey } from '@/lib/market/specs';

/**
 * 덕아웃 통합검색(2026-10-24 금윤호: "검색은 장터 검색이 아니라 통합검색으로, 당근처럼 우리 사이트에서 통합검색이 되게") — 한 검색어로
 * 바로가기(기능) · 장터 물건 · 커뮤니티 글 · 레슨 코치 · 연습장을 한꺼번에 찾는다. 화면은 app/(dugout)/search/page.tsx.
 * '전체'는 칸마다 몇 개씩, 칸 탭을 고르면 그 칸만 더 많이.
 */
export const SEARCH_TABS = [
  { key: 'all', label: '전체' },
  { key: 'market', label: '장터' },
  { key: 'community', label: '커뮤니티' },
  { key: 'lessons', label: '레슨' },
  { key: 'venues', label: '연습장' },
] as const;
export type SearchTab = (typeof SEARCH_TABS)[number]['key'];
export function isSearchTab(v: unknown): v is SearchTab {
  return SEARCH_TABS.some((t) => t.key === v);
}

/** 오른쪽 '많이 찾는 검색어' — 검색 기록을 아직 모으지 않아 야구인이 흔히 찾는 말로 둔다 */
export const POPULAR_WORDS = [
  '글러브',
  '배트',
  '투수 레슨',
  '포수 미트',
  '스파이크',
  '구속',
  '유소년',
  '연습장',
  '암케어',
  '타격',
  '내야 글러브',
  '나무 배트',
];

export type PostHit = {
  id: string;
  category: string;
  title: string;
  preview: string;
  createdAt: Date;
  likes: number;
  comments: number;
};

export type SearchResult = {
  features: Feature[];
  listings: ListingCard[];
  listingsMore: boolean;
  posts: PostHit[];
  coaches: CoachCard[];
  venues: VenueCard[];
};

async function searchPosts(q: string, take: number): Promise<PostHit[]> {
  const rows = await prisma.communityPost.findMany({
    where: {
      hiddenAt: null,
      OR: [
        { title: { contains: q, mode: 'insensitive' } },
        { body: { contains: q, mode: 'insensitive' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true,
      category: true,
      title: true,
      body: true,
      createdAt: true,
      _count: { select: { likes: true, comments: { where: { hiddenAt: null } } } },
    },
  });
  return rows.map((p) => ({
    id: p.id,
    category: p.category,
    title: p.title,
    preview: p.body.length > 120 ? `${p.body.slice(0, 120)}…` : p.body,
    createdAt: p.createdAt,
    likes: p._count.likes,
    comments: p._count.comments,
  }));
}

/** 검색어가 코치 전문 분야를 가리키면(투수 · 타격 · 포수 …) 그 분야 코치도 — 코치 이름 · 소개만으로는 '투수 레슨'이 안 잡혔다 */
const SPECIALTY_WORDS: [SpecialtyKey, string[]][] = [
  ['pitching', ['투수', '투구', '피칭', '피처']],
  ['hitting', ['타자', '타격', '배팅', '스윙']],
  ['fielding', ['수비', '내야', '외야', '유격']],
  ['catching', ['포수', '캐처']],
  ['youth', ['유소년', '어린이', '초등', '중학', '리틀']],
  ['adult', ['사회인', '성인']],
  ['rehab', ['재활', '복귀', '부상']],
  ['strength', ['체력', '웨이트', '근력', '트레이닝']],
];
export function specialtiesOf(q: string): SpecialtyKey[] {
  const s = q.replace(/\s+/g, '');
  return SPECIALTY_WORDS.filter(([, words]) => words.some((w) => s.includes(w))).map(([k]) => k);
}

/** 검색어가 장터 품목 이름이면(글러브 · 배트 …) 그 품목 물건도 — 제목에 '글러브'가 없는 글러브가 많다 */
function categoriesOf(q: string): CategoryKey[] {
  const s = q.replace(/\s+/g, '');
  return CATEGORIES.filter((c) => {
    const label = c.label.replace(/\s+/g, '');
    const head = label.split('·')[0];
    return (head.length >= 2 && s.includes(head)) || label === s;
  }).map((c) => c.key as CategoryKey);
}

async function searchListings(q: string, region: string | undefined, viewer: Viewer) {
  const cats = categoriesOf(q);
  const lists = await Promise.all([
    loadListings({ q, region, sort: 'new', page: 1 }, viewer),
    ...cats.map((category) => loadListings({ category, region, sort: 'new', page: 1 }, viewer)),
  ]);
  const seen = new Set<string>();
  const items = lists
    .flatMap((l) => l.items)
    .filter((it) => (seen.has(it.id) ? false : (seen.add(it.id), true)));
  return { items, hasMore: lists.some((l) => l.hasMore) };
}

async function searchCoaches(q: string, region: string | undefined): Promise<CoachCard[]> {
  const specs = specialtiesOf(q);
  const lists = await Promise.all([
    loadCoaches({ q, region }),
    ...specs.map((specialty) => loadCoaches({ specialty, region })),
  ]);
  const seen = new Set<string>();
  return lists.flat().filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/** 한 칸이 실패해도 나머지는 보인다(그 칸만 빈 목록) */
async function safe<T>(p: Promise<T>, empty: T): Promise<T> {
  try {
    return await p;
  } catch {
    return empty;
  }
}

export async function searchAll(
  q: string,
  tab: SearchTab,
  region: string | undefined,
  viewer: Viewer
): Promise<SearchResult> {
  const want = (t: SearchTab) => tab === 'all' || tab === t;
  const many = tab !== 'all';
  const [market, posts, coaches, venues] = await Promise.all([
    want('market')
      ? safe(searchListings(q, region, viewer), { items: [], hasMore: false })
      : { items: [], hasMore: false },
    want('community') ? safe(searchPosts(q, many ? 30 : 5), []) : [],
    want('lessons') ? safe(searchCoaches(q, region), []) : [],
    want('venues') ? safe(loadVenues({ q, region }, viewer?.id ?? null), []) : [],
  ]);
  return {
    features: tab === 'all' ? matchFeatures(q) : [],
    listings: many ? market.items : market.items.slice(0, 6),
    listingsMore: many ? market.hasMore : market.items.length > 6 || market.hasMore,
    posts,
    coaches: many ? coaches : coaches.slice(0, 4),
    venues: many ? venues : venues.slice(0, 4),
  };
}
