'use client';

import { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { areaOfMuscle } from '@/lib/armcare/anatomy';
import type { MapSelection, MapStatus } from '@/app/(app)/training/muscle-map-3d';

/** 3D 는 이 화면에서만 받는다(웹 근육 설명 창과 같은 부품) */
const MuscleMap3D = dynamic(() => import('@/app/(app)/training/muscle-map-3d').then((m) => m.MuscleMap3D), { ssr: false });

/**
 * 앱 근육 설명 창과 3D 칸 사이의 말(앱 native/src/armcare/muscle-info.tsx 와 같은 모양) — 웹뷰 → 앱 postMessage JSON,
 * 앱 → 웹뷰 window.__musclePick(근육).
 *   - status: 그림 상태(ready · unavailable — WebGL 이 없으면 앱이 칸을 접는다)
 *   - pick: 3D 에서 누른 근육(앱이 그 근육 설명으로 바꾼다)
 */
type ToApp = { t: 'muscle'; kind: 'status'; status: MapStatus } | { t: 'muscle'; kind: 'pick'; muscle: string };
type Bridge = { ReactNativeWebView?: { postMessage(s: string): void }; __musclePick?: (name: string) => void };
const post = (msg: ToApp) => (window as unknown as Bridge).ReactNativeWebView?.postMessage(JSON.stringify(msg));

export function MuscleEmbed({ muscle, side, bg }: { muscle: string | null; side: 'right' | 'left'; bg: string | null }) {
  /* 웹 근육 설명(armcare-info-body InfoGraphic)과 같은 고름 — 그 근육의 부위 · 근육 · 누른 갈래 */
  const [pick, setPick] = useState<{ name: string | null; part: string | null }>({ name: muscle, part: null });
  const selection = useMemo<MapSelection>(
    () => ({ area: pick.name ? (areaOfMuscle(pick.name)?.key ?? null) : null, muscle: pick.name, part: pick.part }),
    [pick]
  );

  useEffect(() => {
    const w = window as unknown as Bridge;
    w.__musclePick = (n) => setPick({ name: n, part: null });
    return () => {
      delete w.__musclePick;
    };
  }, []);

  return (
    /* data-safe-area: 앱 안 웹 화면이 몸에 주는 시계 · 홈 막대 여백(globals.css)을 뺀다 — 이 웹뷰는 창 가운데의 작은 칸이다 */
    <div data-safe-area className="h-dvh w-full" style={{ background: bg ?? 'transparent' }}>
      <style>{'html,body{background:transparent!important}'}</style>
      <MuscleMap3D
        side={side}
        selection={selection}
        onPick={(next) => {
          /* 부위만 고르거나 빈 곳을 누르면 그대로 — 창은 근육 하나의 설명이다 */
          if (next.muscle) {
            setPick({ name: next.muscle, part: next.part });
            post({ t: 'muscle', kind: 'pick', muscle: next.muscle });
          }
        }}
        onStatus={(status) => post({ t: 'muscle', kind: 'status', status })}
      />
    </div>
  );
}
