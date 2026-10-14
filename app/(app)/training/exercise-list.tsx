'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { ChevronDown, Play, X } from '@/components/icon';
import { setExerciseDone } from '@/app/actions/exercise-log';
import { CHECK_CONNECTION } from '@/lib/offline';
import { removeFromTodayPlan } from '@/app/actions/plan-edit';
import { SLOT_LABELS, SLOT_ORDER, type SlotKey } from '@/lib/report/theme';
import { formatAmount } from '@/lib/exercise-meta';
import { useWeightUnit } from '@/components/use-units';
import type { PastAmount } from '@/lib/report/exercise-recent';
import { CategoryBadge } from '@/components/category-badge';
import { FavoriteButton } from '@/components/favorite-button';
import { SWIPE_ACTION, SwipeRow } from '@/components/swipe-row';
import { toggleExerciseFavorite } from '@/app/actions/favorite';
import { LibraryVideo } from '@/components/library-video';
import { CheckRow } from './check-row';

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
  /** 우리 저장소에 올린 영상 경로 — 참고 영상이면 없다 */
  videoPath: string | null;
  /** 참고 영상의 유튜브 영상 ID */
  referenceVideoId: string | null;
  /** 영상의 가로 ÷ 세로 — 없으면 가로(16:9)로 본다 */
  aspectRatio: number | null;
  done: boolean;
  /** 세션 안에서 이 운동이 놓이는 구간 (워밍업·본운동·코어·암케어) */
  slot: SlotKey;
  /** 사용자가 직접 더한 운동인가 */
  manual: boolean;
  /** 지금 몸 상태 기준으로는 권하지 않는 운동인가 */
  unsafe: boolean;
  /**
   * 왜 이 운동을 골랐는지 한 줄(트레이닝 추천 2판 P5-k — lib/report/score.ts pickReasonLineOf). 오늘 상태로 앞에 당긴 운동에만 있고,
   * 직접 넣은 것 · 권하지 않는 것 · 이유가 없는 것은 null 이라 줄이 안 나온다.
   */
  reason: string | null;
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

const OFFLINE = `저장하지 못했어요. ${CHECK_CONNECTION}`;

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
  dateKey,
  children,
}: {
  exercises: TodayExercise[];
  /**
   * 이 목록의 날(YYYY-MM-DD). 체크를 이 날에 남긴다 — 밤 11시 58분에 연 목록을 자정
   * 넘어 체크하면 다음 날 기록으로 들어갔다(2026-09-27 검토, 암케어 목록과 같은 까닭).
   */
  dateKey: string;
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
      /* 신호가 끊겨 못 보냈으면 되돌리고 알린다 — 오류가 화면 전체로 번지지 않게 */
      try {
        const res = await removeFromTodayPlan(id);
        if ('error' in res) {
          setItems(before);
          setError(res.error);
        }
      } catch (err) {
        unstable_rethrow(err);
        setItems(before);
        setError(OFFLINE);
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

    const undo = (message: string) => {
      setItems((prev) => prev.map((e) => (e.id === id ? { ...e, done: !next } : e)));
      setError(message);
    };
    startTransition(async () => {
      try {
        const res = await setExerciseDone(id, next, dateKey);
        if ('error' in res) undo(res.error);
      } catch (err) {
        unstable_rethrow(err);
        undo(OFFLINE);
      }
    });
  };

  return (
    <div className="space-y-3">
      {/* 진행 상황 */}
      <div className="rounded-2xl border border-line bg-surface p-(--block-pad)">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-sm font-bold text-ink">
            오늘 <span className="text-numeric text-lg">{doneCount}</span>
            <span className="text-muted">/{items.length}</span> 완료
          </p>
          {allDone && (
            <span className="text-sm font-semibold text-sky">전부 마쳤어요 👏</span>
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
            마친 운동은 눌러서 표시해주세요. 표시해야 운동 부하에 들어가고 다음 일정에서
            같은 부위가 겹치지 않아요.
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
 * 운동 줄의 밑 한 줄 — 지난번 기록과 영상 단추를 한 줄에(2026-10-12 사용자: "운동 목록을 보기 간편하게").
 * 예전에는 '영상 보기' 줄과 '지난번' 줄이 따로 있어 운동 하나가 세 층이었다. 영상은 누를 때만 받는다(LibraryVideo).
 */
function RowFooter({ ex }: { ex: TodayExercise }) {
  const [open, setOpen] = useState(false);
  /* 무게는 고른 단위로(설정 → 단위). 기록은 kg 그대로다. */
  const unit = useWeightUnit();
  const last = ex.past[0];
  const text = last ? formatAmount(last, unit) : null;
  const hasVideo = Boolean(ex.videoPath || ex.referenceVideoId);
  if (!text && !hasVideo) return null;
  return (
    <div className="border-t border-line">
      <div className="flex min-h-10 items-center gap-2 pr-1.5 pl-4 text-xs">
        {text ? (
          <span className="min-w-0 flex-1 truncate">
            <span className="text-muted">지난번 {shortDate(last.date)}</span>
            <span className="mx-1.5 text-line-strong">·</span>
            <span className="font-semibold text-ink/75">{text}</span>
          </span>
        ) : (
          <span className="flex-1" />
        )}
        {hasVideo && (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${ex.title} 영상 ${open ? '접기' : '보기'}`}
            className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-full px-3 font-semibold text-sky-strong transition-colors hover:bg-sky/10"
          >
            {open ? <ChevronDown aria-hidden className="h-3.5 w-3.5 rotate-180" /> : <Play aria-hidden className="h-3.5 w-3.5" />}
            {open ? '접기' : '영상'}
          </button>
        )}
      </div>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          <LibraryVideo
            path={ex.videoPath}
            referenceVideoId={ex.referenceVideoId}
            title={ex.title}
            thumbUrl={ex.thumbUrl}
            aspectRatio={ex.aspectRatio}
          />
          {ex.description && (
            <p className="whitespace-pre-wrap break-keep text-sm leading-relaxed text-ink/85">
              {ex.description}
            </p>
          )}
        </div>
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
            {/*
              휴대폰은 줄을 왼쪽으로 밀면 [즐겨찾기 | 빼기]가 나온다(아이폰 메일처럼, components/swipe-row.tsx — 2026-10-04
              '앱 느낌' 4단계). 예전엔 옆에 테두리 상자 칸이 붙어 운동 이름 자리를 빼앗았다. PC 는 옆 칸 그대로(밑).
            */}
            <SwipeRow
              className="min-w-0 flex-1 rounded-2xl"
              actionWidth={152}
              actions={
                <>
                  <FavoriteButton
                    variant="swipe"
                    className={`${SWIPE_ACTION} bg-[#ff9500]`}
                    favorite={ex.favorite}
                    label={ex.title}
                    onToggle={() => toggleExerciseFavorite(ex.id)}
                  />
                  <button
                    type="button"
                    onClick={() => onRemove(ex.id)}
                    aria-label={`${ex.title} 목록에서 빼기`}
                    className={`${SWIPE_ACTION} bg-[#ff3b30]`}
                  >
                    <X aria-hidden className="h-5 w-5" />
                    빼기
                  </button>
                </>
              }
            >
              <div
                className={`flex min-w-0 flex-col rounded-2xl border transition-colors ${
                  ex.done ? 'border-sky bg-sky-tint' : 'border-line bg-surface'
                }`}
              >
                {/*
                줄 어디를 눌러도 체크된다(check-row.tsx). 부위 칩만 따로 눌려 전신 3D 를
                띄운다(2026-09-26 사용자분, components/body-parts.tsx).

                경고는 직접 넣었는데 오늘 몸 상태에는 무리인 운동에 붙는다. 빼지 않고
                알리기만 한다 — 넣은 것은 본인이다.
              */}
                <CheckRow
                  done={ex.done}
                  onToggle={() => onToggle(ex.id)}
                  title={ex.title}
                  className="w-full rounded-2xl"
                  badges={
                    <>
                      <CategoryBadge name={ex.category} />
                      {/* 참고 영상인지는 밑의 '참고 영상 보기' 단추가 알린다(ExerciseVideo) */}
                      {ex.manual && (
                        <span className="text-[10px] font-medium text-muted">
                          직접 넣음
                        </span>
                      )}
                    </>
                  }
                  prescription={ex.prescription}
                  note={ex.reason}
                  warning={ex.unsafe ? '오늘 몸 상태에는 권하지 않는 운동이에요' : null}
                  thumbUrl={ex.thumbUrl}
                  thumbClassName="h-14 w-20 sm:h-16 sm:w-24"
                />

                <RowFooter ex={ex} />
              </div>
            </SwipeRow>

            {/*
              별과 빼기를 한 칸에 위아래로 쌓는다.

              별을 달고 싶어지는 순간은 대개 해보고 난 직후다 — 그 자리가
              여기다. 다만 폰에서 가로로 늘어놓으면 운동 이름이 들어갈 자리가
              없어져서, 이미 있던 빼기 단추 칸을 둘로 나눠 쓴다.
            */}
            <span className="hidden shrink-0 flex-col overflow-hidden rounded-2xl border border-line desk:flex">
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
