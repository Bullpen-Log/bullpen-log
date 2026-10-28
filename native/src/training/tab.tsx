import { ActionButton } from '~/shell/action-button';
import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import type { CardAction, ProgramShelf, TrainingCard } from '@/lib/report/training-home-data';
import { ThrowNoteCard } from '~/mechanics/parts';
import type { TrainingPart } from '@/lib/training-part';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { RADIUS, SPACE, TYPE, usePalette, useTheme, withAlpha } from '~/lib/ui';
import { fromApp, openCheckin } from '~/shell/web-nav';
import { READABLE } from '~/lib/layout';
import { useFocusRefresh, useOnTabActive, useRetapTop } from '~/shell/tab-pager';
import { PageHead } from '~/shell/heading';
import { MenuButton } from '~/shell/menu-button';
import { Icon, type IconName } from '~/shell/icon';
import { Pulse } from '~/shell/motion';
import { Press } from '~/shell/press';
import { weekdayKo } from '~/home/plan-model';
import { ProgramCards } from './program-cards';

/**
 * 트레이닝 탭 첫 화면(앱 화면) — 2026-10-29 확정 디자인: 오늘 트레이닝(상태마다 주 단추 하나) → 암케어 · 메커니즘 작은 카드 둘 →
 * 프로그램 가로 카드 → 운동 영상. 판정은 웹 트레이닝 홈과 같은 lib/report/training-home-data.ts(app.loadAppTraining) — 상태 · 운동 수 · 분은
 * 그날 일정의 실제 값만(state · plan 칸, 옛 서버면 action · tone 으로 짐작). [시작]은 운동 화면(/workout)을 바로 밀고, 암케어 · 메카닉 따라 하기 ·
 * 각 앱의 전체 화면도 앱 화면이다. 지난날 트레이닝 기록은 기록 탭(날짜별)에서 본다 — 예전 날짜 띠 · 이번 주 한 줄은 걷었다.
 */
type Loaded = { today: string; cards: TrainingCard[]; programs?: ProgramShelf | null };
let cached: Loaded | null = null;
export const resetTrainingCache = () => {
  cached = null;
};

type TodayState = NonNullable<TrainingCard['state']>;
/** 옛 서버(state 칸 없음)의 카드 — action · tone 으로 짐작 */
const stateOf = (card: TrainingCard): TodayState =>
  card.state ??
  (card.tone === 'done' ? 'done' : card.action?.kind === 'workout' ? (card.action.resume ? 'active' : 'planned') : 'none');

const STATE_LABEL: Record<TodayState, string> = { none: '일정 없음', planned: '운동 예정', active: '운동 중', done: '오늘 완료', rest: '쉬는 날' };

export function TrainingTab({ today, bottom, onWeb }: { today: string; bottom: number; onWeb: (href: string) => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [data, setData] = useState<Loaded | null>(() => (cached?.today === today ? cached : null));
  const [error, setError] = useState<string | null>(null);
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
      (err: unknown) => {
        /* 로그인이 풀렸으면 다른 화면처럼 그 주소로(로그인) */
        if (err instanceof RpcError && err.code === 'redirect') return onWebRef.current(err.to ?? '/login');
        setError(err instanceof Error ? err.message : '불러오지 못했어요.');
      }
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

  /* 탭을 옮겼다 돌아오면 새로 받는다(판이 붙어 있어 마운트로는 안 받는다) */
  useOnTabActive(() => void load());
  /* 운동 · 체크인(앱 화면)에서 돌아오면 다시 받는다 — '이어서'·'마쳤어요'가 바로 바뀌게 */
  useFocusRefresh(() => void load());

  /* [시작] — 운동 화면을 바로 밀고, 판을 여는 것(서버)은 그 화면이 한다(app/workout.tsx ?start=). 워밍업 · 쉬는 날 · 웹으로 보내는 것도 거기서 */
  const startWorkout = (a: Extract<CardAction, { kind: 'workout' }>) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push(`/workout?start=${a.program ? 'program' : 'daily'}` as Href);
  };
  const act = (a: CardAction) => {
    if (a.kind === 'workout') return void startWorkout(a);
    if (a.kind === 'checkin') return openCheckin('/training?view=home');
    /* 암케어 따라 하기는 앱 화면 — 웹(/armcare/play/<id>)을 거치면 한 번 더 읽고 넘긴다 */
    const armcare = /^\/armcare\/play\/([\w-]+)(\?.*)?$/.exec(a.href);
    if (armcare) return router.push(fromApp(`/armcare/${armcare[1]}${armcare[2] ?? ''}`) as Href);
    /* 메카닉 따라 하기도 앱 화면(앱 판 4) */
    const mech = /^\/mechanics\/play(\?.*)?$/.exec(a.href);
    if (mech) return router.push(fromApp(`/mechanics${mech[1] ?? ''}`) as Href);
    onWeb(a.href);
  };

  /* 카드를 누르면 그 앱의 전체 화면 — 모두 앱 화면이다 */
  const openPart = (app: TrainingPart) => {
    if (app === 'today') return router.push({ pathname: '/training-today' as Href as never, params: { today } });
    if (app === 'armcare') return router.push('/training-armcare' as Href);
    router.push('/training-mechanics' as Href);
  };

  /* 지금 탭(트레이닝)을 다시 누르면 맨 위로 */
  const topRef = useRef<ScrollViewInstance>(null);
  useRetapTop(() => topRef.current?.scrollTo({ y: 0, animated: true }));

  const cardOf = (app: TrainingPart) => data?.cards.find((x) => x.app === app) ?? null;
  const todayCard = cardOf('today');
  const armcare = cardOf('armcare');
  const mechanics = cardOf('mechanics');
  const day = data?.today ?? today;

  return (
    <ScrollView
      ref={topRef}
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: 14 }, READABLE]}
    >
      <PageHead title="트레이닝">
        <MenuButton />
      </PageHead>

      <View style={styles.sectionHead}>
        <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink, flex: 1 }]}>
          오늘 트레이닝
        </Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>{`${Number(day.slice(5, 7))}월 ${Number(day.slice(8, 10))}일 · ${weekdayKo(day)}`}</Text>
      </View>

      {error && !data ? (
        <View style={{ gap: 12, alignItems: 'flex-start' }}>
          <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text>
          <Press
            accessibilityRole="button"
            onPress={() => void load()}
            style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.action }}
          >
            <Text style={{ color: c.onAction, fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
          </Press>
        </View>
      ) : null}
      {error && data ? <Text style={{ color: c.muted, fontSize: 13 }}>새로 받지 못했어요. 마지막으로 받은 내용이에요.</Text> : null}

      {todayCard ? (
        <TodayHero card={todayCard} today={day} onOpen={() => openPart('today')} onWorkout={startWorkout} />
      ) : !error ? (
        <Pulse style={[styles.skel, { height: 236, backgroundColor: c.line }]} />
      ) : null}

      {armcare || mechanics ? (
        <View style={styles.pair}>
          {armcare ? <MiniCard card={armcare} title="암케어" glyph="shield-plus" fallback="루틴 보기" onPress={() => (armcare.action ? act(armcare.action) : openPart('armcare'))} onOpen={() => openPart('armcare')} /> : null}
          {mechanics ? <MiniCard card={mechanics} title="메커니즘" glyph="focus" fallback="프로그램 보기" onPress={() => (mechanics.action ? act(mechanics.action) : openPart('mechanics'))} onOpen={() => openPart('mechanics')} /> : null}
        </View>
      ) : data ? null : (
        <View style={styles.pair}>
          <Pulse style={[styles.skel, { flex: 1, height: 132, backgroundColor: c.line }]} />
          <Pulse style={[styles.skel, { flex: 1, height: 132, backgroundColor: c.line }]} />
        </View>
      )}
      {/* 웹 트레이닝 홈의 드릴 공 줄과 같은 부품 — 메카닉 드릴로 던진 공을 투구 기록에 남기라는 한 줄 */}
      {fresh && mechanics?.throwNote ? <ThrowNoteCard note={mechanics.throwNote} c={c} /> : null}

      {data?.programs ? <ProgramCards shelf={data.programs} today={day} /> : null}

      <Press
        accessibilityRole="button"
        accessibilityLabel="운동 영상, 운동 찾기 · 즐겨찾기"
        onPress={() => router.push('/library/training' as Href)}
        style={[styles.video, { backgroundColor: c.card, boxShadow: c.float }]}
      >
        <View style={[styles.videoIcon, { backgroundColor: withAlpha(c.link, 0.12) }]}>
          <Icon name="clapperboard" size={22} color={c.link} />
        </View>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[TYPE.card, { color: c.ink }]}>운동 영상</Text>
          <Text style={{ color: c.muted, fontSize: 13 }}>운동 찾기 · 즐겨찾기</Text>
        </View>
        <Icon name="chevron-right" size={18} color={c.muted} />
      </Press>
    </ScrollView>
  );
}

/**
 * 오늘 트레이닝 — 남색 카드 하나에 상태 · 이름 · 실제 값 한 줄 · 주 단추 하나.
 * 일정 없음 '오늘 운동 만들기' · 예정 '운동 시작' · 운동 중 '이어서 하기' · 마침 '운동 기록 보기' · 쉬는 날 '일정 보기'(운동을 다그치지 않는다).
 */
function TodayHero({
  card,
  today,
  onOpen,
  onWorkout,
}: {
  card: TrainingCard;
  today: string;
  onOpen: () => void;
  onWorkout: (a: Extract<CardAction, { kind: 'workout' }>) => void;
}) {
  const c = usePalette();
  const dark = useTheme() !== 'light';
  const state = stateOf(card);
  const plan = card.plan;
  const title = state === 'planned' || state === 'active' ? (plan?.title ?? '오늘 운동') : '오늘 운동';
  const facts =
    plan && (state === 'planned' || state === 'active')
      ? (plan.sub ?? [plan.count != null ? `${plan.count}종목` : null, plan.minutes ? `약 ${plan.minutes}분` : null].filter(Boolean).join(' · ')) || null
      : null;
  /* 주의(상태 바뀜 · 멈춤)는 서버 글 그대로 — 실제 값 줄보다 먼저 */
  const sub = card.tone === 'warn' || !facts ? card.status : facts;
  const workout = card.action?.kind === 'workout' ? card.action : null;
  const button: { label: string; icon: IconName; go: () => void } =
    state === 'done'
      ? { label: '운동 기록 보기', icon: 'chevron-right', go: () => router.push(`/training/day/${today}` as Href) }
      : state === 'active' && workout
        ? { label: '이어서 하기', icon: 'play', go: () => onWorkout(workout) }
        : state === 'planned' && workout
          ? { label: '운동 시작', icon: 'play', go: () => onWorkout(workout) }
          : state === 'none'
            ? { label: '오늘 운동 만들기', icon: 'plus', go: onOpen }
            : { label: '일정 보기', icon: 'chevron-right', go: onOpen };
  const ink = '#f4fbff';
  const soft = '#b5d5eb';
  return (
    <View style={[styles.hero, { backgroundColor: dark ? '#0d2940' : '#153f60', boxShadow: c.floatHero }]}>
      <Press accessibilityRole="button" accessibilityLabel={`오늘 트레이닝, ${STATE_LABEL[state]}, ${title}. ${sub}`} onPress={onOpen} style={styles.heroBody}>
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Text style={{ color: soft, fontSize: 12 }}>{STATE_LABEL[state]}</Text>
          <Text style={[TYPE.hero, { color: ink }]} numberOfLines={2}>
            {title}
          </Text>
          <Text style={{ color: card.tone === 'warn' ? '#ffd8a8' : soft, fontSize: 13, lineHeight: 19 }}>
            {card.tone === 'done' ? '✓ ' : ''}
            {sub}
          </Text>
        </View>
        <DumbbellArt done={state === 'done'} />
      </Press>
      <ActionButton label={button.label} icon={button.icon} onPress={button.go} style={{ borderRadius: 16 }} />
    </View>
  );
}

/** 암케어 · 메커니즘 — 이름 · 그림 칩, 오늘 할 것 한 줄(서버 글 그대로), 밑에 누르면 할 일. 카드 전체가 그 한 일이다 */
function MiniCard({
  card,
  title,
  glyph,
  fallback,
  onPress,
  onOpen,
}: {
  card: TrainingCard;
  title: string;
  glyph: IconName;
  fallback: string;
  onPress: () => void;
  onOpen: () => void;
}) {
  const c = usePalette();
  const label = card.action ? (card.action.kind === 'workout' ? '시작' : card.action.label) : fallback;
  const tone = card.tone === 'warn' ? c.warn : card.tone === 'done' ? c.ok : c.ink;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${card.status}. ${label}`}
      accessibilityActions={[{ name: 'longpress', label: `${title} 전체 보기` }]}
      onAccessibilityAction={onOpen}
      onPress={onPress}
      onLongPress={onOpen}
      style={[styles.mini, { backgroundColor: c.card, boxShadow: c.float }]}
    >
      <View style={styles.miniHead}>
        <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>{title}</Text>
        <View style={[styles.miniIcon, { backgroundColor: withAlpha(c.link, 0.12) }]}>
          <Icon name={glyph} size={17} color={c.link} />
        </View>
      </View>
      <Text numberOfLines={2} style={{ color: tone, fontSize: 15, fontWeight: '600', lineHeight: 21 }}>
        {card.tone === 'done' ? '✓ ' : ''}
        {card.status}
      </Text>
      <View style={styles.miniFoot}>
        <Text style={{ color: c.muted, fontSize: 13, flex: 1 }} numberOfLines={1}>
          {label}
        </Text>
        <Icon name="chevron-right" size={15} color={c.muted} />
      </View>
    </Press>
  );
}

/** 오늘 운동 카드의 그림 — 덤벨(소프트 솔리드) · 오른쪽 아래 작은 +(마친 날은 ✓) */
function DumbbellArt({ done }: { done: boolean }) {
  return (
    <View style={{ width: 104, height: 92 }} accessible={false}>
      <Svg width={104} height={92} viewBox="0 0 104 92">
        <Defs>
          <LinearGradient id="db-plate" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#9fd0f7" />
            <Stop offset="1" stopColor="#4a8fd0" />
          </LinearGradient>
          <LinearGradient id="db-bar" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#e8f3fc" />
            <Stop offset="1" stopColor="#9db7cc" />
          </LinearGradient>
        </Defs>
        <Rect x="30" y="38" width="44" height="12" rx="6" fill="url(#db-bar)" transform="rotate(-32 52 44)" />
        <Rect x="10" y="40" width="22" height="40" rx="10" fill="url(#db-plate)" transform="rotate(-32 21 60)" />
        <Rect x="22" y="34" width="16" height="32" rx="8" fill="url(#db-plate)" opacity={0.9} transform="rotate(-32 30 50)" />
        <Rect x="66" y="10" width="22" height="40" rx="10" fill="url(#db-plate)" transform="rotate(-32 77 30)" />
        <Rect x="62" y="20" width="16" height="32" rx="8" fill="url(#db-plate)" opacity={0.9} transform="rotate(-32 70 36)" />
      </Svg>
      <View style={styles.badge}>
        <Icon name={done ? 'check' : 'plus'} size={14} color="#eaf5ff" strokeWidth={2.6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  skel: { borderRadius: 24 },
  hero: { borderRadius: 26, padding: SPACE.pad, gap: 16 },
  heroBody: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 120 },
  badge: { position: 'absolute', right: 2, bottom: 2, width: 28, height: 28, borderRadius: 9, backgroundColor: 'rgba(255,255,255,0.16)', alignItems: 'center', justifyContent: 'center' },
  pair: { flexDirection: 'row', gap: 12, alignItems: 'stretch' },
  mini: { flex: 1, minWidth: 0, minHeight: 132, borderRadius: RADIUS.card, padding: 16, gap: 8 },
  miniHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  miniIcon: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  miniFoot: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 'auto', minHeight: 24 },
  video: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: RADIUS.card, padding: 16, minHeight: 76 },
  videoIcon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});

