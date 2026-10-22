import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router, Stack } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  ActivityIndicator,
  Alert,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AMOUNT_LIMITS, WEIGHT_STEP, formatSeconds, storedKg } from '@/lib/exercise-meta';
import {
  asksReserve as asksReserveFor,
  finishLine,
  isOptionalProgramExercise,
  setsNeeded,
  warmupLine,
} from '@/lib/program/program';
import { UNIT_KG, UNIT_LB, roundForDisplay, weightKindOf } from '@/lib/program/next-weight';
import { formatWeight, fromWeight, round1, toWeight } from '@/lib/units';
import { newRecord } from '@/lib/workout/bests';
import { REST_CLOCK_LIMIT_SECONDS, restSeconds } from '@/lib/workout/rest';
import { placeExercise, type SwapMode } from '@/lib/workout/swap';
import type { SavedSet } from '@/app/actions/workout';
import type { RunExercise } from '@/lib/workout/run-exercises';
import type { RunPayload } from '@/lib/workout/run-load';
import { BullpenNative } from '../../modules/bullpen-native';
import { rpc, RpcError } from '~/lib/rpc';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { TRAINING_HOME_HREF } from '@/lib/training-part';
import { drainOutbox, onSent, outbox, withPending, type ShownSet } from '~/workout/outbox';
import { NoteBox, NumberPad, RestPill, RirQuestion, SetDots, clockText } from '~/workout/parts';
import { useLiveActivity } from '~/shell/live-activity';
import { ExerciseMedia } from '~/armcare/parts';
import { HistoryPanel } from '~/training/history';
import { FinishSheet, ListSheet, SwapSheet } from '~/workout/sheets';
import { useWeightUnit } from '~/lib/weight-unit';
import { READABLE, useBarSide } from '~/lib/layout';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';

/**
 * 운동 진행(앱 화면) — 웹 app/(session)/workout/run/session-client.tsx 를 옮겼다. 사이트의 운동 화면이 앱(BullpenNative/2 부터)이면 이 화면을
 * 띄우고(page.tsx → OpenNative), 판 · 목록 · 세트는 웹과 같은 곳에서 읽는다(app/actions/app-workout.ts → lib/workout/run-load.ts).
 *
 * 웹과 같은 규칙: 위는 보는 곳 · 아래는 누르는 곳(엄지), 숫자는 앱이 그린 판, 미리 채우지 않음('지난번 그대로'는 사람이 누른다),
 * 세트는 폰에 먼저 담고 뒤에서 보낸다(~/workout/outbox.ts — 신호가 없어도 그 세트는 남는다). 마치면 웹을 축하 화면으로 보내고 닫는다.
 */
type LoadResult = ({ ok: true } & RunPayload) | { ok: false; error: string; to?: string };
type SetResult = { sets: SavedSet[] } | { error: string };

/** 화면을 닫고 웹을 그 주소로 — 껍데기(index.tsx)가 웹뷰를 옮긴다(~/shell/web-nav leaveTo) */
const leave = leaveTo;

/** 새 세트 번호 — 가장 작은 빈 번호(가운데 세트를 지운 뒤 끝 + 1 로 매기면 '몇 개 더?' · 마치기 셈이 처방 마지막 세트를 못 봤다) */
function nextSetNo(taken: number[]) {
  const set = new Set(taken);
  let n = 1;
  while (set.has(n)) n++;
  return n;
}

export default function WorkoutScreen() {
  const c = usePalette();
  const [data, setData] = useState<RunPayload | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    rpc<LoadResult>('app-workout.loadAppWorkout').then(
      (r) => {
        if (!alive) return;
        if (r.ok) setData(r);
        else leave(r.to ?? '/training');
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setFailed(e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '신호가 약해 운동을 불러오지 못했어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [tries]);

  if (data) return <Run key={data.sessionId} {...data} c={c} />;
  return (
    <View style={[s.fill, s.centerBox, { backgroundColor: c.page, gap: 16 }]}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {failed ? (
        <>
          <Text style={[s.body, { color: c.ink, textAlign: 'center' }]}>{failed}</Text>
          {/* 웹 운동 화면 오류(app/(session)/error.tsx)와 같은 안심 한 줄 — 남긴 세트는 폰 대기열에 있다(~/workout/outbox) */}
          <Text style={[s.small, { color: c.muted, textAlign: 'center' }]}>
            남긴 세트는 지워지지 않았어요. 신호가 없을 때 남긴 세트도 폰에 있다가 저절로 보내져요.
          </Text>
          <Press
            onPress={() => {
              setFailed(null);
              setTries((n) => n + 1);
            }}
            accessibilityRole="button"
            style={[s.pill, { backgroundColor: c.sky }]}
          >
            <Text style={[s.bodyBold, { color: '#fff' }]}>다시 불러오기</Text>
          </Press>
          <Press onPress={() => router.back()} accessibilityRole="button" style={s.pill}>
            <Text style={[s.bodyBold, { color: c.muted }]}>닫기</Text>
          </Press>
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

/* ----------------------------- 도우미 ----------------------------- */

/** 무게 · 횟수를 적지 않는 분류 — 세트 완료만 누른다(2026-10-12 사용자) */
const NO_INPUT_CATEGORIES = new Set(['모빌리티', '워밍업']);
/** 이만큼 이하로 쉬는 묶음은 한 세트씩 번갈아 한다(lib/program/load.ts 와 같은 값) */
const BUNDLE_SHORT_REST = 30;

/** 입력 없이 남기는 세트의 양 — 처방 글('2세트 × 30초', '10회 · 한쪽씩')의 마지막 회 · 초 숫자. 못 읽으면 1(웹과 같다) */
function plannedAmount(ex: { prescription: string | null; isHold: boolean }): number {
  const m = [...(ex.prescription ?? '').matchAll(/(\d+)\s*(회|초|분)/g)].pop();
  if (!m) return 1;
  const n = Number(m[1]);
  return ex.isHold && m[2] === '분' ? n * 60 : n;
}

const asksReserve = (ex: RunExercise) => asksReserveFor(ex.programSlot, ex.plannedSets);

/** 지금 보던 운동을 이 판 번호로 적어 두는 곳 — 앱이 메모리 탓에 다시 켜져도 보던 운동으로 돌아온다(웹 sessionStorage 와 같은 몫) */
const atKey = (sessionId: string) => `bullpen-workout-at:${sessionId}`;


/**
 * 마지막 세트로부터 흐른 시간(초) — 거꾸로 내려가지 않고 0:00 부터 올라간다. 10분이 넘으면 null(시계를 거둔다, lib/workout/rest.ts).
 * '마지막 세트 시각' 하나만 들고 있어 화면이 꺼졌다 켜져도 정확하다 — 앱으로 돌아오면 곧바로 맞춘다.
 */
function useRestClock(since: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!since) return;
    const start = Date.parse(since);
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t - start >= REST_CLOCK_LIMIT_SECONDS * 1000) clearInterval(id);
    }, 1000);
    const sub = AppState.addEventListener('change', (st) => {
      if (st === 'active') setNow(Date.now());
    });
    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [since]);
  return restSeconds(since, now);
}

const tick = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

/* ----------------------------- 본체 ----------------------------- */

function Run({
  sessionId,
  themeLabel,
  programDay,
  exercises,
  initialSets,
  openedAt,
  priorSeconds,
  c,
}: RunPayload & { c: Palette }) {
  const inset = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  /* 아이패드 — 바닥 막대 안 단추를 본문 폭으로(~/lib/layout) */
  const barSide = useBarSide(12);
  /* 낮은 화면(아이폰 SE) — 숫자판을 연 동안 판 · 무게 · 횟수 · [세트 완료]가 한 화면에 들어오게(웹 short:) */
  const short = height < 700;
  /* 서버에 저장이 끝난 세트 — 서버가 돌려준 것만 넣는다 */
  const [saved, setSaved] = useState<SavedSet[]>(initialSets);
  /* 폰에만 있고 아직 못 보낸 세트 — 화면에는 둘을 합쳐 보인다(신호가 없어도 방금 남긴 세트가 바로 보이고 휴식 시계도 흐른다) */
  const allPending = useSyncExternalStore(outbox.subscribe, outbox.snapshot);
  const pending = useMemo(() => allPending.filter((p) => p.sessionId === sessionId), [allPending, sessionId]);
  const sets = useMemo(() => withPending(saved, pending), [saved, pending]);
  const [offline, setOffline] = useState(false);
  /* 목록은 상태로 — 순서를 바꾸거나 빼거나 바꿔 넣는다(서버가 다시 그리지 않는다) */
  const [list, setList] = useState<RunExercise[]>(exercises);
  const [at, setAt] = useState(0);
  const [notes, setNotes] = useState<Record<string, string>>(() =>
    Object.fromEntries(exercises.flatMap((e) => (e.note ? [[e.id, e.note]] : [])))
  );
  const [favorites, setFavorites] = useState<ReadonlySet<string>>(
    () => new Set(exercises.filter((e) => e.favorite).map((e) => e.id))
  );
  const [starring, setStarring] = useState(false);
  /* 시트 셋 — 열 때마다 key 를 올려 새로 그린다(고르던 강도 · 찾던 글이 다음에 안 남게), 닫은 뒤에도 붙어 있어 내려가는 움직임이 보인다 */
  const [sheet, setSheet] = useState<{ which: 'list' | 'swap' | 'finish' | null; n: number }>({ which: null, n: 0 });
  const openSheet = (which: 'list' | 'swap' | 'finish') => setSheet((p) => ({ which, n: p.n + 1 }));
  const closeSheet = () => setSheet((p) => ({ ...p, which: null }));
  const [finishError, setFinishError] = useState<string | null>(null);
  const [ending, setEnding] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  /* 숫자판은 누를 때만 올린다 — 늘 펴 두면 방금 남긴 세트 · 쉰 시간이 밀려난다 */
  const [pad, setPad] = useState(false);
  const [askRir, setAskRir] = useState<{ exerciseId: string; setNo: number } | null>(null);
  const wUnit = useWeightUnit();
  const [weight, setWeight] = useState('');
  const [count, setCount] = useState('');
  const [field, setField] = useState<'weight' | 'count'>(exercises[0].needsWeight ? 'weight' : 'count');
  const [error, setError] = useState<string | null>(null);
  /*
   * 고치는 중인 세트 — 줄을 누르면 그 값이 아래 칸에 채워지고 큰 단추가 'N세트 고치기'. 같은 번호로 다시 담아 보내면 서버가 덮어쓴다.
   * 마친 시각은 그 세트의 것을 그대로(고친 시각이면 휴식 시계 · 순서가 틀어진다). 누르기 전 넣고 있던 값(draft)은 끝나면 되돌린다.
   */
  const [editing, setEditing] = useState<{
    setNo: number;
    recordedAt: string;
    draft: { weight: string; count: string; field: 'weight' | 'count' };
  } | null>(null);
  /* 자세 설명 · 영상 — 운동을 옮겨도 편 채로 둔다(한 번 편 사람은 다음 운동에서도 본다) */
  const [showForm, setShowForm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [keyboard, setKeyboard] = useState(false);
  const scrollRef = useRef<ScrollViewInstance>(null);

  /* 다시 켜진 화면이면 보던 운동으로 — 처음 한 번만(그 뒤로는 목록이 바뀌어 번호가 어긋날 수 있다) */
  useEffect(() => {
    AsyncStorage.getItem(atKey(sessionId)).then(
      (id) => {
        const i = id ? exercises.findIndex((e) => e.id === id) : -1;
        if (i <= 0) return;
        setAt(i);
        setField(exercises[i].needsWeight ? 'weight' : 'count');
      },
      () => undefined
    );
  }, [sessionId, exercises]);

  const ex = list[at];
  useEffect(() => {
    void AsyncStorage.setItem(atKey(sessionId), ex.id).catch(() => undefined);
  }, [sessionId, ex.id]);

  /* 자판(메모 쓰기)이 떠 있는 동안 아래 막대를 감춘다 — 그 막대에는 자판으로 넣는 칸이 없고, 쓰는 메모가 가려진다(웹과 같다) */
  useEffect(() => {
    const a = Keyboard.addListener('keyboardWillShow', () => setKeyboard(true));
    const b = Keyboard.addListener('keyboardWillHide', () => setKeyboard(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);

  const hasForm = Boolean(ex.description || ex.videoPath || ex.referenceVideoId);
  const timeLabel = ex.inMinutes ? '운동 시간' : '버틴 시간';
  const mine = useMemo(() => sets.filter((x) => x.exerciseId === ex.id).sort((a, b) => a.setNo - b.setNo), [sets, ex.id]);
  const editIndex = editing ? mine.findIndex((x) => x.setNo === editing.setNo) : -1;
  /* 프로그램 % 방식 — 이번에 할 세트의 목표(세트마다 다르다). 고치는 중이면 그 세트 */
  const targetIndex = editIndex >= 0 ? editIndex : mine.length;
  const target = ex.setTargets?.[targetIndex] ?? null;
  const suggestKg = ex.setTargets ? (target?.kg ?? null) : ex.suggestedKg;

  /* 마지막으로 남긴 세트 — 이 판을 연 뒤의 것만(다시 연 판에서 '47분째 쉬는 중'이 뜨지 않게) */
  const lastSet = useMemo(() => {
    const since = sets.filter((x) => x.recordedAt >= openedAt);
    if (since.length === 0) return null;
    return since.reduce((a, b) => (a.recordedAt > b.recordedAt ? a : b));
  }, [sets, openedAt]);
  const lastAt = lastSet?.recordedAt ?? null;
  const idle = useRestClock(lastAt ?? openedAt);
  const rest = lastAt ? idle : null;
  /*
   * 운동하는 동안 화면을 켜 둔다 — 세트 사이 1~3분인데 폰은 30초면 잠긴다. 10분 넘게 세트가 없으면 놓는다(휴식 시계를 거두는 때와 같다 —
   * 종료를 안 누르고 떠나면 배터리가 끝까지 닳았다). 화면을 나가면 놓는다.
   */
  const awake = idle != null;
  useEffect(() => {
    void BullpenNative.keepAwake(awake).catch(() => undefined);
  }, [awake]);
  useEffect(() => () => void BullpenNative.keepAwake(false).catch(() => undefined), []);

  /* 권장 쉬는 시간 — 마지막 세트를 한 운동의 처방 휴식. 참고 글로만(2026-10-12 사용자: 링 · 소리 · 알림 없음) */
  const restTarget = lastSet ? (list.find((e) => e.id === lastSet.exerciseId)?.restSeconds ?? null) : null;

  /*
   * 다이나믹 아일랜드 · 잠금 화면(2026-10-20 김민) — 세트를 남기면 쉬는 시계(이 화면 시계와 같이 마지막 세트부터 올라감),
   * 그 밖엔 '운동 중' 전체 시간(마치기 창의 운동 시간과 같은 기준: 이 판을 연 때 − 앞서 한 시간). 화면을 나가면 거둔다.
   */
  const startedMs = Date.parse(openedAt) - priorSeconds * 1000;
  const setLine = ex.plannedSets ? `세트 ${Math.min(mine.length, ex.plannedSets)}/${ex.plannedSets}` : `${mine.length}세트`;
  useLiveActivity(
    rest != null && lastAt
      ? {
          kind: 'rest',
          symbol: 'timer',
          label: '휴식',
          title: ex.title,
          detail: restTarget != null ? `권장 ${clockText(restTarget)}` : setLine,
          since: Date.parse(lastAt),
        }
      : { kind: 'work', symbol: 'figure.strengthtraining.traditional', label: '운동 중', title: ex.title, detail: setLine, since: startedMs }
  );

  const setCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const x of sets) counts.set(x.exerciseId, (counts.get(x.exerciseId) ?? 0) + 1);
    return counts;
  }, [sets]);
  /* 프로그램 날의 끝내기 한 줄 — 처방 세트 절반 · 아직 안 답한 '몇 개 더?'(웹과 같은 셈) */
  const programFinish = useMemo(() => {
    if (programDay == null) return null;
    /* 선택 운동(메디신볼 던지기)은 세지 않는다 — lib/program/advance.ts 와 같은 셈 */
    const slotted = list.filter((e) => e.programSlot && !isOptionalProgramExercise(e));
    const planned = slotted.reduce((n, e) => n + (e.plannedSets ?? 0), 0);
    const logged = sets.filter((x) => slotted.some((e) => e.id === x.exerciseId)).length;
    const unanswered = slotted
      .filter((e) => asksReserve(e) && sets.some((x) => x.exerciseId === e.id && x.setNo === e.plannedSets && x.rir == null))
      .map((e) => e.title);
    return { line: finishLine(programDay, planned, logged), reached: logged >= setsNeeded(planned), unanswered };
  }, [programDay, list, sets]);
  const record = useMemo(() => newRecord(ex, mine, ex.best), [ex, mine]);

  /*
   * 폰에 담아 둔 세트를 누른 순서대로 하나씩 보낸다. 서버가 거절한 것(이미 마친 판 · 잘못된 값)은 빼고 알리고, 신호가 없어 못 보낸 것은
   * 두고 멈춘다(다음 기회에). 다른 판의 세트도 같이 보내지만(신호 없이 나간 지난 판) 그 답은 이 화면에 안 붙인다.
   */
  const flush = useCallback(async () => {
    const outcome = await drainOutbox(
      (p) => rpc<SetResult>('workout.logSet', p),
      () => undefined
    );
    if (outcome === 'offline') setOffline(true);
    else if (outcome === 'done') setOffline(false);
  }, []);
  /* 보낸 답은 누가 보냈든(이 화면 · 껍데기) 여기로 — 껍데기가 보낸 세트도 저장된 목록에 붙는다 */
  useEffect(
    () =>
      onSent((p, raw) => {
        if (p.sessionId !== sessionId) return;
        /* 보내는 사이 사람이 지운 세트 — 서버에 다시 생겼으니 한 번 더 지운다 */
        if (outbox.isDropped(p)) {
          void rpc<SetResult>('workout.deleteSet', { sessionId: p.sessionId, exerciseId: p.exerciseId, setNo: p.setNo }).then(
            (r) => !('error' in r) && setSaved(r.sets),
            () => undefined
          );
          return;
        }
        const res = raw as SetResult;
        if ('error' in res) setError(res.error);
        else setSaved(res.sets);
      }),
    [sessionId]
  );

  /* 다시 보내는 때: 화면을 열 때(지난번에 못 보낸 것), 앱으로 돌아왔을 때, 15초마다 */
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

  /* 운동을 옮기면 입력칸을 비우고 위로 올린다 */
  const goTo = (next: number, from: RunExercise[] = list) => {
    const i = Math.min(from.length - 1, Math.max(0, next));
    setAt(i);
    setWeight('');
    setCount('');
    setField(from[i].needsWeight ? 'weight' : 'count');
    setPad(false);
    setError(null);
    setEditing(null);
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  };

  /** 목록 순서를 바꾸거나 뺀다 — 보던 운동은 따라가고, 뺀 것이 보던 것이면 그 자리에 올라온 운동으로 */
  const applyOrder = async (ids: string[]) => {
    setListError(null);
    setBusy(true);
    let res: { ids: string[] } | { error: string };
    try {
      res = await rpc<{ ids: string[] } | { error: string }>('workout.reorderSession', ids, sessionId);
    } catch {
      setListError('신호가 없어 순서를 바꾸지 못했어요. 신호가 잡히면 다시 해 주세요.');
      return;
    } finally {
      setBusy(false);
    }
    if ('error' in res) return setListError(res.error);
    const byId = new Map(list.map((e) => [e.id, e]));
    const next = res.ids.flatMap((id) => {
      const found = byId.get(id);
      return found ? [found] : [];
    });
    if (next.length === 0) return;
    const found = next.findIndex((e) => e.id === ex.id);
    setList(next);
    if (found >= 0) setAt(found);
    else goTo(Math.min(at, next.length - 1), next);
  };

  /** 교체 창에서 운동을 넣었다 — 서버와 같은 규칙으로 목록을 고치고(placeExercise), 바꿨으면 그 자리 · 더했으면 더한 운동으로 */
  const applySwap = (added: RunExercise, mode: SwapMode) => {
    closeSheet();
    const next = placeExercise(list, ex.id, added, mode);
    if (!next) return;
    setList(next);
    const note = added.note;
    if (note) setNotes((prev) => ({ ...prev, [added.id]: note }));
    if (added.favorite) setFavorites((prev) => new Set(prev).add(added.id));
    goTo(mode === 'replace' ? at : at + 1, next);
  };

  /** ★ — 누르는 즉시 바꿔 보이고 뒤에서 저장한다. 원하는 상태를 보내므로 다시 눌러도 어긋나지 않는다. 못 했으면 되돌린다 */
  const toggleStar = async () => {
    const id = ex.id;
    const on = !favorites.has(id);
    const mark = (value: boolean) =>
      setFavorites((prev) => {
        const next = new Set(prev);
        if (value) next.add(id);
        else next.delete(id);
        return next;
      });
    setError(null);
    mark(on);
    tick();
    setStarring(true);
    try {
      const res = await rpc<{ favorite: boolean } | { error: string }>('favorite.setExerciseFavorite', id, on);
      if ('error' in res) {
        mark(!on);
        setError(res.error);
      }
    } catch {
      mark(!on);
      setError('신호가 없어 즐겨찾기를 바꾸지 못했어요. 신호가 잡히면 다시 눌러 주세요.');
    } finally {
      setStarring(false);
    }
  };

  /** 고치기를 마치거나 그만둔다 — 누르기 전에 넣고 있던 값을 되돌려 놓는다 */
  const endEdit = () => {
    if (!editing) return;
    setWeight(editing.draft.weight);
    setCount(editing.draft.count);
    setField(editing.draft.field);
    setEditing(null);
  };

  /** 완료한 세트 줄을 눌렀다 — 그 세트를 고친다. 한 번 더 누르면 그만둔다 */
  const startEdit = (t: ShownSet) => {
    setError(null);
    if (editing?.setNo === t.setNo) return endEdit();
    setEditing({ setNo: t.setNo, recordedAt: t.recordedAt, draft: editing?.draft ?? { weight, count, field } });
    setWeight(t.weightKg != null ? String(round1(toWeight(t.weightKg, wUnit))) : '');
    const raw = ex.isHold ? t.holdSeconds : t.reps;
    /* 분으로 받는 운동도 초로 남아 있다 — 분으로 바꿔 담는다 */
    const n = raw != null && ex.inMinutes ? Math.round(raw / 60) : raw;
    setCount(n != null ? String(n) : '');
    setPad(false);
  };

  /* 큰 단추 연타 — 입력 없는 운동은 빠른 두 탭이 세트 둘이 되고 마지막이면 둘째 탭이 마치기 창을 열었다. 0.45초 안의 둘째 탭은 버린다 */
  const lastTap = useRef(0);
  const tapOnce = (fn: () => void) => () => {
    const now = Date.now();
    if (now - lastTap.current < 450) return;
    lastTap.current = now;
    fn();
  };

  const noInput = NO_INPUT_CATEGORIES.has(ex.category);
  const countLabel = ex.inMinutes ? '분' : ex.isHold ? '초' : '회';

  const save = () => {
    setError(null);
    /* 적은 값은 고른 단위 — 저장은 kg, 소수 둘째 자리까지(135lb 가 134.9lb 로 돌아오지 않게) */
    const w = noInput ? null : weight === '' ? null : storedKg(fromWeight(Number(weight), wUnit));
    const n = noInput ? plannedAmount(ex) : count === '' ? null : Number(count);
    if (!noInput && ex.needsWeight && (w == null || w <= 0)) {
      setError('무게를 적어 주세요.');
      setField('weight');
      return;
    }
    if (n == null || n <= 0) {
      setError(ex.isHold ? `${timeLabel}을 적어 주세요.` : '횟수를 적어 주세요.');
      setField('count');
      return;
    }
    /* 서버가 받는 한도를 여기서 먼저 — 넘는 값은 폰에 담긴 뒤 서버가 거절해 그 세트가 사라졌다(웹과 같은 까닭) */
    const countLimit = ex.isHold ? (ex.inMinutes ? AMOUNT_LIMITS.holdSeconds / 60 : AMOUNT_LIMITS.holdSeconds) : AMOUNT_LIMITS.reps;
    if (n > countLimit) {
      setError(ex.isHold ? `${timeLabel}은 30분까지 적을 수 있어요.` : `횟수는 ${countLimit}회까지 적을 수 있어요.`);
      setField('count');
      return;
    }
    if (w != null && w > AMOUNT_LIMITS.weightKg) {
      setError(`무게는 ${formatWeight(AMOUNT_LIMITS.weightKg, wUnit)}까지 적을 수 있어요.`);
      setField('weight');
      return;
    }
    const fixing = editIndex >= 0 ? editing : null;
    /* 새 세트의 번호는 여기서 — 폰에만 있는 세트까지 세어야 안 겹치고, 번호를 함께 보내야 다시 보내도 한 줄로 남는다 */
    const setNo = fixing?.setNo ?? nextSetNo(mine.map((x) => x.setNo));
    if (setNo > AMOUNT_LIMITS.sets) return setError('세트가 너무 많아요.');
    /* 고칠 때는 '몇 개 더?' 답을 그대로 싣는다 — 안 보낸 답이 대기열에 있으면 새 값이 그 답을 덮어 잃는다 */
    const keptRir = fixing ? mine.find((x) => x.setNo === setNo)?.rir : undefined;
    const entry = {
      setNo,
      weightKg: w,
      reps: ex.isHold ? null : n,
      holdSeconds: ex.isHold ? (ex.inMinutes ? n * 60 : n) : null,
      ...(keptRir != null ? { rir: keptRir } : {}),
    };
    /* 이 세트로 지난 최고를 새로 넘었으면 성공 떨림(줄에 '새 최고'), 아니면 가볍게 톡 */
    const before = newRecord(ex, mine, ex.best);
    const after = newRecord(ex, [...mine.filter((m) => m.setNo !== setNo), entry], ex.best);
    const beatNow = after != null && after.setNo === setNo && (before == null || after.value > before.value);
    if (beatNow) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    else tick();

    /* 폰에 먼저 담는다 — 신호가 없어도 여기서 끝나고, 보내기는 뒤에서 */
    outbox.add({ sessionId, exerciseId: ex.id, ...entry, recordedAt: fixing?.recordedAt ?? new Date().toISOString() });
    /* 프로그램 날, 무게 추천 칸의 처방 마지막 세트 — 아래 자리가 '몇 개 더?' 물음으로 바뀐다 */
    if (!fixing && asksReserve(ex) && setNo === ex.plannedSets) setAskRir({ exerciseId: ex.id, setNo });
    if (fixing) endEdit();
    else {
      /* 무게는 남기고 횟수만 비운다 — 다음 세트도 대개 같은 무게다(방금 본인이 넣은 값) */
      setEditing(null);
      setCount('');
      setField('count');
    }
    setPad(false);
    void flush();
  };

  /** '몇 개 더?' 답 — 그 세트를 같은 번호로 다시 담아 붙인다. 건너뛰면 묻기만 닫는다(안 답한 것은 마치기 창이 모아 보인다) */
  const answerRir = (n: number | null) => {
    const q = askRir;
    setAskRir(null);
    if (!q || n == null) return;
    const t = sets.find((x) => x.exerciseId === q.exerciseId && x.setNo === q.setNo);
    if (!t) return;
    tick();
    outbox.add({
      sessionId,
      exerciseId: t.exerciseId,
      setNo: t.setNo,
      weightKg: t.weightKg,
      reps: t.reps,
      holdSeconds: t.holdSeconds,
      recordedAt: t.recordedAt,
      rir: n,
    });
    void flush();
  };

  /** '추천 95kg 담기' — 무게만(횟수는 본인이). 세트마다 목표가 다르면 그 세트의 무게와 횟수('+' 세트는 횟수를 본인이) */
  const fillSuggested = () => {
    if (suggestKg == null) return;
    setWeight(String(wUnit === 'lb' ? roundForDisplay(suggestKg, 'lb', weightKindOf(ex.equipment)) : suggestKg));
    if (target && !target.plus) setCount(String(target.reps));
    setError(null);
  };

  const drop = async (t: ShownSet) => {
    setError(null);
    if (editing?.setNo === t.setNo) endEdit();
    const key = { sessionId, exerciseId: t.exerciseId, setNo: t.setNo };
    /* 폰에 담긴 것부터 뺀다 — 빼지 않으면 뒤에서 보내져 되살아난다 */
    outbox.drop(key);
    if (!saved.some((x) => x.exerciseId === key.exerciseId && x.setNo === key.setNo)) {
      /*
       * 화면엔 폰에만 있던 세트 — 그래도 서버에 지우라고 한 번 보낸다(보내기는 됐는데 답만 못 받았거나 아직 가는 중일 수 있다, 서버 지우기는
       * 없으면 아무 일 없음). 신호가 없으면 조용히 넘긴다 — 폰에서는 이미 뺐다.
       */
      void rpc<SetResult>('workout.deleteSet', key).then(
        (res) => !('error' in res) && setSaved(res.sets),
        () => undefined
      );
      return;
    }
    setBusy(true);
    try {
      const res = await rpc<SetResult>('workout.deleteSet', key);
      if ('error' in res) setError(res.error);
      else setSaved(res.sets);
    } catch {
      setError('신호가 없어 지금은 지울 수 없어요. 신호가 잡히면 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const fillLast = () => {
    if (!ex.last) return;
    if (ex.last.weightKg != null) setWeight(String(round1(toWeight(ex.last.weightKg, wUnit))));
    const raw = ex.isHold ? ex.last.holdSecondsDone : ex.last.repsDone;
    const n = raw != null && ex.inMinutes ? Math.round(raw / 60) : raw;
    if (n != null) setCount(String(n));
    setError(null);
  };

  /* 어느 칸을 움직일지 인자로 받는다 — 상태로 읽으면 칸을 고른 그 누름에서는 아직 옛 칸이다 */
  const bump = (which: 'weight' | 'count', delta: number) => {
    setField(which);
    if (which === 'weight') {
      /* 폭은 단위를 따른다(kg 2.5 · lb 5), 추천이 있는 날의 덤벨 · 케틀벨은 한 손 2kg · 2.5lb(next-weight.ts) */
      const dumbbell = (ex.programSlot || ex.suggestedKg != null) && weightKindOf(ex.equipment) === 'dumbbell';
      const step = wUnit === 'lb' ? (dumbbell ? UNIT_LB.dumbbell : UNIT_LB.barbell) : dumbbell ? UNIT_KG.dumbbell : WEIGHT_STEP;
      const next = Math.max(0, (Number(weight) || 0) + delta * step);
      setWeight(next === 0 ? '' : String(Number(next.toFixed(1))));
    } else {
      const limit = ex.isHold ? (ex.inMinutes ? AMOUNT_LIMITS.holdSeconds / 60 : AMOUNT_LIMITS.holdSeconds) : AMOUNT_LIMITS.reps;
      /* 버티기는 5초씩, 분으로 받는 유산소와 횟수는 하나씩 */
      const step = ex.isHold && !ex.inMinutes ? 5 : 1;
      const next = Math.min(limit, Math.max(0, (Number(count) || 0) + delta * step));
      setCount(next === 0 ? '' : String(next));
    }
  };

  /* 마지막 운동의 처방 세트를 다 남겼으면 큰 단추가 [운동 종료](2026-10-12 사용자) */
  const allDone = at === list.length - 1 && editIndex < 0 && (ex.plannedSets ?? 1) > 0 && mine.length >= (ex.plannedSets ?? 1);
  const openFinish = () => {
    setFinishError(null);
    openSheet('finish');
    /* 못 보낸 세트가 있으면 지금 한 번 더 보내 본다 */
    void flush();
  };

  const finish = async (intensity: number | null, memo: string) => {
    setFinishError(null);
    setEnding(true);
    try {
      const res = await rpc<{ error: string } | null>('workout.finishWorkout', { sessionId, intensity, memo });
      /* 성공하면 서버가 축하 화면으로 보낸다(redirect) — 답이 그냥 오면 실패한 것 */
      if (res && 'error' in res) setFinishError(res.error);
      setEnding(false);
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        closeSheet();
        /*
         * 앞서 누른 마치기가 서버에선 됐는데 답만 못 받았으면, 다시 누를 때 판이 이미 닫혀 서버가 트레이닝으로 보낸다 — 그때도 마친 것이니
         * 축하 화면으로(이 판 번호로)
         */
        const to = e.to && !e.to.startsWith('/training') ? e.to : `/workout/done?id=${sessionId}`;
        /* 축하 화면은 앱 화면으로(판 7) — 이 화면을 바꿔서, 웹을 거치지 않고 */
        const doneId = /^\/workout\/done\?id=([\w-]+)/.exec(to)?.[1];
        if (doneId) return router.replace(`/workout-done?id=${doneId}` as Href);
        return leave(to);
      }
      setEnding(false);
      setFinishError('신호가 약해 마치지 못했어요. 신호가 잡히면 다시 눌러 주세요.');
    }
  };

  const fields = [
    { key: 'weight' as const, label: `무게${!ex.needsWeight ? ' (없으면 비워두세요)' : ''}`, value: weight, unit: wUnit },
    { key: 'count' as const, label: ex.isHold ? timeLabel : '횟수', value: count, unit: countLabel },
  ];
  const nextTitle = at < list.length - 1 ? list[at + 1].title : null;
  const bundle =
    (ex.programSlot?.group && (list[at - 1]?.restSeconds ?? Infinity) <= BUNDLE_SHORT_REST) ||
    (list[at + 1]?.programSlot?.group && (ex.restSeconds ?? Infinity) <= BUNDLE_SHORT_REST);
  const warmup = ex.programSlot?.slot === 'bigLower' && wUnit === 'kg' ? warmupLine(ex.setTargets?.[0]?.kg ?? ex.suggestedKg) : null;
  const shown = (kg: number) => (wUnit === 'lb' ? roundForDisplay(kg, 'lb', weightKindOf(ex.equipment)) : kg);

  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      {/* 옆으로 쓸어 닫기는 끈다 — 기구를 든 손이 화면 끝을 스쳐 운동 화면이 닫혔다. 나가기는 ✕ 로 */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      <KeyboardAvoidingView behavior="padding" style={s.fill}>
        {/* ─────────── 위: 보는 곳 ─────────── */}
        <View style={[s.header, { paddingTop: inset.top + 8, backgroundColor: c.card, borderBottomColor: c.line }]}>
          <Press onPress={() => leave(TRAINING_HOME_HREF)} accessibilityRole="button" accessibilityLabel="나가기" style={s.iconBtn}>
            <View style={[s.circle, { backgroundColor: c.chip }]}>
              <SymbolView name="xmark" size={14} weight="semibold" tintColor={c.muted} />
            </View>
          </Press>
          {/* 진행 막대 · 목록 단추 — 누르면 오늘 목록. 운동마다 한 칸이 세트를 남길수록 찬다 */}
          <Press onPress={() => openSheet('list')} accessibilityRole="button" accessibilityLabel="오늘 운동 목록 열기" style={s.progress}>
            <View style={[s.listPill, { backgroundColor: c.sky + '1f', flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
              {/* 웹 ListOrdered 그림 */}
              <SymbolView name="list.number" size={13} tintColor={c.sky} />
              <Text style={[s.smallBold, { color: c.sky }]}>
                목록 {at + 1}/{list.length}
              </Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text numberOfLines={1} style={[s.tiny, { color: c.muted }]}>
                {themeLabel}
              </Text>
              <View style={s.segments}>
                {list.map((item, i) => {
                  const n = setCounts.get(item.id) ?? 0;
                  const fill = n === 0 ? 0 : item.plannedSets ? Math.min(1, n / item.plannedSets) : 1;
                  return (
                    <View key={item.id} style={[s.segment, { backgroundColor: i === at ? c.sky + '40' : c.line }]}>
                      <View style={{ width: `${fill * 100}%`, height: '100%', backgroundColor: c.sky, borderRadius: 2 }} />
                    </View>
                  );
                })}
              </View>
            </View>
          </Press>
          <Press onPress={openFinish} disabled={ending} accessibilityRole="button" style={[s.endPill, { backgroundColor: c.chip }]}>
            <Text style={[s.smallBold, { color: c.ink }]}>{ending ? '정리 중' : '운동 종료'}</Text>
          </Press>
        </View>

        {/* 못 보낸 세트가 있을 때만 — 신호가 없다는 것과 세트는 안전하다는 것을 같이 말한다 */}
        {pending.length > 0 ? (
          <View accessibilityRole="alert" style={[s.banner, { backgroundColor: offline ? c.warnBg : c.chip, flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
            {/* 웹과 같은 구름 끊김 그림 · 주의색 — 잃은 것이 아니라 기다리는 것이라 빨강이 아니다 */}
            <SymbolView name="icloud.slash" size={16} tintColor={offline ? c.warn : c.muted} />
            <Text style={[s.small, { flex: 1, color: offline ? c.warn : c.muted }]}>
              {offline
                ? `신호가 없어요. 세트 ${pending.length}개를 폰에 저장해 두었고, 신호가 잡히면 저절로 보내요.`
                : `세트 ${pending.length}개 보내는 중…`}
            </Text>
          </View>
        ) : null}

        <ScrollView ref={scrollRef} style={s.fill} contentContainerStyle={[s.content, READABLE]} keyboardShouldPersistTaps="handled">
          <Text style={[s.smallBold, { color: c.muted }]}>{ex.category}</Text>
          <View style={s.titleRow}>
            <Text style={[s.title, { color: c.ink }]}>{ex.title}</Text>
            <Press
              onPress={() => void toggleStar()}
              disabled={starring}
              accessibilityRole="button"
              accessibilityState={{ selected: favorites.has(ex.id) }}
              accessibilityLabel={favorites.has(ex.id) ? '즐겨찾기에서 빼기' : '즐겨찾기에 담기'}
              style={s.iconBtn}
            >
              <SymbolView name={favorites.has(ex.id) ? 'star.fill' : 'star'} size={24} tintColor={favorites.has(ex.id) ? c.sky : c.muted} />
            </Press>
            {/* 세트를 남긴 운동이면 [추가] — 하던 운동은 두고 바로 뒤에 더한다 */}
            <Press onPress={() => openSheet('swap')} accessibilityRole="button" style={[s.chipBtn, { backgroundColor: c.card }]}>
              <Text style={[s.smallBold, { color: c.ink }]}>{mine.length > 0 ? '＋ 추가' : '⇄ 교체'}</Text>
            </Press>
          </View>
          {ex.prescription ? (
            <Text style={[s.body, { color: c.muted }]}>
              {ex.prescription}
              {ex.perSide ? ' (좌우 각각)' : ''}
            </Text>
          ) : null}
          {isOptionalProgramExercise(ex) ? (
            <View style={s.optional}>
              <Text style={[s.tag, { color: c.ink, backgroundColor: c.chip }]}>선택</Text>
              <Text style={[s.small, { color: c.muted, flex: 1 }]}>메디신볼을 못 던지면 건너뛰어도 돼요</Text>
              {at < list.length - 1 ? (
                <Press onPress={() => goTo(at + 1)} accessibilityRole="button" style={s.textBtn}>
                  <Text style={[s.smallBold, { color: c.sky }]}>건너뛰기</Text>
                </Press>
              ) : null}
            </View>
          ) : null}
          {warmup ? <Text style={[s.small, { color: c.muted }]}>{warmup}</Text> : null}
          {bundle ? <Text style={[s.small, { color: c.muted }]}>바로 이어서 · 한 세트씩 번갈아 해요</Text> : null}
          {target ? (
            <Text style={[s.bodyBold, { color: c.ink, marginTop: 4 }]}>
              이번 세트 · {target.reps}회{target.plus ? '+' : ''}
              {target.kg != null ? ` · ${shown(target.kg)}${wUnit}` : ''}
            </Text>
          ) : null}
          {ex.plannedSets != null && ex.plannedSets > 0 ? <SetDots planned={ex.plannedSets} done={mine.length} c={c} /> : null}

          {/* 내 메모 — 할 때마다 떠올려야 하는 것이라 이름 바로 밑에 */}
          <NoteBox
            exerciseId={ex.id}
            note={notes[ex.id] ?? null}
            onSaved={(id, note) =>
              setNotes((prev) => {
                const next = { ...prev };
                if (note) next[id] = note;
                else delete next[id];
                return next;
              })
            }
            c={c}
          />

          {/* 자세 · 영상과 내 기록 — 웹 session-client 와 같은 두 칸(자세 영상이 없는 운동은 내 기록 한 칸). 내 기록은 지금 판을 뺀 지난 기록 */}
          <View style={s.formRow}>
            {hasForm ? (
              <Press
                onPress={() => setShowForm((v) => !v)}
                accessibilityRole="button"
                accessibilityState={{ expanded: showForm }}
                style={[s.formBtn, { backgroundColor: c.card }]}
              >
                <Text style={[s.smallBold, { color: showForm ? c.sky : c.ink }]}>{showForm ? '자세 설명 접기' : 'ⓘ 자세·영상 보기'}</Text>
              </Press>
            ) : null}
            <Press
              onPress={() => setShowHistory((v) => !v)}
              accessibilityRole="button"
              accessibilityState={{ expanded: showHistory }}
              style={[s.formBtn, { backgroundColor: c.card }]}
            >
              <Text style={[s.smallBold, { color: showHistory ? c.sky : c.ink }]}>{showHistory ? '내 기록 접기' : '내 기록'}</Text>
            </Press>
          </View>
          {showForm && hasForm ? (
            <View style={[s.formBox, { backgroundColor: c.card, boxShadow: c.float }]}>
              {/* 운동마다 새 재생기 — 같은 자리라 앞 운동의 영상이 다음 운동에서도 돌지 않게. 웹 LibraryVideo 처럼 미리보기 그림 → 눌러 재생 */}
              <ExerciseMedia key={ex.id} path={ex.videoPath} referenceVideoId={ex.referenceVideoId} thumbUrl={ex.thumbUrl} aspectRatio={ex.aspectRatio} />
              {ex.description ? <Text style={[s.body, { color: c.ink }]}>{ex.description}</Text> : null}
            </View>
          ) : null}
          {showHistory ? (
            <View style={[s.formBox, { backgroundColor: c.card, boxShadow: c.float }]}>
              <HistoryPanel key={ex.id} exerciseId={ex.id} excludeSessionId={sessionId} unit={wUnit} c={c} />
            </View>
          ) : null}

          {ex.last ? (
            <Text style={[s.small, { color: c.muted, marginTop: 4 }]}>
              지난번 {ex.last.weightKg != null ? `${formatWeight(ex.last.weightKg, wUnit)} × ` : ''}
              {ex.isHold
                ? ex.last.holdSecondsDone != null
                  ? formatSeconds(ex.last.holdSecondsDone)
                  : '?'
                : `${ex.last.repsDone ?? '?'}회`}{' '}
              ({ex.last.date.slice(5).replace('-', '월 ')}일)
            </Text>
          ) : null}

          {/* 오늘 이 운동에서 남긴 세트 — 줄을 누르면 고치고, 오른쪽 휴지통은 지운다 */}
          <View style={{ marginTop: 16 }}>
            {mine.length === 0 ? (
              <Text style={[s.empty, { backgroundColor: c.card, color: c.muted }]}>첫 세트를 마치면 여기에 쌓여요.</Text>
            ) : (
              <View style={[s.setList, { backgroundColor: c.card, boxShadow: c.float }]}>
                {mine.map((x, i) => {
                  const fixingThis = i === editIndex;
                  return (
                    <View
                      key={x.setNo}
                      style={[
                        s.setRow,
                        i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null,
                        fixingThis ? { backgroundColor: c.sky + '14' } : null,
                      ]}
                    >
                      <Press
                        onPress={() => startEdit(x)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: fixingThis }}
                        accessibilityHint={fixingThis ? '고치는 중. 다시 누르면 그만둬요' : '눌러서 고치기'}
                        style={s.setMain}
                      >
                        <View style={[s.setNo, { backgroundColor: fixingThis ? c.sky : c.chip }]}>
                          <Text style={[s.tinyBold, { color: fixingThis ? '#fff' : c.muted }]}>{i + 1}</Text>
                        </View>
                        <Text numberOfLines={1} style={[s.setText, { color: c.ink }]}>
                          {x.weightKg != null ? `${formatWeight(x.weightKg, wUnit)} × ` : ''}
                          {x.holdSeconds != null ? formatSeconds(x.holdSeconds) : `${x.reps}회`}
                        </Text>
                        {record?.setNo === x.setNo ? <Text style={[s.badge, { backgroundColor: c.sky, color: '#fff' }]}>새 최고</Text> : null}
                        {x.rir != null ? (
                          <Text style={[s.badge, { backgroundColor: c.chip, color: c.muted }]}>여유 {x.rir >= 4 ? '4+' : x.rir}</Text>
                        ) : null}
                        {x.pending ? (
                          <View accessibilityLabel="아직 서버에 안 간 세트" style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                            <SymbolView name="icloud.slash" size={11} tintColor={c.warn} />
                            <Text style={[s.tinyBold, { color: c.warn }]}>대기</Text>
                          </View>
                        ) : null}
                        <Icon name="pencil" size={16} color={fixingThis ? c.sky : c.muted} />
                      </Press>
                      <Press
                        onPress={() => void drop(x)}
                        accessibilityRole="button"
                        accessibilityLabel={`${i + 1}세트 지우기`}
                        style={s.iconBtn}
                      >
                        <Icon name="trash2" size={18} color={c.muted} />
                      </Press>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

        {/* ─────────── 아래: 누르는 곳 ─────────── 자판이 떠 있는 동안은 감춘다(메모를 쓰는 중) */}
        {!keyboard ? (
          <View style={[s.bottom, { paddingBottom: Math.max(12, inset.bottom), paddingHorizontal: barSide, backgroundColor: c.card, borderTopColor: c.line }]}>
            {rest != null && !(pad && short) ? <RestPill seconds={rest} target={restTarget} c={c} /> : null}
            {error ? <Text style={[s.error, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error}</Text> : null}

            {askRir && askRir.exerciseId === ex.id && editIndex < 0 ? (
              <RirQuestion setNo={askRir.setNo} reserve={ex.programSlot?.reserve ?? null} onAnswer={answerRir} c={c} />
            ) : (
              <>
                {noInput && editIndex < 0 ? (
                  <Text style={[s.small, s.center, { color: c.muted }]}>
                    {ex.prescription ? `${ex.prescription} · ` : ''}숫자 없이 세트만 체크해요
                  </Text>
                ) : null}
                {/* 무게칸은 언제나 — 맨몸 운동도 덤벨 · 조끼를 쓰는 일이 흔하다. ± 는 자판 없이 2.5kg 만 올릴 때 */}
                {!noInput
                  ? fields.map((f) => (
                      <View key={f.key} style={s.fieldRow}>
                        <Pressable
                          onPress={() => bump(f.key, -1)}
                          accessibilityRole="button"
                          accessibilityLabel={`${f.label} 줄이기`}
                          style={({ pressed }) => [s.step, { backgroundColor: c.chip, opacity: pressed ? 0.6 : 1 }]}
                        >
                          <Text style={[s.stepText, { color: c.ink }]}>−</Text>
                        </Pressable>
                        <Press
                          onPress={() => {
                            setField(f.key);
                            setPad(true);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={`${f.label} ${f.value || '비어 있음'}`}
                          style={[
                            s.field,
                            { backgroundColor: pad && field === f.key ? c.sky + '1a' : c.chip },
                            pad && field === f.key ? { borderWidth: 2, borderColor: c.sky } : null,
                          ]}
                        >
                          <Text numberOfLines={1} style={[s.small, { color: c.muted, flexShrink: 1 }]}>
                            {f.label}
                          </Text>
                          <Text style={[s.fieldValue, { color: f.value === '' ? c.line : c.ink }]}>
                            {f.value === '' ? '—' : f.value}
                            <Text style={[TYPE.unit, { color: c.muted }]}> {f.unit}</Text>
                          </Text>
                        </Press>
                        <Pressable
                          onPress={() => bump(f.key, 1)}
                          accessibilityRole="button"
                          accessibilityLabel={`${f.label} 늘리기`}
                          style={({ pressed }) => [s.step, { backgroundColor: c.chip, opacity: pressed ? 0.6 : 1 }]}
                        >
                          <Text style={[s.stepText, { color: c.ink }]}>+</Text>
                        </Pressable>
                      </View>
                    ))
                  : null}

                {pad && !noInput ? (
                  <View style={[s.padBox, { backgroundColor: c.chip }]}>
                    <NumberPad
                      onChange={field === 'weight' ? setWeight : setCount}
                      allowDecimal={field === 'weight'}
                      keyHeight={short ? 40 : 48}
                      c={c}
                    />
                    {/* 다 넣었으면 — 무게면 다음 칸으로, 횟수까지 넣었으면 판을 접는다 */}
                    <Press
                      onPress={() => (field === 'weight' ? setField('count') : setPad(false))}
                      accessibilityRole="button"
                      style={[s.padOk, { height: short ? 40 : 48, backgroundColor: c.sky + '26' }]}
                    >
                      <Text style={[s.bodyBold, { color: c.sky }]}>
                        {field === 'weight' ? `다음 · ${ex.isHold ? timeLabel : '횟수'} →` : '확인'}
                      </Text>
                    </Press>
                  </View>
                ) : null}

                {!pad && !noInput ? (
                  editIndex >= 0 ? (
                    <View style={[s.editing, { backgroundColor: c.sky + '1a' }]}>
                      <Text style={[s.small, { color: c.sky, flex: 1 }]}>✎ {editIndex + 1}세트를 고치는 중이에요</Text>
                      <Press onPress={endEdit} accessibilityRole="button" style={s.textBtn}>
                        <Text style={[s.smallBold, { color: c.sky }]}>그만두기</Text>
                      </Press>
                    </View>
                  ) : suggestKg != null ? (
                    <View>
                      <Press onPress={fillSuggested} accessibilityRole="button" style={s.fillBtn}>
                        <Text style={[s.smallBold, { color: c.sky }]}>
                          ↺ 추천 {shown(suggestKg)}
                          {wUnit} 담기
                        </Text>
                      </Press>
                      {/* 자유 운동의 추천은 까닭 한 줄 — 왜 올랐는지(안 올랐는지) 보여야 믿고 담는다 */}
                      {ex.suggestNote ? <Text style={[s.tiny, s.center, { color: c.muted }]}>{ex.suggestNote}</Text> : null}
                    </View>
                  ) : ex.last ? (
                    <Press onPress={fillLast} accessibilityRole="button" style={s.fillBtn}>
                      <Text style={[s.smallBold, { color: c.sky }]}>↺ 지난번 그대로 담기</Text>
                    </Press>
                  ) : null
                ) : null}

                {/* 서버를 기다리지 않는다 — 폰에 담는 순간 끝난다 */}
                <Pressable
                  onPress={tapOnce(allDone ? openFinish : save)}
                  disabled={allDone && ending}
                  accessibilityRole="button"
                  style={({ pressed }) => [s.big, { height: pad && short ? 64 : 72, backgroundColor: c.sky, opacity: pressed ? 0.85 : 1 }]}
                >
                  <Text style={s.bigText}>
                    {editIndex >= 0 ? `✎ ${editIndex + 1}세트 고치기` : allDone ? '✓ 운동 종료' : `✓ ${mine.length + 1}세트 완료`}
                  </Text>
                </Pressable>
              </>
            )}

            {/* 숫자판이 열려 있으면 운동 이동은 감춘다 — 지금 할 일은 숫자 넣기다 */}
            {!pad ? (
              <View style={s.navRow}>
                <Press
                  onPress={() => goTo(at - 1)}
                  disabled={at === 0}
                  accessibilityRole="button"
                  style={[s.nav, { backgroundColor: c.chip, opacity: at === 0 ? 0.3 : 1 }]}
                >
                  <Text style={[s.smallBold, { color: c.ink }]}>‹ 이전 운동</Text>
                </Press>
                <Press
                  onPress={() => goTo(at + 1)}
                  disabled={nextTitle == null}
                  accessibilityRole="button"
                  style={[s.nav, { backgroundColor: c.chip, opacity: nextTitle == null ? 0.3 : 1 }]}
                >
                  {/* 다음이 무엇인지 이름까지 — 목록을 안 열어도 보이게 */}
                  <Text numberOfLines={1} style={[s.smallBold, { color: c.ink }]}>
                    {nextTitle ? `다음 · ${nextTitle} ›` : '다음 운동 ›'}
                  </Text>
                </Press>
              </View>
            ) : null}
          </View>
        ) : null}
      </KeyboardAvoidingView>

      <ListSheet
        key={`list-${sheet.n}`}
        open={sheet.which === 'list'}
        exercises={list}
        sets={sets}
        at={at}
        busy={busy}
        error={listError}
        onJump={(i) => {
          goTo(i);
          closeSheet();
        }}
        onApply={(ids) => void applyOrder(ids)}
        onClose={() => {
          closeSheet();
          setListError(null);
        }}
        c={c}
      />
      <SwapSheet
        key={`swap-${sheet.n}`}
        open={sheet.which === 'swap'}
        sessionId={sessionId}
        current={ex}
        /* 폰에만 있는 세트까지 센다 — 서버는 아직 모르는 세트다 */
        mode={mine.length > 0 ? 'add' : 'replace'}
        inPlanIds={list.map((e) => e.id)}
        onDone={applySwap}
        onClose={closeSheet}
        c={c}
      />
      <FinishSheet
        key={`finish-${sheet.n}`}
        open={sheet.which === 'finish'}
        sets={sets}
        startedAt={openedAt}
        priorSeconds={priorSeconds}
        pendingCount={pending.length}
        program={programFinish}
        busy={ending}
        error={finishError}
        onFinish={(i, m) => void finish(i, m)}
        onDropAndFinish={(i, m) =>
          Alert.alert('못 보낸 세트를 빼고 마칠까요?', `세트 ${pending.length}개는 기록에 남지 않아요. 되돌릴 수 없어요.`, [
            { text: '취소', style: 'cancel' },
            {
              text: '빼고 마치기',
              style: 'destructive',
              onPress: () => {
                for (const p of pending) outbox.drop(p);
                void finish(i, m);
              },
            },
          ])
        }
        onClose={() => {
          closeSheet();
          setFinishError(null);
        }}
        c={c}
      />
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 8,
    paddingBottom: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  progress: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  listPill: { height: 44, borderRadius: 22, paddingHorizontal: 14, justifyContent: 'center' },
  segments: { flexDirection: 'row', gap: 3, marginTop: 6 },
  segment: { flex: 1, height: 4, borderRadius: 2, overflow: 'hidden' },
  endPill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 14, justifyContent: 'center' },
  banner: { paddingHorizontal: 16, paddingVertical: 8 },
  content: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 24, gap: 2 },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 4, marginTop: 2 },
  title: { flex: 1, fontSize: 26, fontWeight: '700', lineHeight: 32, paddingTop: 4 },
  chipBtn: { marginTop: 4, minHeight: 40, borderRadius: 20, paddingHorizontal: 12, justifyContent: 'center' },
  optional: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
  tag: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  textBtn: { minHeight: 40, paddingHorizontal: 8, justifyContent: 'center' },
  formRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  formBtn: { flex: 1, minHeight: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  formBox: { marginTop: 8, borderRadius: 16, padding: 12, gap: 12 },
  empty: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, overflow: 'hidden' },
  setList: { borderRadius: 16, overflow: 'hidden' },
  setRow: { flexDirection: 'row', alignItems: 'center' },
  setMain: { flex: 1, minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 14, paddingVertical: 8 },
  setNo: { width: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  setText: { flex: 1, fontSize: 18, fontWeight: '600', fontVariant: ['tabular-nums'] },
  badge: { fontSize: 11, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, overflow: 'hidden' },
  bottom: { paddingHorizontal: 12, paddingTop: 12, gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  error: { fontSize: 13, textAlign: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, overflow: 'hidden' },
  fieldRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { width: 56, height: 56, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 26 },
  field: { flex: 1, height: 56, borderRadius: 16, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  fieldValue: { fontSize: 26, fontWeight: '600', fontVariant: ['tabular-nums'] },
  padBox: { borderRadius: 16, padding: 6, gap: 6 },
  padOk: { borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  editing: { flexDirection: 'row', alignItems: 'center', borderRadius: 12, paddingLeft: 14, paddingRight: 4 },
  fillBtn: { alignSelf: 'center', minHeight: 40, paddingHorizontal: 12, justifyContent: 'center' },
  big: { borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  bigText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  navRow: { flexDirection: 'row', gap: 8 },
  nav: { flex: 1, minHeight: 44, borderRadius: 22, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  pill: { minHeight: 44, borderRadius: 22, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  tiny: { fontSize: 11 },
  tinyBold: { fontSize: 11, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  center: { textAlign: 'center' },
});
