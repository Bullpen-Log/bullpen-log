import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { DRAW_COLORS, DrawLayer, DrawToolbar, type Shape, type ToolKind } from './video-draw';
import { LocalVideo } from '../../modules/local-video';
import { isPhoneVideoPath, phoneAssetId, serverVideoUrls } from './api';

/**
 * 투구 영상 하나 — 폰 영상(`{userId}/local-…`)은 앱 안 영상 폴더의 파일을 바로, 서버 영상은 서명 주소로 튼다. 폰에 없으면(다른 폰 · 앱을
 * 다시 깔아 지워짐) 웹과 같은 말을 보인다.
 */
/*
 * 같은 때 붙은 영상들의 서버 주소는 한 번에 묻는다 — 그날 창에 영상이 셋이면 예전엔 세 번 따로 물었다(2026-10-24 전체 검토)
 */
let waiting: { path: string; resolve: (u: string) => void; reject: (e: unknown) => void }[] = [];
function batchedServerUrl(path: string): Promise<string> {
  return new Promise((resolve, reject) => {
    waiting.push({ path, resolve, reject });
    if (waiting.length > 1) return;
    queueMicrotask(() => {
      const batch = waiting;
      waiting = [];
      serverVideoUrls([...new Set(batch.map((b) => b.path))]).then(
        (urls) => batch.forEach((b) => (urls[b.path] ? b.resolve(urls[b.path]) : b.reject(new Error('영상을 찾지 못했어요')))),
        (e: unknown) => batch.forEach((b) => b.reject(e))
      );
    });
  });
}

/** 영상 경로 → 틀 수 있는 주소(폰 영상은 앱 안 파일, 서버 영상은 서명 주소) — 그날 화면 · 2분할 비교가 같이 쓴다 */
export function useVideoUri(path: string | null): { uri: string | null; error: string | null } {
  const [state, setState] = useState<{ path: string | null; uri: string | null; error: string | null }>({ path: null, uri: null, error: null });

  useEffect(() => {
    if (!path) return;
    let alive = true;
    const job = isPhoneVideoPath(path)
      ? LocalVideo.fileUrl({ id: phoneAssetId(path) }).then((r) => r.url)
      : batchedServerUrl(path);
    job.then(
      (u) => alive && setState({ path, uri: u, error: null }),
      () =>
        alive &&
        setState({
          path,
          uri: null,
          error: isPhoneVideoPath(path) ? '이 영상은 이 폰에 없어요. 찍은 폰의 싱커 앱에서 볼 수 있어요.' : '영상을 불러오지 못했어요.',
        })
    );
    return () => {
      alive = false;
    };
  }, [path]);

  /* 경로가 바뀐 뒤 새 주소가 오기 전에는 옛 주소를 안 보인다 */
  return state.path === path ? { uri: state.uri, error: state.error } : { uri: null, error: null };
}

/** 창이 올라오는 움직임 길이 어림 — ponytail: 화면 끝 알림(transitionEnd)을 받게 되면 그때 바꾼다 */
const SETTLE_MS = 350;

/** tools = 속도(¼ · ½ · 1배) · 한 장면 넘기기 줄 — 그날 기록의 영상(웹 day-record 의 PitchVideoPlayer, 처음 ½배) */
export function PitchVideo({ path, tools }: { path: string; tools?: boolean }) {
  const { uri, error } = useVideoUri(path);
  /* 재생기는 창이 다 올라온 뒤에 만든다 — 영상마다 재생기를 여는 일이 창이 올라오는 움직임과 겹쳐 끊겼다(2026-10-24 전체 검토) */
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSettled(true), SETTLE_MS);
    return () => clearTimeout(t);
  }, []);
  if (error)
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.note}>{error}</Text>
      </View>
    );
  if (!uri || !settled)
    return (
      <View style={[styles.box, styles.center]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  return tools ? <ToolPlayer uri={uri} /> : <Player uri={uri} />;
}

/** 이미 받은 주소(서명 주소 등)를 바로 튼다 */
/** start = 이 초부터(구속 클립 — 던진 시각 조금 앞, 웹 ClipPlayer), autoPlay = 열자마자 튼다(공 칩을 골랐을 때) */
export function UrlVideo({ uri, start, autoPlay }: { uri: string; start?: number | null; autoPlay?: boolean }) {
  return <Player uri={uri} start={start} autoPlay={autoPlay} />;
}

function Player({ uri, start, autoPlay }: { uri: string; start?: number | null; autoPlay?: boolean }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    if (start != null && start > 0) p.currentTime = start;
    if (autoPlay) p.play();
  });
  return <VideoView player={player} style={styles.box} nativeControls contentFit="contain" />;
}

/* 재생기 값은 훅 밖 함수에서 바꾼다(2분할 비교의 nudge 와 같다 — 컴포넌트 안에서 훅 값을 바꾸면 린트가 막는다) */
function stepFrame(p: VideoPlayer, dir: 1 | -1) {
  p.pause();
  p.currentTime = Math.max(0, p.currentTime + dir / 60);
}
function setPlayerRate(p: VideoPlayer, r: number) {
  p.playbackRate = r;
}
function pausePlayer(p: VideoPlayer) {
  p.pause();
}
const RATES = [0.25, 0.5, 1] as const;
const RATE_TEXT: Record<(typeof RATES)[number], string> = { 0.25: '¼×', 0.5: '½×', 1: '1×' };

/*
 * 분석용 — 웹 PitchVideoPlayer 의 속도 · 프레임 넘기기 · 측정(선 · 각도 그리기, pitch/video-draw.tsx). 한 장면 = 1/60초(대부분 60fps 로
 * 찍는다 — 2분할 비교와 같다). 측정을 켜면 멈추고 기본 재생 단추를 끈다(손가락이 그림으로 가게). 크게 보기는 기본 재생기의 전체 화면 단추.
 */
function ToolPlayer({ uri }: { uri: string }) {
  const c = usePalette();
  const [rate, setRate] = useState<number>(0.5);
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.playbackRate = 0.5;
  });
  const step = (dir: 1 | -1) => stepFrame(player, dir);
  const [drawing, setDrawing] = useState(false);
  const [tool, setTool] = useState<ToolKind>('tilt');
  const [color, setColor] = useState(DRAW_COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>([]);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.box}>
        <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls={!drawing} contentFit="contain" />
        <DrawLayer shapes={shapes} onCommit={(sh) => setShapes((list) => [...list, sh])} tool={tool} color={color} enabled={drawing} />
      </View>
      {drawing ? (
        <DrawToolbar
          tool={tool}
          onTool={setTool}
          color={color}
          onColor={setColor}
          onUndo={() => setShapes((list) => list.slice(0, -1))}
          onClear={() => setShapes([])}
          canUndo={shapes.length > 0}
        />
      ) : null}
      <View style={styles.tools}>
        <Press accessibilityRole="button" accessibilityLabel="한 프레임 뒤로" onPress={() => step(-1)} style={[styles.tool, { backgroundColor: c.chip }]}>
          <Icon name="chevron-left" size={18} color={c.ink} />
        </Press>
        <Press accessibilityRole="button" accessibilityLabel="한 프레임 앞으로" onPress={() => step(1)} style={[styles.tool, { backgroundColor: c.chip }]}>
          <Icon name="chevron-right" size={18} color={c.ink} />
        </Press>
        <Press
          select
          selected={drawing}
          accessibilityRole="button"
          accessibilityLabel="측정"
          accessibilityState={{ selected: drawing }}
          onPress={() => {
            if (!drawing) pausePlayer(player);
            setDrawing(!drawing);
          }}
          style={[styles.tool, styles.measure, { backgroundColor: drawing ? c.sky : c.chip }]}
        >
          <Icon name="ruler" size={15} color={drawing ? '#fff' : c.ink} />
          <Text style={{ color: drawing ? '#fff' : c.ink, fontSize: 13, fontWeight: '600' }}>측정</Text>
        </Press>
        <View style={{ flex: 1 }} />
        {RATES.map((r) => (
          <Press
            key={r}
            select
            selected={rate === r}
            accessibilityRole="radio"
            accessibilityLabel={`${r}배 속도`}
            accessibilityState={{ selected: rate === r }}
            onPress={() => {
              setRate(r);
              setPlayerRate(player, r);
            }}
            style={[styles.tool, { backgroundColor: rate === r ? c.ink : c.chip }]}
          >
            <Text style={{ color: rate === r ? c.page : c.ink, fontSize: 13, fontWeight: '600' }}>{RATE_TEXT[r]}</Text>
          </Press>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tools: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tool: { minWidth: 44, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  measure: { flexDirection: 'row', gap: 4 },
  box: { width: '100%', aspectRatio: 9 / 16, maxHeight: 420, alignSelf: 'center', borderRadius: 16, backgroundColor: '#000', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  note: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center' },
});
