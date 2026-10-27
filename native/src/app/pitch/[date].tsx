import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import Animated from 'react-native-reanimated';
import { fadeIn } from '~/shell/motion';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { toast } from '~/shell/toast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRestSession } from '@/lib/session-type';
import { effortText } from '@/lib/pitch-effort';
import { formatSpeed, round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { ApiError, dateKeyOf, deleteLog, loadMe, removePhoneOrphans } from '~/pitch/api';
import { monthOf, refreshMonth, repOf, setFeatured, useFeatured, useMonth } from '~/pitch/store';
import { PitchVideo, ViewportProvider, useViewport } from '~/pitch/video';
import { VideoNoteLine } from '~/videos/note-line';
import { useScreenSettled } from '~/shell/transition';
import { VelocityDay } from '~/pitch/velocity-day';
import { READABLE_WIDE, TwoColumns } from '~/lib/layout';
import { withAlpha } from '~/lib/ui';
import { toDateKey } from '@/lib/pitch-stats';
import { usePitchToday } from '~/pitch/today-card';
import { leaveTo } from '~/shell/web-nav';
import { EntryForm } from './edit';

/** 그날 화면(앱) — 그날 기록들(종류 · 공 수 · 강도 · 구속 · 메모 · 영상) · 고치기 · 지우기 · 새 기록. 웹 app/(app)/pitch-log/[date] 의 첫 판 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function PitchDayScreen() {
  const c = usePalette();
  const speed = usePrefs().speed;
  const inset = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date: string }>();
  const { logs, error } = useMonth(monthOf(date));
  const day = (logs ?? []).filter((l) => dateKeyOf(l.date) === date);
  const at = new Date(`${date}T00:00:00.000Z`);
  /* 오늘은 서버 것(시험 계정은 시뮬레이션 날짜) — 앱 껍데기가 받아 둔 답이라 다시 안 묻는다. 오기 전에는 폰의 한국 날짜 */
  const [serverToday, setServerToday] = useState<string | null>(null);
  useEffect(() => {
    loadMe().then(
      (m) => setServerToday(m.today),
      () => {}
    );
  }, []);
  const today = serverToday ?? toDateKey(new Date());
  const future = date > today;
  /* 오늘이면 팔 상태 · 회복식 한 줄 — 그날 기록이 바뀌면(저장 · 지우기) 다시 받는다 */
  const now = usePitchToday(today, date === today, day.map((l) => `${l.id}:${l.pitchCount}:${l.sessionType}`).join());
  const arm = now?.status ?? null;
  /* 웹 day-client: 기록이 없는 날은 폼을 펴 둔 채로('이날 기록하기'), 있으면 '+ 이 날짜에 기록 추가' 를 눌러 편다. 고치기도 그 자리에서 */
  const [formOpen, setFormOpen] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const addOpen = !future && (formOpen ?? (logs != null && day.length === 0));
  /*
   * 빈 날에 저절로 펴지는 입력 폼(800줄)은 창이 다 올라온 뒤에 그린다 — 올라오는 움직임과 겹쳐 끊겼다(2026-10-24 전체 검토). 직접 펴면 바로.
   * 끝은 화면 넘김 알림으로 본다(shell/transition.ts, 예전 350ms 어림 — 느린 폰 · 천천히 끌어 올리면 움직임 한가운데 그렸다)
   */
  const settled = useScreenSettled();
  /* 영상은 화면 가까이 온 것만 재생기를 갖는다(pitch/viewport.ts) — 굴린 자리 · 화면 높이 · 내용 크기를 알린다 */
  const viewport = useViewport();
  /* 그날 영상(쉰 날 줄 빼고) · 대표 — 웹 video-calendar DayPanel 과 같은 규칙(repOf) */
  const featured = useFeatured();
  const dayPaths = day.filter((l) => !isRestSession(l.sessionType)).flatMap((l) => l.videoPaths);
  const rep = repOf(dayPaths, featured[date]);

  /* 웹 day-record ConfirmDialog 와 같은 글 — 무엇이 없어지는지 이름을 대고 한 번 묻는다 */
  const remove = (id: string, videos: string[], label: string) =>
    Alert.alert(
      '이 기록을 지울까요?',
      [
        `${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 (${WEEKDAYS[at.getUTCDay()]}) · ${label}`,
        videos.length ? `올려둔 영상 ${videos.length}개도 함께 지워져요.` : null,
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
            await deleteLog(id);
            /* 폰에 둔 영상은 서버가 못 지운다 — 앱이 지운다. 다른 기록 · 내 영상이 같은 영상을 쓰면 남긴다(서버에 묻는다) */
            void removePhoneOrphans(videos);
            await refreshMonth(monthOf(date));
          } catch (e) {
            toast(e instanceof ApiError ? e.message : '지우지 못했어요.', 'error');
          }
        },
      },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      {/* 웹 휴대폰 그날 창(아래 시트)처럼 — 손잡이 · 가운데 날짜 · 오른쪽 닫기 ✕(44). 끌어내려도 닫힌다(_layout presentation modal) */}
      <View style={[styles.grabber, { backgroundColor: c.lineStrong }]} />
      <View style={[styles.bar, { backgroundColor: c.page }]}>
        <View style={styles.side} />
        <Text accessibilityRole="header" style={[styles.barTitle, { color: c.ink }]}>
          {at.getUTCMonth() + 1}월 {at.getUTCDate()}일 ({WEEKDAYS[at.getUTCDay()]})
        </Text>
        <View style={[styles.side, { alignItems: 'flex-end' }]}>
          <Press accessibilityRole="button" accessibilityLabel="닫기" onPress={() => router.back()} style={[styles.close, { backgroundColor: c.chip }]}>
            <Icon name="x" size={18} color={c.muted} />
          </Press>
        </View>
      </View>
      <ViewportProvider value={viewport}>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          automaticallyAdjustKeyboardInsets
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
          {arm ? <ArmChip c={c} status={arm} /> : null}
          {now?.nutritionLine ? <NutritionNote c={c} line={now.nutritionLine} /> : null}
          {/* 아이패드 가로(~/lib/layout TwoColumns) — 왼쪽 그날 기록 · 새 기록, 오른쪽 구속 측정. 좁으면 위아래 그대로 */}
          <TwoColumns ratio={[1, 1]} gap={12}
            left={
              <>
                {error && !logs ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
                {day.map((l) => {
                  const rested = isRestSession(l.sessionType);
                  const eff = effortText({ intensity: l.intensity ?? 0, effortPct: l.effortPct });
                  const cues = (
                    [
                      ['좋았던 것', l.cuesGood],
                      ['아쉬웠던 것', l.cuesBad],
                    ] as const
                  ).filter(([, list]) => list.length > 0);
                  const menu = () =>
                    ActionSheetIOS.showActionSheetWithOptions(
                      {
                        title: rested ? '쉬는 날' : `${l.sessionType} ${l.pitchCount}구`,
                        options: ['기록 고치기', '기록 지우기', '취소'],
                        destructiveButtonIndex: 1,
                        cancelButtonIndex: 2,
                      },
                      (i) => {
                        if (i === 0) setEditingId(l.id);
                        if (i === 1) remove(l.id, l.videoPaths, rested ? '쉬는 날' : `${l.sessionType} ${l.pitchCount}구`);
                      }
                    );
                  if (editingId === l.id)
                    return (
                      <View key={l.id} style={[styles.formBox, { backgroundColor: c.card, boxShadow: c.float, borderColor: c.line }]}>
                        <View style={{ gap: 4 }}>
                          <Text style={[styles.formTitle, { color: c.ink }]}>기록 수정</Text>
                          <Text style={{ color: c.muted, fontSize: 15 }}>영상도 함께 바꿀 수 있어요</Text>
                        </View>
                        <EntryForm date={date} editing={l} imported={[]} inline={{ onDone: () => setEditingId(null), onCancel: () => setEditingId(null) }} />
                      </View>
                    );
                  return (
                    <View key={l.id} style={[styles.card, { backgroundColor: c.card, boxShadow: c.float }]}>
                      {/* 그날의 수치 — 구속이 있으면 최고 구속을, 없으면 투구 수를 크게(웹 day-record.tsx) */}
                      <View style={styles.cardHead}>
                        <View style={{ flex: 1, gap: 12 }}>
                          <Text style={[TYPE.num, { fontSize: 24, color: rested ? c.muted : c.link }]}>
                            {rested ? (
                              /* 한글은 둥근 숫자 글꼴(TYPE.num)에 없어 기기 기본 글꼴로 그려졌다 — 안쪽 Text 는 Pretendard */
                              <Text>쉬는 날</Text>
                            ) : l.maxVelocity != null ? (
                              <>
                                {round1(toSpeed(l.maxVelocity, speed))}
                                <Text style={{ fontSize: 15, color: c.muted, fontWeight: '400' }}> {speedLabel(speed)} 최고</Text>
                              </>
                            ) : (
                              <>
                                {l.pitchCount}
                                <Text style={{ fontSize: 15, color: c.muted, fontWeight: '400' }}> 구</Text>
                              </>
                            )}
                          </Text>
                          <View style={styles.badges}>
                            {rested ? (
                              <Badge c={c}>던지지 않았어요</Badge>
                            ) : (
                              <>
                                <Badge c={c} strong>
                                  {l.sessionType}
                                </Badge>
                                <Badge c={c}>{l.pitchCount}구</Badge>
                                {eff ? <Badge c={c}>강도 {eff}</Badge> : null}
                                {l.satisfaction != null ? <Badge c={c}>만족도 {l.satisfaction}/5</Badge> : null}
                                {l.avgVelocity != null ? <Badge c={c}>평균 {formatSpeed(l.avgVelocity, speed)}</Badge> : null}
                              </>
                            )}
                          </View>
                        </View>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="기록 고치기 · 지우기"
                          onPress={menu}
                          hitSlop={6}
                          style={({ pressed }) => [styles.more, pressed && { backgroundColor: c.chip }]}
                        >
                          <Icon name="ellipsis" size={20} color={c.muted} />
                        </Pressable>
                      </View>
                      {/* 그날의 느낀점 — 영상보다 위(다시 여는 까닭은 대개 '그날 뭐라고 적었더라'), 남긴 것이 없으면 그리지 않는다 */}
                      {l.memo || cues.length ? (
                        <View style={[styles.feel, { backgroundColor: c.skyTint }]}>
                          <Text style={{ color: c.link, fontSize: 13, fontWeight: '400' }}>그날의 느낀점</Text>
                          {l.memo ? <Text style={[styles.memo, { color: c.ink }]}>{l.memo}</Text> : null}
                          {cues.map(([title, list]) => (
                            <Text key={title} style={{ color: c.muted, fontSize: 13 }}>
                              {title} <Text style={{ color: c.ink }}>{list.join(' · ')}</Text>
                            </Text>
                          ))}
                        </View>
                      ) : null}
                      {l.videoPaths.map((p) => (
                        <View key={p} style={{ gap: 8 }}>
                          {/* 그날 영상이 둘 넘으면 대표(달력 칸 · 홈 그날 칸에 뜨는 영상) 고르기 — 투구 탭 그날 칸에서 옮겨 옴(2026-10-21) */}
                          {dayPaths.length > 1 ? (
                            <View style={styles.videoHead}>
                              <Text style={{ flex: 1, color: c.muted, fontSize: 13 }}>영상 {dayPaths.indexOf(p) + 1}</Text>
                              {p === rep ? (
                                <View style={styles.repMark}>
                                  <Icon name="star" size={14} color={c.skyStrong} fill={c.skyStrong} />
                                  <Text style={{ color: c.skyStrong, fontSize: 13, fontWeight: '600' }}>대표</Text>
                                </View>
                              ) : (
                                <Press
                                  accessibilityRole="button"
                                  accessibilityLabel={`영상 ${dayPaths.indexOf(p) + 1}을 대표로`}
                                  onPress={() => void setFeatured(date, p)}
                                  style={[styles.repBtn, { backgroundColor: c.chip }]}
                                >
                                  <Icon name="star" size={14} color={c.muted} />
                                  <Text style={{ color: c.ink, fontSize: 13 }}>대표로</Text>
                                </Press>
                              )}
                            </View>
                          ) : null}
                          <PitchVideo path={p} tools />
                          <VideoNoteLine path={p} />
                        </View>
                      ))}
                    </View>
                  );
                })}
              </>
            }
            right={
              <>
                {/* 구속 측정은 기록 카드 밑에 접힌 한 줄로(2026-10-21 김민: 세션 · 공 목록이 기록보다 위에 길게 나왔다) */}
                <VelocityDay date={date} logCount={day.length} />
                {future || !logs ? null : addOpen ? (
                  <View style={[styles.formBox, { backgroundColor: c.card, boxShadow: c.float, borderColor: c.line }]}>
                    <View style={styles.formHead}>
                      <Text style={[styles.formTitle, { color: c.ink }]}>{day.length > 0 ? '기록 추가' : '이날 기록하기'}</Text>
                      {day.length > 0 ? (
                        <Press accessibilityRole="button" onPress={() => setFormOpen(false)} style={styles.formCancel}>
                          <Text style={{ color: c.muted, fontSize: 13 }}>취소</Text>
                        </Press>
                      ) : null}
                    </View>
                    {settled || formOpen ? (
                      <Animated.View entering={fadeIn}>
                        <EntryForm key={date} date={date} imported={[]} inline={{ onDone: () => setFormOpen(null) }} />
                      </Animated.View>
                    ) : null}
                  </View>
                ) : (
                  <Press accessibilityRole="button" onPress={() => setFormOpen(true)} style={[styles.add, { backgroundColor: c.skyTint }]}>
                    <Icon name="plus" size={16} color={c.skyStrong} />
                    <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '400' }}>이 날짜에 기록 추가</Text>
                  </Press>
                )}
              </>
            }
          />
        </ScrollView>
      </ViewportProvider>
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
  card: { borderRadius: 20, padding: 20, gap: 20 },
  cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  more: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginRight: -6, marginTop: -6 },
  feel: { borderRadius: 12, padding: 16, gap: 8 },
  memo: { fontSize: 15, lineHeight: 22 },
  add: { minHeight: 48, borderRadius: 24, flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  formBox: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, padding: 20, gap: 16 },
  formHead: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  formTitle: { fontSize: 17, fontWeight: '700' },
  formCancel: { minHeight: 40, marginVertical: -8, paddingHorizontal: 12, justifyContent: 'center', borderRadius: 12 },
  well: { borderRadius: 12, paddingHorizontal: 16, paddingVertical: 32, textAlign: 'center', fontSize: 15, lineHeight: 22, overflow: 'hidden' },
  videoHead: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 36 },
  repMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  repBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 36, paddingHorizontal: 12, borderRadius: 18 },
  armChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
});

/** 배지 — 웹 Badge(휴대폰: 옅은 회색 면 · 작은 회색 글자). strong 은 종류(하늘 면 · 짙은 하늘 글자) */
function Badge({ c, strong, children }: { c: Palette; strong?: boolean; children: React.ReactNode }) {
  const text: TextStyle = { color: strong ? c.skyStrong : c.muted, fontSize: 13, fontWeight: strong ? '600' : '400' };
  return (
    <View style={{ backgroundColor: strong ? c.skyTint : withAlpha(c.ink, 0.06), borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={text}>{children}</Text>
    </View>
  );
}

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
