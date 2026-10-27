import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadEventDetail, loadPlan } from '@/app/actions/app-team';
import type { HomeworkItem } from '@/lib/org/homework';
import { PLAN_TITLE_MAX } from '@/lib/org/team';
import { PLAN_SCOPE_LABEL, type PlanScope, type ValueMode } from '@/lib/org/team-session';
import { Bar, LoadState, call, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Segmented } from '~/shell/heading';
import { Box, ChoiceChips, DangerLink, Field, st as fst } from '~/org/forms';
import { Primary } from '~/org/parts';
import { LibraryBrowser, PickedList, pickItems, type Library, type LibraryLoad, type Pick } from '~/org/picker';
import { useDraftGuard } from '~/org/space-store';

/**
 * 훈련 활동 만들기 · 고치기(앱 화면, 계약 11-3 ①) — 이름 · 대상([전체 · 조 · 개인]) · 라이브러리 운동 · 드릴 · 투구를 선수마다 받기. 저장은 app-team.savePlan.
 * 조는 태그 칩을 눌러 고르고(그 태그의 명단 선수가 담김) 손으로 더하거나 뺀다. 개인은 한 명 — 더하기(남들이 안 하는 것) 또는 바꾸기(그 선수만 어떤 조 활동 대신).
 * 활동은 계획일 뿐 선수 기록에 안 들어간다 — 끝난 뒤 훈련 화면의 '실제 확인'에서 한 번에 확인한다.
 */
type Detail = Awaited<ReturnType<typeof loadEventDetail>>;
type PlanLoaded = Awaited<ReturnType<typeof loadPlan>>;
type Draft = { title: string; scope: PlanScope; groupName: string; memberIds: string[]; replacesPlanId: string | null; valueMode: ValueMode; picks: Pick[] };
const SCOPES = (['all', 'group', 'member'] as const).map((value) => ({ value, label: PLAN_SCOPE_LABEL[value] }));

export default function PlanScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; event: string; id?: string }>();
  const detail = useLoad<Detail>('app-team.loadEventDetail', p.org ?? '', p.event ?? '');
  const lib = useLoad<LibraryLoad>('app-lesson.loadHomeworkLibrary', p.org ?? '');
  const plan = useLoad<PlanLoaded>('app-team.loadPlan', p.org ?? '', p.id ?? '');
  const [edited, setEdited] = useState<Draft | null>(null);
  const { busy, error, run } = useBusy();
  /* 쓰던 글 — 다른 조직 알림으로 옮기거나 권한을 잃을 때 묻는다(계약 8-5) */
  useDraftGuard(edited != null);

  const ready = detail.data && lib.data && plan.data;
  const base: Draft | null = ready
    ? plan.data!.plan
      ? fromPlan(plan.data!.plan, lib.data!)
      : { title: '', scope: 'all', groupName: '', memberIds: [], replacesPlanId: null, valueMode: 'shared', picks: [] }
    : null;
  const draft = edited ?? base;
  const set = (patch: Partial<Draft>) => draft && setEdited({ ...draft, ...patch });
  const setPicks = (f: (ps: Pick[]) => Pick[]) => draft && setEdited({ ...draft, picks: f(draft.picks) });
  const members = (detail.data?.members ?? []).filter((m) => !m.left);
  const toggleMember = (id: string) =>
    draft && set({ memberIds: draft.memberIds.includes(id) ? draft.memberIds.filter((x) => x !== id) : [...draft.memberIds, id] });
  /* 태그 칩 — 그 태그의 명단 선수를 담고 조 이름도 그 태그로 */
  const pickTag = (tag: string) => draft && set({ groupName: tag, memberIds: members.filter((m) => m.tags.includes(tag)).map((m) => m.memberId) });
  /* 개인 바꾸기 — 그 선수가 하는 조 활동만(개인 활동 · 이 활동 빼고) */
  const replaceable = (detail.data?.plans ?? []).filter((x) => x.scope !== 'member' && x.id !== p.id && draft?.memberIds[0] != null && x.targets.includes(draft.memberIds[0]));

  const save = () =>
    run(async () => {
      if (!draft) return null;
      if (!draft.title.trim()) return '활동 이름을 적어 주세요(예: 전체 워밍업).';
      if (draft.picks.length === 0 && draft.valueMode !== 'individual') return '활동에 넣을 운동을 골라 주세요.';
      if (draft.scope === 'group' && draft.memberIds.length === 0) return '조에 넣을 선수를 골라 주세요.';
      if (draft.scope === 'member' && draft.memberIds.length !== 1) return '선수 한 명을 골라 주세요.';
      const r = await call<{ ok: true; id: string }>('app-team.savePlan', p.org, p.event, {
        id: p.id ?? null,
        title: draft.title,
        scope: draft.scope,
        groupName: draft.scope === 'group' ? draft.groupName : null,
        memberIds: draft.scope === 'all' ? [] : draft.memberIds,
        replacesPlanId: draft.scope === 'member' ? draft.replacesPlanId : null,
        valueMode: draft.valueMode,
        items: pickItems(draft.picks),
      });
      if (!r.ok) return ('error' in r && r.error) || '저장하지 못했어요.';
      toast('활동을 저장했어요');
      router.back();
      return null;
    });
  const remove = () =>
    Alert.alert('이 활동을 지울까요?', '이 활동을 대신하던 개인 바꾸기도 같이 지워요. 이미 남긴 기록은 다시 확인할 때 바뀌어요.', [
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
      <Bar back="뒤로" title={p.id ? '활동 고치기' : '활동 만들기'} c={c} />
      {!draft || !lib.data ? (
        <LoadState error={detail.error ?? lib.error ?? plan.error} onRetry={() => void Promise.all([detail.reload(), lib.reload(), plan.reload()])} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Field label="이름" c={c}>
            <Box value={draft.title} onChangeText={(title) => set({ title })} placeholder="전체 워밍업" maxLength={PLAN_TITLE_MAX} c={c} />
          </Field>
          <Segmented label="대상" options={SCOPES} value={draft.scope} onChange={(scope) => set({ scope, memberIds: scope === 'member' ? draft.memberIds.slice(0, 1) : draft.memberIds })} />
          {draft.scope === 'group' && detail.data?.tags.length ? (
            <Field label="태그로 고르기" hint="그 태그의 명단 선수가 담겨요" c={c}>
              <ChoiceChips options={detail.data.tags.map((t) => ({ value: t, label: t }))} value={draft.groupName || null} onChange={pickTag} c={c} />
            </Field>
          ) : null}
          {draft.scope === 'group' ? (
            <Field label="조 이름" hint="표시만" c={c}>
              <Box value={draft.groupName} onChangeText={(groupName) => set({ groupName })} placeholder="투수" maxLength={20} c={c} />
            </Field>
          ) : null}
          {draft.scope !== 'all' ? (
            <Field label={draft.scope === 'group' ? `선수 ${draft.memberIds.length}명` : '선수 한 명'} c={c}>
              <View style={fst.chips}>
                {members.map((m) => {
                  const on = draft.memberIds.includes(m.memberId);
                  return (
                    <Pressable
                      key={m.memberId}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() => (draft.scope === 'member' ? set({ memberIds: [m.memberId], replacesPlanId: null }) : toggleMember(m.memberId))}
                      style={[fst.chip, { backgroundColor: on ? c.sky : c.card }]}
                    >
                      <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{m.nickname}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </Field>
          ) : null}
          {draft.scope === 'member' && draft.memberIds.length === 1 ? (
            <Field label="이 선수만" hint="바꾸기는 그 조 활동 대신" c={c}>
              <ChoiceChips
                options={[{ value: '', label: '더하기' }, ...replaceable.map((x) => ({ value: x.id, label: `${x.title} 대신` }))]}
                value={draft.replacesPlanId ?? ''}
                onChange={(v) => set({ replacesPlanId: v || null })}
                c={c}
              />
            </Field>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 4 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.card, { color: c.ink }]}>투구 수를 선수마다 받기</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>불펜처럼 선수마다 다른 값 — 조 전체에 같은 투구 수는 안 넣어요</Text>
            </View>
            <Switch accessibilityLabel="투구 수를 선수마다 받기" value={draft.valueMode === 'individual'} onValueChange={(on) => void set({ valueMode: on ? 'individual' : 'shared' })} />
          </View>
          <PickedList picks={draft.picks} setPicks={setPicks} c={c} />
          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          <Primary label={busy ? '저장하는 중…' : '저장'} onPress={() => void save()} disabled={busy} c={c} />
          {p.id ? <DangerLink label="활동 지우기" onPress={remove} disabled={busy} c={c} /> : null}
          <LibraryBrowser lib={lib.data} picks={draft.picks} setPicks={setPicks} c={c} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function fromPlan(
  plan: { title: string; memberIds: string[]; items: unknown; scope: PlanScope; groupName: string | null; replacesPlanId: string | null; valueMode: ValueMode },
  lib: Library
): Draft {
  const names = new Map([...lib.exercises, ...lib.drills].map((x) => [x.id, x.name]));
  const picks = (plan.items as HomeworkItem[]).flatMap((i): Pick[] => {
    const id = i.exerciseId ?? i.guideId;
    if (!id) return [];
    return [{ id, kind: i.exerciseId ? 'exercise' : 'drill', name: names.get(id) ?? '지운 운동', sets: i.sets ? String(i.sets) : '', reps: i.reps ? String(i.reps) : '' }];
  });
  return { title: plan.title, scope: plan.scope, groupName: plan.groupName ?? '', memberIds: plan.memberIds, replacesPlanId: plan.replacesPlanId, valueMode: plan.valueMode, picks };
}
