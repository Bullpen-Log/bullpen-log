# 싱커 팀 · 레슨장 — 0단계 계약(2026-10-25)

계획 문서 '싱커 팀 · 레슨장 계획'(claude.ai 문서, https://claude.ai/artifact/FaPUa1mXdDsCgWm3SkPS1j)의 0단계 산출물이다.
표 · 서버 동작 · 공유 규칙 · 앱 화면을 여기서 정하고, **두 사람(김민 · 금윤호)이 이 문서에 합의하면 1단계를 시작한다.**
이 문서를 쓰는 동안 코드 · DB 는 바꾸지 않았다.

정한 것(계획 문서 '사용자 결정' 1~9): 예약 · 수강권 · 결제는 덕아웃 · 초대 코드만으로 독립 사용 · 마스터 계정엔 내 싱커 없음 ·
영상 피드백은 일지에 합침 · 경기 · 새 부상 관리는 뒤로 · 덕아웃 안 쓰는 레슨장은 싱커에서 예정 활동만 적음 · 코치가 적은 투구는
선수 기록에 바로(선수는 정정 요청) · 떠난 선수도 받은 일지는 읽기만 · 계정 잇기 전 일지는 옮기지 않음.

## 1. 지금 있는 것(2026-10-25 코드 확인)

| 있는 것 | 어디 | 쓸 곳 |
| --- | --- | --- |
| 조직 · 구성원 · 초대 · 공유 동의 · 조직 일정 · 공지 · 레슨 노트 · 수강권 · 보호자 링크 표 | `prisma/schema.prisma` Org~GuardianReport | 그대로 쓴다 |
| 덕아웃 예약 → 조직 일정 연결 | `LessonBooking.eventId` | 지도 활동이 예약을 따로 가리킬 칸은 필요 없다 |
| 코치 대신 투구 기록(공유 확인 · 2분 중복 막기) | `app/actions/org-record.ts createPitchLogs` | 2단계에 활동 연결 · 고유 키만 더한다 |
| 합류할 때 공유 범위 고르기 | `app/actions/org-join.ts joinOrg` | 그대로. 예약 확정 쪽만 고친다 |
| 조직 서버 동작 7묶음이 RPC 에 등록됨 | `app/api/rpc/registry.ts` | 폼 동작은 multipart 로 앱에서 부를 수 있다 |
| 코치 화면 자료 읽기 | `lib/org/player-data.ts` | 앱용 읽기 동작이 이것을 부른다 |
| 예약 끝남 처리 | `app/actions/lessons.ts finishBooking` | 수강권 차감을 여기로 옮긴다 |

없는 것: 앱(native/)에 조직 화면이 하나도 없다. 마스터 계정이 앱에 로그인했을 때의 화면도 없다. 조직 서버 동작은 모두 웹 폼 꼴이고 `requireMaster` 로 막혀 있다.

## 2. 1단계 — DB 변경 없음

1단계는 표를 바꾸지 않는다. 그래서 합의만 되면 백업 · 마이그레이션 없이 시작할 수 있다.

### 2-1. 서버

1. **공유 동의 없는 줄의 뜻을 바꾼다.** `lib/org/access.ts memberScope(consent)` 는 줄이 없으면 모두 보인다. 이것을
   `memberScope(consent, hasUser)` 로 바꾼다. 계정이 이어진 회원(`userId` 있음)인데 줄이 없으면 **아무것도 안 보임(동의 대기)**,
   코치가 만든 빈 자리(`userId` 없음)는 지금처럼 모두 보임. 부르는 곳 여섯(`player-data.ts` · `org-record.ts` · `manage/page.tsx` ·
   `manage/record/page.tsx` · `report/[token]/page.tsx`)을 같이 고친다.
2. **예약 확정은 회원 연결만.** `app/actions/lessons.ts confirmBooking` 에서 `shareConsent.create` 를 뺀다(회원 줄 · 일정 줄은 그대로).
   선수에게 알림 '레슨장에 연결됐어요. 보여 줄 기록을 골라 주세요'(`notify`, 링크는 앱의 동의 화면).
   이미 확정된 예약이 만든 동의 줄은 지금 0개라 옮길 것이 없다.
3. **노트 저장에서 수강권 차감을 뗀다.** `app/actions/org-notes.ts createLessonNote` 의 `countPass` 가지를 지우고, 같은 차감을
   `finishBooking`(덕아웃 예약 끝남)으로 옮긴다. 웹 `/manage` 의 수강권 화면(`addPass` · `adjustPass`)은 덕아웃 운영 화면으로 남긴다.
4. **팔 상태 '정보 부족'.** `armStatusFor(user, now)` 에 공유 범위를 넘긴다. 체크인을 공유하지 않으면 체크인 없이 셈하고
   `partial: ['checkin']` 를 돌려준다. 최근 7일 투구 기록이 없거나 `partial` 이 있으면 화면은 '안전' 대신 '정보 부족'을 보인다.
   판정은 선수 엔진(`lib/report/arm-status.ts armStatusOf`)을 그대로 쓴다.
5. **앱용 읽기 · 쓰기 동작** — 새 파일 `app/actions/app-org.ts`(앱 화면용 `app-*.ts` 와 같은 꼴, JSON 인자, `requireUser` 뒤 역할 확인).
   registry 에 `'app-org'` 한 줄, `scripts/native-api-shapes.json` 갱신.

| 동작 | 누가 | 돌려주는 것 |
| --- | --- | --- |
| `loadMySpaces()` | 누구나 | `{ hasSinker, spaces: [{ orgId, kind, name, role, memberId, consentPending }], last }` |
| `loadOrgToday(orgId)` | 마스터 · 스태프 | 오늘 조직 일정 · 동의 대기 회원 수 · 팔 상태 주의 회원 |
| `loadOrgMembers(orgId)` | 마스터 · 스태프 | 회원 목록(이름 · 태그 · 동의 상태 · 팔 상태 한 줄) |
| `loadMemberCard(orgId, memberId)` | 마스터 · 스태프 | 공유한 항목만: 투구 요약 · 팔 상태 · 체크인 · 최근 영상 · 일지 목록 |
| `loadMyMembership(memberId)` | 그 회원 | 조직 이름 · 받은 일지 · 지금 공유 범위 |
| `saveConsent(memberId, consent)` | 그 회원 | 공유 범위 저장(첫 저장이 동의) |
| `leaveOrg(memberId)` | 그 회원 | 상태 LEFT · 받은 일지는 읽기 전용으로 남음 |

`last`(마지막에 고른 공간)는 앱 저장소에 둔다. 서버 쿠키 `bp-org` 는 웹 `/manage` 만 쓴다.

### 2-2. 앱(native/)

- **로그인 뒤 갈래**: `loadMySpaces` 를 부른다. 마스터 계정은 조직 공간으로 바로(내 싱커 탭 없음), 선수는 지금 홈 + 위 막대 고르개(조직이 있을 때만 보임).
- **새 화면**(`native/src/app/org/*`): 오늘 · 회원 목록 · 회원 카드 · 더보기(코치) / 합류(코드 + 공유 고르기) · 공유 범위 · 받은 일지(선수).
  1단계 코치 탭은 오늘 · 회원 · 더보기 셋. 일지 · 받은 것 탭은 2단계에 붙인다.
- 공용 파일(1번 몫): `native/src/app/index.tsx`(갈래 · 탭) · `NATIVE_ROUTES` · `native/src/lib/site.ts APP_UA`(새 판) · `lib/app-env.ts` 판 목록.
- 웹 `/manage` 는 그대로 둔다(PC 에서 긴 표 · 수강권 · 내보내기).

### 2-3. 1단계 관문(시험)

- `npm run org:test` 에 더함: 동의 줄 없는 계정 회원은 아무것도 안 보임 · 빈 자리는 모두 보임 · 예약 확정은 동의 줄을 안 만듦 ·
  노트 저장은 수강권을 안 바꿈 · 체크인 비공유면 팔 상태에 체크인이 안 섞임.
- 폰: 예약 없이 초대 코드 → 공유 고르기 → 코치 앱 회원 카드. 공유 안 한 항목은 RPC 응답에도 없다.

## 3. 2단계 — 레슨장(마이그레이션 묶음 M2)

모두 더하기다. 새 칸은 비워 둘 수 있거나 기본값이 있다(AGENTS 2번).

```prisma
model OrgEvent {
  // 지금 칸 그대로 + 아래
  /// 'planned' 예정 · 'done' 실시 · 'canceled' 취소 — 지도 활동 확인(출석 아님, 수강권과 무관)
  status   String    @default("planned")
  doneAt   DateTime?
}

model LessonNote {
  // 지금 칸 그대로 + 아래
  /// 어느 지도 활동의 일지인가. 저장할 때 활동이 없으면 그날 'done' 레슨 활동을 만들어 잇는다
  eventId    String?
  /// 일지에 붙인 영상(저장소 경로) — 코치가 찍었거나 선수 투구 영상에서 고른 것
  videoPaths String[] @default([])
  editedById String?
  updatedAt  DateTime @default(now()) @updatedAt
  @@index([eventId])
}

model PitchLog {
  // 지금 칸 그대로 + 아래
  /// 조직 활동에서 나온 투구(코치가 적었거나 선수가 그 활동에 이은 것)
  orgEventId String?
  /// 같은 저장 요청을 다시 보내도 한 줄 — 앱이 만든 키. 옛 줄은 null
  clientKey  String?
  @@unique([userId, clientKey])
  @@index([orgEventId])
}

/// 숙제 — 회원 한 명에 한 줄. 상태가 'done' 이면 실제 수행 기록을 가리킨다
model OrgAssignment {
  id             String    @id @default(uuid())
  orgId          String
  memberId       String
  noteId         String?
  assignedById   String
  /// [{ exerciseId?, guideId?, sets?, reps?, holdSec?, note? }] — 라이브러리 운동 · 드릴만(자유 글 운동 없음)
  items          Json
  dueDate        DateTime? @db.Date
  /// 'assigned' · 'in_progress' · 'done' · 'excused' · 'canceled'
  status         String    @default("assigned")
  doneSessionId  String?
  donePitchLogId String?
  doneAt         DateTime?
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  @@index([memberId, status])
  @@index([orgId, createdAt])
}

/// 일지 · 숙제에 다는 말 — 코치의 영상 시점 코멘트 · 회원 질문 · 정정 요청 · 숙제 영상 제출을 한 표에. '받은 것' = 회원이 쓴 줄 중 안 푼 것
model OrgComment {
  id           String    @id @default(uuid())
  orgId        String
  memberId     String
  noteId       String?
  assignmentId String?
  authorId     String
  /// 'comment' · 'question' · 'fix'(정정 요청) · 'submit'(숙제 영상)
  kind         String    @default("comment")
  body         String    @db.Text
  videoPath    String?
  /// 영상의 몇 초에 단 말인가
  atSec        Float?
  resolvedAt   DateTime?
  createdAt    DateTime  @default(now())
  @@index([noteId])
  @@index([assignmentId])
  @@index([orgId, resolvedAt])
}
```

**운동량 규칙(2단계)**

- 일지의 **투구 수**는 저장할 때 선수 `PitchLog` 로 남긴다(`enteredById` = 코치, `orgId`, `orgEventId`, `clientKey`). 선수가 그날 직접 남긴 투구 기록이
  있으면 새로 만들지 않고 코치가 고른 그 줄에 `orgEventId` 만 잇는다. 선수 확인 없이 들어가고 선수는 `OrgComment kind 'fix'` 로 정정을 요청한다(결정 7).
- 일지의 **운동**은 2단계에서는 일지에만 둔다(부하에 안 셈). 라이브러리에서 고르게 해서 나중에 옮길 수 있게 `exerciseId` 를 남긴다.
  까닭: 운동 판(`TrainingSession`)이 선수 하루에 하나(`@@unique([userId, date])`)이고 요약(`UserExerciseLog`)도 하루 · 운동마다 한 줄이라,
  코치 운동을 그대로 넣으면 선수의 그날 운동과 부딪힌다. 이 문제는 팀 수행일지(3단계)에 꼭 필요해서 3단계 전에 푼다(4절).
- 숙제는 선수가 트레이닝 탭에서 하면 그 운동 판이 실제 수행이 된다. `OrgAssignment.doneSessionId` 로 가리킨다.
- 일지를 지우거나 고치면 그 일지가 만든 `PitchLog` 만 같이 고치거나 지운다(`orgEventId` + `enteredById` 로 찾음). 선수가 직접 남긴 줄은 연결만 푼다.
- 계정을 아직 잇지 않은 회원(`userId` 없음)의 일지는 `PitchLog` 를 만들지 않는다. 이어도 옮기지 않는다(결정 9).

**동작**: `app-org.ts` 에 `saveLessonNote` · `deleteLessonNote` · `saveEvent`(예정 활동 적기 · 실시 · 취소, 결정 6) · `assignHomework` · `setAssignmentStatus` ·
`addComment` · `resolveComment` · `loadInbox`(받은 것). 웹 `org-notes.ts` 는 같은 순수 규칙(`lib/org/`)을 불러 앱과 맞춘다.

**관문 2**: 실제 레슨장 한 곳 2주. 같은 공을 두 번 센 날 0 · 같은 요청 재전송 중복 0(`clientKey`) · 일지 고침 · 지움 뒤 부하가 맞음.

**진행(2026-10-26)**: 표 적용(e41dbc15) · ①② 지도 활동 확인 · 일지 고치기 · 일지 던진 공 → 선수 투구 기록(5eecf8bd) · ③ 숙제(3d295302) · ④ 말 · 받은 것(fdf27ebd) ·
웹 일지 폼에 '이을 기록' 고르기. 동작 이름은 계약과 조금 다르다 — 일지는 웹과 같은 폼 동작(`org-notes.createLessonNote` · `updateLessonNote` · `deleteLessonNote`),
활동은 `org-calendar.setOrgEventStatus`, 숙제 · 말 · 받은 것은 `app/actions/app-lesson.ts`. 정한 것: 숙제 완료는 선수의 운동 · 드릴 기록을 읽을 때 맞춘다(운동 화면은 안 건드림,
날짜 단위라 숙제 낸 날 그 전에 한 운동도 센다) · 투구 공유를 안 켠 회원의 일지 공은 선수 기록에 안 쓴다 · 던진 공이 있으면 강도 필수. 2026-10-26 빈칸도 채움: 일지 영상(코치) · 숙제 영상(선수) · 영상 시점 말(앱 · 웹, 저장소 `{올린 사람}/org-{uuid}` 파일, 재생은 걸린 영상만),
웹 /manage 회원 카드 숙제 · 일지 말 · 홈 '받은 것'. 남은 것: 관문 2(폰 · 실제 레슨장).

## 4. 3단계 — 팀(마이그레이션 묶음 M3, 초안)

```prisma
model OrgEventAttendee {
  eventId   String
  memberId  String
  /// 'yes' · 'no' · 'maybe' — 선수 응답
  reply     String?
  /// 코치가 확인한 실제 참석
  attended  Boolean?
  updatedAt DateTime @updatedAt
  @@id([eventId, memberId])
  @@index([memberId])
}

/// 훈련 메뉴 — 한 일정에 묶음별로. 배정할 때의 대상 명단을 남긴다(묶음이 나중에 바뀌어도 그대로)
model OrgPlan {
  id          String   @id @default(uuid())
  orgId       String
  eventId     String
  title       String
  items       Json
  memberIds   String[]
  createdById String
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
  @@index([eventId])
}

/// 등판 계획 — 경기 일정 · 선수 하나에 한 줄. 'confirmed' 만 선수의 다음 등판으로 쓴다
model OrgOuting {
  id          String   @id @default(uuid())
  orgId       String
  eventId     String
  memberId    String
  /// 'starter' · 'relief' · 'standby'
  role        String
  pitchLimit  Int?
  /// 'draft' · 'confirmed' · 'canceled'
  status      String   @default("draft")
  updatedById String
  updatedAt   DateTime @updatedAt
  createdAt   DateTime @default(now())
  @@unique([eventId, memberId])
  @@index([memberId, status])
}

model OrgNoticeRead {
  noticeId String
  memberId String
  readAt   DateTime @default(now())
  @@id([noticeId, memberId])
}
```

**3단계 전에 풀 것 — 조직 운동을 선수 하루 운동에 넣는 법.** 제안: 그날 선수 운동 판(`TrainingSession`)이 있으면 거기 세트(`UserExerciseSet`)로 붙이고,
없으면 `themeKey: 'org'` · `status: 'FINISHED'` 판을 만들어 붙인다. 요약(`UserExerciseLog`)은 지금처럼 세트에서 다시 셈한다. `UserExerciseSet` 에
`enteredById String?` · `orgEventId String?` · `clientKey String?`(유일)를 더한다. 확인할 것: 운동 시작이 'org' 판을 다시 열 때(`lib/workout/open-session.ts mergeReopened`) ·
얼린 계획에 없는 운동의 세트를 화면이 보이는지 · 저절로 닫기(`close-stale.ts`)가 'org' 판을 건드리지 않는지. 트레이닝 엔진 쪽과 같이 정한다.

**다음 등판**: 엔진의 등판 짐작(`lib/engine/outing.ts`)이 확정된 `OrgOuting` 을 출처 하나로 더 읽는다. 체크인 답 · 개인 달력과 날이 다르면 덮지 않고 선수에게 묻는다.

**관문 3**: 팀 한 곳 2~3주. 계획 · 참석이 부하에 안 섞임 · 확정된 등판만 다음 등판에 쓰임 · 같은 공 두 번 센 날 0.

## 5. 4단계 — 성장 · 확장(표는 그때 정함)

측정 기록(지표 코드 · 단위 · 출처 · 엔진 판 · 정정) · 공통 추세 · 팀 처방(`OrgAssignment` 에 묶음 번호 더함) · 영상 그리기 · 비교 재생 · 여러 선수 연속 측정 · 보호자 리포트(정책 뒤).

## 6. 시간 다시 재기(Claude 작업 기준, 폰 확인 · 파일럿 기간 뺌)

| 단계 | 서버 | 앱 | 합 |
| --- | --- | --- | --- |
| 1 공통 바닥 | 8~10시간 | 14~18시간 | 22~28시간 |
| 2 레슨장 | 12~15시간 | 18~24시간 | 30~39시간 |
| 3 팀 | 14~18시간 | 18~24시간 | 32~42시간 |
| 합(0~3) |  |  | 84~109시간 |

처음 문서 75~91시간보다 늘었다. 앱에 조직 화면이 아예 없고, 마스터 계정의 앱 첫 화면도 새로 만들어야 해서다.

## 7. 아직 정할 것(1단계 시작 전에 필요한 것만)

1. **누가 어느 쪽을 맡나.** 조직 서버 동작 · 웹 `/manage` 는 지금까지 금윤호, `native/` 는 김민 영역이다. 제안: 서버(2-1)는 금윤호, 앱(2-2)은 김민,
   마이그레이션(M2 · M3)은 서버 쪽 한 사람이 백업 뒤에.
2. **이 문서 합의.** 표 이름 · 칸 · 1단계 서버 동작 다섯 가지에 두 사람이 동의하면 1단계를 시작한다.
