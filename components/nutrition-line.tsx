import Link from 'next/link';
import { ChevronRight } from '@/components/icon';
import { RoundCutlery } from '@/components/round-icon';
import type { NutritionLine } from '@/lib/nutrition/nudge';

/**
 * 영양 한 줄 — 투구 기록 그날 화면(오늘) · 운동 끝 축하 화면에 뜬다(lib/nutrition/nudge.ts).
 * 영양 탭을 열지 않아도 지금 무엇을 먹으면 되는지 한 줄로. [자세히]는 영양 탭의 오늘(잠겼으면 첫 설정).
 */
export function NutritionLineNote({ line }: { line: NutritionLine }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <RoundCutlery aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-sky" />
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-xs text-muted">{line.title}</p>
        <p className="text-sm font-semibold text-ink break-keep">{line.text}</p>
        {line.example && (
          <p className="text-xs leading-relaxed text-muted break-keep">{line.example}</p>
        )}
      </div>
      <Link
        href={line.href}
        className="-my-1 flex min-h-10 shrink-0 items-center gap-0.5 text-xs font-semibold text-sky"
      >
        자세히
        <ChevronRight aria-hidden className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}
