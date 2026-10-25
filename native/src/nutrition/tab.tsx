import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, AppState, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MEALS, amountText, entryMacros, gapNames, macroGaps, mealLabel, missingMacros, missingText, stepAmount, type EntryEdit, type MealEntryView, type MealKey } from '@/lib/nutrition/meta';
import { mealProtein } from '@/lib/nutrition/meal-protein';
import { shiftDateKey } from '@/lib/pitch-stats';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import Animated from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { Icon } from '~/shell/icon';
import { CountUp, Pulse, fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { SectionHead, Segmented } from '~/shell/heading';
import { DateStrip, StripBar } from '~/shell/date-strip';
import { DateNavButton } from '~/shell/mini-calendar';
import { useTabIntent } from '~/shell/tab-intent';
import { PLAN_PLACES, type PlanItem } from '@/lib/nutrition/meal-plan';
import type { Place } from '@/lib/nutrition/meal-templates';
import { SNOOZE_KEY, clearPlan, eatPlan, editEntries, isSnoozed, makePlan, useNutritionDay } from './api';
import { cacheGet } from '~/lib/store';
import { READABLE } from '~/lib/layout';
import { NutritionCheckinCard } from './checkin-card';
import { useFocusRefresh, useOnTabActive, useRetapTop, useTabActive } from '~/shell/tab-pager';

/**
 * 영양 탭(앱 화면) — 웹 영양 탭의 '기록' 쪽: 오늘 먹은 것과 목표(kcal · 탄 · 단 · 지) · 끼니마다 담은 음식(양 바꾸기 · 지우기). 체중은 웹처럼 통계(/nutrition/stats).
 * 담기는 음식 고르기 화면(/nutrition/add — 검색 · 최근 · 내 음식 · 바코드), 식단 짜기는 이 탭 안, 목표 · 통계는 /nutrition/stats. 첫 설정만 웹(onWebNutrition).
 * 날짜는 오늘부터 지난 6주까지 ‹ › 로.
 */
/* 날짜 띠는 최근 6주, 띠 끝 작은 달력으로 1년 전까지(웹 NUTRITION_BACK_DAYS) */
const BACK_DAYS = 366;

const round = (n: number) => Math.round(n);
const kcalText = (n: number) => `${round(n).toLocaleString('ko-KR')}kcal`;

export function NutritionTab({ today, bottom, onWebNutrition }: { today: string; bottom: number; onWebNutrition: () => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  /* 끼니 편집 — 웹처럼 한 끼니씩. 고친 값(초안)은 '완료'를 누를 때 한 번에 저장(nutrition.editMealEntries), '취소'면 버린다 */
  const [editing, setEditing] = useState<MealKey | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [date, setDateRaw] = useState(today);
  /* 자정을 넘겨 껍데기가 새 오늘을 내려주면, 옛 오늘을 보고 있던 화면도 따라간다(안 그러면 어제에 머물러 식단 · 체크인 카드가 숨었다) */
  const [seenToday, setSeenToday] = useState(today);
  if (seenToday !== today) {
    setSeenToday(today);
    if (date === seenToday) setDateRaw(today);
  }
  /* 날을 바꾸면 펴 둔 편집은 버린다 — 다른 날에 저장되지 않게 */
  const setDate = (d: string) => {
    setDateRaw(d);
    setEditing(null);
    setDrafts({});
  };
  const { day, error, to, reload } = useNutritionDay(date);
  /* 탭을 옮겼다 돌아오면 새로 받는다(1번 판 넘기기 — 판이 붙어 있어 마운트로는 안 받는다) */
  /* 지금 탭(영양)을 다시 누르면 맨 위로(1번 세션 — 앱 틀) */
  const topRef = useRef<ScrollViewInstance>(null);
  useRetapTop(() => topRef.current?.scrollTo({ y: 0, animated: true }));

  useOnTabActive(() => void reload());
  /* 위에 쌓은 화면(음식 담기 · 통계)에서 돌아올 때 · 앱을 다시 열 때도 — 다른 기기 · 웹에서 담은 것이 보이게. 처음 붙을 때는 훅이 받는다 */
  const tabActive = useTabActive();
  const activeRef = useRef(tabActive);
  const reloadRef = useRef(reload);
  useEffect(() => {
    activeRef.current = tabActive;
    reloadRef.current = reload;
  });
  useFocusRefresh(() => void reloadRef.current());
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && activeRef.current) void reloadRef.current();
    });
    return () => sub.remove();
  }, []);
  /* 홈 그날 칸의 '영양 탭에서 자세히' — 그날로 연다(웹 /nutrition?date=) */
  useTabIntent('nutrition', (d) => setDate(d));
  const [busy, setBusy] = useState(false);
  const running = useRef(false);
  /* 펴 둔 끼니(휴대폰 웹처럼 한 줄로 접어 두고 누르면 편다) */
  const [openMeals, setOpenMeals] = useState<MealKey[]>([]);
  /* 체중 권유 '그대로 둘게요'(통계 화면이 폰에 남김) — 통계에서 돌아올 때마다 다시 읽는다 */
  const [snooze, setSnooze] = useState<string | null>(null);
  useFocusEffect(
    useCallback(() => {
      void cacheGet(SNOOZE_KEY).then((v) => setSnooze(typeof v === 'string' ? v : null));
    }, [])
  );

  if (to)
    return (
      <View style={[styles.center, { backgroundColor: c.page, paddingBottom: bottom }]}>
        <Text style={{ color: c.ink, fontSize: 17, textAlign: 'center' }}>{error}</Text>
        <Press accessibilityRole="button" onPress={onWebNutrition} style={[styles.primary, { backgroundColor: c.action }]}>
          <Text style={styles.primaryText}>영양 설정하기</Text>
        </Press>
      </View>
    );

  const eaten = (day?.entries ?? []).reduce(
    (a, e) => {
      const m = entryMacros(e);
      return { kcal: a.kcal + m.kcal, carbs: a.carbs + m.carbs, protein: a.protein + m.protein, fat: a.fat + m.fat };
    },
    { kcal: 0, carbs: 0, protein: 0, fat: 0 }
  );
  /* 탄 · 단 · 지 정보가 빠진 음식 수 — 오늘 카드의 '+'(적어도 이만큼)와 밑 한 줄(웹 TodayCard gaps) */
  const gaps = macroGaps(day?.entries ?? []);
  const t = day?.targets;
  const left = t ? t.kcal - eaten.kcal : 0;
  /* 체중 흐름을 보고 목표를 바꿔 볼까요 — 던지는 날 가이드와 겹치지 않게(웹 TodayCard nudge) */
  const nudge = date === today && day?.suggestAdjust != null && !day.guide && !isSnoozed(snooze, today, day.suggestAdjust);
  const oldest = shiftDateKey(today, -BACK_DAYS);
  const [, m, d] = date.split('-').map(Number);

  /*
   * 같은 그림 안에서 두 번 누른 것도 막게 ref 로 본다 · 던져도 잠금이 풀리게 — catch 가 다 받아 뒤의 풀기가 늘 돈다(finally 는 React 컴파일러가
   * 영양 탭 전체를 건너뛰게 해 뺐다)
   */
  const run = async (job: () => Promise<string | null>): Promise<boolean> => {
    if (running.current) return false;
    running.current = true;
    setBusy(true);
    try {
      const err = await job();
      if (err) Alert.alert('저장하지 못했어요', err);
    } catch {
      Alert.alert('저장하지 못했어요', '신호를 확인하고 다시 해 주세요.');
    }
    running.current = false;
    setBusy(false);
    return true;
  };

  const startEdit = (meal: MealKey) => {
    setEditing(meal);
    setDrafts({});
  };
  const draftOf = (e: MealEntryView): Draft => {
    const d = drafts[e.id];
    if (!d) return { amount: e.amount, meal: e.meal, remove: false };
    /* 바꾸기 뒤(NaN)는 새 음식의 양 */
    return Number.isNaN(d.amount) ? { ...d, amount: e.amount } : d;
  };
  const finishEdit = (list: MealEntryView[]) => {
    const edits: EntryEdit[] = [];
    for (const e of list) {
      if (!drafts[e.id]) continue;
      const d = draftOf(e);
      if (d.remove) edits.push({ id: e.id, remove: true });
      else if (d.amount !== e.amount || d.meal !== e.meal)
        edits.push({ id: e.id, ...(d.amount !== e.amount ? { amount: d.amount } : {}), ...(d.meal !== e.meal ? { meal: d.meal } : {}) });
    }
    if (!edits.length) {
      setEditing(null);
      setDrafts({});
      return;
    }
    /* 다른 저장이 도는 중이면 초안을 버리지 않고 편집을 그대로 둔다(예전엔 말없이 사라졌다) */
    if (running.current) {
      Alert.alert('잠깐만요', '다른 저장이 끝나면 다시 완료를 눌러 주세요.');
      return;
    }
    /* 초안은 저장이 된 뒤에만 지운다 — 먼저 지우면 실패할 때(화면은 actFirst 가 되돌림) 고친 값이 통째로 사라졌다(2026-10-25 UI 검토 A04).
       실패하면 편집이 열린 채 같은 값이 남아 [완료]를 다시 누르면 된다 */
    void run(async () => {
      const err = await editEntries(date, edits);
      if (!err) {
        setEditing(null);
        setDrafts({});
      }
      return err;
    });
  };

  const strip = day?.strip ?? [];
  const share = t && t.kcal > 0 ? Math.round((eaten.kcal / t.kcal) * 100) : 0;
  const over = left < 0;
  const isToday = date === today;

  return (
    <ScrollView
      ref={topRef}
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: 16, gap: 20 }, READABLE]}
      keyboardShouldPersistTaps="handled"
    >
      {/* 머리 — 웹 영양 탭 휴대폰: 큰 제목 · 오른쪽 목표 단추(그림만), 밑에 날짜 띠(최근 6주) */}
      <View style={{ gap: 12 }}>
        <View style={styles.head}>
          <Text accessibilityRole="header" style={[TYPE.title, { color: c.ink }]}>영양</Text>
          <Press
            accessibilityRole="button"
            accessibilityLabel="영양 목표"
            onPress={() => router.push({ pathname: '/nutrition/stats' as Href as never, params: { date, goal: '1' } })}
            style={[styles.goalBtn, { borderColor: c.lineStrong, backgroundColor: c.card }]}
          >
            <Icon name="settings2" size={16} color={c.ink} />
          </Press>
        </View>
        {strip.length ? (
          <DateStrip
            days={strip.map((x) => x.date)}
            date={date}
            today={today}
            onPick={setDate}
            labelOf={(d) => {
              const k = strip.find((x) => x.date === d)?.kcal ?? 0;
              return k > 0 ? `${kcalText(k)} 먹음` : '기록 없음';
            }}
            mark={(d, selected) => {
              const x = strip.find((y) => y.date === d);
              return <StripBar pct={x && x.target > 0 ? (x.kcal / x.target) * 100 : 0} over={!!x && x.kcal > x.target} selected={selected} />;
            }}
            end={
              <DateNavButton
                date={date}
                today={today}
                min={oldest}
                marked={(k) => (day?.calendar?.[k] ?? 0) > 0}
                onPick={setDate}
              />
            }
          />
        ) : (
          <View style={styles.dateRow}>
            <Press accessibilityLabel="전날" disabled={date <= oldest} onPress={() => setDate(shiftDateKey(date, -1))} style={[styles.arrow, date <= oldest && { opacity: 0.3 }]}>
              <Text style={[styles.arrowText, { color: c.link }]}>‹</Text>
            </Press>
            <Text style={[styles.date, { color: c.ink }]}>{isToday ? '오늘' : `${m}월 ${d}일`}</Text>
            <Press accessibilityLabel="다음날" disabled={date >= today} onPress={() => setDate(shiftDateKey(date, 1))} style={[styles.arrow, date >= today && { opacity: 0.3 }]}>
              <Text style={[styles.arrowText, { color: c.link }]}>›</Text>
            </Press>
          </View>
        )}
      </View>

      {/* 기록 | 통계 — 통계(체중 · 최근 7일 · 내 계획)는 앱에선 따로 화면(/nutrition/stats) */}
      <Segmented
        label="기록과 통계"
        size="md"
        value="log"
        onChange={(v) => {
          if (v === 'stats') router.push({ pathname: '/nutrition/stats' as Href as never, params: { date } });
        }}
        options={[
          { value: 'log', label: '기록' },
          { value: 'stats', label: '통계' },
        ]}
      />

      {error && !day ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}

      {/* 오늘 영양 한 장(웹 TodayCard) — 링 · 남은 열량 · 균형 점수, 탄단지 세 칸, 할 일 한 줄(던지는 날은 가이드) */}
      {t ? (
        <Animated.View entering={fadeIn} style={[styles.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
          <View style={styles.todayTop}>
            <KcalRing share={share} over={over} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: c.muted, fontSize: 13 }}>{!isToday ? '이날 먹은 열량' : over ? '목표보다 더 먹었어요' : '남은 열량'}</Text>
              <Text style={[TYPE.num, TYPE.hero, { color: over && isToday ? c.warn : c.ink }]}>
                {/* 웹 TodayCard 와 같이 올라가며 나타남(from 0.7) */}
                <CountUp value={round(isToday ? Math.abs(left) : eaten.kcal)} from={1} />
                <Text style={[TYPE.unitLg, { color: c.muted }]}> kcal</Text>
              </Text>
              <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                {round(eaten.kcal).toLocaleString('ko-KR')} / {round(t.kcal).toLocaleString('ko-KR')}kcal
                {t.burn > 0 ? <Text style={{ color: c.link }}> · 운동 +{round(t.burn).toLocaleString('ko-KR')} 포함</Text> : null}
                {day?.adjust ? ` · 체중 조정 ${day.adjust > 0 ? '+' : '−'}${Math.abs(round(day.adjust)).toLocaleString('ko-KR')}` : ''}
              </Text>
            </View>
            {isToday && day?.advice?.score != null ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ color: c.ink, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{day.advice.score}</Text>
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 4 }}>균형</Text>
              </View>
            ) : null}
          </View>
          <View style={styles.macros}>
            {([
              ['carbs', '탄수화물', eaten.carbs, t.carbs],
              ['protein', '단백질', eaten.protein, t.protein],
              ['fat', '지방', eaten.fat, t.fat],
            ] as const).map(([key, label, got, goal]) => (
              <View key={label} style={{ flex: 1, gap: 6 }}>
                <View>
                  <Text style={{ color: c.muted, fontSize: 13 }}>{label}</Text>
                  <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                    <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{round(got)}</Text>
                    {/* 정보가 빠진 음식이 있으면 '+' — 적어도 이만큼, 실제로는 더 먹었다(뜻은 카드 밑 한 줄) */}
                    {gaps[key] > 0 ? (
                      <Text accessibilityLabel="이상, 정보가 없는 음식이 있어 실제로는 더 먹었어요" style={{ color: c.warn, fontWeight: '600' }}>
                        +
                      </Text>
                    ) : null}{' '}
                    / {round(goal)}g
                  </Text>
                </View>
                <View style={[styles.macroTrack, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
                  <View style={{ width: `${Math.min(100, goal > 0 ? (got / goal) * 100 : 0)}%`, height: '100%', borderRadius: 3, backgroundColor: c.action }} />
                </View>
              </View>
            ))}
          </View>
          {isToday && !day?.guide && day?.advice?.headline ? (
            <Text style={[styles.headline, { borderTopColor: c.line, color: day.advice.highlight ? c.skyStrong : c.ink }]}>{day.advice.headline}</Text>
          ) : null}
          {isToday && day?.guide ? <GuideBlock guide={day.guide} /> : null}
          {gaps.foods > 0 ? (
            <Text style={{ color: c.muted, fontSize: 13 }}>
              {gapNames(gaps)} 정보가 없는 음식이 {gaps.foods}개라, <Text style={{ color: c.warn, fontWeight: '600' }}>+</Text> 표시한 양은 실제보다 적게 잡혔어요.
            </Text>
          ) : null}
          {nudge ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', columnGap: 8 }}>
              <Text style={{ color: c.muted, fontSize: 13 }}>체중 흐름을 보고 목표를 조금 바꿔 볼까요?</Text>
              <Press
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/nutrition/stats' as Href as never, params: { date } })}
                style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 4 }}
              >
                <Text style={{ color: c.skyStrong, fontSize: 13, fontWeight: '600' }}>보기</Text>
              </Press>
            </View>
          ) : null}
          {day?.hasProfile && day.assumed?.length ? (
            <Text style={{ color: c.muted, fontSize: 13 }}>
              내 정보에 {day.assumed.map((a) => ASSUMED[a] ?? a).join(' · ')}{withObject(day.assumed.map((a) => ASSUMED[a] ?? a).at(-1) ?? '')} 넣으면 목표가 더 정확해져요.
            </Text>
          ) : null}
        </Animated.View>
      ) : !error ? (
        /* 불러오는 동안 — 실제 카드와 같은 틀(웹 nutrition/loading.tsx 처럼 회색 덩이가 깜빡임) */
        <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float, gap: 14 }]} accessibilityLabel="영양 기록을 불러오는 중이에요">
          <View style={styles.todayTop}>
            <Pulse style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: c.line }} />
            <View style={{ flex: 1, gap: 8 }}>
              <Pulse style={{ width: 60, height: 12, borderRadius: 6, backgroundColor: c.line }} />
              <Pulse style={{ width: 140, height: 28, borderRadius: 8, backgroundColor: c.line }} />
              <Pulse style={{ width: 110, height: 12, borderRadius: 6, backgroundColor: c.line }} />
            </View>
          </View>
          <View style={styles.macros}>
            {[0, 1, 2].map((i) => (
              <Pulse key={i} style={{ flex: 1, height: 34, borderRadius: 8, backgroundColor: c.line }} />
            ))}
          </View>
        </View>
      ) : null}

      {/* 오늘만 — 지난 날은 적을 수 없다. 오늘 카드(남은 열량 — 이 화면의 주인공) 밑으로(2026-10-21: 질문 카드가 먼저 보여 주인공을 밀어냈다) */}
      {day && isToday ? <NutritionCheckinCard date={date} answer={day.checkinAnswers ?? null} /> : null}

      {day && isToday && t ? <PlanCard date={date} plan={day.mealPlan} busy={busy} run={run} kcal={t.kcal} protein={t.protein} state={day.planState ?? null} ageBand={day.ageBand} /> : null}

      {/* 끼니 넷 — 한 판 안에 줄로(웹 끼니 칸 ul · 사이 선). 휴대폰은 한 줄로 접어 두고 누르면 편다 */}
      {day ? <SectionHead title={isToday ? '오늘 먹은 것' : '이날 먹은 것'} /> : null}
      {day ? (
        <View style={[styles.mealsCard, { backgroundColor: c.card, boxShadow: c.float }]}>
          {MEALS.map((meal, mi) => {
            const list = day.entries.filter((e) => e.meal === meal.key);
            const planned = (day.mealPlan?.items ?? []).filter((p) => p.meal === meal.key && !p.done);
            const kcal = list.reduce((n, e) => n + entryMacros(e).kcal, 0);
            /* 끼니 단백질 — 웹 끼니 칸과 같은 계산(목표 · 8할이면 채움 · 모자라면 예시). 나이 띠를 모르는 옛 자료면 목표 없이 */
            const p = day.ageBand
              ? mealProtein(meal.key, day.entries, t?.protein ?? 0, day.ageBand, day.avoid ?? [])
              : null;
            const protein = p?.protein ?? Math.round(list.reduce((n, e) => n + entryMacros(e).protein, 0));
            const isEditing = editing === meal.key;
            const hasAny = list.length > 0 || planned.length > 0;
            const shown = openMeals.includes(meal.key) || isEditing;
            /* 저장 중인 줄(tmp-)은 편집 · '모두 지우기'에서 뺀다 — 아직 서버 id 가 없어 고치면 엉뚱하게 저장된다 */
            const editable = list.filter((e) => !e.id.startsWith('tmp-'));
            const allRemoved = editable.length > 0 && editable.every((e) => draftOf(e).remove);
            const add = () => router.push({ pathname: '/nutrition/add' as Href as never, params: { date, meal: meal.key } });
            return (
              <View key={meal.key} style={[styles.mealRow, mi > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                {hasAny ? (
                  <Press
                    accessibilityRole="button"
                    accessibilityState={{ expanded: shown }}
                    onPress={() => setOpenMeals((cur) => (cur.includes(meal.key) ? cur.filter((k) => k !== meal.key) : [...cur, meal.key]))}
                    style={styles.mealLine}
                  >
                    <Text style={[styles.mealTitle, { color: c.ink }]}>{meal.label}</Text>
                    <Text numberOfLines={1} style={{ flex: 1, textAlign: 'right', color: p?.done ? c.ok : c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
                      {list.length ? `${kcalText(kcal)} · 단백질 ${protein}${p?.unknown ? '+' : ''}g` : `식단 ${planned.length}가지`}
                    </Text>
                    <View style={{ transform: [{ rotate: shown ? '180deg' : '0deg' }] }}>
                      <Icon name="chevron-down" size={16} color={c.muted} />
                    </View>
                  </Press>
                ) : (
                  <View style={styles.mealLine}>
                    <Text style={[styles.mealTitle, { color: c.ink }]}>{meal.label}</Text>
                    <View style={{ flex: 1 }} />
                    <Press accessibilityRole="button" accessibilityLabel={`${meal.label}에 음식 담기`} onPress={add} style={styles.addBtn}>
                      <Icon name="plus" size={16} color={c.link} />
                      <Text style={{ color: c.link, fontSize: 15, fontWeight: '400' }}>담기</Text>
                    </Press>
                  </View>
                )}
                {shown ? (
                  <Animated.View entering={fadeIn} style={{ gap: 6 }}>
                    <View style={styles.mealHead}>
                      <View style={{ flex: 1, gap: 4 }}>
                        {list.length ? (
                          <Text style={{ color: p?.done ? c.ok : c.muted, fontSize: 13, fontWeight: p?.done ? '600' : '400', fontVariant: ['tabular-nums'] }}>
                            {kcalText(kcal)} · {p?.done ? '✓ ' : ''}단백질 {protein}
                            {p?.unknown ? '+' : ''}
                            {p?.goal != null ? ` / 목표 ${p.goal}` : ''}g
                          </Text>
                        ) : null}
                        {list.length && p?.goal != null ? (
                          <View style={[styles.proteinTrack, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
                            <View style={{ width: `${Math.min(100, (p.protein / p.goal) * 100)}%`, height: '100%', borderRadius: 2, backgroundColor: p.done ? c.ok : c.sky }} />
                          </View>
                        ) : null}
                      </View>
                      {isEditing ? (
                        <>
                          <Press accessibilityRole="button" onPress={() => (setEditing(null), setDrafts({}))} style={styles.textBtn}>
                            <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>취소</Text>
                          </Press>
                          <Press accessibilityRole="button" onPress={() => finishEdit(editable)} style={styles.textBtn}>
                            <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>완료</Text>
                          </Press>
                        </>
                      ) : (
                        <>
                          <Press
                            accessibilityRole="button"
                            accessibilityLabel={`${meal.label} 편집`}
                            disabled={editable.length === 0}
                            onPress={() => startEdit(meal.key)}
                            style={[styles.textBtn, editable.length === 0 && { opacity: 0.4 }]}
                          >
                            <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>편집</Text>
                          </Press>
                          <Press accessibilityRole="button" accessibilityLabel={`${meal.label}에 음식 담기`} onPress={add} style={styles.addBtn}>
                            <Icon name="plus" size={16} color={c.link} />
                            <Text style={{ color: c.link, fontSize: 15, fontWeight: '400' }}>담기</Text>
                          </Press>
                        </>
                      )}
                    </View>
                    {list.map((e) =>
                      isEditing && !e.id.startsWith('tmp-') ? (
                        <EditRow
                          key={e.id}
                          entry={e}
                          draft={draftOf(e)}
                          onChange={(dr) => setDrafts((all) => ({ ...all, [e.id]: dr }))}
                          onReplace={() => {
                            /* 바꾸면 그 줄의 고친 양은 버린다(새 음식의 양을 따른다 — 웹 rowSig) · 옮기기 · 지우기는 그대로 */
                            setDrafts((all) => {
                              const dr = all[e.id];
                              if (!dr) return all;
                              return { ...all, [e.id]: { ...dr, amount: NaN } };
                            });
                            router.push({ pathname: '/nutrition/add' as Href as never, params: { date, meal: meal.key, entry: e.id, name: e.name } });
                          }}
                        />
                      ) : (
                        /* 줄을 누르면 그 끼니가 편집 모양이 된다(웹 MealSection onEdit) */
                        <EntryRow key={e.id} entry={e} onPress={() => startEdit(meal.key)} />
                      )
                    )}
                    {planned.length && !isEditing ? (
                      <PlanRows
                        items={planned}
                        onEat={(keys) => run(() => eatPlan(date, keys))}
                        onReplace={(it) => router.push({ pathname: '/nutrition/add' as Href as never, params: { date, meal: meal.key, plan: it.key, name: it.name } })}
                        busy={busy}
                      />
                    ) : null}
                    {isEditing ? (
                      <View style={styles.editFoot}>
                        <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>고친 것은 완료를 누르면 한 번에 저장돼요</Text>
                        <Press
                          accessibilityRole="button"
                          onPress={() =>
                            setDrafts((all) => {
                              const next = { ...all };
                              for (const e of editable) next[e.id] = { ...draftOf(e), remove: !allRemoved };
                              return next;
                            })
                          }
                          style={styles.textBtn}
                        >
                          <Text style={{ color: allRemoved ? c.link : c.danger, fontSize: 13, fontWeight: '400' }}>{allRemoved ? '모두 되살리기' : '모두 지우기'}</Text>
                        </Press>
                      </View>
                    ) : null}
                    {p?.tip && !isEditing ? (
                      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
                        단백질 <Text style={{ color: c.ink, fontWeight: '600' }}>{p.short}g</Text> 모자라요 · {p.tip.label}(+{p.tip.protein}g)이면{' '}
                        {p.tip.covers ? '채워요' : '거의 채워요'}
                      </Text>
                    ) : null}
                  </Animated.View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </ScrollView>
  );
}

/* 짐작으로 셈한 칸 — 웹 assumedText */
const ASSUMED: Record<string, string> = { weight: '체중', height: '키', age: '생년월일', sex: '성별' };
/* 마지막 낱말 받침으로 '을/를' */
function withObject(word: string) {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  if (code < 0 || code > 11171) return '를';
  return code % 28 ? '을' : '를';
}

/** 먹은 만큼 차는 링(웹 TodayCard 4.5rem) — 넘치면 한 바퀴 · 경고색 */
function KcalRing({ share, over }: { share: number; over: boolean }) {
  const c = usePalette();
  const ring = Math.max(0, Math.min(100, share));
  const r = 27;
  const len = 2 * Math.PI * r;
  return (
    <View accessibilityRole="image" accessibilityLabel={`목표의 ${share}% 먹음`} style={{ width: 72, height: 72, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={72} height={72} viewBox="0 0 64 64" style={StyleSheet.absoluteFill}>
        <Circle cx={32} cy={32} r={r} fill="none" strokeWidth={7} stroke={withAlpha(c.ink, 0.08)} />
        {ring > 0 ? (
          <Circle
            cx={32}
            cy={32}
            r={r}
            fill="none"
            strokeWidth={7}
            strokeLinecap="round"
            stroke={over ? c.warn : c.sky}
            strokeDasharray={`${len} ${len}`}
            strokeDashoffset={len * (1 - ring / 100)}
            transform="rotate(-90 32 32)"
          />
        ) : null}
      </Svg>
      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{share}%</Text>
    </View>
  );
}

/** 던지는 날 가이드(웹 GuideCard bare) — 이름표 · 제목 · 첫 줄, 나머지는 '더 보기' */
function GuideBlock({ guide }: { guide: NonNullable<NonNullable<ReturnType<typeof useNutritionDay>['day']>['guide']> }) {
  const c = usePalette();
  const [more, setMore] = useState(false);
  const rest = [...guide.lines.slice(1), ...guide.notes];
  return (
    <View style={[styles.guide, { borderTopColor: c.line }]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Text style={[styles.badge, { color: c.skyStrong, backgroundColor: c.skyTint }]}>{guide.badge}</Text>
        <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '600' }}>{guide.title}</Text>
      </View>
      {guide.lines[0] ? <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>{guide.lines[0]}</Text> : null}
      {more ? rest.map((l, i) => <Text key={i} style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>· {l}</Text>) : null}
      {more && guide.hint ? <Text style={{ color: c.muted, fontSize: 13 }}>{guide.hint}</Text> : null}
      {rest.length || guide.hint ? (
        <Press accessibilityRole="button" onPress={() => setMore((v) => !v)} style={styles.moreBtn}>
          <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>{more ? '접기' : '더 보기'}</Text>
        </Press>
      ) : null}
    </View>
  );
}

/**
 * 식단 짜기(오늘만) — 웹 영양 탭 식단 카드와 같은 서버 셈. 짜기 전: 오늘 훈련 장소 · 더운 날 → [식단 짜기]. 짠 뒤: 까닭 몇 줄 ·
 * [다른 식단으로](같은 조건의 다음 식단) · [지우기]. 계획 줄은 끼니 칸에 흐리게 서고, 먹었으면 동그라미로 먹은 기록이 된다.
 */
function PlanCard({
  date,
  plan,
  busy,
  run,
  kcal,
  protein,
  state,
  ageBand,
}: {
  date: string;
  kcal: number;
  protein: number;
  /** 오늘 상태 · 취향 한 줄(웹 PlanCard state) — 옛 서버면 null */
  state: string[] | null;
  /** 성장기 단백질 한 줄(웹 childNote) */
  ageBand?: string;
  plan: { items: PlanItem[]; context: { place: Place; hot: boolean; variant: number; reasons: string[]; target?: { kcal: number; protein: number } } } | null;
  busy: boolean;
  run: (job: () => Promise<string | null>) => Promise<boolean>;
}) {
  const c = usePalette();
  const [place, setPlace] = useState<Place>(plan?.context.place ?? 'home');
  const [hot, setHot] = useState(plan?.context.hot ?? false);
  /* 아직 안 짰으면 한 줄 '오늘 식단 짜기'로 접어 두고 누르면 펴진다(웹 plan-parts PlanCard 휴대폰) */
  const [open, setOpen] = useState(false);
  const chip = (key: string, label: string, on: boolean, press: () => void) => (
    <View key={key} style={styles.gridCell}>
      <Press
        select
        selected={on}
        accessibilityRole="button"
        accessibilityState={{ selected: on }}
        onPress={press}
        style={[styles.gridChip, on ? { borderColor: c.sky, backgroundColor: withAlpha(c.sky, 0.1) } : { backgroundColor: withAlpha(c.ink, 0.06) }]}
      >
        {key === 'hot' && on ? <Icon name="check" size={14} color={c.link} /> : null}
        <Text numberOfLines={1} style={{ color: on ? c.link : withAlpha(c.ink, 0.8), fontSize: 15, fontWeight: on ? '600' : '400' }}>
          {label}
        </Text>
      </Press>
    </View>
  );
  /* 오늘 상태 · 취향 한 줄 + [취향 바꾸기](웹 PlanCard state · onOpenPrefs) — 짜기 전 · 짠 뒤 둘 다 */
  const openPrefs = () => router.push({ pathname: '/nutrition/stats' as Href as never, params: { date, goal: '1', tab: 'diet' } });
  const stateLine = state ? (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 6 }}>
      {state.length ? <Text style={{ color: c.muted, fontSize: 13 }}>{state.join(' · ')}</Text> : null}
      <Press accessibilityRole="button" onPress={openPrefs} hitSlop={10}>
        <Text style={{ color: c.skyStrong, fontSize: 13, fontWeight: '600' }}>취향 바꾸기</Text>
      </Press>
    </View>
  ) : null;
  const envChips = (
    <>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>오늘 훈련 장소</Text>
      <View style={styles.grid}>
        {PLAN_PLACES.map((p) => chip(p.key, p.label, place === p.key, () => setPlace(p.key)))}
        {chip('hot', '더운 날 야외', hot, () => setHot((h) => !h))}
      </View>
    </>
  );
  if (plan) {
    /* 웹 PlanCard '짜 둔 계획': 머리 한 줄(남은 계획 kcal · 단백질 · 가지) + [다른 식단으로] + 펼치기(까닭 · 조건 · 다시 짜기 · 지우기) */
    const left = plan.items.filter((p) => !p.done);
    const total = left.reduce(
      (a, p) => ({ kcal: a.kcal + p.kcal * p.amount, protein: a.protein + (p.protein ?? 0) * p.amount }),
      { kcal: 0, protein: 0 }
    );
    /* 성장기 한 줄은 계획 전체로 본다(남은 것만 보면 먹을수록 줄어 사라진다) */
    const planProtein = plan.items.reduce((n, p) => n + (p.protein ?? 0) * p.amount, 0);
    const childNote = ageBand != null && ageBand !== 'adult' && planProtein > (plan.context.target?.protein || 1) * 1.3;
    return (
      <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float, gap: 8 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>오늘 식단</Text>
            <Text style={{ color: c.muted, fontSize: 13, fontVariant: ['tabular-nums'] }}>
              {left.length > 0 ? `남은 계획 ${kcalText(total.kcal)} · 단백질 ${Math.round(total.protein)}g · ${left.length}가지` : '계획한 것을 다 먹었어요'}
            </Text>
          </View>
          <Press
            accessibilityRole="button"
            disabled={busy}
            onPress={() => run(() => makePlan(date, plan.context.place, plan.context.hot, plan.context.variant + 1))}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 8, opacity: busy ? 0.6 : 1 }}
          >
            <Icon name="refresh-cw" size={14} color={c.link} />
            <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>다른 식단으로</Text>
          </Press>
          <Press
            accessibilityRole="button"
            accessibilityLabel={open ? '까닭 · 조건 접기' : '까닭 · 조건 보기'}
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen((v) => !v)}
            style={{ width: 40, height: 40, alignItems: 'center', justifyContent: 'center', marginRight: -8 }}
          >
            <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
              <Icon name="chevron-down" size={16} color={c.muted} />
            </View>
          </Press>
        </View>
        {open ? (
          <Animated.View entering={fadeIn} style={{ gap: 12 }}>
            <View style={{ gap: 4 }}>
              {[...plan.context.reasons, ...(childNote ? ['성장기에는 단백질이 목표보다 조금 많아도 괜찮아요. 밥 · 반찬을 골고루 먹는 것이 먼저예요.'] : [])].map((r, i) => (
                <Text key={i} style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
                  <Text style={{ color: c.link }}>· </Text>
                  {r}
                </Text>
              ))}
            </View>
            {stateLine}
            {envChips}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
              <Press
                accessibilityRole="button"
                disabled={busy}
                onPress={() => run(() => makePlan(date, place, hot, plan.context.variant))}
                style={[styles.ghostBtn, { backgroundColor: c.action, opacity: busy ? 0.6 : 1 }]}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>이 조건으로 다시 짜기</Text>
              </Press>
              <Press accessibilityRole="button" onPress={openPrefs} style={{ minHeight: 40, justifyContent: 'center', paddingHorizontal: 8 }}>
                <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '400' }}>취향 바꾸기</Text>
              </Press>
              <Press
                accessibilityRole="button"
                disabled={busy}
                onPress={() =>
                  Alert.alert('오늘 식단을 지울까요?', '먹었어요로 기록한 음식은 그대로 남아요.', [
                    { text: '취소', style: 'cancel' },
                    { text: '지우기', style: 'destructive', onPress: () => void run(() => clearPlan(date)) },
                  ])
                }
                style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 8, opacity: busy ? 0.6 : 1 }}
              >
                <Icon name="trash2" size={16} color={c.danger} />
                <Text style={{ color: c.danger, fontSize: 15, fontWeight: '400' }}>식단 지우기</Text>
              </Press>
            </View>
            <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
              안 먹은 계획은 먹은 칼로리에 안 들어가요. 끼니 칸의 동그라미를 누르면 먹은 것으로 기록돼요.
            </Text>
          </Animated.View>
        ) : null}
      </View>
    );
  }
  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={styles.planHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>오늘 식단 짜기</Text>
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
            {kcalText(kcal)} · 단백질 {Math.round(protein)}g에 맞춰, 오늘 상태와 취향대로 짜요.
          </Text>
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={16} color={c.muted} />
        </View>
      </Press>
      {open ? (
        <Animated.View entering={fadeIn} style={{ gap: 12 }}>
          {stateLine}
          {envChips}
          <Press
            accessibilityRole="button"
            disabled={busy}
            onPress={() => run(() => makePlan(date, place, hot, 0))}
            style={[styles.primary, { backgroundColor: c.action }, busy && { opacity: 0.5 }]}
          >
            <Text style={styles.primaryText}>{busy ? '짜는 중…' : '식단 짜기'}</Text>
          </Press>
        </Animated.View>
      ) : null}
    </View>
  );
}

/** 끼니 칸 안의 계획 줄 — 흐린 줄, 동그라미 = 먹었어요, 끼니째 '모두 먹었어요' */
function PlanRows({
  items,
  onEat,
  onReplace,
  busy,
}: {
  items: PlanItem[];
  onEat: (keys: string[]) => void;
  /** 이름을 누르면 다른 음식으로 바꾸기(웹 PlanBlock onReplace) */
  onReplace: (item: PlanItem) => void;
  busy: boolean;
}) {
  const c = usePalette();
  return (
    <View style={{ gap: 2 }}>
      {items.map((p) => (
        <View key={p.key} style={[styles.entry, { opacity: 0.75 }]}>
          <Press
            accessibilityRole="button"
            accessibilityLabel={`${p.name} 먹었어요`}
            disabled={busy}
            onPress={() => onEat([p.key])}
            hitSlop={11}
            style={[styles.eat, { borderColor: c.sky }]}
          />
          <Press accessibilityRole="button" accessibilityLabel={`${p.name} 다른 음식으로 바꾸기`} onPress={() => onReplace(p)} style={{ flex: 1 }}>
            <Text style={{ color: c.ink, fontSize: 15 }} numberOfLines={1}>
              식단 · {p.name}
            </Text>
          </Press>
          <Text style={{ color: c.muted, fontSize: 15 }}>
            {p.amount !== 1 ? `${amountText(p.amount)} · ` : ''}
            {kcalText(p.kcal * p.amount)}
          </Text>
        </View>
      ))}
      {items.length > 1 ? (
        <Press accessibilityRole="button" disabled={busy} onPress={() => onEat(items.map((p) => p.key))} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}>
          <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>모두 먹었어요</Text>
        </Press>
      ) : null}
    </View>
  );
}

type Draft = { amount: number; meal: MealKey; remove: boolean };

/** 끼니 칸의 음식 한 줄 — 웹 nutrition-view EntryLine 과 같은 글: 이름 · 양 · 빠진 영양소 · 1인분 크기 / kcal. 저장 중인 줄(tmp-)은 흐리게, 못 누름 */
function EntryRow({ entry, onPress }: { entry: MealEntryView; onPress: () => void }) {
  const c = usePalette();
  const m = entryMacros(entry);
  const missing = missingMacros(entry);
  const saving = entry.id.startsWith('tmp-');
  return (
    <Press accessibilityRole="button" accessibilityHint="끼니 편집" disabled={saving} onPress={onPress} style={styles.entry}>
      <Text style={{ flex: 1, color: c.ink, fontSize: 15 }} numberOfLines={1}>
        {entry.name}
        {/* 빠진 영양소는 양 바로 뒤에 — 줄이 좁으면 뒤쪽부터 잘려서, 끝에 두면 안 보인다(웹과 같다) */}
        <Text style={{ color: c.muted, fontSize: 13 }}>
          {'  '}
          {amountText(entry.amount)}
          {missing.length > 0 ? ` · ${missingText(missing)}` : ''}
          {entry.servingLabel ? ` · ${entry.servingLabel}` : ''}
        </Text>
      </Text>
      <Text style={{ color: c.ink, fontSize: 15, fontVariant: ['tabular-nums'], opacity: saving ? 0.5 : 1 }}>
        {round(m.kcal).toLocaleString('ko-KR')}
        <Text style={{ color: c.muted, fontSize: 13 }}> kcal</Text>
      </Text>
    </Press>
  );
}

/** 끼니 편집의 한 줄 — 웹 nutrition-view.tsx EditRow 와 같은 칸: 양 −/+ · 다른 끼니로 옮기기 · 지우기(되살리기) */
function EditRow({
  entry,
  draft,
  onChange,
  onReplace,
}: {
  entry: MealEntryView;
  draft: Draft;
  onChange: (d: Draft) => void;
  /** 이름을 누르면 다른 음식으로 바꾸기(지운 줄은 못 바꾼다) */
  onReplace: () => void;
}) {
  const c = usePalette();
  const moved = draft.meal !== entry.meal;
  const move = () =>
    Alert.alert(
      `${entry.name} 옮기기`,
      undefined,
      [
        ...MEALS.map((m) => ({
          text: m.key === draft.meal ? `${m.label} ✓` : m.label,
          onPress: () => onChange({ ...draft, meal: m.key }),
        })),
        { text: '취소', style: 'cancel' as const },
      ]
    );
  return (
    <View style={styles.entry}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${entry.name} 다른 음식으로 바꾸기`}
        disabled={draft.remove}
        onPress={onReplace}
        style={{ flex: 1, opacity: draft.remove ? 0.45 : 1 }}
      >
        <Text style={{ color: c.ink, fontSize: 15, textDecorationLine: draft.remove ? 'line-through' : 'none' }} numberOfLines={1}>
          {entry.name}
        </Text>
        <Text style={{ color: c.muted, fontSize: 13 }} numberOfLines={1}>
          {kcalText(entry.kcal * draft.amount)}
          {moved && !draft.remove ? <Text style={{ color: c.link, fontWeight: '600' }}> · {mealLabel(draft.meal)}으로 옮김</Text> : null}
          {!draft.remove ? <Text style={{ color: c.link }}> · 바꾸기</Text> : null}
        </Text>
      </Press>
      {draft.remove ? (
        <Press accessibilityRole="button" onPress={() => onChange({ ...draft, remove: false })} style={styles.textBtn}>
          <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>되살리기</Text>
        </Press>
      ) : (
        <>
          <View style={[styles.stepper, { backgroundColor: c.chip }]}>
            <Press accessibilityLabel={`${entry.name} 줄이기`} onPress={() => onChange({ ...draft, amount: stepAmount(draft.amount, -1) })} style={styles.step}>
              <Text style={[styles.stepText, { color: c.ink }]}>−</Text>
            </Press>
            <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600', minWidth: 44, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
              {amountText(draft.amount)}
            </Text>
            <Press accessibilityLabel={`${entry.name} 늘리기`} onPress={() => onChange({ ...draft, amount: stepAmount(draft.amount, 1) })} style={styles.step}>
              <Text style={[styles.stepText, { color: c.ink }]}>+</Text>
            </Press>
          </View>
          <Press accessibilityRole="button" accessibilityLabel={`${entry.name} 다른 끼니로 옮기기`} onPress={move} style={styles.icon}>
            <Icon name="arrow-left-right" size={18} color={moved ? c.link : c.muted} />
          </Press>
          <Press accessibilityRole="button" accessibilityLabel={`${entry.name} 지우기`} onPress={() => onChange({ ...draft, remove: true })} style={styles.icon}>
            <Icon name="trash2" size={19} color={c.muted} />
          </Press>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  proteinTrack: { height: 4, width: 96, borderRadius: 2, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 34, fontWeight: '800', letterSpacing: -0.8 },
  goalBtn: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  todayTop: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  macros: { flexDirection: 'row', gap: 12 },
  macroTrack: { height: 6, borderRadius: 3, overflow: 'hidden' },
  headline: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  guide: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12, gap: 6 },
  badge: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  moreBtn: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  mealsCard: { borderRadius: 20, overflow: 'hidden' },
  mealRow: { paddingHorizontal: 16, paddingVertical: 8, gap: 6 },
  mealLine: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 40 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 40, paddingHorizontal: 10, marginRight: -8, borderRadius: 12 },
  planHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 8 },
  gridCell: { width: '33.333%', paddingHorizontal: 4 },
  gridChip: { flexDirection: 'row', gap: 4, minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  dateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: -8 },
  arrow: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontSize: 28 },
  date: { fontSize: 17, fontWeight: '600', minWidth: 90, textAlign: 'center' },
  card: { borderRadius: 20, padding: 20, gap: 12 },
  big: { fontSize: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  bigUnit: { fontSize: 17, fontWeight: '600' },
  barHead: { flexDirection: 'row', justifyContent: 'space-between' },
  track: { height: 8, borderRadius: 4, overflow: 'hidden' },
  fill: { height: 8, borderRadius: 4 },
  mealHead: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 40 },
  mealTitle: { fontSize: 15, fontWeight: '600' },
  add: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  addText: { fontSize: 15, fontWeight: '600' },
  entry: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  editFoot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4 },
  textBtn: { minHeight: 40, paddingHorizontal: 10, justifyContent: 'center', borderRadius: 12 },
  stepper: { flexDirection: 'row', alignItems: 'center', borderRadius: 12 },
  step: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  icon: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, fontWeight: '600' },
  weightRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  input: { flex: 1, minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  save: { height: 48, borderRadius: 24, paddingHorizontal: 20, justifyContent: 'center' },
  primary: { height: 48, borderRadius: 24, paddingHorizontal: 24, alignItems: 'center', justifyContent: 'center' },
  ghostBtn: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  placeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  placeChip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  hotRow: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  eat: { width: 22, height: 22, borderRadius: 11, borderWidth: 2 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
