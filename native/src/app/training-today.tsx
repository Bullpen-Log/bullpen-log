import * as Haptics from 'expo-haptics';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { toDateKey } from '@/lib/pitch-stats';
import type { TrainingToday } from '@/lib/report/training-today-data';
import { leave } from '~/mechanics/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { REST_DAY } from '~/training/rest-day';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { usePalette } from '~/lib/ui';
import { useWebNav, openCheckin } from '~/shell/web-nav';
import { BigButton, s, type TodayActions } from '~/training/today/parts';
import { DoneView, HaltedCard, MakeCard, NoticeBand, OutingRow, PlanBody } from '~/training/today/plan';
import { ProgramCardView, ProgramDoneView } from '~/training/today/program';
import { ProgramStartView } from '~/training/today/program-start';
import { READABLE } from '~/lib/layout';
import { Icon } from '~/shell/icon';
import { PageHead } from '~/shell/heading';
import { useRememberPart } from '~/training/remember';
import { Press } from '~/shell/press';

/**
 * 트레이닝 '운동' 앱 화면 — 웹 /training(기본 칸, app/(app)/training/training-page.tsx)을 옮겼다. 앱 트레이닝 탭(native/src/training/tab.tsx)의 운동
 * 카드에서 들어온다. 무엇을 그릴지는 웹과 같은 곳에서 읽는다(app/actions/app-training.ts → lib/report/training-today-data.ts).
 *
 * 웹과 같은 차례: 근력 프로그램 카드 → 프로그램 결과 → 상태 바뀜 띠 → 완료 카드 · [운동 시작] → 프로그램 고르기 → 다음 등판 → 일정 자리(멈춤 ·
 * 프로그램 날 한 줄 · 만들기 · 남은 것 없음 · 일정 카드와 체크 목록 · 오늘 운동 메모). 체크 · 별 · 빼기 · 메모 · 일정 만들기(자동 맞춤 ·
 * 조건 바꿔 다시 만들기) · 운동 추가 · 오늘 하고 싶은 운동 · 프로그램 고르기 · 시작 · 건너뛰기 · 그만두기 · 고정 운동 바꾸기는 웹과 같은 서버 동작을
 * 부른다(시트). 지난 날 기록은 앱 화면(/training/day/<날짜>), 트레이닝 설정은 앱 화면(/training/settings — 머리 톱니).
 *
 * [운동 시작]은 트레이닝 탭과 같은 길(판을 열면 서버가 운동 화면으로 보낸다 → 앱 운동 화면). 운동을 마치면 운동 화면이 웹을 축하 화면으로 보내고
 * 닫는데, 그 화면이 이 화면 밑에 깔리지 않게 이 화면도 같이 닫는다(useWebNav).
 */
type LoadResult = ({ ok: true } & TrainingToday) | { ok: false; to: string };

const KEY = 'training-today';
/* 메모리에 둔 마지막 값 — 로그인 세대(cacheEpoch)가 같을 때만 쓴다(로그아웃 뒤 다른 사람에게 앞사람 운동이 비치지 않게) */
let memory: { epoch: number; data: TrainingToday } | null = null;
const remembered = () => (memory?.epoch === cacheEpoch() ? memory.data : null);

export default function TrainingTodayScreen() {
  useRememberPart('today');
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
        /* 워밍업 창도 앱 화면으로(판 7) — 웹을 거치지 않고 */
        else if (e.to.startsWith('/workout/warmup')) router.push('/warmup' as Href);
        /* 통증을 남긴 날 — 웹 /workout/rest 와 같은 말을 알림창으로 */
        else if (e.to.startsWith('/workout/rest')) Alert.alert(REST_DAY.title, REST_DAY.body);
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
    checkin: () => openCheckin('/training?view=home'),
    generate,
    web: leave,
  };

  /* 웹 휴대폰 위 막대의 '‹ 트레이닝'(back-link) — 제목은 본문 큰 제목(PageHeading)이 맡는다 */
  const header = (
    <View style={[st.bar, { paddingTop: inset.top + 4, backgroundColor: c.page }]}>
      <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="트레이닝으로 돌아가기" style={({ pressed }) => [st.back, pressed && { opacity: 0.6 }]}>
        <Icon name="back" size={24} color={c.sky} />
        <Text style={{ color: c.sky, fontSize: 17 }}>트레이닝</Text>
      </Pressable>
    </View>
  );
  /* 큰 제목 '트레이닝' + 오른쪽 '설정' 알약(웹 training-page PageHeading · TrainingSettingsButton pill) */
  const heading = (
    <PageHead title="트레이닝">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="트레이닝 설정"
        onPress={() => router.push('/training/settings' as Href)}
        style={({ pressed }) => [st.pill, { backgroundColor: c.chip }, pressed && { opacity: 0.6 }]}
      >
        <Icon name="settings2" size={16} color={c.sky} />
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>설정</Text>
      </Pressable>
    </PageHead>
  );

  if (!data) {
    return (
      <View style={[s.fill, { backgroundColor: c.page }]}>
        {header}
        <View style={[s.fill, s.centerBox]}>
          {failed ? (
            <>
              <Text style={[s.body, { color: c.ink, textAlign: 'center' }]}>{failed}</Text>
              <Press
                onPress={() => {
                  setFailed(null);
                  void load();
                }}
                accessibilityRole="button"
                style={[s.pill, { backgroundColor: c.sky }]}
              >
                <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
              </Press>
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
      <ScrollView automaticallyAdjustKeyboardInsets
        style={s.fill}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(24, inset.bottom + 16) }, READABLE]}
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
        {heading}
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
        ) : b.kind === 'program' ? null /* 프로그램 날은 위 카드가 다 말한다 — 같은 말 한 줄은 뺐다(2026-10-20 김민) */ : b.kind === 'make' || b.kind === 'empty' ? (
          <MakeCard
            prefs={data.prefs}
            today={data.today}
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
        ) : b.kind === 'plan' ? (
          <PlanBody plan={b.plan} make={b.make} data={data} c={c} a={actions} />
        ) : null}

      </ScrollView>
    </View>
  );
}


const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, minHeight: 44 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
  pill: { height: 44, borderRadius: 22, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6 },
  strip: { flexDirection: 'row', gap: 6 },
  day: { flex: 1, minHeight: 64, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dots: { flexDirection: 'row', gap: 2, height: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
});
