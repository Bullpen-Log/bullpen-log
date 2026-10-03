'use client';

import { useState, useTransition } from 'react';
import { unstable_rethrow } from 'next/navigation';
import { Info } from 'lucide-react';
import { LibraryVideo } from '@/components/library-video';
import { FavoriteButton } from '@/components/favorite-button';
import { guideDescription } from '@/app/actions/content';
import { toggleDrillFavorite } from '@/app/actions/favorite';

/** 같은 동작의 도구 하나 — 야구공 · 작은 메디신볼 · 큰 메디신볼 … */
export type MechanicsVariant = {
  id: string;
  tool: string;
  equipment: string[];
  referenceVideoId: string | null;
  videoPath: string | null;
  aspectRatio: number | null;
  thumbUrl: string | null;
  isReference: boolean;
  favorite: boolean;
};

/** 메커니즘 칸의 드릴 한 줄 — 도구만 다른 드릴을 한 동작으로 묶었다(mechanics-section.tsx) */
export type MechanicsDrillView = {
  title: string;
  /** 맨 앞이 주 요소, 뒤가 보조 */
  focusPoints: string[];
  stage: string | null;
  variants: MechanicsVariant[];
};

/**
 * 설명은 펼칠 때 받는다(app/actions/content.ts guideDescription) — 암케어 운동 설명과 같은 방식(armcare-media.tsx).
 * 받다가 신호가 끊겨도 화면 전체 오류로 번지지 않게 '못 받음'으로 둔다. 도구를 바꾸면 그 드릴의 설명을 새로 받는다.
 */
function useGuideDescription(id: string) {
  const [got, setGot] = useState<{ id: string; text: string | null; failed: boolean }>();
  const [loading, startLoading] = useTransition();
  const mine = got?.id === id ? got : undefined;

  const load = (target = id) => {
    if (loading || (got?.id === target && !got.failed)) return;
    startLoading(async () => {
      try {
        const text = await guideDescription(target);
        setGot({ id: target, text, failed: text == null });
      } catch (err) {
        unstable_rethrow(err);
        setGot({ id: target, text: null, failed: true });
      }
    });
  };
  return { text: mine?.text ?? null, failed: mine?.failed ?? false, loaded: !!mine, loading, load };
}

/**
 * 드릴 한 줄 — 이름 · 도구 · 함께 쓰는 드릴 표시, '자세·영상 보기'를 누르면 영상과 설명이 펼쳐진다.
 *
 * 도구가 여럿이면 칩으로 고른다 — 같은 동작을 야구공(실제 감각) · 작은 메디신볼(빠르게) · 큰 메디신볼(순서에 집중)로 한다.
 * 영상은 펼친 동안에만 심는다(접은 뒤 소리 없이 계속 돌지 않게).
 */
export function MechanicsDrill({
  drill,
  secondary,
  isAdmin,
}: {
  drill: MechanicsDrillView;
  /** 이 요소가 주 요소가 아니라 함께 쓰는 드릴인가 */
  secondary: boolean;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState(0);
  const variant = drill.variants[Math.min(pick, drill.variants.length - 1)];
  const desc = useGuideDescription(variant.id);
  /* 도구가 여럿이면 고를 도구들을, 하나면 그 드릴의 장비를 다 보인다(플라이오볼 · 야구공처럼 둘 다 되는 드릴) */
  const tools =
    drill.variants.length > 1
      ? drill.variants.map((v) => v.tool)
      : variant.equipment.length > 0
        ? variant.equipment
        : [variant.tool];

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next) desc.load(variant.id);
  };
  const choose = (i: number) => {
    setPick(i);
    if (open) desc.load(drill.variants[i].id);
  };

  return (
    <li className="overflow-hidden rounded-xl border border-line bg-surface">
      <div className="flex items-start gap-3 px-4 py-3">
        <span className="min-w-0 flex-1 space-y-1">
          <span className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
            <span className="text-sm font-bold break-keep text-ink">{drill.title}</span>
            {secondary && <span className="text-xs text-muted">함께 쓰는 드릴</span>}
          </span>
          <span className="block text-xs break-keep text-muted">
            {tools.join(' · ')}
            {variant.isReference && ' · 참고 영상'}
          </span>
        </span>
        {variant.thumbUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={variant.thumbUrl}
            alt=""
            className="h-14 w-20 shrink-0 rounded-lg object-cover ring-1 ring-line"
          />
        )}
      </div>

      <div className="border-t border-line/70">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label={`${drill.title} 자세·영상 ${open ? '접기' : '보기'}`}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 text-xs font-semibold text-muted transition-colors hover:text-sky"
        >
          <Info aria-hidden className="h-3.5 w-3.5" />
          {open ? '접기' : '자세·영상 보기'}
        </button>
      </div>

      {open && (
        <div className="space-y-3 px-4 pb-4">
          {drill.variants.length > 1 && (
            <div role="radiogroup" aria-label="도구" className="flex flex-wrap gap-1.5">
              {drill.variants.map((v, i) => (
                <button
                  key={v.id}
                  type="button"
                  role="radio"
                  aria-checked={i === pick}
                  onClick={() => choose(i)}
                  className={`min-h-10 rounded-full px-3.5 text-xs font-semibold transition-colors desk:min-h-8 ${
                    i === pick
                      ? 'bg-sky text-white'
                      : 'bg-surface-2 text-muted hover:text-ink'
                  }`}
                >
                  {v.tool}
                </button>
              ))}
            </div>
          )}
          {(variant.videoPath || variant.referenceVideoId) && (
            <LibraryVideo
              key={variant.id}
              path={variant.videoPath}
              referenceVideoId={variant.referenceVideoId}
              title={drill.title}
              thumbUrl={variant.thumbUrl}
              aspectRatio={variant.aspectRatio}
              isAdmin={isAdmin}
            />
          )}
          {desc.loading ? (
            <p className="text-xs text-muted">설명을 불러오는 중…</p>
          ) : desc.failed ? (
            <p className="text-xs text-muted">
              설명을 불러오지 못했어요.{' '}
              <button
                type="button"
                onClick={() => desc.load(variant.id)}
                className="font-semibold text-sky-strong underline underline-offset-2"
              >
                다시 받기
              </button>
            </p>
          ) : desc.text ? (
            <p className="whitespace-pre-wrap break-keep text-sm leading-relaxed text-ink/85">
              {desc.text}
            </p>
          ) : null}
          <FavoriteButton
            key={`fav-${variant.id}`}
            variant="full"
            favorite={variant.favorite}
            label={drill.title}
            onToggle={() => toggleDrillFavorite(variant.id)}
          />
        </div>
      )}
    </li>
  );
}
