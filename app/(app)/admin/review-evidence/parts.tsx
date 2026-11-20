import Link from 'next/link';
import type { ReactNode } from 'react';
import { ArrowLeft, ExternalLink, ScrollText, TriangleAlert } from '@/components/icon';
import { ButtonLink, EmptyState } from '@/components/ui';

/**
 * 검수 근거자료 화면(EX-REF04)이 같이 쓰는 작은 조각. 훅 없이 그리기만 해서 서버 · 브라우저 어느 쪽에서도 쓸 수 있다.
 * 글은 모두 React 가 글자로 그린다(HTML 로 해석하지 않는다).
 */

export const LIST_HREF = '/admin/review-evidence';

export const FIELD =
  'min-h-11 w-full rounded-xl border border-transparent bg-ink/5 px-3 text-sm text-ink focus:border-sky focus:bg-surface focus:outline-none desk:min-h-9 desk:border-line desk:bg-surface-2';

/* 목록을 모으지 못한 까닭마다(lib/review-evidence/store.ts LoadFailure) — 일부만 보이지 않고 이 화면만 보인다 */
const FAIL_TEXT = {
  unavailable: { title: '저장소에 잠시 닿지 못했어요', body: '조금 뒤 다시 시도해 주세요. 저장된 기록은 그대로예요.' },
  too_large: { title: '기록이 정해 둔 한도를 넘었어요', body: '한 번에 읽을 수 있는 양을 넘었어요. 관리 담당에게 알려 주세요.' },
  unsupported: {
    title: '서버 저장소가 목록 v2를 지원하지 않아요',
    body: '저장소의 목록 v2(list-v2) 기능이 있어야 기록을 빠짐없이 모을 수 있어요. 다시 시도해도 풀리지 않으니 관리 담당에게 알려 주세요. 저장된 기록은 그대로예요.',
  },
  inconsistent: {
    title: '목록을 전부 모았는지 확인하지 못했어요',
    body: '저장소 목록이 중간에 어긋났거나 목록에 있던 기록을 읽지 못했어요. 일부만 보이지 않도록 멈췄어요. 조금 뒤 다시 시도해 주세요.',
  },
  unexpected: {
    title: '저장소가 예상하지 않은 항목을 돌려줬어요',
    body: '기록 자리 밖의 항목이나 하위 폴더가 보여 목록을 멈췄어요. 관리 담당에게 알려 주세요. 저장된 기록은 그대로예요.',
  },
} as const;

export type FailReason = keyof typeof FAIL_TEXT;

export function FailScreen({ reason, retryHref }: { reason: FailReason; retryHref: string }) {
  const t = FAIL_TEXT[reason];
  return (
    <EmptyState
      icon={<ScrollText />}
      title={t.title}
      description={t.body}
      action={
        <ButtonLink href={retryHref} prefetch={false} variant="secondary" size="sm">
          다시 시도
        </ButtonLink>
      }
    />
  );
}

/** 내 컴퓨터 시험 폴더를 쓰는 중이면 분명히 알린다 */
export function StoreBanner({ kind }: { kind: 'central' | 'local-fixture' }) {
  if (kind !== 'local-fixture') return null;
  return <Warn>내 컴퓨터 시험 폴더의 자료예요. 중앙 저장소가 아니에요.</Warn>;
}

export function Warn({ children }: { children: ReactNode }) {
  return (
    <p role="status" className="flex items-start gap-2 rounded-2xl border border-warn-line bg-warn-bg px-(--block-pad) py-3 text-sm text-ink">
      <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

export function BackToList() {
  return (
    <Link href={LIST_HREF} className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-sky desk:min-h-0">
      <ArrowLeft aria-hidden className="h-4 w-4" />
      검수 근거자료
    </Link>
  );
}

export function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-(--block-pad)">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 desk:grid-cols-[8rem_1fr] desk:gap-3">
      <dt className="text-xs text-muted desk:text-sm">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

/** 밖으로 나가는 링크 — 새 창, 보낸 곳 정보 없이 */
export function OutLink({ href, children, className }: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? 'inline-flex min-w-0 items-start gap-1 break-all text-sm text-sky hover:underline'}
    >
      <span className="min-w-0">{children}</span>
      <ExternalLink aria-hidden className="mt-1 h-3 w-3 shrink-0" />
    </a>
  );
}

/** 서버 응답 본문 중 화면이 읽는 칸 */
export type ApiFailBody = { error?: string; message?: string; issues?: { field?: string; message?: string }[] } | null;

/**
 * 쓰기 요청이 거절됐을 때 보일 글. 403 이어도 까닭이 여럿이라(대표관리자 아님 · 다른 사이트에서 온 요청 · 도구 머리 빠짐)
 * 서버가 준 종류(error)로 가른다. '대표관리자만 …' 은 forbidden 일 때만.
 */
export function apiFailText(status: number, data: ApiFailBody, text: { forbidden: string; byStatus: Record<number, string>; fallback: string }): string {
  if (data?.error === 'forbidden') return data.issues?.find((i) => i.message)?.message ?? text.forbidden;
  if (status === 403) return data?.message ?? '요청을 받지 않았어요. 이 화면을 새로 연 뒤 다시 보내 주세요.';
  return text.byStatus[status] ?? data?.message ?? text.fallback;
}
