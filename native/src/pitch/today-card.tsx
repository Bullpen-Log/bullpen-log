import { ActionButton } from '~/shell/action-button';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { rpc } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { TYPE, usePalette, useTheme } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { useFocusRefresh, useOnTabActive } from '~/shell/tab-pager';
import { todayView } from './today-view';
import type { PitchLog } from './api';
import { PitchHomeMound } from './home-mound';
import { isRecordedRest } from './home-summary';

/**
 * 투구 탭 맨 위 '오늘' 카드(앱) — 웹 투구 탭 today-card.tsx 와 같은 값(app.loadAppPitchToday): 지금 팔 상태(위험 · 주의 · 안전) ·
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

export function PitchTodayCard({ today, logs = null }: { today: string; logs?: PitchLog[] | null }) {
  const c = usePalette();
  const dark = useTheme() !== 'light';
  const [data, setData] = useState<Today | null>(() => (cached?.today === today ? cached : null));
  const [failed, setFailed] = useState(false);
  /* 팔 상태 까닭 펴기 */
  const [why, setWhy] = useState(false);

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
  const current = view.show === 'full' ? data : null;
  const pending = current?.unloggedVelocity ?? 0;
  const resting = !pending && isRecordedRest(logs, today);
  const count = pending || current?.logged?.pitches;
  const value = pending ? String(pending) : resting ? '휴식' : current?.logged ? String(count) : current ? '기록 전' : failed ? '확인 필요' : '확인 중';
  const subtitle = pending ? '측정 완료 · 기록 반영 전' : resting ? '오늘은 쉬는 날로 남겼어요.' : current?.logged ? '오늘 투구 기록 완료' : current ? '던진 날과 쉰 날을 남겨요.' : failed ? '기록은 아래에서 확인할 수 있어요.' : '오늘 기록을 불러오고 있어요.';
  const tone = current ? { danger: c.danger, caution: c.warn, safe: '#a9e2f3' }[current.status.level] : '#b5d5eb';
  const warning = current && current.status.level !== 'safe';
  const button = {
    label: pending ? `측정한 ${pending}구 기록에 반영` : current?.logged ? '오늘 기록 보기' : '투구 · 휴식 기록',
    go: () => router.push(view.go as Href),
  };

  return (
    <Animated.View layout={LinearTransition.duration(260)} style={[styles.card, { backgroundColor: dark ? '#0d2940' : '#153f60', boxShadow: c.floatHero }]}>
      <View style={styles.heroHead}>
        <Text style={{ color: '#f4fbff', fontSize: 17, fontWeight: '600' }}>오늘 투구</Text>
        <Text style={{ color: '#b5d5eb', fontSize: 12 }}>{today.slice(5).replace('-', '.')}</Text>
      </View>
      <View style={styles.heroBody}>
        <View style={{ flex: 1, minWidth: 0, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, flexWrap: 'wrap' }}>
            <Text style={[typeof count === 'number' && !resting ? TYPE.num : TYPE.heading, { color: '#f4fbff', fontSize: typeof count === 'number' && !resting ? 54 : 30 }]}>{value}</Text>
            {typeof count === 'number' && !resting ? <Text style={{ color: '#b5d5eb', fontSize: 15 }}>구</Text> : null}
          </View>
          <Text style={{ color: '#b5d5eb', fontSize: 12, lineHeight: 19 }}>{subtitle}</Text>
        </View>
        <PitchHomeMound />
      </View>
      {/*
        지금 팔 상태 — 카드에서 가장 먼저 읽히게 색 띠 · 큰 글(2026-10-21 김민: 안전 신호가 가장 작은 글이었다).
        까닭(details)은 접어 두고 띠를 누르면 편다
      */}
      <Press
        accessibilityRole="button"
        accessibilityState={{ expanded: why }}
        accessibilityLabel={current ? `지금 팔 상태 ${LEVEL[current.status.level]}. ${current.status.headline}` : failed ? '팔 상태 다시 확인' : '팔 상태 확인 중'}
        disabled={!current?.status.details.length && !failed}
        onPress={() => failed ? load() : setWhy((v) => !v)}
        style={[styles.status, warning && { backgroundColor: current.status.level === 'danger' ? c.dangerBg : c.warnBg, padding: 12 }]}
      >
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: tone }]} />
          <Text style={{ color: tone, fontSize: 13, fontWeight: '600' }}>{current ? `팔 상태 · ${LEVEL[current.status.level]}` : failed ? '팔 상태 다시 확인' : '팔 상태 확인 중'}</Text>
          <View style={{ flex: 1 }} />
          {current?.status.details.length ? (
            <>
              <Text style={{ color: warning ? c.muted : '#b5d5eb', fontSize: 12 }}>{why ? '접기' : '까닭'}</Text>
              <Icon name={why ? 'chevron-up' : 'chevron-down'} size={14} color={warning ? c.muted : '#b5d5eb'} />
            </>
          ) : null}
        </View>
        {current ? <Text style={{ color: warning ? c.ink : '#b5d5eb', fontSize: 12, lineHeight: 19 }}>{current.status.headline}</Text> : null}
        {why && current
          ? current.status.details.map((d) => (
              <Animated.Text entering={fadeIn} key={d} style={{ color: warning ? c.muted : '#b5d5eb', fontSize: 13, lineHeight: 19, fontFamily: 'Pretendard' }}>
                {d}
              </Animated.Text>
            ))
          : null}
      </Press>

      <ActionButton label={button.label} icon={current?.logged && !pending ? 'chevron-right' : 'plus'} onPress={button.go} style={{ borderRadius: 14 }} />
    </Animated.View>
  );
}

/* 웹 Card space-y-3 · 둥근 20 · 안쪽 20 */
const styles = StyleSheet.create({
  card: { borderRadius: 24, padding: 18, gap: 10, overflow: 'hidden' },
  heroHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heroBody: { flexDirection: 'row', alignItems: 'center', minHeight: 139 },
  status: { borderRadius: 13, minHeight: 44, gap: 4, paddingVertical: 5 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
});
