'use client';

import { useState } from 'react';
import { ChevronRight, UserRound } from '@/components/icon';
import { BottomSheet } from '@/components/velocity/pitch-editor';
import { CHIP_BASE, CHIP_ON } from '@/components/velocity/kit';
import { AVERAGE_HEIGHT_CM, HEIGHT_MAX_CM, HEIGHT_MIN_CM } from '@/lib/abs/rules';

/**
 * 측정 중 '타자 N · 175cm' 칩 — 누르면 '다음 타자' 시트: 평균 신장 그대로 또는 숫자 입력. 사용자 결정(2026-10-18): 처음 '평균 신장'을
 * 골랐으면 다음 타자에게도 유지, 숫자를 넣으면 그 타자부터 그 값.
 */
export function BatterChip({
  batter,
  height,
  onNext,
  className = '',
}: {
  batter: number;
  height: number | 'average';
  onNext: (height: number | 'average') => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'average' | 'number'>(height === 'average' ? 'average' : 'number');
  const [text, setText] = useState(height === 'average' ? '' : String(height));
  const cm = height === 'average' ? AVERAGE_HEIGHT_CM : height;
  const parsed = Number(text);
  const valid = mode === 'average' || (Number.isFinite(parsed) && parsed >= HEIGHT_MIN_CM && parsed <= HEIGHT_MAX_CM);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`inline-flex h-9 items-center gap-1.5 rounded-full bg-black/55 px-3 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-black/70 ${className}`}
      >
        <UserRound aria-hidden className="h-3.5 w-3.5" />
        타자 {batter} · {cm}cm{height === 'average' ? '(평균)' : ''}
        <ChevronRight aria-hidden className="h-3.5 w-3.5 opacity-70" />
      </button>
      <BottomSheet open={open} onClose={() => setOpen(false)} title="다음 타자">
        <p className="text-sm text-muted">타자 {batter + 1}의 신장을 넣어요. 존 위 · 아래가 신장에 따라 바뀌어요.</p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setMode('average')}
            aria-pressed={mode === 'average'}
            className={`${CHIP_BASE} ${mode === 'average' ? CHIP_ON : ''}`}
          >
            평균 신장 {AVERAGE_HEIGHT_CM}cm
          </button>
          <button
            type="button"
            onClick={() => setMode('number')}
            aria-pressed={mode === 'number'}
            className={`${CHIP_BASE} ${mode === 'number' ? CHIP_ON : ''}`}
          >
            직접 입력
          </button>
        </div>
        {mode === 'number' && (
          <label className="mt-3 flex items-center gap-2">
            <input
              inputMode="numeric"
              value={text}
              onChange={(e) => setText(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
              placeholder="175"
              autoFocus
              className="h-12 w-28 rounded-xl border border-line bg-surface px-3 text-center text-lg tabular-nums text-ink"
            />
            <span className="text-sm text-muted">cm ({HEIGHT_MIN_CM}~{HEIGHT_MAX_CM})</span>
          </label>
        )}
        <button
          type="button"
          disabled={!valid}
          onClick={() => {
            onNext(mode === 'average' ? 'average' : parsed);
            setOpen(false);
          }}
          className="mt-5 h-12 w-full rounded-2xl bg-sky text-base font-bold text-white transition-colors active:bg-sky-strong disabled:opacity-40"
        >
          타자 {batter + 1}로 넘어가기
        </button>
      </BottomSheet>
    </>
  );
}
