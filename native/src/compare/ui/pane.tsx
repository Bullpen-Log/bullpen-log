import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Annotation, Geometry } from '~/compare/annotations';
import type { Calibration, Pt, ViewTransform } from '~/compare/geometry';
import { clock } from '~/compare/timing';
import { AnnotationLayer, type DrawTool } from '~/compare/ui/annotation-layer';
import { TYPE, usePalette } from '~/lib/ui';
import { thumbSource, usePathThumbs } from '~/pitch/store';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { useScreenSettled } from '~/shell/transition';
import { playerCall, useDisplayAspect, useVideoSource } from '~/videos/player-parts';

export type SideKey = 'a' | 'b';

/* 재생기 값은 훅 밖 함수에서 바꾼다(player-parts playerCall 과 같은 까닭) — 놓인 재생기는 조용히 */
function setMuted(p: VideoPlayer, m: boolean) {
  try {
    p.muted = m;
  } catch {
    /* 놓인 재생기 */
  }
}
export type SideErr = { kind: 'missing' | 'server' | 'gone' | 'player'; message: string };
/** 칸이 위로 알리는 재생기 · 영상 정보(함께 재생은 위가 맡는다) */
export type SideInfo = {
  player: VideoPlayer;
  ready: boolean;
  duration: number | null;
  fps: number | null;
  aspect: number | null;
  codec: string | null;
  width: number | null;
  height: number | null;
  error: SideErr | null;
};

export type PaneDraw = {
  drawing: boolean;
  tool: DrawTool;
  color: string;
  width: number;
  selectedId: string | null;
  items: Annotation[];
  calibration: Calibration | null;
  onCreate: (g: Geometry) => void;
  onMove: (id: string, g: Geometry) => void;
  onSelect: (id: string | null) => void;
  onNeedText: (p: Pt) => void;
  onStroke?: (active: boolean) => void;
};

/**
 * 비교 칸 하나 — 자기 재생기를 갖는다(영상이 바뀌면 key 로 새로). 원본 비율을 지키며 칸 안에 잘림 없이(contain) 보이고, 확대 · 이동 · 반전은
 * 보기 변환(view)으로 영상과 그림에 같이 걸린다. hidden 이면(겹쳐 보기) 재생기는 살려 두고 화면엔 안 그린다.
 */
export function Pane({
  side,
  path,
  rate,
  time,
  box,
  width,
  title,
  sub,
  markText,
  marked,
  aligning,
  focused,
  hidden,
  muted,
  view,
  onView,
  draw,
  onFocus,
  onInfo,
  onReplace,
  onExpand,
  onExit,
}: {
  side: SideKey;
  path: string;
  rate: number;
  time: number;
  box: { w: number; h: number };
  width: number;
  title: string;
  sub: string | null;
  markText: string;
  marked: boolean;
  aligning: boolean;
  focused: boolean;
  hidden?: boolean;
  muted: boolean;
  view: ViewTransform;
  onView: (v: ViewTransform) => void;
  draw: PaneDraw | null;
  onFocus: () => void;
  onInfo: (s: SideInfo | null) => void;
  onReplace?: () => void;
  onExpand: () => void;
  onExit: () => void;
}) {
  const c = usePalette();
  const L = side.toUpperCase();
  const settled = useScreenSettled();
  const [attempt, setAttempt] = useState(0);
  const src = useVideoSource(settled ? path : null, attempt);
  const [rate0] = useState(rate);
  const player = useVideoPlayer(src.uri, (p) => playerCall.setup(p, rate0));
  const [status, setStatus] = useState<VideoPlayerStatus>('idle');
  const [meta, setMeta] = useState<{ duration: number | null; fps: number | null; codec: string | null; w: number | null; h: number | null }>({
    duration: null,
    fps: null,
    codec: null,
    w: null,
    h: null,
  });
  useEventListener(player, 'statusChange', ({ status: s }) => {
    setStatus(s);
    if (s === 'readyToPlay') {
      const tr = player.videoTrack;
      setMeta({
        duration: player.duration > 0 ? player.duration : null,
        fps: tr?.frameRate ?? null,
        codec: tr?.mimeType ?? null,
        w: tr?.size?.width ?? null,
        h: tr?.size?.height ?? null,
      });
    }
  });
  const ready = !!src.uri && status === 'readyToPlay';
  const aspect = useDisplayAspect(player, ready);
  const errKind: SideErr['kind'] | null = src.error?.kind ?? (status === 'error' ? 'player' : null);
  const errMessage = src.error?.message ?? '영상을 재생하지 못했어요. 다시 시도해 주세요.';
  const error = useMemo<SideErr | null>(() => (errKind ? { kind: errKind, message: errMessage } : null), [errKind, errMessage]);
  useEffect(() => {
    onInfo({ player, ready, duration: meta.duration, fps: meta.fps, aspect, codec: meta.codec, width: meta.w, height: meta.h, error });
  }, [onInfo, player, ready, meta, aspect, error]);
  useEffect(() => () => onInfo(null), [onInfo]);
  /* 소리 — 고른 쪽만(둘이 겹쳐 울리지 않게) */
  useEffect(() => setMuted(player, muted), [player, muted]);
  /* 준비되면(처음 · 다시 시도 · 돌아옴) 위가 정한 자리로 */
  const toTime = useEffectEvent(() => playerCall.seek(player, time));
  useEffect(() => {
    if (ready) toTime();
  }, [ready]);

  const thumbs = usePathThumbs([path]);
  const thumb = thumbs[path];
  const errText = !error
    ? null
    : error.kind === 'missing'
      ? '이 기기에 영상이 없어요'
      : error.kind === 'gone'
        ? '영상 파일을 찾지 못했어요'
        : error.kind === 'player'
          ? '영상을 재생하지 못했어요'
          : '영상을 불러오지 못했어요';
  const errAction = !error
    ? null
    : error.kind === 'missing' || error.kind === 'gone'
      ? onReplace
        ? { label: '다른 영상', run: onReplace }
        : { label: '돌아가기', run: onExit }
      : { label: '다시 시도', run: () => setAttempt((n) => n + 1) };

  const pane = { w: box.w, h: box.h, aspect: aspect ?? box.w / Math.max(1, box.h) };
  const zoomed = view.zoom > 1.001;
  const transform = [{ translateX: view.panX * box.w }, { translateY: view.panY * box.h }, { scale: view.zoom }, { scaleX: view.mirror ? -1 : 1 }];

  if (hidden) return null;
  return (
    <View style={{ width, gap: 6 }}>
      <View style={st.head}>
        <View style={[st.badge, { backgroundColor: side === 'a' ? c.ink : c.action }]}>
          <Text style={[st.badgeText, { color: side === 'a' ? c.page : c.onAction }]}>{L}</Text>
        </View>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[TYPE.buttonCompact, { color: c.ink, flex: 1 }]}>
          {title}
        </Text>
        {view.mirror ? (
          <Text maxFontSizeMultiplier={1.3} style={[TYPE.sub, { color: c.link }]} accessibilityLabel="좌우 반전해서 보는 중">
            반전
          </Text>
        ) : null}
        {onReplace ? (
          <Press accessibilityRole="button" accessibilityLabel={`${L} 영상 바꾸기`} onPress={onReplace} style={st.replace}>
            <Text maxFontSizeMultiplier={1.3} style={[TYPE.buttonCompact, { color: c.link }]}>
              바꾸기
            </Text>
          </Press>
        ) : null}
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${L} 영상${aligning ? ', 이 영상 고르기' : ''}${error ? `, ${errText}` : ready ? '' : ', 불러오는 중'}`}
        accessibilityState={{ selected: focused }}
        disabled={!!draw?.drawing}
        onPress={onFocus}
        style={[st.media, { width: box.w, height: box.h, alignSelf: 'center', borderColor: focused ? c.action : 'transparent' }]}
      >
        <View style={[StyleSheet.absoluteFill, { transform }]} pointerEvents="none">
          {thumb && !ready && !error ? <Image source={thumbSource(thumb)} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
          {ready ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" /> : null}
        </View>
        {ready && draw ? (
          <AnnotationLayer
            pane={pane}
            view={view}
            items={draw.items}
            drawing={draw.drawing}
            tool={draw.tool}
            color={draw.color}
            width={draw.width}
            selectedId={draw.selectedId}
            calibration={draw.calibration}
            onCreate={draw.onCreate}
            onMove={draw.onMove}
            onSelect={draw.onSelect}
            onView={onView}
            onNeedText={draw.onNeedText}
            onStroke={draw.onStroke}
          />
        ) : null}
        {error ? (
          <View style={[StyleSheet.absoluteFill, st.center]}>
            <Icon name={error.kind === 'missing' ? 'film' : 'circle-alert'} size={22} color="rgba(255,255,255,0.8)" />
            <Text maxFontSizeMultiplier={1.4} style={st.errText}>
              {errText}
            </Text>
            {errAction ? (
              <Press accessibilityRole="button" accessibilityLabel={`${L} ${errAction.label}`} onPress={errAction.run} style={st.errBtn}>
                <Text maxFontSizeMultiplier={1.3} style={[TYPE.buttonCompact, { color: '#fff' }]}>
                  {errAction.label}
                </Text>
              </Press>
            ) : null}
          </View>
        ) : !ready ? (
          <View style={[StyleSheet.absoluteFill, st.center]} pointerEvents="none">
            <ActivityIndicator color="#fff" />
          </View>
        ) : null}
        {ready ? (
          <>
            <Text style={st.timeChip} maxFontSizeMultiplier={1.2} accessibilityElementsHidden importantForAccessibility="no">
              {clock(time)}
            </Text>
            {zoomed ? (
              <Press accessibilityRole="button" accessibilityLabel={`${L} 확대 되돌리기`} onPress={() => onView({ ...view, zoom: 1, panX: 0, panY: 0 })} style={st.fit}>
                <Text maxFontSizeMultiplier={1.2} style={st.fitText}>
                  {`${view.zoom.toFixed(1)}× 맞춤`}
                </Text>
              </Press>
            ) : null}
            <Press accessibilityRole="button" accessibilityLabel={`${L} 영상 크게 보기`} onPress={onExpand} style={st.expand}>
              <Icon name="focus" size={18} color="#fff" />
            </Press>
          </>
        ) : null}
      </Pressable>
      {sub ? (
        <Text numberOfLines={1} maxFontSizeMultiplier={1.4} style={[TYPE.sub, { color: c.muted }]}>
          {sub}
        </Text>
      ) : null}
      <View style={st.markRow} accessible accessibilityLabel={`${L} ${markText}`}>
        <Icon name={marked ? 'circle-check' : 'circle'} size={16} color={marked ? c.link : c.muted} />
        <Text maxFontSizeMultiplier={1.4} style={[TYPE.sub, { color: marked ? c.ink : c.muted, fontVariant: ['tabular-nums'], flexShrink: 1 }]}>
          {markText}
        </Text>
      </View>
    </View>
  );
}

const st = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  badge: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontSize: 14, fontWeight: '800' },
  replace: { minHeight: 44, minWidth: 44, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center' },
  media: { borderRadius: 16, backgroundColor: '#0e1a26', overflow: 'hidden', borderWidth: 2 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 10, gap: 8 },
  errText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  errBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  timeChip: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    color: '#fff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,40,59,0.72)',
  },
  fit: { position: 'absolute', left: 4, top: 4, minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  fitText: { color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(16,40,59,0.72)' },
  expand: { position: 'absolute', right: 4, bottom: 4, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  markRow: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 22 },
});
