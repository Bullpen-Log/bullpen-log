import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import type { AppHome } from './api';
import { korDate, pitchCard, workoutCard, type ActionKey } from './plan-model';

/**
 * 오늘 플랜 — 승인 시안 '새 구성'의 첫 구역(nl-plans · nl-status): 투구 · 휴식 카드 · 오늘 운동 카드(지금 할 일인 쪽만 옅은 하늘 판) +
 * 컨디션 · 부하 지수 한 줄. 카드 전체가 누르는 자리다.
 * - 운동은 서버가 정한 운동(회복 날은 회복 운동)과 실제 개수 · 분만 — 일정이 없으면 '일정 없음'.
 * - 부하는 팔 상태와 같은 판정의 이름(lib/report/arm-status.ts loadSignalOf). 통증 · 회복 안내가 있으면 숫자보다 '회복 안내 먼저'.
 * - 못 받은 칸(옛 서버 · 받기 실패)은 '—'로 — 기록 없음으로 꾸미지 않는다.
 */
export function TodayPlan({
  home,
  next,
  onPitch,
  onWorkout,
  onCheckin,
  onLoad,
}: {
  home: AppHome;
  next: ActionKey;
  onPitch: () => void;
  onWorkout: () => void;
  onCheckin: () => void;
  onLoad: () => void;
}) {
  const c = usePalette();
  /* 카드 둘이 나란히(320pt 폰까지) — 큰 글씨면 기준 폭이 같이 커져 좁은 폰에서만 위아래로 */
  const basis = 120 * Math.max(1, useWindowDimensions().fontScale);
  const pitch = pitchCard(home);
  const work = workoutCard(home.workout, !!home.trainingLocked);
  const board = home.board;
  const painFirst = !!home.painWords?.length || home.recovering;
  const load = board?.load;
  const loadTone = painFirst ? c.warn : !load ? c.ink : load.level === 'danger' ? c.danger : load.level === 'caution' ? c.warn : c.ink;
  return (
    <View accessibilityLabel="오늘 플랜">
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[styles.headText, { color: c.ink }]}>
          오늘 플랜
        </Text>
        <Text style={[styles.headSmall, { color: c.muted }]}>{home.recovering ? '회복 운동만 표시' : korDate(home.today)}</Text>
      </View>
      <View style={styles.plans}>
        <PlanCard
          c={c}
          basis={basis}
          icon={pitch.done ? 'check' : 'circle-dot'}
          label="투구 · 휴식"
          value={pitch.value}
          unit={pitch.unit}
          meta={pitch.meta}
          next={next === 'pitch' || next === 'pitchSetup'}
          onPress={onPitch}
        />
        <PlanCard
          c={c}
          basis={basis}
          icon={work.done ? 'check' : 'dumbbell'}
          label={home.recovering ? '회복 운동' : '오늘 운동'}
          value={work.value}
          unit={work.unit}
          meta={work.meta}
          next={next === 'workout'}
          onPress={onWorkout}
        />
      </View>
      <View style={[styles.status, { backgroundColor: c.card, boxShadow: c.float }]}>
        <Press
          accessibilityRole="button"
          accessibilityLabel={`컨디션, ${board?.condition ? `${board.condition.value}점 ${board.condition.label}` : home.checkinDone ? '기록함' : '기록 전'}`}
          accessibilityHint="체크인을 열어요"
          onPress={onCheckin}
          style={styles.cell}
        >
          <View style={styles.cellLabel}>
            <Icon name="heart-pulse" size={12} color={c.muted} strokeWidth={2.4} />
            <Text style={[styles.statusLabel, { color: c.muted }]}>컨디션</Text>
          </View>
          <Text style={[styles.cellValue, { color: c.ink }]}>
            {board?.condition ? `${board.condition.value} / 10` : home.checkinDone ? '기록함' : '기록 전'}
            {board?.condition ? <Text style={[styles.cellSmall, { color: c.muted }]}>  {board.condition.label}</Text> : null}
          </Text>
        </Press>
        <View style={[styles.split, { backgroundColor: c.line }]} />
        <Press
          accessibilityRole="button"
          accessibilityLabel={`부하 지수, ${
            painFirst ? '회복 안내 먼저' : load ? `${load.ratio.toFixed(2)} ${load.label}` : board ? '기록 부족' : '불러오지 못했어요'
          }`}
          accessibilityHint="투구 분석을 열어요"
          onPress={onLoad}
          style={styles.cell}
        >
          <View style={styles.cellLabel}>
            <Icon name="activity" size={12} color={c.muted} strokeWidth={2.4} />
            <Text style={[styles.statusLabel, { color: c.muted }]}>부하 지수</Text>
          </View>
          <Text style={[styles.cellValue, { color: loadTone }]}>
            {painFirst ? '회복 안내 먼저' : load ? load.ratio.toFixed(2) : board ? '기록 부족' : '—'}
            <Text style={[styles.cellSmall, { color: c.muted }]}>
              {'  '}
              {painFirst
                ? load
                  ? `지수 ${load.ratio.toFixed(2)}`
                  : ''
                : load
                  ? `${load.label}${load.estimated ? ' · 추정 포함' : ''}`
                  : board
                    ? '최근 4주'
                    : '불러오지 못했어요'}
            </Text>
          </Text>
        </Press>
      </View>
    </View>
  );
}

function PlanCard({
  c,
  basis,
  icon,
  label,
  value,
  unit,
  meta,
  next,
  onPress,
}: {
  c: Palette;
  basis: number;
  icon: IconName;
  label: string;
  value: string;
  unit: string;
  meta: string;
  next: boolean;
  onPress: () => void;
}) {
  return (
    <Press
      card
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}${unit ? ` ${unit}` : ''}, ${meta}${next ? ', 지금 할 일' : ''}`}
      onPress={onPress}
      style={[
        styles.plan,
        { flexBasis: basis },
        next
          ? { backgroundColor: c.skyTint, borderColor: withAlpha(c.link, 0.22), borderWidth: 1 }
          : { backgroundColor: c.card, boxShadow: c.float },
      ]}
    >
      <View style={styles.planTop}>
        <Icon name={icon} size={17} color={c.link} strokeWidth={2.3} />
        <Text style={[styles.planLabel, { color: c.ink }]}>
          {label}
        </Text>
      </View>
      <Text style={[styles.planValue, { color: c.ink }]}>
        {value}
        {unit ? <Text style={[styles.planUnit, { color: c.ink }]}> {unit}</Text> : null}
      </Text>
      <Text lineBreakStrategyIOS="hangul-word" style={[styles.planMeta, { color: c.muted }]}>
        {meta}
      </Text>
      <View style={styles.arrow} pointerEvents="none">
        <Icon name="arrow-up-right" size={16} color={c.link} strokeWidth={2.2} />
      </View>
    </Press>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginHorizontal: 2, marginBottom: 12 },
  headText: { fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  headSmall: { fontSize: 12 },
  plans: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  plan: { flexGrow: 1, minHeight: 132, borderRadius: 19, padding: 14, paddingBottom: 16, alignItems: 'flex-start' },
  planTop: { flexDirection: 'row', alignItems: 'center', gap: 7, alignSelf: 'stretch' },
  planLabel: { fontSize: 15, lineHeight: 21, fontWeight: '600', flexShrink: 1 },
  planValue: { fontSize: 22, lineHeight: 29, fontWeight: '700', letterSpacing: -0.7, marginTop: 11, marginBottom: 5, fontVariant: ['tabular-nums'] },
  planUnit: { fontSize: 15, fontWeight: '400', letterSpacing: 0 },
  planMeta: { fontSize: 13, lineHeight: 20, paddingRight: 18 },
  arrow: { position: 'absolute', right: 13, bottom: 13 },
  status: { flexDirection: 'row', marginTop: 10, borderRadius: 16, overflow: 'hidden' },
  cell: { flex: 1, minHeight: 57, paddingVertical: 10, paddingHorizontal: 13, justifyContent: 'center', gap: 3 },
  cellLabel: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  statusLabel: { fontSize: 13, lineHeight: 19 },
  cellValue: { fontSize: 16, lineHeight: 23, fontWeight: '600' },
  cellSmall: { fontSize: 13, fontWeight: '400' },
  split: { width: StyleSheet.hairlineWidth },
});
