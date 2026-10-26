'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui';
import { compareDeltaText, compareRangeText, prevDateText, PREV_CONFIRM, type PreviousComparison } from '@/lib/pitch-3d/v2/compare-view';
import {
  REPORT_STATUS_TEXT,
  REPORT_CRITERIA,
  measurementText,
  coverageText,
  prescriptionMessage,
  rxAction,
  type FocusProgress,
  type RxAction,
  type ElementRx,
  type PitchReport,
  type ReportGauge,
  type ReportItem,
  type ReportStatus,
} from '@/lib/pitch-3d/v2/report';

/**
 * 투구 진단 리포트 조각(설계 docs/designs/pitch-3d-report.md 5-4절 '모양') — 어두운 3D 무대 위 결론 · 투구의 흐름 사슬 · 개선 드릴 · 지난번과 견주기.
 * 색은 sky(누름) · warn(문제) · ok(목표 · 좋아요) 셋만, 숫자는 text-numeric. 앱 화면(native/src/app/lab/[id].tsx)도 같은 차례 · 같은 글.
 */

/* ───────────────────────────── 결론(어두운 무대) ───────────────────────────── */

export function ReportHero({
  report,
  stage,
}: {
  report: PitchReport;
  /** 3D 인형 칸 */
  stage: ReactNode;
}) {
  const h = report.headline;
  return (
    <section className="theme-dark overflow-hidden rounded-3xl bg-page text-ink">
      <div className="relative">
        {stage}
        {h.moment && <span className="pointer-events-none absolute right-4 top-3 text-caption text-muted">{h.moment}</span>}
      </div>
      {/* PC 는 결론이 3D 밑으로 밀려 안 보여 오른쪽 위(VerdictCard)로 */}
      <div className="px-5 pb-5 pt-1 desk:hidden">
        <Verdict report={report} />
      </div>
    </section>
  );
}

/** PC 오른쪽 맨 위의 결론 — 휴대폰은 ReportHero 안에 */
export function VerdictCard({ report }: { report: PitchReport }) {
  return (
    <section className="theme-dark hidden rounded-3xl bg-page p-6 text-ink desk:block">
      <Verdict report={report} />
    </section>
  );
}

function Verdict({ report }: { report: PitchReport }) {
  const h = report.headline;
  return (
    <div className="space-y-2.5">
      {h.tag && (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-footnote ${
            h.tone === 'improve' ? 'bg-warn/20 text-warn' : 'border border-warn/60 text-warn'
          }`}
        >
          {h.tag}
        </span>
      )}
      <p className="whitespace-pre-line text-xl font-semibold leading-snug break-keep">{h.title}</p>
      {h.why && <p className="text-sm leading-relaxed text-muted break-keep">{h.why}</p>}
    </div>
  );
}

/* ───────────────────────────── 투구의 흐름 ───────────────────────────── */

function Dot({ status }: { status: ReportStatus }) {
  const cls: Record<ReportStatus, string> = {
    improve: 'bg-warn',
    edge: 'border-[2.5px] border-warn bg-surface',
    fair: 'bg-line-strong',
    good: 'bg-ok',
    /* 참고 = 수치를 잰 지표(실선 고리 + 가운데 점), 확인 못 함 = 점선 빈 고리 — 색만으로 가르지 않는다 */
    note: 'border-2 border-muted bg-surface',
    unsure: 'border-[1.5px] border-dashed border-line-strong bg-surface',
  };
  return (
    <span className={`flex size-4 items-center justify-center rounded-full ${cls[status]}`} aria-hidden="true">
      {status === 'note' && <span className="size-1.5 rounded-full bg-muted" />}
    </span>
  );
}

function StatusTag({ status }: { status: ReportStatus }) {
  const cls: Record<ReportStatus, string> = {
    improve: 'bg-warn-bg text-warn',
    edge: 'border border-warn text-warn',
    fair: 'bg-surface-2 text-muted',
    good: 'bg-ok/15 text-ok',
    note: 'border border-muted text-muted',
    unsure: 'border border-dashed border-line-strong text-muted',
  };
  return (
    <span className={`inline-flex shrink-0 rounded-full px-2.5 py-0.5 text-footnote ${cls[status]}`}>{REPORT_STATUS_TEXT[status]}</span>
  );
}

/** 기준 띠 — 고칠 점 · 경계 · 보통 · 좋아요 네 칸 + 내 값 점 + 문턱 */
export function Gauge({ g, muted = false }: { g: ReportGauge; muted?: boolean }) {
  const x = (v: number) => Math.max(0, Math.min(100, ((v - g.lo) / (g.hi - g.lo)) * 100));
  const a = x(g.cut);
  const b = x(g.edgeEnd);
  const c = x(g.fairEnd);
  const seg = (from: number, to: number, cls: string) => (
    <span
      className={`absolute inset-y-0 ${muted ? 'bg-line' : cls}`}
      style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%` }}
    />
  );
  return (
    <div className={`relative h-9 ${muted ? 'opacity-50' : ''}`} aria-hidden="true">
      <div className="absolute inset-x-0 top-2.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
        {g.up ? (
          <>
            {seg(0, a, 'bg-warn/45')}
            {seg(a, b, 'bg-warn/15')}
            {seg(b, c, 'bg-line')}
            {seg(c, 100, 'bg-ok/30')}
          </>
        ) : (
          <>
            {seg(a, 100, 'bg-warn/45')}
            {seg(b, a, 'bg-warn/15')}
            {seg(c, b, 'bg-line')}
            {seg(0, c, 'bg-ok/30')}
          </>
        )}
      </div>
      <span
        className="absolute top-1 size-4 -translate-x-1/2 rounded-full border-[3px] border-surface bg-ink"
        style={{ left: `${x(g.value)}%` }}
      />
      <span className={`absolute top-5 -translate-x-1/2 text-caption ${muted ? 'text-muted' : 'text-warn'}`} style={{ left: `${a}%` }}>
        {muted ? '참고선' : '문턱'}
      </span>
    </div>
  );
}

export function FlowCard({
  report,
  onPick,
}: {
  report: PitchReport;
  /** 점을 고르면 그 순간으로(3D) */
  onPick: (item: ReportItem) => void;
}) {
  const first = report.items.find((i) => i.element === report.primary) ?? report.items[0];
  const [sel, setSel] = useState(first.element);
  const it = report.items.find((i) => i.element === sel) ?? first;
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-footnote text-muted">투구의 흐름</h2>
      <p className="px-1 text-caption text-muted">{coverageText(report.coverage)}</p>
      <div className="rounded-2xl bg-surface p-(--block-pad)">
        <div className="relative">
          <div className="absolute inset-x-5 top-2 h-px bg-line" />
          <div role="tablist" aria-label="여섯 요소" className="relative flex justify-between">
            {report.items.map((i) => {
              const on = i.element === sel;
              return (
                <button
                  key={i.element}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  aria-label={`${i.element} ${REPORT_STATUS_TEXT[i.status]}`}
                  onClick={() => {
                    setSel(i.element);
                    onPick(i);
                  }}
                  className="flex w-12 flex-col items-center gap-1.5"
                >
                  <Dot status={i.status} />
                  <span className={`text-caption whitespace-nowrap ${on ? 'font-semibold text-ink' : 'text-muted'}`}>{i.element}</span>
                </button>
              );
            })}
          </div>
        </div>
        <div role="tabpanel" className="mt-4 space-y-3 border-t border-line pt-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-semibold text-ink">{it.element}</span>
            <StatusTag status={it.status} />
          </div>
          <p className="text-sm leading-relaxed text-ink break-keep">{it.line}</p>
          {it.metricNote && <p className="text-caption text-muted break-keep">{it.metricNote}</p>}
          {it.value && (
            <div className="flex items-baseline gap-2">
              <span className="text-numeric text-3xl font-semibold tracking-tight text-ink">{it.value}</span>
              <span className="text-footnote text-muted break-keep">{it.valueLabel}</span>
            </div>
          )}
          {it.gauge && <Gauge g={it.gauge} muted={it.status === 'note' || it.status === 'unsure'} />}
          {it.foot && <p className="text-caption text-muted break-keep">{it.foot}</p>}
          <p className="text-caption text-muted">{measurementText(it)}</p>
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 처방 ───────────────────────────── */

function RxBlock({ rx }: { rx: ElementRx }) {
  const improve = rx.level === 'improve';
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold text-ink">{rx.element}</span>
        <span
          className={`inline-flex rounded-full px-2.5 py-0.5 text-footnote ${
            improve ? 'bg-warn-bg text-warn' : 'border border-warn text-warn'
          }`}
        >
          {improve ? '고칠 점' : '경계'}
        </span>
      </div>
      <p className={`border-l-2 pl-3 text-base leading-normal text-ink break-keep ${improve ? 'border-warn' : 'border-line-strong'}`}>
        {rx.cue}
      </p>
      {rx.weeks.length > 0 && (
        <ul className="divide-y divide-line">
          {rx.weeks.flatMap((w) =>
            w.drills.map((d) => (
              <li key={`${w.week}-${d.title}`} className="flex items-center gap-3 py-2.5">
                {d.thumbUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 참고 영상 썸네일(바깥 주소)
                  <img src={d.thumbUrl} alt="" className="size-11 shrink-0 rounded-lg bg-surface-2 object-cover" />
                ) : (
                  <span className="size-11 shrink-0 rounded-lg bg-surface-2" />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm text-ink break-keep">{d.title}</span>
                  <span className="block text-caption text-muted">
                    {w.stage} · {d.dose}
                  </span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
      {rx.target && (
        <div className="flex items-baseline gap-2 rounded-xl bg-surface-2 px-3.5 py-3">
          <span className="min-w-0 flex-1 text-caption text-muted break-keep">다음에 볼 숫자 · {rx.target.label}</span>
          <span className="text-numeric text-base text-muted">{rx.target.now}</span>
          <span className="text-muted" aria-hidden="true">
            →
          </span>
          <span className="text-numeric text-base font-semibold text-ok">{rx.target.goal}</span>
        </div>
      )}
    </div>
  );
}

/** 개선 드릴 카드 단추가 갈 곳(웹) — 무엇을 할지는 lib/pitch-3d/v2/report.ts rxAction(앱과 같은 판단) */
const RX_HREF = (kind: RxAction['kind'], elementKey: string) =>
  kind === 'progress'
    ? '/training?view=mechanics'
    : kind === 'retake'
      ? '/videos/lab'
      : `/training?view=mechanics&tab=elements&el=${elementKey}`;

export function RxCard({ report, mine, focus }: { report: PitchReport; mine: boolean; focus: FocusProgress }) {
  if (report.criteria !== REPORT_CRITERIA || report.rx.length === 0)
    return (
      <section className="space-y-2 rounded-2xl bg-surface p-(--block-pad)">
        <h2 className="font-semibold text-ink">개선 드릴</h2>
        <p className="text-sm text-muted">{prescriptionMessage(report)}</p>
      </section>
    );
  const main = report.rx[0];
  const cta = rxAction(mine, focus);
  const href = RX_HREF(cta.kind, main.key);
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-footnote text-muted">개선 드릴 · 쉬운 것부터</h2>
      <div className="space-y-5 rounded-2xl bg-surface p-(--block-pad)">
        {report.rx.map((rx) => (
          <RxBlock key={rx.element} rx={rx} />
        ))}
        {report.later.length > 0 && <p className="text-caption text-muted break-keep">다음 차례 · {report.later.join(' · ')}</p>}
        <div className="space-y-2">
          <ButtonLink href={href} size="lg" className="w-full">
            {cta.label}
          </ButtonLink>
          {cta.note && <p className="text-center text-caption text-muted break-keep">{cta.note}</p>}
        </div>
      </div>
    </section>
  );
}

/* ───────────────────────────── 지난번 리포트와 견주기 ───────────────────────────── */

/** 바로 앞 내 리포트와 숫자 견주기 — 촬영 조건이 같다고 확인해야 펴진다(lib/pitch-3d/v2/compare-view.ts · 앱과 같은 글) */
export function CompareCard({ prev }: { prev: PreviousComparison }) {
  const [same, setSame] = useState(false);
  return (
    <section className="space-y-2">
      <h2 className="px-1 text-footnote text-muted">지난번 리포트와 견주기 · {prevDateText(prev.requestedAt)}</h2>
      <div className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
        {!prev.compared ? (
          <p className="text-sm text-muted break-keep">{prev.reason ?? '양쪽에서 견줄 수 있는 지표가 없어요.'}</p>
        ) : !same ? (
          <>
            <p className="text-sm text-ink break-keep">숫자는 촬영 조건이 같을 때만 견줄 수 있어요.</p>
            <Button variant="secondary" className="w-full" onClick={() => setSame(true)}>
              {PREV_CONFIRM}
            </Button>
          </>
        ) : (
          <>
            <ul className="divide-y divide-line">
              {prev.rows.map((r) => (
                <li key={r.key} className="flex items-baseline justify-between gap-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-sm text-ink">{r.element}</span>
                    <span className="block text-caption text-muted break-keep">{r.label}</span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block text-sm text-ink tabular-nums">
                      {compareRangeText(r.element, r.unit, r.before, r.after)}
                    </span>
                    <span className="block text-caption text-muted tabular-nums">{compareDeltaText(r.unit, r.delta)}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-muted break-keep">{prev.note}</p>
          </>
        )}
        <Link href={`/videos/lab/${prev.reportId}`} className="inline-flex min-h-10 items-center text-sm font-semibold text-sky-strong">
          지난번 리포트 보기 ›
        </Link>
      </div>
    </section>
  );
}
