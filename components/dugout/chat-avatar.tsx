/** 채팅의 동그란 얼굴(2026-10-24) — 프로필 사진, 없으면 이름 첫 글자 */
export function ChatAvatar({ name, url, size = 'md' }: { name: string; url: string | null; size?: 'sm' | 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-14 w-14 text-lg' : size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-11 w-11 text-sm';
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- 서명 주소(저장소)
    <img src={url} alt="" className={`${box} shrink-0 rounded-full object-cover ring-1 ring-line`} />
  ) : (
    <span className={`${box} grid shrink-0 place-items-center rounded-full bg-sky font-bold text-white`}>
      {name.slice(0, 1)}
    </span>
  );
}
