'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronRight, Film, Rotate3d, Upload } from '@/components/icon';
import { BackLink, Card, EmptyState, PageHeading } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { ErrorLine } from '@/components/error-line';
import { uploadToStorage } from '@/components/video-upload';
import { fileFingerprint, labPairBlock, labVideoBlock, type LabCapture } from '@/lib/pitch-lab-guard';
import {
  LAB_BAT_OPTIONS,
  LAB_MAX_VIDEO_BYTES,
  LAB_MAX_VIDEO_MB,
  LAB_VIEWS,
  type LabBat,
  type LabHand,
  type LabMeta,
  type LabView,
} from '@/lib/pitch-lab-meta';
import { SWING_MARKER_NOTE, swingFrontBase, swingViewLabel, swingViewShort } from '@/lib/swing-lab-meta';
import { OFFLINE_MESSAGE, orOffline } from '@/lib/action-offline';
import { quietRefresh } from '@/lib/quiet-refresh';
import { saveSwingSample, type SwingListItem } from '@/app/actions/swing-lab';
import { FilePick, probeLabVideo } from '@/app/(app)/videos/lab/lab-client';
import { SwingRows } from '@/app/(app)/hitting/lab/swing-rows';

/**
 * 3D 개발 관리자(웹) — 위는 바로가기(투구 샘플 · 사용자 화면 · 촬영 안내), [타자 샘플 | 마커 샘플], 올리기, 아래는 관리자끼리 본 샘플.
 * 올리기 전 검사 · 짝 검사는 투구와 같은 lib/pitch-lab-guard.ts(마커 샘플은 3~4대를 손으로 맞춰 찍어 짝 검사를 건너뛴다). 서버 saveSwingSample 이 한 번 더 본다.
 */
const FPS_OPTIONS = [
  { value: 'unknown', label: '모름' },
  { value: '120', label: '120' },
  { value: '240', label: '240' },
] as const;
const HAND_OPTIONS = [
  { value: 'R', label: '우타' },
  { value: 'L', label: '좌타' },
] as const;
const BAT_OPTIONS = [{ value: 'none', label: '모름' }, ...LAB_BAT_OPTIONS] as const;

export function Dev3dClient({
  samples,
  defaultHeightCm,
  defaultHand,
}: {
  samples: SwingListItem[];
  defaultHeightCm: number | null;
  defaultHand: LabHand;
}) {
  const [tab, setTab] = useState<'sample' | 'marker'>('sample');
  const normal = samples.filter((s) => !s.marker);
  const markers = samples.filter((s) => s.marker);
  const shown = tab === 'marker' ? markers : normal;
  return (
    <div className="stack-page">
      <div className="space-y-2">
        <BackLink href="/admin">관리자</BackLink>
        <PageHeading kicker="대표관리자" title="3D 개발 관리자" description="3D 스윙 분석 모델을 만들 타자 영상을 모아요. 같은 스윙을 정면과 포수 뒤에서 함께 찍어 짝으로 올려 주세요." />
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
        {[
          { href: '/videos/lab', label: '투구 샘플 · 마커 샘플' },
          { href: '/hitting/lab', label: '3D 스윙 분석 사용자 화면' },
          { href: `/hitting/lab/guide?hand=${defaultHand}`, label: '타자 촬영 안내' },
        ].map((x) => (
          <li key={x.href}>
            <Link href={x.href} className="flex min-h-12 items-center gap-3 px-(--block-pad) text-sm font-semibold text-ink">
              <span className="flex-1">{x.label}</span>
              <ChevronRight aria-hidden className="h-4 w-4 text-muted" />
            </Link>
          </li>
        ))}
      </ul>
      <Segmented
        label="샘플 종류"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'sample', label: `타자 샘플 ${normal.length}` },
          { value: 'marker', label: `마커 샘플 ${markers.length}` },
        ]}
      />
      <UploadCard key={tab} marker={tab === 'marker'} defaultHeightCm={defaultHeightCm} defaultHand={defaultHand} />
      {shown.length === 0 ? (
        <EmptyState
          icon={<Rotate3d />}
          title="아직 올린 영상이 없어요"
          description={`같은 스윙을 정면(${swingFrontBase(defaultHand)} 쪽)과 포수 뒤에서 찍은 영상을 짝으로 올려 주세요.`}
        />
      ) : (
        <SwingRows samples={shown} />
      )}
    </div>
  );
}

function UploadCard({ marker, defaultHeightCm, defaultHand }: { marker: boolean; defaultHeightCm: number | null; defaultHand: LabHand }) {
  const router = useRouter();
  const [files, setFiles] = useState<Partial<Record<LabView, File>>>({});
  const [extras, setExtras] = useState<Partial<Record<'cam3' | 'cam4', File>>>({});
  const [fps, setFps] = useState<'unknown' | '120' | '240'>('unknown');
  const [hand, setHand] = useState<LabHand>(defaultHand);
  const [bat, setBat] = useState<LabBat | 'none'>('none');
  const [height, setHeight] = useState(defaultHeightCm ? String(defaultHeightCm) : '');
  const [distance, setDistance] = useState<Record<LabView, string>>({ side: '', back: '' });
  const [memo, setMemo] = useState('');
  const [fpsOf, setFpsOf] = useState<Partial<Record<LabView, number | null>>>({});
  const [capOf, setCapOf] = useState<Partial<Record<LabView, LabCapture & { fp: string }>>>({});
  const [progress, setProgress] = useState<{ label: string; percent: number } | null>(null);
  const [error, setError] = useState<string>();
  const [, start] = useTransition();

  const busy = progress != null;
  const pairBlock = !marker && capOf.side && capOf.back ? labPairBlock(capOf.side, capOf.back) : null;
  const ready = LAB_VIEWS.every((v) => files[v] && capOf[v]) && !pairBlock && !busy;

  const pick = (view: LabView, file: File | undefined) => {
    setError(undefined);
    if (!file) return;
    if (file.size > LAB_MAX_VIDEO_BYTES) return setError(`영상은 ${LAB_MAX_VIDEO_MB}MB 이하만 올릴 수 있어요.`);
    setFiles((f) => ({ ...f, [view]: file }));
    setCapOf((m) => ({ ...m, [view]: undefined }));
    setFpsOf((m) => ({ ...m, [view]: undefined }));
    void Promise.all([probeLabVideo(file), fileFingerprint(file)]).then(([probe, fp]) => {
      const block = labVideoBlock(probe.info);
      if (block) {
        setFiles((f) => (f[view] === file ? { ...f, [view]: undefined } : f));
        setError(`${swingViewLabel(view, hand)} 영상: ${block}`);
        return;
      }
      setFpsOf((m) => {
        const next = { ...m, [view]: probe.info.fps };
        const both = LAB_VIEWS.map((x) => next[x]);
        if (both.every((x): x is number => x != null && x >= 100)) setFps(Math.min(...both) >= 200 ? '240' : '120');
        return next;
      });
      setCapOf((m) => ({ ...m, [view]: { ...probe.capture, fp } }));
    });
  };

  const upload = async () => {
    setError(undefined);
    const id = crypto.randomUUID();
    try {
      const jobs: { key: LabView | 'cam3' | 'cam4'; file: File; label: string }[] = [
        ...LAB_VIEWS.map((v) => ({ key: v, file: files[v] as File, label: swingViewShort(v) })),
        ...(marker ? (['cam3', 'cam4'] as const).flatMap((k) => (extras[k] ? [{ key: k, file: extras[k], label: k === 'cam3' ? '③' : '④' }] : [])) : []),
      ];
      for (const j of jobs) {
        setProgress({ label: j.label, percent: 0 });
        await uploadToStorage(j.file, `/api/pitch-lab/upload-url?pair=${id}&view=${j.key}&sport=hit`, (percent) => setProgress({ label: j.label, percent }));
      }
      const meta: Omit<LabMeta, 'createdAt'> = {
        synced: true,
        slowmoFps: fps === 'unknown' ? null : (Number(fps) as 120 | 240),
        screenRecorded: false,
        hand,
        ground: 'flat',
        heightCm: height ? Number(height) : null,
        distanceM: null,
        distances: Object.fromEntries(LAB_VIEWS.filter((v) => distance[v]).map((v) => [v, Number(distance[v])])),
        memo: memo.trim() || null,
        kind: marker ? 'marker' : 'sample',
        ...(bat !== 'none' ? { bat } : {}),
        files: Object.fromEntries(
          LAB_VIEWS.map((v) => [
            v,
            {
              name: files[v]?.name ?? '',
              size: files[v]?.size ?? 0,
              fp: capOf[v]?.fp,
              ...(capOf[v]?.startMs != null ? { at: new Date(capOf[v].startMs).toISOString(), src: capOf[v].timeSource ?? undefined } : {}),
              ...(capOf[v]?.durationSec != null ? { dur: capOf[v].durationSec } : {}),
            },
          ])
        ),
      };
      const r = await orOffline(saveSwingSample({ id, meta }), { error: OFFLINE_MESSAGE });
      if ('error' in r) return setError(r.error);
      setFiles({});
      setExtras({});
      setCapOf({});
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
        <p className="text-base font-semibold text-ink">{marker ? '마커 샘플 올리기' : '타자 샘플 올리기'}</p>
        <p className="text-xs break-keep text-muted">
          {marker ? SWING_MARKER_NOTE : `두 폰으로 같은 스윙을 동시에 찍은 원본만 올릴 수 있어요. 영상 하나에 ${LAB_MAX_VIDEO_MB}MB까지예요.`}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {LAB_VIEWS.map((view) => (
          <FilePick
            key={view}
            label={swingViewLabel(view, hand)}
            file={files[view]}
            disabled={busy}
            percent={progress?.label === swingViewShort(view) ? progress.percent : null}
            fps={files[view] ? fpsOf[view] : undefined}
            onPick={(f) => pick(view, f)}
          />
        ))}
      </div>
      {marker && (
        <div className="grid grid-cols-2 gap-2">
          {(['cam3', 'cam4'] as const).map((k) => (
            <label key={k} className={`flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl px-2 text-center ${extras[k] ? 'bg-sky/10 text-sky-strong' : 'bg-ink/5 text-muted'}`}>
              <input
                type="file"
                accept="video/*"
                className="sr-only"
                disabled={busy}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = '';
                  if (!f) return;
                  if (f.size > LAB_MAX_VIDEO_BYTES) return setError(`영상은 ${LAB_MAX_VIDEO_MB}MB 이하만 올릴 수 있어요.`);
                  setExtras((x) => ({ ...x, [k]: f }));
                }}
              />
              <Film aria-hidden className="h-4 w-4" />
              <span className="text-sm font-semibold">{k === 'cam3' ? '③ 카메라' : '④ 카메라'}</span>
              <span className="w-full truncate text-xs">{extras[k] ? `${(extras[k].size / 1024 / 1024).toFixed(1)}MB` : '있으면 고르기'}</span>
            </label>
          ))}
        </div>
      )}
      <div className="space-y-3 rounded-xl bg-ink/4 p-3 text-sm">
        <Field label="슬로모(초당 장수)">
          <Segmented label="슬로모" value={fps} onChange={setFps} options={FPS_OPTIONS} />
        </Field>
        <Field label="타석">
          <Segmented label="타석" value={hand} onChange={setHand} options={HAND_OPTIONS} />
        </Field>
        <Field label="배트">
          <Segmented label="배트" value={bat} onChange={setBat} options={BAT_OPTIONS} />
        </Field>
        <div className="grid grid-cols-3 gap-2">
          <NumberField label="키(cm)" value={height} onChange={setHeight} placeholder="175" />
          {LAB_VIEWS.map((v) => (
            <NumberField key={v} label={`${swingViewShort(v)} 폰까지(m)`} value={distance[v]} onChange={(x) => setDistance((d) => ({ ...d, [v]: x }))} placeholder="모름" />
          ))}
        </div>
        <label className="block space-y-1">
          <span className="text-xs text-muted">메모</span>
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            maxLength={500}
            placeholder="예: 티 배팅, 몸쪽 높은 공"
            className="min-h-11 w-full rounded-xl bg-surface px-3 text-ink"
          />
        </label>
      </div>
      {error && <ErrorLine>{error}</ErrorLine>}
      {pairBlock && <ErrorLine>{pairBlock}</ErrorLine>}
      <button
        type="button"
        disabled={!ready}
        onClick={upload}
        className="flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-sky text-base font-bold text-white disabled:opacity-40"
      >
        <Upload aria-hidden className="h-5 w-5" />
        {progress ? `${progress.label} 영상 올리는 중 ${progress.percent}%` : '짝으로 올리기'}
      </button>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted">{label}</span>
      {children}
    </div>
  );
}

function NumberField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs break-keep text-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9.]/g, '').slice(0, 5))}
        inputMode="decimal"
        placeholder={placeholder}
        className="text-numeric min-h-11 w-full rounded-xl bg-surface px-3 text-ink"
      />
    </label>
  );
}
