'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { AlertTriangle, Search, Star, X } from 'lucide-react';
import { Segmented } from '@/components/segmented';
import { matchesSearch } from '@/lib/korean';
import {
  changeSessionExercise,
  swapChoices,
  type SwapChoices,
  type SwapPick,
} from '@/app/actions/workout';
import { equipmentLabel, type SwapMode } from '@/lib/workout/swap';
import type { RunExercise } from '@/lib/workout/run-exercises';

/*
 * 찾기용 전체 목록은 한 번 받으면 이 화면을 나갈 때까지 들고 있는다. 누가 보든
 * 같은 400여 개라, 창을 열 때마다 다시 받으면 약한 신호에서 창이 늦게 뜬다.
 * 추천·막아 둔 운동·즐겨찾기·최근은 열 때마다 새로 받는다(swapChoices).
 */
let libraryCache: SwapPick[] | null = null;

type Tab = 'similar' | 'mine' | 'search';

const TABS = [
  { value: 'similar', label: '비슷한 운동' },
  { value: 'mine', label: '즐겨찾기·최근' },
  { value: 'search', label: '찾기' },
] as const;

/** 찾기에서 한 번에 보여 주는 수. 400개를 통째로 그리면 폰에서 버벅인다. */
const PAGE = 30;

/**
 * 운동 중에 운동을 바꾸거나 더하는 창.
 *
 * 헬스장에서는 기구가 차 있거나, 해 보니 오늘은 아닌 운동이 생긴다. 예전에는
 * 순서를 바꾸고 빼는 것만 됐고 새 운동을 넣으려면 화면을 나가야 했다.
 *
 * 고르는 길은 셋이다.
 *   비슷한 운동   — 같은 분류에서 동작 계열이나 부위가 겹치는 것. 오늘 장비·
 *                  경력·몸 상태를 다 통과한 것만, 왜 비슷한지 한 줄과 함께.
 *   즐겨찾기·최근 — 늘 하던 것을 바로 집는다.
 *   찾기          — 이름으로. 트레이닝의 '운동 추가'와 같은 찾기다.
 * 셋 다 오늘 몸 상태로 안 되는 운동은 막아 둔다(서버가 넣을 때 한 번 더 본다).
 *
 * 세트를 남긴 운동은 바꾸지 않고 바로 뒤에 더한다 — 남긴 세트가 엉뚱한 운동에
 * 붙지 않게(lib/workout/swap.ts 의 swapMode).
 *
 * 이 조각은 서버와 주고받는 일(불러오기·넣기)만 하고, 그리는 것은 아래의
 * SwapSheetView 가 한다. 나눠 두면 서버 없이도 창의 모양을 띄워 볼 수 있다.
 */
export function SwapSheet({
  sessionId,
  current,
  mode,
  inPlanIds,
  onDone,
  onClose,
}: {
  sessionId: string;
  /** 바꿀(또는 뒤에 더할) 운동 */
  current: RunExercise;
  /** 세트를 남겼으면 add — 폰에만 있는 세트까지 세어서 정한다 */
  mode: SwapMode;
  /** 이미 오늘 목록에 있는 운동 — 다시 넣을 수 없다 */
  inPlanIds: string[];
  /** 서버가 실제로 한 일(mode)과 넣은 운동을 넘긴다 */
  onDone: (exercise: RunExercise, mode: SwapMode) => void;
  onClose: () => void;
}) {
  const [choices, setChoices] = useState<SwapChoices | null>(null);
  const [library, setLibrary] = useState<SwapPick[] | null>(libraryCache);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 넣는 중인 운동 — 그 줄의 단추에만 '넣는 중'을 띄운다 */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let alive = true;
    swapChoices({
      sessionId,
      exerciseId: current.id,
      withLibrary: libraryCache == null,
    })
      .then((res) => {
        if (!alive) return;
        if ('error' in res) {
          setLoadError(res.error);
          return;
        }
        if (res.library) {
          libraryCache = res.library;
          setLibrary(res.library);
        }
        setChoices(res);
      })
      .catch(() => {
        if (alive) {
          setLoadError(
            '신호가 없어 불러오지 못했습니다. 신호가 잡히면 다시 열어 주세요.'
          );
        }
      });
    return () => {
      alive = false;
    };
  }, [sessionId, current.id]);

  const pick = (id: string) => {
    setError(null);
    setBusyId(id);
    startTransition(async () => {
      try {
        const res = await changeSessionExercise({
          sessionId,
          fromId: current.id,
          toId: id,
          mode,
        });
        if ('error' in res) {
          setError(res.error);
          return;
        }
        onDone(res.exercise, res.mode);
      } catch (err) {
        unstable_rethrow(err);
        setError('신호가 없어 넣지 못했습니다. 신호가 잡히면 다시 눌러 주세요.');
      } finally {
        setBusyId(null);
      }
    });
  };

  return (
    <SwapSheetView
      current={current}
      mode={mode}
      inPlanIds={inPlanIds}
      choices={choices}
      library={library}
      loadError={loadError}
      error={error}
      busyId={busyId}
      pending={pending}
      onPick={pick}
      onClose={onClose}
    />
  );
}

/** 교체 창의 모양. 무엇을 보여 줄지는 SwapSheet 가 받아 넘긴다. */
export function SwapSheetView({
  current,
  mode,
  inPlanIds,
  choices,
  library,
  loadError,
  error,
  busyId,
  pending,
  onPick,
  onClose,
}: {
  current: { id: string; title: string };
  mode: SwapMode;
  inPlanIds: string[];
  /** 아직 안 왔으면 null */
  choices: SwapChoices | null;
  library: SwapPick[] | null;
  /** 불러오지 못했을 때의 안내 */
  loadError: string | null;
  /** 넣지 못했을 때의 안내 */
  error: string | null;
  busyId: string | null;
  pending: boolean;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<Tab>('similar');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);

  const byId = useMemo(() => new Map((library ?? []).map((p) => [p.id, p])), [library]);
  const inPlan = useMemo(() => new Set(inPlanIds), [inPlanIds]);
  const blocked = useMemo(() => new Set(choices?.blockedIds ?? []), [choices]);
  const favorites = useMemo(() => new Set(choices?.favoriteIds ?? []), [choices]);

  /* 목록에서 찾을 수 있는 것만 — 숨긴 운동은 찾기 목록에 없다. 지금 운동은 뺀다 */
  const pickable = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const found = id === current.id ? undefined : byId.get(id);
      return found ? [found] : [];
    });

  const matched = useMemo(() => {
    if (!library) return [];
    const text = query.trim();
    return library
      .filter(
        (p) =>
          p.id !== current.id &&
          (matchesSearch(p.title, text) || matchesSearch(p.category, text))
      )
      .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  }, [library, query, favorites, current.id]);

  const halted = choices?.halted ?? null;

  const row = (p: SwapPick, sub: string) => {
    const already = inPlan.has(p.id);
    const unsafe = blocked.has(p.id);
    const off = already || unsafe || halted != null;
    return (
      <li
        key={p.id}
        className="flex items-start gap-3 rounded-xl border border-line bg-surface px-3 py-2.5"
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1 text-sm font-semibold text-ink">
            {favorites.has(p.id) && (
              <Star
                aria-label="즐겨찾기"
                className="h-3.5 w-3.5 shrink-0 text-warn"
                fill="currentColor"
                strokeWidth={1.5}
              />
            )}
            <span className="min-w-0 break-keep">{p.title}</span>
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed break-keep text-muted">
            {sub}
          </p>
          {p.prescription && (
            <p className="text-[11px] leading-relaxed text-muted/80">
              {p.prescription}
            </p>
          )}
          {unsafe && !halted && (
            <p className="mt-1 flex items-start gap-1 text-[11px] leading-relaxed text-warn">
              <AlertTriangle aria-hidden className="mt-0.5 h-3 w-3 shrink-0" />
              오늘 몸 상태로는 넣을 수 없는 운동입니다
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onPick(p.id)}
          disabled={off || pending}
          className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed ${
            off
              ? 'border-line bg-surface-2 text-muted'
              : 'border-sky bg-sky text-white active:bg-sky-strong disabled:opacity-60'
          }`}
        >
          {busyId === p.id
            ? '넣는 중…'
            : already
              ? '목록에 있음'
              : mode === 'replace'
                ? '바꾸기'
                : '더하기'}
        </button>
      </li>
    );
  };

  /** 분류와 장비 — 즐겨찾기·최근·찾기 줄의 둘째 줄 */
  const kind = (p: SwapPick) => `${p.category} · ${equipmentLabel(p.equipment)}`;

  const favoritePicks = pickable(choices?.favoriteIds ?? []);
  const recentPicks = pickable(choices?.recentIds ?? []);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      {/* 바깥을 눌러도 닫힌다 */}
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-shade/60"
      />

      <div className="relative flex max-h-[85%] flex-col overflow-hidden rounded-t-3xl border-t border-line bg-surface">
        <div className="shrink-0 border-b border-line px-4 pt-3 pb-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-bold text-ink">
              {mode === 'replace' ? '운동 교체' : '운동 추가'}
            </p>
            <button
              type="button"
              onClick={onClose}
              aria-label="교체 창 닫기"
              className="rounded-lg p-1.5 text-muted transition-colors hover:text-ink"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="mt-0.5 text-[11px] leading-relaxed break-keep text-muted">
            {mode === 'replace'
              ? `‘${current.title}’ 대신 할 운동을 고르세요.`
              : `‘${current.title}’ — 이미 세트를 남긴 운동이라 그대로 두고, 고른 운동을 바로 다음에 더합니다.`}
          </p>
          <Segmented
            role="tablist"
            label="운동 고르는 방법"
            value={tab}
            onChange={setTab}
            options={TABS}
            size="sm"
            className="mt-2.5"
          />
          {tab === 'search' && (
            <label className="mt-2.5 flex items-center gap-2 rounded-xl border border-line bg-surface-2 px-3 py-2">
              <Search aria-hidden className="h-4 w-4 shrink-0 text-muted" />
              <input
                type="search"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setLimit(PAGE);
                }}
                placeholder="운동 이름으로 찾기"
                aria-label="운동 이름으로 찾기"
                className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-muted"
              />
            </label>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {(error || halted) && (
            <p
              role="alert"
              className="mb-3 rounded-lg bg-warn-bg px-3 py-2 text-xs leading-relaxed break-keep text-warn"
            >
              {error ?? halted}
            </p>
          )}

          {loadError ? (
            <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-xs leading-relaxed break-keep text-muted">
              {loadError}
            </p>
          ) : !choices || !library ? (
            <p className="px-4 py-8 text-center text-xs text-muted">불러오는 중…</p>
          ) : tab === 'similar' ? (
            choices.similar.length === 0 ? (
              <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-xs leading-relaxed break-keep text-muted">
                {halted
                  ? '오늘은 운동을 더하거나 바꿀 수 없습니다.'
                  : '오늘 장비와 몸 상태로 할 수 있는 비슷한 운동을 찾지 못했습니다. ‘찾기’에서 골라 주세요.'}
              </p>
            ) : (
              <ul className="space-y-1.5">
                {choices.similar.flatMap(({ id, reason }) => {
                  const p = byId.get(id);
                  return p ? [row(p, reason)] : [];
                })}
              </ul>
            )
          ) : tab === 'mine' ? (
            favoritePicks.length === 0 && recentPicks.length === 0 ? (
              <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-xs leading-relaxed break-keep text-muted">
                아직 즐겨찾기도 최근에 한 운동도 없습니다. 운동 이름 옆의 ☆ 를 누르면
                여기 모입니다.
              </p>
            ) : (
              <div className="space-y-4">
                {favoritePicks.length > 0 && (
                  <section>
                    <p className="mb-1.5 px-1 text-[11px] font-semibold text-muted">
                      즐겨찾기
                    </p>
                    <ul className="space-y-1.5">
                      {favoritePicks.map((p) => row(p, kind(p)))}
                    </ul>
                  </section>
                )}
                {recentPicks.length > 0 && (
                  <section>
                    <p className="mb-1.5 px-1 text-[11px] font-semibold text-muted">
                      최근에 한 운동
                    </p>
                    <ul className="space-y-1.5">
                      {recentPicks.map((p) => row(p, kind(p)))}
                    </ul>
                  </section>
                )}
              </div>
            )
          ) : matched.length === 0 ? (
            <p className="rounded-xl bg-surface-2 px-4 py-6 text-center text-xs text-muted">
              ‘{query.trim()}’에 맞는 운동이 없습니다.
            </p>
          ) : (
            <>
              <ul className="space-y-1.5">
                {matched.slice(0, limit).map((p) => row(p, kind(p)))}
              </ul>
              {matched.length > limit && (
                <button
                  type="button"
                  onClick={() => setLimit((n) => n + PAGE)}
                  className="mt-2 w-full rounded-xl border border-line-strong py-2.5 text-xs font-semibold text-ink transition-colors active:bg-surface-2"
                >
                  {matched.length - limit}개 더 보기
                </button>
              )}
            </>
          )}

          <p className="mt-3 px-2 text-center text-[11px] leading-relaxed break-keep text-muted/80">
            바꾼 운동은 오늘 운동에만 반영됩니다. 트레이닝 화면의 일정은 그대로입니다.
          </p>
        </div>
      </div>
    </div>
  );
}
