import { Icon } from '~/shell/icon';
import { useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SwingDetail } from '@/app/actions/swing-lab';
import { Bar, LoadState, s, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE_WIDE } from '~/lib/layout';
import { usePauseWhenHidden } from '~/pitch/video';
import { useState } from 'react';

/**
 * 3D 스윙 분석 샘플 하나(앱) — 영상(정면 · 포수 뒤 + 마커 샘플의 ③ · ④)과 촬영 정보. 3D 모델은 샘플을 모은 뒤에 만들어 그 자리는 '준비 중'.
 * 웹 /hitting/lab/<id> 와 같은 내용(app/actions/swing-lab.ts loadAppSwingDetail).
 */
export default function SwingSampleScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, error, reload } = useLoad<SwingDetail>('swing-lab.loadAppSwingDetail', id ?? '');
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="3D 스윙" title={data?.title ?? '스윙'} c={c} />
      {!data ? (
        <LoadState error={error} onRetry={() => void reload()} c={c} />
      ) : (
        <ScrollView contentContainerStyle={[{ padding: 16, gap: 16, paddingBottom: inset.bottom + 32 }, READABLE_WIDE]}>
          {data.chips.length > 0 ? <Text style={[s.meta, { color: c.muted, paddingHorizontal: 4 }]}>{data.chips.join(' · ')}</Text> : null}
          {data.memo ? <Text style={{ color: c.ink, fontSize: 15, paddingHorizontal: 4 }}>{data.memo}</Text> : null}
          <View style={{ borderRadius: 16, padding: 20, gap: 8, alignItems: 'center', backgroundColor: '#151722' }}>
            <Icon name="batter" size={26} color="#8b93a7" />
            <Text style={{ color: '#e8eef7', fontSize: 17, fontWeight: '600', textAlign: 'center' }}>3D 스윙 모델을 만드는 중이에요</Text>
            <Text style={{ color: '#9aa3b8', fontSize: 15, textAlign: 'center' }}>영상은 그대로 두세요. 모델이 열리면 이 스윙으로 리포트를 받을 수 있어요.</Text>
          </View>
          <ClipRow videos={data.videos} c={c} />
        </ScrollView>
      )}
    </View>
  );
}

/*
 * 세로(9 : 16) 영상 줄 — 받은 폭이 넓으면(아이패드 가로) 네 칸, 아니면 두 칸. 한 칸 높이는 화면 높이에서 머리 · 여백을 뺀 만큼을 넘지 않는다 —
 * 넓은 창에서 두 칸이면 한 칸이 화면보다 길어 재생 단추가 화면 밖이었다(2026-10-26 아이패드 점검). 영상은 그 안에 비율대로(contain).
 */
type Video = Extract<SwingDetail, { videos: unknown }>['videos'][number];
function ClipRow({ videos, c }: { videos: Video[]; c: ReturnType<typeof usePalette> }) {
  const { height: winH } = useWindowDimensions();
  const [w, setW] = useState(0);
  const per = w >= 868 && videos.length > 2 ? 4 : 2;
  const cell = w ? (w - 10 * (per - 1)) / per : 0;
  const boxH = cell ? Math.min((cell * 16) / 9, Math.max(240, winH - 200)) : undefined;
  return (
    <View onLayout={(e) => setW(Math.round(e.nativeEvent.layout.width))} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
      {videos.map((v) => (
        <View key={v.key} style={{ flexBasis: per === 4 ? '23%' : '47%', flexGrow: 1, gap: 6 }}>
          <Text style={[s.meta, { color: c.muted, fontWeight: '600' }]}>{v.label}</Text>
          {v.url ? (
            <Player uri={v.url} height={boxH} />
          ) : (
            <View style={[{ borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card }, boxH ? { height: boxH } : { aspectRatio: 9 / 16 }]}>
              <Text style={[s.meta, { color: c.muted }]}>영상 없음</Text>
            </View>
          )}
        </View>
      ))}
    </View>
  );
}

function Player({ uri, height }: { uri: string; height?: number }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
  });
  /* 위에 다른 화면이 쌓이면 멈췄다 돌아오면 다시(pitch/video.tsx) */
  usePauseWhenHidden(player, false);
  return (
    <VideoView
      player={player}
      style={[{ width: '100%', borderRadius: 12, backgroundColor: '#000' }, height ? { height } : { aspectRatio: 9 / 16 }]}
      contentFit="contain"
      nativeControls
    />
  );
}
