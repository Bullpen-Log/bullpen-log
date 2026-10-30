import { PracticeInput, emptyPractice, newRequestId, practiceError, practiceTouched, FEEL_LABEL, SKILL_TEXT, type PracticeForm } from '~/mechanics/practice-input';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { josa } from '@/lib/korean';
import {
  MECHANICS_FOLD_TEXT,
  isArmLoaded,
  isThrowingDrill,
  type DrillRecordSnapshot,
  type DrillThrowNote,
  type MechanicsFinishSummary,
  type levelAdvice,
} from '@/lib/mechanics/program';
import type { PlayerVariant, SessionDrillView } from '@/lib/mechanics/load';
import type { MechanicsPlay } from '@/lib/mechanics/play-load';
import { BullpenNative } from '../../modules/bullpen-native';
import { ExerciseMedia } from '~/armcare/parts';
import { Description, leave } from '~/mechanics/parts';
import { Action, DoneLoading, MechanicsDone, type DoneReason } from '~/mechanics/done';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE, useBarSide } from '~/lib/layout';
import { useLiveActivity } from '~/shell/live-activity';
import { Press } from '~/shell/press';
import { Sheet } from '~/workout/sheets';

/**
 * 메카닉 실행(앱 화면, 2026-10-31 확정 시안 02 → 완료 03) — 수행 → [드릴 마치기] → 기록 입력 → [드릴 기록 저장] → 저장 확인 → [다음 드릴] →
 * 필수를 다 저장하면 세션 마무리 → 완료 화면(~/mechanics/done). 무엇을 띄울지는 웹과 같은 곳(lib/mechanics/play-load.ts — 이 화면을 열 때 배정을
 * 고정하거나 같은 세션을 이어 연다).
 *
 * 쓰기는 셋이 따로다 — 드릴 기록 저장(recordMechanicsDrill: 요청 번호 · 같은 내용 영수증), 세션 마무리(finishMechanicsSession: 같은 세션 한 번),
 * 학습 단계 전환(이 화면에서는 하지 않는다). 응답을 잃으면 읽기 전용 조회(loadMechanicsDrillStatus · loadMechanicsFinish)로 먼저 확인하고,
 * 결과를 모르는 요청을 다른 내용으로 다시 보내지 않는다(확인하는 동안 입력을 잠근다). 암케어처럼 폰에 담아 뒤에 보내지 않는다 — 서버 저장 전에
 * 다음 드릴 · 진도로 넘어가지 않는다.
 */
type LoadResult = ({ ok: true } & MechanicsPlay) | { ok: false; to: string };
type FinishResult = {
  ok: true;
  status: 'completed' | 'partial';
  message: string | null;
  advice: ReturnType<typeof levelAdvice>;
  throwNote: DrillThrowNote | null;
  summary: MechanicsFinishSummary | null;
  replay?: boolean;
};
type DrillStatus = { status: 'saved'; record: DrillRecordSnapshot | null } | { status: 'missing' } | { status: 'stale' };
type FinishRead =
  | { status: 'completed'; summary: MechanicsFinishSummary }
  | { status: 'open'; saved: number; required: number; session: number }
  | { status: 'missing' };

export default function MechanicsPlayScreen() {
  const c = usePalette();
  const { anyway, from } = useLocalSearchParams<{ anyway?: string; from?: string }>();
  const [data, setData] = useState<MechanicsPlay | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  useEffect(() => {
    let alive = true;
    rpc<LoadResult>('app-mechanics.loadAppMechanicsPlay', anyway ?? null).then(
      (r) => {
        if (!alive) return;
        if (r.ok) {
          if (r.requirementsVersion !== 1 || typeof r.attemptId !== 'string' || !Array.isArray(r.doneGuideIds)) {
            setFailed('세션 업데이트를 적용하고 있어요. 잠시 뒤 다시 불러와 주세요.');
            return;
          }
          setData(r);
        } else leave(r.to);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setFailed(e instanceof RpcError && e.code === 'update' ? '앱을 업데이트해 주세요.' : '드릴 구성과 저장 상태를 확인할 수 없어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [anyway, tries]);

  if (data) return <Player key={data.attemptId} {...data} inApp={from === 'app'} c={c} />;
  return (
    <View style={[s.fill, s.centerBox, { backgroundColor: c.page, gap: 14 }]}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      {failed ? (
        <>
          <Text accessibilityRole="header" style={[s.bigTitle, { color: c.ink, textAlign: 'center' }]}>
            훈련을 불러오지{'\n'}못했어요
          </Text>
          <Text style={[s.body, { color: c.muted, textAlign: 'center' }]}>{failed}</Text>
          <Action
            label="다시 불러오기"
            onPress={() => {
              setFailed(null);
              setTries((n) => n + 1);
            }}
            c={c}
          />
          <Action label="닫기" onPress={() => router.back()} primary={false} c={c} />
        </>
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

/* ----------------------------- 고른 동작 · 도구 ----------------------------- */

type Choice = { alt: number; variantId: string };
type DrillChoiceView = { title: string; guideId: string; tool: string; variant: PlayerVariant; variants: PlayerVariant[] };

/** 지금 보이는 드릴 — 고른 동작 · 도구의 것(바꾸지 않았으면 세션이 고른 그대로). 후보는 서버가 배정한 칸의 것뿐 */
function viewOf(item: SessionDrillView, choice: Choice): DrillChoiceView {
  const alt = item.alternatives[choice.alt] ?? item.alternatives[0];
  const variants = alt?.variants ?? [{ ...item.variant, owned: true }];
  const variant = variants.find((v) => v.id === choice.variantId && v.owned) ?? variants.find((v) => v.owned) ?? variants[0];
  return { title: alt?.title ?? item.title, guideId: variant.id, tool: variant.tool, variant, variants };
}

/** 처방 글에 횟수가 있으면 그대로, 없으면 목표 미지정 — reps 0 을 '0회'로 보이지 않는다 */
const doseLabel = (dose: string) => (/\d+\s*회/.test(dose) ? dose : '목표 횟수 미지정');

const localDay = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'invalid'; message: string }
  | { kind: 'failed'; message: string }
  | { kind: 'unknown'; again?: boolean }
  | { kind: 'checking' }
  | { kind: 'missing' }
  | { kind: 'stale' };
type FinishState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'failed'; message: string }
  | { kind: 'unknown' }
  | { kind: 'checking' }
  | { kind: 'open' };

/** 응답이 없었던 것(신호 · 서버 오류)은 '결과 모름'으로 — 서버가 { error } 로 답한 거절과 가른다 */
const unknownFailure = (e: unknown) => !(e instanceof RpcError) || !['update', 'redirect', 'FEATURE_LOCKED_BETA'].includes(e.code);

/* ----------------------------- 본체 ----------------------------- */

function Player({
  backHref,
  items,
  startAt,
  label,
  attemptId,
  sessionNumber,
  doneGuideIds,
  records: initialRecords,
  partial,
  painLabel,
  inApp,
  c,
}: MechanicsPlay & { inApp: boolean; c: Palette }) {
  /* 앱 화면에서 열었으면 그냥 뒤로(그 화면이 다시 받는다) — 웹에서 넘어왔으면 웹을 돌아갈 칸으로 */
  const close = () => (inApp ? router.back() : leave(backHref));
  const inset = useSafeAreaInsets();
  const barSide = useBarSide(12);
  /* 늦게 온 응답이 떠난 화면 · 다른 계정을 덮지 않게 */
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const [done, setDone] = useState<boolean[]>(() => items.map((it) => doneGuideIds.includes(it.guideId)));
  /* 이 화면을 열 때 이미 저장돼 있던 칸 — 완료 화면의 '앞서 · 이번에' */
  const [openedSaved] = useState(() => items.filter((it) => doneGuideIds.includes(it.guideId)).length);
  const [records, setRecords] = useState<Record<number, DrillRecordSnapshot>>(() =>
    Object.fromEntries(
      items.flatMap((it, i) => {
        const r = initialRecords.find((x) => x.slot === it.guideId);
        return r ? [[i, r] as const] : [];
      })
    )
  );
  const requiredDone = (list: boolean[]) => items.some((it) => it.required !== false) && items.every((it, i) => it.required === false || list[i]);
  const [index, setIndex] = useState(startAt);
  const [phase, setPhase] = useState<'perform' | 'input' | 'saved'>(() => (doneGuideIds.includes(items[startAt]?.guideId) ? 'saved' : 'perform'));
  /* 필수를 다 저장했으면(앞서 저장하고 마무리 응답만 잃은 경우 포함) 다시 수행하지 않고 마무리부터 */
  const [atFinish, setAtFinish] = useState(() => requiredDone(items.map((it) => doneGuideIds.includes(it.guideId))));
  const [choices, setChoices] = useState<Choice[]>(() => items.map((it) => ({ alt: 0, variantId: it.guideId })));
  const [practice, setPractice] = useState<PracticeForm>(emptyPractice);
  const [save, setSave] = useState<SaveState>({ kind: 'idle' });
  const [justSaved, setJustSaved] = useState<number | null>(null);
  /* 통증을 기록했거나 서버가 제한을 알렸다 — 다음 드릴로 가지 않고 마무리 · 나가기만 */
  const [stop, setStop] = useState<{ reason: string; pain: boolean } | null>(null);
  const [setsDone, setSetsDone] = useState(0);
  const [fin, setFin] = useState<FinishState>({ kind: 'idle' });
  const [result, setResult] = useState<{ summary: MechanicsFinishSummary; replay: boolean } | null>(null);
  /* 완료는 확인됐는데 그 세션의 요약이 없다(이 판 앞에 마친 세션) — 추정해 그리지 않는다 */
  const [noDetail, setNoDetail] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [swapOpen, setSwapOpen] = useState(false);

  /* 같은 단추를 한 장면에 두 번 눌러도 요청은 하나 — 상태가 그려지기 전이라 ref 로 막는다 */
  const busy = useRef(false);
  const run = async (job: () => Promise<void>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await job();
    } finally {
      busy.current = false;
    }
  };

  const running = !result && !noDetail;
  useEffect(() => {
    void BullpenNative.keepAwake(running).catch(() => undefined);
  }, [running]);
  useEffect(() => () => void BullpenNative.keepAwake(false).catch(() => undefined), []);

  const scrollRef = useRef<ScrollViewInstance>(null);
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: 0, animated: false });
  }, [index, phase, atFinish]);

  const item = items[index];
  const view = viewOf(item, choices[index]);
  const savedCount = done.filter(Boolean).length;
  const allRequired = requiredDone(done);
  const after = (from: number) => {
    for (let k = 1; k < items.length; k++) {
      const j = (from + k) % items.length;
      if (!done[j]) return j;
    }
    return null;
  };
  const nextIndex = after(index);
  const blockedHere = !!stop && isArmLoaded(view.variant.category);

  const [openedMs] = useState(() => Date.now());
  useLiveActivity(
    !running || !item
      ? null
      : {
          kind: 'work',
          symbol: 'figure.baseball',
          label: '메카닉',
          title: view.title,
          detail: `드릴 ${index + 1}/${items.length} · 저장 ${savedCount}`,
          since: openedMs,
        }
  );

  /** 저장 전 입력이 지워지는 이동이면 먼저 묻는다 — 앞서 저장한 드릴은 그대로다 */
  const confirmDiscard = (then: () => void) => {
    if (phase === 'saved' || !practiceTouched(practice)) return then();
    Alert.alert('입력한 기록이 지워져요', '저장하지 않은 실제 횟수 · 강도 · 느낌이 지워져요. 앞서 저장한 드릴 기록은 그대로예요.', [
      { text: '취소', style: 'cancel' },
      { text: '지우고 이동', style: 'destructive', onPress: then },
    ]);
  };
  const goTo = (i: number) =>
    confirmDiscard(() => {
      setIndex(i);
      setPhase(done[i] ? 'saved' : 'perform');
      setPractice(emptyPractice());
      setSave({ kind: 'idle' });
      setSetsDone(0);
      setAtFinish(false);
      setListOpen(false);
    });

  /** 서버가 저장을 확인한 뒤에만 — 칸을 '저장됨'으로, 저장 확인 화면으로. 다음 드릴은 사람이 고른다 */
  const acknowledge = (at: number, form: PracticeForm, v: DrillChoiceView, it: SessionDrillView, stopReason: string | undefined, fromServer: DrillRecordSnapshot | null) => {
    const throws = isThrowingDrill(v.variant.category);
    const record: DrillRecordSnapshot = fromServer ?? {
      guideId: v.guideId,
      slot: it.guideId,
      title: v.title,
      tool: v.tool,
      category: v.variant.category,
      kind: throws ? 'throws' : 'repetitions',
      count: Number(form.count),
      effortPct: Number(form.effort),
      response: form.response ?? 'clear',
      feel: form.feel ?? 'ok',
      alreadyLogged: throws && form.alreadyLogged,
      ...(it.skill ? { skill: { quality: form.feel === 'hard' ? 'no' : (form.quality ?? 'unknown'), transferred: form.transferred ?? 'unknown' } } : {}),
      on: localDay(),
      savedAt: new Date().toISOString(),
    };
    setDone((d) => d.map((x, i) => (i === at ? true : x)));
    setRecords((r) => ({ ...r, [at]: record }));
    setSave({ kind: 'idle' });
    setPhase('saved');
    setJustSaved(at);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (record.response === 'pain') setStop({ pain: true, reason: '수행 중 통증을 기록했어요. 오늘 팔에 힘이 실리는 드릴은 멈추고, 통증이 이어지면 진료를 받아보세요.' });
    else if (stopReason) setStop({ pain: false, reason: stopReason });
  };

  const saveDrill = () =>
    run(async () => {
      const invalid = practiceError(practice, view.variant.category);
      if (invalid) {
        setSave({ kind: 'invalid', message: invalid });
        return;
      }
      const at = index;
      const form = practice;
      const v = view;
      const it = item;
      setSave({ kind: 'saving' });
      let res: { ok: true; stopReason?: string } | { error: string };
      try {
        res = await rpc('mechanics.recordMechanicsDrill', {
          attemptId,
          requestId: form.requestId,
          guideId: v.guideId,
          element: it.element,
          feel: form.feel,
          ...(it.skill ? { skill: { quality: form.quality ?? 'unknown', transferred: form.transferred ?? 'unknown' } } : {}),
          practice: {
            ...(isThrowingDrill(v.variant.category) ? { throws: Number(form.count) } : { reps: Number(form.count) }),
            effortPct: Number(form.effort),
            response: form.response,
            alreadyLogged: isThrowingDrill(v.variant.category) && form.alreadyLogged,
          },
        });
      } catch (e) {
        if (!alive.current) return;
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setSave(unknownFailure(e) ? { kind: 'unknown' } : { kind: 'failed', message: (e as Error).message });
        return;
      }
      if (!alive.current) return;
      if ('error' in res) setSave({ kind: 'failed', message: res.error });
      else acknowledge(at, form, v, it, res.stopReason, null);
    });

  /** 응답을 잃은 저장 — 같은 세션 · 같은 요청이 남았는지 읽기만 한다 */
  const checkSave = () =>
    run(async () => {
      const at = index;
      const form = practice;
      const v = view;
      const it = item;
      setSave({ kind: 'checking' });
      let r: DrillStatus;
      try {
        r = await rpc<DrillStatus>('mechanics.loadMechanicsDrillStatus', { attemptId, requestId: form.requestId });
      } catch (e) {
        if (!alive.current) return;
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setSave({ kind: 'unknown', again: true });
        return;
      }
      if (!alive.current) return;
      if (r.status === 'saved') acknowledge(at, form, v, it, undefined, r.record);
      else setSave({ kind: r.status });
    });

  const finish = () =>
    run(async () => {
      /* 한 드릴도 저장하지 않았으면 세지 않고 그냥 돌아간다 */
      if (!done.some(Boolean)) {
        close();
        return;
      }
      setFin({ kind: 'saving' });
      let res: FinishResult | { error: string };
      try {
        res = await rpc('mechanics.finishMechanicsSession', { partial, session: sessionNumber, attemptId });
      } catch (e) {
        if (!alive.current) return;
        if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
        setFin(unknownFailure(e) ? { kind: 'unknown' } : { kind: 'failed', message: (e as Error).message });
        return;
      }
      if (!alive.current) return;
      if ('error' in res) {
        setFin({ kind: 'failed', message: res.error });
        return;
      }
      setFin({ kind: 'idle' });
      if (!res.summary) return setNoDetail(true);
      setResult({ summary: res.summary, replay: !!res.replay });
    });

  /** 마무리 응답을 잃었다 — 같은 세션이 마쳐졌는지 읽기만 하고, 마쳐졌으면 그 요약만 보인다 */
  const checkFinish = () =>
    run(async () => {
      setFin({ kind: 'checking' });
      let r: FinishRead;
      try {
        r = await rpc<FinishRead>('mechanics.loadMechanicsFinish', { attemptId });
      } catch {
        if (alive.current) setFin({ kind: 'unknown' });
        return;
      }
      if (!alive.current) return;
      if (r.status === 'completed') {
        setFin({ kind: 'idle' });
        setResult({ summary: r.summary, replay: true });
      } else if (r.status === 'open') setFin({ kind: 'open' });
      else setFin({ kind: 'failed', message: '이 세션의 마무리 기록을 찾지 못했어요. 메카닉 화면에서 오늘 상태를 다시 확인해 주세요.' });
    });

  const askClose = () => {
    if ((phase !== 'saved' && practiceTouched(practice)) || save.kind === 'unknown' || save.kind === 'checking') {
      Alert.alert(
        '저장하지 않고 나갈까요?',
        save.kind === 'unknown' || save.kind === 'checking'
          ? '이 드릴 기록의 저장 결과를 아직 확인하지 못했어요. 앞서 저장한 드릴 기록은 그대로예요.'
          : '입력한 기록은 저장되지 않아요. 앞서 저장한 드릴 기록은 그대로예요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '나가기', style: 'destructive', onPress: close },
        ]
      );
      return;
    }
    if (done.some(Boolean) && fin.kind === 'idle' && !atFinish) {
      Alert.alert('오늘은 여기까지 할까요?', '저장한 드릴 기록은 그대로예요. 세션을 마치면 저장한 기록과 진도를 확인할 수 있어요.', [
        { text: '취소', style: 'cancel' },
        { text: '나가기', onPress: close },
        { text: '세션 마치기', onPress: () => (allRequired ? setAtFinish(true) : void finish()) },
      ]);
      return;
    }
    close();
  };

  const header = (
    <View style={[s.header, { paddingTop: inset.top + 6, backgroundColor: c.page }]}>
      <View style={s.headRow}>
        <Press onPress={askClose} accessibilityRole="button" accessibilityLabel="메카닉 실행 닫기" style={s.iconBtn}>
          <View style={[s.circle, { backgroundColor: c.chip }]}>
            <SymbolView name="xmark" size={14} weight="semibold" tintColor={c.muted} />
          </View>
        </Press>
        <Text style={[s.headTitle, { color: c.ink }]}>메카닉</Text>
        {/* 저장 · 확인 중에는 다른 드릴로 못 간다 — 늦게 온 응답이 다른 드릴 화면을 덮지 않게 */}
        <Press
          onPress={() => setListOpen(true)}
          disabled={save.kind === 'saving' || save.kind === 'checking' || fin.kind === 'saving' || fin.kind === 'checking'}
          accessibilityRole="button"
          accessibilityLabel="드릴 목록"
          style={s.iconBtn}
        >
          <View style={[s.circle, { backgroundColor: c.chip }]}>
            <SymbolView name="list.bullet" size={14} weight="semibold" tintColor={c.muted} />
          </View>
        </Press>
      </View>
      <View style={s.metaRow}>
        <Text numberOfLines={1} style={[s.small, { color: c.muted, flex: 1 }]}>
          {label}
        </Text>
        <Text style={[s.smallBold, { color: c.muted, fontVariant: ['tabular-nums'] }]} accessibilityLabel={`드릴 ${items.length}개 중 ${savedCount}개 저장`}>
          {atFinish ? `저장 ${savedCount} / ${items.length} 드릴` : `${index + 1} / ${items.length} 드릴`}
        </Text>
      </View>
      <View style={s.segments}>
        {items.map((it, i) => (
          <View key={it.guideId} style={[s.segment, { backgroundColor: done[i] ? c.sky : i === index && !atFinish ? c.sky + '55' : c.chip }]} />
        ))}
      </View>
    </View>
  );

  const shell = (body: ReactNode, bottom: ReactNode) => (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      {/* 옆으로 쓸어 닫기는 끈다 — 공을 든 손이 화면 끝을 스쳐 닫혔다. 나가기는 ✕(저장 전 입력이 있으면 묻는다) */}
      <Stack.Screen options={{ gestureEnabled: false }} />
      {header}
      <ScrollView ref={scrollRef} style={s.fill} keyboardShouldPersistTaps="handled" contentContainerStyle={[s.content, READABLE]}>
        {body}
      </ScrollView>
      <View style={[s.bottom, { paddingBottom: Math.max(12, inset.bottom), paddingHorizontal: barSide, backgroundColor: c.card, borderTopColor: c.line }]}>
        {bottom}
      </View>
      <ListSheet
        open={listOpen}
        items={items}
        done={done}
        index={index}
        onPick={goTo}
        onFinish={
          done.some(Boolean) && !result
            ? () => {
                setListOpen(false);
                if (allRequired) setAtFinish(true);
                else void finish();
              }
            : null
        }
        allRequired={allRequired}
        onClose={() => setListOpen(false)}
        c={c}
      />
      {swapOpen ? (
        <SwapSheet
          item={item}
          choice={choices[index]}
          onChoose={(next) =>
            confirmDiscard(() => {
              setChoices((list) => list.map((x, i) => (i === index ? next : x)));
              setPractice(emptyPractice());
              setSave({ kind: 'idle' });
              setSetsDone(0);
              setPhase('perform');
              setSwapOpen(false);
            })
          }
          onClose={() => setSwapOpen(false)}
          c={c}
        />
      ) : null}
    </View>
  );

  /* ----------------------------- 완료(03) ----------------------------- */
  if (result) {
    const resumable = result.summary.status === 'partial' && !stop && items.some((it, i) => it.required !== false && !done[i]);
    const reason: DoneReason = stop?.pain ? 'pain' : partial || stop ? 'restricted' : 'manual';
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <MechanicsDone
          summary={result.summary}
          mode="fresh"
          replay={result.replay}
          resumedFrom={openedSaved}
          reason={reason}
          onClose={close}
          onResume={
            resumable
              ? () => {
                  const first = items.findIndex((it, i) => it.required !== false && !done[i]);
                  setResult(null);
                  setAtFinish(false);
                  setIndex(first);
                  setPhase('perform');
                  setPractice(emptyPractice());
                  setSave({ kind: 'idle' });
                }
              : undefined
          }
          c={c}
        />
      </>
    );
  }
  if (noDetail)
    return (
      <>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <DoneLoading failed message="세션 완료는 확인됐어요. 이 세션의 드릴 상세는 남아 있지 않아 다시 계산하지 않아요." onClose={close} c={c} />
      </>
    );

  /* ----------------------------- 세션 마무리 ----------------------------- */
  if (atFinish) {
    const optionalLeft = items.findIndex((it, i) => it.required === false && !done[i]);
    const checking = fin.kind === 'unknown' || fin.kind === 'checking';
    return shell(
      <View style={{ gap: 16 }}>
        <View style={[s.card, { backgroundColor: c.card, boxShadow: c.floatHero, gap: 12 }]}>
          <View style={[s.solid, { backgroundColor: c.skyTint }]}>
            <SymbolView name="checkmark" size={22} weight="bold" tintColor={c.link} />
          </View>
          <Text accessibilityRole="header" style={[s.bigTitle, { color: c.ink }]}>
            세션을 마칠까요?
          </Text>
          <Text style={[s.bodyBold, { color: c.ink }]}>
            드릴 {savedCount} / {items.length}개 저장됨
          </Text>
          <Text style={[s.body, { color: c.muted }]}>드릴을 다시 수행하지 않고 마무리만 확인해요.</Text>
        </View>
        {fin.kind === 'failed' ? <Banner tone="danger" text={`${fin.message} 저장한 드릴 기록은 그대로예요.`} c={c} /> : null}
        {checking ? <Banner tone="warn" text="마무리 응답을 확인하지 못했어요. 다시 마치기 전에 세션 완료 여부부터 확인해요." c={c} /> : null}
        {fin.kind === 'open' ? <Banner tone="warn" text="아직 마무리 전이에요. 같은 세션의 마무리만 다시 확인해요." c={c} /> : null}
      </View>,
      <>
        {checking ? (
          <Action label={fin.kind === 'checking' ? '확인하는 중…' : '마무리 상태 확인'} onPress={() => void checkFinish()} disabled={fin.kind === 'checking'} c={c} />
        ) : (
          <Action
            label={fin.kind === 'saving' ? '마무리하는 중…' : fin.kind === 'failed' || fin.kind === 'open' ? '세션 마무리 다시 확인' : '세션 마치기'}
            onPress={() => void finish()}
            disabled={fin.kind === 'saving'}
            c={c}
          />
        )}
        {optionalLeft >= 0 && fin.kind === 'idle' ? (
          <Press onPress={() => goTo(optionalLeft)} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.link }]}>선택 드릴 이어서 하기</Text>
          </Press>
        ) : null}
      </>
    );
  }

  /* ----------------------------- 저장 확인 ----------------------------- */
  if (phase === 'saved') {
    const r = records[index] ?? null;
    return shell(
      <View style={{ gap: 14 }}>
        <View style={[s.card, { backgroundColor: c.card, boxShadow: c.floatHero, gap: 14 }]}>
          <SavedMark play={justSaved === index} c={c} />
          <View style={{ gap: 4 }}>
            <Text accessibilityRole="header" style={[s.bigTitle, { color: c.ink }]}>
              드릴 기록 저장됨
            </Text>
            <Text style={[s.body, { color: c.muted }]}>{r?.title ?? view.title}</Text>
          </View>
          {r ? (
            <>
              <View style={[s.grid, { borderTopColor: c.line }]}>
                <Stat label={r.kind === 'throws' ? '실제 투구' : '실제 반복'} value={`${r.count}${r.kind === 'throws' ? '구' : '회'}`} c={c} />
                <Stat label="체감 강도" value={`${r.effortPct}%`} c={c} />
              </View>
              <Row label="동작 느낌" value={FEEL_LABEL[r.feel]} c={c} />
              {r.response === 'pain' ? <Row label="수행 중 통증" value="있었어요" c={c} /> : null}
              {r.skill ? <Row label="동작 목표 유지" value={SKILL_TEXT[r.skill.quality]} c={c} /> : null}
              {r.skill && item.skill?.requiresTransfer ? <Row label="실제 투구 전이" value={SKILL_TEXT[r.skill.transferred]} c={c} /> : null}
              <Text style={[s.small, { color: c.muted }]}>오늘 이 드릴의 합계로 저장했어요.</Text>
            </>
          ) : (
            <Text style={[s.small, { color: c.muted }]}>이 드릴은 앞서 저장했어요. 기록 세부는 이 세션에 남아 있지 않아요.</Text>
          )}
        </View>
        {stop ? <Banner tone="warn" text={stop.reason} c={c} /> : nextIndex != null ? <Text style={[s.body, { color: c.muted }]}>다음 · {items[nextIndex].title}</Text> : null}
      </View>,
      stop ? (
        <>
          <Action label="세션 마치기" onPress={() => (allRequired ? setAtFinish(true) : void finish())} c={c} />
          <Press onPress={close} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.muted }]}>메카닉으로 돌아가기</Text>
          </Press>
        </>
      ) : nextIndex != null ? (
        <>
          <Action label="다음 드릴" onPress={() => goTo(nextIndex)} c={c} />
          {allRequired ? (
            <Press onPress={() => setAtFinish(true)} accessibilityRole="button" style={s.textBtn}>
              <Text style={[s.smallBold, { color: c.link }]}>선택 드릴은 두고 세션 마치기</Text>
            </Press>
          ) : null}
        </>
      ) : (
        <Action label="세션 마무리" onPress={() => setAtFinish(true)} c={c} />
      )
    );
  }

  /* ----------------------------- 기록 입력 ----------------------------- */
  if (phase === 'input') {
    const locked = save.kind === 'saving' || save.kind === 'unknown' || save.kind === 'checking' || save.kind === 'stale';
    return shell(
      <View style={{ gap: 16 }}>
        <DrillHead item={item} view={view} c={c} />
        <PracticeInput
          skill={item.skill}
          category={view.variant.category}
          value={practice}
          locked={locked}
          onChange={(patch) => {
            /* 고치면 새 의도 — 새 요청 번호. 결과를 모르는 동안은 잠겨 있어 여기 오지 않는다 */
            setPractice((p) => ({ ...p, ...patch, requestId: newRequestId() }));
            if (save.kind !== 'idle') setSave({ kind: 'idle' });
          }}
          c={c}
        />
        {save.kind === 'invalid' ? <Banner tone="danger" text={save.message} c={c} /> : null}
        {save.kind === 'failed' ? <Banner tone="danger" text={`${save.message} 입력한 내용은 그대로 있어요.`} c={c} /> : null}
        {save.kind === 'unknown' ? (
          <Banner
            tone="warn"
            text={
              save.again
                ? '아직 저장 상태를 확인하지 못했어요. 신호가 돌아오면 다시 확인해요. 입력한 내용은 그대로 있어요.'
                : '저장 요청의 응답을 확인하지 못했어요. 먼저 같은 기록의 저장 상태를 확인해요.'
            }
            c={c}
          />
        ) : null}
        {save.kind === 'missing' ? <Banner tone="warn" text="서버에 이 기록이 없는 걸 확인했어요. 같은 기록을 다시 저장할 수 있어요." c={c} /> : null}
        {save.kind === 'stale' ? <Banner tone="danger" text="이 세션이 바뀌었어요. 메카닉 화면에서 다시 열어 주세요. 이 기록은 저장되지 않았어요." c={c} /> : null}
      </View>,
      save.kind === 'stale' ? (
        <Action label="메카닉으로 돌아가기" onPress={close} c={c} />
      ) : save.kind === 'unknown' || save.kind === 'checking' ? (
        <>
          <Action label={save.kind === 'checking' ? '확인하는 중…' : '저장 상태 확인'} onPress={() => void checkSave()} disabled={save.kind === 'checking'} c={c} />
          <Press onPress={askClose} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.muted }]}>저장하지 않고 나가기</Text>
          </Press>
        </>
      ) : (
        <>
          <Action
            label={save.kind === 'saving' ? '저장하는 중…' : save.kind === 'failed' || save.kind === 'missing' ? '같은 기록 다시 저장' : '드릴 기록 저장'}
            onPress={() => void saveDrill()}
            disabled={save.kind === 'saving'}
            c={c}
          />
          <Press onPress={() => setPhase('perform')} disabled={save.kind === 'saving'} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.link }]}>동작 다시 보기</Text>
          </Press>
        </>
      )
    );
  }

  /* ----------------------------- 수행 ----------------------------- */
  const caution = painLabel != null && isArmLoaded(view.variant.category);
  const swappable = item.alternatives.length > 1 || view.variants.length > 1;
  return shell(
    <View style={{ gap: 16 }}>
      {caution ? <Banner tone="warn" text={MECHANICS_FOLD_TEXT.loadedDrill(painLabel)} c={c} /> : null}
      {blockedHere && stop ? <Banner tone="warn" text={stop.reason} c={c} /> : null}
      <DrillHead item={item} view={view} c={c} />
      {item.cue ? (
        <View style={[s.goal, { backgroundColor: c.skyTint }]}>
          <Text style={[s.smallBold, { color: c.link }]}>동작 목표</Text>
          <Text style={[s.bodyBold, { color: c.ink }]}>{item.cue}</Text>
        </View>
      ) : null}
      <ExerciseMedia
        key={`video-${view.guideId}`}
        compact
        path={view.variant.videoPath}
        referenceVideoId={view.variant.referenceVideoId}
        thumbUrl={view.variant.thumbUrl}
        aspectRatio={view.variant.aspectRatio}
        c={c}
      />
      <View style={s.linkRow}>
        <View style={{ flex: 1 }}>
          <Description key={`desc-${view.guideId}`} guideId={view.guideId} c={c} />
        </View>
      </View>
      {swappable ? (
        <Press onPress={() => setSwapOpen(true)} accessibilityRole="button" style={[s.swap, { backgroundColor: c.card, boxShadow: c.float }]}>
          <SymbolView name="arrow.triangle.2.circlepath" size={14} tintColor={c.link} />
          <Text style={[s.bodyBold, { color: c.link, flex: 1 }]}>드릴 · 도구 변경</Text>
          <Text style={[s.small, { color: c.muted }]}>{view.tool}</Text>
        </Press>
      ) : null}
      {!view.variant.owned ? (
        <Text style={[s.small, { color: c.muted }]}>이 도구는 오늘 사용 장비에 없어요. 있으면 그대로 해도 돼요.</Text>
      ) : item.gearNote?.replaced && choices[index].alt === 0 ? (
        <Text style={[s.small, { color: c.muted }]}>
          ‘{item.gearNote.replaced}’에는 {item.gearNote.need}
          {josa(item.gearNote.need, '이/가')} 있어야 해서 같은 단계의 이 드릴로 바꿨어요.
        </Text>
      ) : null}
      <View style={{ gap: 6 }}>
        <Text style={[s.small, { color: c.muted }]}>
          {doseLabel(item.dose)} · 실제 수행량은 마친 뒤 입력
        </Text>
        {/* 세트 체크는 수행 보조 — 실제 횟수 · 저장 · 진도를 대신하지 않는다. 세트가 둘 이상인 처방에서만 */}
        {(() => {
          const sets = item.sets ?? 1;
          if (sets < 2) return null;
          const counted = Math.min(setsDone, sets);
          return (
            <View accessibilityLabel="세트 체크, 수행 보조" style={s.setRow}>
              {Array.from({ length: sets }, (_, i) => {
                const on = i < counted;
                return (
                  <Press
                    key={i}
                    onPress={() => {
                      void Haptics.selectionAsync();
                      setSetsDone(counted === i + 1 ? i : i + 1);
                    }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[s.setBtn, on ? { borderColor: c.sky, backgroundColor: c.skyTint } : { borderColor: c.line }]}
                  >
                    <Text style={[s.smallBold, { color: on ? c.link : c.muted }]}>
                      {on ? '✓ ' : ''}
                      {i + 1}세트
                    </Text>
                  </Press>
                );
              })}
            </View>
          );
        })()}
      </View>
    </View>,
    <>
      <Action label="드릴 마치기" onPress={() => setPhase('input')} disabled={blockedHere} c={c} />
      {nextIndex != null ? (
        <Press onPress={() => goTo(nextIndex)} accessibilityRole="button" style={s.textBtn}>
          <Text style={[s.smallBold, { color: c.link }]}>이번 드릴 건너뛰기</Text>
        </Press>
      ) : done.some(Boolean) ? (
        <Press onPress={() => (allRequired ? setAtFinish(true) : void finish())} accessibilityRole="button" style={s.textBtn}>
          <Text style={[s.smallBold, { color: c.link }]}>건너뛰고 세션 마치기</Text>
        </Press>
      ) : (
        <Press onPress={askClose} accessibilityRole="button" style={s.textBtn}>
          <Text style={[s.smallBold, { color: c.muted }]}>오늘은 그만하기</Text>
        </Press>
      )}
    </>
  );
}

/** 드릴 머리 — 요소 · 단계 · 필수/선택 · 장비, 이름(줄바꿈). 색만으로 필수를 가르지 않게 글자로 */
function DrillHead({ item, view, c }: { item: SessionDrillView; view: DrillChoiceView; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={s.tags}>
        {item.rx ? <Text style={[s.tag, { color: c.onAction, backgroundColor: c.action }]}>처방 · {item.rx.element}</Text> : null}
        <Text style={[s.small, { color: c.muted }]}>
          {item.element} · {item.stage}
        </Text>
        <Text style={[s.tag, item.required === false ? { color: c.muted, backgroundColor: c.chip } : { color: c.link, backgroundColor: c.skyTint }]}>
          {item.required === false ? '선택' : '필수'}
        </Text>
        <Text style={[s.small, { color: c.muted }]}>{view.tool}</Text>
      </View>
      <Text accessibilityRole="header" style={[s.title, { color: c.ink }]}>
        {view.title}
      </Text>
    </View>
  );
}

function Stat({ label, value, c }: { label: string; value: string; c: Palette }) {
  return (
    <View style={{ flex: 1, gap: 2 }}>
      <Text style={[s.small, { color: c.muted }]}>{label}</Text>
      <Text style={[s.statValue, { color: c.ink }]}>{value}</Text>
    </View>
  );
}

function Row({ label, value, c }: { label: string; value: string; c: Palette }) {
  return (
    <View style={[s.kv, { borderBottomColor: c.line }]}>
      <Text style={[s.body, { color: c.muted, flex: 1 }]}>{label}</Text>
      <Text style={[s.bodyBold, { color: c.ink }]}>{value}</Text>
    </View>
  );
}

function Banner({ tone, text, c }: { tone: 'warn' | 'danger'; text: string; c: Palette }) {
  return (
    <View accessibilityRole="alert" style={[s.banner, { backgroundColor: tone === 'warn' ? c.warnBg : c.dangerBg }]}>
      <SymbolView name="exclamationmark.triangle.fill" size={14} tintColor={tone === 'warn' ? c.warn : c.danger} />
      <Text style={[s.small, { color: tone === 'warn' ? c.warn : c.danger, flex: 1, fontWeight: '600' }]}>{text}</Text>
    </View>
  );
}

/** 저장 확인의 작은 체크 — 방금 저장한 그 칸에서만 0.35초. 동작 줄이기면 제자리 */
function SavedMark({ play, c }: { play: boolean; c: Palette }) {
  const reduced = useReducedMotion();
  const scale = useSharedValue(play && !reduced ? 0.6 : 1);
  useEffect(() => {
    if (!play || reduced) return;
    scale.set(withSequence(withTiming(1.08, { duration: 220 }), withTiming(1, { duration: 130 })));
  }, [play, reduced, scale]);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  return (
    <Animated.View accessible accessibilityLabel="저장됨" style={[s.solid, { backgroundColor: c.sky, boxShadow: '0 8px 18px -8px rgba(0,112,201,0.6)' }, style]}>
      <SymbolView name="checkmark" size={22} weight="bold" tintColor="#fff" />
    </Animated.View>
  );
}

/** 드릴 목록 — 지금 · 저장됨 · 필수/선택. 다른 드릴로 가기, 저장한 드릴이 있으면 '오늘은 여기까지' */
function ListSheet({
  open,
  items,
  done,
  index,
  onPick,
  onFinish,
  allRequired,
  onClose,
  c,
}: {
  open: boolean;
  items: SessionDrillView[];
  done: boolean[];
  index: number;
  onPick: (i: number) => void;
  onFinish: (() => void) | null;
  allRequired: boolean;
  onClose: () => void;
  c: Palette;
}) {
  return (
    <Sheet fit open={open} onClose={onClose} title="오늘 드릴" description={`${items.length}개 중 ${done.filter(Boolean).length}개 저장`} c={c}>
      <View style={{ gap: 6 }}>
        {items.map((it, i) => (
          <Press
            key={it.guideId}
            onPress={() => onPick(i)}
            accessibilityRole="button"
            accessibilityState={{ selected: i === index }}
            style={[s.listRow, { backgroundColor: i === index ? c.skyTint : c.card }]}
          >
            <View style={[s.num, { backgroundColor: done[i] ? c.sky : c.chip }]}>
              {done[i] ? <SymbolView name="checkmark" size={11} weight="bold" tintColor="#fff" /> : <Text style={[s.smallBold, { color: c.muted }]}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.bodyBold, { color: c.ink }]}>{it.title}</Text>
              <Text style={[s.small, { color: c.muted }]}>
                {it.required === false ? '선택' : '필수'}
                {done[i] ? ' · 저장됨' : i === index ? ' · 지금' : ''}
              </Text>
            </View>
          </Press>
        ))}
        {onFinish ? (
          <Press onPress={onFinish} accessibilityRole="button" style={s.textBtn}>
            <Text style={[s.smallBold, { color: c.link }]}>{allRequired ? '세션 마무리로' : '오늘은 여기까지 · 세션 마치기'}</Text>
          </Press>
        ) : null}
      </View>
    </Sheet>
  );
}

/** 드릴 · 도구 변경 — 서버가 이 칸에 배정한 동작 · 도구 안에서만. 오늘 장비에 없는 도구는 점선으로 알린다 */
function SwapSheet({
  item,
  choice,
  onChoose,
  onClose,
  c,
}: {
  item: SessionDrillView;
  choice: Choice;
  onChoose: (next: Choice) => void;
  onClose: () => void;
  c: Palette;
}) {
  return (
    <Sheet fit open onClose={onClose} title="드릴 · 도구 변경" description="이 칸에 배정된 동작과 도구만 고를 수 있어요." c={c}>
      <View style={{ gap: 14 }}>
        {item.alternatives.map((a, ai) => (
          <View key={a.guideId} style={{ gap: 8 }}>
            <Text style={[s.bodyBold, { color: c.ink }]}>
              {a.title}
              {ai === 0 ? <Text style={[s.small, { color: c.muted }]}> · 배정</Text> : null}
            </Text>
            <View style={s.tools}>
              {a.variants.map((v) => {
                const on = choice.alt === ai && choice.variantId === v.id;
                return (
                  <Press
                    key={v.id}
                    onPress={() => onChoose({ alt: ai, variantId: v.id })}
                    accessibilityRole="radio"
                    accessibilityLabel={`${a.title} ${v.tool}${v.owned ? '' : ', 오늘 사용 장비에 없음'}`}
                    accessibilityState={{ checked: on }}
                    style={[
                      s.tool,
                      on
                        ? { backgroundColor: c.action, borderColor: c.action }
                        : v.owned
                          ? { backgroundColor: c.card, borderColor: c.line }
                          : { borderColor: c.line, borderStyle: 'dashed' },
                    ]}
                  >
                    <Text style={[s.bodyBold, { color: on ? c.onAction : v.owned ? c.ink : c.muted }]}>
                      {v.tool}
                      {v.owned ? '' : ' · 장비 없음'}
                    </Text>
                  </Press>
                );
              })}
            </View>
          </View>
        ))}
      </View>
    </Sheet>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1 },
  centerBox: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  header: { paddingHorizontal: 8, paddingBottom: 10, gap: 6 },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  segments: { flexDirection: 'row', gap: 4, paddingHorizontal: 10 },
  segment: { flex: 1, height: 5, borderRadius: 3 },
  content: { paddingHorizontal: 16, paddingTop: 8, paddingBottom: 24 },
  card: { borderRadius: 22, padding: 18 },
  solid: { width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  bigTitle: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  title: { fontSize: 26, fontWeight: '800', lineHeight: 32 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  tag: { fontSize: 13, fontWeight: '700', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  goal: { borderRadius: 18, padding: 16, gap: 4 },
  linkRow: { flexDirection: 'row', gap: 8 },
  swap: { minHeight: 48, borderRadius: 14, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  setRow: { flexDirection: 'row', gap: 8 },
  setBtn: { flex: 1, minHeight: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', gap: 12, borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 12 },
  statValue: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  kv: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  bottom: { paddingTop: 12, gap: 4, borderTopWidth: StyleSheet.hairlineWidth },
  textBtn: { minHeight: 44, alignSelf: 'center', paddingHorizontal: 12, justifyContent: 'center' },
  listRow: { minHeight: 56, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 12 },
  num: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  tools: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  tool: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, justifyContent: 'center' },
  small: { fontSize: 13, lineHeight: 19 },
  smallBold: { fontSize: 13, fontWeight: '600', lineHeight: 19 },
  body: { fontSize: 15, lineHeight: 22 },
  bodyBold: { fontSize: 16, fontWeight: '700', lineHeight: 22 },
});
