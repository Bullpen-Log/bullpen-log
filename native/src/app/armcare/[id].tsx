import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSeconds } from '@/lib/exercise-meta';
import { REST_CLOCK_LIMIT_SECONDS } from '@/lib/workout/rest';
import type { ArmcarePlay } from '@/lib/armcare/play-load';
import type { PlayerItem } from '@/app/(session)/armcare/play/[id]/armcare-player';
import { BullpenNative } from '../../../modules/bullpen-native';
import { checkId, checkOutbox, drainChecks, onCheckResult } from '~/armcare/outbox';
import { sendCheck } from '~/armcare/send';
import { Countdown, ExerciseMedia, HowTo, RehabCheck, type Clock } from '~/armcare/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { SetDots } from '~/workout/parts';
import { READABLE, useBarSide } from '~/lib/layout';

/**
 * 암케어 따라 하기(앱 화면) — 웹 app/(session)/armcare/play/[id]/armcare-player.tsx 를 옮겼다. 사이트의 따라 하기가 앱(BullpenNative/3 부터)이면
 * 이 화면을 띄우고(page.tsx → OpenNative), 무엇을 띄울지는 웹과 같은 곳에서 읽는다(app/actions/app-armcare.ts → lib/armcare/play-load.ts).
 *
 * 웹과 같은 규칙: 운동 하나씩 크게, 세트와 버티기 · 쉬기 시계를 대신 세 준다. 운동의 마지막 세트를 마치면 그 운동을 체크하고(markExerciseDone —
 * 루틴 목록의 체크와 같은 기록) 안 한 다음 운동으로. 체크는 폰에 먼저 담고 뒤에서 보낸다(~/armcare/outbox.ts — 신호가 없어도 남는다).
 * 화면은 켜 두되 10분 동안 아무것도 안 누르면 놓는다. 끝나면 웹을 암케어로 보내고 닫는다.
 */
type LoadResult = ({ ok: true } & ArmcarePlay) | { ok: false; to: string };

/** 화면을 닫고 웹을 그 주소로 — 껍데기(index.tsx)가 웹뷰를 옮긴다(~/shell/web-nav leaveTo) */
const leave = leaveTo;

export default function ArmcarePlayScreen() {
  const c = usePalette();
  const { id, d, areas, from } = useLocalSearchParams<{ id: string; d?: string; areas?: string; from?: string }>();
  const [data, setData] = useState<ArmcarePlay | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    rpc<LoadResult>('app-armcare.loadAppArmcarePlay', id, d ?? null, areas ?? null).then(
      (r) => {
        if (!alive) return;
        if (r.ok) setData(r);
        else leave(r.to);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setFailed(e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '신호가 약해 루틴을 불러오지 못했어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [id, d, areas, tries]);

  if (data) return <Player {...data} inApp={from === 'app'} c={c} />;
  return (
    <View style={[s.fill, s.centerBox, { backgroundColor: c.page, gap: 16 }]}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {failed ? (
        <>
          <Text style={[s.body, { color: c.ink, textAlign: 'center' }]}>{failed}</Text>
          <Pressable
            onPress={() => {
              setFailed(null);
              setTries((n) => n + 1);
            }}
            accessibilityRole="button"
            style={[s.pill, { backgroundColor: c.sky }]}
          >
            <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
          </Pressable>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={s.pill}>
            <Text style={[s.bodyBold, { color: c.muted }]}>닫기</Text>
          </Pressable>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

/* ----------------------------- 진행 상태(웹과 같은 셈) ----------------------------- */

type State = {
  index: number;
  /** 운동마다 한 세트 수 */
  sets: number[];
  /** 운동마다 다 했는가 */
  done: boolean[];
  /** 좌우 각각 버티는 운동에서 지금 버틸 쪽 — 0 한쪽, 1 반대쪽 */
  side: 0 | 1;
  clock: Clock | null;
  finished: boolean;
  /** 방금 마친 운동 — 잠깐 '완료'를 띄운다 */
  justDone: { index: number; at: number } | null;
};

type Action =
  | { type: 'hold'; at: number }
  | { type: 'set'; at: number }
  /* 시계가 다 돌았거나 [다 버텼어요] · [쉬기 건너뛰기]를 눌렀다 — 어느 시계인지 함께 */
  | { type: 'clock-end'; clock: Clock; at: number }
  | { type: 'go'; index: number }
  | { type: 'finish' }
  | { type: 'toast-end'; justDone: State['justDone'] };

/** 좌우 각각 버티는 운동 — 한 세트에 한쪽씩 두 번 버틴다 */
const twoSides = (it: PlayerItem) => it.perSide && it.holdSeconds != null;

/** 아직 안 한 다음 운동 — 없으면 null */
function nextUndone(done: boolean[], from: number): number | null {
  for (let k = 1; k <= done.length; k++) {
    const i = (from + k) % done.length;
    if (!done[i]) return i;
  }
  return null;
}

function reduce(s: State, a: Action, items: PlayerItem[]): State {
  switch (a.type) {
    case 'hold': {
      const secs = items[s.index].holdSeconds ?? 0;
      return { ...s, clock: { kind: 'hold', endsAt: a.at + secs * 1000, total: secs } };
    }
    case 'set': {
      const i = s.index;
      /* 한쪽을 버텼다 — 세트는 반대쪽까지 해야 끝난다 */
      if (twoSides(items[i]) && s.side === 0) return { ...s, side: 1, clock: null };
      const sets = s.sets.map((n, k) => (k === i ? n + 1 : n));
      if (sets[i] < items[i].sets) {
        /* 아직 세트가 남았다 — 쉬는 시계. 운동 화면처럼 10분에서 자른다 */
        const secs = Math.min(items[i].restSeconds, REST_CLOCK_LIMIT_SECONDS);
        return { ...s, sets, side: 0, clock: secs > 0 ? { kind: 'rest', endsAt: a.at + secs * 1000, total: secs } : null };
      }
      /* 이 운동을 마쳤다 — 안 한 다음 운동으로. 체크는 아래 effect 가 남긴다 */
      const done = s.done.map((d, k) => (k === i ? true : d));
      const next = nextUndone(done, i);
      const justDone = { index: i, at: a.at };
      return next == null
        ? { ...s, sets, done, side: 0, clock: null, finished: true, justDone }
        : { ...s, sets, done, side: 0, clock: null, index: next, justDone };
    }
    case 'clock-end':
      /* 시계가 끝나는 순간 단추도 눌렀으면 둘 다 들어온다 — 먼저 온 것이 시계를 바꿔 두므로 뒤에 온 것은 버린다(한 세트를 두 번 세지 않게) */
      if (s.clock !== a.clock) return s;
      return a.clock.kind === 'hold' ? reduce(s, { type: 'set', at: a.at }, items) : { ...s, clock: null };
    case 'go':
      return { ...s, index: a.index, side: 0, clock: null };
    case 'finish':
      return { ...s, clock: null, finished: true };
    case 'toast-end':
      return s.justDone === a.justDone ? { ...s, justDone: null } : s;
  }
}

function initState(list: PlayerItem[]): State {
  const done = list.map((it) => it.doneBefore);
  const first = done.findIndex((x) => !x);
  return {
    index: first === -1 ? 0 : first,
    sets: list.map((it) => (it.doneBefore ? it.sets : 0)),
    done,
    side: 0,
    clock: null,
    finished: list.length > 0 && first === -1,
    justDone: null,
  };
}

/** 버티기 · 쉬기 시계의 앱 알림 이름 — 같은 이름으로 걸면 앞의 것을 바꾼다(웹과 같은 이름) */
const CLOCK_ALARM_ID = 'armcare-clock';
/** 이만큼 아무것도 안 누르면 화면 잠금을 놓는다 — 운동 화면이 쉬는 시계를 거두는 10분 */
const IDLE_MS = REST_CLOCK_LIMIT_SECONDS * 1000;

const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

/* ----------------------------- 본체 ----------------------------- */

function Player({ title, backHref, dateKey, notice, items, rehabCheck, inApp, c }: ArmcarePlay & { inApp: boolean; c: Palette }) {
  /* 앱 화면에서 열었으면 그냥 뒤로(그 화면이 다시 보인다) — 웹에서 넘어왔으면 웹을 돌아갈 칸으로(~/shell/web-nav fromApp) */
  const close = () => (inApp ? router.back() : leave(backHref));
  const inset = useSafeAreaInsets();
  /* 아이패드 — 바닥 막대 안 단추를 본문 폭으로(~/lib/layout) */
  const barSide = useBarSide(12);
  const [state, dispatch] = useReducer((st: State, a: Action) => reduce(st, a, items), items, initState);

  /* 큰 단추는 운동이 바뀌어도 같은 자리라, 마지막 '세트 끝'을 두 번 누르면 둘째 탭이 다음 운동의 1세트로 들어갔다 — 0.45초 안의 둘째 탭은 버린다 */
  const lastTap = useRef(0);
  const tap = (a: Action) => {
    const now = Date.now();
    if (now - lastTap.current < 450) return;
    lastTap.current = now;
    tick();
    dispatch(a);
  };

  /* 10분 동안 안 누르면 화면 잠금을 놓는다 — 그대로 떠나면 배터리가 끝까지 닳는다 */
  const lastTouch = useRef(0);
  const [idle, setIdle] = useState(false);
  useEffect(() => {
    lastTouch.current = Date.now();
    const timer = setInterval(() => setIdle(Date.now() - lastTouch.current > IDLE_MS), 30_000);
    return () => clearInterval(timer);
  }, []);
  const awake = !idle && !state.finished;
  useEffect(() => {
    void BullpenNative.keepAwake(awake).catch(() => undefined);
  }, [awake]);
  useEffect(() => () => void BullpenNative.keepAwake(false).catch(() => undefined), []);
  const touch = () => {
    lastTouch.current = Date.now();
    if (idle) setIdle(false);
  };

  /*
   * 체크 — 마친 운동을 기록에 남긴다. 먼저 폰에 담고 뒤에서 하나씩 보낸다. 한 운동은 한 번만 담는다(queued). 못 보낸 것은 폰에 남아
   * 다시 보낸다 — 다음 운동을 마칠 때, 앱으로 돌아올 때, 15초마다, [다시 보내기]를 누를 때.
   */
  const pending = useSyncExternalStore(checkOutbox.subscribe, checkOutbox.snapshot);
  const queued = useRef(new Set<string>());
  const [saved, setSaved] = useState<ReadonlySet<string>>(() => new Set());
  /* 서버가 받지 않은 것(지운 운동 등) — 다시 보내도 안 되므로 폰에서 빼고 알린다 */
  const [refused, setRefused] = useState<{ ids: string[]; message: string } | null>(null);
  const [offline, setOffline] = useState(false);

  /* 결과는 누가 보냈든(이 화면 · 껍데기) 여기로 온다 */
  useEffect(
    () =>
      onCheckResult((p, res) => {
        const cid = checkId(p);
        const error = (res as { error?: unknown } | null)?.error;
        if (typeof error === 'string') setRefused((r) => ({ ids: [...(r?.ids ?? []).filter((x) => x !== cid), cid], message: error }));
        else setSaved((prev) => new Set(prev).add(cid));
      }),
    []
  );
  const flush = useCallback(async () => {
    const outcome = await drainChecks(sendCheck, () => undefined);
    if (outcome === 'auth') return leave('/login');
    if (outcome === 'offline') setOffline(true);
    else if (outcome === 'done') setOffline(false);
  }, []);

  useEffect(() => {
    let added = false;
    items.forEach((it, i) => {
      const eid = it.exercise.id;
      if (!state.done[i] || it.doneBefore || queued.current.has(eid)) return;
      queued.current.add(eid);
      checkOutbox.add({ exerciseId: eid, dateKey, recordedAt: new Date().toISOString() });
      added = true;
    });
    if (added) void flush();
  }, [items, state.done, dateKey, flush]);

  /* 다시 보내는 때 — 앱으로 돌아올 때, 15초마다, 처음 열 때(지난번 것) */
  useEffect(() => {
    const kick = () => void flush();
    const timer = setInterval(kick, 15_000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') kick();
    });
    kick();
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [flush]);

  /* 이 루틴에서 새로 마친 운동 — 남았는지(saved) · 못 받았는지(refused) · 아직인지 */
  const newlyDone = items.filter((it, i) => state.done[i] && !it.doneBefore).map((it) => checkId({ exerciseId: it.exercise.id, dateKey }));
  const refusedHere = newlyDone.filter((cid) => refused?.ids.includes(cid));
  const unsaved = newlyDone.filter((cid) => !saved.has(cid) && !refusedHere.includes(cid));
  const waiting = pending.filter((p) => newlyDone.includes(checkId(p))).length;

  /* 다 마쳤고 체크가 모두 남았으면 사이트의 목록 · 홈을 한 번 새로 그리게 한다(웹과 같다 — 돌아간 목록이 체크 전 모습이지 않게) */
  const refreshed = useRef(false);
  const settled = state.finished && newlyDone.length > 0 && unsaved.length === 0;
  useEffect(() => {
    if (!settled || refreshed.current) return;
    refreshed.current = true;
    rpc('exercise-log.refreshTrainingLists').catch(() => undefined);
  }, [settled]);

  /*
   * 시계 — 끝나는 순간에 한 번. 버티기가 끝나면 세트를(좌우 각각이면 한쪽을) 마친다. 폰이 잠긴 동안 타이머가 멈추므로 앱으로 돌아올 때 벽시계로
   * 한 번 더 보고, 끝날 시각에 알림도 걸어 둔다(앱이 앞에 떠 있으면 알림은 안 뜨고 떨림이 알린다).
   */
  useEffect(() => {
    const clock = state.clock;
    if (!clock) {
      void BullpenNative.cancelAlarm(CLOCK_ALARM_ID).catch(() => undefined);
      return;
    }
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      if (clock.kind === 'hold') void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      else void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      dispatch({ type: 'clock-end', clock, at: Date.now() });
    };
    const timer = setTimeout(end, Math.max(0, clock.endsAt - Date.now()));
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active' && Date.now() >= clock.endsAt) end();
    });
    /* 같은 이름으로 걸어 앞 시계의 알림을 바꾼다 — 거두기는 시계가 없어질 때만(거두기와 새로 걸기가 엇갈려 새 알림이 지워지지 않게) */
    void BullpenNative.scheduleAlarm(
      CLOCK_ALARM_ID,
      clock.endsAt,
      clock.kind === 'hold' ? '버티기 끝' : '쉬는 시간 끝',
      clock.kind === 'hold' ? '다 버텼어요. 돌아와서 이어 가요' : '다음 세트를 시작할 차례예요'
    ).catch(() => undefined);
    return () => {
      clearTimeout(timer);
      sub.remove();
    };
  }, [state.clock]);
  useEffect(() => () => void BullpenNative.cancelAlarm(CLOCK_ALARM_ID).catch(() => undefined), []);

  /* 운동이 바뀌면 맨 위(영상 · 이름)부터 — 자세 설명을 읽느라 내려가 있던 자리에 다음 운동이 뜨면 할 차례가 화면 밖에 있다 */
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [state.index]);

  /* 완료 알림은 잠깐만 */
  useEffect(() => {
    const justDone = state.justDone;
    if (!justDone) return;
    const timer = setTimeout(() => dispatch({ type: 'toast-end', justDone }), 1800);
    return () => clearTimeout(timer);
  }, [state.justDone]);

  /* 신호가 없어 폰에 남은 체크 수 — 보내는 중이면 세지 않는다 */
  const unsent = offline ? waiting : 0;
  const notSaved = (
    <>
      {unsent > 0 ? (
        <View style={[s.notice, { backgroundColor: c.warnBg }]}>
          <Text style={[s.small, { color: c.warn, flex: 1 }]}>
            인터넷이 끊겨 체크 {unsent}개를 아직 못 남겼어요. 폰에 담아 뒀다가 신호가 돌아오면 보내요.
          </Text>
          <Pressable onPress={() => void flush()} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.sky }]}>다시 보내기</Text>
          </Pressable>
        </View>
      ) : null}
      {refusedHere.length > 0 && refused ? (
        <Text style={[s.small, s.box, { color: c.danger, backgroundColor: c.danger + '14' }]}>
          체크 {refusedHere.length}개를 남기지 못했어요. {refused.message}
        </Text>
      ) : null}
    </>
  );

  const header = (
    <View style={[s.header, { paddingTop: inset.top + 8, backgroundColor: c.card, borderBottomColor: c.line }]}>
      <View style={s.headRow}>
        <Pressable onPress={close} accessibilityRole="button" accessibilityLabel="따라하기 닫기" style={s.iconBtn}>
          <View style={[s.circle, { backgroundColor: c.chip }]}>
            <SymbolView name="xmark" size={14} weight="semibold" tintColor={c.muted} />
          </View>
        </Pressable>
        <Text numberOfLines={1} style={[s.headTitle, { color: c.ink }]}>
          {title}
        </Text>
        {items.length > 0 ? (
          <Text style={[s.smallBold, s.count, { color: c.muted }]}>
            {Math.min(state.index + 1, items.length)} / {items.length}
          </Text>
        ) : null}
      </View>
      {items.length > 0 ? (
        <View style={s.segments}>
          {items.map((item, i) => (
            <View
              key={item.exercise.id}
              style={[
                s.segment,
                { backgroundColor: state.done[i] ? c.sky : i === state.index && !state.finished ? c.sky + '66' : c.chip },
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );

  const shell = (body: ReactNode) => (
    <View style={[s.fill, { backgroundColor: c.page }]} onTouchStart={touch}>
      {/* 옆으로 쓸어 닫기는 끈다 — 밴드를 든 손이 화면 끝을 스쳐 닫혔다. 나가기는 ✕ 로 */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      {header}
      {body}
    </View>
  );

  if (items.length === 0)
    return shell(
      <View style={[s.fill, s.centerBox]}>
        <Text style={[s.body, { color: c.muted }]}>따라 할 운동이 없어요.</Text>
      </View>
    );

  if (state.finished) {
    const count = state.done.filter(Boolean).length;
    const all = count === items.length;
    return shell(
      <ScrollView style={s.fill} contentContainerStyle={[s.finish, { paddingBottom: Math.max(24, inset.bottom + 16) }, READABLE]}>
        {count > 0 ? (
          <View style={[s.doneMark, { backgroundColor: c.sky }]}>
            <SymbolView name="checkmark" size={36} weight="bold" tintColor="#fff" />
          </View>
        ) : null}
        <Text style={[s.finishTitle, { color: c.ink }]}>{all ? '루틴 끝!' : '오늘은 여기까지'}</Text>
        <Text style={[s.body, s.center, { color: c.muted }]}>
          {all ? `운동 ${count}개를 모두 마쳤어요` : `운동 ${items.length}개 중 ${count}개를 마쳤어요`}
          {count > 0 && unsaved.length === 0 && refusedHere.length === 0 ? ' · 기록에 체크됐어요' : ''}
          {unsaved.length > 0 && unsent === 0 ? ' · 기록에 남기는 중…' : ''}
        </Text>
        {notSaved}
        {rehabCheck && count > 0 ? (
          <RehabCheck dateKey={dateKey} settled={unsaved.length === 0} initial={rehabCheck.initial} c={c} />
        ) : null}
        <Pressable onPress={close} accessibilityRole="button" style={[s.pill, { backgroundColor: c.sky }]}>
          <Text style={[s.bodyBold, { color: '#fff' }]}>암케어로 돌아가기</Text>
        </Pressable>
      </ScrollView>
    );
  }

  const it = items[state.index];
  const ex = it.exercise;
  const doneSets = state.sets[state.index];
  const done = state.done[state.index];
  const clock = state.clock;
  /* 좌우 각각 버티는 운동이면 어느 쪽인지 붙인다 */
  const sideLabel = twoSides(it) ? (state.side === 0 ? '한쪽 ' : '반대쪽 ') : '';
  const amount = it.holdSeconds != null ? `${formatSeconds(it.holdSeconds)} 버티기` : it.reps != null ? `${it.reps}회` : '';
  const toast = state.justDone ? items[state.justDone.index].exercise.title : null;

  return shell(
    <>
      <ScrollView ref={scrollRef} style={s.fill} contentContainerStyle={[s.content, READABLE]}>
        {notice ? (
          <View style={[s.notice, { backgroundColor: c.warnBg }]}>
            <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor={c.warn} />
            <Text style={[s.small, { color: c.warn, flex: 1 }]}>{notice}</Text>
          </View>
        ) : null}

        {/* 운동마다 새로 그린다(key) — 앞 운동의 영상이 다음 운동에서 돌고 설명 칸이 빈 채로 남지 않게 */}
        <View key={ex.id} style={{ gap: 16 }}>
          <ExerciseMedia path={ex.videoPath} referenceVideoId={ex.referenceVideoId} thumbUrl={ex.thumbUrl} aspectRatio={ex.aspectRatio} />
          <View style={{ gap: 6 }}>
            <Text style={[s.title, { color: c.ink }]}>{ex.title}</Text>
            <Text style={[s.amount, { color: c.sky }]}>
              {amount}
              {it.perSide ? ' · 좌우 각각' : ''} · {it.sets}세트
            </Text>
            {it.note ? <Text style={[s.bodyBold, { color: c.ink }]}>{it.note}</Text> : null}
            <SetDots planned={it.sets} done={doneSets} c={c} />
            {it.unsafe && !done ? (
              <View style={s.warnRow}>
                <SymbolView name="exclamationmark.triangle.fill" size={12} tintColor={c.warn} />
                <Text style={[s.small, { color: c.warn, flex: 1 }]}>지금 몸 상태에는 권하지 않는 운동이에요. 건너뛰어도 돼요.</Text>
              </View>
            ) : null}
          </View>
          <HowTo exerciseId={ex.id} method={ex.method} c={c} />
        </View>
        {notSaved}
      </ScrollView>

      {/* 누르는 막대 — 엄지가 닿는 아래에 */}
      <View style={[s.bottom, { paddingBottom: Math.max(12, inset.bottom), paddingHorizontal: barSide, backgroundColor: c.card, borderTopColor: c.line }]}>
        {toast ? (
          <Text key={state.justDone?.at} accessibilityRole="alert" style={[s.bodyBold, s.center, { color: c.sky }]}>
            ✓ {toast} 완료
          </Text>
        ) : null}
        {clock ? (
          <View style={{ gap: 10 }}>
            <Countdown key={clock.endsAt} clock={clock} label={clock.kind === 'hold' ? `${sideLabel}버티는 중` : '쉬는 중'} c={c} />
            <Pressable
              onPress={() => tap({ type: 'clock-end', clock, at: Date.now() })}
              accessibilityRole="button"
              style={({ pressed }) => [s.outline, { borderColor: c.line, opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[s.bodyBold, { color: c.ink }]}>{clock.kind === 'hold' ? '다 버텼어요' : '쉬기 건너뛰기'}</Text>
            </Pressable>
          </View>
        ) : done ? (
          <Text style={[s.bodyBold, s.center, s.doneLine, { color: c.sky }]}>✓ 오늘 이미 한 운동이에요</Text>
        ) : (
          <Pressable
            onPress={() => tap(it.holdSeconds != null ? { type: 'hold', at: Date.now() } : { type: 'set', at: Date.now() })}
            accessibilityRole="button"
            style={({ pressed }) => [s.big, { backgroundColor: c.sky, opacity: pressed ? 0.85 : 1 }]}
          >
            <SymbolView name={it.holdSeconds != null ? 'play.fill' : 'checkmark'} size={18} weight="bold" tintColor="#fff" />
            <Text style={s.bigText}>
              {it.holdSeconds != null
                ? `${sideLabel}${formatSeconds(it.holdSeconds)} 버티기 시작 (${doneSets + 1}/${it.sets})`
                : `세트 끝 (${doneSets + 1}/${it.sets})`}
            </Text>
          </Pressable>
        )}

        <View style={s.navRow}>
          <Pressable
            onPress={() => dispatch({ type: 'go', index: state.index - 1 })}
            disabled={state.index === 0}
            accessibilityRole="button"
            style={[s.nav, { backgroundColor: c.chip, opacity: state.index === 0 ? 0.3 : 1 }]}
          >
            <Text style={[s.smallBold, { color: c.ink }]}>‹ 이전</Text>
          </Pressable>
          {state.index < items.length - 1 ? (
            <Pressable
              onPress={() => dispatch({ type: 'go', index: state.index + 1 })}
              accessibilityRole="button"
              style={[s.nav, { backgroundColor: c.chip }]}
            >
              <Text style={[s.smallBold, { color: c.ink }]}>다음 ›</Text>
            </Pressable>
          ) : (
            <Pressable onPress={() => dispatch({ type: 'finish' })} accessibilityRole="button" style={[s.nav, { backgroundColor: c.chip }]}>
              <Text style={[s.smallBold, { color: c.ink }]}>끝내기 ✓</Text>
            </Pressable>
          )}
        </View>
      </View>
    </>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 8, paddingBottom: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontSize: 16, fontWeight: '700' },
  count: { paddingRight: 8, fontVariant: ['tabular-nums'] },
  segments: { flexDirection: 'row', gap: 4, paddingHorizontal: 8 },
  segment: { flex: 1, height: 6, borderRadius: 3 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 16 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10 },
  box: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  textBtn: { minHeight: 44, paddingHorizontal: 4, justifyContent: 'center' },
  title: { fontSize: 26, fontWeight: '700', lineHeight: 32 },
  amount: { fontSize: 17, fontWeight: '700' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  bottom: { paddingHorizontal: 12, paddingTop: 12, gap: 10, borderTopWidth: StyleSheet.hairlineWidth },
  outline: { minHeight: 48, borderRadius: 24, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  doneLine: { paddingVertical: 14 },
  big: { height: 64, borderRadius: 32, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  bigText: { color: '#fff', fontSize: 17, fontWeight: '700' },
  navRow: { flexDirection: 'row', gap: 8 },
  nav: { flex: 1, minHeight: 48, borderRadius: 24, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  finish: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingTop: 32, gap: 16 },
  doneMark: { width: 80, height: 80, borderRadius: 40, alignItems: 'center', justifyContent: 'center' },
  finishTitle: { fontSize: 26, fontWeight: '700' },
  pill: { minHeight: 48, borderRadius: 24, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  center: { textAlign: 'center' },
});
