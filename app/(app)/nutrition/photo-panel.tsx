'use client';

import { useRef, useState, type CSSProperties } from 'react';
import { Camera, Check, Loader2, Minus, Plus, X } from 'lucide-react';
import {
  amountText,
  kcalText,
  scaleMacros,
  sumMacros,
  type Food,
} from '@/lib/nutrition/meta';
import type { PhotoCandidate } from '@/lib/nutrition/photo-match';
import { josa } from '@/lib/korean';

/**
 * 사진으로 담기(영양 로드맵 7번) — 음식 창 맨 위. 밥 사진을 찍거나 고르면 AI 가 음식과 양을 알아보고(app/api/nutrition/photo),
 * 고른 것만 담는다. 확신이 낮은 것은 처음에 꺼 둔다. 사진은 서버에 남지 않는다(알아본 뒤 버린다).
 *
 * 사진은 폰에서 긴 변 1280px JPEG 로 줄여 보낸다 — 12MP 원본(4~8MB)은 느리고 서버의 몸통 상한에 걸린다. 1280px 면 반찬
 * 구분에 넉넉하다(Claude 는 1568px 넘는 사진을 어차피 줄인다).
 */

type Picked = PhotoCandidate & { on: boolean };
type State =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'done'; items: Picked[]; note: string; left: number | null };

const FROM_LABEL: Record<PhotoCandidate['from'], string> = {
  basic: '앱 음식 값',
  mfds: '식약처 값',
  ai: 'AI 짐작 값',
};

/* 양 −/+ — 1인분 밑은 ¼, 위는 ½ 단위(끼니 편집과 같은 걸음) */
function stepAmount(amount: number, dir: 1 | -1) {
  const size = amount < 1 || (amount === 1 && dir === -1) ? 0.25 : 0.5;
  return Math.min(10, Math.max(0.25, Math.round((amount + dir * size) / size) * size));
}

/** 사진 → 긴 변 1280px JPEG(base64, 머리 없이). 폰이 돌려 찍은 방향(EXIF)은 그대로 살린다 */
async function shrinkPhoto(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/jpeg', 0.82)
  );
  if (!blob) throw new Error('사진을 줄이지 못했어요');
  const url = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(',') + 1);
}

export function PhotoCapture({
  onAdd,
}: {
  /** 고른 것을 담는다 — 담기 창의 담기와 같은 길(저장 결과는 창이 아래 줄에 보인다) */
  onAdd: (items: { food: Food; amount: number }[], label: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function analyze(file: File) {
    setState({ kind: 'loading' });
    try {
      const image = await shrinkPhoto(file);
      const res = await fetch('/api/nutrition/photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image, mediaType: 'image/jpeg' }),
      });
      const data = (await res.json()) as
        | { ok: true; candidates: PhotoCandidate[]; note: string; left: number }
        | { ok: false; error: string };
      if (!data.ok) {
        setState({ kind: 'error', message: data.error });
        return;
      }
      if (data.candidates.length === 0) {
        setState({
          kind: 'error',
          message:
            '사진에서 음식을 찾지 못했어요. 음식이 잘 보이게 위에서 찍어 주세요.',
        });
        return;
      }
      setState({
        kind: 'done',
        items: data.candidates.map((c) => ({ ...c, on: c.confidence !== 'low' })),
        note: data.note,
        left: data.left,
      });
    } catch {
      setState({
        kind: 'error',
        message: '사진을 보내지 못했어요. 신호를 확인하고 다시 해 주세요.',
      });
    }
  }

  const pick = () => input.current?.click();
  const update = (key: string, patch: Partial<Picked>) =>
    setState((s) =>
      s.kind === 'done'
        ? { ...s, items: s.items.map((i) => (i.key === key ? { ...i, ...patch } : i)) }
        : s
    );

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/*"
      /* capture 를 두지 않는다 — 두면 아이폰이 카메라만 열어 앨범에서 고를 수 없었다.
         없으면 아이폰이 [사진 보관함 | 사진 찍기 | 파일 선택] 을 묻는다(2026-10-03) */
      className="sr-only"
      tabIndex={-1}
      aria-hidden
      onChange={(e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (file) void analyze(file);
      }}
    />
  );

  if (state.kind === 'idle') {
    return (
      <>
        {fileInput}
        <button
          type="button"
          onClick={pick}
          className="flex w-full items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3 text-left transition-colors hover:border-sky hover:bg-sky-tint/60"
        >
          <Camera aria-hidden className="h-4 w-4 shrink-0 text-sky" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium text-ink">사진으로 담기</span>
            <span className="block truncate text-xs text-muted">
              밥 사진을 찍거나 고르면 음식과 양을 알아봐요 · AI · 사진은 저장하지 않아요
            </span>
          </span>
        </button>
      </>
    );
  }

  if (state.kind === 'loading') {
    return (
      <div
        role="status"
        className="motion-safe:animate-fade-in flex items-center gap-3 rounded-xl border border-line bg-surface-2 px-4 py-3"
      >
        <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin text-sky" />
        <span className="min-w-0 flex-1 text-sm text-ink">
          사진에서 음식을 찾는 중이에요
          <span className="block text-xs text-muted">보통 5~15초 걸려요</span>
        </span>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div className="motion-safe:animate-fade-in space-y-2 rounded-xl border border-line bg-surface-2 px-4 py-3">
        {fileInput}
        <p role="alert" className="text-sm text-ink">
          {state.message}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={pick}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-sky px-4 text-sm font-semibold text-white transition-colors hover:bg-sky-strong desk:rounded-xl"
          >
            <Camera aria-hidden className="h-4 w-4" />
            다시 찍기
          </button>
          <button
            type="button"
            onClick={() => setState({ kind: 'idle' })}
            className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-medium text-muted transition-colors hover:bg-surface hover:text-ink desk:rounded-xl"
          >
            닫기
          </button>
        </div>
      </div>
    );
  }

  /* ── 찾은 음식 ── */
  const chosen = state.items.filter((i) => i.on);
  const total = sumMacros(chosen.map((i) => scaleMacros(i.food, i.amount)));
  return (
    <section
      aria-label="사진에서 찾은 음식"
      className="motion-safe:animate-fade-in space-y-2 rounded-xl border border-sky/30 bg-sky/5 px-3 py-3"
    >
      {fileInput}
      <div className="flex items-center gap-2 px-1">
        <p className="min-w-0 flex-1 text-sm font-semibold text-ink">
          사진에서 찾은 음식 {state.items.length}가지
        </p>
        <button
          type="button"
          onClick={() => setState({ kind: 'idle' })}
          aria-label="사진 결과 닫기"
          className="-mr-1 flex h-9 w-9 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface hover:text-ink"
        >
          <X aria-hidden className="h-4 w-4" />
        </button>
      </div>
      <ul>
        {state.items.map((item, i) => (
          <li
            key={item.key}
            className="motion-safe:animate-row-in flex min-h-12 items-center gap-2 py-1"
            style={{ '--row': i } as CSSProperties}
          >
            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={item.on}
                onChange={(e) => update(item.key, { on: e.target.checked })}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 border-line-strong text-white transition-colors peer-checked:border-sky peer-checked:bg-sky peer-focus-visible:ring-2 peer-focus-visible:ring-sky/40"
              >
                {item.on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className={`min-w-0 flex-1 ${item.on ? '' : 'opacity-50'}`}>
                <span className="block truncate text-sm text-ink">
                  {item.food.name}
                  {item.confidence === 'low' && (
                    <span className="ml-1.5 text-xs font-medium text-warn">
                      확실하지 않아요
                    </span>
                  )}
                </span>
                <span className="block truncate text-xs text-muted">
                  약 {item.grams}g · {FROM_LABEL[item.from]}
                  {item.from !== 'ai' && item.aiName !== item.food.name
                    ? ` · ‘${item.aiName}’${josa(item.aiName, '으로/로')} 봤어요`
                    : ''}
                </span>
              </span>
            </label>
            <div className="flex shrink-0 items-center rounded-xl border border-line bg-surface">
              <button
                type="button"
                onClick={() =>
                  update(item.key, { amount: stepAmount(item.amount, -1), on: true })
                }
                aria-label={`${item.food.name} 줄이기`}
                className="flex h-9 w-8 items-center justify-center rounded-l-xl text-muted transition-colors hover:text-ink"
              >
                <Minus aria-hidden className="h-3.5 w-3.5" />
              </button>
              <span className="min-w-[3rem] text-center text-xs font-semibold tabular-nums text-ink">
                {amountText(item.amount)}
              </span>
              <button
                type="button"
                onClick={() =>
                  update(item.key, { amount: stepAmount(item.amount, 1), on: true })
                }
                aria-label={`${item.food.name} 늘리기`}
                className="flex h-9 w-8 items-center justify-center rounded-r-xl text-muted transition-colors hover:text-ink"
              >
                <Plus aria-hidden className="h-3.5 w-3.5" />
              </button>
            </div>
          </li>
        ))}
      </ul>
      {state.note && <p className="px-1 text-xs text-muted">{state.note}</p>}
      <p className="px-1 text-xs text-muted">
        양은 짐작이라 담은 뒤 끼니의 &lsquo;편집&rsquo;에서 고칠 수 있어요.
        {state.left !== null && ` 오늘 ${state.left}번 더 쓸 수 있어요.`}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={chosen.length === 0}
          onClick={() => {
            onAdd(
              chosen.map((i) => ({ food: i.food, amount: i.amount })),
              `사진 ${chosen.length}가지`
            );
            setState({ kind: 'idle' });
          }}
          className="inline-flex min-h-11 flex-1 items-center justify-center rounded-full bg-sky px-4 text-sm font-semibold text-white transition-[background-color,opacity] hover:bg-sky-strong disabled:opacity-50 desk:rounded-xl"
        >
          고른 {chosen.length}가지 담기 · {kcalText(total.kcal)}kcal
        </button>
        <button
          type="button"
          onClick={pick}
          className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-sky transition-colors hover:bg-sky-tint desk:rounded-xl"
        >
          <Camera aria-hidden className="h-4 w-4" />
          다시 찍기
        </button>
      </div>
    </section>
  );
}
