import { ChevronDown } from 'lucide-react';
import type { FactorResult, GoodDayResult } from '@/lib/report/good-days';

/**
 * 잘 던진 날 — "이런 날 잘 던졌어요"(4단계 화면, 2026-10-09 트레이닝 검토 2-④).
 *
 * 계산은 lib/report/good-days.ts(3단계, 2026-10-06)에 이미 있었는데 그리는 화면이 없어 아무도 못 봤다. 분석의 투구
 * 칸에 둔다 — 결과가 투구 만족도이고, '전날 하체 운동한 날' 같은 항목이 트레이닝으로 되돌아오는 고리다.
 *
 * 적은 기록으로 우연을 말하지 않는 것이 먼저라(good-days.ts 의 문턱), 매긴 날이 모자라면 몇 날 남았는지만,
 * 뚜렷한 것이 없으면 없다고 말한다. '자세히'는 걸러지기 전의 항목들 — 차이 큰 순으로, 숫자를 보고 스스로 판단하게.
 */
export function GoodDaysCard({ result }: { result: GoodDayResult }) {
  const { rated, needed, patterns, all } = result;
  const before = patterns.filter((p) => p.kind === 'before');
  const feel = patterns.filter((p) => p.kind === 'feel');

  return (
    <section className="rounded-2xl border border-line bg-surface p-(--block-pad)">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 className="text-base font-bold text-ink">잘 던진 날</h2>
        <p className="text-xs text-muted">불펜 · 라이브 · 경기 뒤 매긴 만족도로 찾아요</p>
      </div>

      {rated < needed ? (
        <NotYet rated={rated} needed={needed} />
      ) : patterns.length === 0 ? (
        <p className="mt-4 rounded-xl empty-well px-4 py-6 text-center text-sm leading-relaxed text-muted">
          {rated}일을 맞대 봤는데 아직 뚜렷한 것이 없어요.
          <br />
          더 쌓이면 다시 봐요.
        </p>
      ) : (
        <div className="mt-4 space-y-4">
          {before.length > 0 && <PatternList title="던지기 전" items={before.map((p) => p.text)} />}
          {feel.length > 0 && <PatternList title="그날 느낌" items={feel.map((p) => p.text)} />}
        </div>
      )}

      {all.length > 0 && <Details rows={all} />}

      <p className="mt-3 text-[11px] leading-relaxed text-muted/70">
        최근 180일, 매긴 날 {rated}일. 하루에 여러 번 매기면 평균 하나로 보고, 시즌 내내 같이 오르내린 흐름은 빼고
        견줘요. 우연으로 생기기 어려운 차이만 말해요.
      </p>
    </section>
  );
}

function NotYet({ rated, needed }: { rated: number; needed: number }) {
  return (
    <div className="mt-4 space-y-2">
      <p className="text-sm leading-relaxed text-ink/85">
        만족도를 매긴 날이 <b className="tabular-nums">{rated}</b>일이에요. {needed}일이 되면 어떤 날 잘
        던지는지 찾아 드려요.
      </p>
      <div className="h-2 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div
          className="h-full rounded-full bg-sky/45"
          style={{ width: `${Math.min(100, (rated / needed) * 100)}%` }}
        />
      </div>
      <p className="text-[11px] text-muted">불펜 · 라이브 · 경기를 적을 때 만족도를 매기면 쌓여요.</p>
    </div>
  );
}

function PatternList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <p className="text-[11px] font-semibold text-muted">{title}</p>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((text) => (
          <li
            key={text}
            className="rounded-xl bg-sky-tint px-3.5 py-2.5 text-sm leading-relaxed font-medium break-keep text-sky-strong"
          >
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** 걸러지기 전의 항목들 — 차이 큰 순(good-days.ts 의 all), 많아야 여덟 */
function Details({ rows }: { rows: FactorResult[] }) {
  const shown = rows.slice(0, 8);
  return (
    <details className="group mt-4 border-t border-line pt-3">
      <summary className="flex cursor-pointer list-none items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-sky">
        <ChevronDown className="h-3.5 w-3.5 transition-transform group-open:rotate-180" />
        자세히 — 견줘 본 항목
      </summary>
      <ul className="mt-3 space-y-2">
        {shown.map((r) => (
          <li key={r.key} className="flex items-baseline justify-between gap-3 text-xs">
            <span className="min-w-0 break-keep text-ink/85">{r.label}</span>
            <span className="shrink-0 text-muted tabular-nums">
              {r.meanHigh.toFixed(1)} vs {r.meanLow.toFixed(1)} · {r.nHigh}일 / {r.nLow}일
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[11px] leading-relaxed text-muted/70">
        만족도 평균(1~5) 높은 쪽 vs 낮은 쪽, 그 날 수. 날 수가 적거나 차이가 0.7점 안이면 위에는 안 올려요.
      </p>
    </details>
  );
}
