'use client';

import { useSyncExternalStore } from 'react';
import dynamic from 'next/dynamic';
import { sanitizeAbs, sanitizeFitSnapshot } from '@/lib/abs/analysis';

/** 웹 판정 카드의 '3D 로 둘러보기'와 같은 부품 */
const Zone3d = dynamic(() => import('@/components/abs/zone-3d').then((m) => m.Zone3d), { ssr: false });

/**
 * 앱과의 말(native/src/velocity/abs/verdict-card.tsx 와 같은 모양):
 *   - 앱 → 웹: 페이지가 뜨기 전에 window.__ABS3D = { abs, fit }(웹뷰 injectedJavaScriptBeforeContentLoaded) — 받은 값은 저장할 때와 같은 거르기를 한다
 *   - 웹 → 앱: { t: 'abs', kind: 'close' } — 위 ✕ 를 누르면 앱이 창을 닫는다
 */
type Bridge = { ReactNativeWebView?: { postMessage(s: string): void }; __ABS3D?: { abs?: unknown; fit?: unknown } };

/* 서버 그림엔 값이 없다 — 붙은 뒤 한 번 읽는다(같은 값을 돌려줘야 해서 한 번만 걸러 둔다) */
let read: { abs: NonNullable<ReturnType<typeof sanitizeAbs>>; fit: NonNullable<ReturnType<typeof sanitizeFitSnapshot>> } | null | undefined;
function injected() {
  if (read === undefined) {
    const raw = (window as unknown as Bridge).__ABS3D;
    const abs = sanitizeAbs(raw?.abs);
    const fit = sanitizeFitSnapshot(raw?.fit);
    read = abs && fit ? { abs, fit } : null;
  }
  return read;
}
const noop = () => () => {};

export function AbsEmbed() {
  const data = useSyncExternalStore(noop, injected, () => undefined);
  const close = () => (window as unknown as Bridge).ReactNativeWebView?.postMessage(JSON.stringify({ t: 'abs', kind: 'close' }));
  return (
    /* data-safe-area: 앱 안 웹 화면이 몸에 주는 시계 · 홈 막대 여백을 뺀다 — Zone3d 가 제 여백을 둔다 */
    <div data-safe-area className="h-dvh w-full bg-[#151722]">
      {data === undefined ? null : data ? (
        <Zone3d abs={data.abs} fit={data.fit} onClose={close} />
      ) : (
        <button type="button" onClick={close} className="flex h-full w-full items-center justify-center text-sm text-white/70">
          3D 로 볼 판정이 없어요. 눌러서 닫기
        </button>
      )}
    </div>
  );
}
