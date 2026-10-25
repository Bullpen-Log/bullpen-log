import { REHAB_ENABLED } from '@/lib/armcare/rehab-regions';
import { RehabPausedScreen } from '~/armcare/rehab-paused';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { REHAB_STAGES, judgeStageTest, type RehabStage, type StageTest } from '@/lib/armcare/rehab';
import { emptyStageTestDraft, stageTestFilled, stageTestInput } from '@/lib/armcare/rehab-test-draft';
import type { AppArmcareGuideTab, AppArmcareTodayTab, AppRehabDetail } from '@/lib/armcare/today-load';
import { act } from '~/mechanics/parts';
import { JudgedBox, StageTestFields } from '~/rehab/test-fields';
import { usePalette } from '~/lib/ui';
import { StepFrame } from '~/setup/frame';
import { useScreenData } from '~/training/screen';

/**
 * 단계 시험(앱 화면) — 웹 rehab-sheets.tsx StageTestSheet: 그 단계의 시험(가이드라인 9절)을 적으면 그 자리에서 판정하고, 통과면 [N단계로].
 * 서버(rehab.changeRehabStage via test)가 올리는 조건과 시험을 한 번 더 본다. 재활 자세히(rehab.tsx)에서 연다.
 */
function RehabTestScreen() {
  const c = usePalette();
  const state = useScreenData<AppArmcareTodayTab | AppArmcareGuideTab>('app-training-parts.loadAppArmcare', 'today', 'training-armcare:today');
  const data = state.data?.tab === 'today' ? state.data : null;
  const d = data?.custom.kind === 'rehab' ? data.custom.rehab.detail : null;
  if (!d?.stageTest) {
    return (
      <StepFrame progress={0} counter="단계 시험" title={state.data ? '이 단계는 시험이 없어요' : '불러오는 중…'} problem={state.failed} back={{ label: '닫기', onPress: () => router.back() }} next={{ label: '닫기', onPress: () => router.back() }} c={c}>
        <View />
      </StepFrame>
    );
  }
  return <TestForm d={d} test={d.stageTest} />;
}

function TestForm({ d, test }: { d: AppRehabDetail; test: StageTest }) {
  const c = usePalette();
  const [draft, setDraft] = useState(() => emptyStageTestDraft(d.ckcFirst));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const next = (d.stage + 1) as RehabStage;
  const input = stageTestInput(test, draft);
  const filled = stageTestFilled(test, draft);
  const judged = judgeStageTest(test, input);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await act<{ ok: true } | { error: string; fails?: string[] }>('rehab.changeRehabStage', { to: next, via: 'test', test: input });
    setBusy(false);
    if ('error' in r) return setError(`${r.error}${'fails' in r && r.fails?.length ? ` ${r.fails.join(' · ')}` : ''}`);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <StepFrame
      progress={1}
      counter={`${d.stage}단계 → ${next}단계 ${REHAB_STAGES[next].name}`}
      title="단계 시험"
      desc={test.method}
      problem={error}
      back={{ label: '닫기', onPress: () => router.back() }}
      next={{ label: busy ? '저장하는 중…' : `${next}단계로`, onPress: () => void submit(), disabled: !filled || !judged.pass || !d.gate.ready || busy }}
      c={c}
    >
      <StageTestFields test={test} draft={draft} onChange={setDraft} c={c} />
      {filled ? <JudgedBox pass={judged.pass} fails={judged.fails} c={c} /> : null}
      {!d.gate.ready ? <Text style={{ color: c.muted, fontSize: 13 }}>올리는 조건(기간 · 깨끗한 세션)이 다 차면 올릴 수 있어요.</Text> : null}
    </StepFrame>
  );
}

export default function RehabRoute() {
  return REHAB_ENABLED ? <RehabTestScreen /> : <RehabPausedScreen />;
}
