import { SymbolView, type SFSymbol } from 'expo-symbols';
import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { CardAction, TrainingCard } from '@/lib/report/training-home-data';
import { TRAINING_PART_HREF, type TrainingPart } from '@/lib/training-part';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheGet, cacheSet } from '~/lib/store';
import { usePalette } from '~/lib/ui';

/**
 * 트레이닝 탭 첫 화면(앱 화면) — 웹 트레이닝 홈(app/(app)/training/training-home.tsx)과 같은 앱 카드 셋(오늘 운동 · 암케어 · 메커니즘,
 * 판정은 lib/report/training-home-data.ts — app.loadAppTraining). [시작]은 운동 판을 열어 앱 운동 화면(/workout)으로, 암케어 · 메커니즘
 * 따라 하기와 각 앱의 전체 화면(카드를 누름)은 아직 웹(onWeb).
 */
type Loaded = { today: string; cards: TrainingCard[] };
let cached: Loaded | null = null;
export const resetTrainingCache = () => {
  cached = null;
};

const APP: Record<TrainingPart, { name: string; icon: SFSymbol }> = {
  today: { name: '오늘 운동', icon: 'dumbbell.fill' },
  armcare: { name: '암케어', icon: 'cross.case.fill' },
  mechanics: { name: '메커니즘', icon: 'target' },
};

export function TrainingTab({ today, bottom, onWeb }: { today: string; bottom: number; onWeb: (href: string) => void }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [data, setData] = useState<Loaded | null>(() => (cached?.today === today ? cached : null));
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [starting, setStarting] = useState(false);
  /* 껍데기가 그릴 때마다 새 onWeb 을 넘긴다 — 불러오기가 그것에 묶이면 그릴 때마다 다시 받았다 */
  const onWebRef = useRef(onWeb);
  useEffect(() => {
    onWebRef.current = onWeb;
  });

  const load = useCallback(
    () =>
      rpc<({ ok: true } & Loaded) | { ok: false; error: string; to?: string }>('app.loadAppTraining').then(
        (r) => {
          if (!r.ok) {
            if (r.to) onWebRef.current(r.to);
            return setError(r.error);
          }
          cached = r;
          void cacheSet('training', r);
          setData(r);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : '불러오지 못했어요.')
      ),
    []
  );
  useEffect(() => {
    let alive = true;
    if (!cached)
      void cacheGet('training').then((v) => {
        const d = v as Loaded | null;
        if (alive && d?.today === today && !cached) setData(d);
      });
    void load();
    return () => {
      alive = false;
    };
  }, [load, today]);

  /* [시작] — 운동 판을 연다. 서버는 판을 열고 운동 화면 · 워밍업 · 쉬는 날 화면으로 보낸다(redirect) — 운동 화면이면 앱 화면, 나머지는 웹 */
  const startWorkout = async (a: Extract<CardAction, { kind: 'workout' }>) => {
    if (starting) return;
    setStarting(true);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      await rpc(a.program ? 'program.startProgramWorkout' : 'workout.startWorkout');
      /* 보내는 곳 없이 끝나면(드묾) 트레이닝 화면을 다시 받는다 */
      void load();
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect' && e.to) {
        if (e.to.startsWith('/workout/run')) router.push('/workout' as Href);
        else onWeb(e.to);
      } else Alert.alert('운동을 열지 못했어요', e instanceof Error ? e.message : '신호가 약해요. 잠시 뒤 다시 눌러 주세요.');
    } finally {
      setStarting(false);
    }
  };
  const act = (a: CardAction) => {
    if (a.kind === 'workout') return void startWorkout(a);
    if (a.kind === 'checkin') return onWeb('/checkin');
    onWeb(a.href);
  };

  const pull = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.page }}
      contentContainerStyle={{ paddingTop: inset.top + 12, paddingBottom: bottom + 24, paddingHorizontal: 16, gap: 12 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={pull} />}
    >
      <View style={styles.head}>
        <Text style={[styles.title, { color: c.ink }]}>트레이닝</Text>
        <Pressable accessibilityRole="button" onPress={() => onWeb('/coach?view=training')} style={[styles.chip, { backgroundColor: c.chip }]}>
          <Text style={[styles.chipText, { color: c.ink }]}>분석</Text>
        </Pressable>
      </View>

      {error && !data ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
      {!data && !error ? <ActivityIndicator style={{ paddingVertical: 24 }} /> : null}

      {data?.cards.map((card) => (
        <Card key={card.app} card={card} busy={starting} onOpen={() => onWeb(TRAINING_PART_HREF[card.app])} onAction={act} onWeb={onWeb} />
      ))}
    </ScrollView>
  );
}

function Card({
  card,
  busy,
  onOpen,
  onAction,
  onWeb,
}: {
  card: TrainingCard;
  busy: boolean;
  onOpen: () => void;
  onAction: (a: CardAction) => void;
  onWeb: (href: string) => void;
}) {
  const c = usePalette();
  const a = APP[card.app];
  const toneColor = card.tone === 'warn' ? c.danger : card.tone === 'done' ? c.sky : c.muted;
  const label =
    card.action?.kind === 'workout' ? (card.action.resume ? '이어서' : '시작') : card.action ? card.action.label : null;
  return (
    <View style={[styles.card, { backgroundColor: c.card }]}>
      <Pressable accessibilityRole="button" accessibilityLabel={`${a.name}. ${card.status}`} onPress={onOpen} style={styles.row}>
        <View style={[styles.icon, { backgroundColor: c.sky }]}>
          <SymbolView name={a.icon} size={22} tintColor="#fff" />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={[styles.name, { color: c.ink }]}>{a.name}</Text>
          <Text style={{ color: toneColor, fontSize: 14 }}>
            {card.tone === 'done' ? '✓ ' : ''}
            {card.status}
          </Text>
        </View>
        {card.action && label ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy && card.action.kind === 'workout'}
            onPress={() => onAction(card.action!)}
            style={({ pressed }) => [styles.start, { backgroundColor: c.sky }, (pressed || (busy && card.action?.kind === 'workout')) && { opacity: 0.6 }]}
          >
            {card.action.kind !== 'checkin' ? <SymbolView name="play.fill" size={12} tintColor="#fff" /> : null}
            <Text style={styles.startText}>{label}</Text>
          </Pressable>
        ) : (
          <Text style={{ color: c.muted, fontSize: 20 }}>›</Text>
        )}
      </Pressable>
      {card.bars ? (
        <View style={styles.bars} accessibilityLabel={card.bars.label}>
          {Array.from({ length: card.bars.total }, (_, i) => (
            <View
              key={i}
              style={[styles.bar, { backgroundColor: i < card.bars!.index ? c.sky : i === card.bars!.index ? `${c.sky}59` : c.line }]}
            />
          ))}
        </View>
      ) : null}
      {card.gap ? (
        <Pressable accessibilityRole="button" onPress={() => onWeb(card.gap!.href)} style={styles.line}>
          <Text style={{ color: c.sky, fontSize: 13, fontWeight: '600' }}>{card.gap.text} ›</Text>
        </Pressable>
      ) : null}
      {card.throwNote ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => {
            const date = /\/pitch-log\/(\d{4}-\d{2}-\d{2})/.exec(card.throwNote!.href)?.[1];
            if (!date) return onWeb(card.throwNote!.href);
            router.push({
              pathname: '/pitch/edit' as Href as never,
              params: { date, drill: String(card.throwNote!.throws), pct: String(card.throwNote!.effortPct) },
            });
          }}
          style={[styles.note, { backgroundColor: c.page }]}
        >
          <Text style={{ flex: 1, color: c.ink, fontSize: 14 }}>
            드릴로 공 약 {card.throwNote.throws}회 던졌어요. 투구 기록에 남겨 주세요.
          </Text>
          <Text style={{ color: c.sky, fontSize: 14, fontWeight: '600' }}>남기기 ›</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 4 },
  title: { flex: 1, fontSize: 34, fontWeight: '700' },
  chip: { height: 36, borderRadius: 18, paddingHorizontal: 14, justifyContent: 'center' },
  chipText: { fontSize: 15, fontWeight: '600' },
  card: { borderRadius: 20, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  icon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  name: { fontSize: 17, fontWeight: '700' },
  start: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, borderRadius: 20, paddingHorizontal: 16 },
  startText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  bars: { flexDirection: 'row', gap: 2 },
  bar: { flex: 1, height: 6, borderRadius: 3 },
  line: { minHeight: 32, justifyContent: 'center' },
  note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, padding: 12 },
});
