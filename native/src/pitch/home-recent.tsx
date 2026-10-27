import { type Href, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { effortText } from '@/lib/pitch-effort';
import { isRestSession } from '@/lib/session-type';
import { round1, toSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { TYPE, usePalette, useTheme } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { SinkerMark } from '~/shell/wordmark';
import type { PitchLog } from './api';
import { latestPitchLog } from './home-summary';

export function PitchRecentCard({ logs, today, loading, error, onAll, onRetry }: {
  logs: readonly PitchLog[]; today: string; loading: boolean; error: string | null; onAll: () => void; onRetry: () => void;
}) {
  const c = usePalette();
  const dark = useTheme() !== 'light';
  const speed = usePrefs().speed;
  const record = latestPitchLog(logs, today);
  const date = record?.date.slice(0, 10);
  const rest = record ? isRestSession(record.sessionType) : false;
  const effort = record ? effortText({ intensity: record.intensity ?? 0, effortPct: record.effortPct }) : null;
  const open = () => { if (date) router.push(`/pitch/${date}` as Href); };
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.head}>
        <Text style={[TYPE.card, { color: c.ink }]}>최근 기록</Text>
        <Press accessibilityRole="button" accessibilityLabel="전체 투구 기록 보기" onPress={onAll} style={styles.more}>
          <Text style={{ color: c.link, fontSize: 13 }}>전체</Text><Icon name="chevron-right" size={15} color={c.link} />
        </Press>
      </View>
      {record ? (
        <View style={[styles.ticket, { backgroundColor: c.card, boxShadow: c.float }]}>
          <Press card accessibilityRole="button" accessibilityLabel={`${date} ${record.sessionType} ${rest ? '휴식 기록' : `${record.pitchCount}구`} 보기`} onPress={open} style={styles.main}>
            <View style={[styles.cover, { backgroundColor: dark ? '#102f49' : '#e5f2fc' }]} accessible={false}>
              <Text style={{ color: c.muted, fontSize: 11, letterSpacing: 1 }}>SINKER</Text>
              <SinkerMark height={34} />
              <Text style={{ color: c.link, fontSize: 12 }}>{date?.slice(5).replace('-', '.')}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
              <Text style={{ color: c.muted, fontSize: 12 }}>{date === today ? '오늘' : date?.replaceAll('-', '.')}</Text>
              <Text style={[TYPE.card, { color: c.ink }]}>{rest ? '휴식 기록' : record.sessionType}</Text>
              {rest ? <Text style={{ color: c.muted, fontSize: 14 }}>던지지 않았어요</Text> : (
                <View style={styles.numbers}>
                  <Text style={[TYPE.num, { color: c.ink, fontSize: 29 }]}>{record.pitchCount}<Text style={{ fontSize: 13, color: c.muted }}> 구</Text></Text>
                  {record.maxVelocity != null ? <Text style={[TYPE.num, { color: c.ink, fontSize: 24 }]}>{round1(toSpeed(record.maxVelocity, speed))}<Text style={{ fontSize: 11, color: c.muted }}> {speed === 'mph' ? 'mph' : 'km/h'}</Text></Text> : null}
                </View>
              )}
            </View>
            <Icon name="chevron-right" size={16} color={c.muted} />
          </Press>
          <View style={[styles.foot, { borderColor: c.line }]}>
            <Text style={{ flex: 1, color: c.muted, fontSize: 12 }}>{rest ? '휴식한 날로 남겼어요' : effort ? `체감 강도 ${effort}` : '투구 기록'}</Text>
            <Press accessibilityRole="button" onPress={open} style={styles.more}>
              <Icon name={record.videoPaths.length ? 'film' : 'chevron-right'} size={15} color={c.link} />
              <Text style={{ color: c.link, fontSize: 13 }}>{record.videoPaths.length ? `영상 ${record.videoPaths.length}개` : '기록 보기'}</Text>
            </Press>
          </View>
        </View>
      ) : (
        <View style={[styles.empty, { backgroundColor: c.card }]}>
          <Icon name="book-open" size={23} color={c.muted} />
          <Text style={{ color: c.muted, fontSize: 14, flex: 1 }}>{error ? '최근 기록을 불러오지 못했어요' : loading ? '최근 기록을 불러오고 있어요' : '첫 기록을 남기면 이곳에 모여요'}</Text>
          {error ? <Press accessibilityRole="button" accessibilityLabel="최근 기록 다시 불러오기" onPress={onRetry} style={styles.more}><Text style={{ color: c.link }}>다시</Text></Press> : null}
        </View>
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 36, paddingHorizontal: 2 },
  more: { minHeight: 44, minWidth: 44, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 4 },
  ticket: { borderRadius: 21, overflow: 'hidden' },
  main: { flexDirection: 'row', alignItems: 'center', padding: 15, gap: 12, minHeight: 132 },
  cover: { width: 70, minHeight: 100, borderRadius: 13, padding: 10, justifyContent: 'space-between', gap: 7 },
  numbers: { flexDirection: 'row', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' },
  foot: { paddingHorizontal: 15, minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth },
  empty: { minHeight: 100, borderRadius: 20, padding: 18, gap: 12, flexDirection: 'row', alignItems: 'center' },
});
