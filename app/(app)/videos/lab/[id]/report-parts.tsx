'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui';
import { labGuideHref } from '@/lib/pitch-lab-guide';
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
import { itemObs, itemSub, nextStepsOf, reportLead, sceneLabel, showsGauge, type ReportNextStep } from '@/lib/pitch-3d/v2/report-view';

/**
 * 투구 진단 리포트 조각(2026-10-27 개편 — 장면 → 근거 → 해석 → 다음 선택) — 이번 투구의 핵심 · 여섯 요소 판독 · 개선 드릴 · 지난번과 견주기.
 * 3D 무대 · 원본 영상은 lab-detail.tsx. 색은 sky(누름) · warn(문제) · ok(좋아요) 셋, 상태는 색 · 모양 · 글 셋으로 가른다.
 * 앱 화면(native/src/lab/report.tsx)도 같은 차례 · 같은 글(고르기는 lib/pitch-3d/v2/report-view.ts).
 */

/* ───────────────────────────── 상태 표시 ───────────────────────────── */

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
    <span className={`flex size-4 shrink-0 items-center justify-center rounded-full ${cls[status]}`} aria-hidden="true">
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

/** 기준 띠 — 고칠 점 · 경계 · 보통 · 좋아요 네 칸 + 내 값 점 + 문턱. 평가한 칸에만 그린다(report-view showsGauge) */
export function Gauge({ g }: { g: ReportGauge }) {
  const x = (v: number) => Math.max(0, Math.min(100, ((v - g.lo) / (g.hi - g.lo)) * 100));
  const a = x(g.cut);
  const b = x(g.edgeEnd);
  const c = x(g.fairEnd);
  const seg = (from: number, to: number, cls: string) => (
    <span className={`absolute inset-y-0 ${cls}`} style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%` }} />
  );
  return (
    <div className="relative h-9" aria-hidden="true">
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
      <span className="absolute top-1 size-4 -translate-x-1/2 rounded-full border-[3px] border-surface bg-ink" style={{ left: `${x(g.value)}%` }} />
      <span className="absolute top-5 -translate-x-1/2 text-caption text-warn" style={{ left: `${a}%` }}>
        문턱
      </span>
    </div>
  );
}

/** '착지 장면 보기' · '앞무릎이 가장 굽은 장면 보기' — 3D 와 원본 영상을 그 장면에 세우고 무대로 간다(lab-detail onScene) */
function SceneButton({ item, onScene }: { item: ReportItem; onScene: (item: ReportItem) => void }) {
  return (
    <button
      type="button"
      onClick={() => onScene(item)}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-surface-2 px-4 text-sm font-semibold text-ink transition-colors active:bg-line desk:hover:bg-line"
    >
      <span aria-hidden="true" className="text-xs">
        ▶
      </span>
      {sceneLabel(item)}
    </button>
  );
}

/* ───────────────────────────── 이번 투구의 핵심 ───────────────────────────── */

/**
 * 맨 위 한 가지 — 처방할 주 문제면 그 수치 · 관찰 · 근거 · 장면, 없으면 확인 범위(report-view reportLead). 고칠 점을 만들어 내지 않는다.
 * 요소의 일반 설명(headline.why)은 이 투구에서 확인한 사실이 아니라 쓰지 않는다.
 */
export function KeyFinding({ report, onScene }: { report: PitchReport; onScene: (item: ReportItem) => void }) {
  const lead = reportLead(report);
  if (lead.kind === 'scope')
    return (
      <section aria-label="이번 투구의 핵심" className="space-y-2 rounded-2xl bg-surface p-(--block-pad)">
        <p className="text-footnote text-muted">이번 투구에서 확인한 범위</p>
        <p className="whitespace-pre-line text-lg font-semibold leading-snug text-ink break-keep">{lead.title}</p>
        {lead.note && <p className="text-sm leading-relaxed text-muted break-keep">{lead.note}</p>}
        <p className="text-caption text-muted">{coverageText(report.coverage)}</p>
      </section>
    );
  const it = lead.item;
  return (
    <section aria-label="이번 투구의 핵심" className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag status={it.status} />
        <span className="text-footnote text-muted">먼저 볼 것 · {it.element}</span>
      </div>
      <div className="space-y-0.5">
        <p className="text-footnote text-muted break-keep">{it.valueLabel}</p>
        <p className="text-numeric text-4xl font-semibold tracking-tight text-ink">{it.value}</p>
      </div>
      <p className="text-base leading-normal text-ink break-keep">{itemObs(it)}</p>
      {it.foot && <p className="text-caption text-muted break-keep">{it.foot}</p>}
      {it.frame != null && <SceneButton item={it} onScene={onScene} />}
    </section>
  );
}

/* ───────────────────────────── 여섯 요소 판독 ───────────────────────────── */

/**
 * 여섯 요소를 한 장에서 훑는다(상태 · 잰 것 · 값) — 줄을 누르면 그 자리에서 펴진다: 관찰 → 띠(평가한 칸만) → 읽는 법 · 해석 범위 → 장면.
 * 처음엔 주 문제 줄만 펴 둔다. 줄을 펴는 것만으로는 3D 를 옮기지 않는다(읽던 자리를 잃지 않게) — 장면 단추가 옮긴다.
 */
export function FlowCard({
  report,
  onPick,
}: {
  report: PitchReport;
  /** 장면 단추 — 3D · 원본 영상을 그 순간으로 */
  onPick: (item: ReportItem) => void;
}) {
  const [open, setOpen] = useState<string | null>(report.primary);
  return (
    <section className="space-y-2" aria-label="여섯 요소 판독">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 px-1">
        <h2 className="text-footnote text-muted">여섯 요소 판독</h2>
        <p className="text-caption text-muted">{coverageText(report.coverage)}</p>
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {report.items.map((i) => {
          const on = open === i.element;
          const panel = `report-el-${i.key || i.element}`;
          return (
            <li key={i.element}>
              <button
                type="button"
                aria-expanded={on}
                aria-controls={panel}
                onClick={() => setOpen(on ? null : i.element)}
                className="flex min-h-14 w-full items-center gap-3 px-(--block-pad) py-2.5 text-left transition-colors active:bg-ink/4 desk:hover:bg-surface-2"
              >
                <Dot status={i.status} />
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{i.element}</span>
                  <span className="line-clamp-2 block text-caption text-muted break-keep">{itemSub(i)}</span>
                </span>
                <span className="text-numeric shrink-0 text-base font-semibold text-ink">{i.value ?? '—'}</span>
                <StatusTag status={i.status} />
                <span aria-hidden="true" className={`shrink-0 text-muted transition-transform ${on ? 'rotate-90' : ''}`}>
                  ›
                </span>
              </button>
              {on && (
                <div id={panel} className="space-y-3 px-(--block-pad) pb-4">
                  <p className="text-sm leading-relaxed text-ink break-keep">{itemObs(i)}</p>
                  {showsGauge(i) && <Gauge g={i.gauge!} />}
                  {i.foot && <p className="text-caption text-muted break-keep">{i.foot}</p>}
                  {i.metricNote && <p className="text-caption text-muted break-keep">{i.metricNote}</p>}
                  <p className="text-caption text-muted">{measurementText(i)}</p>
                  {i.frame != null && <SceneButton item={i} onScene={onPick} />}
                </div>
              )}
            </li>
          );
        })}
      </ul>
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
        <div className="space-y-1 rounded-xl bg-surface-2 px-3.5 py-3">
          <p className="text-caption text-muted break-keep">다음에 볼 숫자 · {rx.target.label}</p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-numeric text-base text-muted">{rx.target.now}</span>
            <span className="text-muted" aria-hidden="true">
              →
            </span>
            <span className="text-numeric text-base font-semibold text-ok">{rx.target.goal}</span>
          </p>
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

/** 처방이 없을 때 이어 갈 길(웹) — 촬영 안내 · 요소 설명(report-view nextStepsOf) */
const STEP_HREF = (s: ReportNextStep) =>
  s.kind === 'guide' ? labGuideHref('frame') : `/training?view=mechanics&tab=elements&el=${s.elementKey}`;

export function RxCard({ report, mine, focus }: { report: PitchReport; mine: boolean; focus: FocusProgress }) {
  if (report.criteria !== REPORT_CRITERIA || report.rx.length === 0) {
    const steps = report.criteria === REPORT_CRITERIA && report.coverage ? nextStepsOf(report) : [];
    return (
      <section className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
        <h2 className="font-semibold text-ink">개선 드릴</h2>
        <p className="text-sm text-muted break-keep">{prescriptionMessage(report)}</p>
        {steps.length > 0 && (
          <ul className="space-y-2">
            {steps.map((s) => (
              <li key={s.kind}>
                <Link
                  href={STEP_HREF(s)}
                  className="flex min-h-12 items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-2.5 transition-colors active:bg-line desk:hover:bg-line"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold text-ink">{s.label}</span>
                    <span className="block text-caption text-muted break-keep">{s.note}</span>
                  </span>
                  <span aria-hidden="true" className="text-muted">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }
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
