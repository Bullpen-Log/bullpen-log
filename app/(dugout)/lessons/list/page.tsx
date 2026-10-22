import type { Metadata } from 'next';
import Link from 'next/link';
import { RoundBack, RoundLesson } from '@/components/round-icon';
import { EmptyState } from '@/components/ui';
import { CoachList } from '@/components/dugout/coach-list';
import { appNow } from '@/lib/clock';
import { loadCoaches } from '@/lib/market/lesson-load';
import {
  AUDIENCES,
  PREFS,
  SORTS,
  SPECIALTIES,
  TIME_BANDS,
  WHEN_OPTIONS,
  audienceLabel,
  isAudience,
  isSort,
  isSpecialty,
  isTimeBand,
  isWhen,
  listHref,
  readPrefs,
  specialtyLabel,
  weekdaysOfWhen,
} from '@/lib/market/lessons';

export const metadata: Metadata = { title: '코치 목록' };

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) =>
  ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 80);

/**
 * 코치 목록(3판) — 찾기 흐름의 답 · 검색 · 종목으로 거른 코치. 조건은 모두 주소에(공유 · 뒤로가기가 된다).
 * 위: 조건 칩(누르면 그 조건만 빠짐) · 정렬. 목록: 코치 카드 + 비교 체크(최대 셋) → 아래 '비교하기' 막대(components/dugout/coach-list.tsx).
 */
export default async function CoachListPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const raw = {
    specialty: one(sp.specialty),
    audience: one(sp.audience),
    when: one(sp.when),
    band: one(sp.band),
    sort: one(sp.sort),
  };
  const specialty = isSpecialty(raw.specialty) ? raw.specialty : undefined;
  const audience = isAudience(raw.audience) ? raw.audience : undefined;
  const when = isWhen(raw.when) ? raw.when : undefined;
  const band = isTimeBand(raw.band) ? raw.band : undefined;
  const region = one(sp.region) || undefined;
  const q = one(sp.q) || undefined;
  const prefs = readPrefs(one(sp.prefs));
  const sort = isSort(raw.sort) ? raw.sort : 'match';
  const kstWeekday = new Date(appNow().getTime() + 9 * 3_600_000).getUTCDay();
  const weekdays = when ? weekdaysOfWhen(when, kstWeekday) : undefined;

  const coaches = await loadCoaches({ region, specialty, q, prefs, band, weekdays, sort });
  const current = {
    specialty,
    audience,
    when,
    band,
    region,
    q,
    prefs: prefs.length ? prefs.join(',') : undefined,
    sort: sort !== 'match' ? sort : undefined,
  };
  const without = (key: keyof typeof current, value?: string) =>
    listHref({
      ...current,
      [key]:
        key === 'prefs' && value
          ? prefs.filter((p) => p !== value).join(',') || undefined
          : undefined,
    });
  const chips: { label: string; href: string }[] = [];
  if (specialty) chips.push({ label: specialtyLabel(specialty), href: without('specialty') });
  if (audience) chips.push({ label: audienceLabel(audience)!, href: without('audience') });
  if (when) chips.push({ label: WHEN_OPTIONS.find((w) => w.key === when)!.label, href: without('when') });
  if (band) chips.push({ label: TIME_BANDS.find((b) => b.key === band)!.label, href: without('band') });
  if (region) chips.push({ label: region, href: without('region') });
  if (q) chips.push({ label: `“${q}”`, href: without('q') });
  for (const p of prefs) chips.push({ label: PREFS.find((x) => x.key === p)!.label, href: without('prefs', p) });
  const asked = chips.length > 0;
  /* 예약 화면에 넘길 것 — 무엇을 · 누가 */
  const bookQuery = new URLSearchParams(
    Object.entries({ specialty, audience }).filter(([, v]) => v) as [string, string][]
  ).toString();

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <Link href="/lessons" className="inline-flex items-center gap-1 text-sm font-semibold text-sky">
          <RoundBack className="h-4 w-4" /> 레슨
        </Link>
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black text-ink">
            {asked ? '맞는 코치' : '모든 코치'} <span className="text-base font-semibold text-muted">{coaches.length}명</span>
          </h1>
          {asked && sort === 'match' && (
            <p className="mt-1 text-xs text-muted">고른 조건에 가까운 코치부터 — 카드 위 파란 칩이 그 까닭이에요.</p>
          )}
        </div>
        <Link href="/lessons/find" className="text-xs font-semibold text-sky">
          조건 다시 고르기 ›
        </Link>
      </div>

      {/* 종목 줄 — 바로 바꾸기 */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {[{ key: '', label: '전체' }, ...SPECIALTIES].map((s) => {
          const on = (specialty ?? '') === s.key;
          return (
            <Link
              key={s.key}
              href={listHref({ ...current, specialty: s.key || undefined })}
              aria-current={on ? 'page' : undefined}
              className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold whitespace-nowrap ${on ? 'bg-sky text-white' : 'border border-line bg-surface text-ink hover:border-sky-soft'}`}
            >
              {s.label}
            </Link>
          );
        })}
      </div>

      {/* 조건 칩 · 정렬 */}
      <div className="flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="inline-flex min-h-8 items-center gap-1 rounded-full bg-ink/6 px-3 text-xs font-semibold text-ink hover:bg-ink/10"
          >
            {c.label} <span aria-hidden className="text-muted">×</span>
            <span className="sr-only">조건 빼기</span>
          </Link>
        ))}
        <div className="ml-auto flex gap-1 text-xs">
          {SORTS.map((s) => {
            const on = sort === s.key;
            return (
              <Link
                key={s.key}
                href={listHref({ ...current, sort: s.key === 'match' ? undefined : s.key })}
                aria-current={on ? 'page' : undefined}
                className={`rounded-full px-2.5 py-1 font-semibold ${on ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      </div>

      {coaches.length === 0 ? (
        <EmptyState
          icon={<RoundLesson />}
          title={asked ? '조건에 맞는 코치가 없어요' : '아직 공개한 코치가 없어요'}
          description={
            asked
              ? '조건을 하나 빼 보거나 지역을 넓혀 보세요.'
              : '레슨장 계정이 설정에서 프로필을 공개하면 여기 보여요.'
          }
          action={
            asked ? (
              <Link href="/lessons/list" className="text-sm font-semibold text-sky">
                조건 없이 전체 보기
              </Link>
            ) : undefined
          }
        />
      ) : (
        <CoachList coaches={coaches} bookQuery={bookQuery} />
      )}
      <p className="text-xs text-muted">
        {AUDIENCES.length > 0 && audience
          ? `‘${audienceLabel(audience)}’ 레슨으로 요청이 가요. `
          : ''}
        요청을 보내면 코치가 확정하고, 레슨비는 레슨이 끝난 뒤 결제돼요(결제는 준비 중).
      </p>
    </div>
  );
}
