'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Expand } from '@/components/expand';
import { mechanicsElement } from '@/lib/mechanics/elements';
import type { DrillPick } from '@/lib/mechanics/drills';
import type { Pitch3dV2Ok } from '@/lib/pitch-3d/v2/contract';
import { mechChecks } from '@/lib/pitch-3d/v2/mech-checks';
import {
  judgeMechanics,
  type MechStatus,
  type MechVerdict,
} from '@/lib/pitch-3d/v2/mech-judge';

export type DrillPicks = Record<string, { count: number; items: DrillPick[] }>;

const STATUS_TEXT: Record<MechStatus, string> = {
  improve: '고칠 점',
  fair: '보통',
  good: '좋아요',
  unsure: '판정 안 함',
};
/** 고칠 점이 먼저 */
const ORDER: MechStatus[] = ['improve', 'fair', 'good', 'unsure'];

/**
 * 메커니즘 점검 카드 — 드리프트 · 상하체 분리 · 앞다리 버티기를 판정 한 줄씩(설계 docs/designs/pitch-mechanics-checks.md).
 * 겉은 한 줄, 누르면 숫자 · 그 순간 보기 · 쉬운 드릴 셋 · 그 요소 드릴 모두 보기(트레이닝 › 메커니즘 › 요소별 드릴의 그 칸).
 * 강조는 '고칠 점' 하나만(색 적게). 골반 수평은 계산만 하고 안 보인다(정확도 낮음).
 */
export function MechCard({
  result,
  heightCm,
  drillPicks,
  onJump,
}: {
  result: Pitch3dV2Ok;
  heightCm: number | null;
  drillPicks: DrillPicks;
  onJump: (frame: number) => void;
}) {
  const { judgement, frames } = useMemo(() => {
    const m = mechChecks(result, heightCm);
    return {
      judgement: judgeMechanics([m], heightCm),
      frames: {
        drift: result.events.kneeUp,
        separation: m.separation.frame,
        block: result.events.release,
        pelvisLevel: result.events.footPlant,
      } as Record<MechVerdict['key'], number | null>,
    };
  }, [result, heightCm]);
  const items = judgement.items
    .filter((i) => i.shown)
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const [open, setOpen] = useState<string | null>(null);

  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">메커니즘 점검</h2>
        {judgement.tentative && (
          <span className="text-xs text-muted">한 구만 봐서 참고용</span>
        )}
      </div>
      <ul className="divide-y divide-line">
        {items.map((it) => (
          <Row
            key={it.key}
            it={it}
            open={open === it.key}
            onToggle={() => setOpen(open === it.key ? null : it.key)}
            frame={frames[it.key]}
            onJump={onJump}
            picks={drillPicks[it.focus]}
          />
        ))}
      </ul>
    </section>
  );
}

function Row({
  it,
  open,
  onToggle,
  frame,
  onJump,
  picks,
}: {
  it: MechVerdict;
  open: boolean;
  onToggle: () => void;
  frame: number | null;
  onJump: (frame: number) => void;
  picks: { count: number; items: DrillPick[] } | undefined;
}) {
  const key = mechanicsElement(it.focus)?.key;
  const improve = it.status === 'improve';
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-11 w-full items-start gap-3 py-2 text-left transition-colors active:bg-ink/4 desk:hover:bg-surface-2"
      >
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-ink">{it.title}</span>
            <span
              className={`rounded-full px-1.5 text-xs ${
                improve ? 'bg-warn-bg text-warn' : 'bg-ink/8 text-muted'
              }`}
            >
              {STATUS_TEXT[it.status]}
            </span>
          </span>
          <span className="mt-0.5 block text-xs text-muted break-keep">{it.line}</span>
        </span>
        <ChevronDown
          aria-hidden
          className={`mt-0.5 h-4 w-4 shrink-0 text-muted motion-safe:transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <Expand open={open}>
        <div className="space-y-2 pb-3">
          {it.detail && <p className="text-xs text-ink break-keep">{it.detail}</p>}
          {frame != null && (
            <button
              type="button"
              onClick={() => onJump(frame)}
              className="text-xs font-semibold text-sky-strong active:opacity-60"
            >
              그 순간 보기
            </button>
          )}
          {picks && picks.items.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted">
                {improve ? '도움이 되는 드릴' : '함께 보면 좋은 드릴'}
              </p>
              <ul className="space-y-1">
                {picks.items.map((d) => (
                  <li
                    key={d.title}
                    className="flex items-baseline gap-2 text-sm text-ink"
                  >
                    {d.stage && (
                      <span className="shrink-0 rounded-full bg-ink/8 px-1.5 text-xs text-muted">
                        {d.stage}
                      </span>
                    )}
                    <span className="min-w-0 break-keep">{d.title}</span>
                  </li>
                ))}
              </ul>
              {key && (
                <Link
                  href={`/training?view=mechanics&tab=elements&el=${key}`}
                  className="inline-flex min-h-11 items-center gap-0.5 text-xs font-semibold text-sky-strong active:opacity-60"
                >
                  {it.focus} 드릴 {picks.count}개 모두 보기
                  <ChevronRight aria-hidden className="h-3.5 w-3.5" />
                </Link>
              )}
            </div>
          )}
        </div>
      </Expand>
    </li>
  );
}
