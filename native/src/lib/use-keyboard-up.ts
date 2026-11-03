import { useEffect, useState, type ComponentRef, type RefObject } from 'react';
import { Keyboard, LayoutAnimation, type View } from 'react-native';

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

/**
 * 자판이 이 칸을 가리는 높이(창 기준으로 재서) — 바닥 여백으로 쓴다.
 * RN KeyboardAvoidingView 는 칸의 onLayout y(부모 기준)와 자판 y(창 기준)를 견줘, 모달 시트 안에서는 시트 윗여백만큼 모자라
 * 바닥 저장 줄이 자판 밑에 깔렸다.
 */
export function useKeyboardPad(ref: RefObject<ComponentRef<typeof View> | null>): number {
  const [pad, setPad] = useState(0);
  useEffect(() => {
    const change = Keyboard.addListener('keyboardWillChangeFrame', (e) => {
      ref.current?.measureInWindow((_x, y, _w, h) => {
        if (e.duration) LayoutAnimation.configureNext({ duration: Math.max(10, e.duration), update: { type: 'keyboard' } });
        setPad(Math.max(0, y + h - e.endCoordinates.screenY));
      });
    });
    const hide = Keyboard.addListener('keyboardWillHide', () => setPad(0));
    return () => {
      change.remove();
      hide.remove();
    };
  }, [ref]);
  return pad;
}
