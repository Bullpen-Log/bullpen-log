'use client';

import { useState, type CSSProperties, type MouseEvent } from 'react';
import {
  Check,
  ChevronDown,
  Circle,
  Minus,
  Plus,
  RefreshCw,
  Replace,
  Trash2,
} from 'lucide-react';
import {
  DIET_STYLES,
  MEAL_PATTERNS,
  SEASON_PHASES,
  type DietPrefs,
} from '@/lib/nutrition/diet-prefs';
import {
  PLAN_PLACES,
  amountStep,
  planMacros,
  type PlanContext,
  type PlanItem,
  type ThrowKind,
} from '@/lib/nutrition/meal-plan';
import type { Place } from '@/lib/nutrition/meal-templates';
import { amountText, kcalText, scaleMacros, type MealKey } from '@/lib/nutrition/meta';
import type { Targets } from '@/lib/nutrition/targets';
import { EASE } from './shared';

/**
 * 식단 짜기의 화면 부품(lib/nutrition/meal-plan.ts).
 *
 *   PlanCard      '오늘 식단' 카드 — 짜기 전엔 그날 환경(훈련 장소 · 더운 날 야외)을 고르고 [식단 짜기], 짠 뒤엔 남은 계획의 합 ·
 *                 [다른 식단으로] · 까닭(접힘). 짜는 것은 오늘만, 지난 날의 계획은 보기만.
 *   PlanBlock     끼니 칸 안의 계획 줄들 — 흐린 줄, 동그라미를 누르면 먹은 기록이 된다(끼니째 '모두 먹었어요').
 *   PlanEditRow   끼니 편집에서 계획 줄 — 양 −/+ · 빼기(먹은 기록과 같은 '완료'에 저장).
 *
 * 계획은 먹은 기록과 따로다 — 먹기 전에는 먹은 칼로리 · 체중 흐름 판정에 안 들어간다(사용자 결정 2026-10-01).
 */

export type PlanEdit = { key: string; amount?: number; remove?: boolean };

const THROW_WORD: Record<NonNullable<ThrowKind>, string> = {
  eve: '내일 등판',
  today: '오늘 던지는 날',
  after: '던진 뒤',
};

const label = <K extends string>(
  list: readonly { key: K; label: string }[],
  key: K | null
) => list.find((x) => x.key === key)?.label;

/* 칩 — 휴대폰은 알약, PC 는 네모(목표 창의 칩과 같은 모양) */
const CHIP =
  'inline-flex min-h-10 items-center gap-1.5 rounded-full border border-transparent bg-ink/6 px-3.5 text-sm text-ink/80 transition-colors aria-pressed:border-sky aria-pressed:bg-sky/10 aria-pressed:font-semibold aria-pressed:text-sky desk:min-h-9 desk:rounded-lg desk:border-line desk:bg-surface-2 desk:px-3 desk:text-xs desk:text-muted desk:hover:border-sky-soft desk:hover:text-ink desk:aria-pressed:font-medium';

export function PlanCard({
  isToday,
  targets,
  prefs,
  signals,
  context,
  items,
  pending,
  onMake,
  onClear,
  onOpenPrefs,
}: {
  isToday: boolean;
  targets: Targets;
  prefs: DietPrefs;
  signals: {
    throwKind: ThrowKind;
    appetite: number | null;
    soreness: number | null;
  } | null;
  /** 짜 둔 계획의 조건 — 없으면 아직 안 짰다 */
  context: PlanContext | null;
  items: PlanItem[];
  pending: boolean;
  onMake: (options: { place: Place; hot: boolean; variant: number }) => void;
  onClear: () => void;
  onOpenPrefs: (e: MouseEvent<HTMLElement>) => void;
}) {
  const [place, setPlace] = useState<Place>(context?.place ?? 'home');
  const [hot, setHot] = useState(context?.hot ?? false);
  const [open, setOpen] = useState(false);
  const left = items.filter((i) => !i.done);
  const has = context !== null && items.length > 0;
  const total = planMacros(items);

  /* 지난 날에 짠 계획이 없으면 아무것도 안 보인다(짜는 것은 오늘만) */
  if (!isToday && !has) return null;

  /* 오늘 상태 — 식단 짜기가 무엇을 보고 짜는지(취향은 목표 창의 '식단 취향') */
  const state = [
    signals?.throwKind ? THROW_WORD[signals.throwKind] : null,
    signals?.appetite != null && signals.appetite <= 2 ? '입맛 없음' : null,
    signals?.soreness != null && signals.soreness >= 4 ? '근육통 많음' : null,
    label(SEASON_PHASES, prefs.seasonPhase),
    label(DIET_STYLES, prefs.dietStyle),
    label(MEAL_PATTERNS, prefs.mealPattern),
  ].filter(Boolean);

  const envChips = (
    <div className="space-y-2">
      <p className="text-xs font-medium text-muted">오늘 훈련 장소</p>
      <div role="group" aria-label="오늘 훈련 장소" className="flex flex-wrap gap-2">
        {PLAN_PLACES.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={place === p.key}
            onClick={() => setPlace(p.key)}
            className={CHIP}
          >
            {p.label}
          </button>
        ))}
        <button
          type="button"
          aria-pressed={hot}
          onClick={() => setHot((h) => !h)}
          className={CHIP}
        >
          {hot && <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.6} />}
          더운 날 야외
        </button>
      </div>
    </div>
  );

  /* ── 아직 안 짰다 ── */
  if (!has) {
    return (
      <section
        aria-labelledby="plan-card-title"
        className="motion-safe:animate-fade-in space-y-3 rounded-2xl border border-line bg-surface p-(--block-pad)"
      >
        <div>
          <div>
            <h2 id="plan-card-title" className="text-sm font-bold text-ink">
              오늘 식단 짜기
            </h2>
            <p className="text-xs leading-relaxed text-muted">
              {kcalText(targets.kcal)}kcal · 단백질 {targets.protein}g에 맞춰, 오늘
              상태와 취향대로 짜요.
            </p>
          </div>
        </div>
        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted">
          {state.join(' · ')}
          <button
            type="button"
            onClick={onOpenPrefs}
            className="-my-2 inline-flex min-h-10 items-center rounded-md px-1 font-semibold text-sky-strong underline-offset-2 hover:underline"
          >
            취향 바꾸기
          </button>
        </p>
        {envChips}
        <button
          type="button"
          disabled={pending}
          onClick={() => onMake({ place, hot, variant: 0 })}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-sky px-5 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60 desk:w-auto desk:rounded-xl"
        >
          {pending ? '짜는 중…' : '식단 짜기'}
        </button>
      </section>
    );
  }

  /* ── 짜 둔 계획 ── */
  const childNote =
    targets.ageBand !== 'adult' && total.protein > (context.target.protein || 1) * 1.3;
  return (
    <section
      aria-labelledby="plan-card-title"
      className="motion-safe:animate-fade-in space-y-2 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <h2 id="plan-card-title" className="text-sm font-bold text-ink">
            오늘 식단
          </h2>
          <p className="text-xs tabular-nums text-muted">
            {left.length > 0 ? (
              <>
                남은 계획 {kcalText(total.kcal)}kcal · 단백질{' '}
                {Math.round(total.protein)}g · {left.length}가지
              </>
            ) : (
              '계획한 것을 다 먹었어요'
            )}
          </p>
        </div>
        {isToday && (
          <button
            type="button"
            disabled={pending}
            onClick={() => onMake({ place, hot, variant: context.variant + 1 })}
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-sky transition-colors hover:bg-sky-tint disabled:opacity-60"
          >
            <RefreshCw
              aria-hidden
              className={`h-3.5 w-3.5 ${pending ? 'motion-safe:animate-spin' : ''}`}
            />
            다른 식단으로
          </button>
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="plan-card-more"
          aria-label={open ? '까닭 · 조건 접기' : '까닭 · 조건 보기'}
          className="-mr-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <ChevronDown
            aria-hidden
            className={`h-4 w-4 transition-transform duration-200 ${EASE} ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* 까닭 · 조건 — 펴면(끼니 칸의 높이를 지키려고 평소엔 접어 둔다) */}
      <div
        id="plan-card-more"
        className={`grid transition-[grid-template-rows] duration-200 ${EASE} ${
          open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
        }`}
      >
        <div className="min-h-0 overflow-hidden" inert={!open}>
          <div className="space-y-3 pt-1">
            <ul className="space-y-1">
              {context.reasons.map((r) => (
                <li key={r} className="flex gap-1.5 text-xs leading-relaxed text-muted">
                  <span aria-hidden className="text-sky">
                    ·
                  </span>
                  {r}
                </li>
              ))}
              {childNote && (
                <li className="flex gap-1.5 text-xs leading-relaxed text-muted">
                  <span aria-hidden className="text-sky">
                    ·
                  </span>
                  성장기에는 단백질이 목표보다 조금 많아도 괜찮아요 — 밥 · 반찬을 골고루
                  먹는 것이 먼저예요.
                </li>
              )}
            </ul>
            {isToday && (
              <>
                {envChips}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => onMake({ place, hot, variant: context.variant })}
                    className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-sky px-4 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60 desk:rounded-xl"
                  >
                    이 조건으로 다시 짜기
                  </button>
                  <button
                    type="button"
                    onClick={onOpenPrefs}
                    className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-sky-strong transition-colors hover:bg-sky-tint desk:rounded-xl"
                  >
                    취향 바꾸기
                  </button>
                  <button
                    type="button"
                    onClick={onClear}
                    className="ml-auto inline-flex min-h-10 items-center gap-1 rounded-full px-3 text-sm font-medium text-danger transition-colors hover:bg-danger-bg desk:rounded-xl"
                  >
                    <Trash2 aria-hidden className="h-4 w-4" />
                    식단 지우기
                  </button>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  안 먹은 계획은 먹은 칼로리에 안 들어가요. 끼니 칸의 동그라미를 누르면
                  먹은 것으로 기록돼요.
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/** 끼니 칸 안의 계획 줄들 — 흐리게, 동그라미를 누르면 먹은 기록이 된다 */
export function PlanBlock({
  meal,
  items,
  onEat,
  onReplace,
}: {
  meal: MealKey;
  items: PlanItem[];
  onEat: (keys: string[]) => void;
  /** 이름(또는 오른쪽 바꾸기 아이콘)을 눌렀다 — 그 줄을 찾아 바꾸는 창 */
  onReplace: (item: PlanItem, e: MouseEvent<HTMLElement>) => void;
}) {
  const kcal = planMacros(items).kcal;
  return (
    <div className="motion-safe:animate-fade-in space-y-0.5 rounded-xl bg-sky/5 px-2 pb-1 pt-0.5">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-semibold text-sky">
          식단 · {items.length}가지 {kcalText(kcal)}kcal
        </p>
        <button
          type="button"
          onClick={() => onEat(items.map((i) => i.key))}
          aria-label={`${meal === 'snack' ? '간식' : '이 끼니'} 식단 모두 먹었어요`}
          className="-mr-1 inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-semibold text-sky transition-colors hover:bg-sky-tint"
        >
          <Check aria-hidden className="h-3.5 w-3.5" strokeWidth={2.6} />
          모두 먹었어요
        </button>
      </div>
      <ul>
        {items.map((item, i) => (
          <li
            key={item.key}
            className="motion-safe:animate-row-in flex min-h-10 items-center gap-2"
            style={{ '--row': i } as CSSProperties}
          >
            <button
              type="button"
              onClick={() => onEat([item.key])}
              aria-label={`${item.name} 먹었어요`}
              className="group -ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sky/60 transition-colors hover:text-sky motion-safe:active:scale-90"
            >
              <Circle aria-hidden className="h-5 w-5 group-hover:hidden" />
              <Check
                aria-hidden
                className="hidden h-5 w-5 group-hover:block"
                strokeWidth={2.6}
              />
            </button>
            <button
              type="button"
              onClick={(e) => onReplace(item, e)}
              aria-label={`${item.name} — 다른 음식으로 바꾸기`}
              className="-my-1 flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-sky/10"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-ink/70">
                {item.name}
                <span className="ml-1.5 text-xs text-muted">
                  {amountText(item.amount)} · {item.servingLabel}
                </span>
              </span>
              <span className="shrink-0 text-sm tabular-nums text-ink/70">
                {kcalText(item.kcal * item.amount)}
                <span className="ml-0.5 text-xs text-muted">kcal</span>
              </span>
              <Replace aria-hidden className="h-3.5 w-3.5 shrink-0 text-sky/60" />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 끼니 편집에서 계획 줄 — 양 −/+ · 빼기. 다른 끼니로 옮기기는 없다(짠 끼니의 짝이 깨진다) */
export function PlanEditRow({
  item,
  index,
  draft,
  onChange,
  onReplace,
}: {
  item: PlanItem;
  index: number;
  draft: { amount: number; remove: boolean; name: string };
  onChange: (d: { amount: number; remove: boolean; name: string }) => void;
  /** 이름을 눌렀다 — 다른 음식으로 바꾸는 창 */
  onReplace: (e: MouseEvent<HTMLElement>) => void;
}) {
  const unit = amountStep(item.sourceId);
  const move = (dir: 1 | -1) =>
    onChange({
      ...draft,
      amount: Math.max(unit, Math.round((draft.amount + dir * unit) / unit) * unit),
    });
  return (
    <li
      className="motion-safe:animate-row-in flex min-h-11 items-center gap-1.5 py-0.5"
      style={{ '--row': index } as CSSProperties}
    >
      <button
        type="button"
        onClick={onReplace}
        disabled={draft.remove}
        aria-label={`${item.name} — 다른 음식으로 바꾸기`}
        className={`-my-1 -ml-1 min-w-0 flex-1 rounded-lg px-1 py-1 text-left transition-[opacity,background-color] duration-200 hover:bg-surface-2 disabled:cursor-default disabled:hover:bg-transparent ${draft.remove ? 'opacity-45' : ''}`}
      >
        <span
          className={`block truncate text-sm text-ink/70 ${draft.remove ? 'line-through' : ''}`}
        >
          <span className="mr-1 text-xs font-semibold text-sky">식단</span>
          {item.name}
        </span>
        <span className="block truncate text-xs tabular-nums text-muted">
          {kcalText(scaleMacros(item, draft.amount).kcal)}kcal
          {!draft.remove && <span className="text-sky"> · 바꾸기</span>}
        </span>
      </button>
      {draft.remove ? (
        <button
          type="button"
          onClick={() => onChange({ ...draft, remove: false })}
          className="motion-safe:animate-fade-in inline-flex h-9 shrink-0 items-center rounded-lg px-3 text-xs font-semibold text-sky transition-colors hover:bg-sky-tint"
        >
          되살리기
        </button>
      ) : (
        <>
          <div className="flex shrink-0 items-center rounded-xl border border-line bg-surface-2">
            <button
              type="button"
              onClick={() => move(-1)}
              aria-label={`${item.name} 줄이기`}
              className="flex h-9 w-9 items-center justify-center rounded-l-xl text-muted transition-colors hover:text-ink motion-safe:active:scale-90"
            >
              <Minus aria-hidden className="h-4 w-4" />
            </button>
            <span
              key={draft.amount}
              className="motion-safe:animate-fade-in min-w-[3.25rem] text-center text-xs font-semibold tabular-nums text-ink"
            >
              {amountText(draft.amount)}
            </span>
            <button
              type="button"
              onClick={() => move(1)}
              aria-label={`${item.name} 늘리기`}
              className="flex h-9 w-9 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-ink motion-safe:active:scale-90"
            >
              <Plus aria-hidden className="h-4 w-4" />
            </button>
          </div>
          <button
            type="button"
            onClick={() => onChange({ ...draft, remove: true })}
            aria-label={`${item.name} 식단에서 빼기`}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-muted transition-colors hover:bg-danger-bg hover:text-danger"
          >
            <Trash2 aria-hidden className="h-4 w-4" />
          </button>
        </>
      )}
    </li>
  );
}
