import { type Href, router, useLocalSearchParams } from 'expo-router';
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

  const remove = (id: string, videos: string[]) =>
    Alert.alert('이 기록을 지울까요?', videos.length ? '붙인 영상도 같이 지워져요.' : undefined, [
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
      <ScrollView contentContainerStyle={[{ padding: 16, paddingBottom: inset.bottom + 32, gap: 12 }, READABLE_WIDE]}>
        {/* 아이패드 가로(~/lib/layout TwoColumns) — 왼쪽 그날 기록 · 새 기록, 오른쪽 구속 측정. 좁으면 위아래 그대로 */}
        <TwoColumns ratio={[1, 1]} gap={12}
          left={
            <>
              {error && !logs ? <Text style={{ color: c.danger, fontSize: 15 }}>{error}</Text> : null}
              {logs && day.length === 0 ? (
                <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingVertical: 32 }}>이날은 기록이 없어요.</Text>
              ) : null}
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
                      if (i === 0) router.push({ pathname: '/pitch/edit' as Href as never, params: { date, id: l.id } });
                      if (i === 1) remove(l.id, l.videoPaths);
                    }
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
              <VelocityDay date={date} logCount={day.length} />
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/pitch/edit' as Href as never, params: { date } })}
                style={[styles.add, { backgroundColor: c.sky }]}
              >
                <Text style={styles.addText}>새 기록 남기기</Text>
              </Pressable>
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
  add: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  addText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});

/** 배지 — 웹 Badge(테두리 · 작은 글자). strong 은 종류(짙은 하늘 글자) */
function Badge({ c, strong, children }: { c: Palette; strong?: boolean; children: React.ReactNode }) {
  const text: TextStyle = { color: strong ? c.skyStrong : c.ink, fontSize: 12, fontWeight: strong ? '600' : '500' };
  return (
    <View style={{ borderWidth: 1, borderColor: strong ? c.skyTint : c.line, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
      <Text style={text}>{children}</Text>
    </View>
  );
}
