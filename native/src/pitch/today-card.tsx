import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { THROW_PLANS } from '@/lib/checkin';
import { rpc } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import { usePalette } from '~/lib/ui';
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
};
let cached: Today | null = null;
export const resetPitchTodayCache = () => {
  cached = null;
};
const LEVEL = { danger: '위험', caution: '주의', safe: '안전' } as const;

export function PitchTodayCard({ today }: { today: string }) {
  const c = usePalette();
  const [data, setData] = useState<Today | null>(() => (cached?.today === today ? cached : null));
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    const e = cacheEpoch();
    void rpc<({ ok: true } & Today) | { ok: false; error: string }>('app.loadAppPitchToday').then(
      (r) => {
        if (!r.ok || e !== cacheEpoch()) return;
        cached = r;
        setData(r);
      },
      () => undefined
    );
  }, []);
  /* 탭을 옮겼다 돌아와도(판은 붙어 있다) */
  useOnTabActive(() => load());
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const pickPlan = async (plan: string) => {
    if (!data || saving) return;
    const next = data.throwCard.plan === plan ? null : plan;
    setSaving(true);
    setData({ ...data, throwCard: { ...data.throwCard, plan: next } });
    try {
      const r = await rpc<{ ok: boolean; error?: string }>('day-cards.setThrowPlan', { date: data.today, plan: next });
      if (!r.ok) load();
    } catch {
      load();
    } finally {
      setSaving(false);
    }
  };
  /* 안 고른 날은 달력의 오늘 · 내일 등판을 테두리로 짚어 준다(고르지는 않는다 — 웹은 미리 고르지만 앱은 누를 때만 저장) */
  const shownPlan = data?.throwCard.plan ?? null;

  if (!data) return null;
  const color = data.status.level === 'danger' ? c.danger : data.status.level === 'caution' ? '#c77700' : c.sky;
  const button = data.unloggedVelocity
    ? { label: `측정한 ${data.unloggedVelocity}구 기록 남기기`, go: () => router.push(`/pitch/${data.today}` as Href) }
    : {
        label: data.logged ? `오늘 ${data.logged.pitches}구 · 기록 더하기` : '오늘 기록 남기기',
        go: () => router.push({ pathname: '/pitch/edit' as Href as never, params: { date: data.today } }),
      };

  return (
    <View style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
      <View style={styles.status}>
        <View style={[styles.badge, { backgroundColor: color }]}>
          <Text style={styles.badgeText}>{LEVEL[data.status.level]}</Text>
        </View>
        <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '600' }}>{data.status.headline}</Text>
      </View>
      {data.status.details.slice(0, 2).map((d, i) => (
        <Text key={i} style={{ color: c.muted, fontSize: 13 }}>
          · {d}
        </Text>
      ))}

      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '700', marginTop: 4 }}>오늘 던지는 일정은요?</Text>
      {data.throwCard.hasCheckin ? (
        <View style={styles.chips}>
          {THROW_PLANS.map((p) => {
            const on = shownPlan === p;
            const hint = !shownPlan && data.throwCard.hint === p;
            return (
              <Pressable
                key={p}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                disabled={saving}
                onPress={() => void pickPlan(p)}
                style={[
                  styles.chip,
                  { backgroundColor: on ? c.sky : c.chip },
                  hint && { borderWidth: 1.5, borderColor: c.sky },
                ]}
              >
                <Text style={{ color: on ? '#fff' : c.ink, fontSize: 14, fontWeight: '600' }}>{p}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          onPress={() => openCheckin('/videos')}
          style={{ minHeight: 40, justifyContent: 'center' }}
        >
          <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>체크인을 남기면 여기서 골라요 · 체크인하기 ›</Text>
        </Pressable>
      )}
      {data.unloggedVelocity ? (
        <Text style={{ color: c.muted, fontSize: 13 }}>
          구속 측정 {data.unloggedVelocity}구가 아직 투구 기록에 없어요. 남겨야 팔 부하에 들어가요.
        </Text>
      ) : null}
      <Pressable accessibilityRole="button" onPress={button.go} style={[styles.primary, { backgroundColor: c.sky }]}>
        <Text style={styles.primaryText}>{button.label}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, padding: 16, gap: 8 },
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  badge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 36, paddingHorizontal: 12, borderRadius: 18, justifyContent: 'center' },
  primary: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
