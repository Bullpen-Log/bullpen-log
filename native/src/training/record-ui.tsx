import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { type Href, router } from 'expo-router';
import Animated, {
  FadeIn,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';
import { formatAmount, formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import type { RecordExercise } from '@/lib/workout/record-model';
import type { Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

export function RecordNotice({
  children,
  retry,
  c,
}: {
  children: ReactNode;
  retry?: () => void;
  c: Palette;
}) {
  return (
    <View
      accessibilityRole="alert"
      style={[rs.notice, { backgroundColor: c.danger + '12' }]}
    >
      <Text style={[rs.small, { color: c.danger }]}>{children}</Text>
      {retry ? <RecordLink label="다시 불러오기" onPress={retry} c={c} /> : null}
    </View>
  );
}
export function RecordLink({
  label,
  onPress,
  c,
  icon,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  c: Palette;
  icon?: IconName;
  disabled?: boolean;
}) {
  return (
    <Press
      disabled={disabled}
      accessibilityRole="button"
      onPress={onPress}
      style={[rs.link, disabled && { opacity: 0.45 }]}
    >
      {icon ? <Icon name={icon} size={16} color={c.link} /> : null}
      <Text style={[rs.small, { color: c.link, fontWeight: '600' }]}>{label}</Text>
    </Press>
  );
}
export function RecordButton({
  label,
  onPress,
  c,
  disabled = false,
}: {
  label: string;
  onPress: () => void;
  c: Palette;
  disabled?: boolean;
}) {
  return (
    <Press
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[rs.button, { backgroundColor: disabled ? c.chip : c.action }]}
    >
      <Text
        style={[rs.body, { color: disabled ? c.muted : c.onAction, fontWeight: '700' }]}
      >
        {label}
      </Text>
    </Press>
  );
}
export function ExerciseRecordCard({
  exercise: e,
  index,
  open,
  onOpen,
  onHistory,
  c,
  unit,
}: {
  exercise: RecordExercise;
  index: number;
  open: boolean;
  onOpen: () => void;
  onHistory: () => void;
  c: Palette;
  unit: WeightUnit;
}) {
  const reduced = useReducedMotion();
  const max = e.sets?.reduce<number | null>(
    (m, s) => (s.weightKg != null && s.weightKg > 0 ? Math.max(m ?? 0, s.weightKg) : m),
    null
  );
  const amounts =
    e.sets?.map((s) => s.holdSeconds ?? s.reps).filter((n): n is number => n != null) ??
    [];
  const timed = e.sets?.some((s) => s.holdSeconds != null);
  const range = amounts.length ? [Math.min(...amounts), Math.max(...amounts)] : null;
  const quantity = range
    ? timed
      ? `${formatSeconds(range[0])}${range[0] !== range[1] ? `–${formatSeconds(range[1])}` : ''}`
      : `${range[0]}${range[0] !== range[1] ? `–${range[1]}` : ''}회`
    : null;
  const legacy = formatAmount(e, unit);
  const sub = e.sets?.length
    ? `${e.sets.length}세트${max != null ? ` · 최고 ${formatWeight(max, unit)}` : quantity ? ` · ${quantity}` : ''}`
    : legacy
      ? `요약 · ${legacy}`
      : '완료 표시';
  const meta = [
    e.meta.perHand
      ? '한 손 중량'
      : e.sets?.some((s) => s.weightKg != null && s.weightKg > 0)
        ? '기록한 중량 기준'
        : null,
    e.meta.perSide ? '좌우 각각' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <Animated.View
      layout={reduced ? undefined : LinearTransition.duration(190)}
      style={[
        rs.exercise,
        {
          backgroundColor: c.card,
          borderColor: open ? c.link + '88' : 'transparent',
          boxShadow: c.float,
        },
      ]}
    >
      <Press
        onPress={onOpen}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`${e.title}, ${sub}`}
        style={rs.exerciseHead}
      >
        <View style={[rs.number, { backgroundColor: open ? c.sky + '20' : c.chip }]}>
          <Text
            style={[rs.small, { color: open ? c.link : c.muted, fontWeight: '700' }]}
          >
            {String(index + 1).padStart(2, '0')}
          </Text>
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[rs.body, { color: c.ink, fontWeight: '700' }]}>{e.title}</Text>
          <Text style={[rs.small, { color: c.muted }]}>{sub}</Text>
        </View>
        <Icon
          name={open ? 'chevron-up' : 'chevron-down'}
          size={16}
          color={open ? c.link : c.muted}
        />
      </Press>
      {open ? (
        <Animated.View
          entering={reduced ? undefined : FadeIn.duration(160)}
          style={rs.sets}
        >
          {e.sets == null ? (
            <Text style={[rs.small, { color: c.danger }]}>
              세트 기록을 확인하지 못했어요. 화면을 다시 불러와 주세요.
            </Text>
          ) : e.sets.length ? (
            <>
              {meta ? (
                <Text style={[rs.tiny, { color: c.muted, marginBottom: 10 }]}>
                  {meta}
                </Text>
              ) : null}
              <View
                accessibilityRole="header"
                style={[rs.tableRow, { borderColor: c.line }]}
              >
                <Text style={[rs.tableIndex, rs.tiny, { color: c.muted }]}>세트</Text>
                {e.sets.some((s) => s.weightKg != null && s.weightKg > 0) ? (
                  <Text style={[rs.tableCell, rs.tiny, { color: c.muted }]}>중량</Text>
                ) : null}
                <Text style={[rs.tableCell, rs.tiny, { color: c.muted }]}>
                  {e.sets.some((s) => s.holdSeconds != null) ? '시간' : '횟수'}
                </Text>
              </View>
              {e.sets.map((s, i) => (
                <View
                  key={s.setNo}
                  style={[
                    rs.tableRow,
                    { borderColor: i === e.sets!.length - 1 ? 'transparent' : c.line },
                  ]}
                >
                  <Text style={[rs.tableIndex, rs.small, { color: c.muted }]}>
                    {i + 1}
                  </Text>
                  {e.sets!.some((s) => s.weightKg != null && s.weightKg > 0) ? (
                    <Text style={[rs.tableCell, rs.body, { color: c.ink }]}>
                      {formatWeight(s.weightKg, unit) ?? '—'}
                    </Text>
                  ) : null}
                  <Text style={[rs.tableCell, rs.body, { color: c.ink }]}>
                    {s.holdSeconds != null
                      ? e.meta.inMinutes
                        ? `${Math.round(s.holdSeconds / 6) / 10}분`
                        : formatSeconds(s.holdSeconds)
                      : s.reps != null
                        ? `${s.reps}회`
                        : '—'}
                  </Text>
                </View>
              ))}
              {e.sets.some((s) => s.rir != null) ? (
                <Text style={[rs.tiny, { color: c.muted, marginTop: 6 }]}>
                  여유 횟수 ·{' '}
                  {e.sets
                    .filter((s) => s.rir != null)
                    .map(
                      (s) =>
                        `${e.sets!.indexOf(s) + 1}세트 ${s.rir === 4 ? '4회 이상' : `${s.rir}회`}`
                    )
                    .join(' · ')}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={[rs.small, { color: c.muted }]}>
              {e.setsDone != null
                ? '세트별 수치 없이 요약으로 남긴 기록이에요.'
                : '세트 수치 없이 완료만 표시한 기록이에요.'}
            </Text>
          )}
          <View style={rs.actions}>
            {e.method === 'exercise' ? (
              <RecordLink label="지난 기록" icon="history" onPress={onHistory} c={c} />
            ) : null}
            <RecordLink
              label={e.method === 'drill' ? '드릴 방법' : '운동 방법'}
              icon="play"
              onPress={() =>
                router.push(
                  `/library/${e.method === 'drill' ? 'drill' : 'exercise'}/${e.id}` as Href
                )
              }
              c={c}
            />
          </View>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

export const rs = StyleSheet.create({
  body: { fontSize: 16, lineHeight: 23, letterSpacing: -0.4 },
  small: { fontSize: 13, lineHeight: 20, letterSpacing: -0.25 },
  tiny: { fontSize: 12, lineHeight: 18 },
  title: { fontSize: 30, lineHeight: 38, fontWeight: '800', letterSpacing: -1.2 },
  section: { fontSize: 19, lineHeight: 26, fontWeight: '700', letterSpacing: -0.5 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginTop: 24,
    marginBottom: 12,
    paddingHorizontal: 3,
  },
  card: { borderRadius: 23, padding: 18 },
  hero: { borderRadius: 27, padding: 22 },
  heroTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
  },
  object: {
    width: 54,
    height: 54,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-8deg' }],
  },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  stat: { minWidth: 64, flexGrow: 1, gap: 5 },
  num: {
    fontSize: 29,
    lineHeight: 35,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
    letterSpacing: -1,
  },
  status: { flexDirection: 'row', gap: 7, alignItems: 'center', marginTop: 17 },
  exercise: { borderRadius: 23, borderWidth: 1, marginBottom: 9, overflow: 'hidden' },
  exerciseHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    minHeight: 82,
    paddingVertical: 16,
    paddingHorizontal: 15,
  },
  number: {
    width: 36,
    minHeight: 38,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sets: { paddingHorizontal: 16, paddingBottom: 12 },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 9,
    gap: 8,
  },
  tableIndex: { width: 40, fontVariant: ['tabular-nums'] },
  tableCell: {
    flex: 1,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 5 },
  link: {
    minHeight: 44,
    minWidth: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 3,
  },
  button: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 14,
  },
  notice: { padding: 14, borderRadius: 17, gap: 3 },
  split: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  line: {
    minHeight: 56,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  input: {
    minHeight: 110,
    borderRadius: 16,
    padding: 14,
    fontSize: 16,
    lineHeight: 24,
    textAlignVertical: 'top',
  },
  empty: { alignItems: 'center', gap: 16, paddingHorizontal: 16, paddingVertical: 58 },
});
