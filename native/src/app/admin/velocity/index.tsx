import { type Href, router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppVelocityAdmin } from '@/app/actions/app-admin';
import { Bar, leave, LoadState, Row, s, useLoad } from '~/community/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { signed } from '~/velocity/signed';
import { READABLE } from '~/lib/layout';

/**
 * 구속 측정 관리자(앱) — 웹 app/(app)/admin/velocity/mobile-admin.tsx 의 휴대폰 화면을 옮겼다: [영상 올리기] · 녹화 · 측정 시작 · 숫자 셋 ·
 * 날짜별 지난 영상(누르면 그날 공). 탐색기 · 보정 · 카메라 값 다시 재기 · 녹화 편집은 브라우저 영상 엔진이라 PC 웹에서 한다.
 */
type Loaded = Awaited<ReturnType<typeof loadAppVelocityAdmin>>;

export default function VelocityAdminScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppVelocityAdmin');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="관리자" title="구속 측정 관리자" c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <Pressable accessibilityRole="button" onPress={() => router.push('/admin/velocity/upload' as Href)} style={[s.pill, { minHeight: 56, backgroundColor: c.sky }]}>
            <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>영상 올리기</Text>
          </Pressable>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Pressable accessibilityRole="button" onPress={() => leave('/admin/velocity/recordings')} style={[s.pill, { flex: 1, minHeight: 48, paddingHorizontal: 12, backgroundColor: c.card }]}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>녹화{data.recordings > 0 ? ` ${data.recordings}` : ''}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.push('/velocity' as Href)} style={[s.pill, { flex: 1, minHeight: 48, paddingHorizontal: 12, backgroundColor: c.card }]}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>측정 시작</Text>
            </Pressable>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Tile label="공" value={String(data.totals.pitches)} c={c} />
            <Tile label="스피드건 짝" value={String(data.totals.pairs)} c={c} />
            <Tile label="편향" value={data.biasKmh == null ? '—' : signed(data.biasKmh)} unit={data.biasKmh == null ? undefined : 'km/h'} c={c} />
          </View>

          <Text style={[s.label, { color: c.muted }]}>지난 영상</Text>
          {data.days.length === 0 ? (
            <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 24 }}>아직 올린 공이 없어요.</Text>
          ) : (
            <View style={[s.group, { backgroundColor: c.card }]}>
              {data.days.map((d, i) => (
                <Row key={d.date} onPress={() => router.push(`/admin/velocity/${d.date}` as Href)} last={i === data.days.length - 1} c={c}>
                  <Text style={{ color: c.ink, fontSize: 15, fontWeight: '500', fontVariant: ['tabular-nums'] }}>{d.date}</Text>
                  <Text style={[s.meta, { color: c.muted, fontVariant: ['tabular-nums'] }]} numberOfLines={1}>
                    공 {d.pitches} · 영상 {d.clips}
                    {d.pairs > 0 ? ` · 짝 ${d.pairs}` : ''}
                    {d.maxKmh != null ? ` · 최고 ${d.maxKmh.toFixed(1)}` : ''}
                  </Text>
                </Row>
              ))}
            </View>
          )}
          <Text style={[s.meta, { color: c.muted, lineHeight: 19 }]}>카메라 값 다시 재기 · 보정 · 종합 분석은 PC 의 구속 측정 관리자에서 해요.</Text>
        </ScrollView>
      )}
    </View>
  );
}

function Tile({ label, value, unit, c }: { label: string; value: string; unit?: string; c: Palette }) {
  return (
    <View style={{ flex: 1, borderRadius: 14, paddingVertical: 12, alignItems: 'center', backgroundColor: c.card }}>
      <Text style={[s.meta, { color: c.muted }]}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: 20, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] }}>
        {value}
        {unit ? <Text style={{ color: c.muted, fontSize: 12, fontWeight: '400' }}> {unit}</Text> : null}
      </Text>
    </View>
  );
}
