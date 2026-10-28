import { ActionButton } from '~/shell/action-button';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { rpc } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { useFocusRefresh, useOnTabActive } from '~/shell/tab-pager';
import { todayView } from './today-view';
import type { PitchLog } from './api';
import { isRecordedRest } from './home-summary';

/**
 * 투구 탭 '오늘'(앱) — 웹 투구 탭 today-card.tsx 와 같은 값(app.loadAppPitchToday): 지금 팔 상태(위험 · 주의 · 안전) ·
 * 안 남긴 구속 측정 · 오늘 기록 단추. '오늘 던지는 일정' 질문은 2026-10-21 뺐다(김민: 답한 줄이 0 — 던진 양 · 체감 강도는 투구 기록에서
 * 읽는다). 서버는 옛 앱을 위해 throwCard 를 그대로 보낸다(이 판은 안 읽는다).
 * 위에 쌓인 화면(기록 폼 · 체크인 · 측정)에서 돌아오면 다시 받는다.
 */
type Today = {
  today: string;
  status: { level: 'danger' | 'caution' | 'safe'; headline: string; details: string[] };
  logged: { pitches: number } | null;
  unloggedVelocity: number | null;
  /** 던진 뒤 회복식 한 줄(그날 화면 — 웹 NutritionLineNote). 오늘 불펜 · 라이브 · 경기를 남겼을 때만 */
  nutritionLine: { title: string; text: string; example: string | null; href: string } | null;
};
let cached: Today | null = null;
/* 받아 둔 값을 쓴 요청 번호 — 늦게 시작한 요청이 둔 값을 앞 요청의 늦은 답이 덮지 않게 */
let fetches = 0;
let cachedN = 0;
export const resetPitchTodayCache = () => {
  cached = null;
  cachedN = 0;
};
/** 오늘 값을 새로 받는다 — 받으면 옆 칸(cached)에 둔다. 그새 로그아웃 등으로 캐시를 비웠으면 버린다 */
function fetchToday(): Promise<Today | null> {
  const e = cacheEpoch();
  const n = ++fetches;
  return rpc<({ ok: true } & Today) | { ok: false; error: string }>('app.loadAppPitchToday').then(
    (r) => {
      if (!r.ok || e !== cacheEpoch()) return null;
      if (n >= cachedN) {
        cached = r;
        cachedN = n;
      }
      return r;
    },
    () => null
  );
}
/**
 * 그날 화면(오늘)의 팔 상태 한 줄 · 회복식 한 줄 — 받아 둔 것을 먼저 보이고, 그날 기록이 바뀔 때마다(key) 새로 받는다
 * (웹은 저장 뒤 quietRefresh 로 곧바로 뜬다 — 방금 남긴 불펜이 팔 상태 · 회복식에 든다).
 */
export function usePitchToday(today: string, enabled: boolean, key: string): Today | null {
  const [data, setData] = useState<Today | null>(() => (cached?.today === today ? cached : null));
  /* 날짜가 바뀌어도(한국 자정 · 다음 날 복귀) 다시 받는다 — 앞 효과의 늦은 답은 버린다(alive) */
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchToday().then((r) => alive && r && setData(r));
    return () => {
      alive = false;
    };
  }, [enabled, key, today]);
  return enabled && data?.today === today ? data : null;
}
const LEVEL = { danger: '위험', caution: '주의', safe: '안전' } as const;

/**
 * 투구 탭 '오늘'의 값 — 팔 상태 알약(머리 줄) · 팔 상태 칸 · 오늘 투구 카드가 같이 쓴다(2026-10-29 확정 디자인: 팔 상태는 날짜 줄 오른쪽으로,
 * 오늘 투구는 흰 카드 + 투구 · 휴식 기록 단추). 위에 쌓인 화면(기록 폼 · 체크인 · 측정)에서 돌아오면 다시 받는다.
 */
export function usePitchTodayState(today: string) {
  const [data, setData] = useState<Today | null>(() => (cached?.today === today ? cached : null));
  const [failed, setFailed] = useState(false);
  /* 받기 차례 — 늦게 온 앞 요청의 답이 새 답을 덮지 않게 */
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    void fetchToday().then((r) => {
      if (n !== seq.current) return;
      setFailed(!r);
      if (r) setData(r);
    });
  }, []);
  /* 탭을 옮겼다 돌아와도(판은 붙어 있다) */
  useOnTabActive(() => load());
  useFocusRefresh(load, { first: true });
  /*
   * 날짜가 바뀌면(투구 탭을 켜 둔 채 한국 자정 · 다음 날 복귀 — 껍데기가 서버에 오늘을 다시 물어 today 가 바뀐다) 새로 받는다. 예전엔 어제 값이 남아
   * '오늘 기록 남기기'가 어제 화면(data.today)을 열었다(2026-10-26)
   */
  const seenToday = useRef(today);
  useEffect(() => {
    if (seenToday.current === today) return;
    seenToday.current = today;
    load();
  }, [today, load]);
  const view = todayView(data, today);
  return { current: view.show === 'full' ? data : null, failed, load, go: view.go };
}
export type PitchTodayState = ReturnType<typeof usePitchTodayState>;

/** 날짜 줄 오른쪽 '팔 상태' 알약 — 색 점 + 단계. 누르면 밑에 근거 칸이 펴진다 */
export function ArmStatusChip({ state, open, onPress }: { state: PitchTodayState; open: boolean; onPress: () => void }) {
  const c = usePalette();
  const { current, failed } = state;
  const tone = current ? { danger: c.danger, caution: c.warn, safe: c.ok }[current.status.level] : c.muted;
  const label = current ? `팔 상태 · ${LEVEL[current.status.level]}` : failed ? '팔 상태 다시' : '팔 상태';
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={current ? `지금 팔 상태 ${LEVEL[current.status.level]}. ${current.status.headline}` : failed ? '팔 상태 다시 확인' : '팔 상태 확인 중'}
      onPress={() => (failed && !current ? state.load() : onPress())}
      style={[styles.chip, { backgroundColor: c.card, boxShadow: c.float }]}
    >
      <Icon name="activity" size={15} color={c.link} />
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '500' }}>{label}</Text>
      {current ? <View style={[styles.dot, { backgroundColor: tone }]} /> : null}
    </Press>
  );
}

/** 팔 상태 근거 칸 — 주의 · 위험이면 처음부터 펴 둔다(안전 문장을 숨기지 않는다). 알약으로 접고 편다 */
export function ArmStatusPanel({ state }: { state: PitchTodayState }) {
  const c = usePalette();
  const current = state.current;
  if (!current) return null;
  const warning = current.status.level !== 'safe';
  const bg = current.status.level === 'danger' ? c.dangerBg : current.status.level === 'caution' ? c.warnBg : c.card;
  const ink = current.status.level === 'danger' ? c.danger : current.status.level === 'caution' ? c.warn : c.ink;
  return (
    <Animated.View entering={fadeIn} style={[styles.panel, { backgroundColor: bg }, !warning && { boxShadow: c.float }]}>
      <Text style={{ color: ink, fontSize: 15, lineHeight: 22, fontWeight: '600' }}>{current.status.headline}</Text>
      {current.status.details.map((d) => (
        <Text key={d} style={{ color: warning ? c.ink : c.muted, fontSize: 15, lineHeight: 22 }}>
          {d}
        </Text>
      ))}
    </Animated.View>
  );
}

/** 오늘 투구 — 흰 카드: 작은 이름 · 큰 값(기록 전 · N구 · 휴식 · 측정 N구) · 한 줄 · 주 단추 하나 */
export function PitchTodayCard({ today, logs = null, state }: { today: string; logs?: PitchLog[] | null; state: PitchTodayState }) {
  const c = usePalette();
  const { current, failed, go } = state;
  const pending = current?.unloggedVelocity ?? 0;
  const resting = !pending && isRecordedRest(logs, today);
  const count = pending || current?.logged?.pitches;
  const numeric = typeof count === 'number' && !resting;
  const value = numeric ? String(count) : resting ? '휴식' : current ? '기록 전' : failed ? '확인 필요' : '확인 중';
  /* 측정했지만 기록에 안 넣은 공 — 확정 기록처럼 보이지 않게 '반영 전'을 붙인다 */
  const note = pending ? '측정 완료 · 기록 반영 전' : !current && failed ? '오늘 기록을 불러오지 못했어요' : null;
  const button = {
    label: pending ? `측정한 ${pending}구 기록에 반영` : current?.logged || resting ? '오늘 기록 보기' : '투구 · 휴식 기록',
    icon: (current?.logged || resting) && !pending ? ('chevron-right' as const) : ('plus' as const),
  };
  return (
    <Animated.View layout={LinearTransition.duration(260)} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={{ gap: 5 }}>
        <Text style={{ color: c.muted, fontSize: 12 }}>오늘 투구</Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
          <Text style={[numeric ? TYPE.num : TYPE.heading, { color: c.ink, fontSize: numeric ? 30 : 26 }]}>{value}</Text>
          {numeric ? <Text style={{ color: c.muted, fontSize: 14 }}>구</Text> : null}
        </View>
        {note ? <Text style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>{note}</Text> : null}
      </View>
      <ActionButton label={button.label} icon={button.icon} onPress={() => router.push(go as Href)} style={{ borderRadius: 16 }} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 25, padding: 18, gap: 17 },
  chip: { minHeight: 44, borderRadius: 22, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  panel: { borderRadius: 18, padding: 16, gap: 6 },
});
