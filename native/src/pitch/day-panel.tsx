import { type Href, router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { effortText } from '@/lib/pitch-effort';
import { isRestSession } from '@/lib/session-type';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import type { PitchLog } from './api';
import { useVelocityDays } from './store';

/**
 * 투구 탭 달력에서 날을 누르면 밑에 펴지는 그날 요약 — 누르면 그날 화면(/pitch/[date]).
 * 2026-10-21 김민(가독성 검토): 예전엔 이 칸에서 영상 재생 · 대표 고르기까지 해 그날 화면과 같은 일을 두 번 했다 → 요약만 두고,
 * 영상 · 대표 고르기는 그날 화면에서.
 * - 머리: '10월 13일 (화)' + '자세히 ›', 밑 한 줄 '22구 · 최고 132km/h · 영상 2개'.
 * - 그날 남긴 투구 한 건에 한 줄(종류 · N구 · 강도 · 최고), 메모는 한 줄.
 * - 아무것도 안 남긴 날: '10월 13일 (화)에는 남긴 투구가 없어요.' + '+ 이 날 투구 남기기'.
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const spokenDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};
const effortOf = (l: PitchLog) => ({ intensity: l.intensity ?? 0, effortPct: l.effortPct });

/** full — 넓은 창의 오른쪽 칸(메모를 줄이지 않는다) */
export function PitchDayPanel({ date, logs, full = false }: { date: string; logs: PitchLog[]; full?: boolean }) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const measured = useVelocityDays()?.[date];
  const open = () => router.push(`/pitch/${date}` as Href);

  if (!logs.length)
    return (
      <Animated.View entering={fadeIn} style={[styles.empty, { backgroundColor: withAlpha(c.chip, 0.5) }]}>
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>{spokenDate(date)}에는 남긴 투구가 없어요.</Text>
        <Press accessibilityRole="button" onPress={open} style={styles.addLink}>
          <Icon name="plus" size={16} color={c.skyStrong} />
          <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '600' }}>이 날 투구 남기기</Text>
        </Press>
      </Animated.View>
    );

  const throwing = logs.filter((l) => !isRestSession(l.sessionType));
  const pitches = throwing.reduce((n, l) => n + l.pitchCount, 0);
  const videos = throwing.reduce((n, l) => n + l.videoPaths.length, 0);
  const summary = [
    throwing.length ? `${pitches}구` : '쉬는 날',
    measured && measured.n > 0 ? `최고 ${formatSpeed(measured.max, speed)}` : null,
    videos ? `영상 ${videos}개` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View entering={fadeIn}>
      <Press
        accessibilityRole="link"
        accessibilityLabel={`${spokenDate(date)}, ${summary}. 그날 화면 열기`}
        onPress={open}
        style={[styles.panel, { backgroundColor: c.card, boxShadow: c.float }]}
      >
        <View style={styles.head}>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={{ color: c.ink, fontSize: 17, fontWeight: '700' }}>{spokenDate(date)}</Text>
            <Text style={{ color: c.muted, fontSize: 15 }}>{summary}</Text>
          </View>
          <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '600' }}>자세히</Text>
          <Icon name="chevron-right" size={18} color={c.skyStrong} />
        </View>
        {logs.map((l) => {
          const rest = isRestSession(l.sessionType);
          const eff = effortText(effortOf(l));
          return (
            <View key={l.id} style={[styles.row, { borderTopColor: c.line }]}>
              <View style={styles.rowTop}>
                <Text style={[styles.typeChip, { color: c.skyStrong, backgroundColor: c.skyTint }]}>{l.sessionType}</Text>
                <Text numberOfLines={1} style={{ flex: 1, color: c.ink, fontSize: 15 }}>
                  {rest ? (
                    <Text style={{ color: c.muted }}>던지지 않았어요</Text>
                  ) : (
                    <>
                      <Text style={{ fontWeight: '700' }}>{l.pitchCount}구</Text>
                      {eff ? ` · 강도 ${eff}` : ''}
                      {l.maxVelocity != null ? ` · 최고 ${formatSpeed(l.maxVelocity, speed)}` : ''}
                    </>
                  )}
                </Text>
              </View>
              {l.memo ? (
                <Text numberOfLines={full ? undefined : 1} style={{ color: c.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }}>
                  {l.memo}
                </Text>
              ) : null}
            </View>
          );
        })}
      </Press>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: 20, paddingHorizontal: 20, paddingVertical: 28, alignItems: 'center', gap: 8 },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 12, borderRadius: 12 },
  panel: { borderRadius: 20, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 20, paddingVertical: 14 },
  row: { paddingHorizontal: 20, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  typeChip: { fontSize: 13, fontWeight: '600', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, overflow: 'hidden' },
});
