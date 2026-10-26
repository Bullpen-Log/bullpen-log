import { type Href, router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SpacePickButton } from '~/org/space-pick';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NO_ORG, parseSpaceKey, spaceRoleWord, spaceTabs, type SpaceTab } from '@/lib/org/space-nav';
import { READABLE, READABLE_WIDE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { CoachTab } from '~/org/coach';
import { PlayerTab } from '~/org/player';
import { Card, KIND_WORD } from '~/org/parts';
import { useUnreadNotifications } from '~/home/notifications';
import { Icon } from '~/shell/icon';
import { Wordmark } from '~/shell/wordmark';
import { spaceOf, useSpace } from '~/org/space-store';

/**
 * 조직 공간(계약 8절) — 껍데기(app/index.tsx)가 웹뷰 위에 덮는다(투구 탭이 웹뷰를 덮는 것과 같은 방식). 웹뷰 · 내 싱커 판은 밑에 그대로 남아,
 * 고르개에서 '내 싱커'를 고르면 마지막 화면 · 종목 바가 곧바로 돌아온다. 아래 탭은 껍데기가 orgTabsOf 로 그린다.
 */

/** 지금 공간의 아래 탭과 고른 탭 — 껍데기가 TabBar 에 넘긴다(조직 공간이 아니면 null) */
export function orgTabsOf(key: string, spaceKind: 'TEAM' | 'LESSON' | null, saved: string | undefined): { tabs: SpaceTab[]; tab: string } | null {
  const p = parseSpaceKey(key);
  if (!p || !spaceKind) return null;
  const tabs = spaceTabs(spaceKind, p.side);
  return { tabs, tab: saved && tabs.some((t) => t.key === saved) ? saved : tabs[0].key };
}

export function OrgSpaceView({ bottom }: { bottom: number }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const sp = useSpace();
  const space = spaceOf(sp.key);
  const nav = orgTabsOf(sp.key, space?.kind ?? null, sp.tabs[sp.key]);
  return (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: c.page }]}>
      {/* 머리 한 줄(계약 9-3) — 왼쪽 싱커 이름표 · 가운데 고르개(조직 이름 ▾ / '팀 · 대표') · 오른쪽 알림 종. 내 싱커 홈 머리와 같은 높이 */}
      <View style={{ paddingTop: inset.top, backgroundColor: c.page }}>
        <View style={st.bar}>
          <View style={st.left} pointerEvents="none">
            <Wordmark size={17} color={c.ink} />
          </View>
          {space ? (
            <SpacePickButton label={space.name} sub={`${KIND_WORD[space.kind]} · ${spaceRoleWord(space)}`} c={c} />
          ) : (
            <Text style={[st.pickText, { color: c.ink }]}>팀 · 레슨장</Text>
          )}
          <Bell c={c} />
        </View>
      </View>
      {/* 코치 선수단 탭은 넓은 창에서 목록 + 회원 카드 두 칸이라 넓은 본문(그 탭이 한 칸이면 다시 720 으로 모은다), 나머지는 읽기 폭 */}
      <ScrollView
        key={`${sp.key}:${nav?.tab ?? ''}`}
        contentContainerStyle={[
          { padding: 16, gap: 16, paddingBottom: bottom + 24 },
          parseSpaceKey(sp.key)?.side === 'c' && nav?.tab === 'roster' ? READABLE_WIDE : READABLE,
        ]}
      >
        {sp.key === NO_ORG ? (
          <NoOrg c={c} />
        ) : !space || !nav ? null : parseSpaceKey(sp.key)?.side === 'c' ? (
          <CoachTab space={space} tab={nav.tab} />
        ) : (
          <PlayerTab space={space} tab={nav.tab} />
        )}
      </ScrollView>
    </View>
  );
}

/** 알림 종 — 내 알림(공간과 상관없이 같은 목록). 오늘 할 일 · 체크인은 내 싱커 것이라 여기 창에는 알림만 */
function Bell({ c }: { c: Palette }) {
  const pending = useUnreadNotifications();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={pending > 0 ? `알림, 안 읽은 알림 ${pending}개` : '알림'}
      onPress={() => router.push({ pathname: '/notice' as Href as never, params: { only: '1' } })}
      hitSlop={6}
      style={({ pressed }) => [st.bell, pressed && { backgroundColor: c.chip }]}
    >
      <Icon name="bell" size={19} color={c.muted} />
      {pending > 0 ? <View style={[st.dot, { backgroundColor: c.warn, borderColor: c.page }]} /> : null}
    </Pressable>
  );
}

/** 마스터 계정인데 관리하는 조직이 없음 — 내 싱커로 대신 보내지 않는다(계약 8-5) */
function NoOrg({ c }: { c: Palette }) {
  return (
    <>
      <Card c={c}>
        <Text style={[TYPE.card, { color: c.ink }]}>관리하는 팀 · 레슨장이 없어요</Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>PC 웹에서 팀이나 레슨장을 만들거나, 대표에게 코치 초대 코드를 받아 주세요. 만든 뒤 앱을 다시 열면 여기 보여요.</Text>
      </Card>
      <View style={{ flexDirection: 'row', gap: 20, paddingHorizontal: 4 }}>
        <Pressable accessibilityRole="button" onPress={() => router.push('/settings' as Href)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[TYPE.body, { color: c.sky, fontWeight: '600' }]}>설정</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/account' as Href)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text style={[TYPE.body, { color: c.sky, fontWeight: '600' }]}>계정 · 로그아웃</Text>
        </Pressable>
      </View>
    </>
  );
}

const st = StyleSheet.create({
  bar: { height: 56, alignItems: 'center', justifyContent: 'center' },
  left: { position: 'absolute', left: 16, height: 56, justifyContent: 'center' },
  bell: { position: 'absolute', right: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: 10, top: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  pickText: { fontSize: 17, fontWeight: '700' },
});
