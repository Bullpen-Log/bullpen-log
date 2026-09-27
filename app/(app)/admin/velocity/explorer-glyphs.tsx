/**
 * 탐색기 그림 — PC 파일 탐색기처럼 노란 폴더와, 공 하나를 뜻하는 영상 파일 썸네일.
 *
 * 폴더는 윈도우 · 맥의 폴더 색(호박색)을 그대로 쓴다. 한눈에 '폴더'로 읽혀야 해서 앱의 하늘색이
 * 아니라 누구나 아는 색을 고른다(다크 모드에서도 같은 색 — 윈도우 다크 모드 폴더도 그대로다).
 */

export function FolderGlyph({
  className = 'h-12 w-14',
  badge,
}: {
  className?: string;
  /** 폴더 앞면 오른쪽 아래의 작은 표시 — 보정용 세션 같은 것 */
  badge?: 'calib' | null;
}) {
  return (
    <svg viewBox="0 0 56 46" className={className} aria-hidden>
      {/* 뒷면 · 탭 */}
      <path
        d="M4 9a5 5 0 0 1 5-5h12.6a5 5 0 0 1 3.7 1.6L28.4 9H47a5 5 0 0 1 5 5v3H4z"
        className="fill-amber-400"
      />
      {/* 앞면 */}
      <rect x="4" y="14" width="48" height="28" rx="5" className="fill-amber-300" />
      <rect x="4" y="14" width="48" height="3" rx="1.5" className="fill-amber-200/70" />
      {badge === 'calib' && (
        <g>
          <circle cx="45" cy="36" r="7" className="fill-sky" />
          <path
            d="M41.8 36.2l2.2 2.2 4.2-4.6"
            className="fill-none stroke-white"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </g>
      )}
    </svg>
  );
}

/** 맨 위 '구속 측정' — 탐색기의 드라이브처럼 */
export function DriveGlyph({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect
        x="2.5"
        y="6"
        width="19"
        height="12"
        rx="2.5"
        className="fill-sky-tint stroke-sky"
        strokeWidth="1.5"
      />
      <path
        d="M6 14.5h7"
        className="stroke-sky"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="17.5" cy="14.5" r="1.2" className="fill-sky" />
    </svg>
  );
}

/**
 * 공 하나(파일) — 세로 영상 썸네일 모양에 구속을 크게. 클립이 있으면 재생 표시, 없으면 문서처럼
 * 밝게. 숫자가 썸네일 안에 있어 폴더를 열자마자 구속이 한눈에 보인다.
 */
export function PitchFileGlyph({
  value,
  hasClip,
  excluded,
  className = 'h-20 w-16',
}: {
  value: string;
  hasClip: boolean;
  excluded?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`relative flex flex-col items-center justify-center overflow-hidden rounded-lg border ${
        hasClip
          ? 'border-ink/20 bg-shade text-white'
          : 'border-line-strong bg-surface-2 text-ink'
      } ${excluded ? 'opacity-50' : ''} ${className}`}
      aria-hidden
    >
      {/* 접힌 귀퉁이 */}
      <span
        className={`absolute right-0 top-0 h-3 w-3 rounded-bl-md ${
          hasClip ? 'bg-white/25' : 'bg-line-strong'
        }`}
      />
      <span className="text-display text-lg leading-none tabular-nums">{value}</span>
      <span className={`mt-0.5 text-xs ${hasClip ? 'text-white/70' : 'text-muted'}`}>
        km/h
      </span>
      {hasClip && (
        <span className="absolute bottom-1 left-1 flex h-4 w-4 items-center justify-center rounded-full bg-white/85">
          <svg viewBox="0 0 10 10" className="ml-px h-2 w-2 fill-shade">
            <path d="M2 1.2v7.6L8.6 5z" />
          </svg>
        </span>
      )}
    </span>
  );
}
