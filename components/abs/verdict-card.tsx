'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Box } from '@/components/icon';
import type { AbsAnalysis, FitSnapshot } from '@/lib/abs/analysis';
import { verdictText } from '@/lib/abs/judge';
import { RULES } from '@/lib/abs/rules';
import { zoneWorld } from '@/lib/abs/zone';

const Zone3d = dynamic(() => import('./zone-3d').then((m) => m.Zone3d), { ssr: false });

/**
 * 판정 카드 — 결과 화면(pitch-result.tsx) 구속 위에 뜬다. S / B 크게 · 가장자리까지 거리 한 줄 · 9칸 미니 격자에 통과점 · '경계' · '참고' 배지.
 * 타격이면 판정 없이 '타격', 판정을 못 냈으면 까닭 한 줄. 어두운 바탕(결과 화면) 기준 색.
 */
export function VerdictCard({
  abs,
  fit,
  hand = 'R',
  compact = false,
}: {
  abs: AbsAnalysis;
  /** 3D 둘러보기용 궤적 스냅샷 — 없으면 3D 단추가 없다 */
  fit?: FitSnapshot | null;
  hand?: 'R' | 'L';
  compact?: boolean;
}) {
  const [open3d, setOpen3d] = useState(false);
  const v = abs.verdict;
  const strike = v?.call === 'strike';
  const box = zoneWorld(abs.heightCm, RULES[abs.rule]);
  /* 통과점의 격자 안 자리(0~1, 왼쪽 위 원점) — 상자 밖이면 가장자리 조금 밖에 */
  const dot = abs.cross
    ? {
        x: clamp((abs.cross.x - box.left) / (box.right - box.left), -0.18, 1.18),
        y: clamp((box.top - abs.cross.y) / (box.top - box.bottom), -0.18, 1.18),
      }
    : null;
  const grid = (
    <div className="relative h-16 w-16 shrink-0">
      <div className="grid h-full w-full grid-cols-3 gap-0.5 rounded-md bg-white/10 p-0.5">
        {Array.from({ length: 9 }, (_, i) => (
          <span key={i} className={`rounded-[2px] ${v?.cell === i + 1 ? 'bg-sky/60' : 'bg-white/10'}`} />
        ))}
      </div>
      {dot && (
        <span
          aria-hidden
          className={`absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-black/60 ${strike ? 'bg-sky' : 'bg-warn'}`}
          style={{ left: `${(0.12 + dot.x * 0.76) * 100}%`, top: `${(0.12 + dot.y * 0.76) * 100}%` }}
        />
      )}
    </div>
  );

  if (abs.event === 'contact') {
    return (
      <div className={`flex items-center gap-3 rounded-2xl bg-white/[0.08] px-4 ${compact ? 'py-2.5' : 'py-3'}`}>
        <span className="text-display text-3xl leading-none text-white/85">타격</span>
        <p className="text-sm text-white/70">쳐서 판정하지 않아요.</p>
      </div>
    );
  }
  if (!v) {
    return (
      <div className={`flex items-center gap-3 rounded-2xl bg-white/[0.08] px-4 ${compact ? 'py-2.5' : 'py-3'}`}>
        <span className="text-display text-3xl leading-none text-white/60">—</span>
        <p className="text-sm text-white/70">{abs.reason ?? '판정을 못 했어요.'}</p>
      </div>
    );
  }
  return (
    <div className={`rounded-2xl bg-white/[0.08] px-4 ${compact ? 'py-2.5' : 'py-3'} motion-safe:animate-fade-in`}>
      <div className="flex items-center gap-3">
        <span
          className={`text-display inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-4xl leading-none ${
            strike ? 'bg-sky text-white' : 'bg-white/15 text-white'
          }`}
          aria-label={strike ? '스트라이크' : '볼'}
        >
          {strike ? 'S' : 'B'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-lg font-semibold leading-tight text-white">{verdictText(v, hand)}</p>
          <p className="mt-0.5 text-xs text-white/65">
            타자 {abs.batter} · {abs.heightCm}cm
            {v.borderline && <span className="ml-1.5 rounded-full bg-warn/25 px-2 py-0.5 font-semibold text-warn-line">경계</span>}
            {v.confidence === 'low' && <span className="ml-1.5 rounded-full bg-white/15 px-2 py-0.5 font-semibold text-white/80">참고</span>}
          </p>
          {v.reasons[0] && <p className="mt-0.5 text-xs text-white/55">{v.reasons[0]}</p>}
        </div>
        {grid}
      </div>
      {fit && (
        <button
          type="button"
          onClick={() => setOpen3d(true)}
          className="mt-2.5 inline-flex h-9 items-center gap-1.5 rounded-full bg-white/10 px-3.5 text-xs font-medium text-white transition-colors hover:bg-white/20"
        >
          <Box aria-hidden className="h-3.5 w-3.5" />
          3D 로 둘러보기
        </button>
      )}
      {open3d && fit && <Zone3d abs={abs} fit={fit} onClose={() => setOpen3d(false)} />}
    </div>
  );
}

function clamp(v: number, a: number, b: number) {
  return Math.min(b, Math.max(a, v));
}
