'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronRight, Film, Play, Rotate3d, Trash2, Upload } from 'lucide-react';
import { BackLink, Card, EmptyState, PageHeading } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { DisclosureButton } from '@/components/disclosure';
import { ErrorLine } from '@/components/error-line';
import { ConfirmDialog } from '@/components/confirm-delete';
import { MAX_VIDEO_MB, uploadToStorage } from '@/components/video-upload';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { removeLabSample, saveLabSample } from '@/app/actions/pitch-lab';
import {
  LAB_VIEWS,
  LAB_VIEW_LABELS,
  labMetaChips,
  type LabMeta,
  type LabView,
} from '@/lib/pitch-lab-meta';
import type { LabSample } from '@/lib/pitch-lab';
import { V2StatusBadge } from './[id]/analysis-v2';

/**
 * 투구 분석(베타) 화면 — 위: 옆 · 뒤 영상 짝 올리기, 아래: 올린 샘플(나란히 재생 · 3D 분석 · 지우기).
 * 겉은 단순하게 — 촬영 정보는 기본값(동시 촬영 · 화면 녹화 · 오른손)으로 두고 '촬영 정보'를 펴야 보인다.
 */

const SYNC_OPTIONS = [
  { value: 'yes', label: '동시에 두 대' },
  { value: 'no', label: '한 대로 나눠' },
] as const;
const FPS_OPTIONS = [
  { value: 'unknown', label: '모름' },
  { value: '120', label: '120' },
  { value: '240', label: '240' },
] as const;
const SOURCE_OPTIONS = [
  { value: 'screen', label: '화면 녹화' },
  { value: 'original', label: '원본' },
] as const;
const HAND_OPTIONS = [
  { value: 'R', label: '오른손' },
  { value: 'L', label: '왼손' },
] as const;

const WHEN = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function LabClient({
  samples,
  defaultHeightCm,
}: {
  samples: LabSample[];
  defaultHeightCm: number | null;
}) {
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/videos">투구 기록</BackLink>
        <PageHeading
          kicker="베타"
          title="투구 분석"
          description="옆 · 뒤 영상을 짝으로 올려 두면 3D 분석을 만들어 시험해요."
        />
      </div>
      <UploadCard defaultHeightCm={defaultHeightCm} />
      {samples.length === 0 ? (
        <EmptyState
          icon={<Rotate3d />}
          title="아직 올린 샘플이 없어요"
          description="같은 공을 옆(3루 쪽)과 뒤(2루 쪽)에서 찍은 영상을 짝으로 올려 주세요."
        />
      ) : (
        <div className="stack-block">
          {samples.map((s, i) => (
            <SampleCard key={s.id} sample={s} n={samples.length - i} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── 올리기 ─────────────────────────── */

function UploadCard({ defaultHeightCm }: { defaultHeightCm: number | null }) {
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<LabView, File>>>({});
  const [infoOpen, setInfoOpen] = useState(false);
  const [synced, setSynced] = useState<'yes' | 'no'>('yes');
  const [fps, setFps] = useState<'unknown' | '120' | '240'>('unknown');
  const [source, setSource] = useState<'screen' | 'original'>('screen');
  const [hand, setHand] = useState<'R' | 'L'>('R');
  const [height, setHeight] = useState(defaultHeightCm ? String(defaultHeightCm) : '');
  const [distance, setDistance] = useState('');
  const [memo, setMemo] = useState('');
  const [progress, setProgress] = useState<{ view: LabView; percent: number } | null>(
    null
  );
  const [error, setError] = useState<string>();
  const [, start] = useTransition();

  const busy = progress != null;
  const ready = LAB_VIEWS.every((v) => files[v]) && !busy;

  const pick = (view: LabView, file: File | undefined) => {
    setError(undefined);
    if (!file) return;
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(`영상은 ${MAX_VIDEO_MB}MB 이하만 올릴 수 있어요.`);
      return;
    }
    setFiles((f) => ({ ...f, [view]: file }));
  };

  const upload = async () => {
    setError(undefined);
    const id = crypto.randomUUID();
    try {
      for (const view of LAB_VIEWS) {
        const file = files[view] as File;
        setProgress({ view, percent: 0 });
        await uploadToStorage(
          file,
          `/api/pitch-lab/upload-url?pair=${id}&view=${view}`,
          (percent) => setProgress({ view, percent })
        );
      }
      const meta: Omit<LabMeta, 'createdAt'> = {
        synced: synced === 'yes',
        slowmoFps: fps === 'unknown' ? null : (Number(fps) as 120 | 240),
        screenRecorded: source === 'screen',
        hand,
        heightCm: height ? Number(height) : null,
        distanceM: distance ? Number(distance) : null,
        memo: memo.trim() || null,
        files: Object.fromEntries(
          LAB_VIEWS.map((v) => [
            v,
            { name: files[v]?.name ?? '', size: files[v]?.size ?? 0 },
          ])
        ),
      };
      const r = await orOffline(saveLabSample({ id, meta }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in r) {
        setError(r.error);
        return;
      }
      setFiles({});
      setMemo('');
      start(() => quietRefresh(router));
    } catch (err) {
      setError(err instanceof Error ? err.message : '올리지 못했어요. 다시 해 주세요.');
    } finally {
      setProgress(null);
    }
  };

  return (
    <Card className="space-y-4">
      <div className="space-y-1">
        <p className="text-base font-semibold text-ink">샘플 올리기</p>
        <p className="text-xs text-muted">영상 하나에 {MAX_VIDEO_MB}MB까지예요.</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {LAB_VIEWS.map((view) => (
          <FilePick
            key={view}
            label={LAB_VIEW_LABELS[view]}
            file={files[view]}
            disabled={busy}
            percent={progress?.view === view ? progress.percent : null}
            onPick={(f) => pick(view, f)}
          />
        ))}
      </div>

      <div className="-mx-1 rounded-xl bg-ink/4">
        <DisclosureButton
          open={infoOpen}
          onClick={() => setInfoOpen((v) => !v)}
          label="촬영 정보"
        />
        {infoOpen && (
          <div className="space-y-3 px-3 pb-3 text-sm">
            <Row label="촬영">
              <Segmented
                label="촬영"
                value={synced}
                onChange={setSynced}
                options={SYNC_OPTIONS}
              />
            </Row>
            <Row label="슬로모(초당 장수)">
              <Segmented
                label="슬로모"
                value={fps}
                onChange={setFps}
                options={FPS_OPTIONS}
              />
            </Row>
            <Row label="영상">
              <Segmented
                label="영상"
                value={source}
                onChange={setSource}
                options={SOURCE_OPTIONS}
              />
            </Row>
            <Row label="던지는 손">
              <Segmented
                label="던지는 손"
                value={hand}
                onChange={setHand}
                options={HAND_OPTIONS}
              />
            </Row>
            <div className="grid grid-cols-2 gap-2">
              <NumberField
                label="키(cm)"
                value={height}
                onChange={setHeight}
                placeholder="175"
              />
              <NumberField
                label="폰까지 거리(m)"
                value={distance}
                onChange={setDistance}
                placeholder="모름"
              />
            </div>
            <label className="block space-y-1">
              <span className="text-xs text-muted">메모</span>
              <input
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                maxLength={500}
                placeholder="예: 직구, 세게"
                className="min-h-11 w-full rounded-xl bg-surface px-3 text-ink"
              />
            </label>
          </div>
        )}
      </div>

      {error && <ErrorLine>{error}</ErrorLine>}

      <button
        type="button"
        disabled={!ready}
        onClick={upload}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky text-base font-bold text-white disabled:opacity-40"
      >
        <Upload aria-hidden className="h-5 w-5" />
        {busy
          ? `${progress.view === 'side' ? '옆' : '뒤'} 영상 올리는 중 ${progress.percent}%`
          : '짝으로 올리기'}
      </button>
    </Card>
  );
}

function FilePick({
  label,
  file,
  disabled,
  percent,
  onPick,
}: {
  label: string;
  file: File | undefined;
  disabled: boolean;
  percent: number | null;
  onPick: (file: File | undefined) => void;
}) {
  return (
    <label
      className={`relative flex min-h-24 cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-2xl px-2 text-center ${file ? 'bg-sky/10 text-sky-strong' : 'bg-ink/5 text-muted'} ${disabled ? 'pointer-events-none opacity-60' : ''}`}
    >
      <input
        type="file"
        accept="video/*"
        className="sr-only"
        disabled={disabled}
        onChange={(e) => {
          onPick(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <Film aria-hidden className="h-5 w-5" />
      <span className="text-sm font-semibold">{label}</span>
      <span className="w-full truncate text-xs">
        {file
          ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(1)}MB`
          : '눌러서 고르기'}
      </span>
      {percent != null && (
        <span
          aria-hidden
          className="absolute inset-x-0 bottom-0 h-1 bg-sky transition-[width]"
          style={{ width: `${percent}%` }}
        />
      )}
    </label>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <p className="text-xs text-muted">{label}</p>
      {children}
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <label className="block space-y-1">
      <span className="text-xs text-muted">{label}</span>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
        placeholder={placeholder}
        className="min-h-11 w-full rounded-xl bg-surface px-3 text-ink"
      />
    </label>
  );
}

/* ─────────────────────────── 샘플 하나 ─────────────────────────── */

function SampleCard({ sample, n }: { sample: LabSample; n: number }) {
  const router = useRouter();
  const refs = useRef<Partial<Record<LabView, HTMLVideoElement | null>>>({});
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();

  /* 상태 표시의 '지금' — 렌더 때마다 바뀌지 않게 한 번만 */
  const [now] = useState(() => Date.now());

  /* 같이 재생 — 두 영상을 처음부터 함께(시간 맞추기는 분석이 할 일이라 여기서는 처음부터만) */
  const playBoth = () => {
    for (const view of LAB_VIEWS) {
      const v = refs.current[view];
      if (!v) continue;
      v.currentTime = 0;
      void v.play().catch(() => undefined);
    }
  };

  const remove = () =>
    start(async () => {
      const r = await orOffline(removeLabSample({ id: sample.id }), {
        error: OFFLINE_MESSAGE,
      });
      if ('error' in r) {
        setError(r.error);
        return;
      }
      setConfirm(false);
      quietRefresh(router);
    });

  const meta = sample.meta;
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[15px] font-semibold text-ink">
            샘플 {n}
            {meta?.createdAt && (
              <span className="ml-2 text-xs font-normal text-muted">
                {WHEN.format(new Date(meta.createdAt))}
              </span>
            )}
          </p>
          <p className="text-xs text-muted break-keep">
            {meta ? labMetaChips(meta).join(' · ') : '올리다 멈췄어요'}
          </p>
          {meta?.memo && <p className="text-sm text-ink break-keep">{meta.memo}</p>}
          <V2StatusBadge job={sample.v2.job} now={now} />
        </div>
        <button
          type="button"
          onClick={() => setConfirm(true)}
          aria-label="샘플 지우기"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors active:bg-ink/6"
        >
          <Trash2 aria-hidden className="h-5 w-5" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {LAB_VIEWS.map((view) => {
          const v = sample.videos[view];
          return (
            <div key={view} className="space-y-1">
              <p className="text-xs text-muted">{LAB_VIEW_LABELS[view]}</p>
              {v?.url ? (
                <video
                  ref={(el) => {
                    refs.current[view] = el;
                  }}
                  src={`${v.url}#t=0.001`}
                  controls
                  playsInline
                  muted
                  preload="metadata"
                  className="aspect-[9/16] w-full rounded-xl bg-black object-contain"
                />
              ) : (
                <div className="grid aspect-[9/16] w-full place-items-center rounded-xl bg-ink/5 text-xs text-muted">
                  영상 없음
                </div>
              )}
            </div>
          );
        })}
      </div>

      {sample.videos.side?.url && sample.videos.back?.url && (
        <button
          type="button"
          onClick={playBoth}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-ink/6 text-sm font-semibold text-ink"
        >
          <Play aria-hidden className="h-4 w-4" />
          같이 재생
        </button>
      )}

      {/* 3D 분석은 서버 GPU(v2) 결과 화면에서만(설계 pitch-3d-quality.md 화면 결정 1) — v1 기기 안 분석(졸라맨)은 2026-10-08 뺐다 */}
      <Link
        href={`/videos/lab/${sample.id}`}
        className="flex min-h-11 w-full items-center justify-between rounded-2xl bg-ink/4 px-4 text-sm font-semibold text-ink transition-colors active:bg-ink/8 desk:hover:bg-ink/6"
      >
        <span className="flex items-center gap-2">
          <Rotate3d aria-hidden className="h-4 w-4 text-sky" />
          {sample.v2.job?.status === 'done' ? '3D 결과 보기' : '3D 분석하기'}
        </span>
        <ChevronRight aria-hidden className="h-4 w-4 text-muted" />
      </Link>

      {error && <ErrorLine>{error}</ErrorLine>}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={remove}
        title="이 샘플을 지울까요?"
        detail="옆 · 뒤 영상과 촬영 정보가 함께 지워져요."
        confirmLabel="지우기"
        pending={pending}
      />
    </Card>
  );
}
