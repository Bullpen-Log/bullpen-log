import { ActionButton } from '~/shell/action-button';
import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, type ScrollViewInstance, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardAction, TrainingCard } from '@/lib/report/training-home-data';
import type { TrainingWeekCounts } from '@/lib/report/training-week-counts';
import type { TrainingStripDay } from '@/lib/training-week';
import { ThrowNoteCard } from '~/mechanics/parts';
import { TRAINING_PART_HREF, type TrainingPart } from '@/lib/training-part';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { RADIUS, SPACE, TYPE, usePalette, withAlpha } from '~/lib/ui';
import { fromApp, openCheckin } from '~/shell/web-nav';
import { READABLE } from '~/lib/layout';
import { useFocusRefresh, useOnTabActive, useRetapTop } from '~/shell/tab-pager';
import { DateStrip } from '~/shell/date-strip';
import { DateNavButton } from '~/shell/mini-calendar';
import { shiftDateKey } from '@/lib/pitch-stats';
import { AnalysisPill, PageHead } from '~/shell/heading';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 트레이닝 탭 첫 화면(앱 화면) — 웹 트레이닝 홈(app/(app)/training/training-home.tsx)과 같은 앱 카드 셋(오늘 운동 · 암케어 · 메커니즘,
 * 판정은 lib/report/training-home-data.ts — app.loadAppTraining). [시작]은 운동 판을 열어 앱 운동 화면(/workout)으로, 암케어 · 메커니즘
 * 따라 하기 · 각 앱의 전체 화면(카드를 누름)도 앱 화면(/armcare · /mechanics · /training-*), 앱 화면이 없는 곳만 onWeb.
 */
type Loaded = { today: string; cards: TrainingCard[]; strip?: TrainingStripDay[]; week?: TrainingWeekCounts };
let cached: Loaded | null = null;
export const resetTrainingCache = () => {
  cached = null;
  markedDays = null;
};

const APP: Record<TrainingPart, { name: string; glyph: IconName }> = {
  today: { name: '오늘 운동', glyph: 'dumbbell' },
  armcare: { name: '암케어', glyph: 'shield-plus' },
  mechanics: { name: '메커니즘', glyph: 'pitcher' },
};

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

  /* 탭을 옮겼다 돌아오면 새로 받는다(1번 판 넘기기 — 판이 붙어 있어 마운트로는 안 받는다) */
  useOnTabActive(() => void load());
  /* 운동 · 체크인(앱 화면)에서 돌아오면 다시 받는다 — '이어서'·'마쳤어요'가 바로 바뀌게 */
  useFocusRefresh(() => void load());

  /* [시작] — 운동 판을 연다. 서버는 판을 열고 운동 화면 · 워밍업 · 쉬는 날 화면으로 보낸다(redirect) — 운동 화면이면 앱 화면, 나머지는 웹 */
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
    /* 메커니즘 따라 하기도 앱 화면(앱 판 4) */
    const mech = /^\/mechanics\/play(\?.*)?$/.exec(a.href);
    if (mech) return router.push(fromApp(`/mechanics${mech[1] ?? ''}`) as Href);
    onWeb(a.href);
  };

  /* 카드를 누르면 그 앱의 전체 화면 — 앱 화면이 있는 것은 앱으로(웹 탭 판 안의 화면이라 사이트가 넘기지 않는다) */
  const openPart = (app: TrainingPart) => {
    if (app === 'today') return router.push({ pathname: '/training-today' as Href as never, params: { today } });
    if (app === 'armcare') return router.push('/training-armcare' as Href);
    if (app === 'mechanics') return router.push('/training-mechanics' as Href);
    onWeb(TRAINING_PART_HREF[app]);
  };

  /* 지금 탭(트레이닝)을 다시 누르면 맨 위로(1번 세션 — 앱 틀) */
  const topRef = useRef<ScrollViewInstance>(null);
  useRetapTop(() => topRef.current?.scrollTo({ y: 0, animated: true }));

  return (
    <ScrollView
      ref={topRef}
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: 16, gap: 12 }, READABLE]}
    >
      <PageHead title="트레이닝">
        <AnalysisPill view="training" />
      </PageHead>

      {/* 웹 트레이닝 홈과 같은 차례 — 제목 밑 날짜 띠(최근 6주, 칸 밑 점 = 그날 한 것) → 앱 카드 셋 → 이번 주 한 줄 */}
      {data?.strip?.length ? (
        <DateStrip
          days={data.strip.map((d) => d.date)}
          date={data.today}
          today={data.today}
          /* 오늘은 이 화면이 그날이다(웹 trainingDayHref — 오늘은 트레이닝 홈) */
          onPick={(d) => (d === data.today ? undefined : router.push(`/training/day/${d}` as Href))}
          labelOf={(d) => {
            const x = data.strip!.find((y) => y.date === d);
            const done = x ? [x.workout && '운동', x.armcare && '암케어', x.drill && '메커니즘'].filter(Boolean) : [];
            return done.length ? done.join(' · ') : '기록 없음';
          }}
          mark={(d, selected) => {
            const x = data.strip!.find((y) => y.date === d);
            const n = x ? [x.workout, x.armcare, x.drill].filter(Boolean).length : 0;
            return (
              <View style={styles.dots}>
                {Array.from({ length: n }, (_, i) => (
                  <View key={i} style={[styles.dot, { backgroundColor: selected ? '#fff' : c.sky }]} />
                ))}
              </View>
            );
          }}
          end={<TrainingDateNav today={data.today} />}
        />
      ) : null}

      {error ? (
        <View style={{ gap: 12, alignItems: 'flex-start' }}>
          <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text>
          {!data ? (
            <Press
              accessibilityRole="button"
              onPress={() => void load()}
              style={{ minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: c.action }}
            >
              <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
            </Press>
          ) : null}
        </View>
      ) : null}
      {!data && !error ? <ActivityIndicator style={{ paddingVertical: 24 }} /> : null}

      {data?.cards.map((card) => (
        <Card key={card.app} card={fresh ? card : { ...card, throwNote: null }} busy={false} onOpen={() => openPart(card.app)} onAction={act} onWeb={onWeb} />
      ))}
      {data?.week ? <WeekLine week={data.week} c={c} /> : null}
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
  const toneColor = card.tone === 'warn' ? c.danger : card.tone === 'done' ? c.ok : c.muted;
  const label =
    card.action?.kind === 'workout' ? (card.action.resume ? '이어서' : '시작') : card.action ? card.action.label : null;
  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Press accessibilityRole="button" accessibilityLabel={`${a.name}. ${card.status}`} onPress={onOpen} style={styles.row}>
        {/* 그림 판은 옅은 회색 — 파랑은 [시작] 단추에만(2026-10-21: 카드 셋의 파란 판 셋 + 파란 단추 셋이라 누를 곳이 안 보였다) */}
        <View style={[styles.icon, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Icon name={a.glyph} size={24} color={c.ink} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.name, { color: c.ink }]}>{a.name}</Text>
          <Text style={{ color: toneColor, fontSize: 15 }}>
            {card.tone === 'done' ? '✓ ' : ''}
            {card.status}
          </Text>
        </View>
        {card.action && label ? (
          <ActionButton
            compact
            label={label}
            icon={card.action.kind === 'checkin' ? undefined : 'play'}
            disabled={busy && card.action.kind === 'workout'}
            onPress={() => onAction(card.action!)}
          />
        ) : (
          <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
        )}
      </Press>
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
        <Press
          accessibilityRole="button"
          onPress={() =>
            /* 암케어 빈 곳 줄(/training?view=armcare&tab=guide)은 앱 암케어 화면의 부위별 보강 칸으로 */
            card.gap!.href === '/training?view=armcare&tab=guide'
              ? router.push({ pathname: '/training-armcare' as Href as never, params: { tab: 'guide' } })
              : onWeb(card.gap!.href)
          }
          style={styles.line}
        >
          <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>{card.gap.text} ›</Text>
        </Press>
      ) : null}
      {/* 웹 트레이닝 홈의 드릴 공 줄과 같은 부품(DRILL_THROW_TEXT 문구 · '이미 넣었어요' · '안 적을래요' 닫기 — mechanics.closeDrillThrowNote) */}
      {card.throwNote ? <ThrowNoteCard note={card.throwNote} c={c} /> : null}
    </View>
  );
}

/** 띠 끝 달력 — 1년 치 한 날에 점(웹 training/date-nav.tsx · training-days.trainingMarkedDays, 열 때 한 번 받는다), 고르면 그날 기록 */
let markedDays: Set<string> | null = null;
function TrainingDateNav({ today }: { today: string }) {
  const [, bump] = useState(0);
  /* 탭을 열 때마다 다시 받는다(받아 둔 건 그동안 보임) — 한 번만 받으면 운동을 마치고 와도 점이 안 늘고 로그아웃 뒤 남의 점이 남았다 */
  useEffect(() => {
    void rpc<string[]>('training-days.trainingMarkedDays').then(
      (days) => {
        markedDays = new Set(days);
        bump((n) => n + 1);
      },
      () => undefined
    );
  }, []);
  return (
    <DateNavButton
      date={today}
      today={today}
      min={shiftDateKey(today, -366)}
      marked={(d) => markedDays?.has(d) ?? false}
      onPick={(d) => (d === today ? router.push({ pathname: '/training-today' as Href as never, params: { today } }) : router.push(`/training/day/${d}` as Href))}
    />
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
    <View style={[styles.week, { backgroundColor: c.card, borderWidth: StyleSheet.hairlineWidth, borderColor: c.line }]}>
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
  dots: { flexDirection: 'row', gap: 2, height: 6, marginTop: 4, alignItems: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3 },
  week: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  title: { flex: 1, fontSize: 34, fontWeight: '700' },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: RADIUS.card, padding: SPACE.pad, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12.3, alignItems: 'center', justifyContent: 'center' },
  name: { ...TYPE.card },
  bars: { flexDirection: 'row', gap: 2 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  line: { minHeight: 32, justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12 },
});
