import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatAmount, formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import { volumeIn } from '@/lib/workout/summarize';
import type { ExerciseHistory, HistoryDay, HistoryKind } from '@/lib/workout/history';
import type { AppTrainingDay, loadAppTrainingDay } from '@/app/actions/app-training-parts';
import { Bar, LoadState, useLoad } from '~/community/parts';
import { act } from '~/mechanics/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { s } from '~/training/screen';
import { Sheet } from '~/workout/sheets';

/**
 * 그날의 운동 기록(앱 화면) — 웹 /training/day/<날짜>(app/(app)/training/day/[date]/page.tsx · day-exercises.tsx)를 옮겼다. 자료는 웹과 같은
 * trainingDay · loadTrainingStrip(app-training-parts.loadAppTrainingDay). 트레이닝 '오늘 운동' 화면의 날짜 띠에서 들어온다.
 *
 * 웹과 같은 차례: 날짜 띠(최근 6주, 칸을 누르면 그날 · 오늘은 오늘 운동으로) → 그날 강도 · 메모 → 한 운동(완료한 것 먼저, 체크 안 한 계획 운동이 뒤).
 * 일주일 안의 날짜는 완료를 켜고 끈다(exercise-log.setExerciseDone — 웹과 같은 기록, 수치는 오늘만 적는다). 운동마다 그래프 단추로 지난 기록
 * (exercise-history.exerciseHistory — 웹 ExerciseHistoryPanel 과 같은 셈). 웹 띠 끝의 간이 달력(6주보다 옛날)은 앱에 없다.
 */
type Loaded = Awaited<ReturnType<typeof loadAppTrainingDay>>;
type DayExercise = AppTrainingDay['detail']['exercises'][number];

const WEEKDAY = '일월화수목금토';
/** 날짜 키의 월 · 일 · 요일 — 폰의 시간대와 상관없이 그 날로 */
const dayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return { year: y, month: m, day: d, week: WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
};

export default function TrainingDayScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const load = useLoad<Loaded>('app-training-parts.loadAppTrainingDay', date ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const day = load.data?.day;
  const refresh = async () => {
    setRefreshing(true);
    await load.reload();
    setRefreshing(false);
  };
  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      <Bar back="오늘 운동" title="운동 기록" c={c} />
      {!load.data ? (
        <LoadState error={load.error} onRetry={() => void load.reload()} c={c} />
      ) : !day ? (
        <Text style={[s.body, s.center, { color: c.muted, padding: 32 }]}>없는 날짜예요.</Text>
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: Math.max(40, inset.bottom + 24) }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void refresh()} />}
          style={load.stale ? { opacity: 0.6 } : null}
        >
          {load.error ? (
            <View style={[st.notice, { backgroundColor: c.danger + '14' }]}>
              <Text style={[s.small, { color: c.danger, flex: 1 }]}>{load.error}</Text>
              <Pressable onPress={() => void load.reload()} accessibilityRole="button" style={s.textBtn}>
                <Text style={[s.smallBold, { color: c.sky }]}>다시 불러오기</Text>
              </Pressable>
            </View>
          ) : null}
          {/* 다른 날로 옮기면 그날 목록으로 새로 그린다(체크해 둔 낙관값이 옆 날에 남지 않게) */}
          <DayBody key={day.detail.date} day={day} c={c} />
        </ScrollView>
      )}
    </View>
  );
}

function DayBody({ day, c }: { day: AppTrainingDay; c: Palette }) {
  const { detail, strip, today } = day;
  const unit = useWeightUnit();
  const [saved, setSaved] = useState(detail.exercises);
  /* 다시 받으면(당겨서 새로고침 · 돌아옴) 서버 값을 따른다 */
  const [seen, setSeen] = useState(detail.exercises);
  if (seen !== detail.exercises) {
    setSeen(detail.exercises);
    setSaved(detail.exercises);
  }
  /* 보내는 중인 체크(운동 → 바란 값) — 그사이 다시 받아도 화면이 체크 전으로 돌아가지 않게 서버 값 위에 겹쳐 보인다 */
  const [inflight, setInflight] = useState<Record<string, boolean>>({});
  const exercises = saved.map((e) => (e.id in inflight ? { ...e, done: inflight[e.id] } : e));
  const [error, setError] = useState<string | null>(null);
  const [historyOf, setHistoryOf] = useState<{ id: string; title: string } | null>(null);
  /* 보내는 중인 운동 — 답이 오기 전에 또 누르면 무시한다(두 번 보내 엇갈리지 않게) */
  const sending = useRef(new Set<string>());

  const d = dayOf(detail.date);
  const empty = detail.exercises.length === 0 && detail.intensity == null;
  const doneCount = exercises.filter((e) => e.done).length;

  /* 켜고 끄면 화면을 먼저 바꾸고 저장한다. 실패하면 되돌리며 까닭을 알린다(웹과 같다) */
  const toggle = async (ex: DayExercise) => {
    if (!detail.editable || sending.current.has(ex.id)) return;
    sending.current.add(ex.id);
    const next = !ex.done;
    if (next) void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setInflight((p) => ({ ...p, [ex.id]: next }));
    setError(null);
    const res = await act<{ ok: true }>('exercise-log.setExerciseDone', ex.id, next, detail.date);
    sending.current.delete(ex.id);
    /* 남았으면 그 값으로 두고, 실패면 서버 값으로 돌아간다(겹친 값만 걷으면 된다) */
    if ('error' in res) setError(res.error);
    else setSaved((prev) => prev.map((e) => (e.id === ex.id ? { ...e, done: next } : e)));
    setInflight((p) => {
      const rest = { ...p };
      delete rest[ex.id];
      return rest;
    });
  };

  return (
    <>
      <View style={{ gap: 4, paddingHorizontal: 4 }}>
        <Text accessibilityRole="header" style={[s.title, { color: c.ink, fontSize: 28, lineHeight: 34 }]}>
          {d.month}월 {d.day}일 ({d.week})
        </Text>
        <Text style={[s.small, { color: c.muted }]}>{empty ? '이 날은 운동 기록이 없어요' : `운동 ${detail.exercises.length}개`}</Text>
      </View>

      <Strip days={strip} date={detail.date} today={today} c={c} />

      {/* 그날 어땠는지 먼저 — 목록보다 이쪽을 다시 읽으러 온다 */}
      {detail.intensity != null ? (
        <View style={[s.card, { backgroundColor: c.card, borderWidth: 1, borderColor: c.sky + '40', gap: 6 }]}>
          <Text style={[s.bodyBold, { color: c.ink }]}>운동 강도 {detail.intensity}/10</Text>
          <Text selectable style={[s.body, { color: detail.memo ? c.ink : c.muted }]}>
            {detail.memo || '남긴 메모가 없어요.'}
          </Text>
        </View>
      ) : null}

      {empty ? (
        <Text style={[s.body, s.center, st.empty, { color: c.muted, backgroundColor: c.card }]}>
          이 날은 운동 기록이 없어요.{detail.date === today ? '\n트레이닝에서 남길 수 있어요.' : ''}
        </Text>
      ) : (
        <View style={{ gap: 8 }}>
          {error ? <Text style={[s.small, s.box, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error}</Text> : null}
          {exercises.length > 0 ? (
            <Text style={[s.small, { color: c.muted, paddingHorizontal: 4 }]}>
              <Text style={[s.bodyBold, { color: c.ink, fontSize: 18 }]}>{doneCount}</Text>/{exercises.length} 마침
            </Text>
          ) : null}
          {exercises.map((ex) => (
            <ExerciseLine key={ex.id} ex={ex} editable={detail.editable} unit={unit} onToggle={() => void toggle(ex)} onHistory={() => setHistoryOf({ id: ex.id, title: ex.title })} c={c} />
          ))}
          {/* 무엇을 할 수 있는 날인지 밝힌다 — 눌러도 안 되는데 까닭을 안 알리면 고장 난 줄 안다 */}
          {exercises.length > 0 ? (
            <Text style={[s.tiny, { color: c.muted, paddingHorizontal: 4 }]}>
              {detail.editable ? '눌러서 켜고 꺼요. 세트 · 횟수 · 무게는 오늘 것만 적어요.' : '일주일이 지난 기록은 고칠 수 없어요.'} 오른쪽 그래프 단추로 그 운동의 지난
              기록을 볼 수 있어요.
            </Text>
          ) : null}
        </View>
      )}

      <Sheet open={historyOf != null} onClose={() => setHistoryOf(null)} title={historyOf?.title ?? '운동 기록'} c={c}>
        {historyOf ? <HistoryPanel key={historyOf.id} exerciseId={historyOf.id} unit={unit} c={c} /> : null}
      </Sheet>
    </>
  );
}

/** 운동 한 줄 — 완료 동그라미 · 이름 · 분류 · 한 만큼(또는 '안 한 것으로 남음') · 계획, 오른쪽 그래프 단추 */
function ExerciseLine({
  ex,
  editable,
  unit,
  onToggle,
  onHistory,
  c,
}: {
  ex: DayExercise;
  editable: boolean;
  unit: WeightUnit;
  onToggle: () => void;
  onHistory: () => void;
  c: Palette;
}) {
  const amount = ex.done ? formatAmount(ex, unit) : null;
  const planned = ex.planned ? `계획 ${ex.planned}` : null;
  return (
    <View style={[st.line, { backgroundColor: c.card, borderColor: c.line }]}>
      <Pressable
        onPress={onToggle}
        disabled={!editable}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: ex.done, disabled: !editable }}
        accessibilityLabel={ex.title}
        style={st.lineMain}
      >
        <View style={[st.check, ex.done ? { backgroundColor: c.sky, borderColor: c.sky } : { borderColor: c.line }]}>
          {ex.done ? <SymbolView name="checkmark" size={12} weight="bold" tintColor="#fff" /> : null}
        </View>
        <View style={{ flex: 1, gap: 4 }}>
          <View style={[s.wrap, { alignItems: 'center' }]}>
            <Text style={[s.bodyBold, { color: ex.done ? c.ink : c.muted }]}>{ex.title}</Text>
            <Text style={[s.tiny, s.tag, { color: c.muted, backgroundColor: c.chip }]}>{ex.category}</Text>
          </View>
          <Text style={[s.tiny, { color: c.muted }]}>
            {ex.done ? (
              <>
                {amount ? <Text style={{ color: c.sky, fontWeight: '700' }}>{amount}</Text> : '마친 것으로 표시함'}
                {planned ? ` · ${planned}` : ''}
              </>
            ) : (
              ['안 한 것으로 남음', planned].filter(Boolean).join(' · ')
            )}
          </Text>
        </View>
      </Pressable>
      <Pressable onPress={onHistory} accessibilityRole="button" accessibilityLabel={`${ex.title} 기록 보기`} style={st.historyBtn}>
        <SymbolView name="chart.xyaxis.line" size={16} tintColor={c.muted} />
      </Pressable>
    </View>
  );
}

/** 날짜 띠 — 최근 6주를 옆으로 굴린다. 칸 밑 점은 그날 한 것(운동 · 암케어 · 메커니즘). 고른 날로 처음부터 굴려 둔다 */
function Strip({ days, date, today, c }: { days: AppTrainingDay['strip']; date: string; today: string; c: Palette }) {
  const scroll = useRef<ScrollViewInstance>(null);
  const pick = (key: string) => {
    if (key === date) return;
    void Haptics.selectionAsync();
    /* 오늘은 '오늘 운동' 화면 — 이 화면은 거기서 열렸다 */
    if (key === today) router.back();
    else router.setParams({ date: key });
  };
  return (
    <ScrollView ref={scroll} horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
      {days.map((day) => {
        const on = day.date === date;
        const d = dayOf(day.date);
        const dots = [day.workout, day.armcare, day.drill];
        const done = [day.workout && '운동', day.armcare && '암케어', day.drill && '메커니즘'].filter(Boolean).join(' · ');
        return (
          <Pressable
            key={day.date}
            onLayout={on ? (e) => scroll.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 120), animated: false }) : undefined}
            onPress={() => pick(day.date)}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            accessibilityLabel={`${d.month}월 ${d.day}일 ${done || '기록 없음'}`}
            style={[st.day, { backgroundColor: on ? c.sky : c.card }]}
          >
            <Text style={[s.tiny, { color: on ? '#fff' : c.muted }]}>{day.date === today ? '오늘' : d.week}</Text>
            <Text style={[s.bodyBold, { color: on ? '#fff' : c.ink }]}>{d.day}</Text>
            <View style={st.dots}>{dots.map((x, i) => (x ? <View key={i} style={[st.dot, { backgroundColor: on ? '#fff' : c.sky }]} /> : null))}</View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/* ----------------------------- 운동 하나의 지난 기록 ----------------------------- */

/** '2026-09-20' → '9월 20일'. 올해가 아니면 해를 붙인다(웹 exercise-history.tsx 와 같다) */
function dayLabel(key: string) {
  const d = dayOf(key);
  return d.year === new Date().getFullYear() ? `${d.month}월 ${d.day}일` : `${d.year}년 ${d.month}월 ${d.day}일`;
}
/** 그날 한 양 — '1,240kg' · '45회' · '3분 20초' */
function volumeText(kind: HistoryKind, value: number, unit: WeightUnit) {
  if (kind === 'weight') return `${Math.round(volumeIn(value, unit)).toLocaleString('ko-KR')}${unit}`;
  if (kind === 'reps') return `${value.toLocaleString('ko-KR')}회`;
  return formatSeconds(value);
}
/** 하루를 한 줄로 — 세트별로 남긴 날은 '62.5kg×8 · 12회', 아니면 요약 */
function dayText(day: HistoryDay, unit: WeightUnit) {
  if (!day.sets) return formatAmount(day, unit) ?? '한 것으로 표시함';
  return day.sets
    .map((x) => {
      const w = x.weightKg != null && x.weightKg > 0 ? formatWeight(x.weightKg, unit) : null;
      const amount = x.holdSeconds != null ? formatSeconds(x.holdSeconds) : x.reps != null ? `${x.reps}회` : '?';
      return w ? `${w}×${amount.replace('회', '')}` : amount;
    })
    .join(' · ');
}

/** 최근 기록 몇 개 · 흐름 막대 몇 개(웹과 같다) */
const SHOWN = 8;
const TREND_POINTS = 12;

/** 지난 기록 — 내 메모 · 최고 기록 셋 · 볼륨 흐름(막대를 누르면 그날 값) · 최근 날짜별 기록. 열 때 받는다 */
function HistoryPanel({ exerciseId, unit, c }: { exerciseId: string; unit: WeightUnit; c: Palette }) {
  const [got, setGot] = useState<{ history: ExerciseHistory; note: string | null } | { error: string } | null>(null);
  const [more, setMore] = useState(false);
  const [hover, setHover] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    void act<{ history: ExerciseHistory; note: string | null }>('exercise-history.exerciseHistory', { exerciseId }).then((r) => {
      if (alive) setGot(r);
    });
    return () => {
      alive = false;
    };
  }, [exerciseId]);

  if (!got) return <Text style={[s.small, s.center, { color: c.muted, paddingVertical: 24 }]}>기록을 불러오는 중…</Text>;
  if ('error' in got) return <Text style={[s.small, s.center, st.empty, { color: c.muted, backgroundColor: c.card }]}>{got.error}</Text>;

  const { history, note } = got;
  const { kind, days } = history;
  const noteBox = note ? (
    <View style={[s.box, { backgroundColor: c.card, gap: 4 }]}>
      <Text style={[s.smallBold, { color: c.muted }]}>내 메모</Text>
      <Text selectable style={[s.body, { color: c.ink }]}>
        {note}
      </Text>
    </View>
  ) : null;
  if (days.length === 0) {
    return (
      <View style={{ gap: 12 }}>
        {noteBox}
        <Text style={[s.small, s.center, st.empty, { color: c.muted, backgroundColor: c.card }]}>아직 이 운동을 한 기록이 없어요. 운동을 마치면 여기에 쌓여요.</Text>
      </View>
    );
  }

  const w = (kg: number) => formatWeight(kg, unit) ?? '';
  const first =
    kind === 'weight' && history.bestWeight
      ? { label: '최고 무게', value: w(history.bestWeight.kg), sub: dayLabel(history.bestWeight.date) }
      : kind === 'hold' && history.bestHold
        ? { label: '가장 오래', value: formatSeconds(history.bestHold.seconds), sub: dayLabel(history.bestHold.date) }
        : history.bestReps
          ? { label: '한 세트 최다', value: `${history.bestReps.reps}회`, sub: dayLabel(history.bestReps.date) }
          : { label: '마지막', value: dayLabel(days[0].date), sub: null };
  const second =
    kind === 'weight' && history.bestSet
      ? { label: '추정 1RM', value: w(history.bestSet.e1rm), sub: `${w(history.bestSet.weightKg)} × ${history.bestSet.reps}회` }
      : { label: '모두', value: `${history.total}번`, sub: `마지막 ${dayLabel(days[0].date)}` };
  const third = { label: '최근 4주', value: `${history.last28}번`, sub: kind === 'weight' && history.bestSet ? `모두 ${history.total}번` : null };

  /* 흐름에 올리는 날 — 양을 셀 수 있는 최근 날들, 막대는 오래된 것부터 */
  const trendDays = days.filter((x): x is HistoryDay & { volume: number } => x.volume != null).slice(0, TREND_POINTS);
  const trend = [...trendDays].reverse();
  const max = Math.max(...trend.map((x) => x.volume), 1);
  const peak = trend.reduce((a, b) => (b.volume > a.volume ? b : a), trend[0]);
  const picked = hover == null ? null : trend[hover];
  const shown = more ? days : days.slice(0, SHOWN);

  return (
    <View style={{ gap: 16 }}>
      {noteBox}
      <View style={s.row}>
        {[first, second, third].map((x) => (
          <View key={x.label} style={[st.stat, { backgroundColor: c.card }]}>
            <Text style={[s.tiny, { color: c.muted }]}>{x.label}</Text>
            <Text numberOfLines={1} style={[s.bodyBold, { color: c.ink }]}>
              {x.value}
            </Text>
            {x.sub ? (
              <Text numberOfLines={1} style={[s.tiny, { color: c.muted }]}>
                {x.sub}
              </Text>
            ) : null}
          </View>
        ))}
      </View>

      {trend.length >= 2 ? (
        <View style={{ gap: 6 }}>
          <View style={s.between}>
            <Text style={[s.tiny, { color: c.muted }]}>
              {picked ? dayLabel(picked.date) : `${kind === 'weight' ? '볼륨(무게×횟수)' : kind === 'reps' ? '횟수 합' : '버틴 시간 합'} · 최근 ${trend.length}번`}
            </Text>
            <Text style={[s.tiny, { color: picked ? c.sky : c.muted, fontWeight: picked ? '700' : '400' }]}>
              {picked ? volumeText(kind, picked.volume, unit) : `가장 많이 ${volumeText(kind, peak.volume, unit)}`}
            </Text>
          </View>
          <View style={[st.bars, { borderBottomColor: c.line }]}>
            {trend.map((x, i) => (
              <Pressable
                key={x.date}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setHover(hover === i ? null : i);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${dayLabel(x.date)} ${volumeText(kind, x.volume, unit)}`}
                style={st.barSlot}
              >
                <View
                  style={[
                    st.barFill,
                    { height: `${Math.max(4, (x.volume / max) * 100)}%`, backgroundColor: c.sky, opacity: hover != null && hover !== i ? 0.35 : 1 },
                  ]}
                />
              </Pressable>
            ))}
          </View>
          <View style={s.between}>
            <Text style={[s.tiny, { color: c.muted }]}>{dayLabel(trend[0].date)}</Text>
            <Text style={[s.tiny, { color: c.muted }]}>{dayLabel(trend[trend.length - 1].date)}</Text>
          </View>
          {trendDays.some((x) => x.approx) ? (
            <Text style={[s.tiny, { color: c.muted }]}>세트를 하나씩 남기지 않은 날은 요약(세트 × 횟수 × 가장 무거운 무게)으로 어림했어요.</Text>
          ) : null}
        </View>
      ) : null}

      <View style={{ gap: 6 }}>
        <Text style={[s.smallBold, { color: c.muted }]}>최근 기록</Text>
        <View style={[st.list, { backgroundColor: c.card }]}>
          {shown.map((x, i) => (
            <View key={x.date} style={[st.listRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
              <View style={s.between}>
                <Text style={[s.smallBold, { color: c.ink }]}>{dayLabel(x.date)}</Text>
                {x.volume != null ? (
                  <Text style={[s.tiny, { color: c.muted }]}>
                    {x.approx ? '약 ' : ''}
                    {volumeText(kind, x.volume, unit)}
                  </Text>
                ) : null}
              </View>
              <Text style={[s.tiny, { color: c.muted }]}>{dayText(x, unit)}</Text>
            </View>
          ))}
        </View>
        {!more && days.length > SHOWN ? (
          <Pressable onPress={() => setMore(true)} accessibilityRole="button" style={[s.textBtn, { alignSelf: 'center' }]}>
            <Text style={[s.smallBold, { color: c.sky }]}>{days.length - SHOWN}번 더 보기</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingLeft: 14, paddingRight: 4 },
  empty: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 32, overflow: 'hidden' },
  line: { flexDirection: 'row', alignItems: 'flex-start', borderRadius: 16, borderWidth: 1 },
  lineMain: { flex: 1, flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingLeft: 14 },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  historyBtn: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  day: { width: 48, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dots: { flexDirection: 'row', gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  stat: { flex: 1, minWidth: 0, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
  bars: { height: 64, flexDirection: 'row', alignItems: 'flex-end', borderBottomWidth: StyleSheet.hairlineWidth },
  barSlot: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  barFill: { width: '60%', maxWidth: 22, minWidth: 4, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  list: { borderRadius: 12, overflow: 'hidden' },
  listRow: { paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
});
