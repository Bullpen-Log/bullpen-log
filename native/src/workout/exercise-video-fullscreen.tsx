import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView, type VideoPlayer } from 'expo-video';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONTROL, PALETTES, RADIUS, TYPE } from '~/lib/ui';
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

/**
 * 크게 보기(앱 안 모달, VP01) — 같은 player 를 넘겨받아 VideoView 를 하나만 붙인다(인라인은 그동안 비운다).
 * 영상 무대 전체를 한 번 누르면 멈춤/재생, 조작부는 인라인과 같은 부품을 검은 틀 하단에 두고 영상 표시 영역과 분리한다(가운데 버튼 없음).
 * 닫기는 로딩 · 오류에도 남는다. 위치 · 배속 · 소리 · 재생 의도는 같은 player · 같은 제어 상태라 그대로 이어진다.
 */
export function ExerciseVideoFullscreen(props: {
  player: VideoPlayer;
  onClose: () => void;
  onStageTap: () => void;
  status: string;
  isPlaying: boolean;
  retry: ReactNode;
  controls: ReactNode;
}) {
  useVideoOrientation();
  return (
    <Modal visible animationType="fade" presentationStyle="fullScreen" supportedOrientations={['portrait', 'landscape-left', 'landscape-right']} onRequestClose={props.onClose}>
      <SafeAreaProvider>
        <FullscreenContent {...props} />
      </SafeAreaProvider>
    </Modal>
  );
}

function FullscreenContent({ player, onClose, onStageTap, status, isPlaying, retry, controls }: {
  player: VideoPlayer;
  onClose: () => void;
  onStageTap: () => void;
  status: string;
  isPlaying: boolean;
  retry: ReactNode;
  controls: ReactNode;
}) {
  const inset = useSafeAreaInsets();
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
          <Pressable onPress={onStageTap} accessibilityRole="button" accessibilityLabel={isPlaying ? '영상 멈춤' : '영상 재생'} style={StyleSheet.absoluteFill} />
          {status === 'loading' ? <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.loading]}><ActivityIndicator color="#fff" accessibilityLabel="영상을 불러오는 중" /></View> : null}
        </>}
      </View>
      <View style={s.controls}>{controls}</View>
    </View>
  );
}

const s = StyleSheet.create({
  fill: { flex: 1, backgroundColor: '#000' },
  header: { minHeight: CONTROL.compact, alignItems: 'flex-end', justifyContent: 'center' },
  close: { minWidth: 72, minHeight: CONTROL.compact, justifyContent: 'center' },
  closePill: { minHeight: 34, paddingHorizontal: 12, paddingVertical: 5, borderRadius: RADIUS.pill, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: MEDIA.card },
  closeText: { ...TYPE.buttonCompact, color: MEDIA.ink, fontSize: 14 },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 0 },
  loading: { alignItems: 'center', justifyContent: 'center' },
  controls: { flexShrink: 0, width: '100%', maxWidth: 800, alignSelf: 'center' },
  message: { alignItems: 'center', gap: 14, padding: 24 },
  messageText: { ...TYPE.body, color: MEDIA.ink, textAlign: 'center' },
});
