import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedItem } from '@/lib/report/feed-items';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { PRESSED, SPACE, usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { REST_SESSION_TYPE } from '@/lib/session-type';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Wordmark } from '~/shell/wordmark';
import { fadeIn, Pulse, viewSwap } from '~/shell/motion';
import { openCheckin } from '~/shell/web-nav';
import { ApiError, call, dateKeyOf } from '~/pitch/api';
import { MonthGrid } from '~/pitch/month-grid';
import { monthOf, reloadVelocityDays, useAllLogs, useMonth, useVelocityDays } from '~/pitch/store';
import { loadHome, type AppHome, type HomeRing } from './api';
import { DayCards, layoutMove, resetDayCache } from './day-card';
import { reloadEvents, resetEventsCache, useEventCounts } from './events';
import { RecentList } from './recent-list';
import { Press } from '~/shell/press';
import { FeedCard } from './feed';
import { RingsCard } from './rings';
import { AllDone } from './all-done';
import { CameraSwipe } from './camera-swipe';
import { READABLE } from '~/lib/layout';
import { useOnTabActive, useRetapTop } from '~/shell/tab-pager';

/**
 * 홈 탭(앱 화면) — 웹 홈(app/(app)/today/home-page.tsx)과 같은 차례: 링 넷 → 요약 칸 → (알림 카드) → 투구 달력 → 고른 날 칸.
 * 숫자는 웹과 같은 서버 셈(app.loadAppHome). 받아 둔 값을 먼저 그리고 뒤에서 새로 받는다(검토 D10).
 * 아직 웹인 것(체크인 흐름 · 분석 · 달력 일정)은 onWeb 으로 웹 화면을 연다.
 */
let cached: AppHome | null = null;
/** 로그아웃 — 앞사람 홈을 지운다 */
export const resetHomeCache = () => {
  cached = null;
  resetDayCache();
  resetEventsCache();
};

export function HomeTab({
  today,
  bottom,
  onWeb,
  onTab,
}: {
  today: string;
  bottom: number;
  /** 웹 화면으로(체크인 · 분석 · 웹 홈) — 앱 화면을 걷는다 */
  onWeb: (href: string) => void;
  /** 다른 탭으로(트레이닝 · 영양) */
  onTab: (href: string) => void;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  /* 받아 둔 홈은 오늘 것일 때만 먼저(자정을 넘겨 켜 둔 앱이 어제 링을 안 보이게) */
  const [home, setHome] = useState<AppHome | null>(() => (cached?.today === today ? cached : null));
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(monthOf(today));
  /* 고른 날 — 처음엔 없다(웹 홈처럼 날짜를 누르면 밑에 그날 칸이 펴지고 X 로 닫는다) */
  const [selected, setSelected] = useState<string | null>(null);
  const { logs, reload } = useMonth(month);
  /* 달력 | 목록 — 목록은 모든 기록(최근 것부터) */
  const [calView, setCalViewRaw] = useState<'calendar' | 'list'>('calendar');
  const [swapped, setSwapped] = useState(false);
  const setCalView = (v: 'calendar' | 'list') => {
    setSwapped(true);
    setCalViewRaw(v);
  };
  const allLogs = useAllLogs(calView === 'list');
  const eventCounts = useEventCounts();
  const velocityDays = useVelocityDays();
  const clipCounts: Record<string, number> = {};
  for (const [k, v] of Object.entries(velocityDays ?? {})) clipCounts[k] = v.clips;

  const refresh = useCallback(() => {
    const e = cacheEpoch();
    return loadHome().then(
        (h) => {
          if (e !== cacheEpoch()) return;
          cached = h;
          void cacheSet('home', h);
          setHome(h);
          setError(null);
        },
        (err: unknown) => setError(err instanceof Error ? err.message : '불러오지 못했어요.')
      );
  }, []);
  useEffect(() => {
    let alive = true;
    /* 앱을 막 켰으면 폰에 남긴 오늘 홈을 먼저(날이 바뀌었으면 안 씀) */
    if (!cached)
      void cacheGet('home').then((v) => {
        const h = v as AppHome | null;
        if (alive && h?.today === today && !cached) setHome(h);
      });
    void reloadEvents();
    const e = cacheEpoch();
    loadHome().then(
      (h) => {
        if (e !== cacheEpoch()) return;
        cached = h;
        void cacheSet('home', h);
        if (alive) setHome(h);
      },
      (e: unknown) => alive && setError(e instanceof Error ? e.message : '불러오지 못했어요.')
    );
    return () => {
      alive = false;
    };
  }, [today]);

  /* 위에 쌓인 앱 화면(체크인 · 투구 기록 · 운동)에서 돌아오면 다시 받는다 — 링이 방금 남긴 것을 따라오게(처음 한 번은 위 효과가 받는다) */
  /* 탭을 옮겼다 돌아오면(판은 붙어 있다) 새로 받는다 — 다른 탭에서 남긴 것이 링 · 달력에 바로 */
  useOnTabActive(() => void Promise.all([refresh(), reload(), reloadEvents(), reloadVelocityDays()]));
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void refresh();
      focused.current = true;
    }, [refresh])
  );

  /*
   * 당겨서 새로고침은 없다 — 웹이 일부러 뺐다(2026-10-15, 판 넘기기 · 위 막대와 부딪혔다). 대신 앱을 5분 넘게 떠났다 돌아오면 새로 받는다(웹과 같다).
   */
  const leftAt = useRef<number | null>(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') {
        leftAt.current ??= Date.now();
        return;
      }
      const away = leftAt.current;
      leftAt.current = null;
      if (away != null && Date.now() - away > 5 * 60_000) void Promise.all([refresh(), reload(), reloadEvents()]);
    });
    return () => sub.remove();
  }, [refresh, reload]);

  /* 위 막대 — 아래로 굴리면 숨고 위로 굴리면 나온다(웹 mobile-top-bar.tsx useBarHidden 과 같은 문턱: 64 넘게 내려가며 4 넘게 움직임) */
  /* 위 막대 — 나올 때 자리 280ms cubic-bezier(0.32,0.72,0,1) + 진하기 200ms ease-out, 숨을 때 240ms + 160ms ease-in(웹 gc:3268-3288) */
  const barY = useSharedValue(0);
  const barO = useSharedValue(1);
  const barUp = useSharedValue(1);
  const lastY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    const y = e.contentOffset.y;
    const dy = y - lastY.value;
    lastY.value = y;
    const show = y < 8 || dy < -4 ? 1 : dy > 4 && y > 64 ? 0 : -1;
    if (show === -1 || show === barUp.value) return;
    barUp.value = show;
    if (show) {
      barY.value = withTiming(0, { duration: 280, easing: Easing.bezier(0.32, 0.72, 0, 1) });
      barO.value = withTiming(1, { duration: 200, easing: Easing.out(Easing.ease) });
    } else {
      barY.value = withTiming(-BAR_H, { duration: 240, easing: Easing.bezier(0.32, 0.72, 0, 1) });
      barO.value = withTiming(0, { duration: 160, easing: Easing.in(Easing.ease) });
    }
  });
  const barStyle = useAnimatedStyle(() => ({ transform: [{ translateY: barY.value }], opacity: barO.value }));
  /* 막대 밑 꼬리 — 웹 위 막(top-veil)처럼 바탕색이 16px 동안 옅어진다. 막대가 숨으면 시계 자리 밑으로 같이 올라간다 */
  const tailStyle = useAnimatedStyle(() => ({ transform: [{ translateY: barY.value }] }));

  const openRing = (r: HomeRing) => {
    if (r.key === 'checkin') return openCheckin();
    if (r.key === 'pitch') return home?.pitchLocked ? onWeb(r.href ?? '/videos/setup') : router.push(`/pitch/${today}` as Href);
    onTab(r.href ?? '/today');
  };
  const openFeed = (it: FeedItem) => {
    if (it.checkin && !it.href) return openCheckin();
    if (!it.href) return;
    const day = /^\/pitch-log\/(\d{4}-\d{2}-\d{2})/.exec(it.href)?.[1];
    if (day) return router.push(`/pitch/${day}` as Href);
    if (it.href === '/videos' || it.href === '/training' || it.href === '/nutrition') return onTab(it.href);
    onWeb(it.href);
  };

  const dayLogs = (logs ?? []).filter((l) => dateKeyOf(l.date) === selected);

  /*
   * 날을 고르면 그날 칸이 화면 밖일 때 320ms 뒤 부드럽게 굴려 보이게(웹 pitch-log-panel.tsx — 펴지는 움직임이 끝난 뒤).
   * 위 막대 밑에 그날 칸 머리가 오도록.
   */
  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  /* 지금 탭(홈)을 다시 누르면 맨 위로 */
  useRetapTop(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));
  const viewH = useRef(0);
  const dayY = useRef(0);
  const calY = useRef(0);
  useEffect(() => {
    if (!selected) return;
    const t = setTimeout(() => {
      const top = calY.current + dayY.current;
      const visibleBottom = lastY.value + viewH.current - (bottom + 24);
      if (top + 160 > visibleBottom) scrollRef.current?.scrollTo({ y: Math.max(0, top - inset.top - BAR_H - 16), animated: true });
    }, 320);
    return () => clearTimeout(t);
  }, [selected, bottom, inset.top, lastY, scrollRef]);

  const openNotice = () =>
    router.push({
      pathname: '/notice' as Href as never,
      params: { date: today, checkin: home?.checkinDone ? '1' : '0', pitch: home?.pitchDone ? '1' : '0', locked: home?.pitchLocked ? '1' : '0' },
    });
  /* 종의 주황 점 — 체크인 · 오늘 투구 중 남은 것이 있으면(웹 notice-bell pendingCount) */
  const pending = home ? (home.checkinDone ? 0 : 1) + (home.pitchDone || home.pitchLocked ? 0 : 1) : 0;

  return (
    <CameraSwipe enabled={!home?.pitchLocked}>
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Animated.ScrollView
        ref={scrollRef}
        onScroll={onScroll}
        onLayout={(e) => (viewH.current = e.nativeEvent.layout.height)}
        scrollEventThrottle={16}
        style={{ flex: 1 }}
        contentContainerStyle={[{ paddingTop: inset.top + BAR_H + SPACE.section, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side }, READABLE]}
      >
        {/* 웹 홈과 같은 차례 · 간격: 링 → 24 → 요약 칸 → 24 → 달력(+ 16 그날 칸 둘) → 24 → 알림 · 첫날 카드 */}
        {home ? (
          <>
            <RingsCard rings={home.rings} onPress={openRing} />
            {/* 넷이 다 차면 하루 한 번 축하(웹 all-done — 앱은 화면 가운데) */}
            <AllDone allDone={home.rings.every((r) => r.value >= 1)} day={today} />
            <View style={{ marginTop: SPACE.section }}>
              <FeedCard items={home.feed} onOpen={openFeed} />
            </View>
          </>
        ) : error ? (
          <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text>
        ) : (
          /* 불러오는 동안 — 웹 @home/today/loading.tsx 의 뼈대(216 · 180)가 숨 쉬듯 옅어졌다 진해짐 */
          <>
            <Pulse style={[styles.card, { height: 142, backgroundColor: c.line }]} />
            <Pulse style={[styles.card, { height: 201, marginTop: SPACE.section, backgroundColor: c.line }]} />
          </>
        )}

        <Animated.View layout={layoutMove} style={{ marginTop: SPACE.section }} onLayout={(e) => (calY.current = e.nativeEvent.layout.y)}>
          {/* 홈 달력은 앞날 · 다음 달도 열린다 — 일정을 미리 적는 곳(엔진이 다음 등판을 읽는다, 웹 allowFuture). 날을 고르면 칸이 납작해진다(웹 compact) */}
          {/* 보기 전환은 달력 머리의 목록 그림 · 목록 머리의 달력 그림으로(웹 2026-10-16) — 바꿀 때만 옅게 떠오른다(view-swap) */}
          {calView === 'list' ? (
            <Animated.View key="list" entering={viewSwap} style={{ gap: 16 }}>
              <View style={styles.listHead}>
                <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>최근 기록</Text>
                <Press accessibilityRole="button" accessibilityLabel="캘린더로 보기" onPress={() => setCalView('calendar')} style={styles.viewBtn}>
                  <Icon name="calendar-days" size={20} color={c.muted} />
                </Press>
              </View>
              <RecentList logs={allLogs.logs} />
            </Animated.View>
          ) : (
            <Animated.View key="calendar" entering={swapped ? viewSwap : undefined}>
              <MonthGrid
                month={month}
                today={today}
                logs={logs}
                selected={selected}
                allowFuture
                legendExtra
                events={eventCounts}
                clips={clipCounts}
                compact={selected != null}
                onMonth={setMonth}
                onDay={(day) => setSelected((cur) => (cur === day ? null : day))}
                headerAction={
                  <Press accessibilityRole="button" accessibilityLabel="목록으로 보기" onPress={() => setCalView('list')} style={[styles.viewBtn, { marginRight: 4 }]}>
                    <Icon name="list" size={20} color={c.muted} />
                  </Press>
                }
              />
            </Animated.View>
          )}
          {selected && calView === 'calendar' ? (
            <View style={{ marginTop: 16 }} onLayout={(e) => (dayY.current = e.nativeEvent.layout.y)}>
              <DayCards date={selected} today={today} logs={dayLogs} onTab={onTab} onClose={() => setSelected(null)} />
            </View>
          ) : null}
        </Animated.View>

        {/* 캘린더 밑 — 알림 카드 · 첫날 카드(웹 home-page.tsx TodayBody 와 같은 차례) */}
        {home?.painWords || home?.recovering || home?.firstDay || home?.goodNote ? (
          <Animated.View layout={layoutMove} style={{ marginTop: SPACE.section, gap: SPACE.section }}>
            {home.painWords ? (
              <Warn
                title="지금 통증이 있으신가요?"
                body="통증이 있으면 던지지 말고 전문의와 상담하세요."
                why={`최근 투구 일지 메모에 ‘${home.painWords.join(', ')}’ 같은 말이 있었어요. 통증인지 알 수 없어서, 확인될 때까지 투구는 쉬고 운동은 회복 · 가동성만 골랐어요. 체크인을 남기면 바로 평소 계획으로 돌아가요.`}
                action="오늘 체크인하기"
                onPress={() => openCheckin()}
              />
            ) : null}
            {home.recovering ? <Warn title="오늘은 회복 운동만 골랐어요" body="최근 체크인에 통증이 있어서 무게 운동은 뺐어요." /> : null}
            {home.firstDay ? (
              <FirstDayCard today={today} status={home.firstDay} locked={home.pitchLocked} onTab={onTab} onRested={() => void refresh()} />
            ) : null}
            {home.goodNote ? <GoodDayNote note={home.goodNote} /> : null}
          </Animated.View>
        ) : null}
      </Animated.ScrollView>

      {/* 위 막대 — 홈은 로고가 가운데, 오른쪽은 알림 종만(웹 2026-10-14 "인스타처럼"). 시계 자리는 늘 막대 색으로 덮는다 */}
      <Animated.View pointerEvents="none" style={[styles.tail, { top: inset.top + BAR_H }, tailStyle]}>
        <Svg width="100%" height={16}>
          <Defs>
            <LinearGradient id="veil" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={c.page} stopOpacity={0.95} />
              <Stop offset="1" stopColor={c.page} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height={16} fill="url(#veil)" />
        </Svg>
      </Animated.View>
      <View pointerEvents="none" style={[styles.clock, { height: inset.top, backgroundColor: c.page }]} />
      <Animated.View style={[styles.bar, { top: inset.top, backgroundColor: c.page }, barStyle]}>
        <Wordmark color={c.ink} />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={pending > 0 ? `알림, 오늘 할 일 ${pending}개` : '알림'}
          onPress={openNotice}
          hitSlop={6}
          style={({ pressed }) => [styles.bell, pressed && { backgroundColor: c.chip }]}
        >
          <Icon name="bell" size={19} color={c.muted} />
          {pending > 0 ? <View style={[styles.dot, { backgroundColor: c.warn, borderColor: c.page }]} /> : null}
        </Pressable>
      </Animated.View>
    </View>
    </CameraSwipe>
  );
}

/** 알림 카드 — 웹과 같은 주황 판(border-warn-line · bg-warn-bg). 까닭은 '왜 물어보나요' 안에 접고, 안전 문장은 접지 않는다 */
function Warn({ title, body, why, action, onPress }: { title: string; body: string; why?: string; action?: string; onPress?: () => void }) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  return (
    <View style={[styles.card, { backgroundColor: c.warnBg, borderColor: c.warnLine, borderWidth: 1 }]}>
      <Text style={[styles.cardTitle, { color: c.warn }]}>{title}</Text>
      <Text style={{ color: c.warn, fontSize: 15, lineHeight: 21 }}>{body}</Text>
      {why || (action && onPress) ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          {why ? (
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={{ color: c.warn, fontSize: 14, fontWeight: '600' }}>왜 물어보나요 {open ? '⌃' : '⌄'}</Text>
            </Pressable>
          ) : null}
          {action && onPress ? (
            <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.ghost, { borderColor: c.warn }, pressed && { opacity: 0.6 }]}>
              <Text style={{ color: c.warn, fontSize: 15, fontWeight: '600' }}>{action}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
      {why && open ? <Text style={{ color: c.warn, fontSize: 13, lineHeight: 19 }}>{why}</Text> : null}
    </View>
  );
}

/**
 * 첫날 카드 — 투구 기록을 한 번도 안 남긴 사람(웹 first-day-card.tsx 와 같은 칸): 하늘색 판 · '여기부터 시작하세요' · 지금 팔 상태(점 · 색 · 까닭) ·
 * [오늘 투구 남기기][오늘 안 던졌어요] · '첫 운동 만들기 ›'. 투구 기록이 잠겼으면 설정으로 가는 단추 하나.
 */
const ARM_LABEL = { danger: '위험', caution: '주의', safe: '안전' } as const;
function FirstDayCard({
  today,
  status,
  locked,
  onTab,
  onRested,
}: {
  today: string;
  status: NonNullable<AppHome['firstDay']>;
  locked: boolean;
  onTab: (href: string) => void;
  onRested: () => void;
}) {
  const c = usePalette();
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const busy = useRef(false);
  const tone = status.level === 'danger' ? c.danger : status.level === 'caution' ? c.warn : c.ok;
  const rest = async () => {
    if (busy.current) return;
    busy.current = true;
    setSaving(true);
    setErr(null);
    try {
      await call('/api/pitch-log', { method: 'POST', body: { date: today, sessionType: REST_SESSION_TYPE, videoPaths: [] } });
      onRested();
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : '인터넷 연결을 확인한 뒤 다시 눌러 주세요.');
    } finally {
      busy.current = false;
      setSaving(false);
    }
  };
  return (
    <View style={[styles.card, { backgroundColor: c.skyTint, gap: 12 }]}>
      <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '700' }}>여기부터 시작하세요</Text>
      {locked ? (
        <>
          <Text style={{ color: c.ink, opacity: 0.8, fontSize: 15, lineHeight: 22 }}>
            세 가지만 알려 주면 투구 기록을 시작해요. 그다음부터 지금 팔 상태를 보여 줘요.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => router.push('/setup/pitch' as Href)} style={[styles.pill, { backgroundColor: c.sky }]}>
            <Text style={styles.pillText}>투구 기록 설정하기</Text>
          </Pressable>
        </>
      ) : (
        <>
          <View accessibilityRole="summary" style={{ gap: 4 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} />
              <Text style={{ color: c.muted, fontSize: 12 }}>지금 팔 상태</Text>
              <Text style={{ color: tone, fontSize: 12, fontWeight: '700' }}>{ARM_LABEL[status.level]}</Text>
            </View>
            <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{status.headline}</Text>
            {status.details.map((d) => (
              <Text key={d} style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>
                {d}
              </Text>
            ))}
          </View>
          <Text style={{ color: c.ink, opacity: 0.8, fontSize: 15, lineHeight: 22 }}>던진 양을 남기면 내 기록과 견줘 상태를 알려 드려요.</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Pressable
              accessibilityRole="button"
              onPress={() => router.push({ pathname: '/pitch/edit' as Href as never, params: { date: today } })}
              style={[styles.pill, { backgroundColor: c.sky }]}
            >
              <Text style={styles.pillText}>오늘 투구 남기기</Text>
            </Pressable>
            <Pressable accessibilityRole="button" disabled={saving} onPress={() => void rest()} style={[styles.pill, { backgroundColor: c.card, opacity: saving ? 0.5 : 1 }]}>
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '500' }}>{saving ? '남기는 중…' : '오늘 안 던졌어요'}</Text>
            </Pressable>
          </View>
          {err ? <Text style={{ color: c.danger, fontSize: 13 }}>{err}</Text> : null}
        </>
      )}
      <Pressable accessibilityRole="link" onPress={() => onTab('/training')} style={({ pressed }) => [{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }, pressed && PRESSED]}>
        <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '600' }}>첫 운동 만들기 ›</Text>
      </Pressable>
    </View>
  );
}

/** 위 막대 높이 — 웹 h-14 */
const BAR_H = 56;

const styles = StyleSheet.create({
  clock: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 },
  tail: { position: 'absolute', left: 0, right: 0, height: 16, zIndex: 1 },
  bar: { position: 'absolute', left: 0, right: 0, height: BAR_H, alignItems: 'center', justifyContent: 'center', zIndex: 2 },
  bell: { position: 'absolute', right: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  dot: { position: 'absolute', right: 10, top: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  card: { borderRadius: 20, padding: SPACE.pad, gap: 10 },
  good: { borderRadius: 20, borderWidth: 1 },
  goodHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, padding: SPACE.pad },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  viewBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  cardTitle: { fontSize: 15, fontWeight: '700' },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 16, justifyContent: 'center' },
  pillText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  ghost: { alignSelf: 'flex-start', minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center' },
  webLink: { alignItems: 'center', paddingVertical: 8 },
});

/**
 * '지난번 잘 던진 날 남긴 말' — 웹 good-day-note.tsx: 하늘색 판, 겉은 메모 한 줄, 누르면 메모 전체 · 날짜 · 종류 · 만족도 · 좋았던 것.
 */
function GoodDayNote({ note }: { note: NonNullable<AppHome['goodNote']> }) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const [, m, d] = note.date.split('-').map(Number);
  return (
    <Animated.View layout={layoutMove} style={[styles.good, { backgroundColor: c.skyTint, borderColor: withAlpha(c.sky, 0.25) }]}>
      <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.goodHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.skyStrong, fontSize: 12, fontWeight: '500' }}>지난번 잘 던진 날 남긴 말</Text>
          {open ? null : (
            <Text numberOfLines={1} style={{ color: c.ink, fontSize: 15, marginTop: 4 }}>
              {note.memo}
            </Text>
          )}
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={16} color={c.sky} />
        </View>
      </Press>
      {open ? (
        <Animated.View entering={fadeIn} style={{ gap: 8, paddingHorizontal: SPACE.pad, paddingBottom: SPACE.pad, marginTop: -8 }}>
          <Text style={{ color: c.ink, fontSize: 15, lineHeight: 23 }}>{note.memo}</Text>
          <Text style={{ color: c.muted, fontSize: 12 }}>
            {m}월 {d}일 · {note.sessionType} · 만족도 {note.satisfaction}/5
            {note.cuesGood.length ? ` · 좋았던 것 ${note.cuesGood.join(' · ')}` : ''}
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
