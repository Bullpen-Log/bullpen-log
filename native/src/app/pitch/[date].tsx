import { type Href, router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRestSession } from '@/lib/session-type';
import { LocalVideo } from '../../../modules/local-video';
import { usePalette } from '~/lib/ui';
import { ApiError, dateKeyOf, deleteLog, isPhoneVideoPath, phoneAssetId } from '~/pitch/api';
import { monthOf, refreshMonth, useMonth } from '~/pitch/store';
import { PitchVideo } from '~/pitch/video';
import { VelocityDay } from '~/pitch/velocity-day';
import { READABLE_WIDE, TwoColumns } from '~/lib/layout';

/** 그날 화면(앱) — 그날 기록들(종류 · 공 수 · 강도 · 구속 · 메모 · 영상) · 고치기 · 지우기 · 새 기록. 웹 app/(app)/pitch-log/[date] 의 첫 판 */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

export default function PitchDayScreen() {
  const c = usePalette();
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
      <View style={[styles.bar, { paddingTop: inset.top, backgroundColor: c.page }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()} hitSlop={10} style={styles.back}>
          <Text style={[styles.backText, { color: c.sky }]}>‹ 투구 기록</Text>
        </Pressable>
        <Text style={[styles.barTitle, { color: c.ink }]}>
          {at.getUTCMonth() + 1}월 {at.getUTCDate()}일 ({WEEKDAYS[at.getUTCDay()]})
        </Text>
        <View style={styles.back} />
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
              {day.map((l) => (
                <View key={l.id} style={[styles.card, { backgroundColor: c.card }]}>
                  <View style={styles.cardHead}>
                    <Text style={[styles.type, { color: c.ink }]}>
                      {l.sessionType}
                      {isRestSession(l.sessionType) ? '' : ` · ${l.pitchCount}구`}
                    </Text>
                    <Pressable
                      accessibilityRole="button"
                      hitSlop={8}
                      onPress={() => router.push({ pathname: '/pitch/edit' as Href as never, params: { date, id: l.id } })}
                    >
                      <Text style={[styles.action, { color: c.sky }]}>고치기</Text>
                    </Pressable>
                    <Pressable accessibilityRole="button" hitSlop={8} onPress={() => remove(l.id, l.videoPaths)}>
                      <Text style={[styles.action, { color: c.danger }]}>지우기</Text>
                    </Pressable>
                  </View>
                  {!isRestSession(l.sessionType) ? (
                    <Text style={[styles.meta, { color: c.muted }]}>
                      {[
                        l.effortPct ? `체감 강도 ${l.effortPct}%` : null,
                        l.maxVelocity ? `최고 ${l.maxVelocity}km/h` : null,
                        l.avgVelocity ? `평균 ${l.avgVelocity}km/h` : null,
                      ]
                        .filter(Boolean)
                        .join(' · ') || ' '}
                    </Text>
                  ) : null}
                  {l.satisfaction != null || l.cuesGood.length || l.cuesBad.length ? (
                    <Text style={[styles.meta, { color: c.muted }]}>
                      {[
                        l.satisfaction != null ? `만족도 ${l.satisfaction}` : null,
                        l.cuesGood.length ? `좋았던 것 ${l.cuesGood.join(' · ')}` : null,
                        l.cuesBad.length ? `아쉬웠던 것 ${l.cuesBad.join(' · ')}` : null,
                      ]
                        .filter(Boolean)
                        .join('  ')}
                    </Text>
                  ) : null}
                  {l.memo ? <Text style={[styles.memo, { color: c.ink }]}>{l.memo}</Text> : null}
                  {l.videoPaths.map((p) => (
                    <PitchVideo key={p} path={p} />
                  ))}
                </View>
              ))}
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
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, minHeight: 44 },
  back: { minWidth: 96, height: 44, justifyContent: 'center' },
  backText: { fontSize: 17 },
  barTitle: { fontSize: 17, fontWeight: '600' },
  card: { borderRadius: 20, padding: 16, gap: 10 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  type: { flex: 1, fontSize: 20, fontWeight: '700' },
  action: { fontSize: 15, fontWeight: '600' },
  meta: { fontSize: 15 },
  memo: { fontSize: 15, lineHeight: 21 },
  add: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  addText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
