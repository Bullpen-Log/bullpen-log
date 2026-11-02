import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import Animated from 'react-native-reanimated';
import { fadeIn } from '~/shell/motion';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import { toast } from '~/shell/toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRestSession } from '@/lib/session-type';
import { usePrefs } from '~/lib/prefs';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { ApiError, dateKeyOf, deleteLog, loadMe, removePhoneOrphans, type PitchLog } from '~/pitch/api';
import { monthOf, refreshMonth, repOf, useFeatured, useMonth, usePathThumbs } from '~/pitch/store';
import { ViewportProvider, useViewport } from '~/pitch/video';
import { useScreenSettled } from '~/shell/transition';
import { VelocityDay, useVelocityDayState } from '~/pitch/velocity-day';
import { READABLE_WIDE, TwoColumns } from '~/lib/layout';
import { withAlpha } from '~/lib/ui';
import { toDateKey } from '@/lib/pitch-stats';
import { usePitchToday } from '~/pitch/today-card';
import { leaveTo } from '~/shell/web-nav';
import { DayLogCard } from '~/pitch/day-log-card';
import { measuredFrom, linkStatus, retryableLink, type EntrySource } from '~/pitch/entry-model';
import { dismissLinkNote, retryLink, useLinkNote } from '~/pitch/entry-save';
import { QuickStepEntry } from '~/pitch/quick-step';

/**
 * 그날 화면(앱) — 그날 합계 · 기록 카드 · 구속 측정 · 새 기록. 입력 · 고치기는 이 화면 위에 퀵스텝을 덮어 연다(창을 겹쳐 열지 않는다 —
 * 닫으면 읽던 자리 그대로). 기록이 없는 날은 바로 입력부터(측정만 남은 날은 그 측정으로). 2026-10-29 퀵스텝 확정안.
 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
type Open = { source: EntrySource; convertRest?: boolean };

export default function PitchDayScreen() {
  const c = usePalette();
  const speed = usePrefs().speed;
  const inset = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { logs, error } = useMonth(monthOf(date));
  const day = (logs ?? []).filter((l) => dateKeyOf(l.date) === date);
  const at = new Date(`${date}T00:00:00.000Z`);
  /* 오늘은 서버 것(시험 계정은 시뮬레이션 날짜) — 앱 껍데기가 받아 둔 답이라 다시 안 묻는다. 오기 전에는 폰의 날짜 */
  const [serverToday, setServerToday] = useState<string | null>(null);
  useEffect(() => {
    loadMe().then(
      (m) => setServerToday(m.today),
      () => setServerToday(toDateKey(new Date()))
    );
  }, []);
  const today = serverToday ?? toDateKey(new Date());
  const future = date > today;
  /* 오늘이면 팔 상태 · 회복식 한 줄 — 그날 기록이 바뀌면(저장 · 지우기) 다시 받는다 */
  const dayKey = day.map((l) => `${l.id}:${l.pitchCount}:${l.sessionType}`).join();
  const now = usePitchToday(today, date === today, dayKey);
  const arm = now?.status ?? null;
  const settled = useScreenSettled();
  const viewport = useViewport();
  const featured = useFeatured();
  const throwing = day.filter((l) => !isRestSession(l.sessionType));
  const restLog = day.find((l) => isRestSession(l.sessionType)) ?? null;
  const dayPaths = throwing.flatMap((l) => l.videoPaths);
  const rep = repOf(dayPaths, featured[date]);
  const thumbs = usePathThumbs(day.flatMap((l) => l.videoPaths));
  const [playing, setPlaying] = useState<string | null>(null);
  const total = throwing.reduce((n, l) => n + l.pitchCount, 0);
  /* 그날 측정 — 어느 기록에 이어졌는지(카드의 '구속측정 N구 연결됨') · 빈 날 바로 입력할 때 측정이 남았는지 */
  const velocity = useVelocityDayState(date, dayKey);
  const linkedOf = (id: string) => (velocity.data?.sessions ?? []).filter((s) => s.pitchLogId === id).reduce((n, s) => n + s.pitches.length, 0);

  const [open, setOpen] = useState<Open | null>(null);
  /*
   * 기록이 없는 날은 바로 입력 — 한 번만(취소하면 빈 날을 보여 준다). 측정만 남은 날은 그 측정으로. 측정을 다 받은 뒤 정한다
   * (먼저 빈 입력을 열었다가 측정이 오면 적던 것을 갈아엎게 된다). 그린 값에서 정하는 상태라 그리는 중에 한 번 바꾼다(React 의 파생 상태 꼴).
   */
  const [autoDone, setAutoDone] = useState(false);
  if (!autoDone && !open && settled && !future && serverToday != null && logs != null && day.length === 0 && (velocity.data || velocity.failed)) {
    const pf = velocity.data?.prefill;
    setAutoDone(true);
    setOpen({ source: pf ? { kind: 'measured', m: measuredFrom(pf, velocity.data!.sessions) } : { kind: 'new' } });
  }

  const link = useLinkNote(date);
  const linkState = link ? linkStatus(link.result, link.sessionIds) : null;

  const addLabel = throwing.length ? '기록 추가' : restLog ? '투구 기록으로 바꾸기' : '이날 기록하기';
  const openAdd = () => {
    /* 쉬는 날만 있는 날은 그 기록을 투구로 바꾼다(같은 날 휴식 · 투구가 따로 쌓이지 않게) */
    if (restLog && !throwing.length) return setOpen({ source: { kind: 'edit', log: restLog }, convertRest: true });
    setOpen({ source: { kind: 'new' } });
  };

  /* 웹 day-record ConfirmDialog 와 같은 글 — 무엇이 없어지는지 이름을 대고 한 번 묻는다 */
  const remove = (l: PitchLog) => {
    const label = isRestSession(l.sessionType) ? '휴식' : `${l.sessionType} ${l.pitchCount}구`;
    const linked = linkedOf(l.id);
    Alert.alert(
      '이 기록을 지울까요?',
      [
        `${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 (${WEEKDAYS[at.getUTCDay()]}) · ${label}`,
        l.videoPaths.length ? `붙어 있는 영상 ${l.videoPaths.length}개도 함께 지워져요.` : null,
        linked ? `이은 구속 측정 ${linked}구는 지워지지 않고 '기록 전' 측정으로 남아요.` : null,
        '되돌릴 수 없어요. 수치만 고치려면 기록 고치기를 눌러 주세요.',
      ]
        .filter(Boolean)
        .join('\n\n'),
      [
        { text: '취소', style: 'cancel' },
        {
          text: '지우기',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteLog(l.id);
              /* 폰에 둔 영상은 서버가 못 지운다 — 앱이 지운다. 다른 기록 · 내 영상이 같은 영상을 쓰면 남긴다(서버에 묻는다) */
              void removePhoneOrphans(l.videoPaths);
              if (playing && l.videoPaths.includes(playing)) setPlaying(null);
              toast('지웠어요');
              await refreshMonth(monthOf(date));
            } catch (e) {
              toast(e instanceof ApiError ? e.message : '지우지 못했어요.', 'error');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {/* 입력을 덮어 열면 그날 화면은 손가락 · 읽기에서 빠진다(뒤로 새지 않게). 끌어 닫기는 입력이 정한다 */}
      {!open ? <Stack.Screen options={{ gestureEnabled: true }} /> : null}
      <View style={{ flex: 1 }} pointerEvents={open ? 'none' : 'auto'} importantForAccessibility={open ? 'no-hide-descendants' : 'auto'} accessibilityElementsHidden={!!open}>
        {/* 웹 휴대폰 그날 창(아래 시트)처럼 — 손잡이 · 가운데 날짜 · 오른쪽 닫기 ✕(44). 끌어내려도 닫힌다(_layout presentation modal) */}
        <View style={[styles.grabber, { backgroundColor: c.lineStrong }]} />
        <View style={[styles.bar, { backgroundColor: c.page }]}>
          <View style={styles.side} />
          <Text accessibilityRole="header" style={[styles.barTitle, { color: c.ink }]}>
            {at.getUTCMonth() + 1}월 {at.getUTCDate()}일 ({WEEKDAYS[at.getUTCDay()]})
          </Text>
          <View style={[styles.side, { alignItems: 'flex-end' }]}>
            <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} hitSlop={6} style={[styles.close, { backgroundColor: c.chip }]}>
              <Icon name="x" size={18} color={c.muted} />
            </Press>
          </View>
        </View>
        <ViewportProvider value={viewport}>
          <ScrollView
            keyboardShouldPersistTaps="handled"
            innerViewRef={viewport.bindContent}
            onLayout={(e) => viewport.resize(e.nativeEvent.layout.height)}
            onScroll={(e) => viewport.scroll(e.nativeEvent.contentOffset.y)}
            onContentSizeChange={viewport.remeasure}
            scrollEventThrottle={100}
            contentContainerStyle={[{ padding: 16, paddingTop: 4, paddingBottom: inset.bottom + 32, gap: 12 }, READABLE_WIDE]}
          >
            {future ? (
              <Text style={[styles.well, { color: c.muted, backgroundColor: withAlpha(c.chip, 0.5) }]}>
                앞으로 올 날짜에는 기록할 수 없어요.{'\n'}던지고 나서 그날 또는 그 뒤에 남겨 주세요.
              </Text>
            ) : null}
            {link && linkState !== 'linked' ? (
              <View accessibilityRole="alert" style={[styles.linkNote, { backgroundColor: c.warnBg, borderColor: c.warnLine }]}>
                <Text style={[TYPE.body, { color: c.ink }]}>
                  기록은 저장됐어요.{' '}
                  {linkState === 'unknown'
                    ? '구속 측정 연결은 아직 확인하지 못했어요.'
                    : link.result && !retryableLink(link.result)
                      ? '일부 측정은 이미 다른 기록에 이어졌거나 더는 이을 수 없어요.'
                      : '구속 측정 일부를 잇지 못했어요.'}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {linkState === 'unknown' || (link.result && retryableLink(link.result)) ? (
                    <Press accessibilityRole="button" onPress={() => void retryLink(date)} disabled={link.busy} style={[styles.pill, { backgroundColor: c.action }]}>
                      {link.busy ? <ActivityIndicator size="small" color={c.onAction} /> : null}
                      <Text style={[TYPE.buttonCompact, { color: c.onAction }]}>연결 다시 시도</Text>
                    </Press>
                  ) : null}
                  <Press accessibilityRole="button" onPress={() => dismissLinkNote(date)} style={[styles.pill, { backgroundColor: c.chip }]}>
                    <Text style={[TYPE.buttonCompact, { color: c.ink }]}>닫기</Text>
                  </Press>
                </View>
              </View>
            ) : null}
            {arm ? <ArmChip c={c} status={arm} /> : null}
            {now?.nutritionLine ? <NutritionNote c={c} line={now.nutritionLine} /> : null}
            {/* 그날 합계 — 실제 투구 기록의 합. 휴식만 있는 날은 '휴식', 아무것도 없으면 '기록 없음'(쉰 날과 다르다) */}
            {logs ? (
              <View accessible style={styles.total}>
                <Text style={[TYPE.sub, { color: c.muted }]}>{date === today ? '오늘 투구' : '이날 투구'}</Text>
                {throwing.length ? (
                  <Text style={[TYPE.heading, { fontSize: 22, color: c.ink }]}>
                    <Text style={[TYPE.num, { fontSize: 28 }]}>{total}</Text>구{throwing.length > 1 ? <Text style={[TYPE.body, { color: c.muted, fontWeight: '400' }]}> · {throwing.length}번 나눠 던짐</Text> : null}
                  </Text>
                ) : (
                  <Text style={[TYPE.heading, { fontSize: 22, color: c.ink }]}>{restLog ? '휴식' : '기록 없음'}</Text>
                )}
              </View>
            ) : null}
            {/* 아이패드 가로(~/lib/layout TwoColumns) — 왼쪽 그날 기록 · 새 기록, 오른쪽 구속 측정. 좁으면 위아래 그대로 */}
            <TwoColumns ratio={[1, 1]} gap={12}
              left={
                <>
                  {error && !logs ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
                  {day.map((l) => (
                    <Animated.View key={l.id} entering={fadeIn}>
                      <DayLogCard
                        log={l}
                        date={date}
                        unit={speed}
                        thumbs={thumbs}
                        dayVideoCount={dayPaths.length}
                        rep={rep}
                        playing={playing}
                        linkedPitches={linkedOf(l.id)}
                        onPlay={setPlaying}
                        onEdit={() => setOpen({ source: { kind: 'edit', log: l } })}
                        onRemove={() => remove(l)}
                      />
                    </Animated.View>
                  ))}
                </>
              }
              right={
                <>
                  {/* 구속 측정은 기록 카드 밑에 접힌 한 줄로(2026-10-21 김민: 세션 · 공 목록이 기록보다 위에 길게 나왔다) */}
                  <VelocityDay date={date} logCount={day.length} refreshKey={dayKey} onRecord={(m) => setOpen({ source: { kind: 'measured', m } })} />
                  {future || !logs ? null : (
                    <Press accessibilityRole="button" onPress={openAdd} style={[styles.add, { backgroundColor: c.skyTint }]}>
                      <Icon name={restLog && !throwing.length ? 'pencil' : 'plus'} size={16} color={c.link} />
                      <Text style={[TYPE.buttonCompact, { color: c.link }]}>{addLabel}</Text>
                    </Press>
                  )}
                </>
              }
            />
          </ScrollView>
        </ViewportProvider>
      </View>
      {open ? (
        <View style={StyleSheet.absoluteFill}>
          <QuickStepEntry
            key={open.source.kind === 'edit' ? open.source.log.id : open.source.kind}
            date={date}
            source={open.source}
            convertRest={open.convertRest}
            onDone={(r) => {
              setOpen(null);
              toast(r.created ? '기록했어요' : '고쳤어요');
            }}
            onCancel={() => setOpen(null)}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  nudge: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 16, paddingVertical: 12 },
  grabber: { alignSelf: 'center', width: 36, height: 5, borderRadius: 3, marginTop: 6 },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, minHeight: 52 },
  side: { width: 52 },
  close: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', margin: 6 },
  barTitle: { fontSize: 17, fontWeight: '600' },
  total: { gap: 2, paddingHorizontal: 4, paddingTop: 4 },
  add: { minHeight: 48, borderRadius: 24, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  well: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 32, textAlign: 'center', fontSize: 15, lineHeight: 22, overflow: 'hidden' },
  linkNote: { borderRadius: 16, borderWidth: 1, padding: 14, gap: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 16, borderRadius: 22 },
  armChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
});

/** 던진 뒤 회복식 한 줄 — 웹 components/nutrition-line-note.tsx: 수저 그림 · 머리 · 굵은 한 줄 · 음식 보기 · 자세히(영양 탭의 오늘) */
function NutritionNote({ c, line }: { c: Palette; line: { title: string; text: string; example: string | null; href: string } }) {
  return (
    <Press
      accessibilityRole="link"
      accessibilityLabel={`${line.title}. ${line.text}. 자세히`}
      onPress={() => leaveTo(line.href)}
      style={[styles.nudge, { backgroundColor: withAlpha(c.chip, 0.5), borderColor: c.line }]}
    >
      <Icon name="utensils" size={16} color={c.link} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ color: c.muted, fontSize: 13 }}>{line.title}</Text>
        <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>{line.text}</Text>
        {line.example ? <Text style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{line.example}</Text> : null}
      </View>
      <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>자세히 ›</Text>
    </Press>
  );
}

/** 오늘 팔 상태 한 줄 칩 — 웹 ArmStatusNote compact: '● 팔 안전 최근 1주가 …' 한 줄(머리글은 부하 지수를 떼고), 누르면 머리 · 까닭 */
function ArmChip({ c, status }: { c: Palette; status: { level: 'danger' | 'caution' | 'safe'; headline: string; details: string[] } }) {
  const [open, setOpen] = useState(false);
  const tone = { danger: c.danger, caution: c.warn, safe: c.ok }[status.level];
  const box = { danger: [c.dangerBg, c.dangerLine], caution: [c.warnBg, c.warnLine], safe: [withAlpha(c.chip, 0.5), c.line] }[status.level];
  const word = { danger: '위험', caution: '주의', safe: '안전' }[status.level];
  const short = status.headline.replace(/\s*\(부하 지수 [\d.]+\)/, '');
  return (
    <View>
      <Press
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={`팔 ${word}. ${short}`}
        onPress={() => setOpen((v) => !v)}
        style={[styles.armChip, { backgroundColor: box[0], borderColor: box[1] }]}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tone }} />
        <Text style={{ color: tone, fontSize: 13, fontWeight: '600' }}>팔 {word}</Text>
        <Text numberOfLines={1} style={{ flex: 1, color: c.ink, fontSize: 13 }}>{short}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={14} color={c.muted} />
        </View>
      </Press>
      {open ? (
        <Animated.View entering={fadeIn} style={{ gap: 2, paddingHorizontal: 12, paddingTop: 8 }}>
          <Text style={{ color: c.ink, fontSize: 13, fontWeight: '600', lineHeight: 18 }}>{status.headline}</Text>
          {status.details.map((d) => (
            <Text key={d} style={{ color: c.muted, fontSize: 13, lineHeight: 18 }}>{d}</Text>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
