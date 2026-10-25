import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadOrgMember } from '@/app/actions/app-org';
import { Bar, LoadState, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Box, Field, formCall } from '~/org/forms';
import { Primary } from '~/org/parts';

/**
 * 회원 고치기 · 가입 전 자리 만들기(앱 화면, 1.5단계). id 가 있으면 조직 안 이름 · 태그 · 메모 고치기(org.updateMember),
 * 없으면 아직 가입 안 한 회원의 자리(org.addPlaceholderMember) — 일지를 먼저 남기고, 나중에 그 자리 초대 코드로 가입하면 이어받는다.
 */
type Loaded = Awaited<ReturnType<typeof loadOrgMember>>;
type Draft = { nickname: string; tags: string; memo: string };
const EMPTY: Draft = { nickname: '', tags: '', memo: '' };

export default function MemberEditScreen() {
  const c = usePalette();
  const p = useLocalSearchParams<{ org: string; id?: string }>();
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={p.id ? '회원 고치기' : '가입 전 자리'} c={c} />
      {/* 고치기만 읽는다 — 새 자리에서 읽으면 없는 회원이라 다른 화면으로 튕겼다 */}
      {p.id ? <EditMember org={p.org ?? ''} id={p.id} /> : <MemberForm org={p.org ?? ''} initial={EMPTY} />}
    </View>
  );
}

function EditMember({ org, id }: { org: string; id: string }) {
  const c = usePalette();
  const { data, error, reload } = useLoad<Loaded>('app-org.loadOrgMember', org, id);
  if (!data) return <LoadState error={error} onRetry={() => void reload()} c={c} />;
  return <MemberForm org={org} id={id} initial={{ nickname: data.member.nickname, tags: data.member.tags.join(', '), memo: data.member.memo ?? '' }} />;
}

function MemberForm({ org, id, initial }: { org: string; id?: string; initial: Draft }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const editing = !!id;
  const [draft, setDraft] = useState<Draft>(initial);
  const { busy, error: sendError, run } = useBusy();
  const set = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });

  const save = () =>
    run(async () => {
      const r = editing
        ? await formCall('org.updateMember', { id, nickname: draft.nickname, tags: draft.tags, memo: draft.memo })
        : await formCall('org.addPlaceholderMember', { orgId: org, nickname: draft.nickname, tags: draft.tags });
      if (r.error) return r.error;
      toast(r.success ?? '저장했어요');
      router.back();
      return null;
    });

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
      {!editing ? (
        <Text style={[TYPE.body, { color: c.muted }]}>
          아직 싱커에 가입하지 않은 사람의 자리예요. 일지를 먼저 남기고, 회원 카드에서 그 자리 초대 코드를 보내면 가입하면서 이어받아요.
        </Text>
      ) : null}
      <Field label="이름" hint="조직 안에서 부르는 이름" c={c}>
        <Box value={draft.nickname} onChangeText={(nickname) => set({ nickname })} placeholder="홍길동" maxLength={20} c={c} />
      </Field>
      <Field label="태그" hint="쉼표로 · 포지션 · 학년 · 묶음" c={c}>
        <Box value={draft.tags} onChangeText={(tags) => set({ tags })} placeholder="투수, 중2, 투수조" c={c} />
      </Field>
      {editing ? (
        <Field label="메모" hint="코치만 봐요" c={c}>
          <Box value={draft.memo} onChangeText={(memo) => set({ memo })} placeholder="부상 이력 · 목표" maxLength={500} multiline c={c} />
        </Field>
      ) : null}
      {sendError ? <Text style={[TYPE.body, { color: c.danger }]}>{sendError}</Text> : null}
      <Primary label={busy ? '저장하는 중…' : editing ? '저장' : '자리 만들기'} onPress={() => void save()} disabled={busy} c={c} />
    </ScrollView>
  );
}
