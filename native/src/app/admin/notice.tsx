import * as Haptics from 'expo-haptics';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, Switch, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from '@/lib/support';
import { Bar, BarButton, call, s, useBusy } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 공지 쓰기 · 고치기(앱 화면, 관리자) — 웹 components/support/support-notice-form.tsx: 제목 · 내용 · 맨 위에 고정, 같은 한도 · 같은 서버 검사
 * (support.saveAppNotice → writeNotice). ?id= 면 그 공지를 읽어 고친다. 저장하면 그 공지 화면으로 바꿔 연다.
 */
type Loaded = { ok: true; notice: { id: string; title: string; body: string; pinned: boolean } | null } | { ok: false; error: string };

export default function NoticeFormScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [ready, setReady] = useState(!id);
  const save = useBusy();
  const { setError } = save;

  useEffect(() => {
    if (!id) return;
    let alive = true;
    void call<Loaded>('support.loadAppNotice', id).then((r) => {
      if (!alive) return;
      if (r.ok && r.notice) {
        setTitle(r.notice.title);
        setBody(r.notice.body);
        setPinned(r.notice.pinned);
      } else setError(r.ok ? '공지를 찾을 수 없어요.' : r.error);
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [id, setError]);

  const submit = () =>
    save.run(async () => {
      if (!title.trim() || !body.trim()) return '제목과 내용을 적어 주세요.';
      const r = await call<{ ok: true; id: string }>('support.saveAppNotice', { id, title, body, pinned });
      if (!r.ok) return r.error;
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace(`/support/notices/${r.id}` as Href);
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="소통 관리" title={id ? '공지 고치기' : '공지 쓰기'} right={<BarButton label="올리기" onPress={submit} disabled={save.busy || !ready} c={c} />} c={c} />
      {!ready ? (
        <ActivityIndicator style={{ marginTop: 40 }} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 8, paddingBottom: inset.bottom + 32 }, READABLE]} keyboardShouldPersistTaps="handled">
          <Text style={[s.label, { color: c.muted }]}>제목</Text>
          <TextInput
            value={title}
            onChangeText={setTitle}
            maxLength={NOTICE_TITLE_MAX}
            placeholder="공지 제목"
            placeholderTextColor={c.muted}
            style={[s.input, { backgroundColor: c.card, color: c.ink }]}
          />
          <Text style={[s.label, { color: c.muted }]}>내용</Text>
          <TextInput
            value={body}
            onChangeText={setBody}
            maxLength={NOTICE_BODY_MAX}
            multiline
            placeholder="알릴 내용을 적어 주세요"
            placeholderTextColor={c.muted}
            style={[s.area, { backgroundColor: c.card, boxShadow: c.float, color: c.ink, minHeight: 280 }]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10, padding: 14, borderRadius: 14, backgroundColor: c.card, boxShadow: c.float }}>
            <View style={{ flex: 1 }}>
              <Text style={{ color: c.ink, fontSize: 16 }}>맨 위에 고정</Text>
              <Text style={[s.meta, { color: c.muted }]}>고정한 공지는 목록 맨 위에 늘 보여요.</Text>
            </View>
            <Switch value={pinned} onValueChange={setPinned} />
          </View>
          {save.error ? <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600', marginTop: 8 }}>{save.error}</Text> : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
