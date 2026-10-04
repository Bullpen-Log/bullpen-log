'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import {
  Check,
  CircleCheck,
  ClipboardCheck,
  FlaskConical,
  Moon,
  Play,
  Sprout,
  Stethoscope,
  TrendingDown,
} from 'lucide-react';
import { ConfirmDialog } from '@/components/confirm-delete';
import { ErrorLine } from '@/components/error-line';
import { Modal, useModalState } from '@/components/modal';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import type {
  GateCheck,
  RehabConditionKey,
  RehabLine,
  RehabResult,
  RehabStage,
  StageTest,
} from '@/lib/armcare/rehab';
import { endRehab } from '@/app/actions/rehab';
import { Checklist, type ArmcareTodayItem } from './armcare-today';
import { RedFlags } from './arm-pain-guide-body';
import { DiagnosisSheet, StageChangeSheet, StageTestSheet } from './rehab-sheets';
import {
  ThrowingOpenFlow,
  ThrowingProgram,
  type RehabThrowingView,
} from './rehab-throwing';
import { WeeklyFlow } from './rehab-weekly';
import { DisclosureButton } from '@/components/disclosure';

/** 재활 카드가 그리는 것 — 서버(armcare-section.tsx)가 규칙(lib/armcare/rehab.ts)으로 만들어 넘긴다 */
export type RehabCardView = {
  /** 이 카드의 날(YYYY-MM-DD) — 체크 · 따라하기가 이 날에 남긴다 */
  dateKey: string;
  /** '팔꿈치 안쪽' · 'UCL 부분 손상' */
  title: string;
  stage: RehabStage;
  stageName: string;
  severityLabel: string;
  /** 시작부터 며칠째 */
  day: number;
  /** 위에 뜨는 한 줄(하나만) */
  line: RehabLine | null;
  /** 오늘 쉬는 날(아직 세션을 안 남긴 날만) */
  rest: boolean;
  /** 오늘 남긴 세션 — 판정과 한 줄 */
  today: { result: RehabResult; text: string } | null;
  items: ArmcareTodayItem[];
  estimatedMinutes: number;
  clean: number;
  cleanNeeded: number;
  elapsed: number;
  minDays: number;
  gate: { ready: boolean; checks: GateCheck[] };
  goal: string;
  /** 부위 · 병명 · 오늘 세션의 안내(낮춤 · 바꿔 넣기 · 뺀 것) */
  notes: string[];
  avoid: string[];
  /** 이 단계에서 다음으로 가는 시험 — 4단계는 null(투구 복귀표 열기는 throwing) */
  stageTest: StageTest | null;
  /** [진단 받았어요]에서 고를 병명 — 이미 진단이 있거나 이 부위에 병명이 없으면 빈 목록 */
  conditionChoices: { key: RehabConditionKey; label: string }[];
  /** 시작 때 고른 내 활동 — 매주 확인 ③ */
  activities: string[];
  /** 매주 확인 — 때가 됐나 · 지금 할 수 있나 · 마지막 확인 · 지난 7일 안의 확인 */
  weekly: RehabWeeklyView;
  /** 팔굽혀 터치(CKCUEST) 내 첫 기록 — 단계 시험의 '처음' 칸을 미리 채운다 */
  ckcFirst: number | null;
  /** 4단계 — 공 운동 날 수 · 투구 복귀표 열기. 4단계가 아니면 null */
  throwing: RehabThrowingView | null;
};

export type RehabWeeklyView = {
  due: boolean;
  allowed: boolean;
  /** 마지막 확인 — '지난 확인 10월 2일 · 다치기 전의 70%' */
  last: { date: string; normalPct: number } | null;
  /** 지난 7일 안의 확인 — 투구 복귀표 열기 시트가 이 % · 자신감을 쓴다 */
  recent: { normalPct: number; confidence: number } | null;
  /** 다음 확인 날(YYYY-MM-DD) — 지금 할 수 있으면 null */
  nextOn: string | null;
};

const RESULT_LABEL: Record<RehabResult, string> = {
  green: '초록',
  yellow: '노랑',
  red: '빨강',
  refer: '진료',
};

/**
 * 오늘 재활 — 암케어 [루틴] 칸 맨 위, 맞춤 루틴 자리(재활 2편). 내 루틴은 그대로 아래에 선다.
 *
 * 겉은 세 줄(설계 4-2): 무엇 · 몇 단계 · 정도 / 오늘 몇 개 · 약 몇 분 [시작] / 진행(깨끗한 세션 · 이 단계 며칠째), 그리고
 * 위에 뜨는 한 줄 하나(진료 > 쉬는 날 > 낮추기 > 단계 시험 > 매주 확인 > 정도 낮아짐). [자세히]를 누르면 단계 목표 ·
 * 운동(체크) · 피할 것 · 위험 신호 · 올리는 조건(4단계는 투구 복귀표) · 매주 확인 · [진단 받았어요] · [단계 직접 바꾸기] ·
 * [그만두기]가 펼쳐진다(사용자: 겉은 단순, 누르면 자세히). 강조색은 sky 하나, 진료 · 위험 신호만 경고색.
 */
export function RehabCard({ view }: { view: RehabCardView }) {
  const [open, setOpen] = useState(false);
  const [sheet, setSheet] = useState<'test' | 'diagnosis' | 'stage' | null>(null);
  const [ending, setEnding] = useState<'stopped' | 'done' | null>(null);
  const [pending, startPending] = useTransition();
  const [error, setError] = useState<string>();
  /* 매주 확인 · 투구 복귀표 열기 — 닫으면 내용을 비워 다음에 새로 시작한다 */
  const weekly = useModalState<true>();
  const opening = useModalState<true>();

  const doneCount = view.items.filter((it) => it.done).length;
  const playHref = `/armcare/play/rehab?d=${view.dateKey}`;
  const opened = view.throwing?.openedOn != null;
  /* 투구 복귀표 열기 — 지난 7일 안의 확인이 있으면 시험만, 없으면 매주 확인부터(4단계 확인의 ⑤가 같은 시험이다) */
  const openThrowing = (e: { currentTarget: Element }) => {
    if (view.weekly.recent) opening.show(true, e);
    else if (view.weekly.allowed) weekly.show(true, e);
  };

  const end = (reason: 'stopped' | 'done') => {
    setError(undefined);
    startPending(async () => {
      const res = await orOffline(endRehab(reason), { error: OFFLINE_MESSAGE });
      if ('error' in res) setError(res.error);
      setEnding(null);
    });
  };

  return (
    <section className="space-y-3 rounded-2xl border border-sky-soft/40 bg-gradient-to-br from-sky/[0.07] via-surface to-surface p-(--block-pad)">
      <div className="space-y-1">
        <p className="text-xs font-semibold text-muted">
          재활 프로그램 · {view.day}일째
        </p>
        <h3 className="text-heading text-xl leading-snug break-keep text-ink">
          {view.title} · {view.stage}단계 {view.stageName}
          <span className="text-muted"> · {view.severityLabel}</span>
        </h3>
      </div>

      {view.line && (
        <TopLine
          line={view.line}
          onTest={() => setSheet('test')}
          onWeekly={(e) => weekly.show(true, e)}
        />
      )}

      {/* 오늘 — 끝났으면 판정, 쉬는 날이면 시작 단추 없이, 아니면 몇 개 · 약 몇 분 [시작] */}
      {view.today ? (
        <div className="flex items-center gap-3 rounded-xl bg-sky-tint px-3.5 py-2.5">
          <CircleCheck aria-hidden className="h-5 w-5 shrink-0 text-sky-strong" />
          <p className="min-w-0 flex-1 text-sm leading-relaxed break-keep text-ink">
            <b className="font-semibold">
              오늘 재활 끝 · {RESULT_LABEL[view.today.result]}
            </b>
            <span className="block text-xs text-muted">{view.today.text}</span>
          </p>
          <Link
            href={playHref}
            className="inline-flex min-h-11 shrink-0 items-center rounded-full px-3 text-xs font-semibold text-sky-strong hover:underline"
          >
            다시 답하기
          </Link>
        </div>
      ) : (
        !view.rest && (
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-muted">
              오늘{' '}
              <span className="text-numeric text-base text-ink">
                {view.items.length}
              </span>
              개 · 약{' '}
              <span className="text-numeric text-base text-ink">
                {view.estimatedMinutes}
              </span>
              분{doneCount > 0 && ` · ${doneCount}개 함`}
            </p>
            <Link
              href={playHref}
              className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full bg-sky px-5 text-sm font-semibold text-white transition-colors hover:bg-sky-strong"
            >
              <Play aria-hidden className="h-4 w-4" />
              시작
            </Link>
          </div>
        )
      )}

      <Progress view={view} />

      <DisclosureButton
        open={open}
        onClick={() => setOpen((v) => !v)}
        label="자세히"
        className="border-t border-sky-soft/30"
      />

      {open && (
        <div className="space-y-5 motion-safe:animate-fade-in">
          <Part title="이 단계의 목표">
            <p className="text-sm leading-relaxed break-keep text-ink/85">
              {view.goal}
            </p>
            {view.notes.length > 0 && (
              <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed break-keep text-muted marker:text-muted">
                {view.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </Part>

          {view.items.length > 0 && (
            <Part title="오늘 운동">
              <Checklist
                items={view.items}
                dateKey={view.dateKey}
                grouped={false}
                doneLabel="오늘 재활 운동 끝"
              />
            </Part>
          )}

          <Part title="피할 것">
            <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed break-keep text-ink/85 marker:text-muted">
              {view.avoid.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ul>
          </Part>

          <RedFlags />

          {view.stage < 4 || !view.throwing ? (
            <Part title="다음 단계로 가는 조건">
              <ul className="space-y-1.5 text-sm">
                {view.gate.checks.map((c) => (
                  <CheckRow key={c.label} ok={c.ok}>
                    {c.label}
                  </CheckRow>
                ))}
                <CheckRow ok={false}>단계 시험 통과</CheckRow>
              </ul>
              {view.stageTest && (
                <AccentButton
                  onClick={() => setSheet('test')}
                  disabled={!view.gate.ready}
                >
                  <FlaskConical aria-hidden className="h-4 w-4" />
                  단계 시험 하기
                </AccentButton>
              )}
            </Part>
          ) : opened ? (
            <Part title="투구 복귀표">
              <ThrowingProgram severity={view.throwing.severity} />
              <p className="text-xs text-muted">
                가능하면 진료 때 투구 복귀를 물어보세요. 마운드 칸까지 통증 없이 마치면
                재활을 끝내요.
              </p>
              <AccentButton onClick={() => setEnding('done')}>재활 끝내기</AccentButton>
            </Part>
          ) : (
            <Part title="투구 복귀표를 여는 조건">
              <ul className="space-y-1.5 text-sm">
                <CheckRow ok={view.throwing.painFreeBallDays >= view.throwing.needed}>
                  공 운동을 통증 없이 {view.throwing.needed}일 (지금{' '}
                  {Math.min(view.throwing.painFreeBallDays, view.throwing.needed)}일)
                </CheckRow>
                <CheckRow ok={false}>
                  밀기 · 공 던지기 힘 비교 · 팔 상태 90% 이상 · 던질 자신감 7 이상
                </CheckRow>
              </ul>
              <p className="text-xs text-muted">
                가능하면 진료 때 투구 복귀를 물어보세요.
              </p>
              <AccentButton
                onClick={openThrowing}
                disabled={!view.weekly.recent && !view.weekly.allowed}
              >
                <FlaskConical aria-hidden className="h-4 w-4" />
                {view.weekly.recent ? '투구 복귀표 열기' : '이번 주 확인부터'}
              </AccentButton>
            </Part>
          )}

          <Part title="매주 확인">
            <p className="text-sm leading-relaxed break-keep text-ink/85">
              {view.weekly.last
                ? `지난 확인 ${shortDate(view.weekly.last.date)} · 다치기 전의 ${view.weekly.last.normalPct}%`
                : '일주일마다 팔 상태 · 통증 · 내 활동을 1분 동안 확인해요.'}
              {view.weekly.nextOn && (
                <span className="block text-xs text-muted">
                  다음 확인 {shortDate(view.weekly.nextOn)}
                </span>
              )}
            </p>
            {view.weekly.allowed && (
              <AccentButton onClick={(e) => weekly.show(true, e)}>
                <ClipboardCheck aria-hidden className="h-4 w-4" />
                이번 주 확인
              </AccentButton>
            )}
          </Part>

          <p className="text-xs text-muted">담당 의사 · 치료사의 지시가 먼저예요.</p>

          {error && <ErrorLine>{error}</ErrorLine>}

          <div className="flex flex-wrap gap-2 border-t border-line pt-4">
            {view.conditionChoices.length > 0 && (
              <SmallButton onClick={() => setSheet('diagnosis')}>
                진단 받았어요
              </SmallButton>
            )}
            <SmallButton onClick={() => setSheet('stage')}>
              단계 직접 바꾸기
            </SmallButton>
            {view.stage === 4 && !opened && (
              <SmallButton onClick={() => setEnding('done')}>재활 끝내기</SmallButton>
            )}
            <SmallButton onClick={() => setEnding('stopped')} muted>
              그만두기
            </SmallButton>
          </div>
        </div>
      )}

      {view.stageTest && (
        <StageTestSheet
          key={view.ckcFirst ?? 'none'}
          open={sheet === 'test'}
          onClose={() => setSheet(null)}
          test={view.stageTest}
          stage={view.stage}
          ready={view.gate.ready}
          ckcFirst={view.ckcFirst}
        />
      )}
      <Modal
        open={weekly.open}
        onClose={weekly.close}
        title="이번 주 확인"
        description="약 1분 · 지난주와 견줘 속도를 맞춰요"
        origin={weekly.origin}
      >
        {weekly.content && (
          <WeeklyFlow
            stage={view.stage}
            activities={view.activities}
            stageTest={view.stageTest}
            throwing={view.throwing}
            ckcFirst={view.ckcFirst}
            onDone={weekly.close}
          />
        )}
      </Modal>
      {view.throwing && view.weekly.recent && (
        <Modal
          open={opening.open}
          onClose={opening.close}
          title="투구 복귀표 열기"
          description="공 던지기 힘을 양쪽으로 견줘요"
          origin={opening.origin}
        >
          {opening.content && (
            <ThrowingOpenFlow
              view={view.throwing}
              recent={view.weekly.recent}
              onDone={opening.close}
            />
          )}
        </Modal>
      )}
      <DiagnosisSheet
        open={sheet === 'diagnosis'}
        onClose={() => setSheet(null)}
        choices={view.conditionChoices}
      />
      <StageChangeSheet
        open={sheet === 'stage'}
        onClose={() => setSheet(null)}
        stage={view.stage}
      />
      <ConfirmDialog
        open={ending != null}
        onClose={() => setEnding(null)}
        onConfirm={() => ending && end(ending)}
        title={ending === 'done' ? '재활을 끝낼까요?' : '재활을 그만둘까요?'}
        detail={
          ending === 'done'
            ? '웨이트 · 투구 계획 · 암케어가 평소대로 돌아가요. 지금까지 기록은 남아요.'
            : '지금까지 기록은 남아요. 웨이트 · 투구 계획 · 암케어가 평소대로 돌아가요. 다시 아프면 새로 시작할 수 있어요.'
        }
        confirmLabel={ending === 'done' ? '끝내기' : '그만두기'}
        pending={pending}
        pendingLabel="저장하는 중…"
      />
    </section>
  );
}

/** 위에 뜨는 한 줄 — 진료만 경고색, 나머지는 옅은 면 */
function TopLine({
  line,
  onTest,
  onWeekly,
}: {
  line: RehabLine;
  onTest: () => void;
  onWeekly: (e: { currentTarget: Element }) => void;
}) {
  if (line.kind === 'refer') {
    return (
      <p className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-bg px-3.5 py-2.5 text-sm leading-relaxed break-keep text-warn">
        <Stethoscope aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
        {line.text}
      </p>
    );
  }
  const Icon = {
    rest: Moon,
    lowered: TrendingDown,
    'stage-test': FlaskConical,
    weekly: ClipboardCheck,
    eased: Sprout,
  }[line.kind];
  const action =
    line.kind === 'stage-test'
      ? { label: '시험하기', onClick: onTest }
      : line.kind === 'weekly'
        ? { label: '확인하기', onClick: onWeekly }
        : null;
  return (
    <div className="flex items-center gap-2 rounded-xl bg-surface-2 px-3.5 py-2.5 text-sm leading-relaxed break-keep text-ink">
      <Icon aria-hidden className="h-4 w-4 shrink-0 text-sky-strong" />
      <span className="min-w-0 flex-1">{line.text}</span>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-sm font-semibold text-sky-strong hover:underline"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}

/** 진행 — 깨끗한 세션 점 · 이 단계 며칠째(4단계는 공 운동 날 수 · 투구 복귀표) */
function Progress({ view }: { view: RehabCardView }) {
  if (view.stage === 4) {
    const t = view.throwing;
    return (
      <p className="text-xs text-muted">
        4단계 {view.elapsed + 1}일째 ·{' '}
        {!t
          ? '던지기 준비'
          : t.openedOn
            ? '투구 복귀표를 열었어요 — 자세히에서 봐요'
            : `공 운동 통증 없이 ${Math.min(t.painFreeBallDays, t.needed)}/${t.needed}일`}
      </p>
    );
  }
  const shown = Math.min(view.clean, view.cleanNeeded);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted">
      <span className="flex items-center gap-1.5">
        <span className="flex gap-1" aria-hidden>
          {Array.from({ length: view.cleanNeeded }, (_, i) => (
            <span
              key={i}
              className={`h-2 w-2 rounded-full ${i < shown ? 'bg-sky' : 'bg-line-strong'}`}
            />
          ))}
        </span>
        깨끗한 세션 {shown}/{view.cleanNeeded}
      </span>
      {view.minDays > 0 && (
        <span>
          이 단계 {Math.min(view.elapsed, view.minDays)}/{view.minDays}일
        </span>
      )}
    </div>
  );
}

/** '10월 4일' — 'YYYY-MM-DD' 를 그대로 읽는다(시간대와 상관없이) */
function shortDate(key: string): string {
  const [, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일`;
}

/** 조건 한 줄 — 됐으면 파란 동그라미에 체크 */
function CheckRow({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        aria-hidden
        className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
          ok ? 'bg-sky text-white' : 'border-2 border-line-strong'
        }`}
      >
        {ok && <Check className="h-3 w-3" strokeWidth={3} />}
      </span>
      <span className={ok ? 'text-ink' : 'text-muted'}>
        {children}
        <span className="sr-only">{ok ? ' — 됨' : ' — 아직'}</span>
      </span>
    </li>
  );
}

/** 펼친 카드 안의 파란 알약 단추(단계 시험 · 매주 확인 · 투구 복귀표) */
function AccentButton({
  onClick,
  disabled = false,
  children,
}: {
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-sky-soft bg-sky-tint px-4 text-sm font-semibold text-sky-strong transition-colors hover:bg-sky hover:text-white disabled:pointer-events-none disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function Part({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h4 className="text-xs font-bold text-sky-strong">{title}</h4>
      {children}
    </section>
  );
}

function SmallButton({
  onClick,
  muted = false,
  children,
}: {
  onClick: () => void;
  muted?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex min-h-11 items-center rounded-full bg-ink/6 px-4 text-sm font-semibold transition-colors hover:text-sky desk:border desk:border-line-strong desk:bg-surface-2 ${
        muted ? 'text-muted' : 'text-ink'
      }`}
    >
      {children}
    </button>
  );
}
