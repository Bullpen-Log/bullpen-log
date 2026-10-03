'use client';

import { Loader2 } from 'lucide-react';
import {
  DEFAULT_CAM_MODE,
  FPS_CHOICES,
  MIN_MEASURE_FPS,
  camModeLabel,
  fpsAllowed,
  maxFpsFor,
  sizeLabel,
  type CamMode,
  type CamModeOption,
} from '@/lib/velocity-camera-mode';
import { BottomSheet } from './pitch-editor';
import { CHIP_BASE, CHIP_ON, SectionLabel } from './kit';

/**
 * 측정 카메라의 화질 · 프레임 고르기 — 측정 화면 오른쪽 위 카메라 정보를 누르면 열린다(2026-10-03 사용자).
 *
 * 고르면 바로 카메라를 다시 켠다(1초 남짓). 30fps 는 보이되 못 누른다 — 측정 카메라는 60fps 이상만. 화질마다 카메라가 낼 수 있는
 * 최고 fps 를 넘는 칸도 막는다(웹 카메라는 브라우저가 조합을 안 알려 줘 넓게 열어 두고, 켜 본 뒤 실제 값을 알린다).
 */
export function CameraModeSheet({
  open,
  onClose,
  mode,
  options,
  current,
  busy,
  dual,
  onPick,
}: {
  open: boolean;
  onClose: () => void;
  /** 고른 값 — null 이면 자동 */
  mode: CamMode | null;
  options: CamModeOption[];
  /** 지금 켜진 카메라 — 가로 · 세로 · 실제로 들어오는 fps */
  current: { width: number; height: number; fps: number | null } | null;
  /** 카메라를 다시 켜는 중 */
  busy: boolean;
  /** 앱의 일반 · 광각 동시 촬영으로 켜져 있다 */
  dual: boolean;
  onPick: (mode: CamMode | null) => void;
}) {
  const curShort = current ? Math.min(current.width, current.height) : null;
  const sel: CamMode = mode ?? {
    short: curShort ?? DEFAULT_CAM_MODE.short,
    fps: current?.fps != null ? Math.round(current.fps) : DEFAULT_CAM_MODE.fps,
  };
  const selMax = maxFpsFor(options, sel.short);

  /* 화질을 바꾸면 fps 는 그대로 두되, 그 화질이 못 내면 낼 수 있는 가장 높은 칸(60 이상)으로 */
  const pickSize = (short: number) => {
    const max = maxFpsFor(options, short) ?? sel.fps;
    const fits = FPS_CHOICES.filter((f) => fpsAllowed(f) && f <= max + 0.5);
    const fps = fits.includes(sel.fps as (typeof FPS_CHOICES)[number])
      ? sel.fps
      : (fits[fits.length - 1] ?? DEFAULT_CAM_MODE.fps);
    onPick({ short, fps });
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="카메라 화질 · 프레임">
      <div className="space-y-5">
        <p className="flex items-center gap-2 text-sm text-ink">
          {busy ? (
            <>
              <Loader2 aria-hidden className="h-4 w-4 animate-spin text-muted" />
              카메라를 바꾸는 중이에요…
            </>
          ) : current ? (
            <>
              지금{' '}
              <span className="font-medium tabular-nums">
                {current.width}×{current.height}
                {current.fps != null && ` · ${Math.round(current.fps)}fps`}
              </span>
              {dual && (
                <span className="text-xs text-muted">(일반 · 광각 동시 촬영)</span>
              )}
            </>
          ) : (
            '카메라가 꺼져 있어요'
          )}
        </p>

        <div>
          <SectionLabel>화질</SectionLabel>
          {options.length === 0 ? (
            <p className="text-xs text-muted">카메라를 켜면 고를 수 있어요.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {options.map((o) => {
                const on = sel.short === o.short;
                const ok = fpsAllowed(o.maxFps);
                return (
                  <button
                    key={o.short}
                    type="button"
                    disabled={busy || !ok}
                    aria-pressed={on}
                    onClick={() => !on && pickSize(o.short)}
                    className={`${CHIP_BASE} ${on ? CHIP_ON : ''} flex flex-col items-center justify-center py-1 leading-tight disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    <span>{sizeLabel(o.short)}</span>
                    <span className="text-xs text-muted tabular-nums">
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
              const tooHigh = selMax != null && f > selMax + 0.5;
              const blocked = !fpsAllowed(f) || tooHigh;
              return (
                <button
                  key={f}
                  type="button"
                  disabled={busy || blocked || options.length === 0}
                  aria-pressed={on}
                  onClick={() => !on && onPick({ short: sel.short, fps: f })}
                  className={`${CHIP_BASE} ${on ? CHIP_ON : ''} tabular-nums disabled:cursor-not-allowed disabled:opacity-40 ${
                    !fpsAllowed(f) ? 'line-through' : ''
                  }`}
                >
                  {f}fps
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs leading-snug text-muted">
            측정에는 {MIN_MEASURE_FPS + 1}fps 이상만 써요 — 30fps 는 공이 장면 사이에 1m
            넘게 날아가 몇 장 안 찍혀요.
            {selMax != null &&
              selMax < FPS_CHOICES[FPS_CHOICES.length - 1] &&
              ` 이 카메라는 ${sizeLabel(sel.short)}에서 최대 ${selMax}fps 예요.`}
          </p>
        </div>

        <p className="text-xs leading-snug text-muted">
          높을수록 폰이 뜨거워지고 배터리를 많이 써요. 120 · 240fps 는 한 장에 빛이 덜
          들어와 화면이 어두워질 수 있어요 — 실내라면 조명을 밝게.
        </p>

        {mode && (
          <button
            type="button"
            disabled={busy}
            onClick={() => onPick(null)}
            className="text-sm font-medium text-sky disabled:opacity-40"
          >
            자동으로 되돌리기({camModeLabel(DEFAULT_CAM_MODE)})
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
