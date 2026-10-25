import Link from 'next/link';
import { RoundChat, RoundLock } from '@/components/round-icon';
import { SafeForm } from '@/components/safe-form';
import { Button } from '@/components/ui';
import { FavoriteButton } from '@/components/dugout/favorite-button';
import { openConversation } from '@/app/actions/chat';
import { buyerQuote, fulfillmentOf, sellerFacts, type SellerFact } from '@/lib/market/detail';
import type { ListingDetail } from '@/lib/market/load';
import { formatPrice, statusLabel } from '@/lib/market/specs';

/**
 * 구매 요약(2026-10-25, Phase 1) — 상세 오른쪽 칸(PC) · 아래 고정 줄(휴대폰). 설정 앱처럼 사실을 줄로 묶는다.
 * 금액은 lib/market/detail.ts buyerQuote(서버 셈) — 수수료율은 소수 그대로 '3.5% (가정)', 배송비는 칸이 없어 '확인'.
 * 주요 행동 하나: '안전하게 구매하기'는 결제가 아직 안 열려 '준비 중' 표시를 달고 결제 미리보기로만 간다(규칙 4 — 말없이 직거래로 바꾸지 않는다).
 * 문의하기는 보조, 찜은 셋째. 문의 · 찜은 물건을 묶어 두지(예약) 않는다.
 */
export function PurchaseSummary({
  item,
  loggedIn,
  now,
}: {
  item: ListingDetail;
  loggedIn: boolean;
  now: Date;
}) {
  const q = buyerQuote(item.price);
  const f = fulfillmentOf(item.region);
  const facts = sellerFacts(item.seller, now);
  const buyable = item.status === 'ACTIVE' && !item.mine;
  return (
    <div className="space-y-5">
      <div className="space-y-1.5">
        <h1 className="text-xl leading-snug font-bold text-ink md:text-[22px]">{item.title}</h1>
        <p className="text-[28px] leading-none font-black text-ink">{formatPrice(item.price)}</p>
        {item.status !== 'ACTIVE' && (
          <p className="text-sm font-semibold text-warn">{statusLabel(item.status)}</p>
        )}
      </div>

      {/* 금액 — 설정 앱 줄처럼 */}
      <dl className="divide-y divide-line border-y border-line text-sm">
        {!q.giveaway && (
          <Row label={q.feeLabel} value={`+${formatPrice(q.fee)}`} />
        )}
        <Row label="배송비" value={f.shipping} muted />
        <Row label="거래 방법" value={f.method} />
        <Row label="발송" value={f.dispatch} muted />
        {!q.giveaway && (
          <div className="flex items-baseline justify-between gap-4 py-2.5">
            <dt className="font-semibold text-ink">지금 알 수 있는 합계</dt>
            <dd className="text-right">
              <span className="text-lg font-black text-ink">{formatPrice(q.total)}</span>
              <span className="block text-xs text-muted">배송비 제외</span>
            </dd>
          </div>
        )}
        {q.giveaway && <Row label="나눔" value="결제 없이 판매자와 정해요" />}
      </dl>

      {/* 판매자 확인 사실 — 서버가 아는 것만 */}
      <SellerFacts facts={facts} nickname={item.seller.nickname} />

      {/* 하는 일 */}
      {item.mine ? null : (
        <div className="space-y-2">
          {buyable && !q.giveaway && <BuyButton id={item.id} loggedIn={loggedIn} total={q.total} />}
          <div className="flex items-stretch gap-2">
            {loggedIn ? (
              <SafeForm action={openConversation} className="flex-1">
                <input type="hidden" name="listingId" value={item.id} />
                <Button type="submit" variant="secondary" size="lg" className="w-full gap-1.5">
                  <RoundChat className="h-4 w-4" /> {item.chatId ? '문의 이어서' : '문의하기'}
                </Button>
              </SafeForm>
            ) : (
              <Link
                href={`/login?next=/market/${item.id}`}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 rounded-full border border-transparent bg-ink/6 px-5 text-base font-semibold text-ink desk:rounded-xl desk:border-line-strong desk:bg-surface-2"
              >
                <RoundChat className="h-4 w-4" /> 로그인하고 문의하기
              </Link>
            )}
            <FavoriteButton listingId={item.id} favorite={item.favorite} count={item.favorites} loggedIn={loggedIn} />
          </div>
          <p className="text-xs text-muted">문의 · 찜은 물건을 예약하지 않아요.</p>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-muted">{label}</dt>
      <dd className={`text-right font-semibold ${muted ? 'text-muted' : 'text-ink'}`}>{value}</dd>
    </div>
  );
}

function SellerFacts({ facts, nickname }: { facts: SellerFact[]; nickname: string }) {
  return (
    <section aria-label="판매자 확인 사실" className="space-y-2">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">판매자 {nickname}</h2>
        <Link href="#protection" className="text-xs text-sky">
          무슨 뜻인가요
        </Link>
      </div>
      <ul className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        {facts.map((f) => (
          <li key={f.label} className="flex items-baseline justify-between gap-2">
            <span className="text-muted">{f.label}</span>
            <span className={`text-right font-semibold ${f.ok ? 'text-ink' : 'text-muted'}`}>{f.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * '안전하게 구매하기' — 결제가 아직 안 열려 있다. 눌리는 단추이되 '준비 중'을 달고 결제 미리보기 화면으로 간다(거기서도 단추는 잠겨 있다).
 * 결제가 열리면 이 표시를 빼면 된다.
 */
function BuyButton({ id, loggedIn, total }: { id: string; loggedIn: boolean; total: number }) {
  return (
    <div className="space-y-1.5">
      <Link
        href={loggedIn ? `/pay/listing/${id}` : `/login?next=/pay/listing/${id}`}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-sky px-5 text-base font-semibold text-white hover:bg-sky-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky desk:rounded-xl"
      >
        안전하게 구매하기
        <span className="rounded-full bg-white/22 px-2 py-0.5 text-xs font-semibold">준비 중</span>
      </Link>
      <p className="flex items-center gap-1 text-xs text-muted">
        <RoundLock className="h-3.5 w-3.5" /> 결제는 아직 열리지 않았어요. {formatPrice(total)} 기준 미리보기만 볼 수 있어요.
      </p>
    </div>
  );
}

/** 휴대폰 아래 고정 줄 — 가격 · 구매 단추. 덕아웃 아래 탭(--tab-bar-top) 위에 선다 */
export function PurchaseBar({ item, loggedIn }: { item: ListingDetail; loggedIn: boolean }) {
  if (item.mine) return null;
  const q = buyerQuote(item.price);
  const buyable = item.status === 'ACTIVE';
  return (
    <div
      className="fixed inset-x-0 z-20 px-4 md:hidden"
      style={{ bottom: 'calc(var(--tab-bar-top, 4.5rem) + 0.5rem)' }}
    >
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-line bg-surface/92 px-4 py-2.5 shadow-lg backdrop-blur-md">
        <div className="min-w-0 flex-1">
          <p className="text-lg leading-tight font-black text-ink">{formatPrice(q.giveaway ? 0 : q.total)}</p>
          <p className="truncate text-[11px] text-muted">{q.giveaway ? '나눔' : '수수료 포함 · 배송비 제외'}</p>
        </div>
        {buyable && !q.giveaway ? (
          <Link
            href={loggedIn ? `/pay/listing/${item.id}` : `/login?next=/pay/listing/${item.id}`}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-sky px-4 text-sm font-semibold text-white"
          >
            안전하게 구매하기 <span className="rounded-full bg-white/22 px-1.5 text-[10px]">준비 중</span>
          </Link>
        ) : (
          <span className="text-sm font-semibold text-muted">{q.giveaway ? '문의로 진행' : statusLabel(item.status)}</span>
        )}
      </div>
    </div>
  );
}
