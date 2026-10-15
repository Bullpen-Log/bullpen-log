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
  /** 머리 한 줄만(까닭 줄 없이) — 그날 화면처럼 투구 탭 '오늘' 카드가 이미 다 말한 곳 */
  compact?: boolean;
}) {
  const tone = TONE[status.level];
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
      {!compact && status.details.length > 0 && (
        <ul className="space-y-0.5 text-xs leading-relaxed text-muted break-keep">
          {status.details.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
