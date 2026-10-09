/**
 * 짧은 영상 컷 편집 — 찍은 영상을 앞뒤로 잘라 **소리 없는** MP4(H.264)로 만든다. 브라우저에서만(서버 · 앱 코드 없음).
 *
 * 왜 다시 만드나:
 * - 소리: 아이폰 카메라는 늘 소리를 같이 찍는다(웹 카메라 · 앱 카메라 모두). 결과에서 소리 트랙을 아예 뺀다.
 * - 자르기: 장면 단위로 정확히 자른다(키프레임에 맞추지 않음).
 * - 어디서나 재생: 아이폰 원본은 HEVC · HDR 이 많다 — 크롬(윈도 · 안드로이드)에서 안 나오거나 색이 바랜다. H.264 · 일반 색으로.
 * - 크기: 저장소 한 파일 50MB 안에 들게 긴 변 1920(길면 1280)으로(plan.ts pickTarget). 위치 정보 같은 꼬리표는 지운다.
 *
 * 다시 만들 수 없는 브라우저(영상을 못 풀거나 인코더가 없음)면 **잘라 붙이기**로 — 키프레임부터 복사하고 앞부분은
 * MP4 편집 목록(elst)으로 가린다. 소리는 그래도 빠진다. 화질은 원본 그대로, 코덱도 원본 그대로(HEVC 면 HEVC).
 *
 * mediabunny(MPL-2.0) 1.59.1 — 무거우니 편집 화면을 열 때 `await import('@/lib/clip/edit')` 로 불러온다.
 */
import {
  ALL_FORMATS,
  BlobSource,
  BufferTarget,
  CanvasSink,
  Conversion,
  ConversionCanceledError,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  canEncodeVideo,
  type ConversionOptions,
} from 'mediabunny';
import { CLIP_BUDGET_BYTES, clampTrim, pickTarget, type ClipInfo } from '@/lib/clip/plan';

export { ConversionCanceledError };

/** 영상 열기 — 파일을 통째로 메모리에 올리지 않고 필요한 곳만 읽는다(아이폰 메모리) */
function openInput(file: Blob): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

/** 영상 모양 읽기 — 영상 트랙이 없으면 'NO_VIDEO' 를 던진다 */
export async function probeClip(file: Blob): Promise<ClipInfo> {
  const input = openInput(file);
  try {
    return await probeInput(input, file.size);
  } finally {
    input.dispose();
  }
}

async function probeInput(input: Input, bytes: number): Promise<ClipInfo> {
  const v = await input.getPrimaryVideoTrack();
  if (!v) throw new Error('NO_VIDEO');
  const [duration, startTime, codec, width, height, rotation, hdr, canDecode, audio, stats] =
    await Promise.all([
      input.computeDuration(),
      v.getFirstTimestamp(),
      v.getCodec(),
      v.getDisplayWidth(),
      v.getDisplayHeight(),
      v.getRotation(),
      v.hasHighDynamicRange(),
      v.canDecode(),
      input.getPrimaryAudioTrack(),
      v.computePacketStats(90),
    ]);
  return {
    duration,
    startTime,
    codec,
    width,
    height,
    rotation,
    hdr,
    canDecode,
    hasAudio: !!audio,
    fps: stats.averagePacketRate,
    bytes,
  };
}

function toJpeg(canvas: HTMLCanvasElement | OffscreenCanvas, quality = 0.72): Promise<Blob> {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/jpeg', quality });
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('THUMB'))),
      'image/jpeg',
      quality
    )
  );
}

/**
 * 편집 띠의 작은 장면들 — 고르게 count 장. 하나 만들 때마다 내보낸다(띠가 왼쪽부터 차오른다).
 * 영상을 못 푸는 브라우저면 <video> 로 장면을 옮겨 가며 뽑는다.
 */
export async function* clipThumbnails(
  file: Blob,
  info: ClipInfo,
  count: number,
  height = 96
): AsyncGenerator<{ index: number; at: number; blob: Blob | null }> {
  const at = Array.from(
    { length: count },
    (_, i) => info.startTime + ((info.duration - info.startTime) * (i + 0.5)) / count
  );
  if (info.canDecode) {
    const input = openInput(file);
    try {
      const v = await input.getPrimaryVideoTrack();
      if (v) {
        const sink = new CanvasSink(v, { height, poolSize: 1 });
        let i = 0;
        for await (const wc of sink.canvasesAtTimestamps(at)) {
          // poolSize 1 — 다음 장면이 같은 캔버스를 쓰니 넘기기 전에 이미지로 굳힌다
          const blob = wc ? await toJpeg(wc.canvas) : null;
          yield { index: i, at: at[i], blob };
          i++;
        }
        return;
      }
    } catch {
      // 아래 <video> 길로
    } finally {
      input.dispose();
    }
  }
  yield* videoElementThumbs(file, at, height);
}

async function* videoElementThumbs(
  file: Blob,
  at: number[],
  height: number
): AsyncGenerator<{ index: number; at: number; blob: Blob | null }> {
  const url = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';
  video.src = url;
  try {
    const ok = await new Promise<boolean>((resolve) => {
      video.onloadeddata = () => resolve(true);
      video.onerror = () => resolve(false);
      setTimeout(() => resolve(false), 15_000);
    });
    if (!ok || !video.videoWidth) {
      for (let i = 0; i < at.length; i++) yield { index: i, at: at[i], blob: null };
      return;
    }
    const width = Math.round((height * video.videoWidth) / video.videoHeight);
    const canvas = Object.assign(document.createElement('canvas'), { width, height });
    const ctx = canvas.getContext('2d');
    for (let i = 0; i < at.length; i++) {
      const seeked = new Promise<void>((resolve) => {
        const done = () => resolve();
        video.addEventListener('seeked', done, { once: true });
        setTimeout(done, 3000);
      });
      video.currentTime = Math.min(Math.max(0, video.duration - 0.05), at[i]);
      await seeked;
      ctx?.drawImage(video, 0, 0, width, height);
      yield { index: i, at: at[i], blob: ctx ? await toJpeg(canvas) : null };
    }
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute('src');
    video.load();
  }
}

export type ExportedClip = {
  /** 소리 없는 MP4 — 이름은 늘 clip.mp4(저장소 경로의 확장자를 이름에서 딴다) */
  file: File;
  /** 'transcode' = H.264 로 다시 만듦 · 'copy' = 잘라 붙이기(원본 코덱) */
  path: 'transcode' | 'copy';
  width: number;
  height: number;
  /** 가로 ÷ 세로 — 라이브러리 영상 틀(lib/reference-video.ts videoFrameClass) */
  aspectRatio: number;
  /** 결과 길이(초) */
  duration: number;
  /** 다시 만들 때 쓴 비트레이트(비트 / 초) — 잘라 붙이기면 null */
  bitrate: number | null;
};

export type ExportOptions = {
  /** 0 ~ 1 · stage 'shrink' = 크기가 넘어 한 번 더 줄이는 중(진행이 0 부터 다시) */
  onProgress?: (p: number, stage: 'first' | 'shrink') => void;
  /** 시작 직전 상한(다시 만들 때) */
  maxBitrate?: number;
  signal?: AbortSignal;
  budgetBytes?: number;
  /** 시험용 — 다시 만들 수 있어도 잘라 붙이기로 */
  forceCopy?: boolean;
};

/**
 * [start, end] 구간을 소리 없이 내보낸다. 취소하면 ConversionCanceledError.
 * 실패하면 'CONVERSION_INVALID:<까닭>' · 'EMPTY_OUTPUT' · 'TOO_BIG'(줄여도 저장소 한 파일 상한을 넘음).
 *
 * 인코더는 목표 비트레이트를 조금 넘기곤 한다(키프레임 몫 — 15초 1080p 6Mbps 목표에 6.4Mbps). 결과가 예산을 넘으면
 * 넘은 만큼 낮춰 한 번 더 만든다.
 */
export async function exportMutedClip(
  file: Blob,
  range: { start: number; end: number },
  options: ExportOptions = {}
): Promise<ExportedClip> {
  const budget = options.budgetBytes ?? CLIP_BUDGET_BYTES;
  const report = options.onProgress;
  const first = await exportOnce(file, range, {
    ...options,
    budgetBytes: budget,
    onProgress: report ? (p) => report(p, 'first') : undefined,
  });
  if (first.file.size <= budget) return first;
  if (first.path === 'copy' || first.bitrate === null) throw new Error('TOO_BIG');
  // 실제로 쓴 비트레이트를 넘은 비율만큼 낮춘다(예산만 줄이면 상한 비트레이트가 그대로일 수 있다)
  const second = await exportOnce(file, range, {
    ...options,
    budgetBytes: budget,
    maxBitrate: Math.floor(first.bitrate * (budget / first.file.size) * 0.9),
    onProgress: report ? (p) => report(p, 'shrink') : undefined,
  });
  if (second.file.size > budget) throw new Error('TOO_BIG');
  return second;
}

async function exportOnce(
  file: Blob,
  range: { start: number; end: number },
  options: Omit<ExportOptions, 'onProgress'> & { onProgress?: (p: number) => void }
): Promise<ExportedClip> {
  const input = openInput(file);
  try {
    const info = await probeInput(input, file.size);
    const { start, end } = clampTrim(range.start, range.end, info.duration);
    const target = pickTarget(info, end - start, options.budgetBytes, options.maxBitrate);
    const quality = new Quality({ bitrate: target.bitrate });
    const canTranscode =
      !options.forceCopy &&
      info.canDecode &&
      typeof VideoEncoder !== 'undefined' &&
      (await canEncodeVideo('avc', {
        width: target.width,
        height: target.height,
        quality,
        frameRate: Math.round(info.fps) || undefined,
      }).catch(() => false));
    const path: ExportedClip['path'] = canTranscode ? 'transcode' : 'copy';

    const output = new Output({
      // moov 를 앞에 — 다 받기 전에 재생을 시작한다
      format: new Mp4OutputFormat({ fastStart: 'in-memory' }),
      target: new BufferTarget(),
    });
    const base: ConversionOptions = {
      input,
      output,
      tracks: 'primary',
      trim: { start, end },
      audio: { discard: true },
      // 아이폰 영상의 위치 · 기종 · 날짜 꼬리표를 남기지 않는다
      tags: {},
      showWarnings: false,
    };
    const conversionOptions: ConversionOptions =
      path === 'transcode'
        ? {
            ...base,
            copy: false,
            video: {
              codec: 'avc',
              quality,
              // 1초마다 키프레임 — 라이브러리에서 앞뒤로 옮길 때 바로 보인다
              keyFrameInterval: 1,
              // 한쪽만 준다(둘 다 주면 fit 이 있어야 한다)
              ...(target.scaled
                ? info.width >= info.height
                  ? { width: target.width }
                  : { height: target.height }
                : {}),
              // HDR 인데 크기를 안 바꾸면 그대로 넘어가 색이 바랜다 — 화면 전체 자르기로 캔버스에 다시 그리게 해 일반 색(sRGB)으로
              ...(info.hdr && !target.scaled
                ? { crop: { left: 0, top: 0, width: info.width, height: info.height } }
                : {}),
            },
          }
        : {
            ...base,
            copy: { mode: 'forced', boundaryPolicy: 'expand' },
            video: {},
          };

    const conversion = await Conversion.init(conversionOptions);
    if (!conversion.isValid) {
      throw new Error(
        'CONVERSION_INVALID:' + conversion.discardedTracks.map((d) => d.reason).join(',')
      );
    }
    conversion.onProgress = (p) => options.onProgress?.(Math.min(1, Math.max(0, p)));
    const abort = () => void conversion.cancel();
    if (options.signal?.aborted) await conversion.cancel();
    options.signal?.addEventListener('abort', abort, { once: true });
    try {
      await conversion.execute();
    } finally {
      options.signal?.removeEventListener('abort', abort);
    }
    const buffer = output.target.buffer;
    if (!buffer) throw new Error('EMPTY_OUTPUT');
    const outW = path === 'transcode' ? target.width : info.width;
    const outH = path === 'transcode' ? target.height : info.height;
    return {
      file: new File([buffer], 'clip.mp4', { type: 'video/mp4' }),
      path,
      width: outW,
      height: outH,
      aspectRatio: Math.round((outW / outH) * 1000) / 1000,
      duration: end - start,
      bitrate: path === 'transcode' ? target.bitrate : null,
    };
  } finally {
    input.dispose();
  }
}

/** 오류를 사람 말로 */
export function clipErrorText(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (msg === 'NO_VIDEO') return '영상 트랙이 없는 파일이에요.';
  if (msg.startsWith('CONVERSION_INVALID')) {
    return '이 영상은 이 폰에서 만들 수 없어요. 카메라 설정을 \'높은 호환성\'으로 바꾸고 다시 찍어 주세요.';
  }
  if (msg === 'EMPTY_OUTPUT') return '영상을 만들지 못했어요. 다시 해 주세요.';
  if (msg === 'TOO_BIG') return '영상이 너무 길어요(50MB 넘음). 더 짧게 잘라 주세요.';
  return '영상을 읽지 못했어요. 다시 찍거나 다른 영상을 골라 주세요.';
}
