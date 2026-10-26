'use client';

import { useRef, useState } from 'react';
import { X } from '@/components/icon';
import { RoundPhotoPlus } from '@/components/round-icon';
import { uploadToStorage } from '@/components/video-upload';
import { shrinkImage } from '@/lib/shrink-image';
import { MEDIA_MAX, MEDIA_TYPES, MEDIA_VIDEO_MAX_MB } from '@/lib/community';

type Item = { key: string; path?: string; url: string; video: boolean; progress?: number };

/**
 * 글에 붙이는 사진 · 영상 — 사진은 브라우저가 줄여서(lib/shrink-image.ts), 영상은 그대로(50MB 까지) 저장소로 바로 올리고
 * 경로만 폼에 싣는다(name="media"). 장터 사진 칸(components/dugout/listing-form.tsx)과 같은 길.
 * 올리는 중이면 onBusy(true) — 폼이 올리기 단추를 잠근다.
 */
export function CommunityMediaPicker({
  onBusy,
  initial = [],
}: {
  onBusy?: (busy: boolean) => void;
  /** 고치기 — 이미 붙어 있는 사진 · 영상(빼면 글을 고칠 때 파일도 지운다) */
  initial?: { path: string; url: string; video: boolean }[];
}) {
  const [items, setItems] = useState<Item[]>(() => initial.map((m) => ({ key: m.path, path: m.path, url: m.url, video: m.video })));
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const busy = useRef(0);

  function track(delta: number) {
    busy.current += delta;
    onBusy?.(busy.current > 0);
  }

  async function add(files: FileList | null) {
    if (!files) return;
    setError(null);
    const room = MEDIA_MAX - items.length;
    const picked = Array.from(files).slice(0, room);
    if (picked.length < files.length) setError(`사진 · 영상은 ${MEDIA_MAX}개까지예요.`);
    for (const file of picked) {
      /* 사진은 무엇이든 JPEG 로 줄여 올린다(아이폰 HEIC 포함) — 영상만 형식을 본다 */
      const video = file.type.startsWith('video/');
      if (video ? !MEDIA_TYPES[file.type] : !file.type.startsWith('image/')) {
        setError('사진이나 영상(MP4 · MOV)만 올릴 수 있어요.');
        continue;
      }
      if (video && file.size > MEDIA_VIDEO_MAX_MB * 1024 * 1024) {
        setError(`영상은 ${MEDIA_VIDEO_MAX_MB}MB 이하만 올릴 수 있어요. 짧게 잘라 주세요.`);
        continue;
      }
      const key = crypto.randomUUID();
      const url = URL.createObjectURL(file);
      setItems((list) => [...list, { key, url, video, progress: 0 }]);
      track(1);
      try {
        const blob = video ? file : await shrinkImage(file);
        const path = await uploadToStorage(blob, '/api/community/upload-url', (progress) =>
          setItems((list) => list.map((x) => (x.key === key ? { ...x, progress } : x)))
        );
        setItems((list) =>
          list.map((x) => (x.key === key ? { ...x, path, progress: undefined } : x))
        );
      } catch (e) {
        setItems((list) => list.filter((x) => x.key !== key));
        setError(e instanceof Error ? e.message : '올리지 못했어요.');
      } finally {
        track(-1);
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <fieldset className="space-y-2">
      <legend className="block text-xs font-medium text-muted">
        사진 · 영상 <span className="text-muted/70">{MEDIA_MAX}개까지 · 영상 {MEDIA_VIDEO_MAX_MB}MB</span>
      </legend>
      <div className="flex flex-wrap gap-2">
        {items.map((it) => (
          <div key={it.key} className="relative h-24 w-24 overflow-hidden rounded-xl bg-surface-2">
            {it.video ? (
              <video src={it.url} muted playsInline className="h-full w-full object-cover" />
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element -- 브라우저의 임시 주소 */
              <img src={it.url} alt="" className="h-full w-full object-cover" />
            )}
            {it.path ? (
              <input type="hidden" name="media" value={it.path} />
            ) : (
              <span className="absolute inset-0 grid place-items-center bg-ink/40 text-xs font-semibold text-white tabular-nums">
                {it.progress ?? 0}%
              </span>
            )}
            {it.video && it.path && (
              <span className="absolute bottom-1 left-1 rounded-md bg-ink/70 px-1.5 text-[10px] font-bold text-white">
                영상
              </span>
            )}
            {it.path && (
              <button
                type="button"
                aria-label="빼기"
                onClick={() => setItems((list) => list.filter((x) => x.key !== it.key))}
                className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        ))}
        {items.length < MEDIA_MAX && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="grid h-24 w-24 place-items-center rounded-xl border border-dashed border-line-strong text-muted hover:border-sky hover:text-sky"
          >
            <span className="flex flex-col items-center gap-1 text-xs">
              <RoundPhotoPlus className="h-5 w-5" /> 추가
            </span>
          </button>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*,video/mp4,video/quicktime"
        multiple
        className="hidden"
        onChange={(e) => void add(e.target.files)}
      />
      {error && <p className="text-xs text-danger">{error}</p>}
    </fieldset>
  );
}
