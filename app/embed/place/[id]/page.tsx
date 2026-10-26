import { notFound } from 'next/navigation';
import { CandidateDetail } from '@/app/(master)/manage/places/[id]/candidate-detail';
import { getCurrentUser } from '@/lib/dal';
import { isOwner } from '@/lib/permissions';
import { loadCandidate } from '@/lib/market/candidate-load';

/**
 * 수집 후보 하나 — 덕아웃 앱 연습장 지도(native/src/dugout/app/venues.tsx)가 '자세히'에서 아래 창 웹뷰로 띄운다(2026-10-26 김민 "관리자 페이지로
 * 가지 말고 작은 창으로"). 관리 틀 · 아래 탭이 없는 맨 화면(app/(master) 밖)이고 내용은 관리 화면과 같은 CandidateDetail — 연락 · 동의 · 확인 ·
 * 좌표를 그대로 고친다. 로그인은 앱과 같은 'session' 쿠키, 대표관리자만(loadCandidate 의 requireAdmin 전에 먼저 본다 — 넘기지 않고 한 줄로).
 */
export default async function PlaceEmbedPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ coords?: string }>;
}) {
  const { id } = await params;
  const { coords } = await searchParams;
  if (!isOwner((await getCurrentUser())?.role)) return <p className="p-6 text-sm text-muted">대표관리자만 볼 수 있어요.</p>;
  const got = await loadCandidate(decodeURIComponent(id));
  if (!got) notFound();
  return (
    <div data-brand="dugout" className="min-h-dvh bg-page px-4 pt-4 pb-12 text-ink">
      <CandidateDetail {...got} coords={coords} embedded inApp />
    </div>
  );
}
