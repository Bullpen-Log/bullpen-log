import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FeedItem } from '@/lib/report/feed-items';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { usePalette } from '~/lib/ui';
import { dateKeyOf } from '~/pitch/api';
import { MonthGrid } from '~/pitch/month-grid';
import { monthOf, useMonth } from '~/pitch/store';
import { loadHome, type AppHome, type HomeRing } from './api';
import { DayCard, resetDayCache } from './day-card';
import { resetEventsCache } from './events';
import { FeedCard } from './feed';
import { RingsCard } from './rings';

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
  onWebHome,
}: {
  today: string;
  bottom: number;
  /** 웹 화면으로(체크인 · 분석 · 웹 홈) — 앱 화면을 걷는다 */
  onWeb: (href: string) => void;
  /** 다른 탭으로(트레이닝 · 영양) */
  onTab: (href: string) => void;
  /** 웹 홈을 연다(일정 · 자세한 그날 칸) — 홈 탭을 다시 누르면 앱 홈 */
  onWebHome: () => void;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  /* 받아 둔 홈은 오늘 것일 때만 먼저(자정을 넘겨 켜 둔 앱이 어제 링을 안 보이게) */
  const [home, setHome] = useState<AppHome | null>(() => (cached?.today === today ? cached : null));
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [month, setMonth] = useState(monthOf(today));
  const [selected, setSelected] = useState(today);
  const { logs, reload } = useMonth(month);

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
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void refresh();
      focused.current = true;
    }, [refresh])
  );

  const pull = async () => {
    setRefreshing(true);
    await Promise.all([refresh(), reload()]);
    setRefreshing(false);
  };

  const openRing = (r: HomeRing) => {
    if (r.key === 'checkin') return router.push({ pathname: '/checkin' as Href as never, params: { date: today } });
    if (r.key === 'pitch') return home?.pitchLocked ? onWeb(r.href ?? '/videos/setup') : router.push(`/pitch/${today}` as Href);
    onTab(r.href ?? '/today');
  };
  const openFeed = (it: FeedItem) => {
    if (it.checkin && !it.href) return router.push({ pathname: '/checkin' as Href as never, params: { date: today } });
    if (!it.href) return;
    const day = /^\/pitch-log\/(\d{4}-\d{2}-\d{2})/.exec(it.href)?.[1];
    if (day) return router.push(`/pitch/${day}` as Href);
    if (it.href === '/videos' || it.href === '/training' || it.href === '/nutrition') return onTab(it.href);
    onWeb(it.href);
  };

  const dayLogs = (logs ?? []).filter((l) => dateKeyOf(l.date) === selected);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: 16, gap: 16 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.ink }]}>홈</Text>
        <Pressable accessibilityRole="button" onPress={() => onWeb('/coach?view=pitch')} style={[styles.chip, { backgroundColor: c.chip }]}>
          <Text style={[styles.chipText, { color: c.ink }]}>분석</Text>
        </Pressable>
      </View>

      {home ? (
        <>
          <RingsCard rings={home.rings} onPress={openRing} />
          <FeedCard items={home.feed} onOpen={openFeed} />
          {home.painWords ? (
            <Warn
              title="지금 통증이 있으신가요?"
              body={`최근 투구 메모에 ‘${home.painWords.join(', ')}’ 같은 말이 있었어요. 통증이 있으면 던지지 말고 전문의와 상담하세요. 체크인을 남기면 평소 계획으로 돌아가요.`}
              action="오늘 체크인하기"
              onPress={() => router.push({ pathname: '/checkin' as Href as never, params: { date: today } })}
            />
          ) : null}
          {home.recovering ? <Warn title="오늘은 회복 운동만 골랐어요" body="최근 체크인에 통증이 있어서 무게 운동은 뺐어요." /> : null}
          {home.firstDay ? (
            <View style={[styles.card, { backgroundColor: c.card }]}>
              <Text style={[styles.cardTitle, { color: home.firstDay.level === 'safe' ? c.ink : c.danger }]}>
                {home.firstDay.level === 'danger' ? '위험' : home.firstDay.level === 'caution' ? '주의' : '안전'} · {home.firstDay.headline}
              </Text>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  home.pitchLocked ? onWeb('/videos/setup') : router.push({ pathname: '/pitch/edit' as Href as never, params: { date: today } })
                }
                style={[styles.primary, { backgroundColor: c.sky }]}
              >
                <Text style={styles.primaryText}>{home.pitchLocked ? '투구 기록 설정하기' : '오늘 투구 남기기'}</Text>
              </Pressable>
            </View>
          ) : null}
        </>
      ) : error ? (
        <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text>
      ) : (
        <View style={[styles.card, { backgroundColor: c.card, height: 260 }]} />
      )}

      <MonthGrid month={month} today={today} logs={logs} selected={selected} onMonth={setMonth} onDay={setSelected} />
      <DayCard date={selected} logs={dayLogs} onTab={onTab} />

      <Pressable accessibilityRole="button" onPress={onWebHome} style={styles.webLink}>
        <Text style={{ color: c.muted, fontSize: 14 }}>웹 홈 달력으로 보기 ›</Text>
      </Pressable>
    </ScrollView>
  );
}

function Warn({ title, body, action, onPress }: { title: string; body: string; action?: string; onPress?: () => void }) {
  const c = usePalette();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: c.danger, borderWidth: 1 }]}>
      <Text style={[styles.cardTitle, { color: c.danger }]}>{title}</Text>
      <Text style={{ color: c.ink, fontSize: 15, lineHeight: 21 }}>{body}</Text>
      {action && onPress ? (
        <Pressable accessibilityRole="button" onPress={onPress} style={[styles.ghost, { borderColor: c.danger }]}>
          <Text style={{ color: c.danger, fontSize: 15, fontWeight: '600' }}>{action}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, fontSize: 34, fontWeight: '700' },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 20, padding: 16, gap: 10 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  primary: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  ghost: { alignSelf: 'flex-start', minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 16, justifyContent: 'center' },
  webLink: { alignItems: 'center', paddingVertical: 8 },
});
