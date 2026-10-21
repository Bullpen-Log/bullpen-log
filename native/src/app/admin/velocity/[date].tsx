import { useLocalSearchParams } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppVelocityDay } from '@/app/actions/app-admin';
import { Bar, LoadState, s, useLoad } from '~/community/parts';
import { UrlVideo } from '~/pitch/video';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { rpc } from '~/lib/rpc';
import { toast } from '~/shell/toast';
import { signed } from '~/velocity/signed';
import { READABLE } from '~/lib/layout';

/**
 * 구속 측정 관리자(앱) — 그날 공(최근부터). 웹 mobile-admin.tsx MobileDay 를 옮겼다: 누르면 영상(일반 · 광각)이 펼쳐진다(그때 받는다 —
 * 휴대폰 데이터 아끼기) · 그 밑에 실제 구속(스피드건) 칸(2026-10-21 김민: "실제값을 넣어 놓는 기능 — 지금 클립 확인만 가능"). 저장은 웹 탐색기와
 * 같은 velocity-admin.adminUpdateVelocityPitch(보정 짝이 된다 · 수기 공은 값도 바뀐다). 스트라이크 존 겹치기 · 다시 재기는 PC 웹.
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
      <Bar back="구속 측정" title={date ?? ''} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : !day ? (
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 24 }}>그날 기록을 찾지 못했어요.</Text>
      ) : (
        <ScrollView
          automaticallyAdjustKeyboardInsets
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding: 16, gap: 8, paddingBottom: inset.bottom + 32 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <Text style={{ color: c.muted, fontSize: 15, paddingHorizontal: 4, marginBottom: 4, fontVariant: ['tabular-nums'] }}>
            공 {day.pitches} · 영상 {day.clips}
            {day.pairs > 0 ? ` · 짝 ${day.pairs}` : ''}
            {day.biasKmh != null ? ` · 편향 ${signed(day.biasKmh)}` : ''}
          </Text>
          {day.rows.map((p) => (
            <PitchRow key={p.id} p={p} open={open === p.id} onToggle={() => setOpen(open === p.id ? null : p.id)} onSaved={() => void reload()} c={c} />
          ))}
        </ScrollView>
      )}
    </View>
  );
}

function PitchRow({ p, open, onToggle, onSaved, c }: { p: Day['rows'][number]; open: boolean; onToggle: () => void; onSaved: () => void; c: Palette }) {
  return (
    <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: c.card, boxShadow: c.float }}>
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
            <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingVertical: 20 }}>이 공에는 영상이 없어요.</Text>
          )}
          {p.wideClipUrl ? (
            <View style={{ gap: 4 }}>
              <Text style={[s.meta, { color: c.muted }]}>광각</Text>
              <UrlVideo uri={p.wideClipUrl} />
            </View>
          ) : null}
          <GunField id={p.id} gun={p.gunKmh} onSaved={onSaved} c={c} />
        </View>
      ) : null}
    </View>
  );
}

/** 실제 구속(스피드건) — 넣고 저장하면 보정 짝이 된다. 비우고 저장하면 지운다. 숫자 검사(범위)는 서버가 한다 */
function GunField({ id, gun, onSaved, c }: { id: string; gun: number | null; onSaved: () => void; c: Palette }) {
  const [text, setText] = useState(gun != null ? String(gun) : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = text.trim().replace(',', '.');
  const value = trimmed === '' ? null : Number(trimmed);
  const valid = value === null || Number.isFinite(value);
  const changed = value !== gun;
  const save = async () => {
    if (!valid || !changed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>('velocity-admin.adminUpdateVelocityPitch', id, { gunKmh: value });
      if (!r.ok) setError(r.error ?? '저장하지 못했어요.');
      else {
        toast(value === null ? '실제 구속을 지웠어요' : '저장했어요');
        onSaved();
      }
    } catch {
      setError('신호가 약해 저장하지 못했어요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 6, paddingTop: 4 }}>
      <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>실제 구속(스피드건)</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minHeight: 44, borderRadius: 12, paddingHorizontal: 12, backgroundColor: c.page }}>
          <TextInput
            value={text}
            onChangeText={(t) => {
              setText(t);
              setError(null);
            }}
            placeholder="예: 128.5"
            placeholderTextColor={c.muted}
            keyboardType="decimal-pad"
            returnKeyType="done"
            onSubmitEditing={() => void save()}
            accessibilityLabel="실제 구속, 킬로미터 매 시"
            style={[TYPE.body, { flex: 1, color: c.ink, fontVariant: ['tabular-nums'], paddingVertical: 10 }]}
          />
          <Text style={[TYPE.body, { color: c.muted }]}>km/h</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: !valid || !changed || busy }}
          disabled={!valid || !changed || busy}
          onPress={() => void save()}
          style={({ pressed }) => [
            { minHeight: 44, minWidth: 64, borderRadius: 22, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sky },
            (!valid || !changed) && { opacity: 0.4 },
            pressed && { opacity: 0.7 },
          ]}
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>저장</Text>}
        </Pressable>
      </View>
      {!valid ? <Text style={[TYPE.sub, { color: c.danger, paddingHorizontal: 4 }]}>숫자로 넣어 주세요.</Text> : null}
      {error ? <Text style={[TYPE.sub, { color: c.danger, paddingHorizontal: 4 }]}>{error}</Text> : null}
    </View>
  );
}
