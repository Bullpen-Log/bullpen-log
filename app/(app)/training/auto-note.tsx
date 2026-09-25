import { Sparkles } from 'lucide-react';
import { cautionLabel, type AutoRecord } from '@/lib/report/auto-setup';
import { GOAL_FOCUSES } from '@/lib/report/personalize';
import { OpenCheckinButton } from '@/components/notice-bell';

/**
 * AI 맞춤이 무엇을 정했고 왜인지 — 오늘 일정 카드 안에 둔다.
 *
 * 목표·시간을 앱이 정했으니, 무엇으로 정했는지 먼저 보여야 한다. 안 보이면
 * '컨디셔닝 40분'이 나온 날 선수는 이유를 알 수 없다.
 *
 * AI를 못 불러 규칙 초안으로 만든 날은 그렇다고 밝힌다. AI 맞춤이라고 해 놓고
 * 규칙이 정한 것을 AI가 정한 것처럼 보이면 안 된다.
 */
export function AutoNote({ auto }: { auto: AutoRecord }) {
  const focus = GOAL_FOCUSES.find((f) => f.key === auto.focus)?.label;
  return (
    <div className="space-y-2 rounded-xl border border-sky-soft/60 bg-sky-tint px-4 py-3">
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs font-medium">
        <span className="flex items-center gap-1 text-sky-strong">
          <Sparkles className="h-3.5 w-3.5" />
          {auto.by === 'ai' ? 'AI 맞춤' : 'AI 맞춤 · 규칙대로'}
        </span>
        <span className="text-ink/70">
          목표 {auto.goal} · {auto.minutes}분{focus ? ` · ${focus}` : ''}
        </span>
      </p>
      <p className="text-sm leading-relaxed break-keep text-ink/85">{auto.reason}</p>
      {auto.caution.length > 0 && (
        <p className="text-xs leading-relaxed break-keep text-muted">
          메모를 보고 조심한 곳:{' '}
          {auto.caution.map((c) => `${cautionLabel(c.part)}(${c.why})`).join(' · ')}
        </p>
      )}
      {/*
        통증 판정은 AI에게 맡기지 않는다. AI는 의심만 알리고, 멈추는 것은
        체크인의 '통증'이 한다 — 그래야 같은 입력에 늘 같은 결과가 나온다.
      */}
      {auto.painSuspected && (
        <p className="rounded-lg border border-warn-line bg-warn-bg px-3 py-2 text-xs leading-relaxed text-warn">
          메모에 통증으로 보이는 말이 있습니다. 통증이라면{' '}
          <OpenCheckinButton className="font-semibold underline">
            오늘 체크인
          </OpenCheckinButton>
          에서 ‘통증’으로 고쳐주세요. 그러면 오늘 운동을 멈추고 쉬는 쪽으로 바꿉니다.
        </p>
      )}
      {auto.by === 'rules' && auto.fallback && (
        <p className="text-xs leading-relaxed text-muted">{auto.fallback}</p>
      )}
    </div>
  );
}
