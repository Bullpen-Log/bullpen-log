import { Icon } from '~/shell/icon';
import { useFavs } from '~/training/favorites';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ScrollLockScope } from '~/shell/scroll-lock';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { matchesSearch } from '@/lib/korean';
import { TRAINING_EFFORT_ASK, TRAINING_EFFORT_LEVELS, TRAINING_EFFORT_NOTE } from '@/lib/training-effort';
import { equipmentLabel, type SwapMode } from '@/lib/workout/swap';
import type { SwapChoices, SwapPick } from '@/app/actions/workout';
import type { RunExercise } from '@/lib/workout/run-exercises';
import type { VariantKey } from '@/lib/program/program';
import { rpc } from '~/lib/rpc';
import type { Palette } from '~/lib/ui';
import type { ShownSet } from './outbox';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';

/**
 * 운동 진행 화면의 아래 시트 — 오늘 목록(웹 exercise-sheet.tsx) · 교체(swap-sheet.tsx). 마치기는 ./finish-sheet.tsx(시안 08). Sheet 는 트레이닝 운동 화면의 시트도 쓴다.
 * 아이폰 기본 시트(pageSheet)라 끌어내려 닫기가 저절로 온다.
 */
/** 내용만큼 올라오는 시트가 내려가며 걷히는 시간 — 그 뒤에 onClose */
const SHEET_OUT_MS = 200;

export function Sheet({
  open,
  onClose,
  title,
  description,
  footer,
  children,
  c,
  fit = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  footer?: ReactNode;
  children: ReactNode;
  c: Palette;
  /** 내용만큼만 올라오는 시트(뒤를 누르면 닫힘) — 짧은 내용에 화면을 다 덮는 pageSheet 는 빈 곳이 많았다(2026-10-20 김민) */
  fit?: boolean;
}) {
  const inset = useSafeAreaInsets();
  /*
   * 내용만큼 올라오는 시트는 뒤 어둠이 제자리에서 옅게 깔리고 카드만 밑에서 올라온다(아이폰 시트처럼). 예전엔 Modal 의 slide 가 어둠까지
   * 통째로 밀어 올려 카드 위로 검은 판이 같이 올라왔다(2026-10-20 김민: "필요한 창만 나오는 게 아니라 창 위로 어두운 그림자도 같이 나와").
   * 닫을 때도 카드가 내려가고 어둠이 걷힌 뒤에 onClose — 그동안 Modal 은 떠 있어야 해서 leaving 동안 내용만 걷는다(exiting 이 돈다).
   */
  const [leaving, setLeaving] = useState(false);
  /* 닫았다가 다시 열면(open 을 받아 쓰는 곳) 걷어 둔 내용을 되돌린다 */
  const [wasOpen, setWasOpen] = useState(open);
  if (wasOpen !== open) {
    setWasOpen(open);
    if (open) setLeaving(false);
  }
  const close = () => {
    if (!fit) return onClose();
    if (leaving) return;
    setLeaving(true);
    setTimeout(onClose, SHEET_OUT_MS);
  };
  const head = (
    <View style={st.head}>
      <View style={{ flex: 1 }}>
        <Text style={[st.title, { color: c.ink }]}>{title}</Text>
        {description ? <Text style={[st.desc, { color: c.muted }]}>{description}</Text> : null}
      </View>
      <Press onPress={close} accessibilityRole="button" accessibilityLabel="닫기" style={st.close}>
        <SymbolView name="xmark.circle.fill" size={28} tintColor={c.muted} />
      </Press>
    </View>
  );
  if (fit)
    return (
      <Modal visible={open} transparent animationType="none" onRequestClose={close}>
        {!leaving ? (
          <>
            <Animated.View entering={FadeIn.duration(220)} exiting={FadeOut.duration(SHEET_OUT_MS)} style={st.scrim}>
              <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="닫기" />
            </Animated.View>
            {/*
              자판이 올라오면 카드도 그 위로 — 투명 Modal 은 아이폰 시트(pageSheet)와 달리 자판을 저절로 피하지 않는다(2026-10-26 아이폰 레이아웃 점검).
              pageSheet 갈래(아래)와 같은 한 가지 길(KeyboardAvoidingView padding)이고, 안 스크롤은 자판 inset 을 따로 더하지 않는다
            */}
            <KeyboardAvoidingView behavior="padding" style={st.fitWrap} pointerEvents="box-none">
              <Animated.View
                entering={SlideInDown.duration(320).easing(Easing.bezier(0.22, 1, 0.36, 1))}
                exiting={SlideOutDown.duration(SHEET_OUT_MS).easing(Easing.in(Easing.ease))}
                style={[st.fitCard, { backgroundColor: c.page, paddingBottom: footer ? 0 : Math.max(16, inset.bottom) }]}
              >
                <View style={[st.grabber, { backgroundColor: c.line }]} />
                {head}
                {/* 운동 창 안의 3D 근육 그림을 돌리는 동안 시트가 같이 굴러가지 않게(shell/scroll-lock) */}
                <ScrollLockScope>
                  {(scrollEnabled) => (
                    <ScrollView style={st.fitScroll} scrollEnabled={scrollEnabled} keyboardShouldPersistTaps="handled" contentContainerStyle={[st.scroll, READABLE]}>
                      {children}
                    </ScrollView>
                  )}
                </ScrollLockScope>
                {footer ? <View style={[st.footer, { paddingBottom: Math.max(16, inset.bottom), borderTopColor: c.line }]}>{footer}</View> : null}
              </Animated.View>
            </KeyboardAvoidingView>
          </>
        ) : null}
      </Modal>
    );
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
        {head}
        <ScrollLockScope>
          {(scrollEnabled) => (
        <ScrollView scrollEnabled={scrollEnabled} keyboardShouldPersistTaps="handled" contentContainerStyle={[st.scroll, READABLE]}>
          {children}
        </ScrollView>
          )}
        </ScrollLockScope>
        {footer ? <View style={[st.footer, { paddingBottom: Math.max(16, inset.bottom), borderTopColor: c.line }]}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </Modal>
  );
}

/* ----------------------------- 오늘 목록 ----------------------------- */

/**
 * 오늘 할 운동 목록 — 누르면 그 운동으로, ↑ ↓ 로 순서, ✕ 로 오늘만 뺀다. 세트를 남긴 운동은 못 뺀다(빼면 목록에는 없는데 기록은 남는다).
 */
export function ListSheet({
  open,
  exercises,
  sets,
  at,
  busy,
  error,
  onJump,
  onApply,
  onClose,
  c,
}: {
  open: boolean;
  exercises: RunExercise[];
  sets: ShownSet[];
  at: number;
  busy: boolean;
  error: string | null;
  onJump: (i: number) => void;
  onApply: (ids: string[]) => void;
  onClose: () => void;
  c: Palette;
}) {
  const countOf = (id: string) => sets.filter((x) => x.exerciseId === id).length;
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= exercises.length) return;
    const ids = exercises.map((e) => e.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    onApply(ids);
  };
  return (
    <Sheet open={open} onClose={onClose} title={`오늘 운동 ${exercises.length}개`} c={c}>
      {error ? <Text style={[st.error, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error}</Text> : null}
      {exercises.map((ex, i) => {
        const done = countOf(ex.id);
        const here = i === at;
        return (
          <View key={ex.id} style={[st.listRow, { borderColor: here ? c.sky : c.line, backgroundColor: c.card }]}>
            <Press onPress={() => onJump(i)} accessibilityRole="button" style={st.listMain}>
              <Text style={[st.listNo, { color: here ? c.link : c.muted }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[st.listTitle, { color: here ? c.link : c.ink, fontWeight: here ? '700' : '500' }]}>
                  {ex.title}
                </Text>
                <Text numberOfLines={1} style={[st.tiny, { color: c.muted }]}>
                  {done > 0 ? `${done}세트 남김 · 기록이 있어 못 빼요` : (ex.prescription ?? '아직')}
                </Text>
              </View>
            </Press>
            <IconButton icon="chevron.up" a11y={`${ex.title} 위로`} disabled={busy || i === 0} onPress={() => move(i, -1)} c={c} />
            <IconButton
              icon="chevron.down"
              a11y={`${ex.title} 아래로`}
              disabled={busy || i === exercises.length - 1}
              onPress={() => move(i, 1)}
              c={c}
            />
            <View style={{ width: 6 }} />
            <IconButton
              icon="xmark"
              a11y={`${ex.title} 오늘 빼기`}
              disabled={busy || done > 0 || exercises.length === 1}
              onPress={() => onApply(exercises.filter((_, k) => k !== i).map((e) => e.id))}
              c={c}
            />
          </View>
        );
      })}
      <Text style={[st.tiny, st.center, { color: c.muted }]}>뺀 운동은 오늘만 빠져요. 트레이닝 화면의 일정은 그대로 남아요.</Text>
    </Sheet>
  );
}

function IconButton({
  icon,
  a11y,
  disabled,
  onPress,
  c,
}: {
  icon: SFSymbol;
  a11y: string;
  disabled: boolean;
  onPress: () => void;
  c: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={a11y}
      style={({ pressed }) => [st.icon, { opacity: disabled ? 0.25 : pressed ? 0.5 : 1 }]}
    >
      <SymbolView name={icon} size={18} tintColor={c.muted} />
    </Pressable>
  );
}

/** '강도를 어떻게 정하나요?' — 웹 마치기 창 IntensityGuide(kind training)와 같은 접이: 다섯 단계 + '오늘 운동 전체' 안내(트레이닝 화면이 쓴다) */
export function EffortGuide({ c }: { c: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={[st.guide, { borderColor: c.line }]}>
      <Press
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={st.guideHead}
      >
        <Icon name="info" size={14} color={c.link} />
        <Text style={[st.small, { flex: 1, color: c.muted }]}>{TRAINING_EFFORT_ASK}</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
      </Press>
      {open ? (
        <View style={[st.guideBody, { borderTopColor: c.line }]}>
          {TRAINING_EFFORT_LEVELS.map((l) => (
            <View key={l.range} style={{ flexDirection: 'row', gap: 12 }}>
              <Text style={[st.small, { width: 48, color: c.link, fontWeight: '700', fontVariant: ['tabular-nums'] }]}>{l.range}</Text>
              <View style={{ flex: 1 }}>
                <Text style={[st.small, { color: c.ink, fontWeight: '600' }]}>{l.label}</Text>
                <Text style={[st.small, { color: c.muted }]}>{l.detail}</Text>
              </View>
            </View>
          ))}
          <Text style={[st.small, st.guideNote, { color: c.link, backgroundColor: c.action + '14' }]}>
            <Text style={{ fontWeight: '700' }}>{TRAINING_EFFORT_NOTE.strong}</Text> {TRAINING_EFFORT_NOTE.rest}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

/* ----------------------------- 교체 ----------------------------- */

/*
 * 찾기용 전체 목록은 한 번 받으면 들고 있는다 — 누가 보든 같은 400여 개라 창을 열 때마다 받으면 약한 신호에서 늦게 뜬다(웹과 같다).
 * 추천 · 막아 둔 운동 · 즐겨찾기 · 최근은 열 때마다 새로 받는다.
 */
let libraryCache: SwapPick[] | null = null;
type Tab = 'similar' | 'mine' | 'search';
const TABS: { value: Tab; label: string }[] = [
  { value: 'similar', label: '비슷한 운동' },
  { value: 'mine', label: '즐겨찾기·최근' },
  { value: 'search', label: '찾기' },
];
const PAGE = 30;

/**
 * 운동 중에 운동을 바꾸거나 더하는 창 — 비슷한 운동 · 즐겨찾기·최근 · 찾기. 오늘 몸 상태로 안 되는 운동은 막아 둔다(서버가 넣을 때 한 번 더 본다).
 * 세트를 남긴 운동은 바꾸지 않고 바로 뒤에 더한다(lib/workout/swap.ts swapMode).
 */
export function SwapSheet({
  open,
  sessionId,
  current,
  mode,
  inPlanIds,
  onDone,
  onClose,
  program,
  c,
}: {
  open: boolean;
  /** 운동 중 바꾸기면 판 번호 — 오늘 운동 준비의 '오늘만 바꾸기'(program)면 없다 */
  sessionId?: string;
  current: Pick<RunExercise, 'id' | 'title'>;
  mode: SwapMode;
  inPlanIds: string[];
  onDone?: (exercise: RunExercise, mode: SwapMode) => void;
  onClose: () => void;
  /**
   * 오늘 운동 준비(시안 05)의 '오늘만 바꾸기' — 같은 창 · 같은 후보(비슷한 · 즐겨찾기 · 최근 · 찾기 · 주의)를 프로그램 칸 기준으로 받고
   * (program.programSwapChoices), 고르면 그날 바꿈만 저장한다(program.swapProgramToday — 고정 운동 · 다음 세션은 그대로). 원래 운동을 고르면 바꿈을 지운다.
   */
  program?: { variant: VariantKey; swappedFromId: string | null; onSwapped: () => void };
  c: Palette;
}) {
  const [choices, setChoices] = useState<SwapChoices | null>(null);
  const [library, setLibrary] = useState<SwapPick[] | null>(libraryCache);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('similar');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE);
  const programVariant = program?.variant ?? null;

  /* 열 때만 묻는다 — 창은 닫힌 채로도 붙어 있다(닫히는 움직임), 열 때마다 새로 그려져 그때 한 번 */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    (programVariant
      ? rpc<SwapChoices | { error: string }>('program.programSwapChoices', {
          exerciseId: current.id,
          variant: programVariant,
          withLibrary: libraryCache == null,
        })
      : rpc<SwapChoices | { error: string }>('workout.swapChoices', {
          sessionId,
          exerciseId: current.id,
          withLibrary: libraryCache == null,
        })
    ).then(
      (res) => {
        if (!alive) return;
        if ('error' in res) return setLoadError(res.error);
        if (res.library) {
          libraryCache = res.library;
          setLibrary(res.library);
        }
        setChoices(res);
      },
      () => alive && setLoadError('신호가 없어 불러오지 못했어요. 신호가 잡히면 다시 열어 주세요.')
    );
    return () => {
      alive = false;
    };
  }, [open, sessionId, current.id, programVariant]);

  const pick = async (id: string) => {
    setError(null);
    setBusyId(id);
    if (program) {
      try {
        const r = await rpc<{ ok: true } | { error: string }>('program.swapProgramToday', {
          variant: program.variant,
          exerciseId: id === program.swappedFromId ? null : id,
        });
        if ('error' in r) setError(r.error);
        else program.onSwapped();
      } catch {
        setError('신호가 없어 바꾸지 못했어요. 지금 운동은 그대로예요.');
      } finally {
        setBusyId(null);
      }
      return;
    }
    try {
      const res = await rpc<{ exercise: RunExercise; mode: SwapMode } | { error: string }>('workout.changeSessionExercise', {
        sessionId,
        fromId: current.id,
        toId: id,
        mode,
      });
      if ('error' in res) setError(res.error);
      else onDone?.(res.exercise, res.mode);
    } catch {
      setError('신호가 없어 넣지 못했어요. 신호가 잡히면 다시 눌러 주세요.');
    } finally {
      setBusyId(null);
    }
  };

  const byId = useMemo(() => new Map((library ?? []).map((p) => [p.id, p])), [library]);
  const inPlan = useMemo(() => new Set(inPlanIds), [inPlanIds]);
  const blocked = useMemo(() => new Set(choices?.blockedIds ?? []), [choices]);
  /* 별은 공용 저장소의 값 — 운동 영상 · 운동 진행에서 바꾼 것이 바로(~/training/favorites). 서버가 준 즐겨찾기 차례 뒤에 이 앱에서 새로 단 것 */
  const favs = useFavs();
  const served = new Set(choices?.favoriteIds ?? []);
  const favoriteIds = [
    ...(choices?.favoriteIds ?? []).filter((id) => favs.fav('exercise', id, true)),
    ...(library ?? []).flatMap((p) => (!served.has(p.id) && favs.fav('exercise', p.id, false) ? [p.id] : [])),
  ];
  const favorites = new Set(favoriteIds);
  const pickable = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const found = id === current.id ? undefined : byId.get(id);
      return found ? [found] : [];
    });
  /* 별이 바뀌면(공용 저장소) 다시 줄 세운다 — 수백 개라 그릴 때마다 해도 가볍다 */
  const text = query.trim();
  const matched = (library ?? [])
    .filter((p) => p.id !== current.id && (matchesSearch(p.title, text) || matchesSearch(p.category, text)))
    .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  const halted = choices?.halted ?? null;
  const kind = (p: SwapPick) => `${p.category} · ${equipmentLabel(p.equipment)}`;

  const row = (p: SwapPick, sub: string) => {
    const already = inPlan.has(p.id);
    const unsafe = blocked.has(p.id);
    const off = already || halted != null || busyId != null;
    return (
      <View key={p.id} style={[st.pick, { backgroundColor: c.card, borderColor: c.line }]}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.bodyBold, { color: c.ink }]}>
            {favorites.has(p.id) ? '★ ' : ''}
            {p.title}
          </Text>
          <Text style={[st.tiny, { color: c.muted }]}>{sub}</Text>
          {p.prescription ? <Text style={[st.tiny, { color: c.muted }]}>{p.prescription}</Text> : null}
          {unsafe && !halted ? <Text style={[st.tiny, { color: c.warn }]}>오늘 몸 상태에는 권하지 않는 운동이에요</Text> : null}
        </View>
        <Press
          onPress={() => void pick(p.id)}
          disabled={off}
          accessibilityRole="button"
          style={[st.pickBtn, { backgroundColor: already || halted ? c.chip : c.sky, opacity: off && !already ? 0.6 : 1 }]}
        >
          <Text style={[st.smallBold, { color: already || halted ? c.muted : '#fff' }]}>
            {busyId === p.id ? '넣는 중…' : already ? '목록에 있음' : mode === 'replace' ? '바꾸기' : '더하기'}
          </Text>
        </Press>
      </View>
    );
  };

  const empty = (text: string) => <Text style={[st.empty, { backgroundColor: c.chip, color: c.muted }]}>{text}</Text>;
  const favoritePicks = pickable(favoriteIds);
  const recentPicks = pickable(choices?.recentIds ?? []);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={program ? '오늘만 바꾸기' : mode === 'replace' ? '운동 교체' : '운동 추가'}
      description={
        program
          ? `‘${current.title}’ 대신 오늘 할 운동을 골라요. 고정 운동과 다음 세션은 그대로예요.`
          : mode === 'replace'
            ? `‘${current.title}’ 대신 할 운동을 고르세요.`
            : `이미 세트를 남긴 운동이라 그대로 두고, 고른 운동을 ‘${current.title}’ 바로 다음에 더해요.`
      }
      c={c}
    >
      <View style={[st.tabs, { backgroundColor: c.chip }]} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Press
            select
            selected={tab === t.value}
            key={t.value}
            onPress={() => setTab(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.value }}
            style={[st.tab, tab === t.value ? { backgroundColor: c.card } : null]}
          >
            <Text style={[st.small, { color: c.ink, fontWeight: tab === t.value ? '700' : '500' }]}>{t.label}</Text>
          </Press>
        ))}
      </View>
      {tab === 'search' ? (
        <TextInput
          value={query}
          onChangeText={(t) => {
            setQuery(t);
            setLimit(PAGE);
          }}
          placeholder="운동 이름으로 찾기"
          placeholderTextColor={c.muted}
          accessibilityLabel="운동 이름으로 찾기"
          clearButtonMode="while-editing"
          style={[st.search, { backgroundColor: c.card, color: c.ink, borderColor: c.line }]}
        />
      ) : null}
      {error || halted ? <Text style={[st.error, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error ?? halted}</Text> : null}
      {loadError ? (
        empty(loadError)
      ) : !choices || !library ? (
        <Text style={[st.small, st.center, { color: c.muted, paddingVertical: 32 }]}>불러오는 중…</Text>
      ) : tab === 'similar' ? (
        choices.similar.length === 0 ? (
          empty(
            halted
              ? '오늘은 운동을 더하거나 바꿀 수 없어요.'
              : '오늘 장비와 몸 상태로 할 수 있는 비슷한 운동을 찾지 못했어요. ‘찾기’에서 골라 주세요.'
          )
        ) : (
          choices.similar.flatMap(({ id, reason }) => {
            const p = byId.get(id);
            return p ? [row(p, reason)] : [];
          })
        )
      ) : tab === 'mine' ? (
        favoritePicks.length === 0 && recentPicks.length === 0 ? (
          empty('아직 즐겨찾기도 최근에 한 운동도 없어요. 운동 이름 옆의 ☆ 를 누르면 여기 모여요.')
        ) : (
          <>
            {favoritePicks.length > 0 ? <Text style={[st.section, { color: c.muted }]}>즐겨찾기</Text> : null}
            {favoritePicks.map((p) => row(p, kind(p)))}
            {recentPicks.length > 0 ? <Text style={[st.section, { color: c.muted }]}>최근에 한 운동</Text> : null}
            {recentPicks.map((p) => row(p, kind(p)))}
          </>
        )
      ) : matched.length === 0 ? (
        empty(`‘${query.trim()}’에 맞는 운동이 없어요.`)
      ) : (
        <>
          {matched.slice(0, limit).map((p) => row(p, kind(p)))}
          {matched.length > limit ? (
            <Press onPress={() => setLimit((n) => n + PAGE)} accessibilityRole="button" style={st.textBtn}>
              <Text style={[st.bodyBold, { color: c.link }]}>{matched.length - limit}개 더 보기</Text>
            </Press>
          ) : null}
        </>
      )}
      <Text style={[st.tiny, st.center, { color: c.muted }]}>
        {program ? '오늘 세션에만 바뀌어요. 늘 바꾸려면 프로그램의 고정 운동 바꾸기에서.' : '바꾼 운동은 오늘 운동에만 반영돼요. 트레이닝 화면의 일정은 그대로예요.'}
      </Text>
    </Sheet>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 8, gap: 8 },
  title: { fontSize: 22, fontWeight: '700' },
  desc: { fontSize: 15, marginTop: 4, lineHeight: 21 },
  close: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -8, marginRight: -8 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24, gap: 8 },
  footer: { paddingHorizontal: 20, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
  fitWrap: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.35)' },
  fitCard: { maxHeight: '88%', borderTopLeftRadius: 28, borderTopRightRadius: 28, overflow: 'hidden' },
  fitScroll: { flexGrow: 0, flexShrink: 1 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 8 },
  error: { fontSize: 13, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, overflow: 'hidden' },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  tiny: { fontSize: 11, lineHeight: 16 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  center: { textAlign: 'center' },
  listRow: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 12, paddingLeft: 8, paddingVertical: 4 },
  listMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  listNo: { width: 20, textAlign: 'center', fontSize: 13, fontVariant: ['tabular-nums'] },
  listTitle: { fontSize: 15 },
  icon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  big: { height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  bigText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  textBtn: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  note: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, gap: 4, overflow: 'hidden' },
  guide: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, marginTop: 8 },
  guideHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, paddingHorizontal: 12 },
  guideBody: { borderTopWidth: StyleSheet.hairlineWidth, padding: 12, gap: 10 },
  guideNote: { borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, overflow: 'hidden' },
  question: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  levels: { flexDirection: 'row', gap: 4, marginTop: 8 },
  level: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  levelText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  levelEnds: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  input: { minHeight: 64, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 17, textAlignVertical: 'top' },
  tabs: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  tab: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 17 },
  section: { fontSize: 11, fontWeight: '600', marginTop: 8 },
  pick: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  pickBtn: { minHeight: 40, borderRadius: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 24, textAlign: 'center', fontSize: 13, lineHeight: 18, overflow: 'hidden' },
});
