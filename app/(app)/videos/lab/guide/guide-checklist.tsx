'use client';

import { useSyncExternalStore } from 'react';
import { CheckCircle2, RotateCcw } from '@/components/icon';
import { ButtonLink } from '@/components/ui';
import { LAB_GUIDE_CHECKS } from '@/lib/pitch-lab-guide';

/**
 * 찍기 전 확인 — 현장에서 폰을 세우며 하나씩 누른다. 다 누르면 '영상 올리러 가기'.
 * 체크는 이 폰에만 남는다(localStorage — 다음 촬영 때 '다시'로 비운다). 저장이 막힌 곳(사생활 보호 창)이면 이 화면에 있는 동안만.
 */
const KEY = 'bullpen-lab-guide-checks';
const listeners = new Set<() => void>();
/** 읽은 값(undefined = 아직 안 읽음) — 저장이 막혀도 이 화면에서는 체크가 남게 */
let memory: string | null | undefined;

function snapshot(): string | null {
  if (memory === undefined) {
    try {
      memory = localStorage.getItem(KEY);
    } catch {
      memory = null;
    }
  }
  return memory;
}

function save(ids: string[]) {
  memory = JSON.stringify(ids);
  try {
    localStorage.setItem(KEY, memory);
  } catch {
    /* 저장이 막혔으면 이 화면에서만 */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    memory = undefined;
    listener();
  };
  listeners.add(listener);
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}

function parse(raw: string | null): Set<string> {
  if (!raw) return new Set();
  try {
    const v: unknown = JSON.parse(raw);
    return new Set(
      Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []
    );
  } catch {
    return new Set();
  }
}

export function GuideChecklist() {
  /* 서버 그림 · 첫 그림은 빈 체크(서버는 폰 저장소를 모른다) — 붙은 뒤 저장한 체크로 바뀐다 */
  const raw = useSyncExternalStore(subscribe, snapshot, () => null);
  const done = parse(raw);
  const count = LAB_GUIDE_CHECKS.filter((c) => done.has(c.id)).length;
  const all = count === LAB_GUIDE_CHECKS.length;

  const toggle = (id: string, on: boolean) => {
    const next = new Set(done);
    if (on) next.add(id);
    else next.delete(id);
    save(LAB_GUIDE_CHECKS.map((c) => c.id).filter((x) => next.has(x)));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted" aria-live="polite">
          <span className="text-numeric font-semibold text-ink">{count}</span> /{' '}
          {LAB_GUIDE_CHECKS.length} 확인
        </p>
        {count > 0 && (
          <button
            type="button"
            onClick={() => save([])}
            className="flex min-h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-sky"
          >
            <RotateCcw aria-hidden className="h-4 w-4" />
            다시
          </button>
        )}
      </div>
      <ul className="divide-y divide-line overflow-hidden rounded-2xl bg-ink/4">
        {LAB_GUIDE_CHECKS.map((c) => {
          const on = done.has(c.id);
          return (
            <li key={c.id}>
              <label className="flex min-h-14 cursor-pointer items-start gap-3 px-3 py-3">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => toggle(c.id, e.target.checked)}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded accent-sky"
                />
                <span className="min-w-0 space-y-0.5">
                  <span
                    className={`block text-sm font-semibold break-keep transition-colors ${on ? 'text-muted' : 'text-ink'}`}
                  >
                    {c.title}
                  </span>
                  <span className="block text-xs leading-relaxed break-keep text-muted">
                    {c.why}
                  </span>
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      {all && (
        <div className="flex flex-col gap-3 rounded-2xl bg-sky-tint px-4 py-3 motion-safe:animate-[fade-in_200ms_ease-out] sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-center gap-2 text-sm font-semibold text-sky">
            <CheckCircle2 aria-hidden className="h-5 w-5 shrink-0" />
            준비됐어요. 두 폰으로 같은 공을 찍어 올려 주세요.
          </p>
          <ButtonLink href="/videos/lab" className="shrink-0">
            영상 올리러 가기
          </ButtonLink>
        </div>
      )}
    </div>
  );
}
