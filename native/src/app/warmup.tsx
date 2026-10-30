import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { type Href, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { WarmupCard, WarmupItem } from '@/app/(session)/workout/warmup/warmup-client';
import { BullpenNative } from '../../modules/bullpen-native';
import { ExerciseMedia } from '~/armcare/parts';
import { Bar } from '~/community/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { usePalette, withAlpha, TYPE, type Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { outboxOwner } from '~/workout/outbox';
import { Sheet } from '~/workout/sheets';
import { READABLE } from '~/lib/layout';
import { Press } from '~/shell/press';
import { Icon } from '~/shell/icon';

/**
 * 워밍업(2026-10-30 확정 시안 06) — [운동 시작]과 본운동 사이에 한 번 지난다. 재료는 웹과 같은 곳(app-workout.loadAppWarmup → lib/workout/warmup-load.ts —
 * 공통 루틴 다음에 그날 본운동 계열로 고른 루틴, 개수 · 순서 · 수행량 글 그대로).
 *
 * 차례: 진행 카드(완료 n/N · 다음 동작) → 공통 워밍업(처음엔 펼침) → 오늘 맞춤 루틴(처음엔 접힘) → [본운동 시작] · 워밍업 건너뛰기.
 *   - 체크와 설명 · 영상은 따로 누른다. 영상을 봐도 체크되지 않는다. 체크했다고 접히거나 다음으로 넘어가지 않는다.
 *   - 모두 체크하지 않아도 시작 · 건너뛰기를 할 수 있다(체크한 것만 보낸다). 나가기는 건너뛰기가 아니다.
 *   - 수행량('10초 · 제자리', '10m 오가기' …)은 글 그대로 — 타이머로 바꾸지 않는다.
 *   - 같은 운동이 두 루틴에 있으면 진행 수는 줄마다 세고, 보낼 때는 운동 id 를 한 번만.
 *   - 체크 초안은 이 계정 · 이 판 · 판 날짜에 묶어 폰에 둔다(다시 와도 그대로, 어제 판 · 다른 계정 것은 안 섞인다).
 *   - [본운동 시작]은 서버가 본운동 시각을 찍은 뒤에만 운동 화면으로 바꾼다. 답을 못 받으면 판 상태부터 다시 본다(이미 시작했으면 이어 간다).
 */
type Loaded = { ok: true; themeLabel: string; cards: WarmupCard[]; sessionId?: string; dateKey?: string } | { ok: false; to: string };
type Data = Extract<Loaded, { ok: true }>;
type Phase = 'idle' | 'send' | 'unknown' | 'checking';

const PREFIX = 'bullpen-warmup-checks:';

/** 서버가 보낸 곳으로 — 운동 화면이면 앱 화면(이 화면을 바꿔서), 아니면 웹 */
function go(to: string) {
  if (to.startsWith('/workout/run')) router.replace('/workout' as Href);
  else leaveTo(to);
}

const rowKey = (card: WarmupCard, ex: WarmupItem) => `${card.id}:${ex.id}`;

export default function WarmupScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [tries, setTries] = useState(0);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [shut, setShut] = useState<ReadonlySet<string> | null>(null);
  const [detail, setDetail] = useState<{ card: WarmupCard; ex: WarmupItem } | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  const draftKey = data ? `${PREFIX}${outboxOwner() ?? 'anon'}:${data.sessionId ?? 'na'}:${data.dateKey ?? ''}` : null;

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
        setFailed('신호가 약해 워밍업을 불러오지 못했어요.');
      }
    );
    return () => {
      alive = false;
    };
  }, [tries]);

  /* 이 판의 체크 초안을 되살리고, 지난 판 · 다른 날의 초안은 걷는다 */
  useEffect(() => {
    if (!draftKey) return;
    let alive = true;
    void AsyncStorage.getAllKeys()
      .then((keys) => AsyncStorage.multiRemove(keys.filter((k) => k.startsWith(PREFIX) && k !== draftKey)))
      .catch(() => undefined);
    AsyncStorage.getItem(draftKey).then(
      (raw) => {
        if (!alive || !raw) return;
        const list = JSON.parse(raw) as unknown;
        if (Array.isArray(list)) setDone(new Set(list.filter((x): x is string => typeof x === 'string')));
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [draftKey]);

  useEffect(() => {
    void BullpenNative.keepAwake(true).catch(() => undefined);
    return () => void BullpenNative.keepAwake(false).catch(() => undefined);
  }, []);

  const toggle = (key: string) => {
    void Haptics.selectionAsync();
    setDone((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (draftKey) void AsyncStorage.setItem(draftKey, JSON.stringify([...next])).catch(() => undefined);
      return next;
    });
  };

  /** 답을 못 받았을 때 — 판을 다시 읽어 이미 본운동을 시작했으면 이어 간다. 아직이면 다시 누를 수 있게 */
  const check = async () => {
    setPhase('checking');
    try {
      const r = await rpc<Loaded>('app-workout.loadAppWarmup');
      if (!r.ok) {
        if (draftKey) void AsyncStorage.removeItem(draftKey).catch(() => undefined);
        return go(r.to);
      }
      setPhase('idle');
      setError('아직 본운동을 시작하지 않았어요. 다시 눌러 주세요.');
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') return go(e.to ?? '/login');
      setPhase('unknown');
    }
  };

  const finish = async (skipped: boolean) => {
    if (!data || phase !== 'idle') return;
    setPhase('send');
    setError(null);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    /* 줄마다 체크하되 보낼 때는 운동 id 를 한 번만 */
    const ids = [
      ...new Set(
        data.cards.flatMap((card) => card.items.filter((ex) => done.has(rowKey(card, ex))).map((ex) => ex.id))
      ),
    ];
    try {
      const r = await rpc<{ error: string } | null>('workout.finishWarmup', { skipped, doneIds: ids, sessionId: data.sessionId });
      /* 성공하면 서버가 운동 화면으로 보낸다 — 답이 그냥 오면 확정된 실패 */
      setPhase('idle');
      setError(r && 'error' in r ? r.error : '넘어가지 못했어요. 다시 눌러 주세요.');
    } catch (e) {
      if (e instanceof RpcError && e.code === 'redirect') {
        if (e.to?.startsWith('/workout/run') && draftKey) void AsyncStorage.removeItem(draftKey).catch(() => undefined);
        return go(e.to ?? '/workout/run');
      }
      setPhase('unknown');
      void check();
    }
  };

  if (!data) {
    return (
      <View style={{ flex: 1, backgroundColor: c.page }}>
        <Bar back="트레이닝" title="워밍업" c={c} />
        {failed ? (
          <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
            <Text style={[st.body, { color: c.ink }]}>{failed}</Text>
            <Press accessibilityRole="button" onPress={() => (setFailed(null), setTries((n) => n + 1))} style={st.textBtn}>
              <Text style={[st.bodyBold, { color: c.link }]}>다시 불러오기</Text>
            </Press>
          </View>
        ) : (
          <ActivityIndicator style={{ marginTop: 40 }} />
        )}
      </View>
    );
  }

  const rows = data.cards.flatMap((card) => card.items.map((ex) => ({ card, ex, key: rowKey(card, ex) })));
  const total = rows.length;
  const count = rows.filter((r) => done.has(r.key)).length;
  const next = rows.find((r) => !done.has(r.key)) ?? null;
  /* 처음엔 공통만 펼친다(맞춤 루틴은 접힘). 사람이 접고 펴면 그대로 — 체크로 바뀌지 않는다 */
  const isOpen = (card: WarmupCard) => (shut ? !shut.has(card.id) : !card.forToday);
  const toggleCard = (card: WarmupCard) =>
    setShut((prev) => {
      const base = prev ?? new Set(data.cards.filter((x) => x.forToday).map((x) => x.id));
      const nextSet = new Set(base);
      if (nextSet.has(card.id)) nextSet.delete(card.id);
      else nextSet.add(card.id);
      return nextSet;
    });
  const locked = phase !== 'idle';

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="트레이닝" title="워밍업" c={c} />
      <ScrollView contentContainerStyle={[{ padding: 16, gap: 14, paddingBottom: 24 }, READABLE]}>
        <View style={{ gap: 2 }}>
          <Text style={[st.small, { color: c.muted }]}>{data.themeLabel}</Text>
          <Text style={[st.title, { color: c.ink }]}>본운동 전에 몸을 풀어요</Text>
        </View>

        {total > 0 ? (
          <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]} accessible accessibilityLabel={`워밍업 ${total}개 중 ${count}개 완료${next ? `, 다음 ${next.ex.title}` : ''}`}>
            <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
              <Text style={[st.big, { color: c.ink }]}>{count}</Text>
              <Text style={[st.body, { color: c.muted }]}>/ {total} 완료</Text>
            </View>
            <View style={st.progress}>
              {data.cards.map((card) => {
                const n = card.items.length;
                const k = card.items.filter((ex) => done.has(rowKey(card, ex))).length;
                return (
                  <View key={card.id} style={[st.seg, { flex: Math.max(1, n), backgroundColor: withAlpha(c.ink, 0.08) }]}>
                    <View style={{ width: `${n ? (k / n) * 100 : 0}%`, height: '100%', backgroundColor: c.action, borderRadius: 3 }} />
                  </View>
                );
              })}
            </View>
            <Text style={[st.small, { color: c.muted }]} numberOfLines={2}>
              {next ? `다음 · ${next.ex.title}${next.ex.note ? ` · ${next.ex.note}` : ''}` : '모두 했어요. 본운동을 시작해요.'}
            </Text>
          </View>
        ) : (
          <View style={[st.card, { backgroundColor: c.card }]}>
            <Text style={[st.bodyBold, { color: c.ink }]}>오늘 준비된 워밍업 루틴이 없어요</Text>
            <Text style={[st.small, { color: c.muted }]}>가볍게 몸을 데운 뒤 본운동을 시작해요.</Text>
          </View>
        )}

        {data.cards.map((card) => {
          const open = isOpen(card);
          const k = card.items.filter((ex) => done.has(rowKey(card, ex))).length;
          return (
            <View key={card.id} style={[st.group, { backgroundColor: c.card, boxShadow: c.float }]}>
              <Press accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => toggleCard(card)} style={st.groupHead}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={[st.bodyBold, { color: c.ink }]}>{card.forToday ? '오늘 맞춤 루틴' : '공통 워밍업'}</Text>
                  <Text style={[st.small, { color: c.muted }]} numberOfLines={1}>
                    {card.name} · {k}/{card.items.length}
                  </Text>
                </View>
                <Icon name={open ? 'chevron-up' : 'chevron-down'} size={18} color={c.muted} />
              </Press>
              {open ? (
                <View>
                  {card.description ? <Text style={[st.small, { color: c.muted, paddingHorizontal: 14, paddingBottom: 6 }]}>{card.description}</Text> : null}
                  {card.items.map((ex, i) => (
                    <Row
                      key={rowKey(card, ex)}
                      ex={ex}
                      on={done.has(rowKey(card, ex))}
                      first={i === 0}
                      locked={locked}
                      onToggle={() => toggle(rowKey(card, ex))}
                      onOpen={() => setDetail({ card, ex })}
                      c={c}
                    />
                  ))}
                </View>
              ) : null}
            </View>
          );
        })}
      </ScrollView>

      <View style={[st.foot, { backgroundColor: c.page, borderTopColor: c.line, paddingBottom: Math.max(12, inset.bottom) }, READABLE]}>
        {error ? <Text style={[st.note, { color: c.warn, backgroundColor: c.warnBg }]}>{error}</Text> : null}
        {phase === 'unknown' || phase === 'checking' ? (
          <View style={[st.note, { backgroundColor: c.warnBg, gap: 4 }]}>
            <Text style={[st.small, { color: c.ink }]}>본운동이 시작됐는지 확인하고 있어요. 체크한 것은 그대로예요.</Text>
            <Press accessibilityRole="button" disabled={phase === 'checking'} onPress={() => void check()} style={st.textBtn}>
              {phase === 'checking' ? <ActivityIndicator /> : <Text style={[st.bodyBold, { color: c.link }]}>시작 여부 확인</Text>}
            </Press>
          </View>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ disabled: locked, busy: phase === 'send' }}
          onPress={() => void finish(false)}
          disabled={locked}
          style={({ pressed }) => [st.main, { backgroundColor: c.action, opacity: locked ? 0.6 : pressed ? 0.85 : 1 }]}
        >
          {phase === 'send' ? <ActivityIndicator color={c.onAction} /> : null}
          <Text style={{ color: c.onAction, fontSize: 18, fontWeight: '700' }}>{phase === 'send' ? '본운동으로 가는 중' : '본운동 시작'}</Text>
        </Pressable>
        <Press accessibilityRole="button" onPress={() => void finish(true)} disabled={locked} style={[st.textBtn, { alignSelf: 'center' }]}>
          <Text style={{ color: c.muted, fontSize: 15 }}>워밍업 건너뛰기</Text>
        </Press>
        <Text style={[st.small, { color: c.muted, textAlign: 'center' }]}>운동 시간은 본운동부터 재요.</Text>
      </View>

      {/* 설명 · 영상 — 누를 때 하나만 띄우고, 닫으면 멈춘다(창이 내려가며 재생기가 빠진다). 영상이 없거나 안 되어도 완료 표시는 따로 */}
      <Sheet fit open={detail != null} onClose={() => setDetail(null)} title={detail?.ex.title ?? ''} description={detail?.ex.note ?? undefined} c={c}>
        {detail ? (
          <View style={{ gap: 12 }}>
            {detail.ex.videoPath || detail.ex.referenceVideoId ? (
              <ExerciseMedia
                key={detail.ex.id}
                path={detail.ex.videoPath}
                referenceVideoId={detail.ex.referenceVideoId}
                thumbUrl={detail.ex.thumbUrl}
                aspectRatio={detail.ex.aspectRatio}
              />
            ) : (
              <Text style={[st.small, { color: c.muted, backgroundColor: c.chip, borderRadius: 12, padding: 12, overflow: 'hidden' }]}>시범 영상은 준비 중이에요.</Text>
            )}
            {detail.ex.description ? <Text style={[TYPE.reading, { color: c.ink }]}>{detail.ex.description}</Text> : null}
            <Press
              accessibilityRole="button"
              disabled={locked}
              onPress={() => toggle(rowKey(detail.card, detail.ex))}
              style={[st.mark, { backgroundColor: done.has(rowKey(detail.card, detail.ex)) ? c.chip : c.action }]}
            >
              <Text style={{ color: done.has(rowKey(detail.card, detail.ex)) ? c.ink : c.onAction, fontSize: 16, fontWeight: '700' }}>
                {done.has(rowKey(detail.card, detail.ex)) ? '완료 표시 지우기' : '완료로 표시'}
              </Text>
            </Press>
          </View>
        ) : null}
      </Sheet>
    </View>
  );
}

/** 한 줄 — 왼쪽 체크(44pt) · 가운데 이름 · 수행량(누르면 설명) · 오른쪽 영상 표시. 체크에만 작은 반응 */
function Row({
  ex,
  on,
  first,
  locked,
  onToggle,
  onOpen,
  c,
}: {
  ex: WarmupItem;
  on: boolean;
  first: boolean;
  locked: boolean;
  onToggle: () => void;
  onOpen: () => void;
  c: Palette;
}) {
  const reduced = useReducedMotion();
  const pop = useSharedValue(1);
  const style = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));
  const hasMedia = Boolean(ex.videoPath || ex.referenceVideoId);
  return (
    <View style={[st.row, !first && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line }]}>
      <Press
        accessibilityRole="checkbox"
        accessibilityState={{ checked: on, disabled: locked }}
        accessibilityLabel={`${ex.title} 했어요`}
        disabled={locked}
        onPress={() => {
          if (!reduced) pop.set(withSequence(withTiming(0.86, { duration: 90 }), withTiming(1, { duration: 140 })));
          onToggle();
        }}
        style={st.checkHit}
      >
        <Animated.View style={[st.check, { borderColor: on ? c.action : withAlpha(c.ink, 0.25), backgroundColor: on ? c.action : 'transparent' }, style]}>
          {on ? <Icon name="check" size={16} color={c.onAction} /> : null}
        </Animated.View>
      </Press>
      <Press accessibilityRole="button" accessibilityHint="설명 보기" onPress={onOpen} style={st.rowMain}>
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <Text style={[st.bodyBold, { color: c.ink }]}>{ex.title}</Text>
          {ex.note ? <Text style={[st.small, { color: c.muted }]}>{ex.note}</Text> : null}
        </View>
        <View style={[st.media, { backgroundColor: hasMedia ? withAlpha(c.action, 0.1) : 'transparent' }]}>
          <Icon name={hasMedia ? 'play' : 'info'} size={16} color={hasMedia ? c.link : c.muted} />
        </View>
      </Press>
    </View>
  );
}

const st = StyleSheet.create({
  title: { fontSize: 24, fontWeight: '700', letterSpacing: -0.4 },
  card: { borderRadius: 18, padding: 16, gap: 10 },
  big: { fontSize: 34, fontWeight: '700', fontVariant: ['tabular-nums'] },
  progress: { flexDirection: 'row', gap: 4, height: 6 },
  seg: { height: 6, borderRadius: 3, overflow: 'hidden' },
  group: { borderRadius: 18, overflow: 'hidden' },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingHorizontal: 14 },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 60 },
  checkHit: { width: 56, minHeight: 56, alignItems: 'center', justifyContent: 'center' },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingRight: 12, minHeight: 56 },
  media: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  foot: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 12, gap: 6, width: '100%', alignSelf: 'center' },
  main: { height: 60, borderRadius: 30, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  mark: { minHeight: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  note: { fontSize: 13, lineHeight: 18, borderRadius: 10, padding: 10, overflow: 'hidden' },
  textBtn: { minHeight: 44, justifyContent: 'center' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600' },
  small: { fontSize: 13, lineHeight: 18 },
});
