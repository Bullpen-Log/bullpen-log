import { PageHeading } from '@/components/ui';
import { JoinView, type SP } from '@/components/org/join-view';
import { requireUser } from '@/lib/dal';

/**
 * 싱커 쪽 옛 주소 `/join` — 가입의 주인은 덕아웃(`/teams/join`, 2026-11-01)이지만 옛 링크 · 깔린 앱(native app/org/join.tsx 가 코드로 바로 부름)이 있어 남긴다.
 * 본문은 components/org/join-view.tsx 하나. 마스터 계정은 여기 못 온다 — (app) 틀이 /manage 로 보낸다.
 */
export default async function JoinPage({ searchParams }: { searchParams: Promise<SP> }) {
  const user = await requireUser();
  return (
    <div className="stack-page">
      <PageHeading title="팀 · 레슨장 참여" description="코치가 준 초대 코드로 참여해요. 내가 고른 범위의 기록만 코치에게 보여요." />
      <JoinView user={user} sp={await searchParams} base="/join" />
    </div>
  );
}
