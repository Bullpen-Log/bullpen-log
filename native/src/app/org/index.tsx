import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { leaveOrg, MySpace } from '@/app/actions/app-org';
import { ME, spaceKeyOf, spaceLabel } from '@/lib/org/space-nav';
import { Bar, BarButton, call } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Card, Empty, GroupTitle, KIND_WORD, Primary } from '~/org/parts';
import { refreshSpaces, setSpace, spaceNow, useSpace } from '~/org/space-store';

/**
 * 소속 관리(앱 화면, 계약 8-4) — 들어간 팀 · 레슨장, 지난 소속(받은 일지 읽기만), 나가기. 나가기는 여기에만 있다 —
 * 공간 바꾸기(고르개)는 나가기 · 공유 바꾸기가 아니다. 마스터 계정은 관리하는 조직 목록(이 공간으로 옮기기)만.
 * 더보기 '소속 관리' · 공간 고르개 · 웹 /manage · /join 이 여기로 온다.
 */
type Left = Awaited<ReturnType<typeof leaveOrg>>;

export default function MembershipsScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const sp = useSpace();
  useFocusEffect(
    useCallback(() => {
      void refreshSpaces();
    }, [])
  );
  const go = (s: MySpace) => {
    setSpace(spaceKeyOf(s));
    if (router.canDismiss()) router.dismissAll();
  };
  const players = sp.spaces.filter((s) => s.role === 'PLAYER');
  const coach = sp.spaces.filter((s) => s.role !== 'PLAYER');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="뒤로"
        title="소속 관리"
        right={sp.hasSinker ? <BarButton label="코드 넣기" onPress={() => router.push('/org/join' as Href)} c={c} /> : undefined}
        c={c}
      />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
        {coach.length ? (
          <View style={{ gap: 6 }}>
            <GroupTitle title="관리하는 곳" c={c} />
            {coach.map((s) => (
              <Card key={spaceKeyOf(s)} c={c}>
                <Text style={[TYPE.card, { color: c.ink }]}>{spaceLabel(s)}</Text>
                <Link label="이 공간으로" onPress={() => go(s)} c={c} />
              </Card>
            ))}
          </View>
        ) : null}
        {sp.hasSinker ? (
          <>
            <View style={{ gap: 6 }}>
              <GroupTitle title="들어간 곳" c={c} />
              {players.length === 0 ? (
                <Card c={c}>
                  <Empty text="아직 들어간 팀 · 레슨장이 없어요. 코치에게 받은 초대 코드를 넣으면 레슨일지를 받고, 보여 주기로 고른 기록만 코치가 봐요." c={c} />
                  <Primary label="초대 코드로 들어가기" onPress={() => router.push('/org/join' as Href)} c={c} />
                </Card>
              ) : (
                players.map((s) => <Joined key={spaceKeyOf(s)} s={s} onGo={() => go(s)} c={c} />)
              )}
            </View>
            {sp.former.length ? (
              <View style={{ gap: 6 }}>
                <GroupTitle title="지난 소속" c={c} />
                <Card c={c} style={{ paddingVertical: 4 }}>
                  {sp.former.map((s, i) => (
                    <Pressable
                      key={spaceKeyOf(s)}
                      accessibilityRole="button"
                      onPress={() => router.push(`/org/former/${s.memberId}` as Href)}
                      style={({ pressed }) => [st.row, i < sp.former.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }, pressed && { opacity: 0.6 }]}
                    >
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text style={[TYPE.card, { color: c.ink }]}>
                          {s.name} {KIND_WORD[s.kind]}
                        </Text>
                        <Text style={[TYPE.sub, { color: c.muted }]}>받은 일지 읽기만 해요</Text>
                      </View>
                      <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
                    </Pressable>
                  ))}
                </Card>
              </View>
            ) : null}
          </>
        ) : coach.length === 0 ? (
          <Card c={c}>
            <Empty text="관리하는 팀 · 레슨장이 없어요. PC 웹에서 만들어 주세요." c={c} />
          </Card>
        ) : null}
      </ScrollView>
    </View>
  );
}

function Joined({ s, onGo, c }: { s: MySpace; onGo: () => void; c: Palette }) {
  const [busy, setBusy] = useState(false);
  const leave = () =>
    Alert.alert(
      `${s.name}에서 나갈까요?`,
      `나가면 코치가 내 기록을 더는 못 봐요. 받은 레슨일지는 읽기만 할 수 있고, 다시 들어가려면 새 초대 코드가 필요해요. 내 싱커 기록은 그대로예요.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '나가기',
          style: 'destructive',
          onPress: async () => {
            setBusy(true);
            const r = await call<Left>('app-org.leaveOrg', s.memberId);
            setBusy(false);
            if (!r.ok) return toast(('error' in r && r.error) || '처리하지 못했어요.', 'error');
            /* 지금 보던 공간이면 내 싱커로 먼저 — 다시 확인이 '볼 수 없어요'를 알리지 않게 */
            if (spaceNow().key === spaceKeyOf(s)) setSpace(ME);
            toast(`${s.name}에서 나왔어요`);
            void refreshSpaces();
          },
        },
      ]
    );
  return (
    <Card c={c}>
      <Text style={[TYPE.card, { color: c.ink }]}>{spaceLabel(s)}</Text>
      {s.consentPending ? <Text style={[TYPE.sub, { color: c.muted }]}>보여 줄 기록을 아직 안 골랐어요</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 20 }}>
        <Link label="이 공간으로" onPress={onGo} c={c} />
        <Link label="보여 줄 기록" onPress={() => router.push(`/org/share/${s.memberId}` as Href)} c={c} />
        <Link label={busy ? '나가는 중…' : '나가기'} onPress={leave} danger disabled={busy} c={c} />
      </View>
    </Card>
  );
}

function Link({ label, onPress, danger = false, disabled = false, c }: { label: string; onPress: () => void; danger?: boolean; disabled?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={6} style={{ minHeight: 40, justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}>
      <Text style={[TYPE.body, { color: danger ? c.danger : c.sky, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingVertical: 8 },
});
