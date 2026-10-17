import { NativeModule, requireNativeModule } from 'expo';
import type { LibraryFile, LibraryStatus, LocalVideoFile, ReadChunk } from './LocalVideo.types';

declare class LocalVideoModule extends NativeModule {
  status(): Promise<{ version: number; access: 'authorized' }>;
  requestAccess(): Promise<{ access: 'authorized' }>;
  /** 조금씩 받을 임시 파일 */
  begin(options: { ext?: string }): Promise<{ token: string }>;
  /** data 는 base64 · 4MB 까지 */
  append(options: { token: string; data: string }): Promise<{ size: number }>;
  /** 앱 안 폴더로 옮김 → 영상 번호(UUID) */
  finish(options: { token: string }): Promise<{ id: string }>;
  /** 앱 임시 · 캐시 폴더의 파일(경로 또는 file:// 주소)을 복사 → 영상 번호 */
  saveFile(options: { path: string }): Promise<{ id: string }>;
  /** 없으면 code 'missing' */
  load(options: { id: string }): Promise<LocalVideoFile>;
  /** 재생기에 바로 넘길 file:// 주소 · 없으면 code 'missing' */
  fileUrl(options: { id: string }): Promise<{ url: string }>;
  read(options: { path: string; offset?: number; length?: number }): Promise<ReadChunk>;
  /** 읽기 끝(앱 안 영상은 지우지 않는다) */
  discard(options: { paths: string[] }): Promise<void>;
  exists(options: { ids: string[] }): Promise<{ found: string[] }>;
  remove(options: { ids: string[] }): Promise<void>;
  libraryStatus(): Promise<LibraryStatus>;
  /** 앱 안 → 받아 둔 것 순 · 없으면 code 'missing' */
  libraryLoad(options: { key: string }): Promise<LibraryFile>;
  /** https 주소에서 한 번 받아 둠(이미 있으면 그것) */
  libraryFetch(options: { key: string; url: string }): Promise<LibraryFile>;
  /** 받아 둔 것 중 keep 에 없는 것 지우기 */
  libraryPrune(options: { keep: string[] }): Promise<{ removed: number }>;
}

export const LocalVideo = requireNativeModule<LocalVideoModule>('LocalVideo');
