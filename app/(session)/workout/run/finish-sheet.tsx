'use client';

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import { summarizeSets } from '@/lib/workout/summarize';
import { IntensityGuide } from '@/components/intensity-guide';
import type { RunSet } from './session-client';

/**
 * 운동을 마치기 직전 — 체감 강도를 받고 마친다.
 *
 * 마치면 축하 화면(app/(session)/workout/done)이 세 숫자 · 새 최고 · 한 운동을 크게 보여준다. 예전에는 그
 * 요약을 여기서 보였는데(마치면 곧장 트레이닝 목록으로 가서 숫자가 안 남았다), 이제 요약은 끝 화면의 몫이고
 * 이 창은 '마칠까요?'와 강도 하나에 집중한다 — 고를 것이 맨 위에 있다(2026-10-01 '감성').
 *
 * 체감 강도는 여기서 받는다. 트레이닝 화면에도 적는 자리가 있지만(training-note.tsx), 운동이 끝난 직후가
 * 가장 정확하게 답하는 순간이고 그 자리를 지나 화면을 옮기고 나면 아무도 다시 안 적는다.
 */
export function FinishSheet({
  sets,
  startedAt,
  priorSeconds,
  pendingCount,
  onFinish,
  onClose,
  busy,
  error,
}: {
  sets: RunSet[];
  /** 본운동을 시작한 시각. 워밍업에 쓴 시간은 여기 안 들어간다. */
  startedAt: string;
  /** 다시 연 판이면 앞서 마친 구간들의 시간(초). 운동 시간에 더한다. */
  priorSeconds: number;
  /**
   * 폰에만 있고 아직 서버에 못 보낸 세트 수.
   *
   * 마치면 서버가 저장된 세트로 요약을 만든다. 못 보낸 것이 남은 채로 마치면
   * 그 세트는 요약에서 빠지고, 이 판은 닫혀 다시 받지도 않는다. 그래서 다
   * 보내질 때까지 마치기를 막는다.
   */
  pendingCount: number;
  onFinish: (intensity: number | null, memo: string) => void;
  onClose: () => void;
  busy: boolean;
  error: string | null;
}) {
  /*
   * 강도는 미리 고르지 않되, 안 고르면 못 마친다.
   *
   * 두 가지가 같이 간다. 5 를 띄워 두면 그대로 두고 넘기는데 이 숫자가 운동
   * 부하 지수에 곱해지므로, 아무것도 안 골라 둔 채로 연다.
   * 그리고 비워 둔 채로 마치지는 못하게 한다 — 이 앱에서 가장 중요한 입력값
   * 하나이고, 이 자리를 지나면 아무도 다시 안 적는다.
   *
   * 이 앱은 대체로 '권하되 강제하지 않는다'지만 여기는 막는 쪽으로 정했다.
   */
  const [intensity, setIntensity] = useState<number | null>(null);
  const [memo, setMemo] = useState('');

  /* 이 화면을 연 시각으로 못박는다 — 고르는 동안 숫자가 올라가면 산만하다 */
  const [openedAt] = useState(() => Date.now());
  const minutes = Math.max(
    0,
    Math.round((priorSeconds * 1000 + (openedAt - Date.parse(startedAt))) / 60000)
  );
  const exerciseCount = summarizeSets(sets).length;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        data-press-none
        className="absolute inset-0 bg-black/40 motion-safe:animate-[backdrop-in_260ms_ease-out]"
      />

      {/* 아래에서 올라오는 시트 — 앱의 다른 창(components/modal.tsx)과 같은 모양 · 움직임 */}
      <div className="relative flex max-h-[92%] flex-col rounded-t-[28px] bg-surface shadow-2xl motion-safe:animate-[sheet-in_380ms_cubic-bezier(0.32,0.72,0,1)]">
        <div
          aria-hidden
          className="mx-auto mt-2 h-[5px] w-9 shrink-0 rounded-full bg-ink/15"
        />
        <div className="flex shrink-0 items-start justify-between gap-3 px-5 pt-3">
          <div className="min-w-0">
            <p className="text-xl font-bold text-ink">오늘 운동을 마칠까요?</p>
            <p className="mt-0.5 text-sm text-muted tabular-nums">
              {sets.length > 0
                ? `운동 ${exerciseCount}개 · ${sets.length}세트 · ${minutes}분`
                : `${minutes}분`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="-mt-1 -mr-2 grid h-11 w-11 shrink-0 place-items-center text-muted transition-colors hover:text-ink"
          >
            <span className="grid h-8 w-8 place-items-center rounded-full bg-ink/6">
              <X className="h-4 w-4" strokeWidth={2.4} />
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pt-4 pb-4">
          {sets.length === 0 && (
            <p className="mb-5 rounded-2xl bg-ink/6 px-4 py-3 text-sm leading-relaxed text-muted">
              남긴 세트가 없어요. 이대로 마치면 오늘은 기록이 남지 않아요.
            </p>
          )}

          {/* ── 체감 강도 ── */}
          <p className="text-base font-bold text-ink">
            오늘 얼마나 힘들었나요?
            <span className="ml-1.5 text-xs font-semibold text-sky">필수</span>
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted">
            오늘 운동 전체가 얼마나 힘들었는지 골라 주세요. 이 숫자로 운동 부하를
            계산해요.
          </p>

          {/*
            1~10 을 눌러서 고른다.
            밀대(slider)는 엄지로 정확한 칸에 세우기가 어렵고, 손을 대는 순간
            어딘가가 골라져 '안 고름'을 남길 수가 없다.
          */}
          <div className="mt-3 grid grid-cols-10 gap-1">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                /* 한 번 고른 뒤 같은 것을 또 눌러도 안 비워진다 — 필수이므로 */
                onClick={() => setIntensity(n)}
                aria-pressed={intensity === n}
                className={`h-11 rounded-full text-sm font-semibold tabular-nums transition ${
                  intensity === n
                    ? 'bg-sky text-white motion-safe:scale-105'
                    : 'bg-ink/6 text-ink active:bg-ink/12'
                }`}
              >
                {n}
              </button>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between px-1 text-[11px] text-muted">
            <span>1 아주 가벼움</span>
            <span>10 최대</span>
          </div>

          {/* 감으로 찍으면 그 뒤 계산이 전부 흔들린다 — 고르는 자리 바로 밑에 기준을 둔다 */}
          <div className="mt-2">
            <IntensityGuide kind="training" />
          </div>

          <label className="mt-4 block space-y-1.5">
            <span className="text-sm font-medium text-ink">
              느낀점
              <span className="ml-1.5 text-[11px] font-normal text-muted">선택</span>
            </span>
            <textarea
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              rows={2}
              placeholder="안 적어도 돼요. 무거웠던 곳, 잘 된 동작 같은 것."
              className="w-full resize-y rounded-2xl bg-ink/6 px-4 py-3 text-sm text-ink outline-none transition placeholder:text-muted focus:bg-surface focus:ring-2 focus:ring-sky"
            />
          </label>
        </div>

        {/* ── 마치기 ── */}
        <div className="shrink-0 space-y-2 px-4 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {error && (
            <p className="rounded-xl bg-warn-bg px-3 py-2 text-center text-xs text-warn">
              {error}
            </p>
          )}
          {/*
            강도를 안 골랐으면 단추를 끄고 이유를 적는다.

            말없이 꺼 두면 고장 난 줄 안다. 무엇을 하면 켜지는지가 단추 바로
            위에 있어야 한다.
          */}
          {pendingCount > 0 ? (
            <p className="text-center text-xs leading-relaxed text-warn">
              아직 못 보낸 세트가 {pendingCount}개 있어요. 신호가 잡혀 저절로 보내지면
              마칠 수 있어요.
            </p>
          ) : (
            intensity == null && (
              <p className="text-center text-xs text-muted">
                오늘 강도를 고르면 마칠 수 있어요.
              </p>
            )
          )}
          <button
            type="button"
            onClick={() =>
              intensity != null && pendingCount === 0 && onFinish(intensity, memo)
            }
            disabled={busy || intensity == null || pendingCount > 0}
            className="flex h-[72px] w-full items-center justify-center gap-2 rounded-full bg-sky text-lg font-bold text-white transition disabled:opacity-40 motion-safe:active:scale-[0.98]"
          >
            <Check className="h-6 w-6" strokeWidth={2.6} />
            {busy ? '정리 중' : '운동 마치기'}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="min-h-11 w-full rounded-full text-sm font-semibold text-sky transition-opacity disabled:opacity-40 active:opacity-60"
          >
            더 하기
          </button>
        </div>
      </div>
    </div>
  );
}
