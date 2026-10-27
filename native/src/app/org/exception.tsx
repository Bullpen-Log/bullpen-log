import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventDetail, loadEventDetail } from '@/app/actions/app-team';
import { EXCEPTION_LABEL, LINES_MAX, NOTE_MAX, type ExceptionKind } from '@/lib/org/team-session';
import { EFFORT_CHIPS, effortScaleText } from '@/lib/pitch-effort';
import { Bar, LoadState, call, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Segmented } from '~/shell/heading';
import { toast } from '~/shell/toast';
import { Box, ChoiceChips, DangerLink, Field } from '~/org/forms';
import { Card, GroupTitle, Primary } from '~/org/parts';
import { LineEditor, fromLines, picksOf, plansOfMember, toLines, withPicks, type LineDraft } from '~/org/lines';
import { LibraryBrowser, Num, type LibraryLoad, type Pick } from '~/org/picker';
import { useDraftGuard } from '~/org/space-store';

/**
 * 선수 한 명의 예외(팀 훈련 실제 확인, 계약 11-3 ③-3) — 활동마다 [같음 · 빠짐 · 줄임 · 다른 운동] + 까닭, '이 활동까지만'(일부 참여), 더 한 운동, 투구 수.
 * '줄임' · '다른 운동'은 그 선수가 실제로 한 값이라 조 실제를 고쳐도 안 흔들린다. 저장은 app-team.saveMemberResult — 기록은 '이대로 확인' 때.
 */
type Detail = Awaited<ReturnType<typeof loadEventDetail>>;
type State = 'same' | ExceptionKind;
type PlanDraft = { kind: State; lines: LineDraft[]; note: string };
type Pitch = { count: string; effort: string; kmh: string };
type Draft = { plans: Record<string, PlanDraft>; extra: LineDraft[]; extraNote: string; pitch: Record<string, Pitch> };

const STATES = [
  { value: 'same', label: '같음' },
  { value: 'absent', label: EXCEPTION_LABEL.absent },
  { value: 'reduced', label: EXCEPTION_LABEL.reduced },
  { value: 'substitute', label: EXCEPTION_LABEL.substitute },
] as const;
const EFFORTS = EFFORT_CHIPS.map((p) => ({ value: String(p), label: effortScaleText(p) }));

function draftOf(d: EventDetail, memberId: string): Draft {
  const m = d.members.find((x) => x.memberId === memberId);
  const plans: Record<string, PlanDraft> = {};
  for (const p of plansOfMember(d, memberId)) {
    const e = m?.exception?.items.find((x) => x.planId === p.id);
    plans[p.id] = { kind: e?.kind ?? 'same', lines: fromLines(e?.items ?? p.actual, d.names), note: e?.note ?? '' };
  }
  const pitch: Record<string, Pitch> = {};
  for (const v of m?.values ?? []) pitch[v.planId] = { count: String(v.pitchCount), effort: String(v.effortPct), kmh: v.maxVelocity ? String(v.maxVelocity) : '' };
  return {
    plans,
    extra: fromLines(m?.exception?.extra.flatMap((x) => x.items) ?? [], d.names),
    extraNote: m?.exception?.extra[0]?.note ?? '',
    pitch,
  };
}

export default function ExceptionScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; event: string; member: string }>();
  const detail = useLoad<Detail>('app-team.loadEventDetail', p.org ?? '', p.event ?? '');
  const lib = useLoad<LibraryLoad>('app-lesson.loadHomeworkLibrary', p.org ?? '');
  const [edited, setEdited] = useState<Draft | null>(null);
  const [browse, setBrowse] = useState<string | null>(null);
  const { busy, error, run } = useBusy();
  useDraftGuard(edited != null);

  const d = detail.data ?? null;
  const member = d?.members.find((x) => x.memberId === p.member) ?? null;
  const mine = d && member ? plansOfMember(d, member.memberId) : [];
  const draft = edited ?? (d && member ? draftOf(d, member.memberId) : null);
  const setPlan = (id: string, v: Partial<PlanDraft>) => draft && setEdited({ ...draft, plans: { ...draft.plans, [id]: { ...draft.plans[id], ...v } } });
  const setPitch = (id: string, v: Partial<Pitch>) =>
    draft && setEdited({ ...draft, pitch: { ...draft.pitch, [id]: { ...(draft.pitch[id] ?? { count: '', effort: '', kmh: '' }), ...v } } });
  /* 일부 참여 — 이 활동까지만 했어요: 뒤 활동은 빠짐 */
  const upTo = (i: number) =>
    draft && setEdited({ ...draft, plans: Object.fromEntries(mine.map((pl, n) => [pl.id, n > i ? { ...draft.plans[pl.id], kind: 'absent' as const } : draft.plans[pl.id]])) });
  const pickTo = (key: string) => (f: (ps: Pick[]) => Pick[]) => {
    if (!draft) return;
    if (key === 'extra') setEdited({ ...draft, extra: withPicks(draft.extra, f(picksOf(draft.extra))) });
    else setPlan(key, { lines: withPicks(draft.plans[key].lines, f(picksOf(draft.plans[key].lines))) });
  };

  const save = (reset = false) =>
    run(async () => {
      if (!draft || !member) return null;
      const items = reset
        ? []
        : mine
            .filter((pl) => draft.plans[pl.id].kind !== 'same')
            .map((pl) => {
              const x = draft.plans[pl.id];
              return { planId: pl.id, kind: x.kind, ...(x.kind === 'absent' ? {} : { items: toLines(x.lines, true) }), note: x.note.trim() || undefined };
            });
      const extra = !reset && draft.extra.length ? [{ items: toLines(draft.extra, true), note: draft.extraNote.trim() || undefined }] : [];
      const values = reset
        ? []
        : mine
            .filter((pl) => pl.valueMode === 'individual' && draft.pitch[pl.id]?.count)
            .map((pl) => ({ planId: pl.id, pitchCount: Number(draft.pitch[pl.id].count), effortPct: draft.pitch[pl.id].effort ? Number(draft.pitch[pl.id].effort) : null, maxVelocity: draft.pitch[pl.id].kmh || null }));
      const r = await call<{ ok: boolean; error?: string }>('app-team.saveMemberResult', p.org, p.event, member.memberId, {
        exception: { items, extra, separate: reset ? [] : (member.exception?.separate ?? []) },
        values,
      });
      if (!r.ok) return ('error' in r && r.error) || '저장하지 못했어요.';
      toast(reset ? '조와 같게 했어요' : '적어 두었어요 · 확인하면 기록돼요');
      router.back();
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={member ? `${member.nickname} 예외` : '예외'} c={c} />
      {!draft || !lib.data || !member ? (
        <LoadState error={detail.error ?? lib.error ?? (d && !member ? '명단에 없는 선수예요.' : null)} onRetry={() => void Promise.all([detail.reload(), lib.reload()])} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>다르게 한 활동만 바꿔요. 저장해도 바로 기록되지 않고 &lsquo;이대로 확인&rsquo; 때 들어가요.</Text>
          {mine.map((pl, i) => {
            const x = draft.plans[pl.id];
            return (
              <View key={pl.id} style={{ gap: 6 }}>
                <GroupTitle title={`${pl.title}${pl.groupName ? ` · ${pl.groupName}` : ''}`} c={c} />
                <Card c={c}>
                  <Segmented label="결과" options={STATES} value={x.kind} onChange={(kind) => setPlan(pl.id, { kind })} />
                  {x.kind === 'same' ? <Text style={[TYPE.sub, { color: c.muted }]}>{pl.actualLines.map((l) => `${l.name}${l.dose ? ` ${l.dose}` : ''}`).join(' · ') || '운동 없음'}</Text> : null}
                  {x.kind !== 'same' ? (
                    <Box value={x.note} onChangeText={(note) => setPlan(pl.id, { note })} placeholder="까닭(선택) — 어깨 피로" maxLength={NOTE_MAX} c={c} />
                  ) : null}
                  {i < mine.length - 1 && x.kind !== 'absent' ? <SmallLink label="이 활동까지만 했어요(뒤는 빠짐)" onPress={() => upTo(i)} c={c} /> : null}
                </Card>
                {x.kind === 'reduced' || x.kind === 'substitute' ? (
                  <>
                    <LineEditor lines={x.lines} onChange={(lines) => setPlan(pl.id, { lines })} weight empty="실제로 한 운동을 골라 주세요." c={c} />
                    <SmallLink label={browse === pl.id ? '운동 고르기 닫기' : '+ 운동 고르기'} onPress={() => setBrowse(browse === pl.id ? null : pl.id)} c={c} />
                    {browse === pl.id ? <LibraryBrowser lib={lib.data!} picks={picksOf(x.lines)} setPicks={pickTo(pl.id)} max={LINES_MAX} c={c} /> : null}
                  </>
                ) : null}
                {pl.valueMode === 'individual' && x.kind !== 'absent' ? <PitchRow v={draft.pitch[pl.id]} onChange={(v) => setPitch(pl.id, v)} c={c} /> : null}
              </View>
            );
          })}
          <View style={{ gap: 6 }}>
            <GroupTitle title="더 한 운동" c={c} />
            <LineEditor lines={draft.extra} onChange={(extra) => setEdited({ ...draft, extra })} weight empty="남들이 안 한 운동을 더 했으면 골라요." c={c} />
            {draft.extra.length ? <Box value={draft.extraNote} onChangeText={(extraNote) => setEdited({ ...draft, extraNote })} placeholder="까닭(선택)" maxLength={NOTE_MAX} c={c} /> : null}
            <SmallLink label={browse === 'extra' ? '운동 고르기 닫기' : '+ 운동 고르기'} onPress={() => setBrowse(browse === 'extra' ? null : 'extra')} c={c} />
            {browse === 'extra' ? <LibraryBrowser lib={lib.data} picks={picksOf(draft.extra)} setPicks={pickTo('extra')} max={LINES_MAX} c={c} /> : null}
          </View>
          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          <Primary label={busy ? '저장하는 중…' : '저장'} onPress={() => void save()} disabled={busy} c={c} />
          {member.exception || member.values.length ? <DangerLink label="조와 같게 되돌리기" onPress={() => void save(true)} disabled={busy} c={c} /> : null}
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}

function PitchRow({ v, onChange, c }: { v: Pitch | undefined; onChange: (v: Partial<Pitch>) => void; c: Palette }) {
  return (
    <Card c={c}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>던진 공</Text>
        <Num value={v?.count ?? ''} onChange={(count) => onChange({ count })} unit="구" max={3} c={c} />
        <Num value={v?.kmh ?? ''} onChange={(kmh) => onChange({ kmh })} unit="km/h" max={5} decimal c={c} />
      </View>
      <Field label="체감 강도" hint="1 가볍게 ~ 10 전력" c={c}>
        <ChoiceChips options={EFFORTS} value={v?.effort || null} onChange={(effort) => onChange({ effort })} c={c} />
      </Field>
    </Card>
  );
}

function SmallLink({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} hitSlop={6} style={{ minHeight: 36, justifyContent: 'center' }}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '600' }]}>{label}</Text>
    </Pressable>
  );
}

