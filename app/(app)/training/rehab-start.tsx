'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, Plus, Stethoscope } from 'lucide-react';
import { Modal, useModalState } from '@/components/modal';
import { Button, Input } from '@/components/ui';
import { ErrorLine } from '@/components/error-line';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { ARM_PAIN_LEVELS } from '@/lib/checkin';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';
import {
  REHAB_ACTIVITY_MAX_LENGTH,
  REHAB_ACTIVITY_PRESETS,
  REHAB_AREAS,
  REHAB_CONDITIONS,
  REHAB_STAGES,
  areaLabel,
  conditionsFor,
  rehabEstimateDays,
  rehabFacts,
  rehabNotes,
  rehabSeverity,
  rehabStartBlock,
  rehabTitle,
  severityLabel,
  startStage,
  weeksText,
  type RehabConditionKey,
} from '@/lib/armcare/rehab';
import { startRehab } from '@/app/actions/rehab';
import { RedFlags } from './arm-pain-guide-body';
import { RehabChips, PAIN_OPTIONS } from './rehab-chips';

/** 시작 시트가 미리 골라 둘 것 — 오늘 체크인의 아픈 자리 · 정도 */
export type RehabStartDefaults = {
  area: ArmcareAreaKey | null;
  level: 1 | 2 | 3 | null;
};

/**
 * 들어가는 작은 줄 '팔이 아프면 · 재활 프로그램' + 시작 시트(재활 2편).
 *
 * 시트는 한 장에 질문 하나 · 둘(설계 4-1): 어디가 아파요? → 얼마나(1편의 세 질문 + 지난 일주일 가장 아팠을 때 0~10) →
 * 병원 진단(고른 부위에 맞는 병명이 있을 때만) → 내 활동 두 개 → 요약 + [시작]. 위험 신호는 체크 칸 없이 글로만.
 * 15세 미만 · 18세 미만 팔꿈치 바깥쪽/뒤쪽(진단 없음)은 [시작] 없이 진료 안내만(lib/armcare/rehab.ts 의 rehabStartBlock).
 *
 * autoOpen — 팔 통증 안내 시트의 '재활 프로그램' 줄(?rehab=start)로 들어오면 열고, 주소의 표시는 지운다(새로고침에 또 열리지 않게).
 */
export function RehabStartLine({
  age,
  defaults,
  autoOpen = false,
}: {
  age: number | null;
  defaults: RehabStartDefaults;
  autoOpen?: boolean;
}) {
  const modal = useModalState<true>();
  const { show } = modal;
  const router = useRouter();
  const opened = useRef(false);

  useEffect(() => {
    if (!autoOpen || opened.current) return;
    opened.current = true;
    show(true);
    const url = new URL(window.location.href);
    url.searchParams.delete('rehab');
    router.replace(`${url.pathname}${url.search}`, { scroll: false });
  }, [autoOpen, show, router]);

  return (
    <>
      <button
        type="button"
        onClick={(e) => modal.show(true, e)}
        className="flex min-h-11 w-full items-center gap-2 rounded-2xl px-1 text-left text-sm text-muted transition-colors hover:text-ink"
      >
        <span className="min-w-0 flex-1">
          팔이 아프면 · <b className="font-semibold text-sky-strong">재활 프로그램</b>
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
      </button>
      <Modal
        open={modal.open}
        onClose={modal.close}
        title="재활 프로그램"
        description="아픈 곳과 정도에 맞춰 몇 주에 걸쳐 단계별로 해요"
        origin={modal.origin}
      >
        {modal.content && (
          <RehabStartFlow age={age} defaults={defaults} onDone={modal.close} />
        )}
      </Modal>
    </>
  );
}

const STEP_NAMES = ['부위', '정도', '진단', '내 활동', '요약'] as const;
type Step = 0 | 1 | 2 | 3 | 4;

/** 진단 칩의 '없음' — 병명 키와 겹치지 않는 값 */
const NO_DIAGNOSIS = 'none';

function RehabStartFlow({
  age,
  defaults,
  onDone,
}: {
  age: number | null;
  defaults: RehabStartDefaults;
  onDone: () => void;
}) {
  const [step, setStep] = useState<Step>(0);
  const [area, setArea] = useState<ArmcareAreaKey | null>(defaults.area);
  const [level, setLevel] = useState<1 | 2 | 3 | null>(defaults.level);
  const [worst, setWorst] = useState<number | null>(null);
  /* null = 아직 안 고름, NO_DIAGNOSIS = 진단 없음 */
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startPending] = useTransition();

  /* 만 15세 미만은 부위와 상관없이 막는다 — 질문 없이 진료 안내만 */
  const young = rehabStartBlock({ age, area: 'shoulder-back', condition: null });
  if (young?.kind === 'young') {
    return <Blocked text={young.text} />;
  }

  const choices = area ? conditionsFor(area) : [];
  const condition: RehabConditionKey | null =
    diagnosis && diagnosis !== NO_DIAGNOSIS ? (diagnosis as RehabConditionKey) : null;
  /* 고른 부위에 맞는 병명이 없으면 진단 질문은 건너뛴다 */
  const skipDiagnosis = choices.length === 0;

  const canNext =
    (step === 0 && area != null) ||
    (step === 1 && level != null && worst != null) ||
    (step === 2 && (skipDiagnosis || diagnosis != null)) ||
    (step === 3 && activities.length === 2);

  const go = (to: number) => {
    let next = to;
    if (next === 2 && skipDiagnosis) next = to > step ? 3 : 1;
    setError(undefined);
    setStep(Math.max(0, Math.min(4, next)) as Step);
  };

  const toggleActivity = (label: string) =>
    setActivities((list) =>
      list.includes(label)
        ? list.filter((x) => x !== label)
        : list.length >= 2
          ? [list[1], label]
          : [...list, label]
    );
  const addCustom = () => {
    const label = custom.trim().replace(/\s+/g, ' ');
    if (!label || label.length > REHAB_ACTIVITY_MAX_LENGTH) return;
    if (!activities.includes(label)) toggleActivity(label);
    setCustom('');
  };

  const start = () => {
    if (!area || level == null || worst == null) return;
    setError(undefined);
    startPending(async () => {
      const res = await orOffline(
        startRehab({ area, level, worst, condition, activities }),
        { error: OFFLINE_MESSAGE }
      );
      if ('error' in res) setError(res.error);
      else onDone();
    });
  };

  const activityOptions = [
    ...REHAB_ACTIVITY_PRESETS,
    ...activities.filter(
      (a) => !(REHAB_ACTIVITY_PRESETS as readonly string[]).includes(a)
    ),
  ].map((label) => ({ value: label, label }));

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-2">
        <div className="flex flex-1 gap-1" aria-hidden>
          {STEP_NAMES.map((name, i) => (
            <span
              key={name}
              className={`h-1 flex-1 rounded-full transition-colors ${i <= step ? 'bg-sky' : 'bg-line'}`}
            />
          ))}
        </div>
        <span className="text-xs text-muted tabular-nums">
          {step + 1}/{STEP_NAMES.length}
        </span>
      </div>

      {step === 0 && (
        <Question
          title="어디가 아파요?"
          hint="한 곳만 골라요. 여러 곳이면 가장 아픈 곳으로."
        >
          {(['어깨', '팔꿈치'] as const).map((joint, j) => (
            <div key={joint} className="space-y-1">
              <p className="text-xs font-semibold text-muted">{joint}</p>
              <RehabChips
                label={`${joint} 아픈 곳`}
                options={REHAB_AREAS.slice(j * 4, j * 4 + 4).map((key) => ({
                  value: key,
                  label: areaLabel(key),
                }))}
                value={area}
                onChange={(v) => {
                  if (v !== area) setDiagnosis(null);
                  setArea(v);
                }}
              />
            </div>
          ))}
        </Question>
      )}

      {step === 1 && (
        <Question title="얼마나 아파요?">
          <RehabChips
            label="언제 아파요"
            options={ARM_PAIN_LEVELS.map((l) => ({ value: l.value, label: l.label }))}
            value={level}
            onChange={setLevel}
          />
          <div className="space-y-1 pt-2">
            <p className="text-sm font-semibold text-ink">
              지난 일주일 가장 아팠을 때 <span className="text-muted">(0~10)</span>
            </p>
            <RehabChips
              label="지난 일주일 가장 아팠을 때"
              options={PAIN_OPTIONS}
              value={worst}
              onChange={setWorst}
            />
          </div>
        </Question>
      )}

      {step === 2 && area && (
        <Question
          title="병원 진단을 받았어요?"
          hint="진단이 있으면 병명에 맞춘 재활로 해요. 나중에 받아도 바꿀 수 있어요."
        >
          <RehabChips
            label="진단"
            stacked
            options={[
              { value: NO_DIAGNOSIS, label: '아니요, 부위로 할게요' },
              ...choices.map((key) => ({
                value: key,
                label: REHAB_CONDITIONS[key].label,
              })),
            ]}
            value={diagnosis}
            onChange={setDiagnosis}
          />
        </Question>
      )}

      {step === 3 && (
        <Question
          title="내 활동 두 개"
          hint="매주 이 두 가지를 얼마나 할 수 있는지 물어봐요."
        >
          <RehabChips
            label="내 활동"
            multiple
            options={activityOptions}
            value={activities}
            onChange={toggleActivity}
          />
          <div className="flex items-center gap-2 pt-1">
            <Input
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCustom();
                }
              }}
              maxLength={REHAB_ACTIVITY_MAX_LENGTH}
              placeholder="직접 적기 (예: 머리 감기)"
              aria-label="내 활동 직접 적기"
            />
            <button
              type="button"
              onClick={addCustom}
              disabled={!custom.trim()}
              aria-label="내 활동 더하기"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-ink/6 text-ink transition-colors hover:text-sky disabled:opacity-40"
            >
              <Plus className="h-5 w-5" />
            </button>
          </div>
          <p className="text-xs text-muted">{activities.length}/2개 골랐어요</p>
        </Question>
      )}

      {step === 4 && area && level != null && worst != null && (
        <Summary
          age={age}
          area={area}
          level={level}
          worst={worst}
          condition={condition}
          activities={activities}
        />
      )}

      {error && <ErrorLine>{error}</ErrorLine>}

      <div className="flex items-center gap-2 border-t border-line pt-4">
        {step > 0 && (
          <button
            type="button"
            onClick={() => go(step - 1)}
            className="inline-flex min-h-11 items-center gap-1 rounded-full px-3 text-sm font-semibold text-muted hover:text-ink"
          >
            <ChevronLeft aria-hidden className="h-4 w-4" />
            이전
          </button>
        )}
        <div className="flex-1" />
        {step < 4 ? (
          <Button type="button" onClick={() => go(step + 1)} disabled={!canNext}>
            다음
          </Button>
        ) : (
          area &&
          !rehabStartBlock({ age, area, condition }) && (
            <Button type="button" onClick={start} disabled={pending}>
              {pending ? '시작하는 중…' : '시작'}
            </Button>
          )
        )}
      </div>
    </div>
  );
}

function Question({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-heading text-lg text-ink">{title}</h3>
        {hint && (
          <p className="text-xs leading-relaxed break-keep text-muted">{hint}</p>
        )}
      </div>
      {children}
    </section>
  );
}

/** 요약 한 장 — 무엇으로 몇 단계부터 · 투구 복귀표까지 대략 · 던지기 · 위험 신호 · 의사 지시가 먼저 */
function Summary({
  age,
  area,
  level,
  worst,
  condition,
  activities,
}: {
  age: number | null;
  area: ArmcareAreaKey;
  level: 1 | 2 | 3;
  worst: number;
  condition: RehabConditionKey | null;
  activities: string[];
}) {
  const block = rehabStartBlock({ age, area, condition });
  const severity = rehabSeverity({ level, worst, condition });
  const stage = startStage(severity);
  const today = new Date().toISOString().slice(0, 10);
  const throwing = rehabFacts(
    {
      area,
      condition,
      severity,
      stage,
      stageStartedOn: today,
      stageShortenDays: 0,
      startedOn: today,
    },
    today
  );
  const notes = rehabNotes(area, condition);

  if (block) return <Blocked text={block.text} />;

  return (
    <section className="space-y-4 text-sm leading-relaxed break-keep">
      {severity === 'severe' && (
        <p className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-bg px-3.5 py-2.5 text-warn">
          <Stethoscope aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            가만히 있어도 · 밤에도 아프면 진료를 먼저 받아보세요. 시작은 할 수 있지만,
            밤 · 쉴 때 통증이 7일 없을 때까지 1단계에 머물러요.
          </span>
        </p>
      )}
      <div className="space-y-1">
        <p className="text-heading text-lg text-ink">
          {rehabTitle(area, condition)} · {severityLabel(severity)} · {stage}단계부터
        </p>
        <p className="font-semibold text-sky-strong">
          투구 복귀표까지 {weeksText(rehabEstimateDays(severity, condition))}, 빨리
          나으면 앞당겨져요
        </p>
        <p className="text-muted">
          {stage}단계 {REHAB_STAGES[stage].name} · 내 활동 {activities.join(' · ')}
        </p>
      </div>
      <p className="rounded-xl bg-surface-2 px-3.5 py-2.5 text-ink/85">
        {throwing.throwing === 'light'
          ? '가벼운 캐치볼은 이어 가도 돼요(18m 안 · 25개 · 통증 2 이하). 투구 계획은 재활을 마칠 때까지 쉬어요.'
          : throwing.firstWeekNoThrow
            ? '팔꿈치 안쪽 · 뒤쪽은 첫 주에 던지지 않아요. 그 뒤로 가벼운 캐치볼만 해요.'
            : '재활을 마칠 때까지 투구 계획은 쉬어요. 웨이트는 이 관절의 무거운 운동만 빼고 해요.'}
      </p>
      {notes.length > 0 && (
        <ul className="list-disc space-y-1 pl-5 text-ink/85 marker:text-muted">
          {notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      )}
      <RedFlags />
      <p className="text-xs text-muted">
        담당 의사 · 치료사의 지시가 먼저예요. 이 프로그램은 진단이나 치료가 아니에요.
      </p>
    </section>
  );
}

/** 막는 경우 — 글 + 진료 안내, 시작 단추 없음 */
function Blocked({ text }: { text: string }) {
  return (
    <p className="flex items-start gap-2 rounded-xl border border-warn-line bg-warn-bg px-3.5 py-3 text-sm leading-relaxed break-keep text-warn">
      <Stethoscope aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{text}</span>
    </p>
  );
}
