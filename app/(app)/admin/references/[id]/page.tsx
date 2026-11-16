import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { connection } from 'next/server';
import type { ReactNode } from 'react';
import { requireAdmin } from '@/lib/dal';
import { ArrowLeft, ExternalLink } from '@/components/icon';
import { Badge } from '@/components/ui';
import type { Claim, Interval, Section } from '@/lib/admin-references/schema';
import { loadReferenceDetail } from '@/lib/admin-references/storage';
import { originalHref, type OriginalKind } from '@/lib/admin-references/load';
import {
  CATEGORY_LABEL,
  DECISION_LABEL,
  KIND_LABEL,
  RIGHTS_LABEL,
  SECTION_KIND_LABEL,
  availabilityLabel,
  clockText,
  durationText,
  pagesText,
  reviewLabel,
} from '@/lib/admin-references/view';
import { FailScreen } from '../fail-screen';
import { OriginalNotice, SourceTable } from './detail-parts';

/**
 * 참고자료 한 건(대표관리자만, EX-REF02). 쉬운 요약 · 원저자 내용(한국어로 옮김) · 최신 근거로 본 판단을 서로 다른 칸으로 나눠 보인다.
 * 모든 글은 React 가 글자로 그린다(HTML 로 해석하지 않는다). 원본은 이용 허락이 확인되고 파일이 연결된 것만 대표관리자 통로
 * (/api/admin/references/<id>/original)로 연다 — 그때만 쪽 · 시간 표시가 원본을 여는 링크가 된다(#page= · #t= 를 붙이지만, 그 자리로 가는지는
 * 보는 프로그램에 달려 있다). 아니면 원본 상태(허락 확인 중 · 파일 연결 전 · 원본 파일 제공 안 함)를 한 줄로 말한다(detail-parts.tsx).
 */
export default async function ReferenceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await connection();
  const user = await requireAdmin();
  const { id } = await params;
  const res = await loadReferenceDetail(user, id);
  if (!res.ok) {
    if (res.reason === 'forbidden') redirect('/today');
    if (res.reason === 'not_found') notFound();
    return (
      <div className="stack-page">
        <BackLink />
        <FailScreen reason={res.reason} retryHref={`/admin/references/${id}`} />
      </div>
    );
  }

  const { entry, detail } = res;
  const c = entry.coverageView;
  const translations = detail.sections.filter((s) => s.kind === 'translation' || s.kind === 'table');
  const notes = detail.sections.filter((s) => s.kind === 'note');
  const limitSections = detail.sections.filter((s) => s.kind === 'limitation');
  /* 원본 바로가기 — 열 수 있을 때만(PDF 는 #page=, 영상 · 소리는 #t=) */
  const jump: Jump | null = detail.original === 'eligible' && detail.originalKind ? { href: originalHref(entry.id), kind: detail.originalKind } : null;

  return (
    <div className="stack-page">
      <BackLink />

      <header className="border-b border-line pb-5">
        <p className="text-xs font-medium text-sky">
          {entry.collection} · {KIND_LABEL[entry.kind]} · {entry.language}
        </p>
        <h1 className="text-heading page-title mt-1 break-words text-ink">{detail.title}</h1>
        <p className="mt-2 flex flex-wrap gap-1">
          <Badge>{reviewLabel(entry.reviewStatus)}</Badge>
          <Badge className={entry.rights === 'pending' ? 'text-warn' : undefined}>{RIGHTS_LABEL[entry.rights]}</Badge>
          <Badge>{availabilityLabel(entry.availability)}</Badge>
          {entry.categories.map((cat) => (
            <Badge key={cat}>{CATEGORY_LABEL[cat]}</Badge>
          ))}
        </p>
      </header>

      <Block title="확인한 범위">
        <dl className="grid gap-2 text-sm">
          {c.pageCount != null ? (
            <>
              <Row label="전체">{c.pageCount}쪽</Row>
              <Row label="글로 확인">{entry.coverage.textPages.length ? pagesText(entry.coverage.textPages) : '없음'}</Row>
              <Row label="그림으로 확인">{entry.coverage.visualPages.length ? pagesText(entry.coverage.visualPages) : '없음'}</Row>
              <Row label="글 확인 남음">{c.textPending}쪽(글자 인식 · 다시 읽기 대기)</Row>
            </>
          ) : entry.kind !== 'video' ? (
            <Row label="쪽">쪽 수를 몰라 확인한 쪽을 세지 않았어요</Row>
          ) : null}
          {c.durationSeconds != null ? (
            <>
              <Row label="전체 길이">{durationText(c.durationSeconds)}</Row>
              <Row label="화면 확인">
                {durationText(c.videoSeconds)}
                {entry.coverage.videoIntervals.length > 0 && ` (${intervalsText(entry.coverage.videoIntervals)})`}
              </Row>
              <Row label="음성 확인">
                {durationText(c.audioSeconds)}
                {entry.coverage.audioIntervals.length > 0 && ` (${intervalsText(entry.coverage.audioIntervals)})`}
              </Row>
              <Row label="음성 확인 남음">{durationText(c.audioPending ?? 0)}</Row>
            </>
          ) : entry.kind === 'video' ? (
            <Row label="영상">길이를 몰라 확인한 시간을 세지 않았어요</Row>
          ) : null}
        </dl>
      </Block>

      <OriginalNotice status={detail.original} href={jump ? jump.href : null} />

      <Block title="쉽게 요약" note="검토자가 쉬운 말로 쓴 요약이에요. 원저자의 말과 다를 수 있어요.">
        {detail.digestKo ? <Prose text={detail.digestKo} /> : <Empty>요약이 아직 없어요.</Empty>}
      </Block>

      <Block title="원저자 내용(한국어로 옮김)" note="원저자가 쓴 · 말한 내용을 옮긴 것이에요. 최신 근거와 맞지 않는 내용이 있을 수 있어요(아래 '근거로 다시 본 주장').">
        {translations.length ? <SectionList list={translations} jump={jump} /> : <Empty>옮긴 내용이 아직 없어요.</Empty>}
      </Block>

      {notes.length > 0 && (
        <Block title="해설" note="검토자가 덧붙인 설명이에요.">
          <SectionList list={notes} jump={jump} />
        </Block>
      )}

      <Block title="근거로 다시 본 주장" note="원저자의 주장과, 지금의 연구로 다시 본 판단을 나눠 보여요.">
        {detail.claims.length ? (
          <ol className="stack-block">
            {detail.claims.map((cl) => (
              <ClaimCard key={cl.id} c={cl} jump={jump} />
            ))}
          </ol>
        ) : (
          <Empty>다시 본 주장이 아직 없어요.</Empty>
        )}
      </Block>

      {detail.glossary.length > 0 && (
        <Block title="용어">
          <dl className="grid gap-2 text-sm">
            {detail.glossary.map((g, i) => (
              <div key={i} className="grid gap-0.5 desk:grid-cols-[14rem_1fr] desk:gap-3">
                <dt className="font-medium break-words text-ink">
                  {g.ko} <span className="font-normal text-muted">({g.en})</span>
                </dt>
                <dd className="break-words text-muted">{g.meaning || '—'}</dd>
              </div>
            ))}
          </dl>
        </Block>
      )}

      {(detail.limitationsKo.length > 0 || limitSections.length > 0) && (
        <Block title="한계">
          {detail.limitationsKo.length > 0 && (
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-ink">
              {detail.limitationsKo.map((l, i) => (
                <li key={i} className="break-words">
                  {l}
                </li>
              ))}
            </ul>
          )}
          {limitSections.length > 0 && <SectionList list={limitSections} jump={jump} />}
        </Block>
      )}
    </div>
  );
}

function BackLink() {
  return (
    <Link href="/admin/references" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted transition-colors hover:text-sky">
      <ArrowLeft className="h-4 w-4" />
      참고자료
    </Link>
  );
}

function Block({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface p-(--block-pad)">
      <h2 className="text-sm font-bold text-ink">{title}</h2>
      {note && <p className="mt-1 text-xs leading-relaxed text-muted">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 desk:grid-cols-[8rem_1fr] desk:gap-3">
      <dt className="text-xs text-muted desk:text-sm">{label}</dt>
      <dd className="break-words text-ink">{children}</dd>
    </div>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}

/** 줄바꿈은 지키고 HTML 로는 읽지 않는다 */
function Prose({ text }: { text: string }) {
  return <p className="text-sm leading-relaxed break-words whitespace-pre-line text-ink">{text}</p>;
}

function intervalsText(list: readonly Interval[]) {
  return [...list]
    .sort((a, b) => a[0] - b[0])
    .map(([a, b]) => `${clockText(a)}–${clockText(b)}`)
    .join(', ');
}

type Jump = { href: string; kind: OriginalKind };

/**
 * 원본 위치 — '원문 3–5쪽' · '영상 1:02–3:40'. 원본을 열 수 있으면 원본을 여는 링크(PDF 는 첫 쪽 #page=, 영상 · 소리는 시작 #t=).
 * 그 쪽 · 시각으로 실제로 가는지는 브라우저 · 앱의 보기 프로그램에 따른다 — 화면 글로 약속하지 않는다.
 */
function Where({ pages, start, end, seconds, jump }: { pages?: readonly number[]; start?: number | null; end?: number | null; seconds?: readonly number[]; jump: Jump | null }) {
  const parts: ReactNode[] = [];
  const link = (key: string, text: string, frag: string | null) =>
    jump && frag ? (
      <a key={key} href={`${jump.href}#${frag}`} target="_blank" rel="noopener noreferrer" className="underline decoration-sky/40 underline-offset-2 hover:decoration-sky">
        {text}
      </a>
    ) : (
      <span key={key}>{text}</span>
    );
  const media = jump && (jump.kind === 'video' || jump.kind === 'audio');
  if (pages && pages.length) {
    const first = [...pages].sort((a, b) => a - b)[0];
    parts.push(link('p', `원문 ${pagesText(pages)}`, jump?.kind === 'pdf' ? `page=${first}` : null));
  }
  if (start != null && end != null) parts.push(link('t', `영상 ${clockText(start)}–${clockText(end)}`, media ? `t=${Math.floor(start)}` : null));
  else if (start != null) parts.push(link('t', `영상 ${clockText(start)}부터`, media ? `t=${Math.floor(start)}` : null));
  else if (end != null) parts.push(link('t', `영상 ${clockText(end)}까지`, null));
  if (seconds && seconds.length) {
    [...seconds]
      .sort((a, b) => a - b)
      .forEach((sec, i) => parts.push(link(`s${i}`, `영상 ${clockText(sec)}`, media ? `t=${Math.floor(sec)}` : null)));
  }
  if (!parts.length) return <p className="text-xs font-medium text-sky">원본 위치 표시 없음</p>;
  return (
    <p className="flex flex-wrap gap-x-2 text-xs font-medium text-sky">
      {parts.map((part, i) => (
        <span key={i}>
          {i > 0 && <span className="text-muted"> · </span>}
          {part}
        </span>
      ))}
    </p>
  );
}

function SectionList({ list, jump }: { list: readonly Section[]; jump: Jump | null }) {
  return (
    <div className="stack-block">
      {list.map((s) => (
        <article key={s.id} className="border-l-2 border-line pl-3">
          <h3 className="text-sm font-semibold break-words text-ink">
            {s.title} <span className="text-xs font-normal text-muted">· {SECTION_KIND_LABEL[s.kind]}</span>
          </h3>
          <Where pages={s.sourcePages} start={s.startSeconds} end={s.endSeconds} jump={jump} />
          {s.textKo && (
            <div className="mt-1.5">
              <Prose text={s.textKo} />
            </div>
          )}
          {s.table && <SourceTable label={s.title} columns={s.table.columns} rows={s.table.rows} />}
        </article>
      ))}
    </div>
  );
}

function ClaimCard({ c, jump }: { c: Claim; jump: Jump | null }) {
  return (
    <li className="rounded-xl border border-line p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge className={c.decision === 'update' || c.decision === 'insufficient' ? 'text-warn' : undefined}>{DECISION_LABEL[c.decision]}</Badge>
        <Where pages={c.sourcePages} seconds={c.sourceSeconds} jump={jump} />
      </div>
      <div className="mt-2">
        <p className="text-xs text-muted">원저자의 주장</p>
        <Prose text={c.originalClaimKo} />
      </div>
      <div className="mt-2">
        <p className="text-xs text-muted">근거로 본 판단</p>
        <Prose text={c.interpretationKo} />
      </div>
      {c.evidence.length > 0 ? (
        <ul className="mt-2 space-y-2">
          {c.evidence.map((ev, i) => (
            <li key={i} className="rounded-lg bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
              <a href={ev.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-start gap-1 font-semibold break-words text-ink hover:text-sky">
                {ev.title}
                <ExternalLink aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
              </a>
              <p>
                {[ev.year ? `${ev.year}년` : null, ev.doi ? `DOI ${ev.doi}` : null, ev.applicability === 'direct' ? '직접 근거' : '간접 근거(추론)']
                  .filter(Boolean)
                  .join(' · ')}
              </p>
              <p className="break-words">대상: {ev.population}</p>
              <p className="break-words">방법: {ev.methods}</p>
              {ev.sample && <p className="break-words">표본: {ev.sample}</p>}
              <p className="break-words">결과: {ev.outcome}</p>
              <p className="break-words">한계: {ev.limitations}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs text-muted">붙은 연구가 없어요.</p>
      )}
    </li>
  );
}
