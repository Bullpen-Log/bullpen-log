import Link from 'next/link';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { requireAdmin } from '@/lib/dal';
import { ChevronRight, Plus, ScrollText } from '@/components/icon';
import { Badge, ButtonLink, PageHeading } from '@/components/ui';
import type { EvidenceSource } from '@/lib/review-evidence/materialize';
import { DOMAIN_LABEL, SOURCE_KIND_LABEL, SOURCE_KINDS } from '@/lib/review-evidence/model';
import { evidenceStoreKind, loadEvidenceLibrary } from '@/lib/review-evidence/storage';
import {
  METADATA_STATUSES,
  METADATA_STATUS_LABEL,
  SORT_KEYS,
  SORT_LABEL,
  facetCounts,
  filterSources,
  isFiltered,
  latestIn,
  latestText,
  readFilters,
  titleOf,
  type DomainFilter,
} from '@/lib/review-evidence/view';
import { FIELD, FailScreen, LIST_HREF, OutLink, StoreBanner, Warn } from './parts';

/**
 * 검수 근거자료(대표관리자만, EX-REF04) — 운동 · 메커니즘 검수에서 실제로 쓴 출처 목록.
 * 참고자료(학습용, /admin/references)와 따로다. 보는 사람 검사가 저장소 읽기보다 먼저다.
 */

const SHOWN = 300;

export default async function ReviewEvidencePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await connection();
  const user = await requireAdmin();
  const res = await loadEvidenceLibrary(user);
  if (!res.ok) {
    if (res.reason === 'forbidden') redirect('/today');
    return (
      <div className="stack-page">
        <PageHeading title="검수 근거자료" />
        <FailScreen reason={res.reason} retryHref={LIST_HREF} />
      </div>
    );
  }

  const { library } = res;
  const f = readFilters(await searchParams);
  const shown = filterSources(library.sources, f);
  const facets = facetCounts(library.sources);
  const filtered = isFiltered(f);
  // 거둔 쓰임은 세지 않는다(useCounts 가 이미 뺀 수)
  const usesByDomain = { exercise: 0, mechanics: 0 };
  for (const s of library.sources) {
    usesByDomain.exercise += s.useCounts.exercise;
    usesByDomain.mechanics += s.useCounts.mechanics;
  }

  return (
    <div className="stack-page">
      <PageHeading
        title="검수 근거자료"
        description="운동 · 메커니즘 검수에서 실제로 쓴 출처를 모아요. 참고자료(학습용)와는 따로예요."
        action={
          <ButtonLink href="/admin/review-evidence/new" size="sm">
            <Plus aria-hidden className="h-4 w-4" />새 근거 등록
          </ButtonLink>
        }
      />

      <StoreBanner kind={evidenceStoreKind()} />

      <section aria-label="모은 수" className="rounded-2xl border border-line bg-surface p-(--block-pad)">
        <p className="text-xs leading-relaxed text-muted">인용은 효과의 증거나 승인이 아니에요. 서지 확인과 실제로 읽은 범위는 따로 적어요. 근거의 질은 평가하지 않았어요.</p>
        <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Count label="출처" value={library.sources.length} />
          <Count label="쓰임" value={library.useCount} />
          <Count label="운동" value={usesByDomain.exercise} />
          <Count label="메커니즘" value={usesByDomain.mechanics} />
        </dl>
        {library.withdrawnCount > 0 && <p className="mt-2 text-xs text-muted">거둔 쓰임 {library.withdrawnCount.toLocaleString('ko-KR')}개는 세지 않았어요.</p>}
      </section>

      {library.skippedOps > 0 && <Warn>모양이 맞지 않아 목록에서 뺀 기록이 {library.skippedOps.toLocaleString('ko-KR')}건 있어요. 저장소에는 그대로 있어요. 관리 담당에게 알려 주세요.</Warn>}
      {library.foreignObjects > 0 && (
        <Warn>기록 자리에 기록이 아닌 파일이 {library.foreignObjects.toLocaleString('ko-KR')}개 있어요. 읽지 않고 세기만 했어요. 관리 담당에게 알려 주세요.</Warn>
      )}

      <form action={LIST_HREF} method="get" role="search" className="flex flex-col gap-2 desk:flex-row desk:flex-wrap desk:items-end">
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">
          찾기
          <input name="q" defaultValue={f.q} maxLength={100} placeholder="제목 · 저자 · 운동 이름 · 검수 번호 · DOI" className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          분야
          <select name="domain" defaultValue={f.domain} className={FIELD}>
            <option value="all">전체</option>
            <option value="exercise">운동 ({facets.domain.exercise})</option>
            <option value="mechanics">메커니즘 ({facets.domain.mechanics})</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          종류
          <select name="kind" defaultValue={f.kind} className={FIELD}>
            <option value="all">전체</option>
            {SOURCE_KINDS.map((k) => (
              <option key={k} value={k}>
                {SOURCE_KIND_LABEL[k]} ({facets.kind[k]})
              </option>
            ))}
            <option value="unknown">분류 확인 필요 ({facets.kind.unknown})</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          서지 확인
          <select name="meta" defaultValue={f.meta} className={FIELD}>
            <option value="all">전체</option>
            {METADATA_STATUSES.map((m) => (
              <option key={m} value={m}>
                {METADATA_STATUS_LABEL[m]} ({facets.meta[m]})
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs text-muted">
          정렬
          <select name="sort" defaultValue={f.sort} className={FIELD}>
            {SORT_KEYS.map((k) => (
              <option key={k} value={k}>
                {SORT_LABEL[k]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex gap-2">
          <button type="submit" className="min-h-11 rounded-xl bg-sky px-4 text-sm font-semibold text-white desk:min-h-9">
            찾기
          </button>
          {(filtered || f.sort !== 'recent') && (
            <Link href={LIST_HREF} className="inline-flex min-h-11 items-center rounded-xl px-3 text-sm text-muted hover:text-sky desk:min-h-9">
              지우기
            </Link>
          )}
        </div>
      </form>

      <section aria-label="출처 목록" className="stack-block">
        <h2 className="text-sm font-bold text-ink">
          출처 {filtered ? `${shown.length}개 (전체 ${library.sources.length}개 중)` : `${library.sources.length}개`}
        </h2>
        {library.sources.length === 0 ? (
          <p className="empty-well rounded-2xl px-4 py-8 text-center text-sm text-muted">아직 등록된 근거가 없어요.</p>
        ) : shown.length === 0 ? (
          <p className="empty-well rounded-2xl px-4 py-8 text-center text-sm text-muted">맞는 출처가 없어요. 찾는 말이나 거르기를 바꿔 보세요.</p>
        ) : (
          <ul className="overflow-hidden rounded-2xl border border-line bg-surface">
            {shown.slice(0, SHOWN).map((s) => (
              <SourceRow key={s.id} s={s} domain={f.domain} />
            ))}
          </ul>
        )}
        {shown.length > SHOWN && (
          <p className="text-xs text-muted">
            {shown.length}개 중 앞 {SHOWN}개만 보여요. 찾는 말로 좁혀 보세요.
          </p>
        )}
      </section>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="text-numeric mt-0.5 text-lg font-semibold text-ink">{value.toLocaleString('ko-KR')}</dd>
    </div>
  );
}

function SourceRow({ s, domain }: { s: EvidenceSource; domain: DomainFilter }) {
  const domainText = (['exercise', 'mechanics'] as const)
    .filter((d) => s.useCounts[d] > 0)
    .map((d) => `${DOMAIN_LABEL[d]} ${s.useCounts[d]}`)
    .join(' · ');
  return (
    <li className="border-b border-line last:border-b-0">
      <Link href={`${LIST_HREF}/${s.id}`} className="flex items-start gap-3 px-(--block-pad) pt-3 pb-1 transition-colors duration-75 hover:bg-surface-2">
        <ScrollText aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold break-words text-ink">{titleOf(s)}</span>
          <span className="mt-1.5 flex flex-wrap gap-1">
            <Badge className={s.kind ? undefined : 'text-warn'}>{s.kind ? SOURCE_KIND_LABEL[s.kind] : '분류 확인 필요'}</Badge>
            <Badge className={s.metadataStatus === 'unverified' ? 'text-warn' : undefined}>{METADATA_STATUS_LABEL[s.metadataStatus]}</Badge>
          </span>
          <span className="mt-1.5 block text-xs text-muted">
            {[domainText || null, latestText(latestIn(s, domain)), s.withdrawnUses > 0 ? `거둔 쓰임 ${s.withdrawnUses}` : null].filter(Boolean).join(' · ')}
          </span>
          <span className="mt-1 line-clamp-2 text-xs leading-relaxed break-words text-muted">{s.summaryKo ?? '요약 없음'}</span>
        </span>
        <ChevronRight aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      </Link>
      <div className="px-(--block-pad) pb-3 pl-[calc(var(--block-pad)+1.75rem)]">
        <OutLink href={s.primaryHref} className="inline-flex min-h-11 max-w-full items-center gap-1 text-xs break-all text-sky hover:underline desk:min-h-0">
          원문 링크 열기
        </OutLink>
      </div>
    </li>
  );
}
