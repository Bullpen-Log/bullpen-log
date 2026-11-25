import { createContext, useContext, type ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import type { MatchOptions } from '@/lib/wiki';
import { useOptionalWiki } from '@/lib/wiki/context';
import type { Palette } from '~/lib/ui';

/**
 * 싱커위키 낱말을 이은 글(앱) — 웹 components/wiki/wiki-prose.tsx 와 같은 연결 규칙(lib/wiki/match.ts — 긴 이름 먼저 · 낱말 경계 ·
 * 한국어 조사 · 뜻이 여럿인 말은 안 걸림). 원문 글자는 그대로이고, 낱말만 누를 수 있는 안쪽 Text 가 된다.
 * 여는 쪽(WikiOpenProvider)이 없으면 그냥 글이다 — 위키 창이 없는 화면에서 이 부품을 써도 아무것도 열리지 않는다.
 */
type Open = (id: string) => void;
const OpenContext = createContext<Open | null>(null);

export function WikiOpenProvider({ open, children }: { open: Open; children: ReactNode }) {
  return <OpenContext.Provider value={open}>{children}</OpenContext.Provider>;
}

export function useWikiOpen() {
  return useContext(OpenContext);
}

export function WikiText({ text, options, style, c }: { text: string; options?: MatchOptions; style?: StyleProp<TextStyle>; c: Palette }) {
  const open = useContext(OpenContext);
  const wiki = useOptionalWiki();
  if (!open || !wiki) return <Text style={style}>{text}</Text>;
  const segments = wiki.matchWikiProse(text, options);
  return (
    <Text style={style}>
      {segments.map((seg, i) =>
        seg.id ? (
          <Text
            key={i}
            accessibilityRole="link"
            accessibilityHint="싱커위키 뜻을 열어요"
            onPress={() => open(seg.id)}
            suppressHighlighting={false}
            style={{ color: c.link, textDecorationLine: 'underline', textDecorationStyle: 'dotted' }}
          >
            {seg.text}
          </Text>
        ) : (
          <Text key={i}>{seg.text}</Text>
        ),
      )}
    </Text>
  );
}
