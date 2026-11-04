import { CoachAccessActions } from '~/coach/access-actions';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { agreeHealthConsent, loadCoachStart, previewCoachWeek, saveCoachAnswer, startCoach } from '@/app/actions/coach';
import { COACH_POINTS } from '@/lib/coach-intro';
import {
  COACH_LIMITS,
  COACH_MINUTES,
  COACH_PRIORITIES,
  COACH_ROLES,
  REASON_TEXT,
  WEEKDAY_LABELS,
  coachMinutes,
  slotLine,
  type CoachSaved,
  type CoachStep,
} from '@/lib/coach/answers';
import type { Weekday } from '@/lib/coach/week';
import { rpc } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { ChoiceChips, StepFrame, SummaryRows } from '~/setup/frame';
import { toast } from '~/shell/toast';
import { ActionButton } from '~/shell/action-button';
import { Icon } from '~/shell/icon';

/**
 * 코치 시작(앱 화면, docs/designs/ai-coach.md 10-4) — 소개 → 내 정보 확인 → (건강정보 동의) → 목표 · 등판 · 팀 훈련 · 가능 요일 · 제한 →
 * 첫 주 미리보기 → 시작. 질문은 화면마다 저장(CoachProfile 'draft' — 다시 열면 고른 값이 채워져 있다). 서버 app/actions/coach.ts.
 * 앱에 이미 있는 정보(나이 · 키 · 장비 · 수준 · 하루 시간)는 다시 묻지 않고 확인만(U4) — 다르면 설정에서 고친다.
 */
type Start = Awaited<ReturnType<typeof loadCoachStart>>;
type Preview = Awaited<ReturnType<typeof previewCoachWeek>>;
type Page = 'intro' | 'info' | 'consent' | CoachStep | 'preview';

export default function CoachStartScreen() {
  const c = usePalette();
  const [start, setStart] = useState<Start | null>(null);
  const [failed, setFailed] = useState(false);
  const [page, setPage] = useState<Page>('intro');
  const [a, setA] = useState<CoachSaved>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<Extract<Preview, { ok: true }> | null>(null);
  const [withProgram, setWithProgram] = useState(true);

  const loadStart = useCallback(() => {
    rpc<Start>('coach.loadCoachStart').then(
      (r) => {
        setStart(r);
        setA(r.answers);
      },
      () => setFailed(true)
    );
  }, []);
  useEffect(() => {
    loadStart();
  }, [loadStart]);

  if (!start) {
    return (
      <View style={[st.center, { backgroundColor: c.page }]}>
        {failed ? <View style={{ padding: 20, gap: 12, alignItems: 'center' }}><Text style={{ color: c.ink, fontSize: 15 }}>코치 시작 정보를 불러오지 못했어요.</Text><ActionButton label="다시 확인" compact onPress={() => { setFailed(false); loadStart(); }} /></View> : <ActivityIndicator />}
      </View>
    );
  }

  const order: Page[] = ['intro', 'info', ...(start.gate === 'consent' ? (['consent'] as const) : []), 'goal', 'outing', 'fixed', 'availability', 'limits', 'preview'];
  const at = order.indexOf(page);
  const go = (p: Page) => {
    setProblem(null);
    setPage(p);
  };
  const back = () => (at <= 0 ? router.back() : go(order[at - 1]));
  const next = () => go(order[at + 1]);

  const save = async (step: CoachStep, value: object) => {
    setBusy(true);
    try {
      const r = await rpc<Awaited<ReturnType<typeof saveCoachAnswer>>>('coach.saveCoachAnswer', step, value);
      if ('error' in r) return setProblem(r.error);
      setA(r.answers);
      if (order[at + 1] === 'preview') await loadPreview();
      next();
    } catch (error) {
      setProblem(error instanceof Error ? error.message : '신호가 약해 저장하지 못했어요. 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const loadPreview = async () => {
    const r = await rpc<Preview>('coach.previewCoachWeek');
    if ('error' in r) throw new Error(r.error);
    setPreview(r);
  };
  const agree = async () => {
    setBusy(true);
    try {
      const r = await rpc<Awaited<ReturnType<typeof agreeHealthConsent>>>('coach.agreeHealthConsent', start.health.version);
      if ('error' in r) return setProblem(r.error);
      next();
    } catch {
      setProblem('신호가 약해 저장하지 못했어요. 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const begin = async () => {
    setBusy(true);
    try {
      const r = await rpc<Awaited<ReturnType<typeof startCoach>>>('coach.startCoach', { program: !!preview?.suggested && withProgram });
      if ('error' in r) return setProblem(r.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      toast('코치를 시작했어요');
      router.back();
    } catch {
      setProblem('신호가 약해 시작하지 못했어요. 다시 해 주세요.');
    } finally {
      setBusy(false);
    }
  };

  const frame = (title: string, desc: string | undefined, nextBtn: { label: string; onPress: () => void; disabled?: boolean }, body: React.ReactNode) => (
    <StepFrame
      progress={(at + 1) / order.length}
      counter={`${at + 1}/${order.length}`}
      title={title}
      desc={desc}
      problem={problem}
      back={{ label: at === 0 ? '닫기' : '이전', onPress: back, disabled: busy }}
      next={{ ...nextBtn, disabled: busy || nextBtn.disabled }}
      c={c}
    >
      {body}
    </StepFrame>
  );

  /* 권한 없는 계정은 관리자 승인 문의 · 재확인으로. 나이 제한은 그대로. */
  if (start.gate === 'free' || start.gate === 'age')
    return frame('코치', start.gate === 'free' ? '관리자 승인 후 이용할 수 있어요.' : '만 14세부터 쓸 수 있어요.', { label: '닫기', onPress: () => router.back() }, <><Points />{start.gate === 'free' ? <CoachAccessActions onGranted={loadStart} /> : null}</>);

  const i = start.info;
  switch (page) {
    case 'intro':
      return frame('코치 시작하기', '2~3분이면 돼요. 고른 답은 화면마다 저장돼요.', { label: '시작', onPress: next }, <Points />);
    case 'info':
      return frame(
        '내 정보가 맞나요?',
        '다르면 설정에서 고친 뒤 다시 와 주세요.',
        { label: '맞아요', onPress: next },
        <SummaryRows
          c={c}
          rows={[
            { label: '나이', value: i.age == null ? '모름' : `만 ${i.age}세` },
            { label: '키 · 몸무게', value: `${i.heightCm ?? '-'}cm · ${i.weightKg ?? '-'}kg` },
            { label: '던지는 손', value: i.hand ?? '모름' },
            { label: '운동 경력', value: i.level ?? '모름' },
            { label: '하루 운동', value: i.minutes ? `${i.minutes}분` : '모름' },
            { label: '장비', value: i.equipment.length ? `${i.equipment.length}개` : '없음' },
            { label: '프로그램', value: i.program ? `${i.program.name} · 주 ${i.program.perWeek}번` : '없음' },
          ]}
        />
      );
    case 'consent':
      return frame(
        start.health.title,
        '코치는 아픈 곳을 피해 일정을 짜서 이 동의가 있어야 시작할 수 있어요.',
        { label: '동의하고 계속', onPress: () => void agree() },
        <SummaryRows
          c={c}
          rows={[
            { label: '받는 것', value: start.health.items },
            { label: '쓰는 곳', value: start.health.purpose },
            { label: '보관', value: start.health.retention },
            { label: '안 하면', value: start.health.refusal },
          ]}
        />
      );
    case 'goal':
      return frame('가장 먼저 좋아지고 싶은 것은?', undefined, { label: '다음', onPress: () => void save('goal', { priority: a.priority }), disabled: !a.priority }, (
        <ChoiceChips c={c} options={[...COACH_PRIORITIES]} value={a.priority ?? null} onChange={(v) => setA({ ...a, priority: v as CoachSaved['priority'] })} />
      ));
    case 'outing': {
      const starter = a.role === 'starter' || a.role === 'both';
      return frame('보통 어떻게 던져요?', starter ? '등판 요일이나 간격 중 아는 것만 골라요.' : undefined, {
        label: '다음',
        onPress: () => void save('outing', { role: a.role, outingDays: starter ? (a.outingDays ?? []) : [], outingEvery: starter ? (a.outingEvery ?? null) : null }),
        disabled: !a.role,
      }, (
        <View style={{ gap: 20 }}>
          <ChoiceChips c={c} legend="역할" options={[...COACH_ROLES]} value={a.role ?? null} onChange={(v) => setA({ ...a, role: v as CoachSaved['role'] })} />
          {starter ? (
            <>
              <DayChips c={c} legend="보통 등판 요일" value={a.outingDays ?? []} onChange={(d) => setA({ ...a, outingDays: d, outingEvery: null })} />
              <ChoiceChips
                c={c}
                legend="또는 며칠 간격"
                options={[5, 6, 7].map((n) => ({ value: String(n), label: `${n}일` }))}
                value={a.outingEvery ? String(a.outingEvery) : null}
                onChange={(v) => setA({ ...a, outingEvery: Number(v), outingDays: [] })}
              />
            </>
          ) : null}
        </View>
      ));
    }
    case 'fixed':
      return frame('매주 팀 훈련하는 요일이 있나요?', '없으면 그냥 다음을 눌러요. 경기 · 일정은 달력에서 읽어요.', { label: '다음', onPress: () => void save('fixed', { teamDays: a.teamDays ?? [] }) }, (
        <DayChips c={c} value={a.teamDays ?? []} onChange={(d) => setA({ ...a, teamDays: d })} />
      ));
    case 'availability':
      return frame('언제 운동할 수 있어요?', undefined, {
        label: '다음',
        onPress: () => void save('availability', { days: a.days ?? [], minutes: a.minutes }),
        disabled: !a.days?.length || !a.minutes,
      }, (
        <View style={{ gap: 20 }}>
          <DayChips c={c} legend="요일" value={a.days ?? []} onChange={(d) => setA({ ...a, days: d })} />
          <ChoiceChips c={c} legend="하루 시간" options={COACH_MINUTES.map((m) => ({ value: String(m), label: `${m}분` }))} value={a.minutes ? String(coachMinutes(a.minutes)) : null} onChange={(v) => setA({ ...a, minutes: Number(v) })} />
        </View>
      ));
    case 'limits':
      return frame('피해야 할 동작이 있나요?', '전문가가 정해 준 것만 골라요. 없으면 다음을 눌러요.', { label: '첫 주 보기', onPress: () => void save('limits', { limits: a.limits ?? [] }) }, (
        <MultiChips c={c} options={[...COACH_LIMITS]} value={a.limits ?? []} onChange={(v) => setA({ ...a, limits: v as CoachSaved['limits'] })} />
      ));
    case 'preview': {
      const week = preview ? (preview.suggested && withProgram ? preview.withProgram : preview.week) : null;
      return frame('이번 주는 이렇게 해요', '운동 목록은 그날 몸 상태를 보고 만들어요.', { label: '시작', onPress: () => void begin(), disabled: !week }, (
        <View style={{ gap: 16 }}>
          {preview?.suggested ? (
            <View style={{ gap: 8 }}>
              <ChoiceChips
                c={c}
                legend={`추천 프로그램 · ${preview.suggested.name}`}
                hint={preview.suggested.why ?? undefined}
                options={[
                  { value: 'yes', label: `이 프로그램으로 · 주 ${preview.suggested.perWeek}번` },
                  { value: 'no', label: '프로그램 없이' },
                ]}
                value={withProgram ? 'yes' : 'no'}
                onChange={(v) => setWithProgram(v === 'yes')}
              />
            </View>
          ) : null}
          {week ? (
            <View style={[st.week, { backgroundColor: c.card, boxShadow: c.float }]}>
              {week.map((s, k) => (
                <View key={s.date} style={[st.row, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                  <Text style={[st.day, { color: c.muted }]}>{WEEKDAY_LABELS[k]}</Text>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{slotLine(s)}</Text>
                    {s.reasons.filter((r) => r !== 'rest').length ? (
                      <Text style={{ color: c.muted, fontSize: 13 }}>{s.reasons.filter((r) => r !== 'rest').map((r) => REASON_TEXT[r]).join(' · ')}</Text>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          ) : (
            <ActivityIndicator />
          )}
        </View>
      ));
    }
  }
}

function Points() {
  return (
    <View style={[st.introPanel, { backgroundColor: '#132c50' }]}>
      <Text style={st.introKicker}>PERSONAL COACH</Text>
      <Text style={st.introTitle}>내 일정에 맞춘 한 주 훈련</Text>
      <Text style={st.introDesc}>계획을 먼저 보고, 상황이 바뀌면 직접 조정해요.</Text>
      {COACH_POINTS.map((p) => (
        <View key={p} style={st.pointRow}><Icon name="circle-check" size={17} color="#c8e5ff" /><Text style={{ color: '#ffffff', fontSize: 15, lineHeight: 22, flex: 1 }}>{p}</Text></View>
      ))}
    </View>
  );
}

/** 여럿 고르는 칩(요일 · 제한) — 다시 누르면 뺀다 */
function MultiChips<T extends string | number>({
  legend,
  options,
  value,
  onChange,
  c,
}: {
  legend?: string;
  options: readonly { value: T; label: string }[];
  value: readonly T[];
  onChange: (v: T[]) => void;
  c: Palette;
}) {
  return (
    <View style={{ gap: 8 }}>
      {legend ? <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{legend}</Text> : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {options.map((o) => {
          const on = value.includes(o.value);
          return (
            <Pressable
              key={String(o.value)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              onPress={() => {
                void Haptics.selectionAsync();
                onChange(on ? value.filter((x) => x !== o.value) : [...value, o.value].sort((x, y) => (x < y ? -1 : 1)));
              }}
              style={[st.chip, { backgroundColor: on ? c.sky : c.card, borderColor: on ? c.sky : c.line }]}
            >
              <Text style={{ color: on ? '#fff' : c.ink, fontSize: 17, fontWeight: '600' }}>{o.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const DAY_OPTIONS = WEEKDAY_LABELS.map((label, i) => ({ value: i as Weekday, label }));
function DayChips(p: { legend?: string; value: readonly Weekday[]; onChange: (v: Weekday[]) => void; c: Palette }) {
  return <MultiChips {...p} options={DAY_OPTIONS} />;
}

const st = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  introPanel: { borderRadius: 21, padding: 20, gap: 10 },
  introKicker: { color: '#c8e5ff', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  introTitle: { color: '#ffffff', fontSize: 24, fontWeight: '800', letterSpacing: -0.6, lineHeight: 31 },
  introDesc: { color: '#dce9fb', fontSize: 15, lineHeight: 22, marginBottom: 5 },
  pointRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  week: { borderRadius: 20, overflow: 'hidden' },
  row: { flexDirection: 'row', gap: 12, paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-start' },
  day: { width: 22, fontSize: 15, fontWeight: '700' },
});
