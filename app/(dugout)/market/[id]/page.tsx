import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { RoundBack, RoundEyeOff, RoundPencil } from '@/components/round-icon';
import { SafeForm } from '@/components/safe-form';
import { Button, Card } from '@/components/ui';
import { ConfirmButton } from '@/components/master/confirm-button';
import { ReportListingForm } from '@/components/dugout/report-listing-form';
import { ListingGallery } from '@/components/dugout/listing-gallery';
import { PurchaseBar, PurchaseSummary } from '@/components/dugout/purchase-summary';
import { SectionHead } from '@/components/dugout/ui';
import { deleteListing, setListingHidden, setListingStatus } from '@/app/actions/market';
import { getCurrentUser } from '@/lib/dal';
import { conditionStatement, knownDefects, photoLabel } from '@/lib/market/detail';
import { loadListing } from '@/lib/market/load';
import { prisma } from '@/lib/prisma';
import { STATUSES, categoryLabel, conditionLabel, formatPrice, specLines } from '@/lib/market/specs';
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

/**
 * 물건 하나(2026-10-25 Phase 1, docs/designs/dugout-market-commerce-plan.md 4절) — 쇼핑처럼 보고 바로 판단한다.
 * 위: 왼쪽 사진(썸네일 단추 · 통째 보기 · 전체 화면) · 오른쪽 구매 요약(금액 · 거래 방법 · 판매자 확인 사실 · 구매 · 문의 · 찜, PC 는 고정).
 * 아래: 상태 · 알려진 하자 → 같은 사진을 원래 비율로 세로로 → 판매자 설명 → 규격 → 판매자 · 후기 → 배송 · 반품 · 보호 범위 · 신고.
 * 휴대폰은 한 줄로 내려가고 아래에 가격 · 구매 줄이 붙는다. 주인은 상태 바꾸기 · 고치기 · 지우기.
 * 표에 없는 것(배송비 · 하자 칸 · 본인 확인 · 완료 거래)은 지어내지 않는다 — lib/market/detail.ts 가 '확인 필요 · 아직 안 됨'으로 돌려준다.
 */
export default async function ListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const item = await loadListing(id, user ? { id: user.id, role: user.role } : null);
  if (!item) notFound();
  /* 조회수 — 주인이 아닐 때만 */
  if (!item.mine)
    await prisma.listing.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => undefined);
  const now = new Date();
  const lines = specLines(item.category, item.specs);
  const isAdmin = user?.role === 'ADMIN';
  const defects = knownDefects(item.body);
  const total = item.images.length;

  const ownerActions = item.mine && (
    <Card className="space-y-3">
      <p className="text-xs font-medium text-muted">내 물건 · 상태</p>
      <div className="flex flex-wrap gap-2">
        {STATUSES.map((s) => (
          <SafeForm key={s.key} action={setListingStatus} doneToast={`${s.label}(으)로 바꿨어요.`}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="status" value={s.key} />
            <Button type="submit" size="sm" variant={item.status === s.key ? 'primary' : 'secondary'}>
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
  );

  return (
    <div className="space-y-10 pb-24 md:pb-0">
      <Link href="/market" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
        <RoundBack className="h-4 w-4" /> 장터
      </Link>

      {item.hidden && (
        <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
          <RoundEyeOff className="mr-1 inline h-4 w-4" /> 관리자가 가린 물건이에요. 주인과 관리자만 봐요.
        </p>
      )}

      {/* 위 — 사진 60 · 구매 요약 40 */}
      <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-12">
        <div className="min-w-0">
          <ListingGallery images={item.images} title={item.title} />
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
            <span>{categoryLabel(item.category)}</span>
            <span>{conditionLabel(item.condition)}</span>
            <span>{item.region}</span>
            <span>{relativeTime(item.createdAt, now)}</span>
            <span>조회 {item.views}</span>
          </p>
        </div>
        <div className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <PurchaseSummary item={item} loggedIn={!!user} now={now} />
          {ownerActions}
          {/* 중요한 하자는 요약 옆에서도 */}
          {defects.length > 0 && (
            <div className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-sm text-warn">
              <p className="font-semibold">판매자가 적은 흔적 · 하자</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                {defects.map((d) => (
                  <li key={d}>{d}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>

      {/* 아래 — 읽기 좋은 폭 */}
      <div className="mx-auto max-w-3xl space-y-12 lg:mx-0">
        {/* 1 상태 · 알려진 하자 */}
        <section className="space-y-3">
          <SectionHead title="상태" kicker={conditionLabel(item.condition)} />
          <p className="text-[15px] leading-relaxed text-ink">{conditionStatement(item.condition)}</p>
          <dl className="divide-y divide-line border-y border-line text-sm">
            <div className="flex gap-4 py-2.5">
              <dt className="w-28 shrink-0 text-muted">알려진 하자</dt>
              <dd className="min-w-0 flex-1 text-ink">
                {defects.length > 0 ? (
                  <ul className="space-y-0.5">
                    {defects.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="text-muted">판매자가 따로 적지 않았어요. 사진과 설명으로 확인하고 궁금하면 문의하세요.</span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* 2 같은 사진을 원래 비율로 세로로 — 흠집이 잘리지 않게 */}
        {total > 0 && (
          <section className="space-y-4">
            <SectionHead title="사진 자세히" count={total} kicker="원래 비율 그대로" />
            <div className="space-y-6">
              {item.images.map((url, i) => (
                <figure key={url} className="space-y-1.5">
                  <div className="min-h-48 overflow-hidden rounded-2xl bg-surface-2">
                    {/* eslint-disable-next-line @next/next/no-img-element -- 저장소 서명 주소 */}
                    <img
                      src={url}
                      alt={`${item.title} ${photoLabel(i, total)}`}
                      loading={i === 0 ? 'eager' : 'lazy'}
                      decoding="async"
                      className="block h-auto w-full"
                    />
                  </div>
                  <figcaption className="text-xs text-muted">{photoLabel(i, total)}</figcaption>
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* 3 판매자 설명 — 글 그대로 */}
        <section className="space-y-3">
          <SectionHead title="판매자 설명" />
          {item.body ? (
            <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{item.body}</p>
          ) : (
            <p className="text-sm text-muted">판매자가 설명을 적지 않았어요.</p>
          )}
        </section>

        {/* 4 규격 */}
        {lines.length > 0 && (
          <section className="space-y-3">
            <SectionHead title="규격" kicker={categoryLabel(item.category)} />
            <dl className="divide-y divide-line border-y border-line text-sm">
              {lines.map((l) => (
                <div key={l.label} className="flex items-center gap-4 py-2.5">
                  <dt className="w-28 shrink-0 text-muted">{l.label}</dt>
                  <dd className="font-semibold text-ink">{l.value}</dd>
                </div>
              ))}
              {item.category === 'glove' && (
                <div className="py-2.5 text-xs text-muted">
                  ‘던지는 손’은 공을 던지는 손이에요. 우투는 왼손에, 좌투는 오른손에 끼는 글러브예요.
                </div>
              )}
            </dl>
          </section>
        )}

        {/* 5 판매자 · 후기 — 거래 기록이 생기기 전이라 후기 칸은 비어 있다고 말한다 */}
        <section className="space-y-3">
          <SectionHead title="판매자" />
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-full bg-sky/12 text-sm font-bold text-sky-strong">
              {item.seller.nickname.slice(0, 1)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{item.seller.nickname}</p>
              <p className="text-xs text-muted">
                가입 {formatDateTime(item.seller.since).slice(0, 8)} · 올린 물건 {item.seller.listings}개
              </p>
            </div>
          </div>
          <p className="rounded-xl bg-surface-2 px-4 py-3 text-sm text-muted">
            거래 후기는 결제로 끝난 거래에만 붙어요. 아직 결제 기능 전이라 후기가 없어요.
          </p>
        </section>

        {/* 6 배송 · 반품 · 보호 범위 · 신고 — 지금 되는 것만 사실대로 */}
        <section id="protection" className="scroll-mt-24 space-y-3">
          <SectionHead title="거래 안내" kicker="배송 · 반품 · 보호 · 신고" />
          <dl className="divide-y divide-line border-y border-line text-sm">
            <div className="flex gap-4 py-2.5">
              <dt className="w-28 shrink-0 text-muted">배송 · 직거래</dt>
              <dd className="text-ink">
                {item.region === '전국(택배)' ? '택배로 거래해요.' : `택배 또는 ${item.region} 직거래.`} 배송비 · 발송 시점은 판매자와 정해요.
              </dd>
            </div>
            <div className="flex gap-4 py-2.5">
              <dt className="w-28 shrink-0 text-muted">결제 · 보호</dt>
              <dd className="text-ink">
                안전결제는 준비 중이에요. 결제 회사 계약 뒤에 대금 보호 · 환불 기준이 정해져요. 그 전에는 덕아웃이 대금을 맡지 않아요.
              </dd>
            </div>
            <div className="flex gap-4 py-2.5">
              <dt className="w-28 shrink-0 text-muted">판매자 확인</dt>
              <dd className="text-ink">
                ‘본인 확인 · 정산 계좌 확인’은 아직 없는 기능이라 모두 ‘아직 안 됨’이에요. 확인이 돼도 정품 · 상태를 보증하는 뜻은 아니에요.
              </dd>
            </div>
            <div className="flex gap-4 py-2.5">
              <dt className="w-28 shrink-0 text-muted">반품</dt>
              <dd className="text-ink">반품 · 환불 기준은 정책 검토 뒤에 공개해요. 지금은 판매자와 미리 정해 두세요.</dd>
            </div>
            <div className="flex items-center gap-4 py-2.5">
              <dt className="w-28 shrink-0 text-muted">문제 신고</dt>
              <dd className="text-ink">
                {user && !item.mine ? (
                  <ReportListingForm listingId={item.id} />
                ) : user ? (
                  <span className="text-muted">내 물건이에요.</span>
                ) : (
                  <Link href={`/login?next=/market/${item.id}`} className="font-semibold text-sky">
                    로그인하고 신고하기
                  </Link>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {isAdmin && !item.mine && (
          <SafeForm action={setListingHidden} doneToast={item.hidden ? '다시 보여요.' : '가렸어요.'}>
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="hidden" value={item.hidden ? '0' : '1'} />
            <Button type="submit" variant="ghost" size="sm" className="gap-1">
              <RoundEyeOff className="h-4 w-4" /> {item.hidden ? '되살리기' : '관리자 · 가리기'}
            </Button>
          </SafeForm>
        )}
      </div>

      <PurchaseBar item={item} loggedIn={!!user} />
    </div>
  );
}
