import { useMemo, useState } from 'react';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { findArmcareArea } from '@/lib/armcare/anatomy';
import { AREA_DETAILS } from '@/lib/armcare/details';
import type { AppArmcareGuideTab } from '@/lib/armcare/today-load';
import type { ArmcareExerciseView } from '@/app/(app)/training/armcare-media';
import { usePalette, type Palette } from '~/lib/ui';
import { Thumb } from '~/lib/thumb';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { Fold, Screen, s, useScreenData } from '~/training/screen';
import { FavButton } from '~/training/fav-button';
import { useFavs } from '~/training/favorites';
import { GuideAuxiliary, GuidePain } from '~/armcare/guide';
import { filterGuide, inArea, isPrimary } from '~/armcare/guide-model';
import { AreaArt } from '~/armcare/area-art';
import { AddToRoutine, MyRoutinesProvider, RoutineOperationNotice } from '~/armcare/add-to-routine';

export default function ArmcareAreaScreen() {
  const params = useLocalSearchParams<{ area?: string }>();
  const area = findArmcareArea(params.area);
  const all = params.area === 'all';
  const favorites = params.area === 'favorites';
  const valid = !!area || all || favorites;
  const c = usePalette();
  const state = useScreenData<AppArmcareGuideTab>('app-training-parts.loadAppArmcare', 'guide', 'training-armcare:guide');
  const [q, setQ] = useState('');
  const [gear, setGear] = useState<string | null>(null);
  const [limit, setLimit] = useState(20);
  const [recent, setRecent] = useState<string | null>(null);
  const favs = useFavs();
  const data = state.data;
  const scoped = useMemo(() => inArea(data?.exercises ?? [], area?.key ?? null), [data?.exercises, area?.key]);
  const list = favorites ? scoped.filter((e) => favs.fav('exercise', e.id, data?.favoriteIds?.includes(e.id) ?? false)) : scoped;
  const filtered = filterGuide(list, q, gear);
  const ordered = area ? [...filtered.filter((e) => isPrimary(e, area.key)), ...filtered.filter((e) => !isPrimary(e, area.key))] : filtered;
  const gears = [...new Set(list.flatMap((e) => e.equipment.map((g) => g.trim()).filter(Boolean)))];
  const details = area ? AREA_DETAILS[area.key] : null;
  return <Screen showHeading={false} backLabel="부위 선택" title="부위별 보강" state={state} right={!favorites ? <FavButton c={c} onPress={() => router.push('/training/armcare-area?area=favorites' as Href)} /> : undefined}>
    {!valid ? <View style={[s.card, { backgroundColor: c.card }]}><Text style={[s.body, { color: c.ink }]}>부위를 찾을 수 없어요.</Text><Press onPress={() => router.back()} style={{ minHeight: 44 }}><Text style={{ color: c.link }}>부위 선택으로 돌아가기</Text></Press></View> : data ? <MyRoutinesProvider routines={data.routines ?? null}><View style={{ gap: 16 }}>
      <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
        {area ? <AreaArt area={area.key} size={88} /> : null}
        <View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: c.ink }}>{area ? area.label : favorites ? '즐겨찾기' : '전체 암케어 운동'}</Text><Text style={[s.small, { color: c.muted }]}>{favorites && !data.auxiliary?.favorites ? '즐겨찾기 확인 필요' : `운동 ${list.length}개`}</Text></View>
      </View>
      {area ? <View style={[s.card, { backgroundColor: c.card }]}><Fold label="부위 설명" c={c}>
        {details ? <><Text style={[s.bodyBold, { color: c.ink }]}>던질 때 하는 일</Text><Text style={[s.body, { color: c.ink }]}>{details.role}</Text><Text style={[s.bodyBold, { color: c.ink }]}>왜 챙겨야 하나요</Text><Text style={[s.body, { color: c.ink }]}>{details.why}</Text></> : null}
        <Text style={[s.bodyBold, { color: c.ink }]}>흔한 부상</Text>{area.injuries.map((i) => <View key={i.name}><Text style={[s.smallBold, { color: c.ink }]}>{i.name}</Text><Text style={[s.small, { color: c.muted }]}>{i.desc}</Text></View>)}
        {area.notes.map((note) => <Text key={note} style={[s.small, { color: c.muted }]}>{note}</Text>)}
        {details ? <><Text style={[s.bodyBold, { color: c.ink }]}>불편함이 있으면 확인하세요</Text>{details.signs.map((sign) => <Text key={sign} style={[s.small, { color: c.muted }]}>{sign}</Text>)}<Text style={[s.body, { color: c.ink }]}>{details.train}</Text></> : null}
      </Fold></View> : null}
      {(!area || data.coverage.pain?.spots.some((p) => p.key === area.key)) ? <GuidePain data={data} c={c} onArea={(key) => router.push(`/training/armcare-area?area=${key}` as Href)} /> : null}
      <GuideAuxiliary data={data} reload={state.load} c={c}/>
      <View style={{ flexDirection: 'row', alignItems: 'center', borderRadius: 18, backgroundColor: c.card, paddingHorizontal: 12 }}>
        <Icon name="search" size={18} color={c.muted}/><TextInput accessibilityLabel="운동·장비 검색" placeholder="운동 검색" placeholderTextColor={c.muted} value={q} onChangeText={(v) => { setQ(v); setLimit(20); }} style={{ flex: 1, minHeight: 50, padding: 12, fontSize: 16, color: c.ink }} />
        {q ? <Press onPress={() => { setQ(''); setLimit(20); }} accessibilityLabel="검색어 지우기" accessibilityRole="button" style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Icon name="x" size={18} color={c.muted}/></Press> : null}
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {[null, ...gears].map((g) => <Press key={g ?? 'all'} accessibilityRole="button" accessibilityState={{ selected: gear === g }} onPress={() => { setGear(g); setLimit(20); }} style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, justifyContent: 'center', backgroundColor: gear === g ? c.action : c.card }}><Text style={[s.smallBold, { color: gear === g ? '#fff' : c.ink }]}>{g ?? '모든 장비'}</Text></Press>)}
      </ScrollView>
      <RoutineOperationNotice c={c}/>
      {q || gear ? <Text style={[s.small, { color: c.muted }]}>검색 결과 {filtered.length}개 · 전체 {list.length}개</Text> : null}
      {favorites && !data.auxiliary?.favorites ? <Text style={[s.body, { color: c.muted }]}>즐겨찾기를 불러온 뒤 목록을 확인할 수 있어요.</Text> : !ordered.length ? <View style={[s.card, { backgroundColor: c.card }]}><Text style={[s.bodyBold, { color: c.ink }]}>{q || gear ? '조건에 맞는 운동이 없어요.' : favorites ? '즐겨찾기한 운동이 없어요.' : '등록된 운동이 없어요.'}</Text>{favorites ? <Text style={[s.small, { color: c.muted }]}>운동 상세에서 별을 눌러 담을 수 있어요.</Text> : null}</View> : ordered.slice(0, limit).map((ex, i) => {
        const group = area ? (isPrimary(ex, area.key) ? '주 부위 운동' : '함께 쓰는 운동') : null;
        const prev = i > 0 && area ? (isPrimary(ordered[i-1], area.key) ? '주 부위 운동' : '함께 쓰는 운동') : null;
        return <View key={ex.id} style={{ gap: 12 }}>{group && group !== prev ? <Text style={[s.bodyBold, { color: c.ink }]}>{group}</Text> : null}<GuideExerciseRow ex={ex} recent={recent === ex.id} c={c} onOpen={() => { setRecent(ex.id); router.push(`/library/exercise/${ex.id}` as Href); }}/></View>;
      })}
      {ordered.length > limit ? <Press accessibilityRole="button" onPress={() => setLimit((n) => n + 20)} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Text style={[s.bodyBold, { color: c.link }]}>운동 더 보기 ({Math.min(limit, ordered.length)}/{ordered.length})</Text></Press> : null}
    </View></MyRoutinesProvider> : null}
  </Screen>;
}
function GuideExerciseRow({ ex, recent, c, onOpen }: { ex: ArmcareExerciseView; recent: boolean; c: Palette; onOpen: () => void }) {
  return <View style={{ borderRadius: 22, backgroundColor: c.card, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
    <Press accessibilityRole="button" accessibilityLabel={`${ex.title}, 운동 상세${recent ? ', 최근 본 운동' : ''}`} onPress={onOpen} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 72 }}>
      <View style={{ width: 48, height: 56, borderRadius: 14, backgroundColor: c.chip, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}><Icon name="armcare" size={24} color={c.muted}/>{ex.thumbUrl ? <Thumb uri={ex.thumbUrl} style={{ position: 'absolute', width: 48, height: 56 }} /> : null}</View>
      <View style={{ flex: 1, gap: 4 }}><Text style={[s.bodyBold, { color: c.ink }]}>{ex.title}</Text>{ex.prescription ? <Text style={[s.small, { color: c.muted }]}>{ex.prescription}</Text> : null}<Text style={[s.small, { color: c.muted }]}>{ex.equipment.length ? ex.equipment.join(' · ') : '장비 미등록'}</Text>{recent ? <Text style={[s.tiny, { color: c.link }]}>최근 본 운동</Text> : null}</View>
    </Press>
    <AddToRoutine exerciseId={ex.id} title={ex.title} defaultSets={ex.defaultSets} c={c}/>
  </View>;
}
