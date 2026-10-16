'use client';

import { useState } from 'react';
import { ChevronDown } from '@/components/icon';
import { Expand } from '@/components/expand';
import { ARM_LEVEL_LABEL, type ArmStatus } from '@/lib/report/arm-status';

/**
 * 지금 팔 상태 — 위험 · 주의 · 안전 한 칸(lib/report/arm-status.ts armStatusOf).
 *
 * 투구 기록 탭의 '오늘' 카드 · 그날 화면(오늘) · 홈 첫날 카드가 같이 쓴다. 예전 '오늘 계획 40~55구 · 강도 60~80%'
 * 자리다(2026-10-14 사용자: 몇 구를 던지라고 하지 말고 위험한지 안전한지만).
 */
const TONE = {
  danger: { dot: 'bg-danger', label: 'text-danger', box: 'border-danger-line bg-danger-bg' },
  caution: { dot: 'bg-warn', label: 'text-warn', box: 'border-warn-line bg-warn-bg' },
  safe: { dot: 'bg-ok', label: 'text-ok', box: 'border-line bg-surface-2' },
} as const;

export function ArmStatusNote({
  status,
  bare = false,
  compact = false,
}: {
  status: ArmStatus;
  /** 카드 안에 넣을 때 — 테두리 · 바탕 없이 */
  bare?: boolean;
  /** 한 줄 칩 — 누르면 머리 · 까닭이 펴진다(그날 화면처럼 투구 탭 '오늘' 카드가 이미 다 말한 곳, 2026-10-16 '부하 지수 0.92' 같은 숫자는 펴야 보이게) */
  compact?: boolean;
}) {
  const tone = TONE[status.level];
  if (compact) return <ArmStatusChip status={status} />;
  return (
    <div
      className={bare ? 'space-y-1' : `space-y-1 rounded-xl border px-4 py-3 ${tone.box}`}
      role="status"
    >
      <p className="flex items-center gap-1.5 text-xs text-muted">
        <span aria-hidden className={`h-2 w-2 rounded-full ${tone.dot}`} />
        지금 팔 상태
        <span className={`font-bold ${tone.label}`}>{ARM_LEVEL_LABEL[status.level]}</span>
      </p>
      <p className="text-sm font-semibold text-ink break-keep">{status.headline}</p>
      {status.details.length > 0 && (
        <ul className="space-y-0.5 text-xs leading-relaxed text-muted break-keep">
          {status.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * 한 줄 칩 — 누르면 머리 · 까닭이 펴진다. 펼침은 '자세히'(FoldNote)와 같은 Expand(높이 · 옅어짐 300ms, 움직임 줄이기면 바로) —
 * 예전 <details> 는 툭 펴졌다(2026-10-16 움직임 점검).
 */
function ArmStatusChip({ status }: { status: ArmStatus }) {
  const [open, setOpen] = useState(false);
  const tone = TONE[status.level];
  const short = status.headline.replace(/\s*\(부하 지수 [\d.]+\)/, '');
  return (
    <div role="status">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex min-h-10 w-full items-center gap-1.5 rounded-full border px-3 text-left text-xs ${tone.box}`}
      >
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
        <span className={`shrink-0 font-bold ${tone.label}`}>팔 {ARM_LEVEL_LABEL[status.level]}</span>
        <span className="min-w-0 truncate text-ink">{short}</span>
        <ChevronDown
          aria-hidden
          className={`ml-auto h-3.5 w-3.5 shrink-0 text-muted motion-safe:transition-transform motion-safe:duration-300 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <Expand open={open}>
        <div className="space-y-0.5 px-3 pt-2 text-xs leading-relaxed text-muted break-keep">
          <p className="font-semibold text-ink">{status.headline}</p>
          {status.details.map((d) => (
            <p key={d}>{d}</p>
          ))}
        </div>
      </Expand>
    </div>
  );
}
