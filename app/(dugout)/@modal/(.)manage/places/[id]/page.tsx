import { notFound } from 'next/navigation';
import { DayModal } from '@/app/(app)/pitch-log/[date]/day-modal';
import { CandidateDetail } from '@/app/(master)/manage/places/[id]/candidate-detail';
import { loadCandidate } from '@/lib/market/candidate-load';

/**
 * 수집 후보 하나를 지도 위 팝업으로(2026-10-26 김민 "자세히 누르면 다시 관리자 페이지로 가서 번거롭다 — 작은 창으로").
 * 덕아웃 화면(연습장 지도 /venues?view=candidates)에서 누르면 주소만 /manage/places/<id> 로 바뀌고 보던 지도 위에 뜬다 — 닫으면 한 칸 뒤로,
 * 지도 · 거르기 그대로. 주소로 곧장 들어오면 관리 화면(app/(master)/manage/places/[id]) 그대로. 창 틀은 투구 기록 팝업과 같은 DayModal
 * (주소가 바뀌면 스스로 거둔다). 대표관리자만 — loadCandidate 가 requireAdmin.
 */
export default async function CandidateModalPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ coords?: string }>;
}) {
  const { id } = await params;
  const { coords } = await searchParams;
  const got = await loadCandidate(decodeURIComponent(id));
  if (!got) notFound();
  return (
    <DayModal title={got.c.name}>
      <CandidateDetail {...got} coords={coords} embedded />
    </DayModal>
  );
}
