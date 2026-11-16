import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { Href } from 'expo-router';
import type { answerCoachFollowup } from '@/app/actions/coach';
import { FOLLOWUP_NEXT, FOLLOWUP_WHYS, type FollowupWhy } from '@/lib/coach/followup';
import { rpc } from '~/lib/rpc';
import { SURFACE, TYPE, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { pushOpen } from '~/shell/release';
import { toast } from '~/shell/toast';
import { openCheckin } from '~/shell/web-nav';

export type FollowupData = { date: string; did: string[]; left: string[]; line: string };
type Next = (typeof FOLLOWUP_NEXT)[FollowupWhy];

/**
 * 어제 이어보기(lib/coach/followup.ts) — 어제 계획한 과제를 덜 한 날, 코치 탭 맨 위에 한 번. 한 번 누르면 답이 어제 칸에 남고(서버 answerCoachFollowup),
 * 다음 걸음 한 줄과 이미 있는 길(이번 주 일정 고치기 · 체크인 · 오늘 운동 만들기)을 보인다. '넘어가기'도 답으로 남겨 다시 묻지 않는다.
 */
export function FollowupCard({ ask, onAdjust, onDone }: { ask: FollowupData; onAdjust: () => void; onDone: () => void }) {
  const c = usePalette();
  const [busy, setBusy] = useState(false);
  const [next, setNext] = useState<Next | null>(null);
  const answer = async (why: FollowupWhy | 'skip') => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await rpc<Awaited<ReturnType<typeof answerCoachFollowup>>>('coach.answerCoachFollowup', ask.date, why);
      if ('error' in r) return toast(r.error);
      if (r.next) setNext(r.next);
      else onDone();
    } catch {
      toast('신호가 약해요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const go = () => {
    const kind = next?.action?.kind;
    onDone();
    if (kind === 'adjust') onAdjust();
    else if (kind === 'checkin') openCheckin();
    else if (kind === 'training') pushOpen('/training-today' as Href);
  };
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[st.kicker, { color: c.link }]}>어제 이어보기</Text>
      <Text style={[TYPE.card, { color: c.ink }]}>{ask.line}</Text>
      {next ? (
        <>
          <Text style={[TYPE.body, { color: c.muted }]}>{next.text}</Text>
          <View style={st.actions}>
            {next.action ? (
              <Press accessibilityRole="button" onPress={go} style={[st.primary, { backgroundColor: c.action }]}>
                <Text style={[TYPE.body, { color: c.onAction, fontWeight: '600' }]}>{next.action.label}</Text>
              </Press>
            ) : null}
            <Press accessibilityRole="button" onPress={onDone} style={[st.chip, { backgroundColor: c.card, borderColor: c.line }]}>
              <Text style={[TYPE.body, { color: c.ink }]}>확인</Text>
            </Press>
          </View>
        </>
      ) : (
        <>
          <Text style={[TYPE.body, { color: c.muted }]}>무엇 때문이었어요?</Text>
          <View style={st.chips}>
            {FOLLOWUP_WHYS.map((o) => (
              <Press key={o.value} accessibilityRole="button" disabled={busy} onPress={() => void answer(o.value)} style={[st.chip, { backgroundColor: c.card, borderColor: c.line }]}>
                <Text style={[TYPE.body, { color: c.ink }]}>{o.label}</Text>
              </Press>
            ))}
          </View>
          <Press accessibilityRole="button" disabled={busy} onPress={() => void answer('skip')} style={st.skip}>
            <Text style={[TYPE.sub, { color: c.muted }]}>넘어가기</Text>
          </Press>
        </>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  primary: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  skip: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
});
