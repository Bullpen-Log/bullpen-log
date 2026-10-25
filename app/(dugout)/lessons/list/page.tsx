import type { Metadata } from 'next';
import Link from 'next/link';
import { RoundLesson } from '@/components/round-icon';
import { LessonFrame } from '@/components/dugout/lesson-frame';
import { ChipLink, ChipRow, DugoutEmpty, chipClass } from '@/components/dugout/ui';
import { CoachList } from '@/components/dugout/coach-list';
import { LessonFilterRail } from '@/components/dugout/lesson-filter-rail';
import { appNow } from '@/lib/clock';
import { loadCoaches } from '@/lib/market/lesson-load';
import {
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
 * PC(lg, 2026-10-24 · 25 개편): 왼쪽 216px 거르기 판(components/dugout/lesson-filter-rail.tsx) · 가운데 머리 줄(결과 수 · 켠 조건 · 정렬) · 열이 맞는 비교 줄.
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

  const sortLinks = (
    <div className="flex gap-1 text-xs">
      {SORTS.map((s) => {
        const on = sort === s.key;
        return (
          <Link
            key={s.key}
            href={listHref({ ...current, sort: s.key === 'match' ? undefined : s.key })}
            scroll={false}
            data-nav="none"
            aria-current={on ? 'page' : undefined}
            className={`rounded-full px-2.5 py-1 font-semibold ${on ? 'bg-ink text-page' : 'text-muted hover:text-ink'}`}
          >
            {s.label}
          </Link>
        );
      })}
    </div>
  );
  const chipLinks = chips.map((c) => (
    <Link
      key={c.label}
      href={c.href}
      scroll={false}
      data-nav="none"
      className={chipClass(true)}
    >
      {c.label} <span aria-hidden className="opacity-60">×</span>
      <span className="sr-only">조건 빼기</span>
    </Link>
  ));

  return (
    <LessonFrame
      back="/lessons"
      backLabel="레슨"
      title={asked ? `맞는 코치 ${coaches.length}명` : `모든 코치 ${coaches.length}명`}
      crumbs={[{ label: '덕아웃', href: '/' }, { label: '레슨', href: '/lessons' }, { label: '코치 목록' }]}
      subtitle={asked && sort === 'match' ? '고른 조건에 가까운 코치부터 보여요. 카드 위 초록 칩이 그 까닭이에요.' : '코치를 눌러 자세히 보거나, 둘 이상 담아 비교해요.'}
      actions={
        <Link
          href="/lessons/find"
          className="inline-flex min-h-10 items-center rounded-full bg-sky px-4 text-sm font-bold text-white transition-colors hover:bg-sky-strong"
        >
          맞춤 찾기
        </Link>
      }
    >
      <div className="lg:grid lg:grid-cols-[216px_minmax(0,1fr)] lg:items-start lg:gap-6">
        {/* PC 거르기 판 — 머리 밑에 붙어 따라온다 */}
        <aside className="hidden lg:sticky lg:top-[calc(var(--dugout-bar-h)+1.5rem)] lg:block lg:max-h-[calc(100dvh-var(--dugout-bar-h)-3rem)] lg:overflow-y-auto lg:overscroll-contain">
          <LessonFilterRail current={current} prefs={prefs} />
        </aside>

        <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted lg:hidden">
        <span>{asked && sort === 'match' ? '고른 조건에 가까운 코치부터. 줄 위 초록 칩이 그 까닭이에요.' : '코치를 눌러 자세히 보거나, 둘 이상 담아 비교해요.'}</span>
        <Link href="/lessons/find" className="font-semibold text-sky">
          조건 다시 고르기 ›
        </Link>
      </div>

      {/* 종목 줄 — 바로 바꾸기(휴대폰 · 패드, PC 는 왼쪽 판) */}
      <ChipRow label="종목" className="lg:hidden">
        {[{ key: '', label: '전체' }, ...SPECIALTIES].map((s) => (
          <ChipLink key={s.key} size="md" on={(specialty ?? '') === s.key} href={listHref({ ...current, specialty: s.key || undefined })}>
            {s.label}
          </ChipLink>
        ))}
      </ChipRow>

      {/* 조건 칩 · 정렬 — 휴대폰 */}
      <div className="flex flex-wrap items-center gap-2 lg:hidden">
        {chipLinks}
        <div className="ml-auto">{sortLinks}</div>
      </div>

      {/* PC 머리 줄 — 결과 수 · 켠 조건 · 정렬 */}
      <div className="hidden items-center gap-3 lg:flex">
        <p className="shrink-0 text-sm font-bold text-ink">
          코치 <span className="tabular-nums">{coaches.length}</span>명
        </p>
        <div className="flex min-w-0 flex-1 flex-wrap gap-1.5">{chipLinks}</div>
        <div className="shrink-0 rounded-full bg-ink/5 p-1">{sortLinks}</div>
      </div>

      {coaches.length === 0 ? (
        <DugoutEmpty
          icon={<RoundLesson />}
          title={asked ? '조건에 맞는 코치가 없어요' : '아직 공개한 코치가 없어요'}
          description={
            asked
              ? '조건을 하나 빼 보거나 지역을 넓혀 보세요.'
              : '레슨장 계정이 설정에서 프로필을 공개하면 여기 보여요.'
          }
          action={
            asked ? (
              <Link href="/lessons/list" className="inline-flex min-h-11 items-center rounded-full bg-sky px-5 text-sm font-bold text-white transition-colors hover:bg-sky-strong">
                조건 없이 전체 보기
              </Link>
            ) : undefined
          }
        />
      ) : (
        <CoachList coaches={coaches} bookQuery={bookQuery} />
      )}
      <p className="text-xs text-muted">
        {audience ? `‘${audienceLabel(audience)}’ 레슨으로 요청이 가요. ` : ''}
        요청을 보내면 코치가 확정하고, 레슨비는 레슨이 끝난 뒤 결제돼요(결제는 준비 중).
      </p>
        </div>
      </div>
    </LessonFrame>
  );
}
