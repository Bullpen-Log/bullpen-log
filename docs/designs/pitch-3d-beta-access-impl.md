# 출시 전 베타(투구 3D 만) — 구현 기록

2026-10-29 · 금윤호(Claude, 윤호 맥북). 설계는 같은 폴더 `pitch-3d-beta-access-plan.md`.
**상태: 서버 · 웹 · 앱(native) 코드와 시험은 다 됐다. 베타를 켠 실제 계정 화면 확인 · 실기기 확인 · 배포는 안 했다.** 가지 `beta-pitch3d-access` 에만 있고 main 에는 없다.

## 0. 정한 것(금윤호)

- 베타에 여는 것: **투구 3D 분석 하나**. 스윙 3D 는 잠근다.
- 대표관리자(role ADMIN)만 베타 제한에서 빠진다. 계정 종류 MASTER 는 예외가 아니다(`isMasterUser` 안 씀). 역할 · 계정 종류 · 권한 표는 안 바꾼다.
- 준관리자(MANAGER)는 일반 사용자와 같은 베타 화면 + 기존 권한 표(`lib/permissions.ts`)가 연 관리 업무만(adminHome · shoot · velocityAdmin · recording · abs). dev3d · 대표 전용 도구는 없음.
- **켜는 법: 서버 환경변수** `RELEASE_STAGE=restricted_beta`. 비우면 정식 출시. 코드 기본값은 정식 출시 — main 에 합쳐도 그것만으로는 아무것도 안 잠긴다.
- **비로그인 공개 읽기(덕아웃 장터 · 커뮤니티 · 레슨 · 연습장 · 경기)는 베타에도 연다.** 로그인한 일반 · 준관리자에게는 덕아웃도 잠긴다.

## 1. 누가 무엇을 쓰나(베타 켬)

| 기능 | 일반(USER) · 일반+MASTER | 준관리자(MANAGER) | 대표관리자(ADMIN) | 비로그인 |
| --- | --- | --- | --- | --- |
| 베타 홈 · 계정 · 설정 · 내 정보 · 고객센터 · 약관 | ○ | ○ | 예전 홈 그대로 | 로그인 · 약관 |
| 투구 3D(목록 · 안내 · 고르기 · 키/손/조건/동의 · 올리기 · 저장 · 요청 · 상태 · 실패 · 다시 · 결과 · 이력 · 내 것 지우기) | ○ (첫 설정 요구 없음) | ○ | ○ | × (로그인으로) |
| 스윙 3D · 타격 · 선구안 | × | × | ○ | × |
| 투구 기록 · 구속 측정 · ABS | × | 구속 측정 · ABS 만 ○(기존 권한) | ○ | × |
| 트레이닝 · 암케어 · 메커니즘 · 영양 · 기록 · 분석 · 라이브러리 · 내 영상 · 체크인 · 달력 · 알림 | × | × | ○ | × |
| 덕아웃(장터 · 커뮤니티 · 채팅 · 레슨 · 연습장 · 경기) | × | × | ○ | 공개 읽기 ○ |
| 팀 · 레슨장(/manage · /org · 보호자 리포트) | × | × | ○ | 보호자 리포트(코드) 그대로 |
| 관리 업무 | × | adminHome · shoot · velocityAdmin · recording · abs | 전부 | × |

× 의 답: 화면 → 베타 홈(`/today`)으로, 서버 동작 · 앱 RPC → **HTTP 403 `{ ok:false, error:'FEATURE_LOCKED_BETA', capability, policyVersion }`**(관리 권한 없음은 `PERMISSION_DENIED`), 앱 → 안내 "아직 준비 중인 기능이에요. 지금은 투구 3D 분석을 체험해 주세요." 로그인 오류(401 · /login) · 업데이트 필요(426)와 섞이지 않는다.

## 2. 관문이 판정하는 법

사람을 읽는 한곳(`lib/dal.ts getCurrentUser`)에서 요청 종류별로(`proxy.ts` 가 모든 요청에 `x-bp-entry` · `x-bp-path` 를 덮어쓴다 — 손님 값 무시):

- **화면(page, GET)**: 주소의 기능(`lib/release-access.ts capabilityOfPath`, 가장 구체적인 것 먼저 · 세그먼트 경계 · `?mode=abs` · `?view=armcare` 같은 쿼리). 잠겼으면 `redirect('/today')`.
- **서버 동작(action, 화면 주소로 오는 POST)**: 그 화면 주소도 열려 있고, 동작이 함수 맨 위에서 `allowFeature(cap)` · `allowAdmin(perm)` 로 밝혀야 한다.
- **앱 RPC · API**: 동작 · 처리기가 밝혀야 한다. **안 밝힌 것은 막힌다(기본 거부)** — 잠긴 기능 400여 함수는 고치지 않았다. RPC 는 몸을 읽기 전에 표(`lib/release-ops.ts`, registry 72모듈 전부)로 한 번 더, 동작이 막힘을 삼켜도 입구가 403 으로 바꾼다.
- `x-bp-entry` 가 없으면 동작으로 본다(덜 열린 쪽). 정식 출시 · 대표관리자면 헤더도 안 읽는다.
- 병렬 경로 판(@home · @videos · @hitting): 베타 틀(`BetaAppLayout`)이 화면에 안 놓아도 Next 는 병렬 경로를 따로 그려 응답에 싣는다 — 판 맨 위 `betaPanelHidden()`(lib/dal.ts)으로 빠진다(예전 홈 · 투구 조회가 안 나감).

## 3. 된 것

### 서버 · 웹
| 파일 | 한 일 |
| --- | --- |
| `lib/release-access.ts`(새, 순수 — 웹 · 앱 같이) | 기능 목록 · `decideAccess`(allowed / locked_beta / setup_required / permission_denied) · 경로 표 · 앱 요약 `releaseAccessOf` · `accessAllowsPath`(요약 없으면 홈 · 계정 · 약관 · 더보기만) · 안내 글 · `RELEASE_POLICY_VERSION` |
| `lib/release-gate.ts`(새, server-only) | `releaseStage()` · `allowFeature` · `allowAdmin` · `enforceRelease` · `FeatureLockedError` · `runInGate` · `gateDenied` · `isRestrictedNow` |
| `lib/release-ops.ts`(새, 순수) | RPC 동작 → 기능 표 |
| `lib/dal.ts` | `getCurrentUser` = 읽고 판정. `loadSessionUserUnchecked`(RPC 입구 전용) · `betaPanelHidden` · `requirePermission` 이 `allowAdmin(perm)` 먼저 |
| `proxy.ts` | 머리 둘 · matcher 에 `/api/:path*` |
| `app/api/rpc/[action]/route.ts` | 표 판정 → 403 · 옛 앱(판 8 밑) 426 · `runInGate` |
| `lib/app-api.ts` | `APP_API_LEVEL` 8 · `BETA_APP_API` 8 |
| 서버 동작 밝힘 줄 | `pitch-lab` · `analysis-consent` → pitch3d, `auth` · `profile` · `login-ticket` → account, `push` · `app.loadAppMe` · `app.reportStorefront` → appInfra, `support` → support, `velocity` → velocity, `abs` → abs. 권한 헬퍼 `allowAdmin`: velocity-admin · velocity-recording · shoot · app-shoot · app-admin |
| API 처리기 | `pitch-lab/upload-url` 은 `?sport`(없음 · pitch → pitch3d, 그 밖 → swing3d), `library/upload-url` → shoot, `profile/avatar-url` → account |
| `app/actions/app.ts` | `loadAppMe` 가 `access` 를 싣는다 |
| 투구 3D 첫 설정 | 베타일 때만 투구 첫 설정으로 안 보낸다(`pitchSetupAt` 안 채움) |
| `app/(app)/layout.tsx` · `components/beta/beta-home.tsx` | 베타 틀(탭 판 · 체크인 관문 · 대기열 · 알림 없음, MASTER 를 /manage 로 안 보냄) · 웹 베타 홈 |
| `app/(app)/@home|@videos|@hitting/*` | 맨 위 `betaPanelHidden()` |
| `lib/nav.ts` · `expo-tabs.tsx` | `lockReason`('setup' · 'beta') · `applyBetaLocks` · `betaGroups` |
| 결과 화면(웹) | `report-parts.tsx RxCard trainingOpen` — 베타면 요소별 드릴 · 메커니즘 진행 단추 대신 "추천 훈련 화면은 준비 중이에요…"(다시 찍기 · 촬영 안내는 그대로), 목록 '‹' 는 홈 |

### 앱(native)
| 파일 | 한 일 |
| --- | --- |
| `native/src/shell/release.ts`(새) | 정책 저장소 — `loadMe` 의 `access` 를 { userId, policyVersion } 과 함께(폰에도 마지막 한 사람). 옛 서버(칸 없음) = 정식 출시, 깨진 값 = 모름. 꺼진 망이면 같은 판의 저장값, 없으면 모름 = 막힌 쪽. `useRelease` · `useReleaseDecided` · `canOpen` · `noticeLocked`(2.5초에 한 번) |
| `native/src/pitch/api.ts` | `loadMe` → `setReleaseFromMe` |
| `native/src/lib/rpc.ts` | 403 `FEATURE_LOCKED_BETA` → `RpcError(안내 글, 'FEATURE_LOCKED_BETA')` |
| `native/src/workout/outbox.ts` · `armcare/outbox.ts` | 그 오류는 'offline' 처럼 — **지우지 않고 남겨 둔다** |
| `native/src/home/beta-home.tsx`(새) | 베타 홈: '베타 체험' · "지금은 투구 3D 분석을 체험할 수 있어요." · 투구 3D 카드(새 분석 시작 · 촬영 방법, 분석 중이면 진행 상황 먼저) · 내 분석 3건 · 전체 보기 · '준비 중인 기능' 작은 묶음. 지금 홈의 위 막대 · 카드 · 글꼴 · 색 그대로 |
| `native/src/app/index.tsx` | 홈 판 = 베타면 `BetaHome`. 잠긴 탭은 자물쇠 + `lockReason:'beta'`, 누르면 안내만(판 · 웹 이동 · 서버 부름 없음). 잠긴 판은 붙이지 않음. `openNative` · `openWeb` · `goTab` · `navTo`(푸시 · 웹 링크 · 앱 화면 끝 이동) 같은 판정. `ownerKnown` 이 베타면 공간 · 대기열 보내기를 안 함. 로그아웃이면 정책 지움, 계정 묻기 실패면 저장값 → 없으면 막힌 쪽 |
| `native/src/app/_layout.tsx` | 정책이 정해진 뒤(서버 답 · 저장값 · 묻다 실패) 지금 화면이 잠겼으면 닫고 홈 + 안내 — 딥링크 · 알림 · 되살린 화면 · 뒤로 · 정책 바뀜. 묻는 중에는 안 닫는다(정식 출시 사용자의 알림 화면을 지키려고) |
| `native/src/shell/tab-bar.tsx` | `ShellTab.lockReason`, 베타 잠긴 칸은 렌즈를 안 옮기고 제자리, 읽어 주는 이름 '…, 준비 중' + 힌트 |
| `native/src/app/more.tsx` | 잠긴 칸 자물쇠 · '…, 준비 중' · 누르면 안내. 설정 · 내 정보 · 고객센터 · 관리 업무(권한대로) 열림. 공간 고르개 숨김 |
| `native/src/lab/report.tsx` · `app/lab/index.tsx` | 결과의 훈련 길 숨김(웹과 같은 글) · '‹ 홈' |

## 4. 시험

- `npm run release-access:test` — 477개: 역할 × 기능(MASTER 섞임 포함), 경로 표, 앱 요약, 앱 껍데기가 판정하는 주소(일반 · 준관리자 · 모름 · 대표 · 출시 · 옛 서버), 탭 잠금, registry 72모듈 분류, 열린 동작의 밝힘 줄 · 잠긴 모듈에 밝힘 줄 없음, `upload-url` sport, 판 맨 위 `betaPanelHidden`.
- `npm run release-gate:test` — 75개: 실제 RPC 입구 · 실제 서버 동작을 모의 DB · 저장소 · GPU 로 돌림(운영 DB · GPU 안 씀). 일반 잠긴 RPC 403 + 쓰기 · 서명 · GPU 0 · 사람 읽기만, 옛 판 426, 모르는 모듈 거부, 밝힘 없는 함수 거부, 삼킨 막힘도 403, 투구 3D 목록 · 요청 통과(GPU 0), 베타면 첫 설정 요구 없음, 일반+MASTER 제한, 준관리자 관리 업무 통과 · 역할 바꾸기 · 나라 바꾸기 거부, 대표 통과, 정식 출시 그대로, 웹 동작 직접 호출(잠긴 동작 · 열린 동작을 잠긴 주소로 · 머리 없음), 화면 이동, 비로그인, 판 숨김, `sport=hit` · 이상한 sport 서명 0.
- `npm run native-api:test` — `loadAppMe` 모양에 `access` 더함(--update).
- 웹 `tsc` · 앱 `tsc`(앱의 `expo-screen-orientation` · `expo-notifications` 없음 오류는 이 맥의 native 패키지가 덜 깔린 것 — 이 작업과 무관) · 바뀐 파일 lint.
- 정식 출시 상태(변수 없음) 개발 서버: `/` · `/login` · `/market` · `/privacy` · `/api/sim-offset` 200, `/today` · `/videos/lab` 비로그인 307, RPC 비로그인 정상, 서버 오류 0.

## 5. 못 한 것 · 알아 둘 것

- **베타를 켠 실제 USER · MANAGER 화면은 아무 기기에서도 안 봤다** — 운영 DB 라 시험 계정을 만들지 않았다(역할도 안 바꿈). 정한 시험 계정이 생기면 로컬 `.env.development.local` 에 `RELEASE_STAGE=restricted_beta`(커밋 안 됨)로 켜고 웹 375 · PC, 앱(TestFlight) 순서로 본다.
- **앱 화면은 시뮬레이터 · 실기기 모두 안 돌렸다**(2026-10 금윤호 규칙: 앱은 코드로만). 스크린숏 없음.
- 잠긴 **API 처리기**(day-detail · nutrition · pitch-log · library video-url …)는 막힐 때 403 이 아니라 **500** 으로 답한다. 읽기 · 서명 · 쓰기 전에 막히긴 한다. 403 으로 바꾸려면 처리기마다 잡거나 `experimental.authInterrupts` + `forbidden()`.
- 결과 보고서는 드릴 제목 · 썸네일을 그대로 보낸다(보고서의 일부 — 영상 주소는 안 보냄).
- 이미 받은 서명 주소는 만료(재생 60분 등)까지 산다. GPU 에 이미 들어간 작업은 끝까지 돈다(`checkPitch3dV2` 는 열림).
- 옛 앱(판 8 밑)은 회수 못 한다 — 베타 사람의 모든 RPC 에 426(업데이트)로 막힌다. 폰에 남은 오프라인 화면 · 자료는 서버가 못 지운다.
- 이 앱 판을 처음 깐 뒤 **한 번도 서버에 닿지 못한 채 꺼진 망에서 켜면**(저장된 정책 없음) 정식 출시 사용자도 잠깐 베타 화면을 본다 — "꺼진 망에서 다 열지 않는다" 규칙의 대가. 한 번 닿으면 저장값을 쓴다.
- 폰에 남은 운동 세트 · 암케어 체크 · 투구 영상은 베타 동안 보내지 않고 남는다. 암케어 체크는 7일 지나면 원래 규칙대로 버려진다.

## 6. 켜기 · 출시 · 되돌리기

1. 앱 JS(판 8)를 먼저 퍼뜨린다 — main 에 올리면 OTA 업데이트(3~5분). 바닥 코드는 안 바뀌어 굽지 않는다.
2. Vercel 환경변수 `RELEASE_STAGE=restricted_beta` → 재배포. 옛 앱의 베타 사람은 426(업데이트 안내).
3. 정식 출시 · 되돌리기: 변수를 지우고 재배포. 역할 · 첫 설정 값 · 기록 · 대기열은 건드리지 않았으니 되돌릴 데이터가 없다. 앱은 다음 `loadAppMe` 에서 released 를 받아 바로 다 연다.
4. 정책을 바꾸면 `RELEASE_POLICY_VERSION` 을 올린다 — 폰의 옛 저장값을 안 쓰게.

## 7. 입구 목록(조사 요약)

- RPC 모듈 72개 → `lib/release-ops.ts`(전부 분류, 시험이 지킴).
- API 처리기: 열림 — `pitch-lab/upload-url`(sport=pitch) · `profile/avatar-url` · `library/upload-url`(shoot) · `app-update` · `sim-offset` · `session/clear` · `library/bundle`(빌드 열쇠). 잠김 — `day-detail` · `nutrition/*` · `library/video-url` · `library/video-manifest` · `sinker/log.csv` · `market/upload-url` · `community/upload-url` · `pitch-log` 넷 · `pitch-log/upload-url` · `places`(로그인한 사람만).
- 웹 경로: `lib/release-access.ts` PATH_RULES. 앱 웹뷰 `/embed/lab/[id]` 는 투구 3D(열림).
- 투구 3D 가 쓰는 것: RPC `pitch-lab.*` · `analysis-consent.*` · `/api/pitch-lab/upload-url` · `/embed/lab/[id]` · 정적 `/models/*`.
