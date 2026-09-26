'use client';

import type { StageStatus, StageView } from '@/components/three-stage';

const VIEWS = [
  ['front', '앞'],
  ['side', '옆'],
  ['back', '뒤'],
] as const satisfies readonly (readonly [StageView, string])[];

/**
 * 3D 위에 얹는 것 — 앞·옆·뒤 단추, 불러오는 동안의 빈자리, 실패 안내, 다루는 법 한 줄.
 * 두 3D(암케어 근육 지도 · 전신 부위 그림)가 같은 모양으로 쓴다(components/three-stage.ts).
 */
export function StageOverlay({
  status,
  onLook,
  hint,
  loadingText,
  errorText,
}: {
  status: StageStatus;
  onLook: (view: StageView) => void;
  hint: string;
  loadingText: string;
  errorText: string;
}) {
  return (
    <>
      {status === 'ready' && (
        <div className="absolute top-2.5 right-2.5 grid gap-1.5">
          {VIEWS.map(([view, label]) => (
            <button
              key={view}
              type="button"
              onClick={() => onLook(view)}
              aria-label={`${label}에서 보기`}
              className="rounded-lg border border-line bg-surface/90 px-2.5 py-1.5 text-xs font-semibold text-ink shadow-sm transition-colors hover:border-sky hover:text-sky"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {status === 'loading' && (
        <div className="absolute inset-0 grid place-items-center">
          <span
            aria-hidden
            className="absolute inset-6 rounded-3xl bg-surface-2/80 motion-safe:animate-pulse"
          />
          <p className="relative text-sm text-muted">{loadingText}</p>
        </div>
      )}
      {status === 'error' && (
        <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm break-keep text-muted">
          {errorText}
        </p>
      )}
      {status === 'ready' && (
        <p className="pointer-events-none absolute bottom-2.5 left-2.5 rounded-full bg-surface/85 px-2.5 py-1 text-[11px] text-muted">
          {hint}
        </p>
      )}
    </>
  );
}
