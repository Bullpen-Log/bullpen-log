import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Animated, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatSeconds } from '@/lib/exercise-meta';
import { formatWeight, type WeightUnit } from '@/lib/units';
import { formatSummary, volumeIn } from '@/lib/workout/summarize';
import { EFFORT_LEVELS, effortOf, type EffortKey } from '@/lib/workout/effort';
import type { NewRecord } from '@/lib/workout/bests';
import type { WorkoutDone } from '@/lib/workout/done-load';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, type Palette } from '~/lib/ui';
import { useWeightUnit } from '~/lib/weight-unit';
import { leaveTo } from '~/shell/web-nav';
import { s } from '~/training/screen';
import { READABLE } from '~/lib/layout';

/**
 * 운동 끝 — 축하 화면(앱 화면). 웹 app/(session)/workout/done/done-client.tsx 를 옮겼다. 운동 화면에서 [운동 마치기]가 되면 이리 온다
 * (서버가 /workout/done?id= 로 보낸 것을 앱이 받아서). 재료는 웹과 같은 곳(app-workout.loadAppWorkoutDone → lib/workout/done-load.ts).
 *
 * 웹과 같은 차례: 체크가 톡 뜨며 손에 떨림 → 세 숫자(운동 시간 · 세트 · 볼륨) → 프로그램 날이면 일차 · 추천 → 실제 → 새 최고 기록 → 한 운동.
 * 아래에 운동 뒤 단백질 한 줄 · 힘듦 칩 넷(그날 강도를 이미 남겼으면 안 묻는다, workout.rateWorkoutEffort) · [완료](트레이닝으로).
 */
type Loaded = ({ ok: true } & WorkoutDone) | { ok: false; to: string };

function recordText(kind: NewRecord['kind'], value: number, unit: WeightUnit) {
  if (kind === 'weight') return formatWeight(value, unit) ?? `${value}kg`;
  if (kind === 'reps') return `${value}회`;
  return formatSeconds(value);
}

export default function WorkoutDoneScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const unit = useWeightUnit();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<Extract<Loaded, { ok: true }> | null>(null);
  const [failed, setFailed] = useState(false);
  const [tries, setTries] = useState(0);
  const [pop] = useState(() => new Animated.Value(0));

  useEffect(() => {
    let alive = true;
    rpc<Loaded>('app-workout.loadAppWorkoutDone', id ?? '').then(
      (r) => {
        if (!alive) return;
        if (r.ok) setData(r);
        else leaveTo(r.to);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return leaveTo(e.to ?? '/login');
        setFailed(true);
      }
    );
    return () => {
      alive = false;
    };
  }, [id, tries]);

  /* 체크가 톡 뜨는 순간에 손에도 — 축하는 손으로도(웹과 같다) */
  useEffect(() => {
    if (!data) return;
    Animated.spring(pop, { toValue: 1, friction: 5, tension: 120, useNativeDriver: true }).start();
    const t = setTimeout(() => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success), 250);
    return () => clearTimeout(t);
  }, [data, pop]);

  const finish = () => leaveTo('/training');

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page, paddingTop: inset.top + 60, alignItems: 'center', gap: 16 }}>
        {failed ? (
          <>
            <Text style={{ color: c.ink, fontSize: 15 }}>신호가 약해 불러오지 못했어요.</Text>
            <Pressable accessibilityRole="button" onPress={() => (setFailed(false), setTries((n) => n + 1))} hitSlop={8}>
              <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>다시 불러오기</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={finish} hitSlop={8}>
              <Text style={{ color: c.muted, fontSize: 15 }}>트레이닝으로</Text>
            </Pressable>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  const records = data.rows.filter((r) => r.record);
  const numbers = [
    { label: '운동 시간', value: String(data.minutes), unit: '분' },
    { label: '세트', value: String(data.setCount), unit: '세트' },
    { label: '볼륨', value: data.volumeKg > 0 ? Math.round(volumeIn(data.volumeKg, unit)).toLocaleString('ko-KR') : '—', unit: data.volumeKg > 0 ? unit : '' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <ScrollView contentContainerStyle={[{ paddingHorizontal: 20, paddingTop: inset.top + 40, paddingBottom: 24, gap: 24 }, READABLE]}>
        <View style={{ alignItems: 'center', gap: 6 }}>
          <Animated.View
            style={[st.check, { backgroundColor: c.sky, transform: [{ scale: pop.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }], opacity: pop }]}
          >
            <SymbolView name="checkmark" size={40} weight="bold" tintColor="#fff" />
          </Animated.View>
          <Text style={{ color: c.ink, fontSize: 30, fontWeight: '700', marginTop: 14 }}>운동 끝!</Text>
          <Text style={[s.small, { color: c.muted }]}>
            {data.themeLabel} · {data.dateLabel}
          </Text>
        </View>

        <View style={[st.numbers, { backgroundColor: c.card }]}>
          {numbers.map((n, i) => (
            <View key={n.label} style={[st.number, i > 0 && { borderLeftWidth: StyleSheet.hairlineWidth, borderLeftColor: c.line }]}>
              <Text style={[s.tiny, { color: c.muted }]}>{n.label}</Text>
              <Text style={{ color: c.ink, fontSize: 24, fontWeight: '700', fontVariant: ['tabular-nums'] }}>
                {n.value}
                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '500' }}> {n.unit}</Text>
              </Text>
            </View>
          ))}
        </View>

        {data.program ? (
          <Section title="근력 · 파워 프로그램" c={c}>
            <View style={{ padding: 16, gap: 8 }}>
              <Text style={[s.bodyBold, { color: c.ink }]}>{data.program.headline}</Text>
              {data.program.lifts.map((l) => (
                <View key={l.title} style={[s.between, { alignItems: 'center' }]}>
                  <Text numberOfLines={1} style={[s.small, { color: c.ink, flex: 1 }]}>
                    {l.title}
                  </Text>
                  <Text style={[s.small, { color: c.muted }]}>
                    추천 {l.suggested} → 실제 {l.actual}
                    {l.rir != null ? ` · 여유 ${l.rir >= 4 ? '4+' : l.rir}` : ''}
                  </Text>
                </View>
              ))}
              {data.program.note ? <Text style={[s.tiny, { color: c.muted }]}>{data.program.note}</Text> : null}
            </View>
          </Section>
        ) : null}

        {records.length > 0 ? (
          <Section title={`새 최고 기록 ${records.length}개`} c={c}>
            {records.map(({ id: rid, title, record }, i) =>
              record ? (
                <View key={rid} style={[st.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
                  <View style={[st.trophy, { backgroundColor: c.sky }]}>
                    <SymbolView name="trophy.fill" size={15} tintColor="#fff" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[s.bodyBold, { color: c.ink }]}>
                      {title}
                    </Text>
                    {record.before != null ? <Text style={[s.tiny, { color: c.muted }]}>지난 최고 {recordText(record.kind, record.before, unit)}</Text> : null}
                  </View>
                  <Text style={{ color: c.sky, fontSize: 17, fontWeight: '700' }}>{recordText(record.kind, record.value, unit)}</Text>
                </View>
              ) : null
            )}
          </Section>
        ) : null}

        <Section title="오늘 한 운동" c={c}>
          {data.rows.map((r, i) => (
            <View key={r.id} style={[st.line, i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
              <Text numberOfLines={1} style={[s.body, { color: c.ink, flex: 1 }]}>
                {r.title}
              </Text>
              <Text style={[s.small, { color: c.muted }]}>{formatSummary(r.summary, unit)}</Text>
            </View>
          ))}
        </Section>
      </ScrollView>

      <View style={{ paddingHorizontal: 20, paddingTop: 12, paddingBottom: Math.max(16, inset.bottom), gap: 12 }}>
        {data.nutritionLine ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => leaveTo(data.nutritionLine!.href)}
            style={({ pressed }) => [st.nudge, { backgroundColor: pressed ? c.chip : c.card }]}
          >
            <SymbolView name="fork.knife" size={15} tintColor={c.sky} style={{ marginTop: 2 }} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.tiny, { color: c.muted }]}>{data.nutritionLine.title}</Text>
              <Text style={[s.smallBold, { color: c.ink }]}>{data.nutritionLine.text}</Text>
              {data.nutritionLine.example ? <Text style={[s.tiny, { color: c.muted }]}>{data.nutritionLine.example}</Text> : null}
            </View>
            <Text style={[s.smallBold, { color: c.sky }]}>자세히 ›</Text>
          </Pressable>
        ) : null}
        {data.askEffort ? <Effort sessionId={data.askEffort.sessionId} c={c} /> : null}
        <Pressable
          accessibilityRole="button"
          onPress={finish}
          style={({ pressed }) => [st.done, { backgroundColor: c.sky, opacity: pressed ? 0.85 : 1 }]}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>완료</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Section({ title, children, c }: { title: string; children: React.ReactNode; c: Palette }) {
  return (
    <View style={{ gap: 8 }}>
      <Text style={[s.smallBold, { color: c.muted, paddingHorizontal: 4 }]}>{title}</Text>
      <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' }}>{children}</View>
    </View>
  );
}

/** 오늘 힘듦 칩 넷 — 한 번 누르면 저장(웹 effort-card.tsx 와 같은 동작). 건너뛰기는 서버에 안 간다 */
function Effort({ sessionId, c }: { sessionId: string; c: Palette }) {
  const [picked, setPicked] = useState<EffortKey | null>(null);
  const [saved, setSaved] = useState<EffortKey | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (skipped) return null;
  const pick = async (key: EffortKey) => {
    if (saved || busy) return;
    void Haptics.selectionAsync();
    setPicked(key);
    setBusy(true);
    setError(null);
    try {
      const r = await rpc<{ ok: true; intensity: number } | { error: string }>('workout.rateWorkoutEffort', { sessionId, effort: key });
      if ('error' in r) {
        setError(r.error);
        setPicked(null);
      } else {
        setSaved(effortOf(r.intensity));
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
    } catch {
      setError('신호가 약해 남기지 못했어요. 다시 눌러 주세요.');
      setPicked(null);
    } finally {
      setBusy(false);
    }
  };
  const current = saved ?? picked;
  const level = saved ? EFFORT_LEVELS.find((l) => l.key === saved) : null;
  return (
    <View style={[st.effort, { backgroundColor: c.card }]}>
      <View style={[s.between, { alignItems: 'center' }]}>
        <Text style={[s.bodyBold, { color: c.ink }]}>{saved ? '오늘 힘듦을 남겼어요' : '오늘 얼마나 힘들었나요?'}</Text>
        {saved ? (
          <Text style={[s.smallBold, { color: c.sky }]}>✓ {level?.intensity}/10</Text>
        ) : (
          <Pressable accessibilityRole="button" onPress={() => setSkipped(true)} disabled={busy} hitSlop={8}>
            <Text style={[s.small, { color: c.muted }]}>건너뛰기</Text>
          </Pressable>
        )}
      </View>
      <Text style={[s.tiny, { color: c.muted }]}>{saved ? '트레이닝 탭에서 고칠 수 있어요.' : '한 번만 눌러 주세요. 운동 전체를 합친 느낌이에요.'}</Text>
      <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 6 }}>
        {EFFORT_LEVELS.map((l) => {
          const on = current === l.key;
          return (
            <Pressable
              key={l.key}
              accessibilityRole="radio"
              accessibilityState={{ selected: on, disabled: busy || saved != null }}
              accessibilityHint={l.hint}
              onPress={() => void pick(l.key)}
              style={[st.chip, { backgroundColor: on ? c.sky : c.chip, opacity: saved && !on ? 0.45 : 1 }]}
            >
              <Text style={{ color: on ? '#fff' : c.ink, fontSize: 14, fontWeight: '600' }}>{l.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={[s.tiny, { color: c.danger }]}>{error}</Text> : null}
    </View>
  );
}

const st = StyleSheet.create({
  check: { width: 84, height: 84, borderRadius: 42, alignItems: 'center', justifyContent: 'center' },
  numbers: { flexDirection: 'row', borderRadius: 16, paddingVertical: 16 },
  number: { flex: 1, alignItems: 'center', gap: 6 },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  trophy: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },
  nudge: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12 },
  effort: { borderRadius: 16, padding: 14, gap: 8 },
  chip: { flex: 1, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  done: { height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
});
