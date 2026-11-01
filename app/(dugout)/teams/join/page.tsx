import { redirect } from 'next/navigation';
import { DugoutPageHeader } from '@/components/dugout/ui';
import { JoinView, type SP } from '@/components/org/join-view';
import { getCurrentUser } from '@/lib/dal';

/**
 * 덕아웃 팀 · 레슨장 참여(2026-11-01 팀 · 레슨 통합 2단계 R01 — 가입 · 초대 · 승인 · 관리는 덕아웃). 초대 코드로 참여하고 공유 범위를 고른다.
 * 본문은 싱커 옛 주소 `/join` 과 같은 components/org/join-view.tsx. 로그인 전이면 로그인으로(돌아올 주소 포함). 출시 전 베타에는 잠긴다(lib/release-access.ts '/teams' → org).
 * 가입 요청 → 감독 승인(코드 없이 팀 찾기)은 아직 없다 — 팀 공개 목록 · 승인 화면이 필요해 다음 묶음(docs/designs/sinker-dugout-team-lesson-platform-stage0.md 6절).
 */
export default async function DugoutJoinPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) {
    const code = typeof sp.code === 'string' && sp.code ? `?code=${encodeURIComponent(sp.code)}` : '';
    redirect(`/login?next=${encodeURIComponent(`/teams/join${code}`)}`);
  }
  return (
    <div className="stack-page">
      <DugoutPageHeader title="팀 · 레슨장 참여" subtitle="감독 · 코치가 준 초대 코드로 참여해요. 내가 고른 범위의 기록만 코치에게 보여요. 운동 · 기록은 싱커에서 해요." />
      <JoinView user={user} sp={sp} base="/teams/join" />
    </div>
  );
}
