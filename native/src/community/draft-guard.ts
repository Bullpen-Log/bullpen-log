import { usePreventRemove } from 'expo-router';
import { Alert } from 'react-native';

/** 묻는 글 — leave 가 없으면 나가지 못하게만 알린다(저장하는 중) */
export type DraftGuardText = { title: string; message?: string; stay: string; leave?: string };

/**
 * 적던 글이 있으면 나가기 전에 묻는다(뒤로 쓸기 · ‹ 뒤로 · 닫기) — 글쓰기 · 댓글 · 문의 · 공지 · 운동 메모 · 암케어 루틴 만들기 등.
 * 저장한 뒤 화면을 바꿀 때는 돌려준 함수를 먼저 부른다(저장한 글이 '작성 중'으로 다시 묻지 않게).
 */
export function useDraftGuard(dirty: boolean, text?: DraftGuardText): () => void {
  return usePreventRemove(dirty, ({ repeat }) => {
    const t = text ?? { title: '작성 중인 내용이 있어요. 나갈까요?', stay: '계속 쓰기', leave: '나가기' };
    Alert.alert(t.title, t.message, [
      { text: t.stay, style: 'cancel' },
      ...(t.leave ? [{ text: t.leave, style: 'destructive' as const, onPress: repeat }] : []),
    ]);
  });
}
