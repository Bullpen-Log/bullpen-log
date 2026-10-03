'use client';

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import { Camera, CameraOff, Loader2, ScanBarcode, X } from 'lucide-react';
import { ErrorLine } from '@/components/error-line';
import { buzz } from '@/lib/haptics';
import { cleanBarcode, expandUpcE } from '@/lib/nutrition/barcode';
import { canUseCamera, makeBarcodeReader } from '@/lib/nutrition/barcode-reader';
import type { Food } from '@/lib/nutrition/meta';

/**
 * 바코드로 담기(영양 로드맵 8번) — 음식 창의 찾는 칸 옆 단추로 연다.
 *
 * 카메라로 읽기는 브라우저의 BarcodeDetector(안드로이드 · 데스크톱 크롬 · 엣지), 없으면 ZXing(아이폰 사파리 · 아이폰 앱) —
 * lib/nutrition/barcode-reader.ts. 예전에는 아이폰에서 카메라 단추가 숨어 숫자만 적었다(2026-10-04 사용자: "카메라로 읽는
 * 기능이 무조건 필요하다"). 숫자를 적는 칸은 그대로 같이 있다(바코드가 구겨지거나 카메라를 허락하지 않은 때).
 *
 * 찾으면 다른 목록과 같은 음식 줄(renderFood — 양 고르기 · 담기 · ★)이, 못 찾으면 직접 입력 칸(renderCustom)이
 * 뜬다. 직접 적은 바코드 음식은 내 음식에 바코드째 저장되어 다음부터 읽자마자 나온다.
 */

type Look =
  | { kind: 'idle' }
  | { kind: 'loading'; code: string }
  | { kind: 'found'; code: string; food: Food; from: 'mine' | 'off' }
  | { kind: 'missing'; code: string; name: string }
  | { kind: 'error'; message: string };

/* 먹거리 포장에 찍히는 것 — EAN-13(한국 880…) · EAN-8 · UPC */
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

/** 물음 하나 — 앞 물음은 끊는다(카메라가 연달아 읽어도 마지막 것만) */
function startLookup(
  code: string,
  abortRef: RefObject<AbortController | null>,
  setLook: (look: Look) => void
) {
  abortRef.current?.abort();
  const ctrl = new AbortController();
  abortRef.current = ctrl;
  setLook({ kind: 'loading', code });
  fetch(`/api/nutrition/barcode?code=${code}`, { signal: ctrl.signal })
    .then((res) => res.json())
    .then(
      (body: {
        ok: boolean;
        error?: string;
        food?: Food | null;
        from?: 'mine' | 'off';
        name?: string | null;
      }) => {
        if (ctrl.signal.aborted) return;
        if (!body.ok) {
          setLook({ kind: 'error', message: body.error ?? '바코드를 찾지 못했어요.' });
        } else if (body.food) {
          setLook({ kind: 'found', code, food: body.food, from: body.from ?? 'off' });
        } else {
          setLook({ kind: 'missing', code, name: body.name ?? '' });
        }
      }
    )
    .catch(() => {
      if (ctrl.signal.aborted) return;
      setLook({
        kind: 'error',
        message: '바코드를 찾지 못했어요. 신호를 확인하고 다시 해 주세요.',
      });
    });
}

export function BarcodePanel({
  renderFood,
  renderCustom,
  onClose,
}: {
  /** 찾은 음식 한 줄(다른 목록과 같은 줄 — 양 · 담기 · ★) */
  renderFood: (food: Food) => ReactNode;
  /** 못 찾은 바코드의 직접 입력 칸 */
  renderCustom: (code: string, name: string) => ReactNode;
  onClose: () => void;
}) {
  const [typed, setTyped] = useState('');
  const [look, setLook] = useState<Look>({ kind: 'idle' });
  /* 카메라 — none: 카메라를 켤 수 없는 브라우저 · off · on · denied: 허락이 안 됨 */
  const [cam, setCam] = useState<'none' | 'off' | 'on' | 'denied'>(() =>
    canUseCamera() ? 'off' : 'none'
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  /* 카메라를 켜는 중(허락 창 · 켜지는 0.3~1초) — 두 번 눌러 스트림이 둘 생기지 않게 */
  const startingRef = useRef(false);
  /* 칸이 내려갔나 — 켜는 중에 닫히면 늦게 온 스트림을 바로 끈다(아무도 끄지 않아 표시등이 켜진 채 남았다) */
  const goneRef = useRef(false);

  /* 칸을 닫거나 창이 닫히면 카메라 · 물음을 멈춘다 */
  useEffect(() => {
    goneRef.current = false;
    return () => {
      goneRef.current = true;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      /* 끊을 것은 닫는 그때 진행 중인 물음(마지막 컨트롤러)이라 일부러 지금 값을 읽는다 */
      // eslint-disable-next-line react-hooks/exhaustive-deps
      abortRef.current?.abort();
    };
  }, []);

  /* 카메라가 켜지면 장면마다(0.2초) 읽는다 — 읽히면 떨고, 카메라를 끄고, 찾는다 */
  useEffect(() => {
    if (cam !== 'on') return;
    const video = videoRef.current;
    const stream = streamRef.current;
    if (!video || !stream) return;
    video.srcObject = stream;
    void video.play().catch(() => {});
    let stopped = false;
    let timer = 0;
    void (async () => {
      /* 브라우저 기능이 없으면 ZXing 을 이때 불러온다(못 불러오면 숫자 칸으로) */
      const detector = await makeBarcodeReader(FORMATS).catch(() => null);
      if (!detector) {
        if (!stopped) setCam('none');
        return;
      }
      const tick = async () => {
        if (stopped) return;
        if (video.readyState >= 2) {
          try {
            const found = await detector.detect(video);
            const code = found
              .map((b) =>
                b.format === 'upc_e'
                  ? (expandUpcE(b.rawValue) ?? cleanBarcode(b.rawValue))
                  : cleanBarcode(b.rawValue)
              )
              .find(Boolean);
            if (code && !stopped) {
              stopped = true;
              buzz(30);
              stream.getTracks().forEach((t) => t.stop());
              streamRef.current = null;
              setCam('off');
              setTyped(code);
              startLookup(code, abortRef, setLook);
              return;
            }
          } catch {
            /* 한 장을 못 읽어도 다음 장에서 */
          }
        }
        timer = window.setTimeout(tick, 200);
      };
      void tick();
    })();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
    };
  }, [cam]);

  async function startCamera() {
    if (startingRef.current || streamRef.current) return;
    startingRef.current = true;
    /* 앞 바코드의 조회가 아직 오는 중이면 끊는다 — 새로 비추는 카메라 밑에 옛 결과가 다시 뜨지 않게 */
    abortRef.current?.abort();
    setLook({ kind: 'idle' });
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      if (goneRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;
      setCam('on');
    } catch {
      if (!goneRef.current) setCam('denied');
    } finally {
      startingRef.current = false;
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCam('off');
  }

  function submit() {
    const code = cleanBarcode(typed);
    if (!code) {
      setLook({
        kind: 'error',
        message:
          '바코드 숫자가 맞지 않아요 — 막대 밑의 8 · 12 · 13자리 숫자를 그대로 적어 주세요.',
      });
      return;
    }
    stopCamera();
    startLookup(code, abortRef, setLook);
  }

  return (
    <section
      aria-label="바코드로 찾기"
      className="motion-safe:animate-fade-in space-y-3 rounded-xl border border-line p-3"
    >
      <div className="flex items-center gap-2">
        <ScanBarcode aria-hidden className="h-4 w-4 shrink-0 text-sky" />
        <h3 className="min-w-0 flex-1 text-sm font-semibold text-ink">바코드로 찾기</h3>
        <button
          type="button"
          onClick={onClose}
          aria-label="바코드 찾기 닫기"
          className="flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-2 hover:text-ink"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>

      {cam === 'on' && (
        <div className="motion-safe:animate-fade-in relative aspect-[4/3] overflow-hidden rounded-xl bg-black">
          <video
            ref={videoRef}
            muted
            playsInline
            autoPlay
            className="h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 top-1/2 h-24 -translate-y-1/2 rounded-lg border-2 border-white/80 shadow-[0_0_0_9999px_rgba(0,0,0,0.25)]"
          />
          <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white">
            바코드를 네모 안에 비춰 주세요
          </p>
        </div>
      )}

      {(cam === 'off' || cam === 'denied' || cam === 'on') && (
        <button
          type="button"
          onClick={cam === 'on' ? stopCamera : startCamera}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-line text-sm font-medium text-ink transition-colors hover:border-sky hover:text-sky"
        >
          {cam === 'on' ? (
            <>
              <CameraOff aria-hidden className="h-4 w-4" />
              카메라 끄기
            </>
          ) : (
            <>
              <Camera aria-hidden className="h-4 w-4" />
              카메라로 읽기
            </>
          )}
        </button>
      )}
      {cam === 'none' && (
        <p className="text-xs leading-relaxed text-muted">
          이 브라우저는 카메라를 켤 수 없어요. 막대 밑의 숫자를 적어 주세요.
        </p>
      )}
      {cam === 'denied' && (
        <p className="text-xs leading-relaxed text-muted">
          카메라를 쓸 수 없어요. 숫자를 적거나, 브라우저 설정에서 카메라를 허락해
          주세요.
        </p>
      )}

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex gap-2"
      >
        <label className="min-w-0 flex-1">
          <span className="sr-only">바코드 숫자</span>
          <input
            value={typed}
            onChange={(e) =>
              setTyped(e.target.value.replace(/[^\d]/g, '').slice(0, 14))
            }
            inputMode="numeric"
            enterKeyHint="search"
            placeholder="막대 밑 숫자 (예: 8801043014809)"
            className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5 text-sm tabular-nums text-ink placeholder:text-muted/60 transition-colors focus:border-sky focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={look.kind === 'loading'}
          className="shrink-0 rounded-xl bg-sky px-4 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-60"
        >
          찾기
        </button>
      </form>

      {look.kind === 'loading' && (
        <p className="flex items-center gap-2 text-xs text-muted" aria-live="polite">
          <Loader2 aria-hidden className="h-4 w-4 animate-spin" />
          {look.code} 찾는 중…
        </p>
      )}
      {look.kind === 'error' && <ErrorLine>{look.message}</ErrorLine>}
      {look.kind === 'found' && (
        <div key={look.code} className="motion-safe:animate-fade-in space-y-1.5">
          <p className="text-xs text-muted">
            {look.from === 'mine'
              ? '전에 적어 둔 바코드예요.'
              : '공개 자료(Open Food Facts)에서 찾았어요 — 이름 · 값이 포장과 다를 수 있어요.'}
          </p>
          <ul>{renderFood(look.food)}</ul>
        </div>
      )}
      {look.kind === 'missing' && (
        <div key={look.code} className="motion-safe:animate-fade-in space-y-2">
          <p className="text-sm font-medium text-ink">
            이 바코드는 아직 자료에 없어요.
          </p>
          <p className="text-xs leading-relaxed text-muted">
            포장지 뒷면의 영양 정보를 한 번 적어 두면, 다음부터 이 바코드를 읽자마자
            나와요.
          </p>
          {renderCustom(look.code, look.name)}
        </div>
      )}
    </section>
  );
}
