import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { ADULT_AGE } from '@/lib/report/plan';
import { BASELINE_MIX, MIX_COUNTS, THROWING_HANDS, mixDailyLoad } from '@/lib/baseline';
import { effortScaleText, scaleToEffortPct } from '@/lib/pitch-effort';
import { checkPitchStep, pitchStepOfField, toPitchFormFields, visiblePitchSteps, type PitchSetupAnswers, type PitchStepKey } from '@/lib/pitching/setup-answers';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette } from '~/lib/ui';
import { leaveTo, openWebAfter } from '~/shell/web-nav';
import { BigNumber, ChoiceChips, StepFrame, SummaryRows } from '~/setup/frame';
import { PitchCapInsert } from '~/setup/inserts';
import { Press } from '~/shell/press';

/**
 * 투구 기록 첫 설정(앱 화면) — 웹 app/(app)/videos/setup/pitch-setup-wizard.tsx 를 옮겼다. 하루 투구 한도(끼움) → 던지는 손 → 평소 투구량
 * → 요약 → 저장. 차례 · 검사 · 저장 칸은 웹과 같은 순수 함수(lib/pitching/setup-answers.ts), 저장은 같은 pitch-setup.finishPitchSetup.
 * 사이트의 /videos/setup 이 앱(BullpenNative/7 부터)이면 이 화면을 띄운다. 저장하면 투구 탭으로(잠금이 걷힌다).
 */
type Loaded = { ok: true; name: string; age: number | null; done: boolean; initial: PitchSetupAnswers } | { ok: false; to: string };

export default function PitchSetupScreen() {
  const c = usePalette();
  const [data, setData] = useState<Extract<Loaded, { ok: true }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    rpc<Loaded>('pitch-setup.loadAppPitchSetup').then(
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
              <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>다시 불러오기</Text>
            </Press>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }
  return <Wizard {...data} />;
}

function Wizard({ name, age, done, initial }: Extract<Loaded, { ok: true }>) {
  const c = usePalette();
  const steps = visiblePitchSteps();
  const [a, setA] = useState<PitchSetupAnswers>(initial);
  const [index, setIndex] = useState(0);
  const [problem, setProblem] = useState<{ error: string; field: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const step = steps[index];
  const last = steps.length - 1;
  const patch = (p: Partial<PitchSetupAnswers>) => {
    setA((prev) => ({ ...prev, ...p }));
    setProblem(null);
  };

  const mix = [a.mixCatch, a.mixBullpen, a.mixGame].every((v) => v != null)
    ? { catch: Number(a.mixCatch), bullpen: Number(a.mixBullpen), game: Number(a.mixGame) }
    : null;
  const load = mix ? Math.round(mixDailyLoad(mix)) : null;
  const who = name ? `${name} 님, ` : '';

  const goTo = (key: PitchStepKey | null) => {
    const i = key ? steps.indexOf(key) : -1;
    if (i >= 0) setIndex(i);
  };
  const next = () => {
    const bad = checkPitchStep(step, a);
    if (bad) return setProblem(bad);
    setProblem(null);
    setIndex((i) => Math.min(last, i + 1));
  };
  const save = async () => {
    for (const key of steps) {
      const bad = checkPitchStep(key, a);
      if (bad) {
        goTo(key);
        return setProblem(bad);
      }
    }
    setSaving(true);
    try {
      const r = await rpc<{ ok: true } | { ok: false; error: string; field?: string }>('pitch-setup.finishPitchSetup', toPitchFormFields(a));
      if (r.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        /* 웹 틀이 탭 잠금을 다시 읽게(안 하면 앱을 껐다 켤 때까지 탭이 잠긴 채였다 — 영양 첫 설정과 같게) */
        openWebAfter('#refresh');
        return leaveTo('/videos');
      }
      goTo(r.field ? pitchStepOfField(r.field) : null);
      setProblem({ error: r.error, field: r.field ?? 'summary' });
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
      setProblem({ error: '신호가 약해 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.', field: 'summary' });
    } finally {
      setSaving(false);
    }
  };

  const heading = (() => {
    switch (step) {
      case 'capCard':
        if (age !== null && age >= ADULT_AGE) return { title: `${who}지금 팔 상태를 알려 드려요`, desc: '투구를 적으면 지금 팔이 위험한지 안전한지 보여 줘요. 세 가지만 물을게요.' };
        return {
          title: `${who}먼저 하루 투구 한도예요`,
          desc: age === null ? '나이로 정해지는 숫자예요. 내 정보에 생년월일을 적으면 나이에 맞게 바뀌어요.' : '나이로 정해지는 숫자예요.',
        };
      case 'hand':
        return { title: '던지는 손은 어느 쪽이에요?', desc: '투구 분석과 암케어가 어느 팔을 볼지 정해요.' };
      case 'pitching':
        return { title: '평소 얼마나 던져요?', desc: '보통 한 주에 종류별로 몇 번 던지는지 골라 주세요. 기록이 쌓이기 전까지 투구 부하 지수를 이 값으로 셈해요.' };
      case 'summary':
        return { title: `${name ? `${name} 님의 ` : ''}투구 설정이에요`, desc: done ? '저장하면 투구 탭과 홈이 이 값으로 셈해요. 내 정보에서 고칠 수 있어요.' : '시작하면 투구 탭이 열려요.' };
    }
  })();

  return (
    <StepFrame
      progress={(index + 1) / steps.length}
      counter={`${index + 1} / ${steps.length}`}
      title={heading.title}
      desc={heading.desc}
      problem={problem?.error ?? null}
      /* 처음 온 사람은 투구 탭이 잠겨 있어 /videos 가 다시 여기로 보낸다 — 홈으로(웹과 같다) */
      back={index === 0 ? { label: done ? '그만두기' : '홈으로', onPress: () => leaveTo(done ? '/videos' : '/today') } : { label: '이전', onPress: () => (setProblem(null), setIndex((i) => i - 1)), disabled: saving }}
      next={index < last ? { label: '다음', onPress: next } : { label: saving ? '저장하는 중…' : done ? '저장하기' : '시작하기', onPress: () => void save(), disabled: saving }}
      c={c}
    >
      {step === 'capCard' ? <PitchCapInsert age={age} c={c} /> : null}
      {step === 'hand' ? (
        <ChoiceChips
          options={THROWING_HANDS.map((h) => ({ value: h, label: h }))}
          value={a.throwingHand}
          onChange={(throwingHand) => patch({ throwingHand })}
          invalid={problem?.field === 'throwingHand'}
          hint="양투는 둘 다 던지는 선수예요."
          c={c}
        />
      ) : null}
      {step === 'pitching' ? (
        <View style={{ gap: 20 }}>
          {BASELINE_MIX.map((t) => {
            const field = t.key === 'catch' ? 'mixCatch' : t.key === 'bullpen' ? 'mixBullpen' : 'mixGame';
            return (
              <ChoiceChips
                key={t.key}
                legend={`${t.label} · 주에 몇 번`}
                options={MIX_COUNTS.map((n) => ({ value: String(n), label: n === 7 ? '매일' : `${n}` }))}
                value={a[field]}
                onChange={(v) => patch({ [field]: v })}
                invalid={problem?.field === field}
                hint={`한 번에 보통 ${t.pitches}구, 강도 ${effortScaleText(scaleToEffortPct(t.intensity))} 정도로 셈해요.`}
                c={c}
              />
            );
          })}
          {load !== null ? <BigNumber label="평소 하루 부하" value={String(load)} unit="종류별 횟수 × 구수 × 강도 ÷ 7" note="기록이 쌓이기 전까지 투구 부하 지수를 이 값으로 셈해요." c={c} /> : null}
        </View>
      ) : null}
      {step === 'summary' ? (
        <View style={{ gap: 16 }}>
          {load !== null ? <BigNumber label="평소 하루 부하" value={String(load)} unit="종류별 횟수 × 구수 × 강도 ÷ 7" note="투구 부하 지수가 첫날부터 이 값에서 시작해요." c={c} /> : null}
          <SummaryRows
            rows={[
              { label: '던지는 손', value: a.throwingHand ?? '아직 안 골랐어요' },
              { label: '평소 던지는 양', value: mix ? `주당 캐치볼 ${mix.catch} · 불펜 ${mix.bullpen} · 경기 ${mix.game}번` : '아직 안 골랐어요' },
            ]}
            c={c}
          />
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
            {done ? '저장하면 내 정보의 같은 칸도 이 값으로 바뀌어요.' : '시작하면 투구 탭이 열려요. 설정은 내 정보에서 고칠 수 있어요.'}
          </Text>
        </View>
      ) : null}
    </StepFrame>
  );
}
