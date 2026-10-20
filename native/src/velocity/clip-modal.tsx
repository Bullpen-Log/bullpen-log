import { useVideoPlayer, VideoView } from 'expo-video';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Press } from '~/shell/press';

/** 잰 공의 클립 다시 보기 — 앱 카메라가 tmp 에 둔 파일을 그대로(저장 전이라 서버엔 아직 없다). 소리 없음 · 되풀이 */
export function ClipModal({ path, onClose }: { path: string | null; onClose: () => void }) {
  return (
    <Modal visible={path != null} animationType="fade" onRequestClose={onClose} supportedOrientations={['portrait']}>
      {path ? <Clip uri={path.startsWith('file://') ? path : `file://${path}`} onClose={onClose} /> : null}
    </Modal>
  );
}

function Clip({ uri, onClose }: { uri: string; onClose: () => void }) {
  const inset = useSafeAreaInsets();
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
    p.play();
  });
  return (
    <View style={styles.root}>
      <VideoView player={player} style={StyleSheet.absoluteFill} nativeControls contentFit="contain" />
      <Press
        accessibilityRole="button"
        accessibilityLabel="닫기"
        onPress={onClose}
        style={[styles.close, { top: inset.top + 8 }]}
        hitSlop={8}
      >
        <Text style={styles.closeText}>닫기</Text>
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  close: { position: 'absolute', left: 16, height: 40, paddingHorizontal: 16, borderRadius: 20, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)' },
  closeText: { color: '#fff', fontSize: 17, fontWeight: '600' },
});
