import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WarmupCard } from '@/app/(session)/workout/warmup/warmup-client';
import { BullpenNative } from '../../modules/bullpen-native';
import { ExerciseMedia } from '~/armcare/parts';
import { Bar } from '~/community/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { s } from '~/training/screen';

/**
 * 워밍업 창(앱 화면) — 웹 app/(session)/workout/warmup/warmup-client.tsx 를 옮겼다. [운동 시작]과 본운동 사이에 한 번 지난다. 사이트의
 * /workout/warmup 이 앱(BullpenNative/7 부터)이면 이 화면을 띄우고(page.tsx → OpenNative), 재료는 웹과 같은 곳(app-workout.loadAppWarmup →
 * lib/workout/warmup-load.ts).
 *
 * 웹과 같은 규칙: 공통 루틴 뒤에 그날 루틴, 운동마다 체크(서버엔 마칠 때 한 번에 — 워밍업은 부하 계산에 안 들어간다), 줄을 누르면 영상 ·
 * 설명. [본운동 시작] · [워밍업 건너뛰기]는 같은 workout.finishWarmup — 서버가 본운동 시각을 찍고 운동 화면으로 보낸다(앱은 /workout).
 * 바닥에서 몸을 푸는 동안 화면이 꺼지지 않게 켜 둔다.
 */
type Loaded = { ok: true; themeLabel: string; cards: WarmupCard[] } | { ok: false; to: string };

/** 서버가 보낸 곳으로 — 운동 화면이면 앱 화면(이 화면을 바꿔서), 아니면 웹 */
function go(to: string) {
  if (to.startsWith('/workout/run')) router.replace('/workout' as Href);
  else leaveTo(to);
}

export default function WarmupScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [data, setData] = useState<Extract<Loaded, { ok: true }> | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    rpc<Loaded>('app-workout.loadAppWarmup').then(
      (r) => {
        if (!alive) return;
        if (r.ok) setData(r);
        else go(r.to);
      },
      (e: unknown) => {
        if (!alive) return;
        if (e instanceof RpcError && e.code === 'redirect') return go(e.to ?? '/login');
        setFailed('신호가 약해 불러오지 못했어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [tries]);

  useEffect(() => {
    void BullpenNative.keepAwake(true).catch(() => undefined);
    return () => void BullpenNative.keepAwake(false).catch(() => undefined);
  }, []);

  const finish = async (skipped: boolean) => {
    if (saving) return;
    setSaving(true);
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const r = await rpc<{ error: string } | null>('workout.finishWarmup', { skipped, doneIds: [...done] });
      /* 성공하면 서버가 운동 화면으로 보낸다 — 답이 그냥 오면 실패한 것 */
      setError(r && 'error' in r ? r.error : '넘어가지 못했어요. 다시 눌러 주세요.');
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return go(e.to ?? '/workout/run');
      setError('신호가 약해 넘어가지 못했어요. 신호가 잡히면 다시 눌러 주세요.');
    } finally {
      setSaving(false);
    }
  };

  const toggle = (id: string) => {
    void Haptics.selectionAsync();
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <Bar back="트레이닝" title="워밍업" c={c} />
        {failed ? (
          <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
            <Text style={{ color: c.ink, fontSize: 15 }}>{failed}</Text>
            <Pressable accessibilityRole="button" onPress={() => (setFailed(null), setTries((n) => n + 1))} hitSlop={8}>
              <Text style={{ color: c.sky, fontSize: 15, fontWeight: '700' }}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} />
        )}
      </View>
    );
  }

  const total = data.cards.reduce((n, card) => n + card.items.length, 0);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="트레이닝" title="워밍업" c={c} />
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: 24 }}>
        <View style={{ gap: 4 }}>
          <Text style={[s.small, { color: c.muted }]}>{data.themeLabel}</Text>
          <Text style={[s.body, { color: c.muted }]}>
            본운동 전에 몸을 풀어요. 운동 시간은 여기를 지난 뒤부터 재요.
            {total > 0 ? <Text style={{ color: c.sky, fontWeight: '700' }}>{`  ${done.size}/${total}`}</Text> : null}
          </Text>
        </View>
        {total === 0 ? (
          <Text style={[s.small, s.center, { color: c.muted, backgroundColor: c.card, borderRadius: 16, padding: 24, overflow: 'hidden' }]}>
            아직 루틴에 담긴 운동이 없어요. 영상이 올라오면 여기에 나와요.
          </Text>
        ) : null}
        {data.cards.map((card) => (
          <View key={card.id} style={{ gap: 8 }}>
            <View style={{ gap: 2 }}>
              <View style={[s.row, { gap: 8 }]}>
                <Text style={[s.section, { color: c.ink }]}>{card.name}</Text>
                {card.forToday ? <Text style={[s.tag, { color: c.sky, backgroundColor: c.sky + '1a', fontSize: 12, fontWeight: '700' }]}>오늘</Text> : null}
              </View>
              {card.description ? <Text style={[s.small, { color: c.muted }]}>{card.description}</Text> : null}
            </View>
            <View style={{ backgroundColor: c.card, borderRadius: 16, overflow: 'hidden' }}>
              {card.items.map((ex, i) => {
                const on = done.has(ex.id);
                const showing = open === ex.id;
                const hasMore = Boolean(ex.videoPath || ex.referenceVideoId || ex.description);
                return (
                  <View key={ex.id} style={i > 0 ? { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line } : null}>
                    <View style={st.row}>
                      <Pressable
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: on }}
                        accessibilityLabel={`${ex.title} 했어요`}
                        onPress={() => toggle(ex.id)}
                        hitSlop={8}
                        style={[st.check, { borderColor: on ? c.sky : c.line, backgroundColor: on ? c.sky : 'transparent' }]}
                      >
                        {on ? <SymbolView name="checkmark" size={13} weight="bold" tintColor="#fff" /> : null}
                      </Pressable>
                      <Pressable
                        accessibilityRole={hasMore ? 'button' : 'text'}
                        accessibilityState={hasMore ? { expanded: showing } : undefined}
                        disabled={!hasMore}
                        onPress={() => setOpen(showing ? null : ex.id)}
                        style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 }}
                      >
                        <View style={{ flex: 1, gap: 2 }}>
                          <Text style={[s.bodyBold, { color: on ? c.muted : c.ink, textDecorationLine: on ? 'line-through' : 'none' }]}>{ex.title}</Text>
                          {ex.note ? <Text style={[s.small, { color: c.muted }]}>{ex.note}</Text> : null}
                        </View>
                        {hasMore ? <SymbolView name={showing ? 'chevron.up' : 'info.circle'} size={16} tintColor={c.muted} /> : null}
                      </Pressable>
                    </View>
                    {showing ? (
                      <View style={{ gap: 12, paddingHorizontal: 14, paddingBottom: 14 }}>
                        <ExerciseMedia key={ex.id} path={ex.videoPath} referenceVideoId={ex.referenceVideoId} thumbUrl={ex.thumbUrl} aspectRatio={ex.aspectRatio} />
                        {ex.description ? (
                          <Text selectable style={[s.body, { color: c.ink }]}>
                            {ex.description}
                          </Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          </View>
        ))}
      </ScrollView>
      <View style={[st.foot, { backgroundColor: c.card, borderTopColor: c.sky, paddingBottom: Math.max(12, inset.bottom) }]}>
        {error ? <Text style={[s.small, s.center, { color: c.warn, backgroundColor: c.warnBg, borderRadius: 10, padding: 8, overflow: 'hidden' }]}>{error}</Text> : null}
        <Pressable
          accessibilityRole="button"
          onPress={() => void finish(false)}
          disabled={saving}
          style={({ pressed }) => [st.main, { backgroundColor: c.sky, opacity: saving ? 0.6 : pressed ? 0.85 : 1 }]}
        >
          <Text style={{ color: '#fff', fontSize: 18, fontWeight: '700' }}>{saving ? '여는 중' : '본운동 시작 ›'}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => void finish(true)} disabled={saving} style={[s.textBtn, { alignSelf: 'center' }]}>
          <Text style={{ color: c.muted, fontSize: 14, fontWeight: '600' }}>워밍업 건너뛰기</Text>
        </Pressable>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  foot: { borderTopWidth: 2, paddingHorizontal: 12, paddingTop: 12, gap: 4 },
  main: { height: 64, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
});
