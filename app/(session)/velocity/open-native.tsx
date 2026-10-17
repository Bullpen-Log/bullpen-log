'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 새 아이폰 앱(Expo)에게 '이 화면은 앱에서 열어 줘'를 알리고 사이트는 앞 화면으로 돌아간다 — 앱(native/src/app/index.tsx onMessage)이
 * 받아 네이티브 화면을 띄운다. 그동안 검은 바탕(카메라 화면으로 넘어가는 자리).
 */
export function OpenNative({ path, cover = true }: { path: string; cover?: boolean }) {
  const router = useRouter();
  useEffect(() => {
    const w = window as unknown as { ReactNativeWebView?: { postMessage(s: string): void }; __bpPopAt?: number };
    /*
     * 뒤로 쓸기로 이 자리에 다시 왔으면(앱이 popstate 시각을 남긴다 — native/src/lib/cap-bridge.ts) 앱 화면을 또 열지 않고 한 칸 더 뒤로 —
     * 예전엔 쓸 때마다 앱 화면이 다시 열리고 웹은 검은 판에 남았다.
     */
    const backSwipe = Date.now() - (w.__bpPopAt ?? 0) < 1500;
    if (!backSwipe) w.ReactNativeWebView?.postMessage(JSON.stringify({ t: 'native', path }));
    if (window.history.length > 1) router.back();
    else router.replace('/today');
  }, [router, path]);
  return cover ? <div aria-hidden className="fixed inset-0 bg-black" /> : null;
}
