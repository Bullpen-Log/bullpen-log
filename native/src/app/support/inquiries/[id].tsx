import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { REPLY_BODY_MAX, inquiryCategoryLabel } from '@/lib/support';
import type { loadAppInquiry } from '@/app/actions/support';
import { Badge, Bar, call, LoadState, s, StatusBadge, useBusy, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 문의 한 건의 대화(앱 화면) — 웹 app/(app)/support/inquiries/[id]/page.tsx. 물음이 맨 위, 그 밑에 답글이 시간순, 운영자 답은 하늘색.
 * 쓴 사람과 관리자만 연다(서버가 아니면 inquiry: null). 관리자가 남의 문의에 쓰면 운영자 답(staff — 서버 replyInquiry 가 같은 조건으로 정한다).
 * 닫힌 문의는 답글 칸 대신 '다시 열기'.
 */
type Loaded = Awaited<ReturnType<typeof loadAppInquiry>>;
type Ok = { ok: true } | { ok: false; error: string };

export default function InquiryScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useLoad<Loaded>('support.loadAppInquiry', id);
  const [reply, setReply] = useState('');
  const send = useBusy();
  const scroll = useRef<ScrollViewInstance>(null);
  const q = data?.inquiry;

  if (!data || !q) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <Bar back="1:1 문의" c={c} />
        {data && !q ? (
          <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 32 }}>문의를 찾지 못했어요.</Text>
        ) : (
          <LoadState error={error} onRetry={() => void reload()} c={c} />
        )}
      </View>
    );
  }

  const closed = q.status === 'CLOSED';
  const submit = () =>
    send.run(async () => {
      if (!reply.trim()) return '내용을 적어 주세요.';
      const r = await call<Ok>('support.replyAppInquiry', q.id, reply);
      if (!r.ok) return r.error;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setReply('');
      await reload();
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
      return null;
    });
  const setOpen = (open: boolean) =>
    send.run(async () => {
      const r = await call<Ok>('support.setAppInquiryOpen', q.id, open);
      if (!r.ok) return r.error;
      await reload();
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back={q.staff ? '뒤로' : '1:1 문의'} c={c} />
      <ScrollView ref={scroll} contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: 24 }, READABLE]} keyboardShouldPersistTaps="handled">
        {/* 물음 */}
        <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float, padding: 16, gap: 10 }]}>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            <Badge text={inquiryCategoryLabel(q.category)} c={c} />
            <StatusBadge status={q.status} c={c} />
          </View>
          <Text selectable style={{ color: c.ink, fontSize: 22, fontWeight: '700' }}>
            {q.title}
          </Text>
          <Text style={[s.meta, { color: c.muted }]}>
            <Text style={{ color: c.ink }}>{q.nickname}</Text>
            {'  '}
            {q.at}
          </Text>
          <Text selectable style={{ color: c.ink, fontSize: 15, lineHeight: 24 }}>
            {q.body}
          </Text>
        </View>

        {/* 답글 */}
        {q.replies.map((r) => (
          <View
            key={r.id}
            style={[
              s.group,
              { padding: 16, gap: 8, backgroundColor: c.card },
              r.fromStaff ? { borderWidth: 1, borderColor: c.sky } : { marginLeft: 24 },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600' }}>{r.name}</Text>
              {r.fromStaff ? <Badge text="운영자" color={c.sky} c={c} /> : null}
              <Text style={[s.meta, { color: c.muted, flex: 1, textAlign: 'right' }]}>{r.at}</Text>
            </View>
            <Text selectable style={{ color: c.ink, fontSize: 15, lineHeight: 24 }}>
              {r.body}
            </Text>
          </View>
        ))}

        {closed ? (
          <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float, padding: 20, gap: 12, alignItems: 'center' }]}>
            <SymbolView name="lock.fill" size={20} tintColor={c.muted} />
            <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>종료된 문의예요. 더 물을 게 있으면 다시 열어 주세요.</Text>
            <Press accessibilityRole="button" onPress={() => setOpen(true)} disabled={send.busy} style={[s.pill, { backgroundColor: c.chip }]}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>다시 열기</Text>
            </Press>
          </View>
        ) : (
          <Press
            accessibilityRole="button"
            onPress={() => setOpen(false)}
            disabled={send.busy}
            hitSlop={6}
            style={styles.close}
          >
            <SymbolView name="lock" size={13} tintColor={c.muted} />
            <Text style={{ color: c.muted, fontSize: 15, fontWeight: '400' }}>문의 종료</Text>
          </Press>
        )}
        {closed && send.error ? <Text style={{ color: c.danger, fontSize: 15 }}>{send.error}</Text> : null}
      </ScrollView>

      {closed ? null : (
        <View style={[styles.composer, { backgroundColor: c.page, borderTopColor: c.line, paddingBottom: inset.bottom + 8 }]}>
          {send.error ? <Text style={{ color: c.danger, fontSize: 15 }}>{send.error}</Text> : null}
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              value={reply}
              onChangeText={setReply}
              maxLength={REPLY_BODY_MAX}
              multiline
              placeholder={q.staff ? '답변을 적어 주세요' : '덧붙일 내용이 있으면 적어 주세요'}
              placeholderTextColor={c.muted}
              accessibilityLabel={q.staff ? '답변' : '덧붙이는 글'}
              style={[styles.input, { backgroundColor: c.card, color: c.ink }]}
            />
            <Press
              accessibilityRole="button"
              accessibilityLabel={send.busy ? '보내는 중' : '보내기'}
              onPress={submit}
              disabled={send.busy || !reply.trim()}
              style={[styles.send, { backgroundColor: c.sky, opacity: send.busy || !reply.trim() ? 0.4 : 1 }]}
            >
              <SymbolView name="paperplane.fill" size={18} tintColor="#fff" />
            </Press>
          </View>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  close: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-end', minHeight: 40, paddingHorizontal: 8 },
  composer: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingTop: 8, gap: 6 },
  input: { flex: 1, minHeight: 44, maxHeight: 140, borderRadius: 22, paddingHorizontal: 16, paddingTop: 11, paddingBottom: 11, fontSize: 17 },
  send: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
