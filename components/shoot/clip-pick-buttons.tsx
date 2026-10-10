'use client';

import { useRef, useState } from 'react';
import { Camera, Loader2, Scissors, Upload } from 'lucide-react';
import type { ClipTarget } from '@/components/shoot/use-clip-flow';
import { appCameraMissingText } from '@/lib/shoot-camera';

/**
 * 창 안에서 영상 고르기 — 주차 화면의 운동 창(열린 <dialog>)은 창 밖을 못 누르게 하므로(inert), 숨은 파일 고르기를
 * 창 안에 따로 둔다. 고르면 onPick → useClipFlow().edit 가 컷 편집 창을 그 위에 연다.
 * 휴대폰: [영상 찍기](앱 카메라 — 웹 카메라는 쓰지 않는다) · [앨범에서]. PC: [영상 파일 올리기].
 */
export function ClipPickButtons({
  target,
  uploaded,
  appCamera,
  onCamera,
  onPick,
  ownPath,
}: {
  target: ClipTarget;
  /** 이미 올린 우리 영상이 있나 — 글자가 '다시'로 */
  uploaded: boolean;
  /** 앱 카메라가 있나(useClipFlow().appCamera) */
  appCamera: boolean;
  onCamera: (target: ClipTarget) => void;
  onPick: (target: ClipTarget, file: File, from: 'album') => void;
  /** 이미 올린 우리 영상의 저장소 경로 — 있으면 [올린 영상 편집](그 영상을 내려받아 컷 편집 창으로) */
  ownPath?: string | null;
}) {
  const albumRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  async function editOwn() {
    if (!ownPath || loading) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/library/video-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [ownPath] }),
      });
      const url = (await res.json().catch(() => ({})))?.urls?.[ownPath];
      if (!url) throw new Error();
      const blob = await (await fetch(url)).blob();
      const name = ownPath.split('/').pop() ?? 'clip.mp4';
      onPick(target, new File([blob], name, { type: blob.type || 'video/mp4' }), 'album');
    } catch {
      setLoadError('올린 영상을 불러오지 못했어요. 다시 눌러 주세요.');
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={albumRef}
        type="file"
        accept="video/*"
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) onPick(target, file, 'album');
        }}
      />
      {appCamera && (
        <button
          type="button"
          onClick={() => onCamera(target)}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-sky px-4 text-sm font-bold text-white motion-safe:active:scale-[0.98] desk:hidden"
        >
          <Camera aria-hidden className="h-4 w-4" />
          {uploaded ? '다시 찍기' : '영상 찍기'}
        </button>
      )}
      <button
        type="button"
        onClick={() => albumRef.current?.click()}
        className={`inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold motion-safe:active:scale-[0.98] desk:flex-none desk:bg-sky desk:font-bold desk:text-white ${
          appCamera ? 'bg-ink/6 text-ink' : 'bg-sky font-bold text-white'
        }`}
      >
        <Upload aria-hidden className="h-4 w-4" />
        <span className="desk:hidden">앨범에서</span>
        <span className="hidden desk:inline">
          {uploaded ? '영상 파일 다시 올리기' : '영상 파일 올리기'}
        </span>
      </button>
      {ownPath && (
        <button
          type="button"
          onClick={() => void editOwn()}
          disabled={loading}
          className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-full bg-ink/6 px-4 text-sm font-semibold text-ink motion-safe:active:scale-[0.98] disabled:opacity-60 desk:w-auto"
        >
          {loading ? (
            <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
          ) : (
            <Scissors aria-hidden className="h-4 w-4" />
          )}
          {loading ? '올린 영상 불러오는 중' : '올린 영상 편집'}
        </button>
      )}
      {loadError && (
        <p role="alert" className="w-full text-xs text-warn">
          {loadError}
        </p>
      )}
      <p className="w-full text-xs text-muted">
        앞뒤를 잘라 소리 없이 올리면 이 운동의 라이브러리 영상이 돼요.
        {!appCamera && <span className="desk:hidden"> {appCameraMissingText()}</span>}
      </p>
    </div>
  );
}
