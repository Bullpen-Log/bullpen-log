import * as WebBrowser from 'expo-web-browser';
import { Pressable, Text, useWindowDimensions, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ShootReference } from '@/lib/shoot/reference';
import { ExerciseVideo } from '~/workout/parts';
import type { Palette } from '~/lib/ui';

export function ShootReferencePlayer({ reference, title, c }: { reference: ShootReference; title: string; c: Palette }) {
  const { height } = useWindowDimensions();
  if (reference.kind === 'youtube') {
    return <ExerciseVideo path={null} referenceVideoId={reference.id} aspectRatio={reference.aspectRatio} height={Math.min(height * 0.52, 400)} />;
  }

  return (
    <View style={{ gap: 6, alignSelf: 'center', width: '100%', maxWidth: 400 }}>
      <View style={{ height: Math.max(320, Math.min(height * 0.7, 560)), overflow: 'hidden', borderRadius: 12, backgroundColor: c.card }}>
        <WebView
          key={reference.embedUrl}
          accessibilityLabel={`${title} Instagram 참고 영상`}
          source={{ uri: reference.embedUrl }}
          originWhitelist={['*']}
          onOpenWindow={() => {}}
          onShouldStartLoadWithRequest={(request) => {
            if (!request.isTopFrame) return true;
            try {
              const url = new URL(request.url);
              return `${url.origin}${url.pathname}` === reference.embedUrl;
            } catch {
              return false;
            }
          }}
          allowsInlineMediaPlayback
          allowsFullscreenVideo
          mediaPlaybackRequiresUserAction
          setSupportMultipleWindows={false}
        />
      </View>
      <Pressable accessibilityRole="link" onPress={() => void WebBrowser.openBrowserAsync(reference.url)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={{ color: c.link, fontSize: 13, fontWeight: '600' }}>재생이 안 되면 Instagram에서 열기 ↗</Text>
      </Pressable>
    </View>
  );
}
