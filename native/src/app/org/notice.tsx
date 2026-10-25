import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadOrgNotices } from '@/app/actions/app-org';
import { NOTICE_BODY_MAX, NOTICE_TITLE_MAX } from '@/lib/org/rules';
import { Bar, LoadState, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Box, DangerLink, Field, formCall } from '~/org/forms';
import { Card, Primary } from '~/org/parts';

/** 조직 공지 쓰기 · 고치기 · 지우기(앱 화면, 1.5단계) — 웹과 같은 org-notices.saveOrgNotice · deleteOrgNotice(폼) */
type Loaded = Awaited<ReturnType<typeof loadOrgNotices>>;
type Draft = { title: string; body: string; pinned: boolean };

export default function OrgNoticeScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; id?: string }>();
  const { data, error, reload } = useLoad<Loaded>('app-org.loadOrgNotices', p.org ?? '');
  const [edited, setDraft] = useState<Draft | null>(null);
  const { busy, error: sendError, run } = useBusy();
  const found = data && p.id ? data.notices.find((n) => n.id === p.id) : undefined;
  const draft: Draft | null = edited ?? (data ? (found ? { title: found.title, body: found.body, pinned: found.pinned } : { title: '', body: '', pinned: false }) : null);
  const set = (patch: Partial<Draft>) => {
    if (draft) setDraft({ ...draft, ...patch });
  };

  const save = () =>
    run(async () => {
      if (!draft) return null;
      const r = await formCall('org-notices.saveOrgNotice', {
        orgId: p.org,
        id: found?.id,
        title: draft.title,
        body: draft.body,
        pinned: draft.pinned ? 'on' : null,
      });
      if (r.error) return r.error;
      toast(r.success ?? '올렸어요');
      router.back();
      return null;
    });
  const remove = () =>
    Alert.alert('이 공지를 지울까요?', undefined, [
      { text: '취소', style: 'cancel' },
      {
        text: '지우기',
        style: 'destructive',
        onPress: () =>
          void run(async () => {
            const r = await formCall('org-notices.deleteOrgNotice', { id: found?.id }, true);
            if (r.error) return r.error;
            toast('지웠어요');
            router.back();
            return null;
          }),
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={found ? '공지 고치기' : '공지 쓰기'} c={c} />
      {!data || !draft ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Field label="제목" c={c}>
            <Box value={draft.title} onChangeText={(title) => set({ title })} placeholder="이번 주 훈련 일정 안내" maxLength={NOTICE_TITLE_MAX} c={c} />
          </Field>
          <Field label="내용" c={c}>
            <Box value={draft.body} onChangeText={(body) => set({ body })} placeholder="알릴 것을 적어요" maxLength={NOTICE_BODY_MAX} multiline style={{ minHeight: 200 }} c={c} />
          </Field>
          <Card c={c} style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[TYPE.card, { color: c.ink }]}>맨 위에 고정</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>새 공지가 올라와도 위에 남아요.</Text>
            </View>
            <Switch accessibilityLabel="맨 위에 고정" value={draft.pinned} onValueChange={(pinned) => set({ pinned })} />
          </Card>
          {sendError ? <Text style={[TYPE.body, { color: c.danger }]}>{sendError}</Text> : null}
          <Primary label={busy ? '올리는 중…' : found ? '저장' : '올리기'} onPress={() => void save()} disabled={busy} c={c} />
          {found ? <DangerLink label="공지 지우기" onPress={remove} disabled={busy} c={c} /> : null}
        </ScrollView>
      )}
    </View>
  );
}
