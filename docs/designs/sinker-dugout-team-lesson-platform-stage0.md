# 싱커 × 덕아웃 팀·레슨 통합 — 0단계 조사 · 대응표 · 1단계 첫 묶음 (2026-11-01, 금윤호 · Claude)

브리프 `sinker-dugout-team-lesson-platform-claude-prompt.md` · 계획 `-plan.md` 의 0단계(현행 조사 · 원본 지도 · 권한 표 · 요구사항 대응 · 옛 계약 충돌)와
1단계 가운데 **DB 변경 없이 되는 것**을 했다. 상태 표기: **됨**(코드 + 시험) · **확인**(코드로 확인만) · **제안**(설계만) · **막힘**(공유 DB · 사람 결정 필요).

## 0-1. 검토 교정(2026-11-01 `-review-2026-11-01.md` F01~F08 — DB 변경 없는 묶음)

| 항목 | 판정 | 한 것 | 증거 |
| --- | --- | --- | --- |
| F01 완료/취소 경합 | **고침** | `lib/org/booking-transitions.ts` — 모든 전이가 트랜잭션 안 조건부 갱신(이전 상태 · 주인 · 조직)으로 선점, 이긴 요청만 뒤따르는 일. 취소는 선점 뒤 트랜잭션 안에서 eventId 를 다시 읽는다(밖에서 읽은 값을 믿다 일정이 남던 것 — 이번 시험이 잡음). DONE 은 못 덮음 | org:test — 끝냄/취소 양 순서(행 잠금 흉내) · 끝냄/끝냄 · 끝난 예약에 늦은 취소 |
| F02 동일 예약 중복 확정 | **고침** | `confirmBookingTx` — REQUESTED→CONFIRMED 선점이 1줄일 때만 회원 · 시간표를 만들고 잇는다. 거절도 조건부. 늦은 확정은 conflict | org:test — 확정/확정 · 확정/취소 양 순서 · 확정/거절 · 취소된 것에 늦은 확정 · 선점 뒤 실패 되돌림 |
| F03 일반 계정의 조직 운영 진입 | **고침(코드 가입 · 공간 · 웹 관문) · 2차 G01~G03 뒤 '구현됨 · 실계정 미확인'** | `lib/org/join.ts` 스태프 코드를 계정 종류로 안 막음 · `loadMySpaces` 코치 조직을 조직 역할로 · `lib/org/access.ts requireOperator`(관리자 · 마스터 계정 · 어느 조직의 소유자/스태프 회원)로 (master) 틀 · 페이지 · 동작 전부 · 덕아웃 위 막대 '관리'는 `isOperator`. 개인 운동(내 싱커)은 계정 종류 그대로 | org:test 소스 검사. **로그인한 실제 계정 확인은 아직** |
| F04 위임 규칙 | **고침(규칙)** | `canGrant` — 소유자만, DELEGABLE 안(org.manage · permission.manage · 회계 · 내보내기 제외), 위임자도 그 업무를 할 수 있어야, 대상 집합 포함(`scopeCovers` — 범위는 순서가 아님, 사람 범위엔 대상 필수). `OrgGrant.targets` · `deny`. 저장은 아직(M-A) | org:test 7 |
| F05 조회 범위 분리 | **부분(앱 조회 넷 · 규칙 — 2차 G05 로 대상 술어 · 허용 목록 · 합계까지) · 웹 페이지 · 나머지 조회는 남음** | 권한 문맥 `lib/org/authz.ts orgAuthz`(역할 + grants(아직 빈 배열) → `can` · `lens`) + 순수 가리기 `lib/org/dto-scope.ts`(training · checkin · members 렌즈, 가린 것은 null/빈 배열 + `hidden` 표시 — 0 과 다르게). `loadOrgToday` · `loadOrgMembers` · `loadEventDetail` 이 답을 만든 뒤 렌즈로 거른다. 없는 소속을 STAFF 로 짐작하지 않음. 남은 것: 웹 마스터 페이지 · 다른 조회(일지 · 숙제 · 영상 주소) · 검색 · 알림 · 내보내기에 같은 렌즈 | org:test 16(일정만 · 명단만 · 묶음 코치 · 조직 코치를 서로 다른 주체로 — 목록 · 상세) |
| F06 예약 목록의 투구 기록 건수 | **고침** | `loadOrgBookings` · 예약 화면에서 뺌 | org:test 소스 |
| F07 수강권 없는 끝냄 | **고침** | 동작이 `{ ok, notice | error }` 를 돌려주고 `SafeForm` 이 보인다(차감 · 없이 끝남 · 이미 처리됨 · 상태 충돌). 수강권을 나중에 넣어도 지난 끝냄은 자동 차감하지 않는다(정정은 원장 M-C) | org:test 소스 · 화면 글은 `BOOKING_RESULT_TEXT` |
| F08 운동 ↔ 일정 잇기 | **2차 G04 로 다시 만듦(내구 대기열 · 판 번호 귀속 · 세트 차례) — 코드 + node 시험, 실기기 미확인** | `space-store.ts` — 돌아갈 곳(nav)과 기록 귀속(event)을 가르고, 귀속은 계정별 저장(`links`)에 넣어 서버가 받을 때까지 켤 때 · 앞으로 올 때 · 소속 확인 뒤 다시 보낸다. 서버 `linkMyWork` 는 멱등(이미 이은 세트 안 건드림). 권한 없음은 서버 답대로 빼고 개인 운동은 그대로 | 소스 검사. **실기기 · 오프라인 · 재시작 확인은 아직**. 원본 세션/세트 id 귀속은 안 함(since 시각 기준 그대로 — 더 좁히려면 세트 id 전달 필요) |

## 0-2. 2차 검토 교정(2026-11-01 `-review2-2026-11-01.md` G01~G05 — DB 변경 없는 묶음)

상태는 **구현**(코드)과 **검증된 동작**(어떤 시험이 무엇을 돌렸나)을 갈라 적는다. 실제 DB · 실기기 · 로그인한 브라우저 확인은 이번에도 없다.

| 항목 | 재현 | 고침 | 시험(실제 코드를 돌린 것) | 한계 |
| --- | --- | --- | --- | --- |
| G02 회원 전이가 역할을 안 봄 | org:test 가 `redeemInviteTx` · `confirmBookingTx` 를 메모리 트랜잭션으로 돌려 재현 — 고치기 전 코드는 LEFT STAFF 가 선수 코드로 ACTIVE STAFF 가 됐다 | **한 전이 표** `lib/org/membership-transitions.ts planMembership`(기존 역할 × 상태 × 들어오는 자격). 선수 자격(초대 · 레슨 등록)은 나간 코치 · 선수를 **PLAYER 로만** 되살림(코치 권한 안 돌아옴), 활동 중인 코치 · 소유자는 선수로 안 내림(role_conflict), 코치 임명은 STAFF 코드로만(활동 중인 선수 줄엔 못 더함 — role_conflict, 나간 코치 · 선수는 임명), 소유자 줄은 안 바꿈. `join.ts` · `booking-transitions.ts confirmBookingTx` · 웹 `org.ts joinAsStaff` · 가입 `auth.ts` 가 같은 길 | org:test 표 18칸 + 재현 6(LEFT STAFF+선수 코드 → PLAYER · 운영 효력 없음, 활동 코치+선수 코드 conflict, 활동 선수+코치 코드 conflict · 코드 안 씀, 나간 코치 재임명, 나간 소유자 conflict, 예약 확정 셋) — 효력은 `hasCapability(role,'roster.manage') && ACTIVE` 로 단언 | 선수 + 코치 한 사람(additive)은 M-A 뒤. 실제 DB 의 `orgMember.updateMany` 조건 갱신은 안 돌려 봄 |
| G03 한 번 쓰는 코드를 둘이 | 같은 시험이 두 사용자를 겹쳐 돌려 재현(고치기 전 둘 다 입장) | `redeemInviteTx` — 트랜잭션 안에서 초대를 다시 읽고(기한 · 역할 · 지워짐), STAFF · 자리 코드는 `orgInvite.updateMany({ id, orgId, role, usedAt: null, expiresAt: { gt: now } })` 바뀐 줄 1 일 때만, 자리는 `userId: null` 조건 갱신, 실패는 `MembershipConflict` 로 던져 차지까지 되돌림. 같은 사람 재시도는 'already'(제 줄). 선수 코드는 차지 없음(여럿). 답 `used · expired · role_conflict · conflict` | org:test — STAFF 코드 경합(1명만 · used) · 같은 사람 재시도 · 자리 경합 · 남이 이은 자리 conflict + 차지 되돌림 · 기한 만료 · 지운 코드 · 차지 뒤 동의 저장 실패 되돌림 · 선수 코드 둘 다 입장 | 진짜 동시성은 격리 DB 에서만(공유 DB 금지) — 안 함 |
| G01 코치 코드 수락 화면 없음 | `join-view.tsx` 의 `usable = … role === 'PLAYER'` 로 바로 보임 | 미리보기 계약 `lib/org/join-preview.ts invitePreview`(player · staff · already · role_conflict · master · used · expired, 재합류 표시) → 선수 등록 폼(공유 체크) / **코치 수락 폼**(조직 · 업무 목록 `roleCapabilities('STAFF')` · 동의 없음 · '코치로 들어가기') / 까닭 카드. `joinOrg` 가 코치면 `bp-org` 쿠키 + `?as=staff` → '관리로 가기(/manage)' · 싱커 공간 새로 받기 안내. `CopyJoinLink` 는 `/teams/join?code=`(옛 `/join` 도 같은 본문), 앱 `org/join.tsx` 는 서버가 준 자격으로 공간을 연다 | org:test — 역할 픽스처 11(일반 계정 + STAFF 코드 → staff 등) + 소스(코치 폼에 `joinOrg` · 체크박스 없음 · 선수 폼에만 체크박스 · 쿠키 · 링크 · 앱 자격) | **렌더링 · 실제 수락 동작은 안 돌림**(서버 컴포넌트 + 운영 DB 로그인 필요). 화면은 코드 + 모델 시험으로만 |
| G04 귀속이 메모리 · linked:0 에 뺌 · since 범위 | 리뷰 지적 그대로(코드 읽기) | `native/src/org/link-queue.ts`(주입식, RN 무관) — **활동 시작 때** 폰에 적음(`startLinkedWorkout` 이 저장을 기다림), 운동 판이 열리면 판 번호(`bindLinkSession`), 서버엔 `sessionId` 로(그 판의 세트만 — `linkMyWork` 4번째 인자), 세트 대기열(`onSent`)이 비어야 뺌(`waiting`), 활동 중(`active`)은 보내되 안 뺌, 거절은 `rejected` 로 남겨 화면 · 지우기, 저장 실패는 `persistFailed`, 쓰기 차례 직렬, 계정 열쇠 + owner. 화면 `org/link-status.tsx`(선수 일정 탭 · 일정 하나) | `npm run native-link-queue:test` 47 — 재시작(나가기 전 · 뒤) · 세트보다 먼저 · 일부 도착 · 늦은/잃은 답 · 겹친 보내기 · 저장 거절 · 문맥 바뀜 · 계정 바뀜 · 거절/다시/지우기 · 7일 버림 | 실기기 · 실제 오프라인은 미확인. 서버 `linkMyWork` 는 소속 · 상태만 다시 본다(동의는 조회 때) |
| G05 부분 대상 새는 렌즈 | org:test 순수 재현(훈련 m1 만: 팀 합계 · m2 outingNote 가 남았다) | `lib/org/dto-scope.ts` — 렌즈에 대상 집합을 **타입으로**(members · trainingTargets · checkinTargets, self 는 실제 회원 줄 `orgAuthz` → `coachOrgCan.memberId`), 종류마다 술어(`seeMember · seeTraining · seeCheckin`), 회원 없는 합계(recorded · selfRecorded · issues · targets · 브리핑 work · 조 실제)는 대상이 조직 전체일 때만, 답은 **허용 목록으로 새로 만듦**(모르는 칸은 누구에게도 안 나감), `counts` 는 보이는 회원만(`visibleMembers`), `loadTeamTraining` 도 렌즈(`redactTrainingRows`). 앱 화면은 가린 값을 '비공개'로(`recorded ?? 0` 제거) + 가린 종류 한 줄(`HiddenNote`) | org:test 주체 7(코치 · 소유자 · 일정만 · 명단만 · 훈련 m1 · 좁은 명단+넓은 훈련 · 학부모 자녀 둘+공지 업무 · self) × 오늘 · 명단 · 상세 · 훈련 탭, 허용 목록 누설 3 | 지금 grants 는 빈 배열이라 실제 사용자에겐 아무것도 안 가린다(잠재 결함 수리). 일지 · 숙제 · 영상 · 웹 관리 페이지 · 검색 · 알림 · 내보내기는 **아직 넓다** — 위임 저장(M-A)을 잇기 전에 같은 렌즈 필요. 옛 설치본은 `recorded` 를 모르면 '0' 으로 그릴 수 있다(OTA 전까지 — 좁은 위임이 없어 지금은 안 생김) |

- 2차 검토의 '빈 갱신(data: {})은 행 잠금이 아니다': `finishBookingTx` 의 빈 갱신을 없애고 조직 조건을 `completeBookingTx` 의 CONFIRMED→DONE 조건부 갱신에 같이 걸었다(선점은 그 한 줄). 확정 · 거절 · 취소 조건부 전이는 그대로 두고 다시 돌렸다(org:test).
- 관문 시험 픽스처: 모의 `$queryRaw` · `groupBy` 가 0 · {} 을 돌려 홈 읽기가 'rows is not iterable' 로 깨지던 것을 배열로 — 이제 홈 읽기가 `ok: true` 를 돌려주는지 단언(release-gate 102).
- **남은 것(정확히)**: 알림의 커밋 뒤 내구성(확정 뒤 `notify` 가 실패해도 재시도 없음), 서로 다른 예약의 자리 용량, 변경 요청, 웹 관리 페이지 · 일지 · 숙제 · 영상 · 검색 · 알림 · 내보내기의 렌즈, 선수 + 코치 additive 모델(M-A), 코드 없는 가입 요청 → 승인, 실기기 · 로그인 화면 확인. 마이그레이션 결정(M-A~F)은 그대로 제안 — 이번 묶음은 적용하지 않았다.

## 0. 이번에 바꾼 코드(1단계 첫 묶음)

| 파일 | 한 일 | 시험 |
| --- | --- | --- |
| `lib/org/capabilities.ts`(새, 순수) | 조직 업무 권한 14개 · 범위 5개 · 역할 기본 묶음(소유자 전부 · 코치 운영/훈련 · 선수 일정 보기) · 위임 `OrgGrant` · `hasCapability` · `capabilityScope` · `canGrant`(소유자만 permission.manage, 제 범위 밖 못 줌). 기록 여는 권한 셋은 공유 동의와 교집합으로만 | org:test 9 |
| `lib/org/booking-complete.ts`(새) | 예약 끝냄 + 수강권 차감을 **조건부 갱신**으로(CONFIRMED→DONE 바뀐 줄 1일 때만 차감, `used < total` 조건부). 트랜잭션 클라이언트를 받는 함수라 모의로 겹침 시험 | org:test 6(두 요청 겹침 · 다섯 겹침 · 재시도 · 확정 전 · 다 쓴/기한 지난 건너뜀 · 수강권 없음) |
| `app/actions/lessons.ts finishBooking` | 위 함수로(브리프 알려진 문제 4) | 소스 검사 |
| `app/actions/lessons.ts cancelBooking` | 확정 때 만든 시간표 줄을 **지우지 않고** 예정(planned)인 것만 '취소'로. 실시(done)한 활동 · 일지 · 투구 기록 연결 보존(문제 5) | 소스 검사 |
| `lib/org/app-access.ts coachOrg` | 코치 판정에서 계정 종류(`isMasterUser`)를 뺌 — 조직 역할(OrgMember MASTER · STAFF, `orgsFor`)로(문제 1). 앱 동작 42곳이 이 함수를 쓴다 | 소스 검사, release-gate 98 그대로 |
| `scripts/org-selftest.mts` | 위 시험 + 옛 계약 검사 둘을 새 계약으로(차감 = 조건부 · 코치 = 조직 역할), 10-29 탭 바뀜 뒤 깨져 있던 검사 하나 고침 | 378 통과 |

**안 바뀐 것**: DB · 패키지 · 앱 화면 · 출시 단계(베타 기본값 — 팀 · 레슨 · 채팅 RPC 모듈은 `lib/release-ops.ts` 에서 `org` · `dugout` · `chat` 으로 분류돼 일반 · 준관리자에게 잠긴 그대로).

## 1. 원본(source of truth) 지도 — 코드로 확인

| 것 | 원본 표 · 파일 | 누가 쓰나 | 메모 |
| --- | --- | --- | --- |
| 계정 · 전역 역할 | `User.role`(ADMIN · MANAGER · USER) · `accountType`(PLAYER · MASTER · MEMBER), `lib/permissions.ts` | 서버 전부 | 조직 권한의 근거로 쓰지 않는다(1단계부터) |
| 조직 · 소속 | `Org` · `OrgMember(role MASTER/STAFF/PLAYER, status, @@unique[orgId,userId])` · `OrgInvite` | `lib/org/access.ts orgsFor/requireOrg`, `app-access.ts coachOrg/myMember` | 한 사람 한 조직에 한 줄 — 여러 업무는 위임(grants)으로 모델링해야 함(제안 M-A) |
| 공유 동의 | `ShareConsent`(6 범위, byUserId) · `lib/org/rules.ts memberScope/consentNone` | 코치 조회 전부 | 예약 확정 · 가입으로 자동 켜지지 않는다(유지). 누가 · 언제만 있고 **기간 · 보호자 권한**은 없음(제안 M-B) |
| 훈련 원본 | `TrainingSession` · `UserExerciseSet(enteredById, orgEventId)` · `PitchLog(enteredById, orgId/orgEventId)` · 3D `pitch-lab` 폴더 | `lib/org/team-work-store.ts writeOrgWork`, `team-session-store.ts` | 조직 훈련도 선수 그날 판에 세트로 — 복제 없음(유지). 멱등 키는 `workHash`(OrgEventAttendee)로 코치 쓰기만 |
| 팀 일정 · 계획 · 수행 | `OrgEvent(status planned/done/canceled, rosterAt)` · `OrgPlan` · `OrgEventAttendee(exception/values/workStatus…)` | `app/actions/org-calendar.ts` · `app-team.ts` · `org-record.ts` | `reply/attended` 칸은 2026-10-27 걷음(계약 11절) — 참석 재도입은 새 계약 필요 |
| 레슨 | `LessonBooking(status 문자열 5개)` · `LessonPass(total/used)` · `LessonNote(exercises, eventId)` · `OrgAssignment` | `app/actions/lessons.ts` · `org-notes.ts` · `app-lesson.ts` | 끝냄 · 차감 조건부(됨). 예약자 ≠ 실제 수강자 칸 없음(제안 M-C) |
| 보호자 | `GuardianReport(token+code, 30일)` | `app/(report)` · `org-report.ts` | 열람 링크일 뿐 로그인한 보호자-자녀 관계가 아님(제안 M-B) |
| 대화 | `Conversation(buyer/seller)` · `Message` | 장터 · `app/actions/chat.ts` | 1:1 전용 — 팀 방은 새 표(제안 M-D) |
| 출시 단계 | `lib/release-access.ts` · `release-gate.ts` · `release-ops.ts` | RPC 입구 · getCurrentUser | 기본값 베타. 새 서버 동작은 표에 올려야 함 |

## 2. 권한 표(1단계 — `lib/org/capabilities.ts`)

| 업무 권한 | 소유자(MASTER) | 코치(STAFF) | 선수(PLAYER) | 위임 가능 |
| --- | --- | --- | --- | --- |
| roster.read / manage | ○ / ○ | ○ / × | × | ○ |
| schedule.read / manage | ○ / ○ | ○ / ○ | ○(self) / × | ○ |
| training.assign / read* / recordForAthlete* | ○ | ○ | × | ○(범위 필수) |
| lesson.manage · booking.manage · notice.publish · chat.moderate | ○ | ○ | × | ○ |
| finance.manage · export.data* · org.manage | ○ | × | × | ○(소유자가) |
| permission.manage | ○ | × | × | 소유자만 |

\* 기록을 여는 권한 — 선수의 `ShareConsent` 와 교집합으로만 열린다. 위임은 아직 저장할 표가 없다(M-A) — 지금은 역할 기본 묶음만 서버에 닿고, 함수는 grants 를 받을 준비가 돼 있다.
**2단계(같은 날)**: 앱 코치 동작 42곳이 `coachOrgCan(orgId, '권한')`(lib/org/app-access.ts)으로 판정한다 — 읽기는 roster.read · schedule.read · training.read, 배정 · 초대 · 기록은 training.assign · roster.manage · training.recordForAthlete · lesson.manage. 역할 기본 묶음만이라 지금 코치(STAFF)의 동작 범위는 전과 같다(코치에게 roster.manage 를 주었다 — 선수 초대는 지금도 코치가 한다). 웹 마스터 동작(`org.ts` · `org-calendar.ts` · `org-notes.ts` · `org-notices.ts` · `org-record.ts` · `lessons.ts` 코치 쪽 27곳)도 `requireOrgCan(user, orgId, '권한')`(lib/org/access.ts)로 — 같은 역할 판정. 새 권한 `org.manage`(조직 설정 · 코치 프로필 공개)는 **소유자만** — 코치(STAFF)는 이제 웹에서 조직 이름 · 코치 프로필을 못 바꾼다(브리프 4절: 감독이 조직 설정). 그 밖은 전과 같다.

## 3. 요구사항 대응표(R01~R14)

| ID | 화면 · 서버 동작(지금) | 데이터 원본 | 권한 | 시험 | 단계 | 상태 |
| --- | --- | --- | --- | --- | --- | --- |
| R01 팀 가입 · 초대 · 승인 · 관리는 덕아웃 | **덕아웃 `/teams/join`(새, 2단계)** · 옛 `/join`(같은 본문 `components/org/join-view.tsx`) · `/me` 의 참여 길 · 웹 `/manage/*` · 앱 `native/src/app/org/*` | OrgMember · OrgInvite | requireUser(코드 가입) · coachOrgCan('roster.manage')(초대) | org:test 4 · release-access 2 | 2 | **됨(코드 가입 덕아웃 진입 · 코치 코드 수락 화면 G01 · 전이 표 G02 · 원자 차지 G03 — 코드 + node 시험) · 남음(코드 없는 가입 요청 → 승인, 관리 화면의 덕아웃 이전, 실계정 확인)** |
| R02 싱커 개인 훈련 · 왼쪽 위 공간 선택 | `native/src/org/space-store.ts` · `space-pick.tsx` · `lib/org/space-nav.ts` | 화면 문맥(권한 아님) | — | org:test 8절 | 2 | **확인 · 귀속은 됨(코드 + node 시험 — `org/link-queue.ts`, G04)** — 공간을 바꿔도 귀속은 대기열에 남음. 실기기 미확인 |
| R03 싱커 훈련이 동의 범위로 덕아웃에 보임 | `lib/org/player-data.ts` · 코치 화면 | 선수 원본 그대로 | memberScope | — | 2 | **확인** — 조회는 있음. 저장 뒤 갱신 이벤트(아웃박스) 없음 → 2단계 |
| R04 코치가 배정 · 실제 · 정정 검토 | `OrgPlan` · `team-session-store.ts`(recorded/reconciled/needs_check) | OrgEventAttendee | coachOrg | org:test | 2 | **확인** — 있음(10-27 계약). 범위(assigned_players)는 M-A 뒤 |
| R05 보호자는 인증된 자녀만 | `GuardianReport` 링크만 | — | 토큰 | — | 1 | **막힘** — 관계 표 필요(M-B) |
| R06 업무 위임(학부모 총무) | `capabilities.ts canGrant`(순수) | 저장 표 없음 | — | org:test 9 | 1 | **됨(규칙 · 앱 조회 넷의 대상별 가리기 G05) · 막힘(저장 M-A — 잇기 전에 나머지 조회 렌즈 필요)** |
| R07 일정 · 대회 · 공지 · 출석 · 편의 | `org-calendar.ts` · `org-notices.ts`(공지 읽음 OrgNoticeRead) | OrgEvent · OrgNotice | coachOrg | — | 4 | **확인** — 일정 · 공지 있음. 반복 · 회차 · 참석(RSVP ≠ 출석) · 확인 기한 없음 |
| R08 팀 단체 채팅 | 없음(Conversation 은 1:1) | — | — | — | 4 | **막힘**(M-D) |
| R09 코치 찾기 · 예약 · 변경 요청 | `/lessons/*` · `requestBooking` · `cancelBooking`(조건부 · 기록 보존) | LessonBooking | requireUser | dugout:test 164 · org:test | 3 | **확인 · 취소는 됨** — 변경 요청 · 코치/자원 용량 · 동시 마지막 자리(서로 다른 예약)는 없음(DB 제약 · 잠금 설계 필요) |
| R10 코치 레슨 운영 · 이용권 | `confirmBooking` · `finishBooking`(조건부) · `LessonPass` | LessonBooking · LessonPass | requireMaster+requireOrg | org:test 6 | 3 | **됨(중복 차감 방지) · 확인(나머지)** — 원장(ledger)은 M-C |
| R11 레슨 공간이 싱커에 · 개인으로 돌아감 | `space-store.ts` · 확정 때 OrgMember 생성(`lessons.ts`) | OrgMember | — | — | 3 | **확인** |
| R12 회원 본인 이력 · 숙제 · 다음 계획 | `native/src/org/player.tsx` · `OrgAssignment` · `LessonNote`(초안/공개 구분 없음) | LessonNote · OrgAssignment | myMember | — | 3 | **확인** — 공개/내부 메모 구분 칸 없음(M-C) |
| R13 코치-회원 소통은 덕아웃 | 없음(장터 채팅뿐) | — | — | — | 4 | **막힘**(M-D) |
| R14 기존 데이터 · 옛 앱 · 베타 유지 | `release-ops.ts`(org/dugout/chat 잠김) · 426 옛 앱 | — | 관문 | release-gate 102 · access 687 · native-api 302 | 1~5 | **됨(유지)** — 이번 변경은 DB 무변경 · 동작 호환(예약 동작이 값을 돌려주지만 옛 폼은 무시) |

## 4. 옛 계약과 부딪히는 것 — 폐기 표시

| 옛 문서 · 결정 | 지금 | 처리 |
| --- | --- | --- |
| `sinker-team-lesson-contract.md` 2-1 "앱 코치 동작은 isMasterUser + orgsFor" | 코치 = 조직 역할(orgsFor)만 | **폐기**(이 문서 0절, org:test 검사 바꿈) |
| 같은 문서 "수강권 차감은 lessonPass.update" | 조건부 갱신 `completeBookingTx` | **대체** |
| 같은 문서 11절 "참석 기능을 걷었다" | 유지. 재도입은 RSVP ≠ 출석 ≠ 수행 세 상태로 새 표/칸(제안 M-E) | 그대로, 4단계에 새 계약 |
| `team-lesson-master.md` "관리 화면은 PC 마스터 틀(/manage)" + 앱 `native/org` 관리 화면 | 둘 다 있음 — 덕아웃(웹 · 덕아웃 앱)이 관리 원본, 싱커 앱의 관리 화면은 호환 기간 뒤 정리 | 2단계 결정(김민과) |
| org-selftest "내 싱커 아래 탭 홈 · 덕아웃 · 투구 · 타격 · 더보기" | 10-29 탭(홈 · 투구 · 트레이닝 · 기록 · 덕아웃) | **고침** |
| `GuardianReport` = 보호자 기능 | 열람 링크일 뿐 | 관계 표(M-B) 뒤 링크는 보조 수단으로 |

## 5. 마이그레이션 제안(모두 **제안** — 공유 DB 라 적용은 김민 조율 · `npm run backup` 뒤. `prisma/migrations` 에 넣지 않았다 — main 빌드가 바로 적용하기 때문)

더하기만(nullable · default) — 옛 코드가 그대로 돈다.

- **M-A 위임** `OrgGrant { id, memberId→OrgMember, capability String, scope String, grantedById, createdAt, revokedAt?, note? }` + `@@index([memberId, revokedAt])`. 감사 `OrgAudit { id, orgId, actorId, action, targetId?, detail Json?, at }`.
- **M-B 보호자** `GuardianLink { id, guardianUserId, childUserId, status (invited/active/revoked/disputed), invitedById, expiresAt?, verifiedAt?, revokedAt?, createdAt }` `@@unique([guardianUserId, childUserId])`. `ShareConsent` 에 `grantedByGuardianId?` · `effectiveFrom?` · `effectiveTo?`.
- **M-C 레슨** `LessonBooking` 에 `athleteUserId?`(실제 수강자 — 비면 userId) · `idempotencyKey? @unique` · `rescheduleOf?`. `LessonPassLedger { id, passId, bookingId?, delta Int, reason, key @unique, byId, at }`(원장 — 지금의 조건부 `used` 갱신은 그 전 단계; 끝냄 한 건에 `key = booking:<id>:finish` 로 한 줄, 되돌림은 `…:reverse` 한 줄만). `LessonNote` 에 `visibility String @default("published")`(draft/published/staff).
  **용량(서로 다른 예약)**: `OrgEvent` 에 `@@unique([orgId, date, time, memberId])` 같은 제약은 코치 한 명 가정이라 부족 — 코치 · 자원 표(`OrgResource`)와 `OrgSlotHold { resourceId, startsAt, endsAt, bookingId, expiresAt }` + 겹침 제약(PostgreSQL `EXCLUDE USING gist` 또는 트랜잭션에서 `SELECT … FOR UPDATE` 로 자원 줄 잠금)으로. 마지막 자리 동시 요청은 격리된 PostgreSQL 에서만 증명한다(메모리 모의는 행 잠금 흉내일 뿐).
- **M-D 대화방** `OrgRoom { id, orgId, kind (team/staff/group/dm), title?, createdAt }` · `OrgRoomMember { roomId, userId, joinedAt, mutedAt?, lastReadAt? @@id([roomId,userId]) }` · `OrgRoomMessage { id, roomId, authorId, body, clientKey @unique, createdAt, hiddenAt? }`. 장터 Conversation 은 그대로.
- **M-E 참석 · 반복** `OrgEvent` 에 `recurrenceId?` · `locationNote?` · `arriveAt?`. `OrgRsvp { eventId, memberId, reply, note?, at @@id }` · `OrgAttendance { eventId, memberId, present Boolean, byId, at @@id }` — 옛 `reply/attended` 칸은 안 쓴다.
- **M-F 갱신 아웃박스** `OrgChange { id, orgId, kind, refId, version, createdAt }` — 저장 트랜잭션 안에서 한 줄, 화면은 마지막 id 로 다시 받기(p95 5초 목표는 이것을 넣고 재야 한다).

적용 차례: 백업 → M-A · M-B → 서버 동작 권한 좁히기 → M-C → 3단계 → M-D · M-E · M-F → 4단계. 백필은 없다(모두 새 표 · 빈 칸).

## 6. 안 한 것 · 이어서 할 자리(정확히)

1. **2단계 팀 수직 흐름** — 된 것: 덕아웃 가입 화면(`/teams/join`, 코드 가입 + 공유 범위) · `/me` 진입 · 싱커 소속 갱신은 이미 있음(앱 `index.tsx askMe` → `ownerKnown` → `space-store.ts spaceOwner/refreshSpaces` — 켤 때 · 앱이 앞으로 올 때 · 로그인 · 권한 없음 뒤).
   남은 것: 코드 없는 가입 **요청 → 감독 승인**(팀 공개 목록이 없고, `OrgMemberStatus.INVITED` 는 안 쓰는 값이라 '대기'로 쓸 수 있다 — 승인 화면이 코치 앱(김민)에 필요) · 동의 바꾸기 화면(지금은 참여 때만) · 아웃박스(M-F).
2. **서버 동작마다 `hasCapability`** — 된 것: 앱 동작 42곳 + 웹 마스터 동작 27곳(requireOrgCan) + 앱 복합 조회 셋의 DTO 가리기(orgAuthz · dto-scope). 남은 것(F05): 일지 · 숙제 · 영상 주소 · 투구 대리 기록 조회와 웹 마스터 페이지(app/(master) — requireOrg 뒤 여러 종류를 바로 읽음)에 같은 렌즈, 검색 · 알림 · 내보내기. 쿼리 단계에서 대상 집합을 거는 것(지금은 답을 만든 뒤 거름 — 비용은 같지만 grants 가 좁아지면 쿼리부터 좁혀야 한다).
2-1. **F03 남은 것** — 일반 계정 운영자의 실제 흐름(스태프 코드 받기 → 덕아웃 '관리' → /manage)은 코드로만 확인. 선수 겸 코치(한 조직에 회원 줄 하나)는 `OrgMember.role` 하나뿐이라 아직 못 적는다 — M-A 의 grants 로 '선수 + 운영 업무'를 더하는 길이 설계. 학부모 총무는 **아직 만들지 않는다**(STAFF 로 흉내 내지 않음).
3. **3단계 레슨** — 동시 마지막 자리(코치 시간 · 자원 용량 원자 검사), 변경 요청(원 예약 보존), 예약자 ≠ 수강자, 원장(M-C), 노트 공개/내부 구분.
4. **4단계** — 방(M-D) · 참석(M-E) · 공지 확인 기한 · 반복 일정.
5. **5단계** — 옛 앱 호환 · 측정(p95) · 단계적 공개(베타 해제는 별도 제품 결정).
6. 브리프 필수 시나리오 가운데 한 것: 동시 완료 1회 차감 · 재시도 · 취소 보존(소스) · 총무 위임 범위(규칙) · 베타 차단 유지. **안 한 것**: 두 팀 + 레슨 같은 날, 보호자 두 자녀 · 타 자녀 URL, 권한 회수 중 열린 화면, 역순 갱신 · 오프라인 업로드, 마지막 자리 동시 예약, 방 경계, 앱 간 이동, 구버전 클라이언트.
7. 화면 확인 — `/teams/join` · `/join` 은 로그인 전 307(로그인으로, 돌아올 주소 포함)만 개발 서버에서 확인. 로그인한 화면 · 실기기는 아직. 취소 뒤 일정이 '취소'로 남는 것은 코치 시간표에 보인다(미확인).
