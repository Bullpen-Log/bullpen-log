import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardAction, TrainingCard } from '@/lib/report/training-home-data';
import type { TrainingWeekCounts } from '@/lib/report/training-week-counts';
import type { TrainingStripDay } from '@/lib/training-week';
import { ThrowNoteCard } from '~/mechanics/parts';
import { TRAINING_PART_HREF, type TrainingPart } from '@/lib/training-part';
import { rpc, RpcError } from '~/lib/rpc';
import { REST_DAY } from '~/training/rest-day';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { usePalette } from '~/lib/ui';
import { fromApp, openCheckin } from '~/shell/web-nav';
import { READABLE } from '~/lib/layout';
import { useOnTabActive } from '~/shell/tab-pager';

/**
 * 트레이닝 탭 첫 화면(앱 화면) — 웹 트레이닝 홈(app/(app)/training/training-home.tsx)과 같은 앱 카드 셋(오늘 운동 · 암케어 · 메커니즘,
 * 판정은 lib/report/training-home-data.ts — app.loadAppTraining). [시작]은 운동 판을 열어 앱 운동 화면(/workout)으로, 암케어 · 메커니즘
 * 따라 하기와 각 앱의 전체 화면(카드를 누름)은 아직 웹(onWeb).
 */
type Loaded = { today: string; cards: TrainingCard[]; strip?: TrainingStripDay[]; week?: TrainingWeekCounts };
let cached: Loaded | null = null;
export const resetTrainingCache = () => {
  cached = null;
};

const APP: Record<TrainingPart, { name: string; icon: SFSymbol }> = {
  today: { name: '오늘 운동', icon: 'dumbbell.fill' },
  armcare: { name: '암케어', icon: 'cross.case.fill' },
  mechanics: { name: '메커니즘', icon: 'target' },
};

export function TrainingTab({ today, bottom, onWeb }: { today: string; bottom: number; onWeb: (href: string) => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [data, setData] = useState<Loaded | null>(() => (cached?.today === today ? cached : null));
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  /* 이 화면을 연 뒤 서버에서 한 번 받았나 — 받아 둔 카드의 '드릴 공 남기기'는 이미 남긴 뒤일 수 있어, 새로 받은 뒤에만 보인다 */
  const [fresh, setFresh] = useState(false);
  /* 껍데기가 그릴 때마다 새 onWeb 을 넘긴다 — 불러오기가 그것에 묶이면 그릴 때마다 다시 받았다 */
  const onWebRef = useRef(onWeb);
  useEffect(() => {
    onWebRef.current = onWeb;
  });

  const load = useCallback(() => {
    const e = cacheEpoch();
    return rpc<({ ok: true } & Loaded) | { ok: false; error: string; to?: string }>('app.loadAppTraining').then(
        (r) => {
          if (e !== cacheEpoch()) return;
          if (!r.ok) {
            if (r.to) onWebRef.current(r.to);
            return setError(r.error);
          }
          cached = r;
          void cacheSet('training', r);
          setData(r);
          setFresh(true);
          setError(null);
        },
        (err: unknown) => setError(err instanceof Error ? err.message : '불러오지 못했어요.')
      );
  }, []);
  useEffect(() => {
    let alive = true;
    if (!cached)
      void cacheGet('training').then((v) => {
        const d = v as Loaded | null;
        if (alive && d?.today === today && !cached) setData(d);
      });
    void load();
    return () => {
      alive = false;
    };
  }, [load, today]);

  /* 탭을 옮겼다 돌아오면 새로 받는다(1번 판 넘기기 — 판이 붙어 있어 마운트로는 안 받는다) */
  useOnTabActive(() => void load());
  /* 운동 · 체크인(앱 화면)에서 돌아오면 다시 받는다 — '이어서'·'마쳤어요'가 바로 바뀌게 */
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void load();
      focused.current = true;
    }, [load])
  );

  /* [시작] — 운동 판을 연다. 서버는 판을 열고 운동 화면 · 워밍업 · 쉬는 날 화면으로 보낸다(redirect) — 운동 화면이면 앱 화면, 나머지는 웹 */
  const startWorkout = async (a: Extract<CardAction, { kind: 'workout' }>) => {
    if (starting) return;
    setStarting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await rpc(a.program ? 'program.startProgramWorkout' : 'workout.startWorkout');
      /* 보내는 곳 없이 끝나면(드묾) 트레이닝 화면을 다시 받는다 */
      void load();
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect' && e.to) {
        if (e.to.startsWith('/workout/run')) router.push('/workout' as Href);
        /* 워밍업 창도 앱 화면으로(판 7) — 웹을 거치지 않고 */
        else if (e.to.startsWith('/workout/warmup')) router.push('/warmup' as Href);
        /* 통증을 남긴 날 — 웹 /workout/rest 와 같은 말을 알림창으로 */
        else if (e.to.startsWith('/workout/rest')) Alert.alert(REST_DAY.title, REST_DAY.body);
        else onWeb(e.to);
      } else Alert.alert('운동을 열지 못했어요', e instanceof Error ? e.message : '신호가 약해요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setStarting(false);
    }
  };
  const act = (a: CardAction) => {
    if (a.kind === 'workout') return void startWorkout(a);
    if (a.kind === 'checkin') return openCheckin('/training?view=home');
    /* 암케어 따라 하기는 앱 화면 — 웹(/armcare/play/<id>)을 거치면 한 번 더 읽고 넘긴다 */
    const armcare = /^\/armcare\/play\/([\w-]+)(\?.*)?$/.exec(a.href);
    if (armcare) return router.push(fromApp(`/armcare/${armcare[1]}${armcare[2] ?? ''}`) as Href);
    /* 메커니즘 따라 하기도 앱 화면(앱 판 4) */
    const mech = /^\/mechanics\/play(\?.*)?$/.exec(a.href);
    if (mech) return router.push(fromApp(`/mechanics${mech[1] ?? ''}`) as Href);
    onWeb(a.href);
  };

  const pull = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  /* 카드를 누르면 그 앱의 전체 화면 — 앱 화면이 있는 것은 앱으로(웹 탭 판 안의 화면이라 사이트가 넘기지 않는다) */
  const openPart = (app: TrainingPart) => {
    if (app === 'today') return router.push({ pathname: '/training-today' as Href as never, params: { today } });
    if (app === 'armcare') return router.push('/training-armcare' as Href);
    if (app === 'mechanics') return router.push('/training-mechanics' as Href);
    onWeb(TRAINING_PART_HREF[app]);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: 16, gap: 12 }, READABLE]}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.ink }]}>트레이닝</Text>
        <Pressable accessibilityRole="button" onPress={() => router.push('/analysis?view=training' as Href)} style={[styles.chip, { backgroundColor: c.chip }]}>
          <Text style={[styles.chipText, { color: c.ink }]}>분석</Text>
        </Pressable>
      </View>

      {/* 웹 트레이닝 홈과 같은 차례 — 제목 밑 날짜 띠(최근 6주) → 이번 주 한 줄 → 앱 카드 셋 */}
      {data?.strip?.length ? <DayStrip days={data.strip} today={data.today} c={c} /> : null}
      {data?.week ? <WeekLine week={data.week} c={c} /> : null}

      {error && !data ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
      {!data && !error ? <ActivityIndicator style={{ paddingVertical: 24 }} /> : null}

      {data?.cards.map((card) => (
        <Card key={card.app} card={fresh ? card : { ...card, throwNote: null }} busy={starting} onOpen={() => openPart(card.app)} onAction={act} onWeb={onWeb} />
      ))}
    </ScrollView>
  );
}

function Card({
  card,
  busy,
  onOpen,
  onAction,
  onWeb,
}: {
  card: TrainingCard;
  busy: boolean;
  onOpen: () => void;
  onAction: (a: CardAction) => void;
  onWeb: (href: string) => void;
}) {
  const c = usePalette();
  const a = APP[card.app];
  const toneColor = card.tone === 'warn' ? c.danger : card.tone === 'done' ? c.sky : c.muted;
  const label =
    card.action?.kind === 'workout' ? (card.action.resume ? '이어서' : '시작') : card.action ? card.action.label : null;
  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${a.name}. ${card.status}`} onPress={onOpen} style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.sky }]}>
          <SymbolView name={a.icon} size={22} tintColor="#fff" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.name, { color: c.ink }]}>{a.name}</Text>
          <Text style={{ color: toneColor, fontSize: 14 }}>
            {card.tone === 'done' ? '✓ ' : ''}
            {card.status}
          </Text>
        </View>
        {card.action && label ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy && card.action.kind === 'workout'}
            onPress={() => onAction(card.action!)}
            style={({ pressed }) => [styles.start, { backgroundColor: c.sky }, (pressed || (busy && card.action?.kind === 'workout')) && { opacity: 0.6 }]}
          >
            {card.action.kind !== 'checkin' ? <SymbolView name="play.fill" size={12} tintColor="#fff" /> : null}
            <Text style={styles.startText}>{label}</Text>
          </Pressable>
        ) : (
          <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
        )}
      </Pressable>
      {card.bars ? (
        <View style={styles.bars} accessibilityLabel={card.bars.label}>
          {Array.from({ length: card.bars.total }, (_, i) => (
            <View
              key={i}
              style={[styles.bar, { backgroundColor: i < card.bars!.index ? c.sky : i === card.bars!.index ? `${c.sky}59` : c.line }]}
            />
          ))}
        </View>
      ) : null}
      {card.gap ? (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            /* 암케어 빈 곳 줄(/training?view=armcare&tab=guide)은 앱 암케어 화면의 부위별 보강 칸으로 */
            card.gap!.href === '/training?view=armcare&tab=guide'
              ? router.push({ pathname: '/training-armcare' as Href as never, params: { tab: 'guide' } })
              : onWeb(card.gap!.href)
          }
          style={styles.line}
        >
          <Text style={{ color: c.sky, fontSize: 13, fontWeight: '600' }}>{card.gap.text} ›</Text>
        </Pressable>
      ) : null}
      {/* 웹 트레이닝 홈의 드릴 공 줄과 같은 부품(DRILL_THROW_TEXT 문구 · '이미 넣었어요' · '안 적을래요' 닫기 — mechanics.closeDrillThrowNote) */}
      {card.throwNote ? <ThrowNoteCard note={card.throwNote} c={c} /> : null}
    </View>
  );
}

/**
 * 날짜 띠 — 웹 day-strip.tsx(components/date-scroll-strip.tsx)와 같은 최근 6주를 옆으로 굴리는 한 줄. 칸 밑 점은 그날 한 것(운동 · 암케어 ·
 * 메커니즘), 지난날을 누르면 그날 기록(앱 화면 /training/day/<날짜>), 오늘은 여기(누르지 않음). 처음엔 오늘 쪽(끝)을 보인다.
 */
function DayStrip({ days, today, c }: { days: TrainingStripDay[]; today: string; c: ReturnType<typeof usePalette> }) {
  const ref = useRef<ScrollViewInstance>(null);
  return (
    <ScrollView
      ref={ref}
      horizontal
      showsHorizontalScrollIndicator={false}
      onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
      contentContainerStyle={{ gap: 6 }}
    >
      {days.map((day) => {
        const on = day.date === today;
        const [, m, d] = day.date.split('-').map(Number);
        const week = '일월화수목금토'[new Date(`${day.date}T00:00:00Z`).getUTCDay()];
        const dots = [day.workout, day.armcare, day.drill];
        return (
          <Pressable
            key={day.date}
            accessibilityRole="button"
            accessibilityLabel={`${m}월 ${d}일${on ? ', 오늘' : ''}`}
            disabled={on}
            onPress={() => router.push(`/training/day/${day.date}` as Href)}
            style={[styles.day, { backgroundColor: c.card, borderColor: on ? c.sky : 'transparent' }]}
          >
            {/* 1일 칸은 요일 대신 'N월'(웹 date-scroll-strip 과 같다) */}
            <Text style={{ fontSize: 11, color: on ? c.sky : c.muted }}>{d === 1 ? `${m}월` : week}</Text>
            <Text style={{ fontSize: 17, fontWeight: on ? '800' : '600', color: on ? c.sky : c.ink, fontVariant: ['tabular-nums'] }}>{d}</Text>
            <View style={styles.dots}>
              {dots.map((x, i) => (x ? <View key={i} style={[styles.dot, { backgroundColor: c.sky }]} /> : null))}
            </View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** 이번 주 한 줄 — 웹 WeekStrip 과 같은 글('이번 주 운동 N일 · 암케어 N일 · 메커니즘 N일', 다 0 이면 '이번 주는 아직 기록이 없어요.') */
function WeekLine({ week, c }: { week: TrainingWeekCounts; c: ReturnType<typeof usePalette> }) {
  const cells: [string, number][] = [
    ['운동', week.today],
    ['암케어', week.armcare],
    ['메커니즘', week.mechanics],
  ];
  const none = cells.every(([, n]) => n === 0);
  return (
    <View style={[styles.week, { backgroundColor: c.card }]}>
      {none ? (
        <Text style={{ color: c.muted, fontSize: 15 }}>이번 주는 아직 기록이 없어요.</Text>
      ) : (
        <Text style={{ color: c.muted, fontSize: 15 }}>
          <Text style={{ color: c.ink, fontWeight: '600' }}>이번 주</Text>
          {cells.map(([name, n]) => (
            <Text key={name}>
              {'   '}
              {name} <Text style={{ color: c.ink, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{n}일</Text>
            </Text>
          ))}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  day: { width: 48, minHeight: 64, borderRadius: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dots: { flexDirection: 'row', gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  week: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  title: { flex: 1, fontSize: 34, fontWeight: '700' },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 20, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '700' },
  start: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 20, paddingHorizontal: 16 },
  startText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  bars: { flexDirection: 'row', gap: 2 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  line: { minHeight: 32, justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12 },
});
