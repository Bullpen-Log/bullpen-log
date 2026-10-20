'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { useFormStatus } from 'react-dom';
import { saveVenue, type VenueState } from '@/app/actions/venues';
import { ImagePlus, X } from '@/components/icon';
import { Button, Field, FormError, Input, Textarea } from '@/components/ui';
import { toast } from '@/components/toast';
import { guardFormAction } from '@/lib/action-offline';
import { shrinkImage } from '@/lib/shrink-image';
import { MAX_IMAGES, REGIONS } from '@/lib/market/specs';
import {
  SLOT_MINS,
  VENUE_ADDRESS_MAX,
  VENUE_INTRO_MAX,
  VENUE_KINDS,
  VENUE_NAME_MAX,
  WEEKDAYS,
  type VenueHours,
} from '@/lib/market/venues';

export type VenueFormInitial = {
  id?: string;
  name: string;
  kind: string;
  region: string;
  address: string;
  intro: string;
  slotMin: number;
  pricePerSlot: number | null;
  priceNote: string;
  hours: VenueHours;
  approval: boolean;
  publicProfile: boolean;
  images: { path: string; url: string }[];
};

type Photo = { path: string; url: string; uploading?: boolean };
const selectCls =
  'w-full rounded-xl border border-transparent bg-ink/5 px-4 py-3 text-sm text-ink focus:border-sky focus:bg-surface focus:outline-none desk:border-line desk:bg-surface-2';

/** 장소 등록 · 고치기(3판) — 이름 · 종류 · 지역 · 주소 · 칸 길이 · 가격 · 요일별 영업시간 · 승인 방식 · 사진 · 공개 */
export function VenueForm({ initial }: { initial: VenueFormInitial }) {
  const [state, action] = useActionState<VenueState, FormData>(
    guardFormAction(saveVenue),
    undefined
  );
  const [photos, setPhotos] = useState<Photo[]>(initial.images);
  const [photoError, setPhotoError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.success) toast(state.success);
  }, [state]);

  async function addFiles(files: FileList | null) {
    if (!files) return;
    setPhotoError(null);
    for (const file of Array.from(files).slice(0, MAX_IMAGES - photos.length)) {
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

  return (
    <form
      action={action}
      className="space-y-5 rounded-2xl border border-line bg-surface p-(--block-pad)"
    >
      {initial.id && <input type="hidden" name="id" value={initial.id} />}
      <FormError>{state?.error}</FormError>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="이름">
          <Input
            name="name"
            type="text"
            required
            maxLength={VENUE_NAME_MAX}
            defaultValue={initial.name}
            placeholder="○○ 실내 연습장"
          />
        </Field>
        <Field label="종류">
          <select
            name="kind"
            defaultValue={initial.kind}
            className={selectCls}
            required
          >
            {VENUE_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="지역">
          <select
            name="region"
            defaultValue={initial.region}
            className={selectCls}
            required
          >
            <option value="">골라 주세요</option>
            {REGIONS.filter((r) => r !== '전국(택배)').map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </Field>
        <Field label="주소" hint="선택">
          <Input
            name="address"
            type="text"
            maxLength={VENUE_ADDRESS_MAX}
            defaultValue={initial.address}
            placeholder="○○구 ○○로 12 지하 1층"
          />
        </Field>
        <Field label="한 칸">
          <select
            name="slotMin"
            defaultValue={String(initial.slotMin)}
            className={selectCls}
          >
            {SLOT_MINS.map((m) => (
              <option key={m} value={m}>
                {m}분
              </option>
            ))}
          </select>
        </Field>
        <Field label="칸당 가격(원)" hint="선택">
          <Input
            name="pricePerSlot"
            type="text"
            inputMode="numeric"
            defaultValue={initial.pricePerSlot ?? ''}
            placeholder="30000"
          />
        </Field>
        <Field label="가격 메모" hint="선택">
          <Input
            name="priceNote"
            type="text"
            maxLength={80}
            defaultValue={initial.priceNote}
            placeholder="2인까지 같은 값 · 현장 결제"
          />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted">
          영업시간 — 요일마다, 쉬는 날은 ‘쉼’
        </legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {WEEKDAYS.map((w, d) => {
            const h = initial.hours[d];
            return (
              <div
                key={w}
                className="flex items-center gap-2 rounded-xl border border-line px-3 py-2 text-sm"
              >
                <span className="w-6 font-semibold text-ink">{w}</span>
                <Input
                  name={`hours-${d}-open`}
                  type="time"
                  defaultValue={h?.open ?? ''}
                  className="px-2 py-1.5 text-xs"
                />
                <span className="text-muted">~</span>
                <Input
                  name={`hours-${d}-close`}
                  type="time"
                  defaultValue={h?.close ?? ''}
                  className="px-2 py-1.5 text-xs"
                />
                <label className="ml-auto inline-flex items-center gap-1 text-xs text-muted">
                  <input
                    type="checkbox"
                    name={`hours-${d}-closed`}
                    defaultChecked={initial.id ? !h : false}
                    className="accent-sky"
                  />{' '}
                  쉼
                </label>
              </div>
            );
          })}
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-5">
        <label className="inline-flex min-h-11 items-center gap-2 text-sm text-ink">
          <select
            name="approval"
            defaultValue={initial.approval ? 'on' : 'off'}
            className={`${selectCls} w-auto`}
          >
            <option value="on">요청을 받고 내가 승인</option>
            <option value="off">빈 칸이면 즉시 확정</option>
          </select>
        </label>
        <label className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-ink">
          <input
            type="checkbox"
            name="publicProfile"
            defaultChecked={initial.publicProfile}
            className="h-5 w-5 accent-sky"
          />{' '}
          덕아웃에 공개
        </label>
      </div>

      <Field label="소개" hint="선택 — 시설 · 주차 · 이용 규칙">
        <Textarea
          name="intro"
          rows={4}
          maxLength={VENUE_INTRO_MAX}
          defaultValue={initial.intro}
        />
      </Field>

      <fieldset className="space-y-2">
        <legend className="text-xs font-medium text-muted">
          사진 — {MAX_IMAGES}장까지
        </legend>
        <div className="flex flex-wrap gap-2">
          {photos.map((p) => (
            <div
              key={p.path}
              className="relative h-24 w-32 overflow-hidden rounded-xl bg-surface-2"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 임시 주소 · 저장소 서명 주소 */}
              <img
                src={p.url}
                alt=""
                className={`h-full w-full object-cover ${p.uploading ? 'opacity-40' : ''}`}
              />
              {!p.uploading && <input type="hidden" name="images" value={p.path} />}
              <button
                type="button"
                aria-label="사진 빼기"
                onClick={() => setPhotos((l) => l.filter((x) => x.path !== p.path))}
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
              className="grid h-24 w-32 place-items-center rounded-xl border border-dashed border-line-strong text-muted hover:border-sky hover:text-sky"
            >
              <span className="flex flex-col items-center gap-1 text-[11px]">
                <ImagePlus className="h-5 w-5" /> 사진
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

      <Submit editing={!!initial.id} uploading={photos.some((p) => p.uploading)} />
    </form>
  );
}

function Submit({ editing, uploading }: { editing: boolean; uploading: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || uploading}>
      {pending ? '저장하는 중…' : editing ? '저장' : '장소 등록'}
    </Button>
  );
}
