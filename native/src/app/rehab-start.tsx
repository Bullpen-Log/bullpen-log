import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import type { ArmcareAreaKey } from '@/lib/armcare/anatomy';
import { RED_FLAGS, RED_FLAGS_LINE } from '@/lib/armcare/pain-guide';
import {
  REHAB_ACTIVITY_MAX_LENGTH,
  REHAB_ACTIVITY_PRESETS,
  REHAB_AREAS,
  REHAB_CONDITIONS,
  REHAB_STAGES,
  areaLabel,
  conditionsFor,
  rehabEstimateDays,
  rehabFacts,
  rehabNotes,
  rehabSeverity,
  rehabStartBlock,
  rehabStartNotice,
  rehabTitle,
  severityLabel,
  startStage,
  weeksText,
  type RehabConditionKey,
} from '@/lib/armcare/rehab';
import { ARM_PAIN_LEVELS } from '@/lib/checkin';
import { toDateKey } from '@/lib/pitch-stats';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { ChoiceChips, StepFrame } from '~/setup/frame';
import { leaveTo } from '~/shell/web-nav';
import { Press } from '~/shell/press';
import { OFFLINE_TEXT } from '~/mechanics/parts';

/**
 * 재활 프로그램 시작(앱 화면) — 웹 app/(app)/training/rehab-start.tsx 의 시작 시트를 옮겼다. 어디가 아파요? → 얼마나(언제 아파요 +
 * 지난 일주일 가장 아팠을 때 0~10) → 병원 진단(고른 부위에 맞는 병명이 있을 때만) → 내 활동 두 개 → 요약 + [시작].
 * 규칙 · 글은 웹과 같은 lib/armcare/rehab, 저장은 같은 rehab.startRehab. 암케어 화면(training-armcare.tsx)이 오늘 체크인의
 * 아픈 자리 · 정도 · 나이를 주소로 넘긴다. 시작하면 암케어 화면으로 돌아간다(돌아가면 다시 읽어 재활 카드가 선다).
 */
const STEP_COUNT = 5;
const NO_DIAGNOSIS = 'none';
type Step = 0 | 1 | 2 | 3 | 4;

export default function RehabStartScreen() {
  const c = usePalette();
  const q = useLocalSearchParams<{ age?: string; area?: string; level?: string }>();
  const age = q.age && /^\d+$/.test(q.age) ? Number(q.age) : null;
  const [step, setStep] = useState<Step>(0);
  const [area, setArea] = useState<ArmcareAreaKey | null>(
    (REHAB_AREAS as readonly string[]).includes(q.area ?? '') ? (q.area as ArmcareAreaKey) : null
  );
  const [level, setLevel] = useState<1 | 2 | 3 | null>(q.level === '1' || q.level === '2' || q.level === '3' ? (Number(q.level) as 1 | 2 | 3) : null);
  const [worst, setWorst] = useState<number | null>(null);
  const [diagnosis, setDiagnosis] = useState<string | null>(null);
  const [activities, setActivities] = useState<string[]>([]);
  const [custom, setCustom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  /* 만 15세 미만은 부위와 상관없이 막는다 — 질문 없이 진료 안내만(웹과 같다) */
  const young = rehabStartBlock({ age, area: 'shoulder-back', condition: null });
  const choices = area ? conditionsFor(area) : [];
  const condition: RehabConditionKey | null = diagnosis && diagnosis !== NO_DIAGNOSIS ? (diagnosis as RehabConditionKey) : null;
  const skipDiagnosis = choices.length === 0;
  const block = area ? rehabStartBlock({ age, area, condition }) : null;

  const canNext =
    (step === 0 && area != null) ||
    (step === 1 && level != null && worst != null) ||
    (step === 2 && (skipDiagnosis || diagnosis != null)) ||
    (step === 3 && activities.length === 2);

  const go = (to: number) => {
    let next = to;
    if (next === 2 && skipDiagnosis) next = to > step ? 3 : 1;
    setError(null);
    setStep(Math.max(0, Math.min(4, next)) as Step);
  };

  const toggleActivity = (label: string) => {
    void Haptics.selectionAsync();
    setActivities((list) => (list.includes(label) ? list.filter((x) => x !== label) : list.length >= 2 ? [list[1], label] : [...list, label]));
  };
  const addCustom = () => {
    const label = custom.trim().replace(/\s+/g, ' ');
    if (!label || label.length > REHAB_ACTIVITY_MAX_LENGTH) return;
    if (!activities.includes(label)) toggleActivity(label);
    setCustom('');
  };

  const start = async () => {
    if (!area || level == null || worst == null || saving) return;
    setSaving(true);
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const r = await rpc<{ ok: true } | { error: string }>('rehab.startRehab', { area, level, worst, condition, activities });
      if ('error' in r) setError(r.error);
      else {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
      setError(OFFLINE_TEXT);
    } finally {
      setSaving(false);
    }
  };

  if (young?.kind === 'young') {
    return (
      <StepFrame
        progress={1}
        counter="재활 프로그램"
        title="진료를 먼저 받아 보세요"
        problem={null}
        back={{ label: '닫기', onPress: () => router.back() }}
        next={{ label: '확인', onPress: () => router.back() }}
        c={c}
      >
        <Blocked text={young.text} c={c} />
      </StepFrame>
    );
  }

  const activityOptions = [...REHAB_ACTIVITY_PRESETS, ...activities.filter((a) => !(REHAB_ACTIVITY_PRESETS as readonly string[]).includes(a))];
  const title = ['어디가 아파요?', '얼마나 아파요?', '병원 진단을 받았어요?', '내 활동 두 개', '이렇게 시작해요'][step];
  const desc = [
    '한 곳만 골라요. 여러 곳이면 가장 아픈 곳으로.',
    undefined,
    '진단이 있으면 병명에 맞춘 재활로 해요. 나중에 받아도 바꿀 수 있어요.',
    '매주 이 두 가지를 얼마나 할 수 있는지 물어봐요.',
    undefined,
  ][step];

  return (
    <StepFrame
      progress={(step + 1) / STEP_COUNT}
      counter={`${step + 1} / ${STEP_COUNT}`}
      title={title}
      desc={desc}
      problem={error}
      back={step === 0 ? { label: '닫기', onPress: () => router.back() } : { label: '이전', onPress: () => go(step - 1) }}
      next={
        step < 4
          ? { label: '다음', onPress: () => go(step + 1), disabled: !canNext }
          : block
            ? { label: '닫기', onPress: () => router.back() }
            : { label: saving ? '시작하는 중…' : '시작', onPress: () => void start(), disabled: saving }
      }
      c={c}
    >
      {step === 0 ? (
        <View style={{ gap: 16 }}>
          {(['어깨', '팔꿈치'] as const).map((joint, j) => (
            <ChoiceChips
              key={joint}
              legend={joint}
              options={REHAB_AREAS.slice(j * 4, j * 4 + 4).map((key) => ({ value: key, label: areaLabel(key) }))}
              value={area}
              onChange={(v) => {
                if (v !== area) setDiagnosis(null);
                setArea(v as ArmcareAreaKey);
              }}
              c={c}
            />
          ))}
        </View>
      ) : step === 1 ? (
        <View style={{ gap: 20 }}>
          <ChoiceChips
            legend="언제 아파요"
            options={ARM_PAIN_LEVELS.map((l) => ({ value: String(l.value), label: l.label }))}
            value={level == null ? null : String(level)}
            onChange={(v) => setLevel(Number(v) as 1 | 2 | 3)}
            c={c}
          />
          <ChoiceChips
            legend="지난 일주일 가장 아팠을 때 (0~10)"
            options={Array.from({ length: 11 }, (_, i) => ({ value: String(i), label: String(i) }))}
            value={worst == null ? null : String(worst)}
            onChange={(v) => setWorst(Number(v))}
            c={c}
          />
        </View>
      ) : step === 2 && area ? (
        <ChoiceChips
          options={[{ value: NO_DIAGNOSIS, label: '아니요, 부위로 할게요' }, ...choices.map((key) => ({ value: key, label: REHAB_CONDITIONS[key].label }))]}
          value={diagnosis}
          onChange={setDiagnosis}
          c={c}
        />
      ) : step === 3 ? (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {activityOptions.map((label) => {
              const on = activities.includes(label);
              return (
                <Press
                  key={label}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: on }}
                  onPress={() => toggleActivity(label)}
                  style={{ minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, justifyContent: 'center', backgroundColor: on ? c.sky : c.card, borderColor: on ? c.sky : c.line }}
                >
                  <Text style={{ color: on ? '#fff' : c.ink, fontSize: 16, fontWeight: '600' }}>{label}</Text>
                </Press>
              );
            })}
          </View>
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
            <TextInput
              value={custom}
              onChangeText={setCustom}
              onSubmitEditing={addCustom}
              maxLength={REHAB_ACTIVITY_MAX_LENGTH}
              placeholder="직접 적기 (예: 머리 감기)"
              placeholderTextColor={c.muted}
              accessibilityLabel="내 활동 직접 적기"
              returnKeyType="done"
              style={{ flex: 1, minHeight: 48, borderRadius: 12, borderWidth: 1, borderColor: c.line, backgroundColor: c.card, color: c.ink, paddingHorizontal: 14, fontSize: 16 }}
            />
            <Press
              accessibilityRole="button"
              accessibilityLabel="내 활동 더하기"
              onPress={addCustom}
              disabled={!custom.trim()}
              style={{ height: 48, paddingHorizontal: 16, borderRadius: 24, justifyContent: 'center', backgroundColor: c.chip, opacity: custom.trim() ? 1 : 0.4 }}
            >
              <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700' }}>더하기</Text>
            </Press>
          </View>
          <Text style={{ color: c.muted, fontSize: 13 }}>{activities.length}/2개 골랐어요</Text>
        </View>
      ) : step === 4 && area && level != null && worst != null ? (
        block ? (
          <Blocked text={block.text} c={c} />
        ) : (
          <Summary area={area} level={level} worst={worst} condition={condition} activities={activities} notice={rehabStartNotice({ age, area, condition })} c={c} />
        )
      ) : null}
    </StepFrame>
  );
}

/** 요약 한 장 — 웹 Summary 와 같은 글: 무엇으로 몇 단계부터 · 투구 복귀표까지 대략 · 던지기 · 메모 · 위험 신호 · 의사 지시가 먼저 */
function Summary({
  area,
  level,
  worst,
  condition,
  activities,
  notice,
  c,
}: {
  area: ArmcareAreaKey;
  level: 1 | 2 | 3;
  worst: number;
  condition: RehabConditionKey | null;
  activities: string[];
  /** 18세 미만 팔꿈치 바깥쪽 — 진료 먼저(rehabStartNotice, 웹과 같은 글) */
  notice: string | null;
  c: Palette;
}) {
  const severity = rehabSeverity({ level, worst, condition });
  const stage = startStage(severity);
  const today = toDateKey(new Date());
  const throwing = rehabFacts({ area, condition, severity, stage, stageStartedOn: today, stageShortenDays: 0, startedOn: today }, today);
  const notes = rehabNotes(area, condition);
  const body = { fontSize: 15, lineHeight: 22 } as const;
  return (
    <View style={{ gap: 14 }}>
      {notice ? (
        <View style={{ borderRadius: 12, padding: 12, backgroundColor: c.warnBg }}>
          <Text style={[body, { color: c.warn }]}>{notice}</Text>
        </View>
      ) : null}
      {severity === 'severe' ? (
        <View style={{ borderRadius: 12, padding: 12, backgroundColor: c.warnBg }}>
          <Text style={[body, { color: c.warn }]}>
            가만히 있어도 · 밤에도 아프면 진료를 먼저 받아보세요. 시작은 할 수 있지만, 밤 · 쉴 때 통증이 7일 없을 때까지 1단계에 머물러요.
          </Text>
        </View>
      ) : null}
      <View style={{ gap: 4 }}>
        <Text style={{ color: c.ink, fontSize: 18, fontWeight: '700', lineHeight: 25 }}>
          {rehabTitle(area, condition)} · {severityLabel(severity)} · {stage}단계부터
        </Text>
        <Text style={[body, { color: c.sky, fontWeight: '600' }]}>
          투구 복귀표까지 {weeksText(rehabEstimateDays(severity, condition))}, 빨리 나으면 앞당겨져요
        </Text>
        <Text style={[body, { color: c.muted }]}>
          {stage}단계 {REHAB_STAGES[stage].name} · 내 활동 {activities.join(' · ')}
        </Text>
      </View>
      <View style={{ borderRadius: 12, padding: 12, backgroundColor: c.card, boxShadow: c.float }}>
        <Text style={[body, { color: c.ink }]}>
          {throwing.throwing === 'light'
            ? '가벼운 캐치볼은 이어 가도 돼요(18m 안 · 25개 · 통증 2 이하). 투구 계획은 재활을 마칠 때까지 쉬어요.'
            : throwing.firstWeekNoThrow
              ? '팔꿈치 안쪽 · 뒤쪽은 첫 주에 던지지 않아요. 그 뒤로 가벼운 캐치볼만 해요.'
              : '재활을 마칠 때까지 투구 계획은 쉬어요. 웨이트는 이 관절의 무거운 운동만 빼고 해요.'}
        </Text>
      </View>
      {notes.map((n) => (
        <Text key={n} style={[body, { color: c.ink }]}>
          · {n}
        </Text>
      ))}
      <View style={{ borderRadius: 12, padding: 12, gap: 4, backgroundColor: c.danger + '14' }}>
        <Text style={[body, { color: c.danger, fontWeight: '700' }]}>이런 게 있으면 바로 진료받으세요</Text>
        <Text style={{ color: c.danger, fontSize: 13 }}>{RED_FLAGS_LINE}</Text>
        {RED_FLAGS.map((f) => (
          <Text key={f} style={{ color: c.danger, fontSize: 14, lineHeight: 20 }}>
            · {f}
          </Text>
        ))}
      </View>
      <Text style={{ color: c.muted, fontSize: 13 }}>담당 의사 · 치료사의 지시가 먼저예요. 이 프로그램은 진단이나 치료가 아니에요.</Text>
    </View>
  );
}

function Blocked({ text, c }: { text: string; c: Palette }) {
  return (
    <View style={{ borderRadius: 12, padding: 14, backgroundColor: c.warnBg }}>
      <Text style={{ color: c.warn, fontSize: 15, lineHeight: 22 }}>{text}</Text>
    </View>
  );
}
