import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text, TextInput } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Bar, BarButton, call, s, useBusy } from '~/community/parts';
import { useDraftGuard } from '~/community/draft-guard';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 자료실 글쓰기(앱 화면, 관리자) — 웹 app/(app)/board/new 를 옮겼다. 제목 · 내용 · 원문 링크 · 태그(쉼표, 5개까지), 같은 서버 검사
 * (board.createAppArticle → saveArticle). 올리면 그 글로 바꿔 연다. 못 올리면 적은 글은 그대로 남는다.
 */
export default function NewArticleScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [link, setLink] = useState('');
  const [tags, setTags] = useState('');
  const send = useBusy();
  const allowLeave = useDraftGuard(!!(title.trim() || content.trim() || link.trim() || tags.trim()));

  const submit = () =>
    send.run(async () => {
      if (!title.trim() || !content.trim()) return '제목과 내용을 입력해 주세요.';
      const r = await call<{ ok: true; id: string }>('board.createAppArticle', { title, content, attachmentUrl: link, tags });
      if (!r.ok) return r.error;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      allowLeave();
      router.replace(`/board/${r.id}` as Href);
      return null;
    });

  const field = { backgroundColor: c.card, color: c.ink };
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="자료실" title="자료 등록" right={<BarButton label="올리기" onPress={submit} disabled={send.busy} c={c} />} c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 8, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
        {/* 웹 board/new 폼과 같은 차례 · 이름 · 도움말 · 예시 글 — 제목 → 태그 → 자료 링크 → 내용 */}
        <Text style={[s.label, { color: c.muted }]}>제목</Text>
        <TextInput
          value={title}
          onChangeText={setTitle}
          maxLength={150}
          placeholder="투구 시 어깨 외회전 각도와 구속의 상관관계"
          placeholderTextColor={c.muted}
          style={[s.input, field]}
        />
        <Text style={[s.label, { color: c.muted, marginTop: 8 }]}>태그</Text>
        <TextInput value={tags} onChangeText={setTags} placeholder="어깨, 바이오메카닉스, 회복" placeholderTextColor={c.muted} style={[s.input, field]} />
        <Text style={{ color: c.muted, fontSize: 13, paddingHorizontal: 4 }}>쉼표로 구분해 최대 5개까지 입력할 수 있어요.</Text>
        <Text style={[s.label, { color: c.muted, marginTop: 8 }]}>자료 링크 (선택)</Text>
        <TextInput
          value={link}
          onChangeText={setLink}
          placeholder="https://pubmed.ncbi.nlm.nih.gov/..."
          placeholderTextColor={c.muted}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          style={[s.input, field]}
        />
        <Text style={{ color: c.muted, fontSize: 13, paddingHorizontal: 4 }}>원문이나 참고 페이지 주소를 넣어 주세요.</Text>
        <Text style={[s.label, { color: c.muted, marginTop: 8 }]}>내용</Text>
        <TextInput
          value={content}
          onChangeText={setContent}
          multiline
          placeholder="자료의 핵심 내용과 느낀 점을 정리해 보세요."
          placeholderTextColor={c.muted}
          style={[s.area, field]}
        />
        {send.error ? <Text style={{ color: c.danger, fontSize: 15, marginTop: 8 }}>{send.error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
