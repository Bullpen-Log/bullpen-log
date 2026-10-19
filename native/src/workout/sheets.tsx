import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { matchesSearch } from '@/lib/korean';
import { summarizeSets } from '@/lib/workout/summarize';
import { equipmentLabel, type SwapMode } from '@/lib/workout/swap';
import type { SwapChoices, SwapPick } from '@/app/actions/workout';
import type { RunExercise } from '@/lib/workout/run-exercises';
import { rpc } from '~/lib/rpc';
import type { Palette } from '~/lib/ui';
import type { ShownSet } from './outbox';
import { READABLE } from '~/lib/layout';

/**
 * 운동 진행 화면의 아래 시트 셋 — 오늘 목록(웹 exercise-sheet.tsx) · 마치기(finish-sheet.tsx) · 교체(swap-sheet.tsx). Sheet 는 트레이닝 운동 화면의 시트도 쓴다.
 * 아이폰 기본 시트(pageSheet)라 끌어내려 닫기가 저절로 온다.
 */
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
  const head = (
    <View style={st.head}>
      <View style={{ flex: 1 }}>
        <Text style={[st.title, { color: c.ink }]}>{title}</Text>
        {description ? <Text style={[st.desc, { color: c.muted }]}>{description}</Text> : null}
      </View>
      <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={st.close}>
        <SymbolView name="xmark.circle.fill" size={28} tintColor={c.muted} />
      </Pressable>
    </View>
  );
  if (fit)
    return (
      <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
        <View style={st.fitWrap}>
          <Pressable style={st.scrim} onPress={onClose} accessibilityLabel="닫기" />
          <View style={[st.fitCard, { backgroundColor: c.page, paddingBottom: footer ? 0 : Math.max(16, inset.bottom) }]}>
            <View style={[st.grabber, { backgroundColor: c.line }]} />
            {head}
            <ScrollView style={st.fitScroll} keyboardShouldPersistTaps="handled" contentContainerStyle={[st.scroll, READABLE]}>
              {children}
            </ScrollView>
            {footer ? <View style={[st.footer, { paddingBottom: Math.max(16, inset.bottom), borderTopColor: c.line }]}>{footer}</View> : null}
          </View>
        </View>
      </Modal>
    );
  return (
    <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
        {head}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[st.scroll, READABLE]}>
          {children}
        </ScrollView>
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
            <Pressable onPress={() => onJump(i)} accessibilityRole="button" style={st.listMain}>
              <Text style={[st.listNo, { color: here ? c.sky : c.muted }]}>{i + 1}</Text>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={[st.listTitle, { color: here ? c.sky : c.ink, fontWeight: here ? '700' : '500' }]}>
                  {ex.title}
                </Text>
                <Text numberOfLines={1} style={[st.tiny, { color: c.muted }]}>
                  {done > 0 ? `${done}세트 남김 · 기록이 있어 못 빼요` : (ex.prescription ?? '아직')}
                </Text>
              </View>
            </Pressable>
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

/* ----------------------------- 마치기 ----------------------------- */

/** 운동 체감 강도 기준표 — 웹 components/intensity-guide.tsx TRAINING_LEVELS 그대로(그 파일은 웹 부품이라 못 부른다) */
export const TRAINING_LEVELS = [
  { max: 2, label: '아주 가벼움', detail: '몸을 푸는 정도로 끝났어요. 끝나고도 피로가 거의 없어요.' },
  { max: 4, label: '가벼움', detail: '땀은 났지만 여유가 많았어요. 같은 운동을 한 번 더 해도 될 것 같아요.' },
  { max: 6, label: '보통', detail: '평소대로 제대로 한 날이에요. 끝날 즈음 지쳤지만 무리는 아니었어요.' },
  { max: 8, label: '힘듦', detail: '후반부는 버티면서 했어요. 끝나고 한동안 쉬어야 했어요.' },
  { max: 10, label: '최대', detail: '오늘 쓸 수 있는 힘을 다 썼어요. 한 세트도 더 못 할 것 같아요.' },
] as const;

/**
 * 마치기 직전 — 체감 강도(선택)와 느낀점. 강도를 안 고르면 축하 화면이 칩 하나로 한 번 더 묻는다(웹과 같다). 느낀점만 적고 강도가 없으면
 * 막는다(강도 없이 온 메모는 서버가 버린다). 못 보낸 세트가 있으면 마치기를 막는다 — 마치면 그 세트는 요약에서 빠지고 판이 닫힌다.
 */
export function FinishSheet({
  open,
  sets,
  startedAt,
  priorSeconds,
  pendingCount,
  program,
  busy,
  error,
  onFinish,
  onClose,
  c,
}: {
  open: boolean;
  sets: ShownSet[];
  startedAt: string;
  priorSeconds: number;
  pendingCount: number;
  program: { line: string; reached: boolean; unanswered: string[] } | null;
  busy: boolean;
  error: string | null;
  onFinish: (intensity: number | null, memo: string) => void;
  onClose: () => void;
  c: Palette;
}) {
  const [intensity, setIntensity] = useState<number | null>(null);
  const [memo, setMemo] = useState('');
  const memoNeedsIntensity = memo.trim() !== '' && intensity == null;
  /* 연 시각으로 못박는다 — 고르는 동안 숫자가 올라가면 산만하다 */
  const [openedAt] = useState(() => Date.now());
  const minutes = Math.max(0, Math.round((priorSeconds * 1000 + (openedAt - Date.parse(startedAt))) / 60000));
  const exerciseCount = summarizeSets(sets).length;
  const level = intensity != null ? TRAINING_LEVELS.find((l) => intensity <= l.max) : null;
  const off = busy || memoNeedsIntensity || pendingCount > 0;

  const footer = (
    <View style={{ gap: 8 }}>
      {error ? <Text style={[st.error, { color: c.danger, backgroundColor: c.danger + '14' }]}>{error}</Text> : null}
      {pendingCount > 0 ? (
        <Text style={[st.small, st.center, { color: c.danger }]}>
          아직 못 보낸 세트가 {pendingCount}개 있어요. 신호가 잡혀 저절로 보내지면 마칠 수 있어요.
        </Text>
      ) : memoNeedsIntensity ? (
        <Text style={[st.small, st.center, { color: c.muted }]}>느낀점을 남기려면 강도도 골라 주세요.</Text>
      ) : null}
      <Pressable
        onPress={() => !off && onFinish(intensity, memo)}
        disabled={off}
        accessibilityRole="button"
        style={({ pressed }) => [st.big, { backgroundColor: c.sky, opacity: off ? 0.4 : pressed ? 0.85 : 1 }]}
      >
        <Text style={st.bigText}>{busy ? '정리 중' : '✓ 운동 마치기'}</Text>
      </Pressable>
      <Pressable onPress={onClose} disabled={busy} accessibilityRole="button" style={st.textBtn}>
        <Text style={[st.bodyBold, { color: c.sky }]}>더 하기</Text>
      </Pressable>
    </View>
  );

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="오늘 운동을 마칠까요?"
      description={sets.length > 0 ? `운동 ${exerciseCount}개 · ${sets.length}세트 · ${minutes}분` : `${minutes}분`}
      footer={footer}
      c={c}
    >
      {program ? (
        <View style={[st.note, { backgroundColor: c.chip }]}>
          <Text style={[st.body, { color: c.ink, fontWeight: program.reached ? '600' : '400' }]}>{program.line}</Text>
          {program.unanswered.length > 0 ? (
            <Text style={[st.body, { color: c.muted }]}>아직 안 답한 ‘몇 개 더?’: {program.unanswered.join(', ')}</Text>
          ) : null}
        </View>
      ) : null}
      {sets.length === 0 ? (
        <Text style={[st.note, st.body, { backgroundColor: c.chip, color: c.muted }]}>
          남긴 세트가 없어요. 이대로 마치면 오늘은 기록이 남지 않아요.
        </Text>
      ) : null}
      <Text style={[st.question, { color: c.ink }]}>
        오늘 얼마나 힘들었나요? <Text style={[st.small, { color: c.muted }]}>선택</Text>
      </Text>
      <Text style={[st.small, { color: c.muted }]}>얼마나 힘들었는지 골라요. 운동 부하를 이 숫자로 셈해요(나중에 골라도 돼요).</Text>
      {/* 밀대가 아니라 열 칸 — 손을 대는 순간 어딘가가 골라지면 '안 고름'을 남길 수 없다 */}
      <View style={st.levels}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
          <Pressable
            key={n}
            onPress={() => setIntensity(n)}
            accessibilityRole="button"
            accessibilityState={{ selected: intensity === n }}
            style={[st.level, { backgroundColor: intensity === n ? c.sky : c.chip }]}
          >
            <Text style={[st.levelText, { color: intensity === n ? '#fff' : c.ink }]}>{n}</Text>
          </Pressable>
        ))}
      </View>
      <View style={st.levelEnds}>
        <Text style={[st.tiny, { color: c.muted }]}>1 아주 가벼움</Text>
        <Text style={[st.tiny, { color: c.muted }]}>10 최대</Text>
      </View>
      {/* 감으로 찍으면 그 뒤 계산이 흔들린다 — 고른 칸의 기준을 바로 밑에 */}
      {level ? (
        <Text style={[st.small, { color: c.muted }]}>
          <Text style={{ fontWeight: '700', color: c.ink }}>{level.label}</Text> · {level.detail}
        </Text>
      ) : null}
      <Text style={[st.bodyBold, { color: c.ink, marginTop: 12 }]}>
        느낀점 <Text style={[st.tiny, { color: c.muted, fontWeight: '400' }]}>선택</Text>
      </Text>
      <TextInput
        value={memo}
        onChangeText={setMemo}
        multiline
        placeholder="안 적어도 돼요. 무거웠던 곳, 잘 된 동작 같은 것."
        placeholderTextColor={c.muted}
        style={[st.input, { backgroundColor: c.chip, color: c.ink }]}
      />
    </Sheet>
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
  c,
}: {
  open: boolean;
  sessionId: string;
  current: RunExercise;
  mode: SwapMode;
  inPlanIds: string[];
  onDone: (exercise: RunExercise, mode: SwapMode) => void;
  onClose: () => void;
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

  /* 열 때만 묻는다 — 창은 닫힌 채로도 붙어 있다(닫히는 움직임), 열 때마다 새로 그려져 그때 한 번 */
  useEffect(() => {
    if (!open) return;
    let alive = true;
    rpc<SwapChoices | { error: string }>('workout.swapChoices', {
      sessionId,
      exerciseId: current.id,
      withLibrary: libraryCache == null,
    }).then(
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
  }, [open, sessionId, current.id]);

  const pick = async (id: string) => {
    setError(null);
    setBusyId(id);
    try {
      const res = await rpc<{ exercise: RunExercise; mode: SwapMode } | { error: string }>('workout.changeSessionExercise', {
        sessionId,
        fromId: current.id,
        toId: id,
        mode,
      });
      if ('error' in res) setError(res.error);
      else onDone(res.exercise, res.mode);
    } catch {
      setError('신호가 없어 넣지 못했어요. 신호가 잡히면 다시 눌러 주세요.');
    } finally {
      setBusyId(null);
    }
  };

  const byId = useMemo(() => new Map((library ?? []).map((p) => [p.id, p])), [library]);
  const inPlan = useMemo(() => new Set(inPlanIds), [inPlanIds]);
  const blocked = useMemo(() => new Set(choices?.blockedIds ?? []), [choices]);
  const favorites = useMemo(() => new Set(choices?.favoriteIds ?? []), [choices]);
  const pickable = (ids: readonly string[]) =>
    ids.flatMap((id) => {
      const found = id === current.id ? undefined : byId.get(id);
      return found ? [found] : [];
    });
  const matched = useMemo(() => {
    if (!library) return [];
    const text = query.trim();
    return library
      .filter((p) => p.id !== current.id && (matchesSearch(p.title, text) || matchesSearch(p.category, text)))
      .sort((a, b) => Number(favorites.has(b.id)) - Number(favorites.has(a.id)));
  }, [library, query, favorites, current.id]);
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
        <Pressable
          onPress={() => void pick(p.id)}
          disabled={off}
          accessibilityRole="button"
          style={[st.pickBtn, { backgroundColor: already || halted ? c.chip : c.sky, opacity: off && !already ? 0.6 : 1 }]}
        >
          <Text style={[st.smallBold, { color: already || halted ? c.muted : '#fff' }]}>
            {busyId === p.id ? '넣는 중…' : already ? '목록에 있음' : mode === 'replace' ? '바꾸기' : '더하기'}
          </Text>
        </Pressable>
      </View>
    );
  };

  const empty = (text: string) => <Text style={[st.empty, { backgroundColor: c.chip, color: c.muted }]}>{text}</Text>;
  const favoritePicks = pickable(choices?.favoriteIds ?? []);
  const recentPicks = pickable(choices?.recentIds ?? []);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={mode === 'replace' ? '운동 교체' : '운동 추가'}
      description={
        mode === 'replace'
          ? `‘${current.title}’ 대신 할 운동을 고르세요.`
          : `이미 세트를 남긴 운동이라 그대로 두고, 고른 운동을 ‘${current.title}’ 바로 다음에 더해요.`
      }
      c={c}
    >
      <View style={[st.tabs, { backgroundColor: c.chip }]} accessibilityRole="tablist">
        {TABS.map((t) => (
          <Pressable
            key={t.value}
            onPress={() => setTab(t.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.value }}
            style={[st.tab, tab === t.value ? { backgroundColor: c.card } : null]}
          >
            <Text style={[st.small, { color: c.ink, fontWeight: tab === t.value ? '700' : '500' }]}>{t.label}</Text>
          </Pressable>
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
            <Pressable onPress={() => setLimit((n) => n + PAGE)} accessibilityRole="button" style={st.textBtn}>
              <Text style={[st.bodyBold, { color: c.sky }]}>{matched.length - limit}개 더 보기</Text>
            </Pressable>
          ) : null}
        </>
      )}
      <Text style={[st.tiny, st.center, { color: c.muted }]}>바꾼 운동은 오늘 운동에만 반영돼요. 트레이닝 화면의 일정은 그대로예요.</Text>
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
  smallBold: { fontSize: 13, fontWeight: '700' },
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
  question: { fontSize: 17, fontWeight: '700', marginTop: 8 },
  levels: { flexDirection: 'row', gap: 4, marginTop: 8 },
  level: { flex: 1, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  levelText: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
  levelEnds: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4 },
  input: { minHeight: 64, borderRadius: 16, paddingHorizontal: 16, paddingVertical: 12, fontSize: 16, textAlignVertical: 'top' },
  tabs: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  tab: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 16 },
  section: { fontSize: 11, fontWeight: '600', marginTop: 8 },
  pick: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  pickBtn: { minHeight: 40, borderRadius: 8, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 24, textAlign: 'center', fontSize: 13, lineHeight: 18, overflow: 'hidden' },
});
