'use client';

import { useActionState, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { createListing, updateListing, type MarketState } from '@/app/actions/market';
import { X } from '@/components/icon';
import { RoundPhotoPlus } from '@/components/round-icon';
import { Button, ButtonLink, Field, FormError, Input, Textarea } from '@/components/ui';
import { guardFormAction } from '@/lib/action-offline';
import { kept } from '@/lib/form-values';
import { shrinkImage } from '@/lib/shrink-image';
import {
  BODY_MAX,
  CATEGORIES,
  CONDITIONS,
  MAX_IMAGES,
  REGIONS,
  TITLE_MAX,
  categoryOf,
  type Specs,
} from '@/lib/market/specs';
import { chipClass } from '@/components/dugout/ui';

export type ListingFormInitial = {
  id?: string;
  category: string;
  title: string;
  price: number | null;
  condition: string;
  region: string;
  body: string;
  specs: Specs;
  /** 저장소 경로 · 보여 줄 주소 */
  images: { path: string; url: string }[];
};

type Photo = { path: string; url: string; uploading?: boolean };

const selectCls =
  'w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink focus:border-sky focus:bg-surface focus:outline-none desk:border-line desk:bg-surface-2';

/**
 * 물건 올리기 · 고치기(2026-10-20) — 사진 · 품목 · 규격(품목마다 다른 칸, lib/market/specs.ts) · 제목 · 가격 · 상태 · 지역 · 설명.
 * 사진은 브라우저가 줄여서(lib/shrink-image.ts) 저장소로 바로 올리고 경로만 폼에 싣는다. 규격은 내 프로필에서 미리 채운 값으로 시작한다.
 */
export function ListingForm({
  initial,
  defaultRegion,
}: {
  initial: ListingFormInitial;
  defaultRegion?: string;
}) {
  const editing = !!initial.id;
  const [state, formAction] = useActionState<MarketState, FormData>(
    guardFormAction(editing ? updateListing : createListing),
    undefined
  );
  const before = state?.values;
  const [category, setCategory] = useState(
    kept(before, 'category') ?? initial.category
  );
  const [photos, setPhotos] = useState<Photo[]>(initial.images);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const cat = categoryOf(category);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setPhotoError(null);
    const room = MAX_IMAGES - photos.length;
    const picked = Array.from(files).slice(0, room);
    if (picked.length < files.length) setPhotoError(`사진은 ${MAX_IMAGES}장까지예요.`);
    for (const file of picked) {
      const localUrl = URL.createObjectURL(file);
      const tempPath = `uploading:${localUrl}`;
      setPhotos((p) => [...p, { path: tempPath, url: localUrl, uploading: true }]);
      try {
        const photo = await shrinkImage(file);
        const res = await fetch('/api/market/upload-url', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileSize: photo.size, fileType: photo.type }),
        });
        const target = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(target.error ?? '업로드 주소를 받지 못했어요.');
        const put = await fetch(target.signedUrl, {
          method: 'PUT',
          headers: { 'Content-Type': photo.type },
          body: photo,
        });
        if (!put.ok) throw new Error(`사진을 올리지 못했어요 (${put.status}).`);
        setPhotos((p) =>
          p.map((x) => (x.path === tempPath ? { path: target.path, url: localUrl } : x))
        );
      } catch (e) {
        setPhotos((p) => p.filter((x) => x.path !== tempPath));
        setPhotoError(e instanceof Error ? e.message : '사진을 올리지 못했어요.');
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  }

  const uploading = photos.some((p) => p.uploading);
  const specKept = (key: string) =>
    kept(before, `spec-${key}`) ??
    (initial.specs[key] != null ? String(initial.specs[key]) : '');

  return (
    <form
      action={formAction}
      className="space-y-6 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <FormError>{state?.error}</FormError>

      {/* 사진 */}
      <fieldset className="space-y-2">
        <legend className="block text-xs font-medium text-muted">
          사진 <span className="text-muted/70">첫 장이 대표 · {MAX_IMAGES}장까지</span>
        </legend>
        <div className="flex flex-wrap gap-2">
          {photos.map((p, i) => (
            <div
              key={p.path}
              className="relative h-24 w-24 overflow-hidden rounded-xl bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 브라우저의 임시 주소 · 저장소 서명 주소 */}
              <img
                src={p.url}
                alt=""
                className={`h-full w-full object-cover ${p.uploading ? 'opacity-40' : ''}`}
              />
              {!p.uploading && <input type="hidden" name="images" value={p.path} />}
              {i === 0 && !p.uploading && (
                <span className="absolute bottom-1 left-1 rounded-md bg-ink/70 px-1.5 text-[10px] font-bold text-white">
                  대표
                </span>
              )}
              <button
                type="button"
                aria-label="사진 빼기"
                onClick={() =>
                  setPhotos((list) => list.filter((x) => x.path !== p.path))
                }
                className="absolute top-1 right-1 grid h-6 w-6 place-items-center rounded-full bg-ink/70 text-white"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {photos.length < MAX_IMAGES && (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="grid h-24 w-24 place-items-center rounded-xl border border-dashed border-line-strong text-muted hover:border-sky hover:text-sky"
            >
              <span className="flex flex-col items-center gap-1 text-[11px]">
                <RoundPhotoPlus className="h-5 w-5" /> 사진
              </span>
            </button>
          )}
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => void addFiles(e.target.files)}
        />
        {photoError && <p className="text-xs text-danger">{photoError}</p>}
      </fieldset>

      {/* 품목 */}
      <fieldset className="space-y-2">
        <legend className="block text-xs font-medium text-muted">품목</legend>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <label
              key={c.key}
              className={`${chipClass(category === c.key, 'md')} cursor-pointer`}
            >
              <input
                type="radio"
                name="category"
                value={c.key}
                checked={category === c.key}
                onChange={() => setCategory(c.key)}
                className="sr-only"
              />
              {c.label}
            </label>
          ))}
        </div>
      </fieldset>

      {/* 규격 — 품목마다 */}
      {cat && cat.fields.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          {cat.fields.map((f) => (
            <Field key={f.key} label={`${f.label}${f.required ? '' : ' (선택)'}`}>
              {f.type === 'select' ? (
                <select
                  name={`spec-${f.key}`}
                  defaultValue={specKept(f.key)}
                  className={selectCls}
                >
                  <option value="">{f.required ? '골라 주세요' : '없음'}</option>
                  {f.options.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              ) : (
                <Input
                  name={`spec-${f.key}`}
                  type="number"
                  inputMode="decimal"
                  min={f.min}
                  max={f.max}
                  step={f.step ?? 1}
                  defaultValue={specKept(f.key)}
                  placeholder={`${f.min}~${f.max} ${f.unit}`}
                />
              )}
            </Field>
          ))}
        </div>
      )}

      <Field label="제목">
        <Input
          name="title"
          type="text"
          required
          maxLength={TITLE_MAX}
          defaultValue={kept(before, 'title') ?? initial.title}
          placeholder="예: 투수 글러브 11.75 거의 새것"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="가격" hint="나눔은 0">
          <Input
            name="price"
            type="text"
            inputMode="numeric"
            required
            defaultValue={
              kept(before, 'price') ??
              (initial.price == null ? '' : String(initial.price))
            }
            placeholder="80,000"
          />
        </Field>
        <Field label="상태">
          <select
            name="condition"
            defaultValue={kept(before, 'condition') ?? initial.condition}
            className={selectCls}
            required
          >
            {CONDITIONS.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="지역" hint="직거래 지역 · 택배만이면 전국">
          <select
            name="region"
            defaultValue={
              kept(before, 'region') ?? initial.region ?? defaultRegion ?? ''
            }
            className={selectCls}
            required
          >
            <option value="">골라 주세요</option>
            {REGIONS.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="설명" hint="사용 기간 · 흠집 · 거래 방법(직거래 장소 · 택배)">
        <Textarea
          name="body"
          rows={5}
          maxLength={BODY_MAX}
          defaultValue={kept(before, 'body') ?? initial.body}
        />
      </Field>

      <div className="flex items-center justify-end gap-2">
        <ButtonLink
          href={editing ? `/market/${initial.id}` : '/market'}
          variant="ghost"
        >
          취소
        </ButtonLink>
        <Submit
          editing={editing}
          disabled={uploading || photos.filter((p) => !p.uploading).length === 0}
        />
      </div>
    </form>
  );
}

function Submit({ editing, disabled }: { editing: boolean; disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || disabled}>
      {pending ? '저장하는 중…' : editing ? '고치기' : '올리기'}
    </Button>
  );
}
