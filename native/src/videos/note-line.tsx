import { type Href, router } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { TYPE, usePalette } from '~/lib/ui';
import { findMyVideo, useMyVideos } from './store';

/**
 * 투구 그날 화면의 영상 밑 한 줄 — 이 영상의 감각 메모(내 영상과 같은 값). 누르면 내 영상 상세에서 고친다.
 * 기록 총평과 따로다 — 여기서 총평을 보이거나 고치지 않는다.
 */
export function VideoNoteLine({ path }: { path: string }) {
  const c = usePalette();
  useMyVideos();
  const note = findMyVideo(path)?.note ?? null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={note ? `영상 메모 ${note}` : '영상 메모 적기'}
      onPress={() => router.push({ pathname: '/my-videos/view', params: { path } } as unknown as Href)}
      hitSlop={6}
      style={({ pressed }) => pressed && { opacity: 0.5 }}
    >
      <Text numberOfLines={2} style={[TYPE.sub, { color: note ? c.ink : c.link }]}>
        {note ? `영상 메모 · ${note}` : '이 영상의 느낌 적기 ›'}
      </Text>
    </Pressable>
  );
}
