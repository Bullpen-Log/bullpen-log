'use client';

import { useState } from 'react';
import { ImagePlus, Loader2 } from 'lucide-react';
import { captureThumbnail } from '@/lib/capture-thumbnail';

/**
 * 이미 올려둔 영상에서 미리보기 이미지를 새로 만든다.
 *
 * 업로드할 때 캡처가 실패하는 경우가 있어(파일 형식이나 로딩 지연 등),
 * 영상을 통째로 다시 올리지 않고 이미지만 다시 뽑을 수 있게 한다.
 */
export function ThumbnailFixer({
  itemId,
  videoPath,
  /** 서버 액션 — 만든 이미지 경로를 저장한다. */
  onSave,
}: {
  itemId: string;
  videoPath: string;
  onSave: (formData: FormData) => Promise<{ error?: string; success?: string } | undefined>;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string>();
  const [failed, setFailed] = useState(false);

  const run = async () => {
    setBusy(true);
    setMessage(undefined);
    setFailed(false);

    try {
      // 1) 이미 올라간 영상의 재생 주소를 받는다.
      const res = await fetch('/api/library/video-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths: [videoPath] }),
      });
      const data = await res.json().catch(() => ({}));
      const url = data.urls?.[videoPath];
      if (!url) throw new Error('영상을 불러오지 못했습니다.');

      // 2) 브라우저에서 한 장면을 캡처한다.
      const shot = await captureThumbnail(url);
      if (!shot) {
        throw new Error(
          '이 브라우저에서 영상의 장면을 읽지 못했습니다. 다른 브라우저에서 시도하거나, 영상을 H.264(높은 호환성)로 다시 저장해 올려보세요.'
        );
      }

      // 3) 이미지를 저장소에 올린다.
      const target = await (
        await fetch('/api/library/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fileName: 'thumb.jpg',
            fileSize: shot.size,
            fileType: 'image/jpeg',
            kind: 'thumbnail',
          }),
        })
      ).json();
      if (!target?.signedUrl) throw new Error('이미지를 올릴 곳을 받지 못했습니다.');

      const put = await fetch(target.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        body: shot,
      });
      if (!put.ok) throw new Error('이미지를 올리지 못했습니다.');

      // 4) 만든 이미지를 이 항목에 연결한다.
      const form = new FormData();
      form.set('id', itemId);
      form.set('thumbPath', target.path);
      const saved = await onSave(form);

      if (saved?.error) throw new Error(saved.error);
      setMessage(saved?.success ?? '미리보기 이미지를 만들었습니다.');
    } catch (err) {
      setFailed(true);
      setMessage(
        err instanceof Error ? err.message : '미리보기 이미지를 만들지 못했습니다.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-lg border border-line-strong bg-surface-2 px-3 py-2 text-xs text-ink transition-colors hover:border-sky hover:text-sky disabled:cursor-wait disabled:opacity-60"
      >
        {busy ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ImagePlus className="h-3.5 w-3.5" />
        )}
        {busy ? '만드는 중…' : '미리보기 이미지 만들기'}
      </button>

      {message && (
        <p
          className={`text-xs leading-relaxed ${
            failed ? 'text-red-700' : 'text-emerald-400'
          }`}
        >
          {message}
        </p>
      )}
    </div>
  );
}
