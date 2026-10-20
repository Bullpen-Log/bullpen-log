import { type Href, router } from 'expo-router';
import { useMemo, useState } from 'react';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppPatchNotes } from '@/app/actions/app-admin';
import { Bar, LoadState, Row, s, useLoad, useTitleCollapse } from '~/community/parts';
import { PageHead } from '~/shell/heading';
import { ChipRow, SearchField } from '~/library/parts';
import { usePalette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';

/**
 * 패치노트(앱 화면, 관리자) — 웹 app/(app)/admin/patch-notes(patch-note-list.tsx): 한 줄 = 한 사람의 하루(첫 커밋 제목 · 커밋 수 · 고친 줄 · 메모 있음).
 * 웹처럼 찾기(이름 · 날짜 · 한 일 · 고친 자리) · 순서 넷 · 사람 거르기 · 장 수, 최신순 · 오래된순이면 달로 묶는다. 거르기는 화면에서만.
 * 내용은 깃에서 온다(scripts/sync-patch-notes.mjs) — 사람이 적는 건 상세의 메모뿐.
 */
type Loaded = Awaited<ReturnType<typeof loadAppPatchNotes>>;
type Note = Extract<Loaded, { notes: unknown }>['notes'][number];

const SORTS = [
  { value: 'new', label: '최신순' },
  { value: 'old', label: '오래된순' },
  { value: 'author', label: '사람순' },
  { value: 'size', label: '큰 작업순' },
] as const;
type Sort = (typeof SORTS)[number]['value'];

const monthLabel = (m: string) => `${m.slice(0, 4)}년 ${Number(m.slice(5, 7))}월`;

export default function PatchNotesScreen() {
  const c = usePalette();
  const { shown: titleShown, scroll } = useTitleCollapse();
  const inset = useSafeAreaInsets();
  const { data, error, reload } = useLoad<Loaded>('app-admin.loadAppPatchNotes');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('new');
  const [who, setWho] = useState('all');
  const rows = useMemo(() => (data && 'notes' in data ? data.notes : []), [data]);
  /* 누가 있는지는 기록에서 뽑는다 — 사람이 늘면 칸도 저절로 는다 */
  const people = useMemo(() => [...new Set(rows.map((r) => r.author))].sort((a, b) => a.localeCompare(b, 'ko')), [rows]);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = rows.filter(
      (r) =>
        (who === 'all' || r.author === who) &&
        (!q ||
          r.author.toLowerCase().includes(q) ||
          (r.dayKey ?? '').includes(q) ||
          r.day.includes(q) ||
          r.headline.toLowerCase().includes(q) ||
          r.areas.some((a) => a.toLowerCase().includes(q)))
    );
    const key = (r: Note) => r.dayKey ?? '';
    if (sort === 'new') list.sort((a, b) => key(b).localeCompare(key(a)));
    if (sort === 'old') list.sort((a, b) => key(a).localeCompare(key(b)));
    if (sort === 'author') list.sort((a, b) => a.author.localeCompare(b.author, 'ko') || key(b).localeCompare(key(a)));
    /* 큰 작업순 — 고친 줄 수로(커밋 수는 사람마다 쪼개는 버릇이 달라 못 믿는다, 웹과 같다) */
    if (sort === 'size') list.sort((a, b) => b.insertions + b.deletions - (a.insertions + a.deletions));
    return list;
  }, [rows, query, sort, who]);
  /* 달로 묶기 — 최신순 · 오래된순만(다른 순서면 같은 달이 흩어진다) */
  const groups = useMemo(() => {
    if (sort !== 'new' && sort !== 'old') return [{ month: null as string | null, list: shown }];
    const map = new Map<string, Note[]>();
    for (const r of shown) {
      const m = (r.dayKey ?? '').slice(0, 7);
      map.set(m, [...(map.get(m) ?? []), r]);
    }
    return [...map.entries()].map(([month, list]) => ({ month: month || null, list }));
  }, [shown, sort]);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="관리자" title="패치노트" shown={!data || !('notes' in data) || titleShown} c={c} />
      {!data || !('notes' in data) ? (
        /* 관리자가 아니면 서버가 갈 곳만 돌려준다 — 빈 목록으로 보이지 않게 알림으로 */
        <LoadState error={data ? '관리자만 볼 수 있어요.' : error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView {...scroll}
          keyboardDismissMode="on-drag"
          contentContainerStyle={[{ paddingVertical: 16, paddingBottom: inset.bottom + 32, gap: 12 }, READABLE]}
          refreshControl={<RefreshControl refreshing={false} onRefresh={() => void reload()} />}
        >
          <View style={{ paddingHorizontal: 16 }}>
            <PageHead title="패치노트" />
          </View>
          <SearchField value={query} onChange={setQuery} placeholder="이름 · 날짜 · 한 일 · 고친 자리로 찾기" c={c} />
          <ChipRow chips={SORTS.map((x) => ({ key: x.value, label: x.label, on: sort === x.value, onPress: () => setSort(x.value) }))} c={c} />
          {people.length > 1 ? (
            <ChipRow
              chips={[{ value: 'all', label: '전체' }, ...people.map((p) => ({ value: p, label: p }))].map((x) => ({
                key: x.value,
                label: x.label,
                on: who === x.value,
                onPress: () => setWho(x.value),
              }))}
              c={c}
            />
          ) : null}
          <Text style={[s.meta, { color: c.muted, paddingHorizontal: 20 }]}>
            {shown.length}장{shown.length !== rows.length ? ` (전체 ${rows.length}장 중)` : ''}
          </Text>
          {shown.length === 0 ? (
            <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', padding: 24 }}>
              {rows.length === 0 ? '아직 패치노트가 없어요.' : '찾는 것이 없어요. 다른 말로 찾아보세요.'}
            </Text>
          ) : (
            groups.map((g) => (
              <View key={g.month ?? 'all'} style={{ gap: 8, paddingHorizontal: 16 }}>
                {g.month ? (
                  <Text style={[s.meta, { color: c.muted, fontWeight: '600', paddingHorizontal: 4 }]}>
                    {monthLabel(g.month)} <Text style={{ fontWeight: '400', opacity: 0.6 }}>{g.list.length}장</Text>
                  </Text>
                ) : null}
                <View style={[s.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                  {g.list.map((n, i) => (
                    <Row key={n.id} onPress={() => router.push(`/admin/patch-notes/${n.id}` as Href)} last={i === g.list.length - 1} c={c}>
                      <Text style={[s.meta, { color: c.sky, fontWeight: '600' }]}>
                        {n.author} · {n.day}
                        {n.hasNote ? ' · 메모' : ''}
                      </Text>
                      <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }} numberOfLines={2}>
                        {n.headline || '(제목 없음)'}
                      </Text>
                      <Text style={[s.meta, { color: c.muted }]}>
                        커밋 {n.commits}개 · +{n.insertions} −{n.deletions}
                        {n.areas.length > 0 ? ` · ${n.areas.slice(0, 3).join(' · ')}${n.areas.length > 3 ? ` 외 ${n.areas.length - 3}곳` : ''}` : ''}
                      </Text>
                    </Row>
                  ))}
                </View>
              </View>
            ))
          )}
        </ScrollView>
      )}
    </View>
  );
}
