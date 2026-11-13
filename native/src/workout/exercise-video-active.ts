import { createActiveRegistry } from '@/lib/exercise-video-state';

/** 앱 안에서 동시에 도는 운동영상은 하나 — 자체 영상(expo-video)과 YouTube(WebView) 모두 여기에 올린다(VP01). */
export const activeExerciseVideo = createActiveRegistry();

let seq = 0;
export function nextVideoId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}
