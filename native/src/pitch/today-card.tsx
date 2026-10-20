import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import * as Haptics from 'expo-haptics';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { LinearTransition } from 'react-native-reanimated';
import { THROW_PLANS } from '@/lib/checkin';
import { rpc } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import { openCheckin } from '~/shell/web-nav';
import { useOnTabActive } from '~/shell/tab-pager';

/**
 * 투구 탭 맨 위 '오늘' 카드(앱) — 웹 투구 탭 today-card.tsx 와 같은 값(app.loadAppPitchToday): 지금 팔 상태(위험 · 주의 · 안전) ·
 * '오늘 던지는 일정은요?'(체크인 줄에 저장 — day-cards.setThrowPlan, 체크인 전이면 체크인부터) · 안 남긴 구속 측정 · 오늘 기록 단추.
 * 위에 쌓인 화면(기록 폼 · 체크인 · 측정)에서 돌아오면 다시 받는다.
 */
type Today = {
  today: string;
  status: { level: 'danger' | 'caution' | 'safe'; headline: string; details: string[] };
  logged: { pitches: number } | null;
  unloggedVelocity: number | null;
  throwCard: { plan: string | null; hasCheckin: boolean; hint: string | null };
  /** 던진 뒤 회복식 한 줄(그날 화면 — 웹 NutritionLineNote). 오늘 불펜 · 라이브 · 경기를 남겼을 때만 */
  nutritionLine: { title: string; text: string; example: string | null; href: string } | null;
};
let cached: Today | null = null;
export const resetPitchTodayCache = () => {
  cached = null;
};
/** 오늘 값을 새로 받는다 — 받으면 옆 칸(cached)에 둔다. 그새 로그아웃 등으로 캐시를 비웠으면 버린다 */
function fetchToday(): Promise<Today | null> {
  const e = cacheEpoch();
  return rpc<({ ok: true } & Today) | { ok: false; error: string }>('app.loadAppPitchToday').then(
    (r) => {
      if (!r.ok || e !== cacheEpoch()) return null;
      cached = r;
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
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    void fetchToday().then((r) => alive && r && setData(r));
    return () => {
      alive = false;
    };
  }, [enabled, key]);
  return enabled && data?.today === today ? data : null;
}
const LEVEL = { danger: '위험', caution: '주의', safe: '안전' } as const;

export function PitchTodayCard({ today }: { today: string }) {
  const c = usePalette();
  const [data, setData] = useState<Today | null>(() => (cached?.today === today ? cached : null));
  const [saving, setSaving] = useState(false);
  /* 팔 상태 까닭 펴기 */
  const [why, setWhy] = useState(false);

  const load = useCallback(() => {
    void fetchToday().then((r) => r && setData(r));
  }, []);
  /* 탭을 옮겼다 돌아와도(판은 붙어 있다) */
  useOnTabActive(() => load());
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  /* 일정 고르기 — 웹 DayCard folded: 접힌 알약으로 시작, 누르면 하늘색 판이 펴지고 고른 뒤 [저장] */
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState<string | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const openPlan = () => {
    if (!data) return;
    setPick(data.throwCard.plan ?? data.throwCard.hint);
    setPlanError(null);
    setOpen(true);
  };
  const savePlan = async () => {
    if (!data || saving || pick == null) return;
    if (!data.throwCard.hasCheckin) {
      setPlanError('체크인을 먼저 남겨 주세요.');
      return;
    }
    setSaving(true);
    setPlanError(null);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>('day-cards.setThrowPlan', { date: data.today, plan: pick });
      if (!r.ok) {
        setPlanError(r.error ?? '저장하지 못했어요.');
        return;
      }
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setData({ ...data, throwCard: { ...data.throwCard, plan: pick } });
      setOpen(false);
      load();
    } catch {
      setPlanError('신호가 약해 저장하지 못했어요.');
    } finally {
      setSaving(false);
    }
  };

  if (!data) return null;
  const tone = { danger: c.danger, caution: c.warn, safe: c.ok }[data.status.level];
  const box = { danger: [c.dangerBg, c.dangerLine], caution: [c.warnBg, c.warnLine], safe: [withAlpha(c.chip, 0.5), c.line] }[data.status.level];
  const button = data.unloggedVelocity
    ? { label: `측정한 ${data.unloggedVelocity}구 기록 남기기`, go: () => router.push(`/pitch/${data.today}` as Href) }
    : {
        label: data.logged ? `오늘 ${data.logged.pitches}구 · 기록 더하기` : '오늘 기록 남기기',
        go: () => router.push(`/pitch/${data.today}` as Href),
      };
  const answer = data.throwCard.plan;

  return (
    <Animated.View layout={LinearTransition.duration(260)} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      {/*
        지금 팔 상태 — 카드에서 가장 먼저 읽히게 색 띠 · 큰 글(2026-10-21 김민: 안전 신호가 가장 작은 글이었다).
        까닭(details)은 접어 두고 띠를 누르면 편다
      */}
      <Press
        accessibilityRole="button"
        accessibilityState={{ expanded: why }}
        accessibilityLabel={`지금 팔 상태 ${LEVEL[data.status.level]}. ${data.status.headline}`}
        disabled={!data.status.details.length}
        onPress={() => setWhy((v) => !v)}
        style={[styles.status, { backgroundColor: box[0], borderColor: box[1] }]}
      >
        <View style={styles.statusRow}>
          <View style={[styles.dot, { backgroundColor: tone }]} />
          <Text style={{ color: tone, fontSize: 17, fontWeight: '700' }}>팔 {LEVEL[data.status.level]}</Text>
          <View style={{ flex: 1 }} />
          {data.status.details.length ? (
            <>
              <Text style={{ color: c.muted, fontSize: 13 }}>{why ? '접기' : '까닭'}</Text>
              <Icon name={why ? 'chevron-up' : 'chevron-down'} size={14} color={c.muted} />
            </>
          ) : null}
        </View>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600', lineHeight: 21 }}>{data.status.headline}</Text>
        {why
          ? data.status.details.map((d) => (
              <Animated.Text entering={fadeIn} key={d} style={{ color: c.muted, fontSize: 13, lineHeight: 19 }}>
                {d}
              </Animated.Text>
            ))
          : null}
      </Press>

      {open ? (
        <Animated.View entering={fadeIn} style={[styles.planBox, { backgroundColor: withAlpha(c.skyTint, 0.6), borderColor: withAlpha(c.sky, 0.25) }]}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>오늘 던지는 일정은요?</Text>
              <Text style={{ color: c.muted, fontSize: 13 }}>등판 · 불펜 날은 운동 일정 · 끼니 · 암케어가 거기에 맞춰요.</Text>
            </View>
            {/* 늘 접기(2026-10-20 김민: 펼치면 접는 기능이 없다 — '모름'이 접기로 안 읽혔다). 웹 DayCard 와 같은 글 */}
            <Press accessibilityRole="button" accessibilityLabel="접기" onPress={() => setOpen(false)} style={styles.later}>
              <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>접기</Text>
              <Icon name="chevron-up" size={14} color={c.muted} />
            </Press>
          </View>
          <View style={styles.grid}>
            {THROW_PLANS.map((p) => {
              const on = pick === p;
              return (
                <View key={p} style={styles.gridCell}>
                  <Press
                    select
                    selected={on}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setPick(on ? null : p)}
                    style={[styles.dayChip, on ? { borderColor: c.sky, backgroundColor: withAlpha(c.sky, 0.1) } : { backgroundColor: withAlpha(c.ink, 0.06) }]}
                  >
                    <Text numberOfLines={1} style={{ color: on ? c.sky : withAlpha(c.ink, 0.8), fontSize: 15, fontWeight: on ? '600' : '400' }}>
                      {p}
                    </Text>
                  </Press>
                </View>
              );
            })}
          </View>
          {data.throwCard.hint && answer == null ? <Text style={{ color: c.muted, fontSize: 13 }}>달력에 등판 일정이 있어 미리 골라 뒀어요.</Text> : null}
          {planError ? (
            <Text style={{ color: c.danger, fontSize: 13 }}>
              {planError}
              {!data.throwCard.hasCheckin ? (
                <Text onPress={() => openCheckin('/videos')} style={{ color: c.skyStrong, fontWeight: '600', textDecorationLine: 'underline' }}>
                  {' '}체크인하기
                </Text>
              ) : null}
            </Text>
          ) : null}
          <Press
            accessibilityRole="button"
            disabled={saving || pick == null}
            onPress={() => void savePlan()}
            style={[styles.primary, { backgroundColor: c.sky, marginTop: 0 }, (saving || pick == null) && { opacity: 0.4 }]}
          >
            <Text style={styles.primaryText}>{saving ? '저장 중…' : '저장'}</Text>
          </Press>
        </Animated.View>
      ) : (
        <Press accessibilityRole="button" onPress={openPlan} style={[styles.pill, { backgroundColor: withAlpha(c.ink, 0.06) }]}>
          <Text numberOfLines={1} style={{ color: c.muted, fontSize: 15, flexShrink: 1 }}>
            {answer == null ? '오늘 던지는 일정은요?' : '던지는 일정'}
          </Text>
          <Text numberOfLines={1} style={{ color: answer == null ? c.sky : c.ink, fontSize: 15, fontWeight: '600' }}>
            {answer ?? '답하기'}
          </Text>
          <Icon name="pencil" size={16} color={c.muted} />
        </Press>
      )}

      {data.unloggedVelocity ? (
        <Text style={{ color: c.muted, fontSize: 15, lineHeight: 21 }}>구속 측정 {data.unloggedVelocity}구가 아직 투구 기록에 없어요. 남겨야 팔 부하에 들어가요.</Text>
      ) : null}
      <Press accessibilityRole="button" onPress={button.go} style={[styles.primary, { backgroundColor: c.sky }]}>
        <Icon name="plus" size={16} color="#fff" />
        <Text style={styles.primaryText}>{button.label}</Text>
      </Press>
    </Animated.View>
  );
}

/* 웹 Card space-y-3 · 둥근 20 · 안쪽 20 */
const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 20, gap: 12 },
  status: { borderRadius: 16, borderWidth: 1, paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  pill: { alignSelf: 'flex-start', maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44, borderRadius: 22, paddingHorizontal: 16 },
  planBox: { borderRadius: 20, borderWidth: 1, padding: 20, gap: 12 },
  later: { minHeight: 40, marginVertical: -8, paddingHorizontal: 12, borderRadius: 20, flexDirection: 'row', alignItems: 'center', gap: 2 },
  /* 웹 chip-grid data-cols=3 — 같은 폭 세 칸 */
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4, rowGap: 8 },
  gridCell: { width: '33.333%', paddingHorizontal: 4 },
  dayChip: { minHeight: 40, borderRadius: 20, borderWidth: 1, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 },
  primary: { flexDirection: 'row', gap: 6, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '700' },
});
