'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * 새 아이폰 앱(Expo)에게 '이 화면은 앱에서 열어 줘'를 알리고 사이트는 앞 화면으로 돌아간다 — 앱(native/src/app/index.tsx onMessage)이
 * 받아 네이티브 화면을 띄운다. 그동안 검은 바탕(카메라 화면으로 넘어가는 자리).
 */
export function OpenNative({ path }: { path: string }) {
  const router = useRouter();
  useEffect(() => {
    const rn = (window as unknown as { ReactNativeWebView?: { postMessage(s: string): void } }).ReactNativeWebView;
    rn?.postMessage(JSON.stringify({ t: 'native', path }));
    if (window.history.length > 1) router.back();
    else router.replace('/today');
  }, [router, path]);
  return <div aria-hidden className="fixed inset-0 bg-black" />;
}
