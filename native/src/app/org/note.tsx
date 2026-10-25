import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HOMEWORK_MAX, NOTE_MAX } from '@/lib/org/rules';
import { PITCH_COUNT_MAX } from '@/lib/org/lesson-work';
import { toDateKey } from '@/lib/pitch-stats';
import { Bar, useBusy } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { Box, ChoiceChips, DateStepper, Field, formCall } from '~/org/forms';
import { Primary } from '~/org/parts';

/**
 * 일지 쓰기(앱 화면, 1.5단계) — 웹 회원 카드의 레슨 노트 폼과 같은 org-notes.createLessonNote(폼). 오늘 한 것 · 본 것, 숙제(글),
 * 한 운동(한 줄에 하나 — '밴드 외회전 3x15'), 던진 공 수 · 강도. 수강권은 건드리지 않는다(덕아웃 예약 끝남에서). 오늘까지만 쓸 수 있다.
 * 1.5단계의 투구 수는 일지에만 남는다 — 선수 투구 기록으로 잇는 것은 2단계(docs/designs/sinker-team-lesson-contract.md 3절).
 */
const INTENSITY = Array.from({ length: 10 }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }));

export default function LessonNoteScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; member: string }>();
  const today = toDateKey(new Date());
  const [date, setDate] = useState(today);
  const [body, setBody] = useState('');
  const [homework, setHomework] = useState('');
  const [exercises, setExercises] = useState('');
  const [pitchCount, setPitchCount] = useState('');
  const [intensity, setIntensity] = useState<string | null>(null);
  const { busy, error, run } = useBusy();

  const save = () =>
    run(async () => {
      if (!body.trim() && !homework.trim()) return '오늘 한 것이나 숙제를 적어 주세요.';
      const r = await formCall('org-notes.createLessonNote', {
        memberId: p.member,
        date,
        body,
        homework,
        exercises,
        pitchCount,
        intensity,
      });
      if (r.error) return r.error;
      toast(r.success ?? '남겼어요');
      router.back();
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="일지 쓰기" c={c} />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
        <Field label="날짜" c={c}>
          <DateStepper value={date} onChange={setDate} max={today} c={c} />
        </Field>
        <Field label="오늘 한 것 · 본 것" c={c}>
          <Box value={body} onChangeText={setBody} placeholder="릴리스 포인트 앞으로 · 하체 쓰임 좋아짐" maxLength={NOTE_MAX} multiline c={c} />
        </Field>
        <Field label="숙제" hint="다음까지" c={c}>
          <Box value={homework} onChangeText={setHomework} placeholder="밴드 외회전 매일 3세트" maxLength={HOMEWORK_MAX} multiline style={{ minHeight: 80 }} c={c} />
        </Field>
        <Field label="한 운동" hint="한 줄에 하나 · 선택" c={c}>
          <Box value={exercises} onChangeText={setExercises} placeholder={'밴드 외회전 3x15\n메디신볼 회전 던지기 3x8'} multiline style={{ minHeight: 80 }} c={c} />
        </Field>
        <Field label="던진 공" hint="선택" c={c}>
          <Box value={pitchCount} onChangeText={(t) => setPitchCount(t.replace(/\D/g, '').slice(0, 3))} placeholder={`0 ~ ${PITCH_COUNT_MAX}구`} keyboardType="number-pad" c={c} />
        </Field>
        <Field label="강도" hint="1 가볍게 ~ 10 전력 · 선택" c={c}>
          <ChoiceChips options={INTENSITY} value={intensity} onChange={(v) => setIntensity(v === intensity ? null : v)} c={c} />
        </Field>
        {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
        <Primary label={busy ? '남기는 중…' : '일지 남기기'} onPress={() => void save()} disabled={busy} c={c} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
