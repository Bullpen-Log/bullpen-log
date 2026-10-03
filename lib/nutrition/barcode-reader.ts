/**
 * 카메라 장면에서 바코드 읽기 — 바코드 칸(app/(app)/nutrition/barcode-panel.tsx)이 쓴다. 브라우저에서만 돈다.
 *
 * 브라우저에 BarcodeDetector 가 있으면(안드로이드 · 데스크톱 크롬 · 엣지) 그것을, 없으면(아이폰 사파리 · 아이폰 앱의 웹뷰)
 * ZXing(@zxing/library, 순수 JS)으로 같은 모양의 detect 를 만든다. 예전에는 BarcodeDetector 가 없으면 카메라 단추를 숨기고
 * 숫자만 적게 했는데, 사용자(2026-10-04): "아이폰에서 카메라로 읽게 하는 기능이 무조건 필요하다". ZXing 은 그 경우에만
 * 불러온다(import()) — 영양 화면을 여는 모든 사람이 받지 않게.
 */

export type BarcodeHit = { rawValue: string; format?: string };
export type BarcodeReader = {
  /** 지금 장면에서 읽힌 바코드 — 못 읽으면 빈 배열 */
  detect: (video: HTMLVideoElement) => Promise<BarcodeHit[]>;
  /** 어느 길로 읽나 — 'native' 브라우저 기능 · 'zxing' */
  kind: 'native' | 'zxing';
};

type NativeDetector = { detect: (source: HTMLVideoElement) => Promise<BarcodeHit[]> };
type NativeDetectorClass = {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats?: () => Promise<string[]>;
};

/** 카메라를 켤 수 있는 브라우저인가 — 읽기는 어느 쪽이든 된다 */
export function canUseCamera() {
  return (
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

/**
 * 읽개 하나를 만든다. formats 는 BarcodeDetector 이름(ean_13 · ean_8 · upc_a · upc_e).
 * 브라우저 기능이 있어도 그 형식을 하나도 못 읽으면 ZXing 으로 간다.
 */
export async function makeBarcodeReader(formats: string[]): Promise<BarcodeReader> {
  const Native = (window as unknown as { BarcodeDetector?: NativeDetectorClass })
    .BarcodeDetector;
  if (Native) {
    const supported =
      (await Native.getSupportedFormats?.().catch(() => null)) ?? formats;
    const usable = formats.filter((f) => supported.includes(f));
    if (usable.length > 0) {
      const detector = new Native({ formats: usable });
      return { kind: 'native', detect: (video) => detector.detect(video) };
    }
  }
  return makeZxingReader(formats);
}

/* ZXing 의 형식 이름 ↔ BarcodeDetector 이름 */
const ZX_NAMES = {
  EAN_13: 'ean_13',
  EAN_8: 'ean_8',
  UPC_A: 'upc_a',
  UPC_E: 'upc_e',
} as const;

/** 한 장의 긴 변을 이만큼으로 줄여 읽는다 — 1D 바코드는 이 정도면 충분하고 폰에서 한 장 20~40ms */
const MAX_SIDE = 960;

async function makeZxingReader(formats: string[]): Promise<BarcodeReader> {
  const zx = await import('@zxing/library');
  const wanted = (Object.keys(ZX_NAMES) as (keyof typeof ZX_NAMES)[])
    .filter((k) => formats.includes(ZX_NAMES[k]))
    .map((k) => zx.BarcodeFormat[k]);
  const hints = new Map<import('@zxing/library').DecodeHintType, unknown>([
    [zx.DecodeHintType.POSSIBLE_FORMATS, wanted],
    [zx.DecodeHintType.TRY_HARDER, true],
  ]);
  const reader = new zx.MultiFormatOneDReader(hints);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  let turn = 0;

  /** 캔버스에 그린 것을 흑백(휘도)으로 읽는다 */
  const decode = (w: number, h: number): BarcodeHit[] => {
    if (!ctx) return [];
    const rgba = ctx.getImageData(0, 0, w, h).data;
    const lum = new Uint8ClampedArray(w * h);
    for (let i = 0, j = 0; i < lum.length; i += 1, j += 4) {
      lum[i] = (rgba[j] * 77 + rgba[j + 1] * 150 + rgba[j + 2] * 29) >> 8;
    }
    try {
      const bitmap = new zx.BinaryBitmap(
        new zx.HybridBinarizer(new zx.RGBLuminanceSource(lum, w, h))
      );
      const found = reader.decode(bitmap, hints);
      const name = Object.entries(ZX_NAMES).find(
        ([k]) =>
          zx.BarcodeFormat[k as keyof typeof ZX_NAMES] === found.getBarcodeFormat()
      )?.[1];
      return [{ rawValue: found.getText(), format: name }];
    } catch {
      /* 못 읽음(NotFoundException 등) — 다음 장에서 */
      return [];
    } finally {
      reader.reset();
    }
  };

  return {
    kind: 'zxing',
    detect: async (video) => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (!ctx || !vw || !vh) return [];
      const scale = Math.min(1, MAX_SIDE / Math.max(vw, vh));
      turn += 1;
      if (turn % 3 !== 0) {
        /* 가운데 띠(세로 가운데 절반) — 화면의 네모 안내와 같은 자리. 막대가 세로로 선(가로로 놓인) 바코드 */
        const sy = Math.round(vh * 0.25);
        const sh = Math.round(vh * 0.5);
        const w = Math.round(vw * scale);
        const h = Math.round(sh * scale);
        canvas.width = w;
        canvas.height = h;
        ctx.drawImage(video, 0, sy, vw, sh, 0, 0, w, h);
        return decode(w, h);
      }
      /* 세 장에 한 번은 90° 돌려 장면 전체 — 바코드를 세로로 비춘 때 */
      const w = Math.round(vh * scale);
      const h = Math.round(vw * scale);
      canvas.width = w;
      canvas.height = h;
      ctx.save();
      ctx.translate(w, 0);
      ctx.rotate(Math.PI / 2);
      ctx.drawImage(video, 0, 0, vw, vh, 0, 0, h, w);
      ctx.restore();
      return decode(w, h);
    },
  };
}
