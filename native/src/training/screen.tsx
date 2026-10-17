import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
  type ScrollViewInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { leave } from '~/mechanics/parts';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { usePalette, type Palette } from '~/lib/ui';

/**
 * 암케어 · 메커니즘 전체 화면(native/src/app/training-armcare.tsx · training-mechanics.tsx)의 같은 틀 — 머리(‹ · 제목) · 두 칸 고르개 ·
 * 받기(받아 둔 값 먼저 · 당겨서 새로고침 · 따라 하기에서 돌아오면 다시) · 불러오는 중 · 못 불러옴.
 */

type Loaded<T> = ({ ok: true } & T) | { ok: false; to: string };

/**
 * 앱을 켠 동안 받은 값 — 칸을 오가도 바로 그린다(폰 저장소보다 먼저). 로그인 세대(cacheEpoch)를 같이 적어, 로그아웃 뒤 다른 사람이
 * 로그인하면 앞사람 값을 그리지 않는다.
 */
const memory = new Map<string, { epoch: number; value: unknown }>();
const recall = (key: string) => {
  const m = memory.get(key);
  return m && m.epoch === cacheEpoch() ? m.value : null;
};

/**
 * 서버 값 받기 — key 마다 받아 둔 값을 먼저 그리고 새로 받는다. 첫 설정 · 로그인이 필요하면(to) 화면을 닫고 웹을 그리로.
 * fresh: 이 화면을 연 뒤 서버에서 한 번 받았나 — 받아 둔 값(어제 것일 수 있다)으로는 체크 · 만들기를 막는다.
 */
export function useScreenData<T>(action: string, arg: string, key: string) {
  const [data, setData] = useState<T | null>(() => recall(key) as T | null);
  const [fresh, setFresh] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const shown = useRef(key);

  const load = useCallback(() => {
    const e = cacheEpoch();
    return rpc<Loaded<T>>(action, arg).then(
      (r) => {
        if (e !== cacheEpoch() || shown.current !== key) return;
        if (!r.ok) return leave(r.to);
        memory.set(key, { epoch: e, value: r });
        void cacheSet(key, r);
        setData(r);
        setFresh(true);
        setFailed(null);
      },
      (err: unknown) => {
        if (shown.current !== key) return;
        if (err instanceof RpcError && err.code === 'redirect') return leave(err.to ?? '/login');
        setFailed(err instanceof RpcError && err.code === 'update' ? '앱을 업데이트해 주세요.' : '신호가 약해 불러오지 못했어요.');
      }
    );
  }, [action, arg, key]);

  /* 칸을 바꾸면 그 칸의 받아 둔 값부터(그리는 중에 맞춘다) */
  const [seen, setSeen] = useState(key);
  if (seen !== key) {
    setSeen(key);
    setData(recall(key) as T | null);
    setFresh(false);
    setFailed(null);
  }
  useEffect(() => {
    shown.current = key;
    let alive = true;
    if (recall(key) == null)
      void cacheGet(key).then((v) => {
        if (alive && v && recall(key) == null) setData(v as T);
      });
    void load();
    return () => {
      alive = false;
    };
  }, [key, load]);

  /* 따라 하기 · 체크인(앱 화면)에서 돌아오면 다시 받는다 — 체크 · 진행이 바로 바뀌게 */
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (focused.current) void load();
      focused.current = true;
    }, [load])
  );

  const refresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };
  return { data, fresh, failed, refreshing, load, refresh };
}

/** 머리 · 고르개 · 몸통(당겨서 새로고침) — 받기 전이면 돌개, 못 받았으면 '다시 불러오기' */
export function Screen<K extends string>({
  title,
  tabs,
  tab,
  onTab,
  state,
  scrollRef,
  children,
}: {
  title: string;
  tabs: readonly { value: K; label: string }[];
  tab: K;
  onTab: (t: K) => void;
  state: { data: unknown; failed: string | null; refreshing: boolean; load: () => void; refresh: () => void };
  scrollRef?: RefObject<ScrollViewInstance | null>;
  children: ReactNode;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      <View style={[s.header, { paddingTop: inset.top + 4, backgroundColor: c.page, borderBottomColor: c.line }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="트레이닝으로" style={s.iconBtn}>
          <SymbolView name="chevron.left" size={20} weight="semibold" tintColor={c.sky} />
        </Pressable>
        <Text accessibilityRole="header" numberOfLines={1} style={[s.headTitle, { color: c.ink }]}>
          {title}
        </Text>
        <View style={s.iconBtn} />
      </View>
      <ScrollView
        ref={scrollRef}
        style={s.fill}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(24, inset.bottom + 16) }]}
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />}
      >
        <View accessibilityRole="tablist" style={[s.segment, { backgroundColor: c.chip }]}>
          {tabs.map((t) => {
            const on = t.value === tab;
            return (
              <Pressable
                key={t.value}
                onPress={() => {
                  if (on) return;
                  void Haptics.selectionAsync();
                  onTab(t.value);
                }}
                accessibilityRole="tab"
                accessibilityState={{ selected: on }}
                style={[s.segItem, on && { backgroundColor: c.card }]}
              >
                <Text style={[s.bodyBold, { color: c.ink, fontWeight: on ? '700' : '500' }]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>
        {state.failed ? (
          <View style={[s.notice, { backgroundColor: c.danger + '14' }]}>
            <Text style={[s.small, { color: c.danger, flex: 1 }]}>{state.failed}</Text>
            <Pressable onPress={state.load} accessibilityRole="button" style={s.textBtn}>
              <Text style={[s.smallBold, { color: c.sky }]}>다시 불러오기</Text>
            </Pressable>
          </View>
        ) : null}
        {state.data ? children : state.failed ? null : <ActivityIndicator style={{ paddingVertical: 32 }} />}
      </ScrollView>
    </View>
  );
}

/**
 * 펼친 카드로 내려가기 — 칸(root)의 자리 + 카드의 자리. 카드는 칸 바로 밑에 둔다(자리를 한 번만 더하게).
 * jump 는 지금 자리로 곧 내려가고, 펼쳐져 자리가 바뀌면(위 카드가 접힘) 그 카드가 다시 그려질 때 한 번 더 맞춘다.
 * initial — 처음 열 때 내려갈 카드(주소의 ?el=).
 */
export function useJump(scroll: RefObject<ScrollViewInstance | null>, initial: string | null = null) {
  const root = useRef(0);
  const ys = useRef(new Map<string, number>());
  const pending = useRef<string | null>(initial);
  /* 내려간 뒤 잠깐만 따라간다 — 그 뒤 카드 안을 펼쳐 자리가 바뀌어도 다시 끌려가지 않게 */
  const go = (key: string) => {
    const y = ys.current.get(key);
    if (y == null) return;
    scroll.current?.scrollTo({ y: Math.max(0, root.current + y - 8), animated: true });
    setTimeout(() => {
      if (pending.current === key) pending.current = null;
    }, 400);
  };
  return {
    onRoot: (e: LayoutChangeEvent) => {
      root.current = e.nativeEvent.layout.y;
      if (pending.current) go(pending.current);
    },
    onItem: (key: string) => (e: LayoutChangeEvent) => {
      ys.current.set(key, e.nativeEvent.layout.y);
      if (pending.current === key) go(key);
    },
    jump: (key: string) => {
      pending.current = key;
      go(key);
    },
  };
}

/** 웹으로 가는 줄 — 앱에 아직 없는 것(만들기 · 시험 · 3D 지도 등). 누르면 화면을 닫고 웹이 그 주소로 */
export function WebRow({ label, href, c }: { label: string; href: string; c: Palette }) {
  return (
    <Pressable onPress={() => leave(href)} accessibilityRole="link" style={[s.webRow, { backgroundColor: c.card }]}>
      <Text style={[s.body, { color: c.ink, flex: 1 }]}>{label}</Text>
      <SymbolView name="arrow.up.right" size={13} weight="semibold" tintColor={c.muted} />
    </Pressable>
  );
}

/** 칸 머리 — 큰 제목 · 한 줄 설명 */
export function SectionHead({ title, desc, c }: { title: string; desc?: string; c: Palette }) {
  return (
    <View style={{ gap: 2, paddingHorizontal: 4 }}>
      <Text accessibilityRole="header" style={[s.section, { color: c.ink }]}>
        {title}
      </Text>
      {desc ? <Text style={[s.small, { color: c.muted }]}>{desc}</Text> : null}
    </View>
  );
}

/** 누르면 펼치는 머리 한 줄 — '자세히' · '안내 N개' */
export function Fold({ label, children, c }: { label: string; children: ReactNode; c: Palette }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={s.fold}
      >
        <Text style={[s.smallBold, { color: c.muted }]}>{label}</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={11} tintColor={c.muted} />
      </Pressable>
      {open ? <View style={{ gap: 6, paddingBottom: 4 }}>{children}</View> : null}
    </View>
  );
}

export const s = StyleSheet.create({
  fill: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4, paddingBottom: 6, borderBottomWidth: StyleSheet.hairlineWidth },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headTitle: { flex: 1, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  content: { paddingHorizontal: 16, paddingTop: 12, gap: 16 },
  segment: { flexDirection: 'row', borderRadius: 18, padding: 2 },
  segItem: { flex: 1, minHeight: 36, borderRadius: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12 },
  notice: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 12, paddingLeft: 14, paddingRight: 4 },
  webRow: { minHeight: 48, borderRadius: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  section: { fontSize: 20, fontWeight: '700' },
  card: { borderRadius: 20, padding: 16, gap: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  between: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  fold: { minHeight: 36, flexDirection: 'row', alignItems: 'center', gap: 4 },
  pill: { minHeight: 48, borderRadius: 24, paddingHorizontal: 22, flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center' },
  smallPill: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center' },
  chip: { minHeight: 40, borderRadius: 20, paddingHorizontal: 14, justifyContent: 'center' },
  tag: { borderRadius: 12, paddingHorizontal: 10, paddingVertical: 3, overflow: 'hidden' },
  box: { borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, overflow: 'hidden' },
  textBtn: { minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', lineHeight: 26 },
  tiny: { fontSize: 12, lineHeight: 16 },
  small: { fontSize: 13, lineHeight: 18 },
  smallBold: { fontSize: 13, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 21 },
  center: { textAlign: 'center' },
});
