import { type Href, router } from 'expo-router';
import { Icon } from '~/shell/icon';
import { RefreshControl, ScrollView, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SwingList } from '@/app/actions/swing-lab';
import { SWING_REPORT_SOON, swingFrontBase } from '@/lib/swing-lab-meta';
import { Bar, BarButton, LoadState, s, useLoad } from '~/community/parts';
import { SwingRow } from '~/swing/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 3D 스윙 분석(사용자 화면) — 타격 탭(웹 /hitting)의 '3D 스윙 분석' 칸이 앱이면 여기로 넘긴다(웹 /hitting/lab → OpenNative '/swing').
 * 투구 3D 동작 분석(app/lab/index.tsx)과 같은 모양 — 위는 '스윙 진단 리포트'(모델을 만들기 전이라 [리포트 받기]는 준비 중, GPU 안 부름),
 * 아래는 내 스윙. 3D 개발 관리자는 머리 '샘플' 단추로 /swing/samples(모델링용 샘플 올리기).
 */
export default function SwingHomeScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<SwingList>('swing-lab.loadAppSwingList', 'mine');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="타격"
        title="3D 스윙 분석"
        right={data?.isDev ? <BarButton label="샘플" onPress={() => router.push('/swing/samples' as Href)} c={c} /> : undefined}
        c={c}
      />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ padding: 16, gap: 20, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <View style={{ borderRadius: 20, padding: 20, gap: 14, backgroundColor: c.card, boxShadow: c.float }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.skyTint }}>
                <Icon name="batter" size={24} color={c.skyStrong} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.title, { color: c.ink }]}>스윙 진단 리포트</Text>
                  <View style={{ borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: c.skyTint }}>
                    <Text style={{ color: c.skyStrong, fontSize: 12, fontWeight: '600' }}>베타</Text>
                  </View>
                </View>
                <Text style={[s.meta, { color: c.muted }]}>스윙 한 번을 찍어 올리면 고칠 점과 드릴 처방을 드려요.</Text>
              </View>
            </View>
            <View accessibilityRole="button" accessibilityState={{ disabled: true }} style={[s.primary, { marginTop: 0, backgroundColor: c.line }]}>
              <Text style={[s.primaryText, { color: c.muted }]}>리포트 받기</Text>
            </View>
            <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>{SWING_REPORT_SOON}</Text>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/swing/guide?hand=${data.hand}` as Href)}
              hitSlop={6}
              style={{ minHeight: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>어떻게 찍나요 ›</Text>
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[s.label, { color: c.muted, paddingHorizontal: 4 }]}>내 스윙</Text>
            {data.samples.length === 0 ? (
              <View style={{ padding: 24, gap: 6, alignItems: 'center' }}>
                <Text style={[s.title, { color: c.ink }]}>아직 올린 스윙이 없어요</Text>
                <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>
                  같은 스윙을 정면({swingFrontBase(data.hand)} 쪽)과 포수 뒤에서 동시에 찍어 두세요. 리포트가 열리면 바로 올릴 수 있어요.
                </Text>
              </View>
            ) : (
              <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                {data.samples.map((x, i) => (
                  <SwingRow key={x.id} item={x} name={`스윙 ${data.samples.length - i}`} last={i === data.samples.length - 1} onRemoved={() => void reload()} c={c} />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
