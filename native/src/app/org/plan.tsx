import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadEventDetail, loadPlan } from '@/app/actions/app-team';
import type { HomeworkItem } from '@/lib/org/homework';
import { PLAN_TITLE_MAX } from '@/lib/org/team';
import { Bar, LoadState, call, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Box, DangerLink, Field, st as fst } from '~/org/forms';
import { Primary } from '~/org/parts';
import { LibraryBrowser, PickedList, pickItems, type Library, type LibraryLoad, type Pick } from '~/org/picker';

/**
 * 훈련 메뉴 만들기 · 고치기(앱 화면, 3단계) — 이름(투수조 · 야수조 …) · 대상(모두 또는 고른 선수) · 라이브러리 운동 · 드릴. 저장은 app-team.savePlan.
 * 메뉴는 계획일 뿐 선수 기록에 안 들어간다 — 끝난 뒤 일정 화면의 수행일지에서 '메뉴대로 했어요'로 남긴다.
 */
type Detail = Awaited<ReturnType<typeof loadEventDetail>>;
type PlanLoaded = Awaited<ReturnType<typeof loadPlan>>;
type Draft = { title: string; memberIds: string[]; picks: Pick[] };

export default function PlanScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; event: string; id?: string }>();
  const detail = useLoad<Detail>('app-team.loadEventDetail', p.org ?? '', p.event ?? '');
  const lib = useLoad<LibraryLoad>('app-lesson.loadHomeworkLibrary', p.org ?? '');
  const plan = useLoad<PlanLoaded>('app-team.loadPlan', p.org ?? '', p.id ?? '');
  const [edited, setEdited] = useState<Draft | null>(null);
  const { busy, error, run } = useBusy();

  const ready = detail.data && lib.data && plan.data;
  const base: Draft | null = ready ? (plan.data!.plan ? fromPlan(plan.data!.plan, lib.data!) : { title: '', memberIds: [], picks: [] }) : null;
  const draft = edited ?? base;
  const set = (patch: Partial<Draft>) => draft && setEdited({ ...draft, ...patch });
  const setPicks = (f: (ps: Pick[]) => Pick[]) => draft && setEdited({ ...draft, picks: f(draft.picks) });
  const members = detail.data?.members ?? [];
  const toggleMember = (id: string) =>
    draft && set({ memberIds: draft.memberIds.includes(id) ? draft.memberIds.filter((x) => x !== id) : [...draft.memberIds, id] });

  const save = () =>
    run(async () => {
      if (!draft) return null;
      if (!draft.title.trim()) return '메뉴 이름을 적어 주세요(예: 투수조).';
      if (draft.picks.length === 0) return '메뉴에 넣을 운동을 골라 주세요.';
      const r = await call<{ ok: true; id: string }>('app-team.savePlan', p.org, p.event, {
        id: p.id ?? null,
        title: draft.title,
        memberIds: draft.memberIds,
        items: pickItems(draft.picks),
      });
      if (!r.ok) return ('error' in r && r.error) || '저장하지 못했어요.';
      toast('메뉴를 저장했어요');
      router.back();
      return null;
    });
  const remove = () =>
    Alert.alert('이 메뉴를 지울까요?', '이미 남긴 수행일지는 그대로예요.', [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            const r = await call<{ ok: boolean; error?: string }>('app-team.deletePlan', p.org, p.id);
            if (!r.ok) return ('error' in r && r.error) || '지우지 못했어요.';
            toast('지웠어요');
            router.back();
            return null;
          }),
      },
    ]);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={p.id ? '메뉴 고치기' : '메뉴 만들기'} c={c} />
      {!draft || !lib.data ? (
        <LoadState error={detail.error ?? lib.error ?? plan.error} onRetry={() => void Promise.all([detail.reload(), lib.reload(), plan.reload()])} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Field label="이름" c={c}>
            <Box value={draft.title} onChangeText={(title) => set({ title })} placeholder="투수조" maxLength={PLAN_TITLE_MAX} c={c} />
          </Field>
          <Field label="대상" hint="안 고르면 모두" c={c}>
            <View style={fst.chips}>
              {members.map((m) => {
                const on = draft.memberIds.includes(m.memberId);
                return (
                  <Pressable
                    key={m.memberId}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    onPress={() => toggleMember(m.memberId)}
                    style={[fst.chip, { backgroundColor: on ? c.sky : c.card }]}
                  >
                    <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{m.nickname}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>
          <PickedList picks={draft.picks} setPicks={setPicks} c={c} />
          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          <Primary label={busy ? '저장하는 중…' : '저장'} onPress={() => void save()} disabled={busy} c={c} />
          {p.id ? <DangerLink label="메뉴 지우기" onPress={remove} disabled={busy} c={c} /> : null}
          <LibraryBrowser lib={lib.data} picks={draft.picks} setPicks={setPicks} c={c} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function fromPlan(plan: { title: string; memberIds: string[]; items: unknown }, lib: Library): Draft {
  const names = new Map([...lib.exercises, ...lib.drills].map((x) => [x.id, x.name]));
  const picks = (plan.items as HomeworkItem[]).flatMap((i): Pick[] => {
    const id = i.exerciseId ?? i.guideId;
    if (!id) return [];
    return [{ id, kind: i.exerciseId ? 'exercise' : 'drill', name: names.get(id) ?? '지운 운동', sets: i.sets ? String(i.sets) : '', reps: i.reps ? String(i.reps) : '' }];
  });
  return { title: plan.title, memberIds: plan.memberIds, picks };
}
