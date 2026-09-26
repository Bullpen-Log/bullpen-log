'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { Modal } from '@/components/modal';
import { BodyMap3D, type BodyMapStatus, type BodyView } from '@/components/body-map-3d';
import { BODY_PART_MAP, isMappedBodyPart } from '@/lib/body-map';
import type { BodyPart } from '@/lib/exercise-meta';

/** 부위 창을 연다 — 그 운동의 부위들, 누른 부위, 누른 단추(창이 거기서 날아오게) */
type Open = (
  parts: readonly string[],
  current: string,
  e?: MouseEvent<HTMLElement>
) => void;

const BodyPartsContext = createContext<Open | null>(null);

/**
 * 부위 창을 여는 함수 — BodyPartsProvider 밖이면 null(그 화면의 부위는 글자로 둔다).
 */
export function useBodyParts() {
  return useContext(BodyPartsContext);
}

type Shown = { parts: BodyPart[]; current: BodyPart | 'all' };

/**
 * 운동의 부위 태그를 누르면 뜨는 창 — 전신 3D 에서 그 부위의 근육을 켜고 한두 줄 설명.
 *
 * 2026-09-26 사용자분: 암케어 운동처럼 다른 운동 영상에서도 키워드를 누르면 그 부위의
 * 그래픽이 보이게. 다른 운동에는 근육 이름이 없고 부위 태그(ExerciseVideo.bodyParts)만 있어
 * 부위 단위로 켠다(lib/body-map.ts). 그 운동의 부위가 여럿이면 창 위의 칩으로 오가고,
 * '모두'로 한꺼번에 본다 — 이 운동이 어디를 쓰는지 한 번에.
 *
 * 창은 하나만 둔다. 3D 는 창이 떠 있는 동안만 만든다(components/body-map-3d.tsx).
 */
export function BodyPartsProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Shown | null>(null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  const open = useCallback<Open>((parts, current, e) => {
    if (!isMappedBodyPart(current)) return;
    const r = e?.currentTarget.getBoundingClientRect();
    setOrigin(r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null);
    setShown({ parts: parts.filter(isMappedBodyPart), current });
  }, []);

  const title = !shown
    ? ''
    : shown.current === 'all'
      ? '이 운동이 쓰는 부위'
      : shown.current;
  const description = !shown
    ? undefined
    : shown.current === 'all'
      ? shown.parts.join(' · ')
      : BODY_PART_MAP[shown.current].muscles;

  return (
    <BodyPartsContext.Provider value={open}>
      {children}
      <Modal
        open={shown != null}
        onClose={() => setShown(null)}
        title={title}
        description={description}
        origin={origin}
      >
        {shown && (
          <BodyPartsView
            shown={shown}
            onChange={(current) => setShown({ ...shown, current })}
          />
        )}
      </Modal>
    </BodyPartsContext.Provider>
  );
}

function BodyPartsView({
  shown,
  onChange,
}: {
  shown: Shown;
  onChange: (current: BodyPart | 'all') => void;
}) {
  const [status, setStatus] = useState<BodyMapStatus>('loading');
  const { parts, current } = shown;
  /* 고른 부위(들) — 이름을 이어 붙인 글로 들고 있어야 그릴 때마다 새 목록이 안 생긴다 */
  const pickedKey = current === 'all' ? parts.join('|') : current;

  /* 켤 근육 — 고른 부위(들)의 근육을 겹치지 않게 */
  const keys = useMemo(() => {
    const picked = pickedKey.split('|') as BodyPart[];
    return [...new Set(picked.flatMap((p) => BODY_PART_MAP[p].keys))];
  }, [pickedKey]);
  /* 볼 쪽 — 한 부위면 그 부위의 쪽, 여럿이면 가장 많이 겹치는 쪽 */
  const view = useMemo<BodyView>(() => {
    const count = new Map<BodyView, number>();
    for (const p of pickedKey.split('|') as BodyPart[]) {
      const v = BODY_PART_MAP[p].view;
      count.set(v, (count.get(v) ?? 0) + 1);
    }
    return [...count.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'front';
  }, [pickedKey]);

  return (
    <div className="space-y-4">
      {parts.length > 1 && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="부위 고르기">
          {(['all', ...parts] as const).map((p) => {
            const on = current === p;
            return (
              <button
                key={p}
                type="button"
                aria-pressed={on}
                onClick={() => onChange(p)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${
                  on
                    ? 'border-sky bg-sky-tint text-sky-strong'
                    : 'border-line bg-surface text-muted hover:text-ink'
                }`}
              >
                {p === 'all' ? '모두' : p}
              </button>
            );
          })}
        </div>
      )}

      {status !== 'unavailable' && (
        <div className="h-[min(46vh,380px)] min-h-[260px] overflow-hidden rounded-2xl border border-line bg-gradient-to-b from-surface to-surface-2">
          <BodyMap3D keys={keys} view={view} onStatus={setStatus} />
        </div>
      )}

      {current === 'all' ? (
        <ul className="space-y-2 text-[14px] leading-relaxed break-keep text-ink/85">
          {parts.map((p) => (
            <li key={p}>
              <b className="font-semibold text-sky-strong">{p}</b>{' '}
              <span className="text-[13px] text-muted">{BODY_PART_MAP[p].muscles}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[14px] leading-relaxed break-keep text-ink/85">
          {BODY_PART_MAP[current].about}
        </p>
      )}
      <p className="text-[11px] text-muted">
        3D: Z-Anatomy · BodyParts3D ·{' '}
        <a
          href="https://creativecommons.org/licenses/by-sa/4.0/deed.ko"
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2"
        >
          CC BY-SA 4.0
        </a>{' '}
        ·{' '}
        <a
          href="/models/ATTRIBUTION.txt"
          target="_blank"
          className="underline underline-offset-2"
        >
          출처
        </a>
      </p>
    </div>
  );
}
