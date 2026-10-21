import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronLeft, EyeOff, MessagesSquare, Pencil } from '@/components/icon';
import { SafeForm } from '@/components/safe-form';
import { Badge, Button, Card } from '@/components/ui';
import { ConfirmButton } from '@/components/master/confirm-button';
import { FavoriteButton } from '@/components/dugout/favorite-button';
import { ReportListingForm } from '@/components/dugout/report-listing-form';
import {
  deleteListing,
  setListingHidden,
  setListingStatus,
} from '@/app/actions/market';
import { openConversation } from '@/app/actions/chat';
import { getCurrentUser } from '@/lib/dal';
import { loadListing } from '@/lib/market/load';
import { prisma } from '@/lib/prisma';
import {
  STATUSES,
  categoryLabel,
  conditionLabel,
  formatPrice,
  specLines,
  statusLabel,
} from '@/lib/market/specs';
import { formatDateTime, relativeTime } from '@/components/community/community-format';

/** 물건 하나(2026-10-20) — 사진 · 가격 · 규격 표 · 설명 · 판매자 · 채팅하기 · 찜 · 신고. 주인은 상태 바꾸기 · 고치기 · 지우기 */
export default async function ListingPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getCurrentUser();
  const item = await loadListing(id, user ? { id: user.id, role: user.role } : null);
  if (!item) notFound();
  /* 조회수 — 주인이 아닐 때만 */
  if (!item.mine)
    await prisma.listing
      .update({ where: { id }, data: { views: { increment: 1 } } })
      .catch(() => undefined);
  const now = new Date();
  const lines = specLines(item.category, item.specs);
  const isAdmin = user?.role === 'ADMIN';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <Link
        href="/market"
        className="inline-flex items-center gap-1 text-sm font-semibold text-sky"
      >
        <ChevronLeft className="h-4 w-4" /> 장터
      </Link>

      {item.hidden && (
        <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
          <EyeOff className="mr-1 inline h-4 w-4" /> 관리자가 가린 물건이에요. 주인과
          관리자만 봐요.
        </p>
      )}

      {/* 사진 */}
      {item.images.length > 0 ? (
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
          {item.images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
            <img
              key={url}
              src={url}
              alt={`${item.title} 사진 ${i + 1}`}
              className="aspect-square w-[80%] shrink-0 snap-center rounded-2xl bg-surface-2 object-cover sm:w-[48%]"
            />
          ))}
        </div>
      ) : (
        <div className="grid aspect-video place-items-center rounded-2xl bg-surface-2 text-sm text-muted">
          사진 없음
        </div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>{categoryLabel(item.category)}</Badge>
          <Badge>{conditionLabel(item.condition)}</Badge>
          {item.status !== 'ACTIVE' && (
            <Badge className="text-warn">{statusLabel(item.status)}</Badge>
          )}
          <span className="ml-auto text-xs text-muted">
            {item.region} · {relativeTime(item.createdAt, now)} · 조회 {item.views}
          </span>
        </div>
        <h1 className="text-2xl font-black text-ink">{item.title}</h1>
        <p className="text-3xl font-black text-ink">{formatPrice(item.price)}</p>
      </div>

      {lines.length > 0 && (
        <Card className="p-0">
          <dl className="grid grid-cols-2 divide-y divide-line sm:grid-cols-3">
            {lines.map((l) => (
              <div key={l.label} className="px-4 py-3">
                <dt className="text-[11px] text-muted">{l.label}</dt>
                <dd className="text-sm font-semibold text-ink">{l.value}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {item.body && (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
          {item.body}
        </p>
      )}

      {/* 판매자 */}
      <Card className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-full bg-sky/12 text-sm font-bold text-sky-strong">
          {item.seller.nickname.slice(0, 1)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{item.seller.nickname}</p>
          <p className="text-xs text-muted">
            가입 {formatDateTime(item.seller.since).slice(0, 8)} · 투구 기록{' '}
            {item.seller.records}건 · 올린 물건 {item.seller.listings}개
          </p>
        </div>
      </Card>

      {/* 하는 일 */}
      {item.mine ? (
        <Card className="space-y-3">
          <p className="text-xs font-medium text-muted">내 물건 — 상태</p>
          <div className="flex flex-wrap gap-2">
            {STATUSES.map((s) => (
              <SafeForm
                key={s.key}
                action={setListingStatus}
                doneToast={`${s.label}(으)로 바꿨어요.`}
              >
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="status" value={s.key} />
                <Button
                  type="submit"
                  size="sm"
                  variant={item.status === s.key ? 'primary' : 'secondary'}
                >
                  {s.label}
                </Button>
              </SafeForm>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/market/${item.id}/edit`}
              className="inline-flex min-h-10 items-center gap-1 rounded-xl border border-line px-3 text-sm font-semibold text-ink"
            >
              <Pencil className="h-4 w-4" /> 고치기
            </Link>
            <ConfirmButton
              action={deleteListing}
              fields={{ id: item.id }}
              message="이 물건을 지울까요? 사진과 채팅방의 연결도 사라져요."
              variant="danger"
            >
              지우기
            </ConfirmButton>
          </div>
        </Card>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {user ? (
            <SafeForm action={openConversation}>
              <input type="hidden" name="listingId" value={item.id} />
              <Button type="submit" size="lg" className="gap-1.5">
                <MessagesSquare className="h-4 w-4" />{' '}
                {item.chatId ? '채팅 이어서' : '채팅하기'}
              </Button>
            </SafeForm>
          ) : (
            <Link
              href={`/login?next=/market/${item.id}`}
              className="inline-flex min-h-12 items-center gap-1.5 rounded-xl bg-sky px-5 text-base font-semibold text-white"
            >
              <MessagesSquare className="h-4 w-4" /> 로그인하고 채팅하기
            </Link>
          )}
          {item.status === 'ACTIVE' && (
            <Link
              href={
                user
                  ? `/pay/listing/${item.id}`
                  : `/login?next=/pay/listing/${item.id}`
              }
              className="inline-flex min-h-11 items-center rounded-xl border border-sky px-4 text-sm font-semibold text-sky-strong"
            >
              안전결제
            </Link>
          )}
          <FavoriteButton
            listingId={item.id}
            favorite={item.favorite}
            count={item.favorites}
            loggedIn={!!user}
          />
          {user && <ReportListingForm listingId={item.id} />}
        </div>
      )}

      {isAdmin && !item.mine && (
        <SafeForm
          action={setListingHidden}
          doneToast={item.hidden ? '다시 보여요.' : '가렸어요.'}
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="hidden" value={item.hidden ? '0' : '1'} />
          <Button type="submit" variant="ghost" size="sm" className="gap-1">
            <EyeOff className="h-4 w-4" />{' '}
            {item.hidden ? '되살리기' : '관리자 · 가리기'}
          </Button>
        </SafeForm>
      )}
    </div>
  );
}
