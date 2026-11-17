'use client';

import { useState } from 'react';
import { ChevronLeft, Plus, X } from '@/components/icon';
import { Modal } from '@/components/modal';
import { Input } from '@/components/ui';
import {
  BAND_CATALOG_REVISION,
  BAND_SERIES,
  CUSTOM_TEXT_MAX,
  MAX_BANDS,
  bandText,
  type BandComponent,
  type BandSeries,
} from '@/lib/workout/load/band-catalog';
import { BAND_ROLE_LABEL } from '@/lib/workout/load/contract';
import { SETUP_TEXT_MAX, type BandRoleRecorded } from '@/lib/workout/load/recorded';
import { recallBands } from '@/components/load/set-load';

/**
 * EX-LOAD01 — 밴드 고르기(상표 → 제품 계열 → 단계)와 기구 이름 적기. 운동 화면(웹)이 쓴다.
 *
 * 밴드 단계는 '어느 제품인가'일 뿐 실제 낸 힘(kg)이 아니다 — 색을 kg 으로 바꾸지 않고, 다른 계열의 같은 색을 같은 세기로 보지 않는다
 * (lib/workout/load/band-catalog.ts). 색은 보조이고 글자가 늘 같이 보인다(색을 못 봐도 읽힌다). 목록에 없는 상표는 인쇄된 상표 · 계열 · 단계
 * 글자를 그대로 적는다(표준 단계로 맞추지 않는다 — '다른 상표').
 *
 * 글을 적는 칸(다른 상표 · 기구 이름)은 창 안에 둔다 — 운동 화면 아래 막대는 자판이 뜨면 숨는다(session-client.tsx).
 */

/** 색 점 — 꾸밈이라 읽지 않는다(이름 글이 같이 있다) */
export function Swatch({ color }: { color: string | null }) {
  return (
    <span
      aria-hidden
      className="inline-block h-3.5 w-3.5 shrink-0 rounded-full border border-ink/15"
      style={{ background: color ?? 'transparent' }}
    />
  );
}

/** 고른 밴드 하나 — 색 점 + 이름 */
export function BandChip({ band, onRemove }: { band: BandComponent; onRemove?: () => void }) {
  const text = bandText(band);
  return (
    <span className="inline-flex min-h-9 max-w-full items-center gap-1.5 rounded-full bg-ink/6 py-1 pr-1 pl-2.5 text-xs text-ink">
      <Swatch color={'custom' in band ? null : band.swatch} />
      <span className="min-w-0 truncate">{text}</span>
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`${text} 빼기`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted transition-colors active:bg-ink/10"
        >
          <X aria-hidden className="h-3.5 w-3.5" />
        </button>
      )}
    </span>
  );
}

const ROLES: { value: BandRoleRecorded; label: string }[] = [
  { value: 'resistance', label: '저항' },
  { value: 'assistance', label: '보조' },
  { value: 'unknown', label: '모름' },
];

/** 저항 · 보조 · 모름 — 계약이 역할을 정하지 않은 밴드 운동에서만 */
export function RoleChips({
  value,
  onChange,
}: {
  value: BandRoleRecorded | null;
  onChange: (role: BandRoleRecorded) => void;
}) {
  return (
    <div role="group" aria-label="밴드의 역할" className="flex gap-1.5">
      {ROLES.map((r) => (
        <button
          key={r.value}
          type="button"
          aria-pressed={value === r.value}
          onClick={() => onChange(r.value)}
          className="min-h-10 flex-1 rounded-full bg-ink/6 px-3 text-footnote font-semibold text-ink transition-colors aria-pressed:bg-sky aria-pressed:text-white"
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

const brands = [...new Set(BAND_SERIES.map((s) => s.brand))];

type Step = { at: 'brand' } | { at: 'series'; brand: string } | { at: 'level'; series: BandSeries } | { at: 'custom' };

/** 밴드 하나를 더하는 단계 고르기 */
function AddBand({ onAdd }: { onAdd: (b: BandComponent) => void }) {
  const [step, setStep] = useState<Step>({ at: 'brand' });
  const [brand, setBrand] = useState('');
  const [series, setSeries] = useState('');
  const [level, setLevel] = useState('');
  const back = (to: Step) => (
    <button
      type="button"
      onClick={() => setStep(to)}
      className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs font-semibold text-muted transition-colors active:bg-ink/6"
    >
      <ChevronLeft aria-hidden className="h-3.5 w-3.5" />
      뒤로
    </button>
  );
  const pickBtn = 'flex min-h-11 w-full items-center gap-2 rounded-xl bg-ink/5 px-3 text-left text-sm text-ink transition-colors active:bg-ink/10';

  if (step.at === 'brand') {
    return (
      <div className="space-y-1.5">
        <p className="text-caption text-muted">상표</p>
        {brands.map((b) => (
          <button key={b} type="button" className={pickBtn} onClick={() => setStep({ at: 'series', brand: b })}>
            {b}
          </button>
        ))}
        <button type="button" className={pickBtn} onClick={() => setStep({ at: 'custom' })}>
          다른 상표 <span className="text-xs text-muted">· 밴드에 적힌 글자 그대로</span>
        </button>
      </div>
    );
  }
  if (step.at === 'series') {
    const list = BAND_SERIES.filter((s) => s.brand === step.brand);
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {back({ at: 'brand' })}
          <p className="text-caption text-muted">{step.brand} · 제품 계열</p>
        </div>
        {list.map((s) => (
          <button key={s.id} type="button" className={pickBtn} onClick={() => setStep({ at: 'level', series: s })}>
            <span className="min-w-0 flex-1">{s.name}</span>
            <span className="shrink-0 text-xs text-muted">{s.kind === 'tubing' ? '튜브' : '밴드'}</span>
          </button>
        ))}
      </div>
    );
  }
  if (step.at === 'level') {
    const s = step.series;
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2">
          {back({ at: 'series', brand: s.brand })}
          <p className="min-w-0 truncate text-caption text-muted">{s.name} · 단계</p>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {s.levels.map((l) => (
            <button
              key={l.id}
              type="button"
              className={pickBtn}
              onClick={() => {
                onAdd({ catalog: BAND_CATALOG_REVISION, seriesId: s.id, levelId: l.id, label: l.label, swatch: l.swatch });
                setStep({ at: 'brand' });
              }}
            >
              <Swatch color={l.swatch} />
              {l.label.ko}
            </button>
          ))}
        </div>
        <p className="text-caption leading-relaxed text-muted">
          단계는 제품 이름이에요. 같은 색이라도 계열이 다르면 세기가 달라요.
        </p>
      </div>
    );
  }
  const ok = brand.trim().length > 0 && level.trim().length > 0;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        {back({ at: 'brand' })}
        <p className="text-caption text-muted">다른 상표 · 밴드에 적힌 그대로</p>
      </div>
      <Input value={brand} onChange={(e) => setBrand(e.target.value)} maxLength={CUSTOM_TEXT_MAX} placeholder="상표 (꼭)" aria-label="상표" />
      <Input value={series} onChange={(e) => setSeries(e.target.value)} maxLength={CUSTOM_TEXT_MAX} placeholder="제품 계열 · 모델 (모르면 비워 두세요)" aria-label="제품 계열" />
      <Input value={level} onChange={(e) => setLevel(e.target.value)} maxLength={CUSTOM_TEXT_MAX} placeholder="단계 · 색 (꼭)" aria-label="단계" />
      <button
        type="button"
        disabled={!ok}
        onClick={() => {
          onAdd({ custom: { brand: brand.trim(), series: series.trim() || null, level: level.trim() }, unstandardized: true });
          setBrand('');
          setSeries('');
          setLevel('');
          setStep({ at: 'brand' });
        }}
        className="min-h-11 w-full rounded-full bg-sky/15 text-sm font-semibold text-sky disabled:opacity-40"
      >
        이 밴드 담기
      </button>
      <p className="text-caption leading-relaxed text-muted">목록에 없는 상표는 다른 밴드와 견주지 않아요.</p>
    </div>
  );
}

/**
 * 밴드 고르기 창 — 역할(정해지지 않았을 때) · 쓴 밴드(1~3개). [이대로 쓰기]를 눌러야 바뀐다. 이미 남긴 세트는 바뀌지 않는다 —
 * 다음에 남길 세트에만 쓴다(고치는 세트면 그 세트에만).
 */
export function BandSheet({
  open,
  onClose,
  exerciseId,
  ownerId = null,
  title,
  fixedRole,
  role,
  bands,
  editing = false,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  exerciseId: string;
  /** 지금 계정 — 지난 밴드 기억은 계정마다(모르면 꺼내지 않는다) */
  ownerId?: string | null;
  title: string;
  /** 이미 남긴 세트를 고치는 중인가 — 그 세트에만 쓴다 */
  editing?: boolean;
  /** 계약이 정한 역할(검토한 예외) — 있으면 고르는 칩 대신 이름만 */
  fixedRole: 'resistance' | 'assistance' | null;
  role: BandRoleRecorded | null;
  bands: readonly BandComponent[];
  onDone: (next: { role: BandRoleRecorded | null; bands: BandComponent[] }) => void;
}) {
  const [draftRole, setDraftRole] = useState<BandRoleRecorded | null>(fixedRole ?? role);
  const [draft, setDraft] = useState<BandComponent[]>([...bands]);
  const changeRole = (r: BandRoleRecorded) => {
    setDraftRole(r);
    /* 그 역할로 지난번에 쓴 밴드가 있으면 꺼낸다(같은 운동 · 같은 역할일 때만) — 없으면 고르던 것을 그대로 */
    const memo = recallBands(ownerId, exerciseId, r);
    if (memo.length) setDraft(memo);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="쓴 밴드"
      description={editing ? `${title} · 고치는 세트에만 써요` : `${title} · 다음에 남길 세트에 써요`}
      footer={
        <button
          type="button"
          onClick={() => onDone({ role: fixedRole ?? draftRole, bands: draft })}
          className="min-h-11 w-full rounded-full bg-sky text-sm font-semibold text-white"
        >
          이대로 쓰기
        </button>
      }
    >
      <div className="space-y-4">
        <div className="space-y-1.5">
          <p className="text-caption text-muted">역할</p>
          {fixedRole ? (
            <p className="text-sm font-semibold text-ink">{BAND_ROLE_LABEL[fixedRole]}</p>
          ) : (
            <>
              <RoleChips value={draftRole} onChange={changeRole} />
              <p className="text-caption leading-relaxed text-muted">
                저항은 밴드가 버티게, 보조는 밴드가 몸을 덜어 줘요. 모름으로 남긴 세트는 다른 세트와 견주지 않아요.
              </p>
            </>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-caption text-muted">
            쓴 밴드 {draft.length}/{MAX_BANDS}
          </p>
          {draft.length === 0 ? (
            <p className="text-xs text-muted">아직 고르지 않았어요.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {draft.map((b, i) => (
                <BandChip key={`${i}-${bandText(b)}`} band={b} onRemove={() => setDraft(draft.filter((_, k) => k !== i))} />
              ))}
            </div>
          )}
        </div>

        {draft.length < MAX_BANDS ? (
          <div className="rounded-2xl bg-surface-2 p-3">
            <p className="mb-2 inline-flex items-center gap-1 text-xs font-semibold text-ink">
              <Plus aria-hidden className="h-3.5 w-3.5" />
              밴드 더하기
            </p>
            <AddBand onAdd={(b) => setDraft((d) => (d.length >= MAX_BANDS ? d : [...d, b]))} />
          </div>
        ) : (
          <p className="text-xs text-muted">한 세트에 밴드는 {MAX_BANDS}개까지예요.</p>
        )}
      </div>
    </Modal>
  );
}

/** 케이블 · 머신의 기구 이름 — 같은 이름으로 적은 세트끼리만 무게를 견준다(이 기기 · 이 계정 안에서만 뜻이 있다) */
export function SetupSheet({
  open,
  onClose,
  label,
  apparatus,
  onDone,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  /** '케이블 머신' · '머신' */
  apparatus: string;
  onDone: (label: string) => void;
}) {
  const [text, setText] = useState(label);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="기구 이름"
      description={`${apparatus} · 적어 두면 같은 기구끼리만 무게를 견줘요`}
      footer={
        <div className="flex gap-2">
          {label && (
            <button
              type="button"
              onClick={() => onDone('')}
              className="min-h-11 rounded-full bg-surface px-4 text-sm font-semibold text-ink"
            >
              지우기
            </button>
          )}
          <button
            type="button"
            onClick={() => onDone(text)}
            className="min-h-11 flex-1 rounded-full bg-sky text-sm font-semibold text-white"
          >
            이대로 쓰기
          </button>
        </div>
      }
    >
      <div className="space-y-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={SETUP_TEXT_MAX}
          placeholder="예: 2층 케이블 왼쪽"
          aria-label="기구 이름"
        />
        <p className="text-caption leading-relaxed text-muted">
          기구에 적힌 무게는 잰 힘이 아니라 그 기구의 설정값이에요. 이름 없이 남긴 세트도 저장되지만 다른 날과 견주지 않아요.
        </p>
      </div>
    </Modal>
  );
}
