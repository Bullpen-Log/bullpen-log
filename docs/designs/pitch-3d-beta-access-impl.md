# 출시 전 베타(투구 3D 만) — 구현 인계

2026-10-29 · 금윤호(Claude, 윤호 맥북) → 김민. 설계는 같은 폴더 `pitch-3d-beta-access-plan.md`(이 가지에 같이 올림), 원래 요청 프롬프트는 금윤호에게 있다.
**상태: 서버 쪽 뼈대만 됐다. 앱(native) 화면은 시작하지 않았다. 통합 시험 · 화면 확인 · 배포는 안 했다.** 가지 `beta-pitch3d-access` 에만 있고 main 에는 없다.

## 0. 사용자(금윤호)가 정한 것

- 베타에 여는 것: **투구 3D 분석 하나**. 스윙 3D 는 잠근다.
- 대표관리자(role ADMIN)만 베타 제한에서 빠진다. 계정 종류 MASTER 는 예외가 아니다(`isMasterUser` 를 쓰지 않는다). 역할 · 계정 종류는 바꾸지 않는다.
- 준관리자(MANAGER)는 일반 사용자와 같은 베타 화면 + 기존 권한 표(`lib/permissions.ts`)가 연 관리 업무만.
- **켜는 법: 서버 환경변수** `RELEASE_STAGE=restricted_beta`(Vercel 에 넣고 재배포). 비우면 정식 출시. 코드 기본값은 정식 출시라 이 가지를 main 에 합쳐도 그것만으로는 아무것도 안 잠긴다.
- **비로그인 공개 읽기(덕아웃 장터 · 커뮤니티 · 레슨 · 연습장 · 경기)는 베타에도 연다.** 로그인한 일반 · 준관리자에게는 덕아웃도 잠긴다.

## 1. 된 것(이 가지)

| 파일 | 한 일 |
| --- | --- |
| `lib/release-access.ts` (새, 순수) | 기능(Capability) 목록 · `decideAccess`(allowed / locked_beta / setup_required / permission_denied) · 경로→기능 표 `capabilityOfPath`(가장 구체적인 것 먼저, 세그먼트 경계, `?mode=abs` · `?view=armcare` 같은 쿼리) · 앱용 요약 `releaseAccessOf` · `accessAllowsPath`(요약이 없으면 덜 열린 쪽) · 관리 업무 예외(구속 측정=velocityAdmin, ABS=abs) |
| `lib/release-gate.ts` (새, server-only) | 실제로 막는 곳. `releaseStage()`(환경변수) · `allowFeature(cap)` · `allowAdmin(perm)` · `enforceRelease(user)` · `FeatureLockedError` · `runInGate` · `gateDenied` |
| `lib/release-ops.ts` (새, 순수) | RPC 동작(`<모듈>.<함수>`) → 기능 표. registry 의 모든 모듈을 분류 |
| `lib/dal.ts` | `getCurrentUser()` 가 사람을 읽은 직후 `enforceRelease` — **베타에 막는 한곳**. 관문 없이 읽는 `loadSessionUserUnchecked`(RPC 입구 전용). `requirePermission(perm)` 은 `allowAdmin(perm)` 을 먼저 |
| `proxy.ts` | 모든 요청에 `x-bp-entry`(page / action / api) · `x-bp-path` 를 덮어쓴다(손님이 보낸 값 무시). matcher 에 `/api/:path*` 추가(점 든 `/api/sinker/log.csv` 까지) |
| `app/api/rpc/[action]/route.ts` | 베타 제한 사람이면 몸 읽기 전에 표로 판정 → 403 `{error:'FEATURE_LOCKED_BETA', capability, policyVersion}`(관리 권한 없음은 `PERMISSION_DENIED`). 앱 판 `BETA_APP_API`(8) 밑이면 426(업데이트). 동작을 `runInGate` 로 감싸고, 동작이 막힘을 try/catch 로 삼켜도 403 으로 바꾼다 |
| `lib/app-api.ts` | `APP_API_LEVEL` 7 → 8, `BETA_APP_API = 8` |
| 서버 동작에 밝힘 줄 | 함수 맨 위 한 줄: `pitch-lab`(8) · `analysis-consent`(4) → `allowFeature('pitch3d')`, `auth` · `profile` · `login-ticket` → `'account'`, `push` · `app.loadAppMe` · `app.reportStorefront` → `'appInfra'`, `support` → `'support'`, `velocity` → `'velocity'`, `abs` → `'abs'`. 권한 헬퍼에 `allowAdmin`: `velocity-admin`(velocityAdmin) · `velocity-recording`(recording) · `shoot` · `app-shoot`(shoot) · `app-admin` `staff(perm)` |
| API 처리기 | `pitch-lab/upload-url` 은 `?sport` 로 가름(없음 · pitch → pitch3d, 그 밖 → swing3d — 잠긴 쪽). `library/upload-url` → `allowAdmin('shoot')`, `profile/avatar-url` → `'account'` |
| `app/actions/app.ts` | `loadAppMe` 가 `access: ReleaseAccess` 를 싣는다(앱 그리기용) |
| 투구 3D 첫 설정 | `pitch-lab.loadAppLabList` · `loadAppLabDetail` · 웹 `/videos/lab` · `/videos/lab/[id]` 가 **베타일 때만** 투구 첫 설정으로 안 보낸다(첫 설정 화면이 잠겨 있어 돌고 돈다). `pitchSetupAt` 은 안 채운다 |
| `app/(app)/layout.tsx` | 베타 제한 사람이면 `BetaAppLayout`: 탭 판(@home · @videos · @hitting) · 체크인 관문 · 대기열 보내기 · 알림 수 조회를 안 그리고, `/today` 는 베타 홈, MASTER 를 /manage 로 안 보냄 |
| `components/beta/beta-home.tsx` (새) | 웹 베타 홈: '베타 체험' · 투구 3D 카드(새 분석 시작 · 촬영 방법, 분석 중이면 진행 상황 먼저) · 내 분석 3건 · 준비 중인 기능 한 줄 |
| `lib/nav.ts` | `NavItem.lockReason`('setup' · 'beta') · `applyBetaLocks`(앱에 보내는 탭은 `keepHref`) · `betaGroups`. `applyLocks` 가 'setup' 을 단다 |
| `components/app-shell/expo-tabs.tsx` | 앱에 보내는 탭 · 메뉴에 `lockReason` 을 싣는다(옛 앱은 모르고 지나감) |
| `scripts/release-access-selftest.mts` (새) | 413개 통과 — 역할 × 기능, MASTER 섞인 역할, 경로 표, 앱 요약, 탭 잠금, registry 모듈 분류, 열린 동작의 밝힘 줄, 잠긴 모듈에 밝힘 줄이 없는지 |

확인: 웹 `tsc` 통과, 바뀐 파일 eslint 0. **정식 출시 상태(환경변수 없음)** 로 켠 개발 서버에서 `/` · `/login` · `/market` · `/privacy` · `/api/sim-offset` · RPC(비로그인 · 옛 판 426)가 예전과 같은 답. 베타를 켜고 실제 계정으로 돌린 것은 **없다**.

## 2. 관문이 판정하는 법(꼭 읽기)

사람을 읽는 한곳(`getCurrentUser`)에서 요청 종류별로:

- **화면(page, GET)**: `x-bp-path` 의 기능. 잠겼으면 `redirect('/today')`.
- **서버 동작(action, 화면 주소로 오는 POST)**: 그 화면 주소도 열려 있어야 하고(동작 뒤 다시 그리는 화면 때문), 동작이 `allowFeature`/`allowAdmin` 으로 밝혀야 한다.
- **RPC · API**: 동작 · 처리기가 밝혀야 한다. **안 밝힌 것은 막힌다(기본 거부).** 그래서 잠긴 기능 400여 함수는 고치지 않았다.
- 밝힘 줄은 **사람을 읽기 전**에(함수 맨 위). 웹 서버 동작은 감쌀 곳이 없어 `AsyncLocalStorage.enterWith` 로 그 실행에만 붙인다.
- `x-bp-entry` 가 없으면(proxy 를 안 거친 요청) 동작으로 본다(덜 열린 쪽).
- 정식 출시 · 대표관리자면 헤더도 안 읽고 지나간다.

알아 둘 것:
- 사람을 안 읽는 동작(공개 읽기: `auth.checkSignupEmail` · `org-report.verifyGuardianCode` · 덕아웃 공개 목록)은 관문을 안 거친다 — 비로그인에게 이미 열린 것.
- 잠긴 **API 처리기**(day-detail · nutrition · pitch-log · library video-url …)는 `FeatureLockedError` 를 못 잡아 **500** 으로 답한다(읽기 · 서명 · 쓰기 전에 막히긴 한다). 403 으로 바꾸려면 처리기마다 잡거나 `experimental.authInterrupts` + `forbidden()` 을 검토.
- `/api/pitch-log/upload-url` 은 투구 기록 · 내 영상 · 가져오기가 같이 쓴다 — 지금 밝힘 없음(베타 잠김). 준관리자 구속 업로드(앱 `admin/velocity/upload.tsx`)는 이 주소를 안 쓰고 `velocity.*` 동작을 쓴다(확인함).

## 3. 남은 일(차례대로)

### 3-1. 통합 시험(서버) — 반쯤 설계함
`scripts/mechanics-record-test.mjs` 처럼 `registerHooks` 로 모듈을 바꿔 실제 RPC 입구 · 실제 동작을 돌린다(운영 DB · GPU 없이).
- 바꿀 것: `server-only` · `next/headers`(`x-bp-entry` · `x-bp-path` 를 시험이 정함) · `next/navigation`(redirect 가 `NEXT_REDIRECT;…` digest) · `next/cache` · `lib/prisma.ts`(user.findUnique 만 답, 나머지 호출은 셈) · `lib/session.ts`(readSession) · `lib/clock-server.ts` · `lib/storage.ts` · `lib/pitch-3d/v2/gpu-client.ts`(startGpuJob 셈) · `app/api/rpc/registry.ts`(몇 모듈만).
- 꼭 볼 것: USER/MANAGER 의 잠긴 RPC 403 + DB 쓰기 · 서명 · GPU 0 · 옛 판 426 · `pitch-lab.*` 통과 · `swing-lab.*` 403 · `upload-url?sport=hit` 막힘 · 웹 서버 동작 직접 호출(entry action, 열린 화면 주소 + 잠긴 동작) 막힘 · 준관리자 `velocity-admin.*` 통과 · `app-admin.setAppUserRole` 거부 · ADMIN 통과 · `x-bp-entry` 없음 = 동작 취급.
- 함정: `enterWith` 가 시험의 다음 장면으로 새지 않게 장면마다 `AsyncLocalStorage.snapshot()` 으로 돌린다.

### 3-2. 웹 틀 확인
- `BetaAppLayout` 이 탭 판(@home · @videos · @hitting) props 를 안 그릴 때 **Next 가 그 판을 정말 안 돌리는지**(예전 홈 조회가 안 나가는지) `PRISMA_TIMING=1` 로 확인.
- `@modal`(투구 기록 팝업) · `loading.tsx` 뼈대가 베타에서 이상하지 않은지.
- 웹 결과 화면의 훈련 링크: `app/(app)/videos/lab/[id]/report-parts.tsx` 의 `RX_HREF`(`/training?view=mechanics…`) · `STEP_HREF` · 앱 `native/src/lab/report.tsx` 의 `goRx` · `goStep` — **베타면 '추천 훈련 보기' · 메카닉 진행 단추를 숨기고 '다시 찍기' · 촬영 안내만**. 드릴 이름 · 썸네일 · 횟수는 보고서의 일부라 둔다(드릴 영상 주소는 원래 안 받는다 — 라이브러리를 열 필요 없음).
- 웹 `lab-detail.tsx` 의 '‹' 가 `/videos/lab`, `/videos/lab` 의 '‹' 가 `/videos`(잠김 → 베타 홈으로 튕김) — 베타면 `/today` 로.

### 3-3. 앱(native) — 시작 안 함
- **정책 상태 저장소** `native/src/shell/release.ts`(새): `loadMe()`(`native/src/pitch/api.ts`)가 받은 `access` 를 { userId, policyVersion } 과 함께 저장(마지막 하나, 폰에도). 꺼진 망이면 같은 사람 · 같은 판의 저장값, 없으면 '모름'(= 막힌 쪽, `accessAllowsPath(null, …)`). 로그인 화면에 오면(`resetShell`) 지움. 앱 복귀 · 로그인 · 자정에 `askMe` 가 다시 묻는다(이미 있음).
- `native/src/app/index.tsx`:
  - 탭에 `accessAllowsPath(access, tab.href, 'native')` 로 잠김(사이트가 보낸 `lockReason:'beta'` 와 별개로 앱도 계산) → `pressTab` 에서 잠긴 칸은 이동 · 판 붙이기 없이 안내 토스트(`BETA_LOCK_TITLE` · `BETA_LOCK_BODY`, 되풀이 알림 금지).
  - 판 붙이기 `can[...]` 에 베타 잠김 반영(잠긴 판은 안 붙임 — 조회도 안 나감).
  - 홈 판: 베타면 `HomeTab` 대신 **`BetaHome`**(새 `native/src/home/beta-home.tsx`): 웹 베타 홈과 같은 차례, 지금 카드 · 글꼴 · 색(`usePalette` · `TYPE` · `community/parts` 의 `s`) 그대로, `pitch-lab.loadAppLabList('mine')` 로 내 분석 2~3건 · 진행 중 작업, 위 오른쪽 메뉴(☰ → /more) 유지.
  - `openNative` · `navTo`(푸시 누름 · web-nav) · `onShouldStart` 에 같은 판정.
  - `ownerKnown` → `drainQueues`(운동 세트 · 암케어 체크 · 영상) **베타면 보내지 않고 둔다**(지우지 않음). `spaceOwner`(팀 · 레슨장 공간) 베타면 안 부름.
- `native/src/app/_layout.tsx`: 주소가 바뀔 때 · 정책이 바뀔 때 지금 화면이 잠겼으면 `router.replace('/')` + 안내(딥링크 · 복원 · 열린 화면). 서버가 어차피 403 이라 자료는 안 나간다.
- `native/src/shell/tab-bar.tsx`: 잠긴 칸 자물쇠 + `accessibilityLabel` '…, 준비 중' + 힌트(흐림만으로 표시하지 않기). 지금은 `(설정 전)` 만 있음.
- `native/src/app/more.tsx`: 계정 · 고객센터 · 로그아웃 · 개인정보 + 준관리자는 관리 업무 진입(사이트 메뉴가 이미 거름), 잠긴 기능은 짧은 '준비 중' 묶음.
- `native/src/lib/rpc.ts`: 403 `FEATURE_LOCKED_BETA` → `RpcError(…, 'FEATURE_LOCKED_BETA')`, 대기열(`workout/outbox` · `armcare/outbox`)은 이 코드를 **다시 시도 · 지움 없이 멈춤**.
- `native/src/app/lab/index.tsx` 의 `Bar back="투구"` → 베타면 '홈'. 결과 화면 `RxCard` 에 `trainingOpen` 같은 값으로 위 3-2 처리.
- MASTER 계정의 앱: 웹 `/manage` 로 안 가게 되었으니(베타) 앱의 공간 덮개가 안 뜨는지 확인.
- `npm run native-api:test -- --update`(loadAppMe 모양에 `access` 가 늘었다), 앱 `tsc` · `expo lint`.

### 3-4. 문서 · 켜기
- 켜기: Vercel 환경변수 `RELEASE_STAGE=restricted_beta` → 재배포. **앱 JS(판 8)가 먼저 퍼진 뒤에 켤 것** — 옛 앱은 베타 사람에게 426(업데이트).
- 정식 출시 · 되돌리기: 변수 삭제 → 재배포. 역할 · 첫 설정 값 · 기록은 건드리지 않았으니 되돌릴 데이터 없음.
- 한계: 이미 받은 서명 주소는 만료(영상 재생 60분 등)까지 산다. 옛 앱의 폰 안 자료 · 오프라인 화면은 서버가 회수 못 한다. GPU 에 이미 들어간 작업은 끝까지 돈다(`checkPitch3dV2` 는 열림).

## 4. 시험 계정

운영 DB 라 시험 계정을 만들지 않았다. 베타를 켜고 USER · MANAGER 화면을 보려면 **김민 · 금윤호가 정한 시험 계정**이 필요하다(역할을 바꾸지 말 것). 그 전까지는 3-1 의 모의 시험으로 서버를 검증한다.
로컬에서 켜기: `.env.development.local` 에 `RELEASE_STAGE=restricted_beta`(커밋 안 됨) — 대표관리자 계정은 그대로 다 보인다.

## 5. 입구 목록(조사 결과 요약)

- RPC 모듈 72개 → `lib/release-ops.ts`(전부 분류, 시험이 지킴).
- API 처리기: 열림 — `pitch-lab/upload-url`(sport=pitch) · `profile/avatar-url` · `library/upload-url`(shoot 권한) · `app-update`(사람 안 읽음) · `sim-offset` · `session/clear` · `library/bundle`(빌드 열쇠). 잠김(사람을 읽으면 막힘) — `day-detail` · `nutrition/*` · `library/video-url` · `library/video-manifest` · `sinker/log.csv` · `market/upload-url` · `community/upload-url` · `pitch-log` 넷 · `pitch-log/upload-url` · `places`(로그인한 사람만; 비로그인 공개 읽기는 그대로).
- 웹 경로: `lib/release-access.ts` PATH_RULES. 앱 웹뷰 `/embed/lab/[id]` 는 투구 3D(열림) — 그 안의 서버 동작 `loadLabVideoShifts` 도 밝힘 있음.
- 투구 3D 가 쓰는 것(조사): RPC `pitch-lab.*`(목록 · 상세 · 저장 · 요청 · 상태 · 영상 시차 · 지우기) · `analysis-consent.*` · `/api/pitch-lab/upload-url` · `/embed/lab/[id]` · 정적 `/models/*`. 결과 보고서는 드릴 목록을 서버에서 읽어(라이브러리 캐시) 제목 · 썸네일만 보낸다.
