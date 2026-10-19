import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { LocalVideo } from '../../modules/local-video';
import { isPhoneVideoPath, phoneAssetId, serverVideoUrls } from './api';

/**
 * 투구 영상 하나 — 폰 영상(`{userId}/local-…`)은 앱 안 영상 폴더의 파일을 바로, 서버 영상은 서명 주소로 튼다. 폰에 없으면(다른 폰 · 앱을
 * 다시 깔아 지워짐) 웹과 같은 말을 보인다.
 */
/** 영상 경로 → 틀 수 있는 주소(폰 영상은 앱 안 파일, 서버 영상은 서명 주소) — 그날 화면 · 2분할 비교가 같이 쓴다 */
export function useVideoUri(path: string | null): { uri: string | null; error: string | null } {
  const [state, setState] = useState<{ path: string | null; uri: string | null; error: string | null }>({ path: null, uri: null, error: null });

  useEffect(() => {
    if (!path) return;
    let alive = true;
    const job = isPhoneVideoPath(path)
      ? LocalVideo.fileUrl({ id: phoneAssetId(path) }).then((r) => r.url)
      : serverVideoUrls([path]).then((urls) => {
          const url = urls[path];
          if (!url) throw new Error('영상을 찾지 못했어요');
          return url;
        });
    job.then(
      (u) => alive && setState({ path, uri: u, error: null }),
      () =>
        alive &&
        setState({
          path,
          uri: null,
          error: isPhoneVideoPath(path) ? '이 영상은 이 폰에 없어요. 찍은 폰의 불펜로그 앱에서 볼 수 있어요.' : '영상을 불러오지 못했어요.',
        })
    );
    return () => {
      alive = false;
    };
  }, [path]);

  /* 경로가 바뀐 뒤 새 주소가 오기 전에는 옛 주소를 안 보인다 */
  return state.path === path ? { uri: state.uri, error: state.error } : { uri: null, error: null };
}

export function PitchVideo({ path }: { path: string }) {
  const { uri, error } = useVideoUri(path);
  if (error)
    return (
      <View style={[styles.box, styles.center]}>
        <Text style={styles.note}>{error}</Text>
      </View>
    );
  if (!uri)
    return (
      <View style={[styles.box, styles.center]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  return <Player uri={uri} />;
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

const styles = StyleSheet.create({
  box: { width: '100%', aspectRatio: 9 / 16, maxHeight: 420, alignSelf: 'center', borderRadius: 16, backgroundColor: '#000', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 16 },
  note: { color: 'rgba(255,255,255,0.8)', fontSize: 15, textAlign: 'center' },
});
