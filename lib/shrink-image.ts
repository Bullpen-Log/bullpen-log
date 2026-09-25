/**
 * 프로필 사진을 올리기 전에 브라우저에서 작게 줄여 JPG 로 바꾼다.
 *
 * 처음에는 원본을 그대로 올렸다(5MB 까지). 그랬더니 사진이 안 바뀌는 일이 생겼다.
 *   - 요즘 폰 사진은 5MB 를 쉽게 넘는다 → 올리기 전에 막혀 옛 사진으로 돌아갔다.
 *   - 아이폰의 HEIC 사진은 PC 크롬·엣지가 그리지 못한다 → 올라가도 빈 동그라미.
 * 화면에 나오는 사진은 가장 커도 80px(선명한 화면에서 160px)이라 원본이 필요 없다.
 * 줄이면 둘 다 없어지고, 사진이 뜨는 속도도 빨라진다.
 *
 * 회전: 폰 사진은 '돌려서 보라'는 표시(EXIF)만 달고 옆으로 누워 저장된다. 예전에
 * 브라우저에서 다시 그리면 이 표시가 사라져 사진이 눕는 기기가 있었다. 지금
 * 브라우저는 그림을 풀 때 그 표시대로 세워 준다 — createImageBitmap 에는
 * imageOrientation: 'from-image' 로 분명히 부탁한다.
 *
 * 브라우저에서만 쓴다(document·canvas 가 필요하다).
 */

/** 짧은 변을 이 길이(px)까지 줄인다. 동그라미는 짧은 변에 맞춰 잘리므로 이 변이 기준이다. */
const SHORT_SIDE_PX = 480;
const JPEG_QUALITY = 0.85;

/** 그림으로 풀 수 없는 파일 — 사람에게 보여 줄 말을 담는다 */
export class UnreadableImageError extends Error {}

type Decoded = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

async function decode(file: Blob): Promise<Decoded> {
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      close: () => bitmap.close(),
    };
  } catch {
    /* createImageBitmap 이 못 푸는 브라우저가 있다 — <img> 로 한 번 더 해 본다 */
  }

  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return {
      source: img,
      width: img.naturalWidth,
      height: img.naturalHeight,
      close: () => URL.revokeObjectURL(url),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new UnreadableImageError(
      '이 사진은 열 수 없습니다. JPG나 PNG 사진으로 골라주세요. (아이폰 HEIC 사진은 PC 에서 열리지 않을 수 있습니다)'
    );
  }
}

/** 사진 파일을 작은 JPG 로 바꾼다. 이미 작으면 크기는 그대로 두고 JPG 로만 바꾼다. */
export async function shrinkImage(file: Blob): Promise<Blob> {
  const image = await decode(file);
  try {
    if (!image.width || !image.height) {
      throw new UnreadableImageError('사진 크기를 읽지 못했습니다. 다른 사진으로 골라주세요.');
    }
    const scale = Math.min(1, SHORT_SIDE_PX / Math.min(image.width, image.height));
    const width = Math.max(1, Math.round(image.width * scale));
    const height = Math.max(1, Math.round(image.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('사진을 줄이지 못했습니다.');

    /* JPG 에는 투명한 곳이 없다. 비워 두면 투명한 PNG 의 바탕이 검게 나온다. */
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image.source, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY)
    );
    if (!blob) throw new Error('사진을 줄이지 못했습니다.');
    return blob;
  } finally {
    image.close();
  }
}
