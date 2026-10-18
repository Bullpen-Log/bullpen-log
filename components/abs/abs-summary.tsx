'use client';

import type { AbsAnalysis } from '@/lib/abs/analysis';

/**
 * 세션 요약의 ABS 칸 — 스트라이크 비율 · 9칸 히트맵(통과 수) · 타격 · 판정 없음 수 · 오차 띠 안내 한 줄.
 */
export function AbsSummary({ items }: { items: { id: number; abs: AbsAnalysis }[] }) {
  const judged = items.filter((x) => x.abs.verdict);
  const strikes = judged.filter((x) => x.abs.verdict!.call === 'strike').length;
  const contacts = items.filter((x) => x.abs.event === 'contact').length;
  const none = items.length - judged.length - contacts;
  const borderline = judged.filter((x) => x.abs.verdict!.borderline).length;
  const cells = Array.from({ length: 9 }, () => ({ s: 0, b: 0 }));
  let outside = 0;
  for (const x of judged) {
    const c = x.abs.verdict!.cell;
    if (c == null) {
      outside++;
      continue;
    }
    if (x.abs.verdict!.call === 'strike') cells[c - 1].s++;
    else cells[c - 1].b++;
  }
  const max = Math.max(1, ...cells.map((c) => c.s + c.b));
  const bands = items[0]?.abs.bands;
  if (!items.length) return null;
  return (
    <section className="rounded-2xl border-line bg-surface p-(--block-pad)">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-heading text-base text-ink">ABS 판정</h3>
          <p className="mt-0.5 text-footnote text-muted">
            {judged.length}구 판정 · 스트라이크 {strikes} · 볼 {judged.length - strikes}
            {contacts ? ` · 타격 ${contacts}` : ''}
            {none ? ` · 판정 없음 ${none}` : ''}
          </p>
        </div>
        <p className="text-numeric shrink-0 text-3xl leading-none text-ink">
          {judged.length ? Math.round((100 * strikes) / judged.length) : 0}
          <span className="ml-0.5 text-base text-muted">%</span>
        </p>
      </div>
      <div className="mt-4 flex items-center gap-5">
        <div className="grid h-28 w-28 shrink-0 grid-cols-3 gap-1 rounded-xl bg-surface-2 p-1" aria-label="코스별 통과 수">
          {cells.map((c, i) => {
            const n = c.s + c.b;
            const a = n ? 0.25 + (0.75 * n) / max : 0;
            return (
              <span
                key={i}
                className="text-numeric flex items-center justify-center rounded-md text-xs font-semibold text-white"
                style={{ backgroundColor: n ? `rgb(10 132 214 / ${a})` : 'var(--color-raised)' }}
              >
                {n || ''}
              </span>
            );
          })}
        </div>
        <ul className="min-w-0 flex-1 space-y-1 text-sm text-muted">
          <li>존 밖 볼 {outside}</li>
          <li>경계(띠 안) {borderline}</li>
          {bands && (
            <li className="text-footnote">
              좌우 ±{bands.lateralCm}cm · 높이 ±{bands.verticalCm}cm 안은 경계로 표시해요. 높이는 참고용이에요.
            </li>
          )}
        </ul>
      </div>
    </section>
  );
}
