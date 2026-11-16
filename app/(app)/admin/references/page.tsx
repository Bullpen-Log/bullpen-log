import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireAdmin } from '@/lib/dal';
import { BookOpen, ChevronRight, ExternalLink } from '@/components/icon';
import { Badge, PageHeading } from '@/components/ui';
import { CATEGORIES, KINDS, type Entry } from '@/lib/admin-references/schema';
import { loadReferenceCatalog } from '@/lib/admin-references/storage';
import {
  CATEGORY_LABEL,
  KIND_LABEL,
  RIGHTS_LABEL,
  bibKindLabel,
  bibliographyView,
  collectionsOf,
  coverageOf,
  durationText,
  facetCounts,
  filterEntries,
  metadataLabel,
  readFilters,
  reviewLabel,
  totalsOf,
  bibNote,
} from '@/lib/admin-references/view';
import { FailScreen } from './fail-screen';

/**
 * 참고자료(대표관리자만, EX-REF02) — 비공개 저장소의 훈련 자료 목록 · 확인한 범위 · 찾기.
 *
 * 내용은 저장소에 없다(비공개 버킷의 JSON — lib/admin-references/README.md). 보는 사람 검사(requireAdmin, 준관리자도 막힘)가
 * 저장소 읽기보다 먼저고, 로더가 한 번 더 본다. 목록은 서버에서 그려 보내 찾기용 본문 · 저장소 열쇠는 화면으로 가지 않는다.
 */

const BIB_SHOWN = 200;

export default async function ReferencesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const user = await requireAdmin();
  const res = await loadReferenceCatalog(user);
  if (!res.ok) {
    if (res.reason === 'forbidden') redirect('/today');
    return (
      <div className="stack-page">
        <PageHeading title="참고자료" />
        <FailScreen reason={res.reason === 'not_found' ? 'missing' : res.reason} retryHref="/admin/references" />
      </div>
    );
  }

  const { catalog } = res;
  const collections = collectionsOf(catalog);
  const f = readFilters(await searchParams, collections);
  const shown = filterEntries(catalog.entries, f);
  const totals = totalsOf(catalog.entries);
  const facets = facetCounts(catalog.entries);
  const filtered = Boolean(f.q || f.category || f.kind || f.collection);
  const bib = bibliographyView(catalog.bibliography, f.q);

  return (
    <div className="stack-page">
      <PageHeading title="참고자료" description={`${catalog.title} · ${updatedText(catalog.updatedAt)} 기준`} />

      <section aria-label="확인한 범위" className="rounded-2xl border border-line bg-surface p-(--block-pad)">
        <h2 className="text-sm font-bold text-ink">확인한 범위(전체 {totals.entries}개 자료)</h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          받은 검토 기록에 적힌 쪽 · 시간만 셉니다. 목록에 있다는 것만으로 읽었다고 하지 않아요.
        </p>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs text-muted">문서 쪽</dt>
            <dd className="mt-0.5 text-ink">
              확인 {totals.pagesReviewed.toLocaleString('ko-KR')}쪽 / 전체 {totals.pagesKnown.toLocaleString('ko-KR')}쪽
            </dd>
            <dd className="text-xs text-muted">
              글로 확인 {totals.textPagesReviewed.toLocaleString('ko-KR')}쪽 · 글 확인 남음(글자 인식 포함){' '}
              {Math.max(0, totals.pagesKnown - totals.textPagesReviewed).toLocaleString('ko-KR')}쪽
              {totals.pageCountUnknown > 0 && ` · 쪽 수 모르는 자료 ${totals.pageCountUnknown}개`}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-muted">영상 시간</dt>
            <dd className="mt-0.5 text-ink">
              화면 확인 {durationText(totals.videoReviewed)} / 전체 {durationText(totals.durationKnown)}
            </dd>
            <dd className="text-xs text-muted">
              음성 확인 {durationText(totals.audioReviewed)} · 음성 확인 남음 {durationText(Math.max(0, totals.durationKnown - totals.audioReviewed))}
              {totals.durationUnknown > 0 && ` · 길이 모르는 영상 ${totals.durationUnknown}개`}
            </dd>
          </div>
        </dl>
      </section>

      <form action="/admin/references" method="get" role="search" className="flex flex-col gap-2 desk:flex-row desk:flex-wrap desk:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          찾기
          <input
            name="q"
            defaultValue={f.q}
            maxLength={100}
            placeholder="제목 · 묶음 · 주제 · 내용"
            className={FIELD}
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          분야
          <select name="category" defaultValue={f.category ?? ''} className={FIELD}>
            <option value="">전체</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORY_LABEL[c]} ({facets.category[c]})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          종류
          <select name="kind" defaultValue={f.kind ?? ''} className={FIELD}>
            <option value="">전체</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABEL[k]} ({facets.kind[k]})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          묶음
          <select name="collection" defaultValue={f.collection ?? ''} className={FIELD}>
            <option value="">전체</option>
            {collections.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="min-h-11 rounded-xl bg-sky px-4 text-sm font-semibold text-white desk:min-h-9">
            찾기
          </button>
          {filtered && (
            <Link href="/admin/references" className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-muted hover:text-sky desk:min-h-9">
              지우기
            </Link>
          )}
        </div>
      </form>

      <section aria-label="자료 목록" className="stack-block">
        <h2 className="text-sm font-bold text-ink">
          자료 {filtered ? `${shown.length}개 (전체 ${catalog.entries.length}개 중)` : `${catalog.entries.length}개`}
        </h2>
        {catalog.entries.length === 0 ? (
          <p className="empty-well rounded-2xl px-4 py-8 text-center text-sm text-muted">목록은 올라왔지만 아직 자료가 없어요.</p>
        ) : shown.length === 0 ? (
          <p className="empty-well rounded-2xl px-4 py-8 text-center text-sm text-muted">맞는 자료가 없어요. 찾는 말이나 거르기를 바꿔 보세요.</p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {shown.map((e) => (
              <EntryRow key={e.id} e={e} />
            ))}
          </ul>
        )}
      </section>

      {catalog.bibliography.length > 0 && (
        <section aria-label="예전 운동 검수의 출처" className="stack-block">
          <div>
            <h2 className="text-sm font-bold text-ink">예전 운동 검수에서 적어 둔 출처 {catalog.bibliography.length}개</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              운동 영상 검수 때 따로 모은 공개 출처예요. 위 자료의 검토를 거친 근거와는 다른 묶음이에요.
              {f.q && ` 찾는 말에 맞는 ${bib.length}개만 보여요.`}
            </p>
          </div>
          {bib.length === 0 ? (
            <p className="empty-well rounded-2xl px-4 py-6 text-center text-sm text-muted">찾는 말에 맞는 출처가 없어요.</p>
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
              {bib.slice(0, BIB_SHOWN).map((b) => (
                <li key={b.id} className="border-b border-line px-(--block-pad) py-3 last:border-b-0">
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-start gap-1 text-sm font-semibold break-words text-ink hover:text-sky"
                  >
                    {b.title ?? '서지정보 확인 필요'}
                    <ExternalLink aria-hidden className="mt-1 h-3 w-3 shrink-0 text-muted" />
                  </a>
                  <p className="mt-0.5 text-xs text-muted">
                    {[bibKindLabel(b.kind), b.publisher, b.year ? `${b.year}년` : null, metadataLabel(b.metadataStatus)].filter(Boolean).join(' · ')}
                  </p>
                  {b.uses.length > 0 && (
                    <ul className="mt-1 space-y-0.5 text-xs text-muted">
                      {b.uses.map((u, i) => (
                        <li key={i}>
                          쓰인 운동: {u.exercise ?? '운동 이름 없음'}
                          {bibNote(u.note) && ` — ${bibNote(u.note)}`}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {bib.length > BIB_SHOWN && (
            <p className="text-xs text-muted">
              {bib.length}개 중 앞 {BIB_SHOWN}개만 보여요. 찾는 말로 좁혀 보세요.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const FIELD =
  'min-h-11 w-full rounded-xl border border-transparent bg-ink/5 px-3 text-sm text-ink focus:border-sky focus:bg-surface focus:outline-none desk:min-h-9 desk:border-line desk:bg-surface-2';

function updatedText(iso: string) {
  return new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
}

function EntryRow({ e }: { e: Entry }) {
  const c = coverageOf(e);
  return (
    <li className="border-b border-line last:border-b-0">
      <Link
        href={`/admin/references/${e.id}`}
        className="flex items-start gap-3 px-(--block-pad) py-3 transition-colors duration-75 hover:bg-surface-2"
      >
        <BookOpen aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold break-words text-ink">{e.title}</span>
          <span className="mt-0.5 block text-xs text-muted">
            {e.collection} · {KIND_LABEL[e.kind]} · {e.language}
          </span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            <Badge>{reviewLabel(e.reviewStatus)}</Badge>
            <Badge className={e.rights === 'pending' ? 'text-warn' : undefined}>{RIGHTS_LABEL[e.rights]}</Badge>
            {e.categories.map((cat) => (
              <Badge key={cat}>{CATEGORY_LABEL[cat]}</Badge>
            ))}
          </span>
          <span className="mt-1.5 block text-xs leading-relaxed text-muted">
            {c.pageCount != null
              ? `확인 ${c.reviewedPages}/${c.pageCount}쪽(글 ${c.textPages} · 그림 ${c.visualPages}) · 글 확인 남음 ${c.textPending}쪽`
              : e.kind !== 'video'
                ? `쪽 수 모름 · 확인한 쪽 기록 없음`
                : null}
            {c.pageCount != null && c.durationSeconds != null && ' · '}
            {c.durationSeconds != null
              ? `화면 ${durationText(c.videoSeconds)} / ${durationText(c.durationSeconds)} · 음성 ${durationText(c.audioSeconds)} 확인(남음 ${durationText(c.audioPending ?? 0)})`
              : e.kind === 'video'
                ? `영상 길이 모름 · 확인한 시간 기록 없음`
                : null}
          </span>
        </span>
        <ChevronRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      </Link>
    </li>
  );
}
