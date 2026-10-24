import type { RoundIconName } from '@/lib/round-icons';

/**
 * 덕아웃 · 싱커 기능 목록(2026-10-24 금윤호: "아이콘 줄을 장터가 아니라 우리 탭과 사이트를 이동하는 것으로", "통합검색") —
 * 덕아웃 첫 화면의 [덕아웃 | 싱커] 아이콘 줄(components/dugout/dugout-main.tsx)과 통합검색의 '바로가기'(lib/search.ts)가 같이 쓴다.
 * keywords 는 통합검색이 이 기능을 찾는 말(이름은 저절로 들어간다).
 */
export type Feature = {
  href: string;
  label: string;
  icon: RoundIconName;
  group: 'dugout' | 'sinker';
  /** 한 줄 설명 — 통합검색 바로가기에서 보인다 */
  desc: string;
  keywords: string[];
};

export const FEATURES: Feature[] = [
  /* 덕아웃 */
  { group: 'dugout', href: '/community', label: '커뮤니티', icon: 'community', desc: '야구인끼리 묻고 나누는 글', keywords: ['글', '게시판', '소통', '질문'] },
  { group: 'dugout', href: '/market', label: '장터', icon: 'market', desc: '글러브 · 배트 중고 사고팔기', keywords: ['중고', '중고거래', '사기', '팔기', '물건'] },
  { group: 'dugout', href: '/market/new', label: '물건 올리기', icon: 'plus', desc: '안 쓰는 장비 30초 만에 올리기', keywords: ['판매', '팔기', '등록'] },
  { group: 'dugout', href: '/lessons', label: '레슨', icon: 'lesson', desc: '코치 비교 · 예약', keywords: ['코치', '과외', '수업', '레슨장', '투수', '타격', '포수', '수비'] },
  { group: 'dugout', href: '/lessons/find', label: '맞춤 코치', icon: 'search', desc: '조건 몇 개로 맞는 코치 찾기', keywords: ['추천', '코치 찾기', '레슨 찾기'] },
  { group: 'dugout', href: '/venues', label: '연습장', icon: 'venue', desc: '빈 시간 보고 바로 예약', keywords: ['구장', '대관', '예약', '실내', '배팅장'] },
  { group: 'dugout', href: '/chat', label: '채팅', icon: 'chat', desc: '장터 · 레슨 대화', keywords: ['메시지', '대화'] },
  { group: 'dugout', href: '/market?guide=1', label: '장비 추천', icon: 'gear', desc: '나이 · 포지션으로 맞는 규격 고르기', keywords: ['장비', '규격', '사이즈', '처음', '입문', '초보'] },
  { group: 'dugout', href: '/notifications', label: '알림', icon: 'bell', desc: '내 소식 모아 보기', keywords: ['소식'] },
  { group: 'dugout', href: '/me', label: '내 것', icon: 'user', desc: '내 물건 · 찜 · 예약', keywords: ['마이', '내 정보', '찜', '예약 내역'] },
  /* 싱커 */
  { group: 'sinker', href: '/today', label: '싱커 홈', icon: 'home', desc: '오늘 팔 상태 · 할 일', keywords: ['싱커', '오늘', '체크인'] },
  { group: 'sinker', href: '/videos', label: '투구 기록', icon: 'log', desc: '투구수 · 영상 · 달력', keywords: ['투구', '투수', '기록', '불펜', '피칭'] },
  { group: 'sinker', href: '/velocity', label: '구속 측정', icon: 'radar', desc: '폰 카메라로 구속 재기', keywords: ['구속', '스피드', '스피드건', '측정'] },
  { group: 'sinker', href: '/training', label: '트레이닝', icon: 'training', desc: '오늘 맞춤 운동', keywords: ['운동', '웨이트', '근력', '프로그램'] },
  { group: 'sinker', href: '/training?view=armcare', label: '암케어', icon: 'armcare', desc: '어깨 · 팔꿈치 관리', keywords: ['어깨', '팔꿈치', '재활', '부상', '통증'] },
  { group: 'sinker', href: '/training?view=mechanics', label: '메커니즘', icon: 'pitcher', desc: '투구 동작 드릴', keywords: ['드릴', '폼', '투구폼', '투수', '동작'] },
  { group: 'sinker', href: '/nutrition', label: '영양', icon: 'cutlery', desc: '식단 · 단백질', keywords: ['식단', '체중', '단백질', '밥'] },
  { group: 'sinker', href: '/hitting', label: '타격', icon: 'batter', desc: '타격 기록 · 드릴', keywords: ['타자', '배팅', '스윙'] },
  { group: 'sinker', href: '/videos/lab', label: '3D 동작 분석', icon: 'clapper', desc: '두 영상으로 3D 투구 분석', keywords: ['3d', '분석', '모션', '동작 분석'] },
  { group: 'sinker', href: '/sinker', label: '내 싱커', icon: 'gauge', desc: 'PC 대시보드 · 기록 표', keywords: ['대시보드', '리포트', '통계'] },
];

/** 통합검색 바로가기 — 이름 · 열쇠말에 검색어가 들어가거나 검색어가 그것을 품으면 */
export function matchFeatures(q: string, n = 6): Feature[] {
  const s = q.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return [];
  const hit = (w: string) => {
    const t = w.toLowerCase().replace(/\s+/g, '');
    /* 거꾸로(검색어가 열쇠말을 품음)는 두 글자 넘는 열쇠말만 — '글러브'가 커뮤니티의 '글'에 걸리던 것 */
    return t.includes(s) || (t.length >= 2 && s.includes(t));
  };
  return FEATURES.filter((f) => hit(f.label) || f.keywords.some(hit)).slice(0, n);
}
