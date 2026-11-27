import { type Href, useIsFocused } from 'expo-router';
import { canOpen, noticeLocked, pushOpen, useRelease } from '~/shell/release';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, { Easing, useAnimatedRef, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { SPACE, TYPE, usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { Wordmark } from '~/shell/wordmark';
import { fadeIn, Pulse } from '~/shell/motion';
import { leaveTo, openCheckin } from '~/shell/web-nav';
import { lastWriteAt, rpc, RpcError } from '~/lib/rpc';
import { loadMe } from '~/pitch/api';
import { whenStill } from '~/shell/transition';
import type { loadCoachToday } from '@/app/actions/coach';
import type { loadAppLabList } from '@/app/actions/pitch-lab';
import type { loadAppArmcare, loadAppMechanics } from '@/app/actions/app-training-parts';
import type { TrainingToday } from '@/lib/report/training-today-data';
import { useCompareStore } from '~/compare/store';
import { monthOf, reloadFeatured, reloadVelocityDays, useMonth } from '~/pitch/store';
import { loadHome, type AppHome } from './api';
import { layoutMove, resetDayCache } from './day-card';
import { reloadEvents, resetEventsCache } from './events';
import { Press } from '~/shell/press';
import { AllDone } from './all-done';
import { CameraSwipe } from './camera-swipe';
import { useUnreadNotifications } from './notifications';
import { READABLE } from '~/lib/layout';
import { useFocusRefresh, useOnTabActive, useRetapTop, useTabActive } from '~/shell/tab-pager';
import { SpacePickButton } from '~/org/space-pick';
import { MenuButton } from '~/shell/menu-button';
import { useSpace } from '~/org/space-store';
import { todayCount } from './plan-model';
import { recordsHref, type RecordsCategory } from '~/records/intent';
import { DailyOverview } from './daily-overview';
import { HighlightCard, type HomeHighlight, type HomeHighlightKey } from './highlight-card';

/**
 * 홈 — 날짜, 체크인·투구·운동 상태, 하이라이트, 투구·운동 카드 순서.
 * 서버의 기록과 완료 상태를 표시하고 카드에서 기존 입력 화면을 연다.
 */
let cached: AppHome | null = null;
/** 홈이 마지막으로 받은 값 — 전체 기록 · 기록 달력 시트가 읽는다(없으면 null) */
export const homeSnapshot = () => cached;

/** 로그아웃 — 앞사람 홈을 지운다 */
export const resetHomeCache = () => {
  cached = null;
  resetDayCache();
  resetEventsCache();
};

type Seen = { all: boolean; epoch: number; day: string };
type CoachSpotlight = { day: string; epoch: number; readAt: number; line: string | null };

type ProgressKey = 'motion' | 'mechanics' | 'armcare' | 'program';
type Progress = { detail: string; action: string; href?: string };
type ProgressEntry = { epoch: number; day: string; requestedAt: number; progress: Progress | null };
const PROGRESS_ROUTES: Record<ProgressKey, string> = {
  motion: '/lab',
  mechanics: '/training-mechanics',
  armcare: '/training-armcare',
  program: '/training/programs',
};


async function readHighlightProgress(key: ProgressKey, day: string): Promise<Progress | null> {
  switch (key) {
    case 'motion': {
      const data = await rpc<Awaited<ReturnType<typeof loadAppLabList>>>('pitch-lab.loadAppLabList', 'mine');
      if (!data.ok) return null;
      const active = data.samples.find(sample => sample.phase === 'active');
      const ready = data.samples.find(sample => sample.phase === 'done');
      if (active) return { detail: '분석 진행 중', action: '진행 보기', href: '/lab/' + encodeURIComponent(active.id) };
      if (ready) return { detail: '최근 분석 완료', action: '결과 보기', href: '/lab/' + encodeURIComponent(ready.id) };
      return null;
    }
    case 'mechanics': {
      const data = await rpc<Awaited<ReturnType<typeof loadAppMechanics>>>('app-training-parts.loadAppMechanics', 'program');
      if (!data.ok || data.tab !== 'program' || data.today !== day || !data.program?.level) return null;
      return { detail: String(data.program.index) + ' / ' + data.program.total + ' 세션 완료', action: '이어서 하기' };
    }
    case 'armcare': {
      const data = await rpc<Awaited<ReturnType<typeof loadAppArmcare>>>('app-training-parts.loadAppArmcare', 'today');
      if (!data.ok || data.tab !== 'today' || data.dateKey !== day || data.custom.kind !== 'routine') return null;
      const items = data.custom.routine?.items;
      if (!items?.length) return null;
      const done = items.filter(item => item.done).length;
      return { detail: String(done) + ' / ' + items.length + ' 완료', action: done === items.length ? '완료 루틴 보기' : '이어서 하기' };
    }
    case 'program': {
      const data = await rpc<({ ok: true } & TrainingToday) | { ok: false }>('app-training.loadAppTrainingToday');
      const program = data.ok ? data.programCard : null;
      if (!program) return null;
      return { detail: String(program.completed) + ' / ' + program.total + ' 세션 완료', action: '내 프로그램 보기', href: '/training/program-today' };
    }
  }
}

export function HomeTab({
  fixedHeader = false,
  today,
  bottom,
  onTab,
}: {
  today: string;
  fixedHeader?: boolean;
  bottom: number;
  /** 웹 화면으로(체크인 · 분석 · 웹 홈) — 앱 화면을 걷는다 */
  onWeb: (href: string) => void;
  /** 다른 탭으로(트레이닝 · 영양) */
  onTab: (href: string) => void;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const side = width >= 400 ? 28 : width >= 360 ? 22 : 16;
  /* 받아 둔 홈은 오늘 것일 때만 먼저(자정을 넘겨 켜 둔 앱이 어제 것을 안 보이게) */
  const [home, setHome] = useState<AppHome | null>(() => (cached?.today === today ? cached : null));
  const [error, setError] = useState<string | null>(null);
  const [selection, setSelection] = useState({ today, date: today });
  const selected = selection.today === today ? selection.date : today;
  const { logs, reload } = useMonth(monthOf(selected));
  /* 축하를 틀 날 — 그날 직접 본 전이에만(다음 날로 넘어가면 저절로 꺼진다) */
  const [playDay, setPlayDay] = useState<string | null>(null);
  const seen = useRef<Seen | null>(null);

  /* 서버가 새로 준 값만 여기로(폰에 남긴 값은 아니다) — 축하는 이번에 직접 본 '안 다 함 → 다 함'에만 */
  const accept = useCallback((h: AppHome) => {
    const { done, total } = todayCount(h);
    const all = total > 0 && done === total;
    const prev = seen.current && seen.current.epoch === cacheEpoch() && seen.current.day === h.today ? seen.current : null;
    seen.current = { all, epoch: cacheEpoch(), day: h.today };
    if (prev && !prev.all && all) setPlayDay(h.today);
  }, []);

  const failed = useCallback((e: unknown) => {
    if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
    setError(e instanceof Error ? e.message : '불러오지 못했어요.');
  }, []);

  const refresh = useCallback(() => {
    const e = cacheEpoch();
    return loadHome().then(
      (h) => {
        if (e !== cacheEpoch()) return;
        cached = h;
        void cacheSet('home', h);
        setHome(h);
        setError(null);
        accept(h);
      },
      (err: unknown) => {
        if (e === cacheEpoch()) failed(err);
      }
    );
  }, [accept, failed]);
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
        if (!alive) return;
        setHome(h);
        setError(null);
        accept(h);
      },
      (err: unknown) => alive && e === cacheEpoch() && failed(err)
    );
    return () => {
      alive = false;
    };
  }, [today, accept, failed]);

  /* 위에 쌓인 앱 화면(체크인 · 투구 기록 · 운동)에서 돌아오면 · 탭을 옮겼다 오면 다시 받는다 — 방금 남긴 것이 바로 */
  useOnTabActive(() => void Promise.all([refresh(), reload(), reloadEvents(), reloadVelocityDays(), reloadFeatured()]));
  useFocusRefresh(() => void refresh());

  /* 앱을 5분 넘게 떠났다 돌아오면 새로 받는다(웹과 같다). 다른 탭 판이 보이는 동안은 받지 않는다 */
  const leftAt = useRef<number | null>(null);
  const tabActive = useTabActive();
  const activeRef = useRef(tabActive);
  useEffect(() => {
    activeRef.current = tabActive;
  }, [tabActive]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') {
        /* ??= 를 쓰면 React 컴파일러가 홈 탭 전체를 건너뛴다 */
        if (leftAt.current == null) leftAt.current = Date.now();
        return;
      }
      const away = leftAt.current;
      leftAt.current = null;
      if (away != null && Date.now() - away > 5 * 60_000 && activeRef.current) void Promise.all([refresh(), reload(), reloadEvents()]);
    });
    return () => sub.remove();
  }, [refresh, reload]);

  /* 위 막대 — 아래로 굴리면 숨고 위로 굴리면 나온다(웹 mobile-top-bar.tsx useBarHidden 과 같은 문턱) */
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
  const tailStyle = useAnimatedStyle(() => ({ transform: [{ translateY: barY.value }] }));

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  /* 지금 탭(홈)을 다시 누르면 맨 위로 */
  useRetapTop(() => scrollRef.current?.scrollTo({ y: 0, animated: true }));

  const openNotice = () =>
    pushOpen({
      pathname: '/notice' as Href as never,
      params: { date: today, checkin: home?.checkinDone ? '1' : '0', pitch: home?.pitchDone ? '1' : '0', locked: home?.pitchLocked ? '1' : '0' },
    });
  const pending = useUnreadNotifications();
  const { spaces } = useSpace();

  const release = useRelease();
  /* 기록 탭의 그날 · 전체로 — 껍데기가 주소를 기록 탭 부탁(shell/tab-intent)으로 바꿔 넘기고 기록 탭을 연다 */
  const openRecords = (date: string, category?: RecordsCategory) => onTab(recordsHref({ date, category }));
  const go = (to: string) => pushOpen(to as Href);
  const [coachSpotlight, setCoachSpotlight] = useState<CoachSpotlight | null>(null);
  const focused = useIsFocused();
  const canShowCoach = canOpen('/coach', release);
  const epoch = cacheEpoch();
  useEffect(() => {
    if (!canShowCoach || !tabActive || !focused) return;
    if (coachSpotlight?.day === today && coachSpotlight.epoch === epoch
      && Date.now() - coachSpotlight.readAt < 30_000 && lastWriteAt() <= coachSpotlight.readAt) return;
    let active = true;
    const stop = whenStill(() => {
      const readAt = Date.now();
      void loadMe()
        .then((me) => me.coachPaid ? rpc<Awaited<ReturnType<typeof loadCoachToday>>>('coach.loadCoachToday') : null)
        .then((result) => {
          if (!active || epoch !== cacheEpoch()) return;
          setCoachSpotlight({ day: today, epoch, readAt, line: result?.coach?.owner === 'coach' ? result.coach.line : null });
        }, () => undefined);
    });
    return () => {
      active = false;
      stop();
    };
  }, [canShowCoach, coachSpotlight, epoch, focused, tabActive, today]);

  const { recent: comparisons } = useCompareStore();
  const [highlightProgress, setHighlightProgress] = useState<Partial<Record<ProgressKey, ProgressEntry>>>({});
  const requestedHighlights = useRef<Partial<Record<ProgressKey, Omit<ProgressEntry, 'progress'>>>>({});
  const onHighlightVisible = useCallback((key: HomeHighlightKey) => {
    if (key !== 'motion' && key !== 'mechanics' && key !== 'armcare' && key !== 'program') return;
    if (!canOpen(PROGRESS_ROUTES[key], release)) return;
    const previous = requestedHighlights.current[key];
    const requestedAt = Date.now();
    if (previous?.epoch === epoch && previous.day === today && requestedAt - previous.requestedAt < 60_000
      && previous.requestedAt >= lastWriteAt()) return;
    const request = { epoch, day: today, requestedAt };
    requestedHighlights.current[key] = request;
    void readHighlightProgress(key, today).then((progress) => {
      if (epoch !== cacheEpoch() || requestedHighlights.current[key] !== request) return;
      setHighlightProgress(current => ({ ...current, [key]: { ...request, progress } }));
    }).catch(() => undefined);
  }, [epoch, release, today]);
  const progressFor = (key: ProgressKey) => {
    const entry = highlightProgress[key];
    return entry?.epoch === epoch && entry.day === today ? entry.progress : null;
  };

  const motion = progressFor('motion');
  const mechanics = progressFor('mechanics');
  const armcare = progressFor('armcare');
  const program = progressFor('program');
  const savedComparison = comparisons?.[0];
  const load = home?.today === today ? home.board?.load : null;
  const line = canShowCoach && coachSpotlight?.day === today && coachSpotlight.epoch === epoch ? coachSpotlight.line : null;
  const enter = (route: string, destination: string) => canOpen(route, release) ? go(destination) : noticeLocked();
  const highlights: HomeHighlight[] = [
    {
      key: 'motion', label: '3D 투구분석', title: '투구를\n구간별로 분석',
      detail: motion?.detail, action: motion?.action ?? '분석 시작',
      onPress: () => go(motion?.href ?? '/lab?fromHome=1'),
    }, {
      key: 'compare', label: '영상 비교', title: '같은 순간을\n나란히 비교',
      detail: savedComparison ? '저장한 비교가 있어요' : undefined,
      action: savedComparison ? '이어서 보기' : '영상 고르기',
      onPress: () => pushOpen({
        pathname: '/pitch/compare' as Href as never,
        params: savedComparison ? { doc: savedComparison.id, src: 'home' } : { new: '1', src: 'home' },
      }),
    }, {
      key: 'mechanics', label: '메커니즘', title: '투구 동작\n단계별 훈련',
      detail: mechanics?.detail, action: mechanics?.action ?? '난이도 고르기',
      onPress: () => enter('/training-mechanics', home?.trainingLocked ? '/setup/training' : '/training-mechanics'),
    }, {
      key: 'armcare', label: '암케어', title: '오늘의 맞춤\n암케어 루틴',
      detail: armcare?.detail, action: armcare?.action ?? '루틴 보기',
      onPress: () => enter('/training-armcare', home?.trainingLocked ? '/setup/training' : '/training-armcare'),
    }, {
      key: 'load', label: '투구 부하 지수', title: '첫 투구부터 기록해요', load,
      action: load ? '투구 분석 보기' : '투구 기록하기',
      onPress: () => enter('/analysis?view=pitch', load ? '/analysis?view=pitch' : home?.pitchLocked ? '/setup/pitch' : '/pitch/' + today),
    }, {
      key: 'program', label: '프로그램', title: '기초 근력부터\n투수 파워까지',
      detail: program?.detail, action: program?.action ?? '프로그램 고르기',
      onPress: () => enter('/training/programs', home?.trainingLocked ? '/setup/training' : program?.href ?? '/training/programs'),
    }, {
      key: 'coach', label: 'AI 코치', title: line ? '오늘의\n훈련 포인트' : '내 기록을 아는\n투수 코치',
      detail: line ?? undefined,
      action: line ? '오늘 계획 보기' : '코치 알아보기',
      onPress: () => canShowCoach ? onTab('/coach') : noticeLocked(),
    },
  ];
  const pitchHref = home?.pitchLocked ? '/setup/pitch' : `/pitch/${today}`;
  const pitchShowsRecords = !!home?.pitchDone || !canOpen(pitchHref, release);
  const openPitch = () => pitchShowsRecords ? openRecords(today, 'pitch') : go(pitchHref);
  const openWorkout = () => {
    if (home?.trainingLocked) return go('/setup/training');
    const w = home?.workout;
    /* 다 마친 오늘 운동 읽기는 기록 탭 오늘 · 트레이닝으로(PITCH-RECORDS-MINIMAL01 R2) — 시작 · 이어서는 트레이닝 화면 그대로 */
    if (w && w.total > 0 && w.done >= w.total) return openRecords(today, 'training');
    pushOpen({ pathname: '/training-today' as Href as never, params: { today, fromHome: '1' } });
  };

  const warnings =
    home?.painWords || home?.recovering ? (
      <View style={{ gap: SPACE.gap }}>
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
      </View>
    ) : null;

  return (
    <CameraSwipe enabled={!home?.pitchLocked}>
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <Animated.ScrollView
          automaticallyAdjustKeyboardInsets
          ref={scrollRef}
          onScroll={onScroll}
          scrollEventThrottle={16}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingTop: inset.top + (fixedHeader ? 0 : BAR_H) + 12, paddingBottom: bottom + 24, paddingHorizontal: side }}
        >
          <View style={READABLE}>
            {error && home ? (
              <Animated.View entering={fadeIn} style={[styles.stale, { backgroundColor: c.card }]}>
                <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>새로 받지 못했어요. 마지막으로 받은 기록이에요.</Text>
                <Press accessibilityRole="button" onPress={() => void refresh()} style={styles.staleBtn}>
                  <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>다시</Text>
                </Press>
              </Animated.View>
            ) : null}
            {home ? (
              <View>
                <DailyOverview
                  home={home}
                  today={today}
                  selected={selected}
                  pitchMonth={logs}
                  onSelect={date => setSelection({ today, date })}
                  notices={warnings}
                  highlight={<HighlightCard items={highlights} onVisible={onHighlightVisible} />}
                  onCheckin={() => openCheckin()}
                  onPitch={openPitch}
                  pitchShowsRecords={pitchShowsRecords}
                  onWorkout={openWorkout}
                  onRecords={openRecords}
                />
                {canShowCoach && <Press accessibilityRole="button" onPress={() => onTab('/coach?view=week')} style={{ marginTop: 16, padding: 16, minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: c.card, borderRadius: 16 }}>
                  <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>이번 주 훈련 계획</Text><Icon name="chevron-right" size={18} color={c.muted}/>
                </Press>}
                {home.goodNote ? (
                  <View style={{ marginTop: 18 }}><GoodDayNote note={home.goodNote} /></View>
                ) : null}
              </View>
            ) : error ? (
              <View style={[READABLE, { gap: 12, alignItems: 'flex-start' }]}>
                <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text>
                <Press accessibilityRole="button" onPress={() => void refresh()} style={[styles.retry, { backgroundColor: c.action }]}>
                  <Text style={{ color: c.onAction, fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
                </Press>
              </View>
            ) : (
              /* 날짜, 완료 상태, 액션 카드 순으로 자리 표시 */
              <View style={[READABLE, { gap: 22 }]}>
                <Pulse style={[styles.skel, { height: 76, backgroundColor: c.line }]} />
                <Pulse style={[styles.skel, { height: 69, backgroundColor: c.line }]} />
                <View style={{ flexDirection: 'row', gap: 18 }}>
                  <Pulse style={[styles.skel, { flex: 1, aspectRatio: 178 / 190, backgroundColor: c.line }]} />
                  <Pulse style={[styles.skel, { flex: 1, aspectRatio: 178 / 190, backgroundColor: c.line }]} />
                </View>
              </View>
            )}
          </View>
        </Animated.ScrollView>

        {/* 로고는 내용의 왼쪽 여백, 알림과 메뉴는 오른쪽 */}
        {!fixedHeader && <><Animated.View pointerEvents="none" style={[styles.tail, { top: inset.top + BAR_H }, tailStyle]}>
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
        <Animated.View style={[styles.bar, { top: inset.top, paddingLeft: side, backgroundColor: c.page }, barStyle]}>
          <Wordmark />
          {spaces.length ? (
            <View style={styles.pick}>
              <SpacePickButton label="내 싱커" compact c={c} />
            </View>
          ) : null}
          {/* 오른쪽은 알림 종 · 전체 메뉴(☰ — 하단 탭의 더보기를 옮겼다, 2026-10-29). 내 영상은 기록 탭 아래 칸으로 갔다 */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={pending > 0 ? `알림, 안 읽은 알림 ${pending}개` : '알림'}
            onPress={openNotice}
            hitSlop={6}
            style={({ pressed }) => [styles.bell, { right: 64 }, pressed && { backgroundColor: c.chip }]}
          >
            <Icon name="bell" size={19} color={c.muted} />
            {pending > 0 ? <View style={[styles.dot, { backgroundColor: c.warn, borderColor: c.page }]} /> : null}
          </Pressable>
          <MenuButton style={styles.menu} />
        </Animated.View>
        </>}
        {/* 오늘 셀 것을 다 했을 때 — 홈이 직접 본 전이에서만, 누름을 막지 않는 작은 카드 */}
        <AllDone play={playDay === today} day={today} />
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
              <Text style={{ color: c.warn, fontSize: 15, fontWeight: '600' }}>왜 물어보나요 {open ? '⌃' : '⌄'}</Text>
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

/** 위 막대 높이 — 웹 h-14 */
const BAR_H = 56;

const styles = StyleSheet.create({
  clock: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 3 },
  tail: { position: 'absolute', left: 0, right: 0, height: 16, zIndex: 1 },
  bar: { position: 'absolute', left: 0, right: 0, height: BAR_H, flexDirection: 'row', alignItems: 'center', gap: 12, zIndex: 2 },
  menu: { position: 'absolute', right: 14 },
  bell: { position: 'absolute', right: 12, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  pick: { flexShrink: 1, maxWidth: '39%', minHeight: 44, justifyContent: 'center' },
  dot: { position: 'absolute', right: 10, top: 10, width: 9, height: 9, borderRadius: 5, borderWidth: 2 },
  card: { borderRadius: 20, padding: SPACE.pad, gap: 10 },
  retry: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  stale: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 14, marginBottom: 12, ...READABLE },
  staleBtn: { minHeight: 44, minWidth: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  skel: { borderRadius: 19 },
  good: { borderRadius: 20, borderWidth: 1 },
  goodHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 48, padding: SPACE.pad },
  cardTitle: TYPE.card,
  ghost: { alignSelf: 'flex-start', minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center' },
});

/**
 * '지난번 잘 던진 날 남긴 말' — 웹 good-day-note.tsx: 하늘색 판, 겉은 메모 한 줄, 누르면 메모 전체 · 날짜 · 종류 · 만족도 · 좋았던 것.
 * 오늘 던지는 날, 오늘 투구 기록 전에만(서버가 정함).
 */
function GoodDayNote({ note }: { note: NonNullable<AppHome['goodNote']> }) {
  const c = usePalette();
  const [open, setOpen] = useState(false);
  const [, m, d] = note.date.split('-').map(Number);
  return (
    <Animated.View layout={layoutMove} style={[styles.good, { backgroundColor: c.skyTint, borderColor: withAlpha(c.sky, 0.25) }]}>
      <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={styles.goodHead}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: c.skyStrong, fontSize: 13, fontWeight: '400' }}>지난번 잘 던진 날 남긴 말</Text>
          {open ? null : (
            <Text numberOfLines={1} style={{ color: c.ink, fontSize: 15, marginTop: 4 }}>
              {note.memo}
            </Text>
          )}
        </View>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={16} color={c.link} />
        </View>
      </Press>
      {open ? (
        <Animated.View entering={fadeIn} style={{ gap: 8, paddingHorizontal: SPACE.pad, paddingBottom: SPACE.pad, marginTop: -8 }}>
          <Text style={{ color: c.ink, fontSize: 15, lineHeight: 23 }}>{note.memo}</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>
            {m}월 {d}일 · {note.sessionType} · 만족도 {note.satisfaction}/5
            {note.cuesGood.length ? ` · 좋았던 것 ${note.cuesGood.join(' · ')}` : ''}
          </Text>
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}
