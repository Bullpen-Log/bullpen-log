import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ComponentRef, type ReactNode } from 'react';
import { AccessibilityInfo, Modal, ScrollView, type ScrollViewInstance, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WIKI_TEXT, wikiStack } from '@/lib/wiki';
import { useWiki } from '@/lib/wiki/context';
import { TYPE, usePalette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { ArticleBody, ArticleChips, KeyPoints } from './article';
import { WikiOpenProvider } from './prose';

/**
 * 싱커위키 읽기 창(앱) — 웹 components/wiki/wiki-glossary.tsx 와 같은 흐름. 낱말 → 짧은 뜻 → [자세히 읽기] → 같은 창 안 전체 글.
 * 창 안의 이어진 글 · 낱말은 같은 창에 쌓여 열리고 [이전: 글 이름]으로 돌아간다.
 *
 * 닫기 차례(앱 규칙):
 *  - [닫기] · 위 [닫기] → 창 전체가 닫힌다(쌓인 글 모두).
 *  - 안드로이드 뒤로 · iOS 시트 끌어내리기(onRequestClose) → 쌓인 앞 글이 있으면 한 칸 뒤로, 없으면 닫힌다.
 *    아래 화면은 창이 닫힐 때까지 그대로다 — 이 창은 아래 화면을 옮기거나 다시 그리지 않는다(Modal 위에만 뜬다).
 * 권한을 확인하고 내려받은 글을 보여 준다. 없는 번호는 '아직 쓰지 않은 말'로 솔직하게.
 */
/** 목록 · 주소에서 글을 바로 전체로 열 때 — 짧은 뜻을 건너뛴다 */
const ReaderContext = createContext<{ openFull: (id: string) => void } | null>(null);
export function useWikiReader() {
  return useContext(ReaderContext);
}

export function WikiReaderProvider({ children }: { children: ReactNode }) {
  const c = usePalette();
  const inset = useSafeAreaInsets();
  const [stack, dispatch] = useReducer(wikiStack, []);
  const scroll = useRef<ScrollViewInstance>(null);
  const heading = useRef<ComponentRef<typeof Text>>(null);
  const open = stack.length > 0;
  const top = stack[stack.length - 1];

  /* dispatch 는 늘 같은 함수라 아래 여는 함수들도 그림마다 새로 안 만든다 */
  const close = () => dispatch({ type: 'close' });
  const openTerm = useMemo(() => (id: string) => dispatch({ type: 'open', id }), []);
  const reader = useMemo(() => ({ openFull: (id: string) => dispatch({ type: 'open', id, view: 'full' }) }), []);
  const go = useMemo(() => (id: string) => dispatch({ type: 'go', id }), []);
  const expand = () => dispatch({ type: 'expand' });
  const back = () => dispatch({ type: 'back' });
  const requestClose = () => dispatch({ type: 'request-close' });

  /* 보기가 바뀌면 맨 위부터 · 읽기 프로그램 초점도 새 글 제목으로(누른 단추가 사라지므로) */
  const viewKey = top ? `${stack.length}:${top.id}:${top.view}` : '';
  useEffect(() => {
    if (!viewKey) return;
    scroll.current?.scrollTo({ y: 0, animated: false });
    const t = setTimeout(() => {
      if (heading.current) AccessibilityInfo.sendAccessibilityEvent?.(heading.current, 'focus');
    }, 350);
    return () => clearTimeout(t);
  }, [viewKey]);

  const { wikiById } = useWiki();
  const article = top ? wikiById(top.id) : undefined;
  const prev = stack.length > 1 ? wikiById(stack[stack.length - 2].id) : undefined;
  const pill = { minHeight: 48, paddingHorizontal: 22, borderRadius: 24, alignItems: 'center', justifyContent: 'center' } as const;

  return (
    <ReaderContext.Provider value={reader}>
    <WikiOpenProvider open={openTerm}>
      {children}
      <Modal visible={open} animationType="slide" presentationStyle="pageSheet" onRequestClose={requestClose}>
        <View style={{ flex: 1, backgroundColor: c.page }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 8 }}>
            <Text ref={heading} accessibilityRole="header" style={[TYPE.card, { flex: 1, color: c.ink }]}>
              {article ? article.title : WIKI_TEXT.unknownTitle}
            </Text>
            <Press accessibilityRole="button" accessibilityLabel="싱커위키 창 닫기" onPress={close} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
              <Text style={[TYPE.buttonCompact, { color: c.link }]}>{WIKI_TEXT.close}</Text>
            </Press>
          </View>
          {/* 창 안 낱말은 같은 창에 쌓는다(창 위에 창을 겹치지 않음) */}
          <WikiOpenProvider open={go}>
            <ScrollView ref={scroll} contentContainerStyle={{ padding: 20, paddingBottom: inset.bottom + 40, gap: 20 }}>
              {prev ? (
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`이전 글 ${prev.title}(으)로 돌아가기`}
                  onPress={back}
                  hitSlop={6}
                  style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', minHeight: 44, gap: 2 }}
                >
                  <Icon name="back" size={20} color={c.link} />
                  <Text style={[TYPE.body, { color: c.link }]}>{WIKI_TEXT.previous(prev.title)}</Text>
                </Press>
              ) : null}
              {!article ? (
                <Text style={[TYPE.reading, { color: c.ink }]}>{WIKI_TEXT.unknownBody}</Text>
              ) : top.view === 'brief' ? (
                <View style={{ gap: 16 }}>
                  {/* 짧은 뜻은 정말 짧게(R1): 묶음 · 꼬리표, 한 줄 뜻, 꼭 알아둘 점 */}
                  <ArticleChips article={article} c={c} />
                  <Text style={[TYPE.reading, { color: c.ink, fontSize: 19, lineHeight: 28 }]}>{article.summary}</Text>
                  <KeyPoints article={article} c={c} />
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                    <Press accessibilityRole="button" onPress={expand} style={[pill, { backgroundColor: c.action }]}>
                      <Text style={[TYPE.button, { color: '#fff' }]}>{WIKI_TEXT.readMore}</Text>
                    </Press>
                    <Press accessibilityRole="button" onPress={close} style={[pill, { borderWidth: 1, borderColor: c.line }]}>
                      <Text style={[TYPE.button, { color: c.ink }]}>{WIKI_TEXT.close}</Text>
                    </Press>
                  </View>
                </View>
              ) : (
                <View style={{ gap: 24 }}>
                  <ArticleBody article={article} onOpen={go} c={c} />
                  <Press accessibilityRole="button" onPress={close} style={[pill, { alignSelf: 'flex-start', borderWidth: 1, borderColor: c.line }]}>
                    <Text style={[TYPE.button, { color: c.ink }]}>{WIKI_TEXT.closeBack}</Text>
                  </Press>
                </View>
              )}
            </ScrollView>
          </WikiOpenProvider>
        </View>
      </Modal>
    </WikiOpenProvider>
    </ReaderContext.Provider>
  );
}
