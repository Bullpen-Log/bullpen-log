import { Text } from 'react-native';
import { WikiDataProvider } from '@/lib/wiki/context';
import { TYPE, type Palette } from '~/lib/ui';
import { WikiText } from './prose';
import { WikiReaderProvider } from './reader';
import { useNativeWikiRead } from './use-wiki-read';

export function WorkoutWikiDescription({ text, c }: { text: string; c: Palette }) {
  const read = useNativeWikiRead();
  const style = [TYPE.reading, { color: c.ink }];
  if (read?.status !== 'ready') return <Text style={style}>{text}</Text>;
  return (
    <WikiDataProvider snapshot={read.snapshot}>
      <WikiReaderProvider>
        <WikiText text={text} style={style} c={c} />
      </WikiReaderProvider>
    </WikiDataProvider>
  );
}
