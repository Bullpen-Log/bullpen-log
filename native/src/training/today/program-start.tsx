import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useRef, useState } from 'react';
import { dateKeyOf, toDateKey } from '@/lib/pitch-stats';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  BASICS_MIN_AGE,
  GOAL_LABELS,
  PLUS_RESERVE,
  PROGRAM_MIN_AGE,
  RECOMMENDED_EQUIPMENT,
  TM_LOOKBACK_DAYS,
  profileBlock,
  type PerWeek,
  type ProgramBlock,
  type ProgramChoice,
  type ProgramGoal,
  type VariantKey,
} from '@/lib/program/program';
import type { ProgramCardProps } from '@/lib/program/load';
import type { TodayProgramStart } from '@/lib/report/training-today-data';
import { act } from '~/mechanics/parts';
import type { Palette } from '~/lib/ui';
import { Sheet } from '~/workout/sheets';
import { BigButton, Chip, LinkRow, s, type TodayActions } from './parts';

/**
 * 근력 · 파워 프로그램 고르기 · 시작(앱 화면) — 웹 app/(app)/training/program-start.tsx 를 옮겼다. 입구 한 줄 + 기본기 카드, 시트는 한 쪽에 하나씩:
 * 목록 → 소개 → [생년월일] [경력] 장비(늘 — 전에 고른 것을 켜 둔 채) → 고정 운동 → 주 몇 번 + 요약 + [시작]. 막힘 글은 서버와 같은 함수(profileBlock · equipmentBlock),
 * 저장은 웹과 같은 서버 동작(program.previewPinned · programChoices · startProgram). 고정 운동 바꾸기(진행 중, 웹 program-card.tsx RepinSheet)도 여기.
 */

const GOALS: { value: ProgramGoal; label: string }[] = (['base', 'strength', 'power'] as const).map((g) => ({ value: g, label: GOAL_LABELS[g] }));

/** 기본기를 보이나 — 웨이트 경력 입문, 또는 나이로 성인 프로그램이 막힌 사람(웹과 같다) */
const offersBasics = (ps: TodayProgramStart) => ps.level === '입문' || ps.blocked != null;

/** '4주 · 주 2~3번' */
const perWeekText = (p: ProgramChoice) =>
  `${p.weeks.length}주 · 주 ${p.perWeek.length > 1 ? `${Math.min(...p.perWeek)}~${Math.max(...p.perWeek)}` : p.perWeek[0]}번`;

/** 'YYYY-MM-DD' → 오늘(한국 날짜, 서버와 같은 기준) 만 나이. 모양이 아니거나 없는 날(2008-02-30)이면 null — 시작을 눌러서야 막히지 않게 */
function ageOf(birth: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birth)) return null;
  const [by, bm, bd] = birth.split('-').map(Number);
  if (dateKeyOf(by, bm - 1, bd) !== birth) return null;
  const [ty, tm, td] = toDateKey(new Date()).split('-').map(Number);
  return ty - by - (tm < bm || (tm === bm && td < bd) ? 1 : 0);
}

/** 숫자만 받아 '2008-03-14' 꼴로 */
const birthText = (t: string) => {
  const d = t.replace(/\D/g, '').slice(0, 8);
  return d.length > 6 ? `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}` : d.length > 4 ? `${d.slice(0, 4)}-${d.slice(4)}` : d;
};

/** 고르기 목록의 두 줄 — 무엇을 · 이런 분께(웹 ProgramGist) */
function Gist({ p, c }: { p: ProgramChoice; c: Palette }) {
  return (
    <>
      <Text style={[s.tiny, { color: c.ink }]}>{p.summary}</Text>
      {p.fit ? <Text style={[s.tiny, { color: c.muted }]}>이런 분께 · {p.fit}</Text> : null}
    </>
  );
}

/** 입구 — 근력 · 파워 프로그램 한 줄과 기본기 카드(성인 프로그램이 막힌 사람에게는 기본기가 먼저, '추천') */
export function ProgramStartView({ ps, c, a }: { ps: TodayProgramStart; c: Palette; a: TodayActions }) {
  /* 열 때마다 새 시트 — 카드로 열면 그 프로그램 소개부터, 입구 줄로 열면 목록부터 */
  const [opening, setOpening] = useState<{ with: ProgramChoice | null } | null>(null);
  const basicsChoice = ps.programs.find((p) => p.audience === 'basics') ?? null;
  const adultCount = ps.programs.filter((p) => p.audience === 'adult').length;
  const showBasics = basicsChoice != null && ps.basicsBlocked == null && offersBasics(ps);
  const recommend = showBasics && ps.blocked != null;

  const basicsCard =
    showBasics && basicsChoice ? (
      <Pressable
        accessibilityRole="button"
        onPress={() => setOpening({ with: basicsChoice })}
        style={[st.entry, { backgroundColor: `${c.sky}14`, borderColor: `${c.sky}66`, borderWidth: 1 }]}
      >
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={s.row}>
            <Text style={[s.bodyBold, { color: c.ink }]}>{basicsChoice.name}</Text>
            {recommend ? <Badge c={c} /> : null}
          </View>
          <Text style={[s.tiny, { color: c.muted }]}>
            웨이트가 처음이면 · 무게 없이 자세부터 · 주 {basicsChoice.perWeek[basicsChoice.perWeek.length - 1]}번 약 35분
          </Text>
        </View>
        <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>
      </Pressable>
    ) : null;

  return (
    <>
      {recommend ? basicsCard : null}
      <Pressable accessibilityRole="button" onPress={() => setOpening({ with: null })} style={[st.entry, { backgroundColor: c.card, boxShadow: c.float }]}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[s.bodyBold, { color: c.ink }]}>근력 · 파워 프로그램</Text>
          <Text style={[s.tiny, { color: c.muted }]}>
            {ps.blocked ? ps.blocked.reason : `${adultCount}개 중에 골라요 · 모두 ${ps.programs[0]?.weeks.length ?? 4}주`}
          </Text>
        </View>
        <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>
      </Pressable>
      {recommend ? null : basicsCard}
      {opening ? <StartSheet ps={ps} startWith={opening.with} onClose={() => setOpening(null)} c={c} a={a} /> : null}
    </>
  );
}

function Badge({ c }: { c: Palette }) {
  return (
    <View style={[st.badge, { backgroundColor: c.sky }]}>
      <Text style={[s.tiny, { color: '#fff', fontWeight: '700' }]}>추천</Text>
    </View>
  );
}

type Step = 'list' | 'intro' | 'level' | 'equipment' | 'birth' | 'pins' | 'summary';
type PinView = { variant: VariantKey; label: string; id: string | null; title: string | null };

function StartSheet({
  ps,
  startWith,
  onClose,
  c,
  a,
}: {
  ps: TodayProgramStart;
  startWith: ProgramChoice | null;
  onClose: () => void;
  c: Palette;
  a: TodayActions;
}) {
  const steps: Step[] = [
    ...(ps.needBirth ? (['birth'] as const) : []),
    ...(ps.level == null ? (['level'] as const) : []),
    /* 장비는 시작할 때마다 고른다(2026-10-20 김민 — 트레이닝 설정의 '가진 장비'를 없앰). 전에 고른 것을 켜 둔 채로 */
    'equipment',
    'pins',
    'summary',
  ];
  const [step, setStep] = useState<Step>(startWith ? 'intro' : 'list');
  const [goal, setGoal] = useState<ProgramGoal>('strength');
  const [choice, setChoice] = useState<ProgramChoice | null>(startWith);
  const [weeksOpen, setWeeksOpen] = useState(false);
  const [perWeekPick, setPerWeekPick] = useState<PerWeek | null>(null);
  const [birth, setBirth] = useState('');
  const [level, setLevel] = useState<string | null>(ps.level);
  const [owned, setOwned] = useState<string[]>(() => ps.owned.filter((e) => ps.equipment.includes(e)));
  const [pins, setPins] = useState<PinView[] | null>(null);
  const [changing, setChanging] = useState<VariantKey | null>(null);
  const [choices, setChoices] = useState<{ id: string; title: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const basics = choice?.audience === 'basics';
  const audience = choice?.audience ?? 'adult';
  const at = steps.indexOf(step);
  const go = (next: Step) => {
    setError(null);
    setStep(next);
  };
  const equipmentForCall = owned;
  const levelForCall = ps.level == null ? level : null;
  /* 주 3번이 기본(되는 프로그램만) */
  const perWeek: PerWeek = choice ? (perWeekPick ?? (choice.perWeek.includes(3) ? 3 : 2)) : 3;

  const run = async (job: () => Promise<void>) => {
    setPending(true);
    try {
      await job();
    } finally {
      setPending(false);
    }
  };
  const loadPins = () =>
    run(async () => {
      if (!choice) return;
      setPins(null);
      const r = await act<{ pinned: PinView[] }>('program.previewPinned', {
        programId: choice.id,
        ownedEquipment: equipmentForCall,
        trainingLevel: levelForCall,
      });
      if ('error' in r) setError(r.error);
      else setPins(r.pinned);
    });
  const next = () => {
    const n = steps[at + 1];
    if (n === 'pins') void loadPins();
    if (n) go(n);
  };
  const back = () => (at <= 0 ? go('intro') : go(steps[at - 1]));
  const pick = (p: ProgramChoice) => {
    setChoice(p);
    setPins(null);
    setPerWeekPick(null);
    setWeeksOpen(false);
    go('intro');
  };
  /* 마지막으로 연 칸 — 빠르게 두 칸을 눌렀을 때 앞 칸의 후보가 늦게 와 뒤 칸 목록으로 보이지 않게 */
  const asked = useRef<VariantKey | null>(null);
  const openChoices = (v: VariantKey) =>
    run(async () => {
      asked.current = v;
      setChanging(v);
      setChoices(null);
      const r = await act<{ choices: { id: string; title: string }[] }>('program.programChoices', {
        variant: v,
        programId: choice?.id ?? null,
        ownedEquipment: equipmentForCall,
        trainingLevel: levelForCall,
      });
      if (asked.current !== v) return;
      if ('error' in r) setError(r.error);
      else setChoices(r.choices);
    });
  const submit = () =>
    run(async () => {
      if (!choice) return;
      setError(null);
      const r = await act<{ ok: true }>('program.startProgram', {
        programId: choice.id,
        perWeek,
        birthDate: ps.needBirth ? birth : null,
        trainingLevel: levelForCall,
        ownedEquipment: equipmentForCall,
        pinned: Object.fromEntries((pins ?? []).filter((x) => x.id).map((x) => [x.variant, x.id as string])),
      });
      if ('error' in r) return setError(r.error);
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onClose();
      await a.reload();
    });

  /* 막힘 — 서버(checkEligibility)와 같은 함수로. 장비는 늘 장비 칸에서 고르므로 빠진 장비는 그 칸이 말한다 */
  const choiceBlocked = choice ? ((basics ? ps.basicsBlocked : ps.blocked) ?? null) : null;
  const birthAge = ageOf(birth);
  const birthBlocked = birthAge == null ? null : profileBlock({ audience, age: birthAge, trainingLevel: null });
  const levelBlocked = profileBlock({ audience, age: null, trainingLevel: level, basicsDone: ps.basicsDone });
  const required = choice?.required ?? [];
  const missing = required.filter((e) => !owned.includes(e));
  const canNext =
    step === 'birth'
      ? birthAge != null && !birthBlocked
      : step === 'level'
        ? level != null && !levelBlocked
        : step === 'equipment'
          ? missing.length === 0
          : step === 'pins'
            ? pins != null && changing == null
            : true;

  const basicsChoices = offersBasics(ps) ? ps.programs.filter((p) => p.audience === 'basics') : [];
  const shown = ps.programs.filter((p) => p.audience === 'adult' && p.goal === goal);
  const changingLabel = pins?.find((x) => x.variant === changing)?.label ?? '';
  const recommendedMissing = RECOMMENDED_EQUIPMENT.filter((e) => !owned.includes(e));

  return (
    <Sheet
      open
      onClose={onClose}
      title={step === 'list' || !choice ? '프로그램 고르기' : changing ? `${changingLabel} 바꾸기` : choice.name}
      c={c}
      footer={
        step !== 'list' && step !== 'intro' ? (
          <View style={[s.row, { gap: 8 }]}>
            <Pressable
              accessibilityRole="button"
              onPress={() => (changing ? setChanging(null) : back())}
              style={[s.big, { flex: 1, backgroundColor: c.chip }]}
            >
              <Text style={[s.bigText, { color: c.ink }]}>뒤로</Text>
            </Pressable>
            <View style={{ flex: 2 }}>
              <BigButton
                c={c}
                busy={pending && step === 'summary'}
                disabled={!canNext || pending}
                label={step === 'summary' ? (pending ? '시작하는 중…' : '시작') : '다음'}
                onPress={() => (step === 'summary' ? void submit() : next())}
              />
            </View>
          </View>
        ) : undefined
      }
    >
      {step !== 'list' && step !== 'intro' ? (
        <View accessibilityLabel={`${at + 1} / ${steps.length}`} style={[s.row, { gap: 4 }]}>
          {steps.map((x, i) => (
            <View key={x} style={[st.dot, { backgroundColor: i <= at ? c.sky : c.line }]} />
          ))}
        </View>
      ) : null}

      {step === 'list' ? (
        <>
          {basicsChoices.map((p) => (
            <Pressable
              key={p.id}
              accessibilityRole="button"
              onPress={() => pick(p)}
              style={[st.entry, { backgroundColor: `${c.sky}14`, borderColor: `${c.sky}66`, borderWidth: 1 }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <View style={s.row}>
                  <Text style={[s.bodyBold, { color: c.ink }]}>{p.name}</Text>
                  {ps.blocked && !ps.basicsBlocked ? <Badge c={c} /> : null}
                </View>
                <Gist p={p} c={c} />
              </View>
              <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>
            </Pressable>
          ))}
          <View accessibilityRole="tablist" style={[st.seg, { backgroundColor: c.chip }]}>
            {GOALS.map((g) => (
              <Pressable
                key={g.value}
                accessibilityRole="tab"
                accessibilityState={{ selected: goal === g.value }}
                onPress={() => setGoal(g.value)}
                style={[st.segItem, goal === g.value && { backgroundColor: c.card }]}
              >
                <Text style={[s.small, { color: c.ink, fontWeight: goal === g.value ? '700' : '500' }]}>{g.label}</Text>
              </Pressable>
            ))}
          </View>
          {ps.blocked ? (
            <Text style={[s.tiny, { color: c.muted }]}>
              {ps.blocked.reason} {ps.blocked.action}
            </Text>
          ) : null}
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 4, gap: 0 }]}>
            {shown.map((p, i) => (
              <Pressable
                key={p.id}
                accessibilityRole="button"
                onPress={() => pick(p)}
                style={[st.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={s.between}>
                    <Text style={[s.bodyBold, { flex: 1, color: c.ink }]}>{p.name}</Text>
                    <Text style={[s.tiny, { color: c.muted }]}>{perWeekText(p)}</Text>
                  </View>
                  <Gist p={p} c={c} />
                </View>
                <Text style={{ color: c.muted, fontSize: 18 }}>›</Text>
              </Pressable>
            ))}
          </View>
        </>
      ) : null}

      {step === 'intro' && choice ? (
        <>
          <View style={{ gap: 4 }}>
            <Text style={[s.body, { color: c.ink }]}>{choice.summary}</Text>
            {choice.fit ? <Text style={[s.body, { color: c.muted }]}>이런 분께 · {choice.fit}</Text> : null}
            <Text style={[s.tiny, { color: c.muted }]}>
              {perWeekText(choice)} · {choice.origin}
            </Text>
          </View>
          <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 4 }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: weeksOpen }}
              onPress={() => setWeeksOpen((v) => !v)}
              style={s.linkRow}
            >
              <Text style={[s.bodyBold, { flex: 1, color: c.ink }]}>자세히 보기</Text>
              <SymbolView name={weeksOpen ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
            </Pressable>
            {weeksOpen ? (
              <View style={{ gap: 8, paddingBottom: 12 }}>
                {choice.how ? <Text style={[s.small, { color: c.ink }]}>{choice.how}</Text> : null}
                {choice.why ? <Text style={[s.small, { color: c.ink }]}>{choice.why}</Text> : null}
                {choice.detail.map((d) => (
                  <Text key={d} style={[s.small, { color: c.muted }]}>
                    {d}
                  </Text>
                ))}
                {choice.weeks.map((w) => (
                  <Text key={w} style={[s.small, { color: c.ink }]}>
                    {w}
                  </Text>
                ))}
              </View>
            ) : null}
          </View>
          {required.length > 0 ? (
            <View style={s.chips}>
              {required.map((e) => (
                <View key={e} style={[s.chip, { borderWidth: 1, borderColor: c.line }]}>
                  <Text style={[s.smallBold, { color: c.ink }]}>{e}</Text>
                </View>
              ))}
            </View>
          ) : (
            <Text style={[s.tiny, { color: c.muted }]}>맨몸으로 할 수 있어요. 밴드 · 덤벨 · 메디신볼이 있으면 더 골라서 해요.</Text>
          )}
          {choiceBlocked ? <Blocked b={choiceBlocked} c={c} /> : <BigButton c={c} label="이걸로 할래요" onPress={next} />}
          <LinkRow c={c} label="다른 프로그램 보기" onPress={() => go('list')} />
        </>
      ) : null}

      {step === 'birth' ? (
        <>
          <Text style={[s.cardTitle, { color: c.ink }]}>생년월일을 알려 주세요</Text>
          <TextInput
            value={birth}
            onChangeText={(t) => setBirth(birthText(t))}
            keyboardType="number-pad"
            placeholder="2008-03-14"
            placeholderTextColor={c.muted}
            accessibilityLabel="생년월일"
            style={[st.input, { backgroundColor: c.card, color: c.ink, borderColor: c.line }]}
          />
          {birthBlocked ? (
            <Blocked b={birthBlocked} c={c} />
          ) : (
            <Text style={[s.tiny, { color: c.muted }]}>만 {basics ? BASICS_MIN_AGE : PROGRAM_MIN_AGE}세부터 할 수 있어요.</Text>
          )}
        </>
      ) : null}

      {step === 'level' ? (
        <>
          <Text style={[s.cardTitle, { color: c.ink }]}>웨이트 경력은 얼마나 돼요?</Text>
          {ps.levels.map((l) => (
            <Pressable
              key={l.name}
              accessibilityRole="radio"
              accessibilityState={{ selected: level === l.name }}
              onPress={() => setLevel(l.name)}
              style={[st.option, { backgroundColor: c.card, boxShadow: c.float, borderColor: level === l.name ? c.sky : 'transparent' }]}
            >
              <Text style={[s.bodyBold, { color: c.ink }]}>{l.name}</Text>
              <Text style={[s.tiny, { flex: 1, textAlign: 'right', color: c.muted }]}>{l.desc}</Text>
            </Pressable>
          ))}
          {levelBlocked ? <Blocked b={levelBlocked} c={c} /> : null}
        </>
      ) : null}

      {step === 'equipment' ? (
        <>
          <Text style={[s.cardTitle, { color: c.ink }]}>쓸 수 있는 장비를 골라 주세요</Text>
          <Text style={[s.tiny, { color: c.muted }]}>
            {required.length > 0
              ? `${required.join(' · ')}은 꼭 있어야 해요.`
              : '맨몸으로도 할 수 있어요. 가진 것을 모두 골라 주세요. 당기기는 밴드 · 철봉 · TRX · 덤벨 중 하나가 있어야 해요.'}
          </Text>
          <View style={s.chips}>
            {[...required, ...ps.equipment.filter((e) => !required.includes(e))].map((e) => (
              <Chip
                key={e}
                c={c}
                label={e}
                on={owned.includes(e)}
                onPress={() => setOwned((list) => (list.includes(e) ? list.filter((x) => x !== e) : [...list, e]))}
              />
            ))}
          </View>
          {missing.length > 0 && owned.length > 0 ? <Text style={[s.small, { color: c.muted }]}>{missing.join(', ')}도 있어야 해요.</Text> : null}
          {!basics ? (
            <Text style={[s.tiny, { color: c.muted }]}>권장: {RECOMMENDED_EQUIPMENT.join(' · ')}. 있으면 보조 운동이 다양해져요.</Text>
          ) : null}
        </>
      ) : null}

      {step === 'pins' ? (
        <>
          <Text style={[s.cardTitle, { color: c.ink }]}>{changing ? '바꿀 운동을 골라요' : `이 ${pins?.length ?? ''}가지로 해요`}</Text>
          {changing ? (
            <PickList
              items={choices}
              empty="바꿀 수 있는 운동이 없어요."
              c={c}
              onPick={(x) => {
                setPins((list) => (list ?? []).map((p) => (p.variant === changing ? { ...p, id: x.id, title: x.title } : p)));
                setChanging(null);
              }}
            />
          ) : pins == null ? (
            <Text style={[s.small, { color: c.muted }]}>{pending ? '고르는 중…' : ''}</Text>
          ) : (
            <PinList pins={pins} c={c} busy={pending} onChange={(v) => void openChoices(v)} empty="할 수 있는 운동이 없어요" />
          )}
        </>
      ) : null}

      {step === 'summary' && choice ? (
        <>
          <Text style={[s.cardTitle, { color: c.ink }]}>준비됐어요</Text>
          {choice.perWeek.length > 1 ? (
            <View style={s.chips}>
              {choice.perWeek.map((n) => (
                <Chip key={n} c={c} label={`주 ${n}번`} on={perWeek === n} onPress={() => setPerWeekPick(n === 2 ? 2 : 3)} />
              ))}
            </View>
          ) : null}
          <Text style={[s.body, { color: c.ink }]}>
            {perWeek * choice.weeks.length}회 · {choice.weeks.length}주. 오늘부터 할 수 있어요.
          </Text>
          <Text style={[s.body, { color: c.muted }]}>
            {basics
              ? '무게는 추천하지 않아요. 같은 자세가 끝까지 유지되는 가장 가벼운 것으로 해요. 2주차에 세트, 3주차에 횟수가 늘어요.'
              : choice.usesPct
                ? `기준 무게는 시작 전 ${TM_LOOKBACK_DAYS / 7}주 기록으로 정해요. 기록이 없으면 첫날 ${PLUS_RESERVE}개 남는 무게로 정해요.`
                : '기록이 없으면 처음엔 몇 개 남는 무게로 맞추고, 그 뒤부터 추천해요.'}
          </Text>
          {!basics && recommendedMissing.length > 0 ? (
            <Text style={[s.body, { color: c.muted }]}>
              {recommendedMissing.join(' · ')}가 있으면 보조 운동이 다양해져요. 없으면 비슷한 운동으로 바꿔 넣어요.
            </Text>
          ) : null}
        </>
      ) : null}

      {error ? <Text style={[s.small, s.box, { color: c.danger, backgroundColor: `${c.danger}14` }]}>{error}</Text> : null}
    </Sheet>
  );
}

function Blocked({ b, c }: { b: ProgramBlock; c: Palette }) {
  return (
    <View style={[s.box, { backgroundColor: c.chip, gap: 2 }]}>
      <Text style={[s.small, { color: c.ink }]}>{b.reason}</Text>
      <Text style={[s.small, { color: c.muted }]}>{b.action}</Text>
    </View>
  );
}

/** 고정 운동 줄들 — 칸 이름 · 지금 운동 · [바꾸기] */
function PinList({
  pins,
  c,
  onChange,
  empty,
  busy = false,
}: {
  pins: { variant: VariantKey; label: string; title: string | null }[];
  c: Palette;
  onChange: (v: VariantKey) => void;
  empty: string;
  busy?: boolean;
}) {
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 4, gap: 0 }]}>
      {pins.map((x, i) => (
        <Pressable
          key={x.variant}
          accessibilityRole="button"
          accessibilityLabel={`${x.label} 바꾸기`}
          disabled={busy}
          onPress={() => onChange(x.variant)}
          style={[st.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[s.tiny, { color: c.muted }]}>{x.label}</Text>
            <Text numberOfLines={1} style={[s.body, { color: c.ink }]}>
              {x.title ?? empty}
            </Text>
          </View>
          <Text style={[s.bodyBold, { color: c.sky }]}>바꾸기</Text>
        </Pressable>
      ))}
    </View>
  );
}

/** 후보 고르기 — 못 받았으면 불러오는 중, 없으면 한 줄 */
function PickList({
  items,
  empty,
  c,
  onPick,
  current,
  busy = false,
}: {
  items: { id: string; title: string }[] | null;
  empty: string;
  c: Palette;
  onPick: (x: { id: string; title: string }) => void;
  current?: string | null;
  busy?: boolean;
}) {
  if (items == null) return <Text style={[s.small, { color: c.muted }]}>불러오는 중…</Text>;
  if (items.length === 0) return <Text style={[s.small, { color: c.muted }]}>{empty}</Text>;
  return (
    <View style={[s.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 4, gap: 0 }]}>
      {items.map((x, i) => (
        <Pressable
          key={x.id}
          accessibilityRole="button"
          disabled={busy}
          onPress={() => onPick(x)}
          style={[st.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, busy && { opacity: 0.5 }]}
        >
          <Text numberOfLines={1} style={[s.body, { flex: 1, color: c.ink }]}>
            {x.title}
          </Text>
          {current === x.title ? <Text style={[s.tiny, { color: c.muted }]}>지금</Text> : null}
        </Pressable>
      ))}
    </View>
  );
}

/** 고정 운동 바꾸기(진행 중인 프로그램, 웹 RepinSheet) — 같은 칸 · 같은 계열 후보만. 바꾸면 그 운동의 무게 기록은 새로 시작해요 */
export function RepinSheet({ pinned, onClose, c, a }: { pinned: ProgramCardProps['pinned']; onClose: () => void; c: Palette; a: TodayActions }) {
  const [variant, setVariant] = useState<VariantKey | null>(null);
  const [choices, setChoices] = useState<{ id: string; title: string }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const current = pinned.find((x) => x.variant === variant);

  /* 마지막으로 연 칸 — 앞 칸의 후보가 늦게 와 뒤 칸 목록으로 보이지 않게 */
  const asked = useRef<VariantKey | null>(null);
  const pick = async (v: VariantKey) => {
    asked.current = v;
    setError(null);
    setVariant(v);
    setChoices(null);
    const r = await act<{ choices: { id: string; title: string }[] }>('program.programChoices', { variant: v });
    if (asked.current !== v) return;
    if ('error' in r) setError(r.error);
    else setChoices(r.choices);
  };
  const choose = async (id: string) => {
    if (!variant || pending) return;
    setPending(true);
    const r = await act<{ ok: true }>('program.repinProgramExercise', { variant, exerciseId: id });
    setPending(false);
    if ('error' in r) return setError(r.error);
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onClose();
    await a.reload();
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={variant ? `${current?.label ?? ''} 바꾸기` : '고정 운동 바꾸기'}
      description="바꾼 운동의 무게 기록은 새로 시작해요."
      c={c}
    >
      {variant == null ? (
        <PinList pins={pinned} c={c} onChange={(v) => void pick(v)} empty="고를 수 있는 운동이 없어요" />
      ) : (
        <>
          <PickList
            items={choices}
            empty="가진 장비로 바꿀 수 있는 운동이 없어요."
            c={c}
            current={current?.title}
            busy={pending}
            onPick={(x) => void choose(x.id)}
          />
          <LinkRow c={c} label="다른 칸 고르기" onPress={() => setVariant(null)} />
        </>
      )}
      {error ? <Text style={[s.small, s.box, { color: c.danger, backgroundColor: `${c.danger}14` }]}>{error}</Text> : null}
    </Sheet>
  );
}

const st = StyleSheet.create({
  entry: { minHeight: 60, borderRadius: 16, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  badge: { borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, minHeight: 40, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  item: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  option: { minHeight: 52, borderRadius: 14, borderWidth: 2, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12 },
  dot: { flex: 1, height: 4, borderRadius: 2 },
  input: { minHeight: 48, borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
});
