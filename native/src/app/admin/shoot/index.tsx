import { type Href, router } from 'expo-router';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppShoot } from '@/app/actions/app-shoot';
import { Bar, LoadState, Row, s, useLoad, useTitleCollapse } from '~/community/parts';
import { PageHead } from '~/shell/heading';
import { leaveTo } from '~/shell/web-nav';
import { ShootGauge, StackBar, StatePill } from '~/shoot/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 트레이닝 영상 촬영 — 관리자 첫 화면(앱). 웹 app/(app)/admin/shoot/overview.tsx 의 휴대폰 부분(게이지 · 다음 촬영 · 주차 · 손볼 것)과 같은 자료
 * (app-shoot.loadAppShoot). 촬영 모드(카메라 · 컷 편집)는 영상 엔진이 브라우저라 웹(/admin/shoot/<주>/run)으로 간다.
 */
type Loaded = Awaited<ReturnType<typeof loadAppShoot>>;

export default function ShootHomeScreen() {
  const c = usePalette();
  const { shown, scroll } = useTitleCollapse();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('app-shoot.loadAppShoot');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="관리자" title="영상 촬영" shown={!data || shown} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView {...scroll}
          contentContainerStyle={[{ padding: 16, gap: 12, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <PageHead title="영상 촬영" />
          <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21, paddingHorizontal: 4 }}>{data.description}</Text>

          <View style={{ borderRadius: 14, padding: 16, gap: 16, backgroundColor: c.card, boxShadow: c.float }}>
            <View style={{ alignItems: 'center' }}>
              <ShootGauge done={data.all.done} uploaded={data.uploaded} total={data.all.total} c={c} />
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Legend color={c.link} label="찍음" value={data.all.done} c={c} />
              <Legend color={c.link} faint label="올림" value={data.uploaded} c={c} />
              <Legend color={c.warn} label="다시 · 미룸" value={data.all.redo + data.all.later} c={c} />
              <Legend color={c.line} label="남음" value={data.all.todo} c={c} />
            </View>
            {data.nexts.length > 0 ? (
              data.nexts.map((n) => (
                <View key={n.label} style={{ borderRadius: 14, padding: 14, gap: 8, backgroundColor: c.page }}>
                  <Text style={[s.meta, { color: c.link, fontWeight: '600' }]}>
                    다음 {n.label} 촬영 · {n.weekLabel} {n.done}/{n.total}
                  </Text>
                  <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>
                    <Text style={{ color: c.muted }}>{n.current.no} </Text>
                    {n.current.title}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => leaveTo(`/admin/shoot/${n.week}/run`)}
                      style={[s.pill, { flex: 1, backgroundColor: c.action }]}
                    >
                      <Text style={{ color: '#fff', fontSize: 17, fontWeight: '700' }}>{n.done > 0 ? '이어 찍기' : '촬영 시작'}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => router.push(`/admin/shoot/${n.week}` as Href)}
                      style={[s.pill, { backgroundColor: c.chip }]}
                    >
                      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>{n.weekLabel} 시간표</Text>
                    </Pressable>
                  </View>
                </View>
              ))
            ) : (
              <Text style={{ color: c.link, fontSize: 15, fontWeight: '600', borderRadius: 14, padding: 14, backgroundColor: c.page }}>
                계획한 운동을 모두 찍었어요.{data.toUpload > 0 ? ` 이제 ${data.toUpload}개를 편집해 올릴 차례예요.` : ''}
              </Text>
            )}
          </View>

          <Text style={[s.label, { color: c.ink, fontSize: 15 }]}>주차별</Text>
          {data.weeks.map((w) => (
            <Pressable
              key={w.week}
              accessibilityRole="button"
              onPress={() => router.push(`/admin/shoot/${w.week}` as Href)}
              style={({ pressed }) => [{ borderRadius: 14, padding: 14, gap: 8, backgroundColor: pressed ? c.line : c.card }]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>
                  {w.label}
                  {w.outdoor ? <Text style={[s.meta, { color: c.muted, fontWeight: '600' }]}>  야외</Text> : null}
                </Text>
                <WeekState state={w.state} deferred={w.deferred} c={c} />
              </View>
              <StackBar done={w.count.done} redo={w.count.redo} later={w.count.later} total={w.total} c={c} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <Text style={[s.meta, { color: c.muted }]}>
                  <Text style={{ color: c.ink, fontWeight: '700' }}>{w.count.done}</Text> / {w.total}
                </Text>
                <Text style={[s.meta, { color: c.muted }]}>{w.line}</Text>
              </View>
              {w.current && w.count.done > 0 ? (
                <Text style={[s.meta, { color: c.ink }]} numberOfLines={1}>
                  지금 {w.current.no} {w.current.title}
                </Text>
              ) : null}
            </Pressable>
          ))}

          {data.attention.length > 0 ? (
            <>
              <Text style={[s.label, { color: c.ink, fontSize: 15 }]}>다시 찍기 · 미룬 것 {data.attentionTotal ?? data.attention.length}개</Text>
              <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                {data.attention.map((a, i) => (
                  <Row
                    key={a.exerciseId}
                    onPress={() => router.push(`/admin/shoot/${a.week}?at=${encodeURIComponent(a.no)}` as Href)}
                    last={i === data.attention.length - 1}
                    c={c}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={[s.meta, { color: c.muted, width: 40 }]}>{a.no}</Text>
                      <Text style={{ flex: 1, color: c.ink, fontSize: 15 }} numberOfLines={1}>
                        {a.title}
                        {a.note ? <Text style={[s.meta, { color: c.muted }]}> · {a.note}</Text> : null}
                      </Text>
                      <StatePill state={a.status} c={c} />
                    </View>
                  </Row>
                ))}
              </View>
            </>
          ) : null}
          <Text style={[s.meta, { color: c.muted, textAlign: 'center', marginTop: 8 }]}>자리 · 부위별 진행과 촬영한 날은 PC 화면에서 볼 수 있어요.</Text>
        </ScrollView>
      )}
    </View>
  );
}

function Legend({ color, faint, label, value, c }: { color: string; faint?: boolean; label: string; value: number; c: Palette }) {
  return (
    <View style={{ alignItems: 'flex-start', gap: 2 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color, opacity: faint ? 0.45 : 1 }} />
        <Text style={[s.meta, { color: c.muted }]}>{label}</Text>
      </View>
      <Text style={{ color: c.ink, fontSize: 22, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{value}</Text>
    </View>
  );
}

function WeekState({ state, deferred, c }: { state: string; deferred: boolean; c: Palette }) {
  const strong = state === '완료';
  const soft = state === '진행 중' || deferred;
  return (
    <View style={{ borderRadius: 10, paddingHorizontal: 10, paddingVertical: 2, backgroundColor: strong ? c.sky : soft ? c.chip : c.page }}>
      <Text style={{ color: strong ? '#fff' : soft ? c.link : c.muted, fontSize: 13, fontWeight: '600' }}>{state}</Text>
    </View>
  );
}
