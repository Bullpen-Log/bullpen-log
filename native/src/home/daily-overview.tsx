import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Image as SvgImage,
  LinearGradient,
  Mask,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { shiftDateKey, weekStartKey } from '@/lib/pitch-stats';
import type { BoardDay } from '@/lib/report/home-board';
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
const ART_TOP = 24;
const CHECK_ACCENT = '#a6dff5';
const CHECK_INK = '#132f43';
const CHECK_SIZE = 27;
const CHECK_LENGTH = 19;
const AnimatedPath = Animated.createAnimatedComponent(Path);
const CARD_LIGHT = {
  pitch: ['#becfe3', '#8ca8c8'],
  training: ['#abc0d7', '#718bad'],
} as const;

type Props = {
  home: AppHome;
  today: string;
  selected: string;
  pitchMonth: PitchLog[] | null;
  onSelect: (date: string) => void;
  notices?: ReactNode;
  highlight?: ReactNode;
  onCheckin: () => void;
  onPitch: () => void;
  pitchShowsRecords: boolean;
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
  highlight,
  onCheckin,
  onPitch,
  pitchShowsRecords,
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
      ? `${progress}개`
      : exercises?.length
        ? `${progress} / ${exercises.length}`
        : detail
          ? '기록 전'
          : missingHistory
    : trained && home.workout ? `${home.workout.done}개` : todayWorkout.value + todayWorkout.unit;

  const actions = [
    {
      key: 'pitch',
      title: future
        ? '투구'
        : old || pitchShowsRecords
          ? '투구 기록 보기'
          : home.pitchLocked
            ? '투구 설정하기'
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
  const stackActions = fontScale >= 1.45;
  const alignCaptions = !future && !stackActions && actions.some((action) => !!action.caption);
  const completionKey = `${cacheEpoch()}:${selected}`;

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
        style={[styles.progress, { backgroundColor: c.card, borderColor: c.line, boxShadow: c.float }]}
      >
        <View pointerEvents="none" accessible={false} style={styles.progressLight}>
          <Svg width="100%" height="100%">
            <Defs>
              <LinearGradient id="daily-status-light" x1="0" y1="0" x2="0.78" y2="1">
                <Stop offset="0" stopColor={c.link} stopOpacity={0.13} />
                <Stop offset="1" stopColor={c.link} stopOpacity={0} />
              </LinearGradient>
            </Defs>
            <Rect width="100%" height="100%" fill="url(#daily-status-light)" />
          </Svg>
        </View>
        <Completion
          key={`condition-${completionKey}`}
          animate={selected === today}
          label="체크인"
          caption={checkinCaption}
          done={checked}
          disabled={future}
          c={c}
          onPress={old ? () => onRecords(selected, 'condition') : onCheckin}
        />
        <Completion
          key={`pitch-${completionKey}`}
          animate={selected === today}
          label="투구"
          caption={pitchCaption}
          done={pitched}
          disabled={future}
          c={c}
          onPress={actions[0].onPress}
        />
        <Completion
          key={`training-${completionKey}`}
          animate={selected === today}
          label="운동"
          caption={workoutCaption}
          done={trained}
          disabled={future}
          c={c}
          onPress={actions[1].onPress}
        />
      </View>
      {highlight ? <View style={styles.highlight}>{highlight}</View> : null}
      <View style={[styles.actions, stackActions && { flexDirection: 'column' }]}>
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
              { boxShadow: c.floatHero },
              stackActions && { flex: 0, aspectRatio: 2.15 },
              future && { opacity: 0.68 },
            ]}
          >
            <View style={styles.actionFace}>
              <ActionArt id={action.key} art={action.art} />
              <View pointerEvents="none" style={styles.actionEdge} />
              <View style={styles.actionLabel}>
                <View style={styles.actionTitleRow}>
                  <Text lineBreakStrategyIOS="hangul-word" style={styles.actionTitle}>
                    {action.title}
                  </Text>
                  {!future ? <Icon name="chevron-right" size={15} color="#cbdef3" /> : null}
                </View>
                {!future && (action.caption || alignCaptions) ? (
                  <Text numberOfLines={stackActions ? 2 : 1} style={styles.actionCaption}>
                    {action.caption ?? '\u00a0'}
                  </Text>
                ) : null}
              </View>
            </View>
          </Press>
        ))}
      </View>
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
  animate,
  label,
  caption,
  done,
  disabled,
  onPress,
  c,
}: {
  animate: boolean;
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
      <CompletionMark animate={animate} done={done} disabled={disabled} c={c} />
      <Text style={[styles.completionTitle, { color: c.ink }]}>{label}</Text>
      <Text
        style={[
          styles.completionCaption,
          { color: done ? c.ink : c.muted },
          done && styles.completionValue,
        ]}
      >
        {disabled ? '예정일' : caption}
      </Text>
    </Press>
  );
}

function CompletionMark({
  animate,
  done,
  disabled,
  c,
}: {
  animate: boolean;
  done: boolean;
  disabled: boolean;
  c: Palette;
}) {
  const reduce = useReducedMotion();
  const previous = useRef(done);
  const progress = useSharedValue(done ? 1 : 0);
  useEffect(() => {
    const newlyDone = done && !previous.current;
    previous.current = done;
    if (newlyDone && animate && !reduce) {
      progress.set(0);
      progress.set(withTiming(1, { duration: 500, easing: Easing.linear }));
    } else {
      progress.set(done ? 1 : 0);
    }
  }, [animate, done, reduce, progress]);

  const face = useAnimatedStyle(() => {
    const time = progress.get();
    return {
      opacity: interpolate(time, [0, 0.36], [0, 1], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(time, [0, 0.36, 0.58, 0.82, 1], [0.75, 1.07, 1.015, 0.995, 1]) }],
    };
  });
  const halo = useAnimatedStyle(() => {
    const time = progress.get();
    return {
      opacity: interpolate(time, [0, 0.26, 0.53, 0.98], [0, 0, 0.62, 0], Extrapolation.CLAMP),
      transform: [{ scale: interpolate(time, [0.26, 0.98], [0.9, 1.47], Extrapolation.CLAMP) }],
    };
  });
  const line = useAnimatedProps(() => {
    const draw = interpolate(progress.get(), [0.25, 0.85], [0, 1], Extrapolation.CLAMP);
    return {
      strokeDashoffset: CHECK_LENGTH * (1 - draw) ** 1.65,
      strokeOpacity: draw > 0 ? 1 : 0,
    };
  });

  return (
    <View pointerEvents="none" accessible={false} style={styles.checkMark}>
      <View style={[styles.checkTrack, { borderColor: withAlpha(c.muted, disabled ? 0.22 : 0.48) }]} />
      {done ? (
        <>
          <Animated.View style={[styles.checkHalo, halo]} />
          <Animated.View style={[styles.checkFace, face]}>
            <Svg width={CHECK_SIZE} height={CHECK_SIZE} viewBox="0 0 33 33">
              <Defs>
                <RadialGradient id="completion-light" cx="29%" cy="12%" rx="89%" ry="89%">
                  <Stop offset="0" stopColor="#edfaff" />
                  <Stop offset="0.47" stopColor="#b7e5ff" />
                  <Stop offset="1" stopColor="#77a9d4" />
                </RadialGradient>
              </Defs>
              <Circle cx={16.5} cy={16.5} r={15} fill="url(#completion-light)" stroke="#d4eeff" strokeOpacity={0.55} />
              <AnimatedPath
                d="M 9.6 16.9 L 14 21.2 L 22.8 12.4"
                fill="none"
                stroke={CHECK_INK}
                strokeWidth={2.35}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={[CHECK_LENGTH, CHECK_LENGTH]}
                animatedProps={line}
              />
            </Svg>
          </Animated.View>
        </>
      ) : null}
    </View>
  );
}

function ActionArt({ art, id }: { art: number; id: keyof typeof CARD_LIGHT }) {
  const scene = `home-scene-${id}`;
  const fade = `home-art-${id}`;
  const shade = `home-shade-${id}`;
  const artHeight = (CARD_WIDTH * 2) / 3;
  const [light, shadeColor] = CARD_LIGHT[id];
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
            <Stop offset="0" stopColor={light} />
            <Stop offset="1" stopColor={shadeColor} />
          </LinearGradient>
          <LinearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#fff" stopOpacity={0} />
            <Stop offset="0.11" stopColor="#fff" />
            <Stop offset="0.87" stopColor="#fff" />
            <Stop offset="1" stopColor="#fff" stopOpacity={0} />
          </LinearGradient>
          <LinearGradient id={shade} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.52" stopColor="#15283b" stopOpacity={0} />
            <Stop offset="0.66" stopColor="#15283b" stopOpacity={0.13} />
            <Stop offset="0.77" stopColor="#13253b" stopOpacity={0.54} />
            <Stop offset="0.90" stopColor="#112237" stopOpacity={0.87} />
            <Stop offset="1" stopColor="#112237" stopOpacity={0.96} />
          </LinearGradient>
          <Mask id={`${fade}-mask`}>
            <Rect y={ART_TOP} width={CARD_WIDTH} height={artHeight} fill={`url(#${fade})`} />
          </Mask>
        </Defs>
        <Rect width={CARD_WIDTH} height={CARD_HEIGHT} fill={`url(#${scene})`} />
        <SvgImage
          y={ART_TOP}
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
    marginHorizontal: 11,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    marginTop: 13,
    borderRadius: 20,
    borderWidth: StyleSheet.hairlineWidth,
  },
  progressLight: { ...StyleSheet.absoluteFill, borderRadius: 20, overflow: 'hidden' },
  completion: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: 4,
    paddingVertical: 8,
    alignItems: 'center',
  },
  checkMark: { width: CHECK_SIZE, height: CHECK_SIZE, marginBottom: 6 },
  checkTrack: {
    ...StyleSheet.absoluteFill,
    margin: 1,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(6, 13, 25, 0.34)',
    boxShadow: 'inset 0 1px 4px rgba(0, 0, 0, 0.42)',
  },
  checkFace: {
    ...StyleSheet.absoluteFill,
    borderRadius: CHECK_SIZE / 2,
    boxShadow: '0 4px 10px -3px rgba(125, 211, 252, 0.50)',
  },
  checkHalo: {
    ...StyleSheet.absoluteFill,
    margin: 2,
    borderRadius: CHECK_SIZE / 2,
    borderWidth: 1,
    borderColor: CHECK_ACCENT,
  },
  completionTitle: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  completionCaption: { minHeight: 19, fontSize: 12, fontWeight: '500', marginTop: 5, textAlign: 'center' },
  completionValue: { fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'] },
  highlight: { marginTop: 17 },
  actions: { flexDirection: 'row', gap: 16, marginTop: 21 },
  action: {
    flex: 1,
    minWidth: 0,
    aspectRatio: CARD_WIDTH / CARD_HEIGHT,
    borderRadius: 22,
  },
  actionFace: {
    flex: 1,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#172b43',
    justifyContent: 'flex-end',
  },
  actionEdge: {
    ...StyleSheet.absoluteFill,
    borderRadius: 22,
    boxShadow: 'inset 0 1px 0 rgba(240, 248, 255, 0.38), inset 1px 0 0 rgba(240, 248, 255, 0.12), inset 0 -1px 0 rgba(0, 0, 0, 0.3)',
  },
  actionLabel: { gap: 3, paddingHorizontal: 15, paddingBottom: 16 },
  actionTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  actionTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: -0.68,
    color: '#f2f7ff',
  },
  actionCaption: { fontSize: 11, color: '#b9d2ea' },
});
