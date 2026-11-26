import { useEffect, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import Svg, {
  Defs,
  Image as SvgImage,
  LinearGradient,
  Mask,
  Rect,
  Stop,
} from 'react-native-svg';
import { shiftDateKey, weekStartKey } from '@/lib/pitch-stats';
import type { BoardDay, HomeBoard } from '@/lib/report/home-board';
import { isRestSession } from '@/lib/session-type';
import { cacheEpoch } from '~/lib/store';
import { type Palette, usePalette, withAlpha } from '~/lib/ui';
import type { PitchLog } from '~/pitch/api';
import type { RecordsCategory } from '~/records/intent';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { loadDay, type AppHome, type DayDetail } from './api';
import { useHomeSwipe } from './camera-swipe';
import { korDate, pitchCard, weekdayKo, workoutCard } from './plan-model';

const PITCH_ART = require('../../assets/home-actions/pitch.webp');
const TRAINING_ART = require('../../assets/home-actions/training.webp');
const CARD_WIDTH = 178;
const CARD_HEIGHT = 190;

type Props = {
  home: AppHome;
  today: string;
  selected: string;
  pitchMonth: PitchLog[] | null;
  onSelect: (date: string) => void;
  notices?: ReactNode;
  onCheckin: () => void;
  onPitch: () => void;
  onWorkout: () => void;
  onRecords: (date: string, category?: RecordsCategory) => void;
};

type History = { date: string; epoch: number; detail: DayDetail | null };

export function DailyOverview({
  home,
  today,
  selected,
  pitchMonth,
  onSelect,
  notices,
  onCheckin,
  onPitch,
  onWorkout,
  onRecords,
}: Props) {
  const c = usePalette();
  const { fontScale } = useWindowDimensions();
  const [history, setHistory] = useState<History | null>(null);
  const old = selected < today;
  const future = selected > today;
  const boardDay = home.board?.week.find((day) => day.date === selected);
  const result =
    old && history?.date === selected && history.epoch === cacheEpoch()
      ? history
      : null;
  const detail = result?.detail;

  useEffect(() => {
    if (!old) return;
    const epoch = cacheEpoch();
    let active = true;
    const accept = (data: DayDetail | null) => {
      if (active && epoch === cacheEpoch())
        setHistory({ date: selected, epoch, detail: data });
    };
    void loadDay(selected).then(accept, () => accept(null));
    return () => {
      active = false;
    };
  }, [old, selected, home]);

  const dayLogs = old
    ? pitchMonth?.filter((log) => log.date.slice(0, 10) === selected)
    : undefined;
  const pastPitches = dayLogs?.reduce(
    (count, log) => count + (isRestSession(log.sessionType) ? 0 : log.pitchCount),
    0
  );
  const pastRest = dayLogs
    ? dayLogs.length > 0 && dayLogs.every((log) => isRestSession(log.sessionType))
    : boardDay?.pitch === 'rest';
  const condition = old ? detail?.checkin?.condition : home.board?.condition?.value;
  const checked =
    !future &&
    (old ? (detail ? !!detail.checkin : !!boardDay?.checkin) : home.checkinDone);
  const pitched =
    !future &&
    (old ? !!dayLogs?.length || (!!boardDay?.pitch && !dayLogs) : home.pitchDone);
  const exercises = detail?.training.exercises;
  const progress = exercises?.filter((exercise) => exercise.done).length ?? 0;
  const todayPitch = pitchCard(home);
  const todayWorkout = workoutCard(home.workout, !!home.trainingLocked);
  const trained =
    !future &&
    (old ? !!exercises?.length && progress === exercises.length : todayWorkout.done);
  const missingHistory = !result ? '불러오는 중' : '확인 불가';
  const checkinCaption = checked
    ? condition == null
      ? '완료'
      : `${condition} / 10`
    : old && !detail && !boardDay
      ? missingHistory
      : '기록 전';
  const pitchCaption = old
    ? pitched
      ? pastPitches && pastPitches > 0
        ? `${pastPitches}구`
        : pastRest
          ? '휴식'
          : '기록함'
      : !boardDay && !dayLogs
        ? '기록 보기'
        : '기록 전'
    : todayPitch.value + todayPitch.unit;
  const workoutCaption = old
    ? trained
      ? '완료'
      : exercises?.length
        ? `${progress} / ${exercises.length}`
        : detail
          ? '기록 전'
          : missingHistory
    : todayWorkout.value + todayWorkout.unit;

  const actions = [
    {
      key: 'pitch',
      title: future
        ? '투구'
        : old
          ? pitched
            ? '투구 기록 보기'
            : '투구 기록'
          : home.pitchLocked
            ? '투구 설정하기'
            : pitched
              ? '투구 기록 보기'
              : '투구 기록하기',
      caption: pitched ? pitchCaption : undefined,
      art: PITCH_ART,
      onPress: old ? () => onRecords(selected, 'pitch') : onPitch,
    },
    {
      key: 'training',
      title: future
        ? '운동'
        : old
          ? '운동 기록 보기'
          : {
              locked: '운동 설정하기',
              none: '운동 일정 만들기',
              todo: '오늘 운동 보기',
              doing: '운동 이어서 하기',
              done: '운동 완료',
            }[todayWorkout.state],
      caption: old
        ? trained
          ? '완료'
          : undefined
        : ['todo', 'doing'].includes(todayWorkout.state)
          ? todayWorkout.meta
          : undefined,
      art: TRAINING_ART,
      onPress: old ? () => onRecords(selected, 'training') : onWorkout,
    },
  ] as const;

  return (
    <View>
      <DateRail
        date={selected}
        today={today}
        week={home.board?.week}
        onSelect={onSelect}
        c={c}
      />
      {notices ? <View style={{ marginTop: 12 }}>{notices}</View> : null}
      <View
        accessibilityLabel="선택한 날짜의 기록과 완료 상태"
        style={[styles.progress, { backgroundColor: c.card, borderColor: c.line }]}
      >
        <Completion
          icon="heart-pulse"
          label="체크인"
          caption={checkinCaption}
          done={checked}
          disabled={future}
          c={c}
          onPress={old ? () => onRecords(selected, 'condition') : onCheckin}
        />
        <Completion
          icon="target"
          label="투구"
          caption={pitchCaption}
          done={pitched}
          disabled={future}
          c={c}
          onPress={actions[0].onPress}
        />
        <Completion
          icon="dumbbell"
          label="운동"
          caption={workoutCaption}
          done={trained}
          disabled={future}
          c={c}
          onPress={actions[1].onPress}
        />
      </View>
      <View style={[styles.actions, fontScale >= 1.45 && { flexDirection: 'column' }]}>
        {actions.map((action) => (
          <Press
            key={action.key}
            card
            accessibilityRole="button"
            accessibilityLabel={[action.title, future ? '예정일' : action.caption]
              .filter(Boolean)
              .join(', ')}
            disabled={future}
            onPress={action.onPress}
            style={[
              styles.action,
              fontScale >= 1.45 && { flex: 0, aspectRatio: 2.15 },
              future && { opacity: 0.68 },
            ]}
          >
            <ActionArt id={action.key} art={action.art} />
            <View style={styles.actionLabel}>
              <View style={styles.actionText}>
                <Text lineBreakStrategyIOS="hangul-word" style={styles.actionTitle}>
                  {action.title}
                </Text>
                {action.caption && !future ? (
                  <Text style={styles.actionCaption}>{action.caption}</Text>
                ) : null}
              </View>
              {!future ? <Icon name="chevron-right" size={15} color="#cbdef3" /> : null}
            </View>
          </Press>
        ))}
      </View>
      <WeeklyActivity
        board={home.board}
        selected={selected}
        today={today}
        c={c}
        onRecords={onRecords}
      />
    </View>
  );
}

function DateRail({
  date,
  today,
  week,
  onSelect,
  c,
}: {
  date: string;
  today: string;
  week?: BoardDay[];
  onSelect: (key: string) => void;
  c: Palette;
}) {
  const cameraPan = useHomeSwipe();
  const begin = weekStartKey(date);
  const days = Array.from({ length: 7 }, (_, index) => shiftDateKey(begin, index));
  const swipe = (direction: number) => onSelect(shiftDateKey(date, direction));
  const gesture = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-12, 12])
    .onEnd((event) => {
      if (Math.abs(event.translationX) >= 35 || Math.abs(event.velocityX) >= 365) {
        runOnJS(swipe)(event.translationX < 0 ? 1 : -1);
      }
    });
  if (cameraPan) gesture.blocksExternalGesture(cameraPan);

  return (
    <GestureDetector gesture={gesture}>
      <View
        accessibilityActions={[
          { name: 'decrement', label: '이전 날짜' },
          { name: 'increment', label: '다음 날짜' },
        ]}
        onAccessibilityAction={(e) =>
          swipe(e.nativeEvent.actionName === 'increment' ? 1 : -1)
        }
        style={styles.dates}
      >
        {days.map((key) => {
          const active = key === date;
          const entry = week?.find((item) => item.date === key);
          const marked = entry && (entry.checkin || entry.pitch || entry.workout);
          const color = active ? '#102c40' : c.ink;
          return (
            <Press
              key={key}
              select
              selected={active}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${korDate(key)} ${weekdayKo(key)}요일${key === today ? ', 오늘' : ''}`}
              onPress={() => onSelect(key)}
              style={[styles.day, active && { backgroundColor: '#a5e1f7' }]}
            >
              <Text style={[styles.weekday, { color: active ? color : c.muted }]}>
                {weekdayKo(key)}
              </Text>
              <Text
                style={[
                  styles.date,
                  { color, opacity: !active && key > today ? 0.68 : 1 },
                ]}
              >
                {Number(key.slice(8))}
              </Text>
              <View
                style={[
                  styles.dot,
                  { backgroundColor: marked && !active ? c.sky : 'transparent' },
                ]}
              />
            </Press>
          );
        })}
      </View>
    </GestureDetector>
  );
}

function Completion({
  icon,
  label,
  caption,
  done,
  disabled,
  onPress,
  c,
}: {
  icon: 'heart-pulse' | 'target' | 'dumbbell';
  label: string;
  caption: string;
  done: boolean;
  disabled: boolean;
  onPress: () => void;
  c: Palette;
}) {
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${disabled ? '예정일' : done ? `완료, ${caption}` : caption}`}
      disabled={disabled}
      onPress={onPress}
      style={styles.completion}
    >
      <View
        style={[
          styles.completionIcon,
          {
            backgroundColor: done ? '#c5ebfb' : c.chip,
            borderColor: done ? '#94cdee' : c.line,
          },
        ]}
      >
        <Icon
          name={done ? 'check' : icon}
          size={15}
          strokeWidth={done ? 2.7 : 1.8}
          color={done ? '#142f47' : c.muted}
        />
      </View>
      <View style={styles.completionText}>
        <Text style={[styles.completionTitle, { color: c.ink }]}>{label}</Text>
        <Text numberOfLines={1} style={[styles.completionCaption, { color: c.muted }]}>
          {disabled ? '예정일' : caption}
        </Text>
      </View>
    </Press>
  );
}

function ActionArt({ art, id }: { art: number; id: string }) {
  const scene = `home-scene-${id}`;
  const fade = `home-art-${id}`;
  const shade = `home-shade-${id}`;
  const artHeight = (CARD_WIDTH * 2) / 3;
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`}
        preserveAspectRatio="none"
      >
        <Defs>
          <LinearGradient id={scene} x1="0" y1="0" x2="1" y2="0.35">
            <Stop offset="0" stopColor="#abbfd4" />
            <Stop offset="0.56" stopColor="#9ab4cf" />
            <Stop offset="1" stopColor="#91aeca" />
          </LinearGradient>
          <LinearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.84" stopColor="#fff" />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.49" stopColor="#15283b" stopOpacity={0} />
            <Stop offset="0.60" stopColor="#15283b" stopOpacity={0.13} />
            <Stop offset="0.73" stopColor="#13253b" stopOpacity={0.47} />
            <Stop offset="0.91" stopColor="#112237" stopOpacity={0.82} />
            <Stop offset="1" stopColor="#112237" stopOpacity={0.92} />
          </LinearGradient>
          <Mask id={`${fade}-mask`}>
            <Rect width={CARD_WIDTH} height={artHeight} fill={`url(#${fade})`} />
          </Mask>
        </Defs>
        <Rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={`url(#${scene})`} />
        <SvgImage
          width={CARD_WIDTH}
          height={artHeight}
          href={art}
          mask={`url(#${fade}-mask)`}
        />
        <Rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={`url(#${shade})`} />
      </Svg>
    </View>
  );
}

const ROWS = [
  { label: '운동', category: 'training', matches: (day: BoardDay) => day.workout },
  {
    label: '투구',
    category: 'pitch',
    matches: (day: BoardDay) => day.pitch === 'throw',
  },
  {
    label: '투구 휴식',
    category: 'pitch',
    matches: (day: BoardDay) => day.pitch === 'rest',
  },
] as const;

function WeeklyActivity({
  board,
  selected,
  today,
  c,
  onRecords,
}: {
  board?: HomeBoard;
  selected: string;
  today: string;
  c: Palette;
  onRecords: Props['onRecords'];
}) {
  const dates = board?.week ?? [];
  return (
    <View style={styles.week}>
      <Text accessibilityRole="header" style={[styles.weekTitle, { color: c.ink }]}>
        이번 주 활동
      </Text>
      {board ? (
        <View
          style={[styles.weekCard, { backgroundColor: c.card, borderColor: c.line }]}
        >
          <View style={styles.activityRow} accessible={false}>
            <View style={styles.activityLabel} />
            {dates.map((day) => (
              <View
                key={day.date}
                style={[
                  styles.activityCell,
                  styles.weekdayCell,
                  day.date === selected && { backgroundColor: c.chip },
                ]}
              >
                <Text
                  style={[
                    styles.weekday,
                    { color: day.date === selected ? c.ink : c.muted },
                  ]}
                >
                  {weekdayKo(day.date)}
                </Text>
              </View>
            ))}
            <View style={styles.total} />
          </View>
          {ROWS.map((row) => {
            const entries = dates.filter(row.matches);
            return (
              <Press
                key={row.label}
                accessibilityRole="button"
                accessibilityLabel={`이번 주 ${row.label} ${entries.length}일, 기록 보기`}
                accessibilityHint={entries
                  .map((day) => `${weekdayKo(day.date)}요일`)
                  .join(', ')}
                onPress={() =>
                  onRecords(
                    dates.some((day) => day.date === selected) && selected <= today
                      ? selected
                      : today,
                    row.category
                  )
                }
                style={[
                  styles.activityRow,
                  styles.activityItem,
                  { borderColor: c.line },
                ]}
              >
                <Text
                  style={[styles.activityLabel, styles.activityText, { color: c.ink }]}
                >
                  {row.label}
                </Text>
                {dates.map((day) => (
                  <View
                    key={day.date}
                    style={[
                      styles.activityCell,
                      day.date === selected && { backgroundColor: c.chip },
                    ]}
                  >
                    <View
                      style={[
                        styles.mark,
                        {
                          backgroundColor: withAlpha(
                            c.muted,
                            day.date > today ? 0.09 : 0.2
                          ),
                        },
                        row.matches(day) &&
                          (row.label === '투구 휴식'
                            ? {
                                width: 9,
                                height: 9,
                                borderWidth: 1,
                                borderColor: '#9fd1f3',
                                backgroundColor: 'transparent',
                              }
                            : { width: 16, height: 8, backgroundColor: '#a7d9f7' }),
                      ]}
                    />
                  </View>
                ))}
                <Text style={[styles.total, styles.activityText, { color: c.ink }]}>
                  {entries.length}일
                </Text>
              </Press>
            );
          })}
        </View>
      ) : (
        <Press
          accessibilityRole="button"
          onPress={() => onRecords(today)}
          style={styles.activityItem}
        >
          <Text style={{ color: c.muted }}>이번 주 기록 보기</Text>
        </Press>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  dates: { flexDirection: 'row', gap: 3, marginHorizontal: -7, paddingVertical: 10 },
  day: {
    flex: 1,
    minWidth: 0,
    minHeight: 56,
    paddingVertical: 6,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  weekday: { fontSize: 11, fontWeight: '500' },
  date: { fontSize: 17, fontWeight: '700', fontVariant: ['tabular-nums'] },
  dot: { width: 4, height: 4, borderRadius: 2 },
  progress: {
    minHeight: 69,
    padding: 5,
    flexDirection: 'row',
    marginTop: 17,
    borderRadius: 18,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'stretch',
  },
  completion: {
    flex: 1,
    minWidth: 0,
    minHeight: 44,
    paddingHorizontal: 5,
    paddingVertical: 6,
    gap: 6,
    borderRadius: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  completionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  completionText: { flex: 1, minWidth: 0, gap: 2 },
  completionTitle: { fontSize: 13, fontWeight: '600' },
  completionCaption: { fontSize: 11 },
  actions: { flexDirection: 'row', gap: 18, marginTop: 32 },
  action: {
    flex: 1,
    minWidth: 0,
    aspectRatio: CARD_WIDTH / CARD_HEIGHT,
    borderRadius: 20,
    overflow: 'hidden',
    backgroundColor: '#172b43',
    justifyContent: 'flex-end',
  },
  actionLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 4,
    paddingHorizontal: 13,
    paddingBottom: 16,
  },
  actionText: { flexShrink: 1, gap: 3 },
  actionTitle: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.68,
    color: '#f2f7ff',
  },
  actionCaption: { fontSize: 11, color: '#b9d2ea' },
  week: { marginTop: 42, gap: 12 },
  weekTitle: { fontSize: 21, fontWeight: '700', letterSpacing: -0.55 },
  weekCard: {
    borderRadius: 19,
    paddingHorizontal: 14,
    paddingVertical: 11,
    borderWidth: StyleSheet.hairlineWidth,
  },
  activityRow: { flexDirection: 'row', alignItems: 'stretch' },
  activityItem: { minHeight: 44, borderTopWidth: StyleSheet.hairlineWidth },
  activityCell: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdayCell: { minHeight: 27, borderTopLeftRadius: 7, borderTopRightRadius: 7 },
  activityLabel: { width: 62 },
  total: { width: 38, textAlign: 'right' },
  activityText: { alignSelf: 'center', fontSize: 12, fontWeight: '600' },
  mark: { width: 7, height: 5, borderRadius: 5 },
});
