'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, Plus, Upload, X } from 'lucide-react';
import { saveVelocitySession } from '@/app/actions/velocity';
import { Modal, useModalState } from '@/components/modal';
import { Segmented } from '@/components/segmented';
import { Button } from '@/components/ui';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { toDateKey } from '@/lib/pitch-stats';
import { quietRefresh } from '@/lib/quiet-refresh';
import { uploadClip } from '@/lib/velocity-clip-upload';
import { PITCH_TYPES } from '@/lib/velocity-meta';
import type { CameraPos } from '@/lib/velocity-setup';

/**
 * 휴대폰 구속 측정 관리자의 '영상 올리기' — 폰 사진 앱의 투구 영상 여러 개를 골라 스피드건 값만 적고 한 번에 올린다
 * (2026-10-03 사용자: "모바일 구속 측정 관리자는 업로드 최적화"). 폰에서 영상을 재면 느리고 뜨거워서 재지 않고 '수기'(스피드건
 * 값)로 저장한다 — 카메라 값은 PC 의 구속 측정 관리자에서 '이 영상으로 다시 재기'로 채운다(그때 보정 짝이 된다).
 *
 * 한 번에 올린 영상들은 세션 하나(영상 파일 · 보정용)의 공들이다. 공을 먼저 저장하고 영상을 하나씩 올린다 — 영상이 실패하면
 * 그 줄만 '다시 올리기'. 저장소가 파일 하나 50MB 까지라 넘는 영상은 고를 때 막는다(사진 앱에서 잘라 올리기).
 */

/** 저장소 한 파일 한도(lib/storage.ts MAX_VIDEO_BYTES 와 같게 — 그 파일은 서버 전용이라 여기 따로 둔다) */
const MAX_BYTES = 50 * 1024 * 1024;

type Item = {
  key: number;
  file: File;
  url: string;
  gun: string;
  type: string | null;
  durationSec: number | null;
  /** 저장된 공(영상만 다시 올릴 때) */
  pitchId: string | null;
  state: 'ready' | 'saving' | 'uploading' | 'done' | 'error';
  percent: number | null;
  error: string | null;
};

const CAMERA_OPTIONS = [
  { value: 'behind-pitcher', label: '투수 뒤' },
  { value: 'behind-catcher', label: '포수 뒤' },
] as const;

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1)}MB`;

export function MobileUploadButton({ className = '' }: { className?: string }) {
  const modal = useModalState<true>();
  return (
    <>
      <Button
        type="button"
        onClick={(e) => modal.show(true, e)}
        className={`h-14 w-full text-base ${className}`}
      >
        <Upload aria-hidden className="h-5 w-5" />
        영상 올리기
      </Button>
      <Modal
        open={modal.open}
        onClose={modal.close}
        origin={modal.origin}
        title="영상 올리기"
        description="투구 영상을 고르고 스피드건 값을 적어 올려요. 카메라 값은 PC 에서 '다시 재기'로 채워요."
      >
        {modal.content && <MobileUpload onDone={modal.close} />}
      </Modal>
    </>
  );
}

function MobileUpload({ onDone }: { onDone: () => void }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const seq = useRef(0);
  const [items, setItems] = useState<Item[]>([]);
  const [cameraPos, setCameraPos] = useState<CameraPos>('behind-pitcher');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);
  /* 닫을 때 미리보기 주소를 놓는다 */
  useEffect(
    () => () => {
      for (const it of itemsRef.current) URL.revokeObjectURL(it.url);
    },
    []
  );

  const patch = (key: number, p: Partial<Item>) =>
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...p } : it)));

  const pick = (files: FileList | null) => {
    if (!files) return;
    const added: Item[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('video/') && !/\.(mov|mp4|m4v|webm)$/i.test(file.name))
        continue;
      const big = file.size > MAX_BYTES;
      added.push({
        key: ++seq.current,
        file,
        url: URL.createObjectURL(file),
        gun: '',
        type: null,
        durationSec: null,
        pitchId: null,
        state: big ? 'error' : 'ready',
        percent: null,
        error: big ? `${mb(file.size)} — 50MB 까지예요. 사진 앱에서 잘라 주세요` : null,
      });
    }
    setItems((list) => [...list, ...added]);
    if (fileRef.current) fileRef.current.value = '';
  };

  const remove = (key: number) =>
    setItems((list) => {
      const it = list.find((x) => x.key === key);
      if (it) URL.revokeObjectURL(it.url);
      return list.filter((x) => x.key !== key);
    });

  const gunOf = (it: Item) => {
    const v = Number(it.gun.replace(',', '.'));
    return it.gun.trim() && v >= 20 && v <= 200 ? Math.round(v * 10) / 10 : null;
  };

  /* 영상 하나 올리기 — 공은 이미 저장됨 */
  const uploadOne = async (it: Item, pitchId: string) => {
    patch(it.key, { state: 'uploading', percent: 0, error: null, pitchId });
    const up = await uploadClip(
      pitchId,
      it.file,
      { sec: it.durationSec, eventSec: null },
      (percent) => patch(it.key, { percent })
    );
    patch(
      it.key,
      up.ok
        ? { state: 'done', percent: 100 }
        : {
            state: 'error',
            percent: null,
            error: `공은 저장했지만 영상을 못 올렸어요: ${up.error}`,
          }
    );
    return up.ok;
  };

  const submit = async () => {
    setError(null);
    const ready = items.filter((it) => it.state === 'ready');
    const retry = items.filter((it) => it.state === 'error' && it.pitchId);
    const missing = ready.filter((it) => gunOf(it) == null);
    if (missing.length > 0) {
      for (const it of missing)
        patch(it.key, { error: '스피드건 값(20~200)을 적어 주세요' });
      setError(`스피드건 값이 없는 영상 ${missing.length}개 — 적은 뒤 올려요`);
      return;
    }
    if (ready.length === 0 && retry.length === 0) return;
    setBusy(true);
    try {
      /* 영상만 다시 올릴 줄 */
      for (const it of retry) await uploadOne(it, it.pitchId as string);
      if (ready.length > 0) {
        for (const it of ready) patch(it.key, { state: 'saving', error: null });
        const saved = await orOffline(
          saveVelocitySession({
            date: toDateKey(new Date()),
            sessionType: '불펜',
            intensity: 5,
            fovDeg: 69,
            source: 'file',
            device: `휴대폰 올리기 · ${ready.length}개`,
            cameraPos,
            net: false,
            forCalibration: true,
            autoMode: false,
            focalPx: null,
            frameW: null,
            frameH: null,
            releaseDistM: null,
            pitches: ready.map((it) => {
              const gunKmh = gunOf(it) as number;
              return {
                manual: true,
                rawKmh: gunKmh,
                errorKmh: 0,
                confidence: 'low' as const,
                releaseKmh: null,
                releaseDxCm: null,
                releaseDyCm: null,
                releaseDistM: null,
                travelM: null,
                durationSec: null,
                frames: null,
                fps: null,
                autoDetected: false,
                pitchType: it.type,
                zone: null,
                result: null,
                gunKmh,
                memo: it.file.name.slice(0, 100),
              };
            }),
          }),
          { ok: false as const, error: OFFLINE_MESSAGE }
        );
        if (!saved.ok) {
          for (const it of ready) patch(it.key, { state: 'ready' });
          setError(saved.error);
          return;
        }
        const ids = saved.pitchIds ?? [];
        for (let i = 0; i < ready.length; i++) {
          const id = ids[i];
          if (id) await uploadOne(ready[i], id);
          else patch(ready[i].key, { state: 'error', error: '공을 저장하지 못했어요' });
        }
      }
      quietRefresh(router);
    } finally {
      setBusy(false);
    }
  };

  const done = items.length > 0 && items.every((it) => it.state === 'done');
  const pending = items.filter(
    (it) => it.state === 'ready' || (it.state === 'error' && it.pitchId)
  ).length;

  return (
    <div className="space-y-4 pb-2">
      <div>
        <p className="mb-1.5 text-xs font-medium text-muted">카메라 자리(모든 영상)</p>
        <Segmented
          label="카메라 자리"
          value={cameraPos}
          options={CAMERA_OPTIONS}
          onChange={(v) => setCameraPos(v as CameraPos)}
        />
      </div>

      {items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.key} className="flex gap-3 rounded-2xl bg-ink/5 p-2.5">
              <video
                src={`${it.url}#t=0.1`}
                muted
                playsInline
                preload="metadata"
                onLoadedMetadata={(e) => {
                  const d = e.currentTarget.duration;
                  if (Number.isFinite(d)) patch(it.key, { durationSec: d });
                }}
                className="h-24 w-14 shrink-0 rounded-lg bg-black object-cover"
              />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="flex items-center gap-1.5">
                  <p className="min-w-0 flex-1 truncate text-xs text-muted">
                    {it.file.name} · {mb(it.file.size)}
                    {it.durationSec != null && ` · ${it.durationSec.toFixed(1)}초`}
                  </p>
                  {it.state === 'ready' || (it.state === 'error' && !it.pitchId) ? (
                    <button
                      type="button"
                      onClick={() => remove(it.key)}
                      aria-label="빼기"
                      className="-m-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-muted"
                    >
                      <X aria-hidden className="h-4 w-4" />
                    </button>
                  ) : it.state === 'done' ? (
                    <Check aria-label="올림" className="h-4 w-4 text-ok" />
                  ) : it.state === 'error' ? null : (
                    <Loader2
                      aria-label="올리는 중"
                      className="h-4 w-4 animate-spin text-muted"
                    />
                  )}
                </div>
                <label className="flex items-center gap-1.5">
                  <span className="sr-only">스피드건 값</span>
                  <input
                    inputMode="decimal"
                    value={it.gun}
                    disabled={
                      it.state !== 'ready' && !(it.state === 'error' && !it.pitchId)
                    }
                    onChange={(e) =>
                      patch(it.key, {
                        gun: e.target.value,
                        ...(it.state === 'error' &&
                        !it.pitchId &&
                        it.file.size <= MAX_BYTES
                          ? { state: 'ready' as const }
                          : {}),
                        error: null,
                      })
                    }
                    placeholder="스피드건"
                    className="w-full min-w-0 rounded-lg border border-transparent bg-surface px-3 py-2 text-ink tabular-nums placeholder:text-muted/60 focus:border-sky focus:outline-none disabled:opacity-60"
                  />
                  <span className="text-xs text-muted">km/h</span>
                </label>
                <div className="-mx-0.5 flex gap-1 overflow-x-auto pb-0.5">
                  {PITCH_TYPES.slice(0, 7).map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      disabled={it.state !== 'ready'}
                      aria-pressed={it.type === p.key}
                      onClick={() =>
                        patch(it.key, { type: it.type === p.key ? null : p.key })
                      }
                      className={`min-h-8 shrink-0 rounded-full px-2.5 text-xs transition-colors ${
                        it.type === p.key
                          ? 'bg-sky font-medium text-white'
                          : 'bg-surface text-muted'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                {(it.state === 'uploading' || it.state === 'saving') && (
                  <div className="h-1.5 overflow-hidden rounded-full bg-ink/10">
                    <div
                      className="h-full rounded-full bg-sky transition-[width]"
                      style={{
                        width: `${it.state === 'saving' ? 5 : (it.percent ?? 0)}%`,
                      }}
                    />
                  </div>
                )}
                {it.error && <p className="text-xs text-danger">{it.error}</p>}
              </div>
            </li>
          ))}
        </ul>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => pick(e.target.files)}
      />
      <Button
        type="button"
        variant="secondary"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="h-12 w-full"
      >
        <Plus aria-hidden className="h-4 w-4" />
        {items.length ? '영상 더 고르기' : '영상 고르기'}
      </Button>

      {error && <p className="text-sm text-danger">{error}</p>}

      {done ? (
        <Button type="button" onClick={onDone} className="h-12 w-full">
          <Check aria-hidden className="h-4 w-4" />
          {items.length}개 올렸어요 — 닫기
        </Button>
      ) : (
        <Button
          type="button"
          onClick={() => void submit()}
          disabled={busy || pending === 0}
          className="h-12 w-full"
        >
          {busy ? (
            <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          ) : (
            <Upload aria-hidden className="h-4 w-4" />
          )}
          {busy ? '올리는 중…' : `올리기${pending ? ` ${pending}개` : ''}`}
        </Button>
      )}
    </div>
  );
}
