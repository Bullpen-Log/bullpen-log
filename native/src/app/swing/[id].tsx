import { SymbolView } from 'expo-symbols';
import { useLocalSearchParams } from 'expo-router';
import { useVideoPlayer, VideoView } from 'expo-video';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SwingDetail } from '@/app/actions/swing-lab';
import { Bar, LoadState, s, useLoad } from '~/community/parts';
import { usePalette } from '~/lib/ui';
import { READABLE_WIDE } from '~/lib/layout';

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
            <SymbolView name="rotate.3d" size={26} tintColor="#8b93a7" />
            <Text style={{ color: '#e8eef7', fontSize: 17, fontWeight: '600', textAlign: 'center' }}>3D 스윙 모델을 만드는 중이에요</Text>
            <Text style={{ color: '#9aa3b8', fontSize: 15, textAlign: 'center' }}>영상은 그대로 두세요. 모델이 열리면 이 스윙으로 리포트를 받을 수 있어요.</Text>
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
            {data.videos.map((v) => (
              <Clip key={v.key} label={v.label} url={v.url} c={c} />
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

function Clip({ label, url, c }: { label: string; url: string | null; c: ReturnType<typeof usePalette> }) {
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, gap: 6 }}>
      <Text style={[s.meta, { color: c.muted, fontWeight: '600' }]}>{label}</Text>
      {url ? (
        <Player uri={url} />
      ) : (
        <View style={{ aspectRatio: 9 / 16, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.card }}>
          <Text style={[s.meta, { color: c.muted }]}>영상 없음</Text>
        </View>
      )}
    </View>
  );
}

function Player({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (p) => {
    p.muted = true;
    p.loop = true;
  });
  return <VideoView player={player} style={{ width: '100%', aspectRatio: 9 / 16, borderRadius: 12, backgroundColor: '#000' }} contentFit="contain" nativeControls />;
}
