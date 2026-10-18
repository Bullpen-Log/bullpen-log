import { type Href, router } from 'expo-router';
import { Image } from 'expo-image';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { effortText } from '@/lib/pitch-effort';
import { isRestSession } from '@/lib/session-type';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { fadeIn, rowIn } from '~/shell/motion';
import { Press } from '~/shell/press';
import type { PitchLog } from './api';
import { repOf, setFeatured, thumbSource, useFeatured, usePathThumbs, useVelocityDays } from './store';
import { PitchVideo } from './video';

/**
 * 투구 탭 달력에서 날을 누르면 밑에 펴지는 그날 칸 — 웹 app/(app)/videos/video-calendar.tsx DayPanel 과 같다.
 * - 머리: '10월 13일 (화) · 22구 · 최고 132km/h' + '자세히 →'(그날 화면).
 * - 그날 남긴 투구 한 건에 한 줄(종류 칩 · N구 · 강도 · 최고, 메모 두 줄).
 * - 영상이 있으면 대표 영상(처음 올린 것)을 그 자리에서 튼다. 여럿이면 밑에 두 칸 작은 그림(영상 n · ★ 대표)으로 바꿔 본다.
 * - 아무것도 안 남긴 날: '10월 13일 (화)에는 남긴 투구가 없어요.' + '+ 이 날 투구 남기기'.
 */
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const spokenDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}월 ${d}일 (${WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]})`;
};
const effortOf = (l: PitchLog) => ({ intensity: l.intensity ?? 0, effortPct: l.effortPct });

export function PitchDayPanel({ date, logs }: { date: string; logs: PitchLog[] }) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const measured = useVelocityDays()?.[date];
  const throwing = logs.filter((l) => !isRestSession(l.sessionType));
  const paths = throwing.flatMap((l) => l.videoPaths);
  const rep = repOf(paths, useFeatured()[date]);
  const [tools, setTools] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const playing = picked && paths.includes(picked) ? picked : rep;
  const thumbs = usePathThumbs(paths.length > 1 ? paths : []);
  const rest = logs.length > 0 && throwing.length === 0;
  const pitches = throwing.reduce((n, l) => n + l.pitchCount, 0);

  if (!logs.length)
    return (
      <Animated.View entering={fadeIn} style={[styles.empty, { backgroundColor: withAlpha(c.chip, 0.5) }]}>
        <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center' }}>{spokenDate(date)}에는 남긴 투구가 없어요.</Text>
        <Press
          accessibilityRole="button"
          onPress={() => router.push(`/pitch/${date}` as Href)}
          style={styles.addLink}
        >
          <Icon name="plus" size={14} color={c.skyStrong} />
          <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '600' }}>이 날 투구 남기기</Text>
        </Press>
      </Animated.View>
    );

  const log = playing ? logs.find((l) => l.videoPaths.includes(playing)) : undefined;
  return (
    <Animated.View entering={fadeIn} style={[styles.panel, { backgroundColor: c.card, borderColor: c.line }]}>
      <View style={[styles.head, { borderBottomColor: c.line }]}>
        <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '700' }}>
          {spokenDate(date)}
          <Text style={{ color: c.muted, fontWeight: '400' }}>
            {rest ? ' · 쉬는 날' : ` · ${pitches}구`}
            {measured && measured.n > 0 ? ` · 최고 ${formatSpeed(measured.max, speed)}` : ''}
          </Text>
        </Text>
        <Press accessibilityRole="link" onPress={() => router.push(`/pitch/${date}` as Href)} style={styles.more}>
          <Text style={{ color: c.skyStrong, fontSize: 15, fontWeight: '600' }}>자세히</Text>
          <Icon name="arrow-right" size={14} color={c.skyStrong} />
        </Press>
      </View>

      {logs.map((l, i) => (
        <Animated.View key={l.id} entering={rowIn(i)} style={[styles.row, { borderBottomColor: c.line }]}>
          <View style={styles.rowTop}>
            <Text style={[styles.typeChip, { color: c.muted, backgroundColor: withAlpha(c.chip, 0.6) }]}>{l.sessionType}</Text>
            {isRestSession(l.sessionType) ? (
              <Text style={{ color: c.muted, fontSize: 15 }}>쉬는 날로 남김</Text>
            ) : (
              <Text style={{ color: c.ink, fontSize: 15, flexShrink: 1 }}>
                <Text style={{ fontWeight: '600' }}>{l.pitchCount}구</Text>
                <Text style={{ color: c.muted }}>
                  {effortText(effortOf(l)) ? ` · 강도 ${effortText(effortOf(l))}` : ''}
                  {l.maxVelocity != null ? ` · 최고 ${formatSpeed(l.maxVelocity, speed)}` : ''}
                </Text>
              </Text>
            )}
          </View>
          {l.memo ? (
            <Text numberOfLines={2} style={{ color: c.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>
              {l.memo}
            </Text>
          ) : null}
        </Animated.View>
      ))}

      {!playing ? (
        rest ? null : <Text style={{ color: c.muted, fontSize: 12, padding: 20 }}>이 날은 올린 영상이 없어요. 기록을 고칠 때 영상을 함께 올릴 수 있어요.</Text>
      ) : (
        <View style={{ padding: 20, gap: 12 }}>
          <PitchVideo key={playing} path={playing} />
          {/* 영상 관리 — 웹 DayPanel 휴대폰의 접힌 줄. 여럿인 날 지금 영상을 대표(★)로(달력 칸 · 홈 그날 칸이 그 영상을 띄운다) */}
          {paths.length > 1 ? (
            <View style={{ gap: 8 }}>
              <Press accessibilityRole="button" accessibilityState={{ expanded: tools }} onPress={() => setTools((v) => !v)} style={styles.toolsBtn}>
                <Text style={{ color: c.muted, fontSize: 12, fontWeight: '600' }}>영상 관리</Text>
                <View style={{ transform: [{ rotate: tools ? '180deg' : '0deg' }] }}>
                  <Icon name="chevron-down" size={14} color={c.muted} />
                </View>
              </Press>
              {tools ? (
                <Animated.View entering={fadeIn} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {playing !== rep ? (
                    <Press
                      accessibilityRole="button"
                      onPress={() => void setFeatured(date, playing)}
                      style={[styles.toolBtn, { borderColor: c.lineStrong, backgroundColor: c.card }]}
                    >
                      <Icon name="star" size={16} color={c.ink} />
                      <Text style={{ color: c.ink, fontSize: 15, fontWeight: '500' }}>이 영상을 대표로</Text>
                    </Press>
                  ) : (
                    <Text style={{ color: c.muted, fontSize: 12 }}>지금 영상이 대표예요. 달력 칸에 이 영상이 떠요.</Text>
                  )}
                </Animated.View>
              ) : null}
            </View>
          ) : null}
          {log && logs.length > 1 ? (
            <Text style={{ color: c.muted, fontSize: 12 }}>
              {paths.length > 1 ? `영상 ${paths.indexOf(playing) + 1} · ` : ''}
              {log.sessionType} · {log.pitchCount}구{effortText(effortOf(log)) ? ` · 강도 ${effortText(effortOf(log))}` : ''}
            </Text>
          ) : null}
          {paths.length > 1 ? (
            <View style={styles.grid}>
              {paths.map((p, i) => {
                const on = p === playing;
                return (
                  <Animated.View key={p} entering={rowIn(i)} style={styles.gridCell}>
                    <Press
                      select
                      selected={on}
                      accessibilityLabel={`영상 ${i + 1}${p === rep ? ', 대표' : ''}`}
                      accessibilityState={{ selected: on }}
                      onPress={() => setPicked(p)}
                      style={[styles.thumbBtn, { borderColor: on ? c.sky : c.line }, on && { boxShadow: `0 0 0 1px ${c.sky}` }]}
                    >
                      <View style={[styles.thumb, { backgroundColor: withAlpha(c.chip, 0.5) }]}>
                        {thumbs[p] ? (
                          <Image source={thumbSource(thumbs[p])} contentFit="cover" transition={300} style={StyleSheet.absoluteFill} />
                        ) : (
                          <Icon name="film" size={16} color={withAlpha(c.sky, 0.7)} />
                        )}
                      </View>
                      <View style={styles.thumbFoot}>
                        <Text style={{ fontSize: 12, color: on ? c.ink : c.muted, fontWeight: on ? '600' : '400' }}>영상 {i + 1}</Text>
                        {p === rep ? (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                            <Icon name="star" size={12} color={c.skyStrong} fill={c.skyStrong} />
                            <Text style={{ fontSize: 12, color: c.skyStrong, fontWeight: '600' }}>대표</Text>
                          </View>
                        ) : null}
                      </View>
                    </Press>
                  </Animated.View>
                );
              })}
            </View>
          ) : null}
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  empty: { borderRadius: 20, paddingHorizontal: 20, paddingVertical: 32, alignItems: 'center', gap: 8 },
  addLink: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, paddingHorizontal: 12, borderRadius: 12 },
  panel: { borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  more: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, marginVertical: -4, paddingHorizontal: 8, borderRadius: 12 },
  row: { paddingHorizontal: 20, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' },
  typeChip: { fontSize: 11, fontWeight: '600', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -4 },
  gridCell: { width: '50%', padding: 4 },
  thumbBtn: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  thumb: { aspectRatio: 16 / 9, alignItems: 'center', justifyContent: 'center' },
  toolsBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 40, marginVertical: -4, alignSelf: 'flex-start' },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  thumbFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8, paddingVertical: 6 },
});
