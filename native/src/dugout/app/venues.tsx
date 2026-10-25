import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KakaoMapView, type KakaoMarker } from '../../../modules/kakao-map';
import { SITE_URL } from '~/lib/site';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { leaveTo } from '~/shell/web-nav';
import { DUGOUT_GREEN } from '~/dugout/mark';
import { DUGOUT_UA } from '~/dugout/site';

/**
 * 연습장 · 레슨장 지도 — 덕아웃 앱의 첫 앱 화면(2026-10-25 금윤호: "웹뷰가 아니라 네이티브 앱으로"). 웹 /venues 와 같은 자료(/api/places).
 * 위는 카카오맵(modules/kakao-map), 밑은 목록. 점이나 줄을 누르면 고른 곳 카드 → 자세히 · 예약은 웹 화면으로(leaveTo).
 * 카카오맵 바닥 판이 없는 옛 앱은 껍데기(index.tsx)가 이 화면으로 안 보낸다(hasKakaoMap).
 */
type Place = {
  id: string;
  type: 'venue' | 'lesson';
  name: string;
  kindLabel: string;
  region: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  sub: string;
  image: string | null;
  href: string;
  bookHref: string;
  rating: number | null;
  reviews: number;
};
type Kind = { key: string; label: string };

async function fetchPlaces(kind?: string, q?: string): Promise<{ places: Place[]; kinds: Kind[] }> {
  const s = new URLSearchParams();
  if (kind) s.set('kind', kind);
  if (q) s.set('q', q);
  const res = await fetch(`${SITE_URL}/api/places${s.size ? `?${s}` : ''}`, { headers: { 'User-Agent': DUGOUT_UA } });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as { places: Place[]; kinds: Kind[] };
}

export default function VenuesScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ kind?: string; q?: string }>();
  const [kind, setKind] = useState<string | undefined>(params.kind || undefined);
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [kinds, setKinds] = useState<Kind[]>([]);
  const [failed, setFailed] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const list = useRef<FlatList<Place>>(null);

  /* 다시 불러오기 단추가 올린다 */
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchPlaces(kind, params.q).then(
      (body) => {
        if (!alive) return;
        setPlaces(body.places);
        setKinds(body.kinds);
        setFailed(false);
      },
      () => alive && setFailed(true)
    );
    return () => {
      alive = false;
    };
  }, [kind, params.q, tick]);

  const markers = useMemo<KakaoMarker[]>(
    () => (places ?? []).flatMap((p) => (p.lat != null && p.lng != null ? [{ id: p.id, lat: p.lat, lng: p.lng }] : [])),
    [places]
  );
  const picked = places?.find((p) => p.id === selected) ?? null;

  const choose = (id: string) => {
    setSelected(id);
    const i = places?.findIndex((p) => p.id === id) ?? -1;
    if (i >= 0) list.current?.scrollToIndex({ index: i, viewPosition: 0, animated: true });
  };

  const chips = [{ key: '', label: '전체' }, ...kinds];

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {/* 머리 — 뒤로 · 제목 */}
      <View style={[st.head, { paddingTop: inset.top + 6 }]}>
        <Press accessibilityRole="button" accessibilityLabel="뒤로" onPress={() => router.back()} style={st.back}>
          <Icon name="back" size={22} color={c.ink} />
        </Press>
        <Text style={[TYPE.section, { color: c.ink }]}>연습장 · 레슨장</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.chips} style={{ flexGrow: 0 }}>
        {chips.map((k) => {
          const on = (kind ?? '') === k.key;
          return (
            <Press
              key={k.key || 'all'}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => {
                setSelected(null);
                setKind(k.key || undefined);
              }}
              style={[st.chip, on ? { backgroundColor: c.ink } : { borderColor: c.line, borderWidth: 1 }]}
            >
              <Text style={{ color: on ? c.page : c.ink, fontSize: 14, fontWeight: on ? '700' : '500' }}>{k.label}</Text>
            </Press>
          );
        })}
      </ScrollView>

      {/* 지도 */}
      <View style={[st.map, { backgroundColor: c.card, borderColor: c.line }]}>
        {mapError ? (
          <View style={st.center}>
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>지도를 불러오지 못했어요</Text>
            <Text style={{ color: c.muted, fontSize: 13 }}>목록에서 골라 주세요.</Text>
          </View>
        ) : (
          <KakaoMapView
            style={StyleSheet.absoluteFill}
            markers={markers}
            selectedId={selected}
            onMarkerPress={(e) => choose(e.nativeEvent.id)}
            onError={(e) => setMapError(e.nativeEvent.message)}
          />
        )}
      </View>

      {/* 고른 곳 */}
      {picked ? (
        <View style={[st.picked, { backgroundColor: c.card, borderColor: c.line }]}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} style={[TYPE.card, { color: c.ink }]}>{picked.name}</Text>
            <Text numberOfLines={1} style={[TYPE.sub, { color: c.muted }]}>
              {[picked.kindLabel, picked.address ?? picked.region].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <Press accessibilityRole="button" onPress={() => leaveTo(picked.href)} style={[st.ghost, { borderColor: c.line }]}>
            <Text style={{ color: c.ink, fontSize: 14, fontWeight: '600' }}>자세히</Text>
          </Press>
          <Press accessibilityRole="button" onPress={() => leaveTo(picked.bookHref)} style={st.book}>
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>예약</Text>
          </Press>
        </View>
      ) : null}

      {/* 목록 */}
      {places == null ? (
        <View style={st.center}>
          {failed ? (
            <>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>목록을 불러오지 못했어요</Text>
              <Press accessibilityRole="button" onPress={() => {
                  setFailed(false);
                  setTick((n) => n + 1);
                }} style={st.book}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>다시 불러오기</Text>
              </Press>
            </>
          ) : (
            <ActivityIndicator color={c.muted} />
          )}
        </View>
      ) : (
        <FlatList
          ref={list}
          data={places}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: inset.bottom + 24 }}
          onScrollToIndexFailed={() => {}}
          ListEmptyComponent={
            <Text style={{ color: c.muted, fontSize: 14, textAlign: 'center', paddingVertical: 32 }}>조건에 맞는 곳이 없어요.</Text>
          }
          ItemSeparatorComponent={() => <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.line }} />}
          renderItem={({ item: p }) => {
            const on = p.id === selected;
            return (
              <Press accessibilityRole="button" onPress={() => choose(p.id)} style={[st.row, on && { backgroundColor: c.card }]}>
                {p.image ? (
                  <Image source={{ uri: p.image }} style={st.thumb} />
                ) : (
                  <View style={[st.thumb, { backgroundColor: c.line, alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{p.name.slice(0, 1)}</Text>
                  </View>
                )}
                <View style={{ flex: 1, gap: 2 }}>
                  <Text numberOfLines={1} style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{p.name}</Text>
                  <Text numberOfLines={1} style={{ color: c.muted, fontSize: 13 }}>
                    {[p.kindLabel, p.address ?? p.region].filter(Boolean).join(' · ')}
                  </Text>
                  <Text numberOfLines={1} style={{ color: c.ink, fontSize: 13 }}>
                    {p.rating != null ? `★ ${p.rating.toFixed(1)}  ` : ''}
                    {p.sub}
                  </Text>
                </View>
                {p.lat == null ? <Text style={{ color: c.muted, fontSize: 12 }}>지도 없음</Text> : null}
              </Press>
            );
          }}
        />
      )}
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingBottom: 6 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 8 },
  chip: { height: 36, paddingHorizontal: 14, borderRadius: 18, justifyContent: 'center' },
  map: { height: 300, marginHorizontal: 16, marginTop: 4, borderRadius: 20, overflow: 'hidden', borderWidth: StyleSheet.hairlineWidth },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  picked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    padding: 12,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
  },
  ghost: { height: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1, justifyContent: 'center' },
  book: { height: 40, paddingHorizontal: 16, borderRadius: 20, backgroundColor: DUGOUT_GREEN, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 4, borderRadius: 12 },
  thumb: { width: 52, height: 52, borderRadius: 12 },
});
