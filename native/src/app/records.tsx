import { type Href, router } from 'expo-router';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toDateKey } from '@/lib/pitch-stats';
import { round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { usePalette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { leaveTo } from '~/shell/web-nav';
import { homeSnapshot } from '~/home/tab';
import { SheetHead } from '~/home/sheet-head';

/**
 * 전체 기록(시트) — 승인 시안 records: 투구량 · 구속 · 컨디션 · 부하 · 운동 · 영양 여섯 영역으로 가는 길. 값은 홈이 마지막으로 받은 것(없으면 '—').
 * 가는 곳: 투구량 · 구속 · 부하 → 투구 분석, 운동 → 트레이닝 분석, 컨디션 → 기록 달력의 오늘(체크인 자세히), 영양 → 영양 탭.
 */
export default function RecordsSheet() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const speed = usePrefs().speed;
  const h = homeSnapshot();
  const b = h?.board;
  const today = h?.today ?? toDateKey(new Date());
  const go = (to: string) => {
    router.back();
    router.push(to as Href);
  };
  const nutrition = h?.feed.find((f) => f.key === 'nutrition');
  const rows: [IconName, string, string, () => void][] = [
    ['circle-dot', '투구량', b?.lastPitch ? (b.lastPitch.rested ? '휴식' : `${b.lastPitch.pitches}구`) : b ? '기록 없음' : '—', () => go('/analysis?view=pitch')],
    ['gauge', '구속', b?.bestVelocity ? `${round1(toSpeed(b.bestVelocity.kmh, speed))} ${speedLabel(speed)}` : b ? '기록 없음' : '—', () => go('/analysis?view=pitch')],
    ['heart-pulse', '컨디션', b?.condition ? `${b.condition.value} / 10` : h ? '기록 전' : '—', () => go(`/calendar?date=${today}`)],
    ['activity', '부하 지수', b?.load ? b.load.ratio.toFixed(2) : b ? '기록 부족' : '—', () => go('/analysis?view=pitch')],
    ['dumbbell', '운동', h?.workout ? `${h.workout.done} / ${h.workout.total}` : h ? '일정 없음' : '—', () => go('/analysis?view=training')],
    ['utensils', '영양', nutrition ? (nutrition.tone === 'none' ? '기록 없음' : nutrition.tone === 'today' ? '오늘 기록 있음' : '지난 기록') : '—', () => leaveTo('/nutrition')],
  ];
  return (
    <ScrollView style={{ backgroundColor: c.card }} contentContainerStyle={{ padding: 20, paddingBottom: inset.bottom + 24 }}>
      <SheetHead c={c} title="전체 기록" />
      <View style={{ marginTop: 6 }}>
        {rows.map(([icon, label, value, onPress]) => (
          <Press key={label} accessibilityRole="button" accessibilityLabel={`${label}, ${value}`} onPress={onPress} style={[styles.row, { borderBottomColor: c.line }]}>
            <View style={styles.left}>
              <Icon name={icon} size={17} color={c.link} strokeWidth={2.3} />
              <Text style={[styles.label, { color: c.ink }]}>{label}</Text>
            </View>
            <View style={styles.right}>
              <Text numberOfLines={1} style={[styles.value, { color: c.muted }]}>
                {value}
              </Text>
              <Icon name="chevron-right" size={15} color={c.muted} strokeWidth={2.4} />
            </View>
          </Press>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { minHeight: 52, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  left: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  label: { fontSize: 15 },
  right: { flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 1 },
  value: { fontSize: 13, flexShrink: 1 },
});
