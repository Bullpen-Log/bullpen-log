import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Annotation, Geometry } from '~/compare/annotations';
import type { Calibration, Pane as PaneGeom, Pt, Px, ViewTransform } from '~/compare/geometry';
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

/** 칸 위 작은 표시(UI03 — 제목 줄 · 보조 줄 · 기준 줄 대신 영상 위에 작게) */
export type PaneBadge = { anchor: string | null; marked: boolean; title: string };

/**
 * 비교 칸 하나 — 자기 재생기를 갖는다(영상이 바뀌면 key 로 새로). 칸 = 화면에 보이는 영상 사각형(rect, 무대가 원본 비율로 셈해 준다).
 * 확대 · 이동 · 반전은 보기 변환(view)으로 영상과 그림에 같이 걸린다. rect 가 null 이면(겹쳐 보기 · 다른 쪽 집중 보기) 재생기는 살려 두고 화면엔 안 그린다.
 * 배치가 바뀌어도(위아래 ↔ 나란히 · 돌림 · 도구 창) 같은 자리의 같은 부품이라 재생기 · 자리 · 그림이 그대로다(UI10).
 */
export function Pane({
  side,
  path,
  rate,
  time,
  rect,
  badge,
  aligning,
  focused,
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
  /** 무대 안 자리 — null 이면 그리지 않음(재생기는 살아 있음) */
  rect: { x: number; y: number; w: number; h: number } | null;
  badge: PaneBadge;
  aligning: boolean;
  focused: boolean;
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
  /* 돋보기(UI06) — 그리는 손가락 위에 같은 재생기를 크게 한 번 더(같은 재생기를 여러 화면에 붙일 수 있다 — expo-video) */
  const [touchAt, setTouchAt] = useState<Px | null>(null);

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

  if (!rect || rect.w < 1 || rect.h < 1) return null;
  const box = { w: rect.w, h: rect.h };
  const pane = { w: box.w, h: box.h, aspect: aspect ?? box.w / Math.max(1, box.h) };
  const zoomed = view.zoom > 1.001;
  const transform = [{ translateX: view.panX * box.w }, { translateY: view.panY * box.h }, { scale: view.zoom }, { scaleX: view.mirror ? -1 : 1 }];
  const tiny = box.w < 120 || box.h < 120;
  return (
    <View style={{ position: 'absolute', left: rect.x, top: rect.y, width: box.w, height: box.h }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${L} 영상, ${badge.title}${badge.anchor ? `, ${badge.anchor}` : ''}${view.mirror ? ', 좌우 반전' : ''}${aligning ? ', 이 영상 고르기' : ''}${error ? `, ${errText}` : ready ? '' : ', 불러오는 중'}`}
        accessibilityState={{ selected: focused }}
        disabled={!!draw?.drawing}
        onPress={onFocus}
        style={[st.media, { width: box.w, height: box.h, borderColor: focused ? c.action : 'transparent' }]}
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
            onTouch={setTouchAt}
          />
        ) : null}
        {error ? (
          <View style={[StyleSheet.absoluteFill, st.center]}>
            <Icon name={error.kind === 'missing' ? 'film' : 'circle-alert'} size={22} color="rgba(255,255,255,0.8)" />
            <Text maxFontSizeMultiplier={1.4} style={st.errText} numberOfLines={3}>
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
        {/* 작은 표시 — A/B · 반전 · 기준 */}
        <View style={st.topRow} pointerEvents="none">
          <Text style={[st.tag, { backgroundColor: side === 'a' ? 'rgba(16,40,59,0.78)' : c.action }]} maxFontSizeMultiplier={1.2}>
            {L}
            {view.mirror ? ' ⇋' : ''}
          </Text>
          {badge.anchor && !tiny ? (
            <Text numberOfLines={1} style={[st.tag, { backgroundColor: badge.marked ? 'rgba(16,40,59,0.78)' : 'rgba(16,40,59,0.5)', flexShrink: 1 }]} maxFontSizeMultiplier={1.2}>
              {badge.marked ? '✓ ' : ''}
              {badge.anchor}
            </Text>
          ) : null}
        </View>
        {ready ? (
          <>
            {!tiny ? (
              <Text style={st.timeChip} maxFontSizeMultiplier={1.2} accessibilityElementsHidden importantForAccessibility="no">
                {clock(time)}
              </Text>
            ) : null}
            {zoomed ? (
              <Press accessibilityRole="button" accessibilityLabel={`${L} 확대 되돌리기`} onPress={() => onView({ ...view, zoom: 1, panX: 0, panY: 0 })} style={st.fit}>
                <Text maxFontSizeMultiplier={1.2} style={st.fitText}>
                  {`${view.zoom.toFixed(1)}× 맞춤`}
                </Text>
              </Press>
            ) : null}
            {!draw?.drawing ? (
              <Press accessibilityRole="button" accessibilityLabel={`${L} 영상 크게 보기`} onPress={onExpand} style={st.expand}>
                <Icon name="focus" size={18} color="#fff" />
              </Press>
            ) : null}
          </>
        ) : null}
      </Pressable>
      {touchAt && ready && draw?.drawing ? <Loupe player={player} pane={pane} view={view} at={touchAt} color={draw.color} /> : null}
    </View>
  );
}

const LOUPE = 104;
const LOUPE_ZOOM = 2.5;
/** 손가락에 가린 자리를 크게 — 손가락 위(모자라면 아래)에 동그랗게, 칸의 보기 변환을 그대로 키워서. 가운데 십자가 짚는 자리 */
function Loupe({ player, pane, view, at, color }: { player: VideoPlayer; pane: PaneGeom; view: ViewTransform; at: Px; color: string }) {
  const R = LOUPE / 2;
  const Z = LOUPE_ZOOM;
  const above = at.y - R - 56 >= -R;
  const top = above ? at.y - LOUPE - 44 : at.y + 44;
  const left = Math.min(Math.max(at.x - R, -R / 2), pane.w - LOUPE + R / 2);
  const t = [{ translateX: view.panX * pane.w * Z }, { translateY: view.panY * pane.h * Z }, { scale: view.zoom }, { scaleX: view.mirror ? -1 : 1 }];
  return (
    <View pointerEvents="none" style={[st.loupe, { left, top, borderColor: color }]} accessibilityElementsHidden importantForAccessibility="no">
      <View style={{ position: 'absolute', left: R - at.x * Z, top: R - at.y * Z, width: pane.w * Z, height: pane.h * Z }}>
        <View style={[StyleSheet.absoluteFill, { transform: t }]}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" />
        </View>
      </View>
      <View style={[st.cross, { left: R - 0.75, top: R - 10, width: 1.5, height: 20, backgroundColor: color }]} />
      <View style={[st.cross, { left: R - 10, top: R - 0.75, width: 20, height: 1.5, backgroundColor: color }]} />
    </View>
  );
}

const st = StyleSheet.create({
  media: { borderRadius: 10, backgroundColor: '#0e1a26', overflow: 'hidden', borderWidth: 2 },
  center: { alignItems: 'center', justifyContent: 'center', padding: 8, gap: 6 },
  errText: { color: 'rgba(255,255,255,0.9)', fontSize: 13, lineHeight: 18, textAlign: 'center' },
  errBtn: { minHeight: 44, paddingHorizontal: 14, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.18)' },
  topRow: { position: 'absolute', left: 6, right: 6, top: 6, flexDirection: 'row', gap: 4, alignItems: 'center' },
  tag: { color: '#fff', fontSize: 12, fontWeight: '800', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden' },
  timeChip: {
    position: 'absolute',
    left: 6,
    bottom: 6,
    color: '#fff',
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: 'rgba(16,40,59,0.72)',
  },
  fit: { position: 'absolute', alignSelf: 'center', bottom: 0, minHeight: 44, minWidth: 44, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  fitText: { color: '#fff', fontSize: 12, fontWeight: '700', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, overflow: 'hidden', backgroundColor: 'rgba(16,40,59,0.72)' },
  expand: { position: 'absolute', right: 0, bottom: 0, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  loupe: { position: 'absolute', width: LOUPE, height: LOUPE, borderRadius: LOUPE / 2, overflow: 'hidden', borderWidth: 2, backgroundColor: '#0e1a26' },
  cross: { position: 'absolute' },
});
