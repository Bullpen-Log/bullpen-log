import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { leaveOrg, loadMyMembership, saveConsent } from '@/app/actions/app-org';
import { consentDefaults, type Consent } from '@/lib/org/rules';
import { Bar, call, LoadState, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { ConsentList, GroupTitle, KIND_WORD, Primary } from '~/org/parts';

/**
 * 코치에게 보여 줄 기록(공유 범위) 고르기 · 떠나기(앱 화면). 첫 저장이 동의다 — 그 전에는 코치가 내 기록을 못 본다(예약 확정으로 연결된 회원).
 * 떠나면 조직은 이 뒤의 기록을 못 보고, 받은 일지는 읽기로 남는다(결정 8).
 */
type Loaded = Awaited<ReturnType<typeof loadMyMembership>>;
type Saved = Awaited<ReturnType<typeof saveConsent>>;
type Left = Awaited<ReturnType<typeof leaveOrg>>;

export default function ShareScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-org.loadMyMembership', id ?? '');
  /* 고친 값이 있으면 그것, 없으면 받은 값 — 고르는 동안 다시 받아도 덮지 않는다 */
  const [edited, setConsent] = useState<Consent | null>(null);
  const consent = edited ?? (data ? (data.scope ?? consentDefaults()) : null);
  const { busy, error: sendError, run } = useBusy();
  const save = () =>
    run(async () => {
      const r = await call<Saved>('app-org.saveConsent', id, consent);
      if (!r.ok) return r.error ?? '저장하지 못했어요.';
      toast('저장했어요');
      router.back();
      return null;
    });
  const leave = () =>
    Alert.alert(`${data?.org.name ?? ''}을 떠날까요?`, '코치가 이 뒤의 기록을 볼 수 없어요. 받은 일지는 남아요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '떠나기',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            const r = await call<Left>('app-org.leaveOrg', id);
            if (!r.ok) return r.error ?? '처리하지 못했어요.';
            toast('떠났어요');
            router.back();
            return null;
          }),
      },
    ]);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="보여 줄 기록" c={c} />
      {!data || !consent ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <View style={{ gap: 6 }}>
            <GroupTitle title={`${data.org.name} ${KIND_WORD[data.org.kind]} 코치에게 보여 줄 기록`} c={c} />
            <ConsentList value={consent} onChange={setConsent} c={c} />
          </View>
          {sendError ? <Text style={[TYPE.body, { color: c.danger }]}>{sendError}</Text> : null}
          {data.left ? (
            <Text style={[TYPE.body, { color: c.muted }]}>떠난 곳이라 바꿀 수 없어요.</Text>
          ) : (
            <>
              <Primary label={busy ? '저장하는 중…' : '저장'} onPress={() => void save()} disabled={busy} c={c} />
              <Pressable accessibilityRole="button" onPress={leave} disabled={busy} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={[TYPE.body, { color: c.danger, fontWeight: '600' }]}>이곳 떠나기</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
      )}
    </View>
  );
}
