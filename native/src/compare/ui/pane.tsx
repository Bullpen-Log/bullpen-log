import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { useVideoPlayer, VideoView, type VideoPlayer, type VideoPlayerStatus } from 'expo-video';
import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Annotation, Geometry } from '~/compare/annotations';
import type { Calibration, Pane as PaneGeom, Pt, Px, ViewTransform } from '~/compare/geometry';
import { FS_MAX } from '~/compare/fit';
import { clock } from '~/compare/timing';
import { isCropped, isFramed, layerMap, shownFraction, type DisplayMode, type LayerMap } from '~/compare/immersive/geometry';
import { AnnotationLayer, type DrawTool } from '~/compare/ui/annotation-layer';
import { TYPE } from '~/lib/ui';
import { useComparePalette } from '~/compare/ui/compare-palette';
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

/** 겹쳐 보기의 한 겹(IM04 · IM05) — 두 칸이 같은 자리에 겹친다. 자리는 위(workbench)가 overlayTopMap 으로 셈한 LayerMap 하나 */
export type PaneLayer = {
  /** 원본 전체가 칸 안에 그려지는 사각형(칸 좌표) — null 이면 이 칸이 스스로 셈한다 */
  map: LayerMap | null;
  /** 영상 그림의 진하기 0~1 — 조작 · 표시 글자는 흐리게 하지 않는다 */
  opacity: number;
  /** 반반 비교 — 이 겹은 칸 폭의 이 몫(0~1)부터 오른쪽만 보인다 */
  clipLeft: number | null;
  /** 위 겹은 손가락을 받지 않는다(밑 겹이 확대 · 고르기를 받는다) — 오류 단추만 */
  role: 'base' | 'top';
};

/**
 * 비교 칸 하나 — 자기 재생기를 갖는다(영상이 바뀌면 key 로 새로). 칸(rect) = 무대를 나눈 자리(IM03, 2026-11-03 — 예전처럼 영상 맞춤 사각형이 아니다).
 * 칸 안에서 영상은 표시 방식(display: 채움 · 전체)대로 LayerMap 사각형에 그린다 — 원본 비율 그대로, 찌그러뜨리지 않는다. 그림 판도 같은 LayerMap 을 쓴다.
 * display 를 안 주면 예전처럼 칸 안 contain 가운데(같은 값).
 * 확대 · 이동 · 반전은 보기 변환(view)으로 영상과 그림에 같이 걸린다. rect 가 null 이면(다른 쪽 집중 보기) 재생기는 살려 두고 화면엔 안 그린다.
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
  display,
  layer,
  overlayTop = 0,
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
  /** 칸 안 영상 표시(채움 · 전체). 없으면 예전 contain 가운데 */
  display?: DisplayMode;
  /** 겹쳐 보기의 한 겹 — 없으면 보통 칸 */
  layer?: PaneLayer | null;
  /** 무대 위 끝에서 이 높이까지는 위의 머리 줄이 영상 위에 떠 있다 — 칸 위 표시를 그 밑으로(무대 좌표) */
  overlayTop?: number;
}) {
  const c = useComparePalette();
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
  const mode: DisplayMode = display ?? 'full';
  const align = display ? 'top' : 'center';
  /* 원본 ↔ 칸 화면의 하나뿐인 변환 — 영상 · 썸네일 · 그림 · 돋보기가 같은 사각형을 쓴다(IM05) */
  const map = layer?.map ?? layerMap(box, aspect, view, mode, align);
  const framed = isFramed(view);
  const cropped = display === 'fill' && isCropped(shownFraction(box, aspect, 'fill', view.crop));
  const top = layer?.role === 'top';
  const media = { position: 'absolute' as const, left: map.x, top: map.y, width: map.w, height: map.h, transform: [{ scaleX: map.mirror ? -1 : 1 }] };
  const tiny = box.w < 120 || box.h < 120;
  const clip = layer?.clipLeft ?? null;
  return (
    <View style={{ position: 'absolute', left: rect.x, top: rect.y, width: box.w, height: box.h, zIndex: top ? 2 : 1 }} pointerEvents={top && !error ? 'none' : 'box-none'}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${L} 영상, ${badge.title}${badge.anchor ? `, ${badge.anchor}` : ''}${view.mirror ? ', 좌우 반전' : ''}${aligning ? ', 이 영상 고르기' : ''}${error ? `, ${errText}` : ready ? '' : ', 불러오는 중'}`}
        accessibilityState={{ selected: focused }}
        accessibilityElementsHidden={top && !error}
        importantForAccessibility={top && !error ? 'no-hide-descendants' : 'auto'}
        disabled={!!draw?.drawing || (top && !error)}
        onPress={onFocus}
        style={[st.media, { width: box.w, height: box.h, backgroundColor: top ? 'transparent' : '#000' }]}
      >
        {/* 영상 그림만 진하기 · 반반을 받는다 — 표시 글자 · 단추는 그대로(IM04) */}
        <View
          style={[clip != null ? { position: 'absolute', top: 0, bottom: 0, left: box.w * clip, right: 0, overflow: 'hidden' } : StyleSheet.absoluteFill, { opacity: layer ? layer.opacity : 1 }]}
          pointerEvents="none"
        >
          <View style={{ position: 'absolute', top: 0, left: clip != null ? -box.w * clip : 0, width: box.w, height: box.h }}>
            <View style={media}>
              {thumb && !ready && !error ? <Image source={thumbSource(thumb)} style={StyleSheet.absoluteFill} contentFit="contain" /> : null}
              {/* 사각형이 이미 원본 비율이라 contain 이 꽉 찬다 — 비율을 아직 모를 때도 찌그러지지 않게 contain */}
              {ready ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" /> : null}
            </View>
          </View>
        </View>
        {clip != null && top ? <View pointerEvents="none" style={[st.wipe, { left: box.w * clip - 1 }]} /> : null}
        {ready && draw ? (
          <AnnotationLayer
            pane={pane}
            view={view}
            display={display}
            map={layer?.map ?? null}
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
            <Text maxFontSizeMultiplier={FS_MAX} style={st.errText} numberOfLines={4}>
              {errText}
            </Text>
            {errAction ? (
              <Press accessibilityRole="button" accessibilityLabel={`${L} ${errAction.label}`} onPress={errAction.run} style={st.errBtn}>
                <Text maxFontSizeMultiplier={FS_MAX} style={[TYPE.buttonCompact, { color: '#fff' }]}>
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
        {focused && !layer ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, st.focusRing, { borderColor: c.action }]} /> : null}
        {/* 작은 표시 — A/B · 반전 · 기준 (겹침의 위 겹은 오른쪽에) */}
        <View style={[st.topRow, top ? st.topRowEnd : null, { top: 6 + Math.max(0, overlayTop - rect.y) }]} pointerEvents="none">
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
          {cropped && !tiny && !top ? (
            <Text numberOfLines={1} style={[st.tag, { backgroundColor: 'rgba(0,0,0,0.55)', flexShrink: 0 }]} maxFontSizeMultiplier={1.2} accessibilityLabel="채움, 영상 가장자리가 일부 잘려 보여요">
              일부 잘림
            </Text>
          ) : null}
        </View>
        {ready && !top ? (
          <>
            {!tiny ? (
              <Text style={st.timeChip} maxFontSizeMultiplier={1.2} accessibilityElementsHidden importantForAccessibility="no">
                {clock(time)}
              </Text>
            ) : null}
            {framed ? (
              <Press accessibilityRole="button" accessibilityLabel={`${L} 확대 · 이동 되돌리기`} onPress={() => onView({ ...view, zoom: 1, panX: 0, panY: 0 })} style={st.fit}>
                <Text maxFontSizeMultiplier={1.2} style={st.fitText}>
                  {view.zoom > 1.001 ? `${view.zoom.toFixed(1)}× 맞춤` : '맞춤'}
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
      {touchAt && ready && draw?.drawing ? <Loupe player={player} pane={pane} map={map} at={touchAt} color={draw.color} /> : null}
    </View>
  );
}

const LOUPE = 104;
const LOUPE_ZOOM = 2.5;
/** 손가락에 가린 자리를 크게 — 손가락 위(모자라면 아래)에 동그랗게, 칸의 영상 사각형(LayerMap)을 그대로 키워서. 가운데 십자가 짚는 자리 */
function Loupe({ player, pane, map, at, color }: { player: VideoPlayer; pane: PaneGeom; map: LayerMap; at: Px; color: string }) {
  const R = LOUPE / 2;
  const Z = LOUPE_ZOOM;
  const above = at.y - R - 56 >= -R;
  const top = above ? at.y - LOUPE - 44 : at.y + 44;
  const left = Math.min(Math.max(at.x - R, -R / 2), pane.w - LOUPE + R / 2);
  return (
    <View pointerEvents="none" style={[st.loupe, { left, top, borderColor: color }]} accessibilityElementsHidden importantForAccessibility="no">
      <View style={{ position: 'absolute', left: R - at.x * Z, top: R - at.y * Z, width: pane.w * Z, height: pane.h * Z }}>
        <View style={{ position: 'absolute', left: map.x * Z, top: map.y * Z, width: map.w * Z, height: map.h * Z, transform: [{ scaleX: map.mirror ? -1 : 1 }] }}>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} pointerEvents="none" />
        </View>
      </View>
      <View style={[st.cross, { left: R - 0.75, top: R - 10, width: 1.5, height: 20, backgroundColor: color }]} />
      <View style={[st.cross, { left: R - 10, top: R - 0.75, width: 20, height: 1.5, backgroundColor: color }]} />
    </View>
  );
}

const st = StyleSheet.create({
  /* 칸은 모서리 · 테두리 없이 검은 바탕 끝까지(IM02) — 고른 칸은 안쪽 가는 테두리로만 */
  media: { backgroundColor: '#000', overflow: 'hidden' },
  focusRing: { borderWidth: 2 },
  wipe: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: '#fff' },
  topRowEnd: { justifyContent: 'flex-end' },
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
  loupe: { position: 'absolute', width: LOUPE, height: LOUPE, borderRadius: LOUPE / 2, overflow: 'hidden', borderWidth: 2, backgroundColor: '#000' },
  cross: { position: 'absolute' },
});
