import { Icon } from '~/shell/icon';
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { BASELINE_WORKOUT_FREQ, THROWING_HANDS } from '@/lib/baseline';
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
import { usePalette } from '~/lib/ui';
import { leaveTo, openWebAfter } from '~/shell/web-nav';
import { SummaryRows } from '~/setup/frame';
import { TrainingFrame, TrainingOption } from '~/setup/training-frame';
import { OFFLINE_TEXT } from '~/mechanics/parts';
import { Press } from '~/shell/press';

/**
 * 트레이닝 첫 설정(앱 화면) — 웹 app/(app)/training/setup/training-setup-wizard.tsx 를 옮겼다. 경력 → 웨이트 횟수 → 하루 운동 시간 →
 * [던지는 손] → 요약 → 저장. 차례 · 검사 · 요약 · 프로그램 안내 · 저장 칸은 웹과 같은 순수 함수(lib/training/setup-answers.ts), 저장은 같은
 * training-setup.finishTrainingSetup. 사이트의 /training/setup 이 앱(BullpenNative/7 부터)이면 이 화면을 띄운다. 저장하면 트레이닝 탭으로.
 */
type Loaded =
  | { ok: true; name: string; age: number | null; askHand: boolean; hasSetup: boolean; basicsDone: boolean; initial: TrainingSetupAnswers }
  | { ok: false; to: string };

export default function TrainingSetupScreen() {
  const c = usePalette();
  const { edit } = useLocalSearchParams<{ edit?: string }>();
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
            <Press accessibilityRole="button" onPress={() => (setFailed(false), setTries((n) => n + 1))} hitSlop={8}>
              <Text style={{ color: c.link, fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
            </Press>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }
  return <Wizard {...data} requestedEdit={typeof edit === 'string' ? edit : undefined} />;
}

function Wizard({ age, askHand, hasSetup, basicsDone, initial, requestedEdit }: Extract<Loaded, { ok: true }> & { requestedEdit?: string }) {
  const c = usePalette();
  const fullSteps = visibleTrainingSteps({ askHand, hasWeight: false });
  const editStep = hasSetup && (requestedEdit === 'level' || requestedEdit === 'workoutFreq' || requestedEdit === 'minutes' || (askHand && requestedEdit === 'hand')) ? requestedEdit : null;
  /* 다시 설정할 때는 고른 질문→요약. 옛 계정에 빈 필수값이 있으면 그 질문도 거쳐 서버 검사에 걸리지 않게 한다. */
  const steps: TrainingStepKey[] = editStep
    ? [...new Set<TrainingStepKey>([editStep, ...fullSteps.filter((key) => key !== 'summary' && checkTrainingStep(key, initial) != null), 'summary'])]
    : fullSteps;
  /* 새 사용자는 기본 60분을 답으로 오해하지 않게 시간을 직접 고른다. 다시 설정은 저장값을 그대로 보여 준다. */
  const [a, setA] = useState<TrainingSetupAnswers>(() => hasSetup ? initial : { ...initial, dailyWorkoutMinutes: '' });
  const [index, setIndex] = useState(0);
  const [problem, setProblem] = useState<{ error: string; field: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const step = steps[index];
  const last = steps.length - 1;
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
        /* 웹 틀이 탭 잠금을 다시 읽게(안 하면 앱을 껐다 켤 때까지 탭이 잠긴 채였다 — 영양 첫 설정과 같게) */
        openWebAfter('#refresh');
        if (editStep) {
          if (router.canGoBack()) router.back();
          else router.replace('/training/settings');
          return;
        }
        return leaveTo('/training');
      }
      goTo(r.field ? trainingStepOfField(r.field) : null);
      setProblem({ error: r.error, field: r.field ?? 'summary' });
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
      setProblem({ error: OFFLINE_TEXT, field: 'summary' });
    } finally {
      setSaving(false);
    }
  };

  const heading = (() => {
    switch (step) {
      case 'level':
        return { title: '웨이트는 얼마나 해 봤어요?', desc: '기간을 고르면 운동을 고를 때 참고해요.', why: '경력은 실력 등급이 아니에요. 웨이트를 해 온 기간만 골라 주세요.' };
      case 'workoutFreq':
        return { title: '평소 일주일에 몇 번 운동해요?', desc: '최근 기록이 쌓이기 전까지 시작 기준으로 써요.', why: '목표 횟수보다 평소 하던 횟수를 골라 주세요.' };
      case 'minutes':
        return { title: '하루에 운동할 수 있는 시간은?', desc: '오늘 운동을 만들 때 다시 바꿀 수 있어요.', why: '암케어 시간은 따로 계산해요.' };
      case 'hand':
        return { title: '어느 손으로 던져요?', desc: '암케어와 메카닉에서 볼 팔을 정해요.', why: '던지는 손을 이미 설정했다면 이 질문은 나타나지 않아요.' };
      case 'burnCard':
        return { title: '운동을 적으면 영양이 따라와요', desc: '' };
      case 'summary':
        return {
          title: '내 트레이닝 기준을 확인해요',
          desc: editStep ? '저장하면 새 운동 계획을 만들 때 반영돼요.' : '저장하면 트레이닝 화면에서 운동을 시작할 수 있어요.',
        };
    }
  })();

  const answered = step === 'level' ? !!a.trainingLevel : step === 'workoutFreq' ? !!a.baselineWorkoutFreq : step === 'minutes' ? !!a.dailyWorkoutMinutes : step === 'hand' ? !!a.throwingHand : true;

  return (
    <TrainingFrame
      progress={(index + 1) / steps.length}
      counter={`${index + 1} / ${steps.length}`}
      progressLabel={editStep || hasSetup ? '트레이닝 설정' : '트레이닝 첫 설정'}
      eyebrow={step === 'summary' ? 'READY TO TRAIN' : 'YOUR TRAINING BASE'}
      title={heading.title}
      desc={heading.desc}
      why={'why' in heading ? heading.why : undefined}
      problem={problem?.error ?? null}
      back={
        index === 0
          ? { label: editStep ? '취소' : hasSetup ? '그만두기' : '홈으로', onPress: () => editStep ? router.back() : leaveTo(hasSetup ? '/training' : '/today'), disabled: saving }
          : { label: '이전', onPress: () => (setProblem(null), setIndex((i) => i - 1)), disabled: saving }
      }
      next={index < last ? { label: '다음', onPress: next, disabled: !answered || saving } : { label: saving ? '저장하는 중…' : editStep || hasSetup ? '설정 저장' : '트레이닝 시작', onPress: () => void save(), disabled: saving }}
    >
      {step === 'level' ? (
        <View style={{ gap: 10 }}>
          {TRAINING_LEVELS.map((l) => (
            <TrainingOption
              key={l.name}
              label={l.name}
              hint={l.name === '입문' ? '안 해봤거나 6개월 미만' : l.name === '초급' ? '6개월~1년' : l.name === '중급' ? '1~3년' : '3년 이상'}
              on={a.trainingLevel === l.name}
              invalid={problem?.field === 'trainingLevel'}
              onPress={() => patch({ trainingLevel: l.name })}
              c={c}
            />
          ))}
        </View>
      ) : null}
      {step === 'workoutFreq' ? (
        <View style={{ gap: 10 }}>{BASELINE_WORKOUT_FREQ.map((o) => <TrainingOption key={o.name} label={o.name} on={a.baselineWorkoutFreq === o.name} invalid={problem?.field === 'baselineWorkoutFreq'} onPress={() => patch({ baselineWorkoutFreq: o.name })} c={c} />)}</View>
      ) : null}
      {step === 'minutes' ? (
        <View style={{ gap: 10 }}>{WORKOUT_MINUTES_CHOICES.map((m) => <TrainingOption key={m} label={`${m}분`} on={a.dailyWorkoutMinutes === String(m)} invalid={problem?.field === 'dailyWorkoutMinutes'} onPress={() => patch({ dailyWorkoutMinutes: String(m) })} c={c} />)}</View>
      ) : null}
      {step === 'hand' ? (
        <View style={{ gap: 10 }}>{THROWING_HANDS.map((h) => <TrainingOption key={h} label={h} on={a.throwingHand === h} invalid={problem?.field === 'throwingHand'} onPress={() => patch({ throwingHand: h })} c={c} />)}</View>
      ) : null}
      {step === 'summary' ? (
        <View style={{ gap: 16 }}>
          <SummaryRows rows={trainingAnswerLines(a, { askHand })} c={c} />
          <View style={{ backgroundColor: c.skyTint, borderRadius: 14, padding: 14, gap: 5 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><Icon name="circle-check" size={16} color={c.link} /><Text style={{ color: c.ink, fontSize: 14, fontWeight: '700' }}>이 설정으로 시작해요</Text></View>
            <Text style={{ color: c.ink, fontSize: 14, lineHeight: 20 }}>{hasSetup ? '경력은 운동 선택에, 횟수와 시간은 새 계획의 시작 기준에 반영돼요. 이미 만든 오늘 일정은 그대로예요.' : '경력은 운동 선택에, 횟수와 시간은 첫 계획의 시작 기준에 반영돼요.'}</Text>
          </View>
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>{programNote(a, age, basicsDone)}</Text>
          {!hasSetup ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>오늘 운동 일정은 체크인을 남긴 뒤 만들 수 있어요.</Text> : null}
        </View>
      ) : null}
    </TrainingFrame>
  );
}
