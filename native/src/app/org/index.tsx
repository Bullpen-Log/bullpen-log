import { type Href, router, Stack } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadMySpaces, MySpace } from '@/app/actions/app-org';
import { Bar, BarButton, LoadState, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { CoachSpace } from '~/org/coach';
import { PlayerSpace } from '~/org/player';
import { Card, KIND_WORD, Primary, ROLE_WORD, lastSpace, rememberSpace, spaceKey, st } from '~/org/parts';

/**
 * 팀 · 레슨장 공간(앱 화면) — 1단계(docs/designs/sinker-team-lesson-contract.md 2-2). 위에서 공간을 고르고, 고른 공간 · 역할에 따라
 * 코치 화면(오늘 · 회원 · 더보기) 또는 선수 화면(공유 범위 · 받은 일지)을 보인다. 마스터 계정은 내 싱커가 없어(결정 3) 이 화면이 첫 화면이다 —
 * 웹이 /manage 로 가면 껍데기(index.tsx)가 이리로 연다. 선수는 더보기 › 팀 · 레슨장 · 알림에서 온다.
 */
type Loaded = Awaited<ReturnType<typeof loadMySpaces>>;

export default function OrgScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('app-org.loadMySpaces');
  const [pick, setPick] = useState<string | null>(null);
  useEffect(() => {
    void lastSpace().then((k) => setPick((p) => p ?? k));
  }, []);
  const spaces = data?.spaces ?? [];
  const current: MySpace | null = spaces.find((s) => spaceKey(s) === pick) ?? spaces.find((s) => !s.left) ?? spaces[0] ?? null;
  const choose = (s: MySpace) => {
    setPick(spaceKey(s));
    rememberSpace(spaceKey(s));
  };
  /* 마스터 계정은 돌아갈 내 싱커가 없다 — 뒤로 · 쓸어서 닫기를 막는다 */
  const canBack = data ? data.hasSinker : true;

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Stack.Screen options={{ gestureEnabled: canBack }} />
      <Bar
        back={canBack ? '싱커' : undefined}
        title={current ? current.name : '팀 · 레슨장'}
        right={data?.hasSinker ? <BarButton label="코드 넣기" onPress={() => router.push('/org/join' as Href)} c={c} /> : undefined}
        c={c}
      />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          {spaces.length > 1 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {spaces.map((s) => {
                const on = current != null && spaceKey(s) === spaceKey(current);
                return (
                  <Pressable
                    key={spaceKey(s)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => choose(s)}
                    style={[st.chip, { backgroundColor: on ? c.sky : c.chip }]}
                  >
                    <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>
                      {s.name} · {s.role === 'PLAYER' ? (s.kind === 'TEAM' ? '선수' : '회원') : ROLE_WORD[s.role]}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}

          {!current ? (
            <Card c={c}>
              <Text style={[TYPE.card, { color: c.ink }]}>아직 들어간 팀 · 레슨장이 없어요</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>
                {data.hasSinker
                  ? '코치에게 받은 초대 코드를 넣으면 레슨일지를 받고, 보여 주기로 고른 기록만 코치가 봐요.'
                  : 'PC 웹에서 팀이나 레슨장을 만든 뒤 다시 열어 주세요.'}
              </Text>
              {data.hasSinker ? <Primary label="초대 코드로 들어가기" onPress={() => router.push('/org/join' as Href)} c={c} /> : null}
            </Card>
          ) : (
            <>
              <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>
                {KIND_WORD[current.kind]} · {current.role === 'PLAYER' ? (current.kind === 'TEAM' ? '선수' : '회원') : ROLE_WORD[current.role]}
              </Text>
              {current.role === 'PLAYER' ? <PlayerSpace key={spaceKey(current)} space={current} /> : <CoachSpace key={spaceKey(current)} space={current} />}
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
