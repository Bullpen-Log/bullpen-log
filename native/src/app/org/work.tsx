import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadMemberWork } from '@/app/actions/app-team';
import { ORG_WORK_ITEMS_MAX, ORG_WORK_SETS_MAX } from '@/lib/org/team-work';
import { Bar, LoadState, call, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Card, Empty, GroupTitle, Primary } from '~/org/parts';
import { LibraryBrowser, Num, type LibraryLoad, type Pick } from '~/org/picker';
import { useDraftGuard } from '~/org/space-store';

/**
 * 수행일지 고쳐 적기(앱 화면, 3단계) — 선수 한 명이 이 일정에서 실제로 한 운동 · 세트(무게 · 횟수 · 버틴 초). 처음엔 남긴 기록, 없으면 메뉴 처방으로 채워 연다.
 * 저장은 app-team.recordWork('custom') — 선수의 그날 운동 판에 코치 세트로 통째로 바꿔 넣는다.
 */
type Loaded = Awaited<ReturnType<typeof loadMemberWork>>;
type SetDraft = { kg: string; reps: string; sec: string };
type Item = { exerciseId: string; name: string; sets: SetDraft[] };

const str = (n: number | null) => (n == null ? '' : String(n));
const numOrNull = (s: string) => (s.trim() ? Number(s) : null);

export default function WorkScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; event: string; member: string }>();
  const work = useLoad<Loaded>('app-team.loadMemberWork', p.org ?? '', p.event ?? '', p.member ?? '');
  const lib = useLoad<LibraryLoad>('app-lesson.loadHomeworkLibrary', p.org ?? '');
  const [edited, setEdited] = useState<Item[] | null>(null);
  const { busy, error, run } = useBusy();
  /* 쓰던 글 — 다른 조직 알림으로 옮기거나 권한을 잃을 때 묻는다(계약 8-5) */
  useDraftGuard(edited != null);

  const items: Item[] | null =
    edited ??
    (work.data ? work.data.items.map((i) => ({ exerciseId: i.exerciseId, name: i.name, sets: i.sets.map((s) => ({ kg: str(s.weightKg), reps: str(s.reps), sec: str(s.holdSeconds) })) })) : null);
  const setItems = (f: (xs: Item[]) => Item[]) => items && setEdited(f(items));
  const patchSet = (id: string, n: number, v: Partial<SetDraft>) =>
    setItems((xs) => xs.map((x) => (x.exerciseId === id ? { ...x, sets: x.sets.map((s, i) => (i === n ? { ...s, ...v } : s)) } : x)));

  const picks: Pick[] = (items ?? []).map((x) => ({ id: x.exerciseId, kind: 'exercise', name: x.name, sets: '', reps: '' }));
  const setPicks = (f: (ps: Pick[]) => Pick[]) =>
    setItems((xs) => {
      const next = f(xs.map((x) => ({ id: x.exerciseId, kind: 'exercise' as const, name: x.name, sets: '', reps: '' })));
      return next.map((pk) => xs.find((x) => x.exerciseId === pk.id) ?? { exerciseId: pk.id, name: pk.name, sets: [{ kg: '', reps: '', sec: '' }] });
    });

  const save = () =>
    run(async () => {
      if (!items) return null;
      const r = await call<{ ok: true; sets: number }>(
        'app-team.recordWork',
        p.org,
        p.event,
        p.member,
        'custom',
        items.map((x) => ({ exerciseId: x.exerciseId, sets: x.sets.map((s) => ({ weightKg: numOrNull(s.kg), reps: numOrNull(s.reps), holdSeconds: numOrNull(s.sec) })) }))
      );
      if (!r.ok) return ('error' in r && r.error) || '저장하지 못했어요.';
      toast(r.sets ? `${r.sets}세트를 남겼어요` : '기록을 뺐어요');
      router.back();
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={work.data ? `${work.data.nickname} 수행일지` : '수행일지'} c={c} />
      {!items || !lib.data ? (
        <LoadState error={work.error ?? lib.error} onRetry={() => void Promise.all([work.reload(), lib.reload()])} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>
            {work.data?.recorded ? '남긴 기록이에요.' : '아직 남긴 기록이 없어 메뉴 처방으로 채웠어요.'} 세트마다 무게 · 횟수 · 초 가운데 하나는 적어요.
          </Text>
          {items.length === 0 ? (
            <Card c={c}>
              <Empty text="운동이 없어요. 저장하면 이 일정의 기록이 빠져요." c={c} />
            </Card>
          ) : null}
          {items.map((x) => (
            <Card key={x.exerciseId} c={c}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={[TYPE.card, { color: c.ink, flex: 1 }]} numberOfLines={2}>
                  {x.name}
                </Text>
                <Pressable accessibilityRole="button" accessibilityLabel={`${x.name} 빼기`} onPress={() => setItems((xs) => xs.filter((y) => y.exerciseId !== x.exerciseId))} hitSlop={8}>
                  <Text style={{ color: c.danger, fontSize: 20 }}>×</Text>
                </Pressable>
              </View>
              {x.sets.map((s, n) => (
                <View key={n} style={[st.set, n < x.sets.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line }]}>
                  <Text style={[TYPE.sub, { color: c.muted, width: 40 }]}>{n + 1}세트</Text>
                  <Num value={s.kg} onChange={(kg) => patchSet(x.exerciseId, n, { kg })} unit="kg" max={5} decimal c={c} />
                  <Num value={s.reps} onChange={(reps) => patchSet(x.exerciseId, n, { reps })} unit="회" max={3} c={c} />
                  <Num value={s.sec} onChange={(sec) => patchSet(x.exerciseId, n, { sec })} unit="초" max={3} c={c} />
                  <View style={{ flex: 1 }} />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${n + 1}세트 빼기`}
                    onPress={() => setItems((xs) => xs.map((y) => (y.exerciseId === x.exerciseId ? { ...y, sets: y.sets.filter((_, i) => i !== n) } : y)))}
                    hitSlop={8}
                  >
                    <Text style={{ color: c.muted, fontSize: 18 }}>×</Text>
                  </Pressable>
                </View>
              ))}
              {x.sets.length < ORG_WORK_SETS_MAX ? (
                <AddLink
                  label="+ 세트"
                  onPress={() => setItems((xs) => xs.map((y) => (y.exerciseId === x.exerciseId ? { ...y, sets: [...y.sets, { ...(y.sets.at(-1) ?? { kg: '', reps: '', sec: '' }) }] } : y)))}
                  c={c}
                />
              ) : null}
            </Card>
          ))}
          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          <Primary label={busy ? '저장하는 중…' : '저장'} onPress={() => void save()} disabled={busy} c={c} />
          <View style={{ gap: 6 }}>
            <GroupTitle title="운동 더하기" c={c} />
            <LibraryBrowser lib={lib.data} picks={picks} setPicks={setPicks} exerciseOnly max={ORG_WORK_ITEMS_MAX} c={c} />
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function AddLink({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={{ minHeight: 36, justifyContent: 'center' }}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

const st = StyleSheet.create({
  set: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
});
