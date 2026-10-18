import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppArticle } from '@/app/actions/board';
import { Bar, BarButton, call, LoadState, s, useBusy, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 자료실 글 하나(앱 화면) — 웹 app/(app)/board/[id]/page.tsx 를 옮겼다. 웹처럼 열 때 조회수가 오른다(board.loadAppArticle). 원문 링크는 앱 안
 * 브라우저로, 지우기는 쓴 사람 · 관리자만(board.deleteAppArticle — 웹 deleteArticle 과 같은 확인).
 */
type Got = Awaited<ReturnType<typeof loadAppArticle>>;

/** 원문 주소의 사이트 이름(www. 뺌) — 못 읽는 주소면 그대로(웹과 같다) */
function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export default function ArticleScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useLoad<Got>('board.loadAppArticle', id ?? '');
  const del = useBusy();
  const a = data?.article;

  const remove = () =>
    Alert.alert('이 글을 지울까요?', '되돌릴 수 없어요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () =>
          void del.run(async () => {
            const r = await call<{ ok: true }>('board.deleteAppArticle', id);
            if (!r.ok) return r.error;
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            router.back();
            return null;
          }),
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="자료실" right={a?.canDelete ? <BarButton label="지우기" onPress={remove} disabled={del.busy} c={c} /> : null} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : !a ? (
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 32 }}>없는 글이에요.</Text>
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 40 }, READABLE]}>
          {a.tags.length > 0 ? <Text style={{ color: c.sky, fontSize: 14 }}>{a.tags.map((t) => `#${t}`).join(' ')}</Text> : null}
          <Text selectable style={{ color: c.ink, fontSize: 24, fontWeight: '700', lineHeight: 31 }}>
            {a.title}
          </Text>
          <Text style={[s.meta, { color: c.muted }]}>
            {a.nickname} · {a.date} · 조회 {a.views}
          </Text>
          {del.error ? <Text style={{ color: c.danger, fontSize: 14 }}>{del.error}</Text> : null}
          {a.attachmentUrl ? (
            <Pressable
              accessibilityRole="link"
              onPress={() => void WebBrowser.openBrowserAsync(a.attachmentUrl!)}
              style={({ pressed }) => [
                { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, borderRadius: 14, paddingHorizontal: 16 },
                { backgroundColor: pressed ? c.chip : c.card },
              ]}
            >
              <SymbolView name="arrow.up.right.square" size={18} tintColor={c.sky} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>원문 보기</Text>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
                  {hostOf(a.attachmentUrl)}
                </Text>
              </View>
              <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
            </Pressable>
          ) : null}
          <Text selectable style={[s.body, { color: c.ink }]}>
            {a.content}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}
