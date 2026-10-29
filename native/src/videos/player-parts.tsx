import { type VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { isPhoneVideoPath, phoneAssetId } from '@/lib/phone-video-path';
import { usePalette, withAlpha } from '~/lib/ui';
import { serverVideoUrls } from '~/pitch/api';
import { LocalVideo } from '../../modules/local-video';

/**
 * 내 영상 상세 · 비교의 재생 부품(2026-10-29) — 재생 주소(다시 받기 포함) · 화면 비율 · 탐색 막대 · 재생기 값 바꾸기.
 * 그날 기록 · 홈이 쓰는 pitch/video.tsx(PitchVideo)는 그대로 두고, 여기선 상세 · 비교가 필요한 것(직접 그린 조작 · 실패 가르기)만.
 */

/**
 * 틀 수 있는 주소 — 폰 영상은 앱 안 파일(없으면 missing: 이 기기에 없음 — 다시 받아도 안 생긴다), 서버 영상은 서명 주소(못 받으면 server: 다시 받기로 회복,
 * 서버가 그 경로를 모르면 gone). attempt 를 올리면 새로 받는다(서명 주소 만료 · 일시 오류).
 */
export type SourceError = { kind: 'missing' | 'server' | 'gone'; message: string };
export function useVideoSource(path: string | null, attempt = 0): { uri: string | null; error: SourceError | null; loading: boolean } {
  const [state, setState] = useState<{ key: string | null; uri: string | null; error: SourceError | null }>({ key: null, uri: null, error: null });
  const key = path ? `${path}#${attempt}` : null;
  useEffect(() => {
    if (!path || !key) return;
    let alive = true;
    const phone = isPhoneVideoPath(path);
    const job = phone ? LocalVideo.fileUrl({ id: phoneAssetId(path) }).then((r) => r.url) : serverVideoUrls([path]).then((m) => m[path] ?? Promise.reject(new Error('gone')));
    job.then(
      (u) => alive && setState({ key, uri: u, error: null }),
      (e: unknown) =>
        alive &&
        setState({
          key,
          uri: null,
          error: phone
            ? { kind: 'missing', message: '이 영상은 이 기기에 없어요. 찍은 기기의 싱커 앱에서 볼 수 있어요.' }
            : e instanceof Error && e.message === 'gone'
              ? { kind: 'gone', message: '영상 파일을 찾지 못했어요. 지웠거나 볼 수 없는 영상일 수 있어요.' }
              : { kind: 'server', message: '영상을 불러오지 못했어요. 신호를 확인하고 다시 시도해 주세요.' },
        })
    );
    return () => {
      alive = false;
    };
  }, [path, key]);
  return state.key === key ? { uri: state.uri, error: state.error, loading: false } : { uri: null, error: null, loading: !!key };
}

/**
 * 화면 비율(가로 ÷ 세로) — 재생기가 알리는 장면 크기(videoTrack.size)는 회전 표시를 뺀 원본 크기라 아이폰 세로 영상이 가로로 읽힌다.
 * 그래서 재생 준비 뒤 작은 장면 그림 하나를 뽑아(회전을 적용해 만든다 — expo-video VideoThumbnailGenerator) 그 비율을 쓴다. 못 뽑으면 null.
 */
export function useDisplayAspect(player: VideoPlayer | null, ready: boolean): number | null {
  const [aspect, setAspect] = useState<{ p: VideoPlayer | null; a: number | null }>({ p: null, a: null });
  useEffect(() => {
    if (!player || !ready) return;
    let alive = true;
    player.generateThumbnailsAsync([0], { maxWidth: 96 }).then(
      (t) => {
        const th = t[0];
        if (alive && th && th.width > 0 && th.height > 0) setAspect({ p: player, a: th.width / th.height });
      },
      () => undefined
    );
    return () => {
      alive = false;
    };
  }, [player, ready]);
  return aspect.p === player ? aspect.a : null;
}

/* 재생기 값은 훅 밖 함수에서 바꾼다(컴포넌트 안에서 훅 값을 바꾸면 린트가 막는다) — 닫히는 중엔 재생기가 먼저 놓였을 수 있어 감싼다 */
export const playerCall = {
  play(p: VideoPlayer | null) {
    try {
      p?.play();
    } catch {}
  },
  pause(p: VideoPlayer | null) {
    try {
      p?.pause();
    } catch {}
  },
  seek(p: VideoPlayer | null, t: number) {
    try {
      if (p) p.currentTime = Math.max(0, t);
    } catch {}
  },
  rate(p: VideoPlayer | null, r: number) {
    try {
      if (p) p.playbackRate = r;
    } catch {}
  },
  time(p: VideoPlayer | null): number {
    try {
      return p?.currentTime ?? 0;
    } catch {
      return 0;
    }
  },
  setup(p: VideoPlayer, rate: number) {
    p.muted = true;
    p.loop = false;
    p.playbackRate = rate;
    p.timeUpdateEventInterval = 0.1;
  },
};

export const RATES = [0.25, 0.5, 1] as const;
export const rateText = (r: number) => (r === 0.25 ? '0.25×' : r === 0.5 ? '0.5×' : '1×');
export const secText = (s: number | null) => {
  if (s == null || !Number.isFinite(s)) return '—';
  const v = Math.max(0, Math.round(s));
  return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, '0')}`;
};

/**
 * 탐색 막대 — 끌거나 눌러 자리를 옮긴다. 끄는 동안 값은 손가락을 따르고(onSeek 는 잦지 않게), 놓을 때 마지막 자리로 한 번 더.
 * 화면 읽기에선 조절 가능(adjustable) — 올리기 · 내리기가 step 만큼. 시간 글은 매 장면 읽히지 않게 accessibilityValue 로만.
 */
export function Scrubber({
  value,
  min = 0,
  max,
  onSeek,
  onStart,
  onEnd,
  step,
  label,
  valueText,
  disabled,
}: {
  value: number;
  min?: number;
  max: number;
  onSeek: (t: number) => void;
  onStart?: () => void;
  onEnd?: (t: number) => void;
  step: number;
  label: string;
  valueText: string;
  disabled?: boolean;
}) {
  const c = usePalette();
  const [w, setW] = useState(0);
  const [drag, setDrag] = useState<number | null>(null);
  const [soft] = useState(() => throttle(60));
  const span = Math.max(1e-6, max - min);
  const at = (x: number) => min + Math.min(1, Math.max(0, x / Math.max(1, w))) * span;
  const seekSoft = (t: number) => soft(() => onSeek(t));
  const pan = Gesture.Pan()
    .runOnJS(true)
    .enabled(!disabled && w > 0)
    .minDistance(0)
    .onBegin((e) => {
      onStart?.();
      const t = at(e.x);
      setDrag(t);
      onSeek(t);
    })
    .onUpdate((e) => {
      const t = at(e.x);
      setDrag(t);
      seekSoft(t);
    })
    .onFinalize((e) => {
      const t = at(e.x);
      setDrag(null);
      onSeek(t);
      onEnd?.(t);
    });
  const v = drag ?? value;
  const frac = Math.min(1, Math.max(0, (v - min) / span));
  const onAction = (e: AccessibilityActionEvent) => {
    const t = Math.min(max, Math.max(min, value + (e.nativeEvent.actionName === 'increment' ? step : -step)));
    onSeek(t);
    onEnd?.(t);
  };
  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ text: valueText }}
        accessibilityState={{ disabled }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={onAction}
        onLayout={(e) => setW(e.nativeEvent.layout.width)}
        style={[st.hit, disabled && { opacity: 0.4 }]}
      >
        <View style={[st.track, { backgroundColor: withAlpha(c.ink, 0.12) }]}>
          <View style={[st.fill, { width: `${frac * 100}%`, backgroundColor: c.action }]} />
        </View>
        <View pointerEvents="none" style={[st.thumb, { left: frac * w - 11, backgroundColor: c.action, borderColor: c.card }]} />
      </View>
    </GestureDetector>
  );
}

/* 끄는 동안 재생기에 자리를 너무 자주 보내지 않게 — 이 간격 안에 온 것은 건너뛴다(놓을 때 마지막 자리는 따로 보낸다) */
function throttle(ms: number) {
  let last = 0;
  return (run: () => void) => {
    const now = Date.now();
    if (now - last > ms) {
      last = now;
      run();
    }
  };
}

/** 두 끝의 시간 글(막대 밑) */
export function ScrubLabels({ left, right }: { left: string; right: string }) {
  const c = usePalette();
  return (
    <View style={st.labels}>
      <Text maxFontSizeMultiplier={1.6} style={[st.labelText, { color: c.muted }]}>
        {left}
      </Text>
      <Text maxFontSizeMultiplier={1.6} style={[st.labelText, { color: c.muted }]}>
        {right}
      </Text>
    </View>
  );
}

const st = StyleSheet.create({
  hit: { height: 44, justifyContent: 'center' },
  track: { height: 6, borderRadius: 3, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3 },
  thumb: { position: 'absolute', top: 11, width: 22, height: 22, borderRadius: 11, borderWidth: 3 },
  labels: { flexDirection: 'row', justifyContent: 'space-between', marginTop: -6 },
  labelText: { fontSize: 12, fontVariant: ['tabular-nums'] },
});
