import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { loadAppNutritionStats } from '@/app/actions/app-nutrition';
import { ageRule } from '@/lib/nutrition/age';
import { SEASON_PHASES } from '@/lib/nutrition/diet-prefs';
import { ACTIVITIES, GOAL_KINDS, MACRO_PRESETS, kcalText } from '@/lib/nutrition/meta';
import { macroSplit } from '@/lib/nutrition/onboarding';
import { answersOfProfile, periodDate, previewOfProfile, type OnboardingBody } from '@/lib/nutrition/onboarding-answers';
import { dateText } from '@/lib/nutrition/period';
import { computeTargets } from '@/lib/nutrition/targets';
import { STEP_KCAL, goalCopy, planOnSave } from '@/lib/nutrition/weight-goal';
import type { WeightUnit } from '@/lib/units';
import { Bar, BarButton, LoadState, call, leave, useLoad } from '~/community/parts';
import { refreshNutritionDays } from '~/nutrition/api';
import { WeekChart, WeightTrend } from '~/nutrition/stats/charts';
import { GoalSheet, kgText, paceText } from '~/nutrition/stats/goal-sheet';
import { cacheGet, cacheSet } from '~/lib/store';
import { usePalette, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';

/**
 * 영양 목표 · 통계(앱 화면) — 웹 영양 탭의 통계 열(app/(app)/nutrition/nutrition-view.tsx: 체중 카드 → 최근 7일 → 내 계획)과 목표 창을 옮겼다.
 * 읽기는 웹과 같은 그날 자료(app-nutrition.loadAppNutritionStats → lib/nutrition/load.ts), 체중 흐름의 글은 같은 goalCopy, 권유 단추는 같은
 * 서버 동작(nutrition.applyWeightStep — 서버가 오늘의 권유를 다시 셈해 같을 때만 저장). 체중 적기는 영양 탭(앱)에 있어 여기는 흐름만.
 * 목표를 바꾸면 영양 탭이 받아 둔 날을 다시 받는다(그날 칸마다 목표가 들어 있다). ?date= 로 그날까지의 통계(없으면 오늘).
 */
type Load = Awaited<ReturnType<typeof loadAppNutritionStats>>;
type Stats = Extract<Load, { ok: true }>;
type Result = { ok: true } | { ok: false; error: string };


/* '그대로 둘게요' — 웹은 그 브라우저 localStorage 에 14일, 앱은 받아 둔 값 칸에 같은 꼴('오늘:다음 조정')로(로그아웃하면 지워져 다음 사람에게 안 남는다) */
const SNOOZE_KEY = 'weight-suggest-snooze';
const SNOOZE_DAYS = 14;

const STEP_LABEL = {
  raise: `하루 +${STEP_KCAL}kcal 올리기`,
  lower: `하루 −${STEP_KCAL}kcal 내리기`,
  maintain: '유지로 바꾸기',
} as const;

export default function NutritionStatsScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ date?: string }>();
  const { data, error, reload } = useLoad<Load>('app-nutrition.loadAppNutritionStats', typeof params.date === 'string' ? params.date : null);
  const unit = useWeightUnit();
  const [goalOpen, setGoalOpen] = useState(false);
  const [pulling, setPulling] = useState(false);

  /* 목표가 바뀌었다 — 이 화면과 영양 탭(받아 둔 날마다 목표가 들어 있다)을 다시 받는다 */
  const changed = () => {
    if (data) refreshNutritionDays(data.date);
    void reload();
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="영양" title="목표 · 통계" right={data ? <BarButton label="목표" onPress={() => setGoalOpen(true)} c={c} /> : null} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView
          contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: inset.bottom + 24 }}
          refreshControl={
            <RefreshControl
              refreshing={pulling}
              onRefresh={() => {
                setPulling(true);
                void reload().finally(() => setPulling(false));
              }}
            />
          }
        >
          {error ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
          {data.date !== data.today ? (
            <Text style={{ color: c.muted, fontSize: 14 }}>{dateText(data.date)}까지의 기록이에요.</Text>
          ) : null}

          {/* 온보딩을 안 끝낸 옛 계정 — 웹 첫 설정 화면을 권한다(막지는 않는다, 웹과 같다) */}
          {!data.onboarded ? (
            <View style={[st.banner, { backgroundColor: c.sky + '14', borderColor: c.sky + '4d' }]}>
              <Text style={{ flex: 1, color: c.ink, fontSize: 15 }}>
                {data.hasProfile ? '새 계획 화면으로 목표를 다시 정해 볼까요?' : '열 가지 질문으로 내 계획을 만들어요.'}
              </Text>
              <Pressable accessibilityRole="button" onPress={() => leave('/nutrition/setup')} style={[st.smallBtn, { backgroundColor: c.sky }]}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '600' }}>시작하기</Text>
              </Pressable>
            </View>
          ) : null}

          <WeightCard day={data} unit={unit} onOpenGoal={() => setGoalOpen(true)} onChanged={changed} c={c} />

          <View style={[st.card, { backgroundColor: c.card }]}>
            <View style={st.cardHead}>
              <Text style={[st.cardTitle, { color: c.ink }]}>최근 7일</Text>
              <Text style={{ color: c.muted, fontSize: 12 }}>막대 = 먹은 칼로리 · 선 = 그날 목표</Text>
            </View>
            <WeekChart week={data.week} selected={data.date} c={c} />
          </View>

          {data.hasProfile ? <PlanCard day={data} unit={unit} onOpenGoal={() => setGoalOpen(true)} c={c} /> : null}
        </ScrollView>
      )}

      {goalOpen && data ? (
        <GoalSheet
          profile={data.profile}
          prefs={data.prefs}
          today={data.today}
          body={data.todayBody}
          assumed={data.targets.assumed}
          unit={unit}
          onSaved={changed}
          onClose={() => setGoalOpen(false)}
          c={c}
        />
      ) : null}
    </View>
  );
}

/**
 * 체중 카드 — 웹 WeightCard 의 흐름 쪽: 숫자 하나 · 문장 하나 · 단추 하나(lib/nutrition/weight-goal.ts goalCopy) + 8주 그래프.
 * 숫자에 색을 입히지 않는다(체중은 성적이 아니다).
 */
function WeightCard({
  day,
  unit,
  onOpenGoal,
  onChanged,
  c,
}: {
  day: Stats;
  unit: WeightUnit;
  onOpenGoal: () => void;
  onChanged: () => void;
  c: Palette;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snooze, setSnooze] = useState<string | null>(null);
  useEffect(() => {
    void cacheGet(SNOOZE_KEY).then((v) => setSnooze(typeof v === 'string' ? v : null));
  }, []);
  const writeSnooze = (value: string | null) => {
    setSnooze(value);
    void cacheSet(SNOOZE_KEY, value);
  };

  const t = day.targets;
  const plan = day.plan;
  const copy = goalCopy(plan, {
    goal: t.goal,
    band: t.ageBand,
    ageKnown: day.body.age !== null,
    hasProfile: day.hasProfile,
    unit,
    isToday: day.date === day.today,
  });
  const snoozed = (() => {
    if (!plan.suggestion || !snooze) return false;
    const [since, next] = snooze.split(':');
    const days = Math.round((Date.parse(`${day.today}T00:00:00.000Z`) - Date.parse(`${since}T00:00:00.000Z`)) / 86_400_000);
    return Number(next) === plan.suggestion.nextAdjust && days >= 0 && days < SNOOZE_DAYS;
  })();

  /* '유지로 바꾸기'를 누르면 하루 목표가 얼마가 되나 — 목표 창과 같은 규칙으로 미리 셈한다(웹과 같다) */
  const keepProfile = { goal: 'maintain' as const, activity: day.profile.activity, weeklyRateKg: null, kcalTarget: day.profile.kcalTarget };
  const keepBase =
    copy.action === 'maintain'
      ? computeTargets(
          {
            ...day.profile,
            ...keepProfile,
            targetWeightKg: null,
            kcalAdjust: planOnSave(day.profile, keepProfile, day.body.age).kcalAdjust,
          },
          day.body,
          0
        ).base
      : t.base;

  async function act() {
    const action = copy.action;
    if (!action || busy) return;
    setError(null);
    setBusy(true);
    const res =
      action === 'maintain'
        ? await call<Result>('nutrition.saveNutritionProfile', { ...keepProfile, proteinPerKg: t.proteinPerKg, targetWeightKg: null })
        : await call<Result>('nutrition.applyWeightStep', action === 'raise' ? STEP_KCAL : -STEP_KCAL);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onChanged();
  }

  const hasStatus = copy.label !== null || copy.sentence !== null;
  const latest = day.weightKg ?? day.weights.at(-1)?.kg ?? null;

  return (
    <View style={[st.card, { backgroundColor: c.card }]}>
      <View style={st.cardHead}>
        <Text style={[st.cardTitle, { color: c.ink }]}>체중</Text>
        <Text style={{ color: c.muted, fontSize: 13 }}>
          {latest !== null ? `${day.weightKg === null ? '최근' : day.date === day.today ? '오늘' : '이날'} ${kgText(latest, unit)}` : ''}
          {day.weightFrom === 'checkin' ? ' · 체크인에 적은 값' : ''}
        </Text>
      </View>

      {hasStatus ? (
        <View style={{ gap: 6 }}>
          {copy.label ? <Text style={[st.small, { color: c.muted }]}>{copy.label}</Text> : null}
          {copy.number ? <Text style={[st.big, { color: c.ink }]}>{copy.number}</Text> : null}
          {copy.sub ? <Text style={[st.small, { color: c.muted }]}>{copy.sub}</Text> : null}
          {copy.sentence ? <Text style={{ color: c.ink, fontSize: 15, lineHeight: 22 }}>{copy.sentence}</Text> : null}
          {copy.note ? <Text style={[st.small, { color: c.muted }]}>{copy.note}</Text> : null}
          {copy.action ? (
            snoozed ? (
              <View style={st.row}>
                <Text style={[st.small, { color: c.muted }]}>그대로 두기로 했어요.</Text>
                <Pressable accessibilityRole="button" onPress={() => writeSnooze(null)} hitSlop={8} style={st.link}>
                  <Text style={{ color: c.sky, fontSize: 13, fontWeight: '600' }}>다시 보기</Text>
                </Pressable>
              </View>
            ) : (
              <View style={{ gap: 6, paddingTop: 4 }}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => void act()}
                  disabled={busy}
                  style={[st.primary, { backgroundColor: c.sky }, busy && { opacity: 0.5 }]}
                >
                  <Text style={st.primaryText}>{busy ? '바꾸는 중' : STEP_LABEL[copy.action]}</Text>
                </Pressable>
                {copy.action === 'maintain' && keepBase !== t.base ? (
                  <Text style={[st.small, st.center, { color: c.muted }]}>
                    하루 목표가 {kcalText(t.base)} → {kcalText(keepBase)}kcal로 바뀌어요
                  </Text>
                ) : null}
                {copy.actionNote ? <Text style={[st.small, st.center, { color: c.muted }]}>{copy.actionNote}</Text> : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => {
                    if (copy.action === 'maintain') onOpenGoal();
                    else if (plan.suggestion) writeSnooze(`${day.today}:${plan.suggestion.nextAdjust}`);
                  }}
                  style={st.ghost}
                >
                  <Text style={{ color: c.muted, fontSize: 15, fontWeight: '600' }}>
                    {copy.action === 'maintain' ? '새 목표 정하기' : '그대로 둘게요'}
                  </Text>
                </Pressable>
              </View>
            )
          ) : null}
        </View>
      ) : null}
      {copy.minor ? <Text style={[st.small, { color: c.muted }]}>{copy.minor}</Text> : null}
      {error ? <Text style={{ color: c.danger, fontSize: 14 }}>{error}</Text> : null}

      <WeightTrend weights={day.weights} unit={unit} trend={plan.trend} targetKg={plan.targetKg} c={c} />
      {hasStatus ? <Text style={{ color: c.muted, fontSize: 12, lineHeight: 17 }}>{copy.foot}</Text> : null}
    </View>
  );
}

/**
 * 내 계획 — 웹 MyPlanCard(components/nutrition/my-plan-card.tsx)와 같은 숫자: 저장된 목표 그대로 운동 없는 날로(previewOfProfile), 몸은 오늘 기준.
 * 보기만 — 고치기는 목표 창. 계산 내역(기초대사량 · 활동대사량 · 하루 목표 · 탄단지)은 눌러야 편다.
 */
function PlanCard({ day, unit, onOpenGoal, c }: { day: Stats; unit: WeightUnit; onOpenGoal: () => void; c: Palette }) {
  const [open, setOpen] = useState(false);
  const body: OnboardingBody = {
    age: day.todayBody.age,
    sex: day.todayBody.sex,
    heightCm: day.todayBody.heightCm,
    weightKg: day.todayBody.weightKg,
    level: null,
  };
  const p = previewOfProfile(day.profile, body);
  const a = answersOfProfile(day.profile, day.prefs, body.age);
  const t = p.targets;
  const goal = GOAL_KINDS.find((g) => g.key === a.goalKind)?.label ?? '유지';
  const activity = ACTIVITIES.find((x) => x.key === p.draft.activity) ?? ACTIVITIES[1];
  const parts = [
    ACTIVITIES.find((x) => x.key === day.profile.activity)?.label ?? null,
    MACRO_PRESETS.find((m) => m.key === day.profile.macroPreset)?.label ?? null,
    SEASON_PHASES.find((s) => s.key === day.prefs.seasonPhase)?.label ?? null,
    t.paceKg ? paceText(t.paceKg, unit) : null,
    a.goalEndDate ? `${dateText(a.goalEndDate)}까지` : null,
  ].filter(Boolean);
  const split = macroSplit(t.carbs, t.protein, t.fat);
  const sign = t.delta > 0 ? '+' : t.delta < 0 ? '−' : '';
  const rule = ageRule(p.age);

  return (
    <View style={[st.card, { backgroundColor: c.card }]}>
      <View style={st.row}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[st.cardTitle, { color: c.ink }]}>
            내 계획 · <Text style={{ color: c.sky }}>{goal}</Text>
          </Text>
          <Text style={{ color: c.ink, fontSize: 15, fontVariant: ['tabular-nums'] }}>
            하루 {t.kcal.toLocaleString('ko-KR')}kcal · 단백질 {t.protein}g
          </Text>
          {t.floored ? (
            <Text style={[st.small, { color: c.muted }]}>
              {t.ageBand === 'adult' ? '기초대사량보다 낮게 잡지 않아요.' : '성장기는 계산한 목표보다 낮게 잡지 않아요.'}
            </Text>
          ) : null}
          {parts.length > 0 ? <Text style={[st.small, { color: c.muted }]}>{parts.join(' · ')}</Text> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={onOpenGoal} style={[st.smallBtn, { backgroundColor: c.chip }]}>
          <Text style={{ color: c.ink, fontSize: 14, fontWeight: '600' }}>고치기</Text>
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((o) => !o)} style={st.link}>
        <Text style={{ color: c.muted, fontSize: 13, fontWeight: '600' }}>{open ? '계산 내역 접기' : '계산 내역 보기'}</Text>
      </Pressable>
      {open ? (
        <View style={{ gap: 10 }}>
          <View style={st.statRow}>
            <PlanStat label="기초대사량" value={t.bmr} sub="가만히 있어도" c={c} />
            <PlanStat label="활동대사량" value={t.tdee} sub={`× ${activity.factor} ${activity.label}`} c={c} />
            <PlanStat
              label="하루 목표"
              value={t.base}
              sub={t.manual ? '직접 정함' : t.delta === 0 ? '유지' : `${sign}${kcalText(Math.abs(t.delta))} 목표`}
              strong
              c={c}
            />
          </View>
          <Text style={{ color: c.ink, fontSize: 14, fontVariant: ['tabular-nums'] }}>
            탄수화물 {t.carbs}g {split.c}% · 단백질 {t.protein}g {split.p}% · 지방 {t.fat}g {split.f}%
          </Text>
          <Text style={[st.small, { color: c.muted }]}>
            단백질은 체중 1kg 당 {t.proteinPerKg}g · 지방은 {Math.round(t.fatShare * 100)}% · 탄수화물은 나머지. 운동 · 투구를 적은 날은 쓴 만큼 더해요.
          </Text>
          {p.forecast.length > 1 && p.etaWeeks !== null && a.targetWeightKg !== null ? (
            <Text style={[st.small, { color: c.muted }]}>
              계획대로면 약 {p.etaWeeks}주, {dateText(periodDate(day.today, p.etaWeeks))}쯤 {kgText(a.targetWeightKg, unit)}
              {t.paceKg ? ` · ${paceText(t.paceKg, unit)}씩` : ''}
            </Text>
          ) : null}
          <Text style={[st.small, { color: c.muted }]}>
            계산에 쓴 몸: {body.weightKg !== null ? kgText(body.weightKg, unit) : `${kgText(t.weightKg, unit)}(짐작)`}
            {body.heightCm !== null ? ` · ${body.heightCm}cm` : ' · 178cm(짐작)'}
            {p.age !== null ? ` · 만 ${p.age}세` : ' · 20세(짐작)'}
            {body.sex ? (body.sex === 'M' ? ' · 남' : ' · 여') : ' · 성별 모름'} · {rule.bmrName}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

function PlanStat({ label, value, sub, strong, c }: { label: string; value: number; sub: string; strong?: boolean; c: Palette }) {
  return (
    <View style={[st.stat, { backgroundColor: strong ? c.sky + '1a' : c.page }]}>
      <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={1}>
        {label}
      </Text>
      <Text style={{ color: strong ? c.sky : c.ink, fontSize: 20, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {kcalText(value)}
        <Text style={{ color: c.muted, fontSize: 12, fontWeight: '400' }}> kcal</Text>
      </Text>
      <Text style={{ color: c.muted, fontSize: 12 }} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  cardTitle: { fontSize: 17, fontWeight: '700' },
  banner: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 16, borderWidth: 1, padding: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  small: { fontSize: 13, lineHeight: 18 },
  big: { fontSize: 30, fontWeight: '700', fontVariant: ['tabular-nums'] },
  center: { textAlign: 'center' },
  link: { minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' },
  smallBtn: { minHeight: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  primary: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  ghost: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  statRow: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, borderRadius: 14, padding: 10, gap: 4 },
});
