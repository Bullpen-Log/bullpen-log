'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import {
  PITCH_RESULTS,
  PITCH_TYPES,
  zoneLabel,
  type PitchEdit,
} from '@/lib/velocity-meta';

/**
 * 공 하나를 고치는 칸들 — 구종 · 코스 · 결과 · 스피드건 값 · 메모.
 *
 * 측정 화면(막 잰 공)과 그날 화면(저장된 공)이 같은 것을 쓴다. 값은 부르는 쪽이 쥐고
 * (controlled), 여기는 그리기와 누름만 맡는다.
 */
export function PitchEditorFields({
  value,
  onChange,
}: {
  value: PitchEdit;
  onChange: (next: PitchEdit) => void;
}) {
  const set = (patch: Partial<PitchEdit>) => onChange({ ...value, ...patch });
  return (
    <div className="space-y-4">
      <Field label="구종">
        <div className="flex flex-wrap gap-1.5">
          {PITCH_TYPES.map((t) => (
            <Chip
              key={t.key}
              on={value.pitchType === t.key}
              onClick={() =>
                set({ pitchType: value.pitchType === t.key ? null : t.key })
              }
            >
              {t.label}
            </Chip>
          ))}
        </div>
      </Field>

      <Field
        label="코스"
        hint={zoneLabel(value.zone) ?? '투수가 보는 대로 · 누르면 골라요'}
      >
        <div className="flex items-center gap-4">
          <ZoneGrid value={value.zone} onChange={(zone) => set({ zone })} />
          <div className="flex flex-col gap-1.5">
            {PITCH_RESULTS.map((r) => (
              <Chip
                key={r.key}
                on={value.result === r.key}
                tone={r.key === 'strike' ? 'ok' : 'warn'}
                onClick={() => set({ result: value.result === r.key ? null : r.key })}
              >
                {r.label}
              </Chip>
            ))}
          </div>
        </div>
      </Field>

      <Field label="스피드건 값" hint="같이 쟀으면 적어요 — 보정에 쓰여요">
        <div className="relative">
          <input
            inputMode="decimal"
            value={value.gunKmh ?? ''}
            onChange={(e) => {
              const t = e.target.value.replace(/[^\d.]/g, '');
              set({ gunKmh: t === '' ? null : Number(t) });
            }}
            placeholder="예) 138"
            className="h-11 w-full rounded-xl border border-line bg-surface-2 px-4 pr-14 text-base tabular-nums text-ink placeholder:text-muted/60 focus:border-sky focus:outline-none"
          />
          <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-xs text-muted">
            km/h
          </span>
        </div>
      </Field>

      <Field label="메모">
        <input
          value={value.memo ?? ''}
          onChange={(e) => set({ memo: e.target.value || null })}
          maxLength={500}
          placeholder="예) 팔이 늦게 나옴"
          className="h-11 w-full rounded-xl border border-line bg-surface-2 px-4 text-base text-ink placeholder:text-muted/60 focus:border-sky focus:outline-none"
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-semibold text-ink">{label}</span>
        {hint && <span className="text-[11px] text-muted">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function Chip({
  on,
  tone = 'sky',
  onClick,
  children,
}: {
  on: boolean;
  tone?: 'sky' | 'ok' | 'warn';
  onClick: () => void;
  children: React.ReactNode;
}) {
  const onClass =
    tone === 'ok'
      ? 'bg-ok text-white'
      : tone === 'warn'
        ? 'bg-warn text-white'
        : 'bg-sky text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`min-h-9 rounded-full px-3.5 text-[13px] font-semibold transition-colors ${
        on ? onClass : 'bg-surface-2 text-ink hover:bg-line'
      }`}
    >
      {children}
    </button>
  );
}

/** 스트라이크 존 9칸 — 1~9, 왼쪽 위부터. 다시 누르면 푼다 */
export function ZoneGrid({
  value,
  onChange,
  size = 'md',
}: {
  value: number | null;
  onChange?: (zone: number | null) => void;
  size?: 'sm' | 'md';
}) {
  const cell = size === 'sm' ? 'h-4 w-4' : 'h-9 w-9';
  return (
    <div
      role={onChange ? 'radiogroup' : undefined}
      aria-label="코스"
      className={`grid grid-cols-3 gap-0.5 rounded-lg border-2 border-ink/20 bg-line p-0.5 ${
        onChange ? '' : 'pointer-events-none'
      }`}
    >
      {Array.from({ length: 9 }, (_, i) => i + 1).map((z) => {
        const on = value === z;
        return (
          <button
            key={z}
            type="button"
            role={onChange ? 'radio' : undefined}
            aria-checked={onChange ? on : undefined}
            aria-label={zoneLabel(z) ?? String(z)}
            tabIndex={onChange ? 0 : -1}
            onClick={onChange ? () => onChange(on ? null : z) : undefined}
            className={`${cell} rounded-[3px] transition-colors ${
              on ? 'bg-sky' : 'bg-surface hover:bg-sky-tint'
            }`}
          />
        );
      })}
    </div>
  );
}

/**
 * 아래에서 올라오는 창 — 아이폰의 시트처럼. <dialog> 라 초점 · Esc · 바깥 누름이 브라우저 몫이다.
 * PC 에서는 가운데 작은 창으로 뜬다(폰 틀 안에서는 그 틀 아래에서 올라온다).
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="m-0 mt-auto w-full max-w-full rounded-t-3xl border-0 bg-surface p-0 text-ink shadow-2xl backdrop:bg-shade/40 open:motion-safe:animate-sheet-up sm:mx-auto sm:mb-6 sm:max-w-md sm:rounded-3xl"
    >
      <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-line-strong sm:hidden" />
      <div className="flex items-center justify-between px-5 pt-3">
        <h2 className="text-heading text-base">{title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="닫기"
          className="-mr-2 rounded-full p-2 text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <div className="max-h-[70dvh] overflow-y-auto overscroll-contain px-5 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3">
        {children}
      </div>
    </dialog>
  );
}
