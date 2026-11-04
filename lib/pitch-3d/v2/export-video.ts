/** Encode rendered 3D frames locally. No source video, audio or account data is uploaded. */
export async function encodeAngleVideo(options: {
  source: HTMLCanvasElement;
  start: number;
  end: number;
  speed: number;
  draw: (time: number) => void;
  overlay?: (context: CanvasRenderingContext2D, width: number, height: number) => void;
  onProgress?: (progress: number) => void;
  signal?: AbortSignal;
}): Promise<Blob> {
  const { source, start, end, speed, draw, overlay, onProgress, signal } = options;
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || !Number.isFinite(speed) || speed <= 0) throw new Error('영상 길이를 확인하지 못했어요.');
  const duration = (end - start) / speed;
  if (duration > 60) throw new Error('영상이 너무 길어요. 재생 속도를 높인 뒤 다시 시도해 주세요.');
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 720 / Math.max(source.width, source.height));
  canvas.width = Math.max(2, Math.floor(source.width * scale / 2) * 2);
  canvas.height = Math.max(2, Math.floor(source.height * scale / 2) * 2);
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx || source.width < 2 || source.height < 2) throw new Error('3D 화면을 불러온 뒤 다시 시도해 주세요.');
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, canEncodeVideo } = await import('mediabunny');
  if (!(await canEncodeVideo('avc', { width: canvas.width, height: canvas.height, frameRate: 30 }))) throw new Error('이 기기에서는 영상 만들기를 지원하지 않아요.');
  const target = new BufferTarget();
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: 'in-memory' }), target });
  const video = new CanvasSource(canvas, { codec: 'avc', bitrate: 2_500_000 });
  output.addVideoTrack(video, { frameRate: 30 });
  try {
    await output.start();
    const count = Math.max(2, Math.ceil(duration * 30));
    for (let i = 0; i < count; i++) {
      if (signal?.aborted) throw new Error('영상 만들기를 취소했어요.');
      draw(Math.min(end, start + i / 30 * speed));
      // Read WebGL pixels immediately after rendering; the WebGL backbuffer is not preserved.
      ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
      overlay?.(ctx, canvas.width, canvas.height);
      await video.add(i / 30, 1 / 30);
      if (i % 10 === 0 || i === count - 1) onProgress?.((i + 1) / count);
    }
    if (signal?.aborted) throw new Error('영상 만들기를 취소했어요.');
    await output.finalize();
    if (!target.buffer || !target.buffer.byteLength || target.buffer.byteLength > 32 * 1024 * 1024) throw new Error('완성된 영상의 크기를 확인해 주세요.');
    return new Blob([target.buffer], { type: 'video/mp4' });
  } catch (error) {
    if (output.state !== 'finalized' && output.state !== 'canceled') await output.cancel().catch(() => undefined);
    throw error;
  }
}
