import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shiftDateKey, toDateKey } from '@/lib/pitch-stats';
import { Bar, LoadState, call, useBusy, useLoad } from '~/community/parts';
import { READABLE } from '~/lib/layout';
import { TYPE, usePalette } from '~/lib/ui';
import { toast } from '~/shell/toast';
import { ChoiceChips, DateStepper, Field } from '~/org/forms';
import { Primary } from '~/org/parts';
import { LibraryBrowser, PickedList, pickItems, type LibraryLoad, type Pick } from '~/org/picker';
import { useDraftGuard } from '~/org/space-store';

/**
 * 숙제 내기(앱 화면, 2단계) — 라이브러리 운동 · 드릴에서 고르고(자유 글 운동 없음) 세트 · 횟수를 적는다. 저장은 app-lesson.assignHomework.
 * 선수가 트레이닝에서 그 운동을 하면 저절로 완료된다. 고르기 부품은 ~/org/picker(훈련 메뉴와 같이 씀).
 */
const DUE = [
  { value: 'none', label: '기한 없음' },
  { value: 'set', label: '기한' },
] as const;

export default function HomeworkScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const p = useLocalSearchParams<{ org: string; member: string }>();
  const lib = useLoad<LibraryLoad>('app-lesson.loadHomeworkLibrary', p.org ?? '');
  const [picks, setPicks] = useState<Pick[]>([]);
  const today = toDateKey(new Date());
  const [due, setDue] = useState<{ on: boolean; key: string }>({ on: false, key: shiftDateKey(today, 7) });
  const { busy, error, run } = useBusy();
  /* 쓰던 글 — 다른 조직 알림으로 옮기거나 권한을 잃을 때 묻는다(계약 8-5) */
  useDraftGuard(picks.length > 0);

  const save = () =>
    run(async () => {
      if (picks.length === 0) return '숙제로 낼 운동을 골라 주세요.';
      if (due.on && due.key < today) return '기한은 오늘부터 고를 수 있어요.';
      const r = await call<{ ok: true }>('app-lesson.assignHomework', p.org, p.member, { dueDate: due.on ? due.key : null, items: pickItems(picks) });
      if (!r.ok) return ('error' in r && r.error) || '숙제를 내지 못했어요.';
      toast('숙제를 냈어요');
      router.back();
      return null;
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title="숙제 내기" c={c} />
      {!lib.data ? (
        <LoadState error={lib.error} onRetry={() => void lib.reload()} c={c} />
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE]}>
          <PickedList picks={picks} setPicks={setPicks} c={c} />
          <Field label="기한" c={c}>
            <ChoiceChips options={DUE} value={due.on ? 'set' : 'none'} onChange={(v) => setDue({ ...due, on: v === 'set' })} c={c} />
            {due.on ? <DateStepper value={due.key} onChange={(key) => setDue({ on: true, key })} c={c} /> : null}
          </Field>
          {error ? <Text style={[TYPE.body, { color: c.danger }]}>{error}</Text> : null}
          <Primary label={busy ? '내는 중…' : '숙제 내기'} onPress={() => void save()} disabled={busy || picks.length === 0} c={c} />
          <LibraryBrowser lib={lib.data} picks={picks} setPicks={setPicks} c={c} />
        </ScrollView>
      )}
    </KeyboardAvoidingView>
  );
}
