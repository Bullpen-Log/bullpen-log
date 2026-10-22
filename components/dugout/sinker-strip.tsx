import Link from 'next/link';
import { ArrowRight } from '@/components/icon';
import type { SinkerCell } from '@/lib/org/sinker-summary';

/**
 * 내 싱커 요약 줄(2026-10-21 2단계 2-5, docs/designs/sinker-dugout.md 5-1) — 로그인한 선수의 덕아웃 홈 맨 위(휴대폰 · 앱 웹뷰).
 * 값은 페이지가 lib/org/sinker-summary.ts 로 한 번 읽어 넘긴다(PC 오른쪽 칸과 같은 값).
 */
export function SinkerStrip({ cells }: { cells: SinkerCell[] }) {
  return (
    /* 한 줄에 다 밀어 넣던 것을 머리 줄 + 칸 넷으로(2026-10-22 금윤호 "보기 편하게") — 휴대폰 두 칸 · 넓으면 네 칸, 긴 글(팔 상태)은 칸 안에서 줄바꿈 */
    <section className="rounded-2xl border border-sky-soft/60 bg-sky-tint p-4 md:p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-sky-strong">내 싱커</span>
        <Link
          href="/sinker"
          className="inline-flex min-h-8 items-center gap-0.5 text-sm font-semibold text-sky-strong"
        >
          대시보드 <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
        {cells.map((c) => (
          <Link
            key={c.label}
            href={c.href}
            className="flex min-w-0 flex-col gap-1 rounded-xl bg-surface/80 px-3 py-2.5 transition-colors hover:bg-surface"
          >
            <span className="text-xs text-muted">{c.label}</span>
            <span className="text-sm leading-snug font-semibold break-keep text-ink">{c.value}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
