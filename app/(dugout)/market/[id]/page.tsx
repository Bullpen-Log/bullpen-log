import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoundBack, RoundChat, RoundEyeOff, RoundPencil } from '@/components/round-icon';
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

/** 공유 미리보기(2026-10-21 7단계 7-2) — 제목 · 가격 · 지역. 사진은 서명 주소라 안 넣는다 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const item = await loadListing(id, null);
  if (!item || item.hidden) return { title: '물건' };
  return {
    title: item.title,
    description: `${formatPrice(item.price)} · ${item.region} · ${categoryLabel(item.category)}`,
    openGraph: {
      title: item.title,
      description: `${formatPrice(item.price)} · ${item.region}`,
      type: 'article',
    },
  };
}

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

  /* 사진 — 번개장터처럼 왼쪽에 큰 정사각 하나 + 밑에 작은 띠(두 장 이상일 때). 사진끼리 넘기는 것은 큰 칸을 옆으로 미는 것으로 */
  const photos = (
    <div className="space-y-2">
      {item.images.length > 0 ? (
        <div className="flex snap-x snap-mandatory gap-2 overflow-x-auto rounded-2xl">
          {item.images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
            <img
              key={url}
              src={url}
              alt={`${item.title} 사진 ${i + 1}`}
              className="aspect-square w-full shrink-0 snap-center rounded-2xl bg-surface-2 object-cover"
            />
          ))}
        </div>
      ) : (
        <div className="grid aspect-square place-items-center rounded-2xl bg-surface-2 text-sm text-muted">
          사진 없음
        </div>
      )}
      {item.images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {item.images.map((url, i) => (
            // eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소
            <img key={url} src={url} alt="" className="h-16 w-16 shrink-0 rounded-lg bg-surface-2 object-cover" title={`사진 ${i + 1}`} />
          ))}
        </div>
      )}
    </div>
  );

  /* 하는 일 — 번개장터 오른쪽 칸: 찜 · 채팅하기 · 안전결제를 가로 한 줄로 꽉 채운다 */
  const actions = item.mine ? (
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
          <RoundPencil className="h-4 w-4" /> 고치기
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
    <div className="space-y-2">
      <div className="flex items-stretch gap-2">
        <FavoriteButton
          listingId={item.id}
          favorite={item.favorite}
          count={item.favorites}
          loggedIn={!!user}
        />
        {user ? (
          <SafeForm action={openConversation} className="flex-1">
            <input type="hidden" name="listingId" value={item.id} />
            <Button type="submit" size="lg" className="w-full gap-1.5">
              <RoundChat className="h-4 w-4" />{' '}
              {item.chatId ? '채팅 이어서' : '채팅하기'}
            </Button>
          </SafeForm>
        ) : (
          <Link
            href={`/login?next=/market/${item.id}`}
            className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-xl bg-sky px-5 text-base font-semibold text-white"
          >
            <RoundChat className="h-4 w-4" /> 로그인하고 채팅하기
          </Link>
        )}
      </div>
      {item.status === 'ACTIVE' && (
        <Link
          href={user ? `/pay/listing/${item.id}` : `/login?next=/pay/listing/${item.id}`}
          className="flex min-h-12 items-center justify-center rounded-xl border border-sky text-base font-semibold text-sky-strong"
        >
          안전결제
        </Link>
      )}
      {user && (
        <div className="flex justify-end">
          <ReportListingForm listingId={item.id} />
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <Link
        href="/market"
        className="inline-flex items-center gap-1 text-sm font-semibold text-sky"
      >
        <RoundBack className="h-4 w-4" /> 장터
      </Link>

      {item.hidden && (
        <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
          <RoundEyeOff className="mr-1 inline h-4 w-4" /> 관리자가 가린 물건이에요. 주인과
          관리자만 봐요.
        </p>
      )}

      {/* 번개장터 상세(2026-10-23) — PC 는 왼쪽 사진 · 오른쪽 가격 · 제목 · 하는 일 두 칸, 휴대폰은 위아래 */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
        {photos}
        <div className="space-y-5">
          <div className="space-y-2">
            <p className="text-3xl font-black text-ink">{formatPrice(item.price)}</p>
            <h1 className="text-xl font-bold text-ink">{item.title}</h1>
            <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
              <span>{relativeTime(item.createdAt, now)}</span>
              <span>조회 {item.views}</span>
              <span>찜 {item.favorites}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <Badge>{categoryLabel(item.category)}</Badge>
              <Badge>{conditionLabel(item.condition)}</Badge>
              <Badge>{item.region}</Badge>
              {item.status !== 'ACTIVE' && (
                <Badge className="text-warn">{statusLabel(item.status)}</Badge>
              )}
            </div>
          </div>

          {lines.length > 0 && (
            <dl className="divide-y divide-line border-y border-line">
              {lines.map((l) => (
                <div key={l.label} className="flex items-center gap-4 py-2.5 text-sm">
                  <dt className="w-24 shrink-0 text-muted">{l.label}</dt>
                  <dd className="font-semibold text-ink">{l.value}</dd>
                </div>
              ))}
            </dl>
          )}

          {actions}

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
        </div>
      </div>

      {item.body && (
        <section className="space-y-2">
          <h2 className="text-base font-bold text-ink">상품 설명</h2>
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{item.body}</p>
        </section>
      )}

      {isAdmin && !item.mine && (
        <SafeForm
          action={setListingHidden}
          doneToast={item.hidden ? '다시 보여요.' : '가렸어요.'}
        >
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="hidden" value={item.hidden ? '0' : '1'} />
          <Button type="submit" variant="ghost" size="sm" className="gap-1">
            <RoundEyeOff className="h-4 w-4" />{' '}
            {item.hidden ? '되살리기' : '관리자 · 가리기'}
          </Button>
        </SafeForm>
      )}
    </div>
  );
}
