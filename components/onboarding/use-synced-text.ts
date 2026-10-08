'use client';

import { useState } from 'react';

/**
 * 숫자 칸의 글 — 바깥 값(계산값 · 단위를 바꾼 값)이 바뀌면 따라가고, 치는 동안(focused)에는 손대지 않는다.
 *
 * 칸을 완전히 통제(value=계산값)하면 지우고 다시 칠 수 없다 — "144" 를 지우는 순간 빈칸이 계산값 "144" 로 되돌아온다.
 * 통제를 안 하면(defaultValue) 단위를 바꿔도 칸의 숫자가 그대로다. 그래서 둘 사이: 글은 이 칸의 것이고,
 * 바깥 값이 바뀐 것을 그리는 동안 알아채 글을 바꿔 둔다(React 의 '그리는 동안 상태 보정' 방식).
 */
export function useSyncedText(external: string, focused: boolean) {
  const [text, setText] = useState(external);
  const [seen, setSeen] = useState(external);
  if (seen !== external) {
    setSeen(external);
    if (!focused) setText(external);
  }
  return [text, setText] as const;
}
