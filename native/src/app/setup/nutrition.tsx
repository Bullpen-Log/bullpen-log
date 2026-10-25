import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { GOAL_KINDS, kcalText } from '@/lib/nutrition/meta';
import {
  checkNutritionStep,
  nutritionStepOfField,
  preview,
  toFormFields,
  visibleNutritionSteps,
  type NutritionAnswers,
  type NutritionStepKey,
  type OnboardingBody,
} from '@/lib/nutrition/onboarding-answers';
import { MAX_HEIGHT_CM, MAX_WEIGHT_KG, MIN_HEIGHT_CM, MIN_WEIGHT_KG, type Sex } from '@/lib/profile';
import { rpc, RpcError } from '~/lib/rpc';
import { TYPE, usePalette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { usePrefs } from '~/lib/prefs';
import { leaveTo, openWebAfter } from '~/shell/web-nav';
import { StepFrame, SummaryRows } from '~/setup/frame';
import { BurnInsert } from '~/setup/inserts';
import { MacroBar, NumberField, NutritionStepPanel, answerLines, nutritionStepTitle, type StepCtx } from '~/setup/nutrition-steps';
import { Press } from '~/shell/press';

/**
 * 영양 첫 설정(앱 화면) — 웹 app/(app)/nutrition/setup/setup-wizard.tsx 를 옮겼다. [키] → [체중] → 운동 소모(끼움) → 목표 카드 → [목표 체중 →
 * 속도] → 평소 움직임 → 탄단지 → 식사 → 못 먹는 것 → 계획 만드는 중 → 추천 계획 → 탄단지 g → 요약 → 저장. 키 · 체중은 계정에 없을 때만 묻는다.
 * 차례 · 검사 · 미리보기 · 저장 칸은 웹과 같은 순수 함수(lib/nutrition/onboarding-answers.ts), 저장은 같은 nutrition.finishNutritionSetup(한 트랜잭션).
 * 사이트의 /nutrition/setup 이 앱(BullpenNative/7 부터)이면 이 화면을 띄운다. 저장하면 영양 탭으로(잠금이 걷힌다).
 */
type Loaded =
  | { ok: true; today: string; name: string; age: number | null; sex: Sex | null; heightCm: number | null; weightKg: number | null; hasProfile: boolean; initial: NutritionAnswers }
  | { ok: false; to: string };
type StepKey = 'height' | 'weight' | 'burnCard' | `n:${NutritionStepKey}` | 'summary';
type Problem = { error: string; field: string };

export default function NutritionSetupScreen() {
  const c = usePalette();
  const [data, setData] = useState<Extract<Loaded, { ok: true }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  useEffect(() => {
    let alive = true;
    rpc<Loaded>('nutrition.loadAppNutritionSetup').then(
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
  return <Wizard {...data} />;
}

function Wizard({ today, name, age, sex, heightCm: savedHeight, weightKg: savedWeight, hasProfile, initial }: Extract<Loaded, { ok: true }>) {
  const c = usePalette();
  const unit = useWeightUnit();
  /* 키는 설정 단위(cm · in)로 적고 cm 로 둔다 — 내 정보 화면과 같다 */
  const lengthUnit = usePrefs().length;
  const [heightCm, setHeightCm] = useState<number | null>(savedHeight);
  const [weightKg, setWeightKg] = useState<number | null>(savedWeight);
  const [a, setA] = useState<NutritionAnswers>(initial);
  /* 가입에서 이미 받은 키 · 몸무게는 다시 묻지 않는다(웹과 같다) — 비어 있는 옛 계정만 묻는다 */
  const [askBody] = useState<StepKey[]>(() => [...(savedHeight === null ? (['height'] as const) : []), ...(savedWeight === null ? (['weight'] as const) : [])]);
  const [step, setStep] = useState<StepKey>(askBody[0] ?? 'burnCard');
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);

  const body: OnboardingBody = { age, sex, heightCm, weightKg, level: null };
  const visible: StepKey[] = [...askBody, 'burnCard', ...visibleNutritionSteps(a, body).map((k): StepKey => `n:${k}`), 'summary'];
  const index = Math.max(0, visible.indexOf(step));
  const current = visible[index];
  const last = visible.length - 1;
  const p = preview(a, body);
  const who = name ? `${name} 님, ` : '';
  const ctx: StepCtx = {
    a,
    set: (patch) => {
      setA((prev) => ({ ...prev, ...patch }));
      setProblem(null);
    },
    body,
    p,
    today,
    name,
    invalid: (field) => problem?.field === field,
    unit,
    c,
  };

  const checkStep = (key: StepKey): Problem | null => {
    switch (key) {
      case 'height':
        if (heightCm === null) return { error: '키를 적어 주세요.', field: 'heightCm' };
        if (!Number.isInteger(heightCm) || heightCm < MIN_HEIGHT_CM || heightCm > MAX_HEIGHT_CM)
          return { error: `키는 ${MIN_HEIGHT_CM}~${MAX_HEIGHT_CM}cm 사이로 적어 주세요.`, field: 'heightCm' };
        return null;
      case 'weight':
        if (weightKg === null) return { error: '지금 체중을 적어 주세요.', field: 'weightKg' };
        if (weightKg < MIN_WEIGHT_KG || weightKg > MAX_WEIGHT_KG) return { error: `체중은 ${MIN_WEIGHT_KG}~${MAX_WEIGHT_KG}kg 사이로 적어 주세요.`, field: 'weightKg' };
        return null;
      case 'burnCard':
      case 'summary':
        return null;
      default:
        return checkNutritionStep(key.slice(2) as NutritionStepKey, a, body);
    }
  };
  const stepOfField = (field: string): StepKey => {
    if (field === 'heightCm') return 'height';
    if (field === 'weightKg') return 'weight';
    const n = nutritionStepOfField(field);
    return n ? `n:${n}` : 'summary';
  };

  const next = () => {
    if (index >= last) return;
    const found = checkStep(current);
    if (found) return setProblem(found);
    setProblem(null);
    setStep(visible[index + 1]);
  };
  const back = () => {
    setProblem(null);
    let i = index - 1;
    /* '계획 만드는 중'은 뒤로 갈 때 건너뛴다 — 저절로 다음으로 넘어가는 화면이라 */
    while (i > 0 && visible[i] === 'n:building') i--;
    setStep(visible[Math.max(0, i)]);
  };
  const building = current === 'n:building';
  /* '만드는 중'이 끝나면 그 다음 칸으로 — 다음 칸은 답이 안 바뀌는 동안 같다 */
  const afterBuilding = building ? visible[index + 1] : null;
  const onBuilt = () => {
    if (afterBuilding) setStep((s) => (s === 'n:building' ? afterBuilding : s));
  };

  const save = async () => {
    for (const key of visible) {
      const found = checkStep(key);
      if (found) {
        setStep(key);
        return setProblem(found);
      }
    }
    setSaving(true);
    setProblem(null);
    try {
      const r = await rpc<{ ok: true } | { ok: false; error: string; field?: string }>('nutrition.finishNutritionSetup', { heightCm, weightKg, fields: toFormFields(a) });
      if (r.ok) {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        /* 웹 틀이 잠금을 다시 셈하게 — 안 하면 탭이 잠긴 채 영양을 누르면 첫 설정이 또 열렸다 */
        openWebAfter('#refresh');
        return leaveTo('/nutrition');
      }
      const field = r.field ?? 'summary';
      setStep(stepOfField(field));
      setProblem({ error: r.error, field });
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
      setProblem({ error: '신호가 약해 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.', field: 'summary' });
    } finally {
      setSaving(false);
    }
  };

  const heading = (() => {
    switch (current) {
      case 'height':
        return { title: `${who}키는 얼마예요?`, desc: '기초대사량과 목표 체중의 바닥(BMI 20), 영상에서 잰 길이를 몸 크기로 나눌 때 써요.' };
      case 'weight':
        return { title: '지금 체중은요?', desc: '오늘 체중 기록이 돼요. 목표 칼로리와 단백질을 체중으로 셈해요.' };
      case 'burnCard':
        return { title: '먹는 것과 쓰는 것', desc: '이 앱의 영양은 운동 · 투구 기록과 이어져 있어요.' };
      case 'summary':
        return { title: `${name ? `${name} 님의 ` : ''}계획이에요`, desc: '저장하면 영양 탭과 홈이 이 숫자로 바뀌어요. 목표 창에서 고칠 수 있어요.' };
      default:
        return nutritionStepTitle(current.slice(2) as NutritionStepKey, ctx);
    }
  })();
  const goalLabel = GOAL_KINDS.find((g) => g.key === a.goalKind)?.label ?? null;

  return (
    <StepFrame
      progress={(index + 1) / visible.length}
      counter={`${index + 1} / ${visible.length}`}
      title={heading.title}
      desc={heading.desc}
      problem={problem?.error ?? null}
      back={
        index === 0
          ? /* 처음 온 사람은 영양 탭이 잠겨 있어 /nutrition 이 다시 여기로 보낸다 — 홈으로(웹과 같다) */
            { label: hasProfile ? '그만두기' : '홈으로', onPress: () => leaveTo(hasProfile ? '/nutrition' : '/today') }
          : { label: '이전', onPress: back, disabled: building || saving }
      }
      next={
        index < last
          ? { label: building ? '잠시만요…' : '다음', onPress: next, disabled: building }
          : { label: saving ? '저장하는 중…' : '저장하고 시작하기', onPress: () => void save(), disabled: saving }
      }
      c={c}
    >
      {current === 'height' ? (
        <NumberField
          value={heightCm}
          onChange={(v) => {
            setHeightCm(v);
            setProblem(null);
          }}
          unit={lengthUnit}
          kind="length"
          placeholder={lengthUnit === 'in' ? 69 : 175}
          invalid={problem?.field === 'heightCm'}
          c={c}
        />
      ) : null}
      {current === 'weight' ? (
        <NumberField
          value={weightKg}
          onChange={(v) => {
            setWeightKg(v);
            setProblem(null);
          }}
          unit={unit}
          kind="weight"
          placeholder={unit === 'kg' ? 72 : 159}
          invalid={problem?.field === 'weightKg'}
          hint="아침에 화장실 다녀온 뒤 잰 값이 가장 고르게 나와요. 0.1 까지."
          c={c}
        />
      ) : null}
      {current === 'burnCard' ? <BurnInsert weightKg={weightKg} c={c} /> : null}
      {current.startsWith('n:') ? <NutritionStepPanel key={current} step={current.slice(2) as NutritionStepKey} ctx={ctx} onBuilt={onBuilt} /> : null}
      {current === 'summary' ? (
        <View style={{ gap: 16 }}>
          <View style={{ borderWidth: 1, borderColor: c.sky + '4d', backgroundColor: c.action + '0d', borderRadius: 16, padding: 14, gap: 6 }}>
            <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>{goalLabel ?? '목표'} · 운동 없는 날</Text>
            <Text style={{ color: c.ink, fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
              {kcalText(p.targets.base)}
              <Text style={[TYPE.unitLg, { color: c.muted }]}> kcal</Text>
            </Text>
            <MacroBar carbs={p.targets.carbs} protein={p.targets.protein} fat={p.targets.fat} c={c} />
          </View>
          <SummaryRows rows={answerLines(ctx)} c={c} />
          <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>
            {askBody.includes('weight') ? '저장하면 키 · 체중은 내 정보에, 오늘 체중은 체중 기록에 함께 들어가요.' : '저장하면 키 · 체중은 내 정보에 들어가요.'}
          </Text>
        </View>
      ) : null}
    </StepFrame>
  );
}
