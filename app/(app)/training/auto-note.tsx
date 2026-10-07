import { cautionLabel, type AutoRecord } from '@/lib/report/auto-setup';
import { GOAL_FOCUSES } from '@/lib/report/personalize';
import { OpenCheckinButton } from '@/components/notice-bell';

/**
 * 자동 맞춤이 무엇을 정했고 왜인지 — 오늘 일정 카드 안에 둔다.
 *
 * 목표·시간을 앱이 정했으니, 무엇으로 정했는지 먼저 보여야 한다. 안 보이면
 * '컨디셔닝 40분'이 나온 날 선수는 이유를 알 수 없다.
 *
 * 2026-10-07 전에 AI 로 만든 줄(by 'ai')도 같은 이름으로 보인다. 그 줄에만 있을 수 있는
 * 조심할 곳 · 통증 의심은 그대로 보여 준다(규칙 초안은 늘 비어 있다).
 */
export function AutoNote({ auto }: { auto: AutoRecord }) {
  const focus = GOAL_FOCUSES.find((f) => f.key === auto.focus)?.label;
  return (
    <div className="space-y-2 rounded-xl border border-sky-soft/60 bg-sky-tint px-4 py-3">
      {/* 무엇으로 정했는지 한 줄 — 까닭은 눌러야 편다(글이 길면 안 읽는다) */}
      <details className="group">
        <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
          <span className="flex items-center gap-1 text-sky-strong">
            자동 맞춤
          </span>
          <span className="text-ink/70">
            목표 {auto.goal} · {auto.minutes}분{focus ? ` · ${focus}` : ''}
          </span>
          <span className="ml-auto font-semibold text-sky-strong group-open:hidden">
            왜?
          </span>
        </summary>
        <p className="mt-2 text-sm leading-relaxed break-keep text-ink/85">
          {auto.reason}
        </p>
        {auto.caution.length > 0 && (
          <p className="mt-1.5 text-xs leading-relaxed break-keep text-muted">
            메모를 보고 조심한 곳:{' '}
            {auto.caution.map((c) => `${cautionLabel(c.part)}(${c.why})`).join(' · ')}
          </p>
        )}
      </details>
      {/* 통증으로 멈추는 것은 체크인의 '통증'이 한다 — 여기서는 의심만 알린다 */}
      {auto.painSuspected && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
          메모에 통증 같은 말이 있어요.{' '}
          <OpenCheckinButton className="font-semibold text-sky-strong">
            통증이면 체크인 고치기
          </OpenCheckinButton>
        </p>
      )}
    </div>
  );
}
