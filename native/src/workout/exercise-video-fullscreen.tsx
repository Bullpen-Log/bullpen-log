import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StatusBar, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { PALETTES, TYPE } from '~/lib/ui';
import { videoPictureRect } from '@/lib/exercise-video-state';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
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

/** Fullscreen keeps one VideoView attached. Controls belong to its fitted picture,
 * not an added footer/header. Screen/source mismatch outside the picture stays uncropped.
 */
type FullscreenProps = {
  player: VideoPlayer;
  aspectRatio: number;
  onClose: () => void;
  onStageTap: () => void;
  status: string;
  isPlaying: boolean;
  retry: ReactNode;
  controls: ReactNode;
};
export function ExerciseVideoFullscreen(props: FullscreenProps) {
  useVideoOrientation();
  return <Modal visible animationType="fade" presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} onRequestClose={props.onClose}>
    <GestureHandlerRootView style={{ flex: 1 }}><SafeAreaProvider><FullscreenContent {...props} /></SafeAreaProvider></GestureHandlerRootView>
  </Modal>;
}
function FullscreenContent({ player, aspectRatio, onClose, onStageTap, status, isPlaying, retry, controls }: FullscreenProps) {
  const inset = useSafeAreaInsets();
  const window = useWindowDimensions();
  const [area, setArea] = useState({ width: window.width - inset.left - inset.right, height: window.height - inset.top - inset.bottom });
  const picture = videoPictureRect(area.width, area.height, aspectRatio);
  return <View accessibilityViewIsModal style={[s.fill, { paddingTop: inset.top, paddingBottom: inset.bottom, paddingLeft: inset.left, paddingRight: inset.right }]}>
    <StatusBar barStyle="light-content" />
    <View style={{ flex: 1 }} onLayout={(e) => setArea(e.nativeEvent.layout)}>
      <View style={{ position: 'absolute', left: picture.x, top: picture.y, width: picture.width, height: picture.height, backgroundColor: '#000' }}>
        {status === 'error' ? <View style={[StyleSheet.absoluteFill, s.message]}><Text style={s.messageText}>영상을 재생하지 못했어요.</Text>{retry}</View> : <>
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} fullscreenOptions={{ enable: false }} pointerEvents="none" />
          <Pressable onPress={onStageTap} accessibilityRole="button" accessibilityLabel={isPlaying ? '영상 멈춤' : '영상 재생'} style={StyleSheet.absoluteFill} />
          {status === 'loading' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.message]}><ActivityIndicator color="#fff" accessibilityLabel="영상을 불러오는 중" /></View> : null}
        </>}
        {controls}
      </View>
      <Press accessibilityRole="button" accessibilityLabel="크게 보기 닫기" onPress={onClose} style={s.close}><Icon name="x" size={17} color="#fff" /></Press>
    </View>
  </View>;
}
const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', top: 4, right: 4, width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(0,0,0,0.3)', alignItems: 'center', justifyContent: 'center' },
  message: { alignItems: 'center', justifyContent: 'center', gap: 14, padding: 16 },
  messageText: { ...TYPE.body, color: MEDIA.ink, textAlign: 'center' },
});
