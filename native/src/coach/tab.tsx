import { useCallback, useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, type Href } from 'expo-router';
import { REASON_TEXT, WEEKDAY_LABELS, slotLine } from '@/lib/coach/answers';
import type { WeekReview } from '@/lib/coach/review';
import { startsOf, type SlotState } from '@/lib/coach/status';
import type { DaySlot } from '@/lib/coach/week';
import { COACH_POINTS } from '@/lib/coach-intro';
import { loadMe } from '~/pitch/api';
import { READABLE_WIDE } from '~/lib/layout';
import { rpc } from '~/lib/rpc';
import { SPACE, SURFACE, TYPE, usePalette } from '~/lib/ui';
import { PageHead, SectionHead } from '~/shell/heading';
import { Icon } from '~/shell/icon';
import { MenuButton } from '~/shell/menu-button';
import { Press } from '~/shell/press';
import { pushOpen } from '~/shell/release';
import { useFocusRefresh } from '~/shell/tab-pager';
import { toast } from '~/shell/toast';
import { openCheckin } from '~/shell/web-nav';
import { AdjustBar } from './adjust';

/**
 * 코치 소개(2026-11-01, docs/designs/ai-coach.md U13) — 유료가 아닌 사람이 코치 탭 · 분석 화면을 열면. 결제 안내 · 밖 링크는 두지 않는다(애플 심사).
 * 웹 app/(app)/coach/coach-intro.tsx 와 같은 글(lib/coach-intro.ts).
 */
export function CoachIntro() {
  const c = usePalette();
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Icon name="clipboard-list" size={28} color={c.ink} />
      <Text style={[TYPE.card, { color: c.ink }]}>내 상태에 맞춰 한 주 운동을 짜고 매일 고쳐 주는 코치예요.</Text>
      <View style={{ gap: 6 }}>
        {COACH_POINTS.map((p) => (
          <Text key={p} style={[TYPE.body, { color: c.muted }]}>
            {p}
          </Text>
        ))}
      </View>
      <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>유료 요금제 전용이에요.</Text>
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
  /* null = 아직 모름(소개를 먼저 그렸다 바꾸면 유료 사용자에게 소개가 번쩍인다) */
  const [paid, setPaid] = useState<boolean | null>(null);
  useEffect(() => {
    let alive = true;
    loadMe().then(
      (me) => alive && setPaid(me.coachPaid === true),
      () => alive && setPaid(false)
    );
    return () => {
      alive = false;
    };
  }, []);
  /* 이번 주 — 코치 시작 화면 · 운동에서 돌아오거나 탭이 다시 보일 때 새로 받는다. undefined = 아직 모름 */
  const [data, setData] = useState<CoachWeekData | undefined>(undefined);
  const loadWeek = useCallback(() => {
    rpc<CoachWeekData>('coach.loadCoachWeek').then(setData, () => undefined);
  }, []);
  useEffect(() => {
    if (paid) loadWeek();
  }, [paid, loadWeek]);
  useFocusRefresh(() => paid && loadWeek());
  const week = data?.week ?? null;
  const todayAt = week && data ? week.findIndex((s) => s.date === data.today) : -1;
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={[
        { paddingTop: inset.top + SPACE.section, paddingBottom: bottom + 24, paddingHorizontal: SPACE.side, gap: SPACE.gap },
        READABLE_WIDE,
      ]}
    >
      <PageHead title="코치">
        <MenuButton />
      </PageHead>
      {paid === false ? <CoachIntro /> : null}
      {paid ? (
        <>
          {data && !week ? (
            <Press accessibilityRole="button" onPress={() => router.push('/coach-start' as Href)} style={[st.start, { backgroundColor: c.action }]}>
              <Text style={[TYPE.card, { color: c.onAction }]}>코치 시작하기</Text>
            </Press>
          ) : null}
          {data?.review ? <ReviewCard review={data.review} thisWeek={data.review.weekStart === data.weekStart} onDone={loadWeek} /> : null}
          {week && data && todayAt >= 0 ? (
            <TodayCard slot={week[todayAt]} state={data.states?.[todayAt] ?? 'today'} checkedIn={data.checkedIn} onDone={loadWeek} />
          ) : null}
          {week && data?.states ? <AdjustBar week={week} states={data.states} today={data.today} onDone={loadWeek} /> : null}
          {week && data ? (
            <>
              <SectionHead title="이번 주" />
              <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
                {week.map((s, k) => {
                  const state = data.states?.[k];
                  const isToday = k === todayAt;
                  return (
                    <View key={s.date} style={[st.day, k > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                      <Text style={[TYPE.body, { width: 30, fontWeight: '700', color: isToday ? c.link : c.muted }]}>{isToday ? '오늘' : WEEKDAY_LABELS[k]}</Text>
                      <Text style={[TYPE.body, { flex: 1, color: state === 'missed' ? c.muted : c.ink }]}>{slotLine(s)}</Text>
                      {state === 'done' ? <Icon name="check" size={18} color={c.link} /> : null}
                      {state === 'missed' ? <Text style={[TYPE.sub, { color: c.muted }]}>못 함</Text> : null}
                    </View>
                  );
                })}
              </View>
            </>
          ) : null}
          <SectionHead title="리뷰" />
          <View style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
            {REVIEWS.map((r, i) => (
              <Press
                key={r.view}
                accessibilityRole="link"
                onPress={() => pushOpen(`/analysis?view=${r.view}` as Href)}
                style={[st.row, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}
              >
                <Icon name="chart-no-axes-column" size={20} color={c.link} />
                <Text style={[TYPE.card, { flex: 1, color: c.ink }]}>{r.label}</Text>
                <Icon name="chevron-right" size={18} color={c.muted} />
              </Press>
            ))}
          </View>
          {week ? (
            <Press
              accessibilityRole="link"
              onPress={() => router.push('/coach-start' as Href)}
              style={[st.row, st.group, { backgroundColor: c.card, boxShadow: c.float }]}
            >
              <Text style={[TYPE.card, { flex: 1, color: c.ink }]}>코치 답 고치기</Text>
              <Icon name="chevron-right" size={18} color={c.muted} />
            </Press>
          ) : null}
        </>
      ) : null}
    </ScrollView>
  );
}

/** 주간 리뷰(U37) — 일요일 저녁 ~ 월요일, [확인]하면 접힌다. 글은 서버가 정해진 문장으로(lib/coach/review.ts) */
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
      <Text style={[TYPE.sub, { color: c.muted }]}>{thisWeek ? '이번 주 돌아보기' : '지난주 돌아보기'}</Text>
      <Text style={[TYPE.hero, { color: c.ink }]}>{review.planned ? `${review.done} / ${review.planned}일` : '쉬어 간 주'}</Text>
      <View style={{ gap: 4 }}>
        {review.lines.map((l) => (
          <Text key={l} style={[TYPE.body, { color: c.ink }]}>
            {l}
          </Text>
        ))}
      </View>
      <Press accessibilityRole="button" disabled={busy} onPress={() => void ack()} style={[st.start, { backgroundColor: c.action }]}>
        <Text style={[TYPE.card, { color: c.onAction }]}>확인</Text>
      </Press>
    </View>
  );
}

/** 오늘 계획(크게) — 무엇을 · 왜 · [시작]. 운동 날인데 체크인 전이면 체크인부터(오늘 상태를 알아야 맞춘다), 시작 단추는 밑에 그대로 */
function TodayCard({ slot, state, checkedIn, onDone }: { slot: DaySlot; state: SlotState; checkedIn: boolean; onDone: () => void }) {
  const c = usePalette();
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
    ? { label: '체크인부터', onPress: () => openCheckin() }
    : starts[0]
      ? { label: starts[0].label, onPress: () => pushOpen(starts[0].path as Href) }
      : null;
  const more = needCheckin ? starts : starts.slice(1);
  return (
    <View style={[SURFACE.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <Text style={[TYPE.sub, { color: c.muted }]}>오늘</Text>
      <Text style={[TYPE.hero, { color: c.ink }]}>{slotLine(slot)}</Text>
      {why.length ? <Text style={[TYPE.body, { color: c.muted }]}>{why.join(' · ')}</Text> : null}
      {state === 'done' ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Icon name="circle-check" size={18} color={c.link} />
          <Text style={[TYPE.body, { color: c.ink }]}>오늘 한 것이 있어요</Text>
        </View>
      ) : null}
      {slot.owner === 'user' ? (
        <View style={{ gap: 2 }}>
          <Text style={[TYPE.sub, { color: c.muted }]}>오늘은 직접 만든 운동으로 해요.</Text>
          <Press accessibilityRole="button" disabled={busy} onPress={() => void takeBack()} style={st.link}>
            <Text style={[TYPE.card, { color: c.link }]}>오늘 다시 코치에게</Text>
          </Press>
        </View>
      ) : null}
      {needCheckin ? <Text style={[TYPE.sub, { color: c.muted }]}>체크인하면 오늘 몸 상태에 맞춰 만들어요.</Text> : null}
      {main ? (
        <Press accessibilityRole="button" onPress={main.onPress} style={[st.start, { backgroundColor: c.action }]}>
          <Text style={[TYPE.card, { color: c.onAction }]}>{main.label}</Text>
        </Press>
      ) : null}
      {more.length ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 20 }}>
          {more.map((x) => (
            <Press key={x.kind} accessibilityRole="link" onPress={() => pushOpen(x.path as Href)} style={st.link}>
              <Text style={[TYPE.card, { color: c.link }]}>{x.label}</Text>
            </Press>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  group: { borderRadius: 20, overflow: 'hidden' },
  row: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16 },
  day: { minHeight: 48, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  start: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  link: { minHeight: 44, justifyContent: 'center' },
});
