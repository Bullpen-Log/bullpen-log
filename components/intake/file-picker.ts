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

/**
 * 원본 저장 안내 네 장 — 영상은 GPT05 가 개인정보를 가리고 소리 · 메타데이터를 뺀 파일만 쓴다(public/intake-guides/original-file-v1).
 * 영상이 없거나 못 틀어도 글만으로 따라 할 수 있게 쓴다.
 */
export const GUIDE_BASE = '/intake-guides/original-file-v1';
/** shape — 영상 모양. tall 은 세로 화면 녹화(590×1278), wide 는 메뉴를 크게 보이려고 잘라 낸 가로 영상(590×328) */
export type GuideChapter = { id: string; title: string; body: string; note?: string; video: string; poster: string; shape: 'tall' | 'wide' };
const media = (id: string, shape: 'tall' | 'wide' = 'tall') => ({ video: `${GUIDE_BASE}/${id}.mp4`, poster: `${GUIDE_BASE}/${id}.jpg`, shape });
export const GUIDE_CHAPTERS: readonly GuideChapter[] = [
  {
    id: '01-open-share',
    title: '사진에서 공유 열기',
    body: '사진 앱에서 촬영한 영상을 열고 공유 버튼을 누릅니다.',
    ...media('01-open-share'),
  },
  {
    id: '02-export-original',
    title: '무수정 원본 내보내기',
    body: '공유 목록을 아래로 내려 ‘무수정 원본 내보내기’를 누릅니다.',
    note: 'iOS 버전에 따라 ‘수정되지 않은 원본 내보내기’로 보일 수 있습니다.',
    ...media('02-export-original', 'wide'),
  },
  {
    id: '03-save-files',
    title: '파일 앱에 저장하기',
    body: '찾기 쉬운 폴더를 고르고 저장을 누릅니다. 저장한 위치를 기억해 둡니다.',
    note: 'iCloud Drive에 저장했다면 내려받기가 끝난 뒤 고릅니다.',
    ...media('03-save-files'),
  },
  {
    id: '04-pick-file',
    title: '접수 화면에서 파일 고르기',
    body: `이 화면으로 돌아와 ‘${PICK_LABEL}’을 누르고 저장한 영상(.MOV)을 고릅니다. 감지된 fps를 확인하고 다음으로 넘어갑니다.`,
    note: '미리 보기가 나오지 않아도 보낼 수 있습니다. 영상 속 접수 화면은 이전 모습이라 단추 이름이 다를 수 있습니다.',
    ...media('04-pick-file'),
  },
];
