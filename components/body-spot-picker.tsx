'use client';

import { useState } from 'react';
import { X } from '@/components/icon';
import dynamic from 'next/dynamic';
import {
  SPOT_LEVELS,
  SPOT_REGIONS,
  type SpotRegion,
  spotLabel,
  type BodySpots,
  type SpotLevel,
} from '@/lib/body-spots';

/* 3D 는 three.js 를 끌고 와서 칸을 펼 때만 받는다(체크인은 모든 화면에 실린다) */
const BodySpot3D = dynamic(
  () => import('@/components/body-spot-3d').then((m) => m.BodySpot3D),
  {
    ssr: false,
    loading: () => <div className="h-full w-full motion-safe:animate-pulse rounded-2xl bg-ink/6" />,
  }
);


/**
 * 3D 몸에서 불편한 근육 고르기 — 위 키워드로 자리를 좁히고, 근육을 누르면 밑 줄에서 뻐근 · 아파요를 고르거나 뺀다(기본값 없음).
 * 값은 부모가 쥔다(체크인 폼이 부위 칸을 여기서 계산해 보낸다 — lib/body-spots.ts partsFromSpots).
 */
export function BodySpotPicker({
  spots,
  onChange,
  active: activeProp,
  onActiveChange,
  heightClass,
}: {
  spots: BodySpots;
  onChange: (next: BodySpots) => void;
  /**
   * 지금 가리키는 근육을 바깥이 쥘 때(체크인 3판의 '이름으로 찾기'가 고른 근육을 그림이 비추고 정도 단추를 띄우게).
   * 둘을 같이 넘기면 제어형, 안 넘기면 예전처럼 스스로 든다.
   */
  active?: string | null;
  onActiveChange?: (id: string | null) => void;
  /** 그림 칸 높이 — 기본 h-80(PC h-72). 체크인 3판 흐름은 다리까지 보이게 더 높게 넘긴다 */
  heightClass?: string;
}) {
  const [activeOwn, setActiveOwn] = useState<string | null>(null);
  const controlled = activeProp !== undefined && onActiveChange !== undefined;
  const active = controlled ? activeProp : activeOwn;
  const setActive = controlled ? onActiveChange : setActiveOwn;
  /* 누르면 가리키기만 — 뻐근 · 아파요는 사용자가 고른다(2026-10-20 김민: "기본으로 뻐근해요가 골라지는 것 빼기") */
  const tap = (id: string) => setActive(id);
  /* 키워드로 좁히기 — 고르면 그 자리로 다가가고 나머지는 흐려진다 */
  const [region, setRegion] = useState<SpotRegion | null>(null);
  const set = (id: string, level: SpotLevel | null) => {
    const next = { ...spots };
    if (level) next[id] = level;
    else delete next[id];
    onChange(next);
    if (!level) setActive(null);
  };
  const picked = Object.keys(spots);
  const activeLevel = active ? spots[active] : undefined;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="어디쯤이에요?">
        {[null, ...SPOT_REGIONS].map((r) => {
          const on = (region?.key ?? null) === (r?.key ?? null);
          return (
            <button
              key={r?.key ?? 'all'}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => {
                setRegion(r);
                setActive(null);
              }}
              className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-footnote transition-colors desk:min-h-8 desk:text-xs ${
                on ? 'bg-sky font-semibold text-white' : 'bg-ink/6 text-ink/80'
              }`}
            >
              {r?.label ?? '온몸'}
            </button>
          );
        })}
      </div>
      <div
        className={`overflow-hidden rounded-2xl bg-surface desk:border desk:border-line ${heightClass ?? 'h-80 desk:h-72'}`}
      >
        <BodySpot3D spots={spots} active={active} onTap={tap} region={region} />
      </div>

      {active ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface px-3 py-2 desk:border desk:border-line">
          <span className="text-sm font-semibold text-ink">
            {spotLabel(active)}
            {!activeLevel && <span className="ml-1.5 font-normal text-danger">골라 주세요</span>}
          </span>
          <div
            className="ml-auto flex gap-1.5"
            role="radiogroup"
            aria-label="얼마나 불편해요?"
          >
            {SPOT_LEVELS.map((lv) => (
              <button
                key={lv}
                type="button"
                role="radio"
                aria-checked={activeLevel === lv}
                onClick={() => set(active, lv)}
                className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-footnote transition-colors desk:min-h-0 desk:py-1 desk:text-xs ${
                  activeLevel === lv
                    ? lv === '통증'
                      ? 'bg-danger-bg font-semibold text-danger'
                      : 'bg-amber-500/15 font-semibold text-warn'
                    : 'bg-ink/6 text-ink/80'
                }`}
              >
                {lv === '뻐근' ? '뻐근해요' : '아파요'}
              </button>
            ))}
            <button
              type="button"
              onClick={() => set(active, null)}
              className="inline-flex min-h-10 items-center rounded-full bg-ink/6 px-3 text-footnote text-muted desk:min-h-0 desk:py-1 desk:text-xs"
            >
              빼기
            </button>
          </div>
        </div>
      ) : (
        <p className="text-center text-xs text-muted">
          {picked.length
            ? '고른 곳을 누르면 정도를 바꿀 수 있어요.'
            : region
              ? `${region.label}에서 불편한 근육을 눌러 주세요.`
              : '먼저 위에서 자리를 고르면 그곳이 크게 보여요.'}
        </p>
      )}

      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5">
          {picked.map((id) => (
            <li key={id}>
              <span
                className={`inline-flex min-h-9 items-center gap-1 rounded-full pr-1 pl-3 text-xs font-medium ${
                  spots[id] === '통증'
                    ? 'bg-danger-bg text-danger'
                    : 'bg-amber-500/15 text-warn'
                }`}
              >
                <button type="button" onClick={() => setActive(id)}>
                  {spotLabel(id)} {spots[id]}
                </button>
                <button
                  type="button"
                  aria-label={`${spotLabel(id)} 빼기`}
                  onClick={() => set(id, null)}
                  className="grid h-7 w-7 place-items-center rounded-full"
                >
                  <X aria-hidden className="h-3.5 w-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
