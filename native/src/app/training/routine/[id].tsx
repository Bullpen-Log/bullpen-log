import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  ActionSheetIOS,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, LinearTransition, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  MY_ROUTINE_MAX,
  MY_ROUTINE_MAX_ITEMS,
  MY_ROUTINE_NAME_MAX,
  MY_ROUTINE_SETS_MAX,
  MY_ROUTINE_SETS_MIN,
  normalizeRoutineInput,
  type MyRoutineItem,
} from '@/lib/armcare/my-routines';
import type { RoutineRefused, RoutineSaved } from '@/lib/armcare/my-routines-save';
import type { loadAppRoutine } from '@/app/actions/app-training-parts';
import type { RoutineBuilderData } from '@/lib/armcare/routine-builder-load';
import type { BuilderExercise } from '@/app/(app)/training/routine/[id]/routine-builder';
import { appendPicks, classifySaveFailure, newRoutineKey, openPicker, sameDraft, takePicks } from '~/armcare/routine-draft';
import { Bar, useLoad } from '~/community/parts';
import { useDraftGuard, type DraftGuardText } from '~/community/draft-guard';
import { act, leave } from '~/mechanics/parts';
import { RpcError, rpc } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Sheet } from '~/workout/sheets';
import { toast } from '~/shell/toast';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';

/**
 * 암케어 새 루틴 만들기 · 루틴 고치기(2026-10-31 시안 01) — 이름 · 담은 운동(세트 · 차례) · 운동 추가 · 아래 개수 · 예상 시간 · 저장.
 * 고르는 전체 목록은 이 화면에 펼치지 않고 운동 추가(./pick — 시안 02)로 연다. 초안은 이 화면 하나가 쥐고, 운동 추가는 [N개 담기]에서만
 * 고른 것을 넘긴다(~/armcare/routine-draft). 운동을 누르면 기존 운동 상세(읽기만 — 세트 · 저장은 바뀌지 않는다).
 *
 * 저장(서버 쓰기)은 [루틴 저장] 한 곳이다. 새 루틴은 이 초안을 열 때 정한 key 로 만든다(armcare.createMyArmcareRoutine — 같은 key 를 다시
 * 보내도 루틴은 하나). 답을 못 받으면(끊김 · 서버 오류 · 오래 걸림) '저장 결과 확인'으로 같은 key 의 같은 요청만 보낸다 — 새로 만들지 않는다.
 * 쓰지 않은 것이 확정된 거절(입력 · 한도 · 권한)만 '저장 실패'로 두고 고쳐서 다시 저장하게 한다.
 */
type Loaded = Awaited<ReturnType<typeof loadAppRoutine>>;
type Snapshot = { name: string; items: MyRoutineItem[] };
type Save =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'checking' }
  | { kind: 'failed'; error: string }
  | { kind: 'uncertain'; note: string }
  | { kind: 'saved' };

/** 내 루틴으로 — 보통은 암케어에서 열려 뒤로 가면 그 자리다. 주소로 바로 열려 뒤가 없으면 암케어를 연다 */
const backToArmcare = () => (router.canGoBack() ? router.back() : router.replace('/training-armcare' as Href));

/** 답을 이만큼 못 받으면 '저장 결과 확인'으로 — 보낸 요청은 그대로 두고, 늦게 와도 같은 시도의 결과로 받는다 */
const SAVE_WAIT_MS = 20_000;

export default function RoutineScreen() {
  const c = usePalette();
  const { id, add } = useLocalSearchParams<{ id: string; add?: string }>();
  const load = useLoad<Loaded>('app-training-parts.loadAppRoutine', id ?? null, add ?? null);
  const routine = load.data?.routine;
  const isNew = id === 'new';
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      {routine ? (
        <Builder data={routine} isNew={isNew} c={c} />
      ) : (
        <>
          <Bar back="암케어" onBack={backToArmcare} c={c} />
          {!load.data ? (
            load.error ? (
              /* 처음 받기 실패 — 빈 루틴처럼 보이지 않게 따로. 로그인 · 첫 설정은 useLoad 가 그 화면으로 보낸다 */
              <View style={st.center}>
                <Text style={[st.body, { color: c.ink, textAlign: 'center' }]}>루틴 정보를 불러오지 못했어요.</Text>
                <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>{load.error}</Text>
                <Press onPress={() => void load.reload()} accessibilityRole="button" style={[st.primary, { backgroundColor: c.action }]}>
                  <Text style={st.primaryText}>다시 불러오기</Text>
                </Press>
              </View>
            ) : (
              <Skeleton isNew={isNew} c={c} />
            )
          ) : (
            <View style={st.center}>
              <Text style={[st.body, { color: c.ink, textAlign: 'center' }]}>루틴을 찾을 수 없어요.</Text>
              <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>지워졌거나 다른 계정의 루틴이에요.</Text>
            </View>
          )}
        </>
      )}
    </KeyboardAvoidingView>
  );
}

/** 받는 중 — 이름 · 담은 운동 자리만(개수 · 시간은 아직 모른다고 보고 적지 않는다) */
function Skeleton({ isNew, c }: { isNew: boolean; c: Palette }) {
  return (
    <View accessibilityLabel="루틴 만들기 불러오는 중" style={[{ padding: 16, gap: 16 }, READABLE]}>
      <Text style={[st.title, { color: c.ink }]}>{isNew ? '새 루틴' : '루틴 고치기'}</Text>
      <View style={[st.input, { backgroundColor: c.card }]} />
      {[0, 1, 2].map((i) => (
        <View key={i} style={[st.card, { backgroundColor: c.card, height: 92 }]}>
          <View style={{ height: 14, width: '55%', borderRadius: 7, backgroundColor: c.chip }} />
          <View style={{ height: 12, width: '30%', borderRadius: 6, backgroundColor: c.chip }} />
        </View>
      ))}
    </View>
  );
}

function Builder({ data, isNew, c }: { data: RoutineBuilderData; isNew: boolean; c: Palette }) {
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  /* 이 초안의 번호 — 운동 추가와 주고받는 열쇠이자, 새 루틴이면 그 루틴의 id(같은 시도 key). 화면이 살아 있는 동안 그대로 */
  const [draftId] = useState(newRoutineKey);
  const [routineId, setRoutineId] = useState(data.id);
  /* 처음 받은 모습 — 미리 담긴 운동(add)도 여기 들어 있어 그것만으로는 '고친 것'이 아니다 */
  const [base, setBase] = useState<Snapshot>({ name: data.name, items: data.items });
  const [name, setName] = useState(data.name);
  const [items, setItems] = useState<MyRoutineItem[]>(data.items);
  /* 운동 추가가 넘긴 운동 정보 — 이 화면을 연 뒤 라이브러리에 생긴 운동도 이름 · 처방 · 시간을 안다 */
  const [picked, setPicked] = useState<ReadonlyMap<string, BuilderExercise>>(() => new Map());
  const [ordering, setOrdering] = useState(false);
  const [save, setSave] = useState<Save>({ kind: 'idle' });
  const [nameFocus, setNameFocus] = useState(false);
  const [setsFor, setSetsFor] = useState<string | null>(null);
  const [info, setInfo] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  /* 구성 판 번호 — 운동 추가가 연 때의 구성인지 본다 */
  const version = useRef(0);
  /* 지금 보낸 것 — 빠른 두 번 누름 막기(상태는 다음 그림까지 안 바뀐다) · 보낸 차례 · 보낸 모습 */
  const sending = useRef(false);
  const attempt = useRef(0);
  const submitted = useRef<Snapshot | null>(null);
  const done = useRef(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    []
  );
  /* 지금 초안(다듬은 이름) — 늦게 온 저장 답이 그사이 고친 것을 덮고 나가지 않게 견준다 */
  const latest = useRef<Snapshot>({ name, items });
  useEffect(() => {
    latest.current = { name: name.trim().replace(/\s+/g, ' '), items };
  });

  const byId = useMemo(() => {
    const m = new Map(data.exercises.map((e) => [e.view.id, e]));
    for (const [k, v] of picked) if (!m.has(k)) m.set(k, v);
    return m;
  }, [data.exercises, picked]);
  const locked = save.kind === 'saving' || save.kind === 'checking' || save.kind === 'uncertain';
  const busy = save.kind === 'saving' || save.kind === 'checking';
  const dirty = !sameDraft({ name, items }, base);
  const unknown = items.filter((it) => !byId.has(it.exerciseId));
  const clean = normalizeRoutineInput({ name, items });
  const nameLength = name.trim().replace(/\s+/g, ' ').length;
  const nameOver = nameLength > MY_ROUTINE_NAME_MAX;
  const atMax = items.length >= MY_ROUTINE_MAX_ITEMS;
  /* 예상 시간 — 서버가 만든 세트별 분(minutes[sets-1])의 합, 반올림은 예전과 같다. 운동이 없거나 정보를 모르는 운동이 있으면 적지 않는다 */
  const minutes =
    items.length > 0 && unknown.length === 0 ? Math.max(1, Math.round(items.reduce((sum, it) => sum + (byId.get(it.exerciseId)?.minutes[it.sets - 1] ?? 0), 0))) : null;
  const blocker = !clean.ok
    ? nameLength === 0
      ? '이름을 적어 주세요'
      : nameOver
        ? `이름은 ${MY_ROUTINE_NAME_MAX}자까지예요`
        : '운동을 담아 주세요'
    : unknown.length > 0
      ? '확인이 필요한 운동을 빼 주세요'
      : null;

  /* 나가기 — 고친 것이 있거나 저장 중 · 결과 확인 전이면 묻는다(‹ 뒤로 · 뒤로 쓸기가 같은 길). 저장이 확인된 뒤에만 풀린다 */
  const guard: DraftGuardText = busy
    ? { title: '저장하는 중이에요', message: '끝날 때까지 기다려 주세요.', stay: '확인' }
    : save.kind === 'uncertain'
      ? { title: '저장됐는지 아직 확인하지 못했어요', message: '나가면 이 초안은 사라져요. 저장됐다면 암케어의 내 루틴에 있어요.', stay: '계속 보기', leave: '나가기' }
      : { title: '저장하지 않은 루틴이 있어요', stay: '계속 만들기', leave: '저장하지 않고 나가기' };
  const allowLeave = useDraftGuard(save.kind !== 'saved' && (dirty || locked), guard);

  /* 운동 추가에서 [N개 담기]로 돌아왔을 때 한 번 — 연 때의 구성 · 같은 계정일 때만 뒤에 붙인다 */
  useFocusEffect(
    useCallback(() => {
      const got = takePicks(draftId, cacheEpoch());
      if (!got) return;
      if (got.version !== version.current) {
        setNotice('그사이 루틴 구성이 바뀌어 고른 운동을 담지 않았어요. 다시 골라 주세요.');
        return;
      }
      version.current += 1;
      setPicked((prev) => {
        const m = new Map(prev);
        for (const e of got.exercises) m.set(e.view.id, e);
        return m;
      });
      setItems((prev) => appendPicks(prev, got.picks));
      setNotice(null);
      setSave((s) => (s.kind === 'failed' ? { kind: 'idle' } : s));
      AccessibilityInfo.announceForAccessibility(`운동 ${got.picks.length}개를 담았어요`);
    }, [draftId])
  );

  /* 구성 고치기 — 초안만 바뀐다(서버에 쓰지 않는다). 저장 실패 안내는 고치면 걷는다 */
  const edit = (fn: (prev: MyRoutineItem[]) => MyRoutineItem[]) => {
    if (locked) return;
    version.current += 1;
    setItems(fn);
    setNotice(null);
    setSave((s) => (s.kind === 'failed' ? { kind: 'idle' } : s));
  };
  const move = (index: number, by: -1 | 1, title: string) => {
    const to = index + by;
    if (to < 0 || to >= items.length) return;
    void Haptics.selectionAsync();
    edit((prev) => {
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
    AccessibilityInfo.announceForAccessibility(`${title}, ${to + 1}번째`);
  };
  const setSets = (exerciseId: string, sets: number) =>
    edit((prev) => prev.map((it) => (it.exerciseId === exerciseId ? { ...it, sets: Math.min(MY_ROUTINE_SETS_MAX, Math.max(MY_ROUTINE_SETS_MIN, sets)) } : it)));
  const drop = (exerciseId: string) => {
    void Haptics.selectionAsync();
    edit((prev) => prev.filter((it) => it.exerciseId !== exerciseId));
  };

  const openDetail = (e: BuilderExercise, sets: number) =>
    router.push({
      pathname: '/library/exercise/[id]',
      params: { id: e.view.id, builder: 'edit', bname: routineId ? '루틴 고치기' : '새 루틴', bsets: String(sets) },
    } as Href);
  const openMore = (e: BuilderExercise) =>
    ActionSheetIOS.showActionSheetWithOptions(
      { title: e.view.title, options: ['운동 상세 보기', '운동 빼기', '취소'], destructiveButtonIndex: 1, cancelButtonIndex: 2 },
      (i) => {
        if (i === 0) openDetail(e, items.find((it) => it.exerciseId === e.view.id)?.sets ?? e.defaultSets);
        if (i === 1) drop(e.view.id);
      }
    );
  const openPick = () => {
    if (locked || atMax) return;
    openPicker(draftId, { epoch: cacheEpoch(), version: version.current, ids: items.map((it) => it.exerciseId) });
    router.push({ pathname: '/training/routine/pick', params: { draft: draftId } } as Href);
  };

  /* ── 저장 ── */
  const finish = (res: RoutineSaved) => {
    if (done.current || !alive.current) return;
    const sent = submitted.current;
    /*
     * 늦게 온 성공인데 그사이 초안을 고쳤거나(확정 실패 뒤), 같은 key 로 다른 모습이 먼저 저장돼 있었다(드묾) — 나가지 않고 그 루틴을 고치는
     * 초안으로 바꾼다. 저장된 모습이 기준이 되고, 고친 것은 그대로 남아 [고친 것 저장]으로 다시 보낸다.
     */
    if (sent && (!sameDraft(latest.current, sent) || (!routineId && !sameDraft(res, sent)))) {
      sending.current = false;
      setRoutineId(res.id);
      setBase({ name: res.name, items: res.items });
      setSave({ kind: 'failed', error: '앞서 보낸 내용으로 저장됐어요. 지금 내용으로 남기려면 다시 저장해 주세요.' });
      return;
    }
    done.current = true;
    sending.current = false;
    setBase({ name: res.name, items: res.items });
    setRoutineId(res.id);
    setSave({ kind: 'saved' });
    allowLeave();
    toast(routineId ? '루틴을 고쳤어요' : '루틴을 저장했어요');
    backToArmcare();
  };
  const send = (snap: Snapshot, checking: boolean) => {
    if (sending.current || done.current) return;
    sending.current = true;
    const n = ++attempt.current;
    setSave({ kind: checking ? 'checking' : 'saving' });
    const req = routineId
      ? rpc<RoutineSaved | RoutineRefused>('armcare.saveMyArmcareRoutine', { id: routineId, ...snap })
      : rpc<RoutineSaved | RoutineRefused>('armcare.createMyArmcareRoutine', { key: draftId, ...snap });
    let settled = false;
    const timer = setTimeout(() => {
      if (settled || !alive.current || n !== attempt.current) return;
      sending.current = false;
      setSave({ kind: 'uncertain', note: '서버 답이 늦어 저장됐는지 확인하지 못했어요.' });
    }, SAVE_WAIT_MS);
    req.then(
      (res) => {
        settled = true;
        clearTimeout(timer);
        /* 성공은 어느 차례의 답이든 같은 루틴이다(같은 key · 같은 루틴 id) */
        if ('ok' in res) return finish(res);
        if (n !== attempt.current || !alive.current || done.current) return;
        sending.current = false;
        setSave({ kind: 'failed', error: res.error });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      },
      (e: unknown) => {
        settled = true;
        clearTimeout(timer);
        if (n !== attempt.current || !alive.current || done.current) return;
        sending.current = false;
        const f = classifySaveFailure(e instanceof RpcError ? e.code : null);
        if (f.kind === 'uncertain') {
          setSave({
            kind: 'uncertain',
            note: checking
              ? '아직 확인하지 못했어요. 연결을 확인한 뒤 다시 눌러 주세요.'
              : f.code === 'offline'
                ? '신호가 약해 저장됐는지 확인하지 못했어요.'
                : '서버 답을 받지 못해 저장됐는지 확인하지 못했어요.',
          });
          return;
        }
        /* 부르기 전에 막힘 — 쓰지 않은 것이 확정. 로그인이 풀렸으면 로그인으로 */
        setSave({ kind: 'failed', error: f.code === 'update' ? '앱을 업데이트해 주세요.' : f.kind === 'login' ? '다시 로그인해 주세요.' : '지금은 저장할 수 없어요. 잠시 뒤 다시 저장해 주세요.' });
        if (f.kind === 'login' && e instanceof RpcError) leave(e.to ?? '/login');
      }
    );
  };
  const submit = () => {
    if (!clean.ok || unknown.length > 0 || locked) return;
    setOrdering(false);
    submitted.current = { name: clean.name, items: clean.items };
    send(submitted.current, false);
  };
  /* 결과 확인 — 보낸 그 모습 그대로 같은 요청을 다시(같은 key 라 이미 됐으면 그 루틴을 돌려받는다) */
  const check = () => {
    if (submitted.current) send(submitted.current, true);
  };
  const remove = () =>
    Alert.alert('이 루틴을 지울까요?', `${data.name} 루틴이 사라져요. 그동안 체크한 운동 기록은 그대로 남아요.`, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: async () => {
          if (sending.current || !routineId) return;
          sending.current = true;
          const res = await act<{ ok: true }>('armcare.deleteMyArmcareRoutine', routineId);
          sending.current = false;
          if ('error' in res) return setSave({ kind: 'failed', error: res.error });
          done.current = true;
          setSave({ kind: 'saved' });
          allowLeave();
          toast('루틴을 지웠어요');
          backToArmcare();
        },
      },
    ]);

  const title = routineId ? '루틴 고치기' : '새 루틴';
  const sheetEx = setsFor ? byId.get(setsFor) : undefined;
  const sheetSets = items.find((it) => it.exerciseId === setsFor)?.sets ?? 0;

  /* 내 루틴이 가득 — 새로 만들지 않고 내 루틴으로 돌아간다(있는 루틴은 건드리지 않는다). 고치기는 막지 않는다 */
  if (isNew && data.full && !routineId) {
    return (
      <>
        <Bar back="암케어" onBack={backToArmcare} c={c} />
        <View style={[{ padding: 16, gap: 16 }, READABLE]}>
          <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>
            새 루틴
          </Text>
          <View style={[st.banner, { backgroundColor: c.warnBg }]}>
            <Icon name="circle-alert" size={18} color={c.warn} />
            <Text style={[st.small, { color: c.ink, flex: 1 }]}>
              내 루틴은 {MY_ROUTINE_MAX}개까지 둘 수 있어요. 안 쓰는 루틴을 지우거나 있는 루틴을 고쳐 주세요.
            </Text>
          </View>
          <Press onPress={backToArmcare} accessibilityRole="button" style={[st.primary, { backgroundColor: c.action }]}>
            <Text style={st.primaryText}>내 루틴으로</Text>
          </Press>
        </View>
      </>
    );
  }

  return (
    <>
      <Bar
        back="암케어"
        onBack={backToArmcare}
        c={c}
        right={
          <Press onPress={() => setInfo(true)} hitSlop={6} accessibilityRole="button" accessibilityLabel="루틴 만들기 안내" style={st.iconBtn}>
            <Icon name="info" size={22} color={c.link} />
          </Press>
        }
      />
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 20, paddingBottom: 24 }, READABLE]}>
        <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>
          {title}
        </Text>

        {save.kind === 'uncertain' || save.kind === 'checking' ? (
          <View accessibilityLiveRegion="polite" style={[st.banner, { backgroundColor: c.warnBg }]}>
            <Icon name="circle-alert" size={18} color={c.warn} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[st.bold, { color: c.ink }]}>저장됐는지 확인하지 못했어요</Text>
              <Text style={[st.small, { color: c.muted }]}>
                {save.kind === 'checking' ? '같은 저장을 확인하는 중이에요.' : `${save.note} 다시 저장하기 전에 결과를 확인해 주세요.`}
              </Text>
            </View>
          </View>
        ) : null}

        <View style={{ gap: 6 }}>
          <View style={st.between}>
            <Text style={[st.label, { color: c.ink }]}>루틴 이름</Text>
            {nameFocus || nameOver ? (
              <Text style={[st.small, { color: nameOver ? c.danger : c.muted }]}>
                {nameLength}/{MY_ROUTINE_NAME_MAX}
              </Text>
            ) : null}
          </View>
          {/* 받은 글을 그대로 둔다(자르거나 다듬지 않는다) — 한글 조합 중에 글을 바꾸면 조합이 끊긴다. 길이는 저장 규칙과 같은 기준으로 알린다 */}
          <TextInput
            value={name}
            onChangeText={(v) => {
              setName(v);
              setSave((sv) => (sv.kind === 'failed' ? { kind: 'idle' } : sv));
            }}
            editable={!locked}
            onFocus={() => setNameFocus(true)}
            onBlur={() => setNameFocus(false)}
            placeholder="예: 투구 전 루틴"
            placeholderTextColor={c.muted}
            returnKeyType="done"
            accessibilityLabel="루틴 이름"
            style={[st.input, { backgroundColor: c.card, color: locked ? c.muted : c.ink }]}
          />
          {nameOver ? <Text style={[st.small, { color: c.danger }]}>루틴 이름은 {MY_ROUTINE_NAME_MAX}자까지예요.</Text> : null}
        </View>

        <View style={{ gap: 10 }}>
          <View style={st.between}>
            <Text accessibilityRole="header" style={[st.section, { color: c.ink }]}>
              담은 운동 <Text style={[st.small, { color: c.muted }]}>{items.length}개</Text>
            </Text>
            {items.length > 1 ? (
              <Press
                onPress={() => {
                  void Haptics.selectionAsync();
                  setOrdering((v) => !v);
                }}
                disabled={locked}
                accessibilityRole="button"
                style={st.textBtn}
              >
                <Text style={[st.bold, { color: locked ? c.muted : c.link }]}>{ordering ? '편집 완료' : '순서 편집'}</Text>
              </Press>
            ) : null}
          </View>
          {data.droppedHidden > 0 ? (
            <Text style={[st.small, { color: c.muted }]}>
              담아 둔 운동 중 {data.droppedHidden}개는 지금 볼 수 없어 뺐어요. 저장하면 빠진 구성으로 남아요.
            </Text>
          ) : null}
          {items.map((it, i) => {
            const e = byId.get(it.exerciseId);
            const no = String(i + 1).padStart(2, '0');
            if (!e) {
              return (
                <Animated.View key={it.exerciseId} layout={reduce ? undefined : LinearTransition.duration(170)} style={[st.card, { backgroundColor: c.chip }]}>
                  <View style={st.rowTop}>
                    <Text style={[st.no, { color: c.muted }]}>{no}</Text>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[st.bold, { color: c.ink }]}>운동 정보 확인 필요</Text>
                      <Text style={[st.small, { color: c.muted }]}>지금 담을 수 없거나 정보를 받지 못한 운동이에요.</Text>
                    </View>
                    <Press onPress={() => drop(it.exerciseId)} disabled={locked} accessibilityRole="button" accessibilityLabel={`${i + 1}번 확인이 필요한 운동 빼기`} style={st.textBtn}>
                      <Text style={[st.bold, { color: c.link }]}>빼기</Text>
                    </Press>
                  </View>
                </Animated.View>
              );
            }
            return (
              <Animated.View
                key={it.exerciseId}
                layout={reduce ? undefined : LinearTransition.duration(170)}
                style={[st.card, { backgroundColor: c.card, boxShadow: c.float, opacity: locked ? 0.7 : 1 }]}
              >
                <View style={st.rowTop}>
                  <View style={[st.noBox, { backgroundColor: c.chip }]}>
                    <Text style={[st.no, { color: c.muted }]}>{no}</Text>
                  </View>
                  <Press
                    onPress={() => openDetail(e, it.sets)}
                    disabled={locked}
                    accessibilityRole="button"
                    accessibilityLabel={`${i + 1}번 ${e.view.title}, 운동 상세 보기`}
                    style={{ flex: 1, minHeight: 44, justifyContent: 'center' }}
                  >
                    <Text style={[st.name, { color: c.ink }]}>{e.view.title}</Text>
                  </Press>
                  {!ordering ? (
                    <Press onPress={() => openMore(e)} disabled={locked} accessibilityRole="button" accessibilityLabel={`${e.view.title} 더보기`} style={st.iconBtn}>
                      <Icon name="ellipsis" size={20} color={c.muted} />
                    </Press>
                  ) : null}
                </View>
                <View style={st.rowBottom}>
                  <Text style={[st.small, { color: c.muted, flex: 1 }]}>{e.dose ?? '정해 둔 수행 안내가 없어요'}</Text>
                  <Press
                    onPress={() => setSetsFor(it.exerciseId)}
                    disabled={locked}
                    accessibilityRole="button"
                    accessibilityLabel={`${e.view.title} ${it.sets}세트, 세트 바꾸기`}
                    style={[st.setChip, { backgroundColor: c.skyTint }]}
                  >
                    <Text style={[st.bold, { color: c.link }]}>{it.sets}세트</Text>
                    <Icon name="chevron-down" size={14} color={c.link} />
                  </Press>
                </View>
                {ordering ? (
                  <Animated.View entering={reduce ? undefined : FadeIn.duration(150)} style={st.moveRow}>
                    <MoveBtn label="앞으로" icon="arrow-up" a11y={`${e.view.title} 앞으로`} disabled={i === 0 || locked} onPress={() => move(i, -1, e.view.title)} c={c} />
                    <MoveBtn label="뒤로" icon="arrow-down" a11y={`${e.view.title} 뒤로`} disabled={i === items.length - 1 || locked} onPress={() => move(i, 1, e.view.title)} c={c} />
                  </Animated.View>
                ) : null}
              </Animated.View>
            );
          })}
          {notice ? <Text style={[st.small, { color: c.warn }]}>{notice}</Text> : null}
          <Press
            onPress={openPick}
            disabled={locked || atMax}
            accessibilityRole="button"
            accessibilityHint={atMax ? `한 루틴에 ${MY_ROUTINE_MAX_ITEMS}개까지 담을 수 있어요` : undefined}
            style={[st.addBtn, { backgroundColor: items.length === 0 ? c.action : c.skyTint, opacity: locked || atMax ? 0.45 : 1 }]}
          >
            <Icon name="plus" size={18} color={items.length === 0 ? '#fff' : c.link} />
            <Text style={[st.addText, { color: items.length === 0 ? '#fff' : c.link }]}>운동 추가</Text>
          </Press>
          {atMax ? (
            <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>
              한 루틴에 {MY_ROUTINE_MAX_ITEMS}개까지 담을 수 있어요. 빼면 다시 추가할 수 있어요.
            </Text>
          ) : null}
        </View>

        {routineId && !isNew ? (
          <Press onPress={remove} disabled={locked} accessibilityRole="button" style={[st.textBtn, { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <Icon name="trash2" size={16} color={c.muted} />
            <Text style={[st.bold, { color: c.muted }]}>이 루틴 지우기</Text>
          </Press>
        ) : null}
      </ScrollView>

      {/* 아래 저장 줄 — 마지막 운동 · 운동 추가를 가리지 않게 목록 밖에 둔다(자판이 오르면 같이 오른다) */}
      <View style={[st.footer, { backgroundColor: c.card, borderTopColor: c.line, paddingBottom: Math.max(12, inset.bottom) }]}>
        {save.kind === 'failed' ? (
          <Text accessibilityLiveRegion="polite" style={[st.small, { color: c.danger }]}>
            저장하지 못했어요. {save.error}
          </Text>
        ) : null}
        <View style={st.footRow}>
          <Text style={[st.small, { color: c.muted, flex: 1 }]}>
            {blocker && !locked ? blocker : minutes != null ? `${items.length}개 · 약 ${minutes}분` : `${items.length}개`}
          </Text>
          {save.kind === 'uncertain' || save.kind === 'checking' ? (
            <Press onPress={check} disabled={busy} accessibilityRole="button" style={[st.saveBtn, { backgroundColor: c.action, opacity: busy ? 0.6 : 1 }]}>
              {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
              <Text style={st.primaryText}>{busy ? '확인하는 중' : '저장 결과 확인'}</Text>
            </Press>
          ) : (
            <Press
              onPress={submit}
              disabled={blocker != null || busy}
              accessibilityRole="button"
              accessibilityState={{ disabled: blocker != null || busy, busy }}
              style={[st.saveBtn, { backgroundColor: c.action, opacity: blocker != null || busy ? 0.45 : 1 }]}
            >
              {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
              <Text style={st.primaryText}>{busy ? '저장하는 중' : routineId ? '고친 것 저장' : '루틴 저장'}</Text>
            </Press>
          )}
        </View>
      </View>

      <Sheet fit open={sheetEx != null} onClose={() => setSetsFor(null)} title={sheetEx?.view.title ?? '세트'} description="세트 수를 골라요" c={c}>
        <View style={{ gap: 8 }}>
          {[1, 2, 3, 4, 5].map((n) => {
            const on = n === sheetSets;
            const m = sheetEx ? Math.max(1, Math.round(sheetEx.minutes[n - 1] ?? 0)) : null;
            return (
              <Press
                key={n}
                onPress={() => {
                  void Haptics.selectionAsync();
                  if (setsFor) setSets(setsFor, n);
                  setSetsFor(null);
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                style={[st.pickRow, { backgroundColor: on ? c.skyTint : c.card }]}
              >
                <Text style={[st.bold, { color: on ? c.link : c.ink, flex: 1 }]}>{n}세트</Text>
                {m != null ? <Text style={[st.small, { color: c.muted }]}>약 {m}분</Text> : null}
                {on ? <Icon name="check" size={18} color={c.link} /> : null}
              </Press>
            );
          })}
        </View>
      </Sheet>

      <Sheet fit open={info} onClose={() => setInfo(false)} title="루틴 만들기" c={c}>
        <View style={{ gap: 10 }}>
          <Text style={[st.body, { color: c.ink }]}>운동을 담고 세트와 순서를 정한 뒤 루틴 저장을 눌러요.</Text>
          <Text style={[st.body, { color: c.muted }]}>
            한 루틴에 운동 {MY_ROUTINE_MAX_ITEMS}개, 내 루틴은 {MY_ROUTINE_MAX}개까지 둘 수 있어요. 저장한 루틴은 암케어의 내 루틴에서 열어요.
          </Text>
        </View>
      </Sheet>
    </>
  );
}

function MoveBtn({
  label,
  icon,
  a11y,
  disabled,
  onPress,
  c,
}: {
  label: string;
  icon: 'arrow-up' | 'arrow-down';
  a11y: string;
  disabled: boolean;
  onPress: () => void;
  c: Palette;
}) {
  return (
    <Press
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      accessibilityState={{ disabled }}
      style={[st.moveBtn, { backgroundColor: c.chip, opacity: disabled ? 0.4 : 1 }]}
    >
      <Icon name={icon} size={15} color={c.ink} />
      <Text style={[st.bold, { color: c.ink }]}>{label}</Text>
    </Press>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 32, fontWeight: '700', lineHeight: 40 },
  section: { fontSize: 20, fontWeight: '700' },
  label: { fontSize: 15, fontWeight: '600' },
  body: { fontSize: 15, lineHeight: 22 },
  bold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 19 },
  name: { fontSize: 17, fontWeight: '600', lineHeight: 23 },
  no: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'] },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  center: { padding: 32, gap: 12, alignItems: 'center' },
  input: { minHeight: 52, borderRadius: 14, paddingHorizontal: 16, fontSize: 17 },
  card: { borderRadius: 18, padding: 12, gap: 8 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowBottom: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 42 },
  noBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  setChip: { minHeight: 44, minWidth: 84, borderRadius: 12, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 },
  moveRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8 },
  moveBtn: { minHeight: 44, borderRadius: 12, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  addBtn: { minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  addText: { fontSize: 17, fontWeight: '600' },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  textBtn: { minHeight: 44, paddingHorizontal: 8, justifyContent: 'center' },
  banner: { flexDirection: 'row', gap: 10, borderRadius: 14, padding: 14, alignItems: 'flex-start' },
  footer: { gap: 6, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  footRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  saveBtn: { minHeight: 48, borderRadius: 14, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primary: { minHeight: 48, borderRadius: 14, paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center', alignSelf: 'stretch' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  pickRow: { minHeight: 52, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10 },
});
