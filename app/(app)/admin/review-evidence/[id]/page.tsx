import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireAdmin } from '@/lib/dal';
import { Badge } from '@/components/ui';
import { findSource, type EvidenceSource, type EvidenceUse } from '@/lib/review-evidence/materialize';
import {
  DOMAIN_LABEL,
  DOMAINS,
  METADATA_SOURCE_LABEL,
  PURPOSE_LABEL,
  READING_LABEL,
  SOURCE_KIND_LABEL,
  SUMMARY_BASIS_LABEL,
  type Domain,
} from '@/lib/review-evidence/model';
import { evidenceStoreKind, loadEvidenceLibrary } from '@/lib/review-evidence/storage';
import { METADATA_STATUS_LABEL, authorsText, dateText, doiHref, hostOf, pmcidHref, pmidHref, timeText, titleOf } from '@/lib/review-evidence/view';
import { BackToList, Block, FailScreen, LIST_HREF, OutLink, Row, StoreBanner } from '../parts';
import { WithdrawForm } from './withdraw-form';

/**
 * 검수 근거자료 한 건(대표관리자만, EX-REF04) — 서지 · 요약 · 링크 · 실제로 쓰인 곳.
 * 모든 글은 React 가 글자로 그린다. 모르는 날짜 · 읽은 범위는 지어내지 않고 '미상 · 미확인'으로 보인다.
 */

type DomainView = 'all' | Domain;

export default async function ReviewEvidenceDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const user = await requireAdmin();
  const { id } = await params;
  const res = await loadEvidenceLibrary(user);
  if (!res.ok) {
    if (res.reason === 'forbidden') redirect('/today');
    return (
      <div className="stack-page">
        <BackToList />
        <FailScreen reason={res.reason} retryHref={`${LIST_HREF}/${encodeURIComponent(id)}`} />
      </div>
    );
  }
  const s = findSource(res.library, id);
  if (!s) notFound();

  const sp = await searchParams;
  const rawDomain = Array.isArray(sp.domain) ? sp.domain[0] : sp.domain;
  const view: DomainView = rawDomain === 'exercise' || rawDomain === 'mechanics' ? rawDomain : 'all';
  const active = s.uses.filter((u) => !u.withdrawn);
  const withdrawn = s.uses.filter((u) => u.withdrawn && (view === 'all' || u.domain === view));
  const groups = DOMAINS.filter((d) => view === 'all' || view === d)
    .map((d) => ({ domain: d, uses: active.filter((u) => u.domain === d) }))
    .filter((g) => g.uses.length > 0);
  // 거두기 단추는 내가 지금 등록한 쓰임에만(계정 번호는 화면으로 넘기지 않고 참 · 거짓만)
  const mine = (u: EvidenceUse) => u.scope === 'user' && !u.withdrawn && u.ownerUserId === user.id;
  const base = `${LIST_HREF}/${s.id}`;

  return (
    <div className="stack-page">
      <BackToList />
      <StoreBanner kind={evidenceStoreKind()} />

      <header className="border-b border-line pb-5">
        <h1 className="text-heading page-title break-words text-ink">{titleOf(s)}</h1>
        <p className="mt-2 flex flex-wrap gap-1">
          <Badge className={s.kind ? undefined : 'text-warn'}>{s.kind ? SOURCE_KIND_LABEL[s.kind] : '분류 확인 필요'}</Badge>
          <Badge className={s.metadataStatus === 'unverified' ? 'text-warn' : undefined}>{METADATA_STATUS_LABEL[s.metadataStatus]}</Badge>
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted">인용은 효과의 증거나 승인이 아니에요. 서지 확인과 실제로 읽은 범위는 따로 적어요. 근거의 질은 평가하지 않았어요.</p>
      </header>

      <Bibliography s={s} />

      <Block title="요약" note={s.summaryKo && s.summaryBasis ? SUMMARY_BASIS_LABEL[s.summaryBasis] : undefined}>
        <p className="text-sm leading-relaxed whitespace-pre-line break-words text-ink">{s.summaryKo ?? '요약 없음'}</p>
      </Block>

      <Block title={`링크 ${s.links.length}개`}>
        <ul className="space-y-2">
          {s.links.map((l) => (
            <li key={l.href}>
              <OutLink href={l.href}>{l.label || hostOf(l.href) || l.href}</OutLink>
            </li>
          ))}
        </ul>
      </Block>

      <section aria-label="쓰인 곳" className="stack-block">
        <h2 className="text-sm font-bold text-ink">쓰인 곳 {active.length}곳</h2>
        <nav aria-label="분야 고르기" className="flex flex-wrap gap-2">
          {(['all', ...DOMAINS] as const).map((d) => {
            const count = d === 'all' ? active.length : s.useCounts[d];
            const on = view === d;
            return (
              <Link
                key={d}
                href={d === 'all' ? base : `${base}?domain=${d}`}
                aria-current={on ? 'page' : undefined}
                className={`inline-flex min-h-10 items-center rounded-full px-4 text-sm ${on ? 'bg-ink text-surface' : 'bg-ink/5 text-muted hover:text-ink'}`}
              >
                {d === 'all' ? '전체' : DOMAIN_LABEL[d]} {count}
              </Link>
            );
          })}
        </nav>
        {groups.length === 0 ? (
          <p className="empty-well rounded-2xl px-4 py-6 text-center text-sm text-muted">이 분야에서 쓰인 기록이 없어요.</p>
        ) : (
          groups.map((g) => (
            <div key={g.domain} className="stack-block">
              <h3 className="text-xs font-semibold text-muted">
                {DOMAIN_LABEL[g.domain]} {g.uses.length}곳
              </h3>
              <ul className="space-y-3">
                {g.uses.map((u) => (
                  <UseCard key={u.useId} u={u} canWithdraw={mine(u)} />
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      {withdrawn.length > 0 && (
        <details className="group rounded-2xl border border-line bg-surface p-(--block-pad)">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-sm font-bold text-ink desk:min-h-0">
            거둔 쓰임 {withdrawn.length}곳
            <span className="text-xs font-normal text-muted group-open:hidden">펼치기</span>
            <span className="hidden text-xs font-normal text-muted group-open:inline">접기</span>
          </summary>
          <p className="mt-1 text-xs leading-relaxed text-muted">잘못 등록해 거둔 쓰임이에요. 기록은 남기지만 쓰인 곳 수에는 넣지 않아요.</p>
          <ul className="mt-3 space-y-3">
            {withdrawn.map((u) => (
              <UseCard key={u.useId} u={u} canWithdraw={false} />
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Bibliography({ s }: { s: EvidenceSource }) {
  const authors = authorsText(s.authors);
  const ids = s.identifiers;
  return (
    <Block title="서지정보">
      <dl className="grid gap-2 text-sm">
        <Row label="저자">{authors ?? '기록 없음'}</Row>
        <Row label="학술지 · 발행처">{s.container ?? '기록 없음'}</Row>
        <Row label="연도">{s.year ? `${s.year}년` : '기록 없음'}</Row>
        {ids.doi.length > 0 && (
          <Row label="DOI">
            <IdLinks values={ids.doi} href={doiHref} />
          </Row>
        )}
        {ids.pmid.length > 0 && (
          <Row label="PMID">
            <IdLinks values={ids.pmid} href={pmidHref} />
          </Row>
        )}
        {ids.pmcid.length > 0 && (
          <Row label="PMCID">
            <IdLinks values={ids.pmcid} href={pmcidHref} />
          </Row>
        )}
        <Row label="서지 확인">
          {s.metadataStatus === 'verified' && s.verifiedBy ? METADATA_SOURCE_LABEL[s.verifiedBy] : METADATA_STATUS_LABEL[s.metadataStatus]}
          {s.metadataStatus === 'claimed' && s.verifiedBy && <span className="block text-xs text-muted">적힌 곳: {METADATA_SOURCE_LABEL[s.verifiedBy]}</span>}
        </Row>
      </dl>
    </Block>
  );
}

function IdLinks({ values, href }: { values: string[]; href: (v: string) => string }) {
  return (
    <span className="flex flex-col gap-1">
      {values.map((v) => (
        <OutLink key={v} href={href(v)}>
          {v}
        </OutLink>
      ))}
    </span>
  );
}

function UseCard({ u, canWithdraw }: { u: EvidenceUse; canWithdraw: boolean }) {
  const historical = u.scope === 'historical';
  const w = u.withdrawn;
  return (
    <li className={`rounded-2xl border border-line p-(--block-pad) ${w ? 'bg-surface-2' : 'bg-surface'}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold break-words text-ink">{u.itemName ?? '이름 기록 없음'}</p>
          {u.itemId && <p className="mt-0.5 font-mono text-xs break-all text-muted">{u.itemId}</p>}
        </div>
        <p className="flex flex-wrap gap-1">
          <Badge>{PURPOSE_LABEL[u.purpose]}</Badge>
          {historical && <Badge className="text-warn">과거 기록</Badge>}
          {w && <Badge className="text-danger">거둔 쓰임</Badge>}
        </p>
      </div>
      {w && (
        <dl className="mt-3 grid gap-2 rounded-xl border border-line bg-surface p-3 text-sm">
          <Row label="거둔 까닭">
            <span className="whitespace-pre-line">{w.reasonKo}</span>
          </Row>
          <Row label="거둔 사람">{w.byLabel}</Row>
          <Row label="거둔 때">{timeText(w.at)}</Row>
        </dl>
      )}
      <dl className="mt-3 grid gap-2 text-sm">
        <Row label="검수 번호">
          <span className="font-mono text-xs break-all">{u.reviewId}</span>
        </Row>
        {u.purposeNote && <Row label="쓴 곳 메모">{u.purposeNote}</Row>}
        <Row label="검수한 사람">{u.reviewerLabel}</Row>
        <Row label="확인일">
          {dateText(u.consultedOn)}
          {u.firstConsultedOn && u.firstConsultedOn !== u.consultedOn && <span className="text-muted"> (처음 확인 {dateText(u.firstConsultedOn)})</span>}
        </Row>
        {historical && <Row label="검수 기록에 적힌 때">{u.historical?.recordedAt ? timeText(u.historical.recordedAt) : '기록 없음'}</Row>}
        <Row label="적용 내용">
          <span className="whitespace-pre-line">{u.applicationKo ?? (historical ? '적용 내용 기록 없음(과거 기록에서 링크만 확인)' : '적용 내용 기록 없음')}</span>
        </Row>
        {u.limitationsKo && (
          <Row label="적용 한계">
            <span className="whitespace-pre-line">{u.limitationsKo}</span>
          </Row>
        )}
        <Row label="읽은 범위">
          {READING_LABEL[u.reading]}
          {u.readingNote && <span className="block whitespace-pre-line text-muted">{u.readingNote}</span>}
        </Row>
        <Row label="인용한 링크">
          <span className="flex flex-col gap-1">
            <OutLink href={u.href}>{hostOf(u.href) || u.href}</OutLink>
            {u.otherHrefs
              .filter((h) => h !== u.href)
              .map((h) => (
                <OutLink key={h} href={h}>
                  {hostOf(h) || h}
                </OutLink>
              ))}
          </span>
        </Row>
      </dl>
      <p className="mt-3 text-xs text-muted">
        등록 {timeText(u.lastReceivedAt)}
        {u.revisions > 1 && ` · 같은 쓰임 기록 ${u.revisions}번`}
      </p>
      {canWithdraw && <WithdrawForm useId={u.useId} />}
    </li>
  );
}
