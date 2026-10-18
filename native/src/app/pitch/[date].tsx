import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import Animated from 'react-native-reanimated';
import { fadeIn } from '~/shell/motion';
import { ActionSheetIOS, Alert, Pressable, ScrollView, StyleSheet, Text, View, type TextStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRestSession } from '@/lib/session-type';
import { effortText } from '@/lib/pitch-effort';
import { formatSpeed, round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { LocalVideo } from '../../../modules/local-video';
import { TYPE, usePalette, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { ApiError, dateKeyOf, deleteLog, isPhoneVideoPath, phoneAssetId } from '~/pitch/api';
import { monthOf, refreshMonth, useMonth } from '~/pitch/store';
import { PitchVideo } from '~/pitch/video';
import { VelocityDay } from '~/pitch/velocity-day';
import { READABLE_WIDE, TwoColumns } from '~/lib/layout';
import { withAlpha } from '~/lib/ui';
import { toDateKey } from '@/lib/pitch-stats';
import { cachedArmStatus } from '~/pitch/today-card';
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
  const today = toDateKey(new Date());
  const future = date > today;
  const arm = date === today ? cachedArmStatus(today) : null;
  /* 웹 day-client: 기록이 없는 날은 폼을 펴 둔 채로('이날 기록하기'), 있으면 '+ 이 날짜에 기록 추가' 를 눌러 편다. 고치기도 그 자리에서 */
  const [formOpen, setFormOpen] = useState<boolean | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const addOpen = !future && (formOpen ?? (logs != null && day.length === 0));

  /* 웹 day-record ConfirmDialog 와 같은 글 — 무엇이 없어지는지 이름을 대고 한 번 묻는다 */
  const remove = (id: string, videos: string[], label: string) =>
    Alert.alert(
      '이 기록을 지울까요?',
      [
        `${at.getUTCMonth() + 1}월 ${at.getUTCDate()}일 (${WEEKDAYS[at.getUTCDay()]}) · ${label}`,
        videos.length ? `올려둔 영상 ${videos.length}개도 함께 지워져요.` : null,
        '되돌릴 수 없어요. 수치만 고치려면 기록 고치기를 눌러주세요.',
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
            /* 폰에 둔 영상은 서버가 못 지운다 — 앱이 지운다(웹 day-client 와 같다) */
            const phone = videos.filter(isPhoneVideoPath).map(phoneAssetId);
            if (phone.length) void LocalVideo.remove({ ids: phone }).catch(() => undefined);
            await refreshMonth(monthOf(date));
          } catch (e) {
            Alert.alert(e instanceof ApiError ? e.message : '지우지 못했어요.');
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
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        contentContainerStyle={[{ padding: 16, paddingTop: 4, paddingBottom: inset.bottom + 32, gap: 12 }, READABLE_WIDE]}
      >
        <Text style={{ color: c.muted, fontSize: 15 }}>
          {future ? '아직 오지 않은 날이에요' : day.length > 0 ? `${day.length}건의 기록` : '이 날은 아직 기록이 없어요'}
        </Text>
        {future ? (
          <Text style={[styles.well, { color: c.muted, backgroundColor: withAlpha(c.chip, 0.5) }]}>
            앞으로 올 날짜에는 기록할 수 없어요.{'\n'}던지고 나서 그날 또는 그 뒤에 남겨 주세요.
          </Text>
        ) : null}
        {arm ? <ArmChip c={c} status={arm} /> : null}
        {/* 아이패드 가로(~/lib/layout TwoColumns) — 왼쪽 그날 기록 · 새 기록, 오른쪽 구속 측정. 좁으면 위아래 그대로 */}
        <TwoColumns ratio={[1, 1]} gap={12}
          left={
            <>
              <VelocityDay date={date} logCount={day.length} />
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
                    <View key={l.id} style={[styles.formBox, { backgroundColor: c.card, borderColor: c.line }]}>
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
                        <Text style={[TYPE.num, { fontSize: 24, color: rested ? c.muted : c.sky }]}>
                          {rested ? (
                            '쉬는 날'
                          ) : l.maxVelocity != null ? (
                            <>
                              {round1(toSpeed(l.maxVelocity, speed))}
                              <Text style={{ fontSize: 14, color: c.muted, fontWeight: '500' }}> {speedLabel(speed)} 최고</Text>
                            </>
                          ) : (
                            <>
                              {l.pitchCount}
                              <Text style={{ fontSize: 14, color: c.muted, fontWeight: '500' }}> 구</Text>
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
                        <Text style={{ color: c.sky, fontSize: 12, fontWeight: '500' }}>그날의 느낀점</Text>
                        {l.memo ? <Text style={[styles.memo, { color: c.ink }]}>{l.memo}</Text> : null}
                        {cues.map(([title, list]) => (
                          <Text key={title} style={{ color: c.muted, fontSize: 12 }}>
                            {title} <Text style={{ color: c.ink }}>{list.join(' · ')}</Text>
                          </Text>
                        ))}
                      </View>
                    ) : null}
                    {l.videoPaths.map((p, i) => (
                      <View key={p} style={{ gap: 6 }}>
                        {l.videoPaths.length > 1 ? <Text style={{ color: c.muted, fontSize: 12, fontWeight: '500' }}>영상 {i + 1}</Text> : null}
                        <PitchVideo path={p} />
                      </View>
                    ))}
                  </View>
                );
              })}
            </>
          }
          right={
            <>
              {future || !logs ? null : addOpen ? (
                <View style={[styles.formBox, { backgroundColor: c.card, borderColor: c.line }]}>
                  <View style={styles.formHead}>
                    <Text style={[styles.formTitle, { color: c.ink }]}>{day.length > 0 ? '기록 추가' : '이날 기록하기'}</Text>
                    {day.length > 0 ? (
                      <Press accessibilityRole="button" onPress={() => setFormOpen(false)} style={styles.formCancel}>
                        <Text style={{ color: c.muted, fontSize: 12 }}>취소</Text>
                      </Press>
                    ) : null}
                  </View>
                  <EntryForm key={date} date={date} imported={[]} inline={{ onDone: () => setFormOpen(null) }} />
                </View>
              ) : (
                <Press accessibilityRole="button" onPress={() => setFormOpen(true)} style={[styles.add, { backgroundColor: c.skyTint }]}>
                  <Icon name="plus" size={16} color={c.skyStrong} />
                  <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '500' }}>이 날짜에 기록 추가</Text>
                </Press>
              )}
            </>
          }
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
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
  armChip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1 },
});

/** 배지 — 웹 Badge(휴대폰: 옅은 회색 면 · 작은 회색 글자). strong 은 종류(하늘 면 · 짙은 하늘 글자) */
function Badge({ c, strong, children }: { c: Palette; strong?: boolean; children: React.ReactNode }) {
  const text: TextStyle = { color: strong ? c.skyStrong : c.muted, fontSize: 12, fontWeight: strong ? '600' : '400' };
  return (
    <View style={{ backgroundColor: strong ? c.skyTint : withAlpha(c.ink, 0.06), borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Text style={text}>{children}</Text>
    </View>
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
        <Text style={{ color: tone, fontSize: 12, fontWeight: '700' }}>팔 {word}</Text>
        <Text numberOfLines={1} style={{ flex: 1, color: c.ink, fontSize: 12 }}>{short}</Text>
        <View style={{ transform: [{ rotate: open ? '180deg' : '0deg' }] }}>
          <Icon name="chevron-down" size={14} color={c.muted} />
        </View>
      </Press>
      {open ? (
        <Animated.View entering={fadeIn} style={{ gap: 2, paddingHorizontal: 12, paddingTop: 8 }}>
          <Text style={{ color: c.ink, fontSize: 12, fontWeight: '600', lineHeight: 18 }}>{status.headline}</Text>
          {status.details.map((d) => (
            <Text key={d} style={{ color: c.muted, fontSize: 12, lineHeight: 18 }}>{d}</Text>
          ))}
        </Animated.View>
      ) : null}
    </View>
  );
}
