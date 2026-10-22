import { type Href, router } from 'expo-router';
import { Icon } from '~/shell/icon';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppLabList } from '@/app/actions/pitch-lab';
import { groupLabSamples, labSideBase, LAB_SUBJECT_FOLDERS } from '@/lib/pitch-lab-meta';
import { Bar, BarButton, LoadState, s, useLoad } from '~/community/parts';
import { SampleGroup, SampleRow } from '~/lab/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 3D 동작 분석(사용자 화면) — 투구 탭의 '3D 동작 분석' 칸으로 들어온다. 위는 '투구 진단 리포트' [리포트 받기](단계 흐름 app/lab/new.tsx),
 * 아래는 내 리포트(누르면 리포트 /lab/<id> — 2026-10-21 결과 화면이 리포트로, 설계 docs/designs/pitch-3d-report.md 5-9절).
 * 2026-10-21 김민: "샘플 · 마커 샘플이 있는 페이지는 관리자 전용, 사용자가 실제로 3D 분석에 쓰는 페이지는 따로" — 관리자는 머리 '샘플' 단추로
 * 관리자 샘플 화면(app/lab/samples.tsx)에 간다. 이 화면은 관리자도 자기 투구만(서버 loadAppLabList('mine')).
 */
type Loaded = Awaited<ReturnType<typeof loadAppLabList>>;

export default function LabHomeScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('pitch-lab.loadAppLabList', 'mine');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar
        back="투구"
        title="3D 동작 분석"
        right={data?.isAdmin ? <BarButton label="샘플" onPress={() => router.push('/lab/samples' as Href)} c={c} /> : undefined}
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
                <Icon name="pitcher" size={24} color={c.skyStrong} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={[s.title, { color: c.ink }]}>투구 진단 리포트</Text>
                  <View style={{ borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, backgroundColor: c.skyTint }}>
                    <Text style={{ color: c.skyStrong, fontSize: 12, fontWeight: '600' }}>베타</Text>
                  </View>
                </View>
                <Text style={[s.meta, { color: c.muted }]}>한 구를 찍어 올리면 고칠 점과 드릴 처방을 드려요.</Text>
              </View>
            </View>
            <Pressable accessibilityRole="button" onPress={() => router.push('/lab/new' as Href)} style={[s.primary, { marginTop: 0, backgroundColor: c.sky }]}>
              <Text style={s.primaryText}>리포트 받기</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push(`/lab/guide?hand=${data.hand}` as Href)}
              hitSlop={6}
              style={{ minHeight: 32, alignItems: 'center', justifyContent: 'center' }}
            >
              <Text style={{ color: c.sky, fontSize: 15, fontWeight: '600' }}>어떻게 찍나요 ›</Text>
            </Pressable>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={[s.label, { color: c.muted, paddingHorizontal: 4 }]}>내 리포트</Text>
            {data.samples.length === 0 ? (
              <View style={{ padding: 24, gap: 6, alignItems: 'center' }}>
                <Text style={[s.title, { color: c.ink }]}>아직 받은 리포트가 없어요</Text>
                <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>
                  같은 공을 옆({labSideBase(data.hand)} 쪽)과 뒤(2루 쪽)에서 동시에 찍어 시작해 보세요.
                </Text>
              </View>
            ) : data.isAdmin ? (
              /* 관리자는 여러 사람 투구를 올린다 — 사람 폴더 넷(김민 · 금윤호 · 정강민 · 기타, 2026-10-22 김민). 번호는 묶기 전 전체 차례 그대로 */
              <View style={{ gap: 10 }}>
                {groupLabSamples(data.samples, (x) => x.subject, LAB_SUBJECT_FOLDERS).map((g) => (
                  <SampleGroup key={g.name} name={g.name} count={g.items.length} c={c}>
                    {g.items.map((x, i) => (
                      <SampleRow
                        key={x.id}
                        item={x}
                        name={`투구 ${data.samples.length - data.samples.indexOf(x)}`}
                        last={i === g.items.length - 1}
                        onRemoved={() => void reload()}
                        c={c}
                      />
                    ))}
                  </SampleGroup>
                ))}
              </View>
            ) : (
              <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                {data.samples.map((x, i) => (
                  <SampleRow
                    key={x.id}
                    item={x}
                    name={`투구 ${data.samples.length - i}`}
                    last={i === data.samples.length - 1}
                    onRemoved={() => void reload()}
                    c={c}
                  />
                ))}
              </View>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}
