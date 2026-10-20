import { CopyJoinLink } from '@/components/master/copy-join-link';

/**
 * 초대 코드 한 장 — 코드 크게, 기한, 참여 링크 복사. 홈의 빈 상태와 설정의 초대 목록이 같이 쓴다.
 * 링크는 브라우저에서 만든다(window.location.origin + /join?code=…) — 서버는 제 주소를 모른다(Vercel 미리보기 · 로컬).
 */
export function InviteCodeCard({
  code,
  expiresAt,
  compact = false,
}: {
  code: string;
  expiresAt: Date;
  compact?: boolean;
}) {
  const until = new Intl.DateTimeFormat('ko-KR', {
    month: 'long',
    day: 'numeric',
  }).format(expiresAt);
  return (
    <div
      className={`flex flex-wrap items-center gap-3 ${compact ? '' : 'rounded-2xl border border-line bg-surface-2/60 p-4'}`}
    >
      <span className="font-mono text-2xl font-bold tracking-[0.2em] text-ink">
        {code}
      </span>
      <span className="text-xs text-muted">{until}까지</span>
      <CopyJoinLink code={code} />
    </div>
  );
}
