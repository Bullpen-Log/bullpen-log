import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppAdmin } from '@/app/actions/app-admin';
import { Badge, Bar, call, leave, LoadState, Row, s, useLoad } from '~/community/parts';
import { usePalette, type Palette } from '~/lib/ui';

/**
 * 관리자(앱 화면) — 웹 app/(app)/admin/page.tsx: 요약 넷 · 관리 메뉴(소통 · 커뮤니티 신고 · 패치노트는 앱, 구속 측정 · 촬영 관리자는 웹) ·
 * 회원 목록(관리자 지정 · 해제 · 지우기 — 한 번 더 묻고, 본인은 못 바꾼다).
 */
type Loaded = Awaited<ReturnType<typeof loadAppAdmin>>;
type Data = Extract<Loaded, { ok: true }>;

export default function AdminScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppAdmin');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="더보기" title="관리자" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 22, paddingBottom: inset.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {data.stats.map((st) => (
              <View key={st.label} style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 14, padding: 14, backgroundColor: c.card, gap: 4 }}>
                <Text style={[s.meta, { color: c.muted }]}>{st.label}</Text>
                <Text style={{ color: c.ink, fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {st.value}
                  <Text style={{ fontSize: 14, color: c.muted, fontWeight: '500' }}> {st.unit}</Text>
                </Text>
              </View>
            ))}
          </View>

          <View style={[s.group, { backgroundColor: c.card }]}>
            <MenuRow icon="bubble.left.and.bubble.right" label="소통 관리" detail={data.openInquiries > 0 ? `답할 문의 ${data.openInquiries}` : '1:1 문의 · 공지'} onPress={() => router.push('/admin/support' as Href)} c={c} />
            <MenuRow icon="flag" label="커뮤니티 신고" detail={data.openReports > 0 ? `처리 전 ${data.openReports}` : '신고된 글 · 댓글'} onPress={() => router.push('/admin/community' as Href)} c={c} />
            <MenuRow icon="doc.text" label="패치노트" detail="누가 · 어느 날 무엇을 고쳤나" onPress={() => router.push('/admin/patch-notes' as Href)} c={c} />
            <MenuRow icon="gauge.with.needle" label="구속 측정 관리자" detail="웹에서 열려요" web onPress={() => leave('/admin/velocity')} c={c} />
            <MenuRow icon="video" label="촬영 관리자" detail="웹에서 열려요" web last onPress={() => leave('/admin/shoot')} c={c} />
          </View>

          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
              <Text style={[s.title, { color: c.ink }]}>회원 목록</Text>
              <Text style={[s.meta, { color: c.muted }]}>최근 가입순</Text>
            </View>
            <View style={[s.group, { backgroundColor: c.card }]}>
              {data.users.map((u, i) => (
                <UserRow key={u.id} u={u} self={u.id === data.meId} last={i === data.users.length - 1} reload={reload} c={c} />
              ))}
            </View>
          </View>

          <Text style={[s.meta, { color: c.muted, paddingHorizontal: 4 }]}>
            트레이닝 영상 {data.content.videos} · 자료실 글 {data.content.articles} · 투구 기록 {data.content.logs}
          </Text>
        </ScrollView>
      )}
    </View>
  );
}

function MenuRow({ icon, label, detail, onPress, web, last, c }: { icon: SFSymbol; label: string; detail: string; onPress: () => void; web?: boolean; last?: boolean; c: Palette }) {
  return (
    <Row onPress={onPress} last={last} c={c}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sky }}>
          <SymbolView name={icon} size={15} tintColor="#fff" />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: c.ink, fontSize: 16 }}>{label}</Text>
          <Text style={[s.meta, { color: c.muted }]}>{detail}</Text>
        </View>
        {web ? <SymbolView name="arrow.up.right" size={12} tintColor={c.muted} /> : null}
      </View>
    </Row>
  );
}

function UserRow({ u, self, last, reload, c }: { u: Data['users'][number]; self: boolean; last: boolean; reload: () => void; c: Palette }) {
  const act = (action: string) =>
    void call<{ ok: true; message: string }>(action, u.id).then((r) => {
      if (!r.ok) return Alert.alert('하지 못했어요', r.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reload();
    });
  const menu = () =>
    Alert.alert(u.nickname, u.email, [
      u.admin
        ? {
            text: '관리자 해제',
            onPress: () =>
              Alert.alert(`${u.nickname}님의 관리자 권한을 해제할까요?`, '해제하면 관리자 메뉴를 더는 쓸 수 없어요.', [
                { text: '취소', style: 'cancel' },
                { text: '해제하기', style: 'destructive', onPress: () => act('app-admin.setAppUserRole') },
              ]),
          }
        : {
            text: '관리자로 지정',
            onPress: () =>
              Alert.alert(`${u.nickname}님에게 관리자 권한을 줄까요?`, '영상 등록과 회원 관리를 할 수 있게 돼요.', [
                { text: '취소', style: 'cancel' },
                { text: '관리자로 지정', onPress: () => act('app-admin.setAppUserRole') },
              ]),
          },
      {
        text: '회원 삭제',
        style: 'destructive',
        onPress: () =>
          Alert.alert(`${u.nickname}님을 삭제할까요?`, '이 회원의 투구 기록과 게시글도 함께 지워지고 되돌릴 수 없어요.', [
            { text: '취소', style: 'cancel' },
            { text: '삭제하기', style: 'destructive', onPress: () => act('app-admin.deleteAppUser') },
          ]),
      },
      { text: '닫기', style: 'cancel' },
    ]);
  return (
    <Row onPress={self ? undefined : menu} last={last} c={c}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <Text style={{ color: c.ink, fontSize: 16, fontWeight: '700' }}>{u.nickname}</Text>
        {u.admin ? <Badge text="관리자" color={c.sky} c={c} /> : null}
        {self ? <Badge text="나" c={c} /> : null}
      </View>
      <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
        {u.email}
      </Text>
      <Text style={[s.meta, { color: c.muted }]}>
        {[u.age != null ? `만 ${u.age}세` : '생년월일 미입력', u.heightCm ? `${u.heightCm}cm` : null, `가입 ${u.joined}`, `기록 ${u.logs}건`, `글 ${u.articles}개`, u.lastLog ? `최근 기록 ${u.lastLog}` : null]
          .filter(Boolean)
          .join(' · ')}
      </Text>
    </Row>
  );
}
