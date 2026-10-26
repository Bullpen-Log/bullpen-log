import { ActionButton } from '~/shell/action-button';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { rpc } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { useFocusRefresh, useOnTabActive } from '~/shell/tab-pager';
import { todayView } from './today-view';

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

export function PitchTodayCard({ today }: { today: string }) {
  const c = usePalette();
  const [data, setData] = useState<Today | null>(() => (cached?.today === today ? cached : null));
  /* 팔 상태 까닭 펴기 */
  const [why, setWhy] = useState(false);

  /* 받기 차례 — 늦게 온 앞 요청의 답이 새 답을 덮지 않게 */
  const seq = useRef(0);
  const load = useCallback(() => {
    const n = ++seq.current;
    void fetchToday().then((r) => r && n === seq.current && setData(r));
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

  /* 오늘 것만 보인다 — 새 날 값이 오기 전에는 팔 상태 없이 '오늘 기록' 단추만(가는 곳은 늘 지금의 today, pitch/today-view.ts) */
  const view = todayView(data, today);
  if (view.show === 'none' || !data) return null;
  const go = () => router.push(view.go as Href);
  const day = view.show === 'full' ? data : null;
  if (!day)
    return (
      <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
        <ActionButton label="오늘 기록 남기기" icon="plus" onPress={go} />
      </View>
    );
  const tone = { danger: c.danger, caution: c.warn, safe: c.ok }[day.status.level];
  const box = { danger: [c.dangerBg, c.dangerLine], caution: [c.warnBg, c.warnLine], safe: [withAlpha(c.chip, 0.5), c.line] }[day.status.level];
  const button = day.unloggedVelocity
    ? { label: `측정한 ${day.unloggedVelocity}구 기록 남기기`, go }
    : { label: day.logged ? `오늘 ${day.logged.pitches}구 · 기록 더하기` : '오늘 기록 남기기', go };

  return (
    <Animated.View layout={LinearTransition.duration(260)} style={[styles.card, { backgroundColor: c.card, boxShadow: c.floatHero }]}>
      {/*
        지금 팔 상태 — 카드에서 가장 먼저 읽히게 색 띠 · 큰 글(2026-10-21 김민: 안전 신호가 가장 작은 글이었다).
        까닭(details)은 접어 두고 띠를 누르면 편다
      */}
      <Press
        accessibilityRole="button"
        accessibilityState={{ expanded: why }}
        accessibilityLabel={`지금 팔 상태 ${LEVEL[day.status.level]}. ${day.status.headline}`}
        disabled={!day.status.details.length}
        onPress={() => setWhy((v) => !v)}
        style={[styles.status, { backgroundColor: box[0], borderColor: box[1] }]}
      >
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: tone }]} />
          <Text style={{ color: tone, fontSize: 17, fontWeight: '700' }}>팔 {LEVEL[day.status.level]}</Text>
          <View style={{ flex: 1 }} />
          {day.status.details.length ? (
            <>
              <Text style={{ color: c.muted, fontSize: 13 }}>{why ? '접기' : '까닭'}</Text>
              <Icon name={why ? 'chevron-up' : 'chevron-down'} size={14} color={c.muted} />
            </>
          ) : null}
        </View>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600', lineHeight: 21 }}>{day.status.headline}</Text>
        {why
          ? day.status.details.map((d) => (
              <Animated.Text entering={fadeIn} key={d} style={{ color: c.muted, fontSize: 13, lineHeight: 19, fontFamily: 'Pretendard' }}>
                {d}
              </Animated.Text>
            ))
          : null}
      </Press>

      {day.unloggedVelocity ? (
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }}>구속 측정 {day.unloggedVelocity}구가 아직 투구 기록에 없어요. 남겨야 팔 부하에 들어가요.</Text>
      ) : null}
      <ActionButton label={button.label} icon="plus" onPress={button.go} />
    </Animated.View>
  );
}

/* 웹 Card space-y-3 · 둥근 20 · 안쪽 20 */
const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20, gap: 12 },
  status: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  primary: { flexDirection: 'row', gap: 6, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
