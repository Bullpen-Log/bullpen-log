import { useState, useSyncExternalStore } from 'react';
import { EMPTY_VIDEO_FILTER, type VideoFilter, type VideoOrder } from '@/lib/my-videos';
import { loadJson, saveJson } from '~/lib/store';

/**
 * 내 영상의 찾기 조건 · 정렬 · 보기 방식 — 화면 밖에 둔다. 목록 → 상세 → 뒤로, 상세 → 비교 → 다시 고르기에서 같은 조건이 이어진다.
 * - 'main' = 홈에서 연 목록(하나). 'pick' = 비교할 영상 고르기 — 지금 목록의 조건으로 시작하되, 고르며 바꾼 조건은 목록에 안 옮긴다
 *   (뒤로 돌아왔을 때 목록이 바뀌어 맨 위로 튀지 않게).
 * - 보기 방식(그리드 · 목록)만 폰에 남긴다(개인 정보 없음). 검색어 · 조건은 앱을 켠 동안만 — 로그아웃하면 지운다(다음 사람에게 안 보이게).
 */
export type ViewMode = 'grid' | 'list';
export type GalleryUi = { filter: VideoFilter; order: VideoOrder; mode: ViewMode };

const MODE_KEY = 'bullpen-my-videos:mode:v1';
let main: GalleryUi = { filter: EMPTY_VIDEO_FILTER, order: 'new', mode: 'grid' };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
void loadJson(MODE_KEY).then((v) => {
  if ((v === 'grid' || v === 'list') && v !== main.mode) {
    main = { ...main, mode: v };
    emit();
  }
});

export function useGalleryUi(scope: 'main' | 'pick'): [GalleryUi, (next: Partial<GalleryUi>) => void] {
  const shared = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => main
  );
  const [local, setLocal] = useState<GalleryUi>(() => main);
  if (scope === 'pick') return [local, (next) => setLocal((cur) => ({ ...cur, ...next }))];
  return [
    shared,
    (next) => {
      main = { ...main, ...next };
      if (next.mode) void saveJson(MODE_KEY, next.mode);
      emit();
    },
  ];
}

/** 로그아웃 — 앞사람의 검색어 · 조건을 지운다(보기 방식은 기기 선호라 둔다) */
export function resetGalleryUi() {
  main = { ...main, filter: EMPTY_VIDEO_FILTER, order: 'new' };
  emit();
}
