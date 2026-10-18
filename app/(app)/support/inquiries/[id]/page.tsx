import { headers } from 'next/headers';
import { notFound } from 'next/navigation';
import { Lock } from '@/components/icon';
import { requireUser } from '@/lib/dal';
import { expoLevel } from '@/lib/app-env';
import { loadInquiry } from '@/lib/support-load';
import { OpenNative } from '@/app/(session)/velocity/open-native';
import { closeInquiry, reopenInquiry } from '@/app/actions/support';
import { inquiryCategoryLabel } from '@/lib/support';
import { BackLink, Badge, Button, Card } from '@/components/ui';
import { SafeForm } from '@/components/safe-form';
import { SupportReplyForm } from '@/components/support/support-reply-form';
import { SupportStatusBadge } from '@/components/support/support-status-badge';
import { formatSupportDateTime } from '@/components/support/support-format';

/**
 * 문의 한 건의 대화 — 물음이 맨 위, 그 밑에 답글이 시간순. 운영자 답은 하늘색 테두리와 '운영자' 알약으로 가른다.
 * 쓴 사람과 관리자만 연다 — 남의 문의 주소는 없는 것처럼(notFound) 보인다.
 */
export default async function InquiryPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  /* 새 아이폰 앱(Expo)이 고객센터를 아는 판(BullpenNative/6 부터)이면 앱 화면으로 연다(native/src/app/support/inquiries/[id].tsx) */
  if (expoLevel((await headers()).get('user-agent')) >= 6) {
    return (
      <OpenNative path={`/support/inquiries/${encodeURIComponent(id)}`} cover={false} />
    );
  }

  /* 읽기는 앱 화면과 같은 곳(lib/support-load.ts) — 쓴 사람 · 관리자만, 아니면 없는 것처럼 */
  const inquiry = await loadInquiry(user, id);
  if (!inquiry) notFound();

  const closed = inquiry.status === 'CLOSED';
  /* 관리자가 남의 문의를 열었을 때 — 목록으로 돌아가는 길이 관리자 쪽이어야 한다 */
  const back = inquiry.staff
    ? { href: '/admin/support', label: '소통 관리' }
    : { href: '/support/inquiries', label: '1:1 문의' };

  return (
    <div className="selectable mx-auto max-w-3xl stack-page">
      <BackLink href={back.href}>{back.label}</BackLink>

      {/* 물음 */}
      <Card className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{inquiryCategoryLabel(inquiry.category)}</Badge>
          <SupportStatusBadge status={inquiry.status} />
        </div>
        <h1 className="text-heading page-title text-ink">{inquiry.title}</h1>
        <p className="text-xs text-muted">
          <span className="text-ink">{inquiry.nickname}</span>
          <span className="mx-2 text-line-strong">·</span>
          {formatSupportDateTime(inquiry.createdAt)}
        </p>
        <div className="whitespace-pre-wrap text-sm leading-[1.8] text-ink/90">
          {inquiry.body}
        </div>
      </Card>

      {/* 답글 */}
      {inquiry.replies.length > 0 && (
        <ol className="space-y-3">
          {inquiry.replies.map((r) => (
            <li
              key={r.id}
              className={`rounded-2xl border p-(--block-pad) ${
                r.fromStaff
                  ? 'border-sky-soft/50 bg-sky/5'
                  : 'border-line bg-surface desk:ml-8'
              }`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-semibold text-ink">{r.name}</span>
                {r.fromStaff && (
                  <Badge className="border-sky-soft/40 text-sky">운영자</Badge>
                )}
                <span className="ml-auto">{formatSupportDateTime(r.createdAt)}</span>
              </div>
              <div className="whitespace-pre-wrap text-sm leading-[1.8] text-ink/90">
                {r.body}
              </div>
            </li>
          ))}
        </ol>
      )}

      {/* 답글 칸 · 종료 — 닫힌 문의는 칸 대신 한 줄과 '다시 열기' */}
      {closed ? (
        <Card className="flex flex-col items-center gap-3 text-center">
          <Lock aria-hidden className="h-6 w-6 text-muted/60" />
          <p className="text-sm text-muted">
            종료된 문의예요. 더 물을 게 있으면 다시 열어 주세요.
          </p>
          <SafeForm action={reopenInquiry}>
            <input type="hidden" name="id" value={inquiry.id} />
            <Button type="submit" variant="secondary" size="sm">
              다시 열기
            </Button>
          </SafeForm>
        </Card>
      ) : (
        <div className="space-y-3">
          <SupportReplyForm inquiryId={inquiry.id} staff={inquiry.staff} />
          <SafeForm action={closeInquiry} className="flex justify-end">
            <input type="hidden" name="id" value={inquiry.id} />
            <Button type="submit" variant="ghost" size="sm">
              <Lock aria-hidden className="h-3.5 w-3.5" />
              문의 종료
            </Button>
          </SafeForm>
        </div>
      )}
    </div>
  );
}
