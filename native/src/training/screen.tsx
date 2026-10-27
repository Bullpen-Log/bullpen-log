import { SymbolView } from 'expo-symbols';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  ActivityIndicator,
  AppState,
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
import { ScrollLockScope } from '~/shell/scroll-lock';
import { rpc, RpcError } from '~/lib/rpc';
import { afterMotion, whenStill } from '~/shell/transition';
import { cacheEpoch, cacheGet, cacheSet } from '~/lib/store';
import { usePalette, type Palette } from '~/lib/ui';
import { READABLE } from '~/lib/layout';
import { Icon } from '~/shell/icon';
import { PageHead, Segmented } from '~/shell/heading';
import { Press } from '~/shell/press';

/**
 * 암케어 · 메카닉 전체 화면(native/src/app/training-armcare.tsx · training-mechanics.tsx)의 같은 틀 — 머리(‹ · 제목) · 두 칸 고르개 ·
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
  /*
   * 받기 차례 — 늦게 온 앞 요청의 답이 새 답을 덮지 않게(2026-10-26 2차). 같은 값을 읽는 화면 여럿 · 돌아옴 · 앱이 앞에 옴이 겹치면 한 번만 부르고
   * (lib/rpc — 저장 뒤에는 새로), 답은 화면이 움직이는 동안이면 끝난 뒤에 그린다(afterMotion).
   */
  const seq = useRef(0);

  const load = useCallback(() => {
    const e = cacheEpoch();
    const n = ++seq.current;
    return rpc<Loaded<T>>(action, arg).then(
      (r) => {
        if (e !== cacheEpoch() || shown.current !== key || n !== seq.current) return;
        if (!r.ok) return leave(r.to);
        memory.set(key, { epoch: e, value: r });
        void cacheSet(key, r);
        afterMotion(() => {
          if (n !== seq.current || shown.current !== key) return;
          setData(r);
          setFresh(true);
          setFailed(null);
        });
      },
      (err: unknown) => {
        if (shown.current !== key || n !== seq.current) return;
        if (err instanceof RpcError && err.code === 'redirect') return leave(err.to ?? '/login');
        setFailed(err instanceof RpcError && err.code === 'update' ? '앱을 업데이트해 주세요.' : '불러오지 못했어요.');
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

  /*
   * 앱이 다시 앞에 오면 다시 받는다(2026-10-18 김민) — 밤새 열어 둔 암케어 목록이 어제 날짜로 체크를 남겼다. 받는 동안은 fresh 를
   * 꺼 체크 · 만들기를 막는다(받아 둔 값이 어제 것일 수 있다).
   */
  /* 위에 다른 화면이 쌓여 가려진 동안은 받지 않고 '옛 값' 표시만 해 둔다 — 돌아오면 받는다(쌓인 화면들이 한꺼번에 받았다, 2026-10-26 2차) */
  const focusedNow = useRef(false);
  const staleWhileHidden = useRef(false);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (st) => {
      if (st !== 'active') return;
      if (!focusedNow.current) {
        staleWhileHidden.current = true;
        return;
      }
      setFresh(false);
      void load();
    });
    return () => sub.remove();
  }, [load]);

  /*
   * 따라 하기 · 체크인(앱 화면)에서 돌아오면 다시 받는다 — 체크 · 진행이 바로 바뀌게. 돌아오는 움직임(뒤로 쓸기)이 끝난 뒤에 부르고, 그 전에 다시
   * 가려지면 그만둔다.
   */
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focusedNow.current = true;
      if (!focused.current) {
        focused.current = true;
        return () => {
          focusedNow.current = false;
        };
      }
      if (staleWhileHidden.current) {
        staleWhileHidden.current = false;
        setFresh(false);
      }
      const stop = whenStill(() => void load());
      return () => {
        focusedNow.current = false;
        stop();
      };
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
  right,
  children,
}: {
  title: string;
  tabs: readonly { value: K; label: string }[];
  tab: K;
  onTab: (t: K) => void;
  state: { data: unknown; failed: string | null; refreshing: boolean; load: () => void; refresh: () => void };
  scrollRef?: RefObject<ScrollViewInstance | null>;
  /** 큰 제목 오른쪽 — 즐겨찾기 모음 같은 단추 */
  right?: ReactNode;
  children: ReactNode;
}) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  return (
    <View style={[s.fill, { backgroundColor: c.page }]}>
      {/* 웹 휴대폰 위 막대의 '‹ 트레이닝'(back-link) — 제목은 본문 큰 제목이 맡는다 */}
      <View style={[st.bar, { paddingTop: inset.top + 4, backgroundColor: c.page }]}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="트레이닝으로 돌아가기" style={({ pressed }) => [st.back, pressed && { opacity: 0.6 }]}>
          <Icon name="back" size={24} color={c.link} />
          <Text style={{ color: c.link, fontSize: 17 }}>트레이닝</Text>
        </Pressable>
      </View>
      {/* 부위별 보강의 3D 근육 그림을 돌리는 동안 화면이 같이 굴러가지 않게(shell/scroll-lock, 2026-10-20 김민) */}
      <ScrollLockScope>
        {(scrollEnabled) => (
      <ScrollView
        ref={scrollRef}
        scrollEnabled={scrollEnabled}
        style={s.fill}
        contentContainerStyle={[s.content, { paddingBottom: Math.max(24, inset.bottom + 16) }, READABLE]}
        refreshControl={<RefreshControl refreshing={state.refreshing} onRefresh={state.refresh} />}
      >
        {/* 큰 제목 — 오른쪽 '설정' 알약은 암케어에서도 뺐다(2026-10-20 김민). 오른쪽 자리는 부르는 쪽이 채운다(right) */}
        <PageHead title={title}>{right}</PageHead>
        {/* 웹 Segmented(흰 칸이 미끄러짐) — 다른 탭 고르개와 같은 부품 */}
        <Segmented label={title} size="md" value={tab} onChange={onTab} options={tabs} />
        {state.failed ? (
          <View style={[s.notice, { backgroundColor: c.danger + '14' }]}>
            <Text style={[s.small, { color: c.danger, flex: 1 }]}>{state.failed}</Text>
            <Press onPress={state.load} accessibilityRole="button" style={s.textBtn}>
              <Text style={[s.smallBold, { color: c.link }]}>다시 불러오기</Text>
            </Press>
          </View>
        ) : null}
        {state.data ? children : state.failed ? null : <ActivityIndicator style={{ paddingVertical: 32 }} />}
      </ScrollView>
        )}
      </ScrollLockScope>
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
      <Press
        onPress={() => setOpen((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={s.fold}
      >
        <Text style={[s.smallBold, { color: c.muted }]}>{label}</Text>
        <SymbolView name={open ? 'chevron.up' : 'chevron.down'} size={11} tintColor={c.muted} />
      </Press>
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
  tiny: { fontSize: 13, lineHeight: 19 },
  small: { fontSize: 13, lineHeight: 20 },
  smallBold: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 24 },
  bodyBold: { fontSize: 17, fontWeight: '600', lineHeight: 24 },
  center: { textAlign: 'center' },
});

const st = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, minHeight: 44 },
  back: { flexDirection: 'row', alignItems: 'center', minHeight: 44 },
});
