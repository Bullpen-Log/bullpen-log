import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { pitchTypeLabel } from '@/lib/velocity-meta';
import { formatSpeed } from '@/lib/units';
import { usePrefs } from '~/lib/prefs';
import { usePalette, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { isPhoneVideoPath } from '~/pitch/api';
import { useVelocityDayState } from '~/pitch/velocity-day';
import { PitchVideo, UrlVideo } from '~/pitch/video';

/**
 * 홈 그날 칸의 영상 — 그날 카메라로 잰 공의 클립을 공마다 그 자리에서 튼다(웹 app/(app)/today/velocity-clips.tsx).
 * 한 번에 하나: 고른 공의 영상이 위에(던진 시각 조금 앞부터), 밑에 공 칩(옆으로 민다). 칩을 골랐을 때만 저절로 튼다.
 * 공을 고치거나 지우는 것은 그날 화면에서.
 */
export function VelocityClips({ date }: { date: string }) {
  const c = usePalette();
  const speed = usePrefs().speed;
  const [reload, setReload] = useState(0);
  const { data, failed } = useVelocityDayState(date, reload);
  const [pickedId, setPicked] = useState<string | null>(null);
  const [played, setPlayed] = useState(false);
  const items = (data?.sessions ?? []).flatMap((s) => s.pitches.filter((p) => p.clip?.url).map((p) => ({ p, clip: p.clip! })));
  if (!data && !failed) return <Text style={{ color: c.muted, fontSize: 13 }}>영상을 불러오는 중…</Text>;
  const picked = items.find((it) => it.p.id === pickedId) ?? items[0];
  if (!picked)
    return (
      <View style={[styles.reload, { backgroundColor: withAlpha(c.chip, 0.5) }]}>
        <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center', lineHeight: 18 }}>영상을 불러오지 못했어요. 화면을 오래 켜 두면 영상 주소가 만료돼요.</Text>
        <Press accessibilityRole="button" onPress={() => setReload((n) => n + 1)} style={[styles.reloadBtn, { backgroundColor: c.card }]}>
          <Icon name="rotate-cw" size={16} color={c.ink} />
          <Text style={{ color: c.ink, fontSize: 15, fontWeight: '600' }}>다시 불러오기</Text>
        </Press>
      </View>
    );
  const start = picked.clip.eventSec != null ? Math.max(0, picked.clip.eventSec - 0.6) : null;
  const type = pitchTypeLabel(picked.p.pitchType);
  return (
    <View style={{ gap: 12 }}>
      <Text style={{ color: c.muted, fontSize: 13, fontWeight: '400' }}>구속 측정 영상 {items.length}개</Text>
      <View style={{ gap: 6 }}>
        {isPhoneVideoPath(picked.clip.url) ? (
          <PitchVideo key={picked.p.id} path={picked.clip.url} />
        ) : (
          <UrlVideo key={picked.p.id} uri={picked.clip.url} start={start} autoPlay={played} />
        )}
        <Text style={{ color: c.muted, fontSize: 13, textAlign: 'center', fontVariant: ['tabular-nums'] }}>
          {picked.p.seq}번째 공 · {formatSpeed(picked.p.kmh, speed)}
          {type ? ` · ${type}` : ''}
        </Text>
      </View>
      {items.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }} accessibilityLabel="볼 공 고르기">
          {items.map((it) => {
            const on = it === picked;
            return (
              <Press
                key={it.p.id}
                select
                selected={on}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => {
                  setPicked(it.p.id);
                  setPlayed(true);
                }}
                style={[styles.chip, on ? { borderColor: c.sky, backgroundColor: c.skyTint } : { borderColor: c.line, backgroundColor: c.card }]}
              >
                <Text style={{ color: c.muted, fontSize: 13 }}>{it.p.seq}</Text>
                <Text style={{ color: on ? c.link : c.ink, fontSize: 15, fontWeight: on ? '700' : '400', fontVariant: ['tabular-nums'] }}>
                  {formatSpeed(it.p.kmh, speed)}
                </Text>
              </Press>
            );
          })}
        </ScrollView>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: 14, borderRadius: 20, borderWidth: 1 },
  reload: { alignItems: 'center', gap: 12, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 24 },
  reloadBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 40, paddingHorizontal: 16, borderRadius: 20 },
});
