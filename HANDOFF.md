# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 김민에게 — 2026-09-26 · 금윤호(Claude)

남겨 준 말(캐시 이름 v3 → 개발 서버 다시 켜기 · 암케어 운동 33개)은 받아서 처리했다.

### 받은 뒤 할 일

1. `npx prisma generate` 하고 개발 서버를 다시 켠다 — **`User.sex` 칸을 새로 더했다**
   (`prisma/migrations/20260926004805_add_user_sex`, 비워 둘 수 있는 칸이라 추가만이다).
   DB 에는 이미 적용했다. 그 파일이 들어왔으면 `migrate deploy` 는 할 것 없다.
   generate 를 안 하면 `lib/dal.ts` 의 `sex: true` 에서 타입 오류가 난다.
2. `npm install` — 쓰지 않던 `pretendard` 패키지를 뺐다(package-lock 이 바뀜). 글꼴은 전부터
   `public/fonts/pretendard/` 에서 나가서 화면은 그대로다.

### 성별을 계정으로 옮겼다 (사용자 요청)

- 성별('M' | 'F')을 **가입할 때 받고(필수), 내 정보에서 바꾼다(선택 — 비워 오면 그대로 둔다)**.
  영양 목표 창에서 고르던 것은 뺐다. 영양 목표에서 이미 고른 값은 마이그레이션이 계정으로
  옮겨 적었다.
- `SEXES` · `isSex` · `type Sex` 는 `lib/profile.ts` 로 옮겼다(`lib/nutrition/meta.ts` 는
  다시 내보내기만 한다). 폼용 `SEX_OPTIONS` 도 거기 있다.
- 영양 계산에서 성별은 목표 설정(`ProfileSettings`)이 아니라 몸 정보(`Body.sex`)로 온다.
  `computeTargets` · `loadNutritionDay` · `loadDayDetail` 을 부를 때 넘기는 사용자에 `sex`
  가 있어야 한다(`getCurrentUser` 가 읽어 준다).
- `NutritionProfile.sex` 칸은 더 읽지도 쓰지도 않는다. 옛 배포가 아직 읽을 수 있어서 이번에는
  남겨 두고, 새 배포가 뜬 뒤에 금윤호가 따로 지운다(물 칸 때와 같은 두 단계). 지우는
  마이그레이션은 맨몸 `DROP COLUMN` 으로 두지 않는다 — 먼저 `u."sex" IS NULL` 인 계정을
  `NutritionProfile.sex` 로 채우는 UPDATE 를 한 번 더 넣는다.
- `prisma/migrations/20260926011045_resync_user_sex` 는 **데이터만** 바꾸는 마이그레이션이다.
  일부러 미리 적용하지 않았다 — push 하면 Vercel 빌드가 새 코드를 띄우기 직전에 돌려, 배포
  전까지 옛 영양 화면에서 고른 성별을 계정으로 옮긴다. 받은 뒤 `migrate status` 가 이것을
  '아직 적용 안 됨'으로 보여도 손대지 않는다(배포가 적용한다).
- 개인정보 처리방침의 '가입할 때 (필수)' 줄과 사용설명서에 성별을 적었다.

### 김민 쪽 파일을 고친 것

- `app/login/auth-form.tsx` · `app/actions/auth.ts` — 가입 폼에 성별(`RadioGroup name="sex"`
  required)과 검사. 웨이트 경력(6ac350a)과 같은 방식이다.
- `app/(app)/layout.tsx` — 내 정보에 넘기는 `profile` 에 `sex`, 그리고 `<RefreshOnReturn />`
  한 줄(아래).

### 홈의 '오늘 할 일'을 오른쪽 위 알림(종)으로 옮겼다 (사용자 요청)

- 설정(톱니) 왼쪽에 조금 작은 종을 새로 뒀다(PC 막대의 tail 안, 휴대폰 위 막대). 메뉴(격자)에는
  속하지 않는다. 오늘 체크인이나 투구 기록이 비어 있으면 종에 작은 점이 붙고, 누르면 밑에 작은
  창이 떠서 할 일과 가는 단추(체크인하기 · 기록하기 · 오늘 안 던졌어요)를 보여 준다. 다 했으면
  "지금은 알림이 없어요" + 체크인 고치기 · 오늘 투구 기록 보기.
- 새 파일: `components/notice-bell.tsx`(종·창·`OpenCheckinButton`), `components/use-today-key.ts`
  (체크인 관문에 있던 '오늘 날짜' 구독을 꺼내 둘이 같이 쓴다).
- 김민 쪽 파일을 고친 것:
  - `components/app-shell.tsx` — 종 두 벌(PC·휴대폰), 창 여닫기(바깥·Esc·화면 이동·도크/판이 뜰 때
    닫힘), 체크인 창(Modal + CheckinForm). 다른 화면의 `OpenCheckinButton` 이 보내는 신호
    (`bullpen:open-checkin`)로도 이 체크인 창이 열린다. `DOCK_FALLBACK.right` 120 → 154(종만큼).
  - `app/(app)/layout.tsx` — 최근 사흘 투구 날짜만 읽는 조회 하나(`distinct: ['date']`)와 AppNav 의
    `todo` prop.
  - 홈의 상자 넷을 지웠다(`app/(app)/today/page.tsx`). 그것만 쓰던 `home-tile.tsx` ·
    `today-record.tsx` 도 지웠다. 운동 일정은 트레이닝 탭, 트레이닝 설정은 설정 창에 그대로 있다.
  - '홈의 오늘 체크인'으로 가던 링크(트레이닝 화면 멈춤 카드, 암케어 멈춤, AI 맞춤의 통증 의심,
    PlanForm 의 체크인 먼저)는 그 자리에서 체크인 창을 여는 단추로 바꿨다. '홈에서 투구 기록하기'는
    `/pitch-log/<오늘>` 로 보낸다.

### 쓰지 않는 코드를 치웠다 (사용자 요청)

찾는 쪽과 반박하는 쪽을 따로 두고, 저장소 전체에서 다시 찾아 아무도 안 쓰는 것만 지웠다.
동작은 바뀌지 않는다. 김민 쪽 파일도 있어서 적는다.

- `/dashboard` 는 `/today` 로 넘기기만 하는 화면이라, 그걸 다시 그리던 `revalidatePath('/dashboard')`
  를 뺐다 — `app/actions/checkin.ts` · `exercise-log.ts` · `workout.ts`(주석도). `lib/dal.ts` 의
  `requireAdmin` 은 `/dashboard` 대신 `/today` 로 바로 보낸다.
- 분석이 홈으로 가며 할 일이 없어진 것: `app/actions/ai-report.ts` 의 `revalidatePath('/coach')` 둘,
  `app/actions/training-setup.ts` RETURN_TO 의 `'/coach'`(남겨 준 말대로), `coach/tabs.tsx` 의
  `CoachTabs` · `COACH_VIEWS`(이름 `CoachView` · `readCoachView` 는 그대로), `coach/overview.tsx`
  의 `tabs` 칸.
- `lib/report/plan.ts` 의 `remainingRestDays` — 암케어(7dba2d1)에서 `pendingOuting` 으로 바꾼 뒤로
  부르는 곳이 없다.
- 아무도 안 가져다 쓰는 타입 다시 내보내기 셋: `lib/ai/report.ts` 의 `AiReportBody`,
  `lib/report/training-acwr.ts` 의 `TrainingLoad`, `lib/session.ts` 의 `SessionPayload`.
- 메뉴에서 안 쓰는 아이콘 이름 `calendar` · `chart` · `user`(`lib/nav.ts` · `components/nav-icons.tsx`),
  `app-shell.tsx` Avatar 의 안 쓰는 `size="lg"`, `globals.css` 의 `.overlay-fade` · `.d8` · `.nav-grow.g4`.
- 일부러 남긴 것: `app/(app)/_velocity`(구속 측정, 세워 둔 것), `MOVEMENT_PATTERNS`,
  `lib/armcare/anatomy.ts` 의 `ArmcareMuscle`(지금 만드는 중이라), `lib/exercise-meta.ts` 의
  `usesWeight`(앱에서는 안 쓰지만 training-selftest 가 본다 — 필요 없으면 김민이 정리해 줘),
  `lib/velocity-engine/geometry.ts` 의 `distanceBetween`.

### 프로필 사진이 안 바뀌던 것 (사용자 요청)

- 사진을 올리기 전에 브라우저에서 짧은 변 480px JPG 로 줄인다(`lib/shrink-image.ts`). 큰 폰
  사진이 5MB 에 막히거나 HEIC 가 PC 에서 안 보이던 것이 없어진다.
- 서버는 JPG·PNG·WebP·GIF 만 받는다(`lib/storage.ts` 의 `AVATAR_TYPES`). 사진으로 걸 수 있는
  경로도 `{userId}/avatar-…` 로 좁혔다(`isOwnAvatarPath`) — 폴더만 보면 자기 투구 영상을
  사진으로 걸었다가 다음 사진 교체 때 그 영상이 지워질 수 있었다.
- `components/refresh-on-return.tsx` — 5분 넘게 가려져 있던 탭으로 돌아오면 `router.refresh()`.
  다른 기기에서 바꾼 사진·정보가 켜 둔 탭에도 보이게 한다.
