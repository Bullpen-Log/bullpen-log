'use client';

import { useEffect, useRef, useState } from 'react';
import { isPhoneVideoPath, loadPhoneVideo, localVideoAvailable } from '@/lib/local-video';

/**
 * 한 번에 물을 수 있는 경로 수. 재생 주소 API(app/api/pitch-log/video-url/route.ts
 * 의 MAX_PATHS)와 같아야 한다 — 넘기면 요청이 통째로 거절된다.
 */
const PATHS_PER_REQUEST = 10;

/** 경로마다의 받기 결과. 받음이어도 서버가 주소를 안 줬을 수 있다(남의 것·지운 것). */
type Settled = 'done' | 'failed';

/**
 * 받은 주소를 이만큼 지나면 새로 받는다. 서버는 남은 수명이 30분 넘는 주소를 준다(lib/storage.ts 의 URL_REUSE_MS) —
 * 예전에는 한 번 받으면 다시 안 받아, 아이폰 앱을 한참 뒤에 다시 열거나 화면을 오래 켜 두면 받아 둔 주소가 만료돼
 * 영상 · 썸네일이 검게 떴다.
 */
const STALE_MS = 20 * 60 * 1000;

/**
 * 지금 보고 있는 영상의 재생 주소만 필요할 때 받아온다.
 * 기록이 100개가 넘어가도 페이지를 열 때 전부 발급하지 않게 하려는 목적이다.
 * 한 번 받은 주소는 캐시해 같은 영상을 다시 고를 때 재요청하지 않는다.
 *
 * ■ 예전에 영상이 통째로 안 뜨던 까닭 셋
 *
 * - 모자란 경로를 한 번에 물었다. API 는 10개가 넘으면 거절하는데, 거절을 '빈
 *   결과'로 받아 넘기고 그 경로들을 받은 것으로 적어 두었다. 영상 탭에서 한 달에
 *   영상이 11개를 넘으면 그 달 썸네일이 전부 필름 아이콘으로 굳었다. → 10개씩 나눈다.
 * - 응답이 오기 전에 보는 경로가 바뀌면(정렬을 바꾸거나 캘린더에서 날짜를 빨리
 *   옮기면) 온 결과를 버렸는데, 받은 것으로 적은 표시는 남아 다시 묻지 않았다.
 *   → 결과는 언제 오든 합친다. 주소는 주소라 합쳐 둬서 해가 없다.
 * - '다 받았다(ready)'가 첫 응답 뒤로 계속 참이라, 새 영상을 받는 중에도 "영상을
 *   불러오지 못했습니다"가 떴다. → 지금 보는 경로마다 따로 센다.
 *
 * 돌려주는 모양은 그대로다 — loading 은 지금 보는 경로 가운데 아직 답을 못 받은
 * 것이 있는가, ready 는 전부 답을 받았는가(주소가 없는 답 포함)다.
 */
export function usePlaybackUrls(paths: (string | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [settled, setSettled] = useState<Record<string, Settled>>({});
  /* 물어본 경로(받는 중 포함). 같은 것을 두 번 묻지 않게 한다. 실패하면 뺀다. */
  const requestedRef = useRef<Set<string>>(new Set());
  /* 경로마다 주소를 받은 때 — 오래되면(STALE_MS) 새로 받는다. 받는 중에는 비어 있다. */
  const fetchedAtRef = useRef<Map<string, number>>(new Map());
  /* 앱 · 탭으로 돌아온 횟수 — 돌아오면 오래된 주소가 있는지 다시 본다 */
  const [wake, setWake] = useState(0);

  // 배열은 매 렌더마다 새로 만들어지므로 문자열로 바꿔 비교한다.
  const key = paths.filter(Boolean).join('|');

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') setWake((n) => n + 1);
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const wanted = key ? key.split('|') : [];
    const now = Date.now();
    const stale = (p: string) => {
      const at = fetchedAtRef.current.get(p);
      return at != null && now - at > STALE_MS;
    };
    /* 새로 받는 동안에도 옛 주소는 그대로 둔다(아직 살아 있다) — 로딩 표시도 다시 띄우지 않는다 */
    const missing = wanted.filter((p) => !requestedRef.current.has(p) || stale(p));
    if (missing.length === 0) return;

    missing.forEach((p) => {
      requestedRef.current.add(p);
      fetchedAtRef.current.delete(p);
    });

    const mark = (chunk: string[], value: Settled) =>
      setSettled((prev) => ({
        ...prev,
        ...Object.fromEntries(chunk.map((p) => [p, value])),
      }));

    /*
     * 폰의 앱 안에 둔 회원 영상(lib/local-video.ts) — 서버에 묻지 않고 이 폰에서 꺼낸다(blob: 주소, 낡지 않는다). 다른 기기 · 웹 ·
     * 지운 영상은 주소 없이 'done' — 부르는 쪽이 isPhoneVideoPath 로 '찍은 폰에 있어요'를 띄운다.
     */
    const phone = missing.filter(isPhoneVideoPath);
    for (const p of phone) {
      if (!localVideoAvailable()) {
        fetchedAtRef.current.set(p, Number.POSITIVE_INFINITY);
        mark([p], 'done');
        continue;
      }
      loadPhoneVideo(p)
        .then((url) => setUrls((prev) => ({ ...prev, [p]: url })))
        .catch(() => undefined)
        .finally(() => {
          fetchedAtRef.current.set(p, Number.POSITIVE_INFINITY);
          mark([p], 'done');
        });
    }
    const server = missing.filter((p) => !isPhoneVideoPath(p));

    for (let i = 0; i < server.length; i += PATHS_PER_REQUEST) {
      const chunk = server.slice(i, i + PATHS_PER_REQUEST);
      fetch('/api/pitch-log/video-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: chunk }),
      })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
        .then((data: { urls?: Record<string, string> }) => {
          const at = Date.now();
          chunk.forEach((p) => fetchedAtRef.current.set(p, at));
          setUrls((prev) => ({ ...prev, ...(data.urls ?? {}) }));
          mark(chunk, 'done');
        })
        .catch(() => {
          // 실패한 경로는 다음에 이 경로를 다시 볼 때 새로 물을 수 있게 표시를 지운다.
          chunk.forEach((p) => requestedRef.current.delete(p));
          mark(chunk, 'failed');
        });
    }
  }, [key, wake]);

  const wanted = key ? key.split('|') : [];
  const loading = wanted.some((p) => settled[p] == null);
  return { urls, loading, ready: !loading };
}
