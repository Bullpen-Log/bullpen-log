'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 지금 보고 있는 영상의 재생 주소만 필요할 때 받아온다.
 * 기록이 100개가 넘어가도 페이지를 열 때 전부 발급하지 않게 하려는 목적이다.
 * 한 번 받은 주소는 캐시해 같은 영상을 다시 고를 때 재요청하지 않는다.
 */
export function usePlaybackUrls(paths: (string | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const requestedRef = useRef<Set<string>>(new Set());

  // 배열은 매 렌더마다 새로 만들어지므로 문자열로 바꿔 비교한다.
  const key = paths.filter(Boolean).join('|');

  useEffect(() => {
    const wanted = key ? key.split('|') : [];
    const missing = wanted.filter((p) => !requestedRef.current.has(p));
    if (missing.length === 0) return;

    missing.forEach((p) => requestedRef.current.add(p));

    let cancelled = false;
    setLoading(true);

    fetch('/api/pitch-log/video-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paths: missing }),
    })
      .then((res) => (res.ok ? res.json() : { urls: {} }))
      .then((data) => {
        if (cancelled) return;
        setUrls((prev) => ({ ...prev, ...(data.urls ?? {}) }));
      })
      .catch(() => {
        // 실패한 경로는 다시 시도할 수 있게 캐시에서 빼둔다.
        missing.forEach((p) => requestedRef.current.delete(p));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [key]);

  return { urls, loading };
}
