'use client';

import { useRef } from 'react';
import { Camera, Upload } from 'lucide-react';
import type { ClipTarget } from '@/components/shoot/use-clip-flow';

/**
 * 창 안에서 영상 고르기 — 주차 화면의 운동 창(열린 <dialog>)은 창 밖을 못 누르게 하므로(inert), 숨은 파일 고르기를
 * 창 안에 따로 둔다. 고르면 onPick → useClipFlow().edit 가 컷 편집 창을 그 위에 연다.
 * 휴대폰: [영상 찍기](아이폰 기본 카메라) · [앨범에서]. PC: [영상 파일 올리기].
 */
export function ClipPickButtons({
  target,
  uploaded,
  onPick,
}: {
  target: ClipTarget;
  /** 이미 올린 우리 영상이 있나 — 글자가 '다시'로 */
  uploaded: boolean;
  onPick: (target: ClipTarget, file: File, from: 'camera' | 'album') => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const take = (from: 'camera' | 'album') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (file) onPick(target, file, from);
  };
  return (
    <div className="flex flex-wrap gap-2">
      <input
        ref={cameraRef}
        type="file"
        accept="video/*"
        capture="environment"
        hidden
        onChange={take('camera')}
      />
      <input ref={albumRef} type="file" accept="video/*" hidden onChange={take('album')} />
      <button
        type="button"
        onClick={() => cameraRef.current?.click()}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-sky px-4 text-sm font-bold text-white motion-safe:active:scale-[0.98] desk:hidden"
      >
        <Camera aria-hidden className="h-4 w-4" />
        {uploaded ? '다시 찍기' : '영상 찍기'}
      </button>
      <button
        type="button"
        onClick={() => albumRef.current?.click()}
        className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-full bg-ink/6 px-4 text-sm font-semibold text-ink motion-safe:active:scale-[0.98] desk:flex-none desk:bg-sky desk:font-bold desk:text-white"
      >
        <Upload aria-hidden className="h-4 w-4" />
        <span className="desk:hidden">앨범에서</span>
        <span className="hidden desk:inline">{uploaded ? '영상 파일 다시 올리기' : '영상 파일 올리기'}</span>
      </button>
      <p className="w-full text-xs text-muted">앞뒤를 잘라 소리 없이 올리면 이 운동의 라이브러리 영상이 돼요.</p>
    </div>
  );
}
