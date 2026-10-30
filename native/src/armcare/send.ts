import { rpc } from '~/lib/rpc';
import type { NativeCheck } from './outbox';

/**
 * 암케어 체크 하나를 서버로 — 따라 하기 화면과 껍데기(앱을 켤 때 · 앞에 올 때)가 같이 쓴다. 대기열(./outbox.ts)과 따로 둔 까닭: 대기열은
 * node 시험(npm run native-outbox:test)에서 돌고, rpc 는 앱 부품(BullpenNative)을 부른다.
 * 해제 줄(undo — 보낸 뒤 푼 체크)은 같은 날 · 운동의 체크를 지운다(setExerciseDone false, 목록의 해제와 같은 길).
 */
export const sendCheck = (p: NativeCheck) =>
  p.undo
    ? rpc<{ ok: true } | { error: string }>('exercise-log.setExerciseDone', p.exerciseId, false, p.dateKey)
    : rpc<{ ok: true } | { error: string }>('exercise-log.markExerciseDone', p.exerciseId, p.dateKey);
