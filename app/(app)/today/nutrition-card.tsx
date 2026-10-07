import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { Card } from '@/components/ui';
import { NAV_ICONS } from '@/components/nav-icons';
import { LinkPending } from '@/components/link-pending';
import type { DayDetailUser } from '@/lib/day-detail';
import type { Advice } from '@/lib/nutrition/advice';
import { loadAdvice } from '@/lib/nutrition/advice-load';
import { serviceHour } from '@/lib/nutrition/advice-input';

/**
 * 홈 '오늘 영양' — 링 바로 밑. 할 일 한 줄 · 탄 · 단 · 지 더 먹을 양 · 균형 점수, 그게 전부다.
 *
 * 사용자(2026-10-07): "홈은 간단한 관리를 모두 끝낼 수 있게, 탭은 세부 관리 … 쓸데없는 설명 없이 아이폰 iOS 같은
 * 인터페이스". 그래서 설명 글 · 까닭 · 범위 표는 여기 없다(영양 탭 맨 위에 있다). 음식을 안 적은 날도 체크인의 식사 칸 ·
 * 던지는 일정 · 오늘 한 운동으로 할 일을 말하고, 아무것도 없는 날은 오늘 권하는 양을 범위로 보인다. 누르면 영양 탭.
 *
 * 숫자는 처음 보일 때 0 에서 차오른다(globals.css 'count-up' — CSS 만, 글자는 sr-only 로 그대로).
 */
export async function NutritionCard({
  user,
  today,
}: {
  user: DayDetailUser;
  /** 오늘 'YYYY-MM-DD'(한국 시각) */
  today: string;
}) {
  const advice = await loadAdvice(user, today, today, serviceHour(now()));
  return <NutritionCardView advice={advice} />;
}

/** 렌더 중에 현재 시각을 직접 읽지 않도록 함수로 감싼다(홈 page.tsx 와 같다) */
function now() {
  return new Date();
}

type Column =
  | { key: string; label: string; kind: 'more'; value: number; estimate: boolean }
  | { key: string; label: string; kind: 'enough' }
  | { key: string; label: string; kind: 'range'; lo: number; hi: number };

const MACROS = [
  ['carbs', '탄수화물'],
  ['protein', '단백질'],
  ['fat', '지방'],
] as const;

/** 세 칸 — 더 먹을 양(기록 · 어림) · 충분 · 아무 자료도 없으면 오늘 권하는 범위 */
function columns(a: Advice): Column[] {
  return MACROS.map(([key, label]) => {
    if (a.more) {
      const value = a.more[key];
      return value <= 0
        ? { key, label, kind: 'enough' }
        : { key, label, kind: 'more', value, estimate: a.more.basis === 'estimate' };
    }
    return { key, label, kind: 'range', lo: a.range[key].lo, hi: a.range[key].hi };
  });
}

/** 그리기만 — 숫자는 NutritionCard 가 모은다(미리보기 · 시험이 따로 부른다) */
export function NutritionCardView({ advice }: { advice: Advice }) {
  const cols = columns(advice);
  const Utensils = NAV_ICONS.utensils;
  const summary = cols
    .map((c) =>
      c.kind === 'enough'
        ? `${c.label} 충분`
        : c.kind === 'more'
          ? `${c.label} ${c.estimate ? '약 ' : ''}${c.value}g 더`
          : `${c.label} ${c.lo}~${c.hi}g`
    )
    .join(', ');
  return (
    <Card className="p-0">
      <Link
        href="/nutrition"
        className="block rounded-2xl p-(--block-pad) transition-opacity hover:opacity-80"
        aria-label={`영양. ${advice.headline ?? ''}. ${summary}${advice.score !== null ? `. 균형 ${advice.score}점` : ''}`}
      >
        <div className="flex items-center gap-1.5">
          <Utensils aria-hidden className="h-4 w-4 text-sky" strokeWidth={2.25} />
          <span className="text-[15px] font-semibold text-sky">영양</span>
          <span className="ml-auto flex items-center gap-1 text-[13px] text-muted tabular-nums">
            {advice.score !== null && (
              <>
                균형 <span className="font-semibold text-ink">{advice.score}</span>
              </>
            )}
            <LinkPending className="h-4 w-4 text-line-strong">
              <ChevronRight aria-hidden className="h-4 w-4 text-line-strong" />
            </LinkPending>
          </span>
        </div>

        {advice.headline && (
          <p
            className={`mt-2 text-[17px] leading-snug font-semibold break-keep ${
              advice.highlight ? 'text-sky-strong' : 'text-ink'
            }`}
          >
            {advice.headline}
          </p>
        )}

        <dl className="mt-3 grid grid-cols-3 gap-3 border-t border-line pt-3">
          {cols.map((c) => (
            <div key={c.key} className="min-w-0">
              <dt className="text-xs text-muted">{c.label}</dt>
              <dd className="mt-0.5 flex items-baseline gap-0.5 leading-none tabular-nums">
                {c.kind === 'enough' ? (
                  <span className="text-[22px] font-semibold text-sky">충분</span>
                ) : c.kind === 'more' ? (
                  <>
                    <span className="text-[15px] font-medium text-muted">
                      {c.estimate ? '약 +' : '+'}
                    </span>
                    <CountUp
                      value={c.value}
                      className="text-[22px] font-semibold text-ink"
                    />
                    <span className="text-[15px] font-medium text-muted">g</span>
                  </>
                ) : (
                  <>
                    <span className="text-[17px] font-semibold text-ink">
                      {c.lo}~{c.hi}
                    </span>
                    <span className="text-[13px] font-medium text-muted">g</span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </Link>
    </Card>
  );
}

/**
 * 0 에서 차오르는 숫자 — CSS 만(globals.css 'count-up': @property 정수 + counter). 글자 자체는 sr-only 로 그대로 있어
 * 화면 읽기 · 복사 · 움직임 줄이기에서는 그냥 숫자다. @property 가 없는 옛 브라우저는 바로 끝 값을 그린다.
 */
function CountUp({ value, className }: { value: number; className?: string }) {
  return (
    <span className={className}>
      <span className="sr-only">{value}</span>
      <span
        aria-hidden
        className="count-up"
        style={{ '--n': value } as CSSProperties}
      />
    </span>
  );
}
