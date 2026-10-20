'use client';

import { useCallback, useEffect, useRef } from 'react';
import { loadLabVideoShifts } from '@/app/actions/pitch-lab';
import { sourceTimesAt } from '@/lib/pitch-3d/v2/video-sync';
import dynamic from 'next/dynamic';
import type { Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import type { LabGround } from '@/lib/pitch-lab-meta';
import type { Body3DHandle, Transport } from '@/app/(app)/videos/lab/[id]/body-3d';

/** 3D 보기는 결과가 있을 때만 받는다(웹 결과 화면과 같은 부품) */
const Body3D = dynamic(() => import('@/app/(app)/videos/lab/[id]/body-3d').then((m) => m.Body3D), {
  ssr: false,
});

/**
 * 앱 결과 화면과 3D 칸 사이의 말(앱 native/src/lab/embed.ts 와 같은 모양) — 웹뷰 → 앱은 postMessage JSON, 앱 → 웹뷰는 window.__labSeek(장면).
 *   - ready: 그릴 준비가 됐다
 *   - size: 칸 전체 높이(px) — 앱이 웹뷰 높이를 맞춘다
 *   - transport: 3D 시계(웹 lab-detail.tsx onTransport 와 같다) + 그때 두 영상의 재생기 시각(초, 편집 목록 앞머리까지 더함 · lib/pitch-3d/v2/video-sync.ts)
 *     — 앱이 원본 영상 두 칸을 따라가게. 재생 중엔 0.1초마다 온다.
 */
type ToApp =
  | { t: 'lab'; kind: 'ready' }
  | { t: 'lab'; kind: 'size'; h: number }
  | ({ t: 'lab'; kind: 'transport'; side: number; back: number } & Transport);

type Bridge = { ReactNativeWebView?: { postMessage(s: string): void }; __labSeek?: (frame: number) => void };

const post = (msg: ToApp) => (window as unknown as Bridge).ReactNativeWebView?.postMessage(JSON.stringify(msg));

export function LabEmbed({
  id,
  result,
  ground,
  heightCm,
}: {
  id: string;
  result: Pitch3dV2Ok;
  ground: LabGround;
  heightCm: number | null;
}) {
  const body = useRef<Body3DHandle>(null);
  const box = useRef<HTMLDivElement>(null);
  /* 영상마다 편집 목록 앞머리 — 받기 전엔 0, 받으면 마지막 알림을 다시 보낸다 */
  const shifts = useRef({ side: 0, back: 0 });
  const lastT = useRef<Transport | null>(null);

  const onTransport = useCallback(
    (t: Transport) => {
      lastT.current = t;
      const src = sourceTimesAt(result.t, result.tBack, t.time);
      post({
        t: 'lab',
        kind: 'transport',
        ...t,
        side: Math.max(0, src.side + shifts.current.side),
        back: Math.max(0, src.back + shifts.current.back),
      });
    },
    [result]
  );
  const send = useRef(onTransport);
  useEffect(() => {
    send.current = onTransport;
  }, [onTransport]);
  useEffect(() => {
    let alive = true;
    loadLabVideoShifts({ id }).then(
      (r) => {
        if (!alive) return;
        shifts.current = r;
        if (lastT.current) send.current({ ...lastT.current, reason: 'seek' });
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [id]);

  useEffect(() => {
    const w = window as unknown as Bridge;
    w.__labSeek = (k) => body.current?.seek(k);
    const el = box.current;
    let ro: ResizeObserver | undefined;
    if (el) {
      const send = () => post({ t: 'lab', kind: 'size', h: Math.ceil(el.getBoundingClientRect().height) });
      ro = new ResizeObserver(send);
      ro.observe(el);
      send();
    }
    post({ t: 'lab', kind: 'ready' });
    return () => {
      ro?.disconnect();
      delete w.__labSeek;
    };
  }, []);

  return (
    /*
     * 웹 결과 화면의 3D 칸은 화면 높이의 60% 까지(max-h-[60vh])인데, 여기서는 앱이 웹뷰 높이를 이 칸 높이로 맞춰 서로 줄어드는 고리가 생긴다 —
     * 이 화면에서만 그 한도를 푼다(칸은 폭의 5:4). data-safe-area: 앱 안 웹 화면이 몸에 주는 시계 · 홈 막대 여백(globals.css)을 뺀다 —
     * 이 웹뷰는 앱 화면 가운데의 작은 칸이다.
     */
    <div ref={box} data-lab-embed data-safe-area className="bg-page">
      <style>{'[data-lab-embed] .max-h-\\[60vh\\]{max-height:none}'}</style>
      <Body3D ref={body} result={result} onTransport={onTransport} ground={ground} heightCm={heightCm} />
    </div>
  );
}
