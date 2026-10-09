'use client';

import { useState, type ReactNode } from 'react';
import { Expand } from '@/components/expand';

/**
 * 입력하면 밑에 칸이 생기는 가입 화면(2026-10-09)의 칸 — 이름을 적으면 이메일 칸이, 생년월일을 고르면 성별이,
 * 키가 유효하면 몸무게가, 비밀번호가 8자를 넘으면 확인 칸이 펴진다.
 *
 * Expand(components/expand.tsx, 높이 300ms)를 감싸되 한 번 펴지면 다시 접히지 않는다. 위 칸을 지워 조건이 다시
 * 깨져도 아래 칸에 적던 것이 사라지면 안 되고, 칸이 접혔다 펴졌다 하면 눈이 치던 칸에서 떨어진다.
 *
 * 초점은 옮기지 않는다 — 사용자가 위 칸을 치는 중에 아래 칸이 펴지므로, 초점을 끌어오면 치던 글이 끊긴다.
 * 펴질 때 안쪽이 한 번 옅게 나타난다(animate-fade-in 160ms). Expand 도 높이와 함께 300ms 로 옅어지며 들어와 옅어지기가
 * 두 겹인데, 일부러 둔다 — 두 겹이 곱해져 글이 칸보다 한 박자 늦게 자리를 잡아, 칸이 먼저 펴지고 글이 그 안에 내려앉는
 * 것으로 보인다. 처음부터 open 이면(적어 둔 값으로 돌아온 때) 움직임 없이 바로 보인다 — Expand 도 처음 값은 전환 없이
 * 그린다.
 */
export function RevealField({
  open,
  children,
  className,
}: {
  open: boolean;
  children: ReactNode;
  className?: string;
}) {
  /* 한 번 펴진 적이 있는가 — 그리는 도중에 바로 올려서 펴지는 그림이 한 번 밀리지 않게(use-synced-text 와 같은 방식) */
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);
  /* 뜬 뒤에 펴진 것만 옅게 들어온다 — 처음부터 펴져 있던 칸은 그냥 보인다 */
  const [fades] = useState(!open);

  return (
    <Expand open={everOpened} className={className}>
      <div className={fades ? 'motion-safe:animate-fade-in' : undefined}>
        {children}
      </div>
    </Expand>
  );
}
