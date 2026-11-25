import { useMemo, useState } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';
import {
  WIKI_CATEGORIES,
  WIKI_SUBTITLE,
  WIKI_TEXT,
  categoryLabel,
  matchHint,
  type WikiCategoryId,
} from '@/lib/wiki';
import { useWiki } from '@/lib/wiki/context';
import { READABLE } from '~/lib/layout';
import { TYPE, withAlpha, type Palette } from '~/lib/ui';
import { Icon } from '~/shell/icon';
import { Press } from '~/shell/press';
import { PhotoCredit } from './article';
import { BallArc, CategoryBadge } from './parts';
import { useWikiReader } from './reader';

/**
 * 싱커위키 홈(앱, R1) — 웹 components/wiki/wiki-home.tsx 와 같은 검색 · 묶음. 위 막대(Bar)가 이미 '싱커위키'라 큰 제목을 또 두지 않는다.
 * 처음엔 둘러보기: 검색 · 묶음 그림 · 먼저 알아두면 좋은 말 넷 · 장비 사진 둘(사진이 있는 장비만). 찾거나 고르면 그 자리에 맞는 글만.
 * 준비 중인 말은 접어 둔다. 글을 고르면 같은 화면 위 읽기 창에서 바로 전체 글. 권한 확인 뒤 받은 글과 사진을 읽는다.
 */
export function WikiHome({ c, bottom }: { c: Palette; bottom: number }) {
  const reader = useWikiReader();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<WikiCategoryId | null>(null);
  const { assetById, photoUri, searchWikiArticles, wikiArticles, wikiById, firstTerms, photoGear } = useWiki();
  const hits = useMemo(() => searchWikiArticles(query, category), [query, category, searchWikiArticles]);
  const all = wikiArticles();
  const searching = query.trim().length > 0;
  const browsing = !searching && !category;
  const counts = useMemo(() => {
    const m = new Map<WikiCategoryId, number>();
    for (const a of all) m.set(a.category, (m.get(a.category) ?? 0) + 1);
    return m;
  }, [all]);
  const open = (id: string) => reader?.openFull(id);
  const first = firstTerms.map((id) => wikiById(id)).filter((a) => a !== undefined);
  const gear = photoGear.map((id) => wikiById(id)).filter((a) => a !== undefined);
  const card = { borderRadius: 16, backgroundColor: c.card } as const;
  const half = { flexBasis: '47%', flexGrow: 1 } as const;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={[{ padding: 16, paddingBottom: bottom + 32, gap: 24 }, READABLE]}>
      <Text style={[TYPE.body, { color: c.muted }]}>{WIKI_SUBTITLE}</Text>

      <View style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 14, backgroundColor: c.card, borderWidth: 1, borderColor: c.line }}>
          <Icon name="search" size={20} color={c.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={WIKI_TEXT.searchPlaceholder}
            placeholderTextColor={c.muted}
            accessibilityLabel={WIKI_TEXT.searchLabel}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            style={{ flex: 1, minHeight: 48, fontSize: 17, color: c.ink }}
          />
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityLabel="묶음으로 거르기">
          {WIKI_CATEGORIES.filter((k) => counts.get(k.id)).map((k) => {
            const on = category === k.id;
            return (
              <Press
                key={k.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${k.label} ${counts.get(k.id)}편`}
                select
                selected={on}
                onPress={() => setCategory(on ? null : k.id)}
                style={[half, card, { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 60, paddingHorizontal: 12, borderWidth: 1, borderColor: on ? c.ok : 'transparent', backgroundColor: on ? withAlpha(c.ok, 0.12) : c.card }]}
              >
                <CategoryBadge id={k.id} c={c} size={36} />
                <View style={{ flex: 1 }}>
                  <Text style={[TYPE.card, { color: c.ink }]}>{k.label}</Text>
                  <Text style={[TYPE.sub, { color: c.muted }]}>{counts.get(k.id)}편</Text>
                </View>
              </Press>
            );
          })}
        </View>
      </View>

      {browsing ? (
        <>
          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>
              {WIKI_TEXT.firstTerms}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {first.map((a) => (
                <Press key={a.id} card accessibilityRole="button" accessibilityLabel={`${a.title}. ${a.reading.card}`} onPress={() => open(a.id)} style={[half, card, { padding: 16, gap: 6 }]}>
                  <BallArc c={c} />
                  <Text style={[TYPE.card, { color: c.ink }]}>{a.title}</Text>
                  <Text style={[TYPE.body, { color: c.muted }]}>{a.reading.card}</Text>
                </Press>
              ))}
            </View>
          </View>

          <View style={{ gap: 10 }}>
            <Text accessibilityRole="header" style={[TYPE.section, { color: c.ink }]}>
              {WIKI_TEXT.equipmentTitle}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {gear.map((a) => {
                const photo = a.assetIds?.[0] ? assetById(a.assetIds[0]) : undefined;
                const uri = photo ? photoUri(photo.id) : undefined;
                /* 카드 = 사진 한 장의 쓰임. 글로 가는 Press 는 사진 · 이름 · 한 줄만, 출처(작성자 · 라이선스 · 사진 정보)는 그 밑 형제로 — 링크가 겹치지 않게.
                   이 칸은 사진을 4:3 으로 잘라 보여 그 말도 사진 정보에(웹 홈과 같은 글) */
                return (
                  <View key={a.id} style={[half, card, { overflow: 'hidden' }]}>
                    <Press card accessibilityRole="button" accessibilityLabel={`${a.title}. ${a.reading.card}`} onPress={() => open(a.id)}>
                      {uri ? <Image source={{ uri }} resizeMode="cover" accessibilityIgnoresInvertColors style={{ width: '100%', aspectRatio: 4 / 3, backgroundColor: c.chip }} /> : null}
                      <View style={{ paddingHorizontal: 12, paddingTop: 12, paddingBottom: 6, gap: 4 }}>
                        <Text style={[TYPE.card, { color: c.ink }]}>{a.title}</Text>
                        <Text style={[TYPE.body, { color: c.muted }]}>{a.reading.card}</Text>
                      </View>
                    </Press>
                    {photo ? (
                      <View style={{ paddingHorizontal: 12, paddingBottom: 8 }}>
                        <PhotoCredit asset={photo} c={c} displayNote={WIKI_TEXT.homeCropNote} />
                      </View>
                    ) : null}
                  </View>
                );
              })}
              <Press accessibilityRole="button" onPress={() => setCategory('equipment')} style={[card, { flexBasis: '100%', flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }]}>
                <CategoryBadge id="equipment" c={c} size={36} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[TYPE.card, { color: c.ink }]}>{WIKI_TEXT.equipmentButton(counts.get('equipment') ?? 0)}</Text>
                  <Text style={[TYPE.sub, { color: c.muted }]}>
                    {all
                      .filter((a) => a.category === 'equipment' && !photoGear.includes(a.id))
                      .map((a) => a.title)
                      .join(' · ')}
                  </Text>
                </View>
                <Text style={{ color: c.muted, fontSize: 17 }}>›</Text>
              </Press>
            </View>
          </View>

        </>
      ) : (
        <View style={{ gap: 10 }} accessibilityLiveRegion="polite">
          <Text style={[TYPE.sub, { color: c.muted }]}>
            {searching ? `"${query.trim()}"` : categoryLabel(category!)} {WIKI_TEXT.resultCount(hits.length)}
          </Text>
          {hits.length === 0 ? (
            <View style={{ borderRadius: 16, padding: 16, gap: 10, borderWidth: 1, borderStyle: 'dashed', borderColor: c.line }}>
              <Text style={[TYPE.reading, { color: c.ink }]}>{WIKI_TEXT.noResult}</Text>
              <Text style={[TYPE.body, { color: c.muted }]}>{WIKI_TEXT.noResultHint}</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {query ? (
                  <Press accessibilityRole="button" onPress={() => setQuery('')} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', borderWidth: 1, borderColor: c.line }}>
                    <Text style={[TYPE.body, { color: c.ink }]}>{WIKI_TEXT.clearQuery}</Text>
                  </Press>
                ) : null}
                {category ? (
                  <Press accessibilityRole="button" onPress={() => setCategory(null)} style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', borderWidth: 1, borderColor: c.line }}>
                    <Text style={[TYPE.body, { color: c.ink }]}>{WIKI_TEXT.clearCategory}</Text>
                  </Press>
                ) : null}
              </View>
            </View>
          ) : (
            <View style={{ gap: 8 }}>
              {hits.map((h) => {
                const hint = matchHint(h);
                return (
                  <Press
                    key={h.article.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${h.article.title}. ${h.article.reading.card}`}
                    onPress={() => open(h.article.id)}
                    style={[card, { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 }]}
                  >
                    <CategoryBadge id={h.article.category} c={c} size={28} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[TYPE.card, { color: c.ink }]}>{h.article.title}</Text>
                      <Text style={[TYPE.body, { color: c.muted }]}>
                        {h.article.reading.card}
                        {hint ? ` · ${hint}` : ''}
                      </Text>
                    </View>
                  </Press>
                );
              })}
            </View>
          )}
        </View>
      )}

      <Text style={[TYPE.sub, { color: c.muted }]}>{WIKI_TEXT.homeNote}</Text>
    </ScrollView>
  );
}
