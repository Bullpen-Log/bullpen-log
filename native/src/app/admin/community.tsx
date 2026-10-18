import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppCommunityReports } from '@/app/actions/app-admin';
import { Badge, Bar, call, Chip, LoadState, s, useLoad } from '~/community/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 커뮤니티 신고(앱 화면, 관리자) — 웹 app/(app)/admin/community/page.tsx: 처리 전이 먼저(전체면 처리한 것까지). 글 · 댓글은 지우지 않고
 * 가린다(되살릴 수 있다, community.setAppHidden), 처리 완료(app-admin.resolveAppReport). 대상을 누르면 앱 커뮤니티 글 화면.
 */
type Loaded = Awaited<ReturnType<typeof loadAppCommunityReports>>;
type Report = Extract<Loaded, { ok: true }>['reports'][number];

export default function AdminCommunityScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [all, setAll] = useState(false);
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppCommunityReports', all ? 1 : 0);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="관리자" title="커뮤니티 신고" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }}>신고된 글 · 댓글을 보고 가리거나 그대로 둬요. 처리하면 목록에서 내려가요.</Text>
          <View accessibilityRole="radiogroup" style={s.chips}>
            <Chip label={`처리 전 ${data.openCount}`} on={!all} onPress={() => setAll(false)} c={c} />
            <Chip label="전체" on={all} onPress={() => setAll(true)} c={c} />
          </View>
          {data.reports.length === 0 ? (
            <View style={{ padding: 24, gap: 6, alignItems: 'center' }}>
              <Text style={[s.title, { color: c.ink }]}>{all ? '아직 신고가 없어요' : '처리할 신고가 없어요'}</Text>
              <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>
                {all ? '신고가 들어오면 여기에 쌓여요.' : '모두 처리했어요. 전체에서 지난 신고를 볼 수 있어요.'}
              </Text>
            </View>
          ) : (
            data.reports.map((r) => <ReportCard key={r.id} r={r} reload={reload} c={c} />)
          )}
        </ScrollView>
      )}
    </View>
  );
}

function ReportCard({ r, reload, c }: { r: Report; reload: () => void; c: Palette }) {
  const [busy, setBusy] = useState(false);
  const run = async (action: string, ...args: unknown[]) => {
    if (busy) return;
    setBusy(true);
    const res = await call<{ ok: true }>(action, ...args);
    setBusy(false);
    if (!res.ok) return Alert.alert('하지 못했어요', res.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    reload();
  };
  const gone = r.kind == null;
  return (
    <View style={{ borderRadius: 14, padding: 14, gap: 10, backgroundColor: c.card, boxShadow: c.float, opacity: r.resolvedAt ? 0.7 : 1 }}>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6 }}>
        <Badge text={gone ? '지워짐' : r.kind === 'comment' ? '댓글' : '글'} color={r.kind === 'post' ? c.sky : undefined} c={c} />
        <Badge text={r.reason} color={c.danger} c={c} />
        {r.hidden ? <Badge text="가려짐" c={c} /> : null}
        {r.resolvedAt ? <Badge text={`처리 ${r.resolvedAt}`} color={c.ok} c={c} /> : null}
      </View>
      <Text style={[s.meta, { color: c.muted }]}>
        {r.reporter} 신고 · {r.at}
      </Text>
      {gone ? (
        <Text style={{ color: c.muted, fontSize: 15 }}>신고된 글 · 댓글이 이미 지워졌어요.</Text>
      ) : (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push(`/community/${r.postId}` as Href)}
          style={({ pressed }) => [{ borderRadius: 12, padding: 12, gap: 4, backgroundColor: pressed ? c.line : c.page }]}
        >
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{r.preview}</Text>
          <Text style={[s.meta, { color: c.muted }]}>{r.author} · 글 보기 ›</Text>
        </Pressable>
      )}
      {r.detail ? (
        <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>
          <Text style={{ color: c.muted }}>신고 내용 · </Text>
          {r.detail}
        </Text>
      ) : null}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
        {!gone ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void run('community.setAppHidden', r.kind, r.targetId, !r.hidden)}
            style={[s.pill, { minHeight: 40, paddingHorizontal: 16, backgroundColor: r.hidden ? c.chip : c.danger }]}
          >
            <Text style={{ color: r.hidden ? c.ink : '#fff', fontSize: 15, fontWeight: '600' }}>{r.hidden ? '되살리기' : '가리기'}</Text>
          </Pressable>
        ) : null}
        {!r.resolvedAt ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => void run('app-admin.resolveAppReport', r.id)}
            style={[s.pill, { minHeight: 40, paddingHorizontal: 16, backgroundColor: c.sky }]}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>처리 완료</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
