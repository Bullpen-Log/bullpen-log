import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { POST_BODY_MAX, POST_CATEGORIES, POST_TITLE_MAX, type PostCategory } from '@/lib/community';
import { useDraftGuard } from '~/community/draft-guard';
import { Bar, BarButton, call, Chip, s, useBusy } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 글쓰기(앱 화면) — 웹 app/(app)/community/new/community-post-form.tsx 를 옮겼다. 구분 · 제목 · 내용, 같은 한도 · 같은 서버 검사
 * (community.createAppPost → app/actions/community.ts tryCreatePost). 올리면 그 글 화면으로 바꿔 연다. 웹처럼 글만(사진은 없다).
 * 못 올리면 적은 글은 그대로 남는다.
 */
export default function NewPostScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [category, setCategory] = useState<PostCategory>(POST_CATEGORIES[0].key);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const send = useBusy();
  const allowLeave = useDraftGuard(!!(title.trim() || body.trim()));

  const submit = () =>
    send.run(async () => {
      if (!title.trim() || !body.trim()) return '제목과 내용을 적어 주세요.';
      const r = await call<{ ok: true; id: string } | { ok: false; error: string }>('community.createAppPost', { category, title, body });
      if (!r.ok) return r.error;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.replace(`/community/${r.id}` as Href);
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="덕아웃" title="글쓰기" right={<BarButton label="올리기" onPress={submit} disabled={send.busy} c={c} />} c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 8, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
        <Text style={[s.label, { color: c.muted }]}>게시판</Text>
        <View accessibilityRole="radiogroup" style={s.chips}>
          {POST_CATEGORIES.map((k) => (
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
          maxLength={POST_TITLE_MAX}
          placeholder="오늘 불펜에서 느낀 것"
          placeholderTextColor={c.muted}
          style={[s.input, { backgroundColor: c.card, color: c.ink }]}
        />
        <Text style={{ color: c.muted, fontSize: 13 }}>{POST_TITLE_MAX}자까지 적을 수 있어요.</Text>
        <Text style={[s.label, { color: c.muted }]}>내용</Text>
        <TextInput
          value={body}
          onChangeText={setBody}
          maxLength={POST_BODY_MAX}
          multiline
          placeholder="자유롭게 적어 보세요."
          placeholderTextColor={c.muted}
          style={[s.area, { backgroundColor: c.card, boxShadow: c.float, color: c.ink }]}
        />
        <Text style={{ color: c.muted, fontSize: 13 }}>{POST_BODY_MAX}자까지 적을 수 있어요. 선수 · 팀 이름은 적지 않아요.</Text>
        {send.error ? <Text style={{ color: c.danger, fontSize: 15 }}>{send.error}</Text> : null}
        <Press
          accessibilityRole="button"
          onPress={submit}
          disabled={send.busy}
          style={[s.primary, { backgroundColor: c.sky }, send.busy && { opacity: 0.5 }]}
        >
          <Text style={s.primaryText}>{send.busy ? '올리는 중' : '올리기'}</Text>
        </Press>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
