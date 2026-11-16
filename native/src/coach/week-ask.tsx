import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { answerCoachWeekAsk } from '@/app/actions/coach';
import { WEEKDAY_LABELS } from '@/lib/coach/answers';
import { WEEK_PICKS, type WeekPick, type WeekPicks } from '@/lib/coach/week-ask';
import type { Weekday } from '@/lib/coach/week';
import { rpc } from '~/lib/rpc';
import { SURFACE, TYPE, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';

export type WeekAskData = { weekStart: string; next: boolean; answered: boolean; from: number; picks: WeekPicks; same: boolean };

const DAYS = [0, 1, 2, 3, 4, 5, 6] as const;
/** 'YYYY-MM-DD' 에 n일 더한 날의 '11.17' */
const dayText = (weekStart: string, n: number) => {
  const d = new Date(`${weekStart}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return `${d.getUTCMonth() + 1}.${d.getUTCDate()}`;
};

/**
 * 주마다 일정 묻기(lib/coach/week-ask.ts) — 한 주에 한 번, 요일마다 하나(선발 · 불펜 대기 · 팀 훈련 · 못 하는 날)를 고른다. 답하면 코치가 등판을 짐작하지 않고
 * 그 일정대로 짠다. 아직 안 답했으면 권하는 카드(알려 주기 · 지난주와 같아요 · 건너뛰기), 답했으면 '고치기' 한 줄. 안 답해도 코치는 그대로 돈다.
 */
export function WeekAskCard({ ask, onDone }: { ask: WeekAskData; onDone: () => void }) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const [picks, setPicks] = useState<WeekPicks>(ask.picks);
  const [busy, setBusy] = useState(false);
  const which = ask.next ? '다음 주' : '이번 주';
  const send = async (value: WeekPicks | 'skip') => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await rpc<Awaited<ReturnType<typeof answerCoachWeekAsk>>>('coach.answerCoachWeekAsk', ask.weekStart, value);
      if ('error' in r) return toast(r.error);
      if (value !== 'skip') toast(`${which} 일정에 맞췄어요`);
      setOpen(false);
      onDone();
    } catch {
      toast('신호가 약해요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const toggle = (day: Weekday, pick: WeekPick) =>
    setPicks((p) => {
      const { [day]: cur, ...rest } = p;
      return cur === pick ? rest : { ...rest, [day]: pick };
    });

  if (!open && ask.answered) {
    return (
      <Press accessibilityRole="button" onPress={() => setOpen(true)} style={st.edit}>
        <Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>{which} 경기 · 훈련 일정 고치기 →</Text>
      </Press>
    );
  }
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[st.kicker, { color: c.link }]}>{which} 일정</Text>
      <Text style={[TYPE.card, { color: c.ink }]}>{which} 경기 · 훈련 일정을 알려 주세요</Text>
      {open ? (
        <>
          <Text style={[TYPE.body, { color: c.muted }]}>해당하는 날만 골라요. 없는 날은 비워 둬요.</Text>
          <View style={{ gap: 10 }}>
            {DAYS.filter((d) => d >= ask.from).map((d) => (
              <View key={d} style={st.day}>
                <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>
                  {WEEKDAY_LABELS[d]} <Text style={{ color: c.muted, fontWeight: '400' }}>{dayText(ask.weekStart, d)}</Text>
                </Text>
                <View style={st.chips}>
                  {WEEK_PICKS.map((o) => {
                    const selected = picks[d] === o.value;
                    return (
                      <Press
                        key={o.value}
                        accessibilityRole="button"
                        accessibilityLabel={`${WEEKDAY_LABELS[d]}요일 ${o.label}`}
                        accessibilityState={{ selected }}
                        select
                        selected={selected}
                        disabled={busy}
                        onPress={() => toggle(d, o.value)}
                        style={[st.chip, { backgroundColor: selected ? c.skyTint : c.card, borderColor: selected ? c.link : c.line }]}
                      >
                        <Text style={[TYPE.sub, { color: selected ? c.link : c.ink, fontWeight: selected ? '700' : '400' }]}>{o.label}</Text>
                      </Press>
                    );
                  })}
                </View>
              </View>
            ))}
          </View>
          <View style={st.actions}>
            <Press accessibilityRole="button" disabled={busy} onPress={() => void send(picks)} style={[st.primary, { backgroundColor: c.action }]}>
              <Text style={[TYPE.body, { color: c.onAction, fontWeight: '600' }]}>이 일정으로 맞추기</Text>
            </Press>
            <Press accessibilityRole="button" disabled={busy} onPress={() => setOpen(false)} style={st.text}>
              <Text style={[TYPE.body, { color: c.muted }]}>닫기</Text>
            </Press>
          </View>
        </>
      ) : (
        <>
          <Text style={[TYPE.body, { color: c.muted }]}>선발인지 불펜 대기인지, 팀 훈련과 못 하는 날을 알려 주면 짐작하지 않고 그 일정대로 짜요.</Text>
          <View style={st.actions}>
            <Press accessibilityRole="button" disabled={busy} onPress={() => setOpen(true)} style={[st.primary, { backgroundColor: c.action }]}>
              <Text style={[TYPE.body, { color: c.onAction, fontWeight: '600' }]}>일정 알려 주기</Text>
            </Press>
            {ask.same ? (
              <Press accessibilityRole="button" disabled={busy} onPress={() => void send(ask.picks)} style={[st.second, { borderColor: c.line }]}>
                <Text style={[TYPE.body, { color: c.ink }]}>지난주와 같아요</Text>
              </Press>
            ) : null}
            <Press accessibilityRole="button" disabled={busy} onPress={() => void send('skip')} style={st.text}>
              <Text style={[TYPE.body, { color: c.muted }]}>건너뛰기</Text>
            </Press>
          </View>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  day: { gap: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { minHeight: 44, paddingHorizontal: 12, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  primary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  second: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  text: { minHeight: 44, paddingHorizontal: 6, justifyContent: 'center' },
  edit: { minHeight: 44, justifyContent: 'center' },
});
