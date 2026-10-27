import { REHAB_ENABLED } from '@/lib/armcare/rehab-regions';
import { RehabPausedScreen } from '~/armcare/rehab-paused';
import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { judgeStageTest } from '@/lib/armcare/rehab';
import { emptyStageTestDraft, num, stageTestFilled, stageTestInput } from '@/lib/armcare/rehab-test-draft';
import { emptyThrowingDraft, judgeThrowingDraft, throwingFilled, throwingInput } from '@/lib/armcare/rehab-throwing-draft';
import type { AppArmcareGuideTab, AppArmcareTodayTab, AppRehabDetail } from '@/lib/armcare/today-load';
import { act } from '~/mechanics/parts';
import { JudgedBox, StageTestFields, ThrowingTestFields, ZERO_TEN } from '~/rehab/test-fields';
import { usePalette } from '~/lib/ui';
import { ChoiceChips, StepFrame } from '~/setup/frame';
import { useScreenData } from '~/training/screen';
import { Press } from '~/shell/press';

/**
 * 매주 확인(앱 화면, 약 1분) — 웹 rehab-weekly.tsx WeeklyFlow 와 같은 질문: ① 다치기 전 대비 % ② 이번 주 가장 아팠던 정도 · 밤이나 쉴 때
 * ③ 내 활동 둘 0~10 · 세게 던질 자신감 ④ 그 단계의 단계 시험(건너뛸 수 있다). 저장은 같은 rehab.saveRehabWeekly — 서버가 결과 줄을 돌려준다.
 * 4단계의 ④는 투구 복귀표 열기 시험(통과하면 서버가 연다).
 */
const PCT = Array.from({ length: 11 }, (_, i) => ({ value: String(i * 10), label: String(i * 10) }));
const YES_NO = [
  { value: 'yes', label: '예' },
  { value: 'no', label: '아니요' },
];

function RehabWeeklyScreen() {
  const c = usePalette();
  const state = useScreenData<AppArmcareTodayTab | AppArmcareGuideTab>('app-training-parts.loadAppArmcare', 'today', 'training-armcare:today');
  const data = state.data?.tab === 'today' ? state.data : null;
  const d = data?.custom.kind === 'rehab' ? data.custom.rehab.detail : null;
  if (!d) {
    return (
      <StepFrame progress={0} counter="이번 주 확인" title={state.data ? '진행 중인 재활이 없어요' : '불러오는 중…'} problem={state.failed} back={{ label: '닫기', onPress: () => router.back() }} next={{ label: '닫기', onPress: () => router.back() }} c={c}>
        <View />
      </StepFrame>
    );
  }
  return <Flow d={d} />;
}

function Flow({ d }: { d: AppRehabDetail }) {
  const c = usePalette();
  const [step, setStep] = useState(0);
  const [normalPct, setNormalPct] = useState<number | null>(null);
  const [worst, setWorst] = useState<number | null>(null);
  const [night, setNight] = useState<string | null>(null);
  const [scores, setScores] = useState<(number | null)[]>(() => d.activities.map(() => null));
  const [confidence, setConfidence] = useState<number | null>(null);
  const test = d.stage === 4 ? null : d.stageTest;
  const throwTest = d.stage === 4 ? d.throwing : null;
  const [skipTest, setSkipTest] = useState(test == null && throwTest == null);
  const [draft, setDraft] = useState(() => emptyStageTestDraft(d.ckcFirst));
  const [throwDraft, setThrowDraft] = useState(emptyThrowingDraft);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ lines: string[]; test: { pass: boolean; fails: string[] } | null } | null>(null);

  const testFilled = test ? stageTestFilled(test, draft) : throwTest ? throwingFilled(throwDraft, throwTest.hasPlyo) : false;
  const judged = !testFilled
    ? null
    : test
      ? judgeStageTest(test, stageTestInput(test, draft))
      : throwTest && normalPct != null && confidence != null
        ? judgeThrowingDraft(throwTest, throwDraft, normalPct, confidence)
        : null;
  const canNext =
    (step === 0 && normalPct != null) || (step === 1 && worst != null && night != null) || (step === 2 && scores.every((s) => s != null) && confidence != null);
  const canSave = skipTest || testFilled;

  const save = async () => {
    if (busy || normalPct == null || worst == null || night == null || confidence == null) return;
    setBusy(true);
    setError(null);
    const testInput =
      skipTest || (!test && !throwTest)
        ? null
        : throwTest
          ? { kind: 'throwing', ...throwingInput(throwDraft, throwTest.hasPlyo) }
          : !test
            ? null
            : test.kind === 'rom'
          ? { kind: 'rom', painFree: draft.painFree === 'yes', similar: draft.similar === 'yes' }
          : { kind: 'strength', injured: num(draft.injured) ?? 0, other: num(draft.other) ?? 0, pain: draft.pain ?? 0, ckc: test.ckc ? num(draft.ckcNow) : null };
    const r = await act<{ ok: true; lines: string[]; test: { pass: boolean; fails: string[] } | null }>('rehab.saveRehabWeekly', {
      normalPct,
      worstPain: worst,
      nightPain: night === 'yes',
      activities: scores.map((s) => s ?? 0),
      confidence,
      test: testInput,
    });
    setBusy(false);
    if ('error' in r) return setError(r.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setResult({ lines: r.lines, test: r.test });
  };

  if (result) {
    return (
      <StepFrame progress={1} counter="이번 주 확인" title="이번 주 확인을 남겼어요" problem={null} back={{ label: '', onPress: () => undefined, disabled: true }} next={{ label: '닫기', onPress: () => router.back() }} c={c}>
        {result.lines.map((line) => (
          <View key={line} style={{ borderRadius: 12, padding: 12, backgroundColor: c.card, boxShadow: c.float }}>
            <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>{line}</Text>
          </View>
        ))}
        {result.test ? (
          <View style={{ gap: 6 }}>
            <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>{d.stage === 4 ? '투구 복귀표 열기 시험' : '단계 시험'}</Text>
            <JudgedBox pass={result.test.pass} fails={result.test.fails} c={c} />
          </View>
        ) : null}
      </StepFrame>
    );
  }

  const titles = ['지금 팔 상태는 다치기 전과 비교해 몇 %예요?', '이번 주 가장 아팠던 정도 (0~10)', '내 활동을 얼마나 할 수 있어요? (0~10)', d.stage === 4 ? '투구 복귀표 열기 시험' : '단계 시험'];
  const descs = [
    '100이면 다치기 전과 같아요.',
    undefined,
    '0 은 못 해요, 10 은 다치기 전처럼 해요.',
    d.stage === 4 ? '통과하면 투구 복귀표가 열려요.' : '두 번 이어 통과하면 이 단계 기간이 줄어들 수 있어요.',
  ];

  return (
    <StepFrame
      progress={(step + 1) / 4}
      counter={`${step + 1} / 4`}
      title={titles[step]}
      desc={descs[step]}
      problem={error}
      back={step === 0 ? { label: '닫기', onPress: () => router.back() } : { label: '이전', onPress: () => setStep(step - 1) }}
      next={step < 3 ? { label: '다음', onPress: () => setStep(step + 1), disabled: !canNext } : { label: busy ? '남기는 중…' : '남기기', onPress: () => void save(), disabled: !canSave || busy }}
      c={c}
    >
      {step === 0 ? (
        <ChoiceChips options={PCT} value={normalPct == null ? null : String(normalPct)} onChange={(v) => setNormalPct(Number(v))} c={c} />
      ) : step === 1 ? (
        <View style={{ gap: 18 }}>
          <ChoiceChips options={ZERO_TEN} value={worst == null ? null : String(worst)} onChange={(v) => setWorst(Number(v))} c={c} />
          <ChoiceChips legend="밤이나 쉴 때 아픈 적 있었어요?" options={YES_NO} value={night} onChange={setNight} c={c} />
        </View>
      ) : step === 2 ? (
        <View style={{ gap: 18 }}>
          {d.activities.map((label, i) => (
            <ChoiceChips
              key={label}
              legend={label}
              options={ZERO_TEN}
              value={scores[i] == null ? null : String(scores[i])}
              onChange={(v) => setScores((list) => list.map((s, j) => (j === i ? Number(v) : s)))}
              c={c}
            />
          ))}
          <ChoiceChips legend="세게 던질 자신감 (0~10)" options={ZERO_TEN} value={confidence == null ? null : String(confidence)} onChange={(v) => setConfidence(Number(v))} c={c} />
        </View>
      ) : (
        <View style={{ gap: 16 }}>
          {skipTest || (!test && !throwTest) ? (
            <View style={{ borderRadius: 12, padding: 12, backgroundColor: c.card, boxShadow: c.float }}>
              <Text style={{ color: c.ink, fontSize: 15 }}>오늘은 시험 없이 남겨요.</Text>
            </View>
          ) : throwTest ? (
            <>
              <ThrowingTestFields hasPlyo={throwTest.hasPlyo} draft={throwDraft} onChange={setThrowDraft} c={c} />
              {judged ? <JudgedBox pass={judged.pass} fails={judged.fails} c={c} /> : null}
            </>
          ) : !test ? null : (
            <>
              <View style={{ borderRadius: 12, padding: 12, backgroundColor: c.card, boxShadow: c.float }}>
                <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>{test.method}</Text>
              </View>
              <StageTestFields test={test} draft={draft} onChange={setDraft} firstEditable={false} c={c} />
              {judged ? <JudgedBox pass={judged.pass} fails={judged.fails} c={c} /> : null}
            </>
          )}
          {test || throwTest ? (
            <Press onPress={() => setSkipTest((v) => !v)} accessibilityRole="button" hitSlop={8} style={{ flexDirection: 'row', gap: 6, alignItems: 'center', minHeight: 44 }}>
              <SymbolView name={skipTest ? 'pencil' : 'forward'} size={13} tintColor={c.sky} />
              <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>{skipTest ? '시험할게요' : '오늘은 시험 건너뛰기'}</Text>
            </Press>
          ) : null}
        </View>
      )}
    </StepFrame>
  );
}

export default function RehabRoute() {
  return REHAB_ENABLED ? <RehabWeeklyScreen /> : <RehabPausedScreen />;
}
