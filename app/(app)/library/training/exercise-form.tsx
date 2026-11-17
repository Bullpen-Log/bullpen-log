'use client';

import { createContext, useActionState, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useFormStatus } from 'react-dom';
import { Film, RefreshCw } from '@/components/icon';
import {
  createExercise,
  updateExercise,
  type ActionState,
} from '@/app/actions/content';
import { guardFormAction } from '@/lib/action-offline';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { CheckboxGroup, RadioGroup } from '@/components/choice-inputs';
import { MusclePicker } from '@/components/muscle-picker';
import { ARMCARE_CATEGORY } from '@/lib/armcare/anatomy';
import { kept, keptAll } from '@/lib/form-values';
import { ADMIN_MAX_VIDEO_MB, VideoUpload, type UploadedVideo } from '@/components/video-upload';
import {
  AMOUNT_LIMITS,
  BODY_PARTS,
  DIFFICULTY_LEVELS,
  EXERCISE_EQUIPMENT,
  INTENSITY_LEVELS,
  equipmentDisplayName,
  type Prescription,
} from '@/lib/exercise-meta';
import {
  BAND_ROLE_LABEL,
  massFieldLabel,
  resolveRecordingContract,
  type EffectiveOverrides,
  type RecordingContract,
  type SemanticOverrides,
} from '@/lib/workout/load/contract';
import { codeOverrideOf } from '@/lib/workout/load/overrides';
import {
  BAND_ROLE_CHOICE,
  SEMANTICS_FORM,
  SEMANTICS_NOTE_MAX,
  SEMANTICS_SOURCE_LABEL,
  applicableSemanticFields,
  effectiveOverrides,
  isMassEquipmentName,
  readLoadSemantics,
  validateSemanticOverrides,
  type ReadSemantics,
  type SemanticsIssue,
  type SemanticsSource,
} from '@/lib/workout/load/semantics';

/** 수정할 때 폼에 채워 넣을 기존 값 */
export type ExerciseDraft = {
  id: string;
  title: string;
  category: string;
  description: string;
  bodyParts: string[];
  intensity: string;
  difficulty: string | null;
  equipment: string[];
  /** 키우는 근육 — 암케어만. 맨 앞이 가장 크게 쓰는 근육 */
  targetMuscles?: string[];
  /**
   * 아직 촬영 전(유튜브 참고 영상)인가.
   *
   * 그러면 '지금 올려둔 영상'이라는 말이 맞지 않는다 — 우리 저장소에는
   * 아무것도 없고 유튜브를 가리키고만 있다. 영상을 올리는 순간 참고 영상에서
   * 벗어나므로, 그 사실도 함께 알려준다.
   */
  isReference?: boolean;
} & Partial<Prescription>;

/** 숫자 항목의 기본값 — 비어 있으면 입력칸도 비워둔다. */
function num(value: number | null | undefined): string | undefined {
  return value == null ? undefined : String(value);
}

/** 장비만으로 정하지 못한 까닭(계약의 reason) — 관리자가 무엇을 검토할지 */
const UNRESOLVED_REASON: Readonly<Record<string, string>> = {
  'unknown-equipment': '목록에 없는 장비가 있어요',
  'multiple-mass-families': '무게 도구가 두 종류 넘게 섞여 있어요(예: 덤벨 + 메디신볼)',
  'barbell+handheld': '바벨과 덤벨 · 케틀벨이 같이 있어요(어느 무게를 적는지 몰라요)',
  'handheld+plate': '덤벨 · 케틀벨과 원판이 같이 있어요',
  'cable+machine': '케이블과 머신이 같이 있어요',
  'band+mass-needs-use': '밴드와 무게를 같이 쓰는지(함께) 하나를 고르는지(골라 쓰기) 몰라요',
  'semantics-unsupported': '저장된 뜻 설정을 이 판이 읽지 못해요(판이나 모양이 달라요)',
};

/** 기록 계약 하나를 사람 말로 — '횟수만' · '무게(봉 포함)' · '케이블 머신 설정값' · '밴드: 상표 → 계열 → 단계' */
function recordingLine(c: RecordingContract, isHold: boolean): string {
  const amount = isHold ? '버틴 시간' : '횟수';
  switch (c.mode) {
    case 'none':
      return `${amount}만(kg 칸 없음)`;
    case 'externalMass':
    case 'indicatedLoad':
    case 'implementMass':
      return `${massFieldLabel(c, equipmentDisplayName)}${c.massRequired ? '(꼭)' : '(선택)'} + ${amount}`;
    case 'band':
      return `밴드: 상표 → 계열 → 단계 + ${amount}`;
    case 'combined':
      return `밴드 + ${massFieldLabel(c, equipmentDisplayName)} + ${amount}`;
    case 'alternative':
      return `세트마다 밴드 · 무게 중 하나를 골라요`;
    default:
      return `${amount}만(장비 검토가 필요해요)`;
  }
}

/**
 * EX-LOAD01 — 고른 장비가 정하는 기록 칸 미리보기(읽기만). 운동마다 기록 방식을 따로 고르지 않는다 — 장비를 바꾸면 이 줄이 따라 바뀐다.
 * 같은 해석기(lib/workout/load/contract.ts)를 서버 · 운동 화면과 똑같이 돌린다. 장비만으로 답이 안 나오는 곳(밴드 역할 · 같이/골라 쓰기 ·
 * 받침으로 쓰는 봉 · 무게를 단 맨몸 변형 · 1RM)은 예외(overrides)가 정한다 — R1-04 부터는 아래 뜻 설정 칸에서 고친 값(저장 전)까지.
 */
function RecordingPreview({
  exerciseId,
  equipment,
  category,
  isHold,
  overrides,
}: {
  exerciseId: string | null;
  equipment: readonly string[];
  category: string;
  isHold: boolean;
  /** 이 미리보기에 쓸 예외(지금 쓰는 값이나, 고치는 중이면 저장할 값) */
  overrides: EffectiveOverrides | null;
}) {
  const c = resolveRecordingContract({ exerciseId, equipment, category, isHold, overrides });
  const variants = c.mode === 'alternative' ? (c.variants ?? []) : [];
  const role = c.bandRole ?? variants.find((v) => v.key === 'band')?.contract.bandRole ?? null;
  const banded = c.mode === 'band' || c.mode === 'combined' || c.mode === 'alternative';
  return (
    <div className="space-y-2 rounded-xl border border-line bg-surface-2 px-4 py-3" aria-live="polite">
      <p className="text-xs font-medium text-muted">기록 칸 미리보기 · 고른 장비로 정해져요</p>
      <p className="text-sm font-semibold text-ink">{recordingLine(c, isHold)}</p>
      {variants.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted">
          {variants.map((v) => (
            <li key={v.key}>
              {v.key === 'band' ? '밴드로 할 때' : '무게로 할 때'}: {recordingLine(v.contract, isHold)}
            </li>
          ))}
        </ul>
      )}
      {banded && (
        <p className="text-xs text-muted">
          밴드 역할: {role ? `${BAND_ROLE_LABEL[role]}(검토로 정함)` : '세트마다 저항 · 보조 · 모름 중에 골라요'}
        </p>
      )}
      <p className="text-xs text-muted">추정 1RM: {c.e1rmEligible ? '켜짐' : '꺼짐'}</p>
      {c.mode === 'unresolved' && (
        <p className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs leading-relaxed text-danger">
          {UNRESOLVED_REASON[c.reason ?? ''] ?? '장비 조합을 해석하지 못했어요'}. 장비만으로 정해지지 않아요. 검토가 필요해요.
        </p>
      )}
    </div>
  );
}

/* ─────────────── R1-04 · 관리자 뜻 설정(장비만으로 안 정해지는 예외만) ─────────────── */

/**
 * 관리자 화면이 넘기는 뜻 설정 — editable 은 스키마 스위치(WORKOUT_LOAD_SCHEMA), stored 는 운동 id → 저장된 날것(관리자에게만,
 * 스위치가 켜졌을 때만 page.tsx 가 읽는다). 없으면(관리자 아님 · 스위치 꺼짐) 코드 검토 표만 보여 준다.
 */
export type LoadSemanticsAdmin = { editable: boolean; stored: Record<string, unknown> };

const LoadSemanticsContext = createContext<LoadSemanticsAdmin | null>(null);

export function LoadSemanticsProvider({ value, children }: { value: LoadSemanticsAdmin | null | undefined; children: ReactNode }) {
  return <LoadSemanticsContext.Provider value={value ?? null}>{children}</LoadSemanticsContext.Provider>;
}

type SemState = {
  /** default = 검토 기본값(저장 칸 비움) · custom = 이 운동만 예외 */
  mode: 'default' | 'custom';
  bandRole: '' | 'resistance' | 'assistance';
  use: '' | 'combined' | 'alternative';
  fixedSupport: string[];
  weightedVariation: boolean;
  e1rm: '' | 'on' | 'off';
  note: string;
};

function semStateOf(o: SemanticOverrides | null | undefined, mode: SemState['mode'], note: string): SemState {
  return {
    mode,
    bandRole: o?.bandRole ?? '',
    use: o?.use ?? '',
    fixedSupport: [...(o?.fixedSupport ?? [])],
    weightedVariation: o?.weightedVariation === true,
    e1rm: o?.e1rm === true ? 'on' : o?.e1rm === false ? 'off' : '',
    note,
  };
}

/** 지금 상태에서 보낼 날것 — 지금 장비로 보이는 칸만(보이지 않는 칸은 보내지 않는다 · 서버가 같은 값으로 다시 검사) */
function semRawOf(s: SemState, equipment: readonly string[]): Record<string, unknown> {
  const fixed = s.fixedSupport.filter((e) => equipment.includes(e) && isMassEquipmentName(e));
  const ap = applicableSemanticFields(equipment, fixed);
  const raw: Record<string, unknown> = {};
  if (ap.fixedSupport && fixed.length) raw.fixedSupport = fixed;
  if (ap.bandRole && s.bandRole) raw.bandRole = s.bandRole;
  if (ap.use && s.use) raw.use = s.use;
  if (ap.weightedVariation && s.weightedVariation) raw.weightedVariation = true;
  if (s.e1rm === 'on') raw.e1rm = true;
  else if (s.e1rm === 'off') raw.e1rm = false;
  return raw;
}

/** 예외 한 묶음을 사람 말로 — '보조 밴드 · 받침: 바벨' */
function overridesLine(o: EffectiveOverrides | null): string {
  if (!o) return '없음';
  if (o.unsupported) return '읽지 못함';
  const parts: string[] = [];
  if (o.bandRole) parts.push(BAND_ROLE_LABEL[o.bandRole]);
  if (o.use) parts.push(o.use === 'combined' ? '밴드 + 무게 함께' : '밴드 · 무게 골라 쓰기');
  if (o.fixedSupport?.length) parts.push(`받침: ${o.fixedSupport.map(equipmentDisplayName).join(', ')}`);
  if (o.weightedVariation) parts.push('무게를 더한 맨몸');
  if (o.e1rm === true) parts.push('추정 1RM 켜기');
  if (o.e1rm === false) parts.push('추정 1RM 끄기');
  return parts.length ? parts.join(' · ') : '없음';
}

const semChip =
  'cursor-pointer select-none rounded-full border border-transparent bg-ink/6 px-3.5 py-2 text-footnote text-ink/80 transition-colors peer-checked:border-sky peer-checked:bg-sky/10 peer-checked:font-semibold peer-checked:text-sky peer-focus-visible:ring-1 peer-focus-visible:ring-sky peer-disabled:cursor-not-allowed peer-disabled:opacity-50 desk:rounded-lg desk:border-line desk:bg-surface-2 desk:px-3 desk:text-xs desk:text-muted desk:peer-checked:font-medium';

function SemRadio<T extends string>({
  name,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  name: string;
  label: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string; disabled?: boolean }>;
  disabled: boolean;
  onChange: (v: T) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="mb-2 block text-xs font-medium text-muted">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={o.value || 'none'} className="inline-flex">
            <input
              type="radio"
              name={name}
              checked={value === o.value}
              disabled={disabled || o.disabled}
              onChange={() => onChange(o.value)}
              className="peer sr-only"
              data-haptic="none"
            />
            <span className={semChip}>{o.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/**
 * 뜻 설정 칸 — 장비가 말하지 않는 진짜 예외만(밴드 역할 · 함께/골라 쓰기 · 받침 · 무게를 더한 맨몸 · 추정 1RM).
 * 기록 칸(무게 · 밴드 · 횟수)은 여전히 고른 장비가 저절로 정한다. 운동마다 기록 방식을 고르는 칸이 아니다.
 * 관리자가 칸을 건드렸을 때만 서버로 보낸다(제목만 고쳐 저장할 때 저장값을 다시 쓰지 않게 · 다른 판이 쓴 값을 지키게).
 */
function SemanticsControl({
  sem,
  setSem,
  dirty,
  equipment,
  editable,
  locked,
  schemaOn,
  current,
  stored,
  issues,
  staleIssues,
}: {
  sem: SemState;
  setSem: (patch: Partial<SemState>) => void;
  dirty: boolean;
  equipment: readonly string[];
  editable: boolean;
  locked: boolean;
  schemaOn: boolean;
  current: { overrides: EffectiveOverrides | null; source: SemanticsSource };
  stored: ReadSemantics | undefined;
  issues: SemanticsIssue[] | null;
  staleIssues: SemanticsIssue[] | null;
}) {
  const uid = useId();
  const raw = semRawOf(sem, equipment);
  const ap = applicableSemanticFields(equipment, (raw.fixedSupport as string[] | undefined) ?? []);
  const massItems = equipment.filter(isMassEquipmentName);
  const off = !editable || sem.mode === 'default';
  const submit = editable && dirty;
  const savedAt = stored?.kind === 'ok' && stored.value.at ? new Date(stored.value.at) : null;
  return (
    <div className="space-y-3 rounded-xl border border-line px-4 py-3" data-load-semantics={editable ? 'editable' : 'readonly'}>
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted">장비만으로 안 정해지는 예외(뜻 설정)</p>
        <p className="text-sm text-ink">
          지금: {overridesLine(current.overrides)}
          <span className="text-xs text-muted"> · {SEMANTICS_SOURCE_LABEL[current.source]}</span>
        </p>
        {savedAt && !Number.isNaN(savedAt.getTime()) && (
          <p className="text-xs text-muted">
            저장한 때 {savedAt.toLocaleDateString('ko-KR')}
            {stored?.kind === 'ok' && stored.value.note ? ` · 메모: ${stored.value.note}` : ''}
          </p>
        )}
        {stored?.kind === 'unsupported' && (
          <p className="rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs leading-relaxed text-danger">
            저장된 뜻 설정을 읽지 못해서 이 운동은 기록 방식을 정하지 않아요. 아래에서 다시 정하거나 검토 기본값으로 되돌려 주세요.
          </p>
        )}
      </div>

      {!schemaOn && (
        <p className="text-caption leading-relaxed text-muted">
          스키마 적용 뒤에 바꿀 수 있어요. 지금은 검토 표대로 보기만 해요.
        </p>
      )}
      {schemaOn && locked && (
        <p className="text-caption leading-relaxed text-muted">검토로 잠근 운동이라 여기서 바꿀 수 없어요.</p>
      )}

      {schemaOn && !locked && (
        <SemRadio
          name={`${uid}-mode`}
          label="이 운동의 예외"
          value={sem.mode}
          disabled={!editable}
          options={[
            { value: 'default', label: '검토 기본값 쓰기' },
            { value: 'custom', label: '이 운동만 따로 정하기' },
          ]}
          onChange={(mode) => setSem({ mode })}
        />
      )}

      <div className="space-y-3">
        {ap.bandRole && (
          <SemRadio
            name={`${uid}-bandRole`}
            label="밴드 역할"
            value={sem.bandRole}
            disabled={off}
            options={BAND_ROLE_CHOICE}
            onChange={(bandRole) => setSem({ bandRole })}
          />
        )}
        {ap.use && (
          <SemRadio
            name={`${uid}-use`}
            label="밴드와 무게"
            value={sem.use}
            disabled={off}
            options={[
              { value: '', label: '정하지 않음' },
              { value: 'combined', label: '함께 써요' },
              { value: 'alternative', label: '세트마다 골라 써요' },
            ]}
            onChange={(use) => setSem({ use })}
          />
        )}
        {ap.fixedSupport && massItems.length > 0 && (
          <fieldset disabled={off}>
            <legend className="mb-2 block text-xs font-medium text-muted">받침으로만 쓰는 장비(드는 무게가 아니에요)</legend>
            <div className="flex flex-wrap gap-2">
              {massItems.map((e) => (
                <label key={e} className="inline-flex">
                  <input
                    type="checkbox"
                    checked={sem.fixedSupport.includes(e)}
                    disabled={off}
                    onChange={(ev) =>
                      setSem({
                        fixedSupport: ev.target.checked ? [...sem.fixedSupport, e] : sem.fixedSupport.filter((x) => x !== e),
                      })
                    }
                    className="peer sr-only"
                    data-haptic="none"
                  />
                  <span className={semChip}>{equipmentDisplayName(e)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        {ap.weightedVariation && (
          <label className="flex items-center gap-2.5 text-sm text-ink">
            <input
              type="checkbox"
              checked={sem.weightedVariation}
              disabled={off}
              onChange={(ev) => setSem({ weightedVariation: ev.target.checked })}
              className="h-4 w-4 rounded border-line-strong accent-sky"
              data-haptic="none"
            />
            무게를 더한 맨몸 변형(조끼 · 벨트로 더한 무게만 적어요)
          </label>
        )}
        <SemRadio
          name={`${uid}-e1rm`}
          label="추정 1RM"
          value={sem.e1rm}
          disabled={off}
          options={[
            { value: '', label: '규칙대로' },
            { value: 'on', label: '켜기(검토함)' },
            { value: 'off', label: '끄기' },
          ]}
          onChange={(e1rm) => setSem({ e1rm })}
        />
        {schemaOn && !locked && (
          <Field label={`메모(선택 · ${SEMANTICS_NOTE_MAX}자까지)`}>
            <Input
              value={sem.note}
              maxLength={SEMANTICS_NOTE_MAX}
              disabled={off}
              onChange={(ev) => setSem({ note: ev.target.value })}
              placeholder="왜 이렇게 정했는지"
            />
          </Field>
        )}
      </div>

      {issues && issues.length > 0 && (
        <ul className="space-y-1 rounded-lg border border-danger-line bg-danger-bg px-3 py-2 text-xs leading-relaxed text-danger" role="alert">
          {issues.map((i) => (
            <li key={`${i.field}:${i.code}`}>{i.message}</li>
          ))}
        </ul>
      )}
      {!dirty && staleIssues && staleIssues.length > 0 && (
        <p className="rounded-lg border border-line bg-surface-2 px-3 py-2 text-xs leading-relaxed text-muted">
          저장된 설정 가운데 지금 장비로는 쓰이지 않는 칸이 있어요. {staleIssues.map((i) => i.message).join(' ')}
        </p>
      )}

      {/* 서버로 보내는 값 — 관리자가 칸을 건드렸을 때만(SEMANTICS_FORM, lib/workout/load/semantics.ts semanticsDecisionOf 가 읽는다) */}
      {submit && (
        <>
          <input type="hidden" name={SEMANTICS_FORM.marker} value="1" />
          <input type="hidden" name={SEMANTICS_FORM.mode} value={sem.mode} />
          {sem.mode === 'custom' && (
            <>
              {typeof raw.bandRole === 'string' && <input type="hidden" name={SEMANTICS_FORM.bandRole} value={raw.bandRole} />}
              {typeof raw.use === 'string' && <input type="hidden" name={SEMANTICS_FORM.use} value={raw.use} />}
              {((raw.fixedSupport as string[] | undefined) ?? []).map((e) => (
                <input key={e} type="hidden" name={SEMANTICS_FORM.fixedSupport} value={e} />
              ))}
              {raw.weightedVariation === true && <input type="hidden" name={SEMANTICS_FORM.weightedVariation} value="on" />}
              {sem.e1rm && <input type="hidden" name={SEMANTICS_FORM.e1rm} value={sem.e1rm} />}
              {sem.note.trim() && <input type="hidden" name={SEMANTICS_FORM.note} value={sem.note.trim()} />}
            </>
          )}
        </>
      )}
    </div>
  );
}

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      {pending ? '저장 중…' : label}
    </Button>
  );
}

export function ExerciseForm({
  category,
  initial,
  onDone,
}: {
  category: string;
  /** 주어지면 등록이 아니라 수정 폼이 된다. */
  initial?: ExerciseDraft;
  onDone?: () => void;
}) {
  const editing = Boolean(initial);
  /*
   * 유산소는 같은 칸에 '운동 시간'을 적는다. 버티기가 아니므로 이름을 바꾸고,
   * 분으로 셈해 적게 예를 든다 — 초로 받는 칸이라 10분이면 600이다.
   */
  const cardio = category === '유산소';
  const armcare = category === ARMCARE_CATEGORY;
  const [state, formAction] = useActionState<ActionState, FormData>(
    guardFormAction(editing ? updateExercise : createExercise),
    undefined
  );
  const [videos, setVideos] = useState<UploadedVideo[]>([]);
  // 수정할 때는 기본적으로 기존 영상을 그대로 두고, 눌렀을 때만 교체한다.
  const [replacing, setReplacing] = useState(!editing);

  /**
   * 등록에 성공하면 폼을 비워 다음 항목을 바로 입력할 수 있게 한다.
   * key를 바꿔 폼을 새로 그리면 입력칸이 한 번에 비워지므로
   * effect 안에서 상태를 건드릴 필요가 없다.
   */
  const [formKey, setFormKey] = useState(0);
  /*
   * EX-LOAD01 — 기록 칸 미리보기에 쓸 지금 폼 값(장비 · 버티기인가). 폼 칸은 그대로 두고(서버 액션이 읽는다), 바뀔 때마다 폼에서
   * 다시 읽는다 — React 가 액션 뒤에 폼을 되돌려도(오류로 돌아옴 · 등록 뒤 비움) 아래 효과가 다시 읽어 맞춘다.
   */
  const formRef = useRef<HTMLFormElement>(null);
  const [preview, setPreview] = useState(() => ({
    equipment: [...(initial?.equipment ?? [])],
    isHold: initial?.holdSeconds != null && initial?.reps == null,
  }));
  const readPreview = (f: HTMLFormElement | null) => {
    if (!f) return;
    const data = new FormData(f);
    const equipment = data.getAll('equipment').filter((v): v is string => typeof v === 'string');
    const filled = (name: string) => String(data.get(name) ?? '').trim() !== '';
    setPreview({ equipment, isHold: filled('holdSeconds') && !filled('reps') });
  };
  /*
   * R1-04 — 뜻 설정. 스위치가 켜졌을 때만 고칠 수 있고(page.tsx 가 editable 을 넘긴다), 잠근 검토 운동은 보기만.
   * 처음 값: 저장된 값이 있으면 그것(이 운동만 따로), 없으면 지금 쓰는 검토 예외(검토 기본값).
   */
  const semAdmin = useContext(LoadSemanticsContext);
  const exerciseId = initial?.id ?? null;
  const code = codeOverrideOf(exerciseId);
  const locked = code?.locked === true;
  const schemaOn = semAdmin?.editable === true;
  const semEditable = schemaOn && !locked;
  const stored: ReadSemantics | undefined = schemaOn ? readLoadSemantics(exerciseId ? (semAdmin?.stored[exerciseId] ?? null) : null) : undefined;
  const current = effectiveOverrides(code, stored);
  const semInitial = () =>
    stored?.kind === 'ok' ? semStateOf(stored.value.overrides, 'custom', stored.value.note ?? '') : semStateOf(current.overrides, 'default', '');
  const [sem, setSemState] = useState<SemState>(semInitial);
  const [semDirty, setSemDirty] = useState(false);
  const setSem = (patch: Partial<SemState>) => {
    setSemState((s) => ({ ...s, ...patch }));
    setSemDirty(true);
  };

  const [seenState, setSeenState] = useState(state);
  if (state !== seenState) {
    setSeenState(state);
    if (state?.success) {
      setVideos([]);
      if (editing) {
        setReplacing(false);
      } else {
        setFormKey((k) => k + 1);
        /* 새로 등록한 뒤에는 뜻 설정도 처음으로 */
        setSemState(semStateOf(null, 'default', ''));
        setSemDirty(false);
      }
    }
  }

  /* 미리보기에 쓸 예외 — 건드리지 않았으면 지금 쓰는 값, 검토 기본값이면 코드 표, 따로 정하면 검사를 통과한 저장할 값 */
  const semCategory = initial?.category ?? category;
  const semCheck =
    semEditable && semDirty && sem.mode === 'custom'
      ? validateSemanticOverrides(semRawOf(sem, preview.equipment), {
          exerciseId,
          equipment: preview.equipment,
          category: semCategory,
          isHold: preview.isHold,
        })
      : null;
  const previewOverrides: EffectiveOverrides | null = !semDirty
    ? current.overrides
    : sem.mode === 'default'
      ? effectiveOverrides(code, { kind: 'none' }).overrides
      : semCheck?.ok
        ? semCheck.overrides
        : current.overrides;
  const staleCheck =
    stored?.kind === 'ok'
      ? validateSemanticOverrides(stored.value.overrides, { exerciseId, equipment: preview.equipment, category: semCategory, isHold: preview.isHold })
      : null;

  /* 액션이 끝나 폼이 되돌려진 뒤(오류 · 등록 뒤 비움) 미리보기를 폼에 다시 맞춘다 */
  useEffect(() => {
    /* 폼(DOM)이 되돌려진 뒤의 값을 한 번 다시 읽는다 */
    readPreview(formRef.current);
  }, [state, formKey]);

  /* 수정 저장에 성공하면 부모가 닫는다 — 그리는 도중에 부모 상태를 바꾸면 React 가 경고했다(2026-10-18) */
  useEffect(() => {
    if (editing && state?.success) onDone?.();
  }, [editing, state, onDone]);

  /*
   * 오류로 되돌아왔을 때 방금 보낸 내용을 그대로 다시 보여준다.
   * 기존 값(initial)으로 되돌리지 않는 이유는, 수정 중에 지웠던 항목이
   * 되살아나 사용자가 한 일이 없던 것처럼 보이기 때문이다.
   */
  const before = state?.values;
  const pick = (name: string, fallback?: string | null) =>
    before ? (kept(before, name) ?? '') : (fallback ?? undefined);
  const pickAll = (name: string, fallback?: string[]) =>
    before ? (keptAll(before, name) ?? []) : fallback;

  return (
    <form
      key={formKey}
      ref={formRef}
      action={formAction}
      onChange={(e) => readPreview(e.currentTarget)}
      className="space-y-5"
    >
      <input type="hidden" name="category" value={initial?.category ?? category} />
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <FormError>{state?.error}</FormError>
      {state?.success && (
        <p className="rounded-lg border border-sky-soft/50 bg-sky/10 px-4 py-3 text-sm text-sky-strong">
          {state.success}
        </p>
      )}

      <Field label={`운동 이름 · ${initial?.category ?? category}`}>
        <Input
          name="title"
          defaultValue={pick('title', initial?.title)}
          placeholder="트랩바 데드리프트"
          required
        />
      </Field>

      <Field
        label="운동 영상"
        hint={
          !editing
            ? '폰이나 컴퓨터에 있는 영상을 바로 올려요.'
            : initial?.isReference
              ? '직접 찍은 영상을 올리면 유튜브 참고 영상 대신 그것이 나와요.'
              : '그대로 두면 지금 영상이 유지돼요.'
        }
      >
        {/* 새로 올렸을 때만 경로가 실려간다. 비어 있으면 서버가 기존 영상을 유지한다. */}
        <input type="hidden" name="videoPath" value={videos[0]?.path ?? ''} />
        <input type="hidden" name="thumbPath" value={videos[0]?.thumbPath ?? ''} />

        {editing && !replacing ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3">
            <Film className="h-4 w-4 shrink-0 text-sky" />
            <span className="min-w-0 flex-1 text-sm text-muted">
              {initial?.isReference
                ? '지금은 유튜브 참고 영상을 보여주고 있어요'
                : '지금 올려둔 영상을 그대로 써요'}
            </span>
            <button
              type="button"
              onClick={() => setReplacing(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong px-3 py-2 text-xs text-ink transition-colors hover:border-sky hover:text-sky"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              {initial?.isReference ? '직접 찍은 영상 올리기' : '영상 교체'}
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <VideoUpload
              maxMb={ADMIN_MAX_VIDEO_MB}
              videos={videos}
              onChange={setVideos}
              max={1}
              endpoint="/api/library/upload-url"
              withThumbnail
            />
            {editing && (
              <button
                type="button"
                onClick={() => {
                  setVideos([]);
                  setReplacing(false);
                }}
                className="text-xs text-muted transition-colors hover:text-ink"
              >
                교체 취소(지금 영상 그대로)
              </button>
            )}
          </div>
        )}
      </Field>

      <Field label="설명">
        <Textarea
          name="description"
          rows={4}
          defaultValue={pick('description', initial?.description)}
          placeholder="허리를 중립으로 유지하고 고관절을 접으며 내려갑니다."
          required
        />
      </Field>

      {/* 나중에 몸 상태에 맞는 운동을 코드로 추려내려면 이 항목들이 필요하다. */}
      <div className="space-y-5 border-t border-sky-soft/30 pt-5">
        <CheckboxGroup
          name="bodyParts"
          label="목표 부위 · 필수"
          hint="여러 개 고를 수 있어요."
          options={BODY_PARTS}
          selected={pickAll('bodyParts', initial?.bodyParts)}
        />

        <RadioGroup
          name="intensity"
          label="운동 강도 · 필수"
          hint="부하가 높은 날 어떤 운동을 뺄지 정하는 기준이 돼요."
          options={INTENSITY_LEVELS}
          required
          selected={pick('intensity', initial?.intensity)}
        />

        <RadioGroup
          name="difficulty"
          label="난이도"
          options={DIFFICULTY_LEVELS}
          selected={pick('difficulty', initial?.difficulty)}
        />

        <CheckboxGroup
          name="equipment"
          label="필요 장비"
          options={EXERCISE_EQUIPMENT}
          selected={pickAll('equipment', initial?.equipment)}
        />
        <RecordingPreview
          exerciseId={initial?.id ?? null}
          equipment={preview.equipment}
          category={initial?.category ?? category}
          isHold={preview.isHold}
          overrides={previewOverrides}
        />
        <SemanticsControl
          sem={sem}
          setSem={setSem}
          dirty={semDirty}
          equipment={preview.equipment}
          editable={semEditable}
          locked={locked}
          schemaOn={schemaOn}
          current={current}
          stored={stored}
          issues={semCheck && !semCheck.ok ? semCheck.issues : null}
          staleIssues={staleCheck && !staleCheck.ok ? staleCheck.issues : null}
        />

        {/*
          암케어만 근육을 적는다. 부위별 보강이 이 값으로 부위에 나눠 담고, 오늘의
          암케어가 부위를 고르게 채운다(lib/armcare). 다른 카테고리에서는 칸 자체를
          안 그린다 — 서버도 암케어일 때만 이 값을 저장한다.
        */}
        {armcare && <MusclePicker initial={initial?.targetMuscles ?? []} />}
      </div>

      {/*
        수행 방법. 트레이닝 화면이 "45분에 맞춰 몇 개" 를 정할 때 이 값으로
        운동마다 걸리는 시간을 계산한다. 비워두면 종류로 어림하므로,
        정확한 시간 배분을 원하면 채워두는 편이 좋다.
      */}
      <div className="space-y-4 border-t border-sky-soft/30 pt-5">
        <p className="text-xs font-medium tracking-normal text-muted">수행 방법</p>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="세트">
            <Input
              name="sets"
              type="number"
              min={1}
              max={10}
              inputMode="numeric"
              placeholder="3"
              defaultValue={pick('sets', num(initial?.sets))}
            />
          </Field>
          <Field label="횟수">
            <Input
              name="reps"
              type="number"
              min={1}
              max={100}
              inputMode="numeric"
              placeholder="10"
              defaultValue={pick('reps', num(initial?.reps))}
            />
          </Field>
          <Field label={cardio ? '운동 시간(초, 10분이면 600)' : '버티는 시간(초)'}>
            <Input
              name="holdSeconds"
              type="number"
              min={1}
              max={AMOUNT_LIMITS.holdSeconds}
              inputMode="numeric"
              placeholder={cardio ? '600' : '30'}
              defaultValue={pick('holdSeconds', num(initial?.holdSeconds))}
            />
          </Field>
          <Field label="휴식(초)">
            <Input
              name="restSeconds"
              type="number"
              min={0}
              max={600}
              inputMode="numeric"
              placeholder="60"
              defaultValue={pick('restSeconds', num(initial?.restSeconds))}
            />
          </Field>
        </div>
        <p className="text-xs text-muted/70">
          시간으로 버티는 운동은 횟수를 비우고 버티는 시간만 적어요.
        </p>
        <label className="flex items-center gap-2.5 text-sm text-ink">
          <input
            type="checkbox"
            name="perSide"
            value="on"
            defaultChecked={
              before ? kept(before, 'perSide') === 'on' : Boolean(initial?.perSide)
            }
            className="h-4 w-4 rounded border-line-strong accent-sky"
          />
          좌우를 따로 하는 운동 (한 세트에 양쪽 다)
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <SubmitButton label={editing ? '수정 저장' : '운동 영상 등록'} />
        {editing && (
          <button
            type="button"
            onClick={onDone}
            className="text-sm text-muted transition-colors hover:text-ink"
          >
            취소
          </button>
        )}
      </div>
    </form>
  );
}
