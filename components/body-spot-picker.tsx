'use client';

import { useState } from 'react';
import { X } from '@/components/icon';
import {
  SPOT_DEFS,
  SPOT_GROUPS,
  SPOT_LEVELS,
  pictureSrc,
  spotId,
  spotLabel,
  spotOf,
  type BodySpots,
  type SpotGroupKey,
  type SpotLevel,
  type SpotSide,
} from '@/lib/body-spots';

/**
 * 불편한 곳 고르기 — 큰 부위 넷을 누르면 자리 그림 카드가 펼쳐지고, 카드를 누르면 밑 줄에서 뻐근 · 아파요를 고르거나 뺀다
 * (기본값 없음 — 2026-10-20 김민: "기본으로 뻐근해요가 골라지는 것 빼기"). 오른쪽 · 왼쪽은 위 고르개, 처음엔 던지는 팔 쪽.
 * 왼쪽은 오른쪽 그림을 좌우로 뒤집어 쓴다. 값은 부모가 쥔다(체크인 흐름이 부위 칸을 여기서 계산해 보낸다 — partsFromSpots).
 */
export function BodySpotPicker({
  spots,
  onChange,
  defaultSide,
}: {
  spots: BodySpots;
  onChange: (next: BodySpots) => void;
  /** 처음 보일 쪽 — 던지는 팔(좌투면 왼쪽) */
  defaultSide: SpotSide;
}) {
  const first = Object.keys(spots).map(spotOf).find((s) => s != null);
  const [side, setSide] = useState<SpotSide>(first?.side ?? defaultSide);
  /* 고친 체크인을 열면 고른 자리의 부위가 펼쳐진 채로 */
  const [open, setOpen] = useState<SpotGroupKey | null>(first?.def.group ?? null);
  const [active, setActive] = useState<string | null>(null);
  const set = (id: string, level: SpotLevel | null) => {
    const next = { ...spots };
    if (level) next[id] = level;
    else delete next[id];
    onChange(next);
    if (!level) setActive(null);
  };
  const picked = Object.keys(spots);
  const activeDef = active ? spotOf(active)?.def : undefined;
  const activeLevel = active ? spots[active] : undefined;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-0.5 rounded-xl bg-ink/6 p-[3px]" role="radiogroup" aria-label="어느 쪽이에요?">
        {(['R', 'L'] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={side === s}
            onClick={() => {
              setSide(s);
              setActive(null);
            }}
            className={`min-h-10 rounded-[9px] text-sm font-semibold text-ink transition-colors ${
              side === s ? 'bg-raised shadow-sm' : ''
            }`}
          >
            {s === 'R' ? '오른쪽' : '왼쪽'}
            {s === defaultSide && <span className="ml-1 text-caption font-normal text-muted">던지는 팔</span>}
          </button>
        ))}
      </div>

      {SPOT_GROUPS.map((g) => {
        const defs = SPOT_DEFS.filter((d) => d.group === g.key);
        const isOpen = open === g.key;
        const levels = picked.filter((id) => spotOf(id)?.def.group === g.key).map((id) => spots[id]);
        return (
          <section key={g.key} className="overflow-hidden rounded-2xl bg-surface desk:border desk:border-line">
            <button
              type="button"
              aria-expanded={isOpen}
              onClick={() => {
                setOpen(isOpen ? null : g.key);
                setActive(null);
              }}
              className="flex min-h-14 w-full items-center gap-2 px-4 text-left text-base font-bold text-ink"
            >
              {g.label}
              {levels.length > 0 && (
                <span
                  className={`ml-auto rounded-full px-2.5 py-0.5 text-xs font-semibold text-white ${
                    levels.includes('통증') ? 'bg-danger' : 'bg-amber-500'
                  }`}
                >
                  {levels.length}곳
                </span>
              )}
              <span
                aria-hidden
                className={`h-2.5 w-2.5 border-r-2 border-b-2 border-muted transition-transform motion-reduce:transition-none ${
                  levels.length ? '' : 'ml-auto'
                } ${isOpen ? '-rotate-135 translate-y-0.5' : 'rotate-45 -translate-y-0.5'}`}
              />
            </button>
            {isOpen && (
              <div className="grid grid-cols-2 gap-2.5 px-3 pb-3">
                {defs.map((d) => {
                  const id = spotId(side, d.key);
                  const level = spots[id];
                  const on = active === id;
                  return (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={on}
                      aria-label={`${spotLabel(id)} ${level ?? '고르지 않음'}`}
                      onClick={() => setActive(id)}
                      className="relative aspect-square overflow-hidden rounded-2xl bg-[#eef0f4]"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- 작은 정적 그림(public/checkin-body) */}
                      <img
                        src={pictureSrc(d.picture)}
                        alt=""
                        width={640}
                        height={640}
                        decoding="async"
                        className={`absolute inset-0 h-full w-full object-cover ${side === 'L' ? '-scale-x-100' : ''}`}
                      />
                      <span
                        aria-hidden
                        className="pointer-events-none absolute aspect-square w-[34%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{
                          left: `${side === 'L' ? 100 - d.x : d.x}%`,
                          top: `${d.y}%`,
                          background:
                            'radial-gradient(circle, rgba(232,76,84,0.62) 0 32%, rgba(232,76,84,0.26) 47%, rgba(232,76,84,0.1) 60%, rgba(232,76,84,0) 70%)',
                        }}
                      />
                      <span className="absolute top-2 left-2 rounded-full bg-white/90 px-2.5 py-1 text-footnote font-semibold text-[#1d1d1f]">
                        {d.chip}
                      </span>
                      {/* 테두리는 그림 위에 따로 — 안쪽 그림자(ring-inset)는 그림에 가려 안 보였다 */}
                      <span
                        aria-hidden
                        className={`pointer-events-none absolute inset-0 rounded-2xl ring-inset ${
                          level === '통증'
                            ? 'ring-3 ring-danger'
                            : level === '뻐근'
                              ? 'ring-3 ring-amber-500'
                              : on
                                ? 'ring-3 ring-sky'
                                : 'ring-1 ring-ink/6'
                        }`}
                      />
                      {level && (
                        <span
                          className={`absolute right-2 bottom-2 rounded-full px-2.5 py-1 text-footnote font-bold text-white ${
                            level === '통증' ? 'bg-danger' : 'bg-amber-500'
                          }`}
                        >
                          {level}
                        </span>
                      )}
                    </button>
                  );
                })}
                {active && activeDef?.group === g.key && (
                  <div className="col-span-2 flex flex-wrap items-center gap-2 pt-1">
                    <span className="text-sm font-semibold text-ink">
                      {spotLabel(active)}
                      {!activeLevel && <span className="ml-1.5 font-normal text-danger">골라 주세요</span>}
                    </span>
                    <div className="ml-auto flex gap-1.5" role="radiogroup" aria-label="얼마나 불편해요?">
                      {SPOT_LEVELS.map((lv) => (
                        <button
                          key={lv}
                          type="button"
                          role="radio"
                          aria-checked={activeLevel === lv}
                          onClick={() => set(active, lv)}
                          className={`inline-flex min-h-10 items-center rounded-full px-3.5 text-footnote transition-colors ${
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
                        className="inline-flex min-h-10 items-center rounded-full bg-ink/6 px-3 text-footnote text-muted"
                      >
                        빼기
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        );
      })}

      {picked.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="고른 곳">
          {picked.map((id) => (
            <li key={id}>
              <span
                className={`inline-flex min-h-9 items-center gap-1 rounded-full pr-1 pl-3 text-xs font-medium ${
                  spots[id] === '통증' ? 'bg-danger-bg text-danger' : 'bg-amber-500/15 text-warn'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    const s = spotOf(id);
                    if (!s) return;
                    setSide(s.side);
                    setOpen(s.def.group);
                    setActive(id);
                  }}
                >
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
