'use client';

import { useActionState, useState } from 'react';
import { useFormStatus } from 'react-dom';
import {
  AlertTriangle,
  ChevronDown,
  Minus,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import { generateAiReport, type AiReportState } from '@/app/actions/ai-report';
import {
  REPORT_EVERY_PITCH_LOGS,
  type ReportReadiness,
} from '@/lib/report/cadence';
import type { AiReportBody } from '@/lib/ai/report-prompt';
import type { PitchPlan } from '@/lib/report/plan';

export type StoredReport = {
  asOf: string;
  halted: boolean;
  haltReason: string | null;
  body: AiReportBody | null;
  plan: PitchPlan;
  createdAt: string;
};

function GenerateButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl bg-sky px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Sparkles className={`h-4 w-4 ${pending ? 'animate-pulse' : ''}`} />
      {pending ? '분석 중… (10초쯤 걸립니다)' : label}
    </button>
  );
}

/** 하루치 계획 한 줄 */
function DayRow({ day }: { day: PitchPlan['days'][number] }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-3 ${
        day.throwing
          ? 'border-line bg-surface-2'
          : 'border-sky-500/30 bg-sky-500/[0.06]'
      }`}
    >
      <span className="w-12 shrink-0 text-sm font-bold text-ink">
        {day.label}
      </span>
      <span className="shrink-0 text-[11px] tabular-nums text-muted/70">
        {day.dateKey.slice(5)}
      </span>

      {day.throwing ? (
        <span className="flex items-baseline gap-1.5">
          <Sun className="h-3.5 w-3.5 self-center text-sky" />
          <span className="text-display text-xl leading-none text-sky tabular-nums">
            {day.maxPitches}
          </span>
          <span className="text-xs text-muted">구 이하</span>
          <span className="mx-1 text-line-strong">·</span>
          <span className="text-xs text-muted">
            강도 <span className="text-ink">{day.maxIntensity}</span> 이하
          </span>
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-sm font-medium text-sky-strong">
          <Moon className="h-3.5 w-3.5" />
          휴식
        </span>
      )}

      <span className="ml-auto text-[11px] text-muted/70">{day.reason}</span>
    </div>
  );
}

/**
 * 접었다 펴는 한 덩이.
 *
 * 리포트는 모바일에서 1,900px이었다 — 폰 화면 두 개 반. 매일 다 읽을 내용이
 * 아닌데 전부 펼쳐져 있으니, 아래 '기간별 돌아보기'까지 가려면 한참 굴려야 했다.
 *
 * 오늘 무엇을 할지(headline·향후 3일·실행 항목 제목)는 열어 두고, 왜 그런지와
 * 지켜볼 점은 접는다. 궁금할 때만 열면 된다.
 *
 * <details> 를 쓴다. 열고 닫는 상태를 우리가 들고 있을 이유가 없고,
 * 자바스크립트가 아직 안 붙은 순간에도 눌린다.
 */
function Section({
  title,
  hint,
  children,
}: {
  title: string;
  /** 접혀 있을 때 제목 옆에 보이는 한 줄 */
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <details className="group border-t border-line pt-4">
      <summary className="flex cursor-pointer list-none items-center gap-1.5">
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted transition-transform group-open:rotate-180" />
        <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          {title}
        </span>
        {hint && (
          <span className="min-w-0 flex-1 truncate text-[11px] text-muted/60">
            {hint}
          </span>
        )}
      </summary>
      <div className="mt-3">{children}</div>
    </details>
  );
}

export function AiReportCard({
  report,
  readiness,
  aiReady,
}: {
  report: StoredReport | null;
  /** 투구 기록이 몇 번 쌓였는지, 지금 만들 수 있는지 */
  readiness: ReportReadiness;
  aiReady: boolean;
}) {
  const [state, formAction] = useActionState<AiReportState, FormData>(
    generateAiReport,
    undefined
  );
  const [showBasis, setShowBasis] = useState(false);

  const plan = report?.plan;

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface">
      {/* 머리말 */}
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4 sm:px-6">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-sky-soft/50 bg-sky/10 text-sky">
          <Sparkles className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          {/*
            이름에서는 'AI'를 뺐지만, 여기서는 AI를 실제로 부른다.
            무엇을 코드가 계산하고 무엇을 AI가 쓰는지는 아래 안내에 적혀 있다.
          */}
          <h2 className="text-sm font-bold text-ink">리포트</h2>
          <p className="mt-0.5 text-xs text-muted">
            {report
              ? `${report.asOf} 기준 · 다시 만들기 전까지 내용이 바뀌지 않습니다`
              : '기록을 바탕으로 앞으로 3일 투구 계획을 만듭니다'}
          </p>
        </div>

        {/*
          날짜가 아니라 기록 수로 연다. 하루 사이에는 달라지는 것이 거의 없어,
          어제 리포트와 오늘 리포트가 거의 같은 말을 했다.
        */}
        {aiReady && readiness.ready && (
          <form action={formAction}>
            <GenerateButton label={report ? '다시 만들기' : '리포트 만들기'} />
          </form>
        )}
      </div>

      <div className="space-y-5 px-5 py-5 sm:px-6 sm:py-6">
        {state?.error && (
          <p className="rounded-lg border border-danger-line bg-danger-bg px-4 py-3 text-sm text-danger">
            {state.error}
          </p>
        )}

        {!aiReady && (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            AI 기능이 아직 설정되지 않았습니다.
          </p>
        )}

        {/*
          아직 못 만드는 날에도 무엇을 기다리는지는 보여준다.
          단추만 없으면 고장 난 것으로 보인다.
        */}
        {aiReady && !readiness.ready && (
          <div className="rounded-xl border border-dashed border-line px-4 py-6 text-center">
            <p className="text-sm leading-relaxed text-muted">{readiness.message}</p>
            <div className="mx-auto mt-3 h-1.5 max-w-56 overflow-hidden rounded-full bg-surface-2">
              <div
                className="h-full rounded-full bg-sky/60"
                style={{
                  width: `${(readiness.newRecords / REPORT_EVERY_PITCH_LOGS) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {aiReady && readiness.ready && !report && (
          <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
            {readiness.message} 위 버튼을 눌러 만들어보세요.
          </p>
        )}

        {/* 이미 만든 리포트가 있는데 새 기록이 쌓인 경우 */}
        {aiReady && readiness.ready && report && (
          <p className="rounded-lg border border-sky-soft/60 bg-sky-tint px-4 py-2.5 text-xs leading-relaxed text-sky-strong">
            {readiness.message}
          </p>
        )}

        {/* 통증 등으로 계획을 내지 않은 경우 */}
        {report?.halted && (
          <div className="rounded-xl border border-danger-line bg-danger-bg p-5">
            <p className="flex items-center gap-2 text-sm font-bold text-danger">
              <AlertTriangle className="h-4 w-4" />
              투구 계획을 제공하지 않았습니다
            </p>
            <p className="mt-2 text-sm leading-relaxed text-danger/80">
              {report.haltReason}
            </p>
          </div>
        )}

        {/* 정상 리포트 */}
        {report && !report.halted && report.body && plan && (
          <>
            <p className="text-lg font-bold leading-snug text-ink">
              {report.body.headline}
            </p>

            {/*
              해석은 접는다. 한 줄 요약(headline)이 위에 있고, 오늘 무엇을
              할지는 아래 계획에 있다. 왜 그런지가 궁금할 때만 열면 된다.
            */}
            <Section title="지금 상태 해석">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink/80">
                {report.body.assessment}
              </p>
            </Section>

            {/* 코드가 계산한 계획 — 리포트의 근거. 오늘 할 일이라 늘 펼쳐 둔다 */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                향후 3일 계획
              </p>
              {plan.days.map((day) => (
                <DayRow key={day.dateKey} day={day} />
              ))}
              <p className="pt-1 text-[11px] tabular-nums text-muted/70">
                3일 합계 상한 {plan.threeDayTotal}구
              </p>
            </div>

            {plan.youthNote && (
              <p className="rounded-xl border border-warn-line bg-warn-bg px-4 py-3 text-xs leading-relaxed text-warn">
                {plan.youthNote}
              </p>
            )}

            {/* 실행 항목 */}
            <div className="space-y-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
                실행 항목
              </p>
              {/*
                제목은 늘 보이고 이유만 접는다. 무엇을 할지는 한눈에 들어와야
                하고, 왜 그런지는 물음이 생겼을 때 열면 된다.
              */}
              {report.body.actions.map((action, i) => (
                <details
                  key={i}
                  className="group rounded-xl border border-line bg-surface-2 px-4 py-3"
                >
                  <summary className="flex cursor-pointer list-none items-start gap-2">
                    <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180" />
                    <span className="text-sm font-semibold text-ink">
                      {action.title}
                    </span>
                  </summary>
                  <p className="mt-2 pl-6 text-sm leading-relaxed text-muted">
                    {action.detail}
                  </p>
                </details>
              ))}
            </div>

            {/* 지켜볼 점 — 오늘 당장 할 일은 아니라 접어 둔다 */}
            {report.body.watchouts.length > 0 && (
              <Section
                title="지켜볼 점"
                hint={`${report.body.watchouts.length}가지`}
              >
                <ul className="space-y-1.5">
                  {report.body.watchouts.map((w, i) => (
                    <li key={i} className="flex gap-2 text-sm leading-relaxed text-muted">
                      <Minus className="mt-1.5 h-3 w-3 shrink-0 text-sky/60" />
                      <span>{w}</span>
                    </li>
                  ))}
                </ul>
              </Section>
            )}
          </>
        )}

        {/* 계획이 나온 근거 — 언제든 펼쳐서 검산할 수 있게 한다 */}
        {plan && plan.basis.length > 0 && (
          <div className="border-t border-line pt-4">
            <button
              type="button"
              onClick={() => setShowBasis((v) => !v)}
              aria-expanded={showBasis}
              className="flex items-center gap-1.5 text-[11px] text-muted transition-colors hover:text-sky"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${showBasis ? 'rotate-180' : ''}`}
              />
              이 계획이 나온 근거
            </button>

            {showBasis && (
              <ul className="mt-3 space-y-1.5">
                {plan.basis.map((b, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-[11px] leading-relaxed text-muted"
                  >
                    <span className="text-line-strong">·</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted/60">
          수치와 계획은 기록에서 규칙으로 계산한 값이고, 문장은 그 수치를 설명한
          것입니다. 훈련량 관리를 돕는 참고 자료이며 의학적 진단이 아닙니다.
          통증이 있으면 수치와 관계없이 전문의와 상담하세요.
        </p>
      </div>
    </section>
  );
}
