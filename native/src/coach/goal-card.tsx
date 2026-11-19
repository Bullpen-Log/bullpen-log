import { useEffect, useState } from 'react';
import type { Href } from 'expo-router';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import type { answerCoachGoal, loadCoachGoal } from '@/app/actions/coach-chat';
import { FEEL_TEXT, GOAL_RESULT_MAX, type GoalAnswer, type GoalCard, type GoalFeel } from '@/lib/coach/goal';
import { rpc } from '~/lib/rpc';
import { SURFACE, TYPE, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { pushOpen } from '~/shell/release';
import { toast } from '~/shell/toast';

const FEELS: GoalFeel[] = ['good', 'meh', 'bad'];

/**
 * 정한 목표 이어 묻기(lib/coach/goal.ts · 설계 9절, 자비스 2단계) — 코치 탭 오늘 보기, 어제 이어보기 밑. 카드 글은 서버가 정해진 문장으로(AI 없음).
 * how(기록이 올라옴) → 느낌 + 한 줄 · '못 해 봤어요'. did(기록 없이 날이 지남) → 했어요 / 못 했어요 · 그날 기록 남기기. 못 했으면 다음 기회 · 그만두기. waiting 은 한 줄 + 지우기.
 * refresh 가 바뀌면(탭이 이번 주를 다시 읽으면) 다시 읽는다.
 */
export function GoalFollowCard({ refresh }: { refresh: unknown }) {
  const c = usePalette();
  const [card, setCard] = useState<GoalCard | null>(null);
  const [step, setStep] = useState<'ask' | 'feel' | 'missed'>('ask');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    rpc<Awaited<ReturnType<typeof loadCoachGoal>>>('coach-chat.loadCoachGoal').then(
      (r) => {
        if (!live) return;
        setCard(r.ok ? r.card : null);
        setStep(r.ok && r.card?.kind === 'how' ? 'feel' : 'ask');
      },
      () => live && setCard(null)
    );
    return () => {
      live = false;
    };
  }, [refresh, tick]);
  if (!card) return null;

  const send = async (a: GoalAnswer, done: string) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await rpc<Awaited<ReturnType<typeof answerCoachGoal>>>('coach-chat.answerCoachGoal', a);
      if ('error' in r) return toast(r.error);
      toast(done);
      setText('');
      setTick((t) => t + 1);
    } catch {
      toast('신호가 약해요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const chip = (label: string, onPress: () => void, primary = false) => (
    <Press key={label} accessibilityRole="button" disabled={busy} onPress={onPress} style={[st.chip, primary ? { backgroundColor: c.action, borderColor: c.action } : { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={[TYPE.body, { color: primary ? c.onAction : c.ink, fontWeight: primary ? '600' : '400' }]}>{label}</Text>
    </Press>
  );

  if (card.kind === 'waiting')
    return (
      <View style={[st.line, { backgroundColor: c.card, borderColor: c.line }]}>
        <Text style={[TYPE.sub, { flex: 1, color: c.ink }]}>{card.text}</Text>
        <Press accessibilityRole="button" disabled={busy} onPress={() => void send({ kind: 'not-done', next: 'drop' }, '목표를 지웠어요')} style={st.small}>
          <Text style={[TYPE.sub, { color: c.muted }]}>지우기</Text>
        </Press>
      </View>
    );

  const feelKind = card.kind === 'how' ? 'how' : 'did-yes';
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[st.kicker, { color: c.link }]}>정한 목표 이어 묻기</Text>
      <Text style={[TYPE.card, { color: c.ink }]}>{card.text}</Text>
      {step === 'ask' ? (
        <View style={st.chips}>
          {chip('했어요', () => setStep('feel'), true)}
          {chip('못 했어요', () => setStep('missed'))}
        </View>
      ) : null}
      {/* 했는데 기록이 없으면 그날 · 그 종류로 채운 기록 창 — 남기면 다음에 '어땠어요?'로 바뀐다 */}
      {card.kind === 'did' && card.log && step !== 'missed' ? (
        <View style={st.chips}>
          {chip(`그날 ${card.log.type} 기록 남기기`, () => {
            const log = card.log;
            if (log) pushOpen({ pathname: '/pitch/edit' as Href as never, params: { date: log.date, type: log.type } });
          })}
        </View>
      ) : null}
      {step === 'feel' ? (
        <>
          <TextInput
            value={text}
            onChangeText={setText}
            placeholder="어땠는지 한 줄(선택)"
            placeholderTextColor={c.muted}
            maxLength={GOAL_RESULT_MAX}
            style={[st.input, { color: c.ink, borderColor: c.line }]}
          />
          <View style={st.chips}>
            {FEELS.map((f) => chip(FEEL_TEXT[f], () => void send({ kind: feelKind, feel: f, text }, '남겼어요. 코치가 다음 대화에서 이어 가요.')))}
          </View>
          {card.kind === 'how' ? chip('신경 못 썼어요', () => setStep('missed')) : null}
        </>
      ) : null}
      {step === 'missed' ? (
        <>
          <Text style={[TYPE.body, { color: c.muted }]}>다음 기회에 다시 해 볼까요?</Text>
          <View style={st.chips}>
            {chip('다음 기회에', () => void send({ kind: 'not-done', next: 'retry' }, '다음 기회에 다시 물어볼게요'), true)}
            {chip('그만두기', () => void send({ kind: 'not-done', next: 'drop' }, '목표를 지웠어요'))}
          </View>
        </>
      ) : null}
      <Press accessibilityRole="button" disabled={busy} onPress={() => void send({ kind: 'later' }, '내일 다시 물어볼게요')} style={st.small}>
        <Text style={[TYPE.sub, { color: c.muted }]}>나중에</Text>
      </Press>
    </View>
  );
}

const st = StyleSheet.create({
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  small: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingLeft: 14, paddingRight: 6 },
  input: { minHeight: 44, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, fontSize: 16 },
});
