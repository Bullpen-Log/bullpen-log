import * as Haptics from 'expo-haptics';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { MeetupDetail, loadAppMeetup, setAppMeetupJoin } from '@/app/actions/app-dugout';
import { Bar, useLoad } from '~/community/parts';
import { patchMeetup } from '~/dugout/home-store';
import { READABLE } from '~/lib/layout';
import { rpc, RpcError } from '~/lib/rpc';
import { SPACE, TYPE, usePalette, withAlpha, type Palette } from '~/lib/ui';
import { Icon, type IconName } from '~/shell/icon';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { leaveTo } from '~/shell/web-nav';

/**
 * 모임(번개) 하나 — 덕아웃 탭 모임 카드에서 연다(2026-10-29 확정 시안). 일시 · 장소 · 인원 · 준비물 → 참가하기 · 참가 취소, 참가 중이면 내 참가 티켓(?ticket=1 이면 티켓부터).
 * 참가 판단(정원 · 나이 · 마감 · 차단)은 서버(app-dugout.setAppMeetupJoin → 웹 setJoin)가 한다 — 단추는 누르는 동안 막고, 답으로 온 서버의 지금 모임으로 화면 · 카드를 맞춘다
 * (실패해도 그 값으로 되돌린다). 대화 · 댓글 · 모임 관리(마감 · 결과)는 웹 글 화면(/community/<id>). 티켓은 실제 참가 상태를 보이는 화면일 뿐 결제 · 입장 확인이 아니다.
 * 동작 줄이기면 티켓을 돌리지 않고 바로 바꾼다.
 */
type Loaded = Awaited<ReturnType<typeof loadAppMeetup>>;
type JoinResult = Awaited<ReturnType<typeof setAppMeetupJoin>>;

const offline = (e: unknown) => e instanceof RpcError && e.code === 'offline';

export default function MeetupScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const params = useLocalSearchParams<{ id: string; ticket?: string }>();
  const id = String(params.id ?? '');
  /* 서버 값(화면에 돌아올 때마다 다시 읽음) — 참가 · 취소 뒤에는 그 답으로 온 값을 다시 읽을 때까지 쓴다 */
  const { data, error, reload } = useLoad<Loaded>('app-dugout.loadAppMeetup', id);
  const [fresh, setFresh] = useState<MeetupDetail | null>(null);
  const m: MeetupDetail | null | undefined = fresh ?? (data ? data.meetup : undefined);
  const [busy, setBusy] = useState<'join' | 'leave' | null>(null);
  const [ticket, setTicket] = useState(params.ticket === '1');
  const load = () => void reload().then(() => setFresh(null));
  /* 덕아웃 탭의 카드도 같은 값으로 */
  useEffect(() => {
    if (m) patchMeetup(m);
  }, [m]);

  /* 두 번 누름 막기 — 상태는 다음 그림에 바뀌니 ref 로 먼저 잠근다 */
  const lock = useRef(false);
  const act = (want: 'join' | 'leave') => {
    if (lock.current) return;
    lock.current = true;
    setBusy(want);
    rpc<JoinResult>('app-dugout.setAppMeetupJoin', id, want)
      .then(
        (r) => {
          if (r.meetup) setFresh(r.meetup);
          if (!r.ok) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
            toast(r.error, 'error');
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          toast(want === 'join' ? '참가했어요' : '참가를 취소했어요');
          setTicket(want === 'join');
        },
        (e: unknown) => {
          toast(offline(e) ? '신호가 약해 처리하지 못했어요. 다시 해 주세요.' : '처리하지 못했어요. 다시 해 주세요.', 'error');
          /* 서버에서 실제로 됐는지 모른다 — 지금 상태를 다시 받아 맞춘다 */
          load();
        }
      )
      .then(() => {
        lock.current = false;
        setBusy(null);
      });
  };
  const cancel = () =>
    Alert.alert('참가를 취소할까요?', m?.title, [
      { text: '그대로 둘게요', style: 'cancel' },
      { text: '참가 취소', style: 'destructive', onPress: () => act('leave') },
    ]);
  const toPost = () => leaveTo(`/community/${id}`);

  const showTicket = ticket && m?.joined;
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="덕아웃" title={showTicket ? '내 참가 티켓' : '같이 연습'} c={c} />
      <ScrollView contentContainerStyle={[{ paddingHorizontal: SPACE.side, paddingTop: 8, paddingBottom: inset.bottom + 32, gap: 14 }, READABLE]}>
        {m === undefined ? (
          error ? (
            <View style={{ gap: 12 }}>
              <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text>
              <Press accessibilityRole="button" onPress={load} style={[st.button, { backgroundColor: c.action }]}>
                <Text style={[TYPE.button, { color: c.onAction }]}>다시 불러오기</Text>
              </Press>
            </View>
          ) : (
            <ActivityIndicator style={{ marginTop: 40 }} />
          )
        ) : m === null ? (
          <View style={{ gap: 8, alignItems: 'center', paddingTop: 40 }}>
            <Icon name="circle-alert" size={28} color={c.muted} />
            <Text style={{ color: c.ink, fontSize: 16 }}>이 모임은 볼 수 없어요</Text>
            <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>지워졌거나 가려진 모임이에요.</Text>
          </View>
        ) : showTicket ? (
          <TicketView m={m} c={c} busy={busy} onDetail={() => setTicket(false)} onPost={toPost} onCancel={cancel} />
        ) : (
          <Detail m={m} c={c} busy={busy} onJoin={() => act('join')} onTicket={() => setTicket(true)} onPost={toPost} onCancel={cancel} />
        )}
        {error && m ? <Text style={{ color: c.muted, fontSize: 13 }}>{error}</Text> : null}
      </ScrollView>
    </View>
  );
}

function Fact({ c, icon, label, value }: { c: Palette; icon: IconName; label: string; value: string }) {
  return (
    <View style={st.fact} accessible accessibilityLabel={`${label}, ${value}`}>
      <Icon name={icon} size={18} color={c.muted} />
      <Text style={{ color: c.muted, fontSize: 14, width: 56 }}>{label}</Text>
      <Text style={{ color: c.ink, fontSize: 15, flex: 1, lineHeight: 21 }}>{value}</Text>
    </View>
  );
}

function Detail({
  m,
  c,
  busy,
  onJoin,
  onTicket,
  onPost,
  onCancel,
}: {
  m: MeetupDetail;
  c: Palette;
  busy: 'join' | 'leave' | null;
  onJoin: () => void;
  onTicket: () => void;
  onPost: () => void;
  onCancel: () => void;
}) {
  const open = m.state === 'open';
  const people = m.capacity ? `${m.joins} / ${m.capacity}명${open && m.seats != null ? ` · ${m.seats}자리 남음` : ''}` : `${m.joins}명 참가`;
  const status = m.joined ? '참가 중' : m.mine ? '내가 연 모임' : m.stateLabel;
  /* 주 단추 — 참가 중이면 티켓, 내 모임이면 모임 글에서 관리, 막는 까닭이 있으면 그 까닭(누를 수 없음), 아니면 참가하기 */
  const primary = m.joined
    ? { label: '참가 티켓 보기', icon: 'ticket' as IconName, go: onTicket, off: false }
    : m.mine
      ? { label: '모임 글에서 관리하기', icon: 'chevron-right' as IconName, go: onPost, off: false }
      : m.joinBlock
        ? { label: open ? '참가할 수 없어요' : '모집이 마감됐어요', icon: 'lock' as IconName, go: () => undefined, off: true }
        : { label: '참가하기', icon: 'arrow-right' as IconName, go: onJoin, off: false };
  return (
    <View style={{ gap: 14 }}>
      <View style={[st.label, { backgroundColor: withAlpha(m.joined || open ? c.link : c.muted, 0.12) }]}>
        <Icon name="people" size={14} color={m.joined || open ? c.link : c.muted} />
        <Text style={{ color: m.joined || open ? c.link : c.muted, fontSize: 13, fontWeight: '600' }}>{`${m.kind} · ${status}`}</Text>
      </View>
      <Text accessibilityRole="header" style={[TYPE.hero, { color: c.ink, fontSize: 26 }]}>
        {m.title}
      </Text>
      <View style={[st.facts, { backgroundColor: c.card }]}>
        <Fact c={c} icon="calendar-days" label="일시" value={`${m.month}월 ${m.day}일 ${m.weekday} · ${m.time}`} />
        <Fact c={c} icon="map-pin" label="장소" value={[m.place, m.area].filter(Boolean).join(' · ') || '모임 글에서 확인'} />
        <Fact c={c} icon="people" label="인원" value={people} />
        {m.gear ? <Fact c={c} icon="check" label="준비물" value={m.gear} /> : null}
        {m.cost ? <Fact c={c} icon="info" label="회비" value={m.cost} /> : null}
        {m.level || m.adultOnly ? <Fact c={c} icon="baseball" label="참가" value={[m.level, m.adultOnly ? '성인만' : null].filter(Boolean).join(' · ')} /> : null}
        <Fact c={c} icon="user-round" label="연 사람" value={m.host} />
      </View>
      {m.body.trim() ? <Text style={[TYPE.reading, { color: c.ink }]}>{m.body}</Text> : null}
      {m.joiners.length ? <Text style={{ color: c.muted, fontSize: 13 }}>{`참가한 사람 · ${m.joiners.join(', ')}`}</Text> : null}
      <Text style={{ color: c.muted, fontSize: 13 }}>모이는 위치와 바뀐 내용은 모임 글에서 확인해 주세요.</Text>

      <Press
        accessibilityRole="button"
        accessibilityState={{ disabled: primary.off || busy != null, busy: busy === 'join' }}
        disabled={primary.off || busy != null}
        onPress={primary.go}
        style={[st.button, { backgroundColor: primary.off ? c.chip : c.action }]}
      >
        {busy === 'join' ? (
          <ActivityIndicator color={c.onAction} />
        ) : (
          <>
            <Text style={[TYPE.button, { color: primary.off ? c.muted : c.onAction }]}>{primary.label}</Text>
            <Icon name={primary.icon} size={18} color={primary.off ? c.muted : c.onAction} />
          </>
        )}
      </Press>
      {primary.off && m.joinBlock ? <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center' }}>{m.joinBlock}</Text> : null}
      {m.roomOpen && (m.joined || m.mine) ? (
        <Press accessibilityRole="button" onPress={onPost} style={[st.button, { backgroundColor: c.card }]}>
          <Icon name="messages-square" size={18} color={c.link} />
          <Text style={[TYPE.button, { color: c.link }]}>모임 글에서 대화하기</Text>
        </Press>
      ) : (
        <Press accessibilityRole="button" onPress={onPost} style={[st.button, { backgroundColor: c.card }]}>
          <Text style={[TYPE.button, { color: c.link }]}>모임 글 · 댓글 보기</Text>
        </Press>
      )}
      {m.joined ? (
        <Press accessibilityRole="button" disabled={busy != null} accessibilityState={{ busy: busy === 'leave' }} onPress={onCancel} style={st.quiet}>
          {busy === 'leave' ? <ActivityIndicator /> : <Text style={{ color: c.danger, fontSize: 15 }}>참가 취소</Text>}
        </Press>
      ) : null}
    </View>
  );
}

/** 준비물 글 → 한 줄씩(쉼표 · 가운뎃점 · 줄바꿈으로 나눈다) */
const kitOf = (gear: string | null) =>
  (gear ?? '')
    .split(/[,·\n/]/)
    .map((s) => s.trim())
    .filter(Boolean);

function TicketView({
  m,
  c,
  busy,
  onDetail,
  onPost,
  onCancel,
}: {
  m: MeetupDetail;
  c: Palette;
  busy: 'join' | 'leave' | null;
  onDetail: () => void;
  onPost: () => void;
  onCancel: () => void;
}) {
  const reduce = useReducedMotion();
  const [back, setBack] = useState(false);
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.set(withTiming(back ? 180 : 0, { duration: reduce ? 0 : 420 }));
  }, [back, reduce, turn]);
  const front = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: `${turn.value}deg` }] }));
  const rear = useAnimatedStyle(() => ({ transform: [{ perspective: 1200 }, { rotateY: `${turn.value + 180}deg` }] }));
  const kit = kitOf(m.gear);
  /* 앞 · 뒤 중 긴 쪽 높이로 상자를 잡는다(큰 글씨에서 뒷면이 잘리지 않게, 짧은 쪽 밑이 비지 않게) */
  const [fh, setFh] = useState(0);
  const [bh, setBh] = useState(0);
  const md = `${m.month}.${String(m.day).padStart(2, '0')}`;
  return (
    <View style={{ gap: 14 }}>
      <View style={{ minHeight: Math.max(fh, bh) }}>
        {/* 앞면 */}
        <Animated.View
          accessibilityElementsHidden={back}
          importantForAccessibility={back ? 'no-hide-descendants' : 'auto'}
          accessible
          accessibilityLabel={`참가 티켓, ${m.title}, ${m.month}월 ${m.day}일 ${m.weekday} ${m.time}, ${m.place ?? m.area ?? ''}, 참가 중`}
          onLayout={(e) => setFh(e.nativeEvent.layout.height)}
          style={[st.face, { backfaceVisibility: 'hidden' }, front]}
        >
          <View style={st.ticketTop}>
            <Text style={st.ticketBrand}>DUGOUT</Text>
            <Text style={st.ticketTitle} numberOfLines={2}>
              {m.title}
            </Text>
            <Text style={st.ticketPlace} numberOfLines={1}>
              {m.place ?? m.area ?? ''}
            </Text>
            <View style={st.ticketDateRow}>
              <Text style={st.ticketDate}>{md}</Text>
              <Text style={st.ticketDay}>{m.weekday}</Text>
            </View>
          </View>
          <View style={[st.tear, { borderColor: withAlpha('#0b304e', 0.25) }]} />
          <View style={[st.ticketFoot, { backgroundColor: c.card }]}>
            <View style={{ gap: 2 }}>
              <Text style={{ color: c.muted, fontSize: 12 }}>모이는 시간</Text>
              <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{m.time}</Text>
            </View>
            <View style={{ gap: 2 }}>
              <Text style={{ color: c.muted, fontSize: 12 }}>참가</Text>
              <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>나 · 1명</Text>
            </View>
            <View style={[st.joined, { backgroundColor: withAlpha(c.link, 0.12) }]}>
              <Icon name="circle-check" size={15} color={c.link} />
              <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>참가 중</Text>
            </View>
          </View>
        </Animated.View>
        {/* 뒷면 — 챙겨갈 것 */}
        <Animated.View
          accessibilityElementsHidden={!back}
          importantForAccessibility={back ? 'auto' : 'no-hide-descendants'}
          onLayout={(e) => setBh(e.nativeEvent.layout.height)}
          style={[st.face, st.faceBack, { minHeight: fh, backgroundColor: c.card, backfaceVisibility: 'hidden' }, rear]}
        >
          <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>{`${m.month}월 ${m.day}일 ${m.weekday} · ${m.time}`}</Text>
          <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>
            챙겨갈 것
          </Text>
          {kit.length ? (
            kit.map((k) => (
              <View key={k} style={st.kit}>
                <Icon name="check" size={16} color={c.link} />
                <Text style={{ color: c.ink, fontSize: 15 }}>{k}</Text>
              </View>
            ))
          ) : (
            <Text style={{ color: c.muted, fontSize: 15 }}>연 사람이 준비물을 적지 않았어요.</Text>
          )}
          <Text style={{ color: c.muted, fontSize: 13, marginTop: 'auto' }}>모이는 위치와 바뀐 내용은 모임 글에서 확인해 주세요.</Text>
        </Animated.View>
      </View>
      <Press accessibilityRole="button" onPress={() => setBack(!back)} style={[st.button, { backgroundColor: withAlpha(c.link, 0.12) }]}>
        <Icon name={back ? 'ticket' : 'rotate3d'} size={18} color={c.link} />
        <Text style={[TYPE.button, { color: c.link }]}>{back ? '티켓 앞면 보기' : '준비물 보기'}</Text>
      </Press>
      {m.roomOpen ? (
        <Press accessibilityRole="button" onPress={onPost} style={[st.button, { backgroundColor: c.card }]}>
          <Icon name="messages-square" size={18} color={c.link} />
          <Text style={[TYPE.button, { color: c.link }]}>모임 글에서 대화하기</Text>
        </Press>
      ) : null}
      <Press accessibilityRole="button" onPress={onDetail} style={[st.button, { backgroundColor: c.card }]}>
        <Text style={[TYPE.button, { color: c.ink }]}>모임 정보 보기</Text>
      </Press>
      <Press accessibilityRole="button" disabled={busy != null} accessibilityState={{ busy: busy === 'leave' }} onPress={onCancel} style={st.quiet}>
        {busy === 'leave' ? <ActivityIndicator /> : <Text style={{ color: c.danger, fontSize: 15 }}>참가 취소</Text>}
      </Press>
    </View>
  );
}

const st = StyleSheet.create({
  label: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', minHeight: 30, paddingHorizontal: 12, borderRadius: 15 },
  facts: { borderRadius: 20, paddingHorizontal: 16, paddingVertical: 6 },
  fact: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 11 },
  button: { minHeight: 52, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16 },
  quiet: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  face: { borderRadius: 24, overflow: 'hidden' },
  faceBack: { position: 'absolute', top: 0, left: 0, right: 0, padding: 22, gap: 10 },
  ticketTop: { backgroundColor: '#0a84d6', paddingHorizontal: 22, paddingTop: 20, paddingBottom: 22, gap: 4 },
  ticketBrand: { color: 'rgba(255,255,255,0.8)', fontSize: 12, fontWeight: '700', letterSpacing: 2 },
  ticketTitle: { color: '#ffffff', fontSize: 24, fontWeight: '700', letterSpacing: -0.5, marginTop: 6 },
  ticketPlace: { color: 'rgba(255,255,255,0.85)', fontSize: 14 },
  ticketDateRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 10 },
  ticketDate: { color: '#ffffff', fontSize: 56, lineHeight: 60, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] },
  ticketDay: { color: '#ffffff', fontSize: 16, fontWeight: '600', paddingBottom: 8 },
  tear: { height: 0, borderTopWidth: 2, borderStyle: 'dashed' },
  ticketFoot: { flexDirection: 'row', alignItems: 'center', gap: 22, paddingHorizontal: 22, paddingVertical: 20, flexWrap: 'wrap' },
  joined: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 30, paddingHorizontal: 10, borderRadius: 15 },
  kit: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 28 },
});
