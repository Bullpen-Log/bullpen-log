import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { DISTANCE_PITCHES, MOUND_SETS, THROWING_STEPS, THROW_PAIN_OPTIONS, type ThrowPain } from '@/lib/armcare/rehab';
import { num } from '@/lib/armcare/rehab-test-draft';
import type { AppArmcareGuideTab, AppArmcareTodayTab } from '@/lib/armcare/today-load';
import { act } from '~/mechanics/parts';
import { usePalette } from '~/lib/ui';
import { ChoiceChips, StepFrame } from '~/setup/frame';
import { useScreenData } from '~/training/screen';

/**
 * 오늘 던진 것 남기기(앱 화면) — 웹 rehab-throwing.tsx ThrowLogFlow: 몇 칸 · 공 수(마운드 칸은 묶음) · 던질 때 통증. 저장하면 투구 기록 한 줄
 * (rehab.logRehabThrow — 캐치볼 · 불펜으로 남아 투구 부하에 들어간다).
 */
export default function RehabThrowLogScreen() {
  const c = usePalette();
  const state = useScreenData<AppArmcareTodayTab | AppArmcareGuideTab>('app-training-parts.loadAppArmcare', 'today', 'training-armcare:today');
  const data = state.data?.tab === 'today' ? state.data : null;
  const t = data?.custom.kind === 'rehab' ? data.custom.rehab.detail?.throwing : null;
  const [step, setStep] = useState<number | null>(null);
  const [pitches, setPitches] = useState(String(DISTANCE_PITCHES));
  const [mound, setMound] = useState<number>(MOUND_SETS[0].pitches);
  const [pain, setPain] = useState<ThrowPain | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const shownStep = step ?? t?.next?.step ?? 1;
  const isMound = shownStep === THROWING_STEPS.length;
  const count = isMound ? mound : num(pitches);
  const filled = pain != null && count != null && count > 0;

  const submit = async () => {
    if (busy || !filled) return;
    setBusy(true);
    setError(null);
    const r = await act<{ ok: true }>('rehab.logRehabThrow', { step: shownStep, pitches: count, pain });
    setBusy(false);
    if ('error' in r) return setError(r.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    router.back();
  };

  return (
    <StepFrame
      progress={1}
      counter="투구 복귀표"
      title="오늘 던진 것 남기기"
      desc="투구 기록에 남고 다음 칸을 정해요"
      problem={error}
      back={{ label: '닫기', onPress: () => router.back() }}
      next={{ label: busy ? '남기는 중…' : '남기기', onPress: () => void submit(), disabled: !filled || busy }}
      c={c}
    >
      <ChoiceChips
        legend="몇 칸을 던졌나요?"
        hint={t?.next && t.next.step !== shownStep ? `규칙으로는 ${t.next.step}칸 차례예요.` : undefined}
        options={THROWING_STEPS.map((st, i) => ({ value: String(i + 1), label: `${i + 1}칸 ${st.distance}` }))}
        value={String(shownStep)}
        onChange={(v) => setStep(Number(v))}
        c={c}
      />
      {isMound ? (
        <ChoiceChips legend="어디까지 던졌나요?" options={MOUND_SETS.map((m) => ({ value: String(m.pitches), label: m.label }))} value={String(mound)} onChange={(v) => setMound(Number(v))} c={c} />
      ) : (
        <View style={{ gap: 8 }}>
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>몇 개 던졌나요?</Text>
          <TextInput
            value={pitches}
            onChangeText={(v) => setPitches(v.replace(/\D/g, ''))}
            keyboardType="number-pad"
            accessibilityLabel="공 수"
            style={{ minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.ink, paddingHorizontal: 14, fontSize: 17 }}
          />
          <Text style={{ color: c.muted, fontSize: 13 }}>가볍게 몸 풀기 → 25개 → 쉬기 → 25개면 50개예요. 절반 힘으로.</Text>
        </View>
      )}
      <ChoiceChips legend="던질 때 아팠나요?" options={THROW_PAIN_OPTIONS.map((o) => ({ value: o.value, label: o.label }))} value={pain} onChange={(v) => setPain(v as ThrowPain)} c={c} />
      <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
        투구 기록에 {isMound ? '불펜' : '캐치볼'}로 남아 투구 부하에 들어가요. 던진 뒤 1시간 넘게 · 다음 날 아프면 복귀표에서 따로 눌러 주세요.
      </Text>
    </StepFrame>
  );
}
