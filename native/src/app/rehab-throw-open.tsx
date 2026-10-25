import { REHAB_ENABLED } from '@/lib/armcare/rehab-regions';
import { RehabPausedScreen } from '~/armcare/rehab-paused';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { emptyThrowingDraft, judgeThrowingDraft, throwingFilled, throwingInput } from '@/lib/armcare/rehab-throwing-draft';
import type { AppArmcareGuideTab, AppArmcareTodayTab, AppRehabThrowing } from '@/lib/armcare/today-load';
import { act } from '~/mechanics/parts';
import { JudgedBox, ThrowingTestFields } from '~/rehab/test-fields';
import { usePalette } from '~/lib/ui';
import { StepFrame } from '~/setup/frame';
import { useScreenData } from '~/training/screen';

/**
 * 투구 복귀표 열기(앱 화면) — 웹 rehab-throwing.tsx ThrowingOpenFlow: 지난 7일 안의 매주 확인 % · 자신감과 밀기 · 공 던지기 힘 비교로
 * 그 자리에서 판정하고, 통과면 rehab.openThrowingProgram(서버가 다시 본다). 지난 7일 안의 확인이 없으면 재활 자세히가 매주 확인부터 연다.
 */
function RehabThrowOpenScreen() {
  const c = usePalette();
  const state = useScreenData<AppArmcareTodayTab | AppArmcareGuideTab>('app-training-parts.loadAppArmcare', 'today', 'training-armcare:today');
  const data = state.data?.tab === 'today' ? state.data : null;
  const d = data?.custom.kind === 'rehab' ? data.custom.rehab.detail : null;
  if (!d?.throwing || !d.weeklyRecent) {
    return (
      <StepFrame progress={0} counter="투구 복귀표 열기" title={state.data ? '이번 주 확인을 먼저 해 주세요' : '불러오는 중…'} problem={state.failed} back={{ label: '닫기', onPress: () => router.back() }} next={{ label: '닫기', onPress: () => router.back() }} c={c}>
        <View />
      </StepFrame>
    );
  }
  return <OpenForm view={d.throwing} recent={d.weeklyRecent} />;
}

function OpenForm({ view, recent }: { view: AppRehabThrowing; recent: { normalPct: number; confidence: number } }) {
  const c = usePalette();
  const [draft, setDraft] = useState(emptyThrowingDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filled = throwingFilled(draft, view.hasPlyo);
  const judged = filled ? judgeThrowingDraft(view, draft, recent.normalPct, recent.confidence) : null;

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await act<{ ok: true } | { error: string; fails?: string[] }>('rehab.openThrowingProgram', throwingInput(draft, view.hasPlyo));
    setBusy(false);
    if ('error' in r) return setError(`${r.error}${'fails' in r && r.fails?.length ? ` ${r.fails.join(' · ')}` : ''}`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <StepFrame
      progress={1}
      counter="투구 복귀표 열기"
      title="공 던지기 힘을 양쪽으로 견줘요"
      problem={error}
      back={{ label: '닫기', onPress: () => router.back() }}
      next={{ label: busy ? '여는 중…' : '투구 복귀표 열기', onPress: () => void submit(), disabled: !filled || !judged?.pass || busy }}
      c={c}
    >
      <View style={{ borderRadius: 12, padding: 12, gap: 4, backgroundColor: c.card, boxShadow: c.float }}>
        <Text style={{ color: c.ink, fontSize: 15 }}>
          이번 주 확인 · 다치기 전의 <Text style={{ fontWeight: '700' }}>{recent.normalPct}%</Text> · 던질 자신감 <Text style={{ fontWeight: '700' }}>{recent.confidence}</Text>
        </Text>
        <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
          90% 이상 · 자신감 7 이상이어야 열려요. 공 운동을 통증 없이 {Math.min(view.painFreeBallDays, view.needed)}/{view.needed}일 했어요.
        </Text>
      </View>
      <ThrowingTestFields hasPlyo={view.hasPlyo} draft={draft} onChange={setDraft} c={c} />
      {judged ? <JudgedBox pass={judged.pass} fails={judged.fails} c={c} /> : null}
      <Text style={{ color: c.muted, fontSize: 13 }}>가능하면 진료 때 투구 복귀를 물어보세요.</Text>
    </StepFrame>
  );
}

export default function RehabRoute() {
  return REHAB_ENABLED ? <RehabThrowOpenScreen /> : <RehabPausedScreen />;
}
