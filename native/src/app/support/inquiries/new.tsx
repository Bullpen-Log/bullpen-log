import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INQUIRY_BODY_MAX, INQUIRY_CATEGORIES, INQUIRY_TITLE_MAX, type InquiryCategory } from '@/lib/support';
import { Bar, BarButton, call, Chip, s, useBusy } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 문의하기(앱 화면) — 웹 components/support/support-inquiry-form.tsx 를 옮겼다. 종류 · 제목 · 내용, 같은 한도 · 같은 서버 검사
 * (support.createAppInquiry → app/actions/support.ts tryCreateInquiry — 10분에 다섯 건 막기까지). 보내면 그 문의 화면으로 바꿔 연다.
 */
export default function NewInquiryScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [category, setCategory] = useState<InquiryCategory | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const send = useBusy();

  const submit = () =>
    send.run(async () => {
      if (!category) return '문의 종류를 골라 주세요.';
      if (!title.trim() || !body.trim()) return '제목과 내용을 적어 주세요.';
      const r = await call<{ ok: true; id: string } | { ok: false; error: string }>('support.createAppInquiry', { category, title, body });
      if (!r.ok) return r.error;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/support/inquiries/${r.id}` as Href);
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="고객센터" title="문의하기" right={<BarButton label="보내기" onPress={submit} disabled={send.busy} c={c} />} c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 8, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }}>운영자가 확인하고 답해 드려요. 답이 오면 문의 화면에 이어서 보여요.</Text>
        <Text style={[s.label, { color: c.muted }]}>어떤 문의인가요?</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {INQUIRY_CATEGORIES.map((k) => (
            <Chip
              key={k.key}
              label={k.label}
              on={category === k.key}
              onPress={() => {
                void Haptics.selectionAsync();
                setCategory(k.key);
              }}
              c={c}
            />
          ))}
        </View>
        <Text style={[s.label, { color: c.muted }]}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={INQUIRY_TITLE_MAX}
          placeholder="한 줄로 요약해 주세요"
          placeholderTextColor={c.muted}
          style={[s.input, { backgroundColor: c.card, color: c.ink }]}
        />
        <Text style={[s.label, { color: c.muted }]}>내용</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          maxLength={INQUIRY_BODY_MAX}
          multiline
          placeholder="예) 투구 기록을 저장하면 화면이 멈춰요. 아이폰 앱이고, 어제부터 그래요."
          placeholderTextColor={c.muted}
          style={[s.area, { backgroundColor: c.card, boxShadow: c.float, color: c.ink }]}
        />
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
          무슨 화면에서 무엇을 했을 때 어땠는지 적어 주시면 더 빨리 도울 수 있어요. {INQUIRY_BODY_MAX}자까지.
        </Text>
        {send.error ? <Text style={{ color: c.danger, fontSize: 15 }}>{send.error}</Text> : null}
        <Press
          accessibilityRole="button"
          onPress={submit}
          disabled={send.busy}
          style={[s.primary, { backgroundColor: c.sky }, send.busy && { opacity: 0.5 }]}
        >
          <Text style={s.primaryText}>{send.busy ? '보내는 중' : '문의 보내기'}</Text>
        </Press>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
