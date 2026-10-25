import { useVideoPlayer, VideoView, type VideoPlayer } from 'expo-video';
import { useIsFocused } from 'expo-router';
import { createContext, useContext, useEffect, useRef, useState, type ComponentRef, type RefObject } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { createViewport, type CardState, type Viewport } from './viewport';
import { useScreenSettled } from '~/shell/transition';
import { useTabActive } from '~/shell/tab-pager';
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

/*
 * 영상이 많은 창(그날 기록)은 화면 가까이 온 영상만 재생기를 갖는다(pitch/viewport.ts — 위치는 붙을 때 · 배치가 바뀔 때만 재고 굴림은 셈만,
 * 가까운 순으로 하나씩, 동시에 4개까지, 두 화면 밖은 놓음). 창이 useViewport 로 하나 만들어 ScrollView 에 잇고 ViewportProvider 로 감싼다.
 * 감시가 없는 곳(홈 그날 칸 · 구속 칸)은 늘 재생기를 갖는다.
 */
const ViewportCtx = createContext<Viewport | null>(null);
export const ViewportProvider = ViewportCtx.Provider;
export function useViewport(): Viewport {
  const [v] = useState(() => createViewport());
  return v;
}

/** 이 칸이 재생기를 가질지(live) · 지금 화면에 걸쳐 있는지(visible) */
function useViewportSlot(box: RefObject<ComponentRef<typeof View> | null>, ready: boolean, pinned: boolean): CardState {
  const vp = useContext(ViewportCtx);
  const [state, setState] = useState<CardState>(() => (vp ? { live: false, visible: false } : { live: true, visible: true }));
  const pinRef = useRef(pinned);
  useEffect(() => {
    pinRef.current = pinned;
    vp?.update();
  }, [pinned, vp]);
  useEffect(() => {
    if (!vp || !ready) return;
    return vp.register({
      measure: (done) => {
        const el = box.current;
        const content = vp.content();
        if (!el || !content) return done(null);
        el.measureLayout(content as never, (_x, y, _w, h) => done({ y, h }), () => done(null));
      },
      set: setState,
      pinned: () => pinRef.current,
    });
  }, [vp, ready, box]);
  return state;
}

/*
 * 놓았다 다시 만든 재생기에 되살릴 것 — 영상 경로마다 재생 자리 · 배속 · 측정 그림(앱을 켠 동안만). 오래된 것부터 지워 100개까지만 둔다.
 */
type Kept = { time?: number; rate?: number; shapes?: Shape[]; drawing?: boolean; tool?: ToolKind; color?: string };
const kept = new Map<string, Kept>();
function keep(path: string, v: Kept) {
  const next = { ...kept.get(path), ...v };
  kept.delete(path);
  kept.set(path, next);
  if (kept.size > 100) kept.delete(kept.keys().next().value as string);
}

/** tools = 속도(¼ · ½ · 1배) · 한 장면 넘기기 줄 — 그날 기록의 영상(웹 day-record 의 PitchVideoPlayer, 처음 ½배) */
export function PitchVideo({ path, tools }: { path: string; tools?: boolean }) {
  const { uri, error } = useVideoUri(path);
  /*
   * 재생기는 창이 다 올라온 뒤에 만든다 — 영상마다 재생기를 여는 일이 창이 올라오는 움직임과 겹쳐 끊겼다(2026-10-24 전체 검토). 끝은 화면 넘김
   * 알림으로 본다(shell/transition.ts, 예전 350ms 어림)
   */
  const settled = useScreenSettled();
  const box = useRef<ComponentRef<typeof View>>(null);
  /* 전체 화면 · 측정 중이면 멀어져도 놓지 않는다 */
  const [pinned, setPinned] = useState(false);
  const { live, visible } = useViewportSlot(box, settled, pinned);
  const vp = useContext(ViewportCtx);
  /* 자리를 재는 칸은 늘 같은 View(collapsable: 납작해지면 잴 수 없다) — 크기가 바뀌면(재생기 · 도구 줄이 붙음) 다시 잰다 */
  return (
    <View ref={box} collapsable={false} onLayout={vp ? vp.remeasure : undefined}>
      {error ? (
        <View style={[styles.box, styles.center]}>
          <Text style={styles.note}>{error}</Text>
        </View>
      ) : !uri || !settled || !live ? (
        <View style={[styles.box, styles.center]}>
          <ActivityIndicator color="#fff" />
        </View>
      ) : tools ? (
        <ToolPlayer uri={uri} path={path} offscreen={!visible} onPin={setPinned} />
      ) : (
        <Player uri={uri} path={path} offscreen={!visible} onPin={setPinned} />
      )}
    </View>
  );
}

/** 이미 받은 주소(서명 주소 등)를 바로 튼다 */
/** start = 이 초부터(구속 클립 — 던진 시각 조금 앞, 웹 ClipPlayer), autoPlay = 열자마자 튼다(공 칩을 골랐을 때) */
export function UrlVideo({ uri, start, autoPlay }: { uri: string; start?: number | null; autoPlay?: boolean }) {
  return <Player uri={uri} start={start} autoPlay={autoPlay} />;
}

function Player({
  uri,
  path,
  start,
  autoPlay,
  offscreen = false,
  onPin,
}: {
  uri: string;
  path?: string;
  start?: number | null;
  autoPlay?: boolean;
  offscreen?: boolean;
  onPin?: (on: boolean) => void;
}) {
  const at = (path ? kept.get(path)?.time : undefined) ?? (start != null && start > 0 ? start : undefined);
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    if (at != null) p.currentTime = at;
    if (autoPlay) p.play();
  });
  usePauseWhenHidden(player, offscreen);
  useKeepTime(player, path);
  return (
    <VideoView
      player={player}
      style={styles.box}
      nativeControls
      contentFit="contain"
      onFullscreenEnter={() => onPin?.(true)}
      onFullscreenExit={() => onPin?.(false)}
    />
  );
}

/** 재생기를 놓을 때 재생 자리를 적어 둔다(다시 만들면 거기서) — 놓기는 정리가 다 끝난 뒤라 이때 읽을 수 있다 */
function useKeepTime(player: VideoPlayer, path: string | undefined) {
  useEffect(
    () => () => {
      const t = timeOf(player);
      if (path && t != null) keep(path, { time: t });
    },
    [player, path]
  );
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
  /* 화면이 닫힐 때는 재생기가 먼저 놓였을 수 있다 */
  try {
    p.pause();
  } catch {}
}
function playPlayer(p: VideoPlayer) {
  try {
    p.play();
  } catch {}
}
function isPlaying(p: VideoPlayer): boolean {
  try {
    return p.playing;
  } catch {
    return false;
  }
}
function timeOf(p: VideoPlayer): number | null {
  try {
    return p.currentTime;
  } catch {
    return null;
  }
}

/*
 * 안 보이는 영상은 멈춘다 — 위에 다른 화면이 쌓이거나(가려짐) 다른 탭 판으로 옮기면 멈췄다가 돌아오면 다시 틀고, 화면 밖으로 굴려 가면 멈춘다(굴려
 * 돌아와도 저절로 틀지 않는다 — 분석용 영상이라). 예전엔 소리 없는 되풀이 영상이 가려진 뒤에도 계속 돌았다(2026-10-25 화면 전환 점검).
 */
function usePauseWhenHidden(player: VideoPlayer, offscreen: boolean) {
  const active = useTabActive();
  const focused = useIsFocused();
  const hidden = !active || !focused;
  const resume = useRef(false);
  /* offscreen 은 돌아올 때 한 번만 본다(ref) — 효과가 offscreen 에 따라 다시 돌면 굴릴 때 되살렸다 */
  const off = useRef(offscreen);
  useEffect(() => {
    off.current = offscreen;
  });
  useEffect(() => {
    if (hidden) {
      if (isPlaying(player)) resume.current = true;
      pausePlayer(player);
    } else if (resume.current) {
      resume.current = false;
      if (!off.current) playPlayer(player);
    }
  }, [hidden, player]);
  useEffect(() => {
    if (offscreen) {
      resume.current = false;
      pausePlayer(player);
    }
  }, [offscreen, player]);
}

const RATES = [0.25, 0.5, 1] as const;
const RATE_TEXT: Record<(typeof RATES)[number], string> = { 0.25: '¼×', 0.5: '½×', 1: '1×' };

/*
 * 분석용 — 웹 PitchVideoPlayer 의 속도 · 프레임 넘기기 · 측정(선 · 각도 그리기, pitch/video-draw.tsx). 한 장면 = 1/60초(대부분 60fps 로
 * 찍는다 — 2분할 비교와 같다). 측정을 켜면 멈추고 기본 재생 단추를 끈다(손가락이 그림으로 가게). 크게 보기는 기본 재생기의 전체 화면 단추.
 */
function ToolPlayer({ uri, path, offscreen, onPin }: { uri: string; path: string; offscreen: boolean; onPin: (on: boolean) => void }) {
  const c = usePalette();
  /* 놓았다 다시 만든 재생기면 그때의 배속 · 자리 · 측정 그림부터(viewport.ts 가 멀어진 재생기를 놓는다) */
  const [was] = useState(() => kept.get(path) ?? {});
  const [rate, setRate] = useState<number>(was.rate ?? 0.5);
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.playbackRate = was.rate ?? 0.5;
    if (was.time != null) p.currentTime = was.time;
  });
  usePauseWhenHidden(player, offscreen);
  useKeepTime(player, path);
  const step = (dir: 1 | -1) => stepFrame(player, dir);
  const [drawing, setDrawing] = useState(was.drawing ?? false);
  const [tool, setTool] = useState<ToolKind>(was.tool ?? 'tilt');
  const [color, setColor] = useState(was.color ?? DRAW_COLORS[0]);
  const [shapes, setShapes] = useState<Shape[]>(was.shapes ?? []);
  const [full, setFull] = useState(false);
  useEffect(() => keep(path, { rate, drawing, tool, color, shapes }), [path, rate, drawing, tool, color, shapes]);
  /* 측정 중 · 전체 화면이면 멀어져도 재생기를 놓지 않는다 */
  useEffect(() => onPin(drawing || full), [drawing, full, onPin]);
  useEffect(() => () => onPin(false), [onPin]);
  return (
    <View style={{ gap: 8 }}>
      <View style={styles.box}>
        <VideoView
          player={player}
          style={StyleSheet.absoluteFill}
          nativeControls={!drawing}
          contentFit="contain"
          onFullscreenEnter={() => setFull(true)}
          onFullscreenExit={() => setFull(false)}
        />
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
