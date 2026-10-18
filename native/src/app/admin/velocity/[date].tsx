import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppVelocityDay } from '@/app/actions/app-admin';
import { Bar, LoadState, s, useLoad } from '~/community/parts';
import { UrlVideo } from '~/pitch/video';
import { usePalette, type Palette } from '~/lib/ui';
import { signed } from '~/velocity/signed';

/**
 * 구속 측정 관리자(앱) — 그날 공(최근부터). 웹 mobile-admin.tsx MobileDay 를 옮겼다: 누르면 영상(일반 · 광각)이 펼쳐진다(그때 받는다 —
 * 휴대폰 데이터 아끼기). 스트라이크 존 겹치기 · 다시 재기는 PC 웹.
 */
type Loaded = Awaited<ReturnType<typeof loadAppVelocityDay>>;
type Day = NonNullable<Extract<Loaded, { ok: true }>['day']>;

export default function VelocityDayScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppVelocityDay', date ?? '');
  const [open, setOpen] = useState<string | null>(null);
  const day = data?.day;
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="구속 측정 관리자" title={date ?? ''} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : !day ? (
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 24 }}>그날 기록을 찾지 못했어요.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: inset.bottom + 32 }}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <Text style={{ color: c.muted, fontSize: 15, paddingHorizontal: 4, marginBottom: 4, fontVariant: ['tabular-nums'] }}>
            공 {day.pitches} · 영상 {day.clips}
            {day.pairs > 0 ? ` · 짝 ${day.pairs}` : ''}
            {day.biasKmh != null ? ` · 편향 ${signed(day.biasKmh)}` : ''}
          </Text>
          {day.rows.map((p) => (
            <PitchRow key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} c={c} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function PitchRow({ p, open, onToggle, c }: { p: Day['rows'][number]; open: boolean; onToggle: () => void; c: Palette }) {
  return (
    <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: c.card }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={onToggle} style={({ pressed }) => [{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, opacity: pressed ? 0.6 : 1 }]}>
        <View style={{ width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: p.clipUrl ? c.chip : c.page }}>
          <SymbolView name={p.clipUrl ? 'play.fill' : 'film'} size={15} tintColor={p.clipUrl ? c.sky : c.muted} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>
            {p.manual ? `건 ${(p.gunKmh ?? p.kmh).toFixed(1)} km/h` : `${p.kmh.toFixed(1)} km/h`}
            {!p.manual && p.gunKmh != null ? <Text style={{ color: c.muted, fontWeight: '400' }}> · 건 {p.gunKmh.toFixed(1)}</Text> : null}
            {p.diff != null ? <Text style={{ color: Math.abs(p.diff) > 5 ? c.danger : c.ok, fontSize: 13 }}>  {signed(p.diff)}</Text> : null}
          </Text>
          <Text style={[s.meta, { color: c.muted }]} numberOfLines={1}>
            {p.who}
            {p.pitchType ? ` · ${p.pitchType}` : ''}
            {p.manual ? ' · 수기' : ''} · {p.source}
            {p.wideClipUrl ? ' · 광각' : ''}
          </Text>
        </View>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={13} tintColor={c.muted} />
      </Pressable>
      {open ? (
        <View style={{ paddingHorizontal: 10, paddingBottom: 10, gap: 8 }}>
          {p.clipUrl ? (
            <UrlVideo uri={p.clipUrl} />
          ) : (
            <Text style={{ color: c.muted, fontSize: 14, textAlign: 'center', paddingVertical: 20 }}>이 공에는 영상이 없어요.</Text>
          )}
          {p.wideClipUrl ? (
            <View style={{ gap: 4 }}>
              <Text style={[s.meta, { color: c.muted }]}>광각</Text>
              <UrlVideo uri={p.wideClipUrl} />
            </View>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
