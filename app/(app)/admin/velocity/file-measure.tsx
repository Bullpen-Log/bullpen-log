'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { unstable_rethrow, useRouter } from 'next/navigation';
import { Button, Field, FormError, Input } from '@/components/ui';
import { Segmented } from '@/components/segmented';
import { saveVelocitySession } from '@/app/actions/velocity';
import { uploadClip } from '@/lib/velocity-clip-upload';
import { analysisOf } from '@/lib/velocity-analysis';
import { analyzeVideo, type AnalyzeResult } from '@/lib/velocity-engine/analyze-video';
import { isLowFrameRate, readVideoFps } from '@/lib/velocity-engine/video-fps';
import { readVideoLens, videoFovInfo, videoLensText } from '@/lib/velocity-engine/video-lens';
import { approachOf, type CameraPos } from '@/lib/velocity-setup';
import { CONFIDENCE_TEXT, PITCH_TYPES, type ConfidenceKey } from '@/lib/velocity-meta';
import { toDateKey } from '@/lib/pitch-stats';
import { quietRefresh } from '@/lib/quiet-refresh';

/**
 * 영상 파일로 재기(보정용) — 관리자가 폰 영상(일반 60fps · 슬로모션 120~240fps)을 골라 브라우저에서
 * 재고, 스피드건 값과 함께 보정용 세션으로 저장한다. 영상은 서버로 보내지 않고 브라우저가 연다
 * (analyzeVideo). 저장하면 공 하나짜리 세션(source: 'file', forCalibration)이 생기고 그 영상이 클립으로
 * 올라간다.
 *
 * 측정이 안 되는 영상(30fps 이하 · fps 를 못 읽음 · 공을 못 찾음)도 올릴 수 있다 — 스피드건 값을
 * 적어 '수기'로 저장하면 영상 클립과 값이 남고(VelocityPitch.manual), 보정 짝에는 안 들어간다.
 * 엔진이 좋아진 뒤 관리자 화면에서 그 영상을 다시 재 값을 채우면 짝이 된다(사용자 요청, 2026-09-28).
 * 카메라 측정('재기')은 fps 를 읽었고 30 을 넘을 때만.
 */
const CAMERA_OPTIONS = [
  { value: 'behind-pitcher', label: '투수 뒤' },
  { value: 'behind-catcher', label: '포수 뒤' },
] as const;

type Stage =
  | { kind: 'idle' }
  | { kind: 'analyzing'; ratio: number }
  | { kind: 'done'; result: AnalyzeResult }
  | { kind: 'saving'; result: AnalyzeResult; percent: number | null }
  /* 수기 — 재지 않고 스피드건 값으로 저장 · 클립 올리기 */
  | { kind: 'manual'; percent: number | null }
  | { kind: 'saved'; date: string };

export function FileMeasure({
  onOpenSaved,
}: {
  /** 저장 뒤 '자료 보기'를 누르면 — 창에 띄웠으면 창을 닫는다 */
  onOpenSaved?: () => void;
} = {}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [durationSec, setDurationSec] = useState<number | null>(null);
  /* 파일 머리에서 읽은 fps — 읽는 중이면 'reading' */
  const [fps, setFps] = useState<number | 'reading' | null>(null);
  /* 파일을 잇달아 고르면 먼저 고른 파일의 fps 가 늦게 와도 버린다 */
  const pickSeq = useRef(0);
  const [cameraPos, setCameraPos] = useState<CameraPos>('behind-pitcher');
  const [fovDeg, setFovDeg] = useState('69');
  /* 파일에서 읽은 렌즈 — 아이폰 영상이면 화각을 62° 로 채운다(video-lens.ts) */
  const [lensText, setLensText] = useState<string | null>(null);
  const [releaseDist, setReleaseDist] = useState('18.5');
  const [date, setDate] = useState(() => toDateKey(new Date()));
  const [gun, setGun] = useState('');
  const [pitchType, setPitchType] = useState('');
  const [stage, setStage] = useState<Stage>({ kind: 'idle' });
  const [error, setError] = useState<string | null>(null);

  const approach = approachOf({ cameraPos });
  const busy =
    stage.kind === 'analyzing' || stage.kind === 'saving' || stage.kind === 'manual';
  /* 카메라로 잴 수 있나 — fps 를 읽었고 30 을 넘어야. 아니면 수기로만 올린다 */
  const measurable = typeof fps === 'number' && !isLowFrameRate(fps);
  const ready = file != null && measurable;
  const unmeasurableWhy =
    fps === null && file
      ? '이 영상은 fps 를 읽지 못해 카메라로 잴 수 없어요 — 수기 값으로만 올릴 수 있어요.'
      : typeof fps === 'number' && isLowFrameRate(fps)
        ? `${Math.round(fps)}fps 라 카메라로 잴 수 없어요(60fps 이상이어야) — 수기 값으로만 올릴 수 있어요.`
        : null;

  /**
   * 파일을 고르면 fps 와 길이를 미리 읽어 둔다. fps 가 30 이하면 그 자리에서 막는다 — 길이는
   * 저장할 때 클립 길이로 적는다.
   */
  function pickFile(next: File | null) {
    const seq = ++pickSeq.current;
    setFile(next);
    setFps(next ? 'reading' : null);
    setDurationSec(null);
    setStage({ kind: 'idle' });
    setError(null);
    if (!next) return;
    void readVideoFps(next).then((read) => {
      if (seq !== pickSeq.current) return;
      /* 못 읽었거나 30fps 이하면 '재기'는 잠기고 수기로만 올린다(아래 unmeasurableWhy) */
      setFps(read);
    });
    setLensText(null);
    void readVideoLens(next).then((lens) => {
      if (seq !== pickSeq.current) return;
      /* 스피드건으로 맞춘 것은 24mm(15 Pro · Pro Max)뿐 — 다른 초점거리는 추정이라 알린다(video-lens.ts videoFovInfo) */
      const info = videoFovInfo(lens);
      const fov = info?.fovDeg ?? null;
      const text = videoLensText(lens);
      setLensText(
        text ? `${text}${fov ? ` → 화각 ${fov}°${info?.estimate ? '(추정 — 렌즈 보정 권장)' : ''}` : ''}` : null
      );
      if (fov) setFovDeg(String(fov));
    });
    const url = URL.createObjectURL(next);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      if (Number.isFinite(video.duration)) {
        setDurationSec(Math.round(video.duration * 100) / 100);
      }
      URL.revokeObjectURL(url);
    };
    video.onerror = () => URL.revokeObjectURL(url);
    video.src = url;
  }

  async function measure() {
    if (!file) return setError('영상 파일을 골라주세요.');
    if (fps === 'reading') return setError('영상의 fps 를 읽는 중이에요. 잠깐 뒤 다시 눌러주세요.');
    if (typeof fps !== 'number' || !measurable)
      return setError(unmeasurableWhy ?? '이 영상은 카메라로 잴 수 없어요.');
    const fov = Number(fovDeg);
    if (!(fov >= 30 && fov <= 120))
      return setError('화각은 30~120° 사이로 넣어주세요.');
    const dist = Number(releaseDist);
    if (cameraPos === 'behind-catcher' && !(dist >= 3 && dist <= 40)) {
      return setError('릴리스까지 거리는 3~40m 사이로 넣어주세요.');
    }
    setError(null);
    setStage({ kind: 'analyzing', ratio: 0 });
    try {
      const result = await analyzeVideo({
        file,
        fps,
        fovDeg: fov,
        approach,
        releaseDistanceM: cameraPos === 'behind-catcher' ? dist : null,
        onProgress: (ratio) => setStage({ kind: 'analyzing', ratio }),
      });
      setStage({ kind: 'done', result });
    } catch (e) {
      setStage({ kind: 'idle' });
      setError(e instanceof Error ? e.message : '영상을 재지 못했습니다.');
    }
  }

  /**
   * 수기로 올리기 — 재지 않고(또는 재지 못해서) 스피드건 값만으로 공 하나짜리 세션을 만들고 영상을
   * 클립으로 올린다. 카메라 값이 없으니 보정 짝은 아니다 — 나중에 다시 재서 채울 자료.
   */
  /* 신호가 끊겨 서버 액션이 던지면 — 단계가 '저장 중'에 멈춘 채 남지 않게 실패로 바꾼다(Next.js 자체 신호는 그대로) */
  function offline(err: unknown) {
    unstable_rethrow(err);
    return {
      ok: false as const,
      error: '신호가 약해 저장하지 못했어요. 신호가 잡히면 다시 눌러 주세요.',
    };
  }

  async function uploadManual() {
    if (!file || busy) return;
    if (fps === 'reading') return setError('영상의 fps 를 읽는 중이에요. 잠깐 뒤 다시 눌러주세요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('날짜가 올바르지 않습니다.');
    const gunKmh = gun.trim() === '' ? null : Number(gun);
    if (gunKmh == null || !(gunKmh >= 30 && gunKmh <= 200)) {
      return setError('수기로 올리려면 스피드건 값(30~200 km/h)을 적어야 해요.');
    }
    const fov = Number(fovDeg);
    const dist = cameraPos === 'behind-catcher' ? Number(releaseDist) : null;
    setError(null);
    setStage({ kind: 'manual', percent: null });

    const saved = await saveVelocitySession({
      date,
      sessionType: '불펜',
      intensity: 5,
      fovDeg: fov >= 30 && fov <= 120 ? fov : 69,
      source: 'file',
      device: file.name.slice(0, 200),
      cameraPos,
      net: false,
      forCalibration: true,
      autoMode: false,
      focalPx: null,
      frameW: null,
      frameH: null,
      releaseDistM: dist != null && dist >= 3 && dist <= 40 ? dist : null,
      pitches: [
        {
          manual: true,
          rawKmh: gunKmh,
          errorKmh: 0,
          confidence: 'low',
          releaseKmh: null,
          releaseDxCm: null,
          releaseDyCm: null,
          releaseDistM: null,
          travelM: null,
          durationSec: null,
          frames: null,
          fps: typeof fps === 'number' ? fps : null,
          autoDetected: false,
          pitchType: pitchType || null,
          zone: null,
          result: null,
          gunKmh,
          memo: null,
        },
      ],
    }).catch(offline);
    if (!saved.ok) {
      setStage({ kind: 'idle' });
      return setError(saved.error);
    }
    const pitchId = saved.pitchIds?.[0];
    if (pitchId) {
      const up = await uploadClip(
        pitchId,
        file,
        { sec: durationSec, eventSec: null },
        (percent) => setStage({ kind: 'manual', percent })
      );
      if (!up.ok) setError(`공은 저장했지만 클립은 못 올렸어요: ${up.error}`);
    }
    setStage({ kind: 'saved', date });
    setFile(null);
    setFps(null);
    if (fileRef.current) fileRef.current.value = '';
    startTransition(() => quietRefresh(router));
  }

  async function save() {
    if (stage.kind !== 'done' || !file) return;
    const { result } = stage;
    const m = result.measure;
    if (!m.ok) return setError('거부된 측정은 저장할 수 없어요.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return setError('날짜가 올바르지 않습니다.');
    const gunKmh = gun.trim() === '' ? null : Number(gun);
    if (gunKmh != null && !(gunKmh >= 30 && gunKmh <= 200)) {
      return setError('스피드건 값은 30~200 km/h 사이로 넣어주세요.');
    }
    const fov = Number(fovDeg);
    const dist = cameraPos === 'behind-catcher' ? Number(releaseDist) : null;
    setError(null);
    setStage({ kind: 'saving', result, percent: null });

    const saved = await saveVelocitySession({
      date,
      sessionType: '불펜',
      intensity: 5,
      fovDeg: fov,
      source: 'file',
      device: file.name.slice(0, 200),
      cameraPos,
      net: false,
      forCalibration: true,
      autoMode: false,
      focalPx: result.focalPx,
      frameW: result.sourceSize.width,
      frameH: result.sourceSize.height,
      releaseDistM: dist,
      pitches: [
        {
          rawKmh: m.kmh,
          errorKmh: m.errorKmh,
          confidence: m.confidence,
          releaseKmh: result.release?.releaseKmh ?? null,
          releaseDxCm: result.release?.dxCm ?? null,
          releaseDyCm: result.release?.dyCm ?? null,
          releaseDistM: result.release?.distanceM ?? null,
          travelM: m.detail.travelM,
          durationSec: m.detail.durationSec,
          frames: m.detail.frames,
          fps: result.fps,
          analysis: analysisOf(result, approach),
          autoDetected: false,
          pitchType: pitchType || null,
          zone: null,
          result: null,
          gunKmh,
          memo: null,
        },
      ],
    }).catch(offline);
    if (!saved.ok) {
      setStage({ kind: 'done', result });
      return setError(saved.error);
    }
    const pitchId = saved.pitchIds?.[0];
    if (pitchId) {
      const up = await uploadClip(
        pitchId,
        file,
        { sec: durationSec, eventSec: null },
        (percent) => setStage({ kind: 'saving', result, percent })
      );
      if (!up.ok) {
        /* 공은 저장됐고 클립만 못 올렸다 — 날짜 페이지에서 다시 볼 수 있게 알린다 */
        setError(`공은 저장했지만 클립은 못 올렸어요: ${up.error}`);
      }
    }
    setStage({ kind: 'saved', date });
    setFile(null);
    setFps(null);
    if (fileRef.current) fileRef.current.value = '';
    startTransition(() => quietRefresh(router));
  }

  const result = stage.kind === 'done' || stage.kind === 'saving' ? stage.result : null;

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="영상 파일"
          hint="60fps 이상(일반 60fps · 슬로모션 120~240fps)이면 이 브라우저에서 재요. 30fps 이하 · 못 재는 영상은 스피드건 값을 적어 수기로 올려요."
        >
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            disabled={busy}
            onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink file:mr-3 file:rounded-lg file:border file:border-line-strong file:bg-surface-2 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-ink"
          />
          {file && (
            <span className="block text-xs text-muted">
              {file.name} · {(file.size / 1024 / 1024).toFixed(1)}MB
              {durationSec != null && ` · ${durationSec}초`}
              {fps === 'reading'
                ? ' · fps 읽는 중…'
                : typeof fps === 'number'
                  ? ` · ${Math.round(fps)}fps`
                  : ' · fps 모름'}
            </span>
          )}
          {file && unmeasurableWhy && (
            <span className="block text-xs leading-relaxed text-warn">{unmeasurableWhy}</span>
          )}
        </Field>
        <div className="space-y-2">
          <span className="block text-xs font-medium text-muted">카메라 위치</span>
          <Segmented
            label="카메라 위치"
            value={cameraPos}
            onChange={setCameraPos}
            options={CAMERA_OPTIONS}
            itemClassName="px-3 py-2"
          />
          <span className="block text-xs text-muted/70">
            {cameraPos === 'behind-pitcher'
              ? '공이 멀어져요 — 릴리스 포인트까지 잡혀요'
              : '공이 다가와요 — 릴리스까지 거리로 릴리스 구속을 되돌려요'}
          </span>
        </div>
        <Field
          label="화각(°)"
          hint={
            lensText
              ? `파일의 렌즈: ${lensText} — 아이폰 영상 모드는 사진(69°)보다 좁아요`
              : '아이폰 15 Pro 메인 카메라 영상 모드 59.8°(스피드건으로 맞춘 값), 사진 모드 약 69°'
          }
        >
          <Input
            inputMode="decimal"
            value={fovDeg}
            disabled={busy}
            onChange={(e) => setFovDeg(e.target.value)}
          />
        </Field>
        {cameraPos === 'behind-catcher' && (
          <Field label="릴리스까지 거리(m)" hint="정규 마운드 · 홈 뒤 1.8m 면 약 18.5m">
            <Input
              inputMode="decimal"
              value={releaseDist}
              disabled={busy}
              onChange={(e) => setReleaseDist(e.target.value)}
            />
          </Field>
        )}
        <Field label="날짜">
          <Input
            type="date"
            value={date}
            disabled={busy}
            onChange={(e) => setDate(e.target.value)}
          />
        </Field>
        <Field label="스피드건 값(km/h)" hint="수기로 올릴 때는 꼭 적어요">
          <Input
            inputMode="decimal"
            placeholder="예: 128"
            value={gun}
            disabled={busy}
            onChange={(e) => setGun(e.target.value)}
          />
        </Field>
        <Field label="구종(선택)">
          <select
            value={pitchType}
            disabled={busy}
            onChange={(e) => setPitchType(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink focus:border-sky focus:outline-none"
          >
            <option value="">고르지 않음</option>
            {PITCH_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <FormError>{error}</FormError>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" onClick={measure} disabled={busy || !ready}>
          {stage.kind === 'analyzing'
            ? `재는 중 ${Math.round(stage.ratio * 100)}%`
            : '재기'}
        </Button>
        {stage.kind === 'done' && stage.result.measure.ok && (
          <Button type="button" variant="secondary" onClick={save}>
            보정용으로 저장
          </Button>
        )}
        {/* 재지 않거나 못 잰 영상 — 스피드건 값만으로 올린다(관리자 · 보정 짝 아님) */}
        {file && stage.kind !== 'saving' && !(stage.kind === 'done' && stage.result.measure.ok) && (
          <Button
            type="button"
            variant="secondary"
            onClick={uploadManual}
            disabled={busy || fps === 'reading'}
          >
            {stage.kind === 'manual'
              ? stage.percent == null
                ? '저장하는 중…'
                : `클립 올리는 중 ${stage.percent}%`
              : '수기 값으로 올리기'}
          </Button>
        )}
        {stage.kind === 'saving' && (
          <span className="text-sm text-muted">
            {stage.percent == null
              ? '저장하는 중…'
              : `클립 올리는 중 ${stage.percent}%`}
          </span>
        )}
      </div>

      {stage.kind === 'analyzing' && (
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-sky transition-[width] duration-200"
            style={{ width: `${Math.round(stage.ratio * 100)}%` }}
          />
        </div>
      )}

      {result && <ResultCard result={result} />}

      {stage.kind === 'saved' && (
        <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink">
          저장했어요 —{' '}
          <Link
            href={`/admin/velocity?at=${stage.date}`}
            onClick={() => onOpenSaved?.()}
            className="font-semibold text-sky"
          >
            {stage.date} 폴더 열기
          </Link>
        </p>
      )}
    </div>
  );
}

function ResultCard({ result }: { result: AnalyzeResult }) {
  const m = result.measure;
  if (!m.ok) {
    return (
      <div className="rounded-2xl border border-warn-line bg-warn-bg p-(--block-pad)">
        <p className="text-sm font-semibold text-warn">{m.message}</p>
        <p className="mt-1 text-xs leading-relaxed text-warn">{m.fix}</p>
        <p className="mt-2 text-xs text-muted">
          프레임 {result.frameCount} · fps{' '}
          {result.fps == null ? '—' : Math.round(result.fps)} · 흔들림 {result.shakePx}
          px · 초점거리 {result.focalPx}px
        </p>
      </div>
    );
  }
  const tiles = [
    { label: '카메라(구간 평균)', value: `${m.kmh}`, unit: 'km/h' },
    {
      label: '릴리스 추정',
      value: result.release ? `${result.release.releaseKmh}` : '—',
      unit: result.release ? 'km/h' : '',
    },
    { label: '오차 어림', value: `±${m.errorKmh}`, unit: 'km/h' },
    {
      label: '신뢰도',
      value: CONFIDENCE_TEXT[m.confidence as ConfidenceKey].replace('신뢰도 ', ''),
      unit: '',
    },
    { label: '프레임', value: `${m.detail.frames}`, unit: '장' },
    {
      label: 'fps',
      value: result.fps == null ? '—' : `${Math.round(result.fps)}`,
      unit: '',
    },
    { label: '맞음새', value: `${m.detail.fitQuality}`, unit: '' },
    { label: '날아간 구간', value: `${m.detail.travelM}`, unit: 'm' },
  ];
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
      {tiles.map((t) => (
        <div key={t.label} className="bg-surface px-4 py-3">
          <p className="text-xs text-muted">{t.label}</p>
          <p className="text-display mt-1 text-xl text-ink">
            {t.value}
            {t.unit && (
              <span className="ml-1 font-sans text-xs text-muted">{t.unit}</span>
            )}
          </p>
        </div>
      ))}
    </div>
  );
}
