import type { Metadata } from 'next';
import Link from 'next/link';
import { PageHeading } from '@/components/ui';
import { PlaceMap } from '@/components/dugout/place-map';
import { CANDIDATE_FLAGS, CANDIDATE_KINDS, type CandidateFilter, candidateMapPlaces, loadCandidates } from '@/lib/market/candidate-load';
import {
  CONSENT_STATUS,
  CONTACT_STATUS,
  HARDBALL_NOTICE,
  LESSON_NOTICE,
  OPERATION_NOTICE,
  ORIGIN_GROUP,
  RENTAL_NOTICE,
  type StatusMap,
  isStatus,
} from '@/lib/market/candidates';
import { ACCESS_NOTICE, FIELD_OPERATION_NOTICE, IDENTITY_NOTICE } from '@/lib/market/field-candidates';
import { placePage } from '@/lib/market/place-pagination';

export const metadata: Metadata = { title: '수집 후보' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 40);

/* 고르는 칸 — 주소의 이름 · 값 목록 · 이름표. 모르는 값은 버린다 */
const SELECTS: { key: keyof CandidateFilter; label: string; map: StatusMap }[] = [
  { key: 'origin', label: '수집 구분', map: ORIGIN_GROUP },
  { key: 'operation', label: '영업 · 운영 근거', map: { ...OPERATION_NOTICE, ...FIELD_OPERATION_NOTICE } },
  { key: 'access', label: '야구장 이용 경로', map: ACCESS_NOTICE },
  { key: 'identity', label: '야구장 장소 대응', map: IDENTITY_NOTICE },
  { key: 'lesson', label: '레슨 근거', map: LESSON_NOTICE },
  { key: 'hardball', label: '경식구 근거', map: HARDBALL_NOTICE },
  { key: 'rental', label: '대관 근거', map: RENTAL_NOTICE },
  { key: 'contact', label: '연락', map: CONTACT_STATUS },
  { key: 'consent', label: '동의', map: CONSENT_STATUS },
];

/**
 * 덕아웃 수집 후보(2026-10-26 김민, 대표관리자만) — 공공자료 · 지도 공개 화면으로 모은 미확인 후보를 지도 · 목록으로 관리.
 * 레슨 · 연습장(2026-10-26)과 야구장(2026-10-27 조사 파일)이 같은 표에 있고, 종류 줄로 가른다(분류 '야구장 후보').
 * 업체 동의 · 정보 확인 · 관리자 승인 전에는 일반 사용자에게 보이지 않는다(공개 지도 /venues 와 다른 표). 거르기 · 검색은 주소에.
 * 근거 이름표는 '공개 안내 있음 · 키워드만 · 근거 미확보'처럼 근거 수준만 — 실제 제공 · 영업 확정이 아니다.
 */
export default async function AdminPlacesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const page = placePage(one(sp.page));
  const rawKind = one(sp.kind);
  const f: CandidateFilter = {
    q: one(sp.q) || undefined,
    region: one(sp.region) || undefined,
    kind: CANDIDATE_KINDS.some((k) => k.key === rawKind) ? rawKind : undefined,
  };
  for (const s of SELECTS) {
    const v = one(sp[s.key]);
    if (isStatus(s.map, v)) f[s.key] = v;
  }
  const rawFlag = one(sp.flag);
  if (CANDIDATE_FLAGS.some((x) => x.key === rawFlag)) f.flag = rawFlag;
  const { items, hasMore, regions, total, fields, contacted, agreed } = await loadCandidates(f, page);

  const href = (o: Partial<CandidateFilter>) => {
    const s = new URLSearchParams(Object.entries({ ...f, ...o }).filter(([, v]) => v) as [string, string][]);
    return `/manage/places${s.size ? `?${s}` : ''}`;
  };
  const places = candidateMapPlaces(items);
  const pageHref = (p: number) => {
    const s = new URLSearchParams(Object.entries({ ...f, page: String(p) }).filter(([, v]) => v) as [string, string][]);
    return `/manage/places?${s}`;
  };
  const located = items.filter((c) => c.lat != null).length;
  const chip = (on: boolean) =>
    `inline-flex min-h-9 shrink-0 items-center rounded-full border px-3 text-sm ${on ? 'border-ink bg-ink font-semibold text-page' : 'border-line text-ink hover:border-ink/30'}`;
  const field = 'min-h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink';

  return (
    <div className="stack-page">
      <PageHeading
        kicker="관리자"
        title="수집 후보"
        description={`전체 ${total}(레슨 · 연습장 ${total - fields} · 야구장 ${fields}) · 연락 ${contacted} · 동의 ${agreed} — 지도 공개 화면 · 공공자료 · 공개 출처로 모은 미확인 후보예요(레슨 · 연습장 기준일 2026-10-26 · 야구장 조사 2026-10-27). 동의 · 확인 · 승인 전에는 사용자에게 안 보여요.`}
      />
      <form method="get" action="/manage/places" className="flex flex-wrap gap-2">
        {f.flag && <input type="hidden" name="flag" value={f.flag} />}
        {f.kind && <input type="hidden" name="kind" value={f.kind} />}
        <input
          name="q"
          type="search"
          defaultValue={f.q ?? ''}
          placeholder="상호 · 주소"
          className="min-h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-ink focus:border-sky focus:outline-none sm:max-w-xs"
        />
        <select name="region" defaultValue={f.region ?? ''} aria-label="지역" className={field}>
          <option value="">모든 지역</option>
          {regions.map((r) => (
            <option key={r.region} value={r.region}>
              {r.region} {r.count}
            </option>
          ))}
        </select>
        {SELECTS.map((s) => (
          <select key={s.key} name={s.key} defaultValue={f[s.key] ?? ''} aria-label={s.label} className={field}>
            <option value="">{s.label} 전체</option>
            {Object.entries(s.map).map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        ))}
        <button type="submit" className="min-h-10 rounded-xl bg-ink px-4 text-sm font-bold text-page">
          찾기
        </button>
        <Link href="/manage/places" className="inline-flex min-h-10 items-center rounded-xl px-3 text-sm text-muted hover:text-ink" data-nav="none">
          모두 풀기
        </Link>
      </form>
      <nav aria-label="후보 종류" className="-mx-1 flex gap-2 overflow-x-auto px-1">
        <Link href={href({ kind: undefined })} className={chip(!f.kind)} data-nav="none" scroll={false}>
          모든 종류
        </Link>
        {CANDIDATE_KINDS.map((x) => (
          <Link key={x.key} href={href({ kind: x.key })} className={chip(f.kind === x.key)} data-nav="none" scroll={false}>
            {x.label}
          </Link>
        ))}
      </nav>
      <nav aria-label="빠른 거르기" className="-mx-1 flex gap-2 overflow-x-auto px-1">
        <Link href={href({ flag: undefined })} className={chip(!f.flag)} data-nav="none" scroll={false}>
          전체
        </Link>
        {CANDIDATE_FLAGS.map((x) => (
          <Link key={x.key} href={href({ flag: x.key })} className={chip(f.flag === x.key)} data-nav="none" scroll={false}>
            {x.label}
          </Link>
        ))}
      </nav>
      <p className="text-xs text-muted">
        현재 {page}쪽 {items.length}곳 · 지도 점 {located} · 위치 확인 필요 {items.length - located} · 지도는 이쪽의 장소를 표시해요. 점은 공공자료 건물 참조 위치(출입구 · 층 확인 전)이고, 점 색(보라 레슨 · 초록 배팅 · 연습공간 · 주황 야구장)은 분류 단서예요. 야구장 점은 카카오맵 같은 장소 · 주소 검색으로 자동으로 찾은 자리(구장 위치 확인 전)이고, 못 찾은 곳은 목록에만 보여요. 근거 이름표는 실제 제공 · 영업 · 대관 가능 확정이 아니에요.
      </p>
      <PlaceMap places={places} />
      {(page > 1 || hasMore) && <nav aria-label="후보 페이지" className="flex items-center justify-center gap-4 text-sm">
        {page > 1 && <Link href={pageHref(page - 1)} className="rounded-xl border border-line px-4 py-2">이전</Link>}
        <span>{page}쪽</span>
        {hasMore && <Link href={pageHref(page + 1)} className="rounded-xl border border-line px-4 py-2">다음</Link>}
      </nav>}
    </div>
  );
}
