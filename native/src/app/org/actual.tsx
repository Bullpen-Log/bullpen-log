import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadEventDetail } from '@/app/actions/app-team';
import { LINES_MAX } from '@/lib/org/team-session';
import { Bar, LoadState, call, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { DangerLink } from '~/org/forms';
import { GroupTitle, Primary } from '~/org/parts';
import { LineEditor, fromLines, picksOf, toLines, withPicks, type LineDraft } from '~/org/lines';
import { LibraryBrowser, type LibraryLoad, type Pick } from '~/org/picker';
import { useDraftGuard } from '~/org/space-store';

/**
 * 조 실제 고치기(팀 훈련 실제 확인, 계약 11-3 ③-1) — 활동 하나가 실제로 한 세트 · 횟수 · 초(예: 비로 근력 3세트 → 2세트).
 * 무게는 조 공통으로 안 적는다(선수마다 다름 — 적고 싶으면 그 선수 예외에서). 저장은 app-team.saveActual — 기록은 '이대로 확인' 때 바뀐다.
 */
type Detail = Awaited<ReturnType<typeof loadEventDetail>>;

export default function ActualScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; event: string; plan: string }>();
  const detail = useLoad<Detail>('app-team.loadEventDetail', p.org ?? '', p.event ?? '');
  const lib = useLoad<LibraryLoad>('app-lesson.loadHomeworkLibrary', p.org ?? '');
  const [edited, setEdited] = useState<LineDraft[] | null>(null);
  const { busy, error, run } = useBusy();
  useDraftGuard(edited != null);

  const plan = detail.data?.plans.find((x) => x.id === p.plan) ?? null;
  const lines = edited ?? (plan && detail.data ? fromLines(plan.actual, detail.data.names) : null);
  const setPicks = (f: (ps: Pick[]) => Pick[]) => lines && setEdited(withPicks(lines, f(picksOf(lines))));

  const save = (items: unknown) =>
    run(async () => {
      const r = await call<{ ok: boolean; error?: string }>('app-team.saveActual', p.org, p.event, p.plan, items);
      if (!r.ok) return ('error' in r && r.error) || '저장하지 못했어요.';
      toast(items == null ? '계획대로 되돌렸어요' : '실제를 고쳤어요');
      router.back();
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={plan ? `${plan.title} 실제` : '실제'} c={c} />
      {!lines || !lib.data ? (
        <LoadState error={detail.error ?? lib.error ?? (detail.data && !plan ? '활동을 찾을 수 없어요.' : null)} onRetry={() => void Promise.all([detail.reload(), lib.reload()])} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <Text style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>
            예외가 없는 선수 모두에게 이대로 들어가요. 무게는 선수마다 달라 여기서 안 적어요.
          </Text>
          <LineEditor lines={lines} onChange={setEdited} weight={false} empty="운동이 없어요. 저장하면 이 활동은 아무것도 안 한 것으로 돼요." c={c} />
          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          <Primary label={busy ? '저장하는 중…' : '저장'} onPress={() => void save(toLines(lines, false))} disabled={busy} c={c} />
          {plan?.actualSet ? (
            <DangerLink
              label="계획대로 되돌리기"
              onPress={() => Alert.alert('계획대로 되돌릴까요?', '고친 실제를 지워요.', [{ text: '취소', style: 'cancel' }, { text: '되돌리기', onPress: () => void save(null) }])}
              disabled={busy}
              c={c}
            />
          ) : null}
          <View style={{ gap: 6 }}>
            <GroupTitle title="운동 더하기" c={c} />
            <LibraryBrowser lib={lib.data} picks={picksOf(lines)} setPicks={setPicks} max={LINES_MAX} c={c} />
          </View>
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
