import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { formatWeight, round1, toWeight, type WeightUnit } from '@/lib/units';
import type { RunExercise } from '@/lib/workout/run-exercises';
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
import { rpc, RpcError } from '~/lib/rpc';
import { TYPE, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';
import { EMPTY_LOAD_DRAFT, LoadExtras, buildSetLoad, kgLabel, loadDraftOfTarget, type LoadDraft } from '~/workout/load-input';
import { LOAD_TARGET_UNSUPPORTED_TEXT, loadTargetText, type LoadTarget, type LoadTargetInput } from '@/lib/workout/load/target';

/**
 * 운동 중 '목표 바꾸기' 시트(EX-RX01) — 웹 app/(session)/workout/run/target-sheet.tsx 와 같은 일을 앱에서.
 * 이 운동 · 이 판에서만 세트 · 횟수(또는 시간) · 휴식 · 무게를 바꾼다. 빈 칸은 오늘 추천을 따른다.
 * 저장은 'workout.setSessionTarget'(서버가 다시 검사하고 막는다) — 세트처럼 폰에 쌓아 두지 않고 바로 보낸다(신호가 없으면 안내만).
 */
export function TargetSheet({
  open,
  sessionId,
  exercise,
  painToday,
  doneSets,
  unit,
  onDone,
  onClose,
  c,
}: {
  open: boolean;
  sessionId: string;
  exercise: RunExercise;
  painToday: boolean;
  doneSets: number;
  unit: WeightUnit;
  onDone: (exercise: RunExercise) => void;
  onClose: () => void;
  c: Palette;
}) {
  const view = exercise.target;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [draft, setDraft] = useState(() => (view ? initialDraft(view, exercise, unit) : null));
  /*
   * EX-LOAD01-R1 — 장비 목표(웹 target-sheet.tsx 와 같은 약속). 지금 목표로 열고, 사람이 건드렸을 때만 보낸다 — 안 건드리면 칸이 없는
   * 요청이라 서버가 저장된 장비 목표(다른 앱 버전이 저장한 값도)를 그대로 둔다.
   */
  const [loadDraft, setLoadDraft] = useState<LoadDraft>(() => loadDraftOfTarget(view?.override?.load ?? view?.painPaused?.load ?? null, unit) ?? EMPTY_LOAD_DRAFT);
  const [loadDirty, setLoadDirty] = useState(false);
  const editLoad = (update: (prev: LoadDraft) => LoadDraft) => {
    setLoadDraft(update);
    setLoadDirty(true);
  };

  if (!view || !draft) {
    return (
      <Sheet fit open={open} onClose={onClose} title="목표 바꾸기" c={c}>
        <Text style={[TYPE.sub, { color: c.muted }]}>이 판은 목표를 바꿀 수 없어요. 운동을 다시 열면 바꿀 수 있어요.</Text>
      </Sheet>
    );
  }

  const unitText = (kg: number) => formatWeight(kg, unit) ?? `${kg}kg`;
  const subject = { perSide: exercise.perSide, isHold: exercise.isHold, inMinutes: exercise.inMinutes };
  const storedLoad = view.override?.load ?? view.painPaused?.load ?? null;
  const loadEdit = view.editable.load === true ? buildLoadTarget(exercise, loadDraft, draft, unit, view, storedLoad, loadDirty) : null;
  const input = toInput(draft, exercise, unit, view, loadEdit);
  const check: ReturnType<typeof checkTargetInput> =
    loadEdit && !loadEdit.ok ? { ok: false, error: loadEdit.error, field: 'load' } : checkTargetInput(input, subjectOf(exercise), view.recommended, { painToday, prevLoad: storedLoad });
  const hideKg = view.editable.load === true && (loadDraft.unequal || loadDraft.variant === 'band');
  const preview: TargetValues = {
    sets: input.sets ?? view.recommended.sets,
    reps: input.reps ?? view.recommended.reps,
    holdSeconds: input.holdSeconds ?? view.recommended.holdSeconds,
    restSeconds: input.restSeconds ?? view.recommended.restSeconds,
    kg: input.kg ?? view.recommended.kg,
  };
  const minutes = targetMinutes({ ...subjectOf(exercise), intensity: view.intensity }, preview);

  const save = async (target: TargetInput | null) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await rpc<{ exercise: RunExercise; painToday: boolean } | { error: string }>('workout.setSessionTarget', {
        sessionId,
        exerciseId: exercise.id,
        target,
      });
      if ('error' in res) {
        setError(res.error);
        return;
      }
      setConfirmReset(false);
      setLoadDirty(false);
      onDone(res.exercise);
    } catch (e) {
      setError(
        e instanceof RpcError && e.code === 'offline'
          ? '신호가 없어 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.'
          : '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'
      );
    } finally {
      setBusy(false);
    }
  };

  const amountUnit = exercise.isHold ? (exercise.inMinutes ? '분' : '초') : '회';
  const recAmount = exercise.isHold
    ? view.recommended.holdSeconds != null
      ? exercise.inMinutes
        ? Math.round(view.recommended.holdSeconds / 60)
        : view.recommended.holdSeconds
      : null
    : view.recommended.reps;

  const footer = (
    <View style={{ gap: 8 }}>
      {error ? <Text style={[TYPE.sub, { color: c.danger }]}>{error}</Text> : null}
      {/* EX-LOAD01-R1 — 저장 단추가 꺼진 까닭을 단추 바로 위에도(본문 글은 굴려야 보였다 — 렌더 검토 O1). 검사 규칙은 그대로 */}
      {!error && !confirmReset && !check.ok ? (
        <Text style={[TYPE.sub, { color: c.danger }]} accessibilityLiveRegion="polite">
          {check.error}
        </Text>
      ) : null}
      {confirmReset ? (
        <View style={[st.confirm, { backgroundColor: c.chip }]}>
          <Text style={[TYPE.sub, { color: c.ink }]}>
            오늘 추천 <Text style={{ fontWeight: '700' }}>{describeTarget(view.recommended, subject, unitText)}</Text>(으)로 되돌려요.
          </Text>
          <View style={st.row}>
            <Press onPress={() => setConfirmReset(false)} accessibilityRole="button" style={[st.btn, { backgroundColor: c.card }]}>
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>그대로 두기</Text>
            </Press>
            {/* EX-LOAD01-R1 — 새 앱의 되돌리기는 장비 목표도 함께 지운다(loadV:1). 옛 앱의 null 은 장비 목표를 남긴다 */}
            <Press onPress={() => void save({ loadV: 1, load: null })} disabled={busy} accessibilityRole="button" style={[st.btn, { backgroundColor: c.action, opacity: busy ? 0.6 : 1 }]}>
              <Text style={[TYPE.buttonCompact, { color: c.onAction }]}>되돌리기</Text>
            </Press>
          </View>
        </View>
      ) : (
        <View style={st.row}>
          {view.override || view.painPaused?.load || view.loadUnsupported ? (
            <Press onPress={() => setConfirmReset(true)} accessibilityRole="button" style={[st.btn, st.btnShrink, { backgroundColor: c.card }]}>
              <Icon name="rotate-ccw" size={16} color={c.ink} />
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>추천으로</Text>
            </Press>
          ) : null}
          <Press
            onPress={() => void save(input)}
            disabled={busy || !check.ok}
            accessibilityRole="button"
            accessibilityState={{ disabled: busy || !check.ok }}
            style={[st.btn, { flex: 1, backgroundColor: c.action, opacity: busy || !check.ok ? 0.5 : 1 }]}
          >
            <Text style={[TYPE.buttonCompact, { color: c.onAction }]}>{busy ? '저장 중…' : '이 목표로 하기'}</Text>
          </Press>
        </View>
      )}
    </View>
  );

  return (
    <Sheet open={open} onClose={onClose} title="목표 바꾸기" description={`${exercise.title} · 이 운동 · 오늘만 바뀌어요`} footer={footer} c={c}>
      <View style={{ gap: 14 }}>
        <View style={{ gap: 8 }}>
          <Layer label="라이브러리 기본" value={view.baseline ? describeTarget(view.baseline, subject) : '라이브러리 값 없음'} c={c} />
          <Layer label="오늘 추천" value={describeTarget(view.recommended, subject, unitText)} c={c}>
            {view.basis.map((b) => (
              <Text key={b} style={[TYPE.sub, { color: c.muted }]}>
                {b}
              </Text>
            ))}
          </Layer>
          <Layer
            label={view.override ? '내 목표 · 지금 따르는 값' : '지금 따르는 값(추천과 같음)'}
            value={describeTarget(view.effective, subject, unitText)}
            strong
            c={c}
          />
        </View>

        {painToday ? (
          <View style={[st.notice, { backgroundColor: c.danger + '14' }]}>
            <Icon name="circle-alert" size={16} color={c.danger} />
            <Text style={[TYPE.sub, { color: c.danger, flex: 1 }]}>
              오늘 체크인에 통증이 있어 목표를 오늘 추천보다 올릴 수 없어요. 하다가 아프면 바로 멈추세요.
            </Text>
          </View>
        ) : null}
        {view.painPaused ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>
            {pausedText(view.painPaused, exercise, (kg) => formatWeight(kg, unit) ?? `${kg}kg`)}
          </Text>
        ) : null}
        {view.locked ? <Text style={[TYPE.sub, { color: c.muted }]}>{view.locked}</Text> : null}

        {view.editable.sets ? (
          <Field label="세트" unit="세트" value={draft.sets} recommended={view.recommended.sets} step={1} min={1} max={TARGET_LIMITS.sets} onChange={(v) => setDraft({ ...draft, sets: v })} c={c} />
        ) : null}
        {view.editable.amount ? (
          <Field
            label={exercise.isHold ? '시간' : '횟수'}
            unit={amountUnit}
            value={draft.amount}
            recommended={recAmount}
            step={exercise.isHold && !exercise.inMinutes ? 5 : 1}
            min={1}
            max={exercise.isHold ? (exercise.inMinutes ? TARGET_LIMITS.holdSeconds / 60 : TARGET_LIMITS.holdSeconds) : TARGET_LIMITS.reps}
            onChange={(v) => setDraft({ ...draft, amount: v })}
            c={c}
          />
        ) : null}
        {view.editable.rest ? (
          <Field label="세트 사이 휴식" unit="초" value={draft.rest} recommended={view.recommended.restSeconds} step={15} min={0} max={TARGET_LIMITS.restSeconds} onChange={(v) => setDraft({ ...draft, rest: v })} c={c} />
        ) : null}
        {view.editable.kg && !hideKg ? (
          <Field
            label={view.editable.load ? kgLabel(exercise.load ?? null, exercise.load?.mode === 'alternative' ? (loadDraft.variant ?? 'mass') : null) : '무게'}
            unit={unit}
            value={draft.kg}
            recommended={view.recommended.kg != null ? round1(toWeight(view.recommended.kg, unit)) : null}
            step={unit === 'lb' ? 5 : 2.5}
            min={0}
            max={round1(toWeight(TARGET_LIMITS.weightKg, unit))}
            decimal
            onChange={(v) => setDraft({ ...draft, kg: v })}
            c={c}
          />
        ) : null}
        <Text style={[TYPE.sub, { color: c.muted }]}>
          빈 칸은 오늘 추천을 따라요. 무게는 직접 정할 때만 들어가요(나이 · 난이도만으로 무게를 정하지 않아요).
        </Text>
        {view.editable.load ? (
          <View style={{ gap: 8 }}>
            {storedLoad && !loadDirty ? (
              <Text style={[TYPE.sub, { color: c.ink }]}>
                {view.painPaused?.load ? '쉬어 둔 목표 · ' : '지금 목표 · '}
                {loadTargetText(storedLoad, unitText)}
              </Text>
            ) : null}
            <LoadExtras
              contract={exercise.load ?? null}
              structured
              draft={loadDraft}
              onChange={editLoad}
              unit={unit}
              owner={null}
              exerciseId={exercise.id}
              remember={false}
              title="목표 장비"
              forTarget
              c={c}
            />
            {loadDraft.variant != null || loadDraft.bands.length > 0 || loadDraft.setup.trim() || loadDraft.unequal || loadDraft.role != null ? (
              <Press
                onPress={() => editLoad(() => EMPTY_LOAD_DRAFT)}
                accessibilityRole="button"
                style={[st.btn, { backgroundColor: c.card, alignSelf: 'flex-start' }]}
              >
                <Text style={[TYPE.buttonCompact, { color: c.ink }]}>장비 목표 지우기</Text>
              </Press>
            ) : null}
            <Text style={[TYPE.sub, { color: c.muted }]}>
              목표는 이 운동 · 오늘만이에요. 이미 남긴 세트(한 것)는 바뀌지 않아요. 다음 세트 칸을 아직 안 건드렸으면 이 목표로 채워 둬요.
            </Text>
          </View>
        ) : null}
        {view.loadUnsupported ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>{LOAD_TARGET_UNSUPPORTED_TEXT} 지우려면 아래 [추천으로]를 눌러요.</Text>
        ) : null}
        {exercise.perSide ? <Text style={[TYPE.sub, { color: c.muted }]}>{PER_SIDE_MEANING}</Text> : null}
        {doneSets > 0 ? <Text style={[TYPE.sub, { color: c.muted }]}>이미 남긴 {doneSets}세트는 목표를 낮춰도 그대로 남아요.</Text> : null}
        {minutes != null ? (
          <Text style={[TYPE.sub, { color: c.muted }]}>
            이 목표로 하면 이 운동은 약 {minutes}분(휴식 포함)
            {view.recommendedMinutes != null && minutes !== view.recommendedMinutes ? ` · 추천은 약 ${view.recommendedMinutes}분` : ''}
          </Text>
        ) : null}
        {!check.ok ? <Text style={[TYPE.sub, { color: c.danger }]}>{check.error}</Text> : null}
      </View>
    </Sheet>
  );
}

type Draft = { sets: string; amount: string; rest: string; kg: string };

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
  /* EX-LOAD01-R1 — 장비 목표를 건드렸을 때만 싣는다. 지울 때 kg 은 적은 그대로, 정할 때는 그 목표의 무게 성분 투영 */
  if (!load || !load.ok || load.send === 'none') return base;
  if (load.send === 'clear') return { ...base, loadV: 1, load: null };
  return { ...base, kg: load.kg, loadV: 1, load: load.input };
}

/** 장비 목표로 보낼 것 — 안 건드림 · 지움 · 정함. 못 만들면 그 까닭 */
type LoadEdit =
  | { ok: true; send: 'none' }
  | { ok: true; send: 'clear' }
  | { ok: true; send: 'set'; input: LoadTargetInput; kg: number | null }
  | { ok: false; error: string };

/** 칸 → 장비 목표(세트 담기와 같은 buildSetLoad 를 structured:true 로 — 목표는 판 JSON 이라 새 DB 칸 없이 저장된다). 무게 칸이 비면 오늘 추천 무게 */
function buildLoadTarget(ex: RunExercise, ld: LoadDraft, d: Draft, unit: WeightUnit, view: TargetView, stored: LoadTarget | null, dirty: boolean): LoadEdit {
  if (!dirty) return { ok: true, send: 'none' };
  const nothing = ld.variant == null && ld.role == null && ld.bands.length === 0 && !ld.setup.trim() && !ld.unequal;
  if (nothing) return stored ? { ok: true, send: 'clear' } : { ok: true, send: 'none' };
  const typed = d.kg.trim() === '' ? null : Number(d.kg);
  const kg = typed != null && Number.isFinite(typed) ? storedKgFromDisplay(typed, unit, [view.recommended.kg, view.override?.kg]) : view.recommended.kg;
  const built = buildSetLoad({ contract: ex.load ?? null, draft: ld, structured: true, kg, unit });
  if (!built.ok) return { ok: false, error: built.error };
  if (built.load === undefined) return stored ? { ok: true, send: 'clear' } : { ok: true, send: 'none' };
  return { ok: true, send: 'set', input: { variant: built.variant ?? null, load: built.load }, kg: built.weightKg };
}

function Layer({ label, value, strong = false, children, c }: { label: string; value: string; strong?: boolean; children?: React.ReactNode; c: Palette }) {
  return (
    <View style={[st.layer, { backgroundColor: strong ? c.action + '1a' : c.chip }]}>
      <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>{label}</Text>
      <Text style={[TYPE.body, { color: c.ink, fontWeight: strong ? '700' : '400' }]}>{value}</Text>
      {children}
    </View>
  );
}

function Field({
  label,
  unit,
  value,
  recommended,
  step,
  min,
  max,
  decimal = false,
  onChange,
  c,
}: {
  label: string;
  unit: string;
  value: string;
  recommended: number | null;
  step: number;
  min: number;
  max: number;
  decimal?: boolean;
  onChange: (v: string) => void;
  c: Palette;
}) {
  const bump = (dir: 1 | -1) => {
    const base = value.trim() === '' ? recommended : Number(value);
    const start = base != null && Number.isFinite(base) ? base : min;
    onChange(String(Math.min(max, Math.max(min, round1(start + dir * step)))));
  };
  return (
    <View style={st.field}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>
          {label} <Text style={{ color: c.muted, fontWeight: '400' }}>({unit})</Text>
        </Text>
        <TextInput
          value={value}
          onChangeText={(t) => onChange(decimal ? keepDecimal(t) : t.replace(/\D/g, ''))}
          keyboardType={decimal ? 'decimal-pad' : 'number-pad'}
          placeholder={recommended != null ? `추천 ${recommended}` : '추천 없음'}
          placeholderTextColor={c.muted}
          accessibilityLabel={`${label} 목표`}
          style={[st.input, { color: c.ink, borderColor: c.line, backgroundColor: c.card }]}
        />
      </View>
      <Press onPress={() => bump(-1)} accessibilityRole="button" accessibilityLabel={`${label} 줄이기`} style={[st.step, { backgroundColor: c.card }]}>
        <Icon name="minus" size={18} color={c.ink} />
      </Press>
      <Press onPress={() => bump(1)} accessibilityRole="button" accessibilityLabel={`${label} 늘리기`} style={[st.step, { backgroundColor: c.card }]}>
        <Icon name="plus" size={18} color={c.ink} />
      </Press>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  btn: { minHeight: 48, borderRadius: 24, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 },
  btnShrink: { flexShrink: 0 },
  confirm: { borderRadius: 16, padding: 12, gap: 10 },
  notice: { flexDirection: 'row', gap: 8, borderRadius: 12, padding: 10, alignItems: 'flex-start' },
  layer: { borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  field: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 17, fontVariant: ['tabular-nums'] },
  step: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});

/** 무게 칸 — 쉼표 소수점(20,5)은 점으로 바꾸고, 점은 하나만 남긴다(지우면 205 가 된다) */
function keepDecimal(t: string): string {
  const s = t.replace(/,/g, '.').replace(/[^\d.]/g, '');
  const i = s.indexOf('.');
  return i < 0 ? s : s.slice(0, i + 1) + s.slice(i + 1).replace(/\./g, '');
}
