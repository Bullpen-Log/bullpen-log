import { useEvent, useEventListener } from 'expo';
import { Image } from 'expo-image';
import * as ScreenOrientation from 'expo-screen-orientation';
import { SymbolView } from 'expo-symbols';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActionSheetIOS, ActivityIndicator, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TYPE, usePalette, withAlpha } from '~/lib/ui';
import { thumbSource, usePathThumbs, type Thumb } from '~/pitch/store';
import { usePauseWhenHidden } from '~/pitch/video';
import { DRAW_COLORS, DrawLayer, DrawToolbar, type Shape, type ToolKind } from '~/pitch/video-draw';
import { useScreenSettled } from '~/shell/transition';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { sceneStep } from './compare-math';
import { RATES, Scrubber, ScrubLabels, playerCall, rateText, secText, useDisplayAspect, useVideoSource } from './player-parts';

/**
 * 내 영상 상세의 재생기(2026-10-29 시안) — 처음엔 장면 그림만(저절로 틀지 않음), 화면 넘김이 끝난 뒤 재생기를 만든다(useScreenSettled).
 * 영상 칸은 실제 화면 비율로(자르지 않음 · 레터박스 없이) 크기 상한 안에서, 밑에 탐색 막대 · 이전/다음 장면 · 재생 · 배속, 칸 안에 크게 보기.
 * 선 · 각도(drawing)를 켜면 멈추고 도구를 펼친다 — 완료는 도구를 접을 뿐 그린 참고선은 남는다(앱을 켠 동안만, 저장하지 않음).
 * 파일 상태를 가른다: 이 기기에 없음(다시 받아도 안 생김) · 서버에서 못 받음(다시 시도 — 주소를 새로 받음) · 파일 없음 · 재생기 오류.
 */
export type PlayerAvail = 'loading' | 'ready' | 'missing' | 'server' | 'gone' | 'player';

type Kept = { shapes: Shape[]; tool: ToolKind; color: string; rate: number };
const kept = new Map<string, Kept>();
const keepOf = (path: string): Kept => kept.get(path) ?? { shapes: [], tool: 'tilt', color: DRAW_COLORS[0], rate: 0.5 };

export function DetailPlayer({
  path,
  drawing,
  onDrawingDone,
  onAvail,
}: {
  path: string;
  drawing: boolean;
  onDrawingDone: () => void;
  onAvail?: (a: PlayerAvail) => void;
}) {
  const c = usePalette();
  const { height: winH } = useWindowDimensions();
  const [attempt, setAttempt] = useState(0);
  const src = useVideoSource(path, attempt);
  const settled = useScreenSettled();
  const [k] = useState(() => keepOf(path));
  const [rate, setRate] = useState(k.rate);
  const player = useVideoPlayer(settled && src.uri ? src.uri : null, (p) => playerCall.setup(p, k.rate));
  usePauseWhenHidden(player, false);
  const [status, setStatus] = useState<string>('idle');
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState<number | null>(null);
  const [fps, setFps] = useState<number | null>(null);
  useEventListener(player, 'statusChange', ({ status: s }) => {
    setStatus(s);
    if (s === 'readyToPlay') {
      setDuration(player.duration > 0 ? player.duration : null);
      setFps(player.videoTrack?.frameRate ?? null);
    }
  });
  useEventListener(player, 'timeUpdate', ({ currentTime }) => setTime(currentTime));
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const ready = status === 'readyToPlay';
  const aspectLive = useDisplayAspect(player, ready);
  const thumbs = usePathThumbs([path]);
  const thumb = thumbs[path];
  const thumbAspect = thumb && typeof thumb !== 'string' && thumb.width > 0 && thumb.height > 0 ? thumb.width / thumb.height : null;
  const aspect = aspectLive ?? thumbAspect ?? 4 / 5;

  const avail: PlayerAvail = src.error ? src.error.kind : status === 'error' ? 'player' : ready ? 'ready' : 'loading';
  useEffect(() => onAvail?.(avail), [avail, onAvail]);

  /* 그리기 — 켜면 멈춘다. 도형 · 도구 · 색 · 배속은 이 영상에 앱을 켠 동안만 남는다 */
  const [shapes, setShapes] = useState<Shape[]>(k.shapes);
  const [tool, setTool] = useState<ToolKind>(k.tool);
  const [color, setColor] = useState(k.color);
  useEffect(() => {
    kept.set(path, { shapes, tool, color, rate });
  }, [path, shapes, tool, color, rate]);
  useEffect(() => {
    if (drawing) playerCall.pause(player);
  }, [drawing, player]);

  const step = sceneStep(fps);
  const seek = (t: number) => {
    const clamped = Math.min(duration ?? t, Math.max(0, t));
    playerCall.seek(player, clamped);
    setTime(clamped);
  };
  const toggle = () => {
    if (!ready) return;
    if (isPlaying) return playerCall.pause(player);
    /* 끝에서 누르면 처음부터 */
    if (duration && time >= duration - 0.05) seek(0);
    playerCall.play(player);
  };
  const nudge = (dir: 1 | -1) => {
    playerCall.pause(player);
    seek(playerCall.time(player) + dir * step);
  };
  const pickRate = () => {
    const options = [...RATES.map(rateText), '취소'];
    ActionSheetIOS.showActionSheetWithOptions({ options, cancelButtonIndex: options.length - 1, title: '재생 속도' }, (i) => {
      const r = RATES[i];
      if (r == null) return;
      setRate(r);
      playerCall.rate(player, r);
    });
  };
  const [full, setFull] = useState(false);

  /* 칸 크기 — 폭에 맞춘 높이가 상한(화면의 58% · 560)을 넘으면 높이에 맞추고 가운데 */
  const [w, setW] = useState(0);
  const maxH = Math.min(winH * 0.58, 560);
  const boxH = w ? Math.min(w / aspect, maxH) : 0;
  const boxW = boxH * aspect;

  const fileError = src.error ?? (status === 'error' ? { kind: 'player' as const, message: '영상을 재생하지 못했어요. 다시 시도해 주세요.' } : null);
  const retry = fileError && fileError.kind !== 'missing' ? () => setAttempt((n) => n + 1) : null;

  return (
    <View style={{ gap: 10 }} onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))}>
      <View style={{ alignItems: 'center' }}>
        <View style={[st.box, { width: boxW || '100%', height: boxH || 280 }]}>
          {fileError ? (
            <View style={[StyleSheet.absoluteFill, st.center]}>
              <Icon name={fileError.kind === 'missing' ? 'film' : 'circle-alert'} size={26} color="rgba(255,255,255,0.75)" />
              <Text style={st.note}>{fileError.message}</Text>
              {retry ? (
                <Press accessibilityRole="button" onPress={retry} style={st.retry}>
                  <Text style={[TYPE.buttonCompact, { color: '#fff' }]}>다시 시도</Text>
                </Press>
              ) : null}
            </View>
          ) : (
            <>
              {settled && src.uri ? (
                <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" />
              ) : null}
              {!ready && thumb ? <Image source={thumbSource(thumb as Thumb)} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
              {!ready ? (
                <View style={[StyleSheet.absoluteFill, st.center]} pointerEvents="none">
                  <ActivityIndicator color="#fff" />
                </View>
              ) : null}
              <DrawLayer
                shapes={shapes}
                onCommit={(sh) => setShapes((l) => [...l, sh])}
                onEdit={(i, sh) => setShapes((l) => l.map((x, j) => (j === i ? sh : x)))}
                tool={tool}
                color={color}
                enabled={drawing}
                source={{ w: aspect, h: 1 }}
              />
              {ready && !isPlaying && !drawing ? (
                <Pressable accessibilityRole="button" accessibilityLabel="재생" onPress={toggle} style={st.bigPlay}>
                  <Icon name="play" size={26} color="#fff" fill="#fff" />
                </Pressable>
              ) : null}
              {ready && isPlaying && !drawing ? (
                <Pressable accessibilityRole="button" accessibilityLabel="일시정지" onPress={toggle} style={StyleSheet.absoluteFill} />
              ) : null}
              {ready && !drawing ? (
                <Press accessibilityRole="button" accessibilityLabel="크게 보기" onPress={() => setFull(true)} style={st.fullBtn}>
                  <SymbolView name="arrow.up.left.and.arrow.down.right" size={17} weight="semibold" tintColor="#fff" />
                </Press>
              ) : null}
            </>
          )}
        </View>
      </View>

      <View style={{ opacity: ready ? 1 : 0.5 }}>
        <Scrubber
          value={time}
          max={duration ?? 1}
          onStart={() => playerCall.pause(player)}
          onSeek={seek}
          step={step * 6}
          label="영상 위치"
          valueText={`${secText(time)} / ${secText(duration)}`}
          disabled={!ready}
        />
        <ScrubLabels left={secText(time)} right={secText(duration)} />
      </View>
      <View style={st.controls}>
        <Press accessibilityRole="button" accessibilityLabel="이전 장면" disabled={!ready} onPress={() => nudge(-1)} style={st.step}>
          <Icon name="chevron-left" size={22} color={c.link} />
        </Press>
        <Press
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? '일시정지' : '재생'}
          accessibilityState={{ disabled: !ready }}
          disabled={!ready}
          onPress={toggle}
          style={[st.play, { backgroundColor: c.card, boxShadow: c.float }]}
        >
          <Icon name={isPlaying ? 'pause' : 'play'} size={22} color={c.link} />
        </Press>
        <Press accessibilityRole="button" accessibilityLabel="다음 장면" disabled={!ready} onPress={() => nudge(1)} style={st.step}>
          <Icon name="chevron-right" size={22} color={c.link} />
        </Press>
        <View style={{ flex: 1 }} />
        <Press
          accessibilityRole="button"
          accessibilityLabel={`재생 속도 ${rateText(rate)}, 바꾸기`}
          onPress={pickRate}
          style={[st.rate, { backgroundColor: c.card, boxShadow: c.float }]}
        >
          <Text maxFontSizeMultiplier={1.6} style={[TYPE.buttonCompact, { color: c.link }]}>
            {rateText(rate)}
          </Text>
          <Icon name="chevron-down" size={14} color={c.link} />
        </Press>
      </View>

      {drawing ? (
        <View style={{ gap: 8 }}>
          <DrawToolbar
            tool={tool}
            onTool={setTool}
            color={color}
            onColor={setColor}
            onUndo={() => setShapes((l) => l.slice(0, -1))}
            onClear={() => setShapes([])}
            canUndo={shapes.length > 0}
          />
          <View style={st.drawFoot}>
            <Text maxFontSizeMultiplier={1.6} style={[TYPE.sub, { flex: 1, color: c.muted }]}>
              손으로 짚는 2D 참고선이에요. 점을 끌어 고칠 수 있어요. 앱을 켠 동안만 남아요.
            </Text>
            <Press accessibilityRole="button" onPress={onDrawingDone} style={[st.done, { backgroundColor: c.action }]}>
              <Text style={[TYPE.buttonCompact, { color: '#fff' }]}>완료</Text>
            </Press>
          </View>
        </View>
      ) : null}

      {full ? (
        <FullView
          player={player}
          aspect={aspect}
          playing={isPlaying}
          time={time}
          duration={duration}
          step={step}
          shapes={shapes}
          onToggle={toggle}
          onSeek={seek}
          onNudge={nudge}
          onClose={() => setFull(false)}
        />
      ) : null}
    </View>
  );
}

/**
 * 크게 보기 — 같은 재생기를 화면 가득한 칸에 한 번 더 붙인다(expo-video 는 한 재생기를 여러 칸에 보일 수 있다). 그린 참고선은 비율 좌표라 그대로 붙고,
 * 보는 동안만 가로로 돌릴 수 있게 화면 잠금을 푼다(닫으면 세로로 — 앱은 세로 고정, app/_layout.tsx).
 */
function FullView({
  player,
  aspect,
  playing,
  time,
  duration,
  step,
  shapes,
  onToggle,
  onSeek,
  onNudge,
  onClose,
}: {
  player: ReturnType<typeof useVideoPlayer>;
  aspect: number;
  playing: boolean;
  time: number;
  duration: number | null;
  step: number;
  shapes: Shape[];
  onToggle: () => void;
  onSeek: (t: number) => void;
  onNudge: (dir: 1 | -1) => void;
  onClose: () => void;
}) {
  const { width, height } = useWindowDimensions();
  const inset = useSafeAreaInsets();
  useEffect(() => {
    void ScreenOrientation.unlockAsync().catch(() => undefined);
    return () => void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP).catch(() => undefined);
  }, []);
  const availH = height - inset.top - inset.bottom - 150;
  const availW = width - inset.left - inset.right;
  const boxH = Math.min(availH, availW / aspect);
  const boxW = boxH * aspect;
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: '#000', paddingTop: inset.top, paddingBottom: inset.bottom + 8, paddingHorizontal: 12 }}>
        <View style={st.fullBar}>
          <Press accessibilityRole="button" accessibilityLabel="크게 보기 닫기" onPress={onClose} style={st.fullClose}>
            <Icon name="x" size={20} color="#fff" />
          </Press>
        </View>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <View style={{ width: boxW, height: boxH }}>
            <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" />
            <DrawLayer shapes={shapes} onCommit={() => {}} tool="tilt" color={DRAW_COLORS[0]} enabled={false} source={{ w: aspect, h: 1 }} />
            <Pressable accessibilityRole="button" accessibilityLabel={playing ? '일시정지' : '재생'} onPress={onToggle} style={StyleSheet.absoluteFill} />
          </View>
        </View>
        <View style={{ gap: 6, width: '100%', maxWidth: 720, alignSelf: 'center' }}>
          <Scrubber value={time} max={duration ?? 1} onStart={() => playerCall.pause(player)} onSeek={onSeek} step={step * 6} label="영상 위치" valueText={`${secText(time)} / ${secText(duration)}`} />
          <View style={[st.controls, { justifyContent: 'center' }]}>
            <Press accessibilityRole="button" accessibilityLabel="이전 장면" onPress={() => onNudge(-1)} style={st.step}>
              <Icon name="chevron-left" size={24} color="#fff" />
            </Press>
            <Press accessibilityRole="button" accessibilityLabel={playing ? '일시정지' : '재생'} onPress={onToggle} style={[st.play, { backgroundColor: withAlpha('#ffffff', 0.16) }]}>
              <Icon name={playing ? 'pause' : 'play'} size={24} color="#fff" />
            </Press>
            <Press accessibilityRole="button" accessibilityLabel="다음 장면" onPress={() => onNudge(1)} style={st.step}>
              <Icon name="chevron-right" size={24} color="#fff" />
            </Press>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const st = StyleSheet.create({
  box: { borderRadius: 20, backgroundColor: '#0e1a26', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 20, gap: 10 },
  note: { color: 'rgba(255,255,255,0.85)', fontSize: 15, lineHeight: 21, textAlign: 'center' },
  retry: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
  bigPlay: {
    position: 'absolute',
    alignSelf: 'center',
    top: '50%',
    left: '50%',
    width: 64,
    height: 64,
    marginLeft: -32,
    marginTop: -32,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(16,40,59,0.72)',
  },
  fullBtn: { position: 'absolute', right: 10, bottom: 10, width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(16,40,59,0.72)' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  step: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  play: { width: 56, height: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  rate: { flexDirection: 'row', alignItems: 'center', gap: 4, minHeight: 44, paddingHorizontal: 14, borderRadius: 16 },
  drawFoot: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  done: { minHeight: 44, paddingHorizontal: 20, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  fullBar: { flexDirection: 'row', justifyContent: 'flex-end', minHeight: 48 },
  fullClose: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.16)' },
});
