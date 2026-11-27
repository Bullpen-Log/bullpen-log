import { CoachAccessActions } from './access-actions';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { REASON_TEXT, slotLine } from '@/lib/coach/answers';
import type { WeekReview } from '@/lib/coach/review';
import { startsOf, type SlotState } from '@/lib/coach/status';
import type { DaySlot } from '@/lib/coach/week';
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
import { FollowupCard, type FollowupData } from './followup';
import { GoalFollowCard } from './goal-card';

/**
 * 코치 소개 — 2026-11-04 사용자 결정: 관리자 승인 유지, 앱 안 이용 문의와 권한 재확인 제공.
 * 웹 app/(app)/coach/coach-intro.tsx 와 같은 글(lib/coach-intro.ts).
 */
export function CoachIntro({ onGranted }: { onGranted?: () => void }) {
  const c = usePalette();
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
      <View style={[st.introIcon, { backgroundColor: c.skyTint }]}><Icon name="clipboard-list" size={25} color={c.link} /></View>
      <Text style={[TYPE.hero, { color: c.ink }]}>내 기록을 아는 투수 코치</Text>
      <Text style={[TYPE.body, { color: c.muted }]}>체크인과 훈련 기록을 바탕으로 오늘 할 운동을 안내해요.</Text>
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

type CoachPlanData = { today: string; weekStart?: string; week: DaySlot[] | null; states: SlotState[] | null; checkedIn: boolean; review?: WeekReview | null; followup?: FollowupData | null };

/**
 * 코치 탭(하단 탭 둘째, docs/designs/ai-coach.md 10-1 · 10-5) — 무료면 소개, 유료면 코치 메인: 오늘의 훈련 안내, 대화, 리뷰.
 * 시작 전이면 [코치 시작하기]. 칸 상태는 서버가 기록에서 읽는다(lib/coach/status.ts). 그날 운동은 [시작]이 연 화면이 엔진으로 만든다(R2).
 * 출시 전 베타의 잠김은 껍데기가 막는다(탭 막대 자물쇠 — app/index.tsx). 유료는 서버가 정한다(loadAppMe 의 coachPaid ← lib/coach-access.ts).
 */
export function CoachMainTab({ bottom }: { bottom: number }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [access, setAccess] = useState<'loading' | 'paid' | 'free' | 'error'>('loading');
  const [data, setData] = useState<CoachPlanData | undefined>(undefined);
  const [weekLoading, setWeekLoading] = useState(true);
  const [weekError, setWeekError] = useState(false);
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
    rpc<CoachPlanData>('coach.loadCoachWeek').then(
      (next) => {
        if (request !== weekRequest.current) return;
        setData(next);
        setWeekError(false);
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
  return (
    <ScrollView
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
        <ErrorState title={data ? '새 계획을 확인하지 못했어요' : '오늘 계획을 불러오지 못했어요'} detail={data ? '마지막으로 불러온 계획이 보여요.' : '다시 불러오면 이어서 볼 수 있어요.'} onRetry={retryWeek} c={c} />
      ) : null}
      {access === 'paid' && data && !week ? (
        <View style={[st.startCard, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
          <Text style={[st.kicker, { color: c.link }]}>PERSONAL COACH</Text>
          <Text style={[TYPE.hero, { color: c.ink }]}>코치를 시작해 볼까요?</Text>
          <Text style={[TYPE.body, { color: c.muted }]}>목표와 등판 일정, 운동할 수 있는 시간을 알려 주세요.</Text>
          <Press accessibilityRole="button" onPress={() => router.push('/coach-start' as Href)} style={[st.start, { backgroundColor: c.action }]}>
            <Text style={[TYPE.button, { color: c.onAction }]}>코치 시작하기</Text>
          </Press>
        </View>
      ) : null}
      {access === 'paid' && data && week ? (
        <>
          <Text accessibilityRole="header" style={[TYPE.hero, { color: c.ink }]}>오늘의 계획</Text>
          {data.followup ? <FollowupCard key={data.followup.date} ask={data.followup} onDone={loadWeek} /> : null}
          <GoalFollowCard refresh={data} />
          {todayAt >= 0 ? (
            <TodayCard slot={week[todayAt]} state={data.states?.[todayAt] ?? 'today'} checkedIn={data.checkedIn} onDone={loadWeek} />
          ) : (
            <ErrorState title="오늘 계획을 확인할 수 없어요" detail="다시 불러와 주세요." onRetry={retryWeek} c={c} />
          )}
          <NavRow label="코치에게 말하기" icon="chat" onPress={() => router.push('/coach-chat' as Href)} c={c} />
        </>
      ) : null}
      {access === 'paid' && data ? (
        <>
          <SectionHead title="리뷰" />
          {data.review ? <ReviewCard review={data.review} thisWeek={data.review.weekStart === data.weekStart} onDone={loadWeek} /> : null}
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            {REVIEWS.map((r, i) => (
              <Press key={r.view} accessibilityRole="link" onPress={() => pushOpen(('/analysis?view=' + r.view) as Href)} style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                <Icon name="chart-no-axes-column" size={19} color={c.link} />
                <Text style={[TYPE.body, { flex: 1, color: c.ink }]}>{r.label}</Text>
                <Icon name="chevron-right" size={17} color={c.muted} />
              </Press>
            ))}
          </View>
          {week ? <NavRow label="답 고치기" icon="clipboard-list" onPress={() => router.push('/coach-start' as Href)} c={c} /> : null}
        </>
      ) : null}
    </ScrollView>
  );
}

function ErrorState({ title, detail, onRetry, c }: { title: string; detail: string; onRetry: () => void; c: Palette }) {
  return <View style={[st.error, { backgroundColor: c.warnBg, borderColor: c.warnLine }]}><Text style={[TYPE.card, { color: c.ink }]}>{title}</Text><Text style={[TYPE.body, { color: c.muted }]}>{detail}</Text><Press accessibilityRole="button" onPress={onRetry} style={[st.retry, { backgroundColor: c.card, borderColor: c.line }]}><Icon name="rotate-ccw" size={16} color={c.link} /><Text style={[TYPE.body, { color: c.link, fontWeight: '600' }]}>다시 확인</Text></Press></View>;
}

function NavRow({ label, icon, onPress, c }: { label: string; icon: IconName; onPress: () => void; c: Palette }) {
  return <Press accessibilityRole="button" onPress={onPress} style={[st.navRow, { backgroundColor: c.card, boxShadow: c.float }]}><Icon name={icon} size={19} color={c.link} /><Text style={[TYPE.body, { flex: 1, color: c.ink, fontWeight: '600' }]}>{label}</Text><Icon name="chevron-right" size={17} color={c.muted} /></Press>;
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
function TodayCard({ slot, state, checkedIn, onDone }: { slot: DaySlot; state: SlotState; checkedIn: boolean; onDone: () => void }) {
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
      <Text style={st.focusCopy}>{why.length ? why.join(' · ') : '오늘 일정과 기록에 맞춘 계획이에요.'}</Text>
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
      <View style={st.reasonRow}><Icon name="calendar-days" size={20} color={c.link} /><View style={{ flex: 1, gap: 4 }}><Text style={[TYPE.card, { color: c.ink }]}>{why.length ? why.join(' · ') : '오늘의 기본 계획'}</Text><Text style={[TYPE.body, { color: c.muted }]}>오늘 일정과 기록을 반영했어요.</Text></View></View>
    </View>
  </>;
}

const st = StyleSheet.create({
  introIcon: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  group: { borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  start: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
  loading: { marginTop: 70 },
  setting: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  kicker: { fontSize: 12, fontWeight: '700', letterSpacing: 1, marginBottom: 5 },
  startCard: { borderRadius: 20, padding: 20, gap: 14 },
  error: { borderWidth: 1, borderRadius: 18, padding: 16, gap: 8 },
  retry: { minHeight: 44, borderWidth: StyleSheet.hairlineWidth, borderRadius: 12, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 14, marginTop: 4 },
  navRow: { minHeight: 54, borderRadius: 16, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10 },
  focus: { borderRadius: 22, padding: 20, gap: 11 },
  focusKicker: { color: '#d5e6ff', fontSize: 12, fontWeight: '700', letterSpacing: 1 },
  focusCopy: { color: '#dce9fb', fontSize: 14, lineHeight: 20 },
  focusDone: { color: '#c7f7df', fontSize: 14, fontWeight: '600' },
  focusButton: { minHeight: 50, borderRadius: 14, backgroundColor: '#ffffff', alignItems: 'center', justifyContent: 'center', marginTop: 4, paddingHorizontal: 12 },
  extraActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  reasonCard: { borderRadius: 17, paddingHorizontal: 15, paddingTop: 15 },
  reasonRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, paddingBottom: 13 },
  reviewAck: { minHeight: 44, borderRadius: 13, alignItems: 'center', justifyContent: 'center', marginTop: 5 },
});
