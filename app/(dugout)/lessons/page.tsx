import Link from 'next/link';
import { RoundLesson, RoundStar } from '@/components/round-icon';
import { Badge, EmptyState } from '@/components/ui';
import { loadCoaches } from '@/lib/market/lesson-load';
import { SPECIALTIES, isSpecialty, specialtyLabel } from '@/lib/market/lessons';
import { formatPrice } from '@/lib/market/specs';

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) =>
  ((Array.isArray(v) ? v[0] : v) ?? '').trim().slice(0, 40);

/** 레슨 — 코치 비교 목록(2판). 전문 · 지역 · 검색은 주소에. 로그인 없이 본다 */
export default async function LessonsPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const specialty = isSpecialty(one(sp.specialty)) ? one(sp.specialty) : undefined;
  const region = one(sp.region) || undefined;
  const q = one(sp.q) || undefined;
  const coaches = await loadCoaches({ region, specialty, q });
  const href = (p: Record<string, string | undefined>) => {
    const s = new URLSearchParams(
      Object.entries(p).filter(([, v]) => v) as [string, string][]
    );
    return `/lessons${s.size ? `?${s}` : ''}`;
  };
  const chip = (h: string, on: boolean, label: string) => (
    <Link
      key={h + label}
      href={h}
      aria-current={on ? 'page' : undefined}
      className={`inline-flex min-h-9 shrink-0 items-center rounded-full px-3.5 text-xs font-semibold whitespace-nowrap ${on ? 'bg-sky text-white' : 'border border-line bg-surface text-ink hover:border-sky-soft'}`}
    >
      {label}
    </Link>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black text-ink">레슨</h1>
        <p className="mt-1 text-sm text-muted">
          코치를 비교하고 원하는 시간을 골라 요청해요. 코치가 확정하면 레슨장 회원이
          되고 코치는 내 기록을 봐요.
        </p>
      </div>
      <form method="get" action="/lessons" className="flex gap-2">
        {specialty && <input type="hidden" name="specialty" value={specialty} />}
        <input
          name="region"
          type="search"
          defaultValue={region ?? ''}
          placeholder="지역(예: 서울 강남)"
          className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-ink focus:border-sky focus:outline-none"
        />
        <input
          name="q"
          type="search"
          defaultValue={q ?? ''}
          placeholder="코치 · 레슨장 이름"
          className="min-h-11 flex-1 rounded-xl border border-line bg-surface px-4 text-sm text-ink focus:border-sky focus:outline-none"
        />
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-sky px-4 text-sm font-semibold text-white"
        >
          찾기
        </button>
      </form>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 md:mx-0 md:px-0">
        {chip(href({ region, q }), !specialty, '전체')}
        {SPECIALTIES.map((s) =>
          chip(href({ region, q, specialty: s.key }), specialty === s.key, s.label)
        )}
      </div>

      {coaches.length === 0 ? (
        <EmptyState
          icon={<RoundLesson />}
          title="아직 공개한 코치가 없어요"
          description="레슨장 계정이 설정에서 프로필을 공개하면 여기 보여요. 코치라면 레슨장으로 가입해 주세요."
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {coaches.map((c) => (
            <Link
              key={c.id}
              href={`/lessons/${c.id}`}
              className="block rounded-2xl border border-line bg-surface p-4 transition-colors hover:border-sky-soft"
            >
              <div className="flex items-start gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-sky/12 text-base font-bold text-sky-strong">
                  {c.coach.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-bold text-ink">{c.name}</span>
                    <span className="text-xs text-muted">{c.coach} 코치</span>
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {[c.region, c.career].filter(Boolean).join(' · ')}
                  </p>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {c.specialties.map((s) => (
                      <Badge key={s}>{specialtyLabel(s)}</Badge>
                    ))}
                  </p>
                </div>
              </div>
              {c.intro && (
                <p className="mt-3 line-clamp-2 text-sm text-ink">{c.intro}</p>
              )}
              <p className="mt-3 flex items-center gap-3 text-xs text-muted">
                <span className="font-semibold text-ink">
                  {c.priceFrom != null ? `${formatPrice(c.priceFrom)}~` : '가격 문의'}
                </span>
                {c.hours && <span>{c.hours}</span>}
                <span className="ml-auto inline-flex items-center gap-1">
                  <RoundStar className="h-3.5 w-3.5" /> {c.rating ?? '-'} ({c.reviews})
                </span>
                <span>회원 {c.members}</span>
              </p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
