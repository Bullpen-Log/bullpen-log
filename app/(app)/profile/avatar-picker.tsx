'use client';

import { useRef, useState, useTransition } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { saveAvatar } from '@/app/actions/profile';
import { FormError } from '@/components/ui';

/**
 * 프로필 사진 고르기.
 *
 * 파일은 서버를 거치지 않고 저장소로 바로 간다. 서버는 '올려도 되는 자리'만
 * 내주고(app/api/profile/avatar-url), 다 올라간 뒤에 그 자리를 내 사진으로
 * 적는다. 투구 영상이 쓰는 방식과 같다.
 *
 * 고르자마자 화면에 먼저 띄운다(createObjectURL). 올라가는 데 몇 초 걸리는데
 * 그동안 예전 사진이 그대로 있으면 눌린 것인지 알 수 없다.
 */
export function AvatarPicker({
  nickname,
  initialUrl,
}: {
  nickname: string;
  /** 지금 걸려 있는 사진의 임시 주소. 없으면 글자 아바타를 보여준다. */
  initialUrl: string | null;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  async function pick(file: File) {
    setError(undefined);
    setBusy(true);

    /* 고른 사진을 곧바로 보여준다. 실패하면 아래에서 되돌린다. */
    const localUrl = URL.createObjectURL(file);
    const kept = preview;
    setPreview(localUrl);

    try {
      const res = await fetch('/api/profile/avatar-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileSize: file.size, fileType: file.type }),
      });
      const target = await res.json();
      if (!res.ok) throw new Error(target.error ?? '업로드 주소를 받지 못했습니다.');

      /* 받은 주소로 파일을 그대로 올린다 */
      const put = await fetch(target.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file,
      });
      if (!put.ok) throw new Error('사진을 올리지 못했습니다.');

      const saved = await saveAvatar(target.path);
      if (saved?.error) throw new Error(saved.error);
    } catch (e) {
      setPreview(kept);
      setError(e instanceof Error ? e.message : '사진을 바꾸지 못했습니다.');
    } finally {
      URL.revokeObjectURL(localUrl);
      setBusy(false);
      /* 같은 파일을 다시 골라도 알아채게 값을 비운다 */
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function remove() {
    setError(undefined);
    const kept = preview;
    setPreview(null);
    startTransition(async () => {
      const done = await saveAvatar(null);
      if (done?.error) {
        setPreview(kept);
        setError(done.error);
      }
    });
  }

  const working = busy || pending;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-4">
        <div className="relative">
          {preview ? (
            /*
              next/image 를 쓰지 않는다. 주소가 서명된 임시 주소라 도메인을
              미리 적어 둘 수 없고, 한 시간마다 값이 바뀌어 최적화한 것을
              돌려쓰지도 못한다.
            */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={preview}
              alt=""
              className="h-20 w-20 rounded-full object-cover ring-1 ring-line motion-safe:animate-fade-in"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-20 w-20 items-center justify-center rounded-full bg-sky text-2xl font-bold text-white"
            >
              {nickname.slice(0, 1)}
            </span>
          )}

          {working && (
            <span className="absolute inset-0 flex items-center justify-center rounded-full bg-shade/50">
              <Loader2 aria-hidden className="h-5 w-5 animate-spin text-white" />
            </span>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={working}
            onClick={() => fileRef.current?.click()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-line-strong px-3 py-2 text-xs font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-50"
          >
            <Camera aria-hidden className="h-3.5 w-3.5" />
            {preview ? '사진 바꾸기' : '사진 올리기'}
          </button>

          {preview && (
            <button
              type="button"
              disabled={working}
              onClick={remove}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs text-muted transition-colors hover:border-danger-line hover:text-danger disabled:opacity-50"
            >
              <Trash2 aria-hidden className="h-3.5 w-3.5" />
              지우기
            </button>
          )}
        </div>
      </div>

      {/*
        진짜 파일 칸은 숨겨 두고 위 버튼이 대신 누른다. 브라우저가 그리는
        '파일 선택' 버튼은 모양을 바꿀 수 없어 앱의 다른 버튼과 따로 논다.
      */}
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void pick(file);
        }}
      />

      <FormError>{error}</FormError>

      <p className="text-xs leading-relaxed text-muted/70">
        5MB 이하의 사진을 올릴 수 있습니다. 본인만 볼 수 있는 저장소에 들어가고,
        화면에 보일 때만 잠깐 쓰는 주소가 만들어집니다.
      </p>
    </div>
  );
}
