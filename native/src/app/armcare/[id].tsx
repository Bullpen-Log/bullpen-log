import { Icon } from '~/shell/icon';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, AppState, Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSeconds } from '@/lib/exercise-meta';
import { useLiveActivity } from '~/shell/live-activity';
import { REST_CLOCK_LIMIT_SECONDS } from '@/lib/workout/rest';
import type { ArmcarePlay } from '@/lib/armcare/play-load';
import type { PlayerItem } from '@/app/(session)/armcare/play/[id]/armcare-player';
import { BullpenNative } from '../../../modules/bullpen-native';
import { checkOutbox, drainChecks } from '~/armcare/outbox';
import { sendCheck } from '~/armcare/send';
import { ExerciseMedia, HowTo, RehabCheck } from '~/armcare/parts';
import { ArmcareDone, type SaveState } from '~/armcare/done';
import { initState, nextUndone, reduce, twoSides, type Action, type Clock, type State } from '~/armcare/run-state';
import { rpc, RpcError } from '~/lib/rpc';
import { TYPE, usePalette, withAlpha, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { clockText, SetDots } from '~/workout/parts';
import { Sheet } from '~/workout/sheets';
import { READABLE, useBarSide } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 암케어 따라 하기(앱 화면) — 웹 app/(session)/armcare/play/[id]/armcare-player.tsx 를 옮겼다. 사이트의 따라 하기가 앱(BullpenNative/3 부터)이면
 * 이 화면을 띄우고(page.tsx → OpenNative), 무엇을 띄울지는 웹과 같은 곳에서 읽는다(app/actions/app-armcare.ts → lib/armcare/play-load.ts).
 *
 * 2026-10-30 시안 02 · 03 — 운동 이름 · 목표가 먼저, 영상은 눌러서, 세트 · 시계 · 주 단추는 한 판에. 마지막 세트를 마치면 '이 운동 끝'에 머물고
 * [다음 운동]을 눌러야 넘어간다(다음 운동의 시계를 저절로 켜지 않는다). 버티기 · 쉬기는 일시정지 · 계속하기 · 현재 버티기 취소 · 직접 완료.
 * 운동의 마지막 세트를 마쳐야 그 운동을 체크한다(markExerciseDone — 루틴 목록의 체크와 같은 기록). 체크는 폰에 먼저 담고 뒤에서 보낸다
 * (~/armcare/outbox.ts — 수행과 저장을 가른다: 폰 보관 · 전송 대기 · 서버 확인 · 거절). 끝나면 완료 화면(~/armcare/done.tsx)을 같은 자리에 그린다.
 * 하던 운동의 세트 · 쪽 · 시계는 이 화면 메모리 — 다시 열면 마친 운동을 건너뛰고 첫 안 한 운동부터 처음 세트로 연다.
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
        setFailed(e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '다시 확인한 뒤 이어갈 수 있어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [id, d, areas, tries]);

  if (data) return <Player {...data} query={{ id, areas: areas ?? null }} inApp={from === 'app'} c={c} />;
  return (
    <View style={[s.fill, s.centerBox, { backgroundColor: c.page, gap: 12 }]}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {failed ? (
        <>
          <Text style={[TYPE.section, { color: c.ink, textAlign: 'center' }]}>루틴을 불러오지 못했어요</Text>
          <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>{failed}</Text>
          <Press
            onPress={() => {
              setFailed(null);
              setTries((n) => n + 1);
            }}
            accessibilityRole="button"
            style={[s.pill, { backgroundColor: c.action, alignSelf: 'stretch' }]}
          >
            <Text style={[TYPE.button, { color: c.onAction }]}>다시 불러오기</Text>
          </Press>
          <Press onPress={() => router.back()} accessibilityRole="button" style={s.pill}>
            <Text style={[TYPE.button, { color: c.link }]}>닫기</Text>
          </Press>
        </>
      ) : (
        <ActivityIndicator accessibilityLabel="루틴을 불러오는 중" />
      )}
    </View>
  );
}

/** 버티기 · 쉬기 시계의 앱 알림 이름 — 같은 이름으로 걸면 앞의 것을 바꾼다(웹과 같은 이름) */
const CLOCK_ALARM_ID = 'armcare-clock';
/** 이만큼 아무것도 안 누르면 화면 잠금을 놓는다 — 운동 화면이 쉬는 시계를 거두는 10분 */
const IDLE_MS = REST_CLOCK_LIMIT_SECONDS * 1000;

const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

/** 체크마다 저장 상태 — 서버 영수증 · 대기열 줄을 읽는다(ver 가 바뀔 때마다 다시) */
function saveStates(items: PlayerItem[], dateKey: string, ver: number): SaveState[] {
  void ver;
  return items.map((it) => {
    const k = { exerciseId: it.exercise.id, dateKey };
    const r = checkOutbox.receipt(k);
    if (r?.status === 'saved') return 'saved';
    if (r?.status === 'refused') return 'refused';
    const e = checkOutbox.entry(k);
    if (e && !e.undo) return e.storage === 'failed' ? 'local' : 'pending';
    /* 서버가 그날 체크로 준 것(다시 담은 체크가 없을 때) */
    if (it.doneBefore) return 'before';
    return 'unknown';
  });
}
const refusedText = (items: PlayerItem[], dateKey: string, ver: number) => {
  void ver;
  for (const it of items) {
    const r = checkOutbox.receipt({ exerciseId: it.exercise.id, dateKey });
    if (r?.status === 'refused') return r.message;
  }
  return null;
};

/* ----------------------------- 본체 ----------------------------- */

function Player({
  title,
  backHref,
  dateKey,
  notice,
  items,
  rehabCheck,
  week,
  query,
  inApp,
  c,
}: ArmcarePlay & { query: { id: string; areas: string | null }; inApp: boolean; c: Palette }) {
  /* 앱 화면에서 열었으면 그냥 뒤로(그 화면이 다시 보인다) — 웹에서 넘어왔으면 웹을 돌아갈 칸으로(~/shell/web-nav fromApp) */
  const leaveNow = () => (inApp ? router.back() : leave(backHref));
  const inset = useSafeAreaInsets();
  /* 아이패드 — 바닥 막대 안 단추를 본문 폭으로(~/lib/layout) */
  const barSide = useBarSide(12);
  /* 시작 때 이미 한 운동 — 서버의 그날 체크 + 폰 대기열의 뜻(못 보낸 체크는 한 것, 보낼 해제는 안 한 것). 첫 화면의 수 · 이어하기와 같은 셈 */
  const [before] = useState(() => {
    const queue = checkOutbox.visible().filter((p) => p.dateKey === dateKey);
    return items.map((it) => {
      const q = queue.find((p) => p.exerciseId === it.exercise.id);
      return q ? !q.undo : it.doneBefore;
    });
  });
  const [state, dispatch] = useReducer((st: State, a: Action) => reduce(st, a, items), null, () => initState(items, before));
  /* 열 때부터 모두 한 루틴 — 기록 열람(새 체크 · 효과 없음) */
  const [already] = useState(() => items.length > 0 && before.every(Boolean));

  /* 큰 단추는 운동이 바뀌어도 같은 자리라, 마지막 '세트 완료'를 두 번 누르면 둘째 탭이 다음 단계로 들어갔다 — 0.45초 안의 둘째 탭은 버린다 */
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
   * 다시 보낸다 — 다음 운동을 마칠 때, 앱으로 돌아올 때, 15초마다, [다시 보내기]를 누를 때. 저장 상태는 대기열의 영수증을 읽는다.
   */
  const ver = useSyncExternalStore(checkOutbox.subscribe, checkOutbox.version);
  const queued = useRef(new Set<string>());
  const [busy, setBusy] = useState<'resend' | 'persist' | 'verify' | null>(null);
  const [doneNote, setDoneNote] = useState<string | null>(null);

  const flush = useCallback(async () => {
    const outcome = await drainChecks(sendCheck, () => undefined);
    if (outcome === 'auth') leave('/login');
  }, []);

  useEffect(() => {
    let added = false;
    items.forEach((it, i) => {
      const eid = it.exercise.id;
      if (!state.done[i] || before[i] || queued.current.has(eid)) return;
      queued.current.add(eid);
      void checkOutbox.add({ exerciseId: eid, dateKey, recordedAt: new Date().toISOString() });
      added = true;
    });
    if (added) void flush();
  }, [items, state.done, before, dateKey, flush]);

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

  const saves = saveStates(items, dateKey, ver);
  const newly = items.map((_, i) => state.done[i] && !before[i]);
  const waitingCount = saves.filter((x, i) => newly[i] && x === 'pending').length;
  const localCount = saves.filter((x, i) => newly[i] && x === 'local').length;
  const refusedCount = saves.filter((x, i) => newly[i] && x === 'refused').length;
  const unsaved = saves.filter((x, i) => newly[i] && x !== 'saved').length;

  /* 다 마쳤고 체크가 모두 저장 확인됐으면 사이트의 목록 · 홈을 한 번 새로 그리게 한다(웹과 같다 — 돌아간 목록이 체크 전 모습이지 않게) */
  const refreshed = useRef(false);
  const allSaved = state.finished && newly.some(Boolean) && unsaved === 0;
  useEffect(() => {
    if (!allSaved || refreshed.current) return;
    refreshed.current = true;
    rpc('exercise-log.refreshTrainingLists').catch(() => undefined);
  }, [allSaved]);

  /* 저장 다시 하기 — 같은 날 · 운동의 같은 체크라 수행 수 · 기록한 날이 늘지 않는다 */
  const resend = async () => {
    setBusy('resend');
    setDoneNote(null);
    await flush();
    setBusy(null);
  };
  const persistAgain = async () => {
    setBusy('persist');
    const ok = await checkOutbox.persistAgain();
    setDoneNote(ok ? '이 기기에 다시 저장했어요.' : '아직 이 기기에 저장하지 못했어요. 저장 공간을 확인해 주세요.');
    setBusy(null);
  };
  /*
   * 저장 상태 확인 — 같은 루틴을 같은 날로 다시 읽어 그 운동이 그날 체크됐는지 본다(본인 · 날짜 · 루틴 범위는 서버가 본다). 체크됐으면 저장 확인,
   * 안 됐고 대기열에도 없으면 같은 체크를 다시 담는다. 읽지 못하면 그대로 '확인 필요'.
   */
  const verify = async () => {
    setBusy('verify');
    setDoneNote(null);
    try {
      const r = await rpc<LoadResult>('app-armcare.loadAppArmcarePlay', query.id, dateKey, query.areas);
      if (!r.ok) setDoneNote('지금은 저장 상태를 확인하지 못했어요. 암케어 목록에서 체크를 확인해 주세요.');
      else {
        let readd = 0;
        items.forEach((it, i) => {
          if (!newly[i] || saves[i] !== 'unknown') return;
          const got = r.items.find((x) => x.exercise.id === it.exercise.id);
          const k = { exerciseId: it.exercise.id, dateKey };
          if (got?.doneBefore) checkOutbox.confirmSaved(k);
          else if (got) {
            readd++;
            void checkOutbox.add({ ...k, recordedAt: new Date().toISOString() });
          }
        });
        if (readd) void flush();
        setDoneNote(readd ? `저장되지 않은 ${readd}개를 다시 담았어요.` : null);
      }
    } catch {
      setDoneNote('신호가 약해 확인하지 못했어요. 잠시 뒤 다시 확인해 주세요.');
    }
    setBusy(null);
  };

  /*
   * 시계 — 끝나는 순간에 한 번. 버티기가 끝나면 세트를(좌우 각각이면 한쪽을) 마친다. 폰이 잠긴 동안 타이머가 멈추므로 앱으로 돌아올 때 벽시계로
   * 한 번 더 보고, 끝날 시각에 알림도 걸어 둔다(앱이 앞에 떠 있으면 알림은 안 뜨고 떨림이 알린다). 일시정지면 알림을 거두고 아무것도 안 센다 —
   * 멈춘 동안 시간이 지나도 끝나지 않는다. 계속하면 남은 시간으로 새 끝 시각 · 새 알림(같은 이름이라 둘이 되지 않는다).
   */
  useEffect(() => {
    const clock = state.clock;
    if (!clock || clock.left != null) {
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

  /*
   * 다이나믹 아일랜드 · 잠금 화면(2026-10-20 김민) — 버티기 · 쉬기는 끝나는 때까지 거꾸로, 멈췄으면 '일시정지'와 남은 시간, 그 밖엔 이 루틴을
   * 연 때부터 올라간다. 다 마치면 거둔다.
   */
  const [openedMs] = useState(() => Date.now());
  const liveItem = items[state.index];
  const liveSets = liveItem ? `세트 ${Math.min(state.sets[state.index] + (state.clock?.kind === 'hold' ? 1 : 0), liveItem.sets)}/${liveItem.sets}` : '';
  const liveClock = state.clock;
  useLiveActivity(
    state.finished || !liveItem
      ? null
      : liveClock && liveClock.left == null
        ? {
            kind: 'hold',
            symbol: liveClock.kind === 'hold' ? 'hourglass' : 'timer',
            label: liveClock.kind === 'hold' ? (twoSides(liveItem) ? (state.side === 0 ? '버티기 · 한쪽' : '버티기 · 반대쪽') : '버티기') : '쉬는 시간',
            title: liveItem.exercise.title,
            detail: liveSets,
            since: liveClock.endsAt - liveClock.total * 1000,
            until: liveClock.endsAt,
          }
        : {
            kind: 'work',
            symbol: liveClock ? 'pause.circle' : 'figure.flexibility',
            label: liveClock ? `일시정지 · ${clockText(Math.ceil((liveClock.left ?? 0) / 1000))} 남음` : '암케어',
            title: liveItem.exercise.title,
            detail: liveSets,
            since: openedMs,
          }
  );

  /* 운동이 바뀌면 맨 위(이름 · 목표)부터 — 자세 설명을 읽느라 내려가 있던 자리에 다음 운동이 뜨면 할 차례가 화면 밖에 있다 */
  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [state.index]);

  const [listOpen, setListOpen] = useState(false);
  const [celebrated, setCelebrated] = useState(false);

  const doneCount = state.done.filter(Boolean).length;
  /* 하던 운동이 있나 — 나가면 그 세트 · 시계는 처음부터 다시 한다 */
  const midway =
    !state.finished && state.completed == null && !state.done[state.index] && (state.sets[state.index] > 0 || state.side === 1 || state.clock != null);
  const close = () => {
    if (!midway) return leaveNow();
    Alert.alert(
      '따라 하기를 나갈까요?',
      `마친 운동 ${doneCount}개는 기록에 남아요. 하던 '${items[state.index].exercise.title}'의 세트와 타이머는 다음에 처음부터 다시 해요.`,
      [
        { text: '계속하기', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: leaveNow },
      ]
    );
  };
  /* 완료 화면에서 나가기 — 이 기기에 못 담았거나 서버가 받지 않은 기록이 있으면 먼저 알린다(나가도 저장으로 바뀌지 않는다) */
  const closeDone = () => {
    if (localCount + refusedCount === 0) return leaveNow();
    Alert.alert(
      '저장되지 않은 기록이 있어요',
      localCount > 0 ? `운동 기록 ${localCount}개는 이 기기에도 저장되지 않아 앱을 닫으면 남지 않을 수 있어요.` : `운동 기록 ${refusedCount}개는 서버가 받지 않았어요. 암케어 목록에서 다시 체크해 주세요.`,
      [
        { text: '남아서 확인', style: 'cancel' },
        { text: '나가기', style: 'destructive', onPress: leaveNow },
      ]
    );
  };

  /* 옆으로 쓸어 닫기는 끈다 — 밴드를 든 손이 화면 끝을 스쳐 닫혔다. 나가기는 ✕ 로 */
  const noSwipe = <Stack.Screen options={{ gestureEnabled: false }} />;

  if (items.length === 0)
    return (
      <View style={[s.fill, s.centerBox, { backgroundColor: c.page, gap: 12 }]}>
        {noSwipe}
        <Text style={[TYPE.section, { color: c.ink }]}>따라 할 운동이 없어요</Text>
        <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>오늘 몸 상태에 맞는 운동이 빠져 비었어요. 암케어에서 구성을 확인해 주세요.</Text>
        <Press onPress={leaveNow} accessibilityRole="button" style={[s.pill, { backgroundColor: c.action, alignSelf: 'stretch' }]}>
          <Text style={[TYPE.button, { color: c.onAction }]}>암케어로 돌아가기</Text>
        </Press>
      </View>
    );

  if (state.finished) {
    return (
      <View style={[s.fill, { backgroundColor: c.page }]} onTouchStart={touch}>
        {noSwipe}
        <ArmcareDone
          title={title}
          dateKey={dateKey}
          items={items}
          before={before}
          done={state.done}
          saves={saves}
          refusedMessage={refusedText(items, dateKey, ver)}
          week={week ?? null}
          already={already}
          animate={!already && !celebrated && newly.some(Boolean)}
          onAnimated={() => setCelebrated(true)}
          onClose={closeDone}
          onResume={() => dispatch({ type: 'reopen' })}
          onResend={() => void resend()}
          onPersist={() => void persistAgain()}
          onVerify={() => void verify()}
          busy={busy}
          note={doneNote}
          c={c}
        />
        {/* 재활 따라 하기의 3문항(재활 2편) — 재활이 켜진 계정에서만 서버가 준다(REHAB_ENABLED). 일반 암케어에는 없다 */}
        {rehabCheck && doneCount > 0 ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: Math.max(16, inset.bottom) }}>
            <RehabCheck dateKey={dateKey} settled={unsaved === 0} initial={rehabCheck.initial} c={c} />
          </View>
        ) : null}
      </View>
    );
  }

  const it = items[state.index];
  const ex = it.exercise;
  const doneSets = state.sets[state.index];
  const isDone = state.done[state.index];
  const clock = state.clock;
  const completed = state.completed;
  const nextAfter = completed != null ? nextUndone(state.done, completed) : nextUndone(state.done, state.index);
  const skipTo = nextUndone(state.done, state.index);
  const two = twoSides(it);
  const amount = it.holdSeconds != null ? `${formatSeconds(it.holdSeconds)}` : it.reps != null ? `${it.reps}회` : '';
  const prescription = [amount, it.perSide ? '좌우 각각' : null, `${it.sets}세트`].filter(Boolean).join(' · ');
  const meta = [ex.equipment.join(' · '), ex.targetMuscles[0]].filter(Boolean).join(' · ');
  const pending = waitingCount + localCount + refusedCount;

  /* 세트 판의 상태 한 줄 */
  const chip = clock
    ? clock.left != null
      ? '일시정지'
      : clock.kind === 'rest'
        ? '쉬는 중'
        : two
          ? state.side === 0
            ? '한쪽 버티는 중'
            : '반대쪽 버티는 중'
          : '버티는 중'
    : two
      ? state.side === 0
        ? '한쪽'
        : '반대쪽 차례'
      : it.perSide
        ? '좌우 각각'
        : null;

  return (
    <View style={[s.fill, { backgroundColor: c.page }]} onTouchStart={touch}>
      {noSwipe}
      <View style={[s.header, { paddingTop: inset.top + 4 }]}>
        <View style={s.headRow}>
          <Press onPress={close} accessibilityRole="button" accessibilityLabel="따라 하기 닫기" style={s.iconBtn}>
            <Icon name="x" size={20} color={c.link} />
          </Press>
          <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink, flex: 1, textAlign: 'center' }]}>
            암케어
          </Text>
          <Press onPress={() => setListOpen(true)} accessibilityRole="button" accessibilityLabel="운동 목록" style={s.iconBtn}>
            <Icon name="list" size={20} color={c.link} />
          </Press>
        </View>
        <View style={s.progressRow}>
          <Text numberOfLines={1} style={[TYPE.sub, { color: c.muted, flex: 1 }]}>
            {title}
          </Text>
          <Text style={[TYPE.sub, { color: c.muted, fontVariant: ['tabular-nums'] }]}>
            {Math.min(state.index + 1, items.length)} / {items.length}
          </Text>
        </View>
        <View style={s.segments} accessible accessibilityLabel={`${items.length}개 중 ${doneCount}개 수행`}>
          {items.map((item, i) => (
            <View
              key={item.exercise.id}
              style={[s.segment, { backgroundColor: state.done[i] ? c.sky : i === state.index ? withAlpha(c.sky, 0.4) : c.chip }]}
            />
          ))}
        </View>
      </View>

      <ScrollView ref={scrollRef} style={s.fill} contentContainerStyle={[s.content, READABLE]}>
        {notice ? (
          <View style={[s.notice, { backgroundColor: c.warnBg }]}>
            <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor={c.warn} />
            <Text style={[TYPE.sub, { color: c.warn, flex: 1 }]}>{notice}</Text>
          </View>
        ) : null}

        {/* 운동마다 새로 그린다(key) — 앞 운동의 영상이 다음 운동에서 돌고 설명 칸이 빈 채로 남지 않게. 시계 · 영수증이 바뀌어도 이 칸은 그대로 */}
        <View key={ex.id} style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            {meta ? <Text style={[TYPE.sub, { color: c.muted }]}>{meta}</Text> : null}
            <Text style={[s.title, { color: c.ink }]}>{ex.title}</Text>
            <Text style={[TYPE.card, { color: c.link }]}>{prescription}</Text>
            {it.note ? <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{it.note}</Text> : null}
            {it.unsafe && !isDone ? (
              <View style={s.warnRow}>
                <SymbolView name="exclamationmark.triangle.fill" size={13} tintColor={c.warn} />
                <Text style={[TYPE.body, { color: c.warn, flex: 1 }]}>지금 몸 상태에는 권하지 않는 운동이에요. 건너뛰어도 돼요.</Text>
              </View>
            ) : null}
          </View>
          <ExerciseMedia path={ex.videoPath} referenceVideoId={ex.referenceVideoId} thumbUrl={ex.thumbUrl} aspectRatio={ex.aspectRatio} compact c={c} />
        </View>

        {completed != null ? (
          <View style={[s.setCard, { backgroundColor: c.card, boxShadow: c.float }]} accessibilityLiveRegion="polite">
            <View style={s.doneHead}>
              <SymbolView name="checkmark.circle.fill" size={22} tintColor={c.ok} />
              <Text style={[TYPE.section, { color: c.ink }]}>이 운동 끝</Text>
            </View>
            <Text style={[TYPE.body, { color: c.muted }]}>{items[completed].sets}세트 진행 완료</Text>
            <View style={[s.nextBox, { backgroundColor: c.page }]}>
              <Text style={[TYPE.sub, { color: c.muted }]}>{nextAfter != null ? '다음 운동' : '남은 운동'}</Text>
              <Text style={[TYPE.card, { color: c.ink }]}>{nextAfter != null ? items[nextAfter].exercise.title : '모든 운동을 마쳤어요'}</Text>
            </View>
          </View>
        ) : isDone ? (
          <View style={[s.setCard, { backgroundColor: c.card, boxShadow: c.float }]}>
            <View style={s.doneHead}>
              <SymbolView name="checkmark.circle.fill" size={22} tintColor={c.ok} />
              <Text style={[TYPE.card, { color: c.ink }]}>오늘 이미 한 운동이에요</Text>
            </View>
          </View>
        ) : (
          <View style={[s.setCard, { backgroundColor: c.card, boxShadow: c.float }]}>
            <View style={s.setHead}>
              <Text style={[TYPE.buttonCompact, { color: c.ink }]}>
                {Math.min(doneSets + 1, it.sets)} / {it.sets}세트
              </Text>
              <SetDots planned={it.sets} done={doneSets} c={c} />
            </View>
            {chip ? (
              <View style={[s.chip, { backgroundColor: withAlpha(c.sky, 0.12) }]}>
                <Text style={[TYPE.buttonCompact, { color: c.link }]}>{chip}</Text>
              </View>
            ) : null}
            {clock ? (
              <BigClock key={`${clock.endsAt}:${clock.left ?? ''}`} clock={clock} label={chip ?? ''} c={c} />
            ) : (
              <View style={s.target} accessible accessibilityLabel={`목표 ${amount}`}>
                <Text style={[s.targetNum, { color: c.ink }]}>{it.holdSeconds ?? it.reps ?? '-'}</Text>
                <Text style={[TYPE.card, { color: c.muted }]}>{it.holdSeconds != null ? '초' : it.reps != null ? '회' : ''}</Text>
              </View>
            )}
            <Text style={[TYPE.sub, { color: c.muted, textAlign: 'center' }]}>
              {clock?.kind === 'rest'
                ? `${doneSets}세트 완료 · 다음 세트 준비`
                : two
                  ? state.side === 0
                    ? '양쪽을 마치면 1세트'
                    : '반대쪽까지 마치면 1세트'
                  : it.perSide
                    ? '양쪽을 마친 뒤 세트 완료'
                    : it.holdSeconds != null
                      ? '이번 세트 목표 시간'
                      : '이번 세트 목표 횟수'}
            </Text>
          </View>
        )}

        {/* 운동마다 새로(key) — 앞 운동의 펼친 설명이 다음 운동에 남지 않게 */}
        <HowTo key={ex.id} exerciseId={ex.id} method={ex.method} c={c} />

        {pending > 0 ? (
          <View style={[s.notice, { backgroundColor: localCount + refusedCount > 0 ? c.dangerBg : c.warnBg }]}>
            <Text style={[TYPE.sub, { color: localCount + refusedCount > 0 ? c.danger : c.warn, flex: 1 }]}>
              {localCount > 0
                ? `체크 ${localCount}개를 이 기기에 저장하지 못했어요.`
                : refusedCount > 0
                  ? `체크 ${refusedCount}개가 저장되지 않았어요. ${refusedText(items, dateKey, ver) ?? ''}`
                  : `수행 체크 ${waitingCount}개 전송 대기`}
            </Text>
            {localCount > 0 ? (
              <Press onPress={() => void persistAgain()} disabled={busy != null} accessibilityRole="button" style={s.textBtn}>
                <Text style={[TYPE.buttonCompact, { color: c.link }]}>다시 저장</Text>
              </Press>
            ) : refusedCount === 0 ? (
              <Press onPress={() => void resend()} disabled={busy != null} accessibilityRole="button" style={s.textBtn}>
                <Text style={[TYPE.buttonCompact, { color: c.link }]}>다시 보내기</Text>
              </Press>
            ) : null}
          </View>
        ) : null}
        {doneNote && !state.finished ? <Text style={[TYPE.sub, { color: c.muted }]}>{doneNote}</Text> : null}
      </ScrollView>

      {/* 누르는 막대 — 엄지가 닿는 아래에 */}
      <View style={[s.bottom, { paddingBottom: Math.max(12, inset.bottom), paddingHorizontal: barSide, backgroundColor: c.card, borderTopColor: c.line }]}>
        {completed != null || isDone ? (
          nextAfter != null ? (
            <Big
              label="다음 운동"
              symbol="arrow.right"
              onPress={() => (completed != null ? tap({ type: 'next' }) : tap({ type: 'go', index: nextAfter }))}
              c={c}
            />
          ) : (
            <Big label="루틴 마치기" symbol="flag.checkered" onPress={() => tap({ type: 'finish' })} c={c} />
          )
        ) : clock ? (
          <>
            {clock.left != null ? (
              <Big label="계속하기" symbol="play.fill" onPress={() => tap({ type: 'resume', clock, at: Date.now() })} c={c} />
            ) : (
              <Big label="일시정지" symbol="pause.fill" onPress={() => tap({ type: 'pause', clock, at: Date.now() })} c={c} />
            )}
            <View style={s.navRow}>
              {clock.kind === 'hold' ? (
                <>
                  <Small label="현재 버티기 취소" onPress={() => tap({ type: 'cancel', clock })} c={c} />
                  <Small
                    label="직접 완료"
                    align="right"
                    onPress={() =>
                      Alert.alert(`${two ? (state.side === 0 ? '한쪽' : '반대쪽') : '이번'} 버티기를 마쳤나요?`, '마친 것으로 세요. 시간이 남았어도 이 쪽은 끝나요.', [
                        { text: '아니요', style: 'cancel' },
                        { text: '마쳤어요', onPress: () => dispatch({ type: 'clock-end', clock, at: Date.now() }) },
                      ])
                    }
                    c={c}
                  />
                </>
              ) : (
                <>
                  <Small label="휴식 건너뛰기" onPress={() => tap({ type: 'clock-end', clock, at: Date.now() })} c={c} />
                  <Small label="운동 목록" align="right" onPress={() => setListOpen(true)} c={c} />
                </>
              )}
            </View>
          </>
        ) : (
          <>
            <Big
              label={it.holdSeconds != null ? `${two ? (state.side === 0 ? '한쪽 ' : '반대쪽 ') : ''}버티기 시작` : it.perSide ? '양쪽 세트 완료' : '세트 완료'}
              symbol={it.holdSeconds != null ? 'play.fill' : 'checkmark'}
              onPress={() => tap(it.holdSeconds != null ? { type: 'hold', at: Date.now() } : { type: 'set', at: Date.now() })}
              c={c}
            />
            <View style={s.navRow}>
              <Small label="이전 운동" disabled={state.index === 0} onPress={() => dispatch({ type: 'go', index: state.index - 1 })} c={c} />
              <Small
                label="건너뛰기"
                align="right"
                disabled={skipTo == null || skipTo === state.index}
                onPress={() => skipTo != null && dispatch({ type: 'go', index: skipTo })}
                c={c}
              />
            </View>
          </>
        )}
      </View>

      {listOpen ? (
        <Sheet
          fit
          open
          onClose={() => setListOpen(false)}
          title="운동 목록"
          description={`${items.length}개 중 ${doneCount}개 수행`}
          footer={
            <Press
              onPress={() => {
                setListOpen(false);
                dispatch({ type: 'finish' });
              }}
              accessibilityRole="button"
              style={[s.pill, { backgroundColor: c.action }]}
            >
              <Text style={[TYPE.button, { color: c.onAction }]}>루틴 마치기</Text>
            </Press>
          }
          c={c}
        >
          <View style={{ gap: 6 }}>
            {items.map((item, i) => (
              <Press
                key={item.exercise.id}
                onPress={() => {
                  setListOpen(false);
                  dispatch({ type: 'go', index: i });
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: i === state.index }}
                accessibilityLabel={`${item.exercise.title}, ${state.done[i] ? '수행함' : i === state.index ? '지금 운동' : '남음'}`}
                style={[s.listRow, { backgroundColor: i === state.index ? withAlpha(c.sky, 0.1) : c.card }]}
              >
                <View style={[s.listMark, state.done[i] ? { backgroundColor: c.sky } : { borderWidth: 2, borderColor: c.line }]}>
                  {state.done[i] ? <SymbolView name="checkmark" size={11} weight="bold" tintColor="#fff" /> : null}
                </View>
                <Text style={[TYPE.body, { color: c.ink, flex: 1 }]}>{item.exercise.title}</Text>
                <Text style={[TYPE.sub, { color: c.muted }]}>{state.done[i] ? '수행' : i === state.index ? '지금' : ''}</Text>
              </Press>
            ))}
            <Text style={[TYPE.sub, { color: c.muted, paddingTop: 6 }]}>
              다 하지 않아도 마칠 수 있어요. 끝까지 한 운동만 기록에 남아요.
            </Text>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

/**
 * 큰 시계 — 남은 시간 · 막대. 스스로 초를 센다(화면 전체를 자주 다시 그리지 않게). 멈춘 시계(left)는 그 값 그대로. 시계마다 새로 만든다(key).
 * 앱으로 돌아오면 곧바로 맞춘다(잠긴 동안 멈춘 타이머). 화면 읽기에는 매초가 아니라 처음 한 번 읽힌다.
 */
function BigClock({ clock, label, c }: { clock: Clock; label: string; c: Palette }) {
  const [now, setNow] = useState(() => Date.now());
  const paused = clock.left != null;
  useEffect(() => {
    if (paused) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [paused]);
  const leftMs = paused ? (clock.left ?? 0) : Math.max(0, clock.endsAt - now);
  const left = Math.ceil(leftMs / 1000);
  return (
    <View accessible accessibilityRole="timer" accessibilityLabel={`${label} ${clockText(Math.ceil(clock.total))} 중`} style={{ gap: 10, alignItems: 'center' }}>
      <Text style={[s.clock, { color: paused ? c.muted : c.ink }]}>{clockText(left)}</Text>
      <View style={[s.bar, { backgroundColor: c.chip }]}>
        <View style={{ width: `${clock.total ? Math.min(100, (leftMs / 1000 / clock.total) * 100) : 0}%`, height: '100%', borderRadius: 4, backgroundColor: clock.kind === 'hold' ? c.sky : c.muted }} />
      </View>
    </View>
  );
}

function Big({ label, symbol, onPress, c }: { label: string; symbol: Parameters<typeof SymbolView>[0]['name']; onPress: () => void; c: Palette }) {
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={({ pressed }) => [s.big, { backgroundColor: c.action, opacity: pressed ? 0.85 : 1 }]}>
      <SymbolView name={symbol} size={18} weight="bold" tintColor={c.onAction} />
      <Text style={[TYPE.button, { color: c.onAction }]}>{label}</Text>
    </Pressable>
  );
}

function Small({ label, onPress, disabled, align, c }: { label: string; onPress: () => void; disabled?: boolean; align?: 'right'; c: Palette }) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      style={[s.small, align === 'right' ? { alignItems: 'flex-end' } : null, { opacity: disabled ? 0.35 : 1 }]}
    >
      <Text style={[TYPE.buttonCompact, { color: c.ink }]}>{label}</Text>
    </Press>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 8, paddingBottom: 10, gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12 },
  segments: { flexDirection: 'row', gap: 4, paddingHorizontal: 12 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24, gap: 14 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingLeft: 14, paddingRight: 4, minHeight: 48 },
  textBtn: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  title: { fontSize: 28, fontWeight: '800', lineHeight: 34, letterSpacing: -0.6 },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingTop: 4 },
  setCard: { borderRadius: 22, padding: 18, gap: 12 },
  setHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  chip: { alignSelf: 'flex-start', borderRadius: 14, paddingHorizontal: 12, paddingVertical: 6 },
  target: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 4 },
  targetNum: { fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 64 },
  clock: { fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 64 },
  bar: { alignSelf: 'stretch', height: 6, borderRadius: 3, overflow: 'hidden' },
  doneHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  nextBox: { borderRadius: 16, padding: 14, gap: 2 },
  bottom: { paddingTop: 12, gap: 6, borderTopWidth: StyleSheet.hairlineWidth },
  big: { minHeight: 56, borderRadius: 28, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  navRow: { flexDirection: 'row', gap: 8 },
  small: { flex: 1, minHeight: 44, justifyContent: 'center', paddingHorizontal: 8 },
  pill: { minHeight: 50, borderRadius: 25, paddingHorizontal: 22, alignItems: 'center', justifyContent: 'center' },
  listRow: { minHeight: 52, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 12 },
  listMark: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
});
