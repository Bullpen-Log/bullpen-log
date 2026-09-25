'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { Camera, Loader2, Trash2 } from 'lucide-react';
import { saveAvatar } from '@/app/actions/profile';
import { FormError } from '@/components/ui';
import { shrinkImage, UnreadableImageError } from '@/lib/shrink-image';

/**
 * 프로필 사진 고르기.
 *
 * 파일은 서버를 거치지 않고 저장소로 바로 간다. 서버는 '올려도 되는 자리'만
 * 내주고(app/api/profile/avatar-url), 다 올라간 뒤에 그 자리를 내 사진으로
 * 적는다. 투구 영상이 쓰는 방식과 같다.
 *
 * 올리기 전에 작게 줄여 JPG 로 바꾼다(lib/shrink-image.ts). 원본을 그대로 올리던
 * 때는 큰 폰 사진이 5MB 제한에 막히거나, HEIC 사진이 올라가도 PC 에서 안 보여
 * '사진을 바꿔도 안 바뀐다'가 됐다.
 *
 * 고르자마자 화면에 먼저 띄운다(createObjectURL). 올라가는 데 몇 초 걸리는데
 * 그동안 예전 사진이 그대로 있으면 눌린 것인지 알 수 없다.
 *
 * 보여 주는 사진의 주인은 서버다(initialUrl). 예전에는 처음 받은 주소를 상태에
 * 복사해 두고 다시 보지 않았다 — 이 창은 닫혀도 사라지지 않고 늘 붙어 있어서,
 * 다른 곳에서 사진이 바뀌어도 옛 사진을 들고 있었고, 실패하면 이미 놓아준 임시
 * 주소로 되돌아가 빈 그림이 됐다. 이제 방금 고른 사진은 서버가 새 주소를 보내올
 * 때까지만 잠깐 보여 주고, 그 뒤로는 늘 서버의 사진을 보여 준다.
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
  /** 방금 고른 사진(브라우저 안의 임시 주소) — 서버가 새 사진을 보내오면 비운다 */
  const [local, setLocal] = useState<string | null>(null);
  /** 지우는 중 — 서버가 지운 결과를 보내오기 전에 먼저 글자 아바타로 바꿔 둔다 */
  const [clearing, setClearing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [done, setDone] = useState<string>();
  const [pending, startTransition] = useTransition();

  /*
   * 서버가 보낸 사진이 바뀌었다(저장 뒤 화면이 새로 그려졌거나, 다른 곳에서 바꿨다).
   * 이제 그것을 믿고 잠깐 띄워 둔 것을 거둔다. 그리는 도중에 앞 값과 견주어 맞추는,
   * 리액트가 권하는 방법이다(effect 에서 맞추면 한 번 옛 사진이 번쩍인다).
   */
  const [seen, setSeen] = useState(initialUrl);
  if (seen !== initialUrl) {
    setSeen(initialUrl);
    setLocal(null);
    setClearing(false);
  }

  /* 임시 주소는 화면에서 내려간 뒤에 놓아준다. 보이는 동안 놓으면 다시 그릴 때 빈 그림이 된다. */
  useEffect(() => {
    if (!local) return;
    return () => URL.revokeObjectURL(local);
  }, [local]);

  const preview = clearing ? null : (local ?? initialUrl);

  async function pick(file: File) {
    setError(undefined);
    setDone(undefined);
    setBusy(true);

    try {
      /* 먼저 줄인다. 못 여는 사진이면 여기서 바로 알려 준다. */
      const photo = await shrinkImage(file);
      /*
       * 지우는 중이던 표시도 푼다. 서버에서는 이미 지워져 있던 사진을 또 지우면
       * 새 화면이 안 와서(바뀐 것이 없다) 이 표시가 남아, 새로 고른 사진이 가려졌다.
       */
      setClearing(false);
      setLocal(URL.createObjectURL(photo));

      const res = await fetch('/api/profile/avatar-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fileSize: photo.size, fileType: photo.type }),
      });
      const target = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(target.error ?? '업로드 주소를 받지 못했습니다.');

      /* 받은 주소로 파일을 그대로 올린다 */
      const put = await fetch(target.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': photo.type },
        body: photo,
      });
      if (!put.ok) {
        /* 저장소가 알려 준 까닭을 함께 보여 준다 — 없으면 무엇이 막혔는지 알 수 없다 */
        const why = await put.json().catch(() => null);
        throw new Error(
          `사진을 올리지 못했습니다${why?.message ? ` (${why.message})` : ` (${put.status})`}.`
        );
      }

      const saved = await saveAvatar(target.path);
      if (saved?.error) throw new Error(saved.error);
      setDone(saved?.success ?? '사진을 바꿨습니다.');
    } catch (e) {
      /* 잠깐 띄운 것을 거둔다 — 서버의 사진(바꾸기 전 것)이 다시 보인다 */
      setLocal(null);
      setError(explain(e));
    } finally {
      setBusy(false);
      /* 같은 파일을 다시 골라도 알아채게 값을 비운다 */
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  function remove() {
    setError(undefined);
    setDone(undefined);
    setClearing(true);
    startTransition(async () => {
      try {
        const res = await saveAvatar(null);
        if (res?.error) throw new Error(res.error);
        setDone(res?.success ?? '사진을 지웠습니다.');
      } catch (e) {
        setClearing(false);
        setError(explain(e));
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
      {/*
        다 됐다고 알려 준다. 사진은 고르자마자 바뀌어 보여서, 이 말이 없으면 아직
        올리는 중인지 끝났는지 알 수 없어 창을 일찍 닫게 된다.
      */}
      {done && !working && (
        <p role="status" className="text-xs font-medium text-sky">
          {done}
        </p>
      )}

      <p className="text-xs leading-relaxed text-muted/70">
        사진은 작게 줄여서 올립니다. 본인만 볼 수 있는 저장소에 들어가고, 화면에 보일
        때만 잠깐 쓰는 주소가 만들어집니다.
      </p>
    </div>
  );
}

/**
 * 실패한 까닭을 사람 말로.
 *
 * 앱을 새로 배포하면 열려 있던 화면의 저장 단추가 옛 이름으로 서버를 부른다.
 * 서버는 그 이름을 몰라 영어 오류를 돌려주는데, 그대로 보여 주면 무슨 뜻인지
 * 알 수 없다 — 새로고침하면 된다.
 */
function explain(e: unknown) {
  if (e instanceof UnreadableImageError) return e.message;
  const message = e instanceof Error ? e.message : '';
  if (/Server Action|was not found on the server|Failed to find Server Action/i.test(message)) {
    return '앱이 새로 바뀌었습니다. 새로고침(F5)한 뒤 다시 골라주세요.';
  }
  if (/Failed to fetch|NetworkError|Load failed/i.test(message)) {
    return '인터넷 연결을 확인한 뒤 다시 골라주세요.';
  }
  return message || '사진을 바꾸지 못했습니다.';
}
