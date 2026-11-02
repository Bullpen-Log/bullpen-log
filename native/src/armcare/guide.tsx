import { useState } from 'react';
import { Text, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { router, type Href } from 'expo-router';
import { ARMCARE_AREAS, areaOfMuscle, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { ARMCARE_PURPOSE_TEXT } from '@/lib/pitching-content';
import type { AppArmcareGuideTab } from '@/lib/armcare/today-load';
import type { Palette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';
import { Sheet } from '~/workout/sheets';
import { Fold, s } from '~/training/screen';
import { PainNote } from '~/training/armcare-parts';
import { PainGuideButton } from './pain-guide-sheet';
import { Muscle3D } from './muscle-info';
import { AREA_SHORT, inArea, uniqueExercises } from './guide-model';
import { MyRoutinesProvider, RoutineOperationNotice } from './add-to-routine';

/** Small location diagram, never a health score. */
export function AreaGlyph({ area, c }: { area: ArmcareAreaKey; c: Palette }) {
  const elbow = area.startsWith('elbow');
  const dots: Record<ArmcareAreaKey, [number, number]> = { 'shoulder-back': [19, 25], 'shoulder-front': [23, 30], 'shoulder-top': [20, 23], scapula: [27, 32], 'elbow-inner': [30, 39], 'elbow-outer': [21, 40], 'elbow-back': [25, 46], 'elbow-front': [24, 32] };
  const [x,y] = dots[area];
  return <Svg width={52} height={60} viewBox="0 0 60 64" accessible={false}>
    {elbow ? <Path d="M22 15 Q18 10 15 16 L22 44 Q24 51 31 48 L45 44" stroke={c.lineStrong} strokeWidth={16} strokeLinecap="round" strokeLinejoin="round" fill="none" /> : <><Circle cx={30} cy={12} r={7} fill={c.lineStrong} /><Path d="M19 23 Q30 18 41 23 L45 48 Q43 57 30 57 Q17 57 15 48 Z" fill={c.lineStrong}/><Path d="M14 28 L10 44 M46 28 L50 44" stroke={c.lineStrong} strokeWidth={9} strokeLinecap="round" /></>}
    <Circle cx={x} cy={y} r={7} fill={c.action} />
    <Circle cx={x-2} cy={y-2} r={2} fill="#fff" opacity={0.5} />
  </Svg>;
}
export function GuidePain({ data, c, onArea }: { data: AppArmcareGuideTab; c: Palette; onArea: (key: ArmcareAreaKey) => void }) {
  const pain = data.coverage.pain;
  return pain ? <View style={{ gap: 6 }}><PainNote pain={pain} onArea={onArea} c={c} /><PainGuideButton pain={{ spots: pain.spots.map((p) => p.key), level: pain.level, age: null }} tone="warn" c={c} /></View> : null;
}
export function GuideAuxiliary({ data, reload, c }: { data: AppArmcareGuideTab; reload: () => unknown; c: Palette }) {
  const a = data.auxiliary;
  const missing = !a ? ['부가 정보'] : [!a.pain && '통증 기록', !a.favorites && '즐겨찾기', !a.routines && '내 루틴', !a.history && '수행 기록', !a.media && '미리보기'].filter(Boolean);
  if (!missing.length) return null;
  return <View style={[s.card, { backgroundColor: c.chip }]}><Text style={[s.small, { color: c.muted }]}>{missing.join(' · ')} 확인이 필요해요.</Text><Press accessibilityRole="button" onPress={() => { reload(); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[s.smallBold, { color: c.link }]}>다시 확인</Text></Press></View>;
}
export function GuideTab({ data, reload, c }: { data: AppArmcareGuideTab; reload: () => unknown; c: Palette }) {
  const [recent, setRecent] = useState<ArmcareAreaKey | null>(null);
  const [map, setMap] = useState(false);
  const show = (area: ArmcareAreaKey | 'all') => {
    if (area !== 'all') setRecent(area);
    router.push(`/training/armcare-area?area=${area}` as Href);
  };
  const list = uniqueExercises(data.exercises);
  return <MyRoutinesProvider routines={data.routines ?? null}><View style={{ gap: 20 }}>
    <GuidePain data={data} c={c} onArea={show} />
    <GuideAuxiliary data={data} c={c} reload={reload} />
    <View style={s.between}><Text style={[s.section, { color: c.ink }]}>부위 선택</Text><Press onPress={() => setMap(true)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={[s.smallBold, { color: c.link }]}>3D 지도 ↗</Text></Press></View>
    {(['어깨','팔꿈치'] as const).map((joint) => <View key={joint} style={{ gap: 10 }}>
      <Text style={[s.smallBold, { color: c.muted, paddingLeft: 4 }]}>{joint}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {ARMCARE_AREAS.filter((a) => a.joint === joint).map((a) => {
          const n = inArea(list, a.key).length;
          return <Press key={a.key} onPress={() => show(a.key)} accessibilityRole="button" accessibilityLabel={`${a.label}, 운동 ${n}개${recent === a.key ? ', 최근 본 부위' : ''}`} style={{ width: '47%', flexGrow: 1, minHeight: 112, padding: 14, borderRadius: 24, backgroundColor: c.card, boxShadow: c.float, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <AreaGlyph area={a.key} c={c} /><View style={{ flex: 1, gap: 5 }}><Text style={[s.bodyBold, { color: c.ink }]}>{AREA_SHORT[a.key]}</Text><Text style={[s.small, { color: c.muted }]}>운동 {n}개</Text>{recent === a.key ? <Text style={[s.tiny, { color: c.link }]}>최근 본 부위</Text> : null}</View>
          </Press>;
        })}
      </View>
    </View>)}
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Press onPress={() => show('all')} accessibilityRole="button" style={{ minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Icon name="layers" size={20} color={c.link}/><Text style={[s.bodyBold, { color: c.link, flex: 1 }]}>전체 암케어 운동</Text><Text style={[s.small, { color: c.muted }]}>{list.length}개 ›</Text></Press>
      {data.untagged > 0 ? <Text style={[s.small, { color: c.muted }]}>부위 미분류 운동 {data.untagged}개 포함</Text> : null}
      <Fold label="수행 기록" c={c}>
        <Text style={[s.small, { color: c.muted }]}>{ARMCARE_PURPOSE_TEXT.record}</Text>
        {!data.auxiliary?.history ? <Text style={[s.small, { color: c.muted }]}>수행 기록을 확인하지 못했어요.</Text> : !data.history?.length ? <Text style={[s.small, { color: c.muted }]}>남긴 수행 기록이 없어요.</Text> : data.history.map((h,i) => <View key={`${h.on}:${i}`} style={{ paddingVertical: 8 }}><Text style={[s.bodyBold, { color: c.ink }]}>{h.title}</Text><Text style={[s.small, { color: c.muted }]}>{h.on} · {h.amount}</Text></View>)}
      </Fold>
    </View>
    <RoutineOperationNotice c={c} />
    <Text style={[s.tiny, { color: c.muted }]}>운동이 부상을 막아 준다는 보장은 없어요. 아프면 쉬고 진료를 받으세요.</Text>
    {map ? <Sheet open fit title="3D 근육 지도" onClose={() => setMap(false)} c={c}><Muscle3D c={c} onPick={(muscle) => { const area = areaOfMuscle(muscle); if (area) { setMap(false); show(area.key); } }} /></Sheet> : null}
  </View></MyRoutinesProvider>;
}

export function GuideSkeleton({ c }: { c: Palette }) {
  return <View accessibilityLabel="부위별 운동을 불러오는 중" style={{ gap: 16 }}><Text style={[s.small, { color: c.muted }]}>운동을 불러오는 중…</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>{ARMCARE_AREAS.map((a) => <View key={a.key} style={{ width: '47%', flexGrow: 1, minHeight: 112, padding: 18, borderRadius: 24, backgroundColor: c.card, justifyContent: 'center', gap: 12 }}><View style={{ height: 16, width: '55%', borderRadius: 8, backgroundColor: c.chip }}/><View style={{ height: 12, width: '35%', borderRadius: 6, backgroundColor: c.chip }}/></View>)}</View></View>;
}
