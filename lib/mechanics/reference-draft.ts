const INSTAGRAM_LINE = 'Instagram 참고 영상 ';
const PANELS = ['위', '가운데', '아래'] as const;
export type InstagramSegment = { start: number; end: number; panel?: (typeof PANELS)[number]; recorded?: true };

export function validInstagramSegment(segment: InstagramSegment): boolean {
  return Number.isFinite(segment.start) && Number.isFinite(segment.end) &&
    segment.start >= 0 && segment.end > segment.start &&
    (!segment.panel || PANELS.includes(segment.panel));
}

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
export function descriptionWithInstagram(description: string, value: string, segment?: InstagramSegment): string {
  const url = canonicalInstagramLink(value);
  if (!url) throw new Error('인스타그램 릴 또는 게시물의 주소를 입력해 주세요.');
  if (segment && !validInstagramSegment(segment)) throw new Error('릴의 시작과 끝을 확인해 주세요.');
  const suffix = segment ? ` | ${segment.start}-${segment.end}${segment.recorded ? '*' : ''}${segment.panel ? ` | ${segment.panel}` : ''}` : '';
  return `${splitInstagramReference(description).text.trimEnd()}\n\n${INSTAGRAM_LINE}${url}${suffix}`;
}

export function splitInstagramReference(description: string): { text: string; url: string | null; segment?: InstagramSegment } {
  const text = description.trimEnd();
  const index = text.lastIndexOf('\n');
  const last = text.slice(index + 1).trimStart();
  if (last.startsWith(INSTAGRAM_LINE)) {
    const [address, span, panel, extra] = last.slice(INSTAGRAM_LINE.length).split(' | ');
    const url = canonicalInstagramLink(address);
    const body = text.slice(0, index + 1).trimEnd();
    if (url && span === undefined) return { text: body, url };
    const match = span?.match(/^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)(\*)?$/);
    if (url && match && extra === undefined && (panel === undefined || PANELS.some((value) => value === panel))) {
      const segment: InstagramSegment = { start: Number(match[1]), end: Number(match[2]), panel: panel as InstagramSegment['panel'] };
      if (match[3]) segment.recorded = true;
      if (validInstagramSegment(segment)) return { text: body, url, segment };
    }
  }
  return { text: description, url: null };
}

export function mechanicsReferenceClipPath(id: string): string | null {
  return /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)
    ? `shoot-reference/mechanics/${id}.mp4`
    : null;
}

export function instagramReferenceLabel(segment?: InstagramSegment): string {
  if (!segment) return 'Instagram 참고 영상 보기';
  const time = (value: number) => {
    const tenths = Math.round(value * 10);
    const seconds = Math.floor(tenths / 10) % 60;
    return `${Math.floor(tenths / 600)}:${String(seconds).padStart(2, '0')}${tenths % 10 ? `.${tenths % 10}` : ''}`;
  };
  return `Instagram 참고 영상 · ${time(segment.start)}–${time(segment.end)}${segment.panel ? ` · ${segment.panel} 화면` : ''}`;
}
