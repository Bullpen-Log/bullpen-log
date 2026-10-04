import { Card } from '@/components/ui';
import type { ProgramResult } from '@/lib/program/load';

/**
 * 프로그램을 다 마쳤을 때(설계 §13-13) — 큰 운동 넷의 추정 최대를 숫자 그대로. 안 올랐으면 '이번엔 그대로예요'.
 * 끝난 뒤 사흘 동안 트레이닝 맨 위에 둔다. 같은 프로그램 다시 하기는 바로 밑의 입구 한 줄(program-start.tsx).
 */
export function ProgramDone({ result }: { result: ProgramResult }) {
  return (
    <Card className="space-y-3">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted">근력 · 파워 프로그램</p>
        <p className="text-heading text-xl text-ink">다 마쳤어요</p>
        <p className="text-sm text-muted">
          완료 {result.completed} · 건너뜀 {result.skipped} · {result.weeks}주 걸렸어요
        </p>
      </div>
      <ul className="divide-y divide-line">
        {result.lifts.map((l) => {
          const up = l.from != null && l.to != null && l.to > l.from;
          return (
            <li
              key={l.label}
              className="flex min-h-11 items-center justify-between gap-3 py-1.5"
            >
              <span className="min-w-0">
                <span className="block text-xs text-muted">{l.label} · 추정 최대</span>
                <span className="block truncate text-[15px] text-ink">{l.title}</span>
              </span>
              <span className="shrink-0 text-right text-sm">
                {l.from != null && l.to != null ? (
                  up ? (
                    <span className="text-numeric font-bold text-sky-strong">
                      {Math.round(l.from)} → {Math.round(l.to)}kg
                    </span>
                  ) : (
                    <span className="text-muted">이번엔 그대로예요</span>
                  )
                ) : (
                  <span className="text-muted">기록이 모자라요</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
