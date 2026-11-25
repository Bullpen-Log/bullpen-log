'use client';

import { useState } from 'react';
import { MISSING_PHOTO_TEXT, WIKI_TEXT, type WikiAsset } from '@/lib/wiki';
import { useWiki } from '@/lib/wiki/context';
import { WikiDisclosure } from './disclosure';

/**
 * 싱커위키 장비 사진 — 사진 밑에 짧은 출처(작성자 · 라이선스)를 늘 보이고, '사진 정보'를 펼치면 설명 · 원본 파일 쪽 · 라이선스 주소 ·
 * 바꾼 것을 모두 보인다(CC BY-SA 표기 조건). 사진을 못 불러와도 깨진 그림 대신 설명 · 출처 · 주소가 그대로 남는다.
 * 사진이 없는 글은 PhotoMissing 이 '준비 중' 한 줄만.
 */
export function WikiPhoto({ asset, frame = true }: { asset: WikiAsset; frame?: boolean }) {
  const [failed, setFailed] = useState(false);
  const uri = useWiki().photoUri(asset.id);
  return (
    <figure data-wiki-photo={asset.id} className={frame ? 'overflow-hidden rounded-2xl border border-line bg-surface' : ''}>
      {failed || !uri ? (
        <div role="img" aria-label={asset.alt} className="flex min-h-24 items-center justify-center bg-surface-2 px-4 py-6 text-center text-sm text-muted">
          사진을 불러오지 못했어요 · {asset.alt}
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- 권한을 확인해 받은 사진을 크기 그대로(라이선스 표기와 짝)
        <img
          src={uri}
          width={asset.width}
          height={asset.height}
          alt={asset.alt}
          loading="lazy"
          decoding="async"
          onError={() => setFailed(true)}
          className="h-auto max-h-72 w-full bg-surface-2 object-contain"
        />
      )}
      <figcaption className="px-4 pt-2 pb-1 text-xs leading-relaxed text-muted">
        <PhotoCredit asset={asset} />
      </figcaption>
    </figure>
  );
}

/**
 * 사진 출처 — 작성자 · 라이선스는 늘 보이고, '사진 정보'를 펼치면 설명 · 원본 파일 쪽 · 라이선스 주소 · 바꾼 것(그 자리에서 잘라 보이면 그 말도).
 * 글의 사진(WikiPhoto)과 홈 장비 카드가 같이 쓴다. 링크는 이 안에만 있다 — 홈 카드의 글 링크 밖(형제)에 두어 누르는 것이 겹치지 않게.
 */
export function PhotoCredit({ asset, displayNote, name = 'photo-info' }: { asset: WikiAsset; displayNote?: string; name?: string }) {
  const link = 'inline-flex min-h-10 items-center text-link underline underline-offset-2';
  return (
    <>
      <p>
        사진 {asset.creator} · {asset.license}
      </p>
      <WikiDisclosure title={WIKI_TEXT.photoInfo} name={name} compact>
        <div className="space-y-1">
          <p className="text-sm text-ink">{asset.caption}</p>
          <p>{asset.scopeNote}</p>
          <p>
            <a href={asset.sourcePage} target="_blank" rel="noopener noreferrer" className={link}>
              {WIKI_TEXT.originalPage}({asset.creator} / Wikimedia Commons)
            </a>
          </p>
          <p>
            <a href={asset.licenseUrl} target="_blank" rel="noopener noreferrer license" className={link}>
              {WIKI_TEXT.licenseLink(asset.license)}
            </a>
          </p>
          <p>{asset.modification}</p>
          {displayNote ? <p data-wiki-photo-display="">{displayNote}</p> : null}
        </div>
      </WikiDisclosure>
    </>
  );
}

export function PhotoMissing() {
  return <p className="rounded-2xl border border-dashed border-line px-4 py-4 text-sm text-muted">{MISSING_PHOTO_TEXT}</p>;
}
