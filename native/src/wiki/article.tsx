import { useState } from 'react';
import { Image, Linking, Text, View } from 'react-native';
import {
  MISSING_PHOTO_TEXT,
  WIKI_TEXT,
  articleSourceIds,
  categoryLabel,
  claimSourceLine,
  otherNames,
  provenanceLines,
  seeAlsoIds,
  sourceChecksLine,
  sourceMetaLine,
  type WikiArticle,
  type WikiAsset,
  type WikiSection,
} from '@/lib/wiki';
import { useWiki } from '@/lib/wiki/context';
import { TYPE, withAlpha, type Palette } from '~/lib/ui';
import { Press } from '~/shell/press';
import { BallArc, CategoryBadge, Disclosure } from './parts';
import { WikiText } from './prose';

/**
 * 싱커위키 글 한 편(앱, R1) — 웹 components/wiki/article-body.tsx 와 같은 차례 · 같은 글(lib/wiki/display.ts).
 * 처음 보이는 것: 묶음 · 꼬리표 → 한 줄 뜻 → 예를 들면(장비면 사진) → 꼭 알아둘 점(접지 않음) → 같이 보면 좋은 말.
 * 펼쳐서: 자세한 설명(원래 본문 그대로) · 근거와 출처 · 편집 정보. 이어진 글은 onOpen 으로 같은 창 안에서 연다.
 * 권한을 확인하고 내려받은 글을 보여 준다. 자료 · 사진 원본 · 라이선스 주소만 바깥 브라우저로 연다.
 */

const openUrl = (url: string) => void Linking.openURL(url).catch(() => undefined);

/** 묶음 · 코칭 표현 꼬리표 */
export function ArticleChips({ article, c }: { article: WikiArticle; c: Palette }) {
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <CategoryBadge id={article.category} c={c} size={26} />
        <Text style={[TYPE.sub, { color: c.muted }]}>{categoryLabel(article.category)}</Text>
      </View>
      {article.label ? (
        <View style={{ borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: c.warnBg }}>
          <Text style={[TYPE.sub, { color: c.warn }]}>{article.label}</Text>
        </View>
      ) : null}
    </View>
  );
}

/** 꼭 알아둘 점 — 늘 보인다 */
export function KeyPoints({ article, c }: { article: WikiArticle; c: Palette }) {
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>
        {WIKI_TEXT.keyPoints}
      </Text>
      {article.reading.keyPoints.map((k, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
          <Text style={[TYPE.reading, { color: c.muted }]}>•</Text>
          <Text style={[TYPE.reading, { color: c.ink, flex: 1 }]}>{k}</Text>
        </View>
      ))}
    </View>
  );
}

function Section({ section, exclude, c }: { section: WikiSection; exclude: string; c: Palette }) {
  return (
    <View style={{ gap: 10 }}>
      <Text accessibilityRole="header" style={[TYPE.card, { color: c.ink }]}>
        {section.heading}
      </Text>
      {section.paragraphs.map((p, i) => (
        <WikiText key={i} text={p} options={{ exclude: [exclude] }} style={[TYPE.reading, { color: c.ink }]} c={c} />
      ))}
      {section.bullets?.length ? (
        <View style={{ gap: 6 }}>
          {section.bullets.map((b, i) => (
            <View key={i} style={{ flexDirection: 'row', gap: 8 }}>
              <Text style={[TYPE.reading, { color: c.muted }]}>•</Text>
              <Text style={[TYPE.reading, { color: c.ink, flex: 1 }]}>{b}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** 바깥 주소로 가는 글 단추(사진 원본 · 라이선스 · 자료) — 읽기 프로그램에 링크로 알린다 */
function LinkText({ label, url, c }: { label: string; url: string; c: Palette }) {
  return (
    <Press accessibilityRole="link" accessibilityLabel={label} accessibilityHint="바깥 브라우저로 열어요" onPress={() => openUrl(url)} hitSlop={6} style={{ minHeight: 40, justifyContent: 'center', alignSelf: 'flex-start' }}>
      <Text style={[TYPE.body, { color: c.link, textDecorationLine: 'underline' }]}>{label}</Text>
    </Press>
  );
}

/**
 * 사진 — 앱에 든 파일만. 밑에 짧은 출처(작성자 · 라이선스)는 늘, '사진 정보'를 펼치면 설명 · 원본 파일 쪽 링크 · 라이선스 링크 · 바꾼 것.
 * 사진을 못 불러와도 빈 상자 대신 글 · 출처 · 링크가 그대로 남는다(GPT02 검토 R1: 이름만 적던 것을 실제로 여는 링크로).
 */
export function Photo({ asset, c, framed = true }: { asset: WikiAsset; c: Palette; framed?: boolean }) {
  const [failed, setFailed] = useState(false);
  const uri = useWiki().photoUri(asset.id);
  return (
    <View style={{ gap: 6 }}>
      {uri && !failed ? (
        <Image
          source={{ uri }}
          onError={() => setFailed(true)}
          accessibilityLabel={asset.alt}
          resizeMode="cover"
          style={{ width: '100%', aspectRatio: asset.width / asset.height, borderRadius: framed ? 16 : 0, backgroundColor: c.chip }}
        />
      ) : (
        <View accessible accessibilityLabel={asset.alt} style={{ borderRadius: 16, padding: 16, backgroundColor: c.chip }}>
          <Text style={[TYPE.body, { color: c.muted }]}>사진을 불러오지 못했어요. {asset.alt}</Text>
        </View>
      )}
      <View style={{ paddingHorizontal: framed ? 0 : 16 }}>
        <PhotoCredit asset={asset} c={c} />
      </View>
    </View>
  );
}

/**
 * 사진 출처 — 작성자 · 라이선스는 늘 보이고, '사진 정보'를 펼치면 설명 · 원본 파일 쪽 · 라이선스(바깥 브라우저로 여는 링크) · 바꾼 것,
 * 그 자리에서 잘라 보이면 그 말도(displayNote). 글의 사진(Photo, 사진을 못 불러와도)과 홈 장비 카드가 같이 쓴다.
 * 홈에서는 글로 가는 Press 밖(형제)에 두어 누르는 것이 겹치지 않는다.
 */
export function PhotoCredit({ asset, c, displayNote }: { asset: WikiAsset; c: Palette; displayNote?: string }) {
  return (
    <>
      <Text style={[TYPE.sub, { color: c.muted }]}>
        사진 {asset.creator} · {asset.license}
      </Text>
      <Disclosure title={WIKI_TEXT.photoInfo} c={c} compact>
        <Text style={[TYPE.body, { color: c.ink }]}>{asset.caption}</Text>
        {asset.scopeNote ? <Text style={[TYPE.sub, { color: c.muted }]}>{asset.scopeNote}</Text> : null}
        <LinkText label={`${WIKI_TEXT.originalPage}(${asset.creator} / Wikimedia Commons)`} url={asset.sourcePage} c={c} />
        <LinkText label={WIKI_TEXT.licenseLink(asset.license)} url={asset.licenseUrl} c={c} />
        <Text style={[TYPE.sub, { color: c.muted }]}>{asset.modification}</Text>
        {displayNote ? <Text style={[TYPE.sub, { color: c.muted }]}>{displayNote}</Text> : null}
      </Disclosure>
    </>
  );
}

export function ArticleBody({ article, onOpen, c }: { article: WikiArticle; onOpen: (id: string) => void; c: Palette }) {
  const { assetById, sourceById, wikiById } = useWiki();
  const assets = (article.assetIds ?? []).map(assetById).filter((a) => a !== undefined);
  const [lead, ...morePhotos] = assets;
  const also = seeAlsoIds(article).map((id) => wikiById(id)).filter((a) => a !== undefined);
  const sourceIds = articleSourceIds(article);
  const card = { borderRadius: 16, padding: 16, backgroundColor: c.card, gap: 6 } as const;
  return (
    <View style={{ gap: 24 }}>
      <View style={{ gap: 12 }}>
        <ArticleChips article={article} c={c} />
        <Text style={[TYPE.reading, { color: c.ink, fontSize: 19, lineHeight: 28 }]}>{article.summary}</Text>
      </View>

      <View style={{ borderRadius: 16, backgroundColor: c.card, overflow: 'hidden' }}>
        <View style={{ padding: 16, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <BallArc c={c} />
            <Text style={[TYPE.sub, { color: c.ok, fontWeight: '600' }]}>{WIKI_TEXT.example}</Text>
          </View>
          <Text style={[TYPE.reading, { color: c.ink }]}>{article.reading.example}</Text>
        </View>
        {lead ? <Photo asset={lead} c={c} framed={false} /> : null}
      </View>

      <KeyPoints article={article} c={c} />

      {also.length ? (
        <View style={{ gap: 8 }}>
          <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>{WIKI_TEXT.seeAlso}</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {also.map((a) => (
              <Press
                key={a.id}
                accessibilityRole="button"
                accessibilityLabel={`${a.title} 글 열기`}
                onPress={() => onOpen(a.id)}
                style={{ minHeight: 44, paddingHorizontal: 14, borderRadius: 22, justifyContent: 'center', borderWidth: 1, borderColor: withAlpha(c.ok, 0.35), backgroundColor: withAlpha(c.ok, 0.08) }}
              >
                <Text style={[TYPE.body, { color: c.ink }]}>{a.title}</Text>
              </Press>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Disclosure title={WIKI_TEXT.detail} c={c}>
          <Text style={[TYPE.body, { color: c.muted }]}>{WIKI_TEXT.englishLine(article.english, otherNames(article))}</Text>
          <Section section={article.encounter} exclude={article.id} c={c} />
          <Section section={article.explain} exclude={article.id} c={c} />
          {morePhotos.map((a) => (
            <Photo key={a.id} asset={a} c={c} />
          ))}
          {article.category === 'equipment' && !lead ? <Text style={[TYPE.body, { color: c.muted }]}>{MISSING_PHOTO_TEXT}</Text> : null}
          <Section section={article.notEstablished} exclude={article.id} c={c} />
        </Disclosure>

        <Disclosure title={WIKI_TEXT.evidenceTitle} c={c}>
          <Text style={[TYPE.body, { color: c.muted }]}>{WIKI_TEXT.evidenceIntro}</Text>
          {article.claims.map((cl) => (
            <View key={cl.id} style={[card, { backgroundColor: c.page }]}>
              <Text style={[TYPE.body, { color: c.ink }]}>{cl.text}</Text>
              <Text style={[TYPE.sub, { color: c.muted }]}>{claimSourceLine(cl)}</Text>
            </View>
          ))}
          {sourceIds.length ? (
            <View style={{ gap: 10 }}>
              <Text style={[TYPE.sub, { color: c.muted, fontWeight: '600' }]}>{WIKI_TEXT.sources}</Text>
              {sourceIds.map((id) => {
                const s = sourceById(id);
                if (!s) return null;
                const web = s.url.startsWith('https://');
                return (
                  <View key={id} style={[card, { backgroundColor: 'transparent', borderWidth: 1, borderColor: c.line }]}>
                    <Text
                      accessibilityRole={web ? 'link' : undefined}
                      onPress={web ? () => openUrl(s.url) : undefined}
                      style={[TYPE.body, { color: web ? c.link : c.ink, fontWeight: '600' }]}
                    >
                      <Text style={{ color: c.muted }}>{s.id} </Text>
                      {s.title}
                    </Text>
                    <Text style={[TYPE.sub, { color: c.muted }]}>{sourceMetaLine(s)}</Text>
                    {s.population ? <Text style={[TYPE.sub, { color: c.ink }]}>대상: {s.population}</Text> : null}
                    {s.measured ? <Text style={[TYPE.sub, { color: c.ink }]}>잰 것: {s.measured}</Text> : null}
                    <Text style={[TYPE.sub, { color: c.ink }]}>한계: {s.limits}</Text>
                    <Text style={[TYPE.sub, { color: c.muted }]}>{sourceChecksLine(s)}</Text>
                  </View>
                );
              })}
            </View>
          ) : null}
        </Disclosure>

        <Disclosure title={WIKI_TEXT.editInfo} c={c}>
          {provenanceLines(article).map((line, i) => (
            <Text key={i} style={[TYPE.sub, { color: c.muted }]}>
              {line}
            </Text>
          ))}
        </Disclosure>
      </View>
      <Text style={[TYPE.sub, { color: c.muted }]}>{WIKI_TEXT.homeNote}</Text>
    </View>
  );
}
