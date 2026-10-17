import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toDateKey } from '@/lib/pitch-stats';
import type { TrainingToday } from '@/lib/report/training-today-data';
import { leave } from '~/mechanics/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { usePalette, type Palette } from '~/lib/ui';
import { useWebNav } from '~/shell/web-nav';
import { BigButton, s, WebRows, type TodayActions } from '~/training/today/parts';
import { DoneView, HaltedCard, MakeCard, NoticeBand, OutingRow, PlanBody, PrefsCard, ProgramDayRow } from '~/training/today/plan';
import { ProgramCardView, ProgramDoneView } from '~/training/today/program';
import { ProgramStartView } from '~/training/today/program-start';

/**
 * 트레이닝 '운동' 앱 화면 — 웹 /training(기본 칸, app/(app)/training/training-page.tsx)을 옮겼다. 앱 트레이닝 탭(native/src/training/tab.tsx)의 운동
 * 카드에서 들어온다. 무엇을 그릴지는 웹과 같은 곳에서 읽는다(app/actions/app-training.ts → lib/report/training-today-data.ts).
 *
 * 웹과 같은 차례: 근력 프로그램 카드 → 프로그램 결과 → 상태 바뀜 띠 → 완료 카드 · [운동 시작] → 프로그램 고르기 → 다음 등판 → 일정 자리(멈춤 ·
 * 프로그램 날 한 줄 · 만들기 · 남은 것 없음 · 일정 카드와 체크 목록 · 오늘 운동 메모). 체크 · 별 · 빼기 · 메모 · 일정 만들기(자동 맞춤 · 직접 고르기 ·
 * 조건 바꿔 다시 만들기) · 운동 추가 · 오늘 하고 싶은 운동 · 프로그램 고르기 · 시작 · 건너뛰기 · 그만두기 · 고정 운동 바꾸기는 웹과 같은 서버 동작을
 * 부른다(시트). 지난 날 기록은 앱 화면(/training/day/<날짜>), 트레이닝 설정 · 가진 장비는 웹(화면을 닫고 웹을 그 주소로).
 *
 * [운동 시작]은 트레이닝 탭과 같은 길(판을 열면 서버가 운동 화면으로 보낸다 → 앱 운동 화면). 운동을 마치면 운동 화면이 웹을 축하 화면으로 보내고
 * 닫는데, 그 화면이 이 화면 밑에 깔리지 않게 이 화면도 같이 닫는다(useWebNav).
 */
type LoadResult = ({ ok: true } & TrainingToday) | { ok: false; to: string };

const KEY = 'training-today';
/* 메모리에 둔 마지막 값 — 로그인 세대(cacheEpoch)가 같을 때만 쓴다(로그아웃 뒤 다른 사람에게 앞사람 운동이 비치지 않게) */
let memory: { epoch: number; data: TrainingToday } | null = null;
const remembered = () => (memory?.epoch === cacheEpoch() ? memory.data : null);

const WEEKDAY = '일월화수목금토';
/** 날짜 키의 월 · 일 · 요일 — 폰의 시간대와 상관없이 그 날로 */
const dayOf = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return { month: m, day: d, week: WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
};

export default function TrainingTodayScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ today?: string }>();
  /* 트레이닝 탭이 서버의 오늘을 넘기면 그것(시험 계정 날짜까지), 없으면 폰의 오늘 — 받아 둔 값이 그날 것일 때만 먼저 보인다 */
  const today = typeof params.today === 'string' ? params.today : toDateKey(new Date());
  const [data, setData] = useState<TrainingToday | null>(() => (remembered()?.today === today ? remembered() : null));
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);

  const load = useCallback((): Promise<void> => {
    const e = cacheEpoch();
    return rpc<LoadResult>('app-training.loadAppTrainingToday').then(
      (r) => {
        if (e !== cacheEpoch()) return;
        if (!r.ok) return leave(r.to);
        memory = { epoch: e, data: r };
        void cacheSet(KEY, r);
        setData(r);
        setFailed(null);
      },
      (err: unknown) => {
        if (err instanceof RpcError && err.code === 'redirect') return leave(err.to ?? '/login');
        setFailed(err instanceof RpcError && err.code === 'update' ? '앱을 업데이트해 주세요.' : '신호가 약해 운동을 불러오지 못했어요.');
      }
    );
  }, []);

  useEffect(() => {
    let alive = true;
    const e = cacheEpoch();
    if (!remembered())
      void cacheGet(KEY).then((v) => {
        const d = v as TrainingToday | null;
        if (alive && e === cacheEpoch() && d?.today === today && !remembered()) setData(d);
      });
    void load();
    return () => {
      alive = false;
    };
  }, [load, today]);

  /* 운동을 마치면 운동 화면이 웹을 축하 화면(/workout/done)으로 보낸다 — 이 화면이 그 위에 남으면 축하 · 힘듦 칩이 안 보여, 돌아오면 같이 닫는다 */
  const finished = useRef(false);
  useWebNav(
    useCallback((href: string) => {
      if (href.startsWith('/workout/done')) finished.current = true;
    }, [])
  );
  /* 운동 · 체크인(앱 화면)에서 돌아오면 다시 받는다 — '이어서'·완료 카드가 바로 바뀌게 */
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (finished.current) {
        finished.current = false;
        router.back();
        return;
      }
      if (focused.current) void load();
      focused.current = true;
    }, [load])
  );

  /* [시작] — 트레이닝 탭과 같다: 판을 열면 서버가 운동 화면 · 쉬는 날 화면으로 보낸다(운동 화면이면 앱 화면, 트레이닝이면 다시 읽기, 나머지는 웹) */
  const start = async (program: boolean) => {
    if (starting) return;
    setStarting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await rpc(program ? 'program.startProgramWorkout' : 'workout.startWorkout');
      await load();
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect' && e.to) {
        if (e.to.startsWith('/workout/run')) router.push('/workout' as Href);
        else if (e.to === '/training') await load();
        else leave(e.to);
      } else Alert.alert('운동을 열지 못했어요', e instanceof Error ? e.message : '신호가 약해요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setStarting(false);
    }
  };

  /* 일정 만들기 — 웹 폼과 같은 만들기(generateTodayPlan)가 끝에 '/training' 으로 보내는 것이 '만들었어요'다 */
  const generate = async (fields: [string, string][]): Promise<string | null> => {
    try {
      await rpc('training-setup.generateAppTodayPlan', fields);
    } catch (e) {
      if (!(e instanceof RpcError && e.code === 'redirect')) return e instanceof Error ? e.message : '일정을 만들지 못했어요.';
      if (e.to !== '/training') {
        leave(e.to ?? '/login');
        return null;
      }
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await load();
    return null;
  };

  const actions: TodayActions = {
    reload: load,
    start: (program) => void start(program),
    starting,
    checkin: () => router.push({ pathname: '/checkin' as Href as never, params: { date: data?.today ?? today } }),
    generate,
    web: leave,
  };

  const header = (
    <View style={[s.header, { paddingTop: inset.top + 4, backgroundColor: c.page, borderBottomColor: c.line }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="뒤로" style={s.iconBtn}>
        <SymbolView name="chevron.left" size={20} weight="semibold" tintColor={c.sky} />
      </Pressable>
      <Text accessibilityRole="header" numberOfLines={1} style={[s.headTitle, { color: c.ink }]}>
        오늘 운동
      </Text>
      <View style={s.iconBtn} />
    </View>
  );

  if (!data) {
    return (
      <View style={[s.fill, { backgroundColor: c.page }]}>
        {header}
        <View style={[s.fill, s.centerBox]}>
          {failed ? (
            <>
              <Text style={[s.body, { color: c.ink, textAlign: 'center' }]}>{failed}</Text>
              <Pressable
                onPress={() => {
                  setFailed(null);
                  void load();
                }}
                accessibilityRole="button"
                style={[s.pill, { backgroundColor: c.sky }]}
              >
                <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
              </Pressable>
            </>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </View>
    );
  }

  const b = data.body;

  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      {header}
      <ScrollView
        style={s.fill}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(24, inset.bottom + 16) }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void load().finally(() => setRefreshing(false));
            }}
          />
        }
      >
        <Strip data={data} c={c} />
        {failed ? <Text style={[s.small, { color: c.danger }]}>{failed}</Text> : null}

        {data.programCard ? <ProgramCardView p={data.programCard} c={c} a={actions} /> : null}
        {data.programDone ? <ProgramDoneView result={data.programDone} c={c} /> : null}

        {data.notice ? <NoticeBand notice={data.notice} fields={data.remakeFields} c={c} a={actions} /> : null}

        {data.done ? (
          <DoneView done={data.done} intensity={data.note.intensity} canResume={data.screen.canResume} c={c} a={actions} />
        ) : data.screen.canStart ? (
          <BigButton
            c={c}
            icon="play.fill"
            label={data.resume ? '운동 이어서 하기' : '운동 시작'}
            busy={starting}
            onPress={() => void start(false)}
          />
        ) : null}

        {data.programStart ? <ProgramStartView ps={data.programStart} c={c} a={actions} /> : null}

        {data.outing ? <OutingRow line={data.outing} c={c} a={actions} /> : null}

        {b.kind === 'halted' ? (
          <HaltedCard reason={b.reason} c={c} a={actions} />
        ) : b.kind === 'program' ? (
          <ProgramDayRow text={b.text} planResting={b.planResting} c={c} />
        ) : b.kind === 'make' || b.kind === 'empty' ? (
          <>
            {data.prefs ? <PrefsCard prefs={data.prefs} today={data.today} c={c} a={actions} /> : null}
            <MakeCard
              make={b.make}
              head={b.kind === 'make' ? '오늘 운동 만들기' : '만들어 둔 일정에 남은 운동이 없어요'}
              note={
                b.kind === 'make'
                  ? b.stale
                  : b.dropped
                    ? '몸 상태가 바뀌어 무리인 운동이 모두 빠졌어요.'
                    : '지금 할 수 있는 운동이 아직 없어요.'
              }
              c={c}
              a={actions}
            />
          </>
        ) : b.kind === 'plan' ? (
          <PlanBody plan={b.plan} make={b.make} data={data} c={c} a={actions} />
        ) : null}

        <WebRows c={c} rows={[{ label: '트레이닝 설정 · 장비', href: '/training/settings', onPress: (href) => router.push(href as Href) }]} />
      </ScrollView>
    </View>
  );
}

/** 최근 7일 — 칸 밑 점은 그날 한 것(운동 · 암케어 · 메커니즘, 웹 날짜 띠와 같은 셋). 지난날을 누르면 그날 기록(앱 화면 /training/day/<날짜>) */
function Strip({ data, c }: { data: TrainingToday; c: Palette }) {
  const d = dayOf(data.today);
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.cardTitle, { color: c.ink }]}>
        {d.month}월 {d.day}일 {d.week}요일
      </Text>
      <View style={st.strip}>
        {data.strip.map((day) => {
          const on = day.date === data.today;
          const date = dayOf(day.date);
          const dots = [day.workout, day.armcare, day.drill];
          return (
            <Pressable
              key={day.date}
              accessibilityRole="button"
              accessibilityLabel={`${date.month}월 ${date.day}일`}
              disabled={on}
              onPress={() => router.push(`/training/day/${day.date}` as Href)}
              style={[st.day, { backgroundColor: on ? c.sky : c.card }]}
            >
              <Text style={[s.tiny, { color: on ? '#fff' : c.muted }]}>{date.week}</Text>
              <Text style={[s.bodyBold, s.num, { color: on ? '#fff' : c.ink }]}>{date.day}</Text>
              <View style={st.dots}>
                {dots.map((x, i) => (x ? <View key={i} style={[st.dot, { backgroundColor: on ? '#fff' : c.sky }]} /> : null))}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  strip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dots: { flexDirection: 'row', gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
