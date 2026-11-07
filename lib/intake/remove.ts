/**
 * 저장소에서 지우고, 없어진 것을 본다 — 지웠다는 답만 믿지 않는다. 보유 삭제(purge.ts)와 임시 파일 정리(service.ts)가 같이 쓴다.
 * storage-core.ts 에 두면 service.ts 가 저장소 SDK 를 값으로 불러오게 되어 파일을 따로 뺐다.
 */
import { IntakeError } from '@/lib/intake/errors';
import type { IntakeStorage } from '@/lib/intake/storage-core';

type RemoveStorage = Pick<IntakeStorage, 'remove' | 'stat'>;

/** 지우고 남은 경로를 돌려준다. remove · stat 의 연결 실패는 그대로 던진다 — 지워졌는지 모르니 부르는 쪽이 아무것도 적으면 안 된다 */
export async function removeAndFindLeft(storage: RemoveStorage, paths: readonly string[]): Promise<string[]> {
  await storage.remove([...paths]);
  const left: string[] = [];
  for (const path of paths) if (await storage.stat(path)) left.push(path);
  return left;
}

/** 지웠다는 답이 왔는데 객체가 남았다 — 끝낼 수 있는 것을 다 적은 뒤 다시 돌게 던지는 오류 */
export const removeLeftObject = () => new IntakeError('storage_unavailable', { cause: 'remove_left_object' });
