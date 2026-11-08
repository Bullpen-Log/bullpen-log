import { CoachAccessActions } from './access-actions';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { REASON_TEXT, WEEKDAY_LABELS, slotLine } from '@/lib/coach/answers';
import type { WeekReview } from '@/lib/coach/review';
import { startsOf, type SlotState } from '@/lib/coach/status';
import type { DaySlot } from '@/lib/coach/week';
import { COACH_POINTS } from '@/lib/coach-intro';
import { loadMe, resetMe } from '~/pitch/api';
import { READABLE_WIDE } from '~/lib/layout';
import { rpc } from '~/lib/rpc';
import { SPACE, SURFACE, TYPE, usePalette, useTheme, type Palette } from '~/lib/ui';
import { PageHead, SectionHead } from '~/shell/heading';
import { Icon, type IconName } from '~/shell/icon';
import { MenuButton } from '~/shell/menu-button';
import { Press } from '~/shell/press';
import { pushOpen } from '~/shell/release';
import { useFocusRefresh } from '~/shell/tab-pager';
import { toast } from '~/shell/toast';
import { openCheckin } from '~/shell/web-nav';
import { AdjustBar } from './adjust';

/**
 * 코치 소개 — 2026-11-04 사용자 결정: 관리자 승인 유지, 앱 안 이용 문의와 권한 재확인 제공.
 * 웹 app/(app)/coach/coach-intro.tsx 와 같은 글(lib/coach-intro.ts).
 */
export function CoachIntro({ onGranted }: { onGranted?: () => void }) {
  const c = usePalette();
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
      <View style={[st.introIcon, { backgroundColor: c.skyTint }]}><Icon name="clipboard-list" size={25} color={c.link} /></View>
      <Text style={[TYPE.hero, { color: c.ink }]}>내 일정에 맞춘 한 주 훈련</Text>
      <Text style={[TYPE.body, { color: c.muted }]}>몸 상태와 경기 일정을 살펴 매일 계획을 조정해요.</Text>
      <View style={[st.introPoints, { borderTopColor: c.line }]}>
        {COACH_POINTS.map((p) => (
          <View key={p} style={st.introPoint}><Icon name="circle-check" size={17} color={c.link} /><Text style={[TYPE.body, { color: c.ink, flex: 1 }]}>{p}</Text></View>
        ))}
      </View>
      <CoachAccessActions onGranted={onGranted} />
    </View>
  );
}

/** 코치 탭의 껍데기 주소 — 앱 화면만(웹 /coach 는 PC 분석 · 소개라 앱이 웹으로 안 보낸다, app/index.tsx pressTab) */
export const COACH_PATH = '/coach';

const REVIEWS = [
  { view: 'pitch', label: '투구 분석' },
  { view: 'training', label: '트레이닝 분석' },
] as const;

type CoachWeekData = { today: string; weekStart?: string; week: DaySlot[] | null; states: SlotState[] | null; checkedIn: boolean; review?: WeekReview | null };

/**
 * 코치 탭(하단 탭 둘째, docs/designs/ai-coach.md 10-1 · 10-5) — 무료면 소개, 유료면 코치 메인: 오늘 계획(크게) → 이번 주 7칸(한 것 · 못 함) → 리뷰 → 답 고치기.
 * 시작 전이면 [코치 시작하기]. 칸 상태는 서버가 기록에서 읽는다(lib/coach/status.ts). 그날 운동은 [시작]이 연 화면이 엔진으로 만든다(R2).
 * 출시 전 베타의 잠김은 껍데기가 막는다(탭 막대 자물쇠 — app/index.tsx). 유료는 서버가 정한다(loadAppMe 의 coachPaid ← lib/coach-access.ts).
 */
export function CoachMainTab({ bottom }: { bottom: number }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [access, setAccess] = useState<'loading' | 'paid' | 'free' | 'error'>('loading');
  const [data, setData] = useState<CoachWeekData | undefined>(undefined);
  const [weekLoading, setWeekLoading] = useState(true);
  const [weekError, setWeekError] = useState(false);
  const [view, setView] = useState<'today' | 'week'>('today');
  const [selectedDay, setSelectedDay] = useState(0);
  const scroll = useRef<ScrollViewInstance>(null);
  const accessRequest = useRef(0);
  const weekRequest = useRef(0);
  const checkAccess = useCallback(() => {
    const request = ++accessRequest.current;
    resetMe();
    loadMe().then(
      (me) => {
        if (request !== accessRequest.current) return;
        if (me.coachPaid !== true) setData(undefined);
        setAccess(me.coachPaid === true ? 'paid' : 'free');
      },
      () => request === accessRequest.current && setAccess('error')
    );
  }, []);
  useEffect(() => {
    checkAccess();
    return () => {
      accessRequest.current += 1;
      weekRequest.current += 1;
    };
  }, [checkAccess]);
  const loadWeek = useCallback(() => {
    const request = ++weekRequest.current;
    rpc<CoachWeekData>('coach.loadCoachWeek').then(
      (next) => {
        if (request !== weekRequest.current) return;
        setData(next);
        setWeekError(false);
        const today = next.week?.findIndex((s) => s.date === next.today) ?? -1;
        if (today >= 0) setSelectedDay(today);
        setWeekLoading(false);
      },
      () => {
        if (request !== weekRequest.current) return;
        setWeekError(true);
        setWeekLoading(false);
      }
    );
  }, []);
  useEffect(() => {
    if (access === 'paid') loadWeek();
  }, [access, loadWeek]);
  useFocusRefresh(() => { if (access === 'paid') loadWeek(); else if (access === 'free') checkAccess(); });
  const retryAccess = () => { setAccess('loading'); checkAccess(); };
  const retryWeek = () => { setWeekLoading(true); setWeekError(false); loadWeek(); };
  const week = data?.week ?? null;
  const todayAt = week && data ? week.findIndex((s) => s.date === data.today) : -1;
  const openWeek = (day = todayAt) => {
    if (day >= 0) setSelectedDay(day);
    setView('week');
    scroll.current?.scrollTo({ y: 0, animated: false });
  };
  return (
    <ScrollView
      ref={scroll}
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[
        { paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: SPACE.gap },
        READABLE_WIDE,
      ]}
    >
      <PageHead title="코치">
        {access === 'paid' && week ? (
          <Press accessibilityRole="button" accessibilityLabel="코치 설정" onPress={() => router.push('/coach-settings' as Href)} style={st.setting}>
            <Icon name="settings" size={21} color={c.ink} />
          </Press>
        ) : null}
        <MenuButton />
      </PageHead>
      {access === 'loading' || (access === 'paid' && weekLoading && !data) ? <ActivityIndicator color={c.action} style={st.loading} /> : null}
      {access === 'error' ? <ErrorState title="코치 이용 상태를 확인하지 못했어요" detail="네트워크를 확인하고 다시 시도해 주세요." onRetry={retryAccess} c={c} /> : null}
      {access === 'free' ? <CoachIntro onGranted={retryAccess} /> : null}
      {access === 'paid' && weekError ? (
        <ErrorState title={data ? '새 계획을 확인하지 못했어요' : '이번 주 계획을 불러오지 못했어요'} detail={data ? '마지막으로 불러온 계획이 보여요.' : '다시 불러오면 이어서 볼 수 있어요.'} onRetry={retryWeek} c={c} />
      ) : null}
      {access === 'paid' && data && !week ? (
        <View style={[st.startCard, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
          <Text style={[st.kicker, { color: c.link }]}>PERSONAL COACH</Text>
          <Text style={[TYPE.hero, { color: c.ink }]}>코치를 시작해 볼까요?</Text>
          <Text style={[TYPE.body, { color: c.muted }]}>목표와 등판 일정, 운동할 수 있는 시간을 알려 주면 첫 주 계획을 미리 보여 드려요.</Text>
          <Press accessibilityRole="button" onPress={() => router.push('/coach-start' as Href)} style={[st.start, { backgroundColor: c.action }]}>
            <Text style={[TYPE.button, { color: c.onAction }]}>코치 시작하기</Text>
          </Press>
        </View>
      ) : null}
      {access === 'paid' && data && !week ? <><SectionHead title="리뷰" /><View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>{REVIEWS.map((r, i) => <Press key={r.view} accessibilityRole="link" onPress={() => pushOpen(`/analysis?view=${r.view}` as Href)} style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}><Icon name="chart-no-axes-column" size={19} color={c.link} /><Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{r.label}</Text><Icon name="chevron-right" size={17} color={c.muted} /></Press>)}</View></> : null}
      {access === 'paid' && data && week ? (
        view === 'today' ? (
          <>
            <View style={st.titleRow}>
              <View style={{ flex: 1 }}><Text style={[st.kicker, { color: c.link }]}>{weekLabel(week)} · 오늘</Text><Text accessibilityRole="header" style={[TYPE.hero, { color: c.ink }]}>오늘의 계획</Text></View>
              <TextLink label="한 주 보기" onPress={() => openWeek()} c={c} />
            </View>
            {todayAt >= 0 ? <TodayCard slot={week[todayAt]} state={data.states?.[todayAt] ?? 'today'} checkedIn={data.checkedIn} onDone={loadWeek} onAdjust={() => openWeek()} /> : <ErrorState title="오늘 계획을 확인할 수 없어요" detail="이번 주 계획을 다시 불러와 주세요." onRetry={retryWeek} c={c} />}
            <SectionHead title="이번 주 한눈에" action="전체 일정" onAction={() => openWeek()} />
            <WeekRail week={week} states={data.states} todayAt={todayAt} selectedDay={todayAt} onSelect={openWeek} c={c} />
            <View style={st.legend}><Legend color={c.ok} text="완료" c={c} /><Legend color={c.link} text="오늘" c={c} /><Legend color={c.warn} text="못 한 운동" c={c} /></View>
            {data.review ? <NavRow label="지난주 돌아보기" icon="chart-no-axes-column" onPress={() => openWeek()} c={c} /> : null}
            <NavRow label="코치에게 일정 말하기" icon="chat" onPress={() => router.push('/coach-chat' as Href)} c={c} />
          </>
        ) : (
          <>
            <View style={st.titleRow}>
              <View style={{ flex: 1 }}><Text style={[st.kicker, { color: c.link }]}>{weekLabel(week)}</Text><Text accessibilityRole="header" style={[TYPE.hero, { color: c.ink }]}>이번 주</Text></View>
              <TextLink label="오늘 보기" onPress={() => { setView('today'); scroll.current?.scrollTo({ y: 0, animated: false }); }} c={c} />
            </View>
            <Text style={[TYPE.body, { color: c.muted }]}>날마다 큰 방향을 정해요. 운동 목록은 그날 몸 상태를 확인한 뒤 만들어요.</Text>
            <WeekRail week={week} states={data.states} todayAt={todayAt} selectedDay={selectedDay} onSelect={setSelectedDay} c={c} />
            <View style={[st.selected, { backgroundColor: c.card, boxShadow: c.float }]}>
              <View style={st.titleRow}><Text style={[TYPE.card, { flex: 1, color: c.ink }]}>{WEEKDAY_LABELS[selectedDay]}요일 · {slotLine(week[selectedDay] ?? week[0])}</Text><Text style={[st.pill, { color: c.link, backgroundColor: c.skyTint }]}>{statusText(data.states?.[selectedDay] ?? 'later')}</Text></View>
              <Text style={[TYPE.body, { color: c.muted }]}>{(week[selectedDay] ?? week[0]).reasons.filter((r) => r !== 'rest').map((r) => REASON_TEXT[r]).join(' · ') || '이번 주 기본 계획'}</Text>
            </View>
            {data.states ? <AdjustBar week={week} states={data.states} today={data.today} onDone={loadWeek} /> : null}
            <SectionHead title="7일 계획" />
            <WeekRows week={week} states={data.states} todayAt={todayAt} c={c} />
            {data.review ? <ReviewCard review={data.review} thisWeek={data.review.weekStart === data.weekStart} onDone={loadWeek} /> : null}
            <SectionHead title="리뷰" />
            <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>{REVIEWS.map((r, i) => <Press key={r.view} accessibilityRole="link" onPress={() => pushOpen(`/analysis?view=${r.view}` as Href)} style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}><Icon name="chart-no-axes-column" size={19} color={c.link} /><Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{r.label}</Text><Icon name="chevron-right" size={17} color={c.muted} /></Press>)}</View>
            <View style={st.bottomActions}><Press accessibilityRole="button" onPress={() => router.push('/coach-start' as Href)} style={[st.secondaryButton, { backgroundColor: c.card, borderColor: c.line }]}><Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>답 고치기</Text></Press><Press accessibilityRole="button" onPress={() => router.push('/coach-settings' as Href)} style={[st.secondaryButton, { backgroundColor: c.card, borderColor: c.line }]}><Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>코치 설정</Text></Press></View>
          </>
        )
      ) : null}
    </ScrollView>
  );
}

const statusText = (state: SlotState) => ({ done: '완료', missed: '못 함', today: '오늘', later: '예정', off: '지난 휴식' })[state];
const weekLabel = (week: DaySlot[]) => `${week[0]?.date.slice(5).replace('-', '.') ?? ''}—${week[6]?.date.slice(5).replace('-', '.') ?? ''}`;

function ErrorState({ title, detail, onRetry, c }: { title: string; detail: string; onRetry: () => void; c: Palette }) {
  return <View style={[st.error, { backgroundColor: c.warnBg, borderColor: c.warnLine }]}><Text style={[TYPE.card, { color: c.ink }]}>{title}</Text><Text style={[TYPE.body, { color: c.muted }]}>{detail}</Text><Press accessibilityRole="button" onPress={onRetry} style={[st.retry, { backgroundColor: c.card, borderColor: c.line }]}><Icon name="rotate-ccw" size={16} color={c.link} /><Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>다시 확인</Text></Press></View>;
}

function TextLink({ label, onPress, c }: { label: string; onPress: () => void; c: Palette }) {
  return <Press accessibilityRole="button" onPress={onPress} style={st.textLink}><Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>{label} →</Text></Press>;
}

function NavRow({ label, icon, onPress, c }: { label: string; icon: IconName; onPress: () => void; c: Palette }) {
  return <Press accessibilityRole="button" onPress={onPress} style={[st.navRow, { backgroundColor: c.card, boxShadow: c.float }]}><Icon name={icon} size={19} color={c.link} /><Text style={[TYPE.body, { flex: 1, color: c.ink, fontWeight: '600' }]}>{label}</Text><Icon name="chevron-right" size={17} color={c.muted} /></Press>;
}

function WeekRail({ week, states, todayAt, selectedDay, onSelect, c }: { week: DaySlot[]; states: SlotState[] | null; todayAt: number; selectedDay: number; onSelect: (day: number) => void; c: Palette }) {
  return <View style={st.rail}>{week.map((slot, index) => {
    const state = states?.[index] ?? 'later';
    const selected = index === selectedDay;
    return <Press key={slot.date} accessibilityRole="button" accessibilityLabel={`${WEEKDAY_LABELS[index]}요일 ${statusText(state)}, ${slotLine(slot)}`} accessibilityState={{ selected }} select selected={selected} onPress={() => onSelect(index)} style={[st.railDay, { backgroundColor: selected ? c.skyTint : c.card, borderColor: selected ? c.link : c.line }]}><Text style={[TYPE.sub, { color: selected || index === todayAt ? c.link : c.muted }]}>{WEEKDAY_LABELS[index]}</Text><Text style={[TYPE.card, { color: selected ? c.link : c.ink }]}>{Number(slot.date.slice(8))}</Text><View style={[st.dot, { backgroundColor: state === 'done' ? c.ok : state === 'missed' ? c.warn : index === todayAt ? c.link : c.lineStrong }]} /></Press>;
  })}</View>;
}

function Legend({ color, text, c }: { color: string; text: string; c: Palette }) {
  return <View style={st.legendItem}><View style={[st.dot, { backgroundColor: color }]} /><Text style={[TYPE.sub, { color: c.muted }]}>{text}</Text></View>;
}

function WeekRows({ week, states, todayAt, c }: { week: DaySlot[]; states: SlotState[] | null; todayAt: number; c: Palette }) {
  return <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>{week.map((slot, index) => {
    const status = states?.[index] ?? 'later';
    return <View key={slot.date} style={[st.row, index > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }, index === todayAt && { backgroundColor: c.skyTint }]}><Text style={[TYPE.body, { width: 28, color: index === todayAt ? c.link : c.muted, fontWeight: '700' }]}>{WEEKDAY_LABELS[index]}</Text><Text style={[TYPE.body, { flex: 1, color: status === 'missed' ? c.muted : c.ink }]}>{slotLine(slot)}</Text><Text style={[TYPE.sub, { color: status === 'done' ? c.ok : status === 'missed' ? c.warn : c.muted }]}>{statusText(status)}</Text></View>;
  })}</View>;
}

/** 주간 리뷰(U37) — 일요일 저녁 ~ 월요일, [확인]하면 접힌다. */
function ReviewCard({ review, thisWeek, onDone }: { review: WeekReview; thisWeek: boolean; onDone: () => void }) {
  const c = usePalette();
  const [busy, setBusy] = useState(false);
  const ack = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await rpc<{ ok: true } | { error: string }>('coach.ackWeeklyReview', review.weekStart);
      if ('error' in r) toast(r.error ?? '다시 눌러 주세요.');
      else onDone();
    } catch {
      toast('신호가 약해요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[st.kicker, { color: c.link }]}>{thisWeek ? '이번 주 돌아보기' : '지난주 돌아보기'}</Text>
      <Text style={[TYPE.section, { color: c.ink }]}>{review.planned ? `${review.planned}일 중 ${review.done}일 완료` : '쉬어 간 주'}</Text>
      <View style={{ gap: 4 }}>
        {review.lines.map((l) => (
          <Text key={l} style={[TYPE.body, { color: c.ink }]}>
            {l}
          </Text>
        ))}
      </View>
      <Press accessibilityRole="button" disabled={busy} onPress={() => void ack()} style={[st.reviewAck, { backgroundColor: c.skyTint }]}>
        <Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>리뷰 확인</Text>
      </Press>
    </View>
  );
}

/** 오늘 계획(크게) — 무엇을 · 왜 · [시작]. 운동 날인데 체크인 전이면 체크인부터(오늘 상태를 알아야 맞춘다), 시작 단추는 밑에 그대로 */
function TodayCard({ slot, state, checkedIn, onDone, onAdjust }: { slot: DaySlot; state: SlotState; checkedIn: boolean; onDone: () => void; onAdjust: () => void }) {
  const c = usePalette();
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  /* 하루의 주인(U38) — 사용자가 가져간 오늘을 코치에게 돌려준다 */
  const takeBack = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await rpc<{ ok: true } | { error: string }>('coach.takeBackToday');
      if ('error' in r) toast(r.error);
      else onDone();
    } catch {
      toast('신호가 약해요. 다시 눌러 주세요.');
    } finally {
      setBusy(false);
    }
  };
  const starts = startsOf(slot);
  const needCheckin = !checkedIn && starts.some((x) => x.kind === 'train');
  const why = slot.reasons.filter((r) => r !== 'rest').map((r) => REASON_TEXT[r]);
  const main = needCheckin
    ? { label: '몸 상태 체크인', onPress: () => openCheckin() }
    : starts[0]
      ? { label: starts[0].label, onPress: () => pushOpen(starts[0].path as Href) }
      : null;
  const more = needCheckin ? starts : starts.slice(1);
  return <>
    <View style={[st.focus, { backgroundColor: theme === 'light' ? '#132c50' : '#18365e' }]}>
      <Text style={st.focusKicker}>TODAY&apos;S FOCUS</Text>
      <Text style={[TYPE.hero, { color: '#ffffff' }]}>{slotLine(slot)}</Text>
      <Text style={st.focusCopy}>{why.length ? why.join(' · ') : '이번 주 일정에 맞춘 계획이에요.'}</Text>
      {state === 'done' ? <Text style={st.focusDone}>✓ 오늘 한 것이 있어요</Text> : null}
      {slot.owner === 'user' ? <Text style={st.focusCopy}>오늘은 직접 만든 운동으로 해요.</Text> : null}
      {needCheckin ? <Text style={st.focusCopy}>체크인하면 오늘 몸 상태에 맞춰 운동을 만들어요.</Text> : null}
      {main ? <Press accessibilityRole="button" onPress={main.onPress} style={st.focusButton}><Text style={[TYPE.button, { color: '#17345a' }]}>{main.label} →</Text></Press> : null}
    </View>
    {more.length || slot.owner === 'user' ? <View style={st.extraActions}>
      {more.map((x) => <Press key={x.kind} accessibilityRole="link" onPress={() => pushOpen(x.path as Href)} style={st.link}><Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>{x.label} →</Text></Press>)}
      {slot.owner === 'user' ? <Press accessibilityRole="button" disabled={busy} onPress={() => void takeBack()} style={st.link}><Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>오늘 다시 코치에게</Text></Press> : null}
    </View> : null}
    <SectionHead title="오늘 이렇게 잡은 이유" />
    <View style={[st.reasonCard, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={st.reasonRow}><Icon name="calendar-days" size={20} color={c.link} /><View style={{ flex: 1, gap: 4 }}><Text style={[TYPE.card, { color: c.ink }]}>{why.length ? why.join(' · ') : '이번 주 기본 계획'}</Text><Text style={[TYPE.body, { color: c.muted }]}>이번 주 일정과 기록을 반영했어요.</Text></View></View>
      <Press accessibilityRole="button" onPress={onAdjust} style={[st.reasonLink, { borderTopColor: c.line }]}><Icon name="move" size={17} color={c.link} /><Text style={[TYPE.body, { flex: 1, color: c.ink, fontWeight: '600' }]}>오늘 시간이 달라졌나요?</Text><Icon name="chevron-right" size={17} color={c.muted} /></Press>
    </View>
  </>;
}

const st = StyleSheet.create({
  introIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  introPoints: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 14, gap: 11 },
  introPoint: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  group: { borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  start: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  loading: { marginTop: 70 },
  setting: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  titleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  textLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 3 },
  startCard: { borderRadius: 20, padding: 20, gap: 14 },
  error: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  retry: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, marginTop: 4 },
  rail: { flexDirection: 'row', gap: 5 },
  railDay: { flex: 1, minWidth: 0, minHeight: 66, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  navRow: { minHeight: 54, borderRadius: 16, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  selected: { borderRadius: 18, padding: 16, gap: 6 },
  pill: { borderRadius: 12, overflow: 'hidden', paddingHorizontal: 9, paddingVertical: 5, fontSize: 12, fontWeight: '700' },
  bottomActions: { flexDirection: 'row', gap: 8 },
  secondaryButton: { flex: 1, minHeight: 47, borderRadius: 13, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  focus: { borderRadius: 22, padding: 20, gap: 11 },
  focusKicker: { color: '#d5e6ff', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  focusCopy: { color: '#dce9fb', fontSize: 14, lineHeight: 20 },
  focusDone: { color: '#c7f7df', fontSize: 14, fontWeight: '600' },
  focusButton: { minHeight: 50, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingHorizontal: 12 },
  extraActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  reasonCard: { borderRadius: 17, paddingHorizontal: 15, paddingTop: 15 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingBottom: 13 },
  reasonLink: { borderTopWidth: StyleSheet.hairlineWidth, flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50 },
  reviewAck: { minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
});
