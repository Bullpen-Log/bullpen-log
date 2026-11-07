'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { CircleCheck, Loader2 } from '@/components/icon';
import { FieldError } from '@/components/intake/shell';
import { FileFacts } from '@/components/intake/file-summary';
import type { Picked } from '@/components/intake/pick';
import { formatBytes } from '@/lib/intake/limits';
import { MEDIA_REJECT_TEXT } from '@/lib/intake/media';
import type { PublicAsset } from '@/lib/intake/public-client';
import { assetArrived, assetGone, assetInTransit, type IntakeView } from '@/lib/intake/state';

export const VIEW_LABEL: Record<IntakeView, string> = { side: '옆 영상', rear: '뒤 영상' };

/* 사진 앱 · 파일 앱 둘 다 고를 수 있게 둔다. capture 를 달지 않는다 — 찍은 원본을 고르는 곳이다 */
const ACCEPT = 'video/*,.mov,.mp4,.m4v';

/**
 * 파일을 고른 뒤 초점 — 고르기 단추가 사라지거나 잠기면 초점이 문서 밖으로 떨어진다. 새 파일이 들어온 순간에만 옮긴다(처음 그릴 때는 안 옮긴다).
 */
export function useFocusOnPick(picked: Picked | null, target: RefObject<HTMLElement | null>) {
  const last = useRef(picked?.file ?? null);
  useEffect(() => {
    const file = picked?.file ?? null;
    if (file === last.current) return;
    last.current = file;
    if (file) target.current?.focus({ preventScroll: true });
  }, [picked, target]);
}

/** 고른 영상을 화면 읽기에 알린다 — 내용이 바뀌어야 읽으므로 칸은 늘 붙여 둔다 */
export function PickStatus({ picked }: { picked: Picked | null }) {
  return (
    <p role="status" className="sr-only">
      {picked ? `고른 영상: ${picked.file.name}` : ''}
    </p>
  );
}

/** 파일 고르기 단추 — 같은 파일을 다시 골라도 알림이 오게 고른 뒤 칸을 비운다 */
export function FileButton({
  label,
  onFile,
  className,
  disabled,
  describedBy,
  buttonRef,
}: {
  label: string;
  onFile: (file: File) => void;
  className: string;
  disabled?: boolean;
  describedBy?: string;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={ACCEPT}
        tabIndex={-1}
        aria-hidden
        className="sr-only"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = '';
          if (file) onFile(file);
        }}
      />
      <button ref={buttonRef} type="button" className={className} disabled={disabled} aria-describedby={describedBy} onClick={() => input.current?.click()}>
        {label}
      </button>
    </>
  );
}

export const LINK_BUTTON =
  'min-h-11 shrink-0 rounded-lg px-2 text-sm font-semibold text-sky-strong hover:underline focus-visible:outline-2 focus-visible:outline-sky disabled:opacity-50';
export const FILL_BUTTON =
  'inline-flex h-14 w-full items-center justify-center rounded-full bg-sky px-5 text-base font-semibold text-white transition-colors hover:bg-sky-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky disabled:cursor-not-allowed disabled:opacity-50 desk:rounded-xl';

const REJECT_TEXT: Record<string, string> = {
  not_video: '영상 파일이 아니에요. 찍은 영상을 다시 골라 주세요.',
  unsupported_container: MEDIA_REJECT_TEXT.unsupported_container,
  size_mismatch: '도착한 파일 크기가 고른 파일과 달라요. 다시 골라 주세요.',
  hash_mismatch: '도착한 파일이 고른 파일과 달라요. 다시 골라 주세요.',
};

export const rejectText = (code: string | null) => (code && REJECT_TEXT[code]) ?? '이 영상은 보낼 수 없어요. 다른 영상을 골라 주세요.';

/** 칸 하나의 지금 모습 — 서버가 아는 자산과 이 기기가 쥔 파일을 함께 보인다 */
export function SlotCard({
  view,
  asset,
  picked,
  inspecting,
  error,
  note,
  requested = false,
  onPick,
}: {
  view: IntakeView;
  asset: PublicAsset | null;
  picked: Picked | null;
  inspecting: boolean;
  error: string | null;
  /** 같은 파일인지 확인한 결과 같은 덧붙임 */
  note?: string | null;
  /** 고침 요청으로 다시 고르라고 한 칸 */
  requested?: boolean;
  onPick: (file: File) => void;
}) {
  const arrived = asset != null && assetArrived(asset.status) && !requested;
  const transit = asset != null && assetInTransit(asset.status);
  const rejected = asset?.status === 'rejected';
  const errorId = `slot-error-${view}`;
  const card = useRef<HTMLElement>(null);
  useFocusOnPick(picked, card);

  return (
    <section ref={card} id={`slot-${view}`} tabIndex={-1} aria-label={VIEW_LABEL[view]} className="rounded-2xl bg-surface p-(--block-pad) outline-none focus-visible:outline-2 focus-visible:outline-sky">
      <PickStatus picked={picked} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">{VIEW_LABEL[view]}</h2>
          {picked ? (
            <div className="mt-1">
              <FileFacts name={picked.file.name} size={picked.file.size} facts={picked.facts} />
            </div>
          ) : asset ? (
            <p className="mt-1 truncate text-footnote text-muted">
              {asset.fileName} · {formatBytes(asset.sizeBytes)}
            </p>
          ) : null}
        </div>
        {arrived && !picked && <CircleCheck aria-hidden className="h-6 w-6 shrink-0 text-ok" />}
      </div>

      {!picked && (
        <p className="mt-2 text-footnote leading-5 break-keep text-muted">
          {requested
            ? asset && assetGone(asset.status)
              ? '이 영상을 다시 골라 주세요.'
              : '새 영상을 골라 주세요.'
            : arrived
              ? (asset?.integrity ?? '도착했어요. 파일을 확인하고 있어요.')
              : transit
                ? '전송이 끊겼어요. 같은 파일을 다시 고르면 이어서 보내요.'
                : rejected
                  ? rejectText(asset?.rejectCode ?? null)
                  : '아직 고르지 않았어요.'}
        </p>
      )}
      {note && <p className="mt-2 text-footnote leading-5 break-keep text-muted">{note}</p>}
      {error && (
        <div className="mt-2">
          <FieldError id={errorId}>{error}</FieldError>
        </div>
      )}
      <div className="mt-1 flex items-center">
        {inspecting ? (
          <p role="status" className="flex min-h-11 items-center gap-2 text-footnote text-muted">
            <Loader2 aria-hidden className="h-4 w-4 motion-safe:animate-spin" />
            영상을 살펴보고 있어요
          </p>
        ) : (
          <FileButton
            label={picked || arrived ? '다른 영상 선택' : `${view === 'side' ? '옆' : '뒤'} 영상 선택`}
            onFile={onPick}
            className={`-ml-2 ${LINK_BUTTON}`}
            describedBy={error ? errorId : undefined}
          />
        )}
      </div>
    </section>
  );
}
