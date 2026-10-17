import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useRef, useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ARMCARE_AREAS, type ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { methodByKey } from '@/lib/armcare/methods';
import {
  MY_ROUTINE_MAX,
  MY_ROUTINE_MAX_ITEMS,
  MY_ROUTINE_NAME_MAX,
  MY_ROUTINE_SETS_MAX,
  MY_ROUTINE_SETS_MIN,
  normalizeRoutineInput,
  type MyRoutineItem,
} from '@/lib/armcare/my-routines';
import type { loadAppRoutine } from '@/app/actions/app-training-parts';
import type { RoutineBuilderData } from '@/lib/armcare/routine-builder-load';
import type { BuilderExercise } from '@/app/(app)/training/routine/[id]/routine-builder';
import { ExerciseMedia, HowTo } from '~/armcare/parts';
import { Bar, Chip, LoadState, useLoad } from '~/community/parts';
import { act } from '~/mechanics/parts';
import { usePalette, type Palette } from '~/lib/ui';
import { s } from '~/training/screen';

/**
 * 내 루틴 만들기 · 고치기(앱 화면) — 웹 /training/routine/new · /training/routine/<id>(app/(app)/training/routine/[id]/routine-builder.tsx)를 옮겼다.
 * 고르는 목록 · 담은 운동은 웹과 같은 곳에서(app-training-parts.loadAppRoutine → lib/armcare/routine-builder-load.ts), 저장 · 지우기도 웹과 같은
 * armcare.saveMyArmcareRoutine · deleteMyArmcareRoutine. 이름 · 운동 수 · 세트 규칙은 저장하는 쪽과 같은 것(lib/armcare/my-routines.ts)으로 먼저 막는다.
 * 저장하거나 지우면 닫는다 — 암케어 화면이 돌아올 때 다시 받는다. 근육을 누르면 뜨는 3D 그림 · 설명은 웹에만 있다(여기는 이름만).
 */
type Loaded = Awaited<ReturnType<typeof loadAppRoutine>>;
type Filter = 'all' | ArmcareAreaKey;
const FILTERS: { key: Filter; label: string }[] = [{ key: 'all', label: '전체' }, ...ARMCARE_AREAS.map((a) => ({ key: a.key, label: a.label }))];

export default function RoutineScreen() {
  const c = usePalette();
  const { id, add } = useLocalSearchParams<{ id: string; add?: string }>();
  const load = useLoad<Loaded>('app-training-parts.loadAppRoutine', id ?? null, add ?? null);
  const routine = load.data?.routine;
  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="암케어" title={id === 'new' ? '새 루틴 만들기' : '루틴 고치기'} c={c} />
      {!load.data ? (
        <LoadState error={load.error} onRetry={() => void load.reload()} c={c} />
      ) : !routine ? (
        <Text style={[s.body, s.center, { color: c.muted, padding: 32 }]}>루틴을 찾을 수 없어요.</Text>
      ) : (
        <Builder data={routine} c={c} />
      )}
    </KeyboardAvoidingView>
  );
}

/** 이름 · 담은 운동(세트 · 차례) · 고르는 목록 · 지우기 · 아래 저장 줄 — 처음 받은 값으로 시작하고, 다시 받아도 고치던 것은 그대로 */
function Builder({ data, c }: { data: RoutineBuilderData; c: Palette }) {
  const inset = useSafeAreaInsets();
  const [name, setName] = useState(data.name);
  const [items, setItems] = useState<MyRoutineItem[]>(data.items);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'delete' | null>(null);
  /* 두 번 눌러도 한 번만 보낸다 — state 는 다음 그림까지 안 바뀌어 빠른 두 번을 못 막는다 */
  const sending = useRef(false);

  const byId = useMemo(() => new Map(data.exercises.map((e) => [e.view.id, e])), [data.exercises]);
  const picked = new Set(items.map((it) => it.exerciseId));
  const atMax = items.length >= MY_ROUTINE_MAX_ITEMS;
  const minutes = Math.max(1, Math.round(items.reduce((sum, it) => sum + (byId.get(it.exerciseId)?.minutes[it.sets - 1] ?? 0), 0)));

  /* 'trx', 'gg' 처럼 소문자로 찾아도 나오게(웹과 같다) */
  const q = query.trim().toLowerCase();
  const shown = data.exercises.filter(
    (e) => (filter === 'all' || e.area === filter) && (!q || e.view.title.toLowerCase().includes(q) || e.view.targetMuscles.some((m) => m.includes(q)))
  );

  const toggle = (e: BuilderExercise) => {
    setError(null);
    void Haptics.selectionAsync();
    setItems((prev) =>
      prev.some((it) => it.exerciseId === e.view.id)
        ? prev.filter((it) => it.exerciseId !== e.view.id)
        : prev.length >= MY_ROUTINE_MAX_ITEMS
          ? prev
          : [...prev, { exerciseId: e.view.id, sets: e.defaultSets }]
    );
  };
  const move = (index: number, by: -1 | 1) =>
    setItems((prev) => {
      const to = index + by;
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });
  const setSets = (index: number, sets: number) =>
    setItems((prev) =>
      prev.map((it, i) => (i === index ? { ...it, sets: Math.min(MY_ROUTINE_SETS_MAX, Math.max(MY_ROUTINE_SETS_MIN, sets)) } : it))
    );

  const send = async (kind: 'save' | 'delete') => {
    if (sending.current) return;
    sending.current = true;
    setBusy(kind);
    setError(null);
    const res =
      kind === 'save'
        ? await act<{ ok: true; id: string }>('armcare.saveMyArmcareRoutine', { id: data.id, name, items })
        : await act<{ ok: true }>('armcare.deleteMyArmcareRoutine', data.id);
    sending.current = false;
    setBusy(null);
    if ('error' in res) {
      setError(res.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      return;
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };
  const save = () => {
    const check = normalizeRoutineInput({ name, items });
    if (!check.ok) return setError(check.error);
    void send('save');
  };
  const remove = () =>
    Alert.alert('이 루틴을 지울까요?', `${data.name} 루틴이 사라져요. 그동안 체크한 운동 기록은 그대로 남아요.`, [
      { text: '취소', style: 'cancel' },
      { text: '지우기', style: 'destructive', onPress: () => void send('delete') },
    ]);

  if (data.full) {
    return (
      <View style={{ padding: 16 }}>
        <Text style={[s.body, s.box, { color: c.warn, backgroundColor: c.warnBg }]}>
          루틴은 {MY_ROUTINE_MAX}개까지 둘 수 있어요. 안 쓰는 루틴을 지운 뒤 새로 만들어 주세요.
        </Text>
      </View>
    );
  }

  return (
    <View style={s.fill}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 24, paddingBottom: 24 }}>
        <Text style={[s.small, { color: c.muted, paddingHorizontal: 4 }]}>운동을 담고 세트와 차례를 정하세요.</Text>

        <View style={{ gap: 6 }}>
          <Text style={[s.smallBold, { color: c.ink, paddingHorizontal: 4 }]}>루틴 이름</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            maxLength={MY_ROUTINE_NAME_MAX}
            placeholder="예: 투구 전 루틴, 집에서"
            placeholderTextColor={c.muted}
            returnKeyType="done"
            style={[st.input, { backgroundColor: c.card, color: c.ink }]}
          />
        </View>

        <View style={{ gap: 10 }}>
          <View style={[s.between, { paddingHorizontal: 4 }]}>
            <Text accessibilityRole="header" style={[s.section, { color: c.ink }]}>
              담은 운동 <Text style={{ color: c.muted }}>{items.length}</Text>
            </Text>
            {items.length > 0 ? (
              <Text style={[s.small, { color: c.muted }]}>
                약 <Text style={[s.smallBold, { color: c.ink }]}>{minutes}</Text>분
              </Text>
            ) : null}
          </View>
          {data.droppedHidden > 0 ? (
            <Text style={[s.tiny, { color: c.muted, paddingHorizontal: 4 }]}>
              담아 둔 운동 중 {data.droppedHidden}개는 라이브러리에서 숨겨져 뺐어요. 저장하면 빠진 채로 남아요.
            </Text>
          ) : null}
          {items.length === 0 ? (
            <Text style={[s.small, s.center, st.empty, { color: c.muted, backgroundColor: c.card }]}>
              아래 목록에서 운동을 골라 담으세요. 담은 차례대로 해요.
            </Text>
          ) : (
            items.map((it, i) => {
              const e = byId.get(it.exerciseId);
              if (!e) return null;
              return (
                <View key={it.exerciseId} style={[st.picked, { backgroundColor: c.card, borderColor: c.line }]}>
                  <Text style={[s.smallBold, { color: c.muted, width: 20, textAlign: 'center' }]}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: 4 }}>
                    <Text style={[s.bodyBold, { color: c.ink }]}>{e.view.title}</Text>
                    {e.dose ? <Text style={[s.tiny, { color: c.muted }]}>{e.dose}</Text> : null}
                    <View style={[st.stepper, { borderColor: c.line }]}>
                      <Square icon="minus" label={`${e.view.title} 세트 줄이기`} disabled={it.sets <= MY_ROUTINE_SETS_MIN} onPress={() => setSets(i, it.sets - 1)} c={c} />
                      <Text style={[s.smallBold, { color: c.ink, minWidth: 44, textAlign: 'center' }]}>{it.sets}세트</Text>
                      <Square icon="plus" label={`${e.view.title} 세트 늘리기`} disabled={it.sets >= MY_ROUTINE_SETS_MAX} onPress={() => setSets(i, it.sets + 1)} c={c} />
                    </View>
                  </View>
                  <View style={{ gap: 6 }}>
                    <Square icon="arrow.up" label={`${e.view.title} 앞으로`} disabled={i === 0} onPress={() => move(i, -1)} boxed c={c} />
                    <Square icon="arrow.down" label={`${e.view.title} 뒤로`} disabled={i === items.length - 1} onPress={() => move(i, 1)} boxed c={c} />
                  </View>
                  <Square icon="xmark" label={`${e.view.title} 빼기`} onPress={() => toggle(e)} c={c} />
                </View>
              );
            })
          )}
        </View>

        <View style={{ gap: 10 }}>
          <View style={{ gap: 2, paddingHorizontal: 4 }}>
            <Text accessibilityRole="header" style={[s.section, { color: c.ink }]}>
              운동 고르기
            </Text>
            <Text style={[s.tiny, { color: c.muted }]}>
              암케어 운동 {data.exercises.length}개 · 한 루틴에 {MY_ROUTINE_MAX_ITEMS}개까지
            </Text>
          </View>
          <View style={[st.search, { backgroundColor: c.card }]}>
            <SymbolView name="magnifyingglass" size={15} tintColor={c.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="운동·근육 이름으로 찾기"
              placeholderTextColor={c.muted}
              returnKeyType="search"
              clearButtonMode="while-editing"
              style={[s.body, { flex: 1, color: c.ink, minHeight: 44 }]}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 6 }}>
            {FILTERS.map((f) => (
              <Chip
                key={f.key}
                label={f.label}
                on={filter === f.key}
                onPress={() => {
                  void Haptics.selectionAsync();
                  setFilter(f.key);
                }}
                c={c}
              />
            ))}
          </ScrollView>
          {shown.length === 0 ? (
            <Text style={[s.small, s.center, { color: c.muted, paddingVertical: 20 }]}>맞는 운동이 없어요.</Text>
          ) : (
            shown.map((e) => (
              <PickRow key={e.view.id} e={e} inside={picked.has(e.view.id)} disabled={!picked.has(e.view.id) && atMax} onToggle={() => toggle(e)} c={c} />
            ))
          )}
        </View>

        {data.id ? (
          <Pressable onPress={remove} disabled={busy != null} accessibilityRole="button" style={[s.textBtn, { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
            <SymbolView name="trash" size={14} tintColor={c.muted} />
            <Text style={[s.bodyBold, { color: c.muted }]}>{busy === 'delete' ? '지우는 중…' : '이 루틴 지우기'}</Text>
          </Pressable>
        ) : null}
      </ScrollView>

      {/* 저장 — 목록을 훑는 동안에도 손이 닿게 아래에 붙인다(웹과 같다) */}
      <View style={[st.saveBar, { backgroundColor: c.card, borderTopColor: c.line, paddingBottom: Math.max(12, inset.bottom) }]}>
        {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
        <View style={s.row}>
          <Text style={[s.small, { color: c.muted, flex: 1 }]}>{items.length === 0 ? '운동을 담아 주세요' : `${items.length}개 · 약 ${minutes}분`}</Text>
          <Pressable onPress={save} disabled={busy != null} accessibilityRole="button" style={[s.smallPill, { backgroundColor: c.sky, opacity: busy ? 0.6 : 1 }]}>
            <Text style={[s.bodyBold, { color: '#fff' }]}>{busy === 'save' ? '저장하는 중…' : data.id ? '고친 것 저장' : '루틴 저장'}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/** 고르는 목록의 한 줄 — 이름 · 방식 · 처방(쉬는 시간 뺌) · 도구 · 근육 둘, [담기 | 담김], 펼치면 강도 · 수준 · 영상 · 자세 설명(웹과 같은 차례) */
function PickRow({ e, inside, disabled, onToggle, c }: { e: BuilderExercise; inside: boolean; disabled: boolean; onToggle: () => void; c: Palette }) {
  const [open, setOpen] = useState(false);
  const ex = e.view;
  /* 방식 이름은 운동 이름에 이미 들어 있으면 뺀다 */
  const method = ex.method && !ex.title.includes(methodByKey(ex.method).label) ? methodByKey(ex.method).label : null;
  const line = [ex.prescription?.replace(/\s*·\s*세트 사이 [^·]+ 휴식/, ''), ex.equipment.join(' · ')].filter(Boolean).join(' · ');
  return (
    <View style={[st.row, { backgroundColor: c.card, borderColor: inside ? c.sky : c.line }]}>
      <View style={st.rowHead}>
        <View style={{ flex: 1, gap: 3 }}>
          <Text style={[s.bodyBold, { color: c.ink }]}>
            {ex.title}
            {method ? <Text style={[s.tiny, { color: c.sky, fontWeight: '600' }]}>{`  ${method}`}</Text> : null}
          </Text>
          {line ? <Text style={[s.tiny, { color: c.muted }]}>{line}</Text> : null}
          {ex.targetMuscles.length ? <Text style={[s.small, { color: c.sky }]}>{ex.targetMuscles.slice(0, 2).join(' · ')}</Text> : null}
        </View>
        <Pressable
          onPress={onToggle}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityState={{ selected: inside, disabled }}
          accessibilityLabel={`${ex.title} ${inside ? '빼기' : '담기'}`}
          style={[st.pick, inside ? { backgroundColor: c.sky } : { borderWidth: 1, borderColor: c.line }, disabled && { opacity: 0.4 }]}
        >
          <SymbolView name={inside ? 'checkmark' : 'plus'} size={12} weight="bold" tintColor={inside ? '#fff' : c.ink} />
          <Text style={[s.smallBold, { color: inside ? '#fff' : c.ink }]}>{inside ? '담김' : '담기'}</Text>
        </Pressable>
      </View>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} style={[st.disclose, { borderTopColor: c.line }]}>
        <SymbolView name="info.circle" size={13} tintColor={c.muted} />
        <Text style={[s.smallBold, { color: c.muted, flex: 1 }]}>자세 · 영상 보기</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={11} tintColor={c.muted} />
      </Pressable>
      {open ? (
        <View style={{ gap: 10, paddingHorizontal: 12, paddingBottom: 12 }}>
          <Text style={[s.tiny, { color: c.muted }]}>{[`강도 ${ex.intensity}`, ex.difficulty].filter(Boolean).join(' · ')}</Text>
          <ExerciseMedia path={ex.videoPath} referenceVideoId={ex.referenceVideoId} thumbUrl={ex.thumbUrl} aspectRatio={ex.aspectRatio} />
          <HowTo exerciseId={ex.id} method={ex.method} c={c} />
        </View>
      ) : null}
    </View>
  );
}

/** 작은 네모 단추 — 세트 −/+ · 앞으로 · 뒤로 · 빼기(폰 손가락 크기 40px) */
function Square({
  icon,
  label,
  disabled,
  onPress,
  boxed,
  c,
}: {
  icon: 'minus' | 'plus' | 'arrow.up' | 'arrow.down' | 'xmark';
  label: string;
  disabled?: boolean;
  onPress: () => void;
  boxed?: boolean;
  c: Palette;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={[st.square, boxed && { borderWidth: 1, borderColor: c.line }, disabled && { opacity: 0.3 }]}
    >
      <SymbolView name={icon} size={14} weight="semibold" tintColor={c.muted} />
    </Pressable>
  );
}

const st = StyleSheet.create({
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  empty: { borderRadius: 16, paddingHorizontal: 16, paddingVertical: 28, overflow: 'hidden' },
  picked: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 10 },
  stepper: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', borderRadius: 10, borderWidth: 1 },
  square: { width: 40, height: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingHorizontal: 12 },
  row: { borderRadius: 16, borderWidth: 1, overflow: 'hidden' },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingHorizontal: 12, paddingVertical: 12 },
  pick: { minHeight: 36, borderRadius: 10, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 4 },
  disclose: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderTopWidth: StyleSheet.hairlineWidth },
  saveBar: { gap: 6, paddingHorizontal: 16, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
});
