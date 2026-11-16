/**
 * 접수 파일 고르기 정책(INTAKE-FILE-GUIDE-R08) — 모든 접수 고르기 단추(처음 · 교체 · 고침 · 다시 보내기)가 이 한 곳을 쓴다.
 *
 * 아이폰 · 아이패드: accept 를 'application/octet-stream' 하나로 둔다. WebKit(WKFileUploadPanel.mm)은 accept 를 UTI 로 바꾸는데,
 * 이 MIME 은 UTType typeWithMIMEType 으로 public.data 가 되고, 이미지 · 영상(UTTypeImage · UTTypeMovie)을 따르지 않아
 * 사진 보관함 · 카메라 메뉴 없이 곧바로 파일(문서) 선택기를 연다. 영상은 public.data 를 따르므로 MOV · MP4 원본도 고를 수 있다.
 * video/* · .mov 를 함께 적으면 영상 UTI 가 생겨 사진 보관함 메뉴가 다시 열리므로 섞지 않는다. '*\/*' 는 WebKit 이 '제한 없음'(사진 포함)으로 읽어 쓰지 않는다.
 * 이것은 원본 출처의 증명이 아니라 고르는 길의 정책이다 — 파일 앱에 바뀐 파일을 넣어 두면 그대로 온다.
 * 형식 · 크기 · fps · 해시 · 같은 짝 검사는 그대로 바이트로 한다(lib/intake/media.ts · 서버).
 *
 * 그 밖(데스크톱 · 안드로이드): 예전 값 그대로 — 데스크톱은 파일 대화상자가 영상 파일만 보여 주고, 안드로이드는 실제 기기로 확인 전이라 바꾸지 않았다.
 * 정적 근거(소스 · 유형 시험)이지 실제 기기의 선택 창을 본 것이 아니다.
 */

/** 아이폰 · 아이패드의 문서 선택 accept — 영상 MIME · 확장자를 섞지 않는다 */
export const IOS_DOCUMENT_ACCEPT = 'application/octet-stream';
/** 데스크톱 · 안드로이드 — R08 전과 같다 */
export const DEFAULT_ACCEPT = 'video/*,.mov,.mp4,.m4v';

export type PickerEnv = { userAgent: string; maxTouchPoints?: number };

/** 아이폰 · 아이팟 · 아이패드(데스크톱 모드 아이패드는 'Macintosh' 이지만 터치 점이 여럿이다) */
export function isAppleTouch({ userAgent, maxTouchPoints = 0 }: PickerEnv): boolean {
  if (/\b(iPhone|iPad|iPod)\b/.test(userAgent)) return true;
  return /\bMacintosh\b/.test(userAgent) && maxTouchPoints > 1;
}

export function intakeAcceptFor(env: PickerEnv): string {
  return isAppleTouch(env) ? IOS_DOCUMENT_ACCEPT : DEFAULT_ACCEPT;
}

/** 지금 브라우저의 accept — 고르기 단추를 누를 때 읽는다(서버 렌더와 어긋나지 않게) */
export function currentIntakeAccept(): string {
  if (typeof navigator === 'undefined') return DEFAULT_ACCEPT;
  return intakeAcceptFor({ userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints });
}

/** 숨은 파일 칸을 연다 — accept 를 이 기기 값으로 먼저 바꾼 뒤 click 한다(순서가 바뀌면 아이폰이 사진 보관함 메뉴를 연다) */
export function openFilePicker(el: { accept: string; click(): void }, accept: string = currentIntakeAccept()) {
  el.accept = accept;
  el.click();
}

/** 고르기 단추 이름 — 안내 글도 이 이름을 그대로 쓴다 */
export const PICK_LABEL = '파일에서 원본 선택';
export const REPICK_LABEL = '파일에서 다른 원본 선택';

/** 고르기 전 한 줄 — 할 일을 말할 뿐, 원본 · 출처를 막거나 확인한다고 말하지 않는다(R08 검수) */
export const FILE_FIRST_NOTE = '사진 앱에서 ‘무수정 원본 내보내기’로 파일 앱에 저장한 뒤 선택해 주세요.';
/** 안내 열기 단추 */
export const GUIDE_OPEN_LABEL = '원본 저장 방법 보기';

/** 사용자가 나눠 녹화한 두 파트. 다운로드·전송 파일과 독립된 안내 자산이다. */
export const GUIDE_BASE = '/intake-guides/original-file-v5';
export type GuideChapter = { id: string; title: string; body: string; video: string; poster: string };
const media = (id: string) => ({ id, video: `${GUIDE_BASE}/${id}.mp4`, poster: `${GUIDE_BASE}/${id}.jpg` });
export const GUIDE_CHAPTERS: readonly GuideChapter[] = [
  {
    ...media('01-save-original'),
    title: '원본 저장',
    body: '공유 → 옵션에서 ‘모든 사진 데이터’를 켭니다. ‘무수정 원본 내보내기’로 파일 앱에 저장합니다.',
  },
  {
    ...media('02-select-file'),
    title: '파일 선택',
    body: `‘${PICK_LABEL}’을 눌러 저장한 영상을 고릅니다.`,
  },
];
