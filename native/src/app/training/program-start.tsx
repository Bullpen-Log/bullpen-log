import * as Haptics from 'expo-haptics';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  RECOMMENDED_EQUIPMENT,
  profileBlock,
  programChoiceList,
  programDef,
  sessionTitle,
  type PerWeek,
  type ProgramBlock,
  type VariantKey,
  type VariantKind,
} from '@/lib/program/program';
import { withJosa } from '@/lib/korean';
import type { TrainingToday } from '@/lib/report/training-today-data';
import { HowTo } from '~/armcare/parts';
import { act } from '~/mechanics/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { openCheckin } from '~/shell/web-nav';
import {
  clearStartDraft,
  conditionsKey,
  loadStartDraft,
  newRequestId,
  saveStartDraft,
  useTrainingToday,
  type PinPick,
  type StartDraft,
} from '~/training/program/data';
import { ageOf, birthText } from '~/training/today/program-start';
import { FlowBar, FooterActions, Outcome, type FooterAction } from '~/videos/flow-parts';
import { Sheet } from '~/workout/sheets';

/**
 * 프로그램 시작 — 시작 준비(시안 02) → 운동 구성 확인(03) → 최종 확인 · 등록(04)이 한 초안(~/training/program/data StartDraft)을 같이 고친다.
 *
 *   02 기존 정보는 다시 묻지 않는다 — 생년월일 · 경력은 비어 있을 때만. 장비는 매번 확인하되 전에 고른 것을 켜 둔다. 필수는 이유와 함께 막고, 권장은
 *      없어도 넘어간다. 그 밖의 장비도 모두 고를 수 있다.
 *   03 고정 운동 · 세션마다 바뀌는 운동(첫 운동) · 보조 운동을 가른다(서버 previewPinned 의 kind). 이름은 설명 · 영상, [바꾸기]는 후보. 조건이 바뀌면
 *      그대로 쓸 수 있는 것은 지키고 바뀐 칸만 알린다. 늦게 온 답은 새 고르기를 덮지 않는다.
 *   04 [프로그램 시작]은 등록이다 — 운동 판 · 세트 · 진도는 안 만든다. 요청 번호(requestId)로 보내 두 번 눌러도 · 답을 못 받아 다시 보내도 한 번만
 *      등록된다. 답을 못 받으면 같은 번호로 결과부터 묻는다(서버가 처리 중인 등록을 기다린 뒤 답한다). 서버가 다시 고른 구성이 확인한 것과 다르면 등록하지 않고
 *      바뀐 칸을 보인다. 등록 뒤 오늘 상태는 따로 읽고, 못 읽어도 등록은 끝난 것으로 둔다.
 */
type Step = 'prepare' | 'compose' | 'review' | 'result';
type ComposeItem = { variant: VariantKey; label: string; id: string | null; title: string | null; kind: VariantKind; sessions: string[] };
type Change = { variant: VariantKey; label: string; from: string | null; to: string | null };
type RegPhase = 'idle' | 'registering' | 'failed' | 'unknown' | 'checking' | 'unregistered' | 'conflict' | 'changed';

const KIND_TITLE: Record<VariantKind, string> = {
  main: '고정 주요 운동',
  rotating: '세션마다 바뀌는 운동',
  assist: '보조 운동',
};
const KIND_NOTE: Record<VariantKind, string> = {
  main: '4주 동안 같은 운동으로 무게를 올려요.',
  rotating: '고른 운동으로 시작해 세션마다 같은 칸의 다른 운동으로 돌아가요.',
  assist: '가진 장비에 맞춰 세션마다 정해요. 따로 고르지 않아요.',
};

export default function ProgramStartScreen() {
  const c = usePalette();
  const { id, perWeek: pwParam } = useLocalSearchParams<{ id: string; perWeek?: string }>();
  const { data, failed: todayFailed, reload } = useTrainingToday();
  const choice = programChoiceList().find((p) => p.id === id) ?? null;
  const def = choice ? programDef(choice.id) : null;
  const ps = data?.programStart ?? null;

  const [draft, setDraft] = useState<StartDraft | null>(null);
  const [step, setStep] = useState<Step>('prepare');
  const [items, setItems] = useState<ComposeItem[] | null>(null);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [changes, setChanges] = useState<Change[]>([]);
  const [phase, setPhase] = useState<RegPhase>('idle');
  const [regError, setRegError] = useState<string | null>(null);
  const [today, setToday] = useState<TrainingToday | null>(null);
  const [todayError, setTodayError] = useState(false);
  const [otherId, setOtherId] = useState<string | null>(null);
  const [swap, setSwap] = useState<ComposeItem | null>(null);
  const [info, setInfo] = useState<ComposeItem | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  /* 초안 — 폰에 있으면 그것, 없으면 서버가 아는 값으로 시작 */
  const choiceId = choice?.id ?? null;
  useEffect(() => {
    if (!choiceId) return;
    let on = true;
    void loadStartDraft(choiceId).then((d) => {
      if (!on || !d) return;
      setDraft((cur) => cur ?? d);
      if (d.pending && d.requestId) {
        setStep('review');
        setPhase('unknown');
      }
    });
    return () => {
      on = false;
    };
  }, [choiceId]);
  useEffect(() => {
    if (draft || !ps || !choice) return;
    const pw: PerWeek = pwParam === '2' && choice.perWeek.includes(2) ? 2 : choice.perWeek.includes(3) ? 3 : 2;
    const fresh: StartDraft = {
      perWeek: pw,
      birth: '',
      level: ps.level,
      owned: ps.owned.filter((e) => ps.equipment.includes(e)),
      pins: null,
      pinsFor: null,
      confirmed: false,
      requestId: null,
      pending: false,
    };
    queueMicrotask(() => setDraft((cur) => cur ?? fresh));
  }, [draft, ps, choice, pwParam]);

  const update = (patch: Partial<StartDraft>) =>
    setDraft((cur) => {
      if (!cur || !choice) return cur;
      const next = { ...cur, ...patch };
      saveStartDraft(choice.id, next);
      return next;
    });

  const registered = async () => {
    if (!choice) return;
    clearStartDraft(choice.id);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setPhase('idle');
    setStep('result');
    const fresh = await reload();
    if (!alive.current) return;
    if (fresh) {
      setToday(fresh);
      setTodayError(false);
    } else setTodayError(true);
  };

  /* 결과를 모르는 등록 — 같은 요청 번호로 결과부터(다시 등록하지 않는다) */
  const checkStatus = async () => {
    if (!draft?.requestId) return;
    setPhase('checking');
    try {
      const r = await rpc<
        { state: 'registered'; programId: string; perWeek: number } | { state: 'other'; programId: string | null; name: string } | { state: 'none' } | { error: string }
      >('program.loadProgramStartStatus', { requestId: draft.requestId });
      if (!alive.current) return;
      if ('error' in r) {
        setPhase('unknown');
        return;
      }
      if (r.state === 'registered') return registered();
      update({ pending: false });
      if (r.state === 'other') {
        setOtherId(r.programId);
        setPhase('conflict');
      } else setPhase('unregistered');
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return router.back();
      if (alive.current) setPhase('unknown');
    }
  };
  /* 결과를 모르는 채로 들어오면(앱을 다시 켬 · 답 유실) 한 번 저절로 묻는다 */
  const needsCheck = phase === 'unknown' && draft?.pending === true;
  const autoCheck = useEffectEvent(() => void checkStatus());
  useEffect(() => {
    if (needsCheck) queueMicrotask(autoCheck);
  }, [needsCheck]);

  /* 03 — 구성을 받는다. 지금 고른 것은 지키고(keep), 조건 때문에 못 쓰게 된 칸만 바뀐다. 마지막 요청의 답만 쓴다 */
  const gen = useRef(0);
  const loadCompose = async (d: StartDraft) => {
    if (!choice || !ps) return;
    const mine = ++gen.current;
    setComposeError(null);
    setItems(null);
    const before = d.pins;
    try {
      const r = await rpc<{ pinned: (ComposeItem & { equipment?: string[] })[] }>('program.previewPinned', {
        programId: choice.id,
        ownedEquipment: d.owned,
        trainingLevel: ps.level == null ? d.level : null,
        birthDate: ps.needBirth ? d.birth : null,
        perWeek: d.perWeek,
        keep: Object.fromEntries(Object.entries(before ?? {}).map(([v, p]) => [v, p?.id ?? null])),
      });
      if (mine !== gen.current || !alive.current) return;
      const list = r.pinned.map((x) => ({ ...x, kind: x.kind ?? 'main', sessions: x.sessions ?? [] }));
      setItems(list);
      const pins: Partial<Record<VariantKey, PinPick>> = {};
      for (const x of list) if (x.kind !== 'assist') pins[x.variant] = { id: x.id, title: x.title };
      /* 바뀐 칸 — 앞서 고른 것이 있을 때만(처음 받은 구성은 바뀐 것이 아니다) */
      const changed: Change[] = before
        ? list
            .filter((x) => x.kind !== 'assist' && before[x.variant] && (before[x.variant]?.id ?? null) !== x.id)
            .map((x) => ({ variant: x.variant, label: x.label, from: before[x.variant]?.title ?? null, to: x.title }))
        : [];
      setChanges(changed);
      update({ pins, pinsFor: conditionsKey(d), confirmed: false });
    } catch (e) {
      if (mine !== gen.current || !alive.current) return;
      if (e instanceof RpcError && e.code === 'redirect') return router.back();
      setComposeError('운동 구성을 불러오지 못했어요. 고른 것은 그대로예요.');
    }
  };

  const goCompose = () => {
    if (!draft) return;
    setStep('compose');
    void loadCompose(draft);
  };

  /* 04 — 등록 */
  const register = async () => {
    if (!draft || !choice || !ps || phase === 'registering' || phase === 'checking') return;
    const requestId = draft.requestId ?? newRequestId();
    update({ requestId, pending: true });
    setPhase('registering');
    setRegError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const r = await rpc<
        | { ok: true; programKey: string; same?: boolean }
        | { error: string; code?: 'changed' | 'exists' | 'busy'; changed?: Change[] }
      >('program.startProgram', {
        programId: choice.id,
        perWeek: draft.perWeek,
        birthDate: ps.needBirth ? draft.birth : null,
        trainingLevel: ps.level == null ? draft.level : null,
        ownedEquipment: draft.owned,
        pinned: Object.fromEntries(Object.entries(draft.pins ?? {}).map(([v, p]) => [v, p?.id ?? null])),
        requestId,
        confirm: true,
      });
      if (!alive.current) return;
      if ('ok' in r) return registered();
      update({ pending: false });
      if (r.code === 'changed') {
        setChanges(r.changed ?? []);
        setPhase('changed');
      } else if (r.code === 'exists') {
        const fresh = await reload();
        setOtherId(fresh?.programCard?.programId ?? null);
        setPhase('conflict');
      } else if (r.code === 'busy') {
        update({ pending: true });
        setPhase('unknown');
      } else {
        setRegError(r.error);
        setPhase('failed');
      }
    } catch (e) {
      if (!alive.current) return;
      if (e instanceof RpcError && e.code === 'redirect') return router.back();
      /* 서버가 등록했는데 답만 못 받았을 수 있다 — 같은 번호로 결과부터 */
      setPhase('unknown');
    }
  };

  /* ─────────── 그리기 ─────────── */

  if (!choice || !def) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <FlowBar title="시작 준비" onBack={() => router.back()} />
        <Text style={[st.body, { color: c.muted, padding: 24 }]}>지금은 시작할 수 없는 프로그램이에요.</Text>
      </View>
    );
  }
  if (!draft) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <FlowBar title="시작 준비" onBack={() => router.back()} />
        <View style={{ padding: 24, alignItems: 'center', gap: 12 }}>
          {todayFailed ? (
            <>
              <Text style={[st.body, { color: c.ink }]}>{todayFailed}</Text>
              <Press accessibilityRole="button" onPress={() => void reload()} style={st.inline}>
                <Text style={[st.bodyBold, { color: c.link }]}>다시 불러오기</Text>
              </Press>
            </>
          ) : data && !ps ? (
            <Text style={[st.body, { color: c.muted }]}>
              {data.programCard ? '이미 진행 중인 프로그램이 있어요.' : '오늘은 운동 일정을 이미 만들어서, 프로그램은 내일 시작할 수 있어요.'}
            </Text>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      </View>
    );
  }

  const audience = choice.audience;
  const needBirth = ps?.needBirth ?? false;
  const needLevel = ps ? ps.level == null : false;
  const birthAge = needBirth ? ageOf(draft.birth) : null;
  const birthBlock: ProgramBlock | null = needBirth && birthAge != null ? profileBlock({ audience, age: birthAge, trainingLevel: null }) : null;
  const levelBlock: ProgramBlock | null = needLevel && draft.level ? profileBlock({ audience, age: null, trainingLevel: draft.level, basicsDone: ps?.basicsDone }) : null;
  const required = choice.required;
  const missing = required.filter((e) => !draft.owned.includes(e));
  const recommended = audience === 'basics' ? [] : RECOMMENDED_EQUIPMENT.filter((e) => !required.includes(e));
  const others = (ps?.equipment ?? []).filter((e) => !required.includes(e) && !recommended.includes(e));
  const key = conditionsKey(draft);
  const composeFresh = draft.pins != null && draft.pinsFor === key;
  const totalDays = def.weeks * draft.perWeek;

  const toggleGear = (e: string) =>
    update({ owned: draft.owned.includes(e) ? draft.owned.filter((x) => x !== e) : [...draft.owned, e], confirmed: false });

  /* 단계마다 아래 단추 */
  let primary: FooterAction | null = null;
  let secondary: FooterAction | null = null;
  let note: string | null = null;
  let back = () => router.back();
  if (step === 'prepare') {
    const blockedNote = needBirth && birthAge == null
      ? '생년월일을 적어 주세요.'
      : birthBlock
        ? birthBlock.reason
        : needLevel && !draft.level
          ? '웨이트 경력을 골라 주세요.'
          : levelBlock
            ? levelBlock.reason
            : missing.length > 0
              ? `${withJosa(missing.join(' · '), '이/가')} 있어야 시작할 수 있어요.`
              : null;
    note = blockedNote;
    primary = { label: '운동 구성 확인', onPress: goCompose, disabled: blockedNote != null };
  } else if (step === 'compose') {
    back = () => setStep('prepare');
    primary = {
      label: '최종 확인',
      disabled: items == null || composeError != null,
      onPress: () => {
        update({ confirmed: true });
        setChanges([]);
        setStep('review');
      },
    };
  } else if (step === 'review') {
    back = () => (phase === 'registering' ? router.back() : setStep('compose'));
    if (phase === 'registering' || phase === 'checking') primary = { label: phase === 'checking' ? '결과 확인 중' : '등록 중', busy: true, onPress: () => undefined };
    else if (phase === 'unknown') primary = { label: '등록 결과 확인', onPress: () => void checkStatus() };
    else if (phase === 'conflict')
      primary = otherId
        ? { label: '진행 중 프로그램 보기', onPress: () => router.replace(`/training/program/${otherId}` as Href) }
        : { label: '트레이닝으로', onPress: () => router.back() };
    else if (phase === 'changed') primary = { label: '바뀐 구성 확인', onPress: goCompose };
    else if (!composeFresh || !draft.confirmed) primary = { label: '운동 구성 확인', onPress: goCompose };
    else {
      primary = { label: '프로그램 시작', onPress: () => void register() };
      note = '프로그램을 등록해요. 오늘 운동은 등록한 뒤 따로 시작해요.';
    }
    if (phase === 'failed') secondary = { label: '구성 다시 보기', onPress: goCompose };
  } else {
    /* 등록 뒤 — 오늘 상태에 맞는 다음 행동(운동 판은 여기서 안 연다) */
    const card = today?.programCard ?? null;
    back = () => router.back();
    if (todayError || !today) {
      primary = todayError ? { label: '오늘 운동 다시 불러오기', onPress: () => void registered() } : { label: '불러오는 중', busy: true, onPress: () => undefined };
      note = todayError ? '프로그램은 등록됐어요. 오늘 운동 정보만 다시 불러와요.' : null;
    } else if (card?.kind === 'needCheckin') {
      primary = { label: '체크인하기', onPress: () => openCheckin(`/training/program/${choice.id}`) };
      note = '체크인을 남기면 오늘 몸 상태에 맞춰 정해요.';
    } else if (card && card.kind === 'go' && card.todayState !== 'finished') {
      primary = { label: '오늘 운동 확인', onPress: () => router.replace('/training/program-today' as Href) };
    } else {
      primary = { label: '프로그램 보기', onPress: () => router.replace(`/training/program/${choice.id}` as Href) };
      note = card?.restText ?? (card?.kind === 'rest' ? '오늘은 쉬어요.' : null);
    }
  }

  const title = step === 'prepare' ? '시작 준비' : step === 'compose' ? '운동 구성 확인' : step === 'review' ? '최종 확인' : '프로그램 시작';

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <FlowBar title={title} onBack={back} backDisabled={phase === 'checking'} />
      <ScrollView keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 24 }, READABLE]}>
        {step !== 'result' ? (
          <View style={st.steps} accessibilityLabel={`${['prepare', 'compose', 'review'].indexOf(step) + 1} / 3단계`}>
            {(['prepare', 'compose', 'review'] as const).map((x, i) => (
              <View key={x} style={[st.stepDot, { backgroundColor: i <= ['prepare', 'compose', 'review'].indexOf(step) ? c.action : withAlpha(c.ink, 0.12) }]} />
            ))}
          </View>
        ) : null}

        {step === 'prepare' ? (
          <>
            <Text style={[st.title, { color: c.ink }]}>{choice.name}</Text>
            {needBirth ? (
              <View style={{ gap: 6 }}>
                <Text style={[st.section, { color: c.ink }]}>생년월일</Text>
                <TextInput
                  value={draft.birth}
                  onChangeText={(t) => update({ birth: birthText(t), confirmed: false })}
                  keyboardType="number-pad"
                  placeholder="2008-03-14"
                  placeholderTextColor={c.muted}
                  accessibilityLabel="생년월일"
                  style={[st.input, { backgroundColor: c.card, color: c.ink, borderColor: c.line }]}
                />
                {birthBlock ? <Blocked b={birthBlock} c={c} /> : <Text style={[st.small, { color: c.muted }]}>나이에 맞는 운동 · 처방을 고르는 데만 써요.</Text>}
              </View>
            ) : null}
            {needLevel ? (
              <View style={{ gap: 6 }}>
                <Text style={[st.section, { color: c.ink }]}>웨이트 경력</Text>
                {(ps?.levels ?? []).map((l) => (
                  <Press
                    key={l.name}
                    select
                    selected={draft.level === l.name}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: draft.level === l.name }}
                    onPress={() => update({ level: l.name, confirmed: false })}
                    style={[st.option, { backgroundColor: c.card, borderColor: draft.level === l.name ? c.action : 'transparent' }]}
                  >
                    <Text style={[st.bodyBold, { color: c.ink }]}>{l.name}</Text>
                    <Text style={[st.small, { flex: 1, textAlign: 'right', color: c.muted }]}>{l.desc}</Text>
                  </Press>
                ))}
                {levelBlock ? <Blocked b={levelBlock} c={c} /> : null}
              </View>
            ) : null}
            <View style={{ gap: 8 }}>
              <Text style={[st.section, { color: c.ink }]}>쓸 수 있는 장비</Text>
              <Text style={[st.small, { color: c.muted }]}>전에 고른 장비를 켜 뒀어요. 오늘 쓸 수 있는 것을 확인해 주세요.</Text>
              {required.length > 0 ? (
                <GearGroup title="꼭 필요해요" items={required} owned={draft.owned} onToggle={toggleGear} warn={missing} c={c} />
              ) : (
                <Text style={[st.small, { color: c.ink }]}>꼭 필요한 장비는 없어요. 맨몸으로 할 수 있어요.</Text>
              )}
              {recommended.length > 0 ? (
                <>
                  <GearGroup title="있으면 좋아요" items={recommended} owned={draft.owned} onToggle={toggleGear} c={c} />
                  {recommended.some((e) => !draft.owned.includes(e)) ? (
                    <Text style={[st.small, { color: c.muted }]}>권장 장비는 없어도 시작할 수 있어요. 그 칸은 비슷한 운동으로 바꿔 넣어요.</Text>
                  ) : null}
                </>
              ) : null}
              <OtherGear items={others} owned={draft.owned} onToggle={toggleGear} c={c} />
            </View>
          </>
        ) : null}

        {step === 'compose' ? (
          <>
            <View style={[st.box, { backgroundColor: c.card }]}>
              <Text style={[st.bodyBold, { color: c.ink }]}>
                {choice.name} · 주 {draft.perWeek}회 · {totalDays}세션
              </Text>
              <View style={st.rowBetween}>
                <Text style={[st.small, { flex: 1, color: c.muted }]} numberOfLines={2}>
                  장비 {draft.owned.length}개 · {draft.owned.join(' · ') || '맨몸'}
                </Text>
                <Press accessibilityRole="button" onPress={() => setStep('prepare')} style={st.inline}>
                  <Text style={[st.bodyBold, { color: c.link }]}>장비 수정</Text>
                </Press>
              </View>
            </View>
            {changes.length > 0 ? (
              <View style={[st.box, { backgroundColor: c.warnBg }]} accessibilityRole="alert">
                <Text style={[st.bodyBold, { color: c.ink }]}>조건이 바뀌어 운동 {changes.length}개가 달라졌어요</Text>
                {changes.map((x) => (
                  <Text key={x.variant} style={[st.small, { color: c.ink }]}>
                    {x.label} · {x.from ?? '없음'} → {x.to ?? '고를 운동 없음'}
                  </Text>
                ))}
                <Text style={[st.small, { color: c.muted }]}>그대로 쓸 수 있는 운동은 바꾸지 않았어요.</Text>
              </View>
            ) : null}
            {composeError ? (
              <View style={[st.box, { backgroundColor: c.danger + '14' }]}>
                <Text style={[st.small, { color: c.ink }]}>{composeError}</Text>
                <Press accessibilityRole="button" onPress={() => void loadCompose(draft)} style={st.inline}>
                  <Text style={[st.bodyBold, { color: c.link }]}>다시 불러오기</Text>
                </Press>
              </View>
            ) : items == null ? (
              <View style={{ alignItems: 'center', gap: 8, paddingVertical: 24 }}>
                <ActivityIndicator />
                <Text style={[st.small, { color: c.muted }]}>장비와 경력에 맞춰 고르는 중이에요</Text>
              </View>
            ) : (
              (['main', 'rotating', 'assist'] as const).map((kind) => {
                const group = items.filter((x) => x.kind === kind);
                if (group.length === 0) return null;
                return (
                  <View key={kind} style={{ gap: 6 }}>
                    <Text style={[st.section, { color: c.ink }]}>{KIND_TITLE[kind]}</Text>
                    <Text style={[st.small, { color: c.muted }]}>{KIND_NOTE[kind]}</Text>
                    <View style={[st.list, { backgroundColor: c.card, boxShadow: c.float }]}>
                      {group.map((x, i) => {
                        const pin = draft.pins?.[x.variant];
                        const shown = kind === 'assist' ? null : (pin?.title ?? x.title);
                        return (
                          <View key={x.variant} style={[st.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                            <Press
                              accessibilityRole="button"
                              accessibilityHint={shown ? '설명 · 영상 보기' : undefined}
                              disabled={!shown || !(pin?.id ?? x.id)}
                              onPress={() => setInfo({ ...x, id: pin?.id ?? x.id, title: shown })}
                              style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 10 }}
                            >
                              <Text style={[st.small, { color: c.muted }]}>
                                {x.label}
                                {kind === 'rotating' ? ' · 첫 운동' : ''}
                                {x.sessions.length > 0 ? ` · ${x.sessions.join(', ')}` : ''}
                              </Text>
                              <Text style={[st.bodyBold, { color: shown ? c.ink : c.muted }]}>
                                {kind === 'assist' ? '세션마다 정해요' : (shown ?? '가진 장비로 할 운동이 없어요')}
                              </Text>
                            </Press>
                            {kind !== 'assist' ? (
                              <Press accessibilityRole="button" accessibilityLabel={`${x.label} 바꾸기`} onPress={() => setSwap(x)} style={st.inline}>
                                <Text style={[st.bodyBold, { color: c.link }]}>바꾸기</Text>
                              </Press>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </>
        ) : null}

        {step === 'review' ? (
          <>
            {phase === 'registering' || phase === 'checking' ? (
              <Outcome icon="check" busy title={phase === 'checking' ? '등록 결과를 확인하고 있어요' : '프로그램을 등록하고 있어요'} text="화면을 나가도 등록은 계속돼요. 다시 와서 결과를 볼 수 있어요." />
            ) : phase === 'unknown' ? (
              <Outcome icon="circle-alert" tone="warn" title="등록 결과 확인 필요" text="응답을 받지 못했어요. 같은 요청으로 결과를 확인한 뒤에만 다시 보내요. 고른 내용은 그대로예요." />
            ) : phase === 'unregistered' ? (
              <Outcome icon="info" tone="warn" title="등록되지 않았어요" text="서버에 등록된 프로그램이 없어요. 고른 내용 그대로 다시 시작할 수 있어요." />
            ) : phase === 'conflict' ? (
              <Outcome icon="circle-alert" tone="warn" title="다른 프로그램이 진행 중이에요" text="진행 중인 프로그램을 그대로 두었어요. 바꾸려면 그 프로그램을 먼저 그만둬요." />
            ) : phase === 'changed' ? (
              <Outcome icon="circle-alert" tone="warn" title="운동 구성이 바뀌었어요" text="확인한 구성과 지금 조건으로 고른 구성이 달라 등록하지 않았어요.">
                {changes.map((x) => (
                  <Text key={x.variant} style={[st.small, { color: c.ink }]}>
                    {x.label} · {x.from ?? '없음'} → {x.to ?? '고를 운동 없음'}
                  </Text>
                ))}
              </Outcome>
            ) : phase === 'failed' ? (
              <Outcome icon="circle-alert" tone="danger" title="등록하지 못했어요" text={regError ?? '다시 시도해 주세요.'} />
            ) : null}
            {phase === 'idle' || phase === 'failed' || phase === 'unregistered' ? (
              <View style={[st.list, { backgroundColor: c.card, boxShadow: c.float }]}>
                <ReviewRow label="기간" value={`${def.weeks}주`} c={c} />
                <View style={[st.item, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                  <Text style={[st.small, { width: 72, color: c.muted }]}>주당 횟수</Text>
                  {choice.perWeek.length > 1 ? (
                    <View style={{ flexDirection: 'row', gap: 6, flex: 1 }}>
                      {choice.perWeek.map((n) => (
                        <Press
                          key={n}
                          select
                          selected={draft.perWeek === n}
                          accessibilityRole="radio"
                          accessibilityState={{ selected: draft.perWeek === n }}
                          onPress={() => n !== draft.perWeek && update({ perWeek: n, confirmed: false })}
                          style={[st.chip, { backgroundColor: draft.perWeek === n ? c.action : c.chip }]}
                        >
                          <Text style={{ color: draft.perWeek === n ? c.onAction : c.ink, fontWeight: '600' }}>주 {n}회</Text>
                        </Press>
                      ))}
                    </View>
                  ) : (
                    <Text style={[st.bodyBold, { color: c.ink }]}>주 {draft.perWeek}회</Text>
                  )}
                </View>
                <ReviewRow label="총 세션" value={`${totalDays}세션`} c={c} />
                <ReviewRow label="장비" value={draft.owned.join(' · ') || '맨몸'} edit={() => setStep('prepare')} c={c} />
                <ReviewRow
                  label="주요 운동"
                  value={
                    Object.entries(draft.pins ?? {})
                      .map(([, p]) => p?.title)
                      .filter(Boolean)
                      .join(' · ') || '운동 구성을 확인해 주세요'
                  }
                  edit={goCompose}
                  c={c}
                />
                {!composeFresh || !draft.confirmed ? (
                  <Text style={[st.small, { color: c.warn, paddingBottom: 12 }]}>조건이 바뀌었어요. 운동 구성을 다시 확인한 뒤 시작해요.</Text>
                ) : null}
              </View>
            ) : null}
          </>
        ) : null}

        {step === 'result' ? (
          <Outcome icon="check" tone="good" title="프로그램을 시작했어요" text={`${choice.name} · 주 ${draft.perWeek}회 · ${totalDays}세션. 완료한 세션은 운동을 마칠 때 세요.`}>
            {today?.programCard ? (
              <View style={[st.box, { backgroundColor: c.card }]}>
                <Text style={[st.bodyBold, { color: c.ink }]}>{sessionTitle(today.programCard.dayLabel)}</Text>
                <Text style={[st.small, { color: c.muted }]}>
                  {today.programCard.kind === 'go'
                    ? '오늘 할 수 있어요. 오늘 운동을 확인하고 시작해요.'
                    : today.programCard.kind === 'needCheckin'
                      ? '오늘 체크인이 있어야 정해요.'
                      : (today.programCard.restText ?? '오늘은 쉬고 다음에 해요.')}
                </Text>
              </View>
            ) : null}
          </Outcome>
        ) : null}
      </ScrollView>
      <FooterActions primary={primary} secondary={secondary} note={note} />

      {/* 후보 — 서버가 지금 조건(장비 · 경력 · 나이)으로 고른 실제 후보. 없음과 실패를 가른다. 취소 · 실패는 고른 것을 지킨다 */}
      {swap ? (
        <PickSheet
          item={swap}
          request={() =>
            act<{ choices: { id: string; title: string; equipment: string[] }[] }>('program.programChoices', {
              variant: swap.variant,
              programId: choice.id,
              ownedEquipment: draft.owned,
              trainingLevel: needLevel ? draft.level : null,
              birthDate: needBirth ? draft.birth : null,
            })
          }
          current={draft.pins?.[swap.variant]?.id ?? swap.id}
          onPick={(x) => {
            update({ pins: { ...(draft.pins ?? {}), [swap.variant]: { id: x.id, title: x.title } }, confirmed: false });
            setChanges((list) => list.filter((cx) => cx.variant !== swap.variant));
            setSwap(null);
          }}
          onClose={() => setSwap(null)}
          c={c}
        />
      ) : null}
      <Sheet fit open={info != null} onClose={() => setInfo(null)} title={info?.title ?? ''} description={info?.label} c={c}>
        {info?.id ? <HowTo key={info.id} exerciseId={info.id} method={null} inline c={c} /> : null}
      </Sheet>
    </View>
  );
}

function Blocked({ b, c }: { b: ProgramBlock; c: Palette }) {
  return (
    <View style={[st.box, { backgroundColor: c.chip }]} accessibilityRole="alert">
      <Text style={[st.small, { color: c.ink }]}>{b.reason}</Text>
      <Text style={[st.small, { color: c.muted }]}>{b.action}</Text>
    </View>
  );
}

function GearGroup({ title, items, owned, onToggle, warn = [], c }: { title: string; items: readonly string[]; owned: string[]; onToggle: (e: string) => void; warn?: string[]; c: Palette }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={[st.small, { color: c.muted, fontWeight: '600' }]}>{title}</Text>
      <View style={st.chips}>
        {items.map((e) => (
          <GearChip key={e} label={e} on={owned.includes(e)} warn={warn.includes(e)} onPress={() => onToggle(e)} c={c} />
        ))}
      </View>
    </View>
  );
}

function OtherGear({ items, owned, onToggle, c }: { items: string[]; owned: string[]; onToggle: (e: string) => void; c: Palette }) {
  const picked = items.filter((e) => owned.includes(e)).length;
  const [open, setOpen] = useState(picked > 0);
  if (items.length === 0) return null;
  return (
    <View style={{ gap: 6 }}>
      <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)} style={st.rowBetween}>
        <Text style={[st.small, { color: c.muted, fontWeight: '600' }]}>
          그 외 장비 {items.length}개{picked > 0 ? ` · ${picked}개 고름` : ''}
        </Text>
        <Icon name={open ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
      </Press>
      {open ? (
        <View style={st.chips}>
          {items.map((e) => (
            <GearChip key={e} label={e} on={owned.includes(e)} onPress={() => onToggle(e)} c={c} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function GearChip({ label, on, warn = false, onPress, c }: { label: string; on: boolean; warn?: boolean; onPress: () => void; c: Palette }) {
  return (
    <Press
      select
      selected={on}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label}${warn ? ', 꼭 필요해요' : ''}`}
      onPress={onPress}
      style={[st.gear, { backgroundColor: on ? withAlpha(c.action, 0.12) : c.card, borderColor: on ? c.action : warn ? c.warn : c.line }]}
    >
      {on ? <Icon name="check" size={14} color={c.link} /> : null}
      <Text style={{ color: on ? c.link : c.ink, fontSize: 15, fontWeight: on ? '600' : '400' }}>{label}</Text>
    </Press>
  );
}

function ReviewRow({ label, value, edit, c }: { label: string; value: string; edit?: () => void; c: Palette }) {
  return (
    <View style={[st.item, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <Text style={[st.small, { width: 72, color: c.muted }]}>{label}</Text>
      <Text style={[st.bodyBold, { flex: 1, color: c.ink }]}>{value}</Text>
      {edit ? (
        <Press accessibilityRole="button" accessibilityLabel={`${label} 수정`} onPress={edit} style={st.inline}>
          <Text style={[st.bodyBold, { color: c.link }]}>수정</Text>
        </Press>
      ) : null}
    </View>
  );
}

/** 후보 고르기 — 불러오는 중 · 없음 · 실패를 가른다 */
function PickSheet({
  item,
  request,
  current,
  onPick,
  onClose,
  c,
}: {
  item: ComposeItem;
  request: () => Promise<{ choices: { id: string; title: string; equipment: string[] }[] } | { error: string }>;
  current: string | null;
  onPick: (x: { id: string; title: string }) => void;
  onClose: () => void;
  c: Palette;
}) {
  const [list, setList] = useState<{ id: string; title: string; equipment: string[] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const ask = useEffectEvent(() => request());
  useEffect(() => {
    let on = true;
    ask().then(
      (r) => {
        if (!on) return;
        if ('error' in r) setError(r.error);
        else setList(r.choices);
      },
      () => on && setError('후보를 불러오지 못했어요. 지금 고른 운동은 그대로예요.')
    );
    return () => {
      on = false;
    };
  }, [tries]);
  return (
    <Sheet open onClose={onClose} title={`${item.label} 바꾸기`} description={item.kind === 'rotating' ? '첫 운동만 바뀌어요. 세션마다 같은 칸의 다른 운동으로 돌아가요.' : '고정 운동이 바뀌면 그 운동의 무게 기록은 새로 시작해요.'} c={c}>
      {error ? (
        <View style={{ gap: 8 }}>
          <Text style={[st.small, { color: c.danger }]}>{error}</Text>
          <Press accessibilityRole="button" onPress={() => (setError(null), setList(null), setTries((n) => n + 1))} style={st.inline}>
            <Text style={[st.bodyBold, { color: c.link }]}>다시 불러오기</Text>
          </Press>
        </View>
      ) : list == null ? (
        <ActivityIndicator style={{ marginVertical: 24 }} />
      ) : list.length === 0 ? (
        <Text style={[st.body, { color: c.muted }]}>가진 장비로 바꿀 수 있는 운동이 없어요. 지금 운동을 그대로 써요.</Text>
      ) : (
        <View style={[st.list, { backgroundColor: c.card }]}>
          {list.map((x, i) => (
            <Press
              key={x.id}
              accessibilityRole="button"
              accessibilityState={{ selected: x.id === current }}
              onPress={() => onPick(x)}
              style={[st.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2, paddingVertical: 8 }}>
                <Text style={[st.bodyBold, { color: c.ink }]}>{x.title}</Text>
                {x.equipment.length > 0 ? <Text style={[st.small, { color: c.muted }]}>{x.equipment.join(' · ')}</Text> : null}
              </View>
              {x.id === current ? <Text style={[st.small, { color: c.link, fontWeight: '600' }]}>지금</Text> : null}
            </Press>
          ))}
        </View>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  steps: { flexDirection: 'row', gap: 4 },
  stepDot: { flex: 1, height: 4, borderRadius: 2 },
  title: { fontSize: 24, fontWeight: '800', letterSpacing: -0.4 },
  section: { fontSize: 18, fontWeight: '700' },
  input: { minHeight: 50, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  option: { minHeight: 52, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  gear: { minHeight: 44, borderRadius: 22, borderWidth: 1, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 6 },
  box: { borderRadius: 16, padding: 14, gap: 6 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  list: { borderRadius: 18, paddingHorizontal: 14 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56 },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
  inline: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
});
