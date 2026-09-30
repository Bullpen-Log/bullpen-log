'use client';

import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  PITCH_RESULTS,
  PITCH_TYPES,
  zoneLabel,
  type PitchEdit,
} from '@/lib/velocity-meta';
import { CHIP_BASE, CHIP_ON } from './kit';

/* 스피드건 칸의 글자 → 값. 다 적기 전('138.')도 읽는다(138) */
function parseGun(text: string): number | null {
  if (text === '' || text === '.') return null;
  const n = Number(text);
  return Number.isFinite(n) ? n : null;
}

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
  /*
   * 스피드건 칸은 적는 글자 그대로 쥔다 — 숫자로만 쥐면 '138.' 의 점이 그 자리에서 사라져, 138.5 를 적으면 1385 가 됐다
   * (서버가 범위 밖이라 세션 저장을 통째로 거절했다). 값이 밖에서 바뀌면(다른 공을 열었을 때) 글자를 다시 맞춘다.
   */
  const [gunText, setGunText] = useState(
    value.gunKmh == null ? '' : String(value.gunKmh)
  );
  const [gunSeen, setGunSeen] = useState(value.gunKmh);
  if (value.gunKmh !== gunSeen) {
    setGunSeen(value.gunKmh);
    if (parseGun(gunText) !== value.gunKmh)
      setGunText(value.gunKmh == null ? '' : String(value.gunKmh));
  }
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
            value={gunText}
            onChange={(e) => {
              /* 숫자와 점 하나만 */
              const [whole, ...rest] = e.target.value.replace(/[^\d.]/g, '').split('.');
              const t = rest.length ? `${whole}.${rest.join('')}` : whole;
              setGunText(t);
              set({ gunKmh: parseGun(t) });
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
        <span className="text-xs font-medium text-muted">{label}</span>
        {hint && <span className="text-xs text-muted">{hint}</span>}
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
  /* 운동 등록 폼의 선택 칩과 같은 색 · 모서리(components/choice-inputs.tsx). 손가락용이라 높이 40px */
  const onClass =
    tone === 'ok'
      ? 'border-ok bg-ok/10 font-medium text-ok'
      : tone === 'warn'
        ? 'border-warn bg-warn-bg font-medium text-warn'
        : CHIP_ON;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={on ? `${CHIP_BASE} ${onClass}` : CHIP_BASE}
    >
      {children}
    </button>
  );
}

/**
 * 스트라이크 존 9칸 — 1~9, 왼쪽 위부터. 다시 누르면 푼다.
 *
 * onChange 가 없으면 보여 주기만 한다 — 그때는 칸을 <span> 으로 그린다. 공 목록의 줄이 통째로
 * <button> 이라 그 안에 <button> 을 두면 HTML 이 어긋나 화면이 다시 그려진다(hydration).
 */
export function ZoneGrid({
  value,
  onChange,
  size = 'md',
}: {
  value: number | null;
  onChange?: (zone: number | null) => void;
  size?: 'sm' | 'md';
}) {
  const cell = size === 'sm' ? 'h-4 w-4' : 'h-10 w-10';
  const zones = Array.from({ length: 9 }, (_, i) => i + 1);
  const cellClass = (on: boolean) =>
    `${cell} rounded-[3px] transition-colors ${on ? 'bg-sky' : onChange ? 'bg-surface hover:bg-sky-tint' : 'bg-surface'}`;
  const frame =
    'grid grid-cols-3 gap-0.5 rounded-lg border-2 border-ink/20 bg-line p-0.5';

  if (!onChange) {
    return (
      <span
        role="img"
        aria-label={zoneLabel(value) ? `코스 ${zoneLabel(value)}` : '코스 없음'}
        className={`${frame} shrink-0`}
      >
        {zones.map((z) => (
          <span key={z} className={cellClass(value === z)} />
        ))}
      </span>
    );
  }

  return (
    <div role="radiogroup" aria-label="코스" className={frame}>
      {zones.map((z) => {
        const on = value === z;
        return (
          <button
            key={z}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={zoneLabel(z) ?? String(z)}
            onClick={() => onChange(on ? null : z)}
            className={cellClass(on)}
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
      /* 이 시트의 닫힘만 — React 는 close 를 부모 쪽으로도 올려 보내 바깥 창(투구 기록 팝업)까지 닫았다(components/modal.tsx) */
      onClose={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      /* ESC 는 이 시트만 닫는다 — 바깥 창(Modal)의 ESC 받기까지 올라가면 그 창도 닫힌다 */
      onKeyDown={(e) => {
        if (e.key === 'Escape') e.stopPropagation();
      }}
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
