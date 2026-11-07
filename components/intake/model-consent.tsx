'use client';

import { useState } from 'react';
import { FieldError, SecondaryButton } from '@/components/intake/shell';

/**
 * 모델 개발 이용 동의 거두기 — 동의 글이 '언제든 철회'를 약속하니, 받는 사람이 닿을 수 있는 화면마다 둔다.
 * 거둔 뒤에는 칸이 사라지기 전에 거뒀다고 알린다. 접수와 분석은 그대로라 다른 화면으로 옮기지 않는다.
 */
export function ModelConsentPart({ granted, onWithdraw }: { granted: boolean; onWithdraw: () => Promise<void> }) {
  const [phase, setPhase] = useState<'idle' | 'ask' | 'busy' | 'failed' | 'done'>('idle');
  if (phase === 'done') {
    return (
      <p role="status" className="text-footnote leading-5 break-keep text-muted">
        모델 개발 이용 동의를 거뒀어요. 앞으로 모델 개발에 쓰지 않아요.
      </p>
    );
  }
  if (!granted) return null;
  return (
    <details className="rounded-2xl bg-surface px-(--block-pad) py-1 text-sm">
      <summary className="flex min-h-11 cursor-pointer items-center font-semibold text-ink">모델 개발 이용 동의</summary>
      <p className="pb-2 text-footnote leading-5 break-keep text-muted">동의를 거두면 앞으로 모델 개발에 쓰지 않아요. 접수와 분석은 그대로 진행돼요.</p>
      {phase === 'failed' && <FieldError>거두지 못했어요. 다시 시도해 주세요.</FieldError>}
      <div className="pb-2">
        <SecondaryButton
          disabled={phase === 'busy'}
          onClick={async () => {
            if (phase !== 'ask') return setPhase('ask');
            setPhase('busy');
            await onWithdraw().then(
              () => setPhase('done'),
              () => setPhase('failed'),
            );
          }}
        >
          {phase === 'ask' ? '한 번 더 누르면 동의를 거둬요' : '동의 거두기'}
        </SecondaryButton>
      </div>
    </details>
  );
}
