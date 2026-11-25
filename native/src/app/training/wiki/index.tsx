import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WIKI_NAME } from '@/lib/wiki/categories';
import { WikiDataProvider, useWiki } from '@/lib/wiki/context';
import { Bar } from '~/community/parts';
import { TYPE, usePalette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { noticeLocked } from '~/shell/release';
import { WikiHome } from '~/wiki/home';
import { WikiReaderProvider, useWikiReader } from '~/wiki/reader';
import { useNativeWikiRead } from '~/wiki/use-wiki-read';

export default function WikiScreen() {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const { slug } = useLocalSearchParams<{ slug?: string }>();
  const [attempt, setAttempt] = useState(0);
  const read = useNativeWikiRead(attempt);
  const back = useCallback(() => router.canGoBack() ? router.back() : router.replace('/' as Href), []);
  const denied = read?.status === 'denied';
  useEffect(() => {
    if (!denied) return;
    noticeLocked();
    back();
  }, [denied, back]);
  return (
    <View style={{ flex: 1, backgroundColor: c.page }}>
      <Bar back="뒤로" title={WIKI_NAME} onBack={back} c={c} />
      {read?.status === 'ready' ? (
        <WikiDataProvider snapshot={read.snapshot}>
          <WikiReaderProvider>
            <OpenSlug slug={typeof slug === 'string' ? slug : undefined} />
            <WikiHome c={c} bottom={inset.bottom} />
          </WikiReaderProvider>
        </WikiDataProvider>
      ) : (
        <View style={{ padding: 24, gap: 12 }}>
          <Text accessibilityLiveRegion="polite" style={[TYPE.body, { color: c.muted }]}>
            {read?.status === 'denied' ? '로그인하면 싱커위키를 열 수 있어요.' :
              read?.status === 'unavailable' ? '싱커위키를 불러오지 못했어요.' : '싱커위키를 불러오는 중이에요.'}
          </Text>
          {read?.status === 'unavailable' && (
            <Press accessibilityRole="button" onPress={() => setAttempt((n) => n + 1)} style={{ minHeight: 44 }}>
              <Text style={[TYPE.body, { color: c.link }]}>다시 시도</Text>
            </Press>
          )}
        </View>
      )}
    </View>
  );
}

function OpenSlug({ slug }: { slug?: string }) {
  const reader = useWikiReader();
  const { wikiBySlug } = useWiki();
  useEffect(() => {
    if (!slug || !reader) return;
    const result = wikiBySlug(slug);
    reader.openFull(result.kind === 'article' ? result.article.id : `missing:${slug}`);
  }, [slug, reader, wikiBySlug]);
  return null;
}
