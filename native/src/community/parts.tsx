import { SymbolView } from 'expo-symbols';
import { type Href, router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, type NativeScrollEvent, type NativeSyntheticEvent, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { INQUIRY_STATUS, inquiryCategoryLabel, type InquiryStatusKey } from '@/lib/support';
import { rpc, RpcError } from '~/lib/rpc';
import { cacheEpoch } from '~/lib/store';
import type { Palette } from '~/lib/ui';
import { leaveTo } from '~/shell/web-nav';
import { Icon } from '~/shell/icon';

/**
 * 커뮤니티 · 고객센터 앱 화면(native/src/app/community · support)이 같이 쓰는 조각 — 읽기 · 쓰기 부르기, 위 막대, 줄, 알약.
 * 서버는 웹 화면과 같은 읽기(lib/community-load.ts · lib/support-load.ts)와 같은 쓰기(app/actions/community.ts · support.ts 의 App 입구)다.
 */

/** 앱 화면을 모두 걷고 웹을 그 주소로(~/shell/web-nav leaveTo) — 커뮤니티 · 고객센터는 화면이 여러 겹 쌓여 back 한 번으로는 웹이 안 보인다 */
export const leave = leaveTo;

const readError = (e: unknown) =>
  e instanceof RpcError && e.code === 'update'
    ? '앱을 업데이트해 주세요.'
    : e instanceof RpcError && e.code === 'offline'
      ? '신호가 약해 불러오지 못했어요.'
      : '불러오지 못했어요.';

/** useLoad 가 받아 둔 값 — 서버 입구 + 인자마다 하나, 로그인 세대(cacheEpoch)째 */
const seenLoads = new Map<string, { epoch: number; data: unknown }>();

/**
 * 화면이 보일 때마다 읽는다(글을 쓰거나 지우고 돌아오면 새로) — 로그인이 풀렸으면({ ok: false, to }) 웹 로그인으로.
 * R 은 서버 입구의 돌려주는 값 그대로(Awaited<ReturnType<typeof loadApp…>>). 인자가 바뀌면 다시 읽고, 새 값이 올 때까지는
 * 지난 값을 그대로 두고 stale 로 알린다(구분을 바꾸는 동안 목록이 비지 않게). reload 는 끝나면 풀리는 약속(당겨서 새로고침).
 */
export function useLoad<R extends { ok: boolean }>(action: string, ...args: (string | number | null)[]) {
  const key = JSON.stringify(args);
  /* 다시 열 때는 지난번 값부터 그린다(앱을 켠 동안 · 같은 로그인) — 예전엔 열 때마다 돌개부터였다(2026-10-24 전체 검토). 새 값은 뒤에서 받는다 */
  const [state, setState] = useState<{ key: string; data: Extract<R, { ok: true }> } | null>(() => {
    const m = seenLoads.get(action + key);
    return m && m.epoch === cacheEpoch() ? { key, data: m.data as Extract<R, { ok: true }> } : null;
  });
  /* 오류도 어느 인자의 것인지 — 지난 구분의 오류가 새 구분에 남지 않게 */
  const [error, setError] = useState<{ key: string; text: string } | null>(null);
  /* 지금 인자 — 늦게 온 지난 인자의 답(당겨서 새로고침 중에 구분을 바꿈)이 새 목록을 덮지 않게 */
  const latest = useRef(key);
  useEffect(() => {
    latest.current = key;
  }, [key]);
  const run = useCallback(
    (alive: { on: boolean }) =>
      rpc<R>(action, ...(JSON.parse(key) as unknown[])).then(
        (r) => {
          if (!alive.on || latest.current !== key) return;
          if (r.ok) {
            seenLoads.set(action + key, { epoch: cacheEpoch(), data: r });
            setState({ key, data: r as Extract<R, { ok: true }> });
            setError(null);
          } else leave((r as { to?: string }).to ?? '/login');
        },
        (e: unknown) => {
          if (!alive.on || latest.current !== key) return;
          if (e instanceof RpcError && e.code === 'redirect') return leave(e.to ?? '/login');
          setError({ key, text: readError(e) });
        }
      ),
    [action, key]
  );
  useFocusEffect(
    useCallback(() => {
      const alive = { on: true };
      void run(alive);
      return () => {
        alive.on = false;
      };
    }, [run])
  );
  const reload = useCallback(() => run({ on: true }), [run]);
  /* 오류는 지난 값이 화면에 있어도 알린다(화면이 그 위에 띄운다) — 안 그러면 구분을 바꾼 채 지난 목록이 흐리게 남고 아무 말이 없었다 */
  return { data: state?.data ?? null, stale: state != null && state.key !== key, error: error?.key === key ? error.text : null, reload };
}

/** 쓰기 — 던지지 않고 { ok: false, error } 로(신호가 끊겨도 적던 글이 그대로 남게) */
export async function call<T extends { ok: boolean }>(action: string, ...args: unknown[]): Promise<T | { ok: false; error: string }> {
  try {
    return await rpc<T>(action, ...args);
  } catch (e) {
    if (e instanceof RpcError && e.code === 'redirect') {
      leave(e.to ?? '/login');
      return { ok: false, error: e.message };
    }
    return {
      ok: false,
      error: e instanceof RpcError && e.code === 'offline' ? '신호가 약해 보내지 못했어요. 적은 것은 그대로 있어요.' : '처리하지 못했어요.',
    };
  }
}

/** 위 막대 — 왼쪽 ‹ 뒤로(이름), 가운데 제목, 오른쪽 동작 하나 */
/** modal = 아래에서 올라온 창(설정 · 내 정보) — 창은 시계 자리 밑에서 시작해 위 여백을 또 넣으면 80pt 가 비었다 */
/** shown — 본문에 큰 제목(PageHead)을 둔 화면: 큰 제목이 막대 밑으로 굴러 가면 막대 제목이 옅게 뜬다(useTitleCollapse, 웹 NavTitle) */
export function Bar({ back, title, right, c, modal = false, shown }: { back?: string; title?: string; right?: ReactNode; c: Palette; modal?: boolean; shown?: boolean }) {
  const inset = useSafeAreaInsets();
  const reduce = useReducedMotion();
  const o = useSharedValue(shown === false ? 0 : 1);
  useEffect(() => {
    o.value = withTiming(shown === false ? 0 : 1, { duration: reduce ? 0 : 160 });
  }, [shown, reduce, o]);
  const fade = useAnimatedStyle(() => ({ opacity: o.value }));
  return (
    <View style={[s.bar, { paddingTop: modal ? 12 : inset.top, backgroundColor: c.page }]}>
      {/* 웹 위 막대의 뒤로(back-link.tsx): 화살표 그림 24 + 글 17, 하늘색 */}
      {/* back 이 없으면(커뮤니티 하단바의 ← 가 대신) 자리만 비운다 */}
      {back ? (
        <Pressable accessibilityRole="button" accessibilityLabel={`${back}(으)로 돌아가기`} onPress={() => router.back()} hitSlop={10} style={({ pressed }) => [s.side, s.backRow, pressed && { opacity: 0.6 }]}>
          <Icon name="back" size={24} color={c.sky} />
          <Text style={{ color: c.sky, fontSize: 17, flexShrink: 1 }} numberOfLines={1}>
            {back}
          </Text>
        </Pressable>
      ) : (
        <View style={s.side} />
      )}
      <Animated.View style={[{ flex: 1 }, fade]} accessibilityElementsHidden={shown === false}>
        <Text style={[s.barTitle, { color: c.ink }]} numberOfLines={1}>
          {title ?? ''}
        </Text>
      </Animated.View>
      <View style={[s.side, { alignItems: 'flex-end' }]}>{right}</View>
    </View>
  );
}

/**
 * 큰 제목 접기 — 웹 PageHeading + NavTitle 처럼: 본문 맨 위 큰 제목(PageHead)이 굴러 막대 밑으로 가면 막대에 작은 제목.
 * 화면은 ScrollView 에 onScroll · scrollEventThrottle 을 주고 Bar 에 shown 을 넘긴다. 큰 제목 줄 높이(44) 넘게 굴렀으면 접힘.
 */
export function useTitleCollapse() {
  const [shown, setShown] = useState(false);
  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => setShown(e.nativeEvent.contentOffset.y > 44);
  return { shown, scroll: { onScroll, scrollEventThrottle: 32 } };
}

/** 막대 오른쪽 글 단추(글쓰기 · 올리기) */
export function BarButton({ label, onPress, disabled, c }: { label: string; onPress: () => void; disabled?: boolean; c: Palette }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} hitSlop={10}>
      <Text style={{ color: c.sky, fontSize: 17, fontWeight: '700', opacity: disabled ? 0.4 : 1 }}>{label}</Text>
    </Pressable>
  );
}

/** 불러오는 중 · 못 불러옴(다시 불러오기) */
export function LoadState({ error, onRetry, c }: { error: string | null; onRetry: () => void; c: Palette }) {
  if (!error) return <ActivityIndicator style={{ marginTop: 40 }} />;
  return (
    <View style={{ padding: 24, gap: 16, alignItems: 'center' }}>
      <Text style={{ color: c.ink, fontSize: 15, textAlign: 'center' }}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={[s.pill, { backgroundColor: c.sky }]}>
        <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
      </Pressable>
    </View>
  );
}

/** 글 구분마다 다른 색 — 웹 community-format.ts CATEGORY_BADGE 와 같은 뜻(질문 하늘 · 기록 주의 · 팁 초록, 자유는 회색) */
export function categoryColor(category: string, c: Palette) {
  return category === 'question' ? c.sky : category === 'record' ? c.warn : category === 'tip' ? c.ok : undefined;
}

/** 작은 알약 — 구분 · 가림 · 상태 */
export function Badge({ text, color, c }: { text: string; color?: string; c: Palette }) {
  return (
    <View style={[s.badge, { borderColor: color ?? c.line }]}>
      <Text style={{ color: color ?? c.muted, fontSize: 13, fontWeight: '600' }}>{text}</Text>
    </View>
  );
}

/** 고르는 칩(구분 · 신고 이유 · 문의 종류) */
export function Chip({ label, on, onPress, color, c }: { label: string; on: boolean; onPress: () => void; color?: string; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[s.chip, { backgroundColor: on ? (color ?? c.sky) : c.chip }]}
    >
      <Text style={{ color: on ? '#fff' : c.ink, fontSize: 15, fontWeight: '600' }}>{label}</Text>
    </Pressable>
  );
}

/** 아이폰 설정 목록의 한 줄 — 누르면 onPress */
export function Row({ children, onPress, last, c }: { children: ReactNode; onPress?: () => void; last?: boolean; c: Palette }) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        s.row,
        !last && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.line },
        pressed && { backgroundColor: c.chip },
      ]}
    >
      <View style={{ flex: 1, gap: 4 }}>{children}</View>
      {onPress ? <Text style={{ color: c.muted, fontSize: 17 }}>›</Text> : null}
    </Pressable>
  );
}

/** 1:1 문의 상태 알약 — 접수됨 하늘 · 답변 완료 초록 · 종료 회색(웹 support-status-badge.tsx 와 같다) */
export function StatusBadge({ status, c }: { status: InquiryStatusKey; c: Palette }) {
  const m = INQUIRY_STATUS[status];
  return <Badge text={m.label} color={m.tone === 'sky' ? c.sky : m.tone === 'good' ? c.ok : undefined} c={c} />;
}

/** 공지 줄 — 고정 공지는 핀 그림(웹 support-notice-rows.tsx) */
export function NoticeRows({ rows, c }: { rows: { id: string; title: string; pinned: boolean; date: string }[]; c: Palette }) {
  return rows.map((n, i) => (
    <Row key={n.id} onPress={() => router.push(`/support/notices/${n.id}` as Href)} last={i === rows.length - 1} c={c}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {n.pinned ? <SymbolView name="pin.fill" size={13} tintColor={c.sky} /> : null}
        <Text style={{ flex: 1, color: c.ink, fontSize: 17, fontWeight: '600' }} numberOfLines={1}>
          {n.title}
        </Text>
      </View>
      <Text style={[s.meta, { color: c.muted }]}>{n.date}</Text>
    </Row>
  ));
}

/** 1:1 문의 줄 — 제목 · 상태, 종류 · 날짜 · 답글 수(웹 support-inquiry-rows.tsx) */
export function InquiryRows({
  rows,
  c,
}: {
  rows: { id: string; title: string; category: string; status: InquiryStatusKey; replyCount: number; date: string }[];
  c: Palette;
}) {
  return rows.map((q, i) => (
    <Row key={q.id} onPress={() => router.push(`/support/inquiries/${q.id}` as Href)} last={i === rows.length - 1} c={c}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
        <Text style={{ flex: 1, color: c.ink, fontSize: 17, fontWeight: '600' }} numberOfLines={2}>
          {q.title}
        </Text>
        <StatusBadge status={q.status} c={c} />
      </View>
      <InquiryMeta category={q.category} date={q.date} replies={q.replyCount} c={c} />
    </Row>
  ));
}

/** 문의 줄 밑 한 줄 — 웹 support-inquiry-rows.tsx 와 같게: 종류 배지 · (관리자 목록이면) 닉네임 · 날짜 · 말풍선 + 답글 수 */
export function InquiryMeta({
  category,
  nickname,
  date,
  replies,
  c,
}: {
  category: string;
  nickname?: string | null;
  date: string;
  replies: number;
  c: Palette;
}) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 4 }}>
      <Badge text={inquiryCategoryLabel(category)} c={c} />
      {nickname ? <Text style={[s.meta, { color: c.ink }]}>{nickname}</Text> : null}
      <Text style={[s.meta, { color: c.muted }]}>{date}</Text>
      {replies > 0 ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }} accessibilityLabel={`답글 ${replies}`}>
          <Icon name="chat" size={15} color={c.muted} />
          <Text style={[s.meta, { color: c.muted }]}>{replies}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const s = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, minHeight: 44 },
  side: { width: 96, minHeight: 44, justifyContent: 'center' },
  backRow: { flexDirection: 'row', alignItems: 'center', gap: 0, marginLeft: -6 },
  barTitle: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '600' },
  pill: { minHeight: 44, paddingHorizontal: 24, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  badge: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: 'flex-start' },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  group: { borderRadius: 14, overflow: 'hidden' },
  groupTitle: { fontSize: 13, fontWeight: '600', paddingHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12, minHeight: 52 },
  title: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 13 },
  body: { fontSize: 17, lineHeight: 26 },
  label: { fontSize: 13, fontWeight: '600', marginTop: 10 },
  input: { minHeight: 48, borderRadius: 12, paddingHorizontal: 14, fontSize: 17 },
  area: { minHeight: 200, borderRadius: 12, paddingHorizontal: 14, paddingTop: 12, fontSize: 17, textAlignVertical: 'top' },
  primary: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

/** 입력 · 보내기 동안 쓰는 작은 상태 — busy 중에는 다시 안 보낸다 */
export function useBusy() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const run = async (fn: () => Promise<string | null>) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setError(await fn());
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, setError, run };
}
