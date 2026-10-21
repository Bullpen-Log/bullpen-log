import Link from 'next/link';
import { ArrowRight } from '@/components/icon';
import { Card } from '@/components/ui';
import {
  AGE_GROUPS,
  POSITIONS,
  isAgeKey,
  isPositionKey,
  recommend,
  shopSearchUrl,
} from '@/lib/market/gear';
import { filterHref } from '@/lib/market/specs';

type SP = { [key: string]: string | string[] | undefined };
const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';

/** 장비 고르기(5판) — 나이대 · 포지션 · 손을 고르면 권하는 규격 다섯과 바깥 구매 검색, 그리고 같은 규격의 중고 */
export default async function GearPage({
  searchParams,
}: {
  searchParams: Promise<SP>;
}) {
  const sp = await searchParams;
  const rawAge = one(sp.age);
  const rawPos = one(sp.position);
  const age = isAgeKey(rawAge) ? rawAge : null;
  const position = isPositionKey(rawPos) ? rawPos : null;
  const hand = one(sp.hand) === 'L' ? 'L' : 'R';
  const picks = age && position ? recommend(age, position, hand) : null;
  const sel = (on: boolean) =>
    `inline-flex min-h-10 cursor-pointer items-center rounded-full px-4 text-sm font-semibold ${on ? 'bg-sky text-white' : 'border border-line bg-surface text-ink'}`;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-black text-ink">장비 고르기</h1>
        <p className="mt-1 text-sm text-muted">
          처음 시작하는 선수와 학부모에게 — 셋만 고르면 무엇을 어떤 규격으로 사야 하는지
          알려 드려요.
        </p>
      </div>
      <form method="get" action="/gear" className="space-y-4">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted">나이대</legend>
          <div className="flex flex-wrap gap-2">
            {AGE_GROUPS.map((a) => (
              <label key={a.key} className={sel(age === a.key)}>
                <input
                  type="radio"
                  name="age"
                  value={a.key}
                  defaultChecked={age === a.key}
                  className="sr-only"
                />
                {a.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted">포지션</legend>
          <div className="flex flex-wrap gap-2">
            {POSITIONS.map((p) => (
              <label key={p.key} className={sel(position === p.key)}>
                <input
                  type="radio"
                  name="position"
                  value={p.key}
                  defaultChecked={position === p.key}
                  className="sr-only"
                />
                {p.label}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-muted">던지는 손</legend>
          <div className="flex flex-wrap gap-2">
            <label className={sel(hand === 'R')}>
              <input
                type="radio"
                name="hand"
                value="R"
                defaultChecked={hand === 'R'}
                className="sr-only"
              />{' '}
              우투
            </label>
            <label className={sel(hand === 'L')}>
              <input
                type="radio"
                name="hand"
                value="L"
                defaultChecked={hand === 'L'}
                className="sr-only"
              />{' '}
              좌투
            </label>
          </div>
        </fieldset>
        <button
          type="submit"
          className="min-h-11 rounded-xl bg-sky px-5 text-sm font-semibold text-white"
        >
          추천 보기
        </button>
      </form>

      {picks && (
        <section className="space-y-3">
          <h2 className="text-lg font-bold text-ink">이렇게 사면 돼요</h2>
          <Card className="divide-y divide-line p-0">
            {picks.map((g) => (
              <div key={g.item} className="space-y-1 px-4 py-3">
                <p className="text-sm font-bold text-ink">{g.item}</p>
                <p className="text-sm text-ink">{g.spec}</p>
                <p className="text-xs text-muted">{g.why}</p>
                <p className="flex flex-wrap gap-3 pt-1 text-xs font-semibold">
                  <Link
                    href={filterHref({
                      q: g.item === '글러브' ? '글러브' : g.item.split(' ')[0],
                    })}
                    className="inline-flex items-center gap-0.5 text-sky"
                  >
                    덕아웃 중고 보기 <ArrowRight className="h-3 w-3" />
                  </Link>
                  <a
                    href={shopSearchUrl(g.query)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-0.5 text-muted hover:text-ink"
                  >
                    새 상품 검색 <ArrowRight className="h-3 w-3" />
                  </a>
                </p>
              </div>
            ))}
          </Card>
          <p className="text-xs text-muted">
            새 상품 링크는 바깥 쇼핑몰 검색이에요. 제휴가 되면 같은 자리에서 바로 살 수
            있게 바뀌어요.
          </p>
        </section>
      )}
    </div>
  );
}
