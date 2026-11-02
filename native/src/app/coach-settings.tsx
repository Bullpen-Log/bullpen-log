import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadCoachChat } from '@/app/actions/coach-chat';
import { READABLE } from '~/lib/layout';
import { rpc } from '~/lib/rpc';
import { TYPE, usePalette } from '~/lib/ui';
import { SheetHead } from '~/home/sheet-head';
import { ActionButton } from '~/shell/action-button';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';

type Chat = Extract<Awaited<ReturnType<typeof loadCoachChat>>, { ok: true }>;
type Confirm = 'off' | 'clear' | null;

/** 코치 계획은 유지하면서 AI 동의와 대화 기록을 따로 관리한다. */
export default function CoachSettingsScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => {
    rpc<Awaited<ReturnType<typeof loadCoachChat>>>('coach-chat.loadCoachChat').then(
      (result) => {
        if (result.ok) { setChat(result); setError(null); }
        else setError(result.error);
      },
      () => setError('코치 설정을 불러오지 못했어요.')
    );
  }, []);
  useFocusEffect(load);

  const apply = async () => {
    if (!confirm || busy) return;
    setBusy(true);
    try {
      if (confirm === 'off') {
        await rpc<{ ok: true }>('coach-chat.revokeCoachAi');
        setChat((current) => current ? { ...current, consented: false, messages: [], left: 0 } : current);
        toast('AI 대화를 껐어요');
      } else {
        await rpc<{ ok: true }>('coach-chat.clearCoachChat');
        setChat((current) => current ? { ...current, messages: [] } : current);
        toast('대화를 지웠어요');
      }
      setConfirm(null);
    } catch {
      toast('신호가 약해요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}><SheetHead c={c} title="코치 설정" /></View>
      <ScrollView contentContainerStyle={[st.content, { paddingBottom: inset.bottom + 32 }, READABLE]}>
        <View><Text style={[TYPE.hero, { color: c.ink }]}>내 코치를 내 방식으로</Text><Text style={[TYPE.body, { color: c.muted, marginTop: 5 }]}>AI 대화 선택과 기록을 관리해요. 주간 계획과 일정 조정은 별개로 계속 사용할 수 있어요.</Text></View>
        {!chat && !error ? <ActivityIndicator color={c.action} style={{ marginTop: 24 }} /> : null}
        {error ? <View style={[st.notice, { backgroundColor: c.warnBg, borderColor: c.warnLine }]}><Text style={[TYPE.body, { color: c.ink }]}>{error}</Text><ActionButton label="다시 확인" compact tone="secondary" onPress={() => { setError(null); load(); }} /></View> : null}
        {chat ? <>
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            <View style={st.row}><Text style={[TYPE.card, { flex: 1, color: c.ink }]}>AI 대화</Text><Text style={[TYPE.body, { color: chat.consented ? c.ok : c.muted }]}>{chat.consented ? '동의함' : '꺼짐'}</Text></View>
            <View style={[st.row, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}><Text style={[TYPE.card, { flex: 1, color: c.ink }]}>대화 기록</Text><Text style={[TYPE.body, { color: c.muted }]}>{chat.messages.length ? `${chat.messages.length}개 · 최근 30일` : '없음'}</Text></View>
          </View>
          {chat.block && chat.consented ? <Text style={[TYPE.sub, { color: c.muted }]}>{chat.block}</Text> : null}
          <Text style={[TYPE.body, { color: c.muted }]}>AI를 끄면 동의를 철회하고 대화 기록도 함께 지워요. 다시 켜려면 동의 내용을 읽고 새로 동의해야 해요.</Text>
          {confirm ? <View style={[st.notice, { backgroundColor: c.warnBg, borderColor: c.warnLine }]}>
            <Text style={[TYPE.card, { color: c.ink }]}>{confirm === 'off' ? 'AI 대화를 끌까요?' : '대화 기록을 지울까요?'}</Text>
            <Text style={[TYPE.body, { color: c.muted }]}>{confirm === 'off' ? '동의를 철회하고 모든 코치 대화를 지워요. 계획은 유지돼요.' : '저장된 코치 대화를 모두 지워요. 되돌릴 수 없어요.'}</Text>
            <View style={st.actions}><ActionButton label="취소" tone="secondary" compact disabled={busy} onPress={() => setConfirm(null)} style={{ flex: 1 }} /><ActionButton label={confirm === 'off' ? 'AI 끄기' : '대화 지우기'} compact busy={busy} onPress={() => void apply()} style={{ flex: 1, backgroundColor: c.danger }} /></View>
          </View> : <View style={st.actions}>
            {chat.consented ? <Press accessibilityRole="button" onPress={() => setConfirm('off')} style={[st.option, { backgroundColor: c.card, borderColor: c.line }]}><Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>AI 끄기</Text></Press> : <Press accessibilityRole="button" onPress={() => router.push('/coach-chat')} style={[st.option, { backgroundColor: c.skyTint, borderColor: c.skyTint }]}><Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>AI 대화 동의하기</Text></Press>}
            <Press accessibilityRole="button" disabled={!chat.messages.length} onPress={() => setConfirm('clear')} style={[st.option, { backgroundColor: c.card, borderColor: c.line, opacity: chat.messages.length ? 1 : 0.5 }]}><Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>대화 지우기</Text></Press>
          </View>}
        </> : null}
      </ScrollView>
    </View>
  );
}

const st = StyleSheet.create({
  content: { padding: 16, gap: 20 },
  group: { borderRadius: 18, overflow: 'hidden' },
  row: { minHeight: 57, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
  actions: { flexDirection: 'row', gap: 8 },
  option: { flex: 1, minHeight: 48, borderWidth: StyleSheet.hairlineWidth, borderRadius: 13, alignItems: 'center', justifyContent: 'center', padding: 7 },
  notice: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 11 },
});
