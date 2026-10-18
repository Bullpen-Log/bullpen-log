import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { BASELINE_WORKOUT_FREQ, THROWING_HANDS } from '@/lib/baseline';
import { SELECTABLE_EQUIPMENT } from '@/lib/report/equipment';
import { TRAINING_LEVELS } from '@/lib/report/personalize';
import { WORKOUT_MINUTES_CHOICES } from '@/lib/report/theme';
import {
  checkTrainingAnswers,
  checkTrainingStep,
  programNote,
  toTrainingFormFields,
  trainingAnswerLines,
  trainingStepOfField,
  visibleTrainingSteps,
  type TrainingSetupAnswers,
  type TrainingStepKey,
} from '@/lib/training/setup-answers';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { ChoiceChips, StepFrame, SummaryRows } from '~/setup/frame';

/**
 * 트레이닝 첫 설정(앱 화면) — 웹 app/(app)/training/setup/training-setup-wizard.tsx 를 옮겼다. 경력 → 웨이트 횟수 → 장비 → 하루 운동 시간 →
 * [던지는 손] → 요약 → 저장. 차례 · 검사 · 요약 · 프로그램 안내 · 저장 칸은 웹과 같은 순수 함수(lib/training/setup-answers.ts), 저장은 같은
 * training-setup.finishTrainingSetup. 사이트의 /training/setup 이 앱(BullpenNative/7 부터)이면 이 화면을 띄운다. 저장하면 트레이닝 탭으로.
 */
type Loaded =
  | { ok: true; name: string; age: number | null; askHand: boolean; hasSetup: boolean; basicsDone: boolean; initial: TrainingSetupAnswers }
  | { ok: false; to: string };

export default function TrainingSetupScreen() {
  const c = usePalette();
  const [data, setData] = useState<Extract<Loaded, { ok: true }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    rpc<Loaded>('training-setup.loadAppTrainingSetup').then(
      (r) => alive && (r.ok ? setData(r) : leaveTo(r.to)),
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
        setFailed(true);
      }
    );
    return () => {
      alive = false;
    };
  }, [tries]);
  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, justifyContent: 'center', alignItems: 'center', gap: 16 }}>
        {failed ? (
          <>
            <Text style={{ color: c.ink, fontSize: 15 }}>신호가 약해 불러오지 못했어요.</Text>
            <Pressable accessibilityRole="button" onPress={() => (setFailed(false), setTries((n) => n + 1))} hitSlop={8}>
              <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>다시 불러오기</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }
  return <Wizard {...data} />;
}

function Wizard({ name, age, askHand, hasSetup, basicsDone, initial }: Extract<Loaded, { ok: true }>) {
  const c = usePalette();
  const steps = visibleTrainingSteps({ askHand, hasWeight: false });
  const [a, setA] = useState<TrainingSetupAnswers>(initial);
  const [index, setIndex] = useState(0);
  const [problem, setProblem] = useState<{ error: string; field: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const step = steps[index];
  const last = steps.length - 1;
  const who = name ? `${name} 님, ` : '';
  const patch = (p: Partial<TrainingSetupAnswers>) => {
    setA((prev) => ({ ...prev, ...p }));
    setProblem(null);
  };
  const goTo = (key: TrainingStepKey | null) => {
    const i = key ? steps.indexOf(key) : -1;
    if (i >= 0) setIndex(i);
  };
  const next = () => {
    const bad = checkTrainingStep(step, a);
    if (bad) return setProblem(bad);
    setProblem(null);
    setIndex((i) => Math.min(last, i + 1));
  };
  const save = async () => {
    const bad = checkTrainingAnswers(a, { askHand });
    if (bad) {
      goTo(trainingStepOfField(bad.field));
      return setProblem(bad);
    }
    setSaving(true);
    try {
      const r = await rpc<{ ok: true } | { ok: false; error: string; field?: string }>('training-setup.finishTrainingSetup', toTrainingFormFields(a));
      if (r.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        return leaveTo('/training');
      }
      goTo(r.field ? trainingStepOfField(r.field) : null);
      setProblem({ error: r.error, field: r.field ?? 'summary' });
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
      setProblem({ error: '신호가 약해 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.', field: 'summary' });
    } finally {
      setSaving(false);
    }
  };

  const toggleEquipment = (value: string) => {
    const on = !a.ownedEquipment.includes(value);
    patch({
      ownedEquipment: on ? [...a.ownedEquipment, value] : a.ownedEquipment.filter((e) => e !== value),
      /* 장비를 하나라도 켜면 '맨몸뿐'이 아니다 */
      bodyOnly: on ? false : a.bodyOnly,
    });
  };

  const heading = (() => {
    switch (step) {
      case 'level':
        return { title: `${who}웨이트는 얼마나 해 봤어요?`, desc: '경력에 비해 이른 운동은 빼고 골라요. 근력 · 파워 프로그램을 시작할 수 있는지도 여기서 봐요.' };
      case 'workoutFreq':
        return { title: '일주일에 몇 번 해요?', desc: '기록이 쌓이기 전까지 운동 부하 지수를 이 값으로 셈해요.' };
      case 'equipment':
        return { title: '어떤 장비가 있어요?', desc: '없는 장비로 하는 운동은 빼고 짜요. 집에서 하는 날은 일정을 만들 때 오늘 쓸 것만 다시 골라요.' };
      case 'minutes':
        return { title: '하루에 얼마나 할 수 있어요?', desc: '일정을 이 시간에 맞춰 짜요. 만들 때마다 바꿀 수 있어요.' };
      case 'hand':
        return { title: '어느 손으로 던져요?', desc: '암케어와 메커니즘이 어느 팔을 볼지 정해요. 투구 기록에서도 같은 값을 써요.' };
      case 'burnCard':
        return { title: '운동을 적으면 영양이 따라와요' };
      case 'summary':
        return {
          title: `${name ? `${name} 님의 ` : ''}트레이닝 설정이에요`,
          desc: hasSetup ? '저장하면 트레이닝 탭이 이 값으로 운동을 골라요. 트레이닝 설정에서 고칠 수 있어요.' : '시작하면 트레이닝 탭이 열려요.',
        };
    }
  })();

  return (
    <StepFrame
      progress={(index + 1) / steps.length}
      counter={`${index + 1} / ${steps.length}`}
      title={heading.title}
      desc={heading.desc}
      problem={problem?.error ?? null}
      back={
        index === 0
          ? { label: hasSetup ? '그만두기' : '홈으로', onPress: () => leaveTo(hasSetup ? '/training' : '/today') }
          : { label: '이전', onPress: () => (setProblem(null), setIndex((i) => i - 1)), disabled: saving }
      }
      next={index < last ? { label: '다음', onPress: next } : { label: saving ? '저장하는 중…' : hasSetup ? '저장하기' : '시작하기', onPress: () => void save(), disabled: saving }}
      c={c}
    >
      {step === 'level' ? (
        <View style={{ gap: 10 }}>
          {TRAINING_LEVELS.map((l) => (
            <OptionCard
              key={l.name}
              label={l.name}
              hint={l.desc}
              on={a.trainingLevel === l.name}
              invalid={problem?.field === 'trainingLevel'}
              onPress={() => patch({ trainingLevel: l.name })}
              c={c}
            />
          ))}
        </View>
      ) : null}
      {step === 'workoutFreq' ? (
        <ChoiceChips
          options={BASELINE_WORKOUT_FREQ.map((o) => ({ value: o.name, label: o.name }))}
          value={a.baselineWorkoutFreq}
          onChange={(baselineWorkoutFreq) => patch({ baselineWorkoutFreq })}
          invalid={problem?.field === 'baselineWorkoutFreq'}
          hint="이 답과 하루 운동 시간으로 첫날부터 운동 부하 지수를 내요."
          c={c}
        />
      ) : null}
      {step === 'equipment' ? (
        <View style={{ gap: 16 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SELECTABLE_EQUIPMENT.map((e) => (
              <Toggle key={e} label={e} on={a.ownedEquipment.includes(e)} invalid={problem?.field === 'ownedEquipment'} onPress={() => toggleEquipment(e)} c={c} />
            ))}
          </View>
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>장비가 없으면 아래 ‘맨몸뿐이에요’를 눌러요. 장비가 생기면 트레이닝 설정에서 더해요.</Text>
          <View style={{ borderTopWidth: 1, borderTopColor: c.line, paddingTop: 14, gap: 8 }}>
            <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>장비가 하나도 없으면</Text>
            <View style={{ flexDirection: 'row' }}>
              <Toggle
                label="맨몸뿐이에요"
                on={a.bodyOnly}
                invalid={problem?.field === 'ownedEquipment'}
                /* '맨몸뿐이에요'를 켜면 골라 둔 장비를 비운다 — 둘이 같이 켜져 있을 수 없다 */
                onPress={() => patch({ bodyOnly: !a.bodyOnly, ownedEquipment: !a.bodyOnly ? [] : a.ownedEquipment })}
                c={c}
              />
            </View>
          </View>
        </View>
      ) : null}
      {step === 'minutes' ? (
        <ChoiceChips
          options={WORKOUT_MINUTES_CHOICES.map((m) => ({ value: String(m), label: `${m}분` }))}
          value={a.dailyWorkoutMinutes}
          onChange={(dailyWorkoutMinutes) => patch({ dailyWorkoutMinutes })}
          invalid={problem?.field === 'dailyWorkoutMinutes'}
          hint="암케어는 이 시간에 안 들어가요. 따로 해요."
          c={c}
        />
      ) : null}
      {step === 'hand' ? (
        <ChoiceChips
          options={THROWING_HANDS.map((h) => ({ value: h, label: h }))}
          value={a.throwingHand}
          onChange={(throwingHand) => patch({ throwingHand })}
          invalid={problem?.field === 'throwingHand'}
          c={c}
        />
      ) : null}
      {step === 'summary' ? (
        <View style={{ gap: 16 }}>
          <SummaryRows rows={trainingAnswerLines(a, { askHand })} c={c} />
          {/* 근력 · 파워 프로그램 자격 — 시작 자격과 같은 글(lib/program/program.ts) */}
          <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22, borderWidth: 1, borderColor: c.sky + '40', backgroundColor: c.sky + '0d', borderRadius: 16, padding: 14, overflow: 'hidden' }}>
            {programNote(a, age, basicsDone)}
          </Text>
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>저장하면 오늘 운동 일정을 바로 만들 수 있어요. 일정은 체크인을 남긴 날에 만들어요.</Text>
        </View>
      ) : null}
    </StepFrame>
  );
}

/** 설명이 붙은 고르기 카드(웹 OptionCards) */
function OptionCard({ label, hint, on, invalid, onPress, c }: { label: string; hint: string; on: boolean; invalid: boolean; onPress: () => void; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        borderRadius: 16,
        borderWidth: on ? 2 : 1,
        borderColor: on ? c.sky : invalid ? c.danger : c.line,
        backgroundColor: c.card,
        paddingHorizontal: 16,
        paddingVertical: 14,
      }}
    >
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.ink, fontSize: 17, fontWeight: '600' }}>{label}</Text>
        <Text style={{ color: c.muted, fontSize: 14, lineHeight: 20 }}>{hint}</Text>
      </View>
      {on ? <SymbolView name="checkmark.circle.fill" size={22} tintColor={c.sky} /> : null}
    </Pressable>
  );
}

/** 여러 개 고르는 칩(웹 MultiChips) */
function Toggle({ label, on, invalid, onPress, c }: { label: string; on: boolean; invalid: boolean; onPress: () => void; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={{
        minHeight: 44,
        borderRadius: 22,
        borderWidth: 1,
        borderColor: on ? c.sky : invalid ? c.danger : c.line,
        backgroundColor: on ? c.sky : c.card,
        paddingHorizontal: 16,
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: on ? '#fff' : c.ink, fontSize: 16, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}
