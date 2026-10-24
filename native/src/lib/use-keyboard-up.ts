import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/** 자판이 올라와 있나 — 바닥에 붙은 입력 칸이 자판 위에서 홈 막대 여백(inset.bottom)을 빼게(안 빼면 자판과 칸 사이가 떴다) */
export function useKeyboardUp(): boolean {
  const [up, setUp] = useState(false);
  useEffect(() => {
    const a = Keyboard.addListener('keyboardWillShow', () => setUp(true));
    const b = Keyboard.addListener('keyboardWillHide', () => setUp(false));
    return () => {
      a.remove();
      b.remove();
    };
  }, []);
  return up;
}
