'use client';

import { useState, useTransition } from 'react';
import { AlertTriangle, Check, ChevronDown, History, X } from 'lucide-react';
import { setExerciseDone } from '@/app/actions/exercise-log';
import { removeFromTodayPlan } from '@/app/actions/plan-edit';
import { SLOT_LABELS, SLOT_ORDER, type SlotKey } from '@/lib/report/theme';
import { formatAmount } from '@/lib/exercise-meta';
import type { PastAmount } from '@/lib/report/exercise-recent';
import { ExerciseBadges } from '@/components/meta-badges';
import { CategoryBadge } from '@/components/category-badge';
import { FavoriteButton } from '@/components/favorite-button';
import { toggleExerciseFavorite } from '@/app/actions/favorite';

export type TodayExercise = {
  id: string;
  title: string;
  category: string;
  description: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
  /** '3세트 × 10회 · 세트 사이 45초 휴식' — 아직 안 채운 운동은 null */
  prescription: string | null;
  thumbUrl: string | null;
  /** 아직 촬영 전이라 유튜브 참고 영상으로 대신하고 있는가 */
  isReference: boolean;
  done: boolean;
  /** 세션 안에서 이 운동이 놓이는 구간 (워밍업·본운동·코어·암케어) */
  slot: SlotKey;
  /** 사용자가 직접 더한 운동인가 */
  manual: boolean;
  /** 지금 몸 상태 기준으로는 권하지 않는 운동인가 */
  unsafe: boolean;
  /** 이 사람이 별을 달아 뒀는가 */
  favorite: boolean;
  /**
   * 이 운동이 시간형(버티기)인가.
   *
   * 횟수를 적을지 초를 적을지가 달라진다. 30초 플랭크에 "몇 회 했나요"를
   * 물으면 답할 수가 없다.
   */
  isHold: boolean;
  /**
   * 이 운동을 지난번에 얼마나 했는가. 최근 것이 앞에 온다.
   *
   * 무게를 올릴지 횟수를 늘릴지는 지난번 숫자를 봐야 정할 수 있는데, 그것을
   * 보려고 기록 화면까지 넘어가게 하면 아무도 안 본다. 처음 하는 운동이면
   * 빈 목록이고, 그때는 줄 자체가 안 나온다.
   */
  past: PastAmount[];
};

/**
 * 오늘 할 운동 목록. 누르면 바로 완료로 표시된다.
 *
 * 저장이 끝나기 전에 화면을 먼저 바꿔 손맛을 살리고,
 * 실패하면 원래대로 되돌리며 이유를 알린다.
 *
 * 세트·횟수·무게는 여기서 적지 않는다. 실시간 운동(/workout/run)에서 세트를
 * 남길 때마다 들어가고, 운동을 마치면 그 값이 그대로 기록이 된다. 여기 체크는
 * '했다'만 뜻한다 — 앱 없이 한 운동이나 깜빡한 날을 나중에 표시하는 자리다.
 */
export function ExerciseChecklist({
  exercises,
  children,
}: {
  exercises: TodayExercise[];
  /** 목록 아래에 붙는 '운동 추가' 단추 */
  children?: React.ReactNode;
}) {
  const [items, setItems] = useState(exercises);
  const [error, setError] = useState<string>();
  const [, startTransition] = useTransition();

  /*
   * 화면이 새로 그려지기 전에는 부모가 준 목록이 그대로라, 여기서 지운 것을
   * 기억해 두고 화면에서만 먼저 뺀다. 누르고 나서 한참 그대로 있으면
   * 안 눌린 줄 알고 또 누르게 된다.
   */
  const remove = (id: string) => {
    const before = items;
    setItems((prev) => prev.filter((e) => e.id !== id));
    setError(undefined);
    startTransition(async () => {
      const res = await removeFromTodayPlan(id);
      if ('error' in res) {
        setItems(before);
        setError(res.error);
      }
    });
  };

  /*
   * 부모가 새 목록을 주면(운동을 더했거나 일정을 다시 만들었을 때) 그것을 따른다.
   * 안 그러면 방금 더한 운동이 목록에 안 나타난다.
   */
  const [seen, setSeen] = useState(exercises);
  if (seen !== exercises) {
    setSeen(exercises);
    setItems(exercises);
  }

  const doneCount = items.filter((e) => e.done).length;
  const allDone = items.length > 0 && doneCount === items.length;

  const toggle = (id: string) => {
    const target = items.find((e) => e.id === id);
    if (!target) return;
    const next = !target.done;

    setItems((prev) => prev.map((e) => (e.id === id ? { ...e, done: next } : e)));
    setError(undefined);

    startTransition(async () => {
      const res = await setExerciseDone(id, next);
      if ('error' in res) {
        setItems((prev) => prev.map((e) => (e.id === id ? { ...e, done: !next } : e)));
        setError(res.error);
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* 진행 상황 */}
      <div className="rounded-2xl border border-line bg-surface px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-ink">
            오늘 <span className="text-display text-lg">{doneCount}</span>
            <span className="text-muted">/{items.length}</span> 완료
          </p>
          {allDone && (
            <span className="text-sm font-semibold text-sky">전부 마쳤습니다 👏</span>
          )}
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-sky transition-[width] duration-300"
            style={{ width: `${items.length ? (doneCount / items.length) * 100 : 0}%` }}
          />
        </div>

        {/*
          체크가 왜 중요한지 밝힌다.

          이 앱의 여러 규칙이 '완료 체크된 것'에만 매달려 있다 — 운동 부하 지수,
          같은 운동을 사흘 뒤로 미루는 것, 하체와 상체를 번갈아 가는 것까지.
          그런데 정작 화면에는 그 말이 없었다. 운동은 했는데 체크를 깜빡하면
          앱은 안 한 것으로 보고, 다음 날 또 같은 부위를 내준다.

          아직 하나도 안 눌렀을 때만 말한다. 다 하고 나서까지 잔소리할 일이 아니다.
        */}
        {doneCount === 0 && items.length > 0 && (
          <p className="mt-3 text-[11px] leading-relaxed text-muted">
            마친 운동은 눌러서 표시해주세요. 이 표시로 <b>운동 부하</b>를 재고, 다음
            일정에서 <b>같은 부위가 겹치지 않게</b> 고릅니다 — 표시가 없으면 앱은 안 한
            것으로 봅니다.
          </p>
        )}
      </div>

      {error && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      {/*
        구간별로 나눠 보여준다: 워밍업 → 본운동 → 코어 → 암케어.
        순서 없이 한 줄로 늘어놓으면 스트레칭과 무게 드는 운동이 섞여
        뭘 먼저 할지 알 수 없다. 해당 운동이 없는 구간은 제목도 내지 않는다.
      */}
      {SLOT_ORDER.map((slot) => {
        const group = items.filter((ex) => ex.slot === slot);
        if (group.length === 0) return null;
        const { label, hint } = SLOT_LABELS[slot];

        return (
          <section key={slot} className="space-y-2.5">
            <div className="flex flex-wrap items-baseline gap-x-2 px-1">
              <h2 className="text-heading text-[15px] text-ink">{label}</h2>
              <span className="text-xs text-muted">{hint}</span>
            </div>
            <ExerciseList items={group} onToggle={toggle} onRemove={remove} />
          </section>
        );
      })}

      {children}
    </div>
  );
}

/** '2026-08-24' → '8/24' */
function shortDate(key: string): string {
  const [, month, day] = key.split('-');
  return `${Number(month)}/${Number(day)}`;
}

/**
 * 지난번에 얼마나 했는지 보여주는 줄.
 *
 * 무게를 올릴지 횟수를 늘릴지는 지난번 숫자를 봐야 정할 수 있다. 기록 화면까지
 * 넘어가서 찾아보게 하면 아무도 안 보므로, 오늘 할 운동에 그대로 붙여 둔다.
 *
 * 완료 단추 안에 넣을 수는 없다(단추 안의 단추). 같은 테두리 안에 아래 줄로
 * 붙여 한 덩어리로 보이게 한다.
 */
function PastRecord({ title, past }: { title: string; past: PastAmount[] }) {
  const [open, setOpen] = useState(false);

  const last = past[0];
  const text = last ? formatAmount(last) : null;
  // 숫자가 하나도 안 적힌 기록은 서버에서 이미 걸러 오지만, 여기서도 막아 둔다.
  if (!last || !text) return null;

  const line = (
    <span className="min-w-0 flex-1 truncate text-left">
      <span className="font-medium text-muted">지난번 {shortDate(last.date)}</span>
      <span className="mx-1.5 text-line-strong">·</span>
      <span className="font-semibold text-ink/75">{text}</span>
    </span>
  );

  /*
   * 한 번밖에 안 했으면 펼칠 것이 없다. 눌러도 아무 일이 없는 단추를 두면
   * 고장 난 줄 안다.
   */
  if (past.length === 1) {
    return (
      <div className="flex items-center gap-2 border-t border-line px-4 py-2.5 text-xs">
        <History aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
        {line}
      </div>
    );
  }

  return (
    <div className="border-t border-line">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${title} 지난 기록 ${open ? '접기' : '펼치기'}`}
        className="flex w-full items-center gap-2 px-4 py-2.5 text-xs transition-colors hover:bg-surface-2"
      >
        <History aria-hidden className="h-3.5 w-3.5 shrink-0 text-muted" />
        {line}
        <ChevronDown
          aria-hidden
          className={`h-3.5 w-3.5 shrink-0 text-muted transition-transform ${
            open ? 'rotate-180' : ''
          }`}
        />
      </button>

      {open && (
        <ul className="space-y-1 px-4 pb-2.5 pl-[2.1rem] text-xs">
          {past.slice(1).map((p) => {
            const t = formatAmount(p);
            if (!t) return null;
            return (
              <li key={p.date} className="flex gap-2">
                <span className="w-10 shrink-0 tabular-nums text-muted">
                  {shortDate(p.date)}
                </span>
                <span className="text-ink/70">{t}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ExerciseList({
  items,
  onToggle,
  onRemove,
}: {
  items: TodayExercise[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <ul className="space-y-2.5">
      {items.map((ex) => {
        return (
          /*
            빼기 단추를 완료 단추 안에 넣을 수는 없다(단추 안의 단추). 나란히
            두고, 완료 쪽이 남은 자리를 다 쓰게 한다.
          */
          <li key={ex.id} className="flex items-stretch gap-2">
            <div
              className={`flex min-w-0 flex-1 flex-col rounded-2xl border transition-colors ${
                ex.done ? 'border-sky bg-sky-tint' : 'border-line bg-surface'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggle(ex.id)}
                aria-pressed={ex.done}
                className={`flex w-full items-start gap-3 rounded-2xl px-4 py-4 text-left transition-colors ${
                  ex.done ? '' : 'hover:bg-surface-2'
                }`}
              >
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                    ex.done ? 'border-sky bg-sky text-white' : 'border-line-strong'
                  }`}
                >
                  {ex.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                </span>

                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span
                      className={`text-[15px] font-bold tracking-[-0.01em] break-keep ${
                        ex.done ? 'text-sky-strong' : 'text-ink'
                      }`}
                    >
                      {ex.title}
                    </span>
                    <CategoryBadge name={ex.category} />
                    {/* 출처 표시. 상자를 씌우면 카테고리 배지와 같은 무게가 되어 글자만 남긴다. */}
                    {ex.isReference && (
                      <span className="text-[10px] font-medium text-muted">
                        참고 영상
                      </span>
                    )}
                    {ex.manual && (
                      <span className="text-[10px] font-medium text-muted">
                        직접 넣음
                      </span>
                    )}
                  </span>
                  {ex.prescription && (
                    <span
                      className={`block text-xs font-semibold ${
                        ex.done ? 'text-sky-strong' : 'text-muted'
                      }`}
                    >
                      {ex.prescription}
                    </span>
                  )}
                  <ExerciseBadges
                    bodyParts={ex.bodyParts}
                    intensity={ex.intensity}
                    difficulty={ex.difficulty}
                    equipment={ex.equipment}
                  />
                  {/*
                  직접 넣었는데 오늘 몸 상태에는 무리인 운동. 빼지 않고
                  알리기만 한다 — 넣은 것은 본인이다.
                */}
                  {ex.unsafe && (
                    <span className="flex items-start gap-1.5 text-[11px] leading-relaxed text-warn">
                      <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                      오늘 몸 상태에는 권하지 않는 운동입니다
                    </span>
                  )}
                </span>

                {ex.thumbUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ex.thumbUrl}
                    alt=""
                    className="hidden h-16 w-24 shrink-0 rounded-xl object-cover ring-1 ring-line sm:block"
                  />
                )}
              </button>

              <PastRecord title={ex.title} past={ex.past} />
            </div>

            {/*
              별과 빼기를 한 칸에 위아래로 쌓는다.

              별을 달고 싶어지는 순간은 대개 해보고 난 직후다 — 그 자리가
              여기다. 다만 폰에서 가로로 늘어놓으면 운동 이름이 들어갈 자리가
              없어져서, 이미 있던 빼기 단추 칸을 둘로 나눠 쓴다.
            */}
            <span className="flex shrink-0 flex-col overflow-hidden rounded-2xl border border-line">
              <FavoriteButton
                className="flex-1 px-2.5"
                favorite={ex.favorite}
                label={ex.title}
                onToggle={() => toggleExerciseFavorite(ex.id)}
              />
              <button
                type="button"
                onClick={() => onRemove(ex.id)}
                aria-label={`${ex.title} 목록에서 빼기`}
                title="목록에서 빼기"
                className="flex-1 border-t border-line px-2.5 py-2 text-muted transition-colors hover:bg-danger-bg hover:text-danger"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          </li>
        );
      })}
    </ul>
  );
}
