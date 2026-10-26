import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadPlanSources } from '@/app/actions/app-team';
import { Bar, LoadState, call, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { dayWithWeekday } from '~/org/forms';
import { Card, Empty, st } from '~/org/parts';

/**
 * 지난 일정에서 메뉴 가져오기(계약 10-4 ②) — 메뉴가 있는 이 조직 일정(지난 60일 ~ 앞으로 14일)을 골라 이 일정에 더하거나 바꾼다.
 * 복사본은 새 메뉴다: 원본을 고쳐도 안 바뀌고, 이 일정의 참석 · 수행은 그대로. 대상은 이 일정의 선수로 좁힌다(app-team.copyPlansFrom).
 * 주소: /org/plan-copy?org=&event=
 */
type Loaded = Awaited<ReturnType<typeof loadPlanSources>>;

export default function PlanCopyScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; event: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-team.loadPlanSources', p.org ?? '', p.event ?? '');
  const [busy, setBusy] = useState(false);
  const copy = (fromId: string, mode: 'add' | 'replace') =>
    void (async () => {
      setBusy(true);
      try {
        const r = await call<{ ok: true; copied: number }>('app-team.copyPlansFrom', p.org, fromId, p.event, mode);
        if (!r.ok) return toast(('error' in r && r.error) || '가져오지 못했어요.', 'error');
        toast(r.copied ? `메뉴 ${r.copied}개를 가져왔어요` : '이미 가져왔어요');
        router.back();
      } finally {
        setBusy(false);
      }
    })();
  const pick = (id: string, title: string) =>
    Alert.alert(`'${title}'의 메뉴를 가져올까요?`, '더하면 이 일정의 메뉴 뒤에 붙고, 바꾸면 이 일정의 메뉴를 지우고 넣어요. 참석 · 수행은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '더하기', onPress: () => copy(id, 'add') },
      { text: '바꾸기', style: 'destructive', onPress: () => copy(id, 'replace') },
    ]);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="메뉴 가져오기" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Card c={c} style={{ paddingVertical: data.ok && data.sources.length ? 0 : 16 }}>
            {!data.ok || data.sources.length === 0 ? (
              <Empty text="메뉴가 있는 지난 일정이 없어요." c={c} />
            ) : (
              data.sources.map((e, i) => (
                <Pressable
                  key={e.id}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => pick(e.id, e.title)}
                  style={({ pressed }) => [st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, (pressed || busy) && { opacity: 0.6 }]}
                >
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={[TYPE.body, { color: c.ink }]} numberOfLines={1}>
                      {dayWithWeekday(e.date)} · {e.time ?? '종일'} · {e.title}
                    </Text>
                    <Text style={[TYPE.sub, { color: c.muted }]} numberOfLines={2}>
                      메뉴 {e.plans.join(' · ')}
                    </Text>
                  </View>
                  <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
                </Pressable>
              ))
            )}
          </Card>
        </ScrollView>
      )}
    </View>
  );
}
