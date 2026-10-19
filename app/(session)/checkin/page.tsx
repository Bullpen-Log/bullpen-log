import { requireUser } from '@/lib/dal';
import { loadCheckinFlowContext } from '@/lib/checkin-flow-load';
import { CheckinFlow } from '@/components/checkin-flow/flow';

/**
 * 체크인 3판 — 휴대폰의 한 화면 흐름(2026-10-13 사용자: "토스처럼 한 화면에 한 질문").
 *
 * 앱 틀 바깥(app/(session))이라 탭 막대 · 상단바가 없다(운동 화면과 같은 까닭 — layout.tsx). 그날 첫 접속에 체크인 관문
 * (components/checkin-gate.tsx)이 휴대폰이면 여기로 보내고, PC 는 같은 흐름을 팝업에 띄운다. 오른쪽 위 알림(종)의
 * '체크인 고치기'도 휴대폰에서는 여기로 온다. 끝나면 홈으로 — ?next=/… 가 있으면 그리로(아이폰 앱의 트레이닝 화면에서 연 체크인,
 * 2026-10-18 앱 체크인을 이 흐름 하나로 합침). 우리 사이트 안 주소만 받는다.
 */
export default async function CheckinPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const user = await requireUser();
  const { next } = await searchParams;
  const ctx = await loadCheckinFlowContext(user);
  const returnTo = next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/\\') ? next : '/';
  return <CheckinFlow variant="page" ctx={ctx} returnTo={returnTo} />;
}
