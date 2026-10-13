'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Film, Play, Rotate3d, Trash2, Upload } from 'lucide-react';
import { BackLink, Card, EmptyState, PageHeading } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { DisclosureButton } from '@/components/disclosure';
import { ErrorLine } from '@/components/error-line';
import { ConfirmDialog } from '@/components/confirm-delete';
import { uploadToStorage } from '@/components/video-upload';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { removeLabSample, saveLabSample } from '@/app/actions/pitch-lab';
import {
  LAB_GROUND_OPTIONS,
  LAB_MAX_VIDEO_BYTES,
  LAB_MAX_VIDEO_MB,
  LAB_VIEWS,
  LAB_VIEW_LABELS,
  labMetaChips,
  type LabGround,
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
  const [tab, setTab] = useState<'sample' | 'marker'>('sample');
  const normal = samples.filter((s) => s.meta?.kind !== 'marker');
  const markers = samples.filter((s) => s.meta?.kind === 'marker');
  const shown = tab === 'marker' ? markers : normal;
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/videos">투구</BackLink>
        <PageHeading
          kicker="베타"
          title="투구 분석"
          description="옆 · 뒤 영상을 짝으로 올려 두면 3D 분석을 만들어 시험해요."
        />
      </div>
      {/*
        일반 샘플과 마커 샘플(스티커를 붙여 3~4대로 찍은 정답지용)을 따로 둔다 — 2026-10-12 사용자: "기존 샘플과 다른 곳에".
        마커 샘플은 화면에서 올리지 않는다(카메라 3~4대 영상이라 스크립트로) — 그 탭에는 올리기 카드가 없다.
      */}
      {markers.length > 0 && (
        <Segmented
          label="샘플 종류"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'sample', label: `샘플 ${normal.length}` },
            { value: 'marker', label: `마커 샘플 ${markers.length}` },
          ]}
        />
      )}
      {tab === 'sample' && <UploadCard defaultHeightCm={defaultHeightCm} />}
      {shown.length === 0 ? (
        <EmptyState
          icon={<Rotate3d />}
          title="아직 올린 샘플이 없어요"
          description="같은 공을 옆(3루 쪽)과 뒤(2루 쪽)에서 찍은 영상을 짝으로 올려 주세요."
        />
      ) : (
        <div className="space-y-2">
          {shown.map((s, i) => (
            <SampleCard
              key={s.id}
              sample={s}
              n={shown.length - i}
              label={tab === 'marker' ? '마커 샘플' : '샘플'}
            />
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
  const [ground, setGround] = useState<LabGround>('mound');
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
    if (file.size > LAB_MAX_VIDEO_BYTES) {
      setError(`영상은 ${LAB_MAX_VIDEO_MB}MB 이하만 올릴 수 있어요.`);
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
        ground,
        heightCm: height ? Number(height) : null,
        distanceM: distance ? Number(distance) : null,
        memo: memo.trim() || null,
        /* 화면에서 올리는 것은 늘 일반 샘플 — 마커 샘플은 3~4대 영상이라 스크립트로 올린다 */
        kind: 'sample',
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
        <p className="text-xs text-muted">
          영상 하나에 {LAB_MAX_VIDEO_MB}MB까지예요. 카메라는 1배(기본 렌즈)로 찍어 주세요. 분석이 1배로 계산해요.
        </p>
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
            <Row label="던진 곳">
              <Segmented
                label="던진 곳"
                value={ground}
                onChange={setGround}
                options={LAB_GROUND_OPTIONS}
              />
            </Row>
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

function SampleCard({
  sample,
  n,
  label = '샘플',
}: {
  sample: LabSample;
  n: number;
  label?: string;
}) {
  const router = useRouter();
  const refs = useRef<Partial<Record<string, HTMLVideoElement | null>>>({});
  const [confirm, setConfirm] = useState(false);
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  /* 영상은 펼칠 때만 — 26개가 늘 9:16 영상 둘씩 펴져 있어 찾기 힘들었다(2026-10-12 사용자). 접힌 동안은 받지도 않는다 */
  const [open, setOpen] = useState(false);

  /* 상태 표시의 '지금' — 렌더 때마다 바뀌지 않게 한 번만 */
  const [now] = useState(() => Date.now());

  /* 같이 재생 — 두 영상을 처음부터 함께(시간 맞추기는 분석이 할 일이라 여기서는 처음부터만) */
  const playBoth = () => {
    for (const v of Object.values(refs.current)) {
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
  /*
   * 펼친 영상 칸 — 옆 · 뒤, 마커 샘플이면 ③ 1루 · ④ 홈 대각선까지(cam3 · cam4, 2026-10-12 사용자: "1루 · 홈 방향 2개는 왜 안 보이냐").
   * 마커 샘플은 카메라 번호를 앞에 붙인다(마커 촬영 안내서의 ①~④).
   */
  const marker = meta?.kind === 'marker';
  const cells = [
    ...LAB_VIEWS.map((view) => ({
      key: view,
      label: (marker ? (view === 'side' ? '① ' : '② ') : '') + LAB_VIEW_LABELS[view],
      url: sample.videos[view]?.url ?? null,
    })),
    ...sample.extras.map((x) => ({
      key: x.key,
      /* 실제 자리는 정답지 계산으로 확인(scripts/pitch-lab/markers/selfcal/README.md) — cam3 아이폰 11 이 홈 쪽 정면, cam4 SE2 가 1루 쪽 */
      label: x.key === 'cam3' ? '③ 홈 쪽 정면' : '④ 1루 쪽',
      url: x.url,
    })),
  ];
  return (
    <Card className="space-y-3 !py-3">
      {/* 한 줄 — 이름 · 날짜 · 표시 · 메모(한 줄로 자름) · 상태. 줄을 누르면 결과 화면, 오른쪽은 영상 펴기 · 지우기 */}
      <div className="flex items-center gap-2">
        <Link href={`/videos/lab/${sample.id}`} className="min-w-0 flex-1 space-y-0.5">
          <p className="truncate text-[15px] font-semibold text-ink">
            {label} {n}
            {meta?.createdAt && (
              <span className="ml-2 text-xs font-normal text-muted">
                {WHEN.format(new Date(meta.createdAt))}
              </span>
            )}
          </p>
          {/* 마커 샘플은 표시가 모두 같아 메모(투구 번호)만 — 한 줄이라도 짧게 */}
          {meta?.kind !== 'marker' && (
            <p className="truncate text-xs text-muted">
              {meta ? labMetaChips(meta).join(' · ') : '올리다 멈췄어요'}
            </p>
          )}
          {meta?.memo && <p className="truncate text-xs text-ink/80">{meta.memo}</p>}
          <V2StatusBadge job={sample.v2.job} now={now} />
        </Link>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label={open ? '영상 접기' : '영상 보기'}
          className="flex h-11 shrink-0 items-center gap-1 rounded-full bg-ink/6 px-3 text-xs font-semibold text-ink"
        >
          <Play aria-hidden className="h-3.5 w-3.5" />
          {open ? '접기' : '영상'}
        </button>
        <button
          type="button"
          onClick={() => setConfirm(true)}
          aria-label="샘플 지우기"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-muted transition-colors active:bg-ink/6"
        >
          <Trash2 aria-hidden className="h-5 w-5" />
        </button>
      </div>

      {open && (
        <>
      <div className="grid grid-cols-2 gap-2">
        {cells.map((c) => (
            <div key={c.key} className="space-y-1">
              <p className="text-xs text-muted">{c.label}</p>
              {c.url ? (
                <video
                  ref={(el) => {
                    refs.current[c.key] = el;
                  }}
                  src={`${c.url}#t=0.001`}
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
        ))}
      </div>

      {sample.videos.side?.url && sample.videos.back?.url && (
        <button
          type="button"
          onClick={playBoth}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl bg-ink/6 text-sm font-semibold text-ink"
        >
          <Play aria-hidden className="h-4 w-4" />
          {cells.length > 2 ? `${cells.length}대 같이 재생` : '같이 재생'}
        </button>
      )}

        </>
      )}

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
