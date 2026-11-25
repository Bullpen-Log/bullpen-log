'use client';

import { Modal } from '@/components/modal';
import { armcareSwapOptions, replaceArmcareExercise } from '@/app/actions/armcare';
import { ARMCARE_SWAP_TABS, type ArmcareSwapRequest } from '@/lib/armcare/swap';
import { useArmcareSwap } from '@/lib/armcare/use-swap';
import type { PlayerItem } from './armcare-player';

export function ArmcareSwapSheet({ request, title, onDone, onClose }: {
  request: ArmcareSwapRequest;
  title: string;
  onDone: (item: PlayerItem) => void;
  onClose: () => void;
}) {
  const swap = useArmcareSwap(request, armcareSwapOptions, replaceArmcareExercise, onDone);
  return (
    <Modal open title="운동 교체" description={title} onClose={() => { if (!swap.changing.current) onClose(); }}>
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1" role="group" aria-label="운동 교체">
          {ARMCARE_SWAP_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              aria-pressed={swap.tab === tab.value}
              className="min-h-11 rounded-full text-sm font-semibold text-muted aria-pressed:bg-surface aria-pressed:text-ink"
              onClick={() => swap.setTab(tab.value)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {swap.tab === 'search' && (
          <input
            type="search"
            aria-label="암케어 운동 이름 검색"
            placeholder="암케어 운동 검색"
            value={swap.query}
            onChange={(event) => swap.setQuery(event.target.value)}
            className="min-h-12 w-full rounded-xl border border-line bg-surface px-3 text-base text-ink"
          />
        )}
        {swap.loadError ? (
          <div>
            <p className="text-sm text-muted">{swap.loadError}</p>
            <button type="button" className="min-h-11 font-semibold text-sky" onClick={swap.retry}>다시 불러오기</button>
          </div>
        ) : !swap.options && <p className="text-sm text-muted">운동 목록을 불러오는 중…</p>}
        {swap.error && <p role="alert" className="text-sm text-danger">{swap.error}</p>}
        {swap.options && swap.rows.length === 0 && (
          <p className="text-sm text-muted">
            {swap.tab === 'similar' ? '비슷한 운동이 없어요. 찾기에서 골라 주세요.' : '검색 결과가 없어요.'}
          </p>
        )}
        {swap.rows.map((pick) => (
          <div key={pick.id} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3">
            <div className="min-w-0 flex-1">
              <p className="font-semibold text-ink">{pick.title}</p>
              <p className="text-xs text-muted">{pick.detail}</p>
              {pick.prescription && <p className="text-xs text-muted">{pick.prescription}</p>}
            </div>
            <button
              type="button"
              disabled={swap.busyId != null}
              aria-label={pick.title + '으로 바꾸기'}
              onClick={() => void swap.choose(pick.id)}
              className="min-h-11 shrink-0 rounded-full bg-sky px-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {swap.busyId === pick.id ? '바꾸는 중…' : '바꾸기'}
            </button>
          </div>
        ))}
      </div>
    </Modal>
  );
}
