'use client';

import { useEffect } from 'react';
import { libraryMissing, libraryPrefetch, libraryPrune } from '@/lib/local-video';

/** 하루 두 번까지만 살핀다 */
const EVERY_MS = 12 * 60 * 60 * 1000;
const LAST_KEY = 'bullpen-library-sync';
/** 한 번에 받는 수 — 남은 것은 다음 번에(새로 올린 영상은 보통 몇 개라 넉넉하다) */
const PER_RUN = 30;
/** 재생 주소는 한 번에 20개까지(app/api/library/video-url) */
const BATCH = 20;

/**
 * 아이폰 앱이 앱 안에 없는 운동 · 드릴 영상(앱을 낸 뒤 새로 올리거나 고친 것)만 미리 받아 두고, 지운 · 바꾼 영상은 폰에서
 * 지운다 — 그리는 것은 없다(2026-10-13 김민: 앱 안에 넣은 영상을 바뀐 것만 받아 업데이트). 웹 · 옛 앱 · 영상 없이 구운 앱은
 * 아무것도 안 한다(lib/local-video.ts libraryMissing). 못 받은 것은 처음 볼 때 받는다(LibraryVideo).
 */
export function LibrarySync() {
  useEffect(() => {
    const run = async () => {
      try {
        const last = Number(localStorage.getItem(LAST_KEY) ?? 0);
        if (Date.now() - last < EVERY_MS) return;
      } catch {
        /* 저장소가 막혀도 그냥 살핀다 */
      }
      const res = await fetch('/api/library/video-manifest').catch(() => null);
      if (!res?.ok) return;
      const { paths } = (await res.json().catch(() => ({}))) as { paths?: string[] };
      if (!Array.isArray(paths)) return;
      const plan = await libraryMissing(paths);
      if (!plan) return;
      await libraryPrune(plan.keep);

      const todo = plan.missing.slice(0, PER_RUN);
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH);
        const r = await fetch('/api/library/video-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ paths: batch }),
        }).catch(() => null);
        const urls = ((await r?.json().catch(() => null)) as { urls?: Record<string, string> } | null)?.urls;
        if (!urls) return;
        for (const p of batch) if (urls[p]) await libraryPrefetch(p, urls[p]);
      }
      if (plan.missing.length <= PER_RUN) {
        try {
          localStorage.setItem(LAST_KEY, String(Date.now()));
        } catch {
          /* 다음에 다시 살핀다 */
        }
      }
    };
    /* 첫 화면을 그린 뒤 조금 쉬었다가 — 앱을 켜자마자 받기 시작해 화면이 느려지지 않게 */
    const t = window.setTimeout(() => void run(), 8000);
    return () => window.clearTimeout(t);
  }, []);
  return null;
}
