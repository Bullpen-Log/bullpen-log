import { useEvent, useEventListener } from 'expo';
import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState, type ComponentRef, type ReactNode } from 'react';
import { ActivityIndicator, AppState, Modal, StatusBar, StyleSheet, Text, View, type GestureResponderEvent } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONTROL, PALETTES, RADIUS, TYPE, withAlpha } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';

// 영상은 어두운 무대를 유지하되 싱커의 네이비 표면·파란 조작 색·글자 체계를 함께 쓴다.
const MEDIA = PALETTES.navy;

/* 빠르게 열고 닫고 다시 열어도 비동기 화면 방향 변경은 입력한 순서로 실행한다. */
let orientationWork: Promise<void> = Promise.resolve();
function useVideoOrientation() {
  useEffect(() => {
    let previous: ScreenOrientation.OrientationLock | null = null;
    orientationWork = orientationWork.catch(() => undefined).then(async () => {
      previous = await ScreenOrientation.getOrientationLockAsync();
      await ScreenOrientation.unlockAsync();
    }).catch(() => undefined);
    return () => {
      orientationWork = orientationWork.catch(() => undefined).then(async () => {
        if (previous != null) await ScreenOrientation.lockAsync(previous);
      }).catch(() => undefined);
    };
  }, []);
}

/** 닫기와 재생바는 영상 바깥에, 작은 재생/일시정지만 영상 중앙에 둔다. 닫기는 로딩·오류에도 남는다. */
export function ExerciseVideoFullscreen({ player, onClose, retry }: { player: VideoPlayer; onClose: () => void; retry: ReactNode }) {
  useVideoOrientation();
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} onRequestClose={onClose}>
      <SafeAreaProvider>
        <FullscreenContent player={player} onClose={onClose} retry={retry} />
      </SafeAreaProvider>
    </Modal>
  );
}

function FullscreenContent({ player, onClose, retry }: { player: VideoPlayer; onClose: () => void; retry: ReactNode }) {
  const inset = useSafeAreaInsets();
  const { isPlaying } = useEvent(player, 'playingChange', { isPlaying: player.playing });
  const { status } = useEvent(player, 'statusChange', { status: player.status });
  const [time, setTime] = useState(() => finiteTime(player.currentTime));
  const [duration, setDuration] = useState(() => finiteTime(player.duration));
  const [drag, setDrag] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const seekView = useRef<ComponentRef<typeof View>>(null);
  const seekLeft = useRef(0);
  const dragging = useRef(false);
  const resume = useRef(false);
  const lastPosition = useRef(0);
  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    if (!dragging.current) setTime(finiteTime(currentTime));
  });
  useEventListener(player, 'sourceLoad', ({ duration: seconds }) => setDuration(finiteTime(seconds)));
  useEventListener(player, 'statusChange', ({ status }) => {
    if (status === 'readyToPlay') setDuration(finiteTime(player.duration));
  });
  useEffect(() => {
    const restoreInterval = startTimeUpdates(player);
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') {
        resume.current = false;
        pause(player);
      }
    });
    return () => {
      resume.current = false;
      sub.remove();
      restoreInterval();
    };
  }, [player]);
  const seekable = duration > 0 && width > 0 && status !== 'error';
  const displayed = Math.min(duration || Infinity, drag ?? time);
  const fraction = duration > 0 ? Math.min(1, displayed / duration) : 0;
  // 손가락이 막대 밖으로 나가 다른 자식 위에 있어도 같은 막대의 좌표로 계산한다.
  const position = (e: GestureResponderEvent) => Math.max(0, Math.min(duration, (e.nativeEvent.pageX - seekLeft.current) / Math.max(1, width) * duration));
  const finish = (commit: boolean) => {
    if (commit) {
      seek(player, lastPosition.current);
      setTime(lastPosition.current);
    }
    dragging.current = false;
    setDrag(null);
    if (resume.current && AppState.currentState === 'active') play(player);
    resume.current = false;
  };
  const canSeek = () => seekable && width > 0;
  return (
    <View accessibilityViewIsModal style={[s.fill, { paddingTop: inset.top, paddingBottom: Math.max(8, inset.bottom), paddingLeft: Math.max(12, inset.left), paddingRight: Math.max(12, inset.right) }]}>
      <StatusBar barStyle="light-content" />
      <View style={s.header}>
        <Press accessibilityRole="button" accessibilityLabel="크게 보기 닫기" onPress={onClose} style={s.close}>
          <View style={s.closePill}>
            <Icon name="x" size={17} color={MEDIA.ink} />
            <Text style={s.closeText}>닫기</Text>
          </View>
        </Press>
      </View>
      <View style={s.stage}>
        {status === 'error' ? (
          <View style={s.message}>
            <Text style={s.messageText}>영상을 재생하지 못했어요.</Text>
            {retry}
          </View>
        ) : <>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} fullscreenOptions={{ enable: false }} pointerEvents="none" />
          {status === 'loading' ? <ActivityIndicator color="#fff" accessibilityLabel="영상을 불러오는 중" /> : (
        <Press
          accessibilityRole="button"
          accessibilityLabel={isPlaying ? '영상 일시정지' : '영상 재생'}
          disabled={drag != null}
          onPress={() => isPlaying ? pause(player) : play(player)}
          style={[s.play, s.centerPlay]}
        >
          <View style={s.playDisc}><Icon name={isPlaying ? 'pause' : 'play'} size={15} color={MEDIA.onAction} fill={MEDIA.onAction} /></View>
        </Press>
          )}
        </>}
      </View>
      <View style={s.controls}>

        <View style={s.timeline}>
          <View
            ref={seekView}
            accessible
            accessibilityRole="adjustable"
            accessibilityLabel="영상 재생 위치"
            accessibilityValue={{ min: 0, max: duration, now: Math.min(duration, displayed), text: `${timeText(displayed)} / ${duration ? timeText(duration) : '길이 확인 중'}` }}
            accessibilityState={{ disabled: !seekable }}
            accessibilityActions={[{ name: 'increment', label: '5초 앞으로' }, { name: 'decrement', label: '5초 뒤로' }]}
            onAccessibilityAction={(e) => {
              if (!seekable) return;
              const next = Math.max(0, Math.min(duration, time + (e.nativeEvent.actionName === 'increment' ? 5 : -5)));
              seek(player, next);
              setTime(next);
            }}
            onLayout={(e) => {
              setWidth(e.nativeEvent.layout.width);
              seekView.current?.measureInWindow((left) => { seekLeft.current = left; });
            }}
            onStartShouldSetResponder={canSeek}
            onMoveShouldSetResponder={canSeek}
            onResponderTerminationRequest={() => false}
            onResponderGrant={(e) => {
              dragging.current = true;
              resume.current = player.playing;
              pause(player);
              lastPosition.current = position(e);
              setDrag(lastPosition.current);
            }}
            onResponderMove={(e) => {
              lastPosition.current = position(e);
              setDrag(lastPosition.current);
            }}
            onResponderRelease={(e) => { lastPosition.current = position(e); finish(true); }}
            onResponderTerminate={() => finish(false)}
            style={[s.seekHit, !seekable && { opacity: 0.4 }]}
          >
            <View pointerEvents="none" style={s.track}><View style={[s.progress, { width: `${fraction * 100}%` }]} /></View>
            <View pointerEvents="none" style={[s.thumb, { left: `${fraction * 100}%` }]} />
          </View>
          <View pointerEvents="none" style={s.labels}><Text style={s.time}>{timeText(displayed)}</Text><Text style={s.time}>{duration ? timeText(duration) : '--:--'}</Text></View>
        </View>
      </View>
    </View>
  );
}

const finiteTime = (value: number) => Number.isFinite(value) && value > 0 ? value : 0;
const timeText = (value: number) => `${Math.floor(finiteTime(value) / 60)}:${String(Math.floor(finiteTime(value)) % 60).padStart(2, '0')}`;
function pause(p: VideoPlayer) { try { p.pause(); } catch { /* 닫히는 중에는 재생기가 먼저 정리됐을 수 있다. */ } }
function play(p: VideoPlayer) { try { p.play(); } catch {} }
function seek(p: VideoPlayer, value: number) { try { p.currentTime = finiteTime(value); } catch {} }
function startTimeUpdates(p: VideoPlayer) {
  const previous = p.timeUpdateEventInterval;
  p.timeUpdateEventInterval = 0.25;
  return () => { try { p.timeUpdateEventInterval = previous; } catch { /* 영상이 먼저 닫혔을 수 있다. */ } };
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  header: { minHeight: CONTROL.compact, alignItems: 'flex-end', justifyContent: 'center' },
  close: { minWidth: 72, minHeight: CONTROL.compact, justifyContent: 'center' },
  closePill: { minHeight: 34, paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: MEDIA.card },
  closeText: { ...TYPE.buttonCompact, color: MEDIA.ink, fontSize: 14 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 4, paddingBottom: 2, width: '100%', maxWidth: 800, alignSelf: 'center' },
  play: { width: CONTROL.icon, height: CONTROL.icon, alignItems: 'center', justifyContent: 'center' },
  centerPlay: { position: 'absolute', top: '50%', left: '50%', marginTop: -CONTROL.icon / 2, marginLeft: -CONTROL.icon / 2 },
  playDisc: { width: 32, height: 32, borderRadius: RADIUS.control, backgroundColor: MEDIA.action, alignItems: 'center', justifyContent: 'center' },
  timeline: { flex: 1, minWidth: 0 },
  seekHit: { height: 44, justifyContent: 'center' },
  track: { height: 3, borderRadius: 2, backgroundColor: withAlpha(MEDIA.ink, 0.24), overflow: 'hidden' },
  progress: { height: '100%', backgroundColor: MEDIA.link },
  thumb: { position: 'absolute', width: 10, height: 10, borderRadius: 5, marginLeft: -5, backgroundColor: MEDIA.onAction },
  labels: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, paddingHorizontal: 4 },
  time: { ...TYPE.sub, color: MEDIA.muted, fontVariant: ['tabular-nums'] },
  message: { alignItems: 'center', gap: 14, padding: 24 },
  messageText: { ...TYPE.body, color: MEDIA.ink, textAlign: 'center' },
});
