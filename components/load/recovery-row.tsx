'use client';

import { useState } from 'react';
import { Modal } from '@/components/modal';
import { Button } from '@/components/ui';
import { BandChip, BandSheet, RoleChips } from '@/components/load/band-picker';
import {
  EMPTY_LOAD_DRAFT,
  activeContract,
  buildSetLoad,
  checkSetLoad,
  fixedBandRole,
  loadForm,
  type LoadDraft,
} from '@/components/load/set-load';
import { AMOUNT_LIMITS, storedKg } from '@/lib/exercise-meta';
import { fromWeight, round1, toWeight, type WeightUnit } from '@/lib/units';
import { LOAD_PROTOCOL } from '@/lib/workout/load/protocol';
import { recoveryEditOf } from '@/lib/workout/load/describe';
import { SETUP_TEXT_MAX, type BandPart, type MassLoad } from '@/lib/workout/load/recorded';
import type { RecordingContract } from '@/lib/workout/load/contract';
import type { PendingSet } from '@/lib/workout/outbox';

/**
 * EX-LOAD01-R1 — 못 보낸 세트 하나를 고치는 창(웹 복구 화면 components/load/recovery-list.tsx 가 연다).
 *
 * - 같은 세트(판 · 운동 · 번호) · 같은 누른 시각 · 같은 계정으로 다시 담는다 — 날짜를 바꾸지 않고, 새 운동을 만들지 않는다.
 * - 운동의 기록 계약을 알면(그 판에 얼린 것 · 없으면 라이브러리 참고) 운동 화면과 같은 칸(무게 · 양손 다른 무게 · 밴드 · 기구 이름)을 내고,
 *   담기 전에 서버와 같은 정규화로 먼저 거른다(buildSetLoad · checkSetLoad). 계약을 모르면 횟수 · 시간만 고치고 무게 기록은 그대로 둔다.
 * - 밴드에 kg 를 만들지 않는다. 고른 밴드 창은 운동 화면의 것(components/load/band-picker.tsx)을 그대로 쓴다.
 * - 이 앱이 모두 아는 줄만 고친다(recoveryEditOf — 다른 약속 · 해석기 · 카탈로그 판, 모르는 무게 모양 · 칸이 있으면 고치지 않고 까닭만). 고친 값은
 *   원래 줄의 모든 칸을 그대로 두고 고친 칸만 바꾼다. 계정은 부르는 쪽이 줄의 계정 그대로 둔다(outbox.correct).
 */
export function RecoveryEditor({
  open,
  row,
  title,
  contract,
  ownerId,
  unit,
  onSave,
  onClose,
}: {
  open: boolean;
  row: PendingSet;
  title: string;
  /** 그 운동의 기록 계약 — 모르면 null(횟수 · 시간만 고친다) */
  contract: RecordingContract | null;
  ownerId: string;
  unit: WeightUnit;
  onSave: (next: PendingSet) => void;
  onClose: () => void;
}) {
  const isHold = row.holdSeconds != null && row.reps == null;
  const structured = row.load != null;
  const [amount, setAmount] = useState(String((isHold ? row.holdSeconds : row.reps) ?? ''));
  const [kgText, setKgText] = useState(row.weightKg != null ? String(round1(toWeight(row.weightKg, unit))) : '');
  const [draft, setDraft] = useState<LoadDraft>(() => draftOfRow(row, contract));
  const [leftText, setLeftText] = useState(draft.leftKg != null ? String(round1(toWeight(draft.leftKg, unit))) : '');
  const [rightText, setRightText] = useState(draft.rightKg != null ? String(round1(toWeight(draft.rightKg, unit))) : '');
  const [bandOpen, setBandOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = contract ? loadForm(contract, draft.variant, structured) : null;
  const act = contract ? activeContract(contract, draft.variant) : null;
  const kgOf = (t: string): number | null => {
    const v = Number(t.replace(',', '.'));
    return t.trim() === '' || !Number.isFinite(v) || v <= 0 ? null : storedKg(fromWeight(v, unit));
  };

  const support = recoveryEditOf(row);
  const save = () => {
    /* 새 판의 줄은 고치지 않는다 — 고치는 칸이 그 줄을 이 앱의 판으로 다시 만들며 원래 값을 잃는다 */
    if (!support.editable) return setError(support.reason);
    const n = Number(amount);
    const limit = isHold ? AMOUNT_LIMITS.holdSeconds : AMOUNT_LIMITS.reps;
    if (!Number.isInteger(n) || n < 1 || n > limit) {
      setError(isHold ? `버틴 시간을 1~${limit}초로 적어 주세요.` : `횟수를 1~${limit}회로 적어 주세요.`);
      return;
    }
    const base: PendingSet = { ...row, ...(isHold ? { holdSeconds: n, reps: null } : { reps: n, holdSeconds: null }) };
    delete base.held;
    if (!contract || !form) {
      /* 계약을 모름 — 무게 기록은 원래 값 그대로, 횟수 · 시간만 */
      onSave(base);
      return;
    }
    const built = buildSetLoad({
      contract,
      structured,
      weightKg: kgOf(kgText),
      draft: { ...draft, leftKg: kgOf(leftText), rightKg: kgOf(rightText) },
      editing: true,
    });
    if (!built.ok) return setError(built.error);
    const problem = checkSetLoad(contract, structured, built);
    if (problem) return setError(problem);
    const next: PendingSet = { ...base, weightKg: built.weightKg, loadProtocol: LOAD_PROTOCOL };
    delete next.load;
    delete next.loadResolver;
    delete next.variant;
    if (built.load !== undefined) {
      next.load = built.load;
      next.loadResolver = built.loadResolver;
    }
    if (built.variant) next.variant = built.variant;
    onSave(next);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`${title} 고치기`}
      description="같은 세트 · 같은 시각으로 다시 담아 보내요"
      footer={
        <div className="flex flex-col gap-2 desk:flex-row-reverse">
          <Button size="lg" className="w-full desk:w-auto" onClick={save}>
            고쳐서 다시 담기
          </Button>
          <Button size="lg" variant="secondary" className="w-full desk:w-auto" onClick={onClose}>
            취소
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <label className="block space-y-1.5">
          <span className="text-sm font-semibold text-ink">{isHold ? '버틴 시간(초)' : '횟수'}</span>
          <input
            inputMode="numeric"
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            className="min-h-11 w-full rounded-xl bg-ink/5 px-4 text-base text-ink focus:outline-2 focus:outline-sky desk:border desk:border-line desk:bg-surface-2"
          />
        </label>

        {form?.variants ? (
          <div role="group" aria-label="밴드로 했는지 무게로 했는지" className="flex gap-1.5">
            {(
              [
                ['band', '밴드'],
                ['mass', '무게'],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                aria-pressed={draft.variant === v}
                onClick={() => setDraft((d) => ({ ...d, variant: v }))}
                className="min-h-11 flex-1 rounded-full bg-ink/6 px-3 text-sm font-semibold text-ink aria-pressed:bg-sky aria-pressed:text-white"
              >
                {label}
              </button>
            ))}
          </div>
        ) : null}

        {form && form.kg !== 'none' && !(form.split && draft.unequal) ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink">
              {form.kgLabel ?? '무게'} ({unit}){form.kg === 'optional' ? <span className="font-normal text-muted"> · 선택</span> : null}
            </span>
            <input
              inputMode="decimal"
              value={kgText}
              onChange={(e) => setKgText(e.target.value.slice(0, 7))}
              className="min-h-11 w-full rounded-xl bg-ink/5 px-4 text-base text-ink focus:outline-2 focus:outline-sky desk:border desk:border-line desk:bg-surface-2"
            />
          </label>
        ) : null}

        {form?.split ? (
          <div className="space-y-2">
            <label className="flex min-h-11 items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={draft.unequal}
                onChange={(e) => setDraft((d) => ({ ...d, unequal: e.target.checked }))}
                className="h-5 w-5"
              />
              양손 무게가 달랐어요
            </label>
            {draft.unequal ? (
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    ['왼손', leftText, setLeftText],
                    ['오른손', rightText, setRightText],
                  ] as const
                ).map(([label, value, setValue]) => (
                  <label key={label} className="block space-y-1.5">
                    <span className="text-sm text-muted">
                      {label} ({unit})
                    </span>
                    <input
                      inputMode="decimal"
                      value={value}
                      onChange={(e) => setValue(e.target.value.slice(0, 7))}
                      className="min-h-11 w-full rounded-xl bg-ink/5 px-4 text-base text-ink focus:outline-2 focus:outline-sky desk:border desk:border-line desk:bg-surface-2"
                    />
                  </label>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {form?.band === 'picker' && act ? (
          <div className="space-y-2">
            <p className="text-sm font-semibold text-ink">밴드</p>
            {!fixedBandRole(act) ? <RoleChips value={draft.role} onChange={(role) => setDraft((d) => ({ ...d, role }))} /> : null}
            <div className="flex flex-wrap gap-1.5">
              {draft.bands.length ? draft.bands.map((b, i) => <BandChip key={i} band={b} />) : <span className="text-sm text-muted">어느 밴드인지 모름</span>}
            </div>
            <Button variant="secondary" size="sm" className="min-h-11" onClick={() => setBandOpen(true)}>
              밴드 바꾸기
            </Button>
            <BandSheet
              open={bandOpen}
              onClose={() => setBandOpen(false)}
              exerciseId={row.exerciseId}
              ownerId={ownerId}
              title={title}
              editing
              fixedRole={fixedBandRole(act)}
              role={draft.role}
              bands={draft.bands}
              onDone={(next) => {
                setDraft((d) => ({ ...d, role: next.role, bands: next.bands }));
                setBandOpen(false);
              }}
            />
          </div>
        ) : form?.band === 'notice' ? (
          <p className="text-sm text-muted">서버가 아직 밴드 기록을 저장하지 못해요. 횟수 · 시간만 고칠 수 있어요.</p>
        ) : null}

        {form?.setup ? (
          <label className="block space-y-1.5">
            <span className="text-sm font-semibold text-ink">
              기구 이름 <span className="font-normal text-muted">· 선택</span>
            </span>
            <input
              value={draft.setupLabel}
              maxLength={SETUP_TEXT_MAX}
              onChange={(e) => setDraft((d) => ({ ...d, setupLabel: e.target.value }))}
              className="min-h-11 w-full rounded-xl bg-ink/5 px-4 text-base text-ink focus:outline-2 focus:outline-sky desk:border desk:border-line desk:bg-surface-2"
            />
          </label>
        ) : null}

        {!contract ? (
          <p className="text-sm leading-relaxed text-muted">
            이 운동의 기록 방식을 지금 확인하지 못해 횟수 · 시간만 고칠 수 있어요. 무게 기록은 처음 남긴 그대로 둬요.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-xl bg-danger-bg px-3 py-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}

/** 대기열 줄의 무게 기록 → 고치는 칸의 처음 값 */
export function draftOfRow(row: PendingSet, contract: RecordingContract | null): LoadDraft {
  const l = row.load ?? null;
  const mass: MassLoad | null = l?.kind === 'mass' ? l : l?.kind === 'combined' ? l.mass : null;
  const band: BandPart | null = l?.kind === 'band' ? l : l?.kind === 'combined' ? l.band : null;
  const left = mass?.parts?.find((p) => p.side === 'left') ?? null;
  const right = mass?.parts?.find((p) => p.side === 'right') ?? null;
  const variant =
    row.variant === 'band' || row.variant === 'mass'
      ? row.variant
      : contract?.mode === 'alternative'
        ? band
          ? 'band'
          : row.weightKg != null
            ? 'mass'
            : null
        : null;
  return {
    ...EMPTY_LOAD_DRAFT,
    variant,
    role: band?.role ?? null,
    bands: band?.bands ? [...band.bands] : [],
    setupLabel: mass?.setup?.label ?? '',
    unequal: !!(left && right),
    leftKg: left?.kg ?? null,
    rightKg: right?.kg ?? null,
  };
}
