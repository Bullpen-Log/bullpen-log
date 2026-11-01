import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { applyCoachAdjust, previewCoachAdjust } from '@/app/actions/coach';
import { ADJUST_MINUTES, type CoachAdjust } from '@/lib/coach/adjust';
import { WEEKDAY_LABELS, slotLine } from '@/lib/coach/answers';
import type { SlotState } from '@/lib/coach/status';
import type { DaySlot } from '@/lib/coach/week';
import { rpc } from '~/lib/rpc';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { ActionButton } from '~/shell/action-button';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { Sheet } from '~/workout/sheets';

type Preview = Extract<Awaited<ReturnType<typeof previewCoachAdjust>>, { ok: true }>;
type Step = { kind: 'minutes' } | { kind: 'move'; from: string | null } | { kind: 'preview'; adj: CoachAdjust; p: Preview };

const isMain = (s: DaySlot) => s.items.some((x) => x.kind === 'train' || x.kind === 'program' || x.kind === 'mechanics');

/**
 * 코치 조정 단추(docs/designs/ai-coach.md 10-5 U35) — 오늘 시간 · 오늘 쉬기 · 날 바꾸기 · 이번 주 바빠요. 고르면 바뀐 칸 미리보기 → [적용].
 * 계산 · 안전 규칙은 서버(lib/coach/adjust.ts). 여기는 고를 수 있는 단추만 보인다(지난 날 · 한 날은 못 고름 — 서버가 다시 막는다).
 */
export function AdjustBar({ week, states, today, onDone }: { week: DaySlot[]; states: SlotState[]; today: string; onDone: () => void }) {
  const c = usePalette();
  const [step, setStep] = useState<Step | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const k = week.findIndex((s) => s.date === today);
  const t = k >= 0 ? week[k] : null;
  const todayOpen = t != null && states[k] !== 'done';
  const movable = week.filter((s, i) => s.date >= today && states[i] !== 'done');
  const close = () => {
    setStep(null);
    setErr(null);
  };

  const preview = async (adj: CoachAdjust) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await rpc<Awaited<ReturnType<typeof previewCoachAdjust>>>('coach.previewCoachAdjust', adj);
      if ('error' in r) setErr(r.error ?? '다시 골라 주세요.');
      else setStep({ kind: 'preview', adj, p: r });
    } catch {
      setErr('신호가 약해요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const apply = async (adj: CoachAdjust, token: string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await rpc<Awaited<ReturnType<typeof applyCoachAdjust>>>('coach.applyCoachAdjust', adj, token);
      if ('error' in r) return setErr(r.error);
      close();
      toast('바꿨어요');
      onDone();
    } catch {
      setErr('신호가 약해요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const chips: { label: string; onPress: () => void }[] = [];
  if (todayOpen && t.items.some((x) => x.kind === 'train')) chips.push({ label: '오늘 시간', onPress: () => setStep({ kind: 'minutes' }) });
  if (todayOpen && isMain(t)) chips.push({ label: '오늘 쉬기', onPress: () => preview({ kind: 'skip', date: today }) });
  if (movable.some(isMain)) chips.push({ label: '날 바꾸기', onPress: () => setStep({ kind: 'move', from: null }) });
  if (movable.some((s) => s.items.some((x) => x.kind === 'train' || x.kind === 'program'))) chips.push({ label: '이번 주 바빠요', onPress: () => preview({ kind: 'busy' }) });
  if (!chips.length) return null;

  const minutesNow = t?.items.find((x) => x.kind === 'train');
  const label = (s: DaySlot) => (s.date === today ? '오늘' : WEEKDAY_LABELS[week.indexOf(s)]);

  return (
    <View style={{ gap: 8 }}>
      <View style={st.chips}>
        {chips.map((x) => (
          <Press key={x.label} accessibilityRole="button" disabled={busy} onPress={x.onPress} style={[st.chip, { backgroundColor: c.card, borderColor: c.line }]}>
            <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{x.label}</Text>
          </Press>
        ))}
      </View>
      {err && !step ? <Text style={[TYPE.sub, { color: c.danger }]}>{err}</Text> : null}

      <Sheet
        fit
        open={step != null}
        onClose={close}
        title={
          step?.kind === 'minutes'
            ? '오늘 운동 시간'
            : step?.kind === 'move'
              ? step.from
                ? '어느 날로 옮길까요?'
                : '어느 날 운동을 옮길까요?'
              : '이렇게 바뀌어요'
        }
        c={c}
        footer={
          step?.kind === 'preview' ? (
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ActionButton label="취소" tone="secondary" onPress={close} style={{ flex: 1 }} />
              <ActionButton label="적용" busy={busy} onPress={() => apply(step.adj, step.p.token)} style={{ flex: 1 }} />
            </View>
          ) : null
        }
      >
        {step?.kind === 'minutes' ? (
          <View style={st.chips}>
            {ADJUST_MINUTES.map((m) => {
              const on = minutesNow?.kind === 'train' && minutesNow.fence.minutes === m;
              return (
                <Press
                  key={m}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  disabled={busy || on}
                  onPress={() => preview({ kind: 'minutes', date: today, minutes: m })}
                  style={[st.chip, { backgroundColor: on ? c.action : c.card, borderColor: on ? c.action : c.line }]}
                >
                  <Text style={[TYPE.body, { color: on ? c.onAction : c.ink, fontWeight: '600' }]}>{m}분</Text>
                </Press>
              );
            })}
          </View>
        ) : null}
        {step?.kind === 'move' ? (
          <View style={{ gap: 6 }}>
            {movable
              .filter((d) => (step.from ? d.date !== step.from : isMain(d)))
              .map((d) => (
                <Press
                  key={d.date}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => (step.from ? preview({ kind: 'move', from: step.from, to: d.date }) : setStep({ kind: 'move', from: d.date }))}
                  style={[st.dayRow, { backgroundColor: c.card }]}
                >
                  <Text style={[TYPE.body, { width: 30, fontWeight: '700', color: c.muted }]}>{label(d)}</Text>
                  <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{slotLine(d)}</Text>
                </Press>
              ))}
          </View>
        ) : null}
        {step?.kind === 'preview' ? (
          <View style={{ gap: 10 }}>
            {step.p.changed.map((x) => {
              const d = week.find((w) => w.date === x.date);
              return (
                <View key={x.date} style={{ gap: 2 }}>
                  <Text style={[TYPE.sub, { color: c.muted, fontWeight: '700' }]}>{d ? label(d) : x.date}</Text>
                  <Text style={[TYPE.body, { color: c.muted, textDecorationLine: 'line-through' }]}>{x.before}</Text>
                  <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{x.after}</Text>
                </View>
              );
            })}
          </View>
        ) : null}
        <ErrLine err={err} c={c} />
      </Sheet>
    </View>
  );
}

function ErrLine({ err, c }: { err: string | null; c: Palette }) {
  return err ? <Text style={[TYPE.sub, { color: c.danger, marginTop: 8 }]}>{err}</Text> : null;
}

const st = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  dayRow: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, borderRadius: 14 },
});
