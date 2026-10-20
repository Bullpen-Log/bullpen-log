# 팀 · 레슨장 마스터 — 구현 계획서 + 작업 프롬프트(영어)

설계와 소비자 관점 검토는 `docs/designs/team-lesson-master.md`. 이 문서는 **그 설계를 코드로 어떻게 만드는가**와, 다른 세션(또는 다른 Claude)이
그대로 따라 할 **영어 프롬프트**다(사용자 규칙 2026-10-14: 프롬프트는 영어로).

## 결정(2026-10-20 금윤호)

| # | 질문 | 결정 |
|---|---|---|
| 1 | 가입 첫 질문 셋(선수 · 레슨장 · 팀) | **예** |
| 2 | 마스터 계정에 선수 기능 없음 | **예** |
| 3 | 공유 동의 기본값 | 투구 · 트레이닝 · 체크인 · **영상 켬(레슨장 · 팀 모두)**, 영양 · 체중 끔 |
| 4 | 미성년자 · 보호자 동의 | 나중에 |
| 5 | 대리 기록을 1단계에 | **예** |
| 6 | 조직 공지 · 자료는 별개 표 | **예** |
| 7 | 팀 캘린더 | **새 표**(개인 CalendarEvent 에 섞지 않음) |
| 8 | 가격 | 나중에 |
| 9 | 결제 | 나중에 |
| 10 | 파일럿 | 일단 만들고 봄 |

그리고 구조 원칙(사용자):
- **팀 · 레슨장은 지금 불펜로그 홈과 아예 별개의 화면.** 관리 기능에 초점을 둔 인터페이스로 **하나를 더 만든다** — 원래 불펜로그는 그대로 둔다.
- 어떻게 가입했느냐에 따라 로그인 뒤 보는 화면이 갈린다.
- 관리자(ADMIN)는 관리자 메뉴에서 전환해 팀 인터페이스를 보고 쓸 수 있다.
- **기존 불펜로그는 절대 건드리지 않는다.** 일반 선수는 이 화면에 **절대** 들어갈 수 없다 — 관리자와 각 조직의 마스터만.
- 홈 화면도 레슨장 · 팀 각각에 맞게.

## 진행

- **1단계 끝(2026-10-20)** — 스키마 · 마이그레이션(`prisma/migrations/20261020180000_org_master`) · `requireMaster` · 가입 종류(선수 · 레슨장 · 팀) ·
  `/join?code=` · `app/(master)` 틀 + 홈 · 회원 목록 · 설정(초대 코드) · 관리자 조직 목록 · `scripts/org-selftest.mts`(`npm run org:test`).
  마이그레이션은 배포가 적용한다 — 적용 전에는 로컬 개발 서버의 모든 화면이 `User.accountType` 이 없다고 막힌다(getCurrentUser 가 읽는다).
- **2~6단계 끝(2026-10-20, 한 커밋)** — 선수 카드(`/master/players/[memberId]`: 팔 상태 · 투구 28일 · 구속 · 체크인 · 재활 · 영상 · 체중, 동의한 범위만 서버가 읽음) ·
  두 홈(팀: 투수 부하판 · 아침 체크인 요약 · 이번 주 일정 · 공지 / 레슨장: 오늘 레슨 · 수강권 알림 · 2주 노트 없음 · 최근 노트) · 대신 기록(`/master/record`, 경기 투구수표) ·
  레슨 노트 · 숙제 · 수강권 · 보호자 리포트(`/report/[token]` 공개 + 네 자리 코드) · 달력(`OrgEvent`, 레슨은 회원에 붙음) · 공지(선수는 `/join` 에서 봄) ·
  코치(스태프) 초대 코드(가입 폼의 '코치로 들어가요' 칸 · 설정의 합류 칸) · 관리자 요금제 · 자리 칸. 스키마는 1단계 마이그레이션에 합쳤다
  (`OrgEvent.memberId` · `LessonPass` · `GuardianReport` · `Org.plan/seats/planNote` — 아직 어디에도 적용 전이라 한 파일).
- 남은 것: 구속 측정을 코치가 대신 재기(구속 엔진 담당과 `forUserId` 약속 뒤) · 트레이닝 과제(`OrgAssignment`) · 결제.

## 구현 원칙(한국어 요약 — 자세한 건 아래 프롬프트)

1. **새 경로 묶음 `app/(master)/`** — 운동 화면 `app/(session)/` 이 그렇듯 `app/(app)/layout.tsx`(선수 틀 · 탭 · 체크인 관문) 바깥에 둔다. 선수 틀의 코드가 한 줄도
   따라오지 않는다. 방어는 새 `requireMaster()`(lib/dal.ts 에 **더하기만**) — 마스터 계정(`User.accountType = MASTER`) 또는 관리자(`role = ADMIN`)만 통과, 선수는 `/today` 로.
2. **기존 파일은 일곱 곳만, 더하기만**: `prisma/schema.prisma`(enum · 칸 · 새 표) · `app/actions/auth.ts`(가입 분기 · 로그인 뒤 갈 곳) · `app/login/auth-form.tsx`(첫 질문 카드 셋) ·
   `app/(app)/layout.tsx`(마스터 계정이면 `/master` 로 보내는 한 줄) · `lib/dal.ts`(`requireMaster`) · `lib/nav.ts`(관리 묶음에 '팀 · 레슨장 관리' 한 줄, adminOnly) ·
   `app/api/rpc/registry.ts`(새 액션 파일 등록). 그 밖의 선수 화면 · 엔진 · 트레이닝 · 영양 코드는 손대지 않는다.
3. **데이터는 새 표로**: Org · OrgMember · OrgInvite · ShareConsent · OrgEvent(팀 캘린더) · OrgNotice · LessonNote · (뒤에) LessonPass · Attendance. 선수의 기록 표에는
   대리 기록 표시 두 칸(`enteredByUserId` · `orgId`, 모두 선택)만 더한다. 마이그레이션은 손으로 쓴 SQL, 더하기만, 공유 DB 에는 배포가 건다.
4. **읽기는 동의 범위 안에서만** — 마스터 화면의 모든 조회는 `lib/org/access.ts` 를 거친다(어느 조직 · 어느 구성원 · 어느 범위). 선수 기록 집계는 지금 `lib/report/*` 의
   함수를 **선수 id 로 불러** 쓴다(새 계산 로직을 만들지 않는다).
5. **홈 둘**: 레슨장 홈(오늘 회원 · 알림 · 빠른 동작) · 팀 홈(투수 부하 보드 · 오늘 일정 · 체크인 집계). 같은 틀(`app/(master)/layout.tsx` 왼쪽 메뉴 · 위 조직 고르개), 메뉴 묶음과 첫 화면만 다르다.
6. **관리자 전환**: 관리자는 모든 조직을 볼 수 있다(조직 고르개에 전부). 선수 메뉴 '관리' 묶음의 '팀 · 레슨장 관리' 로 들어가고, 마스터 틀의 '선수 화면으로' 로 돌아온다.
7. **웹(PC · 태블릿) 먼저.** 새 앱(Expo)에는 넣지 않는다 — 마스터는 책상에서 쓴다. 앱에서 `/master` 를 열면 그냥 웹 화면이 뜨면 된다(막지 않되 맞추지도 않는다).
8. 단계마다 커밋 · 시험 · HANDOFF. 구속 측정 '여러 선수' 모드는 구속 담당과 맞춘 뒤(3단계).

---

# PROMPT — Build the Team / Lesson-studio "Master" interface for Bullpen Log

## 0. Role and ground rules

You are building a second, management-focused interface for Bullpen Log. Repo root is the Next.js 16 app (App Router, React 19 with the React
Compiler lint rules, Prisma 7 with `relationMode = "prisma"` on a shared Postgres, Tailwind v4, Korean UI). Read `AGENTS.md` and `HANDOFF.md` first.
Design rationale (customer view, pricing, roadmap) is in `docs/designs/team-lesson-master.md` — this prompt turns it into code. Decisions already made
by the owner (do not re-open): three sign-up kinds (player / lesson studio / team); master accounts have no player features; consent defaults
pitch · training · check-in · **video ON** for both studio and team, nutrition · weight OFF; proxy entry (coach records on behalf of a player) is in
phase 1; org notices and the team calendar are **new tables** (not reused from the player's community/calendar); minors/guardians, pricing and
payment are deferred.

Non-negotiable constraints from the owner:

1. **The existing Bullpen Log (player app) must not be touched.** You may edit exactly these existing files, and only additively:
   `prisma/schema.prisma` (+ one hand-written migration), `app/actions/auth.ts`, `app/login/auth-form.tsx`, `app/(app)/layout.tsx` (one redirect line),
   `lib/dal.ts` (add `requireMaster`), `lib/nav.ts` (one admin-only menu item), `app/api/rpc/registry.ts` (register new action modules),
   `scripts/integration-selftest.mts` only if its allow-lists need the new files. Everything else is **new** under `app/(master)/**`,
   `app/actions/org-*.ts`, `lib/org/**`, `components/master/**`, `scripts/org-selftest.mts`. Do not modify `lib/velocity-engine/*`, `lib/report/*`,
   training/nutrition code, the player screens, or `native/`.
2. **A regular player can never open a master page.** Guard every master route and every master server action with `requireMaster()`; players get
   `redirect('/today')`. Admins (`role = ADMIN`) can enter and can see every org. Masters see only their own org(s).
3. The master interface is a **separate route group** `app/(master)/…` with its own layout, outside `app/(app)/layout.tsx` — exactly like
   `app/(session)/layout.tsx` does for workout screens (read its header comment: there is no middleware; the only defence is the `require*()` call in
   the layout). Nothing from the player shell (tabs, check-in gate, top bar, TabPager) is rendered there.
4. Shared production DB: never run `prisma migrate dev`, `db push`, `migrate reset`, `prisma format`, or `npm run build`. Write migrations by hand under
   `prisma/migrations/<timestamp>_org_master/migration.sql` (additive only; `npx prisma generate` is allowed). Never write test rows to the DB; verify
   with self-tests and the local dev server (`preview_start bullpen-log-dev`, never Bash). Local build check is `npx next build` only.
5. Korean UI text in the polite '~해요' style, no athlete/organisation names, icons only from `@/components/icon`, `data-safe-area` on new screen
   frames, `guardFormAction`/`orOffline`/`SafeForm` on save buttons, `appNow()` for app dates (DB `createdAt` is real time). Commit after each phase
   with a Korean message; write a HANDOFF note to 김민 for anything that touches velocity (phase 3) or training recommendation data.
6. Deliver web first (PC / tablet is the master's desk). Do not add native (Expo) screens; `/master` opened inside the app must simply show the web page.

## 1. Data model (phase 1, additive)

Prisma (also write the SQL by hand; `relationMode = "prisma"` → no DB foreign keys, add `@@index` for every relation column):

```prisma
enum AccountType { PLAYER MASTER }
enum OrgKind { LESSON TEAM }
enum OrgRole { MASTER STAFF PLAYER }
enum OrgMemberStatus { INVITED ACTIVE LEFT }

model User { … existing …
  accountType AccountType @default(PLAYER)   // MASTER accounts have no player features
  orgMemberships OrgMember[]
  ownedOrgs      Org[]      @relation("OrgOwner")
}

model Org {
  id        String   @id @default(uuid())
  kind      OrgKind
  name      String
  region    String?            // free text for now (e.g. 서울 강남)
  ownerId   String             // the master user
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  owner   User        @relation("OrgOwner", fields: [ownerId], references: [id], onDelete: Cascade)
  members OrgMember[]
  invites OrgInvite[]
  events  OrgEvent[]
  notices OrgNotice[]
  @@index([ownerId])
}

model OrgMember {
  id        String   @id @default(uuid())
  orgId     String
  userId    String?            // null = placeholder player the coach records for before they sign up
  role      OrgRole
  status    OrgMemberStatus @default(ACTIVE)
  nickname  String             // display name inside the org (copied from User on join, editable by staff)
  tags      String[]           // position · grade · group — free strings
  memo      String?  @db.Text
  joinedAt  DateTime @default(now())
  leftAt    DateTime?
  org      Org            @relation(fields: [orgId], references: [id], onDelete: Cascade)
  user     User?          @relation(fields: [userId], references: [id], onDelete: SetNull)
  consent  ShareConsent?
  notes    LessonNote[]
  @@unique([orgId, userId])
  @@index([orgId, status])
  @@index([userId])
}

model OrgInvite {
  id        String   @id @default(uuid())
  orgId     String
  code      String   @unique  // 6 uppercase letters/digits, no 0/O/1/I
  role      OrgRole  @default(PLAYER)
  memberId  String?           // when inviting a placeholder player to claim their row
  expiresAt DateTime
  usedById  String?
  usedAt    DateTime?
  createdAt DateTime @default(now())
  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@index([orgId])
}

model ShareConsent {
  memberId  String   @id
  pitch     Boolean  @default(true)
  training  Boolean  @default(true)
  checkin   Boolean  @default(true)
  video     Boolean  @default(true)
  nutrition Boolean  @default(false)
  weight    Boolean  @default(false)
  byUserId  String
  updatedAt DateTime @updatedAt
  member OrgMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
}

model OrgEvent {            // team calendar — separate from the player's CalendarEvent
  id        String   @id @default(uuid())
  orgId     String
  date      DateTime @db.Date
  time      String?            // 'HH:MM'
  kind      String             // 'training' | 'game' | 'rest' | 'other'
  title     String
  memo      String?  @db.Text
  createdById String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@index([orgId, date])
}

model OrgNotice {
  id        String   @id @default(uuid())
  orgId     String
  title     String
  body      String   @db.Text
  pinned    Boolean  @default(false)
  authorId  String?
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  org Org @relation(fields: [orgId], references: [id], onDelete: Cascade)
  @@index([orgId, pinned, createdAt])
}

model LessonNote {          // phase 4, but create the table in phase 1 to avoid a second migration
  id        String   @id @default(uuid())
  memberId  String
  date      DateTime @db.Date
  body      String   @db.Text
  homework  String?  @db.Text
  authorId  String
  createdAt DateTime @default(now())
  member OrgMember @relation(fields: [memberId], references: [id], onDelete: Cascade)
  @@index([memberId, date])
}
```

Proxy-entry marks on the player's own tables (nullable, additive): add `enteredById String?` and `orgId String?` to `PitchLog` and `VelocitySession`
(index `[orgId]`). Rows written by a coach carry both; the player later sees "코치가 기록함" and may edit. Do **not** add anything else to player tables.

`User.accountType` drives everything: sign-up kind sets it; `requireMaster()` checks it; `app/(app)/layout.tsx` redirects `MASTER` accounts to `/master`.

## 2. Access layer — `lib/org/access.ts` (phase 1, pure + server)

- `requireMaster()` in `lib/dal.ts`: `const user = await requireUser(); if (user.role !== 'ADMIN' && user.accountType !== 'MASTER') redirect('/today'); return user;`
  Also export `isMasterUser(user)` for the nav.
- `lib/org/access.ts` (server-only):
  - `orgsFor(user)`: admin → all orgs; master → orgs where `ownerId = user.id` or an `OrgMember` with role MASTER/STAFF and status ACTIVE.
  - `requireOrg(user, orgId)`: same rule for one org, else `notFound()`.
  - `memberScope(member)`: returns the consent booleans (defaults when no `ShareConsent` row — placeholder players have no consent row and are fully visible to the org that created them).
  - `visibleUserIds(org, scope)`: the `userId`s of ACTIVE PLAYER members whose consent includes `scope`.
- Pure helpers in `lib/org/rules.ts` (unit-testable, no Prisma): invite-code generator/validator, consent defaults by `OrgKind`, pitcher-status roll-up
  (reuse the player's arm-status function from `lib/report/arm-status.ts` — call it, do not re-implement), lesson-pass arithmetic (phase 4).
- Self-test `scripts/org-selftest.mts` (+ `npm run org:test`): codes, consent defaults, status roll-up, "player cannot see master routes" by reading
  source (every `app/(master)/**/page.tsx` imports and awaits `requireMaster` or renders under the layout; every `app/actions/org-*.ts` export calls `requireMaster`).

## 3. Sign-up and routing (phase 1)

- `app/login/auth-form.tsx`: before the current wizard, a first step with three cards — **선수** ("내 투구 · 훈련 · 영양을 기록해요") / **레슨장**
  ("회원을 관리하고 성장을 보여 줘요") / **팀** ("선수단 · 훈련 일정 · 투수 관리"). Player → the existing wizard unchanged, plus an optional
  "초대 코드가 있나요?" field at the end. Studio/Team → a short wizard: email · password · name → org name · region · (team: age group; studio: coach count)
  → done. Reuse the existing step components; do not restyle the player wizard.
- `app/actions/auth.ts`: `signup` reads `accountType` + org fields; for MASTER create `User(accountType: MASTER)` + `Org` + `OrgMember(role MASTER)` in
  one transaction, then `redirect('/master')`. `login` redirects by `accountType` (`/master` for MASTER, `/today` otherwise). Keep all existing validation.
- `app/(app)/layout.tsx`: directly after `requireUser()`, `if (user.accountType === 'MASTER') redirect('/master');` — nothing else changes.
- `lib/nav.ts`: in the '관리' group add `{ href: '/master', label: '팀 · 레슨장 관리', icon: 'users', tone: 'armcare', adminOnly: true }`.
- Invite flow for players: `/join?code=XXXXXX` page under `app/(app)/join/` **is a player screen, so it is new and allowed** — shows the org, the consent
  toggles with the decided defaults, and "참여하기"; creates/claims the `OrgMember` + `ShareConsent`. Also reachable from the player's 내 정보 (one link).

## 4. Master shell and the two homes (phase 1 skeleton, phase 2 content)

`app/(master)/layout.tsx`: `await requireMaster()`, load `orgsFor(user)`, read the current org from a cookie `bp-org` (fallback: first org; admins may have
zero orgs → show the org list page). Desktop-first: left sidebar (menu groups by `org.kind`), top bar with org switcher and "선수 화면으로" (admins only —
masters have no player screen), content area with `data-safe-area`. Phone width: sidebar collapses to a top menu button. Reuse `components/ui` primitives
and `@/components/icon`; do not import anything from `components/app-shell/*`.

Routes (all under `app/(master)/master/…`):

| Route | Studio (LESSON) | Team (TEAM) |
|---|---|---|
| `/master` | **Studio home**: today's members (by lesson time), unanswered alerts, quick actions (레슨 노트 쓰기 · 측정 시작 · 회원 초대) | **Team home**: pitcher load board (green/yellow/red per pitcher with the reason), today's events, morning check-in summary (answered / pain / poor sleep), quick actions |
| `/master/players` | 회원 목록 (tags/groups, search) | 선수 목록 (positions, search) |
| `/master/players/[memberId]` | Player card (shared) + lesson notes + homework | Player card (shared) + rehab status |
| `/master/calendar` | lesson schedule (OrgEvent kind 'lesson') | team calendar (training/game/rest) |
| `/master/notices` | notices | notices |
| `/master/record` | proxy entry: pitch log / training assignment / velocity (phase 3) | same |
| `/master/settings` | org · staff · invites · (later) plan | same |

Player card content (phase 2) — reuse the player's loaders by user id: recent velocity (best/avg, `lib/velocity-load.ts`), last 7 days pitches and load +
arm status (`lib/report/arm-status.ts`, `lib/pitch-stats.ts`), today's check-in (condition · pain) if `checkin` consent, recent clips if `video` consent,
growth charts (velocity · pitch count · load; weight only with `weight` consent) using the existing chart components from `app/(app)/coach/*` where they
accept data props — if a component is coupled to the logged-in user, copy the minimal presentational part into `components/master/` rather than editing it.

Pitcher load board (team home): for each ACTIVE PLAYER member with `pitch` consent, compute the player's arm status with the existing function and show
초록 "던져도 돼요" / 노랑 "가볍게" / 빨강 "쉬어야 해요" with the reason string the function already produces (yesterday's count, consecutive days,
pain check-in, age limit). Do not invent new thresholds.

## 5. Proxy entry (phase 3)

- `app/actions/org-record.ts`: `createPitchLogFor(orgId, memberId, input)` → validates like `app/api/pitch-log/route.ts` POST (reuse its validation
  helpers by import if they are exported; otherwise copy the minimal checks), writes `PitchLog` with `userId = member.userId`, `enteredById = coach`,
  `orgId`. Placeholder members (no `userId`) store nothing yet — show "선수가 가입하면 기록이 이어져요" and keep a `LessonNote` instead.
- Training assignment: `OrgAssignment` is deferred — in phase 3 just write homework into `LessonNote.homework`; the player sees it on their card page later.
- Velocity "multi-player session" — **coordinate with the velocity owner (김민/맥북 session) before touching `app/(session)/velocity/*` or
  `app/actions/velocity.ts`.** Proposed minimal shape: the existing web velocity screen gets an optional `?org=<orgId>` query that, for master
  accounts, shows a member picker chip per pitch; `saveVelocitySession` accepts `forUserId` + `orgId` and checks `requireOrg` + consent. Until agreed,
  phase 3 ships pitch-log proxy entry only.

## 6. Studio-specific (phase 4) and Team-specific (phase 5)

Studio: lesson notes (one per member per lesson, with homework), lesson passes (`LessonPass`: member · total · used · expiresAt; decrement when a note is
written on a lesson day; alert at 3 left), attendance (derived from notes), groups (tags), guardian report page (read-only, link + 4-digit code, 30-day
expiry — `app/(master)/report/[token]` is public but token-gated; do not put PII in the URL).

Team: calendar CRUD (`OrgEvent`), game pitch-count sheet (one form → N `PitchLog` rows via the proxy action), check-in summary (counts from
`DailyCheckin` for consenting members, today by `appNow()`), rehab status (read-only from the player's rehab tables for consenting members), notices
(`OrgNotice`), staff accounts (`OrgInvite` with role STAFF; STAFF can do everything except settings/plan).

## 7. Phases, gates, and deliverables

| Phase | Scope | Gate before commit |
|---|---|---|
| 1 | schema + migration SQL, `requireMaster`, sign-up kinds, `/join`, master layout + org switcher + empty homes, `scripts/org-selftest.mts` | `npx prisma generate`, root `npx tsc --noEmit`, `npx eslint <files>`, `npm run org:test`, `npm run integration:test` (registry allow-list), dev server: a player account hitting `/master` lands on `/today`; a new studio account lands on `/master` |
| 2 | players list, player card, growth charts, alerts, studio/team homes with real data | same + `npm run highlights:test` unaffected; screenshot both homes at 1440 and 390 width |
| 3 | proxy pitch-log entry, homework; HANDOFF to the velocity owner with the proposed `forUserId` contract | same |
| 4 | studio: lesson notes, passes, attendance, groups, guardian report | same |
| 5 | team: calendar, game sheet, check-in summary, rehab status, notices, staff | same |
| 6 | admin org list (`/master/orgs`), manual plan/seat fields on `Org`, polish, docs | `npx next build` locally, then HANDOFF summary |

After each phase: commit (Korean message, one line of what and why), update `docs/designs/team-lesson-master.md` §6 status, and stop to ask the owner
before the next phase. Never push unless the owner says "올려줘".

## 8. Verification checklist the owner will run on the dev server

1. Sign up as a player → lands on `/today`; open `/master` → bounced to `/today`.
2. Sign up as a studio → lands on `/master` (studio home); the player tabs are not reachable (`/today` bounces to `/master`).
3. Admin → 더보기 → 관리 → '팀 · 레슨장 관리' → org list → open an org → studio/team home → "선수 화면으로" returns to `/today`.
4. Master creates an invite code → player enters it on `/join` → consent screen with the decided defaults → player appears in the list; toggling
   `video` off hides clips on the card.
5. Team home shows the load board with the same colours/reasons the player sees on their own home.
