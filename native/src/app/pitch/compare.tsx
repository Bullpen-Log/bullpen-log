import { router } from 'expo-router';
import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePalette } from '~/lib/ui';
import { dateKeyOf } from '~/pitch/api';
import { useAllLogs } from '~/pitch/store';
import { useVideoUri } from '~/pitch/video';

/**
 * 2분할 비교(앱) — 웹 투구 탭의 '2분할 비교'와 같은 일: 영상 둘을 골라 나란히 튼다. 같이 재생 · 멈춤 · 처음으로 · 느리게(½ · ¼),
 * 한쪽만 눌러 멈추면 다른 쪽만 돌려 던지는 순간을 맞춘다. 웹의 장면 넘기기 · 크게 보기는 아직 없다.
 */
type Pick = { key: string; path: string; label: string };
const RATES = [1, 0.5, 0.25] as const;

export default function PitchCompareScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const all = useAllLogs(true);
  const [picked, setPicked] = useState<Pick[]>([]);
  const [comparing, setComparing] = useState(false);

  const videos = useMemo(
    () =>
      [...(all.logs ?? [])]
        .reverse()
        .flatMap((l) =>
          l.videoPaths.map((path, i) => ({
            key: `${l.id}:${i}`,
            path,
            label: `${Number(dateKeyOf(l.date).slice(5, 7))}/${Number(dateKeyOf(l.date).slice(8))} ${l.sessionType}${
              l.videoPaths.length > 1 ? ` · 영상 ${i + 1}` : ''
            }`,
          }))
        ),
    [all.logs]
  );

  const toggle = (v: Pick) =>
    setPicked((p) => (p.some((x) => x.key === v.key) ? p.filter((x) => x.key !== v.key) : p.length >= 2 ? [p[1], v] : [...p, v]));

  return (
    <View style={{ flex: 1, backgroundColor: comparing ? '#000' : c.page }}>
      <View style={[styles.bar, { paddingTop: inset.top + 8 }]}>
        <Pressable accessibilityRole="button" onPress={() => (comparing ? setComparing(false) : router.back())} hitSlop={10}>
          <Text style={[styles.barAction, { color: comparing ? '#fff' : c.sky }]}>{comparing ? '‹ 다시 고르기' : '‹ 투구 기록'}</Text>
        </Pressable>
        <Text style={[styles.barTitle, { color: comparing ? '#fff' : c.ink }]}>2분할 비교</Text>
        <View style={{ width: 80 }} />
      </View>
      {comparing && picked.length === 2 ? (
        <Compare a={picked[0]} b={picked[1]} bottom={inset.bottom} />
      ) : (
        <>
          <ScrollView contentContainerStyle={{ padding: 16, gap: 8, paddingBottom: inset.bottom + 96 }}>
            <Text style={{ color: c.muted, fontSize: 15 }}>견줄 영상 둘을 골라 주세요.</Text>
            {!all.logs ? <ActivityIndicator style={{ marginTop: 24 }} /> : null}
            {all.logs && videos.length === 0 ? (
              <Text style={{ color: c.muted, fontSize: 15, paddingVertical: 24, textAlign: 'center' }}>영상이 붙은 기록이 없어요.</Text>
            ) : null}
            {videos.map((v) => {
              const n = picked.findIndex((x) => x.key === v.key);
              return (
                <Pressable
                  key={v.key}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: n >= 0 }}
                  onPress={() => toggle(v)}
                  style={[styles.row, { backgroundColor: c.card }]}
                >
                  <View style={[styles.check, { borderColor: n >= 0 ? c.sky : c.line, backgroundColor: n >= 0 ? c.sky : 'transparent' }]}>
                    {n >= 0 ? <Text style={styles.checkText}>{n + 1}</Text> : null}
                  </View>
                  <Text style={{ flex: 1, color: c.ink, fontSize: 15, fontWeight: '600' }}>{v.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={[styles.footer, { paddingBottom: inset.bottom + 12, backgroundColor: c.page }]}>
            <Pressable
              accessibilityRole="button"
              disabled={picked.length < 2}
              onPress={() => setComparing(true)}
              style={[styles.primary, { backgroundColor: c.sky }, picked.length < 2 && { opacity: 0.4 }]}
            >
              <Text style={styles.primaryText}>{picked.length < 2 ? `${picked.length}/2 골랐어요` : '나란히 보기'}</Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
  );
}

function Compare({ a, b, bottom }: { a: Pick; b: Pick; bottom: number }) {
  const ua = useVideoUri(a.path);
  const ub = useVideoUri(b.path);
  const pa = useVideoPlayer(ua.uri, (p) => setup(p));
  const pb = useVideoPlayer(ub.uri, (p) => setup(p));
  const [rate, setRate] = useState<number>(1);
  const both = [pa, pb];

  const playAll = () => {
    const anyPlaying = both.some((p) => p.playing);
    both.forEach((p) => (anyPlaying ? p.pause() : p.play()));
  };
  const restart = () =>
    both.forEach((p) => {
      p.currentTime = 0;
      p.play();
    });
  const changeRate = (r: number) => {
    setRate(r);
    both.forEach((p) => (p.playbackRate = r));
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.split}>
        <Side player={pa} label={a.label} error={ua.error} ready={!!ua.uri} />
        <Side player={pb} label={b.label} error={ub.error} ready={!!ub.uri} />
      </View>
      <View style={[styles.controls, { paddingBottom: bottom + 12 }]}>
        <View style={styles.rates}>
          {RATES.map((r) => (
            <Pressable
              key={r}
              accessibilityRole="radio"
              accessibilityState={{ selected: rate === r }}
              onPress={() => changeRate(r)}
              style={[styles.rate, rate === r && styles.rateOn]}
            >
              <Text style={[styles.rateText, rate === r && { color: '#000' }]}>{r === 1 ? '1×' : r === 0.5 ? '½×' : '¼×'}</Text>
            </Pressable>
          ))}
        </View>
        <View style={styles.rates}>
          <Pressable accessibilityRole="button" onPress={restart} style={[styles.ctl, { flex: 1 }]}>
            <Text style={styles.ctlText}>처음으로</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={playAll} style={[styles.ctl, styles.ctlMain, { flex: 1 }]}>
            <Text style={[styles.ctlText, { color: '#000' }]}>같이 재생 · 멈춤</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>한쪽만 누르면 그쪽만 멈춰요. 던지는 순간을 맞춘 뒤 같이 재생하세요.</Text>
      </View>
    </View>
  );
}

function setup(p: VideoPlayer) {
  p.muted = true;
  p.loop = true;
}

function Side({ player, label, error, ready }: { player: VideoPlayer; label: string; error: string | null; ready: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label} 재생 · 멈춤`}
      onPress={() => (player.playing ? player.pause() : player.play())}
      style={styles.side}
    >
      {error ? (
        <Text style={styles.note}>{error}</Text>
      ) : ready ? (
        <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" />
      ) : (
        <ActivityIndicator color="#fff" />
      )}
      <Text style={styles.sideLabel} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 8 },
  barAction: { fontSize: 17, width: 110 },
  barTitle: { fontSize: 17, fontWeight: '600' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, borderRadius: 14, paddingHorizontal: 14 },
  check: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  checkText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: 16, paddingTop: 12 },
  primary: { height: 50, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  split: { flex: 1, flexDirection: 'row', gap: 2 },
  side: { flex: 1, backgroundColor: '#111', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  sideLabel: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    color: '#fff',
    fontSize: 13,
    fontWeight: '600',
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowRadius: 3,
  },
  note: { color: 'rgba(255,255,255,0.8)', fontSize: 13, textAlign: 'center', padding: 12 },
  controls: { paddingHorizontal: 16, paddingTop: 12, gap: 10 },
  rates: { flexDirection: 'row', gap: 8 },
  rate: { flex: 1, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  rateOn: { backgroundColor: '#fff' },
  rateText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  ctl: { height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.14)' },
  ctlMain: { backgroundColor: '#fff' },
  ctlText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  hint: { color: 'rgba(255,255,255,0.6)', fontSize: 13, textAlign: 'center' },
});
