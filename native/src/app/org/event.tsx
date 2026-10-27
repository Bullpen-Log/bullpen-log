import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadOrgEvents } from '@/app/actions/app-org';
import { EVENT_KINDS, EVENT_MEMO_MAX, EVENT_TITLE_MAX, timeOk, type EventKind } from '@/lib/org/rules';
import { EVENT_STATUSES, EVENT_STATUS_LABEL, type EventStatus } from '@/lib/org/lesson-pitch';
import { toDateKey } from '@/lib/pitch-stats';
import { Bar, LoadState, call, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Box, ChoiceChips, DangerLink, DateStepper, Field, formCall } from '~/org/forms';
import { Primary } from '~/org/parts';
import { useDraftGuard } from '~/org/space-store';

/**
 * 조직 일정 만들기 · 고치기 · 지우기(앱 화면, 1.5단계) — 팀 훈련 · 경기 · 휴식, 레슨장 레슨 시간. 저장은 웹과 같은 org-calendar.saveOrgEvent(폼),
 * 지우기는 org-calendar.deleteOrgEvent. 레슨은 회원을 고르면 제목이 비어도 '○○ 레슨'이 된다(서버).
 * 2단계: 있는 일정은 지도 확인(예정 · 실시 · 취소)을 바로 바꾼다(org-calendar.setOrgEventStatus) — 출석 · 수강권과는 상관없다.
 * 지우거나 취소할 때 확인한 팀 훈련 기록이 있으면 같이 뺄지 묻는다(계약 9-6 ①-6 F, 결정 4 — 기본은 둔다).
 */
type Loaded = Awaited<ReturnType<typeof loadOrgEvents>>;
type Draft = { date: string; kind: EventKind; time: string; title: string; memo: string; memberId: string | null };

export default function OrgEventScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; id?: string; date?: string }>();
  const day = p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date) ? p.date : toDateKey(new Date());
  const { data, error, reload } = useLoad<Loaded>('app-org.loadOrgEvents', p.org ?? '', day, 1);
  const [edited, setDraft] = useState<Draft | null>(null);
  const { busy, error: sendError, run } = useBusy();
  /* 쓰던 글 — 다른 조직 알림으로 옮기거나 권한을 잃을 때 묻는다(계약 8-5) */
  useDraftGuard(edited != null);

  const found = data && p.id ? data.events.find((e) => e.id === p.id) : undefined;
  const lesson = data?.kind === 'LESSON';
  /* 일지가 만든 팀 개인 지도(lesson)도 고칠 때는 그 종류를 보인다 */
  const kinds = EVENT_KINDS.filter((k) => k.key === found?.kind || (lesson ? k.key !== 'training' && k.key !== 'game' : k.key !== 'lesson')).map((k) => ({
    value: k.key,
    label: k.label,
  }));
  const draft: Draft | null =
    edited ??
    (data
      ? found
        ? { date: found.date, kind: found.kind as EventKind, time: found.time ?? '', title: found.title, memo: found.memo ?? '', memberId: found.memberId }
        : { date: day, kind: lesson ? 'lesson' : 'training', time: '', title: '', memo: '', memberId: null }
      : null);
  const set = (patch: Partial<Draft>) => {
    if (draft) setDraft({ ...draft, ...patch });
  };

  const save = () =>
    run(async () => {
      if (!draft) return null;
      if (draft.time && !timeOk(draft.time)) return '시각은 19:00 처럼 적어 주세요.';
      const r = await formCall('org-calendar.saveOrgEvent', {
        orgId: p.org,
        id: found?.id,
        date: draft.date,
        time: draft.time,
        kind: draft.kind,
        title: draft.title,
        memo: draft.memo,
        memberId: draft.kind === 'lesson' ? draft.memberId : null,
      });
      if (r.error) return r.error;
      toast(r.success ?? '저장했어요');
      router.back();
      return null;
    });
  /** 남긴 팀 훈련 기록이 있으면 같이 뺄지 묻는다 — 'keep' · 'remove', 그만두면 null */
  const askWork = async (title: string): Promise<'keep' | 'remove' | null> => {
    if (!found) return 'keep';
    const w = await call<{ ok: boolean; sets?: number; players?: number }>('app-team.loadEventWork', p.org, found.id);
    if (!w.ok || !w.sets) return 'keep';
    return new Promise((done) =>
      Alert.alert(
        title,
        `이 일정에 선수 ${w.players}명의 팀 훈련 기록 ${w.sets}개(세트 · 투구)를 남겼어요. 실제로 한 운동이면 두세요.`,
        [
          { text: '그만두기', style: 'cancel', onPress: () => done(null) },
          { text: '기록은 두기', onPress: () => done('keep') },
          { text: '기록도 빼기', style: 'destructive', onPress: () => done('remove') },
        ],
        { cancelable: true, onDismiss: () => done(null) }
      )
    );
  };
  const setStatus = (status: EventStatus) =>
    void run(async () => {
      if (!found || found.status === status) return null;
      const work = status === 'canceled' ? await askWork('일정을 취소할까요?') : 'keep';
      if (!work) return null;
      const r = await formCall('org-calendar.setOrgEventStatus', { id: found.id, status, work }, true);
      if (r.error) return r.error;
      toast(r.success ?? '바꿨어요');
      await reload();
      return null;
    });
  const remove = () =>
    Alert.alert('이 일정을 지울까요?', undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            const work = await askWork('팀 훈련 기록도 뺄까요?');
            if (!work) return null;
            const r = await formCall('org-calendar.deleteOrgEvent', { id: found?.id, work }, true);
            if (r.error) return r.error;
            toast('지웠어요');
            router.back();
            return null;
          }),
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={found ? '일정 고치기' : '일정 더하기'} c={c} />
      {!data || !draft ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          {found ? (
            <Field label="지도 확인" hint="출석 · 수강권과 상관없어요" c={c}>
              <ChoiceChips
                options={EVENT_STATUSES.map((v) => ({ value: v, label: EVENT_STATUS_LABEL[v] }))}
                value={found.status as EventStatus}
                onChange={setStatus}
                c={c}
              />
            </Field>
          ) : null}
          <Field label="날짜" c={c}>
            <DateStepper value={draft.date} onChange={(date) => set({ date })} c={c} />
          </Field>
          <Field label="종류" c={c}>
            <ChoiceChips options={kinds} value={draft.kind} onChange={(kind) => set({ kind })} c={c} />
          </Field>
          {draft.kind === 'lesson' ? (
            <Field label="회원" hint="고르면 제목이 '○○ 레슨'" c={c}>
              {data.members.length ? (
                <ChoiceChips options={data.members.map((m) => ({ value: m.id, label: m.nickname }))} value={draft.memberId} onChange={(memberId) => set({ memberId })} c={c} />
              ) : (
                <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>아직 회원이 없어요.</Text>
              )}
            </Field>
          ) : null}
          <Field label="시각" hint="비우면 하루 종일" c={c}>
            <Box value={draft.time} onChangeText={(time) => set({ time: time.replace(/[^\d:]/g, '').slice(0, 5) })} placeholder="19:00" keyboardType="numbers-and-punctuation" maxLength={5} c={c} />
          </Field>
          <Field label="제목" c={c}>
            <Box value={draft.title} onChangeText={(title) => set({ title })} placeholder={draft.kind === 'game' ? '○○ 리그 3차전' : draft.kind === 'lesson' ? '비우면 회원 이름으로' : '오후 팀 훈련'} maxLength={EVENT_TITLE_MAX} c={c} />
          </Field>
          <Field label="메모" hint="선택" c={c}>
            <Box value={draft.memo} onChangeText={(memo) => set({ memo })} placeholder="장소 · 준비물" maxLength={EVENT_MEMO_MAX} multiline c={c} />
          </Field>
          {sendError ? <Text style={[TYPE.body, { color: c.danger }]}>{sendError}</Text> : null}
          <Primary label={busy ? '저장하는 중…' : '저장'} onPress={() => void save()} disabled={busy} c={c} />
          {found ? <DangerLink label="일정 지우기" onPress={remove} disabled={busy} c={c} /> : null}
        </ScrollView>
      )}
    </View>
  );
}
