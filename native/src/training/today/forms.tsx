import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { BODY_PARTS, EXERCISE_EQUIPMENT, INTENSITY_LEVELS } from '@/lib/exercise-meta';
import { matchesSearch, withJosa } from '@/lib/korean';
import type { TodayMake, TodayPickItem } from '@/lib/report/training-today-data';
import { act, leave } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { Sheet } from '~/workout/sheets';
import { BigButton, Chip, LinkRow, s, type TodayActions } from './parts';
import { Press } from '~/shell/press';

/**
 * 트레이닝 '운동' 화면의 일정 고치기 — 웹 components/training-forms.tsx 의 PlanForm(자동 맞춤)과 app/(app)/training/add-exercise.tsx
 * (운동 추가 창)를 옮겼다. 서버 동작은 웹과 같다: 만들기는 training-setup.generateAppTodayPlan(웹 폼과 같은 칸 줄 → generateTodayPlan), 더하기는
 * plan-edit.addToTodayPlan. 목록 · 경고는 웹 페이지와 같은 셈(lib/report/training-today-data.ts).
 */

/* ----------------------------- 일정 만들기 폼 ----------------------------- */

/**
 * 일정 만들기 — 체크인이 없으면 체크인 먼저, 아니면 자동 맞춤(목표 · 시간 · 부위는 앱이, 장비는 사람이). '직접 고르기'는 '오늘 하고 싶은 운동'
 * 카드와 겹쳐 2026-10-20 뺐다(김민) — 부위 고르기는 그 카드로 옮겼다. 오늘 쓸 수 있는 장비는 처음엔 모두 켜 둔다(가진 장비 설정을 없앰).
 * generated 면 '다시 만들기' 글. onLeave 는 체크인 화면으로 가기 전에 시트를 닫는 길(시트가 열린 채 다른 화면을 열면 시트 밑에 깔린다).
 */
export function PlanForm({
  make,
  generated,
  c,
  a,
  onLeave,
}: {
  make: TodayMake;
  generated: boolean;
  c: Palette;
  a: TodayActions;
  onLeave?: () => void;
}) {
  /* 오늘 이미 골랐으면(다시 만들기) 그 선택, 아니면 모두 켠 채로 시작 */
  const [on, setOn] = useState<string[]>(() => {
    const today = make.selected.filter((n) => make.equipment.includes(n));
    return make.selected.length > 0 ? today : [...make.equipment];
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!make.checkedIn)
    return (
      <View style={[s.box, { backgroundColor: c.page, gap: 8 }]}>
        <Text style={[s.bodyBold, { color: c.ink }]}>오늘 체크인을 먼저 남겨 주세요</Text>
        <Text style={[s.small, { color: c.muted }]}>20초면 돼요. 남기면 바로 오늘 운동 일정을 만들 수 있어요.</Text>
        <BigButton
          c={c}
          label="체크인하기 ›"
          onPress={() => {
            onLeave?.();
            a.checkin();
          }}
        />
      </View>
    );

  const clash = make.clash;
  const pick = () => void Haptics.selectionAsync();

  const submit = () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const fields: [string, string][] = [['mode', 'auto'], ...on.map((n) => ['availableEquipment', n] as [string, string])];
    void a.generate(fields).then((err) => {
      setBusy(false);
      setError(err);
      if (!err) onLeave?.();
    });
  };

  return (
    <View style={{ gap: 14 }}>
      <Text style={[s.small, { color: c.muted }]}>목표 · 시간은 앱이 정해요.</Text>
      {clash ? (
        <View style={[s.box, { backgroundColor: c.warnBg, gap: 4 }]}>
          <Text style={[s.bodyBold, { color: c.warn }]}>
            {clash.kind} 운동을 하고 싶다고 하셨는데, {clash.reason}.
          </Text>
          <Text style={[s.small, { color: c.warn }]}>그래서 몸 상태에 맞춰 {clash.fallbackLabel} 위주로 만들어요.</Text>
        </View>
      ) : null}

      {make.equipment.length > 0 ? (
        <Field c={c} label="오늘 쓸 수 있는 장비" hint="없는 것은 꺼 주세요. 다 끄면 맨몸 운동만 나와요.">
          <View style={s.chips}>
            {make.equipment.map((n) => (
              <Chip
                key={n}
                c={c}
                label={n}
                on={on.includes(n)}
                onPress={() => {
                  pick();
                  setOn((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : [...cur, n]));
                }}
              />
            ))}
          </View>
        </Field>
      ) : null}

      {error ? <Text style={[s.small, { color: c.danger }]}>{error}</Text> : null}
      <BigButton
        c={c}
        busy={busy}
        label={busy ? '오늘 몸 상태에 맞추고 있어요…' : generated ? '자동 맞춤으로 다시 만들기' : '자동 맞춤으로 만들기'}
        onPress={submit}
      />
    </View>
  );
}

function Field({ c, label, hint, children }: { c: Palette; label: string; hint?: string; children: ReactNode }) {
  return (
    <View style={{ gap: 8 }}>
      <View style={{ gap: 2 }}>
        <Text style={[s.smallBold, { color: c.ink }]}>{label}</Text>
        {hint ? <Text style={[s.tiny, { color: c.muted }]}>{hint}</Text> : null}
      </View>
      {children}
    </View>
  );
}

/* ----------------------------- 운동 추가 창 ----------------------------- */

const FILTERS = [
  { key: 'bodyParts', label: '목표 부위', options: BODY_PARTS },
  { key: 'intensity', label: '강도', options: INTENSITY_LEVELS.map((l) => l.name) },
  { key: 'equipment', label: '장비', options: EXERCISE_EQUIPMENT },
] as const;
type FilterKey = (typeof FILTERS)[number]['key'];
type Filter = Partial<Record<FilterKey, string[]>>;

/** 한 번에 그리는 개수 — 400개를 통째로 그리면 창이 버벅인다(웹과 같다) */
const PAGE = 40;

/** 같은 줄 안에서는 하나만 맞아도, 줄끼리는 모두 맞아야(웹 meta-filter matchesFilter) */
const matches = (f: Filter, ex: TodayPickItem) =>
  (Object.entries(f) as [FilterKey, string[]][]).every(([key, chosen]) => {
    if (chosen.length === 0) return true;
    const owned = key === 'intensity' ? [ex.intensity] : ex[key];
    return chosen.some((x) => owned.includes(x));
  });

/**
 * 오늘 목록에 운동을 더하는 창(웹 AddExercise) — 이름 찾기 · 즐겨찾기만 · 부위 · 강도 · 장비 조건, 별 단 것이 위로. 권하지 않는 운동 · 없는 장비는
 * 막지 않고 알린다. 더할 때마다 화면을 다시 읽어 아래 목록에 바로 보인다(창은 열린 채).
 */
export function AddSheet({ inPlanIds, onClose, c, a }: {
  /** 지금 목록에 있는 운동(화면이 다시 받을 때마다 새로) — 창을 열 때 받은 목록의 '이미 있음'은 그 뒤 바뀐 것을 모른다 */
  inPlanIds: readonly string[];
  onClose: () => void;
  c: Palette;
  a: TodayActions;
}) {
  const [items, setItems] = useState<TodayPickItem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>({});
  const [filterOpen, setFilterOpen] = useState(false);
  const [onlyFav, setOnlyFav] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [added, setAdded] = useState<string[]>([]);
  /* 빨리 두 번 눌러도 한 번만 보낸다 — 둘째가 '이미 있어요'로 실패하면 첫째의 '넣음'까지 되돌렸다 */
  const sending = useRef(new Set<string>());

  useEffect(() => {
    let alive = true;
    void act<{ ok: true; items: TodayPickItem[] } | { ok: false; to: string }>('app-training.loadAppTrainingPicker').then((r) => {
      if (!alive) return;
      if ('error' in r) return setLoadError(r.error);
      if (!r.ok) return leave(r.to);
      setItems(r.items);
    });
    return () => {
      alive = false;
    };
  }, []);

  const favCount = useMemo(() => (items ?? []).filter((x) => x.favorite).length, [items]);
  const chosen = Object.values(filter).reduce((n, v) => n + (v?.length ?? 0), 0);
  const matched = useMemo(() => {
    const text = query.trim();
    return (items ?? [])
      .filter((ex) => (!onlyFav || ex.favorite) && matches(filter, ex) && (matchesSearch(ex.title, text) || matchesSearch(ex.category, text)))
      .sort((x, y) => Number(y.favorite) - Number(x.favorite));
  }, [items, filter, query, onlyFav]);

  const toggle = (key: FilterKey, v: string) => {
    void Haptics.selectionAsync();
    setFilter((f) => {
      const cur = f[key] ?? [];
      return { ...f, [key]: cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v] };
    });
    setLimit(PAGE);
  };

  const add = async (id: string) => {
    if (sending.current.has(id)) return;
    sending.current.add(id);
    setError(null);
    setAdded((l) => [...l, id]);
    const r = await act<{ ok: true }>('plan-edit.addToTodayPlan', id);
    sending.current.delete(id);
    if ('error' in r) {
      setAdded((l) => l.filter((x) => x !== id));
      return setError(r.error);
    }
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    await a.reload();
  };

  return (
    <Sheet open onClose={onClose} title="운동 추가" c={c}>
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
      <View style={s.chips}>
        {favCount > 0 ? (
          <Chip
            c={c}
            label={`★ 즐겨찾기 ${favCount}`}
            on={onlyFav}
            onPress={() => {
              setOnlyFav((v) => !v);
              setLimit(PAGE);
            }}
          />
        ) : null}
        <Chip c={c} label={chosen > 0 ? `조건 ${chosen}` : '조건 고르기'} on={filterOpen} onPress={() => setFilterOpen((v) => !v)} />
      </View>
      {filterOpen ? (
        <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          {FILTERS.map((g) => (
            <View key={g.key} style={{ gap: 6 }}>
              <Text style={[s.smallBold, { color: c.muted }]}>{g.label}</Text>
              <View style={s.chips}>
                {g.options.map((o) => (
                  <Chip key={o} c={c} label={o} on={(filter[g.key] ?? []).includes(o)} onPress={() => toggle(g.key, o)} />
                ))}
              </View>
            </View>
          ))}
          {chosen > 0 ? <LinkRow c={c} label="조건 지우기" onPress={() => setFilter({})} /> : null}
        </View>
      ) : null}
      {items ? (
        <Text style={[s.tiny, { color: c.muted }]}>
          {items.length}개 중 {matched.length}개
        </Text>
      ) : null}
      {error ? <Text style={[s.small, s.box, { color: c.danger, backgroundColor: `${c.danger}14` }]}>{error}</Text> : null}

      {loadError ? (
        <Text style={[s.small, st.empty, { color: c.muted, backgroundColor: c.chip }]}>{loadError}</Text>
      ) : !items ? (
        <Text style={[s.small, { color: c.muted, textAlign: 'center', paddingVertical: 32 }]}>불러오는 중…</Text>
      ) : matched.length === 0 ? (
        <Text style={[s.small, st.empty, { color: c.muted, backgroundColor: c.chip }]}>조건에 맞는 운동이 없어요. 조건을 줄여 보세요.</Text>
      ) : (
        <>
          {matched.slice(0, limit).map((ex) => {
            const already = inPlanIds.includes(ex.id) || added.includes(ex.id);
            const warn = [
              ex.unsafe ? '오늘 몸 상태에는 권하지 않는 운동이에요' : null,
              ex.missing.length > 0 ? `${withJosa(ex.missing.join(' · '), '이/가')} 필요해요` : null,
            ].filter(Boolean);
            const meta = [...ex.bodyParts, ex.intensity, ex.difficulty, ...ex.equipment].filter(Boolean).join(' · ');
            return (
              <View key={ex.id} style={[st.pick, { backgroundColor: c.card, borderColor: c.line }]}>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text style={[s.bodyBold, { color: c.ink }]}>
                    {ex.favorite ? <Text style={{ color: '#ff9500' }}>★ </Text> : null}
                    {ex.title}
                  </Text>
                  <Text style={[s.tiny, { color: c.muted }]}>{ex.category}</Text>
                  {ex.prescription ? <Text style={[s.smallBold, { color: c.muted }]}>{ex.prescription}</Text> : null}
                  {meta ? <Text style={[s.tiny, { color: c.muted }]}>{meta}</Text> : null}
                  {warn.length > 0 ? (
                    <View style={[s.row, { gap: 4, alignItems: 'flex-start' }]}>
                      <SymbolView name="exclamationmark.triangle" size={11} tintColor={c.warn} />
                      <Text style={[s.tiny, { flex: 1, color: c.warn }]}>{warn.join(' · ')}</Text>
                    </View>
                  ) : null}
                </View>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={already ? `${ex.title} 넣음` : `${ex.title} 넣기`}
                  disabled={already}
                  onPress={() => void add(ex.id)}
                  style={[st.pickBtn, { backgroundColor: already ? c.chip : c.sky }]}
                >
                  <Text style={[s.smallBold, { color: already ? c.muted : '#fff' }]}>{already ? '넣음' : '넣기'}</Text>
                </Press>
              </View>
            );
          })}
          {matched.length > limit ? (
            <Press onPress={() => setLimit((n) => n + PAGE)} accessibilityRole="button" style={[s.pill, { alignSelf: 'center' }]}>
              <Text style={[s.bodyBold, { color: c.sky }]}>{matched.length - limit}개 더 보기</Text>
            </Press>
          ) : null}
        </>
      )}
    </Sheet>
  );
}

const st = StyleSheet.create({
  search: { minHeight: 44, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, fontSize: 17 },
  pick: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  pickBtn: { minHeight: 40, minWidth: 56, borderRadius: 10, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  empty: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 24, textAlign: 'center', overflow: 'hidden' },
});
