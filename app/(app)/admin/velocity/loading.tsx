import { Skeleton } from '@/components/fallback';
import { PitchLogHeading, VelocityAdminViewSwitch } from '@/app/(app)/videos/pitch-log-heading';

/**
 * 구속 측정 관리자를 불러오는 동안.
 *
 * 투구 기록에서 고르개의 셋째 칸을 누르면 자료(모든 세션 · 공 · 폴더 트리)를 서버에서 읽는 동안
 * 이 화면이 먼저 뜬다. 머리(제목 · 고르개)는 진짜와 같은 것을 그대로 그린다 — 누른 고르개가
 * 사라지지 않고 셋째 칸에 불이 들어온 채 기다리게(pitch-log-heading.tsx 의 전환 이름표).
 * 그 밑은 관리자 화면이 처음 내보내는 자리 모양(숫자 타일 · 탐색기)대로 회색 막대.
 */
export default function Loading() {
  return (
    <div className="stack-page" aria-busy="true" aria-live="polite">
      <PitchLogHeading
        controls={
          <>
            <span />
            <VelocityAdminViewSwitch />
          </>
        }
        action={<Skeleton className="h-9 w-56 rounded-xl" />}
      />
      <span className="sr-only">불러오는 중입니다</span>
      <Skeleton className="h-24 rounded-2xl" />
      <Skeleton className="h-[26rem] rounded-2xl" />
    </div>
  );
}
