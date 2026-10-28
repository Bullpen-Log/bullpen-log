import { type Href, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { isRestSession } from '@/lib/session-type';
import { round1, speedLabel, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import type { PitchLog } from './api';
import { recentPitchLogs } from './home-summary';

const dayText = (key: string, today: string) => (key === today ? '오늘' : `${Number(key.slice(5, 7))}월 ${Number(key.slice(8, 10))}일`);

/**
 * 투구 탭 '최근 투구'(2026-10-29 확정 디자인) — 줄 셋: 종류 · 날짜 · 영상 수, 오른쪽에 공 수(휴식은 '휴식'). 줄을 누르면 그날 화면, '전체'는 투구 기록(달력 · 목록).
 */
export function RecentPitches({
  logs,
  today,
  loading,
  error,
  onAll,
  onRetry,
}: {
  logs: readonly PitchLog[];
  today: string;
  loading: boolean;
  error: string | null;
  onAll: () => void;
  onRetry: () => void;
}) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const rows = recentPitchLogs(logs, today, 3);
  return (
    <View>
      <View style={styles.head}>
        <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>
          최근 투구
        </Text>
        <Press accessibilityRole="button" accessibilityLabel="투구 기록 전체 보기" onPress={onAll} style={styles.more}>
          <Text style={{ color: c.muted, fontSize: 13 }}>전체</Text>
          <Icon name="chevron-right" size={14} color={c.muted} />
        </Press>
      </View>
      {rows.length ? (
        rows.map((l) => {
          const key = l.date.slice(0, 10);
          const rest = isRestSession(l.sessionType);
          const videos = l.videoPaths.length;
          const sub = [dayText(key, today), videos ? `${videos}개 영상` : null, !rest && l.maxVelocity != null ? `최고 ${round1(toSpeed(l.maxVelocity, speed))} ${speedLabel(speed)}` : null]
            .filter(Boolean)
            .join(' · ');
          return (
            <Press
              key={l.id}
              accessibilityRole="button"
              accessibilityLabel={`${l.sessionType}, ${sub}, ${rest ? '휴식' : `${l.pitchCount}구`}`}
              onPress={() => router.push(`/pitch/${key}` as Href)}
              style={[styles.row, { borderTopColor: c.line }]}
            >
              <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                <Text numberOfLines={1} style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>
                  {rest ? '휴식' : l.sessionType}
                </Text>
                <Text numberOfLines={1} style={{ color: c.muted, fontSize: 12 }}>
                  {sub}
                </Text>
              </View>
              {rest ? (
                <Text style={{ color: c.muted, fontSize: 15 }}>휴식</Text>
              ) : (
                <Text style={[TYPE.num, { color: c.ink, fontSize: 24 }]}>
                  {l.pitchCount}
                  <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}> 구</Text>
                </Text>
              )}
            </Press>
          );
        })
      ) : (
        <View style={[styles.empty, { borderTopColor: c.line }]}>
          <Text style={{ color: c.muted, fontSize: 14, flex: 1 }}>
            {error ? '최근 투구를 불러오지 못했어요' : loading ? '불러오는 중…' : '아직 투구 기록이 없어요'}
          </Text>
          {error ? (
            <Press accessibilityRole="button" accessibilityLabel="최근 투구 다시 불러오기" onPress={onRetry} style={styles.more}>
              <Text style={{ color: c.link, fontSize: 15 }}>다시</Text>
            </Press>
          ) : null}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44, paddingHorizontal: 2 },
  more: { minHeight: 44, minWidth: 44, flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 3 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, paddingHorizontal: 2, borderTopWidth: StyleSheet.hairlineWidth },
  empty: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 2, borderTopWidth: StyleSheet.hairlineWidth },
});
