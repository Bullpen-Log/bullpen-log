const INSTAGRAM_LINE = 'Instagram 참고 영상 ';

/** 인스타 게시물의 원본만 열고 추적 쿼리나 자격정보를 저장하지 않는다. */
export function canonicalInstagramLink(value: string): string | null {
  try {
    const url = new URL(value.trim());
    const match = url.pathname.match(/^\/(reel|p)\/([\w-]{5,30})\/?$/);
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        !['instagram.com', 'www.instagram.com'].includes(url.hostname) || !match) return null;
    return `https://www.instagram.com/${match[1]}/${match[2]}/`;
  } catch {
    return null;
  }
}

/** 영상 링크를 설명 끝에 한 줄로 보존한다. 기존 유튜브 ID나 저장소 경로에는 넣지 않는다. */
export function descriptionWithInstagram(description: string, value: string): string {
  const url = canonicalInstagramLink(value);
  if (!url) throw new Error('인스타그램 릴 또는 게시물의 주소를 입력해 주세요.');
  return `${splitInstagramReference(description).text.trimEnd()}\n\n${INSTAGRAM_LINE}${url}`;
}

export function splitInstagramReference(description: string): { text: string; url: string | null } {
  const text = description.trimEnd();
  const index = text.lastIndexOf('\n');
  const last = text.slice(index + 1).trimStart();
  const url = last.startsWith(INSTAGRAM_LINE) ? canonicalInstagramLink(last.slice(INSTAGRAM_LINE.length)) : null;
  return url ? { text: text.slice(0, index + 1).trimEnd(), url } : { text: description, url: null };
}
