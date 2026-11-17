'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { AlertTriangle, ArrowLeftRight, Minus, Plus, RotateCcw } from '@/components/icon';
import { Modal } from '@/components/modal';
import { Input } from '@/components/ui';
import { setSessionTarget } from '@/app/actions/workout';
import type { RunExercise } from '@/lib/workout/run-exercises';
import { BandChip, BandSheet, RoleChips } from '@/components/load/band-picker';
import { EMPTY_LOAD_DRAFT, activeContract, buildSetLoad, fixedBandRole, loadForm } from '@/components/load/set-load';
import { equipmentDisplayName } from '@/lib/exercise-meta';
import { BAND_ROLE_LABEL } from '@/lib/workout/load/contract';
import type { BandComponent } from '@/lib/workout/load/band-catalog';
import type { BandRoleRecorded } from '@/lib/workout/load/recorded';
import {
  LOAD_TARGET_UNSUPPORTED_TEXT,
  loadTargetText,
  seedOfLoadTarget,
  type LoadTarget,
  type LoadTargetInput,
} from '@/lib/workout/load/target';
import {
  PER_SIDE_MEANING,
  TARGET_LIMITS,
  checkTargetInput,
  describeTarget,
  pausedText,
  storedKgFromDisplay,
  targetMinutes,
  type TargetInput,
  type TargetValues,
  type TargetView,
} from '@/lib/workout/target-override';
import { formatWeight, round1, toWeight, type WeightUnit } from '@/lib/units';

/**
 * 운동 중 '목표 바꾸기' 창(EX-RX01) — 이 운동 · 이 판에서만 세트 · 횟수(또는 시간) · 휴식 · 무게를 바꾼다.
 *
 * 세 줄을 나눠 보인다: 라이브러리 기본(모두의 값) · 오늘 추천(근거와 함께) · 내 목표(지금 따르는 값).
 * 빈 칸은 '오늘 추천을 따른다'는 뜻이다. 저장 · 되돌리기는 서버(setSessionTarget)가 다시 검사하고 막는다.
 * 앱(native/src/workout/target-sheet.tsx)과 같은 검사(lib/workout/target-override.ts checkTargetInput)를 쓴다.
 */
export function TargetSheet({
  open,
  sessionId,
  exercise,
  painToday,
  doneSets,
  wUnit,
  onDone,
  onClose,
}: {
  open: boolean;
  sessionId: string;
  exercise: RunExercise;
  painToday: boolean;
  /** 이 운동에 이미 남긴 세트 수(폰에만 있는 것까지) — 목표를 낮춰도 그대로라는 안내에 쓴다 */
  doneSets: number;
  wUnit: WeightUnit;
  onDone: (exercise: RunExercise) => void;
  onClose: () => void;
}) {
  const view = exercise.target;
  const [saving, startSaving] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [draft, setDraft] = useState(() => (view ? initialDraft(view, exercise, wUnit) : null));
  /*
   * EX-LOAD01-R1 — 장비 목표(밴드 · 섞임 · 고르기 · 기구 이름 · 양손 다른 무게). 지금 목표로 채워 열고, 사람이 이 칸을 건드렸을 때만(loadDirty)
   * 보낸다 — 안 건드리면 칸이 없는 요청이라 서버가 저장된 장비 목표를 그대로 둔다(다른 앱 버전이 저장한 값도).
   */
  const [loadUi, setLoadUi] = useState<TargetLoadUi>(() => initialLoadUi(view?.override?.load ?? view?.painPaused?.load ?? null, wUnit));
  const [loadDirty, setLoadDirty] = useState(false);
  const [bandOpen, setBandOpen] = useState(false);
  const editLoad = (patch: Partial<TargetLoadUi>) => {
    setLoadUi((prev) => ({ ...prev, ...patch }));
    setLoadDirty(true);
  };

  if (!view || !draft) {
    return (
      <Modal open={open} onClose={onClose} title="목표 바꾸기">
        <p className="text-sm text-muted">이 화면은 목표를 바꿀 수 없는 옛 판이에요. 운동을 다시 열면 바꿀 수 있어요.</p>
      </Modal>
    );
  }

  const unitText = (kg: number) => formatWeight(kg, wUnit) ?? `${kg}kg`;
  const subject = { perSide: exercise.perSide, isHold: exercise.isHold, inMinutes: exercise.inMinutes };
  const storedLoad = view.override?.load ?? view.painPaused?.load ?? null;
  const loadEdit = view.editable.load === true ? buildLoadTarget(exercise, loadUi, draft, wUnit, view, storedLoad, loadDirty) : null;
  const input = toInput(draft, exercise, wUnit, view, loadEdit);
  const check: ReturnType<typeof checkTargetInput> =
    loadEdit && !loadEdit.ok ? { ok: false, error: loadEdit.error, field: 'load' } : checkTargetInput(input, subjectOf(exercise), view.recommended, { painToday, prevLoad: storedLoad });
  const preview: TargetValues = {
    sets: input.sets ?? view.recommended.sets,
    reps: input.reps ?? view.recommended.reps,
    holdSeconds: input.holdSeconds ?? view.recommended.holdSeconds,
    restSeconds: input.restSeconds ?? view.recommended.restSeconds,
    kg: input.kg ?? view.recommended.kg,
  };
  const minutes = targetMinutes({ ...subjectOf(exercise), intensity: view.intensity }, preview);

  const save = (target: TargetInput | null) => {
    setError(null);
    startSaving(async () => {
      try {
        const res = await setSessionTarget({ sessionId, exerciseId: exercise.id, target });
        if ('error' in res) {
          setError(res.error);
          return;
        }
        setConfirmReset(false);
        setLoadDirty(false);
        onDone(res.exercise);
      } catch (err) {
        unstable_rethrow(err);
        setError('신호가 약해 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.');
      }
    });
  };

  const amountLabel = exercise.isHold ? (exercise.inMinutes ? '시간(분)' : '시간(초)') : '횟수';

  const bandContract = activeContract(exercise.load, exercise.load.mode === 'alternative' ? (loadUi.variant ?? 'band') : null);
  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title="목표 바꾸기"
      description={`${exercise.title} · 이 운동 · 오늘만 바뀌어요`}
      footer={
        <div className="space-y-2">
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          {/*
           * EX-LOAD01-R1 — 저장 단추가 꺼진 까닭(통증 날 · 범위 · 장비 목표 검사)을 단추 바로 위에도. 본문의 칸 옆 글은 굴려야 보여서, 처음
           * 화면에서는 왜 꺼졌는지 안 보였다(렌더 검토 O1). 검사 규칙은 그대로다.
           */}
          {!error && !confirmReset && !check.ok && (
            <p className="text-xs text-danger" aria-live="polite">
              {check.error}
            </p>
          )}
          {confirmReset ? (
            <div className="space-y-2 rounded-2xl bg-ink/4 p-3">
              <p className="text-sm text-ink">
                오늘 추천 <b className="font-semibold">{describeTarget(view.recommended, subject, unitText)}</b>(으)로 되돌려요.
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="min-h-11 flex-1 rounded-full bg-surface text-sm font-semibold text-ink"
                >
                  그대로 두기
                </button>
                <button
                  type="button"
                  disabled={saving}
                  /* EX-LOAD01-R1 — 새 창의 되돌리기는 장비 목표도 함께 지운다(loadV:1). 옛 창의 null 은 장비 목표를 남긴다 */
                  onClick={() => save({ loadV: 1, load: null })}
                  className="min-h-11 flex-1 rounded-full bg-sky text-sm font-semibold text-white disabled:opacity-60"
                >
                  되돌리기
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              {(view.override || view.painPaused?.load || view.loadUnsupported) && (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex min-h-11 items-center gap-1 rounded-full bg-surface px-4 text-sm font-semibold text-ink"
                >
                  <RotateCcw aria-hidden className="h-4 w-4" />
                  추천으로
                </button>
              )}
              <button
                type="button"
                disabled={saving || !check.ok}
                onClick={() => save(input)}
                className="min-h-11 flex-1 rounded-full bg-sky text-sm font-semibold text-white disabled:opacity-60"
              >
                {saving ? '저장 중…' : '이 목표로 하기'}
              </button>
            </div>
          )}
        </div>
      }
    >
      <div className="space-y-4">
        <dl className="space-y-2 text-sm">
          <Layer label="라이브러리 기본" value={view.baseline ? describeTarget(view.baseline, subject) : '라이브러리 값 없음'} />
          <Layer label="오늘 추천" value={describeTarget(view.recommended, subject, unitText)}>
            <ul className="mt-1 space-y-0.5 text-caption leading-relaxed text-muted">
              {view.basis.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </Layer>
          <Layer
            label={view.override ? '내 목표 · 지금 따르는 값' : '지금 따르는 값(추천과 같음)'}
            value={describeTarget(view.effective, subject, unitText)}
            strong
          />
        </dl>

        {painToday && (
          <p className="flex gap-2 rounded-xl border border-danger-line bg-danger-bg px-3 py-2 text-xs leading-relaxed text-danger">
            <AlertTriangle aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            오늘 체크인에 통증이 있어 목표를 오늘 추천보다 올릴 수 없어요. 하다가 아프면 바로 멈추세요.
          </p>
        )}
        {view.painPaused && (
          <p className="rounded-xl bg-ink/4 px-3 py-2 text-xs leading-relaxed text-muted">
            {pausedText(view.painPaused, exercise, (kg) => formatWeight(kg, wUnit) ?? `${kg}kg`)}
          </p>
        )}
        {view.locked && <p className="rounded-xl bg-ink/4 px-3 py-2 text-xs leading-relaxed text-muted">{view.locked}</p>}

        <div className="space-y-3">
          {view.editable.sets && (
            <Field
              label="세트"
              unit="세트"
              value={draft.sets}
              placeholder={fmt(view.recommended.sets)}
              step={1}
              min={1}
              max={TARGET_LIMITS.sets}
              onChange={(v) => setDraft({ ...draft, sets: v })}
            />
          )}
          {view.editable.amount && (
            <Field
              label={amountLabel}
              unit={exercise.isHold ? (exercise.inMinutes ? '분' : '초') : '회'}
              value={draft.amount}
              placeholder={fmt(
                exercise.isHold
                  ? view.recommended.holdSeconds != null
                    ? exercise.inMinutes
                      ? Math.round(view.recommended.holdSeconds / 60)
                      : view.recommended.holdSeconds
                    : null
                  : view.recommended.reps
              )}
              step={exercise.isHold && !exercise.inMinutes ? 5 : 1}
              min={1}
              max={
                exercise.isHold
                  ? exercise.inMinutes
                    ? TARGET_LIMITS.holdSeconds / 60
                    : TARGET_LIMITS.holdSeconds
                  : TARGET_LIMITS.reps
              }
              onChange={(v) => setDraft({ ...draft, amount: v })}
            />
          )}
          {view.editable.rest && (
            <Field
              label="세트 사이 휴식"
              unit="초"
              value={draft.rest}
              placeholder={fmt(view.recommended.restSeconds)}
              step={15}
              min={0}
              max={TARGET_LIMITS.restSeconds}
              onChange={(v) => setDraft({ ...draft, rest: v })}
            />
          )}
          {view.editable.kg && !(view.editable.load && (loadUi.unequal || loadUi.variant === 'band')) && (
            <Field
              label={view.editable.load ? kgLabelOf(exercise, loadUi) : '무게'}
              unit={wUnit}
              value={draft.kg}
              placeholder={view.recommended.kg != null ? String(round1(toWeight(view.recommended.kg, wUnit))) : '정하지 않음'}
              step={wUnit === 'lb' ? 5 : 2.5}
              min={0}
              max={round1(toWeight(TARGET_LIMITS.weightKg, wUnit))}
              decimal
              onChange={(v) => setDraft({ ...draft, kg: v })}
            />
          )}
          <p className="text-caption leading-relaxed text-muted">
            빈 칸은 오늘 추천을 따라요. 무게는 직접 정할 때만 들어가요(나이 · 난이도만으로 무게를 정하지 않아요).
          </p>
        </div>

        {view.editable.load && (
          <LoadTargetSection
            exercise={exercise}
            ui={loadUi}
            stored={storedLoad}
            paused={!!view.painPaused?.load}
            dirty={loadDirty}
            wUnit={wUnit}
            onEdit={editLoad}
            onOpenBands={() => setBandOpen(true)}
            onClear={() => {
              setLoadUi(EMPTY_TARGET_LOAD_UI);
              setLoadDirty(true);
            }}
            unitText={unitText}
          />
        )}
        {view.loadUnsupported && (
          <p className="rounded-xl bg-ink/4 px-3 py-2 text-xs leading-relaxed text-muted">
            {LOAD_TARGET_UNSUPPORTED_TEXT} 지우려면 아래 [추천으로]를 눌러요.
          </p>
        )}

        {exercise.perSide && <p className="text-xs leading-relaxed text-muted">{PER_SIDE_MEANING}</p>}
        {doneSets > 0 && (
          <p className="text-xs leading-relaxed text-muted">
            이미 남긴 {doneSets}세트는 목표를 낮춰도 그대로 남아요.
          </p>
        )}
        {minutes != null && (
          <p className="text-xs text-muted">
            이 목표로 하면 이 운동은 약 {minutes}분(휴식 포함)
            {view.recommendedMinutes != null && minutes !== view.recommendedMinutes
              ? ` · 추천은 약 ${view.recommendedMinutes}분`
              : ''}
          </p>
        )}
        {!check.ok && <p className="text-xs text-danger">{check.error}</p>}
      </div>
    </Modal>
    {view.editable.load && bandContract && (
      <BandSheet
        key={`target-band-${exercise.id}-${bandOpen ? 'open' : 'closed'}`}
        open={bandOpen}
        onClose={() => setBandOpen(false)}
        exerciseId={exercise.id}
        ownerId={null}
        title={`${exercise.title} · 목표`}
        fixedRole={fixedBandRole(exercise.load)}
        role={loadUi.role}
        bands={loadUi.bands}
        onDone={(next) => {
          setBandOpen(false);
          editLoad({ role: fixedBandRole(exercise.load) ? null : next.role, bands: next.bands });
        }}
      />
    )}
    </>
  );
}

type Draft = { sets: string; amount: string; rest: string; kg: string };

const fmt = (n: number | null | undefined) => (n == null ? '없음' : String(n));

function subjectOf(ex: RunExercise) {
  return {
    id: ex.id,
    category: ex.category,
    isHold: ex.isHold,
    perSide: ex.perSide,
    needsWeight: ex.needsWeight,
    equipment: ex.equipment,
    programSlot: ex.programSlot,
    setTargets: ex.setTargets,
    suggestedKg: ex.suggestedKg,
    /* EX-LOAD01 — 무게 목표도 세트 기록과 같은 얼린 계약으로(장비 · 분류 추측 아님). 옛 서버의 운동에는 없다 */
    load: ex.load ?? null,
  };
}

/** 창을 열 때 칸 — 사용자가 바꾼 칸만 채워 둔다(빈 칸 = 추천을 따른다) */
function initialDraft(view: TargetView, ex: RunExercise, unit: WeightUnit): Draft {
  const o = view.override ?? {};
  const amount = ex.isHold
    ? o.holdSeconds != null
      ? String(ex.inMinutes ? Math.round(o.holdSeconds / 60) : o.holdSeconds)
      : ''
    : o.reps != null
      ? String(o.reps)
      : '';
  return {
    sets: o.sets != null ? String(o.sets) : '',
    amount,
    rest: o.restSeconds != null ? String(o.restSeconds) : '',
    kg: o.kg != null ? String(round1(toWeight(o.kg, unit))) : '',
  };
}

/** 칸 → 서버로 보낼 목표. 빈 칸은 null(추천을 따른다), 숫자가 아니면 NaN 을 그대로 보내 검사가 막게 한다 */
function toInput(d: Draft, ex: RunExercise, unit: WeightUnit, view: TargetView, load: LoadEdit | null = null): TargetInput {
  const num = (s: string) => (s.trim() === '' ? null : Number(s));
  const amount = num(d.amount);
  const kg = num(d.kg);
  const base: TargetInput = {
    sets: num(d.sets),
    reps: ex.isHold ? null : amount,
    holdSeconds: ex.isHold ? (amount == null ? null : ex.inMinutes ? amount * 60 : amount) : null,
    restSeconds: num(d.rest),
    kg: kg == null ? null : Number.isFinite(kg) ? storedKgFromDisplay(kg, unit, [view.recommended.kg, view.override?.kg]) : kg,
  };
  /* EX-LOAD01-R1 — 장비 목표를 건드렸을 때만 싣는다. kg 칸은 그 목표의 무게 성분 투영(서버가 다르면 충돌로 막는다) */
  if (!load || !load.ok || load.send === 'none') return base;
  /* 지울 때는 무게 칸을 사람이 적은 그대로(빈 칸 = 추천), 정할 때는 그 목표의 투영 */
  if (load.send === 'clear') return { ...base, loadV: 1, load: null };
  return { ...base, kg: load.kg, loadV: 1, load: load.input };
}

/* ───────────────────────────── EX-LOAD01-R1 장비 목표 ───────────────────────────── */

type TargetLoadUi = {
  variant: 'band' | 'mass' | null;
  role: BandRoleRecorded | null;
  bands: BandComponent[];
  setupLabel: string;
  unequal: boolean;
  left: string;
  right: string;
};

const EMPTY_TARGET_LOAD_UI: TargetLoadUi = { variant: null, role: null, bands: [], setupLabel: '', unequal: false, left: '', right: '' };

/** 지금 목표(또는 통증 날 쉬어 둔 목표)로 칸을 채운다 */
function initialLoadUi(t: LoadTarget | null, unit: WeightUnit): TargetLoadUi {
  if (!t) return EMPTY_TARGET_LOAD_UI;
  const s = seedOfLoadTarget(t);
  const shown = (kg: number | null) => (kg == null ? '' : String(round1(toWeight(kg, unit))));
  return { variant: s.variant, role: s.role, bands: s.bands, setupLabel: s.setupLabel, unequal: s.unequal, left: shown(s.leftKg), right: shown(s.rightKg) };
}

/** 장비 목표로 보낼 것 — 안 건드림(none) · 지움(clear) · 정함(set). 못 만들면 그 까닭 */
type LoadEdit =
  | { ok: true; send: 'none' }
  | { ok: true; send: 'clear' }
  | { ok: true; send: 'set'; input: LoadTargetInput; kg: number | null }
  | { ok: false; error: string };

/**
 * 칸 → 장비 목표. 세트 담기와 같은 도우미(components/load/set-load.ts buildSetLoad)를 structured:true 로 쓴다 — 목표는 판 JSON 이라
 * 새 DB 칸 없이도 저장된다. 무게 칸이 비었으면 오늘 추천 무게로(빈 칸은 추천을 따른다).
 */
function buildLoadTarget(
  ex: RunExercise,
  ui: TargetLoadUi,
  d: Draft,
  unit: WeightUnit,
  view: TargetView,
  stored: LoadTarget | null,
  dirty: boolean
): LoadEdit {
  if (!dirty) return { ok: true, send: 'none' };
  const typed = d.kg.trim() === '' ? null : Number(d.kg);
  const kg = typed != null && Number.isFinite(typed) ? storedKgFromDisplay(typed, unit, [view.recommended.kg, view.override?.kg]) : view.recommended.kg;
  const kgOf = (v: string) => (v.trim() === '' || !Number.isFinite(Number(v)) ? null : storedKgFromDisplay(Number(v), unit, []));
  const nothing = ui.variant == null && ui.role == null && ui.bands.length === 0 && !ui.setupLabel.trim() && !ui.unequal;
  if (nothing) return stored ? { ok: true, send: 'clear' } : { ok: true, send: 'none' };
  const built = buildSetLoad({
    contract: ex.load,
    structured: true,
    weightKg: kg,
    draft: { ...EMPTY_LOAD_DRAFT, variant: ui.variant, role: ui.role, bands: ui.bands, setupLabel: ui.setupLabel, unequal: ui.unequal, leftKg: kgOf(ui.left), rightKg: kgOf(ui.right) },
  });
  if (!built.ok) return { ok: false, error: built.error };
  if (built.load === undefined) return stored ? { ok: true, send: 'clear' } : { ok: true, send: 'none' };
  return { ok: true, send: 'set', input: { variant: built.variant ?? null, load: built.load }, kg: built.weightKg };
}

/** 무게 칸 이름 — 장비 목표를 받는 운동이면 계약이 말하는 이름('무게(봉 포함)' · '케이블 머신 설정값') */
function kgLabelOf(ex: RunExercise, ui: TargetLoadUi): string {
  return loadForm(ex.load, ex.load.mode === 'alternative' ? (ui.variant ?? 'mass') : null, true, equipmentDisplayName).kgLabel ?? '무게';
}

/** 장비 목표 칸 — 밴드/무게 고르기 · 밴드 역할 · 밴드(창에서) · 기구 이름 · 양손 다른 무게. 목표는 이미 남긴 세트(한 것)와 따로다 */
function LoadTargetSection({
  exercise,
  ui,
  stored,
  paused,
  dirty,
  wUnit,
  onEdit,
  onOpenBands,
  onClear,
  unitText,
}: {
  exercise: RunExercise;
  ui: TargetLoadUi;
  stored: LoadTarget | null;
  paused: boolean;
  dirty: boolean;
  wUnit: WeightUnit;
  onEdit: (patch: Partial<TargetLoadUi>) => void;
  onOpenBands: () => void;
  onClear: () => void;
  unitText: (kg: number) => string;
}) {
  const c = exercise.load;
  const variant = c.mode === 'alternative' ? ui.variant : null;
  const form = loadForm(c, variant, true, equipmentDisplayName);
  const act = activeContract(c, variant);
  const bandHere = form.band === 'picker';
  const fixed = act?.bandRole ?? null;
  const has = ui.variant != null || ui.bands.length > 0 || !!ui.setupLabel.trim() || ui.unequal || ui.role != null;
  return (
    <section aria-label="목표 장비" className="space-y-3 rounded-2xl bg-ink/4 p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-caption font-semibold text-muted">목표 장비</p>
        {has && (
          <button type="button" onClick={onClear} className="min-h-11 rounded-full px-3 text-xs font-semibold text-muted active:bg-ink/6">
            장비 목표 지우기
          </button>
        )}
      </div>
      {stored && !dirty && (
        <p className="text-sm text-ink">
          {paused ? '쉬어 둔 목표 · ' : '지금 목표 · '}
          {loadTargetText(stored, unitText)}
        </p>
      )}
      {form.variants && (
        <div role="group" aria-label="목표로 쓸 것" className="flex gap-1.5">
          {(
            [
              ['band', '밴드'],
              ['mass', '무게'],
            ] as const
          ).map(([v, label]) => (
            <button
              key={v}
              type="button"
              aria-pressed={ui.variant === v}
              onClick={() => onEdit({ variant: v, unequal: false })}
              className="min-h-11 flex-1 rounded-full bg-surface text-footnote font-semibold text-ink transition-colors aria-pressed:bg-sky aria-pressed:text-white"
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {bandHere && (
        <div className="space-y-2">
          {fixed ? (
            <p className="text-sm font-semibold text-ink">{BAND_ROLE_LABEL[fixed]}</p>
          ) : (
            <RoleChips value={ui.role} onChange={(role) => onEdit({ role })} />
          )}
          <div className="flex flex-wrap gap-1.5">
            {ui.bands.map((b, i) => (
              <BandChip key={`${i}`} band={b} onRemove={() => onEdit({ bands: ui.bands.filter((_, k) => k !== i) })} />
            ))}
          </div>
          <button type="button" onClick={onOpenBands} className="min-h-11 rounded-full bg-surface px-4 text-sm font-semibold text-sky">
            {ui.bands.length ? '밴드 바꾸기' : '목표 밴드 고르기'}
          </button>
        </div>
      )}
      {form.setup && (
        <label className="block text-xs text-muted">
          기구 이름(같은 기구끼리만 견줘요)
          <Input
            value={ui.setupLabel}
            onChange={(e) => onEdit({ setupLabel: e.target.value })}
            placeholder="예: 2층 케이블 왼쪽"
            className="mt-1"
          />
        </label>
      )}
      {form.split && (
        <div className="space-y-2">
          <button
            type="button"
            aria-pressed={ui.unequal}
            onClick={() => onEdit({ unequal: !ui.unequal })}
            className="flex min-h-11 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-muted transition-colors aria-pressed:text-sky"
          >
            <ArrowLeftRight aria-hidden className="h-3.5 w-3.5" />
            {ui.unequal ? '양손 같은 무게로' : '양손 무게가 달라요'}
          </button>
          {ui.unequal && (
            <div className="flex gap-2">
              {(
                [
                  ['left', '왼손'],
                  ['right', '오른손'],
                ] as const
              ).map(([k, label]) => (
                <label key={k} className="min-w-0 flex-1 text-xs text-muted">
                  {label} ({wUnit})
                  <input
                    inputMode="decimal"
                    value={ui[k]}
                    onChange={(e) => onEdit({ [k]: e.target.value.replace(/[^\d.]/g, '') })}
                    className="mt-1 block min-h-11 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink tabular-nums"
                  />
                </label>
              ))}
            </div>
          )}
        </div>
      )}
      <p className="text-caption leading-relaxed text-muted">
        목표는 이 운동 · 오늘만이에요. 이미 남긴 세트(한 것)는 바뀌지 않아요. 다음 세트 칸을 아직 안 건드렸으면 이 목표로 채워 둬요.
        {fixedBandRole(c) == null && bandHere ? ' 밴드 색으로 세기를 가늠하지 않아요.' : ''}
      </p>
    </section>
  );
}

function Layer({
  label,
  value,
  strong = false,
  children,
}: {
  label: string;
  value: string;
  strong?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div className={`rounded-xl px-3 py-2 ${strong ? 'bg-sky/10' : 'bg-ink/4'}`}>
      <dt className="text-caption font-semibold text-muted">{label}</dt>
      <dd className={`mt-0.5 ${strong ? 'font-semibold text-ink' : 'text-ink'}`}>
        {value}
        {children}
      </dd>
    </div>
  );
}

function Field({
  label,
  unit,
  value,
  placeholder,
  step,
  min,
  max,
  decimal = false,
  onChange,
}: {
  label: string;
  unit: string;
  value: string;
  placeholder: string;
  step: number;
  min: number;
  max: number;
  decimal?: boolean;
  onChange: (v: string) => void;
}) {
  const bump = (dir: 1 | -1) => {
    const base = value.trim() === '' ? Number(placeholder) : Number(value);
    const start = Number.isFinite(base) ? base : min;
    const next = Math.min(max, Math.max(min, round1(start + dir * step)));
    onChange(String(next));
  };
  return (
    <div className="flex items-center gap-2">
      <label className="min-w-0 flex-1 text-sm font-semibold text-ink">
        {label}
        <input
          inputMode={decimal ? 'decimal' : 'numeric'}
          value={value}
          placeholder={`추천 ${placeholder}`}
          onChange={(e) => onChange(e.target.value.replace(decimal ? /[^\d.]/g : /\D/g, ''))}
          className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2 text-base font-normal tabular-nums"
          aria-describedby={undefined}
        />
      </label>
      <span className="w-8 pt-6 text-xs text-muted">{unit}</span>
      <div className="flex gap-1 pt-5">
        <button
          type="button"
          aria-label={`${label} 줄이기`}
          onClick={() => bump(-1)}
          className="grid h-11 w-11 place-items-center rounded-full bg-surface text-ink active:bg-ink/6"
        >
          <Minus aria-hidden className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={`${label} 늘리기`}
          onClick={() => bump(1)}
          className="grid h-11 w-11 place-items-center rounded-full bg-surface text-ink active:bg-ink/6"
        >
          <Plus aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
