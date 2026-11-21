import { useCallback, useRef, useState } from 'react';
import { router, useFocusEffect, type Href } from 'expo-router';
import { ActivityIndicator, Alert, KeyboardAvoidingView, ScrollView, StyleSheet, Text, TextInput, View, type ScrollViewInstance, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { applyCoachAdjust, previewCoachAdjust } from '@/app/actions/coach';
import type { applyCoachCard, applyCoachGoal, loadCoachChat, sendCoachMessage } from '@/app/actions/coach-chat';
import type { CoachAdjust } from '@/lib/coach/adjust';
import type { GoalOffer } from '@/lib/coach/goal';
import { OPEN_LABEL, type CoachAct, type OpenScreen } from '@/lib/coach/act';
import { rpc } from '~/lib/rpc';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { SheetHead } from '~/home/sheet-head';
import { ActionButton } from '~/shell/action-button';
import { Press } from '~/shell/press';
import { toast } from '~/shell/toast';
import { Icon } from '~/shell/icon';
import { pushOpen } from '~/shell/release';
import { openCheckin } from '~/shell/web-nav';

type Chat = Extract<Awaited<ReturnType<typeof loadCoachChat>>, { ok: true }>;
type Msg = Chat['messages'][number];
type Preview = Extract<Awaited<ReturnType<typeof previewCoachAdjust>>, { ok: true }>;

const EXAMPLES = ['요즘 나 어때?', '오늘 팀 불펜 40개 던졌어', '목요일 불펜에서 착지 균형 신경 써 볼게', '오늘은 30분만 할래'];

const DAY = ['월', '화', '수', '목', '금', '토', '일'];
const dayOf = (d: string) => DAY[(new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7];

/** 바꿀 거리 한 줄 — 카드 제목 */
function adjustLabel(a: CoachAdjust): string {
  switch (a.kind) {
    case 'minutes':
      return `${dayOf(a.date)}요일 운동 ${a.minutes}분으로`;
    case 'skip':
      return `${dayOf(a.date)}요일 쉬기`;
    case 'move':
      return `${dayOf(a.from)}요일 운동을 ${dayOf(a.to)}요일로`;
    case 'busy':
      return '이번 주 운동 날 하나 줄이기';
  }
}

/**
 * 코치에게 말하기(docs/designs/ai-coach.md 10-6) — 코치 탭에서 여는 아래 시트. 처음이면 국외 이전 동의(U43), 그다음 대화.
 * 답 밑 바꿀 거리 카드는 조정 단추와 같은 미리보기 → [적용](app/actions/coach.ts). AI 가 저장 · 적용하지 않는다.
 * ponytail: 적용함 · 취소함은 이 화면에서만 굳는다(다시 열면 카드가 다시 보이고, 이미 적용한 것은 미리보기가 '바뀌는 게 없어요') — 저장할 일이 생기면 CoachMessage.adjusts 에
 */
export default function CoachChatScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scroll = useRef<ScrollViewInstance>(null);
  const input = useRef<TextInputInstance>(null);
  /* 화면에만 있는 마디의 열쇠 — 서버가 준 id 와 안 겹치게 */
  const seq = useRef(0);

  const load = useCallback(() => {
    rpc<Awaited<ReturnType<typeof loadCoachChat>>>('coach-chat.loadCoachChat').then(
      (r) => {
        if (!r.ok) return setFailed(r.error);
        setChat(r);
        setFailed(null);
        setNotice(r.block);
      },
      () => setFailed('신호가 약해 대화를 불러오지 못했어요.')
    );
  }, []);
  useFocusEffect(load);

  const agree = async () => {
    if (!chat) return;
    const r = await rpc<{ ok: true } | { error: string }>('coach-chat.agreeCoachAi', chat.consent.version).catch(() => null);
    if (!r) return toast('신호가 약해요. 다시 눌러 주세요.');
    if ('error' in r) return toast(r.error ?? '다시 눌러 주세요.');
    load();
  };

  const send = async (said: string) => {
    const t = said.trim();
    if (!t || sending || !chat) return;
    setSending(true);
    setNotice(null);
    const mine: Msg = { id: `me-${++seq.current}`, role: 'user', text: t, adjusts: [], goal: null, act: null, cards: [] };
    setChat({ ...chat, messages: [...chat.messages, mine] });
    setText('');
    try {
      const r = await rpc<Awaited<ReturnType<typeof sendCoachMessage>>>('coach-chat.sendCoachMessage', t);
      if ('error' in r) {
        setNotice(r.error ?? '다시 보내 주세요.');
        setChat((cur) => (cur ? { ...cur, messages: cur.messages.filter((m) => m.id !== mine.id) } : cur));
        setText(t);
      } else if ('blocked' in r) {
        setNotice(r.blocked);
        setChat((cur) => (cur ? { ...cur, messages: cur.messages.filter((m) => m.id !== mine.id) } : cur));
        setText(t);
      } else {
        setChat((cur) => (cur ? { ...cur, left: r.left, messages: [...cur.messages, { id: r.messageId, role: 'coach', text: r.reply, adjusts: r.adjusts, goal: r.goal, act: r.act, cards: r.cards }] } : cur));
      }
    } catch {
      setNotice('신호가 약해요. 다시 보내 주세요.');
      setChat((cur) => (cur ? { ...cur, messages: cur.messages.filter((m) => m.id !== mine.id) } : cur));
      setText(t);
    } finally {
      setSending(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 50);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: c.page }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={{ flex: 1 }}><SheetHead c={c} title="코치에게 말하기" /></View>
          <Press accessibilityRole="button" accessibilityLabel="코치 설정" onPress={() => router.push('/coach-settings')} style={st.settingsButton}><Icon name="settings" size={19} color={c.ink} /></Press>
        </View>
      </View>
      {failed ? <View style={{ padding: 16, gap: 10 }}><Text style={[TYPE.body, { color: c.danger }]}>{failed}</Text><ActionButton label="다시 확인" compact tone="secondary" onPress={() => { setFailed(null); load(); }} /></View> : null}
      {!chat && !failed ? <ActivityIndicator style={{ marginTop: 40 }} /> : null}
      {chat && !chat.consented ? <ConsentView chat={chat} onAgree={() => void agree()} c={c} /> : null}
      {chat && chat.consented ? (
        <>
          <ScrollView ref={scroll} style={{ flex: 1 }} contentContainerStyle={{ padding: 16, gap: 12 }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
            {chat.messages.length === 0 ? (
              <View style={{ gap: 8 }}>
                <Text style={[TYPE.body, { color: c.muted }]}>던진 것 · 이번 주 일정 · 해 보고 싶은 것을 말해 주세요. 바꿀 것 · 정할 목표 · 투구 기록 초안은 미리 보여 드리고, 저장은 직접 눌러요.</Text>
                <View style={st.chips}>
                  {EXAMPLES.map((e) => (
                    <Press
                      key={e}
                      accessibilityRole="button"
                      accessibilityHint="입력 칸에 넣어요. 고친 뒤 보내요."
                      onPress={() => {
                        /* 보기 글은 바로 보내지 않는다 — '40개 던졌어'가 하지 않은 일로 남고 기록 초안까지 뜬다(전체 검토 11-19) */
                        setText(e);
                        input.current?.focus();
                      }}
                      style={[st.chip, { backgroundColor: c.card, borderColor: c.line }]}>
                      <Text style={[TYPE.body, { color: c.ink }]}>{e}</Text>
                    </Press>
                  ))}
                </View>
              </View>
            ) : null}
            {chat.messages.map((m) => (
              <Bubble key={m.id} m={m} c={c} />
            ))}
            {sending ? <Text style={[TYPE.sub, { color: c.muted }]}>코치가 쓰는 중…</Text> : null}
          </ScrollView>
          <View style={[st.bar, { borderTopColor: c.line, paddingBottom: Math.max(12, inset.bottom) }]}>
            {notice ? <Text style={[TYPE.sub, { color: c.danger }]}>{notice}</Text> : null}
            {chat.left <= 5 && !notice ? <Text style={[TYPE.sub, { color: c.muted }]}>오늘 {chat.left}번 더 말할 수 있어요.</Text> : null}
            <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end' }}>
              <TextInput
                ref={input}
                value={text}
                onChangeText={setText}
                placeholder="코치에게 말하기"
                placeholderTextColor={c.muted}
                multiline
                maxLength={500}
                style={[st.input, { color: c.ink, backgroundColor: c.card, borderColor: c.line }]}
              />
              <ActionButton label="보내기" compact busy={sending} disabled={!text.trim()} onPress={() => void send(text)} />
            </View>
            <Text style={[TYPE.sub, { color: c.muted }]}>이름 · 연락처는 적지 마세요.</Text>
          </View>
        </>
      ) : null}
    </KeyboardAvoidingView>
  );
}

function ConsentView({ chat, onAgree, c }: { chat: Chat; onAgree: () => void; c: Palette }) {
  const d = chat.consent;
  const rows: [string, string][] = [
    ['받는 곳', d.to],
    ['보내는 때', d.when],
    ['보내는 것', d.items],
    ['안 보내는 것', d.notSent],
    ['쓰는 곳', d.purpose],
    ['보관', d.retention],
    ['동의하지 않으면', d.refusal],
  ];
  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <Text style={[TYPE.card, { color: c.ink }]}>{d.title}</Text>
      {rows.map(([k, v]) => (
        <View key={k} style={{ gap: 2 }}>
          <Text style={[TYPE.sub, { color: c.muted, fontWeight: '700' }]}>{k}</Text>
          <Text style={[TYPE.body, { color: c.ink }]}>{v}</Text>
        </View>
      ))}
      <ActionButton label="동의하고 시작" onPress={onAgree} />
    </ScrollView>
  );
}

function Bubble({ m, c }: { m: Msg; c: Palette }) {
  const mine = m.role === 'user';
  return (
    <View style={{ alignItems: mine ? 'flex-end' : 'flex-start', gap: 6 }}>
      <View style={[st.bubble, { backgroundColor: mine ? c.action : c.card }]}>
        <Text style={[TYPE.body, { color: mine ? c.onAction : c.ink }]}>{m.text}</Text>
      </View>
      {m.adjusts.map((a, i) => (
        <AdjustCard key={`${m.id}-${i}`} a={a} c={c} />
      ))}
      {m.goal ? <GoalOfferCard messageId={m.id} offer={m.goal} c={c} /> : null}
      {m.act ? <ActCard act={m.act} c={c} /> : null}
      {m.cards.map((k) => (
        <CardView key={`${m.id}-${k.id}`} messageId={m.id} card={k} c={c} />
      ))}
    </View>
  );
}

/**
 * 코치 카드(개인 비서 1단계, lib/coach/card.ts) — 코치가 도구로 낸 제안 하나. 눌러야 실행된다: 화면 열기 · 투구 기록 초안은 그 화면을 열고,
 * 나머지는 서버가 그 마디에서 카드를 다시 읽어 확인한 뒤 실행한다(coach-chat.applyCoachCard). 취소는 이 화면에서만.
 */
function CardView({ messageId, card, c }: { messageId: string; card: Msg['cards'][number]; c: Palette }) {
  const [state, setState] = useState<'idle' | 'busy' | 'done' | 'cancelled'>(card.done ? 'done' : 'idle');
  const [err, setErr] = useState<string | null>(null);
  const run = async () => {
    const o = card.open;
    if (o?.kind === 'screen') return openScreen(o.screen);
    if (o?.kind === 'log') return pushOpen({ pathname: '/pitch/edit' as Href as never, params: { date: o.date, type: o.type, ...(o.count ? { count: String(o.count) } : {}) } });
    /* 지우기 · 그만두기는 한 번 더 묻는다(4단계) */
    if (card.confirm && !(await ask(card.confirm, card.cta))) return;
    setState('busy');
    setErr(null);
    const r = await rpc<Awaited<ReturnType<typeof applyCoachCard>>>('coach-chat.applyCoachCard', messageId, card.id).catch(() => null);
    if (!r || 'error' in r) {
      setState('idle');
      return setErr(r && 'error' in r ? (r.error ?? '다시 눌러 주세요.') : '신호가 약해요. 다시 눌러 주세요.');
    }
    setState('done');
    toast('적용했어요');
  };
  const doneText = card.open?.kind === 'log' ? '그날 기록이 있어요' : '적용함';
  return (
    <View style={[st.card, { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '700' }]}>{card.open ? '코치 제안' : '제안 · 눌러야 바뀌어요'}</Text>
      <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{card.title}</Text>
      {state !== 'done' && state !== 'cancelled'
        ? card.lines.map((l, i) => (
            <Text key={i} style={[TYPE.sub, { color: c.muted }]}>
              {l}
            </Text>
          ))
        : null}
      {state === 'done' ? <Text style={[TYPE.sub, { color: c.link }]}>{doneText}</Text> : null}
      {state === 'cancelled' ? <Text style={[TYPE.sub, { color: c.muted }]}>취소함</Text> : null}
      {err ? <Text style={[TYPE.sub, { color: c.danger }]}>{err}</Text> : null}
      {state === 'idle' || state === 'busy' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {card.open ? null : <ActionButton label="취소" compact tone="secondary" onPress={() => setState('cancelled')} style={{ flex: 1 }} />}
          <ActionButton label={card.cta} compact busy={state === 'busy'} onPress={() => void run()} style={{ flex: 1 }} />
        </View>
      ) : null}
    </View>
  );
}

const ask = (title: string, cta: string) =>
  new Promise<boolean>((done) =>
    Alert.alert(title, undefined, [
      { text: '취소', style: 'cancel', onPress: () => done(false) },
      { text: cta, style: 'destructive', onPress: () => done(true) },
    ], { cancelable: true, onDismiss: () => done(false) })
  );

/** 화면 열기 — 대화 창을 닫고 연다(체크인은 웹 흐름) */
const SCREEN_HREF: Record<Exclude<OpenScreen, 'checkin'>, string> = {
  training: '/training-today',
  armcare: '/training-armcare',
  mechanics: '/training-mechanics',
  lab: '/lab',
  velocity: '/velocity',
  calendar: '/calendar',
  programs: '/training/programs',
  settings: '/training/settings',
};
function openScreen(screen: OpenScreen) {
  if (screen === 'checkin') return openCheckin();
  router.back();
  pushOpen(SCREEN_HREF[screen] as Href);
}

/**
 * 대신 해 주기(자비스 5단계, lib/coach/act.ts) — 투구 기록 초안은 기록 창을 채워 열 뿐, 저장은 그 창에서 선수가 한다(강도는 거기서 고른다).
 * 남기고 돌아오면 대화를 다시 읽어 '기록했어요'(서버가 그날 그 종류 기록을 보고 정한다).
 */
function ActCard({ act, c }: { act: CoachAct; c: Palette }) {
  if (act.kind === 'open')
    return <ActionButton label={`${OPEN_LABEL[act.screen]} 열기`} compact tone="secondary" onPress={() => openScreen(act.screen)} style={{ width: '86%' }} />;
  const when = `${Number(act.date.slice(5, 7))}월 ${Number(act.date.slice(8))}일(${dayOf(act.date)})`;
  return (
    <View style={[st.card, { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '700' }]}>투구 기록 초안 · 저장은 직접</Text>
      <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{`${when} ${act.type}${act.count ? ` · ${act.count}구` : ''}`}</Text>
      {act.done ? (
        <Text style={[TYPE.sub, { color: c.link }]}>그날 {act.type} 기록이 있어요</Text>
      ) : (
        <>
          <Text style={[TYPE.sub, { color: c.muted }]}>{act.count ? '팔의 피로를 고르고 저장해 주세요.' : '공 수 · 팔의 피로를 적고 저장해 주세요.'}</Text>
          <ActionButton
            label="기록 창에서 확인"
            compact
            onPress={() => pushOpen({ pathname: '/pitch/edit' as Href as never, params: { date: act.date, type: act.type, ...(act.count ? { count: String(act.count) } : {}) } })}
          />
        </>
      )}
    </View>
  );
}

/** 목표 제안 카드(자비스 2단계) — [정하기] · [지우기]를 눌러야 정해진다. 제안은 서버가 그 마디에서 다시 읽는다 */
function GoalOfferCard({ messageId, offer, c }: { messageId: string; offer: GoalOffer; c: Palette }) {
  const [state, setState] = useState<'idle' | 'busy' | 'applied'>(offer.applied ? 'applied' : 'idle');
  const [err, setErr] = useState<string | null>(null);
  const set = offer.kind === 'set';
  const label = set
    ? `목표: ${offer.what} · ${Number(offer.checkOn.slice(5, 7))}월 ${Number(offer.checkOn.slice(8))}일(${dayOf(offer.checkOn)}) ${offer.trigger ? `${offer.trigger}에서 확인` : '까지'}`
    : '정한 목표 지우기';
  const apply = async () => {
    setState('busy');
    setErr(null);
    const r = await rpc<Awaited<ReturnType<typeof applyCoachGoal>>>('coach-chat.applyCoachGoal', messageId).catch(() => null);
    if (!r || 'error' in r) {
      setState('idle');
      return setErr(r && 'error' in r ? (r.error ?? '다시 눌러 주세요.') : '신호가 약해요. 다시 눌러 주세요.');
    }
    setState('applied');
    toast(set ? '목표를 정했어요' : '목표를 지웠어요');
  };
  return (
    <View style={[st.card, { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '700' }]}>{set ? '목표 제안 · 눌러야 정해져요' : '제안 · 눌러야 지워져요'}</Text>
      <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{label}</Text>
      {set ? <Text style={[TYPE.sub, { color: c.muted }]}>그날이 지나면 코치 탭에서 어땠는지 물어볼게요.</Text> : null}
      {err ? <Text style={[TYPE.sub, { color: c.danger }]}>{err}</Text> : null}
      {state === 'applied' ? (
        <Text style={[TYPE.sub, { color: c.link }]}>{set ? '정했어요' : '지웠어요'}</Text>
      ) : (
        <ActionButton label={set ? '정하기' : '지우기'} compact busy={state === 'busy'} onPress={() => void apply()} />
      )}
    </View>
  );
}

/** 바꿀 거리 카드 — [미리보기] → 바뀐 칸 → [적용] [취소]. 미리보기 · 적용은 조정 단추와 같은 서버 길 */
function AdjustCard({ a, c }: { a: CoachAdjust; c: Palette }) {
  const [p, setP] = useState<Preview | null>(null);
  const [state, setState] = useState<'idle' | 'busy' | 'applied' | 'cancelled'>('idle');
  const [err, setErr] = useState<string | null>(null);
  const preview = async () => {
    setState('busy');
    setErr(null);
    const r = await rpc<Awaited<ReturnType<typeof previewCoachAdjust>>>('coach.previewCoachAdjust', a).catch(() => null);
    setState('idle');
    if (!r) return setErr('신호가 약해요. 다시 눌러 주세요.');
    if ('error' in r) return setErr(r.error ?? '다시 눌러 주세요.');
    setP(r);
  };
  const apply = async () => {
    if (!p) return;
    setState('busy');
    const r = await rpc<Awaited<ReturnType<typeof applyCoachAdjust>>>('coach.applyCoachAdjust', a, p.token).catch(() => null);
    if (!r || 'error' in r) {
      setState('idle');
      setP(null);
      return setErr(r && 'error' in r ? (r.error ?? '다시 눌러 주세요.') : '신호가 약해요. 다시 눌러 주세요.');
    }
    setState('applied');
    toast('바꿨어요');
  };
  return (
    <View style={[st.card, { backgroundColor: c.card, borderColor: c.line }]}>
      <Text style={[TYPE.sub, { color: c.link, fontWeight: '700' }]}>제안 · 자동 적용 안 됨</Text>
      <Text style={[TYPE.body, { color: c.ink, fontWeight: '600' }]}>{adjustLabel(a)}</Text>
      {state === 'applied' ? <Text style={[TYPE.sub, { color: c.link }]}>적용함</Text> : null}
      {state === 'cancelled' ? <Text style={[TYPE.sub, { color: c.muted }]}>취소함</Text> : null}
      {p && state !== 'applied' && state !== 'cancelled'
        ? p.changed.map((x) => (
            <View key={x.date} style={{ gap: 1 }}>
              <Text style={[TYPE.sub, { color: c.muted, fontWeight: '700' }]}>{dayOf(x.date)}</Text>
              <Text style={[TYPE.sub, { color: c.muted, textDecorationLine: 'line-through' }]}>{x.before}</Text>
              <Text style={[TYPE.sub, { color: c.ink, fontWeight: '600' }]}>{x.after}</Text>
            </View>
          ))
        : null}
      {err ? <Text style={[TYPE.sub, { color: c.danger }]}>{err}</Text> : null}
      {state === 'idle' || state === 'busy' ? (
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {p ? (
            <>
              <ActionButton label="취소" compact tone="secondary" onPress={() => setState('cancelled')} style={{ flex: 1 }} />
              <ActionButton label="적용" compact busy={state === 'busy'} onPress={() => void apply()} style={{ flex: 1 }} />
            </>
          ) : (
            <ActionButton label="미리보기" compact tone="secondary" busy={state === 'busy'} onPress={() => void preview()} style={{ flex: 1 }} />
          )}
        </View>
      ) : null}
    </View>
  );
}

const st = StyleSheet.create({
  settingsButton: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, alignItems: 'center', justifyContent: 'center' },
  bubble: { maxWidth: '86%', borderRadius: 18, paddingHorizontal: 14, paddingVertical: 10 },
  card: { width: '86%', borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 8 },
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingTop: 10, gap: 6 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
