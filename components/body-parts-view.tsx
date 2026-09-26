'use client';

import { useMemo, useState } from 'react';
import { BodyMap3D, type BodyMapStatus, type BodyView } from '@/components/body-map-3d';
import { ModelCredit } from '@/components/model-credit';
import { Segmented } from '@/components/segmented';
import { BODY_PART_MAP } from '@/lib/body-map';
import type { BodyPart } from '@/lib/exercise-meta';
import type { BodyPartsShown } from '@/components/body-parts';

/**
 * 부위 창의 본문 — 부위 고르기, 전신 3D, 설명. 창을 처음 열 때 받아 온다
 * (components/body-parts.tsx 의 dynamic).
 */
export function BodyPartsView({
  shown,
  onChange,
}: {
  shown: BodyPartsShown;
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
  const options = useMemo(
    () => [
      { value: 'all' as const, label: '모두' },
      ...parts.map((p) => ({ value: p, label: p })),
    ],
    [parts]
  );

  return (
    <div className="space-y-4">
      {parts.length > 1 && (
        <Segmented
          label="부위 고르기"
          value={current}
          onChange={onChange}
          options={options}
          layout="flow"
          itemClassName="px-3 py-1"
        />
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
        <div className="space-y-1.5 text-[14px] leading-relaxed break-keep text-ink/85">
          <p className="text-xs font-semibold text-sky-strong">
            {BODY_PART_MAP[current].muscles}
          </p>
          <p>{BODY_PART_MAP[current].about}</p>
        </div>
      )}
      <ModelCredit />
    </div>
  );
}
