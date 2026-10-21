import * as Haptics from 'expo-haptics';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { Alert, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppAdmin } from '@/app/actions/app-admin';
import { ROLE_LABEL, parseRole, type Role } from '@/lib/permissions';
import { Badge, Bar, call, LoadState, Row, s, useLoad, useTitleCollapse } from '~/community/parts';
import { PageHead } from '~/shell/heading';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

const ROLE_DETAIL: Record<Role, string> = {
  USER: '관리자 메뉴를 더는 쓸 수 없어요.',
  MANAGER: '영상 촬영 · 구속 측정 관리자 · 세션 녹화 · ABS 만 쓸 수 있어요.',
  ADMIN: '회원 관리 · 역할 바꾸기까지 모든 관리자 기능을 쓸 수 있어요.',
};

/**
 * 관리자(앱 화면) — 웹 app/(app)/admin/page.tsx: 요약 넷 · 관리 메뉴(소통 · 커뮤니티 신고 · 패치노트는 앱, 구속 측정 · 촬영 관리자는 웹) ·
 * 회원 목록(관리자 지정 · 해제 · 지우기 — 한 번 더 묻고, 본인은 못 바꾼다).
 */
type Loaded = Awaited<ReturnType<typeof loadAppAdmin>>;
type Data = Extract<Loaded, { ok: true }>;

export default function AdminScreen() {
  const c = usePalette();
  const { shown, scroll } = useTitleCollapse();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppAdmin');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="더보기" title="관리자" shown={!data || shown} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView {...scroll}
          contentContainerStyle={[{ padding: 16, gap: 22, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <PageHead title="관리자" />
          {!data.perms.owner ? (
            <Text style={[s.meta, { color: c.muted, paddingHorizontal: 4 }]}>
              준관리자는 아래 기능만 쓸 수 있어요. 회원 관리 · 공지 · 라이브러리 고치기는 대표관리자에게 부탁해 주세요.
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {data.stats.map((st) => (
              <View key={st.label} style={{ flexBasis: '47%', flexGrow: 1, borderRadius: 14, padding: 14, backgroundColor: c.card, boxShadow: c.float, gap: 4 }}>
                <Text style={[s.meta, { color: c.muted }]}>{st.label}</Text>
                <Text style={{ color: c.ink, fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                  {st.value}
                  <Text style={{ fontSize: 15, color: c.muted, fontWeight: '400' }}> {st.unit}</Text>
                </Text>
              </View>
            ))}
          </View>

          <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            {data.perms.owner ? (<>
            <MenuRow icon="bubble.left.and.bubble.right" label="소통 관리" detail={data.openInquiries > 0 ? `답할 문의 ${data.openInquiries}` : '1:1 문의 · 공지'} onPress={() => router.push('/admin/support' as Href)} c={c} />
            <MenuRow icon="flag" label="커뮤니티 신고" detail={data.openReports > 0 ? `처리 전 ${data.openReports}` : '신고된 글 · 댓글'} onPress={() => router.push('/admin/community' as Href)} c={c} />
            <MenuRow icon="doc.text" label="패치노트" detail="누가 · 어느 날 무엇을 고쳤나" onPress={() => router.push('/admin/patch-notes' as Href)} c={c} />
            </>) : null}
            {data.perms.velocityAdmin ? <MenuRow icon="gauge.with.needle" label="구속 측정 관리자" detail="지난 영상 · 영상 올리기" onPress={() => router.push('/admin/velocity' as Href)} last={!data.perms.shoot && !data.perms.dev3d} c={c} /> : null}
            {/* 3D 개발 관리자(2026-10-21) — 3D 스윙 분석 모델링용 타자 샘플 · 마커 샘플. 옛 서버 답에는 dev3d 칸이 없다 */}
            {data.perms.dev3d ? <MenuRow icon="rotate.3d" label="3D 개발 관리자" detail="타자 샘플 · 마커 샘플 올리기" onPress={() => router.push('/swing/samples' as Href)} last={!data.perms.shoot} c={c} /> : null}
            {data.perms.shoot ? <MenuRow icon="video" label="촬영 관리자" detail="주차 시간표 · 찍음 체크" last onPress={() => router.push('/admin/shoot' as Href)} c={c} /> : null}
          </View>

          {data.perms.owner ? (<>
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 }}>
              <Text style={[s.title, { color: c.ink }]}>회원 목록</Text>
              <Text style={[s.meta, { color: c.muted }]}>최근 가입순</Text>
            </View>
            <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              {data.users.map((u, i) => (
                <UserRow key={u.id} u={u} self={u.id === data.meId} last={i === data.users.length - 1} reload={reload} c={c} />
              ))}
            </View>
          </View>

          <Text style={[s.meta, { color: c.muted, paddingHorizontal: 4 }]}>
            트레이닝 영상 {data.content.videos} · 자료실 글 {data.content.articles} · 투구 기록 {data.content.logs}
          </Text>
          </>) : null}
          {/* 웹 관리자 맨 밑 안내와 같은 말(해요체) — 회원 줄을 누르면 권한 · 삭제가 뜬다 */}
          <Text style={[s.meta, { color: c.muted, paddingHorizontal: 4, lineHeight: 19 }]}>
            내 계정은 실수로 잠기지 않게 권한 변경과 삭제를 막아 두었어요. 회원을 삭제하면 그 회원의 투구 기록과 게시글도 함께 지워지고 되돌릴 수 없어요.
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
          <Text style={{ color: c.ink, fontSize: 17 }}>{label}</Text>
          <Text style={[s.meta, { color: c.muted }]}>{detail}</Text>
        </View>
        {web ? <SymbolView name="arrow.up.right" size={12} tintColor={c.muted} /> : null}
      </View>
    </Row>
  );
}

function UserRow({ u, self, last, reload, c }: { u: Data['users'][number]; self: boolean; last: boolean; reload: () => void; c: Palette }) {
  const act = (action: string, ...args: unknown[]) =>
    void call<{ ok: true; message: string }>(action, u.id, ...args).then((r) => {
      if (!r.ok) return Alert.alert('하지 못했어요', r.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      reload();
    });
  /* 역할 셋(2026-10-20, lib/permissions.ts) — 지금 역할은 빼고 고르게 한 번 더 묻는다 */
  const toRole = (role: Role) => ({
    text: `${ROLE_LABEL[role]}로 바꾸기`,
    onPress: () =>
      Alert.alert(`${u.nickname}님을 ${ROLE_LABEL[role]}로 바꿀까요?`, ROLE_DETAIL[role], [
        { text: '취소', style: 'cancel' as const },
        { text: '바꾸기', onPress: () => act('app-admin.setAppUserRole', role) },
      ]),
  });
  const menu = () =>
    Alert.alert(u.nickname, `${u.email} · ${ROLE_LABEL[parseRole(u.role)]}`, [
      ...(['USER', 'MANAGER', 'ADMIN'] as const).filter((r) => r !== parseRole(u.role)).map(toRole),
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
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{u.nickname}</Text>
        {u.role === 'ADMIN' ? <Badge text="대표관리자" color={c.sky} c={c} /> : u.role === 'MANAGER' ? <Badge text="준관리자" c={c} /> : null}
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
