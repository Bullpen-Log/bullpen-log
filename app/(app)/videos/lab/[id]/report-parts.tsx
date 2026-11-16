'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Button, ButtonLink } from '@/components/ui';
import { labGuideHref } from '@/lib/pitch-lab-guide';
import { compareDeltaText, compareRangeText, prevDateText, PREV_CONFIRM, type PreviousComparison } from '@/lib/pitch-3d/v2/compare-view';
import {
  REPORT_STATUS_TEXT,
  REPORT_CRITERIA,
  WHY_SHORT,
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
import { ELEMENT_PLAIN, itemGood, itemSay, nextStepsOf, reportLead, reportTally, sceneLabel, showsGauge, type ReportNextStep } from '@/lib/pitch-3d/v2/report-view';

/**
 * 투구 진단 리포트 조각 — 한눈 요약(좋아요 · 보통 · 고칠 점 수 + 먼저 고칠 것 하나) · 동작 여섯 줄(눌러 펴기) · 추천 훈련 · 지난번과 견주기.
 * 2026-11-16 김민: "문구가 AI 같고 조잡해 정보가 안 들어온다" → 한 칸에 말 하나 · 숫자 하나, 범위 · 제한 설명은 편 칸 안으로.
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

/** 기준 띠 — 고칠 점 · 경계 · 보통 · 좋아요 네 칸 + 내 값 점, 양 끝에 어느 쪽이 좋은지. 평가한 칸에만 그린다(report-view showsGauge) */
export function Gauge({ g }: { g: ReportGauge }) {
  const x = (v: number) => Math.max(0, Math.min(100, ((v - g.lo) / (g.hi - g.lo)) * 100));
  const a = x(g.cut);
  const b = x(g.edgeEnd);
  const c = x(g.fairEnd);
  const seg = (from: number, to: number, cls: string) => (
    <span className={`absolute inset-y-0 ${cls}`} style={{ left: `${Math.min(from, to)}%`, width: `${Math.abs(to - from)}%` }} />
  );
  return (
    <div className="space-y-1" aria-hidden="true">
      <div className="relative flex h-5 items-center">
        <div className="relative h-2 w-full overflow-hidden rounded-full bg-line">
          {g.up ? (
            <>
              {seg(0, a, 'bg-warn/45')}
              {seg(a, b, 'bg-warn/15')}
              {seg(b, c, 'bg-line')}
              {seg(c, 100, 'bg-ok/40')}
            </>
          ) : (
            <>
              {seg(a, 100, 'bg-warn/45')}
              {seg(b, a, 'bg-warn/15')}
              {seg(c, b, 'bg-line')}
              {seg(0, c, 'bg-ok/40')}
            </>
          )}
        </div>
        <span className="absolute size-[18px] -translate-x-1/2 rounded-full border-[3px] border-surface bg-ink" style={{ left: `${x(g.value)}%` }} />
      </div>
      <div className="flex justify-between text-xs font-semibold">
        <span className={g.up ? 'text-warn' : 'text-ok'}>{g.up ? '고칠 점' : '좋아요'}</span>
        <span className={g.up ? 'text-ok' : 'text-warn'}>{g.up ? '좋아요' : '고칠 점'}</span>
      </div>
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

/* ───────────────────────────── 한눈 요약 ───────────────────────────── */

const TONE: Record<ReportStatus, string> = { improve: 'text-warn', edge: 'text-warn', good: 'text-ok', fair: 'text-muted', note: 'text-muted', unsure: 'text-muted' };

function Stat({ n, label, cls }: { n: number; label: string; cls: string }) {
  return (
    <div className="flex-1" aria-label={`${label} ${n}개`}>
      <p className={`text-numeric text-3xl font-bold ${n > 0 ? cls : 'text-line-strong'}`}>{n}</p>
      <p className="text-footnote text-muted">{label}</p>
    </div>
  );
}

/** 지금 값 → 좋아요 기준 */
function NowGoal({ now, good }: { now: string; good: string | null }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
      <div className="flex-1">
        <p className="text-footnote text-muted">지금</p>
        <p className="text-numeric text-2xl font-bold text-ink">{now}</p>
      </div>
      {good && (
        <>
          <span aria-hidden="true" className="text-lg text-line-strong">
            →
          </span>
          <div className="flex-1">
            <p className="text-footnote text-muted">좋아요 기준</p>
            <p className="text-numeric text-2xl font-bold text-ok">{good}</p>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 맨 위 한 장 — 숫자 셋(좋아요 · 보통 · 고칠 점)과 먼저 고칠 것 하나(말 한 줄 · 지금 → 좋아요 기준 · 장면). 고칠 점이 없으면 그 사실만.
 * 고칠 점을 만들어 내지 않는다(report-view reportLead). 평가한 동작이 하나도 없으면 까닭 한 줄.
 */
export function Summary({ report, onScene }: { report: PitchReport; onScene: (item: ReportItem) => void }) {
  const lead = reportLead(report);
  const t = reportTally(report);
  const judged = t.good + t.fair + t.bad;
  const it = lead.kind === 'finding' ? lead.item : null;
  return (
    <section aria-label="한눈 요약" className="space-y-4 rounded-2xl bg-surface p-(--block-pad)">
      {judged > 0 && (
        <div className="flex gap-2">
          <Stat n={t.good} label="좋아요" cls="text-ok" />
          <Stat n={t.fair} label="보통" cls="text-ink" />
          <Stat n={t.bad} label="고칠 점" cls="text-warn" />
          {t.unseen > 0 && <Stat n={t.unseen} label="확인 못 함" cls="text-muted" />}
        </div>
      )}
      {it ? (
        <div className={`space-y-2.5 ${judged > 0 ? 'border-t border-line pt-4' : ''}`}>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-bold text-ink">{it.element}</span>
            <StatusTag status={it.status} />
          </div>
          <p className="text-base leading-normal text-ink break-keep">{itemSay(it)}</p>
          {it.value != null && <NowGoal now={it.value} good={itemGood(it)} />}
          {it.frame != null && <SceneButton item={it} onScene={onScene} />}
        </div>
      ) : judged > 0 ? (
        <p className="text-base font-semibold text-ink">{t.bad === 0 ? '고칠 점이 없어요.' : lead.kind === 'scope' ? lead.title : ''}</p>
      ) : (
        <div className="space-y-1.5">
          <p className="whitespace-pre-line text-base font-semibold leading-snug text-ink break-keep">{lead.kind === 'scope' ? lead.title : ''}</p>
          {lead.kind === 'scope' && lead.note && <p className="text-sm leading-relaxed text-muted break-keep">{lead.note}</p>}
        </div>
      )}
    </section>
  );
}

/* ───────────────────────────── 동작 여섯 가지 ───────────────────────────── */

/**
 * 여섯 줄 — 이름 · 쉬운 말 · 내 숫자 · 상태가 한 줄에 다 보인다. 누르면 그 줄이 펴진다: 말 한 줄 → 띠(평가한 칸만) → 좋아요 기준 · 왜 중요한지 → 장면.
 * 처음엔 다 접혀 있다(먼저 고칠 것은 위 요약 장에 있다). 줄을 펴는 것만으로는 3D 를 옮기지 않는다 — 장면 단추가 옮긴다.
 */
export function FlowCard({
  report,
  onPick,
}: {
  report: PitchReport;
  /** 장면 단추 — 3D · 원본 영상을 그 순간으로 */
  onPick: (item: ReportItem) => void;
}) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <section className="space-y-2" aria-label="동작 여섯 가지">
      <h2 className="px-1 font-semibold text-ink">동작 여섯 가지</h2>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-surface">
        {report.items.map((i) => {
          const on = open === i.element;
          const panel = `report-el-${i.key || i.element}`;
          const good = itemGood(i);
          return (
            <li key={i.element}>
              <button
                type="button"
                aria-expanded={on}
                aria-controls={panel}
                onClick={() => setOpen(on ? null : i.element)}
                className="flex min-h-16 w-full items-center gap-3 px-(--block-pad) py-2.5 text-left transition-colors active:bg-ink/4 desk:hover:bg-surface-2"
              >
                <Dot status={i.status} />
                <span className="min-w-0 flex-1">
                  <span className="block text-base font-semibold text-ink">{i.element}</span>
                  <span className="block truncate text-footnote text-muted">{ELEMENT_PLAIN[i.element] ?? ''}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={`text-numeric block text-xl font-bold ${i.value != null ? 'text-ink' : 'text-line-strong'}`}>{i.value ?? '–'}</span>
                  <span className={`block text-footnote font-semibold ${TONE[i.status]}`}>{REPORT_STATUS_TEXT[i.status]}</span>
                </span>
              </button>
              {on && (
                <div id={panel} className="space-y-3 px-(--block-pad) pb-4">
                  <p className="text-base leading-normal text-ink break-keep">{itemSay(i)}</p>
                  {showsGauge(i) && <Gauge g={i.gauge!} />}
                  {good && i.status !== 'good' && (
                    <p className="text-sm text-ink">
                      좋아요 기준 <span className="font-semibold text-ok tabular-nums">{good}</span>
                    </p>
                  )}
                  {i.status !== 'unsure' && <p className="text-footnote text-muted break-keep">{WHY_SHORT[i.element]}</p>}
                  {i.status === 'note' && i.foot && <p className="text-footnote text-muted break-keep">{i.foot}</p>}
                  {(i.valueLabel || i.metricNote) && (
                    <p className="whitespace-pre-line text-footnote text-muted break-keep">
                      {[i.valueLabel ? `잰 것 · ${i.valueLabel}` : null, i.metricNote].filter(Boolean).join('\n')}
                    </p>
                  )}
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

/** 추천 훈련 한 요소(카드 한 장) — 이름 · 상태 · 코칭 한 줄 · 드릴 이름 · 목표 숫자 */
function RxBlock({ rx, drills }: { rx: ElementRx; drills: ElementRx['weeks'][number]['drills'] }) {
  const improve = rx.level === 'improve';
  return (
    <div className="space-y-2.5 rounded-2xl bg-surface p-(--block-pad)">
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-semibold text-ink">{rx.element}</span>
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-footnote ${improve ? 'bg-warn-bg text-warn' : 'border border-warn text-warn'}`}>
          {improve ? '고칠 점' : '경계'}
        </span>
      </div>
      <p className="text-base font-semibold leading-normal text-ink break-keep">{rx.cue}</p>
      {drills.length > 0 && (
        <ul className="divide-y divide-line border-t border-line">
          {drills.map((d) => (
            <li key={d.title} className="flex items-center gap-3 py-2.5">
              {d.thumbUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- 참고 영상 썸네일(바깥 주소)
                <img src={d.thumbUrl} alt="" className="size-11 shrink-0 rounded-lg bg-surface-2 object-cover" />
              ) : (
                <span className="size-11 shrink-0 rounded-lg bg-surface-2" />
              )}
              <span className="min-w-0 flex-1 text-sm text-ink break-keep">{d.title}</span>
            </li>
          ))}
        </ul>
      )}
      {rx.target && (
        <div className="space-y-1 rounded-xl bg-surface-2 px-3.5 py-3">
          <p className="text-footnote text-muted break-keep">목표 · {rx.target.label}</p>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-numeric text-xl font-bold text-ink">{rx.target.now}</span>
            <span className="text-line-strong" aria-hidden="true">
              →
            </span>
            <span className="text-numeric text-xl font-bold text-ok">{rx.target.goal}</span>
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

/**
 * trainingOpen — 트레이닝(메커니즘 진행 · 요소별 드릴)을 열 수 있나. 출시 전 베타(2026-10-29)의 일반 · 준관리자는 잠겨 있어,
 * 보고서의 드릴 이름 · 횟수는 그대로 보이고 그리로 가는 단추만 뺀다('다시 찍기' · 촬영 안내는 투구 3D 라 남김). 보고서가 잠긴 기능의 우회로가 되지 않게.
 */
export function RxCard({
  report,
  mine,
  focus,
  trainingOpen = true,
}: {
  report: PitchReport;
  mine: boolean;
  focus: FocusProgress;
  trainingOpen?: boolean;
}) {
  if (report.criteria !== REPORT_CRITERIA || report.rx.length === 0) {
    const steps = (report.criteria === REPORT_CRITERIA && report.coverage ? nextStepsOf(report) : []).filter(
      (s) => trainingOpen || s.kind === 'guide'
    );
    return (
      <section className="space-y-3 rounded-2xl bg-surface p-(--block-pad)">
        <h2 className="font-semibold text-ink">추천 훈련</h2>
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
  /* 베타 — 트레이닝으로 가는 단추(진행 · 추천 훈련 보기)는 빼고 다시 찍기만 */
  const ctaOpen = trainingOpen || cta.kind === 'retake';
  /* 드릴은 처방 전체에서 많아야 2개(앱과 같게) */
  const blocks = report.rx.reduce<{ rx: ElementRx; drills: ElementRx['weeks'][number]['drills'] }[]>((acc, rx) => {
    const used = acc.reduce((n, b) => n + b.drills.length, 0);
    const all = rx.weeks.flatMap((w) => w.drills);
    return [...acc, { rx, drills: all.filter((d, n) => all.findIndex((x) => x.title === d.title) === n).slice(0, Math.max(0, 2 - used)) }];
  }, []);
  return (
    <section className="space-y-3">
      <h2 className="px-1 font-semibold text-ink">추천 훈련</h2>
      {/* 요소마다 카드 한 장(2026-11-16 김민: "같은 칸 안에 있으니 하나 같다") */}
      {blocks.map((b) => (
        <RxBlock key={b.rx.element} rx={b.rx} drills={b.drills} />
      ))}
      {report.later.length > 0 && <p className="px-1 text-footnote text-muted break-keep">다음 차례 · {report.later.join(' · ')}</p>}
      {ctaOpen ? (
        <ButtonLink href={href} size="lg" className="w-full">
          {cta.label}
        </ButtonLink>
      ) : (
        <p className="px-1 text-footnote text-muted break-keep">추천 훈련 화면은 준비 중이에요. 위 드릴을 참고해 연습해 보세요.</p>
      )}
    </section>
  );
}

/* ───────────────────────────── 지난번 리포트와 견주기 ───────────────────────────── */

/** 바로 앞 내 리포트와 숫자 견주기 — 촬영 조건이 같다고 확인해야 펴진다(lib/pitch-3d/v2/compare-view.ts · 앱과 같은 글) */
export function CompareCard({ prev }: { prev: PreviousComparison }) {
  const [same, setSame] = useState(false);
  return (
    <section className="space-y-2">
      <div className="flex items-baseline justify-between gap-3 px-1">
        <h2 className="font-semibold text-ink">지난번과 견주기</h2>
        <p className="text-footnote text-muted">{prevDateText(prev.requestedAt)}</p>
      </div>
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
