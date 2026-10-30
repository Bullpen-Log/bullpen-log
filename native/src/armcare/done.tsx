import { SymbolView } from 'expo-symbols';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useReducedMotion, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PlayerItem } from '@/app/(session)/armcare/play/[id]/armcare-player';
import { READABLE } from '~/lib/layout';
import { TYPE, withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

/**
 * 암케어 완료(2026-10-30 시안 03) — 따라 하기(native/src/app/armcare/[id].tsx)가 이미 쥔 것(이 실행의 운동 · 날짜 · 시작 때 이미 한 것 · 이번에 한 것 ·
 * 체크마다의 저장 상태)으로 바로 그린다. 따로 읽거나 새로 쓰지 않는다(일반 운동 종료 · 세트 기록 · 프로그램 진도 · 재활 설문 없음).
 *
 * 차례: 루틴 이름 · 날짜 · 수행 n/N(바로 보인다) · 도장 → 저장 상태 → 접힌 수행한 운동 → (일부면) 남은 운동 → 최근 7일 → 완료.
 * 수행과 저장은 다르다 — 모두 수행해도 한 개가 전송 대기면 '저장됨'이라 하지 않는다. 도장은 이번에 새로 한 운동이 있는 첫 완료에 한 번(0.44초),
 * 움직임 줄이기면 멈춘 모양. 이미 다 한 루틴을 다시 열면 기록 열람(새 효과 없음).
 */
export type SaveState = 'before' | 'saved' | 'pending' | 'local' | 'refused' | 'unknown';

const LABEL: Record<SaveState, string> = {
  before: '저장됨',
  saved: '저장됨',
  pending: '전송 대기',
  local: '기기 저장 실패',
  refused: '저장 안 됨',
  unknown: '확인 필요',
};

/* 완료 카드 — 라이트 · 다크 · 네이비 모두 같은 남색 판(흰 글자 대비 12:1 넘음) */
const HERO_BG = '#16314f';
const HERO_SUB = '#c9d7e8';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
const dayText = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 ${WEEKDAYS[new Date(y, m - 1, d).getDay()]}요일`;
};

export function ArmcareDone({
  title,
  dateKey,
  items,
  before: startDone,
  done,
  saves,
  refusedMessage,
  week,
  already,
  animate,
  onAnimated,
  onClose,
  onResume,
  onResend,
  onPersist,
  onVerify,
  busy,
  note,
  c,
}: {
  title: string;
  dateKey: string;
  items: PlayerItem[];
  /** 운동마다 이 실행을 시작할 때 이미 했나(서버 체크 + 폰에 담긴 체크) — '앞서 n개 · 이번에 m개'를 가른다 */
  before: boolean[];
  /** 운동마다 수행했나(시작 때 이미 한 것 포함) */
  done: boolean[];
  /** 운동마다 저장 상태(수행한 것만 뜻이 있다) */
  saves: SaveState[];
  refusedMessage: string | null;
  week: { key: string; done: boolean }[] | null;
  /** 열 때부터 모두 한 루틴 — 기록 열람 */
  already: boolean;
  animate: boolean;
  onAnimated: () => void;
  onClose: () => void;
  onResume: (() => void) | null;
  onResend: () => void;
  onPersist: () => void;
  onVerify: () => void;
  /** 다시 보내는 중 · 다시 저장 중 · 확인 중 */
  busy: 'resend' | 'persist' | 'verify' | null;
  /** 방금 한 일의 결과 한 줄(다시 저장 실패 등) */
  note: string | null;
  c: Palette;
}) {
  const inset = useSafeAreaInsets();
  const count = done.filter(Boolean).length;
  const all = items.length > 0 && count === items.length;
  const before = items.filter((_, i) => startDone[i] && done[i]).length;
  const now = count - before;
  const idx = items.map((_, i) => i);
  const performed = idx.filter((i) => done[i]);
  const remaining = idx.filter((i) => !done[i]);
  const of = (s: SaveState) => performed.filter((i) => saves[i] === s).length;
  const stored = of('saved') + of('before');
  const pending = of('pending');
  const local = of('local');
  const refused = of('refused');
  const unknown = of('unknown');
  const [openList, setOpenList] = useState(refused > 0);
  const [openRow, setOpenRow] = useState<number | null>(null);
  const [openRest, setOpenRest] = useState(false);

  /* 최근 7일 — 서버가 준 기록한 날 + 이 실행에서 저장이 확인된 날(대기는 안 센다 — 다시 보내도 날이 늘지 않게) */
  const days = week?.map((d) => (d.key === dateKey && stored > 0 ? { ...d, done: true } : d)) ?? null;

  const header = (label: string) => (
    <View style={[st.head, { paddingTop: inset.top + 4 }]}>
      <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="닫기" style={st.iconBtn}>
        <Icon name="x" size={20} color={c.link} />
      </Press>
      <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink, flex: 1, textAlign: 'center' }]}>
        {label}
      </Text>
      <View style={st.iconBtn} />
    </View>
  );

  if (count === 0) {
    return (
      <View style={[st.fill, { backgroundColor: c.page }]}>
        {header('암케어')}
        <View style={[st.fill, st.center, { paddingHorizontal: 24, gap: 12 }]}>
          <Text style={[TYPE.section, { color: c.ink, textAlign: 'center' }]}>오늘은 여기까지</Text>
          <Text style={[TYPE.body, { color: c.muted, textAlign: 'center' }]}>완료 표시한 운동이 없어요.</Text>
          <Press onPress={onClose} accessibilityRole="button" style={[st.primary, { backgroundColor: c.action, alignSelf: 'stretch' }]}>
            <Text style={[TYPE.button, { color: c.onAction }]}>암케어로 돌아가기</Text>
          </Press>
        </View>
      </View>
    );
  }

  return (
    <View style={[st.fill, { backgroundColor: c.page }]}>
      {header(already ? '암케어 기록' : '암케어 완료')}
      <ScrollView style={st.fill} contentContainerStyle={[st.body, { paddingBottom: Math.max(24, inset.bottom + 16) }, READABLE]}>
        <View
          accessible
          accessibilityLabel={`${title}, ${already ? '오늘 루틴' : all ? '오늘 루틴 끝' : '오늘은 여기까지'}, ${dayText(dateKey)}, ${items.length}개 운동 중 ${count}개 수행`}
          style={[st.hero, { backgroundColor: HERO_BG }]}
        >
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={[TYPE.buttonCompact, { color: HERO_SUB }]} numberOfLines={2}>
              {title}
            </Text>
            <Text style={[TYPE.hero, { color: '#fff' }]}>{already ? '오늘 루틴' : all ? '오늘 루틴 끝' : '오늘은 여기까지'}</Text>
            <Text style={[TYPE.sub, { color: HERO_SUB }]}>{dayText(dateKey)}</Text>
            <View style={st.countRow}>
              <Text style={st.bigNum}>{count}</Text>
              <Text style={[TYPE.buttonCompact, { color: HERO_SUB }]}>/ {items.length}개 운동</Text>
            </View>
            <Text style={[TYPE.sub, { color: HERO_SUB }]}>수행한 운동</Text>
            {before > 0 && now > 0 ? (
              <Text style={[TYPE.buttonCompact, { color: '#fff' }]}>
                앞서 {before}개 · 이번에 {now}개 수행
              </Text>
            ) : null}
          </View>
          <Stamp animate={animate} onAnimated={onAnimated} />
        </View>

        {local > 0 ? (
          <Notice tone="danger" title={`운동 기록 ${local}개를 저장하지 못했어요`} c={c}
            text="이 기기에 저장되지 않아, 앱을 닫으면 남지 않을 수 있어요."
            action={{ label: busy === 'persist' ? '저장하는 중…' : '다시 저장', onPress: onPersist, disabled: busy != null }}
          />
        ) : null}
        {refused > 0 ? (
          <Notice tone="danger" title={`운동 기록 ${refused}개가 저장되지 않았어요`} c={c}
            text={refusedMessage ?? '서버가 이 기록을 받지 않았어요.'}
            action={{ label: openList ? '목록에서 확인' : '내용 보기', onPress: () => setOpenList(true), disabled: openList }}
          />
        ) : null}
        {unknown > 0 ? (
          <Notice tone="warn" title="저장 결과 확인 필요" c={c}
            text={`운동 기록 ${unknown}개의 저장 여부가 확인되지 않았어요.`}
            action={{ label: busy === 'verify' ? '확인하는 중…' : '저장 상태 확인', onPress: onVerify, disabled: busy != null }}
          />
        ) : null}
        {pending > 0 ? (
          <Notice tone="warn" title={`운동 기록 ${pending}개 전송 대기`} c={c}
            text={`${stored > 0 ? `${stored}개 기록은 저장됐어요. ` : ''}폰에 담아 뒀다가 신호가 돌아오면 같은 기록으로 보내요.`}
            action={{ label: busy === 'resend' ? '보내는 중…' : '다시 보내기', onPress: onResend, disabled: busy != null }}
          />
        ) : null}
        {local + refused + unknown + pending === 0 ? (
          <View style={[st.savedRow, { backgroundColor: c.card }]}>
            <SymbolView name="checkmark.circle.fill" size={18} tintColor={c.ok} />
            <Text style={[TYPE.buttonCompact, { color: c.ink }]}>운동 기록 저장됨</Text>
          </View>
        ) : null}
        {note ? <Text accessibilityRole="alert" style={[TYPE.sub, { color: c.muted, paddingHorizontal: 4 }]}>{note}</Text> : null}

        <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Press onPress={() => setOpenList((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: openList }} style={st.fold}>
            <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>수행한 운동</Text>
            <Text style={[TYPE.buttonCompact, { color: c.muted }]}>{count}개</Text>
            <SymbolView name={openList ? 'chevron.up' : 'chevron.down'} size={12} tintColor={c.muted} />
          </Press>
          {openList
            ? performed.map((i) => {
                const it = items[i];
                const s = saves[i];
                const bad = s === 'local' || s === 'refused';
                const open = openRow === i;
                return (
                  <View key={it.exercise.id} style={[st.listRow, { borderTopColor: c.line }]}>
                    <Press
                      onPress={() => setOpenRow(open ? null : i)}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: open }}
                      accessibilityLabel={`${it.exercise.title}, ${startDone[i] ? '앞서 수행' : '이번에 수행'}, ${LABEL[s]}`}
                      style={st.rowHead}
                    >
                      <SymbolView name="checkmark" size={14} weight="bold" tintColor={c.link} />
                      <Text style={[TYPE.body, { color: c.ink, flex: 1 }]}>{it.exercise.title}</Text>
                      <Text style={[TYPE.sub, { color: bad ? c.danger : s === 'pending' || s === 'unknown' ? c.warn : c.muted }]}>
                        {startDone[i] && s === 'before' ? '앞서 수행' : LABEL[s]}
                      </Text>
                    </Press>
                    {open ? (
                      <View style={{ gap: 4, paddingLeft: 26, paddingBottom: 12 }}>
                        <Text style={[TYPE.sub, { color: c.ink }]}>
                          {dayText(dateKey)} · 수행 체크 · {LABEL[s]}
                        </Text>
                        <Text style={[TYPE.sub, { color: c.muted }]}>따라 하기는 수행 여부만 남겨요. 목표 횟수·시간을 실제 기록으로 쓰지 않아요.</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })
            : null}
        </View>

        {remaining.length > 0 && !already ? (
          <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float }]}>
            <Press onPress={() => setOpenRest((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: openRest }} style={st.fold}>
              <Text style={[TYPE.card, { color: c.ink, flex: 1 }]}>남은 운동 {remaining.length}개</Text>
              <Text style={[TYPE.buttonCompact, { color: c.link }]}>{openRest ? '접기' : '보기'}</Text>
            </Press>
            {openRest ? (
              <View style={{ gap: 8, paddingBottom: 12 }}>
                {remaining.map((i) => (
                  <Text key={items[i].exercise.id} style={[TYPE.body, { color: c.ink }]}>
                    · {items[i].exercise.title}
                  </Text>
                ))}
                {onResume ? (
                  <Press onPress={onResume} accessibilityRole="button" style={[st.secondary, { backgroundColor: c.chip }]}>
                    <Text style={[TYPE.buttonCompact, { color: c.ink }]}>남은 운동 이어하기</Text>
                  </Press>
                ) : null}
              </View>
            ) : null}
          </View>
        ) : null}

        {days ? <Week days={days} c={c} /> : null}

        <Press onPress={onClose} accessibilityRole="button" style={[st.primary, { backgroundColor: c.action }]}>
          <Text style={[TYPE.button, { color: c.onAction }]}>완료</Text>
        </Press>
      </ScrollView>
    </View>
  );
}

/**
 * 완료 도장 — 둥근 남색 판 위 밝은 파랑 도장. animate 면 한 번 눌렀다 놓는 모양(0.44초), 아니면 처음부터 놓인 모양.
 * 숫자 · 단추는 이 효과를 기다리지 않는다(그 자리에서 바로 보인다).
 */
function Stamp({ animate, onAnimated }: { animate: boolean; onAnimated: () => void }) {
  const reduce = useReducedMotion();
  const play = animate && !reduce;
  const [first] = useState(play);
  const scale = useSharedValue(first ? 1.35 : 1);
  const opacity = useSharedValue(first ? 0 : 1);
  useEffect(() => {
    if (!first) {
      if (animate) onAnimated();
      return;
    }
    const ease = Easing.bezier(0.2, 0.9, 0.3, 1);
    opacity.set(withTiming(1, { duration: 120 }));
    scale.set(withSequence(withTiming(0.92, { duration: 260, easing: ease }), withTiming(1, { duration: 180, easing: ease })));
    onAnimated();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 처음 그릴 때 한 번
  }, []);
  const style = useAnimatedStyle(() => ({ opacity: opacity.value, transform: [{ scale: scale.value }, { rotate: '-8deg' }] }));
  return (
    <Animated.View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[st.stamp, style]}>
      <SymbolView name="checkmark" size={30} weight="heavy" tintColor="#16314f" />
    </Animated.View>
  );
}

function Notice({
  tone,
  title,
  text,
  action,
  c,
}: {
  tone: 'warn' | 'danger';
  title: string;
  text: string;
  action: { label: string; onPress: () => void; disabled: boolean };
  c: Palette;
}) {
  const fg = tone === 'danger' ? c.danger : c.warn;
  return (
    <View style={[st.notice, { backgroundColor: tone === 'danger' ? c.dangerBg : c.warnBg }]}>
      <Text style={[TYPE.card, { color: fg }]}>{title}</Text>
      <Text style={[TYPE.body, { color: c.ink }]}>{text}</Text>
      <Press onPress={action.onPress} disabled={action.disabled} accessibilityRole="button" style={[st.noticeBtn, { opacity: action.disabled ? 0.6 : 1 }]}>
        <Text style={[TYPE.buttonCompact, { color: c.link }]}>{action.label}</Text>
      </Press>
    </View>
  );
}

/** 최근 7일(오늘 포함) — 기록한 날. 루틴 완료율 · 연속 · 회복이 아니다 */
export function Week({ days, c }: { days: { key: string; done: boolean }[]; c: Palette }) {
  const n = days.filter((d) => d.done).length;
  return (
    <View style={[st.card, { backgroundColor: c.card, boxShadow: c.float, paddingVertical: 14, gap: 12 }]} accessible accessibilityLabel={`최근 7일 중 기록한 날 ${n}일`}>
      <View style={st.weekHead}>
        <Text style={[TYPE.card, { color: c.ink }]}>최근 7일</Text>
        <Text style={[TYPE.sub, { color: c.muted }]}>
          기록한 날 <Text style={{ color: c.ink, fontWeight: '700' }}>{n}일</Text>
        </Text>
      </View>
      <View style={st.weekRow}>
        {days.map((d, i) => {
          const [y, m, dd] = d.key.split('-').map(Number);
          const today = i === days.length - 1;
          return (
            <View key={d.key} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
              <View
                style={[
                  st.dot,
                  { backgroundColor: d.done ? withAlpha(c.sky, 0.16) : c.chip },
                  today ? { borderWidth: 2, borderColor: c.sky } : null,
                ]}
              >
                {d.done ? <SymbolView name="checkmark" size={12} weight="bold" tintColor={c.link} /> : null}
              </View>
              <Text style={[TYPE.sub, { fontSize: 12, color: today ? c.ink : c.muted, fontWeight: today ? '700' : '400' }]}>
                {today ? '오늘' : WEEKDAYS[new Date(y, m - 1, dd).getDay()]}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  fill: { flex: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 6 },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  body: { paddingHorizontal: 16, paddingTop: 8, gap: 12 },
  hero: { borderRadius: 24, padding: 20, flexDirection: 'row', gap: 12 },
  countRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, paddingTop: 12 },
  bigNum: { color: '#fff', fontSize: 56, fontWeight: '800', fontVariant: ['tabular-nums'], lineHeight: 62 },
  stamp: {
    width: 68,
    height: 68,
    borderRadius: 20,
    backgroundColor: '#8cc4f2',
    borderWidth: 3,
    borderColor: '#c4e2fa',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 6px 14px rgba(0,0,0,0.28)',
  },
  notice: { borderRadius: 18, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 4 },
  noticeBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 16, minHeight: 48 },
  card: { borderRadius: 20, paddingHorizontal: 16 },
  fold: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8 },
  listRow: { borderTopWidth: StyleSheet.hairlineWidth },
  rowHead: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 12 },
  secondary: { minHeight: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  primary: { minHeight: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 4 },
  weekHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  weekRow: { flexDirection: 'row', gap: 4 },
  dot: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
});
