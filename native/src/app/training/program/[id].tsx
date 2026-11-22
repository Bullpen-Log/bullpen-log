import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, withTiming } from 'react-native-reanimated';
import {
  RECOMMENDED_EQUIPMENT,
  programChoiceList,
  programDef,
  programOutline,
  sessionTitle,
  type PerWeek,
  type ProgramOutline,
} from '@/lib/program/program';
import { withJosa } from '@/lib/korean';
import { act } from '~/mechanics/parts';
import { RADIUS, SPACE, SURFACE, TYPE, usePalette, withAlpha, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Segmented, SectionHead } from '~/shell/heading';
import { layoutMove } from '~/home/day-card';
import { Icon } from '~/shell/icon';
import { CountUp, fadeIn, rowIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { openCheckin } from '~/shell/web-nav';
import { Cover } from '~/training/program-cards';
import { useTrainingToday } from '~/training/program/data';
import { RepinSheet } from '~/training/today/program-start';
import { FlowBar, FooterActions, type FooterAction } from '~/videos/flow-parts';

/**
 * 프로그램 상세(2026-10-30 확정 시안 01) — 트레이닝 탭의 프로그램 카드를 누르면 연다. 보기만 한다: 열었다고 등록 · 세션 · 진도가 바뀌지 않는다.
 *
 * 차례(2026-11-22 김민 "난잡하고 조잡해" — 다시 짬): 머리 카드(커버 · 이름 · 요약 · 기간/한 주에/모두 숫자 셋 · 주당 횟수 고르개) → 진도 →
 * 주차별 일정(주 고르개 하나 · 세션마다 카드, 지난주와 달라진 양은 파랑) → 안내(이런 분께 · 진행 방식 · 효과 · 장비 · 접힌 자세한 규칙) → 아래 고정 단추.
 * 예전의 '운동 구성'(첫 주 세션 탭)은 1주차 일정과 같은 내용이라 합쳤고, 대상 · 장비 상자는 안내와 겹쳐 뺐다.
 *
 * 단추는 서버의 오늘 판정을 그대로 따른다(app-training.loadAppTrainingToday): 시작 전이면 [시작 준비], 이 프로그램을 하는 중이면 오늘 상태에 따라
 * [오늘 운동 확인] · [운동 이어하기] · [체크인하기], 다른 프로그램을 하는 중이면 [진행 중 프로그램 보기], 오늘 일정을 이미 만든 날 · 자격이 안 되는
 * 날은 까닭만. 숨김 · 옛 프로그램은 새로 보이지 않는다(하는 중인 사람만 자기 프로그램을 본다).
 */
export default function ProgramDetailScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id, perWeek: pwParam } = useLocalSearchParams<{ id: string; perWeek?: string }>();
  const { data, failed, reload } = useTrainingToday();
  const choice = programChoiceList().find((p) => p.id === id) ?? null;
  const def = choice ? programDef(choice.id) : null;
  const card = data?.programCard ?? null;
  const isThis = card != null && card.programId === id;
  const otherActive = card != null && !isThis;
  const [perWeekPick, setPerWeekPick] = useState<PerWeek | null>(pwParam === '2' ? 2 : pwParam === '3' ? 3 : null);
  const [week, setWeek] = useState(0);
  const [more, setMore] = useState(false);
  const [repin, setRepin] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  /* 다른 화면(오늘 운동 · 체크인)에서 돌아오면 판정을 다시 읽는다 */
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void reload();
      focused.current = true;
    }, [reload])
  );

  const perWeeks = def?.perWeek ?? [];
  /* 하는 중이면 그 주당 횟수, 아니면 3번(되는 프로그램만) */
  const perWeek: PerWeek = perWeekPick ?? (isThis && card && (card.perWeek === 2 || card.perWeek === 3) ? card.perWeek : perWeeks.includes(3) ? 3 : 2);
  const outline = def ? programOutline(def, perWeek) : null;

  /* 숨김 · 옛 프로그램 — 새로 보이지 않는다. 하는 중인 사람에게만 짧은 안내 */
  if (!choice || !def || !outline) {
    return (
      <View style={{ flex: 1, paddingTop: inset.top, backgroundColor: c.page }}>
        <FlowBar title="프로그램" onBack={() => router.back()} />
        <View style={{ padding: 24, gap: 12 }}>
          {isThis && card ? (
            <>
              <Text style={[TYPE.hero, { color: c.ink }]}>{card.name}</Text>
              <Text style={[TYPE.body, { color: c.muted }]}>지금은 새로 고를 수 없는 프로그램이에요. 하던 기록은 그대로 남아 있어요.</Text>
            </>
          ) : (
            <Text style={[TYPE.body, { color: c.muted }]}>지금은 볼 수 없는 프로그램이에요.</Text>
          )}
        </View>
      </View>
    );
  }

  const ps = data?.programStart ?? null;
  const blocked = choice.audience === 'basics' ? (ps?.basicsBlocked ?? null) : (ps?.blocked ?? null);
  const doneThis = data?.programDone != null && data.programDone.name === choice.name;

  /** 확인 창 뒤 서버 동작 — 끝나면 다시 읽는다(그만두기) */
  const confirm = (head: string, detail: string, label: string, pendingLabel: string, action: string) =>
    Alert.alert(head, detail, [
      { text: '취소', style: 'cancel' },
      {
        text: label,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            setPending(pendingLabel);
            setError(null);
            const r = await act<{ ok: true }>(action);
            setPending(null);
            if ('error' in r) return setError(r.error);
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            await reload();
          })();
        },
      },
    ]);

  /* 아래 고정 단추 — 서버 판정 그대로 */
  let primary: FooterAction | null = null;
  let note: string | null = null;
  if (!data) {
    primary = failed ? { label: '다시 불러오기', onPress: () => void reload() } : { label: '불러오는 중', onPress: () => undefined, busy: true };
    note = failed ? '시작할 수 있는지 확인하지 못했어요. 설명은 그대로 볼 수 있어요.' : null;
  } else if (isThis && card) {
    if (card.todayState === 'active') primary = { label: '운동 이어하기', icon: 'play', onPress: () => router.push('/workout' as Href) };
    else if (card.kind === 'needCheckin') {
      primary = { label: '체크인하기', onPress: () => openCheckin(`/training/program/${choice.id}`) };
      note = '체크인을 남기면 오늘 몸 상태에 맞춰 정해요.';
    } else if (card.kind === 'done') note = '프로그램을 다 마쳤어요.';
    else primary = { label: '오늘 운동 확인', onPress: () => router.push('/training/program-today' as Href) };
    if (card.todayState === 'finished') note = `오늘 운동을 마쳤어요.${card.nextLabel ? ` 다음: ${sessionTitle(card.nextLabel)}` : ''}`;
    else if (card.kind === 'rest' || card.kind === 'painWait') note = card.restText ?? '오늘은 쉬어요.';
  } else if (otherActive && card) {
    primary = card.programId
      ? { label: '진행 중 프로그램 보기', onPress: () => router.replace(`/training/program/${card.programId}` as Href) }
      : { label: '진행 중 프로그램 보기', onPress: () => router.push('/training-today' as Href) };
    note = `지금 ${withJosa(card.name, '을/를')} 하고 있어요. 바꾸려면 그 프로그램을 먼저 그만둬요.`;
  } else if (ps == null) {
    note = '오늘은 운동 일정을 이미 만들어서, 프로그램은 내일 시작할 수 있어요.';
  } else if (blocked) {
    note = `${blocked.reason} ${blocked.action}`;
  } else {
    primary = { label: '시작 준비', onPress: () => router.push({ pathname: '/training/program-start' as never, params: { id: choice.id, perWeek: String(perWeek) } }) };
  }

  const wk = outline.weekRows[Math.min(week, outline.weekRows.length - 1)];
  const prevWk = week > 0 ? outline.weekRows[week - 1] : null;
  const changedAny = prevWk != null && wk.days.some((d) => d.items.some((it) => changedFrom(prevWk, d, it)));
  const recommended = RECOMMENDED_EQUIPMENT.filter((e) => !choice.required.includes(e));
  const guide = [
    choice.fit ? { key: 'fit', title: '이런 분께', body: choice.fit } : null,
    choice.how ? { key: 'how', title: '진행 방식', body: choice.how } : null,
    choice.why ? { key: 'why', title: '효과', body: choice.why } : null,
    {
      key: 'gear',
      title: '필요한 장비',
      body: choice.required.length > 0 ? choice.required.join(' · ') : '맨몸으로 할 수 있어요',
      sub: choice.audience !== 'basics' && recommended.length > 0 ? `있으면 좋아요 · ${recommended.join(' · ')}` : null,
    },
  ].filter((x): x is { key: string; title: string; body: string; sub?: string | null } => x != null);

  return (
    <View style={{ flex: 1, paddingTop: inset.top, backgroundColor: c.page }}>
      <FlowBar title="프로그램" onBack={() => router.back()} backLabel="뒤로 가기" />
      <ScrollView contentContainerStyle={[{ padding: SPACE.side, gap: SPACE.section, paddingBottom: 32 }, READABLE]}>
        {/* 머리 — 카드에서 이어지는 커버 · 이름 · 숫자 셋 · 주당 횟수 */}
        <View style={[st.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
          <Cover p={choice} c={c} active={isThis} />
          <View style={{ padding: SPACE.pad, gap: 16 }}>
            <View style={{ gap: 6 }}>
              <Text accessibilityRole="header" style={[TYPE.hero, { color: c.ink }]}>
                {choice.name}
              </Text>
              <Text style={[TYPE.body, { color: c.muted }]}>{choice.summary}</Text>
            </View>
            <View style={[st.stats, { borderColor: c.line }]}>
              <Stat value={outline.weeks} unit="주" label="기간" c={c} />
              <Stat value={perWeek} unit="회" label="한 주에" c={c} line />
              <Stat value={outline.totalDays} unit="세션" label="모두" c={c} line />
            </View>
            {perWeeks.length > 1 ? (
              <Segmented
                label="한 주에 몇 번"
                options={perWeeks.map((n) => ({ value: String(n), label: `주 ${n}회` }))}
                value={String(perWeek)}
                onChange={(v) => {
                  setPerWeekPick(v === '2' ? 2 : 3);
                  setWeek(0);
                }}
              />
            ) : null}
          </View>
        </View>

        {/* 진행 중이면 실제 진도 — 완료와 건너뜀을 따로 */}
        {isThis && card ? (
          <View style={[st.card, SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[TYPE.card, { color: c.ink }]}>{sessionTitle(card.dayLabel)}</Text>
            <View accessibilityRole="progressbar" accessibilityLabel="프로그램 진행" accessibilityValue={{ min: 0, max: card.total, now: card.completed + card.skipped }} style={[st.bar, { backgroundColor: withAlpha(c.ink, 0.08) }]}>
              <View style={{ width: `${(card.completed / card.total) * 100}%`, backgroundColor: c.action }} />
              <View style={{ width: `${(card.skipped / card.total) * 100}%`, backgroundColor: withAlpha(c.action, 0.35) }} />
            </View>
            <Text style={[TYPE.sub, { color: c.muted }]}>
              완료 {card.completed} · 건너뜀 {card.skipped} / {card.total}세션
            </Text>
          </View>
        ) : doneThis ? (
          <View style={[st.card, SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[TYPE.card, { color: c.ink }]}>이 프로그램을 다 마쳤어요</Text>
            <Text style={[TYPE.sub, { color: c.muted }]}>
              완료 {data?.programDone?.completed} · 건너뜀 {data?.programDone?.skipped} · {data?.programDone?.weeks}주
            </Text>
          </View>
        ) : null}

        {/* 주차별 일정 — 미리보기(진도는 바뀌지 않는다). 무게는 사람마다라 % · 횟수만 */}
        <View style={{ gap: 12 }}>
          <SectionHead title="주차별 일정" />
          <Segmented label="주차" options={outline.weekRows.map((w, i) => ({ value: String(i), label: `${w.week}주` }))} value={String(week)} onChange={(v) => setWeek(Number(v))} />
          {wk.light || wk.note || changedAny ? (
            <Animated.View key={`n-${perWeek}-${week}`} entering={fadeIn} style={{ gap: 2, paddingHorizontal: 4 }}>
              {wk.light ? <Text style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>가볍게 하는 주예요</Text> : null}
              {wk.note ? <Text style={[TYPE.sub, { color: c.muted }]}>{wk.note}</Text> : null}
              {changedAny ? <Text style={[TYPE.sub, { color: c.muted }]}>파란 글씨는 지난주와 달라진 곳이에요</Text> : null}
            </Animated.View>
          ) : null}
          {wk.days.map((d, i) => (
            <Animated.View key={`${perWeek}-${d.day}`} entering={rowIn(i)}>
              <DayCard day={d} prev={prevWk} c={c} />
            </Animated.View>
          ))}
        </View>

        {/* 안내 — 정의에 있는 것만, 한 번씩 */}
        <View style={{ gap: 12 }}>
          <SectionHead title="프로그램 안내" />
          <Animated.View layout={layoutMove} style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            {guide.map((g, i) => (
              <View key={g.key} style={[st.guideRow, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>{g.title}</Text>
                <Text style={[TYPE.body, { color: c.ink }]}>{g.body}</Text>
                {g.sub ? <Text style={[TYPE.sub, { color: c.muted }]}>{g.sub}</Text> : null}
              </View>
            ))}
            <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }}>
              <Press accessibilityRole="button" accessibilityState={{ expanded: more }} onPress={() => setMore(!more)} style={st.foldRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>자세한 규칙</Text>
                  <Text style={[TYPE.sub, { color: c.muted }]}>{choice.origin}</Text>
                </View>
                <Turn open={more}>
                  <Icon name="chevron-down" size={16} color={c.muted} />
                </Turn>
              </Press>
              {more ? (
                <View style={{ gap: 10, paddingHorizontal: SPACE.pad, paddingBottom: SPACE.pad }}>
                  {choice.detail.map((t, i) => (
                    <Animated.Text key={t} entering={rowIn(i)} style={[TYPE.body, { color: c.ink }]}>
                      {t}
                    </Animated.Text>
                  ))}
                </View>
              ) : null}
            </View>
          </Animated.View>
        </View>

        {/* 진행 중 — 고정 운동 바꾸기 · 그만두기(기존 확인 절차 그대로) */}
        {isThis && card ? (
          <Animated.View layout={layoutMove} style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Press accessibilityRole="button" onPress={() => setRepin(true)} style={st.foldRow}>
              <Text style={[TYPE.body, { flex: 1, color: c.ink, fontWeight: '600' }]}>고정 운동 바꾸기</Text>
              <Icon name="chevron-right" size={16} color={c.muted} />
            </Press>
            <Press
              accessibilityRole="button"
              disabled={pending != null}
              onPress={() =>
                confirm('프로그램을 그만둘까요?', '이 판은 여기서 끝나요. 기록은 남고, 나중에 새로 시작할 수 있어요.', '그만두기', '그만두는 중…', 'program.stopProgram')
              }
              style={[st.foldRow, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
            >
              <Text style={[TYPE.body, { flex: 1, color: c.danger, fontWeight: '600' }]}>프로그램 그만두기</Text>
            </Press>
          </Animated.View>
        ) : null}
        {pending ? <Text style={[TYPE.sub, { color: c.muted }]}>{pending}</Text> : null}
        {error ? <Text style={[TYPE.sub, { color: c.danger }]}>{error}</Text> : null}
      </ScrollView>
      <FooterActions primary={primary} note={note} />
      {repin && card ? (
        <RepinSheet pinned={card.pinned} onClose={() => setRepin(false)} c={c} a={{ reload: async () => void (await reload()), start: () => undefined, starting: false, checkin: () => undefined, generate: async () => null, web: () => undefined }} />
      ) : null}
    </View>
  );
}

type WeekRow = ProgramOutline['weekRows'][number];
type DayRow = WeekRow['days'][number];
type ItemRow = DayRow['items'][number];

/** 처방 한 줄을 양(세트 · 횟수 · %)과 꼬리말(남기기 · 올리기 · 속도)로 가른다 — prescriptionLine 은 처음 ' · ' 앞이 양이다. % 단계(→)는 화면에서 한 줄씩 쌓는다 */
function splitLine(line: string): [string, string | null] {
  const i = line.indexOf(' · ');
  return i < 0 ? [line, null] : [line.slice(0, i), line.slice(i + 3)];
}

/** 지난주 같은 세션(이름이 같은 날, 없으면 같은 차례)의 같은 운동과 양이 다르면 true */
function changedFrom(prev: WeekRow, d: DayRow, it: ItemRow): boolean {
  const pd = prev.days.find((x) => x.label === d.label);
  const before = pd?.items.find((x) => x.label === it.label && x.assist === it.assist);
  return before != null && splitLine(before.line)[0] !== splitLine(it.line)[0];
}

/** 운동마다 붙는 작은 말 — 모든 줄에 같으면 카드 밑에 한 번만 */
function notesOf(it: ItemRow): string[] {
  return [splitLine(it.line)[1], it.kind === 'rotating' ? '세션마다 다른 운동' : null, it.optionalSlot ? '공이 있으면 해요' : null].filter((x): x is string => !!x);
}

/** 한 세션 카드 — 이름 · 몇 번째 · 본운동(양) · 보조 운동 이름들 */
function DayCard({ day, prev, c }: { day: DayRow; prev: WeekRow | null; c: Palette }) {
  const main = day.items.filter((x) => !x.assist);
  const assist = day.items.filter((x) => x.assist);
  const notes = main.map(notesOf);
  const common = main.length > 1 ? notes[0].filter((n) => notes.every((r) => r.includes(n))) : [];
  /* 이름 없는 날은 'N번 세션'(그 주 안 차례)이라 프로그램 전체 차례로 바꿔 적는다 */
  const named = !/^\d+번 세션$/.test(day.label);
  return (
    <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={st.dayHead}>
        <View style={st.dayTitle}>
          <Text accessibilityRole="header" style={[TYPE.card, { flex: 1, color: c.ink }]}>
            {named ? day.label : `${day.day}번째 세션`}
          </Text>
          {named ? <Text style={[TYPE.sub, { color: c.muted }]}>{day.day}번째 세션</Text> : null}
        </View>
        {common.length > 0 ? <Text style={[TYPE.sub, { color: c.muted }]}>{common.join(' · ')}</Text> : null}
      </View>
      {main.map((it, j) => {
        const [dose] = splitLine(it.line);
        const own = notes[j].filter((n) => !common.includes(n));
        const changed = prev != null && changedFrom(prev, day, it);
        return (
          <View key={`${it.variant}-${j}`} style={[st.itemRow, { borderTopColor: c.line }]}>
            <View style={st.itemLine}>
              <Text style={[TYPE.body, { flexShrink: 0, color: c.ink, fontWeight: '600' }]}>{it.label}</Text>
              <Text style={[TYPE.body, TYPE.numInline, st.dose, { color: changed ? c.link : c.ink, fontWeight: changed ? '600' : '400' }]}>{dose.split(' → ').join('\n')}</Text>
            </View>
            {own.length > 0 ? <Text style={[TYPE.sub, { color: c.muted }]}>{own.join(' · ')}</Text> : null}
          </View>
        );
      })}
      {assist.length > 0 ? (
        <View style={[st.itemRow, { borderTopColor: c.line }]}>
          <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>보조 운동 · 세션마다 바뀌어요</Text>
          <Text style={[TYPE.sub, { color: c.muted }]}>{assist.map((x) => x.label).join(' · ')}</Text>
        </View>
      ) : null}
      <View style={{ height: 6 }} />
    </View>
  );
}

/** 펼침 화살표 — 펴면 반 바퀴 돈다(움직임 줄이기면 withTiming 이 기기 설정대로 바로) */
function Turn({ open, children }: { open: boolean; children: ReactNode }) {
  const a = useAnimatedStyle(() => ({ transform: [{ rotate: withTiming(open ? '180deg' : '0deg', { duration: 220 }) }] }), [open]);
  return <Animated.View style={a}>{children}</Animated.View>;
}

/** 머리 카드의 숫자 하나 — 큰 둥근 숫자(처음 · 주당 횟수를 바꿀 때 올라간다) · 단위 · 이름 */
function Stat({ value, unit, label, c, line }: { value: number; unit: string; label: string; c: Palette; line?: boolean }) {
  return (
    <View style={[st.stat, line && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line }]} accessible accessibilityLabel={`${label} ${value}${unit}`}>
      <Text style={{ color: c.ink }}>
        <Text style={[TYPE.num, { fontSize: 24 }]}>
          <CountUp value={value} />
        </Text>
        <Text style={[TYPE.unit, { color: c.muted }]}> {unit}</Text>
      </Text>
      <Text style={[TYPE.sub, { color: c.muted }]}>{label}</Text>
    </View>
  );
}

const st = StyleSheet.create({
  card: { borderRadius: RADIUS.card, overflow: 'hidden' },
  stats: { flexDirection: 'row', borderTopWidth: StyleSheet.hairlineWidth, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  stat: { flex: 1, alignItems: 'center', gap: 2 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  dayHead: { gap: 2, paddingHorizontal: SPACE.pad, paddingTop: 16, paddingBottom: 10 },
  dayTitle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  itemRow: { gap: 2, paddingHorizontal: SPACE.pad, paddingVertical: 10, borderTopWidth: StyleSheet.hairlineWidth },
  itemLine: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  dose: { flexShrink: 1, textAlign: 'right' },
  guideRow: { gap: 4, paddingHorizontal: SPACE.pad, paddingVertical: 14 },
  foldRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 56, paddingHorizontal: SPACE.pad, paddingVertical: 12 },
});
