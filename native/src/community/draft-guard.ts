import { usePreventRemove } from 'expo-router';
import { Alert } from 'react-native';

/**
 * 적던 글이 있으면 나가기 전에 묻는다(뒤로 쓸기 · ‹ 뒤로 · 닫기) — 글쓰기 · 댓글 · 문의 · 공지 · 운동 메모 등.
 * 저장한 뒤 화면을 바꿀 때는 돌려준 함수를 먼저 부른다(저장한 글이 '작성 중'으로 다시 묻지 않게).
 */
export function useDraftGuard(dirty: boolean): () => void {
  return usePreventRemove(dirty, ({ repeat }) =>
    Alert.alert('작성 중인 내용이 있어요. 나갈까요?', undefined, [
      { text: '계속 쓰기', style: 'cancel' },
      { text: '나가기', style: 'destructive', onPress: repeat },
    ])
  );
}
