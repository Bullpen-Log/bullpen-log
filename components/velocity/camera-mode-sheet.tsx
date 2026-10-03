'use client';

import { AlertTriangle, Loader2, RotateCw } from 'lucide-react';
import {
  DEFAULT_CAM_MODE,
  FPS_CHOICES,
  LOW_FPS_WARNING,
  camModeLabel,
  fpsGood,
  maxFpsFor,
  sizeLabel,
  type CamMode,
  type CamModeOption,
} from '@/lib/velocity-camera-mode';
import { liveFpsNote } from '@/lib/velocity-engine/live-meter';
import { BottomSheet } from './pitch-editor';
import { CHIP_BASE, CHIP_ON, SectionLabel } from './kit';

/**
 * 측정 카메라의 화질 · 프레임 고르기 — 측정 화면 오른쪽 위 카메라 정보를 누르면 열린다(2026-10-03 사용자).
 *
 * 고르면 바로 카메라를 다시 켠다(1초 남짓). 60fps 아래는 막지 않고 주황으로 칠하고 경고한다(2026-10-04 사용자: "경고는 띄우되
 * 막지는 않게, 처음 고를 때부터 색을 다르게"). 화질 칸의 '최대 fps' 는 카메라가 알려 준 값에 켜 보고 안 한계를 덧씌운 것
 * (withCamLimits)이라, 그 화질로는 60 을 못 내는 카메라면 고르기 전부터 주황이다.
 *
 * 카메라가 고른 값과 다르게 켜졌으면(그 조합을 못 냄) 위에 알리고, 고른 칩을 다시 눌러 한 번 더 켤 수 있다 — 예전에는 고른 칩이
 * 눌린 채라 다시 눌러도 아무 일이 없었다('특정 상황에서 아예 안 바뀐다', 2026-10-04 사용자).
 */

/* 주황 — 측정이 잘 안 되는 칸(고를 수는 있다). 고른 칸이면 주황 테두리 + 옅은 면 */
const WARN_CHIP = 'border-warn-line text-warn';
const WARN_CHIP_ON = 'border-warn bg-warn-bg text-warn';

export function CameraModeSheet({
  open,
  onClose,
  mode,
  options,
  current,
  busy,
  dual,
  dualSkipped = false,
  locked = null,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  /** 고른 값 — null 이면 자동 */
  mode: CamMode | null;
  options: CamModeOption[];
  /**
   * 지금 켜진 카메라 — 가로 · 세로 · 카메라가 약속한 fps(고른 값과 견준다) · 실제로 들어오는 fps(흔들린다 — 따로 경고만).
   * 예전에는 들어오는 fps 로 견줘 60 으로 잘 켜졌어도 57 이 잡히면 '못 냈어요'가 떴다.
   */
  current: {
    width: number;
    height: number;
    fps: number | null;
    liveFps?: number | null;
  } | null;
  /** 카메라를 다시 켜는 중 */
  busy: boolean;
  /** 앱의 일반 · 광각 동시 촬영으로 켜져 있다 */
  dual: boolean;
  /** 고른 화질은 두 카메라를 함께 못 켜 이번엔 일반 카메라만(광각 영상 없음) */
  dualSkipped?: boolean;
  /** 지금은 못 바꾼다 — 그 까닭(엔진 개발용 녹화 중) */
  locked?: string | null;
  onPick: (mode: CamMode | null) => void;
}) {
  const curShort = current ? Math.min(current.width, current.height) : null;
  const curFps = current?.fps != null ? Math.round(current.fps) : null;
  const sel: CamMode = mode ?? {
    short: curShort ?? DEFAULT_CAM_MODE.short,
    fps: curFps ?? DEFAULT_CAM_MODE.fps,
  };
  const selMax = maxFpsFor(options, sel.short);
  /* 고른 값과 다르게 켜졌나 — 그러면 고른 칩을 다시 눌러 한 번 더 켤 수 있다 */
  const differs =
    mode != null &&
    current != null &&
    !busy &&
    (Math.abs((curShort ?? 0) - mode.short) > 8 ||
      (curFps != null && Math.abs(curFps - mode.fps) > 2));
  /* 경고 — 고른 fps 가 낮거나, 카메라가 낮게 켜졌거나. 실제로 들어오는 fps 가 낮은 것은 따로(오른쪽 위 알약과 같은 기준) */
  const lowNow = curFps != null && !fpsGood(curFps);
  const lowPicked = !fpsGood(sel.fps);
  const liveNote = busy ? null : liveFpsNote(current?.liveFps ?? null);
  const off = busy || locked != null;

  /*
   * 화질을 바꾸면 fps 는 그대로 두되, 그 화질이 못 내면 낼 수 있는 가장 높은 칸으로. 지금 fps 가 낮은 것이 사용자가 고른 것이
   * 아니면(자동인데 30 으로 켜짐) 그 화질이 낼 수 있는 60 이상으로 — 예전에는 30 을 이어 받아 다시 주황이 됐다.
   */
  const pickSize = (short: number) => {
    const max = maxFpsFor(options, short) ?? sel.fps;
    const fits = FPS_CHOICES.filter((f) => f <= max + 0.5);
    const chosenLow = mode != null && !fpsGood(mode.fps);
    const keep =
      fits.includes(sel.fps as (typeof FPS_CHOICES)[number]) &&
      (fpsGood(sel.fps) || chosenLow);
    const fps = keep
      ? sel.fps
      : (fits.find((f) => fpsGood(f)) ?? fits[fits.length - 1] ?? FPS_CHOICES[0]);
    onPick({ short, fps });
  };
  /* 고른 칩을 다시 눌렀다 — 다르게 켜졌을 때만 한 번 더 켠다 */
  const retry = () => {
    if (differs) onPick({ ...sel });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="카메라 화질 · 프레임">
      <div className="space-y-5">
        <div className="space-y-1">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-ink">
            {busy ? (
              <>
                <Loader2 aria-hidden className="h-4 w-4 animate-spin text-muted" />
                카메라를 바꾸는 중이에요…
              </>
            ) : current ? (
              <>
                지금
                <span
                  className={`font-medium tabular-nums ${lowNow ? 'text-warn' : ''}`}
                >
                  {current.width}×{current.height}
                  {curFps != null && ` · ${curFps}fps`}
                </span>
                {dual && (
                  <span className="text-xs text-muted">(일반 · 광각 동시 촬영)</span>
                )}
              </>
            ) : (
              '카메라가 꺼져 있어요'
            )}
          </p>
          {differs && mode && (
            <p className="text-xs leading-snug text-muted">
              고른 {camModeLabel(mode)} 를 이 카메라가 못 내 가까운 것으로 켰어요. 고른
              칩을 다시 누르면 한 번 더 켜 봐요.
            </p>
          )}
        </div>

        {locked && (
          <p
            role="status"
            className="rounded-2xl bg-surface-2 px-4 py-3 text-sm text-ink"
          >
            {locked}
          </p>
        )}
        {dualSkipped && (
          <p className="rounded-2xl border border-warn-line bg-warn-bg px-4 py-3 text-xs leading-relaxed text-ink">
            이 화질은 일반 · 광각 두 카메라를 함께 켜서는 못 내요 — 지금은 일반 카메라만
            켰어요(광각 영상 없음). 광각 영상이 필요하면 다른 화질이나 자동으로
            고르세요.
          </p>
        )}
        {liveNote && !lowNow && (
          <p className="text-xs leading-relaxed text-warn">{liveNote}</p>
        )}

        {/* 60fps 아래 — 막지 않고 분명하게 경고(고른 값이든 카메라가 낮게 켜졌든) */}
        {(lowPicked || lowNow) && (
          <div
            role="status"
            className="flex gap-2.5 rounded-2xl border border-warn-line bg-warn-bg px-4 py-3 text-sm text-ink"
          >
            <AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warn" />
            <div className="space-y-1">
              <p className="font-semibold text-warn">
                {lowNow && !busy ? `지금 ${curFps}fps — ` : ''}측정이 잘 안 돼요
              </p>
              <p className="text-xs leading-relaxed">
                {LOW_FPS_WARNING} 60fps 이상을 권해요.
              </p>
            </div>
          </div>
        )}

        <div>
          <SectionLabel>화질</SectionLabel>
          {options.length === 0 ? (
            <p className="text-xs text-muted">카메라를 켜면 고를 수 있어요.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const on = sel.short === o.short;
                const slow = !fpsGood(o.maxFps);
                return (
                  <button
                    key={o.short}
                    type="button"
                    disabled={off}
                    aria-pressed={on}
                    onClick={() => (on ? retry() : pickSize(o.short))}
                    className={`${CHIP_BASE} ${
                      slow ? (on ? WARN_CHIP_ON : WARN_CHIP) : on ? CHIP_ON : ''
                    } flex flex-col items-center justify-center py-1 leading-tight disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {slow && <AlertTriangle aria-hidden className="h-3 w-3" />}
                      {sizeLabel(o.short)}
                    </span>
                    <span
                      className={`text-xs tabular-nums ${slow ? '' : 'text-muted'}`}
                    >
                      최대 {o.maxFps}fps
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div>
          <SectionLabel>프레임</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {FPS_CHOICES.map((f) => {
              const on = sel.fps === f;
              /*
               * 이 화질의 최대를 넘는 칸 — 흐리게만 두고 누를 수는 있다. 최대는 브라우저의 짐작이거나 예전에 켜 본 결과라
               * (고친 뒤에는 될 수 있다) 잠그면 다시 해 볼 길이 막혔다. 못 내면 켜진 값을 알린다.
               */
              const tooHigh = selMax != null && f > selMax + 0.5;
              const slow = !fpsGood(f);
              return (
                <button
                  key={f}
                  type="button"
                  disabled={off || options.length === 0}
                  aria-pressed={on}
                  onClick={() => (on ? retry() : onPick({ short: sel.short, fps: f }))}
                  className={`${CHIP_BASE} ${
                    slow ? (on ? WARN_CHIP_ON : WARN_CHIP) : on ? CHIP_ON : ''
                  } ${tooHigh && !on ? 'opacity-50' : ''} inline-flex items-center gap-1 tabular-nums disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  {slow && <AlertTriangle aria-hidden className="h-3 w-3" />}
                  {f}fps
                  {slow && <span className="text-xs">· 부정확</span>}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-snug text-muted">
            60fps 이상을 권해요 — 주황은 측정이 잘 안 되는 칸이에요(고를 수는 있어요).
            {selMax != null &&
              selMax < FPS_CHOICES[FPS_CHOICES.length - 1] &&
              ` 이 카메라는 ${sizeLabel(sel.short)}에서 최대 ${selMax}fps 였어요(흐린 칸도 다시 해 볼 수 있어요).`}
            {dual &&
              ' 광각 동시 촬영 중에는 두 카메라를 함께 켜느라 화질 · 프레임이 낮아질 수 있어요 — 더 높이려면 설정에서 광각 동시 촬영을 꺼요.'}
          </p>
        </div>

        <p className="text-xs leading-snug text-muted">
          높을수록 폰이 뜨거워지고 배터리를 많이 써요. 120 · 240fps 는 한 장에 빛이 덜
          들어와 화면이 어두워질 수 있어요 — 실내라면 조명을 밝게.
        </p>

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          {differs && mode && !locked && (
            <button
              type="button"
              onClick={() => onPick({ ...mode })}
              className="inline-flex min-h-10 items-center gap-1.5 text-sm font-medium text-sky"
            >
              <RotateCw aria-hidden className="h-4 w-4" />
              {camModeLabel(mode)} 로 다시 켜 보기
            </button>
          )}
          {mode && (
            <button
              type="button"
              disabled={off}
              onClick={() => onPick(null)}
              className="min-h-10 text-sm font-medium text-sky disabled:opacity-40"
            >
              자동으로 되돌리기({camModeLabel(DEFAULT_CAM_MODE)})
            </button>
          )}
        </div>
      </div>
    </BottomSheet>
  );
}
