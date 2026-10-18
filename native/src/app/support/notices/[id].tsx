import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppNotice } from '@/app/actions/support';
import { Badge, Bar, call, LoadState, s, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';

/**
 * 공지 한 편(앱 화면) — 웹 app/(app)/support/notices/[id]/page.tsx. 누구나 읽는다. 관리자만 고치고(웹 관리 화면으로) 지운다
 * (support.deleteAppNotice → 웹 deleteNotice 와 같은 removeNotice).
 */
type Loaded = Awaited<ReturnType<typeof loadAppNotice>>;

export default function NoticeScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useLoad<Loaded>('support.loadAppNotice', id);
  const notice = data?.notice;

  const remove = () =>
    notice &&
    Alert.alert('이 공지를 지울까요?', `${notice.title}\n되돌릴 수 없어요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          const r = await call<{ ok: true } | { ok: false; error: string }>('support.deleteAppNotice', notice.id);
          if (!r.ok) return Alert.alert(r.error);
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          router.back();
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="공지" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : !notice ? (
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 32 }}>공지를 찾지 못했어요. 지워진 공지예요.</Text>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }}>
          {notice.pinned ? <Badge text="고정" color={c.sky} c={c} /> : null}
          <Text selectable style={{ color: c.ink, fontSize: 24, fontWeight: '700' }}>
            {notice.title}
          </Text>
          <Text style={[s.meta, { color: c.muted }]}>{notice.at}</Text>
          {data.isAdmin ? (
            <View style={styles.admin}>
              <Pressable accessibilityRole="button" onPress={() => router.push(`/admin/notice?id=${notice.id}` as Href)} style={[styles.adminBtn, { backgroundColor: c.chip }]}>
                <SymbolView name="pencil" size={14} tintColor={c.ink} />
                <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>수정</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={remove} style={[styles.adminBtn, { backgroundColor: c.chip }]}>
                <SymbolView name="trash" size={14} tintColor={c.danger} />
                <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>지우기</Text>
              </Pressable>
            </View>
          ) : null}
          <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line, paddingTop: 16 }}>
            <Text selectable style={[s.body, { color: c.ink }]}>
              {notice.body}
            </Text>
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  admin: { flexDirection: 'row', gap: 8 },
  adminBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20 },
});
