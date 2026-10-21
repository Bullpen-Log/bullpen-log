---
name: sinker-dugout-change-memo
description: 2026-10-21 개편 메모(금윤호 Claude → 김민 Claude) — 앱은 싱커, 웹은 덕아웃. 바뀐 것 · 주의 · 김민 몫 B-1~B-6
metadata:
  type: project
---

금윤호가 정한 개편(2026-10-21). 계획 전문은 `docs/designs/sinker-dugout.md`, 받은 뒤 할 일은 `HANDOFF.md` 의 10-21 글.

**Why:** 한 서버 · 한 계정에 얼굴이 셋이다 — 싱커(선수 앱, 지금 불펜로그 앱의 이름만 바뀜) · 덕아웃 웹(사이트 전체) · 덕아웃 앱(선수가 아닌 사람, 아직 없음).

**바뀐 것 (웹, 배포 0e6c50c9)**
- 사이트 이름 덕아웃, 앱 문구는 싱커. `/` 가 덕아웃 홈(앱 UA 면 /today · /login 그대로).
- 주소 뿌리화: `/dugout/*` → `/*`, `/master/*` → `/manage/*` (next.config 301).
- PC 선수 화면(/sinker, /today …)은 덕아웃 위 막대 아래에 들어감. 앱 웹뷰는 막대 없이 그대로.
- 덕아웃만 쓰는 회원(AccountType MEMBER). 첫 레슨 기록이 생기면 `sinkerStartedAt` 이 찍혀 싱커가 열림 (`lib/brand.ts usesSinker`).
- 코치 레슨 노트에 '한 일' 표 (`LessonNote.exercises` · `pitchCount` · `intensity`), 파서 `lib/org/lesson-work.ts`, 선수 쪽 읽기 `lib/org/lesson-feed.ts loadLessonFeed(userId)`.
- 알림: 표 `PushDevice` · `Notification`, 보내기 `lib/notify.ts notify()`, 보낼 앱 규칙 `lib/notify-rules.ts`. 채팅 · 장터 · 예약은 덕아웃 앱 먼저, 기록 · 레슨은 싱커 먼저.
- QR 로그인: PC `/login/qr` ↔ 폰 `/link/<8자>` (표 `LoginTicket`, 2분 한 번).
- 검색: robots · sitemap · 공유 미리보기. 도메인은 `NEXT_PUBLIC_SITE_URL` (lib/site-url.ts).

**주의 (이것을 어기면 앱이 깨짐)**
1. 번들 ID `com.bullpenlog.app` 과 UA `BullpenLogApp` 은 바꾸지 않는다. 바꾸면 사용자가 앱을 다시 받아야 한다.
2. 앱 웹뷰가 쓰는 선수 경로(/today · /videos · /hitting · /training · /nutrition …)는 지우지 않는다.
3. 앱이 /master 나 /dugout 을 열면 301 을 탄다. 앱 코드의 주소를 /manage 와 뿌리 주소로 옮긴다.
4. 받은 뒤 `npm ci` 와 `npx prisma generate` (qrcode 패키지 추가).
5. 마이그레이션 셋 세 개(20261021120000_sinker_dugout_account · 20261021150000_notifications · 20261021170000_login_ticket)는 공유 DB 에 이미 적용됨. 다시 돌릴 필요 없음.
6. (2026-10-21 뒤) 싱커의 커뮤니티 판을 걷었다 — 탭 · 메뉴의 '덕아웃'은 `/?dugout=1`(lib/nav.ts DUGOUT_HREF), 판 넘기기는 홈 · 투구 · 타격 셋. 커뮤니티 글은 덕아웃 `app/(dugout)/community`(주소 /community 그대로). 새 앱의 DEFAULT_TABS · `/community` 갈래 · 앱 커뮤니티 화면을 맞출 것(HANDOFF 맨 위 글).

**김민 몫 (B)**
- B-1 앱 표시 이름 · 아이콘 · 시작 화면 · 로그인 문구를 싱커로, 굽기. 번들 ID 그대로.
- B-2 하단 탭 '덕아웃' 유지, 더보기에 'PC 에서 관리하기' (QR 찍기 또는 코드 입력 → `/link/<코드>` 열기).
- B-3 트레이닝 엔진이 `lessonLoadOf(exercises, pitchCount)` 로 레슨 운동량을 그날 피로에 넣기. 앱 기록 달력 · 트레이닝 탭에 '레슨' 줄. 함수 모양이 안 맞으면 바꿔도 되니 금윤호 쪽에 알리기.
- B-4 expo-notifications 로 토큰을 받아 로그인 뒤 `push.registerPushDevice({ token, app: 'sinker', platform })` 호출, 해제는 `push.unregisterPushDevice({ token })`. 알림을 누르면 `data.link` 열기. 댓글 · 팀 공지 알림은 김민 화면에서 `notify()` 한 줄씩.
- B-5 덕아웃 앱 1판 (`native-dugout/`, 5단계 뒤). 범위: 로그인 · 가입 · 피드 · 장터 · 채팅 · 레슨 · 연습장 예약 · 내 정보.
- B-6 앱 전용 주소(`sinker://`, `dugout://`)와 유니버설 링크는 도메인이 생긴 뒤.

**물어볼 것 (김민과 금윤호 사이)**
- 싱커 굽기를 언제 할지.
- 덕아웃 앱과 커뮤니티 피드 개편을 누가 맡을지.
- B-3 함수 모양이 맞는지.

**Why 있는 규칙:** 앱은 사이트의 `/today` 등을 웹뷰로 그리므로 경로를 지우면 앱 화면이 빈다. 번들 ID는 App Store 의 같은 앱 식별자라 바꾸면 다른 앱이 된다.
