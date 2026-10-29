import { useSyncExternalStore } from 'react';
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

/*
 * 비교할 B 고르기의 조건 — 비교 한 번(상세에서 [다른 영상과 비교]를 누른 때) 동안 이어진다: 처음엔 지금 목록 조건을 베끼고(startPickUi),
 * 비교 화면에서 B 를 다시 고를 때는 고르기에서 바꾼 조건 · 보던 자리 그대로. 목록(main)에는 옮기지 않는다.
 */
let pick: GalleryUi | null = null;
export function startPickUi() {
  pick = { ...main };
  anchors.pick = null;
  emit();
}

/** 보던 영상(경로) — 목록이 다시 그려지거나(고르기 → 맞추기 → 다시 고르기) 열 수 · 글자 크기가 바뀌어도 그 근처로 */
const anchors: Record<'main' | 'pick', string | null> = { main: null, pick: null };
export const galleryAnchor = (scope: 'main' | 'pick') => anchors[scope];
export const setGalleryAnchor = (scope: 'main' | 'pick', path: string | null) => {
  anchors[scope] = path;
};

export function useGalleryUi(scope: 'main' | 'pick'): [GalleryUi, (next: Partial<GalleryUi>) => void] {
  const snap = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => (scope === 'pick' ? (pick ?? main) : main)
  );
  return [
    snap,
    (next) => {
      if (scope === 'pick') pick = { ...(pick ?? main), ...next };
      else {
        main = { ...main, ...next };
        if (next.mode) void saveJson(MODE_KEY, next.mode);
      }
      emit();
    },
  ];
}

/** 로그아웃 — 앞사람의 검색어 · 조건 · 보던 자리를 지운다(보기 방식은 기기 선호라 둔다) */
export function resetGalleryUi() {
  main = { ...main, filter: EMPTY_VIDEO_FILTER, order: 'new' };
  pick = null;
  anchors.main = null;
  anchors.pick = null;
  emit();
}
