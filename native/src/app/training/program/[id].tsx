import * as Haptics from 'expo-haptics';
import { type Href, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, withTiming } from 'react-native-reanimated';
import {
  GOAL_LABELS,
  RECOMMENDED_EQUIPMENT,
  programChoiceList,
  programDef,
  programOutline,
  sessionTitle,
  type PerWeek,
  type VariantKind,
} from '@/lib/program/program';
import { withJosa } from '@/lib/korean';
import { act } from '~/mechanics/parts';
import { usePalette, withAlpha, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { openCheckin } from '~/shell/web-nav';
import { Cover } from '~/training/program-cards';
import { useTrainingToday } from '~/training/program/data';
import { RepinSheet } from '~/training/today/program-start';
import { FlowBar, FooterActions, type FooterAction } from '~/videos/flow-parts';

/**
 * 프로그램 상세(2026-10-30 확정 시안 01) — 트레이닝 탭의 프로그램 카드를 누르면 연다. 보기만 한다: 열었다고 등록 · 세션 · 진도가 바뀌지 않는다.
 *
 * 차례: 작은 머리 → 카드와 이어지는 커버(이름 · 기간 · 주 빈도) → 대상 · 장비 → 세션 구성(A · B · C, 대표 구성) → 주차(미리보기) → 안내(진행 방식 ·
 * 이런 분께 · 필요한 장비 · 근거) → 아래 고정 단추 하나.
 *
 * 단추는 서버의 오늘 판정을 그대로 따른다(app-training.loadAppTrainingToday): 시작 전이면 [시작 준비], 이 프로그램을 하는 중이면 오늘 상태에 따라
 * [오늘 운동 확인] · [운동 이어하기] · [체크인하기], 다른 프로그램을 하는 중이면 [진행 중 프로그램 보기], 오늘 일정을 이미 만든 날 · 자격이 안 되는
 * 날은 까닭만. 숨김 · 옛 프로그램은 새로 보이지 않는다(하는 중인 사람만 자기 프로그램을 본다).
 */
const KIND_LABEL: Record<VariantKind, string> = { main: '고정', rotating: '세션마다', assist: '보조' };

export default function ProgramDetailScreen() {
  const c = usePalette();
  const reduced = useReducedMotion();
  const { id, perWeek: pwParam } = useLocalSearchParams<{ id: string; perWeek?: string }>();
  const { data, failed, reload } = useTrainingToday();
  const choice = programChoiceList().find((p) => p.id === id) ?? null;
  const def = choice ? programDef(choice.id) : null;
  const card = data?.programCard ?? null;
  const isThis = card != null && card.programId === id;
  const otherActive = card != null && !isThis;
  const [perWeekPick, setPerWeekPick] = useState<PerWeek | null>(pwParam === '2' ? 2 : pwParam === '3' ? 3 : null);
  const [session, setSession] = useState(0);
  const [week, setWeek] = useState(0);
  const [fold, setFold] = useState<string | null>(null);
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
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <FlowBar title="프로그램" onBack={() => router.back()} />
        <View style={{ padding: 24, gap: 12 }}>
          {isThis && card ? (
            <>
              <Text style={[st.title, { color: c.ink }]}>{card.name}</Text>
              <Text style={[st.body, { color: c.muted }]}>지금은 새로 고를 수 없는 프로그램이에요. 하던 기록은 그대로 남아 있어요.</Text>
            </>
          ) : (
            <Text style={[st.body, { color: c.muted }]}>지금은 볼 수 없는 프로그램이에요.</Text>
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

  const sess = outline.sessions[Math.min(session, outline.sessions.length - 1)];
  const wk = outline.weekRows[Math.min(week, outline.weekRows.length - 1)];
  const recommended = RECOMMENDED_EQUIPMENT.filter((e) => !choice.required.includes(e));

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <FlowBar title="프로그램" onBack={() => router.back()} backLabel="트레이닝으로 돌아가기" />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: 24 }, READABLE]}>
        {/* 카드에서 이어지는 커버 — 같은 그림 · 같은 둥근 면 */}
        <View style={[st.cover, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Cover p={choice} c={c} active={isThis} />
          <View style={{ padding: 16, gap: 4 }}>
            <Text accessibilityRole="header" style={[st.title, { color: c.ink }]}>
              {choice.name}
            </Text>
            <Text style={[st.body, { color: c.ink }]}>{choice.summary}</Text>
            <Text style={[st.small, { color: c.muted }]}>
              {GOAL_LABELS[choice.goal]} · {outline.weeks}주 · 주 {perWeek}회 · 총 {outline.totalDays}세션
            </Text>
          </View>
        </View>

        {/* 진행 중이면 실제 진도 — 완료와 건너뜀을 따로 */}
        {isThis && card ? (
          <View style={[st.box, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Text style={[st.bodyBold, { color: c.ink }]}>{sessionTitle(card.dayLabel)}</Text>
            <View accessibilityRole="progressbar" accessibilityLabel="프로그램 진행" accessibilityValue={{ min: 0, max: card.total, now: card.completed + card.skipped }} style={[st.bar, { backgroundColor: withAlpha(c.ink, 0.08) }]}>
              <View style={{ width: `${(card.completed / card.total) * 100}%`, backgroundColor: c.action }} />
              <View style={{ width: `${(card.skipped / card.total) * 100}%`, backgroundColor: withAlpha(c.action, 0.35) }} />
            </View>
            <Text style={[st.small, { color: c.muted }]}>
              완료 {card.completed} · 건너뜀 {card.skipped} / {card.total}세션
            </Text>
          </View>
        ) : doneThis ? (
          <View style={[st.box, { backgroundColor: c.card }]}>
            <Text style={[st.bodyBold, { color: c.ink }]}>이 프로그램을 다 마쳤어요</Text>
            <Text style={[st.small, { color: c.muted }]}>
              완료 {data?.programDone?.completed} · 건너뜀 {data?.programDone?.skipped} · {data?.programDone?.weeks}주
            </Text>
          </View>
        ) : null}

        {/* 대상 · 장비 */}
        <View style={[st.box, { backgroundColor: c.card }]}>
          {choice.fit ? <InfoLine icon="target" text={`이런 분께 · ${choice.fit}`} c={c} /> : null}
          <InfoLine icon="dumbbell" text={choice.required.length > 0 ? `필요한 장비 · ${choice.required.join(' · ')}` : '맨몸으로 할 수 있어요'} c={c} />
          {choice.audience !== 'basics' && recommended.length > 0 ? <InfoLine icon="plus" text={`있으면 좋아요 · ${recommended.join(' · ')}`} c={c} /> : null}
        </View>

        {/* 세션 구성 — 대표 구성(장비 · 경력에 맞춘 실제 운동은 시작 준비에서 정한다) */}
        <View style={{ gap: 10 }}>
          <View style={st.headRow}>
            <Text style={[st.section, { color: c.ink }]}>운동 구성</Text>
            {perWeeks.length > 1 ? (
              <View style={[st.seg, { backgroundColor: c.chip }]} accessibilityRole="tablist">
                {perWeeks.map((n) => (
                  <Press
                    key={n}
                    select
                    selected={perWeek === n}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: perWeek === n }}
                    onPress={() => {
                      setPerWeekPick(n);
                      setSession(0);
                      setWeek(0);
                    }}
                    style={[st.segItem, perWeek === n && { backgroundColor: c.card }]}
                  >
                    <Text style={[st.small, { color: c.ink, fontWeight: perWeek === n ? '700' : '500' }]}>주 {n}회</Text>
                  </Press>
                ))}
              </View>
            ) : null}
          </View>
          {outline.sessions.length > 1 ? (
            <View style={[st.seg, { backgroundColor: c.chip }]} accessibilityRole="tablist">
              {outline.sessions.map((x, i) => (
                <Press
                  key={x.day}
                  select
                  selected={i === session}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: i === session }}
                  onPress={() => setSession(i)}
                  style={[st.segItem, { flex: 1 }, i === session && { backgroundColor: c.card }]}
                >
                  <Text numberOfLines={1} style={[st.small, { color: c.ink, fontWeight: i === session ? '700' : '500' }]}>
                    {x.label}
                  </Text>
                </Press>
              ))}
            </View>
          ) : null}
          <View style={[st.list, { backgroundColor: c.card, boxShadow: c.float }]}>
            {sess.items.map((it, i) => (
              <View key={`${it.variant}-${i}`} style={[st.item, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <Text style={[st.num, { color: c.muted }]}>{i + 1}</Text>
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <Text style={[st.bodyBold, { color: c.ink }]}>{it.label}</Text>
                    <Text style={[st.tag, { color: c.muted, backgroundColor: c.chip }]}>{KIND_LABEL[it.kind]}</Text>
                    {it.optionalSlot ? <Text style={[st.tag, { color: c.muted, backgroundColor: c.chip }]}>공이 있으면 선택</Text> : null}
                  </View>
                  <Text style={[st.small, { color: c.muted }]}>{it.line}</Text>
                </View>
              </View>
            ))}
          </View>
          <Text style={[st.small, { color: c.muted }]}>
            대표 구성이에요. 실제 운동과 무게는 시작 준비에서 장비 · 경력에 맞춰 정해요. ‘세션마다’ 칸은 세션마다 같은 칸의 다른 운동으로 돌아가요.
          </Text>
        </View>

        {/* 주차 — 미리보기(진도는 바뀌지 않는다) */}
        <View style={{ gap: 10 }}>
          <View style={st.headRow}>
            <Text style={[st.section, { color: c.ink }]}>주차별 구성</Text>
            <Text style={[st.small, { color: c.muted }]}>총 {outline.weeks}주</Text>
          </View>
          <View style={st.weeks}>
            {outline.weekRows.map((w, i) => (
              <WeekChip key={w.week} label={`${w.week}주`} sub={w.light ? '가볍게' : null} on={i === week} onPress={() => setWeek(i)} reduced={reduced} c={c} />
            ))}
          </View>
          <View style={[st.list, { backgroundColor: c.card }]}>
            <Text style={[st.bodyBold, { color: c.ink, paddingTop: 12 }]}>
              {wk.week}주차{wk.light ? ' · 가벼운 주' : ''}
            </Text>
            {wk.note ? <Text style={[st.small, { color: c.muted }]}>{wk.note}</Text> : null}
            {wk.days.map((d) => (
              <View key={d.day} style={{ gap: 2, paddingVertical: 6 }}>
                <Text style={[st.small, { color: c.ink, fontWeight: '600' }]}>{d.label}</Text>
                {d.items.map((it, j) => (
                  <Text key={j} style={[st.small, { color: c.muted }]}>
                    {it.label} · {it.line}
                  </Text>
                ))}
              </View>
            ))}
            <Text style={[st.small, { color: c.muted, paddingBottom: 12 }]}>주차를 눌러 미리 볼 수 있어요. 진도는 바뀌지 않아요.</Text>
          </View>
        </View>

        {/* 안내 — 정의에 있는 것만 */}
        <View style={{ gap: 8 }}>
          <Text style={[st.section, { color: c.ink }]}>프로그램 안내</Text>
          <View style={[st.list, { backgroundColor: c.card, boxShadow: c.float }]}>
            {[
              choice.how ? { key: 'how', title: '진행 방식', body: [choice.how] } : null,
              choice.fit || choice.why ? { key: 'fit', title: '이런 분께', body: [choice.fit, choice.why].filter((x): x is string => !!x) } : null,
              {
                key: 'gear',
                title: '필요한 장비',
                body: [
                  choice.required.length > 0 ? `꼭 있어야 해요: ${choice.required.join(' · ')}` : '꼭 있어야 하는 장비는 없어요(맨몸).',
                  choice.audience !== 'basics' ? `있으면 보조 운동이 다양해져요: ${RECOMMENDED_EQUIPMENT.join(' · ')}` : null,
                ].filter((x): x is string => !!x),
              },
              { key: 'origin', title: '프로그램 근거', body: [choice.origin, ...choice.detail] },
            ]
              .filter((x): x is { key: string; title: string; body: string[] } => x != null)
              .map((sec, i) => (
                <View key={sec.key} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                  <Press accessibilityRole="button" accessibilityState={{ expanded: fold === sec.key }} onPress={() => setFold(fold === sec.key ? null : sec.key)} style={st.fold}>
                    <Text style={[st.bodyBold, { flex: 1, color: c.ink }]}>{sec.title}</Text>
                    <Icon name={fold === sec.key ? 'chevron-up' : 'chevron-down'} size={16} color={c.muted} />
                  </Press>
                  {fold === sec.key ? (
                    <View style={{ gap: 6, paddingBottom: 12 }}>
                      {sec.body.map((t) => (
                        <Text key={t} style={[st.small, { color: c.ink }]}>
                          {t}
                        </Text>
                      ))}
                    </View>
                  ) : null}
                </View>
              ))}
          </View>
        </View>

        {/* 진행 중 — 고정 운동 바꾸기 · 그만두기(기존 확인 절차 그대로) */}
        {isThis && card ? (
          <View style={[st.list, { backgroundColor: c.card }]}>
            <Press accessibilityRole="button" onPress={() => setRepin(true)} style={st.fold}>
              <Text style={[st.bodyBold, { flex: 1, color: c.ink }]}>고정 운동 바꾸기</Text>
              <Icon name="chevron-right" size={16} color={c.muted} />
            </Press>
            <Press
              accessibilityRole="button"
              disabled={pending != null}
              onPress={() =>
                confirm('프로그램을 그만둘까요?', '이 판은 여기서 끝나요. 기록은 남고, 나중에 새로 시작할 수 있어요.', '그만두기', '그만두는 중…', 'program.stopProgram')
              }
              style={[st.fold, { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
            >
              <Text style={[st.bodyBold, { flex: 1, color: c.danger }]}>프로그램 그만두기</Text>
            </Press>
          </View>
        ) : null}
        {pending ? <Text style={[st.small, { color: c.muted }]}>{pending}</Text> : null}
        {error ? <Text style={[st.small, { color: c.danger }]}>{error}</Text> : null}
      </ScrollView>
      <FooterActions primary={primary} note={note} />
      {repin && card ? (
        <RepinSheet pinned={card.pinned} onClose={() => setRepin(false)} c={c} a={{ reload: async () => void (await reload()), start: () => undefined, starting: false, checkin: () => undefined, generate: async () => null, web: () => undefined }} />
      ) : null}
    </View>
  );
}

function InfoLine({ icon, text, c }: { icon: 'target' | 'dumbbell' | 'plus'; text: string; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <View style={{ marginTop: 2 }}>
        <Icon name={icon} size={16} color={c.link} />
      </View>
      <Text style={[st.small, { flex: 1, color: c.ink }]}>{text}</Text>
    </View>
  );
}

/** 주차 칸 — 고른 칸 밑줄이 옮겨 간다(동작 줄이기면 바로) */
function WeekChip({ label, sub, on, onPress, reduced, c }: { label: string; sub: string | null; on: boolean; onPress: () => void; reduced: boolean; c: Palette }) {
  const bar = useAnimatedStyle(() => ({ opacity: withTiming(on ? 1 : 0, { duration: reduced ? 0 : 200 }) }), [on, reduced]);
  return (
    <Press
      select
      selected={on}
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${sub ? `, ${sub}` : ''}`}
      onPress={onPress}
      style={[st.week, { backgroundColor: on ? c.action : c.chip }]}
    >
      <Text style={{ color: on ? c.onAction : c.ink, fontSize: 15, fontWeight: '700' }}>{label}</Text>
      {sub ? <Text style={{ color: on ? c.onAction : c.muted, fontSize: 11 }}>{sub}</Text> : null}
      <Animated.View style={[st.weekBar, { backgroundColor: c.onAction }, bar]} />
    </Press>
  );
}

const st = StyleSheet.create({
  cover: { borderRadius: 24, overflow: 'hidden' },
  title: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  section: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  box: { borderRadius: 18, padding: 14, gap: 8 },
  bar: { height: 8, borderRadius: 4, overflow: 'hidden', flexDirection: 'row' },
  seg: { flexDirection: 'row', borderRadius: 12, padding: 3 },
  segItem: { minHeight: 40, minWidth: 64, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  list: { borderRadius: 18, paddingHorizontal: 14 },
  item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 12 },
  num: { width: 18, fontSize: 15, fontWeight: '700', fontVariant: ['tabular-nums'], paddingTop: 1 },
  tag: { fontSize: 11, fontWeight: '600', borderRadius: 8, overflow: 'hidden', paddingHorizontal: 6, paddingVertical: 2 },
  weeks: { flexDirection: 'row', gap: 8 },
  week: { flex: 1, minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', gap: 2 },
  weekBar: { position: 'absolute', bottom: 8, width: 16, height: 3, borderRadius: 2 },
  fold: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 52 },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
});
