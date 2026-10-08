# 인아웃식 회원가입 · 영양 온보딩 — 설계 자료(클라우드 세션, 2026-10-08, 미완)

사용자 요청: 인아웃(INOUT) 회원가입 영상을 보고 그 흐름을 불펜로그식으로 녹여 회원가입(웹 · 휴대폰 · 앱)을 전반적으로 바꾸고, 영양 탭 안의 기능은 인아웃과 동일하게, 홈의 영양 기능은 손대지 않고, 모든 질문이 설정 · 계산 · 추천과 연동되게.

클라우드 크레딧이 끝나 **설계 자료까지만** 남긴다. 아래 순서: ① 영상에서 읽은 인아웃 흐름 ② 저장소 지도 8갈래(에이전트가 읽음) ③ 설계안 둘(셋째 안과 심사 · 합치기는 못 함). 메인이 이것을 읽고 단계표를 정해 사용자에게 보인 뒤 만든다.


---

## ① 인아웃 흐름(영상)


한 화면에 질문 하나. 위에 ← 뒤로, 그 밑에 파란 진행 막대(단계마다 조금씩 참), 질문 제목(큰 글씨 두 줄) + 작은 회색 부제(왜 묻는지),
선택지는 둥근 회색 카드(왼쪽 3D 캐릭터 그림 + 글), 고르면 카드가 진해지고(체크 표시), 바닥에 검은 알약 '다음' 단추(답하기 전엔 회색 비활성).
중간중간 '시트'(아래에서 올라오는 흰 판)로 격려 · 설명을 끼운다. 숫자 입력은 단위 토글(cm/ft · kg/lb) + 숫자판.

## 화면 차례
1. **이름** — "반가워요! 앞으로 뭐라고 부를까요?" 부제 "나중에 언제든 변경할 수 있어요". 입력칸 + '✓ 기본 이름 사용'. [다음]
2. **생년월일** — "생년월일을 알려주세요 / 기초대사량 계산에 필요해요". 연 · 월 · 일 휠 피커(2005 08 18).
   → 바로 **성별 시트** "성별을 선택해 주세요" — 여자 · 남자(캐릭터 얼굴 둘, 고르면 색이 진해짐).
3. **사회적 증거 화면(검은 바탕)** — "전세계 50만명의 남성이 이미 인아웃과 함께 변화하고 있어요" + 4.9 앱스토어 평점 · 400만 다운로드 ·
   1.2억 개 기록한 식단 · 오늘의 앱. (성별에 따라 '여성/남성' 문구가 바뀜 — 답이 다음 화면 글에 반영되는 예) [다음]
4. **목표** — "이제 목표를 알려주세요": 감량 · 증량 · 유지어터 · 근육량 증가 · 체지방률 감소 (카드 5개, 캐릭터 그림).
5. **목표 이유** — "체중을 감량하려는 이유는 뭔가요?"(고른 목표가 제목에 들어감 — '근육량을 증가시키려는 이유는 뭔가요?'):
   꾸준하고 건강한 관리 · 더 만족스러운 몸매 · 중요 행사(결혼식, 여름 휴가 등) · 바디프로필.
6. **경험** — "이전에 다이어트나 식단 관리를 해본 적이 있나요?": 처음 해봐 · 몇 번 시도했는데 잘 안 돼 · 꾸준히 잘 해오고 있어!
   → 고르면 **격려 시트**: "지금처럼만 꾸준히 이어가봐요! / 몸은 이미 변화하고 있어요" + 막대 그래프(성공 확률 +17%) +
   "행동과학 연구에 따르면, 식단과 체중을 꾸준히 기록할 때 체중 관리 성공 확률이 약 17% 더 높아져요". [다음]
7. **키** — "목표에 맞는 맞춤 계획을 만들게요 / 먼저 키를 알려주세요". [cm | ft] 토글 + 숫자 입력(177 cm). 숫자판 위에 ∧ ∨ ✓.
8. **체중** — "현재 체중과 목표도 알려주세요". [kg | lb] 토글, '시작 체중' · '목표 체중' 두 칸(88 · 75).
   적으면 밑에 "현재 체중으로부터 **-13kg** 감량 💪"(계산 결과가 바로 보임).
9. **활동량** — "평소 활동량을 알려주세요": 매우 적음(활동이 거의 없는 집돌이 집순이) · 적음(주로 앉아있는 학생이나 직장인) ·
   보통(주 2~3회 정도 운동하는 꾸준러) · 많음(매일 뛰거나 운동하는 갓생러) · 매우 많음(육체 노동 혹은 운동 관련 직업인). 제목 + 설명 두 줄.
10. **속도** — "75kg를 얼마나 빨리 달성하고 싶나요?" 부제 "원하는 수준에 맞는 계획을 세워드릴게요!".
    카드 안에 큰 숫자 "**23주**면 달성할 것으로 예상돼요" + 슬라이더(느리게 · 추천 · 빠르게). 슬라이더를 움직이면 주 수가 바뀜.
11. **물** — "하루에 물은 얼마나 마시나요?": 2L 이상 · 2L 미만 · 잘 모르겠어 → **설명 시트** "인아웃에선 물 섭취량도 기록할 수 있어요"
    (말풍선 "물은 신진대사를 높여 체중 관리에 중요해!"). [다음]
12. **운동 종류(여러 개)** — "평소에 어떤 운동을 하나요? / 여러 개 선택할 수 있어요": 헬스(근력 운동) · 유산소 · 홈트 · 필라테스 · 요가 ·
    걷기/등산 · 스포츠 · 크로스핏 · 수영 … 고르면 오른쪽에 검은 ✓ 동그라미. 밑에 '건너뛰기'. → **설명 화면(보라)** "인아웃에 운동을 기록하면
    🔥 소모 칼로리도 계산돼요". [다음]
13. **코치 고르기(검은 바탕)** — "이제 나만의 코치를 선택해 보세요 / 내게 맞는 맞춤 계획과 식단, 운동도 추천해줘요". 캐릭터 둘을 ‹ › 로 넘기며
    말투 미리보기(채팅 말풍선): '친절한 말랑씨'("안녕! 점심 메뉴 고민 중이구나? 네 하루 목표인 탄단지 40%:40%:20% 비율로 몇 가지 식단을 짜봤어")
    · '팩트폭격 T냥이'("맛있으면 0칼로리라는 건 헛소리다냥"). [친절한 말랑씨 선택]
14. **계획 만드는 중(검은 바탕)** — 캐릭터 + "10% → 32% → 90% → 100%" 진행 막대 "추천 계획 만드는 중…" 밑 카드에 답한 것이 한 줄씩 쌓임:
    21세 남성 → 키 177cm, 현재 체중 88kg → 목표 체중 75kg → 목표는 근육량 증가 → 평소 활동량 보통. (앱 추적 허용 팝업이 끼어듦)
    [추천 계획 확인하기]
15. **추천 계획 완성!** — "약 **23주**면 목표를 달성해요". 🔥 내 기초 대사량 1886kcal · 👟 내 활동 대사량 2452kcal · **목표 칼로리 1839kcal ✎**
    (연필 = 직접 고칠 수 있음). 밑에 체중 곡선 그래프(88kg → 75kg, 파란 곡선, 점선 눈금). 캐릭터 말풍선 "목표 수정도 가능!". [다음으로]
16. **식단 계획 시트** — "마지막으로 식단 계획 선택! / 식단에 맞는 탄단지 섭취량도 계산해 볼게요": 일반(균형 잡힌 탄단지 구성) ·
    운동(단백질을 늘려 근육 생성에 집중) · 키토(탄수화물 제한 & 건강한 지방 섭취) · 비건(동물성 음식 대신 채식 위주로 진행).
17. **추천 탄단지 계산 완료!** — 부제 "섭취량을 바꿀 수도 있어요". 순탄수 **276** g ×4 = 1103kcal 60% / 단백질 **92** g ×4 = 368kcal 20% /
    지방 **41** g ×9 = 368kcal 20% → 🔥 내 목표 칼로리 1839kcal. g 칸을 직접 고칠 수 있고 kcal · % 가 따라 바뀜(색 점 네 개가 뜸 = 저장 중 표시).
18. **설명 시트** — "인아웃에서는 식단 외에도 다양한 기록을 할 수 있어요"(물 · 걸음 수 · 운동 · 영양제 · 체중 · 인바디 그림). [다음]
19. **알림 허용** — 위에 '나의 목표: 75kg' 노란 알약. "목표 달성을 위해 꾸준한 습관을 만들어봐요!" + "다음 화면에서 '허용'을 눌러주세요".
    [확인했어요] (iOS 알림 허용 팝업). 밑 "나중에 언제든지 변경할 수 있어요".
20. **격려** — "대단해요! 이미 **상위 33%**예요" + 도넛 66% "66% 이상이 계획조차 세우지 못하고 포기해요". [다음]
21. **약속(서명)** — "인아웃과 약속해요!" "나는 오늘부터 인아웃에서 건강하고 꾸준한 다이어트를 하겠습니다" 손글씨 서명 칸(캐릭터가 말풍선
    '여기에 서명해 주세요', ✕ 로 지움) → 그리면 [다음으로]가 활성. "*서명은 별도로 저장되지 않아요!"
22. **사회적 증거 + 기대 시트** — "250만명과 함께하면 성공할 수 있어요!" 4.9 평점 · 후기 카드 → 시트 "앞으로의 변화가 기대되나요?"
    별로예요 · 아직 모르겠어요 · 기대돼요(얼굴 셋).
23. **나의 목표 카드(요약)** — 캐릭터 + 남 / 21세 · 177cm · 활동량 보통 · 운동 식단 / 시작 체중 88kg → 목표 체중 75kg /
    목표 칼로리 1839kcal · 목표 탄단지 60 : 20 : 20 / 2026. 10. 08 (서명) + 도장 그림. [인아웃 시작하기]
24. (유료 안내 — 건너뜀) → **홈 '기록' 탭**: 날짜 띠(10.7 수 · 10.8 오늘 · 10.9), '나의 하루' [자세히 | 한눈에], 큰 숫자 **0 / 1839 kcal**,
    탄 0% · 단 0% · 지 0% 알약, 캐릭터, "🔥 0kcal 소모 | 1839kcal 더 먹을 수 있어요", 순탄수 0/276g · 단백질 0/92g · 지방 0/41g 막대,
    당류 0g · 나트륨 0mg. 위 탭 [기록 | 단식 | 통계], 아래 탭 기록 · 말랑 AI · 배틀 · 커뮤니티 · 사과월드 · 마이룸.

## 눈에 띄는 설계 원칙(불펜로그에 가져올 것)
- 질문마다 **왜 묻는지** 부제로 말한다(생년월일 → 기초대사량). 답이 다음 화면 글에 바로 들어간다(성별 → '남성이', 목표 → '감량하려는 이유').
- 계산 결과를 **그 자리에서** 보여 준다(목표 체중을 적으면 −13kg, 속도 슬라이더를 움직이면 N주).
- 숫자(기초대사량 · 활동대사량 · 목표 칼로리 · 탄단지 g · %)를 **보여 주고 고치게** 한다. 식단 스타일을 고르면 탄단지 비율이 바뀐다.
- 중간에 **격려 · 설명 · 사회적 증거**를 끼워 지루함을 끊는다. 마지막에 '나의 목표' 카드 한 장으로 요약 + 약속.
- 선택지는 큰 카드, 하나 고르면 바로 다음(또는 '다음' 활성), 여러 개 고르기는 ✓, 건너뛰기 허용.
- 홈은 '오늘 얼마나 먹었나'를 큰 숫자 하나 + 탄단지 막대로.


---

## ② 저장소 지도(에이전트 8명이 읽음)


### 지도 1

## signup 갈래 지도 — 지금 회원가입이 무엇을 · 왜 · 어디에 · 누가 읽나

### 1. 파일 구조와 흐름
- `app/login/page.tsx:31-38` — 정적 화면(쿠키 · 헤더를 읽지 않음, 주석 :9-26 에 까닭: CDN 61ms vs 258ms). `<main class="seam-hero … min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))]">` 안에 `<AuthForm today={todayKey()} />` 하나. 앱(네이티브) 판단은 서버가 못 하고 클라이언트 `<html data-app="native">`(`lib/native-app.ts:25-27`, UA 에 `BullpenLogApp`)로만 한다.
- `app/login/auth-form.tsx`(1,437줄, 'use client')
  - :56 `inputLarge`(py-3.5 text-[15px]) · :62-66 `noAutoFix`(아이폰이 비밀번호 첫 글자를 대문자로 바꾸던 것).
  - :80-166 **`AuthCard`** — 공통 틀. `title · desc · titleKey · progress(0~1) · counter('3 / 7') · focusHeading · footer`. 진행 막대 :113-123(카드 맨 위 h-1, bg-sky, width 500ms 전환). **휴대폰(<md)**: 카드 테두리 없음 · 화면 높이를 다 쓰는 세로 줄, 제목 위 · 단추 아래 고정(:107-112 `max-md:min-h-full max-md:flex-1`). **PC(md+)**: `rounded-[28px] border` 카드, 두 칸 격자 `md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]`(:125) 왼쪽 로고 + 제목 + 부제, 오른쪽 칸 + 단추(오른쪽 아래). 오른쪽 칸 `md:min-h-[23.75rem]`(:152)로 단계마다 단추가 안 튀게. 제목 묶음은 `key={titleKey}` 로 다시 그려 `animate-fade-in`(:136). 로고 링크는 앱에서 못 누름(:130 `in-data-[app=native]:pointer-events-none`). `short:`(세로 ≤700px, globals.css:27) 에서 여백 축소.
  - :169 `TextButton`(글자 단추) · :188 `SubmitButton`(useFormStatus pending).
  - :217-246 `CheckLine` · :252-398 **`LoginForm`**(자동 로그인 · 아이디 기억 = localStorage `lib/login-prefs.ts:190-191`, 실패 뒤 useLayoutEffect 로 체크 복원 :287-295).
  - :406-449 **`STEPS`** 일곱 단계 `{key,title,desc,fields}` — `fields` 는 서버가 돌려준 `AuthState.field` 로 어느 단계로 되돌아갈지 찾는 열쇠(:457-462 `stepOfField`, 못 찾으면 0).
  - :476-581 **`checkStep`** — 단계별 클라이언트 검사(서버와 같은 기준). 폼은 `noValidate`(:1059) — 모든 단계가 한 `<form>` 안에 숨겨져 있어 브라우저 기본 검사는 숨은 required 때문에 '다음'을 막는다(:472-474). 숫자 칸의 `validity.badInput` 따로 봄(:534-537).
  - :584 `invalidProps`(aria-invalid + aria-describedby=`signup-problem`).
  - :597-657 **`Choices`** — 라디오 칩 묶음(`peer sr-only` input + span). 기본은 `flex-wrap` 칩(px-4 py-2.5 text-sm ≈ 40px), `list` 면 2열 카드(이름 굵게 + `desc` 한 줄, 웨이트 경력에만 씀). **고르면 바로 넘어가지 않는다 — '다음'을 눌러야 한다.**
  - :660-682 `LegalLink`(href 유지 + 창으로 열기, ⌘/Ctrl 은 새 탭) · :685-713 `AgreeLine`(`data-sync` 로 폼 리셋 뒤 복원).
  - :728-843 **`BirthDateField`** — 숨은 `<input name="birthDate">` + 단추 + `MiniCalendar`(components/mini-calendar.tsx, `pickYear` · `min/max` = 오늘 − MAX_AGE/MIN_AGE, `viewFrom` 15년 전)를 `createPortal(document.body)` 로 칸 밑/위에 띄움(:749-766 자리 계산). 값 'YYYY-MM-DD' 문자열.
  - :853-1408 **`SignupWizard`** — `useActionState(guardFormAction(signup, { field: 'competitionLevel' }))`(:866-869, 오프라인이면 마지막 단계에 한 줄). 상태: `step · dir('next'|'back') · checking · problem{error,field,seq}`(:873-877). **상태로 쥐는 칸**: password · passwordConfirm · showPassword · agreeTerms · agreePrivacy · birthDate · signupEmail(:889-902) — React 19 가 액션 뒤 폼을 리셋해도 남게(비밀번호는 서버가 `values` 로 안 돌려줌 `lib/form-values.ts:126`). 서버 오류 → 그 칸의 단계로 되돌림(:910-919, 그리는 중 상태 보정). `data-sync` 체크박스 복원 :927-933. 초점 관리 :936-973(단계 첫 칸 / 문제 칸 / 숨은 칸이면 `${name}-button`). **`next()`** :981-1003 — checkStep → basic 단계면 `checkSignupEmail` 로 중복 이메일 미리 확인(실패해도 넘어감 :995-997) → `goTo`. `back` :1005. `allGood` :1011-1023(보내기 전 전 단계 재검사). Enter 처리 :1029-1042(같은 단계의 다음 글 칸 → 없으면 다음/제출). **`panel(i)`** :1049-1053 — 모든 단계를 다 그려 두고 `hidden`, 보이는 것만 `animate-step-next/back`(globals.css:1216-1233, 340ms, ±28px 밀려 들어옴). 꼬리 :1074-1101: 0단계면 [로그인하기] 아니면 [이전], 마지막 전엔 [다음](checking 이면 '확인 중…', **답하기 전에도 활성**) 마지막은 [가입하고 시작하기]. sr-only live 안내 :1104. 문제 줄 :1386-1396(`role=alert`, `key=seq`, text-[13px]). `LegalSheet` :1399-1405.
  - :1413-1437 **`AuthForm`** — `mode` login|signup, `key={mode}` 로 통째로 fade-in, `switched` 면 제목에 초점.
- `app/actions/auth.ts`
  - :76-86 `checkSignupEmail(raw)` — 형식 + 중복만(계정 안 만듦).
  - :93-95 `signup` = `withInput(trySignup)`. **:97-225 `trySignup` 검사 차례**: email/nickname/password 빈칸 :105-107 → 이메일 형식 :108 → 닉네임 2자 :111 → 비밀번호 8자 :114 → 확인 :117-122 → `agreeTerms`/`agreePrivacy === 'on'` :130-135 → `validateProfile(birthDate, heightCm, {requireBirthDate:true})` :138-143 → `sex`(**`formData.has('sex')` 일 때만 필수** — 옛 화면 호환 :156-163) → `validateBaseline`(freq · volume · intensity · workoutFreq · throwingHand 필수, competitionLevel 은 빈칸 허용) :166-174 → `levelAgeProblem`(소속 ↔ 생년월일) :177-182 → `readTrainingProfile` trainingLevel 필수 :191-194 → 중복 이메일 :196 → `ADMIN_EMAIL` 이면 role ADMIN :201-202 → bcrypt :204 → **`prisma.user.create`** :205-217 (email · nickname · password · role · birthDate · heightCm · sex · baselineFreq · baselineVolume · baselineIntensity · baselineWorkoutFreq · throwingHand · competitionLevel · trainingLevel) → `createSession(persist 기본 true)` :219-223 → `redirect('/today')` :224. **NutritionProfile 은 만들지 않는다.**
  - login :227-268(`stayLoggedIn` 있으면 30일) · logout :270 · changePassword :291 · deleteAccount :352.
- 가입 뒤: `/today` → `(app)/layout.tsx:175` **CheckinGate 가 곧바로 앞을 막고**(components/checkin-gate.tsx:17-36), 홈은 `first-day-card.tsx`(오늘 던져도 되는 양 + 단추). 영양 탭은 몸무게가 없어 '내 정보에 몸무게를 넣으면 목표가 더 정확해요'(`nutrition-view.tsx:1484-1501`, `targets.assumed`).

### 2. 단계표 — 무엇을 · 왜(화면 부제) · 어디에 · 누가 읽나

| # | key(:줄) | 묻는 것(칸 name) | 화면이 말하는 '왜' | 저장(User 칸, schema.prisma) | 읽는 곳 |
|---|---|---|---|---|---|
| 1 | `basic` :407 | email · nickname · birthDate(달력) · sex(남/여 칩) | "생년월일은 나이에 맞는 안전한 투구수를, 성별은 영양 목표를 계산하는 데 써요"(닉네임 · 이메일의 까닭은 없음) | `email`, `nickname`, `birthDate @db.Date`(:33), `sex 'M'\|'F'`(:37) | 나이: `lib/report/plan.ts:347` `dailyPitchCap(age)`(gather.ts:96), `lib/nutrition/targets.ts:130` `ageOn` → :146 `basalKcal`(18세 밑 Schofield) · `lib/nutrition/age.ts` ageBand(child/teen/adult 가 단백질 g/kg · 감량 허용 · 속도를 정함), `(app)/layout.tsx:163` 팔 통증 안내(만 15세), `components/level-choices.tsx:51` levelFit. 성별: `targets.ts:152`(+5/−161, 모르면 −78), `load.ts:398`, `day-detail.ts:144`; 비면 `assumed:'sex'` 알림 |
| 2 | `password` :413 | password · passwordConfirm(+ 비밀번호 표시) | "8자 이상이면 돼요" | `password`(bcrypt) | 로그인 · `passwordFingerprint` 세션 지문(session.ts:50) |
| 3 | `terms` :419 | agreeTerms · agreePrivacy(모두 동의 편의) | "두 가지 모두 동의해야 가입할 수 있어요" | **저장 안 함**(서버가 'on' 인지만 봄 :130) | 없음 |
| 4 | `body` :425 | throwingHand(우투/좌투/양투) · heightCm(선택, 숫자 칸 100~250) | "이제 이 앱에 필요한 것을 몇 가지 여쭤볼게요" | `throwingHand`(:50), `heightCm Int?`(:39) | 손: `training/armcare-section.tsx:93-94`(`throwingSide`, 양투 `bothHands`), `mechanics-section.tsx:41`, `routine/[id]/page.tsx:92`, `library/training/page.tsx:109`, `velocity/measure/page.tsx:31`(구종 전형값 거울 `session-types.ts:45`). 키: `lib/pose/measure.ts:107` cmPerPx, `targets.ts:164`(없으면 178 짐작), `weight-goal.ts:473` BMI 바닥, `pitch-lab-meta.ts:72` |
| 5 | `pitching` :431 | baselineFreq(주 0~1/2~3/4+) · baselineVolume(30 이하/30~60/60+) · baselineIntensity(캐치볼/절반/전력) | "부하 지수를 첫날부터 보여드리기 위한 3문항이에요" | `baselineFreq/Volume/Intensity`(:58-60) | `lib/baseline.ts:293-306` `estimateDailyLoad` = 회수×구수×강도/7 → `lib/report/gather.ts:99` `baselineDailyLoad`(ACWR 씨앗), `coach/overview.tsx:120`, `armcare/today.ts:45` |
| 6 | `weight` :437 | baselineWorkoutFreq(거의 안 함/1~2/3~4/5+) · trainingLevel(입문/초급/중급/상급, 설명 카드) | "운동 부하를 첫날부터 보여드리고 경력에 맞는 운동을 고르기 위한 2문항이에요" | `baselineWorkoutFreq`(:65), `trainingLevel`(:72) | `lib/baseline.ts:320-331` `estimateTrainingDailyLoad`(× dailyWorkoutMinutes 기본 60 × 0.17) → `lib/report/training-acwr.ts:94`; 경력: `lib/report/personalize.ts:28-56` allow/prefer → `filterByLevel` (`today-data.ts:158`, `daily-plan.ts:182`, `armcare/today.ts:154`, `program/program.ts:878-886`, `program/load.ts:366,461`), `prescription.ts:275` 입문 규칙 |
| 7 | `league` :443 | competitionLevel(초등~프로 7칸, 생년월일로 막힘 · 학교 나이면 미리 골라짐) | "생년월일에 맞는 소속만 고를 수 있어요. 나중에 비슷한 또래와 견줘 보여드리려고" | `competitionLevel`(:56) | **아무 계산도 안 읽는다**(`lib/baseline.ts:16,77`, 모으기만). 유일한 '답이 다음 화면에 반영' 예: `level-choices.tsx:98-105` 학년 글이 생년월일 따라 다시 뜸 |

가입에서 **안 받는 것**(영양이 짐작하거나 비어 있음): 몸무게(`targets.ts:92` FALLBACK 75kg → `assumed:'weight'`; 실제 값은 `load.ts:376` `today?.kg ?? latestKg ?? user.weightKg`), 목표(gain/maintain/lose) · 활동량(low/mid/high, `lib/nutrition/meta.ts:44-67`) · 목표 체중 · 속도 · 식단 취향(`NutritionProfile` schema :1189-1230, 영양 탭 `goal-sheet.tsx` 에서만 정함), 하루 운동 시간(`dailyWorkoutMinutes`, 내 정보).

### 3. 앱(네이티브)과 웹의 다른 점
- 앱은 `mobile/capacitor.config.json` 이 `https://bullpen-log.vercel.app/today` 를 열고 세션이 없으면 `lib/dal.ts:70` 이 `/login` 으로 보냄. UA `BullpenLogApp/1.0` → `<html data-app="native">`. 소개 화면(`app/page.tsx:53-55`)은 앱에서 안 보임.
- 가입 화면 안에서 다른 것: 로고 링크 비활성(:130), 약관은 새 탭 대신 창(`components/legal-sheet.tsx:6-12` — 새 탭이 사파리로 튕겼다), 키체인용 숨은 username 칸(:1168-1176), `noAutoFix`(:58-66), 누르는 줄 44px(`CheckLine` :231-233). 안전 영역: 로그인 경로에 `data-safe-area` 가 없어 `html[data-app='native'] body` 가 위 여백을 받고(globals.css:2650) main 이 그만큼 뺀 높이를 씀(page.tsx:34).
- 휴대폰 vs PC 는 기기가 아니라 너비(`md`)로 가른다 — AuthCard 설명 참조. 입력칸은 휴대폰이 테두리 없는 회색 면, PC 가 테두리 칸(`components/ui.tsx:177-178`).

### 4. 글 말투 검사
- 화면 글은 모두 해요체, `—` 는 코드 주석에만 있다(:364 · :1150 · :1165 · :1225 · :1334 · :1364 · :1381 전부 주석). 격식체 '모두 동의합니다' · '에 동의합니다'(:1244 · :1256 · :1266)는 '가입 동의' 예외에 해당. 오류 글은 '~해주세요' 꼴(auth.ts · checkStep). 로그인 부제 '로그인하세요'(:307)는 하세요체.
- 규칙과 어긋나는 기존 것: 임의 px 글자 `text-[15px]`(:56 · :145), `text-[13px]`(:1391), `text-[1.75rem]`(:140) — 금윤호 메모 '임의 px 글자 쓰지 않는다'에 걸린다(새로 만들 때 따라 하지 말 것).

**그대로 쓸 수 있는 것**
- app/login/auth-form.tsx:80-166 `AuthCard` — 제목 · 부제 · 진행 막대 · 카운터 · 꼬리 단추, 휴대폰(테두리 없음 · 제목 위 · 단추 아래) / PC(두 칸 카드) 둘 다 이미 됨. 인아웃식 '한 화면 한 질문' 틀로 그대로 쓰고 안쪽 children 만 큰 카드로 바꾸면 된다
- app/login/auth-form.tsx:406-462 `STEPS` + `stepOfField` + :476-581 `checkStep` — 단계 정의 · 서버 `field` → 단계 되돌림 · 단계별 검사 패턴. 새 질문은 STEPS 에 {key,title,desc,fields} 한 줄 + checkStep case 하나(TS switch 가 빠진 case 를 잡아 준다)
- app/login/auth-form.tsx:1049-1053 `panel()` + app/globals.css:1216-1233 `animate-step-next/back` — 다음은 오른쪽에서 · 이전은 왼쪽에서 340ms. 인아웃 전환과 같은 느낌이라 그대로
- app/login/auth-form.tsx:597-657 `Choices` — peer sr-only 라디오 + span 칩/카드(`list` 면 2열 카드에 `desc`). 큰 그림 카드(인아웃 선택지)는 이 구조에 그림 슬롯과 체크 표시를 더하면 된다; `TRAINING_LEVELS`(lib/report/personalize.ts:28-56)가 이미 name+desc 꼴
- components/level-choices.tsx:48-105 `LevelChoices` — 앞 답(생년월일)에 따라 선택지가 막히고 먼저 골라지고 안내 글이 다시 뜨는(`key={fit.grade}` fade-in) 유일한 기존 예. '답이 다음 화면에 반영'의 본보기
- app/login/auth-form.tsx:728-843 `BirthDateField` + components/mini-calendar.tsx(`pickYear` · `min/max` · `viewFrom`) — 생년월일 입력. lib/profile.ts:74-75 MIN_AGE 5 · MAX_AGE 100 과 같은 선
- app/login/auth-form.tsx:853-1003 `SignupWizard` 의 상태 관리 — 비밀번호 · 동의 · 생년월일을 상태로 쥐어 폼 리셋을 견디는 법(:889-902), `data-sync` 복원(:927-933), 초점 이동(:936-973), `next()` 의 이메일 미리 확인(:988-1000), Enter 처리(:1029-1042)
- app/actions/auth.ts:76-86 `checkSignupEmail` — 첫 단계에서 중복 이메일 미리 확인(계정 안 만듦). 긴 온보딩일수록 필요
- app/actions/auth.ts:97-225 `trySignup` 의 검사 차례와 `prisma.user.create`; 서버 검사기 lib/profile.ts:111 `validateProfile` · lib/baseline.ts:236 `validateBaseline` · :194 `levelAgeProblem` · lib/report/personalize.ts:383 `readTrainingProfile` — 새 칸도 같은 꼴로 추가. 내 정보 저장 app/actions/profile.ts:39-120 이 같은 검사기를 써서 '나중에 언제든 변경'이 이미 보장됨(app/(app)/profile/profile-form.tsx:400-490)
- lib/action-offline.ts:86 `guardFormAction` · lib/form-values.ts:129 `keepInput` · :151 `withInput` · :165 `kept` — 신호 끊김 · 서버 오류에도 적은 값이 남는 길. components/safe-form.tsx `SafeForm` 은 redirect 로 끝나는 단순 폼용
- lib/nutrition/targets.ts:146 `basalKcal` · :158 `computeTargets`(순수, 클라이언트에서 import 가능 — app/(app)/nutrition/goal-sheet.tsx:19-24 가 이미 그렇게 씀) — 가입 중에 '기초대사량 N · 목표 칼로리 N' 을 그 자리에서 보여 주는 데 그대로 쓸 수 있다. lib/nutrition/age.ts `ageRule · effectiveGoal · effectiveRate · paceChoices · paceDelta`, lib/nutrition/weight-goal.ts `etaWeeks · targetRange · checkTargetWeight`(goal-sheet.tsx:31-40) → 인아웃의 '23주면 달성' 미리보기
- lib/nutrition/meta.ts:44-48 `GOALS`(증량/유지/감량, hint 포함) · :63-67 `ACTIVITIES`(적음/보통/많음, factor 1.3/1.5/1.7) · lib/nutrition/diet-prefs.ts:11-62 `SEASON_PHASES · DIET_STYLES · MEAL_PATTERNS · AVOIDS` — 인아웃의 목표 · 활동량 · 식단 계획 · 못 먹는 것(여러 개) 질문에 대응하는 선택지와 hint 가 이미 있다(저장 칸은 NutritionProfile schema.prisma:1189-1230)
- lib/baseline.ts:293 `estimateDailyLoad` · :320 `estimateTrainingDailyLoad` — 투구 · 웨이트 문진을 답하면 '첫날부터 부하 지수 N' 을 그 자리에서 보여 줄 수 있는 순수 함수
- lib/units.ts:53-68 `toLength · fromLength · toWeight · fromWeight` · :88 `round1` · components/use-units.ts `useWeightUnit` · components/unit-toggle.tsx — 인아웃의 cm/ft · kg/lb 토글. 저장은 늘 cm · kg(app/actions/profile.ts:77-82 주석)
- components/modal.tsx:43 `useModalState` · :77 `Modal`(휴대폰은 아래 시트 `data-sheet` globals.css:2156-2173 · 손잡이 · 끌어내려 닫기, PC 는 가운데 창) — 인아웃의 격려 · 설명 '시트'. components/legal-sheet.tsx 가 쓰는 법의 예
- components/segmented.tsx:93 `Segmented` · components/choice-inputs.tsx:37 `CheckboxGroup`(여러 개 고르기 ✓) · :76 `RadioGroup` · components/settings-list.tsx `ListGroup · SelectRow` · components/ui.tsx:153 `Button` · :180 `Field` · :200 `Input` · :263 `FormError`
- components/toast.tsx `toast` · lib/haptics.ts `buzz · haptic`(라디오 · 체크는 저절로 떨림 components/haptic-feedback.tsx) · components/press-feedback.tsx 누름 표시 저절로
- app/login/auth-form.tsx:62 `noAutoFix` · :1168-1176 키체인 username 숨은 칸 · :660-713 `LegalLink · AgreeLine` · components/legal-sheet.tsx `LegalSheet · wantsNewTab` — 아이폰에서 깨지지 않게 이미 손본 것들
- lib/login-prefs.ts `readLoginPrefs · saveLoginPrefs` — 로그인 쪽은 그대로 둘 수 있다
- lib/dal.ts:24-39 `getCurrentUser` 의 select 목록 — 가입에서 새 User 칸을 받으면 여기에 넣어야 읽힌다

**빈 곳(인아웃과 견줘)**
- 한 화면에 질문 여럿 — 1단계(basic)에 이메일 · 닉네임 · 생년월일 · 성별 넷, 5단계에 투구 셋, 6단계에 둘이 함께 있다(auth-form.tsx:1108-1161 · 1303-1361). 인아웃은 질문 하나 + 큰 제목 두 줄 + '왜' 부제. STEPS 의 desc 는 단계 하나에 한 줄뿐이라 '닉네임을 왜 묻는지' 같은 질문별 까닭이 없다
- 답이 다음 화면 글에 들어가지 않는다 — 성별 · 목표 · 이름을 뒤 화면 제목에 넣는 자리가 없다(STEPS 의 title 은 상수 :406-449). 유일한 예외가 LevelChoices 의 학년 안내(level-choices.tsx:98-105). 인아웃식이면 title 을 함수(답 → 글)로 바꿔야 한다
- 계산 결과를 그 자리에서 보여 주지 않는다 — 몸무게 · 목표 · 활동량을 가입에서 안 받으니 기초대사량 · 목표 칼로리 · 탄단지 · '몇 주면 달성'을 보여 줄 재료가 없다. 가입 뒤 영양 탭은 75kg 짐작(targets.ts:92)으로 시작하고 '내 정보에 몸무게를 넣으면' 알림(nutrition-view.tsx:1484)이 뜬다. 부하 지수 쪽도 estimateDailyLoad 가 있는데 가입 화면이 숫자를 안 보여 준다
- 가입이 NutritionProfile 을 만들지 않는다(auth.ts:205-217 은 User 만). 목표(gain/maintain/lose) · 활동량 · 목표 체중 · 속도 · 식단 스타일 · 끼니 구성 · 못 먹는 것 · 시즌 단계는 영양 탭 goal-sheet.tsx 에서만 정한다 — 인아웃처럼 온보딩에서 받으려면 가입 서버 동작이 User.weightKg 와 NutritionProfile 줄까지 같이 써야 한다(한 요청 안에서, 같은 검사기 app/actions/nutrition.ts saveNutritionProfile 의 규칙으로)
- 선택지가 작은 칩이다(Choices :634-640 px-4 py-2.5 text-sm) — 인아웃의 왼쪽 그림 + 제목 + 설명 두 줄의 큰 카드가 아니다. `list` 변형(2열 · desc)이 가장 가깝다. 고르면 체크 표시 없음, 고르자마자 넘어가지도 않음
- '다음' 단추가 답하기 전에도 활성이다(:1082-1089 disabled 는 checking 때만) — 인아웃은 답하기 전 회색 비활성. 지금은 누르면 빨간 오류 줄(:1386)로 알린다
- 숫자 입력 — 키는 `<input type=number>` 한 칸(:1286-1297), 단위 토글(cm/ft · kg/lb) 없음, 몸무게 · 목표 체중 칸 없음. lib/units.ts 가 변환은 갖고 있다. 생년월일은 휠 피커 대신 달력 팝업(BirthDateField)
- 차례 — 이메일 → 비밀번호 → 약관이 1~3단계로 먼저 온다. 인아웃은 이름부터 묻고 계정은 뒤. 다만 이메일을 뒤로 보내면 checkSignupEmail 의 '끝까지 가서 막히지 않게'(auth.ts:68-75)가 사라지니, 이름(닉네임)만 앞으로 빼고 이메일 · 비밀번호 · 약관은 마지막 묶음으로 두는 식이 안전하다
- 격려 · 설명 · 사회적 증거 · '계획 만드는 중' · 요약 카드 · 약속(서명) · 알림 허용 · 코치 고르기 화면이 하나도 없다. 가입 끝은 redirect('/today')(auth.ts:224) 뒤 곧바로 CheckinGate 가 앞을 막는다((app)/layout.tsx:175) — '추천 계획 완성' 화면을 넣으려면 redirect 전(가입 폼 마지막 단계) 또는 /today 로 가기 전의 중간 화면이 필요하다
- 건너뛰기 없음 — 키는 선택이지만 '건너뛰기' 단추가 아니라 빈칸으로 두는 식(hint '선택이에요' :1285). 여러 개 고르기 질문(인아웃 운동 종류)이 없다 — CheckboxGroup(choice-inputs.tsx:37)은 있다
- 위 왼쪽 ← 뒤로가 없다 — '이전'은 꼬리의 글자 단추(:1079), 카운터 '3 / 7'(:1072). 진행 막대는 있다(:113-123)
- 성별이 1단계 안의 작은 칩 둘(SEX_OPTIONS :1153-1160) — 인아웃은 생년월일 뒤 시트에서 얼굴 그림 둘. 소속 · 던지는 손 · 경력도 모두 칩
- competitionLevel 은 아무 계산도 안 읽는다(lib/baseline.ts:16,77) — 사용자 요구 '질문에는 이유가 있고 설정 · 계산이 바뀐다'에 가장 어긋나는 문항. 쓸 곳을 잇거나(또래 비교 · 나이별 안내) 뒤로 보내야 한다
- 휴대폰 · PC 를 기기가 아니라 너비(md)로 가른다 — 앱 전용 모양(예: 상태 막대 밑 ← 화살표, 시트식 격려)은 `in-data-[app=native]:` 나 클라이언트 data-app 검사로만 가능(로그인 화면은 정적이라 서버 UA 분기가 안 됨 page.tsx:9-26)

**위험 · 지킬 규칙**
- 모든 단계가 한 `<form>` 안에 다 그려져 있고(hidden) `noValidate` 다(auth-form.tsx:1049-1066, 까닭 :472-474). 단계를 화면 단위 라우트나 여러 폼으로 쪼개면 서버 `field` → 단계 되돌림(:910-919) · Enter 처리(:1034 `closest('[data-step]')`) · 초점 이동(:957) · 키체인 username 칸(:1168, 비밀번호와 같은 폼이어야 함)이 함께 깨진다
- 서버가 돌려주는 `AuthState.field` 는 STEPS[].fields 안에 있어야 한다 — 없으면 0단계로 간다(:457-462). 새 칸은 서버 오류의 field 이름과 STEPS.fields 둘 다에 넣는다. `guardFormAction(signup, { field: 'competitionLevel' })`(:867)은 오프라인 오류를 '마지막 단계'로 보내는 것이라 마지막 단계가 바뀌면 같이 고친다
- React 19 는 액션이 끝나면 폼을 리셋한다 — 서버가 `values` 로 돌려주지 않는 것(비밀번호 lib/form-values.ts:126)과 제어 칸은 상태로 쥐어야 남는다(:881-895). 체크박스는 `data-sync`(:927-933). 새로 넣는 몸무게 · 목표 · 활동량 같은 제어 칸도 같은 패턴이 아니면 서버 오류 한 번에 사라진다
- `formData.has('sex')` 로 옛 화면을 받아 준다(auth.ts:152-163 주석) — 새 필수 칸도 같은 고민: 오래 열어 둔 옛 가입 화면이 보낸 요청을 막을지 비워 둘지 정하고 주석에 남긴다
- `checkSignupEmail` 을 첫 단계에서 부르는 까닭(auth.ts:68-75)과 '확인 못 하면 그냥 넘어간다'(:995-997) — 이메일 단계를 옮겨도 이 미리 확인은 그 단계에 붙여 둔다
- 생년월일은 'YYYY-MM-DD' 문자열로 화면과 서버가 같은 답을 내야 한다(lib/baseline.ts:134 schoolGrade · level-choices.tsx:51 · auth.ts:177-182). 입력 방식을 휠로 바꿔도 숨은 `name="birthDate"` 값 꼴은 지킨다. 고를 수 있는 나이 MIN_AGE 5 · MAX_AGE 100(lib/profile.ts:74-75)
- 로그인 화면은 정적(CDN)이다 — page.tsx 에서 cookies() · headers() 를 읽으면 요청마다 서버가 깨어 61ms → 258ms(page.tsx:9-26). 앱/웹 분기는 클라이언트(`data-app`)로만. `today` 는 page.tsx:5-7 처럼 함수로 감싸 렌더 중 new Date() 를 직접 안 읽는다
- 한 화면 안에 다 들어와 굴리지 않아야 한다(auth-form.tsx:47-50 — 360×640~1920×1080 재 봄). `short:`(세로 ≤700, globals.css:27) · 오른쪽 칸 `md:min-h-[23.75rem]`(:152) 가 그 장치. 큰 그림 카드 5개를 넣으면 작은 폰에서 넘친다 — 금윤호 메모의 두 높이(1920×960 · 1536×700)와 폰 375 로 잰다
- 아이폰: `noAutoFix`(:58-66, 비밀번호 대문자 사고) · 16px 밑 입력칸 확대(globals.css 끝 pointer:coarse) · 새 탭 링크는 사파리로 튕김 → Modal/LegalSheet(legal-sheet.tsx:6-12) · 누르는 자리 44px · 바닥 단추는 `bottom: var(--kb,0px)`(자판) · 첫 화면 그리면 `bullpenIntro` 'ready'(lib/native-app.ts:45) — 뿌리 레이아웃 · 첫 스크립트를 건드리면 지킨다
- 금윤호 메모의 화면 규칙: 해요체 · 줄표 없음 · 문장 속 굵게 없음(현재 :1267-1268 `<strong>건강에 관한 정보</strong>` 가 있다 — 새 글에서는 안 씀), 임의 px 글자 금지(지금 :56 · :145 · :1391 에 있음 — 따라 하지 말 것), 폰 단추 48px(h-12) · 칩 40px · 목록 줄 56px, 고르기는 Segmented, 창은 Modal(폰 시트), `window.confirm` 금지, 애니메이션은 기본(들어옴 160~200ms · 나감 ~120ms, `motion-safe:`), UI 고친 뒤 `impeccable detect --json`
- DB: `prisma migrate dev` · `db push` 금지, schema 고침 → `migrate diff` SQL 저장 → `npm run backup` → `migrate deploy` → `generate`, 김민에게 미리 말하고 HANDOFF.md 에 적음. 새 칸은 `?` 또는 `@default`. `npx prisma format` 금지(남의 줄까지 바뀜). `User.sex` 는 User 에 두고 NutritionProfile 에 다시 만들지 않는다(2026-10-03 에 뺌, schema :1192-1194). 새 User 칸은 lib/dal.ts:24-39 select 에도 넣는다
- 몸무게를 받으면 `User.weightKg`(Float, kg, 20~200 lib/profile.ts:21-22 `checkOptionalNumber`)에 kg 으로만 저장(단위 변환은 화면). 영양은 `load.ts:376` 차례(오늘 기록 → 최근 → user.weightKg)로 읽으니 거기에 넣으면 `assumed:'weight'` 알림이 저절로 사라진다
- 가입 직후 `/today` 는 CheckinGate(components/checkin-gate.tsx:17-36)가 먼저 뜬다 — 온보딩 끝 화면을 /today 안에 넣으면 관문과 겹친다. 홈의 영양 카드(today/nutrition-card.tsx)는 사용자가 '만지지 말라'고 한 영역
- `STEPS` 가 `as const` 튜플이고 `checkStep` 의 switch 가 StepKey 를 다 덮어야 컴파일된다(:451 · :476-581) — 단계를 더하면 case 를 빠뜨릴 수 없다(좋은 안전장치지만 빌드가 막힌다). `LAST` · 진행률 `(step+1)/STEPS.length`(:1071) · 카운터 · sr-only 안내(:1105)가 길이를 따라간다
- 영양 목표의 나이 한도는 '읽을 때' 건다(lib/nutrition/age.ts 머리 주석 — 어린이 감량 불가 · 성장기 −200 까지) — 온보딩에서 목표를 묻더라도 성장기에 '덜 먹어라' 류 글을 보이지 않게 ageBand 로 선택지를 가른다(메인 추천 9번 · 영양 조언 규칙과 같은 방향)
- 트레이닝 AI 는 김민 담당이라 끄거나 고치지 않는다(docs/claude/geum-yunho.md AI 줄). 패치노트는 커밋 메시지로 채워지니 커밋 제목 · 본문을 사용자가 읽을 한국어로

### 지도 2

## 갈래: nutrition-view (영양 탭 화면) 지도

### 0. 진입 · 자료 흐름
- `app/(app)/nutrition/page.tsx:21-37` · `requireUser()` → `?date=`(`isNutritionDate`, 틀리면 오늘) → `Promise.all([loadNutritionDay(user,date), loadAdvice(user,date,today,serviceHour(now()))])` → `<NutritionView day today advice>`. `loading.tsx:73-95` 는 같은 틀의 뼈대(왼쪽 2카드 · 오른쪽 3카드).
- 화면이 받는 `NutritionDay` 타입은 `lib/nutrition/load.ts:70-134`: `profile(ProfileSettings)` · `prefs(DietPrefs)` · `hasProfile`(목표 줄이 있나) · `targets(Targets)` · `burnItems` · `entries` · `weightKg/weightFrom` · `week`(고른 날까지 7일) · `strip`(일~토 띠) · `weights`(56일) · `plan(WeightGoal)` · `recent/mine/favorites/combos` · `mealPlan{items,context}` · `planSignals{throwKind,appetite,soreness}`(오늘만) · `yesterday` · `body(Body)` · `mfds` · `browseSubs` · `guide(ThrowGuide|null, 오늘만)` · `popular` · `calendar`.
- `load.ts:247-343` 쿼리 13개를 한 번에. 체중 규칙 `354-376`(그날 영양탭 → 그날 체크인 → 30일 안 최근 → `User.weightKg`). 운동 몫 `378-392`(`trainingBurn` · `pitchingBurn`). **목표 계산 `401` `computeTargets(profile, body, totalBurn(burnItems))`**. 체중 목표 판정 `432-441` `weightGoal(...)`. 던지는 날 가이드 `533-550`(`isToday` 일 때만 `throwDayGuide`). `planSignals 585-591`.
- 계산 `lib/nutrition/targets.ts:157-217` `computeTargets`: `bmr`(Mifflin, 18세 밑 Schofield `144-153`) → `base = kcalTarget ?? round10(bmr × activity.factor + delta) + adjust`(185) → `kcal = base + burn`(189) → `protein = proteinTargetG ?? round(perKg × weight)`(191-193) → `fat = max(kcal×0.25/9, 0.8g/kg)`(194) → `carbs = 나머지`(195). **탄단지 비율(%) 개념이 없다**: 단백질은 g/kg, 지방은 25% 고정 바닥, 탄수는 잔여. 반환 `Targets 94-127`(bmr · base · burn · kcal · protein · fat · carbs · weightKg · assumed · manual · ageBand · proteinPerKg · proteinAuto · proteinManual · goal · delta · adjust · paceKg).
- 상수: `lib/nutrition/meta.ts:44-48` `GOALS`(gain +300 · maintain 0 · lose −400, 셋뿐) · `63-67` `ACTIVITIES`(low 1.3 · mid 1.5 · high 1.7, '운동 뺀 평소 움직임' 3단) · `12-17` `MEALS` 넷. 나이 규칙 `lib/nutrition/age.ts:60-118` `AGE_RULES`(child/teen/adult 마다 단백질 선택지 · goalDelta · 속도 `paces`). 식단 취향 `lib/nutrition/diet-prefs.ts:11-81`(`SEASON_PHASES` 4 · `DIET_STYLES` 한식/골고루/간편식 · `MEAL_PATTERNS` 4 · `AVOIDS` 9 · `DEFAULT_PREFS`).

### 1. 화면 위에서 아래로 (`app/(app)/nutrition/nutrition-view.tsx`, 2,346줄)
`NutritionView 207-598`. 상태: `useOptimistic(entries, reduceEntries 132-152)` 219 · `useOptimistic(plan, reducePlan 160-188)` 221 · `sheet`(음식 창) 228-235 · `goal`(목표 창, `tab: 'goal'|'diet'`) 236-246.
1. **머리 `397-418`**: `h1 '영양'` · `DateNav`(644-783, ← 날짜 제목(누르면 `MiniCalendar` 작은 달력, 적은 날 점) → · '오늘로') · `WeekStrip`(793-954, 일~토 칸마다 먹은 비율 가는 막대, 휴대폰은 옆으로 밀어 한 주씩, 겹화살표) · 오른쪽 **목표 단추**(409-417, `Settings2` 아이콘, 글자 '목표'는 `hidden sm:inline`) → `openGoal`. PC 는 `←→` 키로 하루 이동(`useArrowKeys 618-642`).
2. **오류 줄 `420-435`**(role=alert, 닫기).
3. **목표 안 정한 안내 `437-453`**(`!day.hasProfile`): "목표를 정하면 칼로리와 단백질이 내 몸과 시즌에 맞춰져요. 지금은 목표 '유지', 평소 움직임 '보통'으로 계산하고 있어요." + [목표 정하기] → 목표 창. **온보딩 전 사용자의 진입점이 이것 하나**.
4. **격자 `456`** `grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1fr)_22rem]` (lg 미만 한 열).
   - 왼쪽 열 `457-535`:
     a. **`AdviceCard` 1124-1245**(`advice.headline` 있을 때 = 오늘만, 459): '오늘 영양'(sky) · headline 17px · `why` · 오른쪽 `score` 26px + '균형' · 펴기. `dl` 3칸(1177-1212, `MACROS 1250-1254` 탄수화물·단백질·지방, 색은 sky 하나): `more` 없으면 `lo~hi g` 범위, `≤0` 이면 '충분', 아니면 `+N g`(어림이면 '약 +') 밑에 '오늘 lo~hi g'. 펴면 `parts`(점수 조각 label · score · note) + `GUIDE_DISCLAIMER`. 홈 카드(`app/(app)/today/nutrition-card.tsx:63-140`)와 같은 `Advice` 를 쓰고 '까닭 · 범위 · 조각'만 더한 세부판.
     b. **`GuideCard` 972-1115**(`day.guide`): 이름표 `badge` + `title` + 첫 줄; `kind==='after'` 면 '던진 뒤 담은 음식의 단백질 n / 목표 g' 막대(`bg-cat-recovery`), 아니면 '오늘 탄수화물 n / 목표 g' 막대(`bg-cat-power`, 1060-1075); `notes`; 더 보기(나머지 줄 · hint · 면책).
     c. **`SummaryCard` 1256-1492**(오늘 한눈에): 휴대폰 **링**(1297-1333, `desk:hidden`, 가운데 `share%`, 넘치면 `stroke-warn`) + 큰 숫자 **'오늘 더 먹을 수 있는 양 N kcal'**(1335-1347, 1.75rem, 넘치면 '목표보다 N kcal 더 먹었어요' warn) + '먹은 것 N · 목표 N (체중 조정 ±N 포함) = 기본 N + 운동 N'(1350-1372) + PC **가로 게이지**(1375-1403, `hidden desk:block`, 운동 몫 `bg-sky/20`) + **탄단지 3칸**(1409-1447, `{round(got)}{+} / {goal}g` + 가는 막대) + 정보 없는 음식 안내(1449-1455) + 체중 권유 한 줄 '체중 흐름을 보고 목표를 조금 바꿔 볼까요? 보기'(1457-1478, `#weight-card` 로 스크롤) + '내 정보에 N을 넣으면 목표가 더 정확해져요'(1484-1489, `assumed`).
     d. **`PlanCard`**(`plan-parts.tsx:61-298`, 473-490): 짜기 전 = '오늘 식단 짜기' · '{kcal}kcal · 단백질 {g}에 맞춰, 오늘 상태와 취향대로 짜요.' · 오늘 상태 줄(100-107: 던지는 날 · 입맛 없음 · 근육통 많음 · 시즌 · 스타일 · 끼니 구성) + [취향 바꾸기](→ 목표 창 `diet` 탭, `openPrefs 245`) · 장소 칩 4(`PLAN_PLACES` meal-plan.ts:50-55 집/헬스장/팀·학교/밖) + '더운 날 야외' · [식단 짜기] → `makePlan({place,hot,variant:0})`(329-334 → `makeMealPlan`). 짠 뒤 = '오늘 식단' 남은 계획 합 · [다른 식단으로](`variant+1`) · 펼침(까닭 `context.reasons` · 칩 · 이 조건으로 다시 짜기 · 취향 바꾸기 · 식단 지우기 · '안 먹은 계획은 먹은 칼로리에 안 들어가요'). 지난 날은 짠 것 있을 때만 보기.
     e. **끼니 넷 `499-534`**(`ul` `sm:grid-cols-2`, `gap-px bg-line` 로 선) → `MealSection 1528-1832`: 머리(이름 · '{kcal}kcal · ✓단백질 n / 목표 g' + `w-24` 막대, `mealProtein` · [편집][담기]) · 비면 '{끼니} 기록하기' 점선 단추(1744-1751) · 보기 `EntryRow 1843-1891`(이름 · 양 · 모름 · 1인분 · kcal, 누르면 편집) + `PlanBlock`(plan-parts 301-373, 흐린 '식단' 줄 · 동그라미=먹었어요 · 모두 먹었어요 · 이름=바꾸기) · 편집 `EditRow 1897-2011`(이름 눌러 바꾸기 · −/+ 양(`step 1835-1840`) · 끼니 옮기기 `<select>` · 지우기/되살리기) + `PlanEditRow`(plan-parts 376-467) + '모두 지우기', '완료'에 한 번에 `editEntries 379-385`/`editPlan 362-368` · 단백질 모자람 예시 한 줄(1824-1829 `p.tip`).
   - 오른쪽 열 `537-547`: **`BurnCard` 2015-2045**('운동으로 쓴 칼로리' 목록 `+N kcal`) · **`WeightCard` 2106-2346**(체중 입력+저장 `setWeight` 2138-2145 · `goalCopy`(weight-goal.ts:836) 글: label · number(1.75rem) · sub · sentence · note · 단추 `raise/lower → applyWeightStep(±STEP_KCAL)` · `maintain → saveNutritionProfile(유지)` 2181-2202 · '그대로 둘게요'(localStorage `bullpen-weight-suggest-snooze` 14일, 2056-2098) · `WeightTrend`(charts.tsx:105-422 8주 실측 옅은 선 + 추세 굵은 선 + 흔들림 띠 + 목표 점선 · 누르고 훑으면 값) · foot) · **최근 7일 `540-546`** `WeekChart`(charts.tsx:24-94 막대 7 + 그날 목표 실선 + '기록한 N일 평균 kcal · 단백질').
5. 창: `FoodSheet 550-580`(음식 담기 · 바꾸기 모드 `replacing`) · `GoalSheet 582-595`.
- 서버 부르기: 담기 `addFoods 260-294`(`addMealEntries`) · 바꾸기 `replaceFood 299-326`(`replaceMealEntry`/`replacePlanItem`) · `eatPlan 337-360`(`eatPlanItems`) · `clearPlan`(`clearMealPlan`) · 모두 `orOffline(..., OFFLINE 94)` 로 감싸고 `report` 로 오류 한 줄.

### 2. 목표 창 (`app/(app)/nutrition/goal-sheet.tsx`, 982줄)
- `GoalSheet 90-748` props: `profile · prefs · today · initialTab('goal'|'diet') · body · assumed`. `Modal`(415-421) 제목 '영양 목표' · 설명 '고르면 바로 아래 숫자가 바뀌어요. 운동한 날은 쓴 만큼 더해져요.' 두 칸 `Segmented [목표 | 식단 취향]`(424-435).
- **[목표] 칸**(437-723) 위에서 아래로: ① 목표 `Segmented`(444-460, `goals = GOALS.filter(rule.goalDelta !== null)` 134 → 어린이는 감량 없음, hint 는 `rule.goalHint`) ② `showPlan`(198, 증량·감량 & 어린이 아님) 펼침: 생년월일 없으면 안내(472-475) / 일주일 속도 `Segmented`(478-492, `paces` = `paceChoices` 187 + 저장값, 라벨 `rateText` '주 0.25kg', hint `paceHint 329-341` '천천히 · 하루 +300kcal …') / 목표 체중 입력(494-522, `targetRange 200` · `targetHint 355-373` '2.5kg 남았어요 · 계획대로면 약 10주') / 언제까지 `ChoiceChips`(525-534, `PERIOD_WEEKS` 4·8·12·16·24 + 저장 날짜, `pickPeriod 388-395` 가 그 기간에 닿는 속도를 골라 줌, `periodHint 401-412`) ③ 평소 움직임 `Segmented`(541-550) ④ 단백질 g/kg `Segmented`(556-577, `rule.proteinChoices`) ⑤ '하루 칼로리를 직접 정하기' 스위치 + 숫자칸(584-615, placeholder `auto.base`, '계산으로는 N') ⑥ '하루 단백질을 직접 정하기' 스위치 + 숫자칸(618-664, 켜면 `auto.proteinAuto` 미리 채움) ⑦ **미리보기** '이렇게 먹어요 (운동 없는 날)'(667-722): `Stat` 4칸 하루 칼로리 `preview.base` · 단백질 · 탄수화물 · 지방 g · '단백질은 세 끼에 {mealProteinGoal}g 쯤씩' · 조정 포함/[조정 지우기] · '기초대사량 N kcal (Mifflin-St Jeor 식)' · '나이 기준: 성인' · '계산에 쓴 몸: 75kg(짐작) · 178cm · 20세 · 남' (`bodyLine 316-323`) · '성별·키·몸무게·생년월일은 내 정보(오른쪽 위 내 사진)에서 바꿔요.'
- 즉시 계산: `draft 231-241` → `preview = computeTargets(draft, body, 0)` 242, `auto`(직접값 없이) 243-247, `planned = planOnSave(...)` 220-230(저장 전 숫자 = 저장 뒤 숫자).
- **[식단 취향] `DietPanel 828-934`**: 시즌 단계(한 번 더 누르면 풀림, 859-861) · 식단 스타일 · 끼니 구성 · 못 먹는 것(multiple) · '단백질 쉐이크 · 바도 넣기' 스위치(성장기 잠김). 칩은 `ChoiceChips 940-982`.
- **저장 `save 251-311`**: 검사(직접 칼로리 빈칸 · 단백질 10~450g · 목표 체중) → `saveNutritionProfile({goal, activity, proteinPerKg, kcalTarget, proteinTargetG, targetWeightKg, weeklyRateKg: showPlan ? rate : null, clearAdjust})` → `saveDietPrefs({goalEndDate, seasonPhase, dietStyle, mealPattern, avoid, supplements})` → `onClose()`; 취향 실패면 `diet` 탭으로 보내고 오류.
- 서버: `app/actions/nutrition.ts:795-937 saveNutritionProfile`(kcal 1,000~6,000 · 속도는 `paceChoices` 안이거나 저장값 그대로 · `checkTargetWeight` · `planOnSave` → `kcalAdjust`/`planSince` · 옛 화면의 `sex` 호환 928-933) · `628-670 saveDietPrefs`(`cleanDietPrefs` → upsert → **오늘 식단에서 못 먹는 것 `dropAvoided` 로 뺌** 646-667) · `946-966 applyWeightStep`(서버가 권유를 다시 셈해 같을 때만) · `384-460 makeMealPlan`(오늘만, `loadNutritionDay` 다시 읽어 `buildMealPlan`).

### 3. 휴대폰 · PC 모양 차이
- 열: `lg` 미만 한 열(오른쪽 카드가 끼니 밑으로) 456 · 끼니 `sm` 이상 2×2 499.
- 머리: 휴대폰 날짜 띠 `order-last w-full`, `lg:order-none` 407 · 목표 단추 글자 `hidden sm:inline` 416.
- SummaryCard: 휴대폰 링 `desk:hidden` 1300 / PC 게이지 `hidden desk:block` 1378 · 탄단지 이름·숫자 `flex-col sm:flex-row` 1415 · 체중 권유 한 줄은 휴대폰에서 체중 카드가 아래라 둔 것(1268-1273).
- MealSection: kcal·단백질 줄 휴대폰 `order-last basis-full`, `desk:order-none` 1664 · 편집 단추 `h-11 desk:h-9` 1957/1971/2003.
- 창: `Modal` 은 휴대폰에서 아래 시트(`components/modal.tsx:270 data-sheet`, `globals.css:2156-2173`) · PC 는 누른 자리에서 날아오는 가운데 창(`origin`, `originOf` shared.ts:45). 칩 휴대폰 알약 `rounded-full` / PC `desk:rounded-lg` (goal-sheet 968 · plan-parts 59). 단추 `rounded-full desk:rounded-xl`(plan-parts 170). 고르는 칸 `BIG = min-h-11`(goal-sheet 81).
- WeekChart 낮은 PC `desk-low:h-14`(charts.tsx:41).

### 4. 글 말투
- 해요체 · 짧게 · 줄표 없음(화면 글에는 '·'): '오늘 더 먹을 수 있는 양'(1336) · '목표보다 N kcal 더 먹었어요'(1345) · '고친 것은 완료를 누르면 한 번에 저장돼요'(1786) · '단백질 17g 모자라요 · 달걀 2개(+19g)이면 채워요'(1826-1827) · '계획한 것을 다 먹었어요'(plan-parts 198) · 면책 '참고용 안내예요. 몸 상태와 팀 · 지도자의 지침이 먼저예요.'(guide.ts:80-81) · 체중 foot(weight-goal.ts:755-759). 숫자는 `tabular-nums` · `kcalText` 1,234 · 단위 소문자 'kcal' · 'g'. 카드 제목 `text-sm font-bold`, 카드 틀 `PANEL`(198-199, `p-(--block-pad)`).

### 5. flow.md 24번(인아웃 홈 '기록' 탭)과 견줌
- **있음**: 날짜 띠(우리 `WeekStrip` 일~토 + 먹은 비율 막대 + 작은 달력, 인아웃보다 더 있음) · 큰 숫자(인아웃 '0 / 1839 kcal' = 먹은/목표, 우리는 '더 먹을 수 있는 N kcal' 이 큰 숫자이고 '먹은 N · 목표 N' 은 작은 글 1350-1355, 위치가 반대) · '🔥 0kcal 소모 | 1839kcal 더 먹을 수 있어요'(우리 `t.burn` '운동 N' 1368 + 더 먹을 양 + `BurnCard`) · 탄단지 g 막대(1409-1447 `n / 목표 g`) · 통계(`WeekChart` · `WeightTrend`, 다만 별도 탭이 아니라 오른쪽 열).
- **없음 · 다름**: ① 탄 0% · 단 0% · 지 0% **비율 알약**이 없고 g 만. 목표 비율(인아웃 60:20:20)이 화면 어디에도 없고 계산에도 비율 개념이 없다(targets.ts:30-35). ② **당류 · 나트륨** 없음: `Food` 타입(meta.ts:128-141) · `MealEntry`(schema 1237-1264) · `UserFood`(1270-1289) · `PlanItem`(meal-plan.ts:95-112) 모두 kcal·carbs·protein·fat 뿐, 식약처 변환도 `AMT_NUM1·3·4·6` 만 읽음(mfds-parse.ts:84, 124-126), 기본 음식표 `foods.ts` 542줄도 4칸. ③ 순탄수(식이섬유 뺀 것) 없음, 탄수화물 총량. ④ [자세히 | 한눈에] 토글 없음(카드마다 펴기 단추). ⑤ 캐릭터 · 말풍선 없음(사용자 규칙 '반짝이 없음 · 실밥 무늬'). ⑥ 위 탭 [기록 | 단식 | 통계] 없음, 단식 기능 없음. ⑦ 물 기록 2026-09-25 뺐음(schema 1336 주석 · HANDOFF '하지 않을 것: 물 기록'). ⑧ 인아웃 15번의 '기초대사량 · 활동대사량 · 목표 칼로리 ✎' 세 숫자는 목표 창 미리보기에만(bmr 712 · base 674), 활동대사량(bmr×factor)은 따로 안 보임, 탭 본문엔 없음. ⑨ 인아웃 15번의 체중 예상 곡선(시작 → 목표 N주)은 없음: `WeightTrend` 는 실측 + 추세 + 목표 점선, `etaWeeks`(weight-goal.ts:428) 숫자는 목표 창 hint(372)에만. ⑩ 인아웃 17번 '탄단지 g 직접 고치고 kcal·% 가 따라 바뀜' 은 단백질 g 직접(618-664)과 칼로리 직접(584-615)만, 탄수·지방 직접은 없음. ⑪ 인아웃 16번 식단 계획(일반·운동·키토·비건)으로 비율을 바꾸는 것은 없음: `DIET_STYLES`(한식/골고루/간편식)는 식단 짜기 틀 고르기용이라 뜻이 다르다. ⑫ 인아웃 4·5·6·9·11·12번(목표 5종 · 이유 · 경험 · 활동 5단 · 물 · 운동 종류)은 목표 창에 없음: 목표 3종 · 활동 3단(`ACTIVITIES` 는 '운동 뺀 평소 움직임'이라 인아웃 5단과 뜻이 다름, 운동은 기록에서 따로 더함 meta.ts:56-62).

**그대로 쓸 수 있는 것**
- `computeTargets(profile, body, burn)` lib/nutrition/targets.ts:157-217 — 온보딩의 '계획 만드는 중 → 기초대사량 · 목표 칼로리 · 탄단지 g' 미리보기를 그대로 낸다(bmr · base · kcal · protein · fat · carbs). goal-sheet.tsx:242-247 의 `preview`/`auto` 패턴(초안을 넣어 즉시 계산)을 그대로 쓸 것.
- `planOnSave` lib/nutrition/weight-goal.ts:533-559 · `targetRange` 456-480 · `checkTargetWeight` 488-512 · `etaWeeks` 428-434 · `targetAllowed` 440-444 — '목표 체중 적으면 −13kg · 약 N주' 계산과 범위 검사(goal-sheet.tsx:200-217, 348-373 이 쓰는 방식).
- `paceChoices` · `effectiveRate` · `paceDelta` · `defaultPace` lib/nutrition/age.ts:226-243, 184-196, 213-220, 173-176 — 인아웃 10번 '속도 슬라이더(느리게·추천·빠르게 → N주)'의 데이터. goal-sheet.tsx:187-196 `paces` 조립 · 388-395 `pickPeriod`(기간 → 속도 역산).
- `ageRule` · `AGE_RULES` lib/nutrition/age.ts:60-129 — 나이별 선택지 · 문구(goalHint · proteinChoices · bmrName). 생년월일 답에 따라 다음 화면 글이 바뀌는 인아웃식 연동의 재료.
- goal-sheet.tsx 부품: `Row`(750-774 라벨 + 내용 + hint) · `Stat`(776-795) · `ChoiceChips`(940-982, 단일/복수 · 휴대폰 알약/PC 네모) · 스위치 마크업(584-597) · 펼침 `grid-rows-[1fr]/[0fr]` + `inert` 패턴(466-471) · `BIG`(81) · `signed`/`kgText`/`rateText`(84-88) · `bodyLine`(316-323) · `dayGap`/`dateText`(803-814).
- `Segmented` components/segmented.tsx:45-60 (role radiogroup/tablist, size md, itemClassName) — 목표 창이 쓰는 고르개.
- plan-parts.tsx `CHIP`(59) · `PlanCard` 의 `envChips`(109-135) · `THROW_WORD`(46-50) — 오늘 환경 칩 모양.
- SummaryCard 의 링(nutrition-view.tsx:1297-1333 `pathLength=100` 원) · 탄단지 3칸 막대(1409-1447) · `MACROS`(1250-1254) · 큰 숫자 줄(1335-1347) — 인아웃 24번 '큰 숫자 + 막대' 자리에 이미 있는 것. 비율 알약을 더하면 여기.
- AdviceCard 의 `dl` 3칸(1177-1212)과 홈 `NutritionCardView` app/(app)/today/nutrition-card.tsx:107-136 이 같은 모양 · `CountUp`(146-157, CSS count-up) 숫자 차오름.
- 서버 동작 `saveNutritionProfile` app/actions/nutrition.ts:795-937(`ProfileInput` 773-793) · `saveDietPrefs` 628-670 · `applyWeightStep` 946-966 — 온보딩 마지막 '저장'에서 그대로 부르면 목표 창과 같은 검사 · 같은 저장. goal-sheet.tsx:270-310 의 두 번 부르기(profile → prefs) + 실패 처리 패턴.
- `orOffline` + `OFFLINE`(lib/action-offline.ts, nutrition-view.tsx:94, goal-sheet.tsx:272-288) — 신호 끊김 때 오류 한 줄.
- `Modal` components/modal.tsx:77-114(`origin` · `size`) — 휴대폰 아래 시트(data-sheet) · PC 가운데 창이 저절로 갈린다. 인아웃의 '시트' 끼우기에 그대로.
- `DEFAULT_PROFILE` targets.ts:64-74 · `DEFAULT_PREFS` diet-prefs.ts:74-81 · `toProfile` load.ts:153-190 · `toDietPrefs` diet-prefs.ts:100-121 — 옛 줄 · 빈 줄도 받는 변환(새 칸을 더할 때 같은 식으로).
- `day.hasProfile` 안내 카드 nutrition-view.tsx:437-453 — 온보딩을 안 한 사람을 새 온보딩으로 보내는 자리(지금은 목표 창을 연다).
- `mealProtein`/`mealProteinGoal` lib/nutrition/meal-protein.ts:38-89 · `GUIDE_DISCLAIMER` guide.ts:80-81 · `WEIGHT_FOOT` weight-goal.ts:755-759 · `kcalText`/`gramText`/`amountText` meta.ts:259-274 · `EASE`/`originOf` shared.ts:45-66 · `dayTitle` nutrition-view.tsx:202-205.
- 시험 `npm run nutrition:test`(scripts/nutrition-selftest.mts, 413개) · `npm run nutrition:advice-test`(scripts/nutrition-advice-test.mts) — package.json:16, 39. 계산을 바꾸면 여기에 사례를 더한다.

**빈 곳(인아웃과 견줘)**
- [24번 비율 알약] 탄 % · 단 % · 지 % 가 없다. 먹은 것의 열량 비율(carbs×4 / protein×4 / fat×9 ÷ kcal)은 SummaryCard 1409-1447 옆에 세 알약으로 그릴 수 있고(자료는 `eaten` 249 에 다 있음), '목표 비율'(인아웃 60:20:20)은 `Targets` 에 없으니 `computeTargets` 결과에서 셈해 보이거나(carbs·protein·fat g → %) 비율 칸을 새로 둬야 한다(targets.ts:191-195 가 단백질 g/kg → 지방 25% → 탄수 잔여라 비율이 결과값일 뿐 입력이 아니다).
- [24번 당류 · 나트륨] 자료 자체가 없다: `Food`(meta.ts:128-141) · `MealEntryView`(151-169) · `MealEntry`/`UserFood`/`MealCombo.items`/`MealPlan.items`(schema 1237-1328) · `PlanItem`(meal-plan.ts:95-112) · 기본 음식표 foods.ts(542줄, 4칸) · 식약처 변환(mfds-parse.ts:124-126, AMT_NUM1·3·4·6만) · `scaleMacros`/`sumMacros`(meta.ts:225-252). 넣으려면 DB 칸 추가(`sugar Float?` · `sodiumMg Float?` 기본 null, 백업 · migrate diff · HANDOFF) + `Macros` 확장 + `cleanFood`(actions 95-141) + 음식 창 직접 입력 칸(food-sheet.tsx:1911 부근) + 식약처 당·나트륨 칸 번호 확인(HANDOFF: '수집' 자료는 kcal · 단백질 · 당 · 나트륨만 있다고 함). 없으면 인아웃과 '완전히 동일'은 안 된다.
- [24번 순탄수] 식이섬유 칸이 없어 순탄수를 낼 수 없다. 당류 · 나트륨과 같은 작업(칸 `fiber`).
- [24번 큰 숫자] 인아웃은 '먹은 / 목표 kcal'이 큰 숫자, 우리는 '더 먹을 수 있는 N kcal'(1335-1347)이 큰 숫자. 인아웃식으로 바꾸려면 큰 숫자를 `eaten.kcal / t.kcal` 로, '더 먹을 수 있어요'를 밑 줄로 내리기(둘 다 자료는 있다).
- [24번 자세히|한눈에] 토글이 없다. `Segmented`(role tablist)로 SummaryCard 머리에 두고 '한눈에'면 탄단지 막대 · 정보 없는 안내 · 권유 줄을 접는 식으로 만들 수 있다(각 카드의 펴기 상태 1125 · 986 · 91 이 흩어져 있어 한 스위치로 묶을 자리가 없다).
- [24번 위 탭 기록|단식|통계] 없다. '통계'는 오른쪽 열(`WeekChart` · `WeightTrend` · `BurnCard`)이 휴대폰에서 끼니 밑으로 내려가 멀다(456). 단식은 기능 자체가 없다(사용자 요구에 들어 있는지 확인 필요).
- [24번 물] 2026-09-25 에 뺐다(schema 1336 주석, HANDOFF 로드맵 '하지 않을 것: 물 기록'). 인아웃 11번 물 질문 · 24번 물 기록을 살리려면 사용자 결정부터.
- [15번 기초대사량 · 활동대사량 · 목표 칼로리 ✎] 탭 본문에 없고 목표 창 미리보기(goal-sheet.tsx:667-722)에만 `preview.bmr`(712) · `preview.base`(674). 활동대사량(`bmr × activity.factor`)은 어디에도 안 보임: `computeTargets` 반환에 없어 `Targets` 에 선택 칸(`tdee?`)을 더하거나 화면에서 `ACTIVITIES.find(...).factor` 로 셈해야 한다. '✎ 직접 고치기'는 스위치+숫자칸(584-615)으로 있으나 숫자를 눌러 바로 고치는 인아웃식은 아니다.
- [15번 체중 예상 곡선] 시작 → 목표 N주 곡선이 없다. `WeightTrend`(charts.tsx:105-422)는 실측 + 추세 + 목표 점선. `etaWeeks` · `pickedRate` 로 예상선을 그리는 그림이 필요하면 charts.tsx 에 새 부품.
- [16·17번 식단 계획 → 탄단지 비율 · g 직접] `DIET_STYLES`(diet-prefs.ts:32-37)는 틀 고르기용이라 비율을 안 바꾼다. 인아웃식 '일반 · 운동 · 키토 · 비건'을 넣으면 (a) 비율을 바꾸는 새 칸(`NutritionProfile` 에 `macroPlan String?` 같은 것)과 `computeTargets` 의 지방 25% 고정 · 탄수 잔여(194-195)를 비율 기반으로 바꾸는 큰 변경이거나 (b) 스타일을 틀 선택과 비율 둘 다에 쓰는 설계가 필요. 탄수 · 지방 g 직접 정하기(인아웃 17번)는 `ProfileSettings` 에 `carbsTargetG?` · `fatTargetG?` 선택 칸 + 목표 창 스위치 둘 + 서버 검사(actions 825-839 와 같은 모양). 성장기 규칙(advice.ts 16행 '덜 먹어라 없음', age.ts 22-23)과 부딪히지 않게 키토 같은 것은 성장기 잠금.
- [4·5·6·9·11·12번 질문] 목표 창에는 목표 3종(`GOALS`) · 평소 움직임 3단(`ACTIVITIES`, 운동을 뺀 값 — 인아웃 5단과 뜻이 다름 meta.ts:56-62) · 단백질 g/kg · 직접 칼로리 · 체중 계획 · 시즌 · 스타일 · 끼니 · 못 먹는 것 · 보충식품뿐. 인아웃의 목표 이유 · 경험 · 물 · 운동 종류 · 근육량 증가 · 체지방률 감소 · 코치 · 서명 · 기대 질문은 없다. '질문에 이유가 있고 계산이 바뀌어야' 하므로 넣을 질문마다 `computeTargets` · `buildAdvice`(advice.ts) · `buildMealPlan`(meal-plan.ts:1043) 가운데 어디가 읽을지 먼저 정해야 한다(지금 저 셋이 읽는 것: 목표 · 활동 · 속도 · 직접값 · 시즌 · 스타일 · 끼니 · 못 먹는 것 · 보충식품 · 체크인 식욕 · 근육통 · 던지는 일정 · 운동 기록).
- [온보딩 뒤 탭 연동] 지금 탭의 '목표 정하기' 안내(437-453)는 `hasProfile` 로만 판단하고 목표 창(모달)을 연다. 인아웃식 전체 화면 온보딩(한 화면 한 질문 · 진행 막대 · 시트)을 만들면 이 안내 카드와 목표 창 둘의 역할(처음 설정 vs 나중에 고치기)을 정해야 한다. `hasProfile` 은 `profileRow !== null`(load.ts:556) 이라 `saveDietPrefs` upsert(actions 641-645)만 해도 true 가 된다.
- [휴대폰 접근성] 인아웃 24번은 한 화면에 큰 숫자 · 비율 · 막대 · 당류 · 나트륨이 다 보인다. 우리 탭은 휴대폰에서 AdviceCard(오늘만) → GuideCard(던지는 날만) → SummaryCard → PlanCard → 끼니 넷 → 운동 → 체중 → 7일로 길다. 인아웃처럼 맨 위 한 카드에 모으려면 AdviceCard 와 SummaryCard 를 합치는 설계가 필요(둘 다 `advice`/`eaten` 을 이미 갖고 있음 248-250, 459-470).

**위험 · 지킬 규칙**
- DB 규칙(AGENTS.md 1~2): `prisma migrate dev` · `db push` · `migrate reset` 금지. 당류 · 나트륨 · 비율 · 탄수/지방 직접값 같은 새 칸은 `?` 또는 `@default` 로, `npm run backup` → `migrate diff` → `migrations/<시각>_<이름>/migration.sql` → `migrate deploy` → `generate`, 상대방(김민)에게 미리 알리고 HANDOFF.md 에 적는다. `npx prisma format` 은 남의 줄까지 바꾸니 쓰지 않는다(geum-yunho.md 6번 함정). 새 표를 만든 뒤에는 개발 서버 재시작.
- 홈 영양 카드는 건드리지 않는다(사용자). `app/(app)/today/nutrition-card.tsx` 와 탭의 `AdviceCard`(nutrition-view.tsx:1124-1245)가 같은 `Advice`(lib/nutrition/advice.ts:89-109)를 쓴다. advice.ts:25 · HANDOFF 클라우드 메모: 내보내는 타입(`AdviceInput · Advice · MoreToEat · MacroRange · TrainingKind · MealCheck`)의 있는 칸은 이름 · 뜻 · 필수 여부를 바꾸지 않고 더할 때는 선택(`?`)으로만. 탭 쪽만 바꾸려다 `Advice` 모양을 건드리면 홈이 깨진다.
- `computeTargets`(targets.ts:157)는 load.ts:401/408/470 · lib/day-detail.ts:138(홈 링 · 영양 조언 입력) · goal-sheet.tsx:242 · nutrition-view.tsx:2169(WeightCard 유지 미리보기) · 서버 여러 곳이 부른다. 비율 · 활동대사량 칸을 더하면 `Targets` 에 선택 칸으로, 기존 g 값은 그대로(홈 링의 kcal 비율 · 식단 짜기 `targets.kcal/protein` · 끼니별 단백질이 다 이 값을 읽는다).
- `ProfileInput`(actions/nutrition.ts:773-793) 의 `undefined = 저장값 그대로` 규칙: 배포 전에 열어 둔 옛 화면이 새 칸을 안 보내도 지워지지 않게. 새 칸도 같은 방식으로. `toProfile`(load.ts:153-190) · `toDietPrefs`(diet-prefs.ts:100-121) 가 칸 없는 옛 줄을 받게 할 것.
- `saveDietPrefs`(628-670)는 저장 뒤 오늘 식단에서 못 먹는 것을 빼고 까닭에 한 줄을 넣는다(646-667). 온보딩에서 `avoid` 를 저장하면 이 부작용이 같이 돈다. `MealPlan.context` 는 Json 이라 `parsePlanContext`(meal-plan.ts:2069)가 옛 모양을 받아야 한다.
- `saveNutritionProfile` 은 kcal 1,000~6,000(816-822) · 단백질 g 10~450(`PROTEIN_G_MIN/MAX` meta.ts:85-86) · g/kg 1.2~2.5(`PROTEIN_MIN/MAX`) · 속도는 `paceChoices` 안 또는 저장값 그대로(853-865) · 목표 체중 `checkTargetWeight`(871-881) · `planOnSave` 로 조정 0 · `planSince` 오늘(884-921). 온보딩이 다른 값을 보내면 여기서 막힌다.
- 성별은 계정 `User.sex`(schema 37, lib/profile.ts SEXES)에서 오고 영양 창에서 고르지 않는다(goal-sheet.tsx:552-555, targets.ts:38-41). 키 · 체중 · 생년월일도 `User`(heightCm · weightKg · birthDate). 인아웃 2·7·8번(생년월일 · 키 · 체중)을 영양 온보딩에 넣으면 저장은 `NutritionProfile` 이 아니라 `User` 쪽(가입 · 내 정보 동작)이어야 하고, 영양 탭의 체중은 `DailyNutrition.weightKg`/체크인(load.ts:354-376 우선순위)과 섞인다.
- 생년월일이 없으면 `paceChoices` 가 빈 배열(age.ts:231) → 속도 · 목표 체중 칸이 안 보인다(goal-sheet.tsx:472-475, targets.ts:174-177 '모르는 나이를 성인으로 치지 않는다'). 인아웃 10번 속도 화면을 띄우려면 생년월일을 먼저 받아야 한다. 어린이는 감량 없음(134, age.ts:66) · 성장기는 속도 한 가지(age.ts:87-91) · 보충식품 잠김(goal-sheet 916-918) · '덜 먹어라' 금지(advice.ts:16) — 성장기 질문 · 문구는 이 규칙을 지킨다.
- `useOptimistic` 구조(nutrition-view.tsx:219-221, reducer 132-188): 끼니 · 식단 줄 모양을 바꾸면 `reduceEntries`/`reducePlan`/`foodValues`(116-125) · `addFoods` 임시 줄(265-278) · `eatPlan`(341-354) 모두 같이.
- 말투 · 규격(geum-yunho.md): 새 글은 해요체 · 줄표 없이 · 짧게 · 문장 속 굵게 없음 · 제품 · 상표 금지(advice.ts:17) · 11px 밑 글자 금지 · 임의 px 글자(`text-[13px]` 류) 금지(기존 영양 코드에 `text-[15px]/[17px]/[22px]/[26px]` 가 있으나 김민의 '아이폰 글자' 작업 몫이니 새 코드에서는 토큰 사용) · 카드는 `PANEL`/`Card`/`p-(--block-pad)` · 칩 40px(`CHIP`) · 단추 48/44px · 고르기는 `Segmented` · 단계는 `StepBar`. 색은 sky 하나(1249 주석 '그림은 색 적게').
- 휴대폰: `html/body overflow-x: clip` 이라 넘침이 조용히 잘린다(getBoundingClientRect 로 잰다). 영양 격자의 `minmax(0,1fr)`(455-456) 와 끼니 줄의 `truncate` 는 넘침 방지용이니 유지. 입력칸은 손가락 화면에서 16px 로 올라간다(globals.css `pointer: coarse`). `Modal` 은 열릴 때 닫기 단추에 초점을 줘 `autoFocus` 가 덮인다(food-sheet.tsx:238-249).
- 오늘만 동작: `AdviceCard` 는 `advice.headline` 있을 때(459, 지난 날 null) · `GuideCard` 는 `isToday`(load.ts:533) · 식단 짜기는 오늘만(actions 390-392) · 체중 권유는 오늘만(weight-goal `hold: 'past'`). 지난 날 화면(`?date=`)을 깨지 않게.
- 운영 DB 가 하나(geum-yunho.md 2절): 시험용 가입 · 기록을 만들지 않는다. 화면 확인은 `app/dev-preview-*` 임시 경로에 가짜 자료로, 다 보면 지우고 개발 서버를 다시 켠다. 저장 단추는 내장 브라우저에서 누르지 않는다.
- 시험: `npm run nutrition:test`(413) · `npm run nutrition:advice-test` 가 `buildMealPlan` · `buildAdvice` · 목표 계산을 격자로 본다. `DIET_STYLES` · `AVOIDS` · 틀 키(DB 에 문자열로 저장됨 'simple' · 'korean' …)를 바꾸면 저장된 줄과 시험(`EXPECTED_AVOIDS`)이 같이 깨진다. 키는 더하기만.
- `hasProfile`(load.ts:556 `profileRow !== null`)을 '온보딩 끝' 판정으로 쓰면 틀린다: 취향만 저장해도 줄이 생긴다. 온보딩 완료 표시는 따로 둘 것(예: `NutritionProfile` 새 칸 `onboardedAt DateTime?`).
- `WeightCard` 의 '그대로 둘게요'는 localStorage `bullpen-weight-suggest-snooze`(2056) · 설정 시트와 단위는 `useWeightUnit`(components/use-units) — 온보딩의 kg/lb 토글은 이 단위와 맞춘다(`toWeight`/`fromWeight` lib/units).
- AI 는 회의 전까지 영양 쪽 새 기능에 켜지 않는다(geum-yunho.md 'AI 멈춤', `lib/ai/features.ts`) — 인아웃 13번 '코치' 같은 것을 AI 로 만들지 않는다.

### 지도 3

## 홈 영양 갈래 지도 (저장소 /home/user/bullpen-log)

### 1. 홈에서 영양이 보이는 자리 (사용자가 '만지지 말라'고 한 화면)
- `app/(app)/today/page.tsx:111-133` 홈이 `TodayRings`(Suspense) 와 `NutritionCard`(Suspense) 를 차례로 둔다. `today = toDateKey(now())` 한국 날짜.
- `app/(app)/today/today-rings.tsx:39-46` 링 넷. 영양 링은 `loadAdvice(user, today, today, serviceHour(now()))` 를 불러 `advice.score/100`(점수가 있을 때), 없으면 `detail.nutrition.kcal / target.kcal` (83-95행). 캡션 '균형 N' · 'Nkcal' · '남기기', 누르면 `/nutrition`. `RingsCard`(123-176) · `Ring`(182-218) 은 그리기만.
- `app/(app)/today/nutrition-card.tsx:21-31` `NutritionCard` 가 같은 `loadAdvice` 를 부르고 `NutritionCardView`(63-140) 가 그린다: 머리 '영양 · 균형 N', `advice.headline` 한 줄(`highlight` 면 sky-strong), 세 칸(탄 · 단 · 지 = `columns()` 50-60행: `more` 가 있으면 '+Ng'/'약 +Ng'/'충분', 없으면 `range.lo~hi g`). `CountUp`(146-157) 은 CSS 만. 설명 · 까닭 · 범위 표는 일부러 없다(13-17행 주석).
- 달력 쪽 영양: `app/(app)/today/history.ts:88-96` `nutritionByDay`(MealEntry 합 kcal · protein) → `day-summary.tsx:184-189` 그날 칸 한 줄 'Nkcal · 단백질 Ng' → `day-detail.tsx:456-520` `NutritionDetail`(먹은 kcal/목표 막대 · 탄단지 막대 · 끼니 목록, 자료는 `/api/day-detail` → `loadDayDetail`).

### 2. 자료 흐름 (홈 카드 · 링 · 영양 탭 맨 위가 같은 길)
`lib/nutrition/advice-load.ts:17-74` `loadAdvice`(React `cache`, 인자 user 객체 · date · today · hour 숫자)
→ 한꺼번에 읽는 넷: ① `loadDayDetailCached(user, date)`(`lib/day-detail.ts:97-99`) ② `dailyCheckin` 오늘 · 어제의 `nutrition · skippedMeals · appetite · soreness · throwPlan`(27-37행) ③ `pitchLog` 오늘의 `sessionType · pitchCount · createdAt`(38-41) ④ `trainingSession` 오늘의 `activeSeconds`(42-45)
→ `lib/nutrition/advice-input.ts:83-120` `assembleAdviceInput`(순수): `target = detail.nutrition.target`, `eaten`(음식을 하나도 안 적었으면 null, 101-103), `eatenMeals`, `body = {weightKg, ageBand, goal}`(detail.nutrition 에서), `checkin = {meals: {amount: nutrition, skipped}, appetite, soreness}`(`pickCheckinBody` 로 거름, 89-96), `throwKind = throwDayKind(...)`(오늘만, 107-115), `training = trainingKinds(exercises, activeSeconds)`(63-81: 마친 운동의 분류를 `trainingKindOf` 로 power · strength · assist · aerobic 넷으로), `weight: null`(117행, 늘 null), `hour`. `serviceHour`(22-24) 는 UTC+9.
→ `lib/nutrition/advice.ts:631-655` `buildAdvice`: `ranges`(208-237, 체중 1kg 당 범위 × 활동(throw/train/rest) → `pullToTarget` 194-206 으로 사용자 목표 쪽으로 당김; 체중을 모르면 목표 ±10%) · `moreToEat`(253-273: 기록이 있으면 목표−먹은 것, 없으면 `estimatedEatenShare` 240-251 로 체크인 끼니 양 × `expectedShare(hour)` 167-187 − 걸른 끼니 `MEAL_SHARE`) · `headlineOf`(541-559) 가 `HEADLINE_RULES`(322-539, 위가 이김: after-throw 324 → throw-today 338 → throw-eve 357 → strength 371 → aerobic 392 → skipped-breakfast 406 → skipped-lunch 414 → low-appetite 422 → soreness 436 → more-protein 450 → more-carbs 470 → over 483(성인만) → gain 498 → lose 512(성인만) → default 526) · `scoreOf`(581-629: 열량 · 단백질 · 탄수 `closeness` 574, 85~115% 만점, 오늘은 `expectedShare` 몫에 견줌 + 체크인 끼니 점수, 무게 `PART_WEIGHT` 562) · `highlight`(647-651). 지난 날은 headline null · 점수만(633-644).

### 3. 홈 영양이 읽는 입력(온보딩 답이 흘러들어야 할 자리)
**프로필 `NutritionProfile`**(`prisma/schema.prisma`, `lib/nutrition/load.ts:153-196 toProfile` → `ProfileSettings` `lib/nutrition/targets.ts:42-62`): `goal`(gain/maintain/lose, 기본 maintain) · `activity`(low/mid/high, 기본 mid) · `proteinPerKg`(기본 1.8, 나이 범위로 당김 `age.ts:138-145`) · `kcalTarget`(직접 정한 운동 전 kcal, 1000~6000) · `proteinTargetG` · `targetWeightKg` · `weeklyRateKg` · `kcalAdjust`(서버만) · `planSince`. 줄이 없으면 `DEFAULT_PROFILE`(targets.ts:64-74) = 유지 · 보통. `hasProfile = profileRow !== null`(load.ts:435) 이 영양 탭의 '목표 정하기' 안내(`nutrition-view.tsx:437-452`)를 가른다. 저장은 `app/actions/nutrition.ts:795 saveNutritionProfile`(검사 801-838, 속도 850-864 `paceChoices · storedRate`, 목표 체중 867-880 `checkTargetWeight`, `planSince` 884-896 `planOnSave`) · `628 saveDietPrefs`.
**몸 `User`**(`lib/dal.ts:17-40 requireUser` 가 읽는 그 객체를 그대로 넘긴다, `DayDetailUser` `day-detail.ts:84-91`): `birthDate`(가입 필수, `auth.ts:99-103`) → `ageOn`(targets.ts:130-138) → `ageBand`(age.ts:120-125: ≤12 child · ≤17 teen · adult) · `sex`(가입 필수, `auth.ts:118-125`) → `basalKcal`(144-153: 18세 밑 Schofield, 모르면 −78) · `heightCm`(가입 필수) · `weightKg`(**가입에서 안 받는다** `app/login/auth-form.tsx:411-429` 필드 목록, 내 정보 `profile.ts:85` 에서만). 목표의 체중은 `recentWeightKg(userId, date)`(load.ts:198-224: 30일 안 `DailyNutrition.weightKg` → `DailyCheckin.bodyWeightKg`) 가 먼저, 없으면 `user.weightKg`, 그것도 없으면 `FALLBACK` 75kg/178cm/20세(targets.ts:92, `assumed` 로 표시) — `day-detail.ts:122-147`.
**목표 계산 `computeTargets`**(targets.ts:157-216, 홈 링 · 카드 · 달력 · 영양 탭 · 식단 짜기 공용): bmr(Mifflin/Schofield) × `ACTIVITIES.factor`(`meta.ts:63-67` low 1.3 · mid 1.5 · high 1.7, 앱에 적은 운동은 OUT 으로 따로 더하니 계수를 낮게 둠) + `paceDelta`(age.ts:213-220: 속도 kcal, 성인 감량 −300/−400 · 증량 +300/+400, 성장기 ±200/300, 어린이 감량은 `effectiveGoal` 로 유지) + `effectiveAdjust`(254-266) → base(`kcalTarget` 이 있으면 그 값) + burn(`lib/nutrition/burn.ts` trainingBurn · pitchingBurn, 체중 기준) = kcal; 단백질 = `proteinTargetG ?? proteinPerKg × 체중`; 지방 = max(kcal 25%/9, 0.8g/kg); 탄수 = 나머지. 돌려주는 `Targets`(94-127) 에 bmr · base · burn · delta · paceKg · assumed · ageBand · goal 이 다 있다.
**체크인 `DailyCheckin`**(`lib/checkin.ts:287-373` 식사 칸): `nutrition`('잘 먹음'·'보통'·'부족', `MEAL_AMOUNTS` 298) · `skippedMeals`(breakfast/lunch/dinner, `SKIPPABLE_MEALS` 301) 는 간편 체크인 두 줄(`components/checkin-form.tsx:1255-1285`), 폼이 `body=1`(1082행) 을 보낼 때만 저장(`app/actions/checkin.ts:91-100` `parseCheckinBody`). `appetite`(1~5, `APPETITE_LEVELS` 571) · `throwPlan`(`THROW_PLANS` 572: 오늘 등판 · 오늘 불펜 · 내일 등판 · 없음) · `soreness`(1~5, `HIGH_SORENESS` 4) 는 상세/간편 칸. 어제 `throwPlan` 도 읽는다(advice-load.ts:64).
**기록**: `MealEntry`(끼니별 합, day-detail.ts:149-171) · `PitchLog` 오늘(경기 · 라이브 · 불펜만 `guide.ts:87 THROW_SESSIONS`) · `TrainingSession.activeSeconds` · `trainingDay` 의 한 운동(category · done · holdSecondsDone, advice-input.ts:35-40).
**던지는 날 판정** `lib/nutrition/guide.ts:156-163 throwDayKind`(after > today > eve, 어제 '내일 등판'이면 오늘 today). `throwDayGuide`(180-274) · `recoveryEaten`(286-305) 은 영양 탭 가이드 카드만 쓴다(`load.ts:533-549`, `nutrition-view.tsx:987`) — 홈은 kind 만.

### 4. 홈 영양이 읽지 않는 것 (온보딩에서 받아도 홈 숫자는 안 바뀜)
- `DietPrefs`(`lib/nutrition/diet-prefs.ts:62-72`: seasonPhase · dietStyle · mealPattern · avoid · supplements · goalEndDate) — 식단 짜기(meal-plan.ts)와 목표 창만. 홈 조언의 끼니 몫 `MEAL_SHARE`(advice.ts:142-147) 는 고정.
- `AdviceInput.weight`(체중 흐름 판정) 는 늘 null(advice-input.ts:117). `weightGoal`(weight-goal.ts:580) 은 영양 탭 `NutritionDay.plan` 만.
- `User.targetVelocity` 는 규칙상 영양 계산에 넣지 않는다(advice.ts:14). `User.baseline* · trainingGoal · dailyWorkoutMinutes` 는 트레이닝(김민 영역).
- `DailyCheckin.hydration · fatigue · stress · mood · restingHr` 는 DB 칸만 남고 읽는 곳 없음(checkin.ts:538-543).

### 5. '홈 영양'이라 손대면 안 되는 목록
`app/(app)/today/nutrition-card.tsx` 전체 · `app/(app)/today/today-rings.tsx` 의 영양 링(83-95) 과 `loadAdvice` 호출 · `app/(app)/today/page.tsx:127-133` 의 NutritionCard 자리 · `lib/nutrition/advice.ts`(내보내는 타입 AdviceInput · Advice · MoreToEat · MacroRange · TrainingKind · MealCheck 의 있는 칸은 이름 · 뜻 · 필수 여부를 바꾸지 않는다, 25행 · HANDOFF 메모) · `lib/nutrition/advice-load.ts` · `lib/nutrition/advice-input.ts` · `lib/day-detail.ts` 의 nutrition 부분(127-171 · 214-234) · `app/(app)/today/day-detail.tsx` `NutritionDetail`(456-) · `history.ts:88-96` · `scripts/nutrition-advice-test.mts`(43 check, `npm run nutrition:advice-test`). 공용이라 '더하기만' 허용되는 것: `lib/nutrition/targets.ts computeTargets` · `meta.ts GOALS · ACTIVITIES` · `age.ts AGE_RULES` · `load.ts toProfile` · `app/actions/nutrition.ts saveNutritionProfile` · `lib/checkin.ts` 식사 칸 · `prisma NutritionProfile`.

**그대로 쓸 수 있는 것**
- `lib/nutrition/targets.ts:157-216 computeTargets(profile, body, burn)` 와 돌려주는 `Targets`(94-127: bmr · base · burn · kcal · protein · fat · carbs · delta · paceKg · assumed · ageBand) — 인아웃 15 '추천 계획 완성'(기초대사량 · 활동대사량 · 목표 칼로리)과 17 '탄단지 g · kcal · %' 를 그대로 셈해 보여 줄 수 있다. `basalKcal`(144-153) · `ageOn`(130-138) 도 export.
- `lib/nutrition/meta.ts:44-48 GOALS`(gain · maintain · lose + hint) · `63-67 ACTIVITIES`(low 1.3 · mid 1.5 · high 1.7 + hint) · `isGoalKey · isActivityKey` — 목표 · 활동량 카드의 선택지와 검사.
- `lib/nutrition/age.ts:60-118 AGE_RULES`(나이 칸별 goalHint · proteinChoices · paces) · `226 paceChoices(age, goal, refKg)` · `173 defaultPace` · `184 effectiveRate` · `202 storedRate` · `213 paceDelta` — 인아웃 10 '속도 슬라이더(느리게 · 추천 · 빠르게)'를 성인 0.25/0.35kg 두 칸으로.
- `lib/nutrition/weight-goal.ts:428 etaWeeks(remainingKg, paceKg)`('23주면 달성') · `488 checkTargetWeight` · `456 targetRange` · `440 targetAllowed(goal, age)` · `16 STEP_KCAL` — 인아웃 8 '현재 → 목표 체중, −13kg' 과 10 의 주 수 계산.
- `app/actions/nutrition.ts:795 saveNutritionProfile({goal, activity, proteinPerKg, kcalTarget, proteinTargetG?, targetWeightKg?, weeklyRateKg?})` · `628 saveDietPrefs` — 온보딩 마지막 저장. 한 번 저장하면 `hasProfile` 이 true 가 되어 영양 탭 '목표 정하기' 안내(nutrition-view.tsx:437-452)가 사라지고 `planSince` 가 그날로 잡힌다(884-896).
- `app/actions/profile.ts:49-138 updateProfile`(birthDate · heightCm · sex · weightKg 저장, 검사 `lib/profile.ts:115 validateProfile`) · `app/actions/auth.ts:99-176` 가입이 저장하는 칸(birthDate · heightCm · sex · baseline · throwingHand · competitionLevel · trainingLevel) — 몸 정보는 여기로 흘려야 홈 목표가 바뀐다.
- `lib/nutrition/load.ts:153 toProfile` · `198 recentWeightKg` · `lib/nutrition/diet-prefs.ts:100 toDietPrefs` · `DEFAULT_PREFS`(74-81) — DB 줄 → 설정 변환(칸이 없는 옛 줄도 받는 패턴).
- `lib/nutrition/advice.ts:118-130 CARB_PER_KG · PROTEIN_PER_KG(1.6~2.2) · FAT_PER_KG` · `275 afterProtein` · `167 expectedShare` — 읽기만 하면 온보딩의 '왜 묻는지' 부제(체중 1kg 당 단백질 등) 숫자 출처로 쓸 수 있다.
- `app/(app)/today/nutrition-card.tsx:63 NutritionCardView({advice})` · `today-rings.tsx:123 RingsCard({items})` — 그리기만 하는 부품이라 온보딩 마지막 '나의 목표 카드' 미리보기에 `buildAdvice` 결과를 넣어 보여 줄 수 있다(홈 파일은 안 고치고 import 만).
- `app/(app)/nutrition/goal-sheet.tsx`(`GoalSheet`, `initialTab`) — [목표 | 식단 취향] 두 칸의 질문 항목(목표 · 속도 · 목표 체중 · 언제까지 · 단백질 직접 · 칼로리 직접 · 시즌 · 스타일 · 끼니 구성 · 못 먹는 것 · 보충식품)이 인아웃 4 · 8 · 10 · 16 · 17 과 1:1 로 맞는다. 한 화면 한 질문으로 쪼개면 된다.
- UI 부품: `components/checkin-form.tsx` 의 `ChipRadio · ChipCheckbox · Row`, `components/velocity/kit.tsx` 의 `CHIP_BASE · Segmented · StepBar`, `components/ui` 의 `Card · PageHeading`, `components/modal.tsx` 시트(`data-sheet`), `components/safe-form.tsx SafeForm`(끊김 방어), `lib/action-offline.ts orOffline`, `components/toast.tsx toast`.
- `lib/nutrition/advice-input.ts:22 serviceHour(now)` · `lib/nutrition/days.ts dbDate · keyOfDbDate` · `lib/pitch-stats.ts toDateKey · shiftDateKey` — 날짜 · 시각 도우미.
- `scripts/nutrition-advice-test.mts:29 base`(AdviceInput 보기 입력) · `check()` 틀 — 온보딩 답 → 홈 조언이 바뀌는지 시험을 같은 틀로 더할 수 있다(`npm run nutrition:advice-test`, 43개).

**빈 곳(인아웃과 견줘)**
- 체중(인아웃 7·8 '키 · 현재 체중'): 가입이 `weightKg` 를 안 받는다(`app/login/auth-form.tsx:411-429`, `auth.ts:99-103` 은 birthDate · heightCm 만). 홈은 체중을 모르면 75kg 짐작(targets.ts:92 FALLBACK)으로 목표를 셈하고 조언은 범위를 목표 ±10% 로만 말한다(advice.ts:229-236). 온보딩에서 체중을 받아 `User.weightKg` 에 저장해야 홈 목표가 바로 맞는다. 체중 그래프 · `recentWeightKg`(30일) 에도 잡히려면 그날 `DailyNutrition.weightKg`(setWeight, nutrition.ts:286) 로도 한 줄 넣는 것이 맞다.
- 목표 다섯(인아웃 4: 감량 · 증량 · 유지 · 근육량 증가 · 체지방률 감소) vs `GOALS` 셋(meta.ts:44-48). `GoalKey` 는 `age.ts goalDelta · paces`(Record<GoalKey>) · `advice.ts` gain/lose 규칙(498 · 512) · `effectiveGoal` 이 모두 읽는 값이라 새 값을 더하면 홈 조언 · 목표 계산이 다 걸린다. 권장: GoalKey 는 셋 그대로 두고 '근육량 증가' = gain + proteinPerKg 2.0, '체지방률 감소' = lose + proteinPerKg 2.0~2.2 처럼 온보딩 매핑으로 풀기(NutritionProfile 에 '고른 이유' 칸을 더한다면 선택 String 으로만).
- 활동량 다섯(인아웃 9) vs `ACTIVITIES` 셋(meta.ts:63-67). 이 앱은 적어 둔 운동 · 투구를 OUT 으로 따로 더하므로 계수를 1.3/1.5/1.7 로 낮게 잡았다(57-62행 주석) — 다섯으로 늘릴 때 일반 계산기의 1.725 · 1.9 를 그대로 쓰면 두 번 센다. 더하더라도 `ACTIVITIES` 에 칸을 추가하고 `DEFAULT_PROFILE.activity 'mid'` · `isActivityKey` 거름은 유지.
- 탄단지 직접 고치기(인아웃 17): 지금은 단백질만 `proteinTargetG` 로 직접 정할 수 있고(targets.ts:192-193), 지방은 25% · 탄수는 나머지로 고정(194-195). 탄수 · 지방 g 이나 비율을 직접 정하게 하려면 `NutritionProfile` 에 선택 칸 + `ProfileSettings` + `computeTargets` 수정이 필요한데 이 함수가 홈 링 · 카드 · 달력의 target 을 만든다 — null 이면 예전과 똑같게(targets.ts:51-53 패턴) 더해야 홈이 안 바뀐다.
- 식단 계획(인아웃 16: 일반 · 운동 · 키토 · 비건) 이 탄단지 비율을 바꾸는 구조가 없다. '운동' = proteinPerKg 높이기로 대응 가능, '키토'는 투수 앱 설계(던지는 날 탄수화물)와 어긋나고 '비건'은 `AVOIDS`(diet-prefs.ts:49-59) 조합(dairy · egg · seafood · pork · beef · chicken)에 가깝다 — 홈 조언은 avoid 를 안 읽으므로 홈의 음식 보기(우유 · 달걀 · 닭가슴살, advice.ts:311-312 · 규칙 글)가 못 먹는 것과 어긋날 수 있다(홈을 안 만진다면 알고 둘 한계).
- 끼니 구성(세 끼 + 간식)을 온보딩에서 받아도 홈 조언의 끼니 몫은 고정(`MEAL_SHARE` advice.ts:142-147, `MEAL_OVER_HOUR` 149-154). HANDOFF 영양 조언 메모 5번에 `AdviceInput.mealPattern?`(선택) 계획이 적혀 있으나 아직 없다 — 홈을 안 만지기로 했으니 지금은 연결되지 않는다.
- 물(인아웃 11) · 운동 종류 여러 개(12) · 코치(13) · 서명 · 알림 · 사회적 증거는 저장할 칸이 없고 홈 영양도 안 읽는다. 물은 2026-09 에 뺀 기능(hydration 칸만 DB 에 남음), 코치 캐릭터는 AI 회의 전 새 AI 금지 규칙에 걸린다. 운동 종류는 트레이닝(김민 영역)의 `baselineWorkoutFreq · trainingGoal` 쪽이지 영양 입력이 아니다.
- 홈 '0 / 1839kcal + 탄단지 막대'(인아웃 24) 모양은 홈이 아니라 영양 탭에 둬야 한다 — 홈은 링(점수 또는 kcal 비율) + 카드(더 먹을 g) 로 확정된 상태(today-rings.tsx:15-26 · nutrition-card.tsx:12-17 주석, 사용자 2026-10-07).
- '왜 묻는지' 부제(인아웃 원칙 1)의 숫자 출처는 이미 코드에 있다(생년월일 → Schofield/Mifflin targets.ts:140-153 · 성별 → −161/+5 · 체중 → 단백질 g/kg age.ts:19-20 · 활동량 → 계수) — 온보딩 글이 이 상수를 그대로 가져다 쓰면 '질문 → 계산' 연동이 설명과 일치한다.
- 목표 체중 · 속도(인아웃 8 · 10)는 `targetWeightKg · weeklyRateKg` 로 받을 수 있지만 홈 조언에는 `paceDelta` → base kcal 로만 간접 반영되고(targets.ts:177-185), 체중 흐름 판정(`weightGoal`)은 홈이 안 읽는다(advice-input.ts:117 `weight: null`).

**위험 · 지킬 규칙**
- 홈 영양 파일은 고치지 않는다: `app/(app)/today/nutrition-card.tsx` · `today-rings.tsx`(영양 링 83-95) · `page.tsx:127-133` · `lib/nutrition/advice.ts` · `advice-load.ts` · `advice-input.ts` · `lib/day-detail.ts` nutrition 부분 · `today/day-detail.tsx NutritionDetail` · `history.ts nutritionByDay` · `scripts/nutrition-advice-test.mts`. `advice.ts` 의 내보내는 타입은 있는 칸의 이름 · 뜻 · 필수 여부를 바꾸지 않고 더할 때는 선택(?)으로만(advice.ts:25 · HANDOFF '영양 조언' 메모).
- `computeTargets`(targets.ts:157)는 홈 링 · 카드 · 달력 그날 칸 · 영양 탭 · 식단 짜기가 다 쓰는 공용 — 새 프로필 칸은 null 이면 예전 숫자와 1kcal 도 다르지 않게(targets.ts:51-53 '넷 다 null 이면 똑같다' 패턴). 바꾸면 `npm run nutrition:test`(413) · `nutrition:advice-test`(43) · `npx tsc --noEmit` 으로 확인.
- `GoalKey · ActivityKey · AgeBand` 는 Record 키(age.ts goalDelta · paces · goalHint, meta.ts factor, advice.ts 규칙)라 값을 더하면 tsc 가 모든 Record 를 잡는다. `toProfile`(load.ts:171-172)은 목록 밖 값을 DEFAULT 로 떨어뜨려 옛 줄은 안 깨진다.
- `loadAdvice` · `loadDayDetailCached` 는 React `cache` 라 인자 user 객체가 레이아웃의 `requireUser()` 그 객체여야 한 요청에 한 번만 돈다(day-detail.ts:94-99, advice-load.ts:13-15). hour 는 숫자로 넘긴다(Date 면 매번 달라 cache 가 못 맞춤).
- 목표의 체중은 `recentWeightKg`(30일 안 DailyNutrition → DailyCheckin)가 `User.weightKg` 보다 앞선다(day-detail.ts:122-128, load.ts:372-376) — 온보딩에서 User.weightKg 만 바꾸면 최근 30일에 기록이 있는 사람은 그 기록이 이긴다.
- 체크인 식사 칸은 폼이 `body=1` 을 보낼 때만 저장(`app/actions/checkin.ts:91-100`) — 옛 화면이 아침 값을 빈 값으로 덮지 않게 한 장치. 온보딩이 체크인을 대신 저장하거나 체크인 폼 구조를 바꾸지 않는다.
- DB 규칙(AGENTS.md): `prisma migrate dev · db push · reset` 금지. 칸을 더하면 `schema.prisma` → `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` → `prisma/migrations/<시각>_<이름>/migration.sql` → `migrate deploy` → `generate`. 시작 전 상대방에게 알리고 `npm run backup`. 새 칸은 `@default` 또는 `?`. HANDOFF.md 로 김민에게 `npx prisma generate` 알림. `npx prisma format` 은 남의 줄 88줄을 바꾸니 쓰지 않는다. 새 표 · 칸 뒤엔 개발 서버 다시 켜기(옛 Prisma 클라이언트).
- `saveNutritionProfile` 은 goal · activity · 속도 · kcalTarget 이 바뀌면 `planSince` 를 그날로 다시 잡는다(nutrition.ts:884-896 `planOnSave`) — 온보딩 저장 한 번이 체중 흐름 판정의 시작일이 된다. 목표 체중은 `checkTargetWeight`(weight-goal.ts:488) 범위 검사를 지나야 하고 속도는 `paceChoices(age, goal, refKg)`(체중 70kg 밑은 성인 증량 0.35 불가, age.ts:226-243) 안이어야 한다.
- 성장기 규칙: 어린이 감량은 유지로 셈(`effectiveGoal` age.ts:148), 성장기 감량 −200 까지, 단백질은 나이 범위로 당김(138-145), 홈 조언은 child · teen 에게 '덜 · 가볍게 · 줄이 · 빼고 · 적게 먹' 을 내지 않고 성인 감량에도 '굶 · 거르' 없음(advice.ts:16 · 시험이 격자로 본다). 온보딩 문구 · 선택지도 같은 선을 지킨다(어린이에게 감량 카드 · '빠르게' 속도를 보이지 않기).
- 목표 구속은 영양 계산에 넣지 않는다(advice.ts:14, 동기 문구만). 상표 · 제품 · 보충제 이름 금지(advice.ts:17). AI 는 김민과 회의 전까지 새 기능을 켜지 않는다(`lib/ai/features.ts`) — 인아웃의 코치 캐릭터 · 말투 고르기는 넣지 않는다.
- 글 규칙: 해요체 · 줄표(—) 없음 · 문장 속 굵게 없음 · 11px 아래 글자 금지 · 임의 px 글자(text-[13px]) 금지 · 휴대폰 입력칸 16px(globals.css coarse 규칙이 자동). 시트는 `Modal`(`data-sheet`), 확인은 `ConfirmDialog`, 저장 단추는 `orOffline` · 폼은 `SafeForm`. 안전 영역은 `data-safe-area`, 바닥 단추는 `bottom: var(--kb,0px)`.
- 홈 링의 영양 값은 `advice.score` 가 null 이면 `kcal/target.kcal` 로 떨어진다(today-rings.tsx:83-88) — 온보딩이 NutritionProfile 을 만들어도 음식 · 체크인 식사를 안 적은 날 링은 '남기기'다. 점수를 만드는 입력은 MealEntry 또는 DailyCheckin.nutrition/skippedMeals 뿐(advice.ts:581-629).
- `DayDetailUser` · `UserBody` 가 요구하는 칸은 id · birthDate · sex · heightCm · weightKg(day-detail.ts:84-91, load.ts:136-143) — 가입 직후 레이아웃이 `requireUser` 로 읽는 객체에 이 칸이 다 있으므로 온보딩이 User 칸을 바꾸면 다음 요청의 홈에 바로 반영된다(`staleTimes.dynamic 30` 때문에 30초 안 되돌아온 탭은 옛 값일 수 있다 — `quietRefresh` 로).

### 지도 4

## 영양 계산 갈래(calc) 지도 — 2026-10-08 읽은 코드 기준

### 1. 자료 흐름 한 줄
가입(`app/actions/auth.ts:101-124` — 생년월일 · 키 · 성별만, **체중은 안 받음**) → `User.birthDate · sex · heightCm · weightKg`(`prisma/schema.prisma` User 33~42행) → `lib/nutrition/load.ts:226-401 loadNutritionDay` 가 몸(Body) + 영양 목표 줄(`NutritionProfile`, schema 1189~1229행) + 그날 운동 · 투구 → `lib/nutrition/targets.ts:157 computeTargets` → 화면 · 식단 짜기(`meal-plan.ts` PlanInput.targets) · 조언(`advice.ts` AdviceInput.target) · 홈 링(`lib/day-detail.ts:138`, 같은 함수). 목표 줄은 `app/actions/nutrition.ts:795 saveNutritionProfile`(숫자 계획) · `:628 saveDietPrefs`(취향) · `:946 applyWeightStep`(±100kcal 한 걸음) 셋이 쓴다. 영양 밖에서 이 줄을 읽는 곳은 `app/(app)/training/page.tsx:253`(seasonPhase 만) 하나.

### 2. 공식(지금 코드 그대로)

**몸 짐작값** `targets.ts:92` — 비면 W 75kg · H 178cm · 20세, `assumed[]` 에 표시(:162-166). 성별 모름은 남녀 가운데 값.

**기초대사량** `targets.ts:144-153 basalKcal`
- 만 18세 이상(Mifflin-St Jeor): `BMR = 10·W + 6.25·H − 5·A + s`, s = +5(M) · −161(F) · −78(모름). 시험: 남 80/180/20 = 1830(`scripts/nutrition-selftest.mts:182`).
- 만 18세 밑(Schofield, `age.ts:156-161`): 10세 미만 M `22.706W+504.3` · F `20.315W+485.9`, 10~17세 M `17.686W+658.2` · F `13.384W+692.6`, 모름은 평균. 시험 65kg 15세 = 1808(`selftest:1036`).
- 나이는 `targets.ts:130 ageOn(birthDate, 'YYYY-MM-DD')` 만 나이.

**활동 배수** `meta.ts:63-67 ACTIVITIES` — low 1.3 '주로 앉아서 · 팀 훈련 없음' · mid 1.5 '주 3~4일 팀 훈련' · high 1.7 '거의 매일 팀 훈련'. 기본 mid(`targets.ts:169` 못 찾으면 ACTIVITIES[1]). **설계 의도(meta.ts:56-62)**: 앱에 적은 운동 · 투구는 OUT 으로 따로 더하므로 배수에는 '앱에 안 적히는 움직임'만 — 일반 계산기의 1.725 를 고르면 운동을 두 번 센다.

**목표 가감(delta)** `age.ts:213 paceDelta(age, goal, rateKg)` ← `effectiveGoal`(:148, 어린이 감량 → 유지) · `effectiveRate`(:184).
- 나이 칸 `age.ts:120 ageBand`: child ≤12 · teen 13~17 · adult ≥18(생년월일 모름 = adult).
- `AGE_RULES`(:60-118) goalDelta: child {gain +200, maintain 0, lose 없음} · teen {+300, 0, −200} · adult {+300, 0, −400}.
- 속도표 paces: adult gain 0.25kg→300 · 0.35→400, adult lose 0.25→300 · 0.35→400, teen gain 0.25→300, teen lose 0.2→200, child 없음. **기본 속도 = goalDelta 와 같은 kcal 인 칸**(`:173 defaultPace`) → 성인 증량 기본 0.25(+300), **성인 감량 기본 0.35(−400)**, teen 증량 0.25 · 감량 0.2. 저장값 null = 기본(`:202 storedRate`). 0.35 증량은 체중 70kg 이상만 고를 수 있음(`:166 GAIN_FAST_MIN_KG`, `:226 paceChoices`).
- `delta = goal==='lose' ? −pace.kcal : +pace.kcal`(:219).

**체중 흐름 조정(adjust)** `age.ts:254 effectiveAdjust` — child · 나이 모름 0, teen 0~+200, adult gain −200~+300, adult maintain 0~+300, lose 0~|delta|(덜 빼는 쪽만). 직접 kcal 을 정했으면 0(`targets.ts:182`).

**운동 전 목표(base)** `targets.ts:185`: `base = kcalTarget ?? round10(BMR × factor + delta) + adjust`. 직접 정한 kcalTarget 은 1,000~6,000(`actions/nutrition.ts:815-823`).

**오늘 목표(kcal)** `:188-189`: `kcal = base + max(0, round(burn))`.

**운동 소모(OUT)** `lib/nutrition/burn.ts:34 kcalFor`: `(MET − 1) × 3.5 × W ÷ 200 × 분`. 트레이닝 MET 5 · activeSeconds/60 분(:39). 투구 MET `3.5 + (RPE−1)×(2.5/9)`, 분 = `max(1, round(구 × 25초 / 60))`, 쉬는 날 세션 제외(:54-70). 날마다 `load.ts:378-392` 가 그날 세션 · 투구에서 셈(체중 모르면 75).

**영양소(단백질 → 지방 → 탄수화물)** `targets.ts:191-195`
- `proteinPerKg = effectiveProtein(profile.proteinPerKg, age)`(`age.ts:138`): null → 나이 기본(child 1.2 · teen 1.5 · adult 1.8), 성인은 그대로, 미성년은 그 나이 범위 [1.2~1.5 / 1.3~1.8] 로 당김. 저장 범위 1.2~2.5(`meta.ts:79-80`).
- `protein = proteinTargetG ?? round(proteinPerKg × W)`(직접 g 는 10~450, `meta.ts:85-86`).
- `fat = round(max(kcal × 0.25 ÷ 9, 0.8 × W))`.
- `carbs = max(0, round((kcal − 4·protein − 9·fat) ÷ 4))` — 남는 것 전부라 운동한 날 탄수화물이 저절로 늚.
- 80kg 성인 유지 · 보통: base 2750 · P 144g · F 76g · C ≈ 372g(≈ 21 : 25 : 54 %), 시험 `selftest:188-196`.
- `paceKg`(:186): 나이 모름 · child → null, maintain → 0, 아니면 rate.

**Targets 가 내주는 것**(`targets.ts:94-127`): bmr · base · burn · kcal · protein · fat · carbs · weightKg · assumed · manual · ageBand · proteinPerKg · proteinAuto · proteinManual · goal · delta · adjust · paceKg. **'활동대사량(BMR × factor)'은 칸이 없다** — base 에서 delta · adjust 를 빼도 round10 때문에 정확히 안 돌아온다.

**끼니 단백질** `lib/nutrition/meal-protein.ts:38 mealProteinGoal` = `clamp(round5(하루 ÷ 4), 20~40g(어린이 15~30))`.

**속도 → 주 수** `weight-goal.ts:428 etaWeeks(remainingKg, paceKg)` = `ceil(round(남은×10)×2 ÷ round(속도×20))` 정수 나눗셈, 52주 넘으면 null(`:99 ETA_MAX_WEEKS`). 목표 창 `goal-sheet.tsx:348-354`: `left = ±(targetSave − refKg)`, `weeks = etaWeeks(remaining, pickedRate)` → '계획대로면 약 N주'(:372).

**목표 날짜 → 속도** `goal-sheet.tsx:375-412`: `endDate = today + 주×7`(PERIOD_WEEKS [4,8,12,16,24], :800) · `needed = remaining ÷ (dayGap÷7)` · `pickPeriod` 가 needed 이상인 가장 느린 속도, 없으면 가장 빠른 속도 + "약 N주 걸려요". 날짜는 `saveDietPrefs` 의 goalEndDate 로 저장(:296), 내일~730일(`diet-prefs.ts:95 GOAL_END_MAX_DAYS`, `:127 cleanDietPrefs`).

**목표 체중 범위** `weight-goal.ts:456 targetRange`: 증량 [지금+0.5, 지금×110%(teen)/115%(adult)], 감량 [max(지금×90%, BMI 20 체중), 지금−0.5] — 감량은 성인만(`:440 targetAllowed`) · 키 필요. 저장 검사 `:488 checkTargetWeight`(이미 저장된 값과 같으면 통과).

**체중 흐름 판정** `weight-goal.ts:267 weightTrend`(56일 Theil-Sen 이상값 제거 → 최소제곱 기울기×7 = 주당, 표준오차 · 상관 0.4 부풀림) → `:580 weightGoal`(계획 시작 +4일 뒤 구간, 죽은 구간 0.10kg/주, 올리기 2.5σ · 내리기 3σ, 식사 기록 14일 중 8일 이상일 때만 85%/115% 로 막음) → `:836 goalCopy` 글. 권유는 단추(`applyWeightStep`, 서버가 다시 셈해 같을 때만 저장, kcalAdjust + planSince=오늘).

**저장 규칙** `weight-goal.ts:533 planOnSave`: 목표 · 활동 · 속도 · 직접 kcal 중 하나라도 바뀌면 kcalAdjust=null · planSince=오늘(증량→유지만 올린 조정을 남김). `saveNutritionProfile`(actions:795-937): 검사 → prev 읽기 → 오늘 나이 · refKg(`load.ts:198 recentWeightKg` 30일 안 최근 ?? User.weightKg) → 속도는 `paceChoices` 안이거나 저장된 그대로일 때만 → `checkTargetWeight` → `planOnSave` → upsert → 옛 화면의 sex 는 User.sex 가 비었을 때만 채움. `saveDietPrefs`(:628-670): `cleanDietPrefs` → upsert 6칸 → 오늘 식단에서 못 먹는 것 제거.

**loadNutritionDay 가 합치는 것**(`load.ts:247-343` 쿼리 13개 한 번에): 목표 줄 · 끼니 기록(띠 · 7일) · DailyNutrition 체중 56일 · 체크인 체중 56일 · 트레이닝 세션 · 투구 기록(14일+) · 최근 음식 · 내 음식 · 조합 · 인기 · 1년 캘린더 · 오늘 · 어제 체크인(throwPlan · appetite · soreness) · 오늘 식단. 체중은 '그날 → 30일 안 최근(영양 탭 > 체크인) → User.weightKg'(:354-376). 생일로 나이 칸이 바뀐 날을 계획 시작일로 침(:420-431). `hasProfile = profileRow !== null`(:556) 이 '처음 설정을 권함' 신호.

**조언 범위** `advice.ts:118-126` 체중 1kg 당 탄 3~5(쉬는 날) · 5~7(운동 · 던지는 날), 단 1.6~2.2, 지 0.8~1.2 → `ranges()`(:208-237) 가 사용자 목표(computeTargets)가 ±10% 밖이면 목표 쪽으로 당김(`pullToTarget` :194). 점수 `closeness` 85~115% 만점, 10% 마다 −20(:572-578).

### 3. 인아웃 15 · 16 · 17 을 지금 코드로 어디까지 내나
| 인아웃 | 지금 | 비고 |
|---|---|---|
| 15 기초대사량 1886 | `targets.bmr` ✓ (목표 창 :712 에 식 이름과 함께 표시) | 나이 · 성별 · 키 · 체중 넷 다 있어야 짐작 없음 |
| 15 활동대사량 2452 | ✗ 칸 없음 — `round10(bmr × factor)` 를 Targets 에 더해야 | base 에서 역산 불가(round10) |
| 15 목표 칼로리 1839 ✎ | `targets.base`(운동 전) ✓ · 직접 고치기 = kcalTarget ✓ | 인아웃은 운동이 배수에 포함, 우리는 OUT 으로 날마다 더함(`kcal = base + burn`) — 홈 숫자는 base 가 아니라 kcal |
| 15 약 23주 | `etaWeeks` ✓ (목표 체중 + 증량/감량 + 성인(감량) 또는 성장기(증량) + 체중 알 때) | 52주 넘으면 null · 체중 88→75(−14.8%)는 `TARGET_LOSE_MIN_PCT 90` 에 막힘 |
| 15 체중 곡선 88→75 | ✗ 예상 곡선 없음(실제 기록 그래프만 `charts.tsx`) | 선형 `now − pace×week` 로 그릴 수 있음 |
| 10 속도 슬라이더 | 성인 2단(0.25/0.35), 성장기 1단, 어린이 0 ✓ | 연속 슬라이더가 아니라 칸 |
| 16 일반/운동/키토/비건 → 탄단지 비율 | ✗ `DIET_STYLES` 는 한식/골고루/간편식(요리 취향, `meal-plan.ts:426 styleScore` 만 읽음). 비율 프리셋 없음 — 지방 25% 고정 · 탄수화물은 나머지 | 비건은 `AVOIDS` 6개로 흉내 가능하나 틀(CONTAINS)이 비건 식단을 못 짬 |
| 17 탄단지 g · % 직접 고치기 | 단백질 g ✓(proteinTargetG) · kcal ✓ / 탄수화물 · 지방 g ✗ | 우리 모델은 kcal 이 먼저고 탄은 나머지 — 인아웃은 g 가 kcal 을 움직임(방향 결정 필요) |
| 9 활동량 5단계 | 3단계 `ACTIVITIES` | 아래 대응 |
| 4 목표 5개 | `GOALS` 3개(gain/maintain/lose) | 근육량 증가 ≈ gain + proteinPerKg 2.0~2.2, 체지방률 감소 ≈ lose + 단백질 높임 — proteinPerKg 는 이미 칸이 있어 DB 없이 가능. 어린이 감량 없음 · 성장기 −200 규칙은 그대로 |
| 5 · 6 이유 · 경험 | 칸 없음, 계산에 안 쓰임 | 저장하려면 새 칸 |
| 8 시작 체중 | 가입이 안 받음 → `setWeight`(actions:286, DailyNutrition.weightKg) 또는 내 정보(User.weightKg) | 온보딩에 체중 단계 필요 |
| 2 생년월일 · 성별 | User.birthDate · User.sex ✓ | `ageOn` · `basalKcal` 의 s |

**활동량 5단계 ↔ ACTIVITIES 대응**: 매우 적음 · 적음 → low 1.3, 보통 → mid 1.5, 많음 · 매우 많음 → high 1.7. 일반 계산기(1.2 · 1.375 · 1.55 · 1.725 · 1.9)를 그대로 넣으면 앱에 적은 트레이닝 · 투구(OUT)와 두 번 센다(meta.ts:56-62) — 5단계로 늘리면 '운동 뺀 움직임'으로 글을 다시 쓰고 배수를 1.2/1.3/1.5/1.7/1.9 처럼 두되 기존 세 키의 값은 지켜야 셀프테스트와 모든 사용자의 목표가 안 흔들린다.

**그대로 쓸 수 있는 것**
- `lib/nutrition/targets.ts:157 computeTargets(profile, body, burnKcal)` — 순수 함수라 온보딩 미리보기(화면)에서 바로 호출해 숫자를 보일 수 있다(`goal-sheet.tsx:242-247` 가 이미 그렇게 한다: draft 로 preview · auto 두 번).
- `lib/nutrition/targets.ts:144 basalKcal` · `lib/nutrition/age.ts:156 schofieldKcal` — 기초대사량 그대로.
- `lib/nutrition/targets.ts:130 ageOn(birthDate, todayKey)` — 생년월일 → 만 나이.
- `lib/nutrition/age.ts:60 AGE_RULES` · `:127 ageRule` · `:148 effectiveGoal` · `:138 effectiveProtein` · `:184 effectiveRate` · `:226 paceChoices` · `:213 paceDelta` · `:173 defaultPace` · `:202 storedRate` — 나이 · 목표 · 속도 규칙 전부. 온보딩의 목표 · 속도 단계는 이 함수들로 선택지를 만들면 서버 검사와 같다.
- `lib/nutrition/meta.ts:44 GOALS` · `:63 ACTIVITIES` · `:79-86 PROTEIN_MIN/MAX · PROTEIN_G_MIN/MAX` · `:265 kcalText` · `:271 gramText` — 이름 · 범위 · 숫자 글.
- `lib/nutrition/weight-goal.ts:428 etaWeeks(remainingKg, paceKg)` — 'N주면 달성' 숫자. `:456 targetRange` · `:488 checkTargetWeight` — 목표 체중 칸의 범위와 검사(화면 · 서버 같은 함수). `:533 planOnSave` — 저장 미리보기.
- `app/(app)/nutrition/goal-sheet.tsx:375-412` — '언제까지' 날짜 ↔ 필요한 속도 계산(`needed = remaining ÷ 주 수`, `pickPeriod`), `:800 PERIOD_WEEKS`, `:803 dayGap`, `:811 dateText`. 슬라이더 대신 칸으로 옮겨 쓸 수 있다.
- `app/actions/nutrition.ts:795 saveNutritionProfile(ProfileInput)`(:773 타입) · `:628 saveDietPrefs` · `:286 setWeight(date, kg)` — 온보딩 마지막에 그대로 부르면 된다(둘 다 upsert · 조정 · 계획 시작일은 서버가 정함).
- `lib/nutrition/load.ts:198 recentWeightKg(userId, date)` — '지금 체중' 규칙(그날 → 30일 안 최근 → User.weightKg). 온보딩 시작 체중의 기준값으로.
- `lib/nutrition/load.ts:153 toProfile(row)` · `lib/nutrition/diet-prefs.ts:100 toDietPrefs(row)` — DB 줄 → 설정(옛 줄도 받음). `NutritionDay.hasProfile`(load.ts:75-76 · :556) 이 '아직 목표를 안 정함' 신호 — 온보딩 들어갈지 판단에 쓸 수 있다.
- `lib/nutrition/burn.ts:34 kcalFor` · `:39 trainingBurn` · `:54 pitchingBurn` — 인아웃 12번 '운동 기록하면 소모 칼로리' 설명 화면의 숫자 예시로.
- `lib/nutrition/meal-protein.ts:38 mealProteinGoal` — '세 끼에 N g 씩' 한 줄(goal-sheet:683 이 쓴다).
- `lib/nutrition/advice.ts:118-124 CARB_PER_KG · PROTEIN_PER_KG · FAT_PER_KG` · `:208 ranges` — 탄단지 '권장 범위' 글에 쓸 수 있는 근거값(체중 1kg 당).
- `lib/units.ts:63 toWeight/:68 fromWeight(kg↔lb)` · `:53 toLength/:58 fromLength(cm↔in)` · `components/use-units` `useWeightUnit` — 인아웃의 kg/lb · cm/ft 토글 자리(지금은 cm/in, localStorage 기기별).
- `lib/profile.ts:59 SEXES · :66 isSex · :71 SEX_OPTIONS` — 성별 시트.
- `scripts/nutrition-selftest.mts:176-240 · 1310-1420` — 목표 계산 시험 묶음(`npm run nutrition:test`, 413개 24초). 공식을 건드리면 여기에 사례를 더한다.

**빈 곳(인아웃과 견줘)**
- 활동대사량(BMR × 활동 배수) 칸이 `Targets`(targets.ts:94-127)에 없다 — 인아웃 15 '내 활동 대사량 2452' 를 보이려면 `tdee`(또는 `maintenance`) 를 computeTargets 가 `round10(bmr × factor)` 로 내줘야 한다(base 에서 역산하면 round10 때문에 어긋난다). 부르는 곳(goal-sheet · nutrition-view · day-detail · advice-input · meal-plan · selftest)은 칸이 늘어도 깨지지 않는다.
- 식단 스타일 → 탄단지 비율(인아웃 16 · 17)이 없다. `DIET_STYLES`(diet-prefs.ts:32)는 한식/골고루/간편식(요리 취향)이고 `meal-plan.ts:426 styleScore` 만 읽는다. 영양소 배분은 targets.ts:191-195 에 고정(단백질 체중당 → 지방 25%(바닥 0.8g/kg) → 탄수화물 나머지). 비율 프리셋(일반/운동/키토/비건 또는 우리식 '균형/운동/던지는 날')을 두려면 (a) `NutritionProfile` 에 `macroSplit String?` 또는 `fatTargetG Float? · carbTargetG Float?` 같은 선택 칸 추가(기본값 null = 지금과 같은 숫자 — AGENTS.md 2번 규칙), (b) computeTargets 에 '지방 비율 · 탄수화물 g' 분기, (c) 투수 규칙과 충돌 검토(키토는 던지는 날 탄수화물 원칙 · 성장기 보호와 맞지 않음, 비건은 `AVOIDS` 6개로 흉내는 되나 끼니 틀 `CONTAINS` 가 비건 식단을 못 짠다).
- 탄수화물 · 지방 g 직접 고치기(인아웃 17)가 없다 — 직접 정할 수 있는 것은 kcal(kcalTarget 1,000~6,000)과 단백질 g(proteinTargetG 10~450)뿐. 인아웃은 g 를 고치면 kcal 이 따라 바뀌는데 우리는 kcal 이 먼저고 탄은 나머지 — 어느 쪽이 주인인지 결정이 필요하다(제안: kcal 주인 유지, 지방 g 를 선택 칸으로 받고 탄수화물은 계속 나머지).
- 활동량이 3단계(low 1.3 · mid 1.5 · high 1.7)라 인아웃 5단계와 1:1 이 아니다. 대응: 매우 적음 · 적음 → low, 보통 → mid, 많음 · 매우 많음 → high. 5단계로 늘리려면 ACTIVITIES 에 키를 더하되(기존 세 키 값 유지) 글은 '운동 · 투구를 뺀 평소 움직임(팀 훈련 일수)' 으로 — 일반 계산기 배수(1.725 · 1.9)를 그대로 쓰면 OUT 과 두 번 센다(meta.ts:56-62).
- 목표가 3개(증량 · 유지 · 감량)라 인아웃의 '근육량 증가 · 체지방률 감소' 가 없다. DB 없이: 근육량 증가 = gain + proteinPerKg 2.0~2.2, 체지방률 감소 = lose + 단백질 높임으로 매핑(proteinPerKg 는 이미 칸). 어린이 감량 없음 · 성장기 감량 −200 · 미성년 단백질 범위 당김(age.ts) 은 어떤 이름을 붙여도 그대로 적용된다.
- '목표 이유' · '경험'(인아웃 5 · 6)은 칸이 없고 계산에도 안 쓰인다. 저장하려면 `NutritionProfile` 또는 `User` 에 선택 칸(기본값 null) 추가 — 계산에는 넣지 않는 것이 맞다(사용자 규칙: 질문은 계산을 바꿔야 하므로, 넣지 않을 질문은 격려 문구로만).
- 가입이 체중을 안 받는다(auth.ts:101-124 는 생년월일 · 키 · 성별만). 온보딩 '시작 체중' 단계가 `setWeight`(actions:286, DailyNutrition.weightKg) 또는 User.weightKg 를 적어야 computeTargets 의 짐작(75kg)이 안 뜨고 목표 체중 · N주가 나온다.
- 'N주 예상'(etaWeeks)은 52주 넘으면 null(ETA_MAX_WEEKS), 목표 체중은 감량 −10% · BMI 20 바닥 · 성인만(TARGET_LOSE_MIN_PCT 90, targetAllowed) — 인아웃의 88→75kg(−14.8%)는 지금 규칙에서 거절된다('목표 체중은 79.2~87.5kg 사이'). 온보딩 화면에서 범위를 먼저 보이든 규칙을 풀든 결정 필요(투수 앱 설계 규칙이라 푸는 것은 사용자 확인).
- 예상 체중 곡선(인아웃 15 그래프)이 없다 — `charts.tsx` 는 실제 기록만. 선형 예상(`now ∓ paceKg × 주`)을 그리는 작은 순수 함수가 필요하다.
- 속도가 슬라이더가 아니라 칸(성인 2 · 성장기 1 · 어린이 0, paces) — 인아웃의 '느리게 · 추천 · 빠르게' 는 성인 감량에서 0.25(천천히) · 0.35(보통=기본) 두 칸으로만 대응. 더 잘게 나누려면 AGE_RULES.paces 에 칸을 더하고 defaultPace 규칙(goalDelta 와 같은 kcal)을 지켜야 옛 사용자 숫자가 안 바뀐다.
- 인아웃 홈 '0 / 1839 kcal' 은 운동 포함 배수의 하루 목표 하나지만 우리는 `base`(운동 전) 와 `kcal`(= base + 그날 OUT) 둘이다 — 온보딩 요약 카드에 어느 숫자를 '목표 칼로리'로 적을지 정해야 한다(홈 링은 day-detail.ts:138 의 kcal).

**위험 · 지킬 규칙**
- DB 규칙(AGENTS.md 1 · 2): `prisma migrate dev · db push · reset` 금지, 구조는 schema 고침 → `migrate diff --script` → migrations 폴더 → `migrate deploy` + `generate`. 바꾸기 전 김민에게 알리고 `npm run backup`. 새 칸은 `?` 또는 `@default` 로(상대방 코드가 줄을 넣을 때 안 깨지게). `npx prisma format` 은 남의 줄 88줄을 바꾼다 — 손으로 정렬(geum-yunho.md 6번 함정). `NutritionProfile` 의 DB 에 남은 옛 `sex` 칸 때문에 migrate diff 가 `DROP COLUMN "sex"` 를 뱉을 수 있다(schema 1192-1194 주석) — 2026-10-03 에 2단계로 지웠다고 메모돼 있으니 diff 결과를 눈으로 확인.
- '새 칸이 비면 예전 숫자 그대로' 불변식 — targets.ts:51-53 · age.ts:28 주석, 셀프테스트 `selftest:1313-1324`(유지 2750 · 증량 3050 · 감량 2350), `:182-196`(BMR 1830 · 여 −166 · 단백질 144 · 지방 76). 공식 · 배수 · 기본 속도를 바꾸면 모든 사용자의 목표가 한 번에 움직이고 이 시험이 깨진다. 새 프리셋은 null 기본값에서 지금 숫자가 나오게.
- 나이 규칙은 저장이 아니라 읽을 때 건다(age.ts:32) — 어린이 감량 없음 · 성장기 −200 · 미성년 단백질 범위 · 조정 한도. 온보딩 선택지는 `ageRule(body.age)` 로 만들고, 생년월일 모름은 adult 로 계산하되 속도 · 조정 · 목표 체중은 없음(targets.ts:173-177 · effectiveRate age null → null). '성장기에 덜 먹어라 없음'(advice.ts:16, geum-yunho.md 9번) 은 문구에도 적용.
- `planOnSave`(weight-goal.ts:533): 목표 · 활동 · 속도 · 직접 kcal 중 하나라도 바뀌면 kcalAdjust 가 지워지고 planSince 가 오늘이 된다 — 온보딩을 기존 사용자에게 다시 돌리면 체중 흐름 판정이 18일 뒤로 밀린다. 기존 사용자는 값이 같으면 restart 가 안 되니 '바꾼 것만' 보내게.
- `saveNutritionProfile` 은 weeklyRateKg 를 `paceChoices(age, goal, refKg)` 안일 때만 받고 아니면 조용히 기본 속도로(actions:850-865), 목표 체중은 `checkTargetWeight` 로 거절한다(:867-881) — 온보딩 화면이 같은 함수로 미리 검사해야 '저장이 막힘'이 안 뜬다. 직접 kcal 1,000~6,000 · 단백질 1.2~2.5g/kg · g 10~450 범위도 같다.
- `Targets` · `ProfileSettings` 타입을 바꾸면 goal-sheet.tsx(:242 preview) · nutrition-view.tsx(:2169 '유지로 바꾸기' 미리 셈) · lib/day-detail.ts(:138 홈 링 — 사용자: 홈 영양 기능은 만지지 말 것, 그러나 같은 computeTargets 라 공식이 바뀌면 홈 숫자도 바뀐다) · lib/nutrition/advice-input.ts(target Macros) · meal-plan.ts(PlanInput.targets kcal · protein) · 셀프테스트 둘이 같이 바뀐다. 칸은 더하기만, 있는 칸 뜻은 유지.
- `AdviceInput · Advice · MoreToEat · MacroRange · TrainingKind · MealCheck`(advice.ts:31-109) 는 클라우드 가지 `cloud/nutrition-advice` 가 같은 시간에 손대는 타입 — 있는 칸의 이름 · 뜻 · 필수 여부를 바꾸지 않고 선택(`?`)으로만 더한다(geum-yunho.md '클라우드 세션 할 일 — 영양 조언').
- `DIET_STYLES` 키를 늘리면 `meal-plan.ts:426 styleScore` 의 switch 기본 분기(골고루)로 떨어지고, 비건 · 키토 같은 꼬리표는 `meal-templates.ts` 의 `CONTAINS` 에 없다 — 꼬리표는 빼지 않고 더하기만, 새 음식 · 꼬리표를 쓰면 `EXPECTED_AVOIDS` 시험도 같이(클라우드 메모 규칙). 시험 전체 30초 안.
- 체중 읽기 규칙은 두 곳이 같아야 한다 — `load.ts:371-376`(그날 → 30일 안 최근 → User.weightKg) 와 `recentWeightKg`(load.ts:198) 를 day-detail.ts:128 이 쓴다. 온보딩이 체중을 다른 표에 적으면 홈 · 탭 목표가 어긋난다. 체중 흐름의 상수(NOISE 0.8% · 상관 0.4 · 2.5/3.0σ)는 사전값(weight-goal.ts:40-43) — 손대지 않는다.
- 단위는 localStorage 기기별(lib/units.ts:8-10)이고 저장은 늘 cm · kg — 인아웃식 kg/lb · cm/ft 토글을 넣어도 서버에는 kg · cm 로(`fromWeight · fromLength`). 길이 단위는 'in' 이지 'ft' 가 아니다(LENGTH_UNITS).
- DB 는 운영과 하나(geum-yunho.md 2절) — 온보딩 시험 가입 · 기록을 만들지 않는다. 로그인 없이 보는 화면은 `app/dev-preview-*` 임시 경로로, 지운 뒤 개발 서버 재시작.
- 홈 캘린더 · 트레이닝 쪽은 영양 목표 줄에서 `seasonPhase` 만 읽는다(app/(app)/training/page.tsx:253) — 시즌 단계 칸의 키('off' · 'pre' · 'in' · 'rehab')는 바꾸지 않는다.
- 새 글은 해요체 · 줄표 없이 · 짧게(geum-yunho.md 3절 10-04~06 정리), 숫자 칸은 `inputMode="numeric" · "decimal"`, 폰 입력칸 16px 규칙(globals.css coarse 규칙이 처리). 사용자 규칙: 질문에는 이유가 있고 답이 계산을 바꿔야 한다 — 계산에 안 들어가는 질문(이유 · 경험)은 격려 · 문구 용도임을 분명히.

### 지도 5

## 프로필 갈래 지도 — 가입 답을 '나중에 고치는' 자리

### 1. 어디서 열리나(김민 영역 `components/app-shell.tsx`)
- 내 정보 = 아바타 단추. PC 위 막대 `app-shell.tsx:1245-1254`(`openFrom(e.currentTarget, setProfileOpen)`), 휴대폰 위 막대 `MobileTopBar onProfile` `:1286`, 큰 사이드바 `DetailMenu onProfile` `:1375`. → `<Modal title="내 정보">` `:1350-1357` 안에 `ProfilePanel data={profile} avatarUrl today`.
- 설정 = 톱니. `SettingsCog onOpen` `:1237-1240`, 휴대폰 `onSettings` `:1284` → `<Modal title="설정">` `:1341-1348` 안에 `SettingsPanel data={settings} returnTo={here}`.
- 두 창의 자료는 `app/(app)/layout.tsx:129-153`이 `requireUser()`로 읽은 `user`에서 만든다 — `profile`(email · nickname · birthDate(`toDateInputValue`) · sex(`isSex`) · heightCm · weightKg · wingspanCm · targetVelocity · dailyWorkoutMinutes · baseline 6칸 · isAdmin), `settings`(trainingLevel · ownedEquipment), `today={todayKey()}`. 읽는 칸 목록은 `lib/dal.ts:14-45`(`getCurrentUser` select) — **새 User 칸은 여기와 `layout.tsx:129-153`, `ProfileData`(`components/profile-panel.tsx:6-27`)에 같이 더해야 창에 보인다.**

### 2. 내 정보 창 `components/profile-panel.tsx:43-88`
세로로 셋: `AvatarPicker`(`:57`) → `ProfileForm`(`:59-72`) → 계정(이메일 · 관리자 안내 · `AccountActions` `:74-85`). 머리 주석(`:29-42`): 예전엔 창 + 화면 두 벌이었다가 **전부 창 하나로** 넣었고, 사진(고르면 바로 저장)과 나머지(한 번에 저장) 저장 단추가 두 벌인 것은 의도.

### 3. `app/(app)/profile/profile-form.tsx:282-481` — 폼 하나, 저장 단추 하나
- `useActionState(guardFormAction(updateProfile))` `:314-318`, 저장되면 `toast('저장했어요')` `:323-325`, 오류면 적던 값 복원 `pick()`/`kept()` `:331-333`. 생년월일은 상태로 쥐어 소속 칸이 따라 바뀜 `:335`.
- 아이폰 설정 목록 모양(`ListGroup`/`ListRow`/`SelectRow`, `:340-344` 주석). 묶음 다섯:
  1. **기본 정보** `:349-375` — 닉네임(`ROW_INPUT`, 2자 required) · 생년월일 `BirthDatePicker` `:226-280`(`MiniCalendar` pickYear, min/max = 만 5~100세) · 성별 `SelectRow name="sex"`(안 고르면 그대로, `:365-368`). 꼬리글: "생년월일로 안전한 투구수 한도와 영양 기준을, 성별로 영양 목표를".
  2. **몸** `:377-407` — 키(정수 cm) · 몸무게 · 윙스팬 = `BodyField` `:79-161`(고른 단위 inch/lb로 보이고 hidden 칸이 늘 cm/kg 전송, 적는 중 글자 보존 draft `:124-130`) · 목표 구속 `TargetVelocityField` `:172-214`(km/h 정수 저장, mph 표시).
  3. **운동** `:409-426` — 하루 운동 시간 `SelectRow`(`WORKOUT_MINUTES_CHOICES` "45분" 꼴) · 던지는 손(`THROWING_HANDS` 우투·좌투·양투).
  4. **평소 투구 · 웨이트** `:429-457` — 던지는 횟수 · 한 번에 양 · 강도 · 웨이트 횟수(`BASELINE_*_NAMES`). 꼬리글 "부하 지수를 첫날부터".
  5. **소속** `:463-476` — `LevelChoices size="sm" birthDate={birth}`(나이 밖은 흐리게 막힘).
- `SubmitButton` `:57-64` 하나.

### 4. 저장 `app/actions/profile.ts`
- `updateProfile` `:31-37` → `withInput(tryUpdateProfile)`. 검사 차례(`:39-130`): 닉네임 2자 → `validateProfile(birthDate, heightCm, {requireBirthDate:true})` → 문진 6칸 중 하나라도 왔으면 `validateBaseline`(투구 3 + 웨이트 + 던지는 손 **모두 필수**, 소속만 선택) + `levelAgeProblem` → 몸무게 · 윙스팬 `checkOptionalNumber`(**빈칸 = null로 지움**) → 목표 구속 `validateTargetVelocity`(빈칸 = 지움) → 성별(**빈값 = 그대로**) → 하루 운동 시간(빈값 = 그대로, 목록 대조). `prisma.user.update` `:132-149`, 주석 `:143-147`: **경력 · 목표 · 장비는 여기서 안 건드린다**(같이 쓰면 저장마다 지워짐). `revalidatePath('/', 'layout')` `:152`.
- `saveAvatar(path|null)` `:171-209` — `isOwnAvatarPath` 검사, 옛 파일 삭제, layout 재검증. 올리기 흐름은 `avatar-picker.tsx:272-321`(shrinkImage → `/api/profile/avatar-url` PUT → saveAvatar).
- 계정 동작 `account-actions.tsx:47-105` — 로그아웃(form action logout) · 비밀번호(`PasswordForm` Modal `:107-162`) · 탈퇴(`LeaveForm` `:164-205`, '탈퇴' 두 글자 확인).

### 5. 규칙 · 상수 `lib/profile.ts`
키 100~250 `:8-9`, 몸무게 20~200 · 윙스팬 100~260 `:21-24`, `checkOptionalNumber` `:32-48`(소수 1자리), `SEXES`/`isSex`/`SEX_OPTIONS` `:59-71`(주석 `:50-57`: 성별은 계정 값, 영양 창에서 따로 묻지 않는다), `MIN_AGE 5`/`MAX_AGE 100` `:74-75`, `parseBirthDate` `:78-85`, `ageFromBirthDate` `:93-100`, `validateProfile` `:111-150`(키는 정수만).

### 6. 설정 창 `components/settings-panel.tsx:111-173`
화면(`ThemeToggle`) · 단위(`UnitToggle` → `lib/units.ts:13-15` localStorage, 저장은 늘 cm/kg) · **트레이닝**(`TrainingSettingsForm` `components/training-forms.tsx:498-563`: 웨이트 경력 `RadioGroup` 고르면 `requestSubmit`으로 바로 저장 `:526-540` → `saveTrainingSettings` `app/actions/training-setup.ts:91-105`; 가진 장비는 제 단추 `saveOwnedEquipment` `:108-122`; 둘 다 `returnTo`로 redirect replace) · 정보(`SettingsInfoRows`). 머리 주석 `:101-110`: 몸 값 · 계정은 내 정보가 맡고 여기는 '어쩌다 한 번'만.

### 7. 공용 부품
`components/settings-list.tsx` — `ListGroup`(title/footer) `:15-35`, `ListRow` `:38-45`, `ROW_INPUT` `:48-49`, `RowUnit` `:52-54`, `SelectRow` `:62-108`(투명 select를 줄 전체에 깔고 값은 줄이 쥠, 빈값 '' = 고르지 않음 → 서버가 '그대로'로 읽는 약속 `:59-61`). `components/switch.tsx` — `Switch` `:134-164`(role=switch 체크 상자, 켜졌을 때만 name 전송), `SwitchRow` `:167-191`.

### 8. 가입 때 받은 답 → 나중에 고치는 자리(현재)
가입 단계 `app/login/auth-form.tsx:406-449`(basic · password · terms · body · pitching · weight · league), 서버 `app/actions/auth.ts:59-186`.
| 답 | 가입 | 고치는 곳 | 저장 칸 | 읽는 계산 |
|---|---|---|---|---|
| 닉네임 · 생년월일 · 성별 | basic | 내 정보 › 기본 정보 `profile-form.tsx:349-375` | `User.nickname/birthDate/sex` | 나이: 투구 한도 `lib/report/gather.ts:96`, 영양 나이 칸 `lib/nutrition/age.ts:121-126`(단백질 범위 · 감량 허용 · BMR 식), 프로그램 `app/actions/program.ts:86`, 재활 `rehab.ts:117`; 성별: BMR `lib/nutrition/targets.ts:20-26` |
| 키 | body(선택) | 내 정보 › 몸 `:381-389` | `User.heightCm` | BMR, 포즈 cm/px `lib/pose/measure.ts:107`, 목표 체중 범위 `lib/nutrition/weight-goal.ts:456-461` |
| 몸무게 · 윙스팬 · 목표 구속 | 안 받음 | 내 정보 › 몸 `:390-406` | `User.weightKg/wingspanCm/targetVelocity` | 몸무게는 영양 탭 체중 기록(`DailyNutrition.weightKg`, `app/actions/nutrition.ts:286-308`) · 체크인 `bodyWeightKg`(`components/checkin-form.tsx:418`)이 앞선다: `lib/nutrition/load.ts:354-375` `bodyKg = 그날 → 최근 30일 → user.weightKg` |
| 던지는 손 | body | 내 정보 › 운동 `:420-425` | `User.throwingHand` | 암케어 side `app/(app)/training/armcare-section.tsx:93-94`, 메커닉 `mechanics-section.tsx:41`, 구속 측정 `app/(session)/velocity/measure/page.tsx:31` |
| 투구 3문항 · 웨이트 횟수 | pitching · weight | 내 정보 › 평소 투구 · 웨이트 `:429-457` | `User.baseline*` | `estimateDailyLoad` `lib/baseline.ts:293-306`, `estimateTrainingDailyLoad` `:320-331` ← `lib/report/training-acwr.ts:96-99` |
| 하루 운동 시간 | 안 받음(기본 60) | 내 정보 › 운동 `:413-419` + 일정 만들기 '기본으로 쓰기' `training-setup.ts:349` | `User.dailyWorkoutMinutes` | 운동 개수 `app/(app)/training/page.tsx:139`, 운동 부하 seed |
| 웨이트 경력 | weight(필수) | **내 정보에 없음** → 설정 › 트레이닝 `settings-panel.tsx:142-153` | `User.trainingLevel` | 난이도 거름 `lib/report/personalize.ts:28-66` |
| 소속 | league | 내 정보 › 소속 `:463-476` | `User.competitionLevel` | **아무 계산도 안 읽음**(`lib/baseline.ts:74-83`, grep으로 확인) |
| 훈련 목표 · 부위 | 안 받음 | 프로필 · 설정 어디에도 없음. 트레이닝 '직접 고르기' 폼에서 매번(`training-forms.tsx:385-421`, `saveDefaults` 스위치 `:505-509` → `training-setup.ts:364-368`) | `User.trainingGoal/Focus` | 일정 `lib/report/daily-plan.ts:197-199` |
| 가진 장비 | 안 받음 | 설정 › 트레이닝 또는 첫 일정 만들기 `training-forms.tsx:270-291` | `User.ownedEquipment` | 장비 거름 |
| 영양 목표(gain/maintain/lose) · 평소 움직임(low/mid/high) · 단백질 g/kg · 직접 kcal · 직접 단백질 g · 목표 체중 · 주당 속도 · 언제까지 | 안 받음 | 영양 탭 '목표' 단추 `app/(app)/nutrition/nutrition-view.tsx:409-418` · 미설정 띠 `:436-454` → `GoalSheet` [목표] 칸 `goal-sheet.tsx:437-725` | `NutritionProfile`(`prisma/schema.prisma:1189-1230`) via `saveNutritionProfile` `app/actions/nutrition.ts:795-936` | `computeTargets` `targets.ts:157-212`(activity factor 1.3/1.5/1.7 `lib/nutrition/meta.ts:63-67`, goalDelta/paces `age.ts:57-119`) |
| 식단 취향(시즌 단계 · 스타일 한식/골고루/간편식 · 끼니 구성 · 못 먹는 것 · 보충식품) | 안 받음 | GoalSheet [식단 취향] `goal-sheet.tsx:829-937` | `NutritionProfile.seasonPhase…allowSupplements` via `saveDietPrefs` `nutrition.ts:628-676` | 식단 짜기 `lib/nutrition/meal-plan.ts`, 정의 `lib/nutrition/diet-prefs.ts:11-81` |
| 식욕 · 던지는 일정 · 끼니 양 · 걸른 끼니 · 근육통 · 체중 | — | **날마다 체크인**(`checkin-form.tsx:1263-1283, 1392-1420`; `lib/checkin.ts:298-307, 571-572`) | `DailyCheckin` | 영양 조언 `lib/nutrition/advice-load.ts:27-36` → `advice-input.ts:93-119` |

영양 목표 창은 `goal-sheet.tsx:722-723`에서 "성별·키·몸무게·생년월일은 내 정보(오른쪽 위 내 사진)에서 바꿔요"라고 다른 창으로 보내고, 영양 탭도 짐작 값이면 `nutrition-view.tsx:1484-1489` "내 정보에 몸무게·키… 넣으면 더 정확해져요"를 띄운다 — 지금은 **몸 사실(내 정보 창)과 영양 설정(영양 목표 창)이 두 창으로 갈려** 있다.

### 9. 온보딩에서 새로 묻는 것을 나중에 고칠 자연스러운 자리(제안)
- **몸 사실**(생년월일 · 성별 · 키 · 몸무게): 그대로 내 정보 › 기본 정보/몸. 인아웃처럼 '시작 체중 · 목표 체중' 한 화면이면 저장은 둘로 갈린다 — `User.weightKg`(`updateProfile`) + `NutritionProfile.targetWeightKg`(`saveNutritionProfile`, `checkTargetWeight` 검사 `nutrition.ts:874-887`). 영양 그래프에 첫 체중이 보이려면 `DailyNutrition.weightKg`(`setWeight`)도 넣어야 한다.
- **목표 · 목표 이유 · 경험 · 활동량 · 속도 · 식단 계획(탄단지) · 코치 말투**: 영양 목표 창 [목표] 칸에 `Row` + `Segmented`/`ChoiceChips` 줄로 더하는 것이 지금 구조에 가장 맞다(`goal-sheet.tsx:442-556` 패턴 — 고르면 `computeTargets(draft…)` 미리보기 `:242-247`가 바로 바뀜 = 인아웃 15 · 17 화면). 코치 말투가 영양만의 값이 아니면 설정 창 새 묶음(`SettingsPanel` `SECTION` `:179` + `SelectRow`)이 맞다.
- **운동 종류(여러 개)**: 설정 › 트레이닝(가진 장비 `CheckboxGroup` 옆, `training-forms.tsx:548-559`) 또는 내 정보 › 운동 묶음. 단 영양 OUT은 기록 기반(`advice-input.ts:63-83 trainingKinds`)이라 '평소 운동 종류'는 활동량 기본값 · 조언 문구에만 쓰인다.
- **물**: 9월에 뺐다(`docs/claude/geum-yunho.md` 영양 로드맵 '하지 않을 것'). 스키마에 water 칸 없음. 넣는다면 프로필엔 '하루 목표 L' 하나, 기록은 영양 탭.
- **요약 카드(인아웃 23)**: 내 정보 창 `AvatarPicker` 밑(`profile-panel.tsx:57-59`) 또는 영양 탭 맨 위에 '나의 목표' 카드로.

**그대로 쓸 수 있는 것**
- components/settings-list.tsx:15-108 — ListGroup(title · footer 꼬리글) · ListRow · ROW_INPUT · RowUnit · SelectRow: '나중에 고치기' 화면(아이폰 설정 목록) 그대로. SelectRow 빈값 '' = '그대로 둠' 약속(:59-61)
- components/switch.tsx:134-191 — Switch · SwitchRow(name · value 주면 켜졌을 때만 전송, hint 줄)
- app/(app)/profile/profile-form.tsx:79-161 BodyField — 단위 토글(cm/inch · kg/lb) + hidden 칸이 늘 기본 단위 전송 + 적는 중 글자 보존(draft): 인아웃 7 · 8 화면의 [cm|ft] [kg|lb] 토글에 그대로. :172-214 TargetVelocityField 같은 패턴
- app/(app)/profile/profile-form.tsx:226-280 BirthDatePicker + components/mini-calendar.tsx(pickYear · min/max 만 5~100세 · viewFrom) — 인아웃 2 생년월일 화면 재료
- components/level-choices.tsx:24-108 LevelChoices — 생년월일이 바뀌면 고를 수 있는 칸이 따라 바뀌고 안내 글이 다시 뜨는 패턴('답이 다음 질문을 바꾼다'의 본보기). lib/baseline.ts:166-188 levelFit · :194-203 levelAgeProblem(서버 재검사)
- lib/profile.ts:111-150 validateProfile · :32-48 checkOptionalNumber · :59-71 SEXES/SEX_OPTIONS/isSex · :93-100 ageFromBirthDate — 가입 · 내 정보가 이미 같이 쓰는 검사
- lib/baseline.ts:236-286 validateBaseline(투구 3 + 웨이트 + 던지는 손 필수, 소속 선택) · :19-48 선택지와 숫자(sessionsPerWeek · pitches · intensity) · :293-331 부하 추정 — 문진 단계를 옮겨도 서버 검사 그대로
- app/actions/profile.ts:105-130 '안 보냈으면 그대로' 패턴(sex · dailyWorkoutMinutes), app/actions/auth.ts:120-127 formData.has('sex') 패턴(옛 화면 호환) — 새 선택 칸을 더할 때 따를 것
- lib/form-values.ts:53-73 withInput · kept · keptAll + profile-form.tsx:331-335 pick() — 오류로 돌아와도 적던 값 복원
- lib/action-offline.ts guardFormAction(폼 action) · orOffline(직접 부르기, goal-sheet.tsx:270-290) + components/toast.tsx toast('저장했어요') — 저장 단추 필수 포장
- app/(app)/nutrition/goal-sheet.tsx:242-247 computeTargets(draft, body, 0) 미리보기 · :226-232 planOnSave 미리보기 · :559-713 '이렇게 먹어요' Stat 카드 — 인아웃 15(기초대사량 · 활동대사량 · 목표 칼로리 ✎) · 17(탄단지 g · kcal · %) 화면의 계산 그대로
- lib/nutrition/weight-goal.ts:428-434 etaWeeks + lib/nutrition/age.ts:226-232 paceChoices + goal-sheet.tsx:800 PERIOD_WEEKS [4,8,12,16,24] · pickPeriod — 인아웃 10 '23주면 달성' 슬라이더 계산
- app/(app)/nutrition/goal-sheet.tsx:940-981 ChoiceChips(값을 창이 쥐는 칩, multiple이면 ✓ 아이콘) · components/choice-inputs.tsx:27-29 cardBase(휴대폰 한 줄 한 칸 둥근 카드 + 오른쪽 체크 = 인아웃 선택 카드에 가장 가까움) · RadioGroup/CheckboxGroup(폼이 쥠)
- components/segmented.tsx Segmented(role=tablist · 미끄러지는 표시) — 목표 · 활동량 · 단백질 고르기
- components/modal.tsx:77 Modal(휴대폰 data-sheet 아래 시트 :270, origin 날아오기) · :43 useModalState — 인아웃의 '시트'(격려 · 설명)에 그대로
- app/actions/nutrition.ts:795-936 saveNutritionProfile(ProfileInput 객체) · :628-676 saveDietPrefs(객체) — FormData가 아니라 객체를 받아 온보딩 마법사에서 바로 부를 수 있음
- app/login/auth-form.tsx:406-449 STEPS(key · title · desc · fields) · :457-461 stepOfField(서버 field → 단계 되돌리기) · :476 checkStep(서버와 같은 기준) · :1045-1046 animate-step-next/back · :1071-1072 진행 막대 — 한 폼 여러 단계 마법사 뼈대(인아웃식으로 늘릴 바탕)
- lib/units.ts:13-15 LENGTH_KEY/WEIGHT_KEY/SPEED_KEY · :54-70 toLength/fromLength/toWeight/fromWeight · components/unit-toggle.tsx:31-61 UnitToggle(Segmented)
- app/(app)/layout.tsx:129-153 profile · settings 객체 + lib/dal.ts:14-45 select — 새 User 칸 연결 자리
- app/actions/profile.ts:152 revalidatePath('/', 'layout') — 헤더 · 영양 목표까지 바로 반영하는 길

**빈 곳(인아웃과 견줘)**
- 몸 사실(내 정보 창, User)과 영양 설정(영양 목표 창, NutritionProfile)이 두 창으로 갈려 있다 — goal-sheet.tsx:722-723이 '성별·키·몸무게·생년월일은 내 정보에서', nutrition-view.tsx:1484-1489가 '내 정보에 넣으면'으로 서로 보낸다. 인아웃은 한 흐름에서 다 묻고 '나의 목표 카드' 한 장으로 보여 준다 → 온보딩 답 전체를 한 자리(영양 목표 창에 '나' 칸을 더하거나 내 정보 창에 영양 묶음을 붙이기)에서 다시 볼 수 있어야 한다
- 가입이 영양 관련 답을 하나도 안 받는다(auth-form.tsx:406-449: 몸무게 · 목표 · 활동량 · 목표 체중 없음). 그래서 첫날 영양은 짐작 몸(targets.ts:90 FALLBACK 75kg · 178cm · 20세)과 기본 '유지 · 보통'(targets.ts:64-74 DEFAULT_PROFILE, nutrition-view.tsx:436-454 띠)으로 돈다
- 활동량이 3단계(meta.ts:63-67 low/mid/high, factor 1.3/1.5/1.7, 뜻은 '운동을 뺀 평소 움직임 · 팀 훈련')인데 인아웃은 5단계(매우 적음~매우 많음, 제목 + 설명 두 줄). 키를 더하면 isActivityKey · toProfile(load.ts:172) fallback이 안전하지만, 앱이 운동 · 투구를 OUT으로 따로 더하는 설계(meta.ts:56-62 '운동 많이 함을 고르면 두 번 센다')와 설명 글을 맞춰야 한다
- 목표가 3개(meta.ts:44-48 gain/maintain/lose)인데 인아웃은 5개(감량 · 증량 · 유지 · 근육량 증가 · 체지방률 감소). GoalKey를 늘리면 age.ts:57-119 AGE_RULES의 goalDelta · goalHint · paces(Record<GoalKey,…>) 셋 다 채워야 컴파일된다. 어린이 감량 금지(age.ts:65 lose:null) 규칙은 지킬 것
- 목표 이유 · 경험(처음/몇 번/꾸준히) · 코치 말투 · 운동 종류(여러 개) · 물 — DB 칸 없음(User 23-89 · NutritionProfile 1189-1230 · DailyCheckin 343-398 어디에도). 물은 9월에 일부러 뺐다(geum-yunho.md 영양 로드맵). 넣으려면 새 칸은 @default 또는 ?(AGENTS.md 2)
- '식단 스타일'의 뜻이 다르다 — 지금 DIET_STYLES(diet-prefs.ts:32-36)는 한식/골고루/간편식(어떤 끼니 틀을 고르나)이고 인아웃 16은 일반/운동/키토/비건(탄단지 비율). 기존 키는 meal-plan.ts · meal-templates.ts가 꼬리표로 쓰니 뜻을 바꾸지 말고 비율 쪽은 새 칸으로
- 탄단지 비율을 고를 칸이 없다 — targets.ts:28-34가 단백질(g/kg) → 지방 25%(바닥 0.8g/kg) → 탄수화물 나머지로 고정. 인아웃 17처럼 탄 · 단 · 지 g 을 직접 고치려면 kcalTarget · proteinTargetG(있음) 외에 지방 · 탄수 직접 칸(또는 비율 프리셋)과 computeTargets의 차례 수정이 필요
- 웨이트 경력은 가입에서 받지만(auth-form.tsx:439-444) 내 정보에 없고 설정 › 트레이닝에만 있다(settings-panel.tsx:142-153) — '가입 때 답한 것은 내 정보에서'라는 가입 안내(auth-form.tsx:430 '모두 가입한 뒤 내 정보에서 바꿀 수 있어요')와 어긋남
- 훈련 목표(trainingGoal)는 프로필 · 설정 어디에도 없고 일정 만들기 때마다 고른다(training-forms.tsx:42-45 의도적 설계). 인아웃식 온보딩에서 '훈련 목표'를 묻는다면 저장처는 saveDefaults 길(training-setup.ts:364-368)뿐
- 내 정보 창은 질문마다 '왜'가 없고 묶음 꼬리글(profile-form.tsx:351 · 379 · 411 · 431 · 465)로만 설명한다. 인아웃처럼 칸마다 부제(생년월일 → 기초대사량)와 '지금 계산에 어떻게 쓰이는지'(예: 몸무게 72kg → 단백질 130g)를 줄 밑에 보이려면 ListGroup에 줄별 hint 자리가 없다(ListRow는 label · children만 :38-45)
- 몸무게의 출처가 셋(User.weightKg · DailyNutrition.weightKg · DailyCheckin.bodyWeightKg, load.ts:354-375 우선순위)이라 온보딩에서 받은 '시작 체중'을 User.weightKg에만 넣으면 체중 그래프 · 흐름 판정에는 안 잡힌다
- 키가 가입에서 선택이고(validateProfile requireBirthDate만 필수, auth.ts:99-104) 몸무게 · 목표 체중은 가입에서 안 묻는다. 인아웃 7 · 8 화면처럼 받으려면 가입 폼 단계 · trySignup · prisma.user.create(auth.ts:160-171)에 더하고, 목표 체중은 NutritionProfile을 가입 직후 만들어야 한다(지금은 영양 목표를 저장해야 줄이 생김 — load.ts:435 hasProfile = profileRow !== null)
- 저장 뒤 '나의 목표 카드'(인아웃 23) · 약속 · 격려 시트에 해당하는 것이 없다. 내 정보 창 AvatarPicker 밑(profile-panel.tsx:57-59)이 자리로 자연스럽다

**위험 · 지킬 규칙**
- DB 규칙(AGENTS.md): prisma migrate dev · db push 금지, 구조 변경은 schema 수정 → migrate diff → migrations 폴더 → migrate deploy + generate. 새 칸은 @default 또는 ? 로(상대방 코드가 줄을 넣을 때 안 깨지게). 백업(npm run backup) 먼저, 김민에게 미리 말하고 HANDOFF.md 에 적는다. User 표는 김민 코드(app-shell · layout · 트레이닝)도 읽는 공유 표
- app/actions/profile.ts:143-147 — updateProfile 에서 trainingLevel · trainingGoal · ownedEquipment 를 쓰면 프로필 저장마다 그 값이 지워진다. 같은 폼에 넣지 말거나 '안 보냈으면 그대로' 패턴(:111-130)으로만
- 빈 값의 뜻이 칸마다 다르다 — 몸무게 · 윙스팬 · 목표 구속은 빈칸 = 지움(profile.ts:78-103), 성별 · 하루 운동 시간은 빈값 = 그대로(:111-130). 새 칸은 어느 쪽인지 정하고 주석으로 남길 것. 옛 화면 호환은 formData.has 패턴(auth.ts:120-127)
- validateBaseline(lib/baseline.ts:236-286)은 투구 3 + 웨이트 + 던지는 손을 전부 요구하고 updateProfile 은 하나라도 오면 전부 검사한다(profile.ts:64-76). 가입 단계를 재배치할 때 fields 를 빼면 서버에서 막힌다 — 소속만 선택
- 생년월일은 내 정보에서 필수(requireBirthDate true, profile.ts:48-53) · 만 5~100세. 소속은 서버가 levelAgeProblem 으로 다시 검사(:69-74) — 화면이 막아도 서버가 또 본다는 규칙
- revalidatePath('/', 'layout')(profile.ts:152 · nutrition.ts:928)을 빼면 헤더 닉네임 · 내 정보 창의 값 · 영양 목표가 옛것으로 남는다. 내 정보 창은 늘 붙어 있는 Modal(app-shell.tsx:1350)이라 avatar-picker.tsx:229-233 처럼 서버 값을 주인으로 삼는 패턴을 지킬 것
- 영양 목표 창 저장은 두 액션 차례(saveNutritionProfile → saveDietPrefs, goal-sheet.tsx:270-305)라 첫째 성공 · 둘째 실패면 반만 저장된다. 온보딩에서 한 번에 저장하려면 액션 하나로 묶거나 순서를 같게
- saveNutritionProfile 은 서버가 오늘 나이 · 최근 체중으로 속도 · 목표 체중을 다시 재 거절하거나 기본으로 당긴다(nutrition.ts:841-887: paceChoices · checkTargetWeight). planOnSave(:898-919)는 목표 · 활동량 · 속도 · 직접 kcal 이 바뀌면 kcalAdjust 0 · planSince 오늘로 되돌린다 — 온보딩 저장은 늘 '계획 새로 시작'
- saveDietPrefs 는 오늘 식단 계획에서 못 먹는 것을 즉시 뺀다(nutrition.ts:645-675) — 뜻을 모르면 '왜 식단이 줄었지'가 된다. DIET_STYLES · AVOIDS 키는 meal-plan.ts · meal-templates.ts 가 꼬리표로 쓰고, 그 파일은 클라우드 가지(cloud/meal-plan-accuracy-3)가 고치는 중이라 뜻을 바꾸지 말 것(HANDOFF · geum-yunho.md)
- GoalKey · ActivityKey 는 String 칸이지만 age.ts:57-119 AGE_RULES 가 Record<GoalKey,…> 라 목표 키를 더하면 셋(child · teen · adult) 다 채워야 한다. 어린이 감량 금지(lose: null) · 성장기 −200 한도는 설계 규칙
- 성별이 빈 옛 계정이 있다(schema.prisma:34-36, isSex 로 걸러 가운데 값으로 셈). 새 칸도 '없을 수 있다'로 읽어야 한다(toProfile load.ts:153-180 의 ?? 패턴)
- 몸무게 우선순위(load.ts:354-375)와 체크인 bodyWeightKg(checkin-form.tsx:418) · setWeight(nutrition.ts:286-308) 세 길이 있다 — 온보딩 체중을 어디에 쓸지 정하지 않으면 두 화면의 목표 숫자가 달라진다('두 화면의 목표가 같아야' load.ts:369-371 주석)
- 가입 폼은 한 <form> 안 여러 단계 · noValidate(auth-form.tsx:470-475), 서버 field 로 단계 되돌리기(stepOfField :457-461) — 새 단계를 넣으면 STEPS.fields 와 서버 AuthState.field 이름을 맞춰야 오류가 제자리로 간다
- 화면 규칙(docs/claude/geum-yunho.md): 해요체 · 줄표 없음 · 글자 11px 아래 금지 · 임의 px 글자 금지 · 입력칸은 손가락 화면에서 16px(사파리 확대) · 칩 40px · 단추 48px · 저장은 SafeForm/guardFormAction/orOffline 으로 감싸기 · 카드 안쪽 여백은 --block-pad · 휴대폰 창은 아래 시트(Modal) · 새 바닥 단추는 bottom: var(--kb)
- components/app-shell.tsx · app/(app)/layout.tsx · mobile/ 은 김민이 크게 손댄 영역 — 내 정보 · 설정 창을 여는 자리나 profile 객체를 고치면 HANDOFF.md 에 적는다. (app) 레이아웃의 첫 스크립트 · 'ready' 알림(lib/native-app.ts)은 건드리지 말 것
- 소속(competitionLevel)은 계산에 안 쓰는 값(lib/baseline.ts:74-83) — 온보딩에서 '질문마다 이유'를 요구하면 이 칸은 '또래 비교(나중)'가 이유라 빼거나 뒤로 미룰 후보. 하루 운동 시간은 운동 개수(training/page.tsx:139)와 부하 seed 둘 다 바꾸니 빼면 안 됨

### 지도 6

## 디자인 체계 지도 — 인아웃식 온보딩을 불펜로그 규격으로 만들 때 쓰는 것

### 1. 토큰 · 변형(Tailwind v4, 설정 파일 없음 — 전부 `app/globals.css`)
- 변형 셋: `desk`(PC 틀, 15~19: `(min-width:64rem)` 또는 `36rem+hover+pointer:fine` — JS 쪽 짝은 `lib/nav.ts:223 DESK_MEDIA`), `short`(세로 ≤700px, 27~31 — 가입 카드가 한 화면에 들어오게 여백 줄이는 용도), `desk-low`(PC 이면서 ≤900px, 41~46).
- 색 토큰 `@theme`(48~146): `--color-page #f2f2f7`(56) · `surface #fff` · `surface-2 #f2f2f7` · `raised`(고르개 흰 칸) · `line #e5e5ea` · `line-strong` · **강조는 `sky #0a84d6` 하나**(71, 흰 글자 대비 4:1) · `sky-strong #0369a1`(72, 글자용) · `sky-soft` · `sky-tint #e8f3fc`(75, 옅은 파란 면) · `brand #0297e4`(77, 로고만) · `ink #1d1d1f`(80) · `muted #6e6e73`(81) · `warn/ok/danger`(87~99) · `shade`(107, 늘 어두운 영상 바탕). 실밥 무늬 `--seam`(140) · 땀줄 `--stitch`(141), 다크 · 네이비는 흰빛으로 바뀜(270~271). 글꼴 `--font-sans` Pretendard, `--font-display` Bebas(146 — 로고 · 소개 · 404 · 구속 측정만).
- 휴대폰 기본 `:root`(180~216): `--gap-page 1.5rem` · `--gap-block 1rem` · `--block-pad 1.25rem`(182, 카드 안쪽 20px) · `--text-sm` 15px(190) · `--text-base` 17px · 모서리 `radius-2xl` 20px(205) · `radius-3xl` 28px(206, 시트 · 알약 고르개) · 하단 탭 `--tab-bar-gap`(215) · `--tab-bar-top`(216).
- PC 덮어쓰기(219~253): `--spacing` 3.2px(221 → h-12 가 38px, 단추 40→32px) · 16px 넘는 글자 낮춤 · `--page-top` 100px(233) · 모서리 원래값. 오른쪽 위 · 로고는 `.ui-chrome` 으로 원복.
- 테마: `[data-theme=dark|navy]`(262~330) 토큰만 갈아끼움, `.theme-dark`(345) = 어느 테마에서든 그 칸만 어둡게(+`bg-black`). 테마 바뀌는 0.26초 전환(430~446).
- 글자 유틸: `.text-display`(591, Bebas) · `.text-numeric`(602, SF Rounded 700 · tabular — 큰 숫자는 이것) · `.text-heading`(620, 800 · -0.03em · keep-all).
- 누름: tap-highlight 끔(503~509), `touch-action: manipulation`(518~522), `[data-pressed]` 0.55 · `big` 0.8(544~549, press-feedback 가 단다), 앱 안 글자 선택 끔(540~546, `.selectable` 예외).
- 슬라이더 `.range`(658~733): `--range-pct` 로 채움 색 sky, 손가락 화면 손잡이 28px(696~706). 쓰는 곳 `app/(app)/pitch-log/entry-form.tsx:491~494`, `training-note.tsx:116~118`.
- 화면 전환: `<html data-nav>` push/pop/fade/none(872~1004) — push 는 `nav-in-right`(913) 오른쪽에서 밀려옴, `main-transition.tsx:203 endNavMotion` 이 끝나는 순간 표시를 걷음, `nav-motion.tsx:136` 이 링크 누를 때 방향을 정함(본문 안 push · 밖 fade · `data-nav` 가 있으면 그것).
- 간격 · 틀 유틸: `stack-page`(1065) · `gap-block`(1072) · `stack-block`(1077) · `page-title`(1088, 휴대폰 34px/PC 24px) · `empty-well`(1101) · `seam-corner`(1113) · `seam-hero`(1119, 로그인 `app/login/page.tsx:34` 가 씀) · `stitch-rule`(1127) · `no-scrollbar`(1031).
- 움직임 유틸: `animate-fade-in`(1139, 160ms 옅어지기만 — 10-04 'AI 티 줄이기' 뒤 scale 없음) · `animate-sheet-up`(1165, 260ms) · `animate-panel-up`(1185) · `animate-row-in`(1191, `--row` 로 28ms 씩 지연, 10줄까지) · **`animate-step-next` / `animate-step-back`(1216~1232, 340ms · translateX 28px · `cubic-bezier(.22,1,.36,1)` — 가입 단계 넘김)** · `square-spin`(1249) · `page-fade`(1381). 모두 쓰는 쪽에서 `motion-safe:` 를 붙인다.
- 창 `<dialog>`: 기본(1406, 열 160ms/닫 120ms, `display/overlay allow-discrete`) · `dialog:not([open]){display:none}`(1428) · `[data-pop]`(1513, PC 에서 누른 자리에서 날아옴) · `[data-drawer]`(1545, PC 오른쪽 판 / 휴대폰 시트 1617~1636) · backdrop(2104~2153) · **휴대폰 `[data-sheet]`(2163~2186, `sheet-in` 380ms 아래에서)** · 체크인 `[data-gate]`(2194~2243, 420ms 천천히) · 시트 셋 공통 양옆 safe-area(2254~2260) · **자판 뜨면 `html[data-keyboard] dialog[data-sheet]{margin-bottom:var(--kb); max-height:var(--vvh)…}`(2265~2268)** · 창 열린 동안 html 잠금(2762).
- 축하 · 차오름: `.done-ring`(2359, 링 700ms) · `.done-check`(520ms 뒤 `finish-pop`=armcare-pop 2331) · `.rise-in`(2365, `--rise-delay`) · `.ring-grow`(2387) · `.count-up`(2518~2535, `@property --n` 정수 + counter, JS 없음 — 홈 영양 카드) · 시작 연출 `.app-splash`(2397~2515, fixed inset-0 z-100 bg-page, `data-splash` 동안 view-transition-name 모두 끔 2290s).
- 휴대폰 규칙: 입력칸 16px(2556~2580, `text-lg` 이상 클래스는 예외) · 아이폰 앱 `body:not(:has([data-safe-area]))` 에 시계 · 홈 막대 여백 + 시계 자리 바탕색(2650~2663) · `.rounded-2xl.border-line.bg-surface` 테두리 투명(2712, PC 만 선) · 경고 상자도 같음(2715~2727) · 10px→11px(2743) · `scroll-padding-top`(2755) · 자판 뜨면 `[data-mobile-tabs]` 숨김(2769~2785).

### 2. 공용 부품(`components/`)
- `ui.tsx`: `PageHeading`(49: kicker · titleArt · inlineAction, PC 밑줄 `stitch-rule`, `NavTitle` 로 막대 접힘) · `Card`(122, `p-(--block-pad)`) · `Button`(153 — base 150: `rounded-full desk:rounded-xl px-5 py-3 text-sm disabled:opacity-50`, variants 138: primary `bg-sky text-white` · secondary `bg-ink/6`(휴대폰)/테두리(PC) · ghost · danger) · `ButtonLink`(163) · `Field/Input/Textarea`(177~206, 휴대폰 `bg-ink/5` 테두리 없음 · 초점 `border-sky`) · `Badge`(208) · `EmptyState`(231, seam-corner) · `FormError`(263 → `ErrorLine`).
- `segmented.tsx` `Segmented`(93): role radiogroup/tablist/navigation, layout grid/flow, size sm/md, 휴대폰 `rounded-3xl bg-ink/8 p-1`(174) · 칸 `min-h-10`(208) · 흰 표시가 미끄러짐(188, `use-sliding-thumb`). 칸은 컨테이너 바로 안에 있어야(24~26).
- `choice-inputs.tsx`: `chipBase`(23, 알약 `bg-ink/6` — `text-[13px]` 씀) · `cardBase`(30, 한 줄 둥근 칸) · `chipChecked`(34, `peer-checked:border-sky bg-sky/10 text-sky font-semibold`) · `CheckboxGroup`(37) · `RadioGroup`(76 — `desc` 있으면 **제목+설명+오른쪽 `Check`(154~158) 카드**, `compact`). 네이티브 input 이라 폼 action 에 그대로 실림.
- `modal.tsx`: `Modal`(77) size default/wide/page · `origin`(PC 날아옴) · 휴대폰 `data-sheet` 손잡이(358) · 끌어내려 닫기(184~214) · 닫기 44px(371) · 본문 `no-scrollbar overscroll-contain pb-[calc(1.25rem+safe-area)]`(404) · 창 안 창 닫힘 분리(278). `useModalState`(43) · `modalOrigin`(23).
- `toast.tsx` `toast(text, tone)`(25) + `Toaster`(36, popover 맨 위 칸 · 시계 밑 · `bg-ink/92` 알약 87 · 떨림).
- `press-feedback.tsx` `PressFeedback`(129, `PRESSABLE` 105 = a · button · summary · role=button/tab · `label:has(radio|checkbox)`, 제외 `data-press-none`). `haptic-feedback.tsx` `HapticFeedback`(221, `PICKERS` 208 = role radio/tab/switch/option · `aria-pressed`, 제외 `data-haptic="none"`). `lib/haptics.ts` `haptic(kind)`(78: selection · light · medium · success · warning · error) · `buzz`(25).
- `stage-overlay.tsx`(15) — 3D 전용(앞 · 옆 · 뒤 단추 · 불러오는 중 `animate-pulse` 46~53). 온보딩엔 안 씀.
- `app-splash.tsx` `AppSplash`(119) — 전체 덮개 틀 + `data-splash` 로 전환 이름 끄기 + `SPLASH_END_EVENT`(95). `logo.tsx` `BullpenMark`(235) · `Wordmark`(254) · `MARK_PATH`(229).
- `unit-toggle.tsx` `UnitToggle`(31, 설정용 세 줄) — `Row`(63) = `Segmented className="w-36" itemClassName="px-1 py-1.5"`. 단위 계산 `lib/units.ts`: `LENGTH_UNITS cm|in`(17) · `WEIGHT_UNITS kg|lb`(22) · `toLength/fromLength/toWeight/fromWeight`(53~70) · `round1`(88) · `apply*Unit`; 갈고리 `components/use-units.ts`(25~35). **저장은 늘 cm · kg**(1~11).
- `nav-motion.tsx` `NavMotion`(136) · `back-link.tsx` `BackLink`(190, `data-nav="pop"` · 휴대폰은 위 막대로 감) · `goBack`(165) · `main-transition.tsx` `MainTransition`(234, ViewTransition `app-main`).
- `settings-list.tsx` `ListGroup`(13) · `ListRow`(37) · `ROW_INPUT`(48, 오른쪽 정렬 테두리 없는 칸) · `RowUnit`(53) · `SelectRow`(65, 투명 select 로 아이폰 고르개). `switch.tsx` `Switch`(26, 51×31) · `SwitchRow`(59).
- `expand.tsx` `Expand`(18, grid-rows 0fr→1fr 300ms, inert) · `disclosure.tsx` `DisclosureButton` · `error-line.tsx` `ErrorLine`(119) · `confirm-delete.tsx` `ConfirmDialog`(26, 휴대폰 동작 시트 단추 `min-h-12 rounded-full` 59 · 71) · `level-choices.tsx` `LevelChoices`(24, 생년월일 → 고를 수 있는 소속이 바뀜 · `fit.grade` 글 98~105) · `mini-calendar.tsx` `MiniCalendar`(24, `pickYear`) · `viewport-vars.tsx` `ViewportVars`(16, `--kb` · `--vvh` · `data-keyboard`) · `fallback.tsx`(14~60).
- 구속 측정 쪽(금윤호 영역, `components/velocity/`): `kit.tsx` **`StepBar`(18, 칸 막대 h-1 sky/line)** · `SectionLabel`(39) · `Panel`(55) · `StatRow`(75) · `Note`(101) · `CHIP_BASE/CHIP_ON`(125~127, 40px) · **`BigButton`(130, `h-12 flex-1`)** · `Chips`(137). `setup-art.tsx` **`OptionCards`(105, 그림 칸 `bg-sky-tint/60` + 이름 + 설명 + '이럴 때', 고르면 `border-sky bg-sky/5 ring-2 ring-sky/30` 135)** · `SetupSummaryRow`(171, 아이콘 요약 줄). `setup-steps.tsx` **`StepShell`(45~80: StepBar → 제목 `text-heading text-2xl` → 부제 → 내용(굴러감) → 바닥 막대 `border-t bg-surface pb-[max(0.75rem,safe-area)]`)** · `PrimaryButton`(81, h-12 rounded-xl). `tutorial.tsx` `TutorialDialog`(123: `fixed inset-0 bg-page` 전체 덮개, 카드가 `animate-step-next/back` 로 넘어감 185~190, 점 표시 `w-5 bg-sky / w-1.5` 214~235, BigButton 줄 248~262). `tips-popup.tsx` `TipsPopup`(46, 네 변 12px 큰 창 · `backdrop:bg-shade/75 backdrop-blur` 119). **`measure-progress.tsx` `MeasureProgress`(40: 돌개 + 큰 제목 + 세 단계 막대, `Fill`(26) 이 시간에 맞춰 95% 까지 차오름)**.
- 가입 `app/login/auth-form.tsx`: `AuthCard`(82~160: 위 `progress` 막대 `h-1 bg-sky transition-[width] 500ms` 114~122 · 제목 묶음 `key=titleKey` fade-in 135 · 휴대폰 `max-md:flex-1` 세로 틀 112 · PC `md:grid-cols-[1fr_1.2fr] rounded-[28px]` 125 · 단추 줄 아래 154) · `TextButton`(170, `text-sky-strong`) · `SubmitButton`(186) · `STEPS`(406~450, title/desc/fields) · `checkStep`(455~573) · `Choices`(583~640, `rounded-xl bg-surface-2 peer-checked:border-sky`) · `BirthDateField`(717~820, MiniCalendar 포털) · `SignupWizard`(860: `dir` 874 · `panel(i)` = `hidden` + `animate-step-next/back` 1046~1052 · `goTo` 975 · 초점 이동 955~966 · 문제 줄 1385~1397 · sr-only 단계 알림 1105 · 키체인용 sr-only username 1147~1160) · `AuthForm`(1420, `key=mode` fade-in). 페이지 `app/login/page.tsx:34`(`seam-hero min-h dvh`).
- 앱 틀 `components/app-shell.tsx`: `MobileTopBar`(2217, `h-14 sticky top-[safe-area]` 2293, 왼쪽 뒤로 · 가운데 제목 · 오른쪽 종/설정/내 정보) · `MobileTabs`(2434, 알약 `bg-surface/88 backdrop-blur-2xl` 2456, 칸 `h-[52px]`). (app) 레이아웃 `main`: `max-w-5xl … desk:pt-(--page-top)`(`app/(app)/layout.tsx:223~225`).
- 홈 · 영양: `today/nutrition-card.tsx` `CountUp`(146) · `today-rings.tsx` `Ring`(182, `ring-grow`) · `(session)/workout/done/done-client.tsx`(34, 링 → 체크 → 숫자 dl 126 → 줄 차례 rise-in, `buzz` 66) · `nutrition/goal-sheet.tsx`(Modal + `Segmented` 탭 415~435 · 펴지는 칸 `grid-rows-[0fr→1fr]` 600~660 · '남았어요 · 약 N주' 372 · '언제까지' 칩 526 · 미리보기 `Stat` 표 670~690 · `ChoiceChips` 940 알약 `min-h-10`) · `nutrition/charts.tsx` `WeightTrend`(105, 실제 기록 8주 · 목표 점선 · `trend-draw` 373) · `plan-parts.tsx` `PlanCard`(61) · `profile/profile-form.tsx` 몸 치수 줄(120~165: `ListRow` + `ROW_INPUT` + `RowUnit` + hidden cm/kg, 적는 중 글자를 `draft` 로 붙들어 단위 바꿔도 안 튐).

### 3. 인아웃 화면 → 불펜로그 부품 짝
- 한 화면 한 질문 셸(← 뒤로 · 진행 막대 · 제목 2줄 · 회색 부제 · 바닥 단추): `StepShell`(setup-steps 45) 구조 + `AuthCard` 의 width 진행 막대(114) 또는 `StepBar`(kit 18) + 제목 `text-heading`(휴대폰 `text-[1.75rem]`/`page-title`, PC 24px) + 부제 `text-sm text-muted break-keep` + 바닥 `BigButton`(h-12 w-full · 휴대폰 `rounded-full`) · 단계 넘김 `motion-safe:animate-step-next/back`(auth-form 1046 방식: 모두 그려 두고 `hidden`).
- 큰 카드 선택지(그림 + 제목 + 설명, 고르면 진해짐 + 체크): `RadioGroup` 의 desc 카드(choice-inputs 143~158) 또는 `OptionCards`(setup-art 105) — 그림은 lucide 아이콘 · setup-art 식 선 그림(200×150 currentColor, tutorial.tsx 312 `ART`). 여럿 고르기 ✓ = `ChoiceChips multiple`(goal-sheet 940) 또는 `CheckboxGroup`.
- 아래 시트(격려 · 설명): `Modal`(data-sheet) 그대로 — 휴대폰 아래 시트 · PC 가운데 창이 저절로.
- 단위 토글 + 숫자: `Segmented w-36`(unit-toggle 92~101) + `<input inputMode="decimal" className="text-numeric text-4xl …">` + profile-form 120~165 의 draft 패턴 + `lib/units` 변환.
- 그 자리에서 계산 결과(−13kg · N주): goal-sheet 372 · 410 글 패턴을 `Expand`(expand 18)나 `grid-rows` 펴짐(goal-sheet 600) 안에.
- 계획 만드는 중: `MeasureProgress`(40) 의 `Fill` + `animate-row-in`(--row) 로 답 한 줄씩 + `app-splash` 식 전체 덮개(`fixed inset-0 bg-page`, `data-splash` 처럼 전환 이름 끄기).
- 추천 계획 완성 · 요약 카드: done-client 의 링 → 체크 → `rise-in` 차례(84~138) + `StatRow`/goal-sheet `Stat` 표 + `SetupSummaryRow` 식 아이콘 줄 + `BullpenMark` 옅게.
- 저장 알림: `toast('저장했어요')`, 떨림은 `haptic('success')`.

**그대로 쓸 수 있는 것**
- 진행 막대 둘: `components/velocity/kit.tsx:18 StepBar`(칸 막대 h-1, aria progressbar) · `app/login/auth-form.tsx:114~122`(한 줄 막대 `h-1 bg-sky transition-[width] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]`) — 인아웃의 '조금씩 차는' 막대는 후자
- 단계 넘김 애니메이션: `app/globals.css:1216~1232 animate-step-next/back`(340ms translateX 28px) + 쓰는 법 `auth-form.tsx:1046~1052`(모두 그려 두고 `hidden`, `dir` 상태 874 · `goTo` 975 · 초점 이동 955~966 · sr-only aria-live 1105)
- 한 화면 한 질문 셸의 뼈대: `components/velocity/setup-steps.tsx:45~80 StepShell`(StepBar → 제목 `text-heading text-2xl` → 부제 `text-sm text-muted` → 굴러가는 내용 → 바닥 막대 `border-t bg-surface px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3`) · 화면 높이 틀 `app/(session)/layout.tsx:58`(`data-safe-area h-[var(--vvh,100dvh)] flex-col`)
- PC 가입 카드 틀: `auth-form.tsx:82~160 AuthCard`(휴대폰 `max-md:flex-1` 세로 · 단추 아래 붙음, PC `md:rounded-[28px] md:border md:grid-cols-[1fr_1.2fr]`) · 로그인 페이지 바탕 `app/login/page.tsx:34`(`seam-hero min-h-[calc(100dvh-safe-area)]`)
- 바닥 큰 단추: `components/velocity/kit.tsx:130 BigButton`(`h-12 flex-1`, 앱 Button 상속 → 휴대폰 `rounded-full` · `disabled:opacity-50` = 답하기 전 회색) · `components/ui.tsx:138~151 Button` 변형(primary `bg-sky text-white`, secondary `bg-ink/6`) · 글자 단추 `auth-form.tsx:170 TextButton`(`text-sky-strong`)
- 큰 카드 선택지: `components/choice-inputs.tsx:76 RadioGroup`(desc 있으면 제목+설명 한 줄 카드 + 오른쪽 `Check` 154~158, `chipChecked` 34 `peer-checked:border-sky bg-sky/10 text-sky font-semibold`, 네이티브 radio 라 폼 action 에 실림) · 그림 있는 카드 `components/velocity/setup-art.tsx:105 OptionCards`(그림 칸 `bg-sky-tint/60`, 고르면 `border-sky bg-sky/5 ring-2 ring-sky/30`) · 가입용 칩 `auth-form.tsx:583 Choices`(`list` 두 줄 카드)
- 여럿 고르기 ✓ 칩: `app/(app)/nutrition/goal-sheet.tsx:940 ChoiceChips`(`multiple`, 알약 `min-h-10 bg-ink/6`, 고르면 `Check` fade-in) · `components/choice-inputs.tsx:37 CheckboxGroup` · 하나 고르기 40px 칩 `kit.tsx:125 CHIP_BASE` · `137 Chips`
- 고르개(cm|ft · kg|lb · 탭): `components/segmented.tsx:93 Segmented`(휴대폰 `rounded-3xl bg-ink/8 p-1` · 칸 `min-h-10` · 미끄러지는 흰 표시) — 단위 두 칸은 `components/unit-toggle.tsx:92~101`(`className="w-36" itemClassName="px-1 py-1.5"`) 그대로
- 단위 변환 · 저장은 cm/kg: `lib/units.ts:17~25 LENGTH_UNITS/WEIGHT_UNITS` · `53~70 toLength/fromLength/toWeight/fromWeight` · `88 round1` · `apply*Unit`; 갈고리 `components/use-units.ts:25~35`; 적는 중 글자 붙드는 패턴 `app/(app)/profile/profile-form.tsx:120~165`(`draft {text, unit}` + hidden 칸에 cm/kg)
- 아이폰 설정 줄(목표 kcal · 탄단지 g 직접 고치기): `components/settings-list.tsx:13 ListGroup` · `37 ListRow` · `48 ROW_INPUT`(오른쪽 정렬 테두리 없음) · `53 RowUnit` · `65 SelectRow`(연·월·일 고르기 대안) · 스위치 `components/switch.tsx:26 Switch` · `59 SwitchRow`
- 아래 시트 · 가운데 창: `components/modal.tsx:77 Modal`(휴대폰 `data-sheet` 손잡이 358 · 끌어내려 닫기 184~214 · 닫기 44px 371 · 본문 `no-scrollbar overscroll-contain` + safe-area 404, PC `origin` 으로 누른 자리에서 날아옴) · `43 useModalState` · `23 modalOrigin`; CSS `globals.css:2163~2186`(sheet-in 380ms) · 자판 대응 `2265~2268`
- 그 자리에서 펴지는 계산 결과: `components/expand.tsx:18 Expand`(grid-rows 0fr→1fr 300ms, inert) · goal-sheet 의 직접 펴짐 `goal-sheet.tsx:600~612`(`grid transition-[grid-template-rows] duration-200`) · 글 패턴 `goal-sheet.tsx:372`('N kg 남았어요 · 계획대로면 약 N주') · `410~411`('…로도 약 N주 걸려요') · `etaWeeks` · `rateText`
- 숫자 차오름 · 축하: `app/globals.css:2518~2535 count-up`(`@property --n`, 쓰는 법 `app/(app)/today/nutrition-card.tsx:146 CountUp`) · 링 `today-rings.tsx:182 Ring`(ring-grow) · 운동 끝 차례 연출 `app/(session)/workout/done/done-client.tsx:84~138`(done-ring → finish-pop done-check → `rise-in [--rise-delay:600ms]` 숫자 dl 126) · 떨림 `buzz([15,120,15])` 66
- 진행 화면(계획 만드는 중) 재료: `components/velocity/measure-progress.tsx:26 Fill`(시간에 맞춰 95% 까지 `transition-[width]`) · `40 MeasureProgress`(돌개 `h-7 w-7 rounded-full border-[3px] border-t-sky-soft animate-spin` 62 + 세 단계 막대 69~96) · 답이 한 줄씩 쌓이는 것은 `globals.css:1191 animate-row-in`(`style={{'--row': i}}`) · 전체 덮개 틀 `globals.css:2397 .app-splash`(`fixed inset-0 z-100 bg-page`) + `components/app-splash.tsx:181~185`(HTML 자리에서 `data-splash` 달아 전환 이름 끄기)
- 요약 카드 · 숫자 줄: `components/velocity/kit.tsx:75 StatRow`(dl 가로 n 칸) · `setup-art.tsx:171 SetupSummaryRow`(아이콘 + 이름 네 칸) · goal-sheet `Stat` 표 `670~690`('이렇게 먹어요' 하루 칼로리 · 단백질 · 탄 · 지) · 카드 `components/ui.tsx:122 Card`(`p-(--block-pad)`) · 로고 `components/logo.tsx:235 BullpenMark` · `254 Wordmark`
- 체중 곡선 그래프: `app/(app)/nutrition/charts.tsx:105 WeightTrend`(실제 기록 8주 · 목표 점선 · 누르고 훑기, 선 그리기 `trend-draw` 373) · 부드러운 선 `lib/smooth-path.ts:9 smoothPath` · 크기 재기 `components/use-box-size.ts:10 useBoxSize`
- 슬라이더(속도 느리게 · 추천 · 빠르게): `app/globals.css:658~733 .range`(`--range-pct` 채움, 손가락 화면 손잡이 28px 696~706) · 쓰는 법 `app/(app)/pitch-log/entry-form.tsx:491~494`(`style={{'--range-pct': …%}} className="range"`)
- 생년월일: `components/mini-calendar.tsx:24 MiniCalendar`(`pickYear`, 연·월 곧장) + 포털로 띄우는 `auth-form.tsx:717~820 BirthDateField`(hidden 칸 `birthDate`, 범위 `lib/profile.ts:74~75 MIN_AGE/MAX_AGE`) · 답이 다음 질문을 바꾸는 선례 `components/level-choices.tsx:24 LevelChoices`(생년월일 → 소속 흐리게 막음 + 까닭 글 98~105)
- 성별 · 던지는 손 선택지 데이터: `lib/profile.ts:71 SEX_OPTIONS` · `lib/baseline.ts THROWING_HANDS` · `BASELINE_*_NAMES` · `lib/report/personalize.ts TRAINING_LEVELS`(auth-form 25~40 import)
- 가입 단계 검사 · 서버 되돌림 구조: `auth-form.tsx:406 STEPS`(fields 로 서버 오류 → 그 단계) · `455 checkStep`(`noValidate` 폼, 단계마다 서버와 같은 기준) · `905~912`(state 바뀌면 그 단계로) · `919~927`(`data-sync` 로 되돌린 체크 다시 칠함) · `guardFormAction(signup)` 869 · 이메일 미리 검사 `checkSignupEmail` 985
- 저장 알림 · 떨림 · 누름: `components/toast.tsx:25 toast` · `lib/haptics.ts:78 haptic('success'|'selection'|'medium')` · 누름 표시는 저절로(`components/press-feedback.tsx:105 PRESSABLE` — button · `label:has(input[type=radio|checkbox])`) · 고르기 떨림도 저절로(`haptic-feedback.tsx:208 PICKERS` — `role=radio|tab|switch` · `aria-pressed`)
- 설명 · 격려 시트의 작은 그림 틀: `components/velocity/tutorial.tsx:312 ART`(`h-full max-h-40 w-auto`, 200×150 viewBox · `stroke=currentColor` 선 그림을 `bg-sky-tint/60 text-sky` 칸에) · 큰 창 `tips-popup.tsx:46 TipsPopup`(네 변 12px · `backdrop:bg-shade/75 backdrop-blur-sm` 119)
- 뒤로 · 위 막대 · 전환 방향: `components/back-link.tsx:190 BackLink`(`data-nav="pop"`, 휴대폰은 위 막대로) · `165 goBack` · `components/nav-motion.tsx:136`(링크에 `data-nav="fade|none"` 달아 방향 지정) · 온보딩 안 단계 넘김은 주소를 안 바꾸면 전환과 무관
- 자판 · 안전 영역: `components/viewport-vars.tsx:16 ViewportVars`(뿌리에 이미 있음 — 바닥 단추 `bottom: var(--kb,0px)` · 틀 `height: var(--vvh,100dvh)`) · 앱 머리 막대 `box-content h-12 pt-[env(safe-area-inset-top)]`(geum-yunho 규칙) · `data-safe-area` 표시(`globals.css:2650`)
- 실밥 · 빈 상태: `globals.css:1113 seam-corner` · `1119 seam-hero` · `1127 stitch-rule`(PC 머리 밑줄, `PageHeading` 이 씀 ui.tsx:89) · `1101 empty-well` · `components/ui.tsx:231 EmptyState`
- 늘 어두운 화면(인아웃의 검은 바탕 화면이 꼭 필요하면): `globals.css:345 .theme-dark` + `bg-black`(토큰이 그 칸에서 다크로 바뀌어 안의 `text-ink` · `border-line` 이 저절로 맞음)

**빈 곳(인아웃과 견줘)**
- 온보딩 셸(한 화면 한 질문)이 공용으로 없다 — `StepShell`(velocity/setup-steps.tsx:45)은 구속 측정 폴더 · (session) 틀 전용이고 바닥 단추가 `rounded-xl`, `AuthCard`(auth-form 82)는 PC 두 칸 그리드 + 7단계 한 폼. 새로 `components/onboarding/`(가칭)에 [← 뒤로 44px · 진행 막대(auth-form 114 식 width 막대) · 제목 `text-heading`(휴대폰 `text-[1.75rem]`→ 규격상 `page-title` 또는 `text-2xl`) · 부제 `text-sm text-muted break-keep` · 내용(굴러감) · 바닥 `BigButton h-12 w-full rounded-full`(휴대폰)/`desk:rounded-xl` · `bottom: var(--kb,0px)` · safe-area] 셸을 뽑고 PC 분기(`desk:` 가운데 카드 `md:rounded-[28px] border` 또는 `Modal` 폭 `min(38rem,…)`)를 넣어야 한다. 단계 넘김은 auth-form 1046 방식(모두 그려 두고 hidden + animate-step-*)을 그대로
- 바닥 '검은 알약' 단추 — 불펜로그는 강조색이 sky 하나(globals 67~71 · geum-yunho '애플처럼')라 검은 알약 대신 `bg-sky` 알약(`BigButton`). 답하기 전 비활성은 `disabled`(`opacity-50`)로. 인아웃의 검은 바탕 화면들(사회적 증거 · 코치 · 계획 만드는 중)도 밝은 `bg-page` 로 — 꼭 어둡게 하려면 `.theme-dark + bg-black` 규칙
- 슬라이더(느리게 · 추천 · 빠르게 + 주 수 즉시 변경) — `.range`(globals 658)는 1~10 강도용 `input[type=range]` 만 있고 밑 눈금 라벨 · `aria-valuetext` · 눈금에 걸리는(snap) 동작이 없다. 새 부품 `PaceSlider`: `.range` + `--range-pct` + 밑 세 라벨(`text-xs text-muted`, 가운데 '추천' 강조) + 값 바뀌면 `haptic('selection')` + 카드 안 큰 숫자 `text-numeric`('N주면 달성'). 값 범위는 `lib/nutrition/age.ts` 속도(성인 0.25|0.35kg/주 · 성장기 한 가지, goal-sheet 799 `paces`)와 맞춰야 함 — 인아웃처럼 연속 슬라이더가 아니라 2~3 눈금이면 `Segmented` 가 더 맞을 수 있다
- 휠 피커(연 · 월 · 일 굴리기) — 없다. `snap-y` 스크롤은 저장소에 없고(`muscle-map-panel.tsx:332` 가로 snap 만) 아이폰식 휠을 만들려면 `scroll-snap-type: y mandatory` + 가운데 하이라이트 + `scrollend` 읽기 + 움직임 줄이기 대응을 새로 짜야 한다. 권고: 이미 쓰는 `MiniCalendar pickYear`(auth-form 717 BirthDateField) 그대로, 또는 `SelectRow` 셋(연 · 월 · 일 — 아이폰 기본 고르개가 곧 휠)
- 손글씨 서명 칸 — 없다(`video-canvas.tsx` 는 영상용). 만들면 `<canvas>` + pointer events + `touch-none` + `stroke = currentColor(ink)`(다크 대응) + ✕ 지우기 44px + 그리면 단추 활성 + '저장되지 않아요' 한 줄. 대안: `SwitchRow`/체크 한 줄 '약속해요' — 불펜로그 글 규칙(설명 없이 짧게)에는 이쪽이 맞을 수 있음
- '계획 만드는 중' 진행 화면 — 없다. `MeasureProgress`(velocity/measure-progress.tsx 40)는 카메라 위 흰 글자 · 검은 반투명이라 그대로 못 쓴다. 새로: 전체 덮개(`fixed inset-0 bg-page`, app-splash 식) + `Fill`(26) 막대 10→32→90→100% 단계 + 답이 한 줄씩 `animate-row-in`(`--row`) 로 쌓이는 카드 + 끝나면 `haptic('success')` + [추천 계획 확인하기] `BigButton`. 덮개 동안 `data-splash`/`data-gate-up` 처럼 `view-transition-name: none` 을 걸어야 스트리밍 전환 그림이 위로 번쩍이지 않는다(globals 2280~2296)
- 단위 토글 + 큰 숫자 입력 한 덩이(키 177 cm · 시작/목표 체중) — `UnitToggle`(설정 세 줄) 과 `profile-form` 의 ListRow 뿐. 새로: `Segmented w-36`(cm|in · kg|lb) + `<input inputMode="decimal" className="text-numeric text-4xl …">`(16px 규칙은 `text-4xl` 이라 안 걸림) + `draft` 패턴(profile-form 120~165). **`lib/units` 에는 'ft' 가 없다(cm|in)** — 인아웃의 ft 표기를 따르려면 ft′in″ 변환을 새로 더하거나 inch 로 둔다. 저장은 늘 cm/kg
- 큰 카드 선택지의 3D 캐릭터 그림 — 없다. 불펜로그 규격은 lucide 아이콘(`NAV_ICONS` · `EmptyState` 의 `icon`) 또는 setup-art 식 200×150 `currentColor` 선 그림 + `bg-sky-tint/60` 칸. 왼쪽 그림 + 제목 + 설명 + 오른쪽 체크 카드는 `RadioGroup`(choice-inputs 76)에 `icon` 칸을 더하거나 새 `OptionList` 부품
- 여러 개 고르기 + '건너뛰기' — `ChoiceChips multiple`(goal-sheet 940)은 창 안 private 부품이라 공용으로 옮겨야 함(`components/choice-chips.tsx`). '건너뛰기'는 `TextButton`(auth-form 170) 식 `text-sky-strong` 글자 단추를 바닥 단추 밑에
- 사회적 증거 화면(50만 명 · 4.9점 · 400만 다운로드) · 코치 캐릭터 고르기 캐러셀 — 불펜로그엔 숫자도 캐릭터도 없고 캐러셀 부품도 없다(`snap-x` 는 muscle-map-panel 332 한 곳). 만들지 않는다(허위 숫자) — 대신 `seam-hero` 한 장 + 앱이 무엇을 해 주는지 한 줄(해요체)
- 격려 시트의 막대 그래프(+17%) · 도넛(상위 33% · 66%) — 전용 그림 부품 없음. `charts.tsx WeekChart`(24) 구조나 `done-client` 링(84~109, `pathLength=100 strokeDasharray` + `done-ring`) 으로 도넛은 만들 수 있다. 근거 없는 통계 문구는 넣지 않는다(불펜로그 영양 규칙: 근거 없는 목표 구속 계산 안 넣음 — geum-yunho 9번)
- 체중 예상 곡선(88 → 75kg, N주) — `WeightTrend`(charts 105)는 실제 기록이 이틀 이상 있어야 그리고(124) 목표 점선만 있다. 예상 곡선은 새 SVG: `smoothPath`(lib/smooth-path.ts 9) + `trend-draw` 700ms(globals 1361) + 목표 점선 + `text-numeric` 끝 숫자
- 탄 · 단 · 지 g 을 직접 고치면 kcal · % 가 따라 바뀌는 편집 — goal-sheet 는 kcal(612~640) · 단백질 g(641~660) 만 직접 정하고 탄 · 지는 `computeTargets` 가 낸다(242). 세 g 칸 연동(합계 = 목표 kcal, 저장 중 표시) UI 와 그 저장 칸(`NutritionProfile` 에 carbs/fat 직접값 없음 — DB 갈래 확인)이 없다. UI 는 `ListGroup` + `ListRow` + `ROW_INPUT` 세 줄 + 밑 합계 줄 + 벗어나면 `ErrorLine`
- 식단 계획 네 가지(일반 · 운동 · 키토 · 비건) — `lib/nutrition/diet-prefs.ts` 의 `dietStyle` 은 한식 위주 · 골고루 · 간편식 위주(goal-sheet 식단 취향 칸). 선택지 뜻이 달라 그대로 못 옮긴다(계산 갈래와 합의 필요) — 화면은 `RadioGroup` desc 카드로 같다
- '나의 목표' 요약 카드 + 날짜 + 도장 — 조합 부품 없음. `Card` + `SetupSummaryRow` 식 아이콘 줄(setup-art 171 은 velocity 전용 데이터라 구조만 빌림) + `StatRow`(kit 75) + `dateKeyLabel`(lib/pitch-stats.ts) + 도장 대신 `BullpenMark` 옅게(`fill-brand opacity-20`). 운동 끝 화면(done-client 118~138)의 `rise-in` 차례를 그대로
- 알림 허용 화면 — 웹엔 끼니 알림이 없다(영양 로드맵 9번 '앱 나온 뒤', `lib/native-bridge.ts` 로컬 알림만). 이 단계는 빼거나 앱(`data-app=native`)에서만
- 글 규칙 때문에 인아웃 문구를 그대로 못 옮긴다 — 해요체 · 줄표(—) 없이 · 문장 속 굵게 없음 · 이모지(💪 🔥 ✨) 없음 · 설명 없이 할 일만(geum-yunho 3절 10-04~06 정리). 부제 '왜 묻는지' 한 줄은 좋음(auth-form STEPS 의 desc 가 이미 그렇다)
- 임의 px 글자 금지(geum-yunho 2절: `text-[13px]` 같은 것) — 기존 `choice-inputs.tsx:24 chipBase` 는 `text-[13px]`, `auth-form.tsx` 제목은 `text-[1.75rem]`/`text-[2.25rem]` 을 쓰고 있어 새 온보딩 부품은 `text-sm/xs` · `page-title`/`text-2xl` 토큰으로 맞춘다(휴대폰 15/17px · PC 14/15px 가 저절로)

**위험 · 지킬 규칙**
- Tailwind v4 — 설정 파일이 없고 토큰은 `app/globals.css @theme`(48)에만 있다. 변형 조건을 `(@media a, b)` 한 줄로 적으면 Tailwind 가 쉼표로 갈라 둘째 조건이 깨진다(globals 11~13) — 블록 꼴로, 그리고 desk 조건을 바꾸면 `lib/nav.ts:223 DESK_MEDIA` 와 `modal.tsx:15 isPhone` 이 같이 따라야 한다
- 휴대폰 카드 테두리는 `.rounded-2xl.border-line.bg-surface`(globals 2712) 규칙이 투명하게 만든다 — 새 카드는 이 세 클래스 조합을 쓰면 휴대폰 흰 면 · PC 선이 저절로. `rounded-[20px]` 같은 대괄호 모서리는 휴대폰 둥글기 토큰(205~206)을 안 따라온다(geum-yunho 3절)
- 창은 `Modal`(components/modal.tsx)만 쓴다 — `dialog:not([open]){display:none}`(1428) · `overlay allow-discrete` · 사파리 닫힘 자리(1447~1463) · 자판 대응(2265) · 끌어내려 닫기 · 창 안 창 분리(278)가 전부 거기 붙어 있다. 직접 `<dialog>` 를 만들면 그중 하나가 빠진다. 창이 열린 동안 html 이 잠긴다(2762) — 시트 위에서 바닥 단추를 쓰려면 시트 안에 둔다
- `view-transition-name` 은 맨 위에 그려진다(geum-yunho 3절) — 전체 덮개(진행 화면 · 튜토리얼식 화면)를 (app) 안에 띄우면 본문(app-main) · 틀(shell-*)이 덮개 위로 번쩍인다. 체크인 관문 `data-gate-up`(checkin-gate.tsx 123) · 시작 연출 `data-splash`(app-splash.tsx 94 · globals 2290s)처럼 덮개 동안 이름을 끄거나, 가입처럼 (app) 밖(`app/login`)에 둔다. 밖에 두면 `data-safe-area`(globals 2650~2663 · (session)/layout.tsx 53~58)를 스스로 단다 — 안 달면 아이폰 앱에서 시계 자리 여백이 두 번 들어가고, 달면 `env(safe-area-inset-*)` 를 직접 비워야 한다
- 아이폰 자판: 바닥 단추는 `bottom: var(--kb,0px)`, 화면 틀은 `height: var(--vvh,100dvh)`(components/viewport-vars.tsx 1~15) — 안 그러면 숫자 입력 단계에서 [다음]이 자판 뒤에 숨는다. 입력칸은 16px 규칙(globals 2556) 때문에 `text-sm` 로 써도 16px 가 되고 큰 숫자 칸(`text-4xl`)은 예외다. 하단 탭이 자판 때 숨는 규칙(2769~2785)은 (app) 안에서만
- 누름 · 떨림은 문서 한 곳에서 듣는다 — 선택지를 `div onClick` 으로 만들면 누름 옅어짐(press-feedback PRESSABLE 105)도 고르기 떨림(haptic-feedback PICKERS 208)도 안 붙는다. `button role="radio" aria-checked` 또는 `label + input.peer sr-only` 로 만든다. 이미 골라진 것을 다시 누르면 떨지 않게 돼 있다(242~251)
- `Segmented` 는 칸이 컨테이너 바로 안에 있어야 표시 자리를 잰다(segmented.tsx 24~26) · 붙기 전엔 값이 null 이라 표시가 안 움직인다(106~113) — 칸을 다른 요소로 감싸지 말 것
- 색: 글자에 `text-sky` 는 흰 바탕 대비 2.8:1 — 글자엔 `text-sky-strong`(auth-form 175 주석 · ui.tsx 68). hex 를 직접 적으면 다크 · 네이비(globals 262~330)에서 안 뒤집힌다 — 늘 토큰 클래스로. `bg-sky` 위 흰 글자만 4:1
- 움직임: 들어오는 것 160~200ms · 나가는 것 ~120ms(geum-yunho 2절), `animate-step-*` · `animate-row-in` 은 쓰는 쪽에서 `motion-safe:` 를 붙인다(globals 1210 · 1232 주석). `prefers-reduced-motion` 은 2311 에서 전환 · dialog 를 0s 로 — 진행 화면이 '애니메이션이 끝나면' 넘어가게 짜면 움직임 줄이기에서 영원히 안 넘어간다(expand.tsx 31~34 처럼 시간으로 잰다)
- React 폼 action 뒤 폼이 초기화된다 — 가입은 `useActionState` + 비밀번호 · 동의 · 생년월일을 상태로 쥐고(auth-form 890~905) `data-sync` 를 `useLayoutEffect` 로 되칠한다(919~927). 서버 액션은 `guardFormAction`(869) · `orOffline`(lib/action-offline.ts) 으로 감싼다 — 신호 끊기면 적던 것이 통째로 사라진다. 모든 단계를 한 폼에 두고 `noValidate` + `checkStep`(455) 으로 단계마다 검사하는 구조와 키체인용 sr-only username(1147~1160)을 깨지 않는다
- 단위(cm/in · kg/lb)는 기기 localStorage(lib/units.ts 8~11) — 온보딩에서 고른 토글이 설정의 단위와 같은 저장소를 쓰게(`applyLengthUnit`) 하고 서버엔 늘 cm · kg 만 보낸다. `lib/units` 에 ft 는 없다
- 글 규칙: 해요체 · 줄표 없음 · 문장 속 굵게 없음 · 이모지 없음 · 11px 아래 금지(globals 2743 이 10px 를 11px 로 올린다) · 임의 px 글자 금지(geum-yunho 2절) · 날짜는 `dateKeyLabel`(lib/pitch-stats.ts). 상표 · 제품 · 보충제 이름 금지(영양 조언 규칙)
- 홈의 영양 기능(`app/(app)/today/nutrition-card.tsx` · `today-rings.tsx` · `lib/nutrition/advice*.ts`)은 건드리지 않는다(사용자). 온보딩이 영양 목표를 저장하면 기존 `saveNutritionProfile → saveDietPrefs`(goal-sheet 가 쓰는 액션) 로 같은 칸에 적어야 홈 · 탭 · 식단 짜기와 연동된다 — 새 저장 경로를 따로 만들면 끊긴다
- 금윤호 영역 부품(`components/velocity/*`)을 온보딩에서 import 하면 velocity 와 묶인다 — `StepBar` · `BigButton` · `OptionCards` 는 공용(`components/`)으로 옮기거나 복제해 쓰고, 옮기면 `HANDOFF.md` 에 적는다. 김민 영역(`components/app-shell.tsx` · `modal.tsx` · 홈 · `auth-form.tsx`)을 고쳐도 HANDOFF
- `toast` 는 popover 맨 위 칸(toast.tsx 50)이라 전체 덮개(z-100) 위에도 뜬다 — 저장 알림은 그대로 되지만 `Toaster` 는 뿌리 레이아웃에 하나뿐이니 새로 두지 않는다
- 임시 미리보기 경로(`app/dev-preview-*`)는 커밋하지 않고, 지운 뒤 개발 서버를 다시 켠다(HMR FATAL — geum-yunho 2절). 로그인 없이 재는 화면은 그 경로에 가짜 자료로
- impeccable 참고 문서(`~/.claude/skills/impeccable/reference/craft-floor.md`)는 이 클라우드 환경에 없다 — 사용자 규칙상 UI 를 고치기 직전에 읽고 고친 뒤 `impeccable detect --json` 을 돌리는 것은 데스크톱(금윤호 PC)에서 한다

### 지도 7

## db 갈래 지도 — 인아웃 온보딩 답을 어디에 담나

### 1. 지금 표 모양(`/home/user/bullpen-log/prisma/schema.prisma`)

**User**(23~121행) — 몸에 대한 사실은 모두 여기. `nickname`(26) · `birthDate DateTime? @db.Date`(33) · `sex String?` 'M'|'F'(37, 값은 `lib/profile.ts:63` SEXES) · `heightCm Int?`(39) · `weightKg Float?`(42, 늘 kg) · `wingspanCm` · `targetVelocity` · `throwingHand` · `competitionLevel` · `baselineFreq/Volume/Intensity/WorkoutFreq` · `dailyWorkoutMinutes` · `trainingLevel` · `trainingGoal` · `trainingFocus`(김민의 트레이닝 영역) · `ownedEquipment String[]`(@default 없음 — 20260823 에 `TEXT[]` 로만 추가됨). 영양 관계는 `nutritionProfile NutritionProfile?`(1:1) · `dailyNutrition DailyNutrition[]`.

**NutritionProfile**(1189~1235행, userId @unique) — 영양 온보딩 답의 자리.
- `goal String @default("maintain")` — 'gain'|'maintain'|'lose' **3종**(`lib/nutrition/meta.ts:44-48` GOALS, `isGoalKey` 로 거름)
- `activity String @default("mid")` — 'low' 1.3 · 'mid' 1.5 · 'high' 1.7 **3단계**(`meta.ts:58-62`; 주석 51~56: 앱에 적은 운동은 OUT 으로 따로 더하므로 일반 계산기의 1.725 를 쓰면 두 번 셈)
- `proteinPerKg Float @default(1.8)` · `kcalTarget Int?`(직접 정한 칼로리, 저장 범위 1000~6000 `app/actions/nutrition.ts:821-830`)
- 체중 목표 넷(2026-10-01 김민 마이그레이션): `targetWeightKg Float?` · `weeklyRateKg Float?`(null=나이별 기본) · `kcalAdjust Int?`(서버만) · `planSince DateTime? @db.Date`
- `proteinTargetG Float?`(직접 정한 단백질 g, 10~450)
- 식단 취향(2026-10-01 금윤호): `goalEndDate Date?` · `seasonPhase String?`(off|pre|in|rehab) · `dietStyle String?`(**korean|mixed|simple** — 음식 문화 축) · `mealPattern String?`(3|3+1|3+2|2+1) · `avoidFoods String[] @default([])`(AVOIDS 9개 `lib/nutrition/diet-prefs.ts:48-58`) · `allowSupplements Boolean @default(true)`
- 옛 `sex` 칸은 2026-10-03 2단계 마이그레이션으로 DROP 됨. `waterGoalMl` 은 2026-09-25 에 DROP(`prisma/migrations/20260925213324_remove_nutrition_water`).
- **가입 때는 만들지 않는다.** 영양 탭에서 처음 저장할 때 `upsert`(`app/actions/nutrition.ts:641-645` saveDietPrefs, `:922-926` saveNutritionProfile — `create: { userId, ...data }`).

**DailyCheckin**(343~414행) — 그날 신호. `bodyWeightKg Float?`(384) · `hydration String?`(396, '충분/보통/부족' — 2026-09-30 화면에서 뺐지만 칸은 남음) · `nutrition String?`(400, 끼니 양) · `skippedMeals String[] @default([])`(402) · `appetite Int?`(404) · `throwPlan String?`(407) · `soreness Int?`.

**DailyNutrition**(1338~1352행, [userId,date] 유일) — `weightKg Float?` · `photoCalls Int @default(0)`. `waterMl` 은 지워짐.

**체중 기록 표는 따로 없다(`NutritionWeight` 없음).** 체중은 셋에 흩어져 있다: ① `User.weightKg`(가입/내 정보의 몸무게 — 흐름의 점이 아님, 마지막 대체값 `lib/nutrition/load.ts:376`) ② `DailyNutrition.weightKg`(영양 탭 `setWeight` `app/actions/nutrition.ts:286-313`, 20~250kg) ③ `DailyCheckin.bodyWeightKg`. 읽는 규칙 `recentWeightKg`(`load.ts:195-220`): 그날까지 30일 안 가장 최근, 같은 날이면 영양 탭 값 우선. 체중 흐름 판정(`lib/nutrition/weight-goal.ts`)은 56일 창의 ②③만 본다(`load.ts:267-277`) — **온보딩의 '시작 체중'은 User.weightKg 에만 적으면 흐름의 첫 점이 안 된다.**

### 2. 계산이 칸을 읽는 길
- `toProfile`(`load.ts:153-191`): DB 줄 → `ProfileSettings`(`lib/nutrition/targets.ts:38-61`). 없는 칸은 `?` 로 받아 옛 줄도 통과, 틀린 값은 `isGoalKey/isActivityKey` 로 기본값 — **새 열쇠를 더하면 상수에도 넣어야 'maintain/mid' 로 뭉개지지 않는다.** 김민의 `lib/day-detail.ts:139` 도 같은 함수.
- `computeTargets`(`targets.ts:140-217`): bmr(Mifflin, 18세 밑 Schofield `age.ts:177-183`) × activity.factor + `paceDelta`(age.ts:216-224, AGE_RULES paces: teen gain 0.25/300 · lose 0.2/200, adult gain·lose 0.25/300 · 0.35/400) + adjust → `base`; `kcalTarget` 있으면 그 값(adjust 0). protein = `proteinTargetG ?? proteinPerKg×체중`; **fat = max(kcal 25%, 0.8g/kg) 고정(198행); carbs = 나머지(199행)** → 인아웃 17번(탄단지 g · % 직접 수정)을 담을 칸이 없다. 결과 `Targets.bmr · base · kcal · protein · fat · carbs · delta · paceKg`(71~120행) 가 인아웃 15번(기초대사량 · 활동대사량 · 목표 칼로리)과 그대로 짝.
- `saveNutritionProfile`(`nutrition.ts:795-943`): `ProfileInput`(773-793행) 검사 → `effectiveGoal`(어린이 감량→유지) · `paceChoices`/`storedRate`(기본 속도는 null 저장) · `checkTargetWeight`(`weight-goal.ts:488-512`, `targetRange` 456행: 증량 teen 110% · adult 115%, 감량 90%·BMI 20 바닥; `targetAllowed` 440행: 유지·어린이는 목표 체중 버림) · `planOnSave`(`weight-goal.ts:533-560`: goal·activity·rate·kcalTarget 중 하나라도 바뀌면 kcalAdjust 초기화 + planSince 오늘).
- `saveDietPrefs`(`nutrition.ts:628-678`): `cleanDietPrefs`(`diet-prefs.ts:117-168`) → upsert → 오늘 식단에서 못 먹는 것 뺌.
- `etaWeeks`(`weight-goal.ts:428`)가 인아웃 10번 '23주' 계산. `goalEndDate` 는 반대 방향(날짜→속도).
- 조언 입력 `AdviceInput`(`lib/nutrition/advice.ts:48-83`): `body.goal: GoalKey` · `training[].kind` · `checkin` — 목표 종류를 넓히면 여기까지 타입이 번진다. `AGE_RULES.goalDelta/goalHint/paces` 가 `Record<GoalKey,…>` 라 **GoalKey 에 열쇠를 더하면 세 나이 칸 모두 채워야 컴파일된다**(`age.ts:40-49, 59-116`).

### 3. 가입이 지금 받는 것(`app/login/auth-form.tsx:406-451` STEPS 7단계, `app/actions/auth.ts:63-186`)
email · nickname(2자+) · birthDate(필수) · sex(칸이 오면 필수) · password · 약관 둘 · throwingHand · heightCm(선택) · baseline 3 · baselineWorkoutFreq · trainingLevel(필수) · competitionLevel. **몸무게는 안 받는다**(`grep weightKg auth-form.tsx` 0건; 내 정보 `app/actions/profile.ts:88-93` `checkOptionalNumber` 20~200kg 만). 영양 목표 · 활동량 · 식단 취향 모두 가입에 없다. 로그인 사용자 읽기 `getCurrentUser`(`lib/dal.ts:11-41`)는 User 칸을 select 로 나열 — User 에 칸을 더하면 여기에도 넣어야 한다. NutritionProfile 은 `findUnique` 로 통째 읽어(`load.ts:262`, `day-detail.ts:113`) 새 칸이 저절로 따라온다(단 toProfile 사상 필요).

### 4. flow.md 질문 → 칸 짝
| 인아웃 질문 | 지금 칸 | 판단 |
|---|---|---|
| 1 이름 | `User.nickname` | 있음 |
| 2 생년월일 · 성별 | `User.birthDate` · `User.sex` | 있음(가입 필수) |
| 4 목표 5종(감량·증량·유지·근육량↑·체지방률↓) | `NutritionProfile.goal` 3종 | 값 확장. DB 는 String 이라 SQL 불필요. 계산은 `effectiveGoal` 단계에서 3종으로 접기(근육량↑ = gain 느린 속도 + 단백질 상단, 체지방률↓ = lose 느린 속도 또는 maintain + 단백질 상단). 대안: `goal` 은 3종 그대로 두고 새 칸 `goalKind String?` 에 5종 원답 — 둘 중 하나로 정해야 '한 곳' 원칙이 산다 |
| 5 목표 이유 | 없음 | 새 칸 `goalReason String?`(health·look·event·profile) — 계산 안 씀, 문구·동기만, null 허용 |
| 6 경험 | 없음 | 새 칸 `dietExperience String?`(first·tried·steady) — 식단 짜기 기본(처음이면 simple) · 격려 문구 |
| 7 키 | `User.heightCm Int?` | 있음. cm/ft 토글은 `lib/units.ts` LENGTH_KEY(localStorage, DB 는 늘 cm) |
| 8 시작 체중 | `User.weightKg` + `DailyNutrition.weightKg`(오늘) | 가입 폼에 칸 추가 + 온보딩 끝에 `DailyNutrition` 오늘 줄 upsert(흐름 첫 점). 둘 다 칸 있음 |
| 8 목표 체중 | `NutritionProfile.targetWeightKg` | 있음(`checkTargetWeight` 범위 — 유지·어린이는 버려짐) |
| 9 활동량 5단계 | `activity` 3단계 | 값 확장(String, SQL 불필요). 'very-low' 1.2 · 'very-high' 1.9 정도 — 운동 OUT 이중 계산 주의. activity 바꾸면 `planOnSave` 가 계획 재시작 |
| 10 속도(느리게·추천·빠르게 · N주) | `weeklyRateKg` + `etaWeeks` | 있음. 선택지는 `paceChoices`(adult 0.25/0.35, 0.35 는 70kg↑ 증량만, teen 1개, child 없음) |
| 11 물 | 없음(2026-09-25 지움) | 새 칸 `waterHabit String?`(over2·under2·unknown). `DailyCheckin.hydration` 은 그날 평가라 뜻이 다름 |
| 12 운동 종류 여러 개 | `User.trainingGoal`(1개, 김민 영역) · `baselineWorkoutFreq` | 새 칸 `activityKinds String[] @default([])`(NutritionProfile). 소모 kcal 은 `lib/nutrition/burn.ts` 가 기록에서 셈하므로 계산엔 안 쓰고 activity 보정 · 조언 문구에 |
| 13 식단 스타일 4종(일반·운동·키토·비건) | `dietStyle`(korean·mixed·simple) | 축이 다름(음식 문화 vs 탄단지). 새 칸 `macroPreset String?`(balanced·athlete·lowcarb·vegan). vegan → `avoidFoods` 에 beef·pork·chicken·seafood·egg·dairy 자동. 키토는 투수 설계(던지는 날 탄수화물, `guide.ts`)와 충돌 — 빼거나 경고 |
| 17 탄단지 g · % | `proteinTargetG` 만 | 새 칸 `carbTargetG Float?` · `fatTargetG Float?`(proteinTargetG 와 같은 모양, null=계산). `computeTargets` 198~199행에 override + 합이 kcal 과 맞게 재조정 |
| 13 코치 말투 | 없음 | 새 칸 `coachTone String?`(kind·blunt), null=kind. `advice.ts` 문구 두 벌 |
| 22 기대감 | 없음 | 새 칸 `expectation String?`(low·unsure·high) 또는 저장 안 함 |
| 15 목표 칼로리 ✎ | `kcalTarget Int?` | 있음 |
| 온보딩 끝 표시 | 없음 | 새 칸 `onboardedAt DateTime?`(NutritionProfile) — 옛 계정 · 건너뛴 사람 구분. 가입 끝에 NutritionProfile 을 만들어 두면 유무로도 가능 |
| 3 · 18~21 · 23 | — | 저장 없음(서명도 인아웃이 안 남김). 알림은 `lib/native-bridge.ts` |

### 5. 마이그레이션 관례(`prisma/migrations/`)
- 폴더 `YYYYMMDDHHMMSS_snake_name`, 시각은 정각으로 손으로 정함(`20261001120000_nutrition_weight_goal` · `20261007090000_checkin_skipped_meals`). 같은 날 둘이 겹치면 뒤 사람이 시각을 미룸(김민 483d359: 금윤호의 20261004120000 과 겹쳐 150000 으로). 지금 마지막은 `20261007090000` → 새 것은 `20261008…` 이상.
- `migration_lock.toml` provider=postgresql, `relationMode = "prisma"`(schema 3행)라 FK 없음 — 인덱스만 `CREATE INDEX`.
- `prisma.config.ts`: `DIRECT_URL ?? DATABASE_URL`(풀러 6543 으로는 migrate 가 멈춤). `.env` 가 없는 이 클라우드에서는 `migrate diff` · `deploy` 둘 다 못 돈다 → SQL 을 손으로 쓰고 데스크톱에서 `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --script` 로 같은지 맞춰 본다.
- `package.json:7` `build = prisma generate && prisma migrate deploy && next build` → main 에 올리면 Vercel 이 공유 DB 에 즉시 적용. `:12` `backup = node --env-file=.env scripts/backup.mjs`(스키마의 모든 모델을 자동으로 `~/bullpen-log-backups/db-<stamp>.json`, `scripts/backup.mjs:32-34`). `scripts/restore.mjs` 는 빠진 줄만 채움(칸 삭제는 못 되돌림).
- prisma diff 출력 모양(그대로 따라 쓴다 — `ADD COLUMN` 뒤 공백 5개, 칸은 알파벳 차례, 머리 `-- AlterTable` 밑에 한국어 '왜' 주석): `String[] @default([])` → `TEXT[] DEFAULT ARRAY[]::TEXT[]` · `Int?` → `INTEGER` · `Float?` → `DOUBLE PRECISION` · `DateTime? @db.Date` → `DATE` · `DateTime?` → `TIMESTAMP(3)` · `Boolean @default(true)` → `BOOLEAN NOT NULL DEFAULT true` · `Int @default(0)` → `INTEGER NOT NULL DEFAULT 0` · `String?` → `TEXT`.

최근 예(`20261001120000_nutrition_weight_goal/migration.sql`):
```sql
-- AlterTable
-- 체중 목표(영양 로드맵 4번) — 목표 체중 · 주당 속도 · 체중 흐름 조정 · 계획 시작일.
-- 넷 다 비워 둘 수 있어 이 칸을 모르는 코드도 그대로 돈다(넷 다 비면 목표 숫자는 예전과 같다).
ALTER TABLE "NutritionProfile" ADD COLUMN     "kcalAdjust" INTEGER,
ADD COLUMN     "planSince" DATE,
ADD COLUMN     "targetWeightKg" DOUBLE PRECISION,
ADD COLUMN     "weeklyRateKg" DOUBLE PRECISION;
```
`20261007090000_checkin_skipped_meals/migration.sql`:
```sql
-- AlterTable
-- 체크인 '걸른 끼니'(영양 간단 관리 — 메인 추천 9번 2단계). 영양 조언(lib/nutrition/advice.ts)이 읽는다.
-- 더하기만이라 이 칸을 모르는 코드도 그대로 돈다(비면 안 걸렀거나 안 적은 것). '끼니 양'은 있던 nutrition 칸을 그대로 쓴다.
ALTER TABLE "DailyCheckin" ADD COLUMN     "skippedMeals" TEXT[] DEFAULT ARRAY[]::TEXT[];
```
지우기 2단계 예(`20261003100000_drop_nutrition_profile_sex`): 코드 배포 뒤에 돌리며 먼저 `UPDATE "User" … FROM "NutritionProfile"` 로 값을 옮기고 `ALTER TABLE … DROP COLUMN "sex"`.

**이번 작업의 손 SQL 초안** — `prisma/migrations/20261008120000_nutrition_onboarding/migration.sql`(스키마에 같은 칸을 `?`/`@default` 로 먼저 적는다):
```sql
-- AlterTable
-- 인아웃식 온보딩(2026-10-08) — 영양 질문의 답. 모두 비우거나 기본값이 있어 이 칸을 모르는 코드도 그대로 돈다.
-- 계산(lib/nutrition/targets.ts)이 읽는 것은 carbTargetG · fatTargetG 뿐, 나머지는 문구 · 추천 · 식단 짜기가 읽는다.
ALTER TABLE "NutritionProfile" ADD COLUMN     "activityKinds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "carbTargetG" DOUBLE PRECISION,
ADD COLUMN     "coachTone" TEXT,
ADD COLUMN     "dietExperience" TEXT,
ADD COLUMN     "expectation" TEXT,
ADD COLUMN     "fatTargetG" DOUBLE PRECISION,
ADD COLUMN     "goalReason" TEXT,
ADD COLUMN     "macroPreset" TEXT,
ADD COLUMN     "onboardedAt" TIMESTAMP(3),
ADD COLUMN     "waterHabit" TEXT;
```
(목표 5종 · 활동량 5단계는 `goal` · `activity` 가 String 이라 SQL 없이 코드 상수만 넓힌다. User 에는 칸을 더하지 않는다 — 몸무게는 이미 `User.weightKg`.)

### 6. 기본값 · null 규칙(AGENTS.md 2절 '추가는 안전')
- 새 칸은 전부 `?`(null = 안 물었거나 옛 계정) 또는 `String[] @default([])`. `NOT NULL` 없는 칸을 더하면 김민 쪽 옛 코드가 줄을 넣어도 안 깨진다(`saveDietPrefs` 의 create 도 그대로).
- 읽을 때 `toProfile`/`toDietPrefs` 처럼 `keyIn(목록)` 으로 거르고 틀리면 null/기본값(`diet-prefs.ts:87-95`). 저장은 `cleanDietPrefs` 처럼 화면 값을 믿지 않고 하나씩 검사.
- `kcalAdjust` · `planSince` 처럼 서버만 정하는 칸은 화면에서 받지 않는다(`nutrition.ts:782-787` 주석).

**그대로 쓸 수 있는 것**
- NutritionProfile 의 있는 칸으로 그대로 되는 답: goal(3종) · activity(3단계) · kcalTarget(목표 칼로리 ✎) · targetWeightKg(목표 체중) · weeklyRateKg(속도) · proteinTargetG(단백질 g) · goalEndDate · dietStyle · mealPattern · avoidFoods · allowSupplements — prisma/schema.prisma:1189-1235
- User 의 있는 칸: nickname(이름) · birthDate(생년월일) · sex(성별) · heightCm(키) · weightKg(시작 체중의 자리) — prisma/schema.prisma:26-42
- computeTargets(profile, body, burn) → bmr · base(활동대사량) · kcal · protein · fat · carbs · delta · paceKg — 인아웃 15 · 17번 숫자를 바로 준다: lib/nutrition/targets.ts:140-217; basalKcal 129-138; ageOn 122-131
- etaWeeks(remainingKg, paceKg) — '23주면 달성' 계산: lib/nutrition/weight-goal.ts:428; targetRange 456 · checkTargetWeight 488-512 · targetAllowed 440 · planOnSave 533-560
- 속도 선택지 · 저장 규칙: paceChoices(age, goal, refKg) lib/nutrition/age.ts:232-250, effectiveRate 194-208, storedRate 214-222, paceDelta 216-224, AGE_RULES(어린이 · 성장기 · 성인 한도) 59-116, ageBand 133-137
- saveNutritionProfile(ProfileInput) — 검사 · effectiveGoal · 속도 · 목표 체중 · planOnSave · upsert 흐름을 온보딩 마지막 저장에 그대로 호출: app/actions/nutrition.ts:773-943; saveDietPrefs 628-678(upsert create: { userId, ...data } 모양 641-645); setWeight 286-313(DailyNutrition 오늘 줄)
- toProfile(DB 줄 → ProfileSettings, 없는 칸 허용 · 틀린 값 기본값) lib/nutrition/load.ts:153-191; toDietPrefs lib/nutrition/diet-prefs.ts:97-115; 검사 cleanDietPrefs 117-168 — 새 칸도 같은 모양(keyIn 거름)으로
- recentWeightKg(userId, date) — 30일 안 최근 체중(영양 탭 > 체크인): lib/nutrition/load.ts:195-220
- 상수 목록과 isX 거름: GOALS · ACTIVITIES · isGoalKey · isActivityKey lib/nutrition/meta.ts:44-66; DIET_STYLES · MEAL_PATTERNS · AVOIDS · SEASON_PHASES lib/nutrition/diet-prefs.ts:11-58; SEXES · checkOptionalNumber(몸무게 검사 20~200kg) lib/profile.ts:22-50, 63-72; validateProfile 118-150
- 단위 토글(kg/lb · cm/ft): lib/units.ts WEIGHT_KEY · LENGTH_KEY(localStorage) · toWeight/fromWeight 63-69 · toLength/fromLength 53-59 — DB 는 늘 kg · cm
- 가입 흐름 틀: STEPS 배열 + fields 로 '막힌 칸의 단계로 되돌아가기' app/login/auth-form.tsx:406-461(stepOfField), 서버 trySignup app/actions/auth.ts:63-186(user.create data 에 칸을 더하면 됨, checkSignupEmail 38-49)
- 로그인 사용자 읽기 select 목록 getCurrentUser lib/dal.ts:11-41 — User 에 칸을 더하면 여기에 추가
- 조언 입력 모양 AdviceInput(body.goal · training[].kind · checkin · hour) lib/nutrition/advice.ts:48-83, 범위 상수 CARB_PER_KG · PROTEIN_PER_KG · FAT_PER_KG 109-118 — 코치 말투 · 목표 종류를 잇는 자리
- 식단 짜기의 그날 조건 PlanContext(place · hot · variant) lib/nutrition/meal-plan.ts:1969-1976, PLAN_PLACES 50-54 — 운동 종류 · 장소와 연동할 때
- 마이그레이션 SQL 본보기: prisma/migrations/20261001120000_nutrition_weight_goal/migration.sql(비워 둘 수 있는 칸 넷), 20261001140000_nutrition_diet_plan(칸 7 + 새 표 + 유일 인덱스), 20261007090000_checkin_skipped_meals(TEXT[] DEFAULT ARRAY[]::TEXT[]), 20261003100000_drop_nutrition_profile_sex(2단계 지우기 · UPDATE 먼저)
- 백업 scripts/backup.mjs(스키마의 모든 모델 자동, ~/bullpen-log-backups) · 되살리기 scripts/restore.mjs(빠진 줄만) · prisma.config.ts(DIRECT_URL 우선)

**빈 곳(인아웃과 견줘)**
- 목표가 3종(gain · maintain · lose)뿐 — 인아웃의 '근육량 증가' · '체지방률 감소'가 없다. goal 은 String 이라 DB 변경 없이 값을 늘릴 수 있지만 GoalKey 를 넓히면 AGE_RULES.goalDelta/goalHint/paces(Record<GoalKey,…>, lib/nutrition/age.ts:40-116)와 effectiveGoal · AdviceInput.body.goal 까지 같이 채워야 한다. 아니면 goal 은 3종 그대로 두고 NutritionProfile.goalKind String? 에 5종 원답을 두고 계산 전에 접는다 — 하나로 정할 것
- 목표 이유 · 경험 · 물 습관 · 코치 말투 · 기대감 · 온보딩 완료 시각을 담을 칸이 없다 → NutritionProfile 에 goalReason · dietExperience · waterHabit · coachTone · expectation(String?) · onboardedAt(DateTime?) 추가(손 SQL 초안은 summary 5절)
- 활동량이 3단계(low 1.3 · mid 1.5 · high 1.7, lib/nutrition/meta.ts:58-62) — 인아웃 5단계로 넓히려면 값 둘 추가(DB 변경 없음). 이 앱은 운동 · 투구를 OUT 으로 따로 더하므로(meta.ts:51-56 · lib/nutrition/burn.ts) 인아웃 계수(1.725 · 1.9)를 그대로 쓰면 두 번 센다 — 계수는 낮게
- 탄단지 비율 · g 을 저장할 칸이 없다 — 단백질만 proteinTargetG, 지방은 kcal 25%(바닥 0.8g/kg) 고정, 탄수화물은 나머지(lib/nutrition/targets.ts:197-200). carbTargetG · fatTargetG(Float?, null = 계산) 추가 + computeTargets 에 override 와 합 맞추기 규칙 + saveNutritionProfile 검사 추가
- 식단 스타일 4종(일반 · 운동 · 키토 · 비건)은 dietStyle(한식 · 골고루 · 간편식, 음식 문화 축)과 축이 다르다 → macroPreset String? 로 따로. vegan 은 avoidFoods 에 beef · pork · chicken · seafood · egg · dairy 를 같이 넣어 식단 짜기와 연동(AVOIDS 열쇠 lib/nutrition/diet-prefs.ts:48-58). 키토는 던지는 날 탄수화물 설계(lib/nutrition/guide.ts · targets.ts 머리 주석)와 어긋나 빼거나 경고
- 운동 종류 여러 개(헬스 · 유산소 · 필라테스 …)를 담을 칸이 없다 — User.trainingGoal 은 한 가지이고 김민의 트레이닝 영역 → NutritionProfile.activityKinds String[] @default([]) 추가(계산엔 안 쓰고 activity 보정 · 조언 문구)
- 가입이 몸무게를 안 받는다(app/login/auth-form.tsx 에 weightKg 칸 없음, app/actions/auth.ts:63-186) — 시작 체중 단계를 넣고 User.weightKg 에 저장 + 같은 날 DailyNutrition.weightKg 에도 한 줄(체중 흐름 weight-goal 은 DailyNutrition · DailyCheckin 56일 창만 본다, lib/nutrition/load.ts:267-277). 몸무게 범위가 두 곳에서 다르다(profile.ts 20~200 · nutrition.ts:295 20~250) — 하나로
- NutritionProfile 이 가입 때 안 만들어진다(영양 탭 첫 저장 때 upsert) — 온보딩 끝에 saveNutritionProfile + saveDietPrefs 같은 upsert 로 만들고 planSince 를 그날로. 옛 계정(줄 없음 · onboardedAt null)은 영양 탭이 온보딩을 권하는 길 필요
- 목표 날짜(goalEndDate)와 속도(weeklyRateKg)가 둘 다 있어 인아웃 슬라이더(느리게 · 추천 · 빠르게 → N주)와 1:1 이 아니다 — 슬라이더 값을 paceChoices 의 kg 으로 사상하고 N주는 etaWeeks 로 보여 주되 goalEndDate 는 비워 두거나 자동 계산
- DailyCheckin.hydration(충분 · 보통 · 부족)이 칸만 남아 있고 화면에서 빠져 있다(lib/checkin.ts:541 주석) — 물 습관(waterHabit)과 뜻이 다르니 되살리려면 '새 칸은 읽는 계산까지 같이 잇는다' 규칙대로 조언에 연결
- getCurrentUser(lib/dal.ts:17-41)가 User 칸을 하나씩 select 한다 — User 쪽에 칸을 더하면 빠뜨리기 쉬우니 온보딩 답은 NutritionProfile 에 모은다(findUnique 통째 읽기)

**위험 · 지킬 규칙**
- AGENTS.md 1절: prisma migrate dev · db push · migrate reset 절대 금지. 절차는 schema.prisma 고치기 → migrate diff 로 SQL → prisma/migrations/<YYYYMMDDHHMMSS>_<이름>/migration.sql → migrate deploy → prisma generate. 이 클라우드엔 .env 가 없어(prisma.config.ts 가 DIRECT_URL/DATABASE_URL 없으면 throw) diff · deploy 둘 다 못 돈다 — SQL 은 손으로 쓰고 데스크톱에서 diff 결과와 대조
- package.json:7 build 에 prisma migrate deploy 가 들어 있어 마이그레이션이 든 커밋을 main 에 올리면 Vercel 이 공유(=운영) DB 에 바로 적용한다. 미리보기 가지 빌드도 같은 DB 면 마찬가지. npm run build 도 같은 이유로 쓰지 않는다(npx next build 만)
- 구조 변경 전 반드시 npm run backup(~/bullpen-log-backups, 회원 정보 포함 — 깃 · 공유 금지) + 상대방(김민)에게 미리 알림 + 끝나면 HANDOFF.md 에 'npx prisma generate 하라'(AGENTS.md 2 · 6절)
- 새 칸은 ?(null) 또는 @default 로만 — 그래야 이 칸을 모르는 김민 쪽 코드(saveDietPrefs 류 upsert · 김민의 day-detail.ts)가 줄을 넣을 때 안 깨진다. 지우기 · 이름 바꾸기는 2단계(코드 배포 뒤 DROP, 20261003100000 예)
- 마이그레이션 폴더 시각은 마지막(20261007090000)보다 뒤여야 하고 김민의 같은 날 것과 겹치지 않게(483d359 사례). 시각이 앞서면 migrate deploy 가 순서 오류
- npx prisma format 을 쓰지 않는다 — 남의 모델 줄 정렬까지 88줄 바뀜(docs/claude/geum-yunho.md 4절). 제 줄만 손으로 맞춘다. relationMode=prisma 라 SQL 에 외래키가 없는 것이 정상
- goal · activity 값을 넓힐 때 toProfile(load.ts:153) 의 isGoalKey/isActivityKey 가 새 열쇠를 모르면 'maintain' · 'mid' 로 조용히 뭉갠다 — 상수(meta.ts GOALS · ACTIVITIES)와 함께 바꾸고, 김민 컴퓨터의 옛 코드가 받을 때까지 새 값이 저장된 줄을 옛 코드가 기본값으로 읽는다는 점을 HANDOFF 에
- GoalKey 를 넓히면 AGE_RULES(Record<GoalKey,…>, age.ts:40-116) · effectiveGoal · paceDelta · defaultPace · advice.ts HEADLINE_RULES · meal-plan 시험(npm run nutrition:test 413 · nutrition:advice-test)이 모두 걸린다 — 계산은 3종으로 접고 세부 종류는 따로 두는 쪽이 안전
- activity 를 바꿔 저장하면 planOnSave(weight-goal.ts:533-560)가 kcalAdjust 를 지우고 planSince 를 오늘로 되돌린다 — 온보딩을 다시 돌리는 기존 사용자의 체중 흐름 판정이 18일 미뤄진다
- 지방 · 탄수화물 g 을 직접 받으면 computeTargets 의 지방 바닥 0.8g/kg · 탄수화물 ≥0 · 합 = kcal 규칙(targets.ts:197-200)과 advice.ts 의 '사용자 목표가 이긴다'(RANGE_SLACK 118행) 규칙이 같이 움직인다 — 셀프테스트(nutrition:test · nutrition:advice-test) 통과를 확인
- 성장기 규칙(age.ts): 어린이는 감량 불가(goalDelta null → 유지), 성장기 감량 −200 까지, 속도 한 가지, 어린이 · 생년월일 모름은 목표 체중 · 속도 없음(targetAllowed · effectiveRate) — 온보딩 화면이 나이 칸에 맞는 선택지만 보여야 저장에서 막히지 않는다
- 체중 흐름의 첫 점: User.weightKg 은 흐름 점이 아니다 — 온보딩 '시작 체중'을 DailyNutrition.weightKg(오늘)에도 넣는다. 저장 범위가 profile.ts(20~200) · nutrition.ts:295(20~250) 로 달라 하나로 맞춘다
- 가입 폼 app/login/auth-form.tsx 는 김민이 guardFormAction · SafeForm 으로 감싼 폼(2026-09-30 규칙 — 신호가 끊겨도 적던 것이 안 사라지게) — 단계를 늘려도 그 감싸기 · stepOfField(막힌 칸의 단계로 복귀) 구조를 지킨다
- DB 는 운영과 하나 — 시험용 가입 · 기록을 만들지 않는다(docs/claude/geum-yunho.md 2절). 새 표 · 칸을 만든 뒤에는 개발 서버를 다시 켠다(켜 둔 서버는 옛 Prisma 클라이언트)
- User.trainingGoal · trainingLevel · ownedEquipment 는 김민의 트레이닝 추천 영역 — 영양 온보딩의 '운동 종류'를 거기에 겹쳐 쓰지 않는다. 고치면 HANDOFF
- vegan 을 avoidFoods 로 풀면 meal-templates CONTAINS · 시험의 EXPECTED_AVOIDS 가 걸린다 — HANDOFF 규칙: CONTAINS 에서 꼬리표를 빼지 않는다, 새 음식 · 꼬리표를 더하면 기대표도 같이
- DailyCheckin.hydration 등 '보이기만 하는 칸'을 만들지 않는다 — 새 칸은 읽는 계산까지 같이 잇는다(docs/claude/geum-yunho.md 체크인 규칙)

### 지도 8

## app-shell 갈래 지도 — 앱(아이폰 웹뷰)과 웹이 어디서 갈리고, 온보딩 화면이 무엇을 지켜야 하나

### 1. 앱인지 가리는 법(판별은 세 겹)
- 앱 껍데기는 Capacitor 가 사이트를 그대로 연다(mobile/README.md:3-9). `mobile/capacitor.config.json` — `appendUserAgent: "BullpenLogApp/1.0"`, `server.url: https://bullpen-log.vercel.app/today`, `ios.contentInset: "never"`(화면 끝까지 그림), `allowsLinkPreview: false`. 세로 고정(mobile/ios/App/App/Info.plist:62-65).
- 서버: `lib/app-env.ts:17` `NATIVE_UA_MARK='BullpenLogApp'`, `:20 isNativeUserAgent(ua)`. 화면: `:29 isNativeClient()`(window.Capacitor.isNativePlatform 또는 UA).
- 첫 페인트 전 스크립트 `lib/native-app.ts:23 APP_INIT_SCRIPT`(app/layout.tsx:94 에서 THEME_INIT_SCRIPT 바로 뒤): UA 에 표시가 있으면 `<html data-app="native">`(:27), 테마에 맞춰 상태바 글자색 `SystemBars.setStyle`(:32-40), 웹뷰 바탕색을 `webkit.messageHandlers.bullpenTheme` 로(:36-37), DOMContentLoaded + rAF 2번 뒤 `bullpenIntro.postMessage('ready')`(:41-50) — 이게 가야 Swift 시작 연출 판(mobile/ios/App/App/MainViewController.swift:133 IntroOverlay)이 걷힌다(안 가면 10초, :166).
- 앱 기능 부품: `lib/native-bridge.ts`(BullpenNative — 화면 켜 두기 · 로컬 알림, `hasNativeBridge` :29), `lib/haptics.ts buzz/haptic`(Haptics 부품, 웹 사파리는 무음). 모두 `window.Capacitor.nativePromise` 로 부르고 없으면 false/무시.
- 서버 분기 세 곳: `app/(app)/layout.tsx:59` `isNative` → `visibleGroups(isAdmin, isNative)`(lib/nav.ts:277-284, 구속 측정 메뉴) · `:115 {!isNative && <AppSplash />}`; `app/page.tsx:53-55` 앱이면 소개 없이 `redirect(user ? '/today' : '/login')`; `app/(session)/velocity/access.ts:13-18` 앱 또는 관리자.
- CSS 분기는 전부 `html[data-app='native']`(app/globals.css): 519 길게 눌러도 미리보기 없음 · 528-535 글자 선택 막기(입력칸 · `.selectable` 만 허용) · 2642-2645 튕김(overscroll) 끄기 · **2650-2653 `body:not(:has([data-safe-area]))` 에 `padding-top/bottom: env(safe-area-inset-*)`** · 2656-2664 시계 자리를 바탕색으로 덮는 `body::before`(fixed, z-50) · 2752-2754 `scroll-padding-top`. Tailwind 쪽은 `in-data-[app=native]:`(auth-form.tsx:130, app/(legal)/layout.tsx:25 · 37).

### 2. 뿌리 레이아웃 app/layout.tsx
- `viewport.viewportFit: 'cover'`(:58-64) 라 `env(safe-area-inset-*)` 가 산다. `<head>` 순서: THEME_INIT_SCRIPT(:89) → APP_INIT_SCRIPT(:94) → Pretendard css(:106). body: PressFeedback · HapticFeedback · Toaster · **ViewportVars(:117)** · NavMotion(:119-121, Suspense).

### 3. 세 가지 화면 틀
① **(app) 틀** app/(app)/layout.tsx — `requireUser`(:56) → `AppNav`(:116-169, components/app-shell.tsx:204) 가 PC 막대 · 도크 · 판 · 휴대폰 상단 막대 · 하단 탭을 모두 그리고 CSS(`desk:` · `desk:hidden`)로 가른다. `CheckinGate`(:175-180) 가 어느 화면이든 그날 체크인이 없으면 먼저 뜬다. `PullToRefresh`(앱만, 탭 첫 화면 넷 — components/pull-to-refresh.tsx:9). `<main>`(:223-226) 은 `pb-10 … desk:pt-(--page-top)` + `MainTransition`(:231, ViewTransition name `app-main`). 밑은 `SiteFooter tabBar`(:234) 가 `h-[calc(var(--tab-bar-top)+1rem)]`(components/site-footer.tsx:39) 로 하단 탭 자리를 비운다.
  - 휴대폰 상단 막대 `MobileTopBar`(app-shell.tsx:2217): `data-safe-area` 고정 띠 `h-[env(safe-area-inset-top)]`(:2267-2274) + 같은 높이 빈 칸(:2276) + `sticky top-[env(safe-area-inset-top)] h-14`(:2290-2296, 이름표 shell-topbar). 왼쪽 ‹ 뒤로는 `lib/nav-state.ts` 의 bar.back 을 읽어(:2299-2308, `min-h-11 text-base text-sky`) `goBack`(components/back-link.tsx:25) 을 부른다. 가운데 작은 제목은 큰 제목이 가려졌을 때만(:2311-2318, components/nav-title.tsx).
  - 하단 탭 `MobileTabs`(:2434-2546): `fixed bottom-0 pb-(--tab-bar-gap)` 떠 있는 알약, 칸 `h-[52px]`, 이름 `text-[10px]`, `desk:hidden`, 이름표 shell-tabbar. 토큰 `--tab-bar-gap = max(env(safe-area-inset-bottom) - 0.8125rem, 0.75rem)`, `--tab-bar-top = gap + 3.875rem`(globals.css:215-216). **입력칸에 초점이 가면 손가락 화면에서 탭을 숨긴다**(globals.css:2768-2787).
② **(session) 틀** app/(session)/layout.tsx — 막대 · 탭 없음, `requireUser`(:34), viewport 에 `interactiveWidget: 'resizes-content'`(:26, 크롬만 듣는다), **`<div data-safe-area className="flex h-[var(--vvh,100dvh)] flex-col bg-page">`(:58)** — 화면 높이를 못박고 자판이 뜨면 `--vvh` 를 따른다. 안의 화면이 시계 · 홈 막대를 스스로 비운다: 머리 막대 `box-content flex h-12 … pt-[env(safe-area-inset-top)]`(app/(session)/velocity/velocity-screen.tsx:2176-2185 — h-12 안에 여백을 넣으면 찌그러진다), 바닥 단추 줄 `pb-[max(0.75rem,env(safe-area-inset-bottom))]`(components/velocity/setup-steps.tsx:74). PC 에서는 폰 모양 틀 `ui-chrome … desk:w-[24.375rem] desk:h-[calc(100dvh-2rem)] desk:max-h-[52.75rem] desk:rounded-[2.5rem] desk:border-[6px]`(velocity-screen.tsx:2105, velocity-home.tsx:59) — `ui-chrome` 이 PC 의 작아진 글자 · 간격 기준을 되돌려 폰 크기를 지킨다(globals.css:235-245).
③ **틀 없음(로그인 · 약관 · 오류)** — app/login/page.tsx:34 `main` 이 `min-h-[calc(100dvh-env(safe-area-inset-top)-env(safe-area-inset-bottom))] items-center … max-md:items-stretch`. `data-safe-area` 가 없으므로 앱에서는 globals.css:2650 이 body 에 위아래 여백을 주고 시계 자리를 덮는다. app/(legal)/layout.tsx:20 도 같은 식(앱에서는 바닥글 숨김 :37, 로고 링크 죽임 :25).

### 4. 지금 회원가입(app/login/auth-form.tsx, 1,437줄)
- `/signup` 주소는 없다. `AuthForm`(:1413-1437) 이 `mode` 상태로 로그인 ↔ 가입을 바꾼다(주소 안 바뀜). 앱 시작 주소 `/today` → `requireUser` 가 `/login` 으로(lib/dal.ts:58-72). 가입 성공은 `app/actions/auth.ts:55 signup` → `:186 redirect('/today')`.
- `SignupWizard`(:853): 단계 표 `STEPS`(:406-451) 일곱 — basic(email · nickname · birthDate · sex) → password → terms → body(throwingHand · heightCm) → pitching(baselineFreq · Volume · Intensity) → weight(baselineWorkoutFreq · trainingLevel) → league(competitionLevel). **한 `<form>` 안에 일곱 판을 다 그려 두고 지금 것만 보인다**(`panel` :1056-1060, `hidden` + `motion-safe:animate-step-next/back` — globals.css:1216-1234, 340ms · 28px 밀려 들어옴). 단계 넘김은 `next()`(:981-1003, `checkStep` 클라이언트 검증 :476 + 첫 단계에서 `checkSignupEmail` 미리 확인) · `back()`(:1005). 서버가 막으면 `AuthState.field` 로 그 칸의 단계로 되돌아감(`stepOfField` :457, :913-920). 신호 끊김은 `guardFormAction(signup, { field })`(:866-869, lib/action-offline.ts:27). 값 유지는 `kept(before, name)`(lib/form-values.ts) + 비밀번호 · 동의 · 생년월일은 상태로(:884-895, React 가 action 뒤 폼을 되돌리는 탓). Enter 는 다음 칸 → 다음 단계(:1029-1043).
- 틀 `AuthCard`(:80-166): 휴대폰 = 세로 한 줄(제목 위 · 칸 가운데 flex-1 · 단추 줄 밑, 테두리 없음), `md+` = 28px 둥근 카드 두 칸(왼쪽 제목 · 오른쪽 칸 · 오른쪽 아래 단추). 진행은 카드 맨 위 4px 막대(:113-122, width %) + '3 / 7' 글자(:155-159). 단추 줄 [로그인하기|이전] [다음|가입하고 시작하기](:1075-1100, `Button min-w-28`). 로고 링크는 앱에서 죽임(:130).
- 선택지 `Choices`(:597-657): 라디오 `sr-only` + 칩(`rounded-xl border bg-surface-2 px-4 py-2.5 text-sm`) 또는 2열 목록(이름 + desc). 생년월일 `BirthDateField`(:728-845): 단추 + `MiniCalendar` 를 body 에 포털로 띄움(휠 피커 아님). 소속 `LevelChoices`(components/level-choices.tsx:25, 생년월일에 따라 고를 수 있는 칸이 바뀜). 약관은 `LegalSheet`(Modal, :1402-1408). 입력칸 `inputLarge = 'py-3.5 text-[15px]'`(:53) — 손가락 화면에선 CSS 가 16px 로 올린다. `short:`(세로 ≤700px, globals.css:27-31) 로 여백을 줄여 한 화면에 들어온다.

### 5. 자판 · 안전 영역 · 뒤로 · 전환 · 크기 — 지켜야 할 규칙과 그 자리
- **자판**: `components/viewport-vars.tsx:22-35` 가 visualViewport 로 `<html>` 에 `--kb`(가린 높이) · `--vvh`(보이는 높이) · `[data-keyboard]` 를 단다(120px 넘게 줄었을 때만). 앱은 자판 위 '⌃ ⌄ 완료' 막대를 없앴고(MainViewController.swift:33-35) 숫자 자판에 닫기가 없어 **화면을 끌면 내려간다**(viewport-vars.tsx:51-73, 앱만). 바닥에 붙는 단추 · 시트는 `bottom: var(--kb,0px)`, 틀은 `height: var(--vvh,100dvh)`. 아이폰은 `interactiveWidget` 을 무시한다.
- **16px**: globals.css:2557-2583 `@media (pointer: coarse)` 가 `text-lg` 이상이 아닌 모든 input · textarea · select 를 16px 로(사파리 확대 방지, @layer 밖이라 유틸보다 세다). 새 입력칸은 그냥 만들면 된다.
- **안전 영역 계약**: 틀이 `env(safe-area-inset-*)` 를 스스로 비우면 `data-safe-area` 를 단다(globals.css:2649-2653) — 안 달면 여백이 두 번. 머리 막대는 `box-content h-12 pt-[env(safe-area-inset-top)]`(velocity-screen.tsx:2179), 바닥은 `pb-[max(…,env(safe-area-inset-bottom))]`(setup-steps.tsx:74), 시트 안은 `pb-[calc(1.25rem+env(safe-area-inset-bottom))]`(components/modal.tsx:404). 높이는 `dvh`(100vh 금지).
- **뒤로**: `lib/nav-state.ts` 가 지나온 주소(:16-40) · 막대의 제목/뒤로(:53-96) · 방향(:117 `data-nav`)을 든다. `goBack`(back-link.tsx:25-34) = 앞 화면이 목적지면 `router.back()`, 아니면 `router.replace`. `BackLink`(:50-74) 는 휴대폰에서 본문에선 숨고 상단 막대가 대신 그린다(`desk:inline-flex`). 앱은 화면 왼쪽 끝 밀기로 뒤로가 된다(MainViewController.swift:30-32 `allowsBackForwardNavigationGestures`) → `popstate` → nav-motion.tsx:68 이 `markBackPressed` 가 없으면 `none`(아이폰이 이미 움직였으니 또 안 움직임).
- **전환**: `components/nav-motion.tsx` 가 링크 클릭을 붙잡기 단계에서 보고 `push`(main 안) · `fade`(막대 · 탭) · 링크 제 `data-nav`(none · fade) 를 단다. CSS 는 globals.css:872-1007(push 340ms 오른쪽에서, pop 300ms 오른쪽으로, none/없음 = 곧장). `MainTransition`(components/main-transition.tsx:50-66) 은 **(app) 의 `<main>` 만** 감싼다 — `/login` · `(session)` 은 전환 밖이라 밀기 연출이 없다. 한 화면 안 단계 넘김은 `animate-step-next/back`(globals.css:1216-1234). 팝업(/pitch-log/<날짜>)으로 가는 링크는 `transitionTypes={OPEN_POPUP_TYPES}`(lib/transition-types.ts:30).
- **크기**: 휴대폰 글자 `text-sm` 15 · `text-base` 17(globals.css:190-191), 큰 제목 `page-title` 34px / PC 24px(:1088-1095), `.text-heading` 800(:620-624), 모서리 휴대폰 크게(:203-209). PC(`desk`, :15-19 = 1024px↑ 또는 576px↑ + 마우스; JS 는 lib/nav.ts:223 `DESK_MEDIA`)는 :220-249 에서 글자 · `--spacing 0.2rem`(단추 40→32) · 모서리를 되돌린다 — 폰 크기를 지키려면 `ui-chrome`. 누르는 자리: Button `rounded-full desk:rounded-xl px-5 py-3`(components/ui.tsx:150-161), 큰 단추 `h-12`(components/velocity/kit.tsx:130, setup-steps.tsx:81-106 PrimaryButton), 칩 `min-h-10`(kit.tsx:125-127 CHIP_BASE), 목록 줄 56, 닫기 ✕ 44(modal.tsx:370-371), 뒤로 `min-h-11`(app-shell.tsx:2303), 체크 줄 `min-h-11`(auth-form.tsx:233). `text-[10px]` 는 손가락 화면에서 11px 로(globals.css:2742-2749).
- **시트**: `Modal`(components/modal.tsx:77) 은 `<dialog data-sheet>` — 휴대폰(globals.css:2162-2177) 에서 아래에서 380ms 올라오고 손잡이 · 제목 줄을 끌어내려 닫는다(modal.tsx:181-201), PC 는 가운데 창(누른 자리에서 날아옴 `origin`). 열린 동안 `html:has(dialog:modal){overflow:hidden}`(globals.css:2762-2765). `<dialog>` 는 열릴 때 ✕ 에 초점을 줘 `autoFocus` 가 덮인다(80ms 뒤 옮김).
- **떨림 · 누름**: 라디오 · 체크 · select · `role=radio|tab|switch` 는 저절로 '톡'(components/haptic-feedback.tsx:7-30, hover:none 만), 빼려면 `data-haptic="none"`. 누름 옅어짐은 저절로(press-feedback, `data-press-none`).
- **첫 화면 차례**: 웹은 `AppSplash`(components/app-splash.tsx, 문서당 한 번 :22) → `CheckinGate` 가 SPLASH_END 를 기다렸다 뜬다(components/checkin-gate.tsx:281-284). 관문 조건은 '오늘이 checkedDays 에 없음'(:218-223) — 가입 직후 `/today` 로 보내면 새 사용자가 보는 첫 장면이 체크인 창이다. 앱은 Swift 연출 판이 대신.

**그대로 쓸 수 있는 것**
- 한 화면 한 질문 틀: components/velocity/setup-steps.tsx:45-79 `StepShell`(StepBar + 큰 제목 h2 text-2xl + 회색 부제 + 굴러가는 본문 + 바닥 단추 줄 pb-[max(0.75rem,env(safe-area-inset-bottom))]) — 인아웃의 '진행 막대 · 제목 · 부제 · 바닥 다음' 그대로
- 진행 막대: components/velocity/kit.tsx:18-37 `StepBar`(칸 단위) · 연속 막대는 app/login/auth-form.tsx:113-122(width % + 500ms 전환)
- 큰 그림 카드 선택지: components/velocity/setup-art.tsx:105-165 `OptionCards`(role=radio 단추, 그림 칸 + 이름 + 설명 + '이럴 때 ·', 1·2열, 고르면 border-sky ring) — 인아웃 캐릭터 카드의 가장 가까운 부품. 지난 설정 요약 `SetupSummaryRow` :171
- 바닥 큰 단추: components/velocity/setup-steps.tsx:81-106 `PrimaryButton`(h-12 flex-1 rounded-xl, tone sky|quiet, disabled 흐림) · components/velocity/kit.tsx:130-132 `BigButton`(h-12) · components/ui.tsx:150-161 `Button`(휴대폰 알약 · PC rounded-xl)
- 칩 · 여러 개 고르기: app/(app)/nutrition/goal-sheet.tsx:940-968 `ChoiceChips`(라디오/체크 sr-only + 알약 칩 min-h-10, 다시 누르면 풀림) · components/velocity/kit.tsx:125-127 `CHIP_BASE`/`CHIP_ON` · :137 `Chips`
- 아래 시트(격려 · 설명 시트): components/modal.tsx:77 `Modal` + :43 `useModalState`(휴대폰 data-sheet 올라옴 · 끌어내려 닫기 · ✕ 44px · 바닥 safe-area 여백), 가입 화면에서 이미 쓰는 예 `LegalSheet`(components/legal-sheet.tsx:34, auth-form.tsx:1402-1408)
- 폰 틀(PC 에서 폰 모양): app/(session)/velocity/velocity-home.tsx:59 · velocity-screen.tsx:2105 의 `ui-chrome relative flex min-h-0 flex-1 flex-col overflow-hidden bg-page desk:mx-auto desk:my-4 desk:h-[calc(100dvh-2rem)] desk:max-h-[52.75rem] desk:w-[24.375rem] desk:rounded-[2.5rem] desk:border-[6px] desk:border-ink/85 desk:shadow-2xl`
- 전체 화면 틀(막대 없음 · 자판 따라 줄어듦): app/(session)/layout.tsx:58 `<div data-safe-area className="flex h-[var(--vvh,100dvh)] flex-col bg-page">` + viewport :15-27 — 온보딩 전용 그룹을 만들 때 그대로 복제
- 머리 막대(시계 자리 포함): app/(session)/velocity/velocity-screen.tsx:2179 `box-content flex h-12 shrink-0 items-center justify-between border-b border-line bg-surface px-2 pt-[env(safe-area-inset-top)]` + 뒤로 단추 :2181-2185(h-10 text-sky ChevronLeft)
- 단계 넘김 애니메이션: app/globals.css:1216-1234 `animate-step-next` · `animate-step-back`(340ms, 28px) — 쓰는 쪽에서 `motion-safe:` 붙임, 예 auth-form.tsx:1052-1060 `panel()`
- 단계형 폼 뼈대(검증 · 되돌림 · 값 유지 · 신호 끊김): app/login/auth-form.tsx:853-1100 `SignupWizard` — `STEPS`(:406) · `checkStep`(:476) · `stepOfField`(:457) · `next/back/allGood`(:981-1027) · Enter 처리(:1029-1043) · 초점 옮기기(:936-973) · `guardFormAction`(lib/action-offline.ts:27) · `kept`(lib/form-values.ts) · 서버 `signup`/`checkSignupEmail`(app/actions/auth.ts:38 · 55)
- 생년월일 → 소속 연동 칸: components/level-choices.tsx:25 `LevelChoices`(birthDate 로 고를 수 있는 칸 제한 · 추천) — '답이 다음 화면을 바꾼다'의 기존 예
- 자판 변수: components/viewport-vars.tsx(`--kb` · `--vvh` · `[data-keyboard]`) — 바닥 단추 `bottom: var(--kb,0px)`, 틀 `height: var(--vvh,100dvh)`
- 뒤로: components/back-link.tsx:25 `goBack(router, href)` · :50 `BackLink`, lib/nav-state.ts:87 `setBarBack`/:75 `setBarTitle`(상단 막대에 제목 · 뒤로 적기, (app) 안에서만 보임)
- 떨림: lib/haptics.ts `haptic('selection'|'success'|'medium')` · `buzz`; 고르개 · 라디오는 components/haptic-feedback.tsx 가 저절로
- 저장 알림 · 오류 줄: components/toast.tsx:25 `toast()`, components/error-line.tsx `ErrorLine`(뜨면 굴려 옴), components/safe-form.tsx `SafeForm`(폼 action 을 신호 끊김에서 지킴, doneToast)
- 앱 분기 도구: lib/app-env.ts:20 `isNativeUserAgent`(서버) · :29 `isNativeClient`(화면), Tailwind `in-data-[app=native]:`(예 auth-form.tsx:130), CSS `html[data-app='native']`
- 설정 목록 · 스위치(요약 카드 · '나중에 바꾸기'용): components/settings-list.tsx:15 `ListGroup` · :38 `ListRow` · :62 `SelectRow`, components/switch.tsx:26 `Switch` · :59 `SwitchRow`
- 처음 쓰는 사람 카드 · 관문 패턴: app/(app)/today/first-day-card.tsx:19 `FirstDayCard`(첫 기록 전 카드), components/checkin-gate.tsx:191 `CheckinGate`(앱 앞을 막는 dialog · 건너뛰기 sessionStorage · 스플래시 뒤에 뜸 :281-299) · components/velocity/tutorial.tsx(첫 사용 다섯 장, localStorage '다시 보지 않기')

**빈 곳(인아웃과 견줘)**
- 온보딩 주소가 없다: 가입은 `/login` 안의 상태(mode)일 뿐(auth-form.tsx:1413-1437), 단계마다 주소가 바뀌지 않아 앱의 왼쪽 끝 밀기(popstate) · 브라우저 뒤로가 단계를 되돌리지 않고 화면을 통째로 떠난다. 인아웃의 ← 는 단계 뒤로다 → 단계마다 `history.pushState` + popstate 로 `back()` 을 부르거나, 단계마다 주소(/signup/<step>)를 두어야 한다. nav-motion 은 popstate 를 'none' 으로 본다(nav-motion.tsx:68)
- `/login` · 온보딩이 될 자리는 (app) 밖이라 상단 막대가 없다: ← 뒤로 · 진행 막대를 화면이 스스로 그려야 한다(velocity-screen.tsx:2179 식 머리). `BackLink`/`setBarBack` 은 (app) 의 MobileTopBar 에서만 보인다
- 한 화면 한 질문이 아니다: 지금 일곱 단계가 각각 2~4칸(STEPS :406-451)이고 선택지는 작은 칩(Choices :597)이며 고르면 바로 넘어가지 않고 '다음'이 늘 활성(검증은 누를 때 :981). 인아웃식은 큰 카드(OptionCards 꼴) + 답하기 전 '다음' 비활성(PrimaryButton disabled) + 한 질문씩
- 격려 · 설명 · 사회적 증거 시트 · 검은 바탕 화면 · 코치 고르기 · '계획 만드는 중' 진행 · 요약 카드 · 서명이 전혀 없다. 시트 부품(Modal data-sheet)만 있고 내용 · 차례가 없다. 검은 바탕 화면은 `.theme-dark + bg-black`(메모 규칙)으로
- 그 자리에서 보이는 계산이 없다: 키만 숫자로 받고(:1287-1296) 체중 · 목표 체중 · 활동량 · 속도 · 물 · 운동 종류 · 식단 스타일 · 탄단지가 가입에 없다(영양 목표 창 app/(app)/nutrition/goal-sheet.tsx 가 가입 뒤에 따로 받음). 인아웃의 '−13kg' · 'N주' · 기초대사량 · 탄단지 g 미리보기는 단계 안에서 순수 함수로 계산해 보여 줘야 한다(계산은 영양 갈래)
- 단위 토글(cm/ft · kg/lb) 없음 — lib/units.ts(readLengthUnit · toLength · toWeight, profile-form.tsx:13-30 참고)가 있으니 가입 숫자 칸에 붙일 수 있다
- 생년월일이 달력 팝오버(BirthDateField :728-845, body 포털 · 고정 296×340px)라 전체 화면 단계 틀에서 어색하고, 앱 자판 · safe-area 와 겹친다. 인아웃은 연 · 월 · 일 휠. 아이폰이면 `<input type=date>` 또는 세 칸 숫자 입력으로 바꾸는 편이 맞다
- 가입 직후 `redirect('/today')`(app/actions/auth.ts:186) → 웹은 AppSplash → 바로 CheckinGate(checkin-gate.tsx:218-223). 온보딩을 (app) 안 주소로 두면 관문 · 스플래시 · 하단 탭이 먼저 뜬다. 온보딩이 끝나기 전엔 관문을 안 띄우게(경로 또는 '온보딩 끝' 표시 — DB 칸은 다른 갈래) 하거나, 온보딩을 (session) 처럼 막대 없는 그룹에 두고 끝나면 /today 로
- 바닥 '다음' 단추가 자판 위에 붙어 있지 않다: AuthCard 의 단추 줄은 흐름 안(:154-161)이라 자판이 뜨면 굴러야 보인다. 인아웃처럼 붙이려면 틀을 `h-[var(--vvh,100dvh)]` 로 못박고 단추를 `bottom: var(--kb,0px)` 에 — 지금 /login 은 (session) 틀이 아니라 `--vvh` 를 안 쓴다
- PC 모양을 정해야 한다: 지금 가입은 PC 에서 넓은 두 칸 카드(AuthCard md:grid :125), 인아웃은 폰 전용. 폰 틀(velocity 의 ui-chrome desk:w-[24.375rem])로 갈지 두 칸 카드를 유지할지. PC `desk` 가 글자 · --spacing · 모서리를 줄이므로(globals.css:220-249) 큰 카드 · 큰 숫자는 `ui-chrome` 안에 두어야 폰 크기를 지킨다
- 전환: /login 은 MainTransition 밖이라 단계 넘김이 CSS `animate-step-next/back` 뿐(괜찮다). 온보딩을 여러 주소로 나눠 (app) 밖에 두면 밀기 전환이 없다 — 한 주소 + 단계 애니메이션이 가장 싸고, 주소를 나누려면 그 그룹에 ViewTransition 을 따로 달아야 한다
- 진행 막대 모양: 카드 위 4px 띠(:113-122)와 '3 / 7' 글자. 인아웃은 ← 밑의 파란 막대 하나 — StepShell 의 StepBar(칸) 또는 연속 막대 중 하나로 통일
- 앱 안에서 `data-safe-area` 없는 /login 은 body 여백으로 시계 · 홈 막대를 비운다(globals.css:2650). 온보딩 틀이 스스로 `env(safe-area-inset-*)` 를 비우면 `data-safe-area` 를 꼭 단다 — 안 달면 두 번
- 글자 크기 규칙 위반이 가입 화면에 남아 있다: `text-[15px]` · `text-[13px]`(auth-form.tsx:53 · 1392) 같은 임의 px(메모: 쓰지 않는다). 새 화면은 text-sm/base/xl 토큰으로

**위험 · 지킬 규칙**
- `mobile/` 은 김민의 앱 틀 — 건드리면 HANDOFF.md 에 적는다. 사이트만 고치면 앱은 다시 굽지 않아도 반영된다(mobile/README.md:3-6). 세로 고정(Info.plist:62-65)
- 뿌리 레이아웃 · 첫 스크립트를 고칠 때 `bullpenIntro` 'ready' 알림(lib/native-app.ts:41-50)을 지킨다 — 안 가면 앱 연출 판이 10초까지 사이트를 가린다. THEME_INIT_SCRIPT → APP_INIT_SCRIPT 순서(app/layout.tsx:89-94)도
- `data-safe-area` 계약(globals.css:2649-2664, (session)/layout.tsx:52-58, app-shell.tsx:2263-2274): 틀이 스스로 안전 영역을 비우면 표시를 달고, 머리 막대는 `box-content h-12 pt-[env(safe-area-inset-top)]`(h-12 안에 넣으면 찌그러짐). 바닥 막대 위에 띄우는 것은 막대 높이를 짐작하지 말고 위 칸 안 바닥에
- 자판: 바닥 단추 `bottom: var(--kb,0px)` · 틀 `height: var(--vvh,100dvh)`(viewport-vars.tsx), `100vh`/`min-h-screen` 금지(dvh). 아이폰은 interactiveWidget 을 무시. 앱은 자판 위 '완료' 막대가 없어(MainViewController.swift:33-35) 끌어서 내리는 것에 기댄다 — 숫자 자판 화면에 닫는 길(다음 단추가 자판 위에 보이기)을 둔다
- 입력칸 16px: globals.css:2557-2583 이 손가락 화면에서 강제한다. `text-lg` 이상 클래스를 입력칸에 쓰면 규칙에서 빠지니 큰 숫자 칸은 일부러 그렇게 쓸 때만. 입력칸에 `inputMode="numeric"|"decimal"`, 이메일 · 비밀번호엔 `noAutoFix`(auth-form.tsx:58-62)
- 누르는 자리 44/48px: 닫기 ✕ 44(modal.tsx:370), 뒤로 min-h-11, 큰 단추 h-12, 칩 min-h-10, 줄 56. 글자 11px 아래 금지, 임의 px 글자 금지, 해요체 · 줄표(—) 없이 · 짧게(메모 규칙). PC 는 `desk` 가 크기를 줄이니 폰 크기를 지킬 틀엔 `ui-chrome`
- `view-transition-name` 이 붙은 것은 전환 중 맨 위에 그려진다(열린 dialog 보다도 위). 전체를 덮는 불투명 판에 이름을 달지 말 것. 관문처럼 앞을 막는 화면은 `html[data-gate-up] *{view-transition-name:none}` 식으로 끈다(checkin-gate.tsx:123, app-splash.tsx:110-119)
- `<dialog>` 는 열릴 때 ✕ 에 초점을 줘 autoFocus 가 덮인다 → 80ms 뒤 초점. 창 잠금은 `html:has(dialog:modal)`(body 아님). 확인 창은 window.confirm 대신 components/confirm-delete.tsx `ConfirmDialog`
- React 는 form action 뒤 폼을 되돌린다 → 비밀번호 · 동의 · 날짜처럼 되돌아와도 남아야 하는 값은 상태로(auth-form.tsx:884-895), 제어 체크박스는 useLayoutEffect 로 다시 맞춤(:926-932). 서버 액션은 `guardFormAction`/`SafeForm`/`orOffline` 으로 감싼다(lib/action-offline.ts)
- 클라이언트 검증 `checkStep`(auth-form.tsx:469-580) 은 서버 `signup`(app/actions/auth.ts:55-186) · lib/profile.ts · lib/baseline.ts 와 같은 기준이어야 한다 — 서버가 막으면 `field` 로 그 단계로 돌아가는 길(:913-920)을 끊지 말 것. `checkSignupEmail` 미리 확인(:986-998)도 유지
- 가입 직후 흐름: `redirect('/today')` → requireUser(lib/dal.ts:58-72) → CheckinGate(오늘 체크인 없으면 무조건, checkin-gate.tsx:218-223) + 웹 AppSplash(문서당 한 번). 온보딩을 끼우면 이 차례와 '건너뛰기' sessionStorage(`bullpen-checkin-skip`)를 고려
- app/page.tsx:53-55 — 앱에서 `/` 는 소개 없이 /today 또는 /login 으로. `/signup`, `/onboarding` 은 지금 없고 next.config.ts:34-65 redirects(/profile · /settings → /today 등)에 안 걸리는 이름으로
- 앱 안 CSS: `html[data-app='native'] body` 가 글자 선택을 끈다(globals.css:528-535) — 고를 수 있어야 하는 글은 `.selectable`. 길게 눌러도 메뉴가 안 뜬다(:519). 튕김은 꺼져 있다(:2642) — 당겨서 새로고침은 (app) 탭 첫 화면 넷만(pull-to-refresh.tsx:9), 스크롤 칸엔 `data-no-ptr`
- 링크 방향: 본문 안 링크는 push, 밖은 fade, 같은 화면 값만 바꾸는 링크는 `data-nav="none"`(nav-motion.tsx:56-61). (app) 밖에서 /pitch-log/<날짜> 로 갈 때는 `<a>`. 자료만 새로 받을 땐 `quietRefresh(router)`
- 가로 넘침은 조용히 잘린다(html/body overflow-x: clip, globals.css:395 · 476) — 휴대폰 확인은 캡처 말고 `getBoundingClientRect().right > innerWidth` 로. 한 화면 맞추기는 1920×960 · 1536×700 · 폰 375(short: ≤700px 높이)
- DB 는 운영과 하나 — 시험용 가입을 만들지 않는다(로그인 없는 임시 경로 `app/dev-preview-*` 로 재고 지운 뒤 서버 다시 켬). 온보딩이 새 칸을 요구하면 DB 규칙(백업 → migrate diff → deploy, `prisma migrate dev` 금지)은 다른 갈래 · 김민에게 HANDOFF
- 애니메이션은 기본: 들어오기 160~200ms · 나가기 ~120ms · `motion-safe:` 로 움직임 줄이기 대응. 단계 넘김은 이미 있는 `animate-step-next/back` 을 쓴다(globals.css:1216)

---

## ③ 설계안(둘 — 심사 전)


### 안 1: 인아웃식 온보딩 · 영양 탭 설계안 (인아웃-충실 관점) — 한 화면 한 질문, 답마다 계산이 바뀐다

#### 질문 순서

| # | 화면 | 왜 | 선택지 · 입력 | 저장 | 읽는 곳 | PC | 휴대폰 · 앱 |
|---|---|---|---|---|---|---|---|
| 1 | 반가워요. 앞으로 뭐라고 부를까요? | 기록 · 추천 화면에서 이 이름으로 불러요. 나중에 내 정보에서 바꿀 수 있어요 | 글 입력칸 하나(2자 이상, FOOD_NAME_MAX 와 같은 30자 한도). 답하기 전엔 [다음] 비활성 | User.nickname(있는 칸, prisma/schema.prisma:26) | 이후 화면 제목에 들어간다(6번 '{닉네임}님, 이번 시즌 목표는 뭔가요?' · 요약 카드). 서버 검사 app/actions/auth.ts:105-111 그대로 | AuthCard 두 칸(app/login/auth-form.tsx:80-166) 오른쪽에 큰 입력칸 하나, 오른쪽 아래 [다음] | ← 뒤로 44px · 진행 막대(auth-form.tsx:113-122 width 막대) · 제목 page-title · 부제 text-sm text-muted · 입력칸(coarse 16px 자동) · 바닥 [다음] h-12 rounded-full bottom: var(--kb,0px) |
| 2 | 로그인에 쓸 이메일을 알려 주세요 | 다음을 누르면 이미 가입된 이메일인지 바로 확인해요. 끝까지 가서 막히지 않게 | 이메일 입력칸(noAutoFix, auth-form.tsx:62-66). [다음] 을 누르면 checkSignupEmail(app/actions/auth.ts:76-86) 이 돌고 '확인 중…' | User.email | 중복이면 그 자리에서 되돌림(stepOfField auth-form.tsx:457-462 의 field 'email'). 계산엔 안 쓰임(계정 열쇠) | 입력칸 하나 + 밑에 작은 안내 한 줄 | 같음. 키체인용 sr-only username 칸(auth-form.tsx:1168-1176)은 3번 비밀번호 화면과 같은 <form> 안에 그대로 둔다 |
| 3 | 비밀번호를 만들어 주세요 | 8자 이상이면 돼요. 다른 곳에서 쓰지 않는 것으로요 | 비밀번호 · 한 번 더 두 칸 + '표시' 스위치. 상태로 쥔다(React 폼 리셋 대비, auth-form.tsx:889-902) | User.password(bcrypt, auth.ts:204) | 로그인 · 세션 지문(lib/session.ts passwordFingerprint). 계산 없음 | 두 칸 세로 | 두 칸 세로, 자판 위 [다음] |
| 4 | 두 가지에 동의해 주세요 | 이용약관과 개인정보 처리방침이에요. 눌러서 내용을 볼 수 있어요 | CheckLine 둘 + '모두 동의'(auth-form.tsx:217-246 · 685-713 AgreeLine, data-sync 복원). LegalSheet(components/legal-sheet.tsx)로 본문 | 저장 안 함(서버가 'on' 만 봄, auth.ts:130-135) | 없음. 격식체 동의문은 예외 규칙대로 그대로 | 체크 줄 셋 | 체크 줄 min-h-11, 약관은 아래 시트(새 탭 금지) |
| 5 | 생년월일을 알려 주세요 | 나이에 맞는 안전한 투구수와 기초대사량을 이걸로 계산해요 | 휴대폰: SelectRow 셋(연 · 월 · 일, components/settings-list.tsx:62 — 아이폰 기본 고르개가 곧 휠). PC: BirthDateField + MiniCalendar(auth-form.tsx:728-843). 값은 'YYYY-MM-DD' hidden name=birthDate 그대로. 고르면 곧바로 성별 시트(Modal data-sheet)가 올라옴: '성별을 골라 주세요 · 기초대사량 식의 상수가 달라요' 남 · 여 카드 둘(SEX_OPTIONS lib/profile.ts:71) | User.birthDate(@db.Date) · User.sex('M'｜'F') | ageOn(lib/nutrition/targets.ts:130) → ageBand(lib/nutrition/age.ts:120) 가 이후 모든 선택지를 가른다: 6번 목표 카드(어린이 감량 · 체지방 숨김 AGE_RULES.goalDelta), 16번 속도(paceChoices age.ts:226), 10번 목표 체중 범위(targetAllowed weight-goal.ts:440), 21번 식단 계획(저탄수는 성인만), 단백질 범위(effectiveProtein age.ts:138). 성별 → basalKcal(targets.ts:144) +5/−161. 투구수 한도 dailyPitchCap(lib/report/plan.ts) · 소속 levelFit(lib/baseline.ts:166) | 달력 팝오버 + 성별은 가운데 창 | SelectRow 셋 한 묶음(ListGroup) → 성별 아래 시트, 고르면 시트가 닫히며 다음 화면 |
| 6 | {닉네임}님, 이번 시즌 목표는 뭔가요? | 목표에 따라 하루 칼로리와 단백질이 달라져요. 나중에 영양 탭에서 바꿀 수 있어요 | 큰 카드 5(RadioGroup desc 카드 components/choice-inputs.tsx:76 + 아이콘 칸): 증량(몸을 키워요 · 하루 +300kcal) · 유지(지금 몸으로 시즌을 버텨요) · 감량(천천히 빼요) · 근육량 늘리기(증량보다 천천히, 단백질을 높여요) · 체지방 줄이기(단백질을 높여 몸을 다듬어요). 어린이(child): 감량 · 체지방 숨김. 성장기(teen): 감량 '하루 −200kcal' · 체지방 줄이기는 '칼로리는 유지, 단백질만 높여요' 로 글이 바뀜 | NutritionProfile.goalKind(새 칸, 5종 원답) + NutritionProfile.goal(있는 칸, 3종으로 접은 값) + NutritionProfile.proteinPerKg(있는 칸, 매핑값) | lib/nutrition/onboarding.ts(새, 순수) foldGoal(goalKind, age) → {goal, proteinPerKg}: muscle → gain + proteinChoices 끝값(성인 2.2 · teen 1.8 · child 1.5) · lean → 성인 lose + 2.2, teen · child 는 maintain + 끝값. computeTargets(targets.ts:157) 의 delta(paceDelta age.ts:213) · protein 이 바뀜 → 홈 링 · 탭 · 식단 짜기(buildMealPlan PlanInput.goal) · 조언(advice-input body.goal). 7번 제목 글('{목표}하려는 이유')과 16번 속도 선택지(paceChoices goal)도 따라감 | 2열 카드 격자(md:grid-cols-2), 고르면 border-sky bg-sky/10 + 오른쪽 Check | 한 줄 한 카드(cardBase), 왼쪽 lucide 아이콘 칸 bg-sky-tint/60 + 제목 + 설명 한 줄 + 오른쪽 ✓. 고르면 haptic 저절로, [다음] 활성 |
| 7 | {목표}하려는 이유는 뭔가요? | 이유에 맞춰 시즌 단계와 기간을 미리 골라 드려요 | 카드 4: 구속 · 힘을 올리고 싶어요 / 시즌 내내 몸을 지키고 싶어요 / 대회 · 트라이아웃이 있어요 / 부상 뒤 복귀 중이에요. 제목의 {목표}는 6번 답(증량 → '증량하려는', 근육량 → '근육량을 늘리려는', 유지 → '지금 몸을 유지하려는') | NutritionProfile.goalReason(새 칸: 'power'｜'season'｜'event'｜'rehab') | 20번 시즌 단계 화면의 추천 칩(rehab → 'rehab', event → 'pre', season → 'in', power → 'off') 과 16번 속도 화면에 '언제까지' 칩(event 일 때만 PERIOD_WEEKS 보임 → DietPrefs.goalEndDate). 요약 카드 · 영양 탭 '나의 목표' 카드의 동기 한 줄. 목표 구속은 계산에 안 넣는다(advice.ts 규칙) — 글만 | 2열 카드 | 한 줄 한 카드 |
| 8 | 식단 관리를 해 본 적 있나요? | 처음이면 화면을 더 단순하게 열어 드려요 | 카드 3: 처음이에요 / 몇 번 해 봤는데 잘 안 됐어요 / 꾸준히 하고 있어요. 고르면 격려 시트(끼움 화면 참고) 뒤 [다음] | NutritionProfile.dietExperience(새 칸: 'first'｜'tried'｜'steady') | 영양 탭 '나의 하루' 카드의 기본 보기(first · tried → '한눈에', steady → '자세히' — localStorage 가 비었을 때의 시작값) · 끼니 구성 기본값(first → '3+1' 그대로, steady → 저장된 취향 우선). 식단 짜기 까닭 줄 첫날 글('처음이라 익숙한 음식 위주로 짰어요' — meal-plan.ts reasons 는 클라우드 가지 파일이라 화면 PlanCard 에서 한 줄만 더함) | 2열 카드 → 가운데 창 격려 | 한 줄 한 카드 → 아래 시트 격려 |
| 9 | 맞춤 계획을 만들게요. 먼저 키를 알려 주세요 | 기초대사량과 감량 목표 체중의 바닥(BMI 20)을 키로 계산해요 | Segmented w-36 [cm ｜ inch](components/unit-toggle.tsx:92-101 모양, lib/units LENGTH_UNITS 에 ft 는 없음) + 큰 숫자 칸 text-numeric text-4xl inputMode=decimal. hidden name=heightCm 는 늘 cm 정수(profile-form.tsx:120-165 draft 패턴). 100~250(lib/profile.ts MIN/MAX_HEIGHT_CM) | User.heightCm(있는 칸) | basalKcal(targets.ts:144) 의 6.25·H · targetRange BMI 바닥(weight-goal.ts:456) · 포즈 cm/px(lib/pose/measure.ts). 10번 화면이 이 값으로 목표 체중 범위를 보인다 | 토글 + 큰 숫자 한 줄, 오른쪽 'cm' | 같음, 숫자 자판, 자판 위 [다음] |
| 10 | 지금 체중과 목표 체중을 알려 주세요 | 단백질은 체중 1kg 당 {proteinPerKg}g 으로, 목표까지 몇 주 걸리는지도 여기서 계산해요 | Segmented [kg ｜ lb] + 두 칸 '시작 체중' · '목표 체중'(유지 · 어린이 · 성장기 감량은 목표 칸 숨김 — targetAllowed). 적으면 밑에 즉시 '지금보다 {−13}kg {감량}' + '정할 수 있는 범위 {min}~{max}kg'(targetRange, 밖이면 ErrorLine). 20~200kg(lib/profile.ts, setWeight 의 250 과 하나로 맞춤) | User.weightKg(있는 칸) + DailyNutrition.weightKg 오늘 줄(있는 칸 — 체중 흐름의 첫 점) + NutritionProfile.targetWeightKg(있는 칸) | computeTargets 의 weightKg(assumed 'weight' 사라짐) · proteinAuto · 지방 바닥 0.8g/kg · burn.ts kcalFor 의 W · recentWeightKg(load.ts:198)가 오늘 줄을 읽어 홈 · 탭 · 달력 목표가 같아짐 · checkTargetWeight(weight-goal.ts:488) · etaWeeks(weight-goal.ts:428) 가 16번 속도 화면의 'N주'. 단백질 g 미리보기(부제의 {proteinPerKg} 는 6번 답 반영) | 토글 + 두 칸 가로, 밑에 계산 줄 Expand(components/expand.tsx) | 두 칸 세로, 계산 줄이 grid-rows 펴짐 + haptic('success') |
| 11 | 어느 손으로 던지세요? | 폼 분석 · 암케어 · 구속 측정이 보는 팔을 정해요 | 카드 3: 우투 · 좌투 · 양투(THROWING_HANDS lib/baseline.ts) | User.throwingHand | training/armcare-section.tsx throwingSide · mechanics-section.tsx · velocity/measure/page.tsx(구종 전형값 거울 session-types.ts). 영양 계산엔 안 들어감(투수 앱 필수 답) | 3열 카드 | 한 줄 한 카드 |
| 12 | 평소 얼마나 던지시나요? | 첫날부터 투구 부하 지수를 보여 드리려고요. 골라 보면 밑에 숫자가 바로 바뀌어요 | Segmented 세 줄: 일주일 횟수(주 0~1 · 2~3 · 4회 이상) · 한 번에(30구 이하 · 30~60 · 60구 이상) · 강도(캐치볼 위주 · 절반 전력 · 전력 투구 위주)(BASELINE_* lib/baseline.ts:19-36). 셋 다 고르면 '하루 평균 부하 {N}' 숫자가 count-up | User.baselineFreq · baselineVolume · baselineIntensity | estimateDailyLoad(lib/baseline.ts:293) → lib/report/gather.ts baselineDailyLoad(ACWR 씨앗) · coach/overview · armcare/today. 영양: pitchingBurn 은 기록에서 셈하니 여기 답은 18번 활동량 화면의 안내 글('던지기 · 웨이트는 기록에서 따로 더해요')에만 비친다 | 세 줄 Segmented + 오른쪽 결과 카드 | 세 줄 세로, 결과 숫자 text-numeric 밑에 |
| 13 | 웨이트는 얼마나 하시나요? | 운동 부하 지수와 경력에 맞는 운동을 고르려고요 | Segmented 한 줄(거의 안 함 · 주 1~2 · 3~4 · 5회 이상) + 경력 카드 4(TRAINING_LEVELS lib/report/personalize.ts:28-56 name+desc). 둘 다 고르면 '운동 부하 {N}' | User.baselineWorkoutFreq · User.trainingLevel | estimateTrainingDailyLoad(lib/baseline.ts:320) → lib/report/training-acwr.ts · filterByLevel(personalize.ts) 운동 거름. 김민 영역 값이라 저장 길(readTrainingProfile auth.ts:191) 그대로 | Segmented + 2열 카드 | Segmented + 한 줄 한 카드 |
| 14 | 그 밖에 하는 운동이 있나요? 여러 개 골라도 돼요 | 앱에 안 적는 운동은 평소 움직임으로 더해요. 기록하는 트레이닝 · 투구는 날마다 따로 계산돼요 | ✓ 칩 여러 개(ChoiceChips multiple → components/choice-chips.tsx 로 공용화): 달리기 · 수영 · 자전거 · 축구 · 농구 · 등산 · 요가 · 필라테스 · 없음. 밑에 '건너뛰기' TextButton. 고른 뒤 설명 시트(끼움 참고: 소모 칼로리) | NutritionProfile.activityKinds(새 칸 String[] @default([])) | 18번 활동량 화면의 '추천' 칩: 유산소 · 구기(달리기 · 수영 · 자전거 · 축구 · 농구 · 등산) 2개 이상 → 'high', 1개 → 'mid', 없음 → 투구 횟수 '주 4회 이상'이면 'mid' 아니면 'low'(onboarding.ts suggestActivity). 요약 카드 한 줄. burn.ts 는 기록 기반이라 직접 안 더함 | 칩 흐름 배치, 건너뛰기 글자 단추 | 칩 min-h-10 알약 두세 줄, 바닥 [다음] 위에 '건너뛰기' |
| 15 | 운동을 뺀 평소 움직임은 어느 정도인가요? | 기초대사량에 곱하는 수예요. 던지기 · 웨이트는 기록에서 따로 더하니 여기선 빼고 골라요 | 카드 5(제목 + 설명): 매우 적음(거의 앉아 지내요 · 팀 훈련 없음) · 적음(학교 · 일 외엔 움직임이 적어요) · 보통(주 3~4일 팀 훈련) · 많음(거의 매일 팀 훈련) · 매우 많음(하루 종일 훈련하거나 몸 쓰는 일을 해요). 14번 답으로 고른 카드에 '추천' 배지. 고르면 밑에 '활동대사량 {bmr×factor}kcal' 즉시 | NutritionProfile.activity(있는 칸, 값 5종: 'very-low'｜'low'｜'mid'｜'high'｜'very-high') | ACTIVITIES(lib/nutrition/meta.ts:63) 에 두 칸 추가(기존 세 키 값 그대로) → computeTargets base = round10(bmr × factor + delta) + adjust(targets.ts:185) · 새 Targets.tdee. toProfile(load.ts:171) isActivityKey 가 새 키를 알아야 'mid' 로 안 뭉개짐 | 한 줄 한 카드 세로(설명이 길어 2열 안 함) + 오른쪽 숫자 | 한 줄 한 카드, 숫자 줄 밑에 |
| 16 | {목표 체중}kg 에 얼마나 빨리 닿고 싶나요? | 속도마다 하루 칼로리가 달라요. 몸에 무리 없는 범위 안에서만 골라요 | 카드 안 큰 숫자 '약 {N}주면 닿아요'(etaWeeks) + PaceSlider(새 부품, .range + 눈금 2~3개: 천천히 · 추천 · 조금 빠르게 — paceChoices(age, goal, refKg) 가 주는 칸만, 성장기 1칸은 슬라이더 대신 글 한 줄, 어린이 · 유지는 이 화면 건너뜀). 밑에 '하루 {±N}kcal'(paceDelta). 7번이 'event' 면 '언제까지' 칩(PERIOD_WEEKS 4~24주, goal-sheet.tsx pickPeriod 로직 이동) 이 추가로 보여 고르면 속도가 따라 맞춰짐 | NutritionProfile.weeklyRateKg(있는 칸, 기본 속도는 null — storedRate age.ts:202) + NutritionProfile.goalEndDate(있는 칸, event 일 때만) | paceDelta(age.ts:213) → base kcal · Targets.paceKg · 체중 흐름 판정 weightGoal(weight-goal.ts:580) 의 계획 속도 · 24번 체중 예상 곡선. 서버는 saveNutritionProfile 과 같은 검사(paceChoices 안만) | 카드 + 슬라이더 가로, 눈금 라벨 text-xs | 카드 전체 폭, 손잡이 28px(globals .range coarse), 값 바뀔 때 haptic('selection') |
| 17 | 하루에 물은 얼마나 마시나요? | 던지는 날과 더운 날 수분 안내를 맞춰 드려요 | 카드 3: 2L 이상 · 2L 미만 · 잘 모르겠어요 → 설명 시트(끼움 참고) | NutritionProfile.waterHabit(새 칸: 'over2'｜'under2'｜'unknown') | throwDayGuide(lib/nutrition/guide.ts:180) notes 에 한 줄(under2 · unknown: '던지는 날엔 물을 평소보다 500ml 더 챙기세요' — GuideBody 에 선택 칸 waterHabit? 더함, 탭 GuideCard 만 읽음) · 식단 짜기 '더운 날 야외' 칩 기본 켬 여부(PlanCard hot 초기값: under2 면 더운 날 안내 글 한 줄). 물 기록 기능은 되살리지 않는다(로드맵 '하지 않을 것') | 3열 카드 → 가운데 창 | 한 줄 한 카드 → 아래 시트 |
| 18 | 어디서 야구를 하시나요? | 생년월일에 맞는 소속만 고를 수 있어요. 또래와 견주는 기능에 써요 | LevelChoices(components/level-choices.tsx, 생년월일로 막힘 · 미리 골라짐 · 학년 안내 글 fade-in) | User.competitionLevel | 지금은 계산이 안 읽음(lib/baseline.ts:74-83). 이 설계에서 잇는 곳: 영양 탭 '나의 목표' 카드 머리글('고등학교 투수 기준') · 20번 시즌 단계 추천(초등 · 중등은 'off' 기본). 그래도 약하면 openQuestions 의 '소속을 뒤로 미룰지' | 칩 2열 | 칩 알약 |
| 19 | 지금은 시즌 중 어느 때인가요? | 식단을 짤 때 탄수화물과 회복의 비중을 바꿔요 | 카드 4(SEASON_PHASES lib/nutrition/diet-prefs.ts:11 label+hint): 비시즌 · 시즌 준비 · 시즌 중 · 재활. 7번 답으로 '추천' 배지 | NutritionProfile.seasonPhase(있는 칸) | buildMealPlan styleScore(meal-plan.ts:425, 시즌 중 한식 +0.5) · 틀 꼬리표 · PlanCard 오늘 상태 줄 · app/(app)/training/page.tsx:253 도 읽음 | 2열 카드 | 한 줄 한 카드 |
| 20 | 추천 계획이 완성됐어요. 약 {N}주면 목표에 닿아요 | 숫자를 눌러 바로 고칠 수 있어요. 운동한 날은 쓴 만큼 저절로 더해져요 | Stat 셋: 기초대사량 {bmr}kcal · 활동대사량 {tdee}kcal · 목표 칼로리 {base}kcal ✎(누르면 숫자 칸, 1,000~6,000 → kcalTarget). 밑에 체중 예상 곡선(새 ExpectedWeightChart: 지금 → 목표, 주마다 ∓pace, 목표 점선, smoothPath + trend-draw). 유지면 '지금 몸을 지켜요' 와 곡선 없음. 전부 클라이언트 computeTargets(draft, body, 0) | NutritionProfile.kcalTarget(있는 칸, ✎ 로 고쳤을 때만) | computeTargets manual=true 면 adjust 0 · 속도는 비교에만(goal-sheet paceHint 와 같은 글). Targets.tdee(새 칸) 는 round10(bmr × factor) | 가로 Stat 3칸 + 곡선 카드 | Stat 세로 둘 + 큰 목표 숫자, rise-in 차례(done-client 패턴) |
| 21 | 마지막으로 식단 계획을 골라 주세요 | 계획에 맞춰 탄수화물 · 단백질 · 지방 양을 계산해요 | 시트(Modal) 안 카드 4: 균형(탄단지를 고르게) · 운동(단백질을 높여 근육을 만들어요) · 저탄수(지방을 늘리고 탄수화물을 줄여요 · 성인만, 던지는 날은 가이드가 탄수화물을 더 권해요) · 채식(고기 · 생선 대신 채소와 콩류 위주예요). 어린이 · 성장기는 저탄수 숨김 | NutritionProfile.macroPreset(새 칸: 'balanced'｜'athlete'｜'lowcarb'｜'plant') + 채식이면 NutritionProfile.avoidFoods 에 beef · pork · chicken · seafood 자동 추가(있는 칸) + 운동 · 채식은 proteinPerKg 를 나이 범위 끝값으로 | computeTargets 지방 비율 FAT_SHARE[preset](balanced · athlete · plant 0.25, lowcarb 0.35) → fat · carbs. 채식은 meal-plan CONTAINS 꼬리표로 음식 빼기(avoid). 23번 탄단지 화면의 시작값 | 가운데 창 2열 카드 | 아래 시트, 한 줄 한 카드 |
| 22 | 추천 탄단지 계산이 끝났어요 | g 을 직접 바꿀 수 있어요. 바꾸면 다른 영양소와 비율이 따라 움직여요 | ListGroup 세 줄(ROW_INPUT 숫자 칸): 탄수화물 {C}g ×4 = {kcal} {%} / 단백질 {P}g ×4 … / 지방 {F}g ×9 … 밑에 '목표 칼로리 {base}kcal'. 한 칸을 고치면 kcal 이 주인: 탄수를 고치면 지방이, 지방을 고치면 탄수가, 단백질을 고치면 탄수가 받아 합이 base 와 같게(지방은 0.8g/kg 바닥, 탄수 0 바닥, 안 되면 ErrorLine). 저장 중 표시는 점 넷 대신 '저장됨' toast | NutritionProfile.carbTargetG · fatTargetG(새 칸 Float?, null = 계산) · proteinTargetG(있는 칸) | computeTargets: protein = proteinTargetG ?? auto, fat = fatTargetG ?? max(kcal × share/9, 0.8W), carbs = carbTargetG !== null ? carbTargetG + round(burn/4) : 나머지(운동 몫은 탄수화물로). 서버 saveNutritionProfile 검사: 4P + 4C + 9F 가 base 의 ±5% 안. 홈 링 · 탭 · 식단 짜기(targets.protein) · 끼니 단백질(mealProteinGoal) 모두 이 값 | 세 줄 + 합계 줄, 오른쪽에 % 알약 | 세 줄 세로(ListGroup), 입력칸 16px, 합계 줄 sticky |
| 23 | 못 먹거나 안 먹는 게 있나요? 여러 개 골라도 돼요 | 식단을 짤 때 그 음식을 빼고 바꿔 넣어요 | ✓ 칩 9(AVOIDS diet-prefs.ts:48) + '없어요' · 건너뛰기. 21번 채식이면 소 · 돼지 · 닭 · 해산물이 이미 켜져 있고 끌 수 없음(설명 한 줄) | NutritionProfile.avoidFoods(있는 칸) | buildMealPlan CONTAINS 거름 · SUBSTITUTES 바꿔 넣기(meal-plan.ts · meal-templates.ts, 클라우드 가지 파일이라 꼬리표는 더하지 않음) · saveDietPrefs 가 오늘 식단에서 뺌(actions/nutrition.ts:646) | 칩 흐름 | 칩 알약 세 줄 |
| 24 | 하루를 몇 번에 나눠 먹고, 어떤 음식이 편한가요? | 끼니 구성과 음식 스타일대로 식단을 짜요 | Segmented 둘: 끼니 구성(세 끼 · 세 끼 + 간식 · 세 끼 + 간식 둘 · 두 끼 + 간식, MEAL_PATTERNS) / 음식 스타일(한식 위주 · 골고루 · 간편식 위주, DIET_STYLES). 성장기 · 어린이는 보충식품 스위치 없음(allowSupplements false 로 저장), 성인은 스위치 한 줄 '단백질 보충식품도 식단에 넣기'(상표 없음) | NutritionProfile.mealPattern · dietStyle · allowSupplements(있는 칸) | PATTERN_SHARES(meal-plan.ts 끼니 몫) · styleScore(meal-plan.ts:425) · 보충식품 틀 거름. 홈 조언의 끼니 몫 MEAL_SHARE 는 고정(홈 안 만짐) | Segmented 두 줄 + 스위치 | Segmented rounded-3xl 두 줄 + SwitchRow |

#### 끼움 화면
- [5번 뒤 · 환영 화면] 인아웃의 사회적 증거(50만 명 · 4.9점) 대신 거짓 숫자 없이 한 장: seam-hero 바탕, 제목 '{나이}세 {남 · 여} 투수에 맞춰 드릴게요', 본문 세 줄 '나이에 맞는 안전한 투구수를 지켜요 / 몸과 시즌에 맞는 칼로리 · 단백질을 계산해요 / 던지는 날엔 무엇을 언제 먹을지 알려 드려요'. 성별 · 나이가 글에 들어가는 것이 인아웃의 '답이 다음 화면에 반영' 예. [다음]
- [8번 뒤 · 격려 시트] 경험 답마다 글이 다름. 처음이에요: '처음이라 화면을 단순하게 열어 드릴게요. 먹은 것을 적지 않아도 체크인 한 번이면 오늘 할 일을 알려 드려요'. 몇 번 해 봤어요: '이번엔 숫자를 보고 가요. 체중 흐름을 2주마다 보고 하루 100kcal 씩 맞춰 드려요'(lib/nutrition/weight-goal.ts 의 실제 동작). 꾸준히 해요: '좋아요. 지금 쓰는 방식 그대로 기록하면 돼요. 목표는 언제든 영양 탭에서 바꿔요'. 그림은 setup-art 식 선 그림 하나(공 · 접시), 근거 없는 '+17%' 통계는 넣지 않음. 휴대폰 아래 시트 · PC 가운데 창, [다음]
- [14번 뒤 · 설명 시트] '트레이닝과 투구를 기록하면 쓴 칼로리가 저절로 더해져요'. 보기 한 줄: '{체중}kg 이 불펜 40구를 던지면 약 {pitchingBurn('불펜',40,6,W)}kcal, 트레이닝 60분이면 약 {trainingBurn(3600,W)}kcal' (lib/nutrition/burn.ts 로 그 자리에서 셈). 밑에 '그래서 다음 화면의 평소 움직임에서는 운동을 빼고 골라요'. [알겠어요]
- [17번 뒤 · 설명 시트] '영양 탭에서 던지는 날 가이드가 떠요'. 글: '등판 전날 저녁 · 던지는 날 점심 · 던진 뒤 회복식을 체중에 맞춰 알려 드려요. 물은 {2L 미만 · 잘 모름이면} 던지는 날 500ml 더 챙기라고 적어 둘게요'. [다음]
- [19번 뒤 · 계획 만드는 중] 전체 덮개(fixed inset-0 bg-page, 덮개 동안 data-splash 처럼 view-transition-name 끔). 위에 돌개 + '추천 계획 만드는 중' + Fill 막대 10 → 32 → 90 → 100%(components/velocity/measure-progress.tsx Fill 을 공용으로 옮김, 시간으로 잼 1.6초 · 움직임 줄이기면 즉시 100). 밑 카드에 답이 한 줄씩 animate-row-in: '{나이}세 {성별} · {소속}' → '키 {H}cm · 체중 {W}kg' → '목표 체중 {T}kg' → '목표는 {목표 이름}' → '평소 움직임 {활동량}' → '시즌 {단계}'. 끝나면 haptic('success') + [추천 계획 확인하기] → 20번
- [22번 뒤 · 설명 시트] '영양 탭에서 할 수 있는 것': 네 칸 아이콘 줄(SetupSummaryRow 구조): 오늘 식단 짜기 · 음식 기록(식약처 · 바코드 · 내 음식) · 체중 흐름 · 던지는 날 가이드. 한 줄 '홈에서는 오늘 할 일 한 줄과 균형 점수만 보여요'. [다음]
- [24번 뒤 · 알림 허용, 앱(data-app=native)에서만] 위에 알약 '나의 목표: {T}kg' 또는 '{목표 이름}'. '끼니와 체크인을 잊지 않게 알림을 켜 볼까요? 다음 화면에서 허용을 눌러 주세요'. [확인했어요] → lib/native-bridge.ts 로컬 알림 허락 요청, 밑 '나중에 설정에서 바꿀 수 있어요'. 웹은 이 화면 없음
- [약속] '불펜로그와 약속해요'. 글 '나는 오늘부터 던지는 날에 맞춰 먹고, 몸 상태를 매일 체크인하겠어요'. 손글씨 서명 <canvas>(touch-none · stroke currentColor · ✕ 지우기 44px), 그리면 [다음으로] 활성. 밑 '서명은 저장되지 않아요'. 움직임 줄이기 · 포인터 없음(PC 자판만)이면 '약속해요' Switch 한 줄로 대체
- [나의 목표 카드 · 요약] Card 한 장: 머리 '{닉네임}님의 목표 · {날짜 dateKeyLabel}' + BullpenMark 옅게(도장 대신). 줄: {성별} · {나이}세 · {키}cm · 평소 움직임 {활동량} · {식단 계획} / 시작 체중 {W}kg → 목표 체중 {T}kg(유지면 '지금 몸 유지') / 목표 칼로리 {base}kcal · 탄단지 {C}:{P}:{F} / 던지는 날엔 탄수화물 먼저 · 던진 뒤엔 단백질 {회복식 g}g. 밑에 동기 한 줄(7번 답). [불펜로그 시작하기] = 폼 제출(가입이면 trySignup, 기존 사용자면 saveOnboarding) → /today. 저장 뒤 toast('저장했어요') · haptic('success')

#### 영양 탭
무엇을 그대로 두나: 홈(app/(app)/today/*) · lib/nutrition/advice*.ts · lib/day-detail.ts nutrition 부분 · 자료 흐름(page.tsx:21-37 loadNutritionDay + loadAdvice) · GuideCard · PlanCard · 끼니 넷(MealSection · EntryRow · EditRow · PlanBlock) · FoodSheet · WeekStrip · DateNav 는 손대지 않는다.

바꾸는 것(app/(app)/nutrition/nutrition-view.tsx):
1. 머리 밑에 Segmented [기록 | 통계](role tablist, 단식 없음). '기록'이 지금 왼쪽 열, '통계'가 지금 오른쪽 열(BurnCard · WeightCard · WeekChart) + 새 ExpectedWeightChart(시작 → 목표 곡선, etaWeeks · paceKg). PC(lg)는 두 열 그대로 두고 토글은 휴대폰에서만(desk:hidden) — 휴대폰에서 끼니 밑으로 내려가 멀던 통계가 한 탭 거리로.
2. SummaryCard(1256-1492) 를 인아웃 24번 '나의 하루' 모양으로: 머리 '나의 하루' + Segmented [자세히 | 한눈에](localStorage 'bullpen-nutrition-view', 시작값은 dietExperience: first · tried → 한눈에). 큰 숫자를 '{먹은} / {목표} kcal'(text-numeric, 지금의 '더 먹을 수 있는 양'은 밑 줄로 내림: '운동 {burn}kcal 소모 · {left}kcal 더 먹을 수 있어요', 넘치면 warn). 그 밑에 탄 {c%} · 단 {p%} · 지 {f%} 알약 셋(먹은 열량 비율 carbs×4 / protein×4 / fat×9 ÷ kcal, 비면 0%) 과 목표 비율 '{C}:{P}:{F}'(Targets 에서 셈). 탄단지 막대 셋은 그대로(라벨은 fiber 칸이 생기면 '순탄수 n / g'). 당류 {n}g · 나트륨 {n}mg 한 줄(8단계 뒤, 모르는 음식이 있으면 '+'). 휴대폰 링(1297-1333)은 '한눈에' 모드에서만, PC 게이지는 '자세히'에서만.
3. '자세히' 모드에서만 보이는 것: AdviceCard(1124-1245, 같은 Advice 객체 — 위치만 SummaryCard 바로 밑으로) · 정보 없는 음식 안내 · 체중 권유 줄 · 짐작 안내. '한눈에'는 큰 숫자 · 알약 · 막대 셋만.
4. 새 '나의 목표' 카드(인아웃 15 · 23 요약판) 를 SummaryCard 위에 접힌 한 줄로: '목표 {이름} · {base}kcal · 탄단지 {C}:{P}:{F} · 목표 체중 {T}kg 약 {N}주' + 기초대사량 {bmr} · 활동대사량 {tdee}. 누르면 GoalSheet. hasProfile 이 false 거나 onboardedAt 이 null 이면 이 자리가 '목표를 정하면 내 몸에 맞춰져요 · [시작하기]' 띠(437-453 교체) → /nutrition/setup(온보딩 6~24번만 도는 같은 마법사, (session) 틀 · 막대 없음).
5. GoalSheet(goal-sheet.tsx) 확장: 목표 Segmented → 카드 5(goalKind) · 평소 움직임 5칸 · 식단 계획 프리셋 줄 · 탄단지 g 세 줄(22번과 같은 부품 MacroEditor) · 활동대사량 Stat 추가. 저장은 saveNutritionProfile 한 번(ProfileInput 에 새 칸 선택으로) → saveDietPrefs 차례 그대로.
6. 끼니 칸 머리는 그대로. EntryRow 에 당류 · 나트륨은 안 붙임(카드 합에만).
7. 지난 날(?date=) 화면은 '한눈에' 강제 없이 저장된 모드, AdviceCard 는 오늘만(지금과 같음).

#### 계산 변경
■ 활동량 5단계(lib/nutrition/meta.ts ACTIVITIES, 기존 세 키 값 그대로): very-low 1.2 '거의 앉아 지내요 · 팀 훈련 없음' / low 1.3 / mid 1.5 / high 1.7 / very-high 1.9 '하루 종일 훈련 · 몸 쓰는 일'. 일반 계산기(1.375 · 1.55 · 1.725)보다 낮게 두는 까닭은 기록한 운동 · 투구를 OUT 으로 따로 더하기 때문(meta.ts:56-62). 추천: 14번 운동 종류의 유산소 · 구기 수 k, 투구 주 4회 이상 p → suggest = k≥2 ? 'high' : k===1 || p ? 'mid' : 'low'(순수 onboarding.ts suggestActivity). DEFAULT_PROFILE.activity 'mid' 유지, toProfile 이 새 키를 받음.

■ 목표 5종 → 계산 3종 접기(lib/nutrition/onboarding.ts foldGoal(goalKind, age)): gain → {goal:'gain', proteinPerKg: rule.proteinDefault} · maintain → {'maintain', default} · lose → {'lose', default}(child 는 effectiveGoal 이 maintain) · muscle → {'gain', proteinChoices 끝값(성인 2.2 · teen 1.8 · child 1.5), 속도 기본 0.25} · lean → 성인 {'lose', 2.2, 속도 0.25}, teen · child {'maintain', 끝값}. 글은 성장기에 '덜 · 줄이' 없이('칼로리는 유지하고 단백질을 높여요'). GoalKey 타입 · AGE_RULES Record 는 안 건드린다(홈 조언 HEADLINE_RULES 그대로).

■ 활동대사량: Targets.tdee = round10(bmr × factor)(새 칸, targets.ts computeTargets 반환에 더함). base = kcalTarget ?? round10(bmr × factor + delta) + adjust 는 그대로.

■ 식단 계획 프리셋 → 탄단지(targets.ts 191-195 바꿈, macroPreset null 이면 지금 숫자와 1kcal 도 안 다름): FAT_SHARE = {balanced 0.25, athlete 0.25, lowcarb 0.35, plant 0.25}; protein = proteinTargetG ?? round(proteinPerKg × W)(프리셋의 단백질은 저장 때 proteinPerKg 로 적어 둠 — athlete · plant 는 나이 범위 끝값); fat = fatTargetG ?? round(max(kcal × FAT_SHARE[preset ?? 'balanced'] / 9, 0.8 × W)); carbs = carbTargetG !== null ? carbTargetG + round(burn / 4) : max(0, round((kcal − 4P − 9F) / 4)). lowcarb 는 성인만(age.ts 성장기 보호) 이고 던지는 날엔 탭 가이드가 탄수화물을 권한다(충돌은 글로 알림). plant 는 avoidFoods 에 beef · pork · chicken · seafood 를 더해 meal-plan 이 뺀다(dairy · egg 는 사용자가 23번에서 고름). 80kg 성인 유지 · 보통 · balanced: 2750 · P 144 · F 76 · C 372(selftest:188 그대로).

■ 탄단지 g 직접 고치기(22번 · 목표 창): kcal(base) 이 주인. 화면 MacroEditor 가 고친 칸을 빼고 나머지가 받는다: 탄수 고침 → F = (base − 4P − 4C)/9(바닥 0.8W, 바닥에 닿으면 C 를 되돌림), 지방 고침 → C = (base − 4P − 9F)/4, 단백질 고침 → C 가 받음. 저장은 셋 다 g(proteinTargetG · carbTargetG · fatTargetG). 서버 saveNutritionProfile 검사: |4P + 4C + 9F − base| ≤ base × 0.05, P 10~450, C 0~1500, F 0~500. 훈련한 날 운동 몫은 탄수로(C + burn/4) 라 '던지는 날 탄수화물이 는다' 원칙 유지. 비율 % = 4C/kcal · 4P/kcal · 9F/kcal 로 화면에서만.

■ 속도 슬라이더: 값은 paceChoices(age, goal, refKg) 의 칸만(성인 0.25 · 0.35, 성장기 1칸, 어린이 없음) → 눈금 '천천히 · 추천(기본 defaultPace) · 조금 빠르게'. N주 = etaWeeks(|T − W|, pace). 하루 kcal = paceDelta. '언제까지'(event 일 때) → needed = remaining ÷ 주 → paces 중 needed 이상 가장 느린 것(goal-sheet.tsx:388-395 pickPeriod 를 onboarding.ts 로 옮김) · goalEndDate 저장.

■ 목표 이유 · 경험 · 물 · 운동 종류(계산엔 안 넣고 설정 · 추천 · 글에): goalReason → seasonPhase 추천(rehab→'rehab', event→'pre', season→'in', power→'off') · '언제까지' 칩 노출(event) · 동기 한 줄. dietExperience → 탭 보기 모드 시작값(first · tried '한눈에') · 격려 글. waterHabit → throwDayGuide notes 한 줄(GuideBody.waterHabit? 선택 칸, 탭 GuideCard 만) · PlanCard 더운 날 안내 글. activityKinds → 활동량 추천 배지 · 요약 카드. 넷 다 null 이면 지금과 같다.

■ 체중: 가입 · 온보딩의 시작 체중을 User.weightKg 와 DailyNutrition(오늘).weightKg 둘에 적어 recentWeightKg(load.ts:198) · day-detail.ts:128 · load.ts:354-376 세 길이 같은 값을 읽고 체중 흐름(weight-goal.ts, 56일 창)의 첫 점이 된다. 저장 범위는 20~200kg 하나로(setWeight 의 250 을 lib/profile.ts MAX_WEIGHT_KG 로).

■ 시험: scripts/nutrition-selftest.mts 에 프리셋 null 불변(2750/3050/2350 · 1830 · 144 · 76) · 5단계 활동 · foldGoal 격자(나이 3 × goalKind 5) · MacroEditor 합 검사 · tdee · carbTargetG + burn/4 사례를 더한다(30초 안). nutrition:advice-test(43)는 손대지 않고 통과만 확인.

#### DB 칸
- NutritionProfile.goalKind String? — 5종 원답('gain'|'maintain'|'lose'|'muscle'|'lean'), null = 옛 줄(goal 그대로 보임). 계산은 goal · proteinPerKg 로 접은 값을 읽는다
- NutritionProfile.goalReason String? — 'power'|'season'|'event'|'rehab', null 허용. 시즌 추천 · 동기 글만
- NutritionProfile.dietExperience String? — 'first'|'tried'|'steady'. 탭 보기 모드 시작값
- NutritionProfile.macroPreset String? — 'balanced'|'athlete'|'lowcarb'|'plant', null = balanced(지금 숫자 그대로)
- NutritionProfile.carbTargetG Float? · NutritionProfile.fatTargetG Float? — 직접 정한 g, null = 계산(proteinTargetG 와 같은 모양)
- NutritionProfile.waterHabit String? — 'over2'|'under2'|'unknown'. 가이드 한 줄 · 식단 더운 날 글
- NutritionProfile.activityKinds String[] @default([]) — 앱 밖 운동 종류 열쇠('run'|'swim'|'bike'|'soccer'|'basketball'|'hike'|'yoga'|'pilates')
- NutritionProfile.onboardedAt DateTime? — 온보딩을 끝낸 시각. hasProfile(load.ts:556) 대신 '온보딩 끝' 판정(취향만 저장해도 줄이 생기는 문제 피함)
- NutritionProfile.activity 값 5종 — 칸 모양 그대로(String), 코드 상수만 'very-low' · 'very-high' 추가(SQL 없음)
- MealEntry.sugarG Float? · MealEntry.sodiumMg Float? · MealEntry.fiberG Float? — 1인분 값, null = 모름(8단계 당류 · 나트륨 · 순탄수)
- UserFood.sugarG Float? · UserFood.sodiumMg Float? · UserFood.fiberG Float? — 같은 모양. MealCombo.items · MealPlan.items 는 Json 이라 칸 추가 없이 parsePlanItems 가 선택으로 받음
- DailyNutrition 오늘 줄 — 새 칸 없음. 가입 · 온보딩 저장이 weightKg 한 줄을 upsert(있는 표 · 있는 칸)
- User — 새 칸 없음(weightKg · heightCm · birthDate · sex 다 있음). lib/dal.ts select 도 그대로
- 마이그레이션 폴더 둘: prisma/migrations/20261008120000_nutrition_onboarding/migration.sql(NutritionProfile 9칸, 머리 주석 '인아웃식 온보딩 답 · 모두 null 또는 기본값이라 이 칸을 모르는 코드도 그대로 돈다') · 20261008130000_nutrition_sugar_sodium/migration.sql(MealEntry · UserFood 6칸). 절차: schema 고침 → npm run backup → migrate diff 로 대조 → migrate deploy → generate → HANDOFF 로 김민에게 'npx prisma generate' 알림. 이 클라우드는 .env 가 없어 SQL 을 손으로 쓰고 데스크톱에서 diff 와 맞춘다

#### 단계표
| 번호 | 이름 | 무엇 | 파일 | 시간 |
|---|---|---|---|---|
| 1 | 계산 뼈대 · 순수 함수 · 시험 | ACTIVITIES 5단계 · Targets.tdee · macroPreset FAT_SHARE · carbTargetG/fatTargetG · lib/nutrition/onboarding.ts(foldGoal · suggestActivity · seasonFor · pickPace · MacroEditor 계산 balanceMacros · cleanOnboarding) · 셀프테스트 사례(프리셋 null 불변 · 격자). 홈 숫자가 1kcal 도 안 바뀌는지 시험으로 못 박기 | lib/nutrition/meta.ts · targets.ts · age.ts(타입만) · onboarding.ts(새) · load.ts toProfile · scripts/nutrition-selftest.mts | 3 |
| 2 | DB 칸 추가 · 저장 동작 확장 | schema 9칸 + 마이그레이션 SQL(백업 → deploy → generate), ProfileInput 에 선택 칸(goalKind · goalReason · dietExperience · macroPreset · carbTargetG · fatTargetG · waterHabit · activityKinds · onboarded), saveNutritionProfile 검사(합 ±5% · 범위), 새 서버 동작 saveOnboarding(한 요청: User.weightKg · heightCm · DailyNutrition 오늘 체중 · NutritionProfile upsert · DietPrefs, 기존 사용자용), setWeight 범위 200 으로, HANDOFF 적기 | prisma/schema.prisma · prisma/migrations/20261008120000_nutrition_onboarding · app/actions/nutrition.ts · lib/nutrition/diet-prefs.ts · HANDOFF.md | 2 |
| 3 | 공용 온보딩 부품 | components/onboarding/: StepShell(← 44px · width 진행 막대 · page-title 제목 · 부제 · 내용 · 바닥 BigButton bottom var(--kb) · data-safe-area, PC 는 AuthCard 두 칸 틀 재사용), OptionList(아이콘 + 제목 + 설명 + ✓, 1열/2열), ChoiceChips 공용화, UnitNumber(Segmented 단위 + text-numeric 큰 숫자 + draft), PaceSlider(.range + 눈금 + aria-valuetext + haptic), MacroEditor(세 줄 + 합), ExpectedWeightChart, ProgressOverlay(Fill 공용화 + animate-row-in), SignaturePad(canvas, 대체 Switch), InfoSheet(Modal data-sheet 글 틀). velocity 의 StepBar · BigButton · Fill 은 복제해 공용으로(HANDOFF) | components/onboarding/*.tsx · components/choice-chips.tsx · app/globals.css(눈금 라벨 · 서명 칸 한두 규칙) | 4 |
| 4 | 가입 마법사 재구성(1~19 · 20~24 · 끼움) | auth-form.tsx STEPS 를 질문 단위 24개 + 끼움 9개로(key · title(답 → 글 함수) · why · fields), checkStep case 추가, 상태로 쥘 칸(체중 · 목표 · 활동 · g · 서명 여부) · data-sync, 답하기 전 [다음] disabled, 단계마다 history.pushState + popstate → back()(앱 왼쪽 밀기 · 브라우저 뒤로가 단계 뒤로), 계산 미리보기는 computeTargets(draft) 클라이언트, trySignup 이 $transaction 으로 User + NutritionProfile(onboardedAt) + DailyNutrition 생성, checkSignupEmail 2번에 유지, guardFormAction field 마지막 단계로 갱신. short: · 375 · 1536×700 · 1920×960 재기 | app/login/auth-form.tsx · app/actions/auth.ts · lib/form-values.ts(필요 시) · app/login/page.tsx(정적 유지) | 5 |
| 5 | 기존 사용자 온보딩 /nutrition/setup | (session) 틀 밑 app/(session)/nutrition/setup/page.tsx: 같은 StepShell · 질문 6~24 + 끼움(이미 있는 답은 미리 채움 · 키 · 체중이 없으면 9 · 10 도), 끝에 saveOnboarding → /nutrition. 탭 띠(437-453)가 onboardedAt null 이면 [시작하기] 로 여기로. 앱 왼쪽 밀기 · 자판 · safe-area 확인 | app/(session)/nutrition/setup/page.tsx · setup-client.tsx · app/(app)/nutrition/nutrition-view.tsx(띠만) | 2 |
| 6 | 영양 탭 '나의 하루' · 기록|통계 · 나의 목표 카드 | SummaryCard 개편(자세히｜한눈에 · 먹은/목표 큰 숫자 · 탄단지 % 알약 · 목표 비율 · 운동 소모 줄), 휴대폰 [기록 ｜ 통계] Segmented 와 통계 열 이동, ExpectedWeightChart 를 통계에, 나의 목표 접힌 카드(bmr · tdee · base · 비율 · N주) → GoalSheet. 지난 날 · 오늘 분기 그대로. impeccable detect 는 데스크톱에서 | app/(app)/nutrition/nutrition-view.tsx · charts.tsx · shared.ts | 3 |
| 7 | 목표 창 확장 | GoalSheet [목표] 칸에 목표 카드 5(goalKind) · 평소 움직임 5칸 · 식단 계획 프리셋 줄 · MacroEditor 세 줄 · 활동대사량 Stat · 추천 배지(이유 → 시즌). 미리보기 computeTargets(draft) 가 새 칸을 받음. 저장 차례(profile → prefs) 그대로 | app/(app)/nutrition/goal-sheet.tsx · plan-parts.tsx(경험 · 물 글 한 줄) | 2 |
| 8 | 당류 · 나트륨 · 순탄수 자료 | MealEntry · UserFood 6칸 마이그레이션(백업 → deploy), Food · MealEntryView · Macros 확장(선택 칸), scaleMacros · sumMacros · cleanFood(optMacro 로 0~500g · 나트륨 0~20,000mg), mfds-parse 칸 번호 확인 뒤 읽기(당류 · 식이섬유 · 나트륨 — 열쇠 번호는 포털 문서로 확인), food-sheet 직접 입력 칸 셋(접힌 '더 적기'), 기본 음식표 foods.ts 는 빈 채로(null = 모름 '+' 표시), SummaryCard 당류 · 나트륨 줄 · '순탄수' 라벨 | prisma/schema.prisma · prisma/migrations/20261008130000_nutrition_sugar_sodium · lib/nutrition/meta.ts · mfds-parse.ts · app/actions/nutrition.ts · app/(app)/nutrition/food-sheet.tsx · nutrition-view.tsx | 2.5 |
| 9 | 가이드 · 식단 카드 연동 · 요약 카드 글 | throwDayGuide 에 waterHabit 한 줄(GuideBody 선택 칸, load.ts 가 넘김), PlanCard 오늘 상태 줄에 '처음이라' · '더운 날 물' 글, 나의 목표 카드 동기 한 줄(goalReason), 알림 허용 끼움(앱만, lib/native-bridge.ts) | lib/nutrition/guide.ts · load.ts · app/(app)/nutrition/plan-parts.tsx · components/onboarding/notify-step.tsx | 1.5 |
| 10 | 검증 · 마무리 | npx tsc --noEmit · eslint 바꾼 파일 · nutrition:test(413+) · nutrition:advice-test(43 그대로) · 가짜 자료 dev-preview 로 휴대폰 375 · PC 1536×700 · 1920×960 넘침 0 확인 뒤 지우고 서버 재시작 · HANDOFF(김민: prisma generate · velocity 부품 복제 · auth-form 구조 바뀜) · 커밋 제목 한국어 · docs/claude/geum-yunho.md 진행 줄 갱신 | HANDOFF.md · docs/claude/geum-yunho.md · app/dev-preview-onboarding(임시, 커밋 안 함) | 1.5 |

#### 사용자에게 물을 것
- 가입 길이: 질문 24 + 끼움 9 = 33장이에요(인아웃 24장). 투구 3문항 · 웨이트 2문항을 한 화면에 묶은 것이 지금 안이에요. 더 줄일까요(예: 물 · 시즌 단계 · 소속을 가입에서 빼고 영양 탭 온보딩으로)? 아니면 인아웃처럼 한 화면 한 문항으로 더 쪼갤까요?
- 계정 차례: 이메일 · 비밀번호 · 약관을 1~4번(앞)에 두었어요. 중복 이메일을 끝에 가서 알게 되지 않으려고요(checkSignupEmail). 인아웃처럼 이름만 앞이고 계정은 맨 뒤로 보내도 될까요(그러면 끝에서 막힐 수 있어요)?
- 식단 계획 이름: 인아웃의 '키토'를 '저탄수(성인만, 지방 35%)' 로, '비건'을 '채식(소 · 돼지 · 닭 · 해산물 빼기, 달걀 · 유제품은 따로 고름)' 으로 바꿨어요. 이름 그대로 '키토 · 비건' 으로 쓸까요?
- 탄단지 g 을 고칠 때 누가 주인인가: 인아웃은 g 을 고치면 kcal 이 따라 바뀌고, 이 안은 kcal 이 주인이라 다른 영양소가 받아요(합이 목표 kcal 과 같게). 인아웃 방식(g 합이 곧 kcal)으로 바꿀까요?
- 목표 체중 범위: 지금 규칙은 감량 −10% · BMI 20 바닥 · 성인만이라 인아웃의 88 → 75kg(−15%)은 거절돼요. 화면에서 범위를 먼저 보이는 것으로 둘까요, 투수 앱 규칙을 풀까요?
- 소속(competitionLevel)은 계산이 안 읽어요. 이 안에서는 나의 목표 카드 머리글과 시즌 추천에만 써요. 가입에서 빼고 내 정보로 미룰까요?
- 서명 칸: 손글씨 <canvas>(저장 안 함)로 할까요, 글 규칙대로 '약속해요' 스위치 한 줄로 할까요?
- 코치 고르기(말투)는 AI 회의 전 규칙과 겹쳐 뺐어요. 규칙 기반 말투 두 벌(탭 글만)을 나중에 넣을지 정해 주세요.
- 당류 · 나트륨 · 순탄수: 식약처 응답의 칸 번호(당류 · 식이섬유 · 나트륨)를 포털 문서로 확인해야 해요. 기본 음식표 542줄은 비워 두고(모름 '+') 식약처 · 바코드 · 직접 입력만 채울까요, 기본 음식표도 손으로 채울까요(2~3시간 추가)?
- 기존 사용자(온보딩 전 계정)에게 영양 탭을 열 때 바로 /nutrition/setup 으로 보낼까요, 띠의 [시작하기] 를 누를 때만 갈까요?
- 알림 허용 끼움은 앱(data-app=native)에서만 보여요. 웹은 끼니 알림이 없어서요. 괜찮을까요?
- DB 변경이 두 번(NutritionProfile 9칸 · MealEntry/UserFood 6칸)이에요. 김민에게 미리 알리고 백업한 뒤 적용해야 해요. 언제 적용할지, 둘을 한 번에 할지 정해 주세요.

### 안 2: 인아웃식 온보딩 · 영양 설계안(투수 우선) — 가입 25화면 + 끼움 9 · 영양 탭 '나의 하루' · 계산 · DB · 단계표

#### 질문 순서

| # | 화면 | 왜 | 선택지 · 입력 | 저장 | 읽는 곳 | PC | 휴대폰 · 앱 |
|---|---|---|---|---|---|---|---|
| 1 | 반가워요! 뭐라고 부를까요? | 홈과 기록에서 이 이름으로 불러요. 나중에 내 정보에서 바꿀 수 있어요. | 글 입력칸 하나(2~20자, autoCapitalize off). 답하기 전엔 [다음] 비활성(disabled, opacity-50). | User.nickname(있는 칸) | 뒤 화면 제목에 들어감 — 새 lib/onboarding/questions.ts 의 title(answers) 가 '민수 님, 어느 손으로 던지세요?' 처럼 만든다. 검사는 checkStep 'nickname' 2자(app/login/auth-form.tsx:489-493) · trySignup(app/actions/auth.ts:111) 그대로. | AuthCard(app/login/auth-form.tsx:80-166) 두 칸 그대로: 왼쪽 로고 · 제목 · 왜, 오른쪽 큰 입력칸 + 오른쪽 아래 [다음]. 진행 막대는 카드 위 4px width 막대(:113-123) 하나로 통일(카운터 '3 / 25' 는 뺌). | 세로 한 줄(AuthCard max-md:flex-1). 위 왼쪽 ‹ 뒤로 44px(첫 화면은 '로그인으로'), 그 밑 진행 막대, 제목 page-title, 왜 text-sm text-muted break-keep, 입력칸은 16px 규칙 자동. [다음]은 h-12 w-full 알약 bg-sky, position fixed bottom: var(--kb,0px) + pb-[env(safe-area-inset-bottom)]. 앱(data-app=native)은 로고 링크 죽임(:130 그대로). |
| 2 | 생년월일을 알려주세요 | 나이에 맞는 하루 투구 한도와 기초대사량을 계산해요. 성장기는 영양 기준도 달라요. | 휴대폰 · 앱: <input type="date"> 큰 칸(아이폰 휠 피커, min = 오늘 − MAX_AGE 100년 · max = 오늘 − MIN_AGE 5년, lib/profile.ts:74-75). PC: 지금 BirthDateField + MiniCalendar pickYear(auth-form.tsx:728-843). 값은 숨은 칸 birthDate 'YYYY-MM-DD' 그대로. | User.birthDate(있는 칸) | ageOn(lib/nutrition/targets.ts:130) → basalKcal(:144, 18세 밑 Schofield lib/nutrition/age.ts:179) · ageBand(age.ts:120) → 13번 목표 카드 거름 · 15번 속도(paceChoices age.ts:226) · 단백질 범위(effectiveProtein age.ts:138) · 14번 목표 체중 허용(targetAllowed lib/nutrition/weight-goal.ts:440). dailyPitchCap(lib/report/plan.ts:56) · requiredRestDays(:63) → 끼움 '투구 한도' 카드. levelFit(components/level-choices.tsx:51) → 5번 소속 칸 막힘. 7번 부제의 '하루 한도 N구'. | 오른쪽 칸 달력 단추 → 날짜가 정해지면 성별 시트(3번)가 Modal 가운데 창으로 그 칸에서 날아온다(origin). | type=date 칸 text-numeric text-2xl(16px 규칙 예외 — 이미 큼). 값이 들어오면 성별 시트가 아래에서 올라옴(data-sheet). 앱도 같은 길(웹뷰 사파리 휠). |
| 3 | 성별을 골라 주세요 | 기초대사량 식의 상수가 달라요(남 +5, 여 −161kcal). 영양 목표에만 써요. | 시트 안 카드 둘: 남 · 여(lucide 아이콘 + 이름, 고르면 border-sky bg-sky/10 + Check). 고르면 시트가 닫히고 바로 4번으로(goTo). 시트를 끌어내려 닫으면 [다음]이 '성별을 골라 주세요'로 막음. | User.sex(있는 칸, lib/profile.ts SEXES) | basalKcal 의 s(targets.ts:151) · schofieldKcal(age.ts:183) → 끼움 '추천 계획' bmr. 다음 화면 글에는 안 넣는다(인아웃의 '남성이' 대신 이름으로 부른다). 서버 formData.has('sex') 호환(auth.ts:156-163) 그대로. | Modal(components/modal.tsx:77) 가운데 창, 두 칸 격자 카드. | Modal data-sheet 아래 시트(손잡이 · 끌어내려 닫기), 카드 둘 세로 56px 줄. 고르면 haptic('selection')은 저절로(role radio). |
| 4 | {이름} 님은 어느 손으로 던지세요? | 폼 분석과 암케어, 구속 측정이 어느 팔을 볼지 정해요. | 카드 셋 우투 · 좌투 · 양투(THROWING_HANDS lib/baseline.ts:63) + 설명 한 줄(양투: '둘 다 던져요'). 고르면 [다음] 활성. | User.throwingHand(있는 칸) | app/(app)/training/armcare-section.tsx:93-94(throwingSide · bothHands) · mechanics-section.tsx:41 · app/(session)/velocity/measure/page.tsx:31(구종 전형값 거울 components/velocity/session-types.ts:45). validateBaseline(lib/baseline.ts:236) 필수. | 오른쪽 칸 1열 OptionCard(아이콘 칸 bg-sky-tint/60 + 이름 + 설명 + 오른쪽 Check) — components/onboarding/option-cards.tsx(velocity/setup-art.tsx:105 OptionCards 를 공용으로 옮김). | 1열 카드 min-h-14, label + input.peer sr-only 라 누름 · 떨림 저절로. |
| 5 | 어디서 야구를 하세요? | 생년월일에 맞는 소속만 고를 수 있어요. 팀 훈련 일수로 평소 움직임을 미리 골라 드리고, 또래 기준을 쓰려고요. | LevelChoices(components/level-choices.tsx:48-105) 7칸 — 나이 밖은 흐리게 막힘, 학교 나이면 미리 골라짐, 학년 안내 글 fade-in. | User.competitionLevel(있는 칸) | 새 순수 함수 defaultActivity(level)(lib/nutrition/onboarding.ts): 초등학교 → 'mid' · 중학교 · 고등학교 · 대학교 · 프로 → 'high' · 성인리그 → 'mid' · 사회인 → 'low' → 16번 평소 움직임의 미리 고른 값(바꿀 수 있음). levelAgeProblem(lib/baseline.ts:194) 서버 재검사. 지금은 어느 계산도 안 읽는 칸(lib/baseline.ts:74-83)이라 이 연결을 새로 잇는다. | 오른쪽 칸 2열 카드 격자, 안내 글 위. | 1열 카드 7개(굴러감), 안내 글은 카드 위에 고정. |
| 6 | 평소 일주일에 몇 번 던지세요? | 부하 지수를 첫날부터 보여 드리려고요. 기록이 쌓이면 이 답의 비중은 저절로 줄어요. | 카드 셋 주 0~1회 · 주 2~3회 · 주 4회 이상(BASELINE_FREQ lib/baseline.ts:20-24). | User.baselineFreq(있는 칸) | estimateDailyLoad(lib/baseline.ts:293-306) → lib/report/gather.ts:99 baselineDailyLoad(ACWR 씨앗) · app/(app)/coach/overview.tsx:120 · lib/report/armcare/today.ts:45. 끼움 '부하 지수' 카드 숫자. | 오른쪽 칸 1열 카드 셋. | 1열 카드 셋, 고르면 [다음] 활성(바로 넘어가지 않음 — 되돌아와 고치기 쉽게). |
| 7 | 한 번에 몇 구쯤 던지세요? | {나이}세의 하루 한도는 {dailyPitchCap}구예요. 그와 견줘 평소 부하를 셈해요. | 카드 셋 30구 이하 · 30~60구 · 60구 이상(BASELINE_VOLUME lib/baseline.ts:26-30). | User.baselineVolume(있는 칸) | estimateDailyLoad(lib/baseline.ts:293). 부제의 한도 숫자는 dailyPitchCap(lib/report/plan.ts:56)(2번 답이 글에 들어가는 예). | 1열 카드. | 1열 카드. |
| 8 | 평소 강도는 어느 정도예요? | 강도가 높을수록 같은 구수라도 부하가 커요(캐치볼 3 · 절반 6 · 전력 8). | 카드 셋 캐치볼 위주 · 절반 전력 · 전력 투구 위주(BASELINE_INTENSITY lib/baseline.ts:32-36). | User.baselineIntensity(있는 칸) | estimateDailyLoad(lib/baseline.ts:293) → 끼움 '부하 지수' 카드의 숫자(회수 × 구수 × 강도 ÷ 7). | 1열 카드. | 1열 카드. |
| 9 | 웨이트는 일주일에 몇 번 하세요? | 운동 부하를 첫날부터 보여 드려요. 하루 운동 시간은 60분으로 두고 내 정보에서 바꿀 수 있어요. | 카드 넷 거의 안 함 · 주 1~2회 · 주 3~4회 · 주 5회 이상(BASELINE_WORKOUT_FREQ lib/baseline.ts:46-51). | User.baselineWorkoutFreq(있는 칸) | estimateTrainingDailyLoad(lib/baseline.ts:320-331, × dailyWorkoutMinutes 60 × 0.17) → lib/report/training-acwr.ts:94. | 2열 카드 격자. | 1열 카드 넷. |
| 10 | 웨이트는 얼마나 오래 하셨어요? | 경력에 맞는 운동까지만 드려요. 입문이면 가장 센 운동은 빼요. | 카드 넷 입문 · 초급 · 중급 · 상급 + desc(TRAINING_LEVELS lib/report/personalize.ts:28-56, '6개월 미만' 같은 기간 글). | User.trainingLevel(있는 칸) | filterByLevel(lib/report/today-data.ts:158 · daily-plan.ts:182 · lib/report/program/program.ts:878-886 · program/load.ts:366) · lib/report/prescription.ts:275 입문 규칙. readTrainingProfile(personalize.ts:383) 서버 필수. 김민 영역 값이라 저장 위치는 그대로(설정 › 트레이닝에서 고침). | 2열 카드 격자(지금 Choices list 변형과 같은 꼴). | 1열 카드 넷. |
| 11 | 키를 알려주세요 | 기초대사량과 목표 체중의 바닥(BMI 20)을 셈하고, 영상에서 잰 길이를 몸 크기로 나눠요. | [cm ｜ in] Segmented w-36(components/unit-toggle.tsx:92-101 모양) + 큰 숫자 칸(inputMode numeric, text-numeric text-4xl) + 숨은 heightCm(정수 cm, 100~250 lib/profile.ts:8-9). 온보딩에선 필수(서버는 옛 화면 호환으로 선택 유지). | User.heightCm(있는 칸, 늘 cm — fromLength lib/units.ts:58) | basalKcal 6.25·H(targets.ts:152) · targetRange BMI 20 바닥(weight-goal.ts:471) · lib/pose/measure.ts:107 cmPerPx. 단위는 LENGTH_KEY localStorage(lib/units.ts:13)라 설정 창과 같은 값. | 오른쪽 칸 위 단위 고르개, 가운데 큰 숫자, 밑 '177cm = 5ft 10in' 한 줄(in 고르면 cm 로 보여 줌). | 큰 숫자 칸에 자동 초점, 숫자 자판. [다음]이 자판 위(bottom: var(--kb)). draft 패턴(app/(app)/profile/profile-form.tsx:120-165)로 단위 바꿔도 적던 글자 안 튐. |
| 12 | 지금 체중은 얼마예요? | 단백질은 체중 1kg 당 g 으로, 운동으로 쓴 칼로리도 체중으로 셈해요. | [kg ｜ lb] Segmented + 큰 숫자(소수 1자리, 20~200 lib/profile.ts:21-22, inputMode decimal). 필수. | User.weightKg(있는 칸) + 가입 날 DailyNutrition.weightKg(있는 표 · 체중 흐름의 첫 점 — load.ts:354-376 의 56일 창이 읽음). 가입 서버가 둘 다 한 트랜잭션에 씀. | computeTargets 체중(targets.ts:163) · proteinAuto = perKg × W(:191) · 지방 바닥 0.8g/kg(:194) · kcalFor(lib/nutrition/burn.ts:34) · targetRange refKg(weight-goal.ts:456) · paceChoices 70kg 조건(age.ts:226-243). 끼움 '운동 소모' 시트 숫자. 영양 탭 assumed:'weight' 알림(nutrition-view.tsx:1484)이 저절로 사라진다. | 11번과 같은 틀. | 11번과 같은 틀, 단위는 WEIGHT_KEY localStorage(useWeightUnit)라 영양 탭 체중 카드와 같은 단위. |
| 13 | {이름} 님, 몸을 어떻게 만들고 싶으세요? | 성인: 목표가 하루 칼로리와 단백질을 정해요. 시즌 중 크게 굶으면 구속과 회복이 먼저 떨어져요. / 성장기: 자라는 만큼 먹는 것이 먼저라 빼기는 아주 천천히만 돼요. / 어린이: 어린이는 감량을 고를 수 없어요. 잘 자라게 먹는 것이 먼저예요. | 카드(나이별 거름, ageRule(age).goalDelta): 증량 '몸을 키워요' · 근육 키우기 '단백질을 높여 천천히 키워요' · 유지 '지금 몸으로 시즌을 버텨요' · 감량 '천천히 빼요'(성인 −400 · 성장기는 이름이 '천천히 빼기' · −200) · 군살만 빼기 '힘은 지키고 단백질을 높여요'(성인만). 어린이: 증량 · 유지 둘만. | NutritionProfile.goalKind(새 칸, 원답 'gain'｜'muscle'｜'maintain'｜'lose'｜'lean') + goal(접은 값 gain｜maintain｜lose, 있는 칸) + proteinPerKg(접은 값, 있는 칸) | 접기 표 foldGoalKind(lib/nutrition/onboarding.ts, calcChanges 참고) → effectiveGoal(age.ts:148) · paceDelta(:213) → base(targets.ts:185) · proteinAuto(:191). advice.ts HEADLINE_RULES 의 gain/lose(498 · 512)와 AdviceInput.body.goal 은 접은 goal 을 그대로 받아 홈은 안 바뀐다. 14 · 15번 제목에 들어감. | 오른쪽 칸 1열 카드 5(아이콘 + 이름 + 설명 + Check). | 1열 카드 5(short: 세로 700 밑은 설명을 한 줄로 줄임). |
| 14 | {목표}하면 몇 kg 까지 가고 싶으세요? | 지금 {W}kg 기준으로 {min}~{max}kg 사이에서 정할 수 있어요. 성인 감량은 BMI 20 밑으로는 안 가요. | 큰 숫자 칸(12번과 같은 단위) + 밑에 즉시 '지금보다 −5.0kg'(답하면 바로) + 범위 밖이면 ErrorLine. 바닥 밑 글자 단추 '나중에 정할게요'(건너뛰기 → 속도만으로). 보이는 조건 targetAllowed(weight-goal.ts:440): 증량(성장기 · 성인) · 감량(성인). 유지 · 어린이 · 목표 체중 없는 길은 이 화면이 아예 없음(questions.ts visible(answers)). | NutritionProfile.targetWeightKg(있는 칸) | targetRange(weight-goal.ts:456) 화면 검사 · checkTargetWeight(:488) 서버 · etaWeeks(:428) → 15번 큰 숫자 · WeightTrend 목표 점선(app/(app)/nutrition/charts.tsx:105) · 끼움 '추천 계획' 예상 곡선 · WeightCard 권유(weightGoal). | 11번 틀 + 범위 글. | 11번 틀 + 범위 글. 숫자 자판. |
| 15 | {목표체중}kg 까지 얼마나 빨리 갈까요? | 하루 칼로리가 달라져요. 천천히 쪽이 지방 없이 붙고, 힘을 지키며 빠져요. | 성인: Segmented 두 칸 천천히 '주 0.25kg · 하루 ±300' · 보통 '주 0.35kg · ±400'(paceChoices age.ts:226, 증량은 70kg 이상만 0.35) 기본 defaultPace(age.ts:173: 증량 0.25 · 감량 0.35) + 카드 큰 숫자 '약 N주면 닿아요'(etaWeeks, 52주 넘으면 '한 해 넘게 걸려요 · 목표를 조금 가까이'). 밑 '언제까지' 칩 없음 · 4 · 8 · 12 · 16 · 24주(PERIOD_WEEKS · pickPeriod 를 goal-sheet.tsx:375-412 에서 lib/nutrition/period.ts 로 옮겨 공용). 성장기: 고르개 없이 '주 0.25kg · 약 N주' 글만. 어린이 · 유지 · 목표 체중 없음: 화면 없음. | NutritionProfile.weeklyRateKg(storedRate 로 기본이면 null, 있는 칸) · goalEndDate(있는 칸) | effectiveRate(age.ts:184) → paceDelta → base(targets.ts:185) · etaWeeks(weight-goal.ts:428) · 서버 planOnSave(weight-goal.ts:533, 가입은 planSince = 가입 날). 고르면 끼움 '추천 계획'의 주 수 · 곡선이 같이 바뀜. | 오른쪽 칸: 큰 숫자 카드(text-numeric) 위, 고르개 아래, 칩 줄 맨 밑. | 같은 차례, 고르개는 Segmented(휴대폰 rounded-3xl), 바꾸면 숫자가 CountUp(globals.css count-up)으로 차오름. |
| 16 | 운동과 훈련을 뺀 하루는 어때요? | 앱에 적는 운동과 투구는 그날 따로 더해요. 여기선 팀 훈련처럼 안 적히는 움직임만 골라요(두 번 세지 않게). | 카드 셋(제목 + 설명 두 줄): 적음 '수업 · 일 끝나면 주로 앉아요 · 팀 훈련 없음' × 1.3 · 보통 '주 3~4일 팀 훈련' × 1.5 · 많음 '거의 매일 팀 훈련 · 몸 쓰는 일' × 1.7(ACTIVITIES lib/nutrition/meta.ts:63-67, 글만 다듬음). 5번 소속으로 미리 골라져 있음. | NutritionProfile.activity(있는 칸, 'low'｜'mid'｜'high') | computeTargets factor(targets.ts:169 · 185) · 새 Targets.tdee = round10(bmr × factor) → 끼움 '추천 계획' 활동대사량 · 영양 탭 '내 계획' 카드. 인아웃 5단 ↔ 3단 대응은 calcChanges. | 1열 카드 셋. | 1열 카드 셋, 미리 고른 카드에 '소속으로 골라 뒀어요' 작은 글. |
| 17 | 지금 시즌은 어느 때예요? | 비시즌은 몸 만들기, 시즌 중은 던지는 날 탄수화물, 재활은 단 음식 줄이기로 식단이 달라져요. | 카드 넷 비시즌 · 시즌 준비 · 시즌 중 · 재활(SEASON_PHASES lib/nutrition/diet-prefs.ts:12-28, hint 그대로). 바닥 글자 단추 '잘 모르겠어요'(null). | NutritionProfile.seasonPhase(있는 칸) | lib/nutrition/meal-plan.ts styleScore(:425, 시즌 중 한식 +0.5) · 틀 꼬리표 · app/(app)/training/page.tsx:255(트레이닝 추천도 같은 칸을 읽음 — 투수 질문이 두 기능에 연동) · plan-parts.tsx envChips. | 2열 카드 격자. | 1열 카드 넷. |
| 18 | 어떤 음식을 주로 드세요? | 식단을 짤 때 어떤 끼니 틀을 먼저 고를지 정해요. | 카드 셋 한식 위주 · 골고루 · 간편식 위주(DIET_STYLES diet-prefs.ts:32-37). | NutritionProfile.dietStyle(있는 칸) | styleScore(meal-plan.ts:425-438) → buildMealPlan(:1043) 틀 고르기. 키는 그대로(DB 에 문자열로 저장됨 · 시험 EXPECTED_AVOIDS). | 1열 카드. | 1열 카드. |
| 19 | 하루를 몇 번에 나눠 드세요? | 끼니마다 칼로리와 단백질 몫을 나눠요. 한 끼 단백질은 {mealProteinGoal}g 쯤이 기준이에요. | 카드 넷 세 끼 · 세 끼 + 간식 · 세 끼 + 간식 둘 · 두 끼 + 간식(MEAL_PATTERNS diet-prefs.ts:40-45). 기본 '3+1'. | NutritionProfile.mealPattern(있는 칸) | buildMealPlan 끼니 몫(meal-plan.ts) · PlanCard 오늘 상태 줄(plan-parts.tsx:100-107). 부제 숫자는 mealProteinGoal(lib/nutrition/meal-protein.ts:38, 12 · 13번 답에서). | 2열 격자. | 1열 카드 넷. |
| 20 | 못 먹거나 안 먹는 것이 있어요? | 식단에서 빼고 다른 것으로 바꿔 넣어요. 여러 개 골라도 돼요. | 체크 카드 9(AVOIDS diet-prefs.ts:48-59, 오른쪽 ✓ 동그라미, CheckboxGroup 꼴) + 바닥 [다음] 밑 글자 단추 '없어요 · 건너뛰기'(TextButton text-sky-strong). | NutritionProfile.avoidFoods[](있는 칸, @default([])) | meal-templates.ts CONTAINS(:249) 꼬리표 → buildMealPlan 빼기 · 바꿔 넣기(SUBSTITUTES) · saveDietPrefs 가 오늘 식단에서 뺌(app/actions/nutrition.ts:646-667). 홈 조언의 음식 보기(advice.ts 기본 음식)는 안 읽는다(알고 둔 한계). | 3열 칩 격자(ChoiceChips multiple 공용화). | 2열 체크 카드 min-h-12. |
| 21 | 탄단지는 어떻게 나눌까요? | 지방 비율이 바뀌면 남는 탄수화물이 달라져요. 던지는 날 먹어야 할 것이 탄수화물이에요. | 카드 셋: 균형 '지방 25% · 지금 기본' · 탄수화물 넉넉히 '지방 20% · 던지는 날이 많은 시즌' · 단백질 넉넉히 '체중 1kg 당 2.0g 이상 · 지방 25%'(성장기는 1.8 상한으로 당김 effectiveProtein). 키토 · 비건은 없음(투수 설계 · 성장기 규칙과 맞지 않음, 비건은 20번 못 먹는 것으로 대신). 13번에서 '근육 키우기' · '군살만 빼기'를 골랐으면 '단백질 넉넉히'가 미리 골라짐. | NutritionProfile.macroPreset(새 칸 'balanced'｜'carb'｜'protein', null = balanced) + proteinPerKg(단백질 넉넉히면 max(지금, 2.0)) | computeTargets 지방 몫 FAT_SHARE[preset](새, targets.ts:194 자리) → carbs 나머지(:195) → 끼움 '탄단지 계산 완료' 숫자 · 영양 탭 '나의 하루' 목표 비율 · 식단 짜기 targets(kcal · protein 만 읽어 그대로). | 1열 카드 셋 + 밑 미리보기 한 줄 '탄 {C}g · 단 {P}g · 지 {F}g'(computeTargets 로 즉시). | 1열 카드 셋 + 미리보기 줄. |
| 22 | 로그인에 쓸 이메일을 알려주세요 | 가입된 이메일인지 여기서 바로 확인해요. 알림은 보내지 않아요. | 이메일 칸(noAutoFix auth-form.tsx:62, inputMode email). [다음] 누르면 checkSignupEmail(app/actions/auth.ts:76-86) 미리 확인(확인 못 하면 넘어감 :995-997, 지금 next() 의 basic 분기를 이 단계로 옮김). | User.email(있는 칸) | 중복 검사 auth.ts:196 · 23번 숨은 username(키체인) 값 signupEmail(auth-form.tsx:900-902). | 오른쪽 칸 입력 하나. | 입력 하나, 자판 위 [다음]('확인 중…' 동안 비활성). |
| 23 | 비밀번호를 만들어 주세요 | 8자 이상이면 돼요. 다른 곳에서 쓰지 않는 것으로요. | 비밀번호 · 한 번 더 두 칸 + '비밀번호 보기' CheckLine. 숨은 username 칸(auth-form.tsx:1168-1176) 같은 단계에 유지. 상태로 쥠(:889-895). | User.password(bcrypt, auth.ts:204) | createSession · passwordFingerprint(lib/session.ts:50). checkStep 'password'(auth-form.tsx:510-523) 그대로. | 오른쪽 칸 두 입력. | 두 입력, noAutoFix(아이폰 첫 글자 대문자 사고). |
| 24 | 약관에 동의해 주세요 | 두 가지 모두 동의해야 가입할 수 있어요. 눌러서 내용을 볼 수 있어요. | '모두 동의합니다' + 이용약관 · 개인정보 둘(AgreeLine data-sync auth-form.tsx:685-713, LegalSheet 창). 격식체는 가입 동의 예외. | 저장 안 함(서버가 'on' 인지만 봄 auth.ts:130-135) | 없음. checkStep 'terms'(:524-531). | 오른쪽 칸 체크 셋. | 체크 줄 44px(CheckLine :231-233), 약관은 새 탭 대신 Modal(사파리 튕김 방지). |
| 25 | {이름} 님의 목표예요 | 가입하면 이 숫자로 홈과 영양 탭이 시작돼요. 언제든 영양 탭 '내 계획'에서 바꿀 수 있어요. | 요약 카드(Card + rise-in 차례): {나이}세 · {키}cm · {체중}kg → 목표 {목표체중}kg(있으면) · 목표 {goalKind} · 평소 움직임 {activity} · {시즌} · 식단 {스타일} · 운동 전 목표 {base}kcal · 탄단지 {c}:{p}:{f} · {가입 날짜 dateKeyLabel} + BullpenMark 옅게. 밑에 체크 한 줄 '던지는 날 앞뒤로 끼니를 거르지 않기로 약속해요'(저장 안 함, 켜야 단추 활성 — 손글씨 서명 대신). [가입하고 시작하기](SubmitButton, allGood 재검사 auth-form.tsx:1011-1023). | 이 화면 자체는 저장 없음. 보내기 = trySignup 한 요청: User(있는 칸들) + NutritionProfile create(goal · goalKind · activity · proteinPerKg · targetWeightKg · weeklyRateKg · goalEndDate · seasonPhase · dietStyle · mealPattern · avoidFoods · allowSupplements(성인 true · 성장기 false) · macroPreset · fatTargetG · kcalTarget · proteinTargetG · planSince 가입 날 · onboardedAt now) + DailyNutrition(가입 날, weightKg) 을 prisma.$transaction 으로. | 가입 뒤 redirect('/today')(auth.ts:224) 그대로 → CheckinGate(components/checkin-gate.tsx:218) 첫 체크인 → 홈 first-day-card. 영양 탭은 hasProfile 이 true 라 '목표 정하기' 배너 없이 바로 '나의 하루'. | 오른쪽 칸 카드 + 체크 + 오른쪽 아래 [가입하고 시작하기]. | 카드 전체 너비, 체크 줄 44px, 바닥 큰 단추. 신호 끊김은 guardFormAction(signup, { field: 'promise' })(auth-form.tsx:866-869 의 field 를 마지막 단계 칸으로 바꿈). |

#### 끼움 화면
- [5번 뒤 · 투구 한도 카드] 제목 '{나이}세는 하루 {dailyPitchCap(age)}구까지예요' · 본문 '{n}구 넘게 던지면 {requiredRestDays(n)}일 쉬어요. 홈에서 매일 오늘 던져도 되는 양을 보여 드려요.'(lib/report/plan.ts:56 · :63 의 실제 숫자) · 작은 막대 그림(한도까지 차는 막대, ring-grow 아님 · width 전환) · [다음]. 사회적 증거(50만 명 · 4.9점) 같은 지어낸 숫자는 넣지 않는다.
- [8번 뒤 · 부하 지수 카드] 제목 '첫날부터 부하 지수를 보여 드릴게요' · 본문 '평소 하루 부하 약 {estimateDailyLoad}예요. 기록이 28일 쌓이면 이 답 대신 실제 기록으로 셈해요.'(lib/baseline.ts:293 · lib/report/gather.ts:99) · 답 세 줄이 animate-row-in 으로 쌓임(주 2~3회 · 30~60구 · 절반 전력) · [다음].
- [12번 뒤 · 운동 소모 시트(Modal data-sheet, PC 가운데 창)] 제목 '운동과 투구를 적으면 쓴 만큼 더 먹어요' · 본문 '트레이닝 60분이면 약 {kcalFor(5, W, 60)}kcal, 불펜 40구면 약 {pitchingBurn('불펜', 40, 6, W).kcal}kcal 를 그날 목표에 더해요.'(lib/nutrition/burn.ts:34 · :54, 12번 체중으로) · 끼니 칸 머리에 '운동 +N' 으로 보이는 작은 그림 · [다음]. 인아웃 '운동 종류 여러 개' 화면을 대신한다(종류는 기록에서 저절로 온다).
- [21번 뒤 · 계획 만드는 중] 전체 덮개(fixed inset-0 bg-page, app-splash 식으로 덮는 동안 view-transition-name 끄기 globals.css:2290) · 막대 10 → 32 → 90 → 100%(measure-progress.tsx:26 Fill 꼴, 시간 기준 1.8초 — 움직임 줄이기에서도 넘어가게) · 밑 카드에 답이 한 줄씩(animate-row-in --row): '{나이}세 · {키}cm · {체중}kg' → '목표 {goalKind}' → '평소 움직임 {activity} · {시즌}' → '식단 {스타일} · {끼니 구성}' · 끝나면 haptic('success') · [추천 계획 보기]. 계산은 computeTargets(draft, body, 0)(순수, goal-sheet.tsx:242 패턴)라 서버 없이 그 자리에서.
- [추천 계획 완성] 제목 '약 {etaWeeks}주면 {목표체중}kg 에 닿아요'(목표 체중 없으면 '{goal} 계획을 만들었어요') · 세 줄 StatRow: 기초대사량 {bmr}kcal({ageRule.bmrName}) · 활동대사량 {tdee}kcal(새 Targets.tdee) · 운동 전 목표 {base}kcal ✎(누르면 그 자리 숫자 칸 → kcalTarget, 1,000~6,000) · 한 줄 '운동한 날은 쓴 만큼 더해져요(트레이닝 60분이면 +{N})' · 예상 체중 선(새 components/nutrition/weight-forecast.tsx: w(k) = 지금 ∓ 속도 × k, k = 0…주, smoothPath + trend-draw 700ms + 목표 점선, 유지면 안 그림) · [다음].
- [탄단지 계산 완료] 제목 '탄단지를 이렇게 나눴어요' · 부제 '숫자를 바꿀 수도 있어요' · 세 줄 ListRow: 탄수화물 {C}g ×4 = {}kcal {p}% / 단백질 {P}g ×4 = {}kcal {p}% / 지방 {F}g ×9 = {}kcal {p}% → 합 {base}kcal. g 를 고치면: 단백질 → proteinTargetG · 지방 → fatTargetG · 탄수화물 → kcalTarget = 4C + 4P + 9F(운동 전), kcal · % 가 즉시 따라 바뀜. 밑 한 줄 '운동한 날은 탄수화물이 쓴 만큼 늘어요'. 저장 중 표시는 없고(가입은 보내기 전 로컬 상태) 영양 탭에서는 toast('저장했어요'). [다음].
- [25번 · 나의 목표 카드 + 약속] questions 25번 참고. 손글씨 서명 칸은 만들지 않는다(글 규칙 '설명 없이 짧게') — 체크 한 줄 '던지는 날 앞뒤로 끼니를 거르지 않기로 약속해요'(저장 안 함).
- [가입 뒤] redirect('/today') 그대로. 웹은 AppSplash → CheckinGate 첫 체크인(변경 없음) → 홈(first-day-card). 알림 허용 화면은 넣지 않는다(끼니 알림은 영양 로드맵 9번 '앱 나온 뒤').
- [기존 사용자 온보딩 · /nutrition/setup] 가입 때 영양 답이 없던 계정(NutritionProfile 없음 또는 onboardedAt null): 영양 탭 배너 '10가지 질문으로 내 계획을 만들어요' → (app) 안 전체 화면 /nutrition/setup(11 → 21번 + 계획 만드는 중 · 추천 계획 · 탄단지 · 요약) → 저장은 updateProfile(키 · 체중, app/actions/profile.ts:31) + saveNutritionProfile(:795) + saveDietPrefs(:628) + setWeight(:286) 를 새 서버 동작 finishNutritionSetup 하나로 묶어 한 트랜잭션(반만 저장되는 일 없게) → onboardedAt → toast('저장했어요') → /nutrition. 같은 questions.ts · 같은 셸이라 가입과 글 · 모양이 같다.

#### 영양 탭
영양 탭(app/(app)/nutrition/nutrition-view.tsx)을 인아웃 '기록' 탭처럼 만들되 홈 영양은 손대지 않는다.

바꾸는 것
1. 위 고르개 [기록 | 통계](Segmented role tablist, 휴대폰만 · desk:hidden). 단식은 없다(물어볼 것). '기록' = 지금 왼쪽 열(나의 하루 → 식단 → 끼니 넷). '통계' = 지금 오른쪽 열 셋(BurnCard 2015 · WeightCard 2106 · WeekChart 540-546) + 새 '내 계획' 카드. PC(lg)는 지금처럼 두 열 그대로(456) — 고르개가 숨고 둘 다 보인다. 고른 칸은 localStorage 'bullpen-nutrition-tab'(기기 편의).
2. SummaryCard(1256-1492) → '나의 하루' 카드. 머리 오른쪽 [자세히 | 한눈에] Segmented(localStorage 'bullpen-nutrition-detail'). 큰 숫자를 인아웃처럼 '{먹은 kcal} / {t.kcal} kcal'(text-numeric, 1335-1347 자리)로 바꾸고 '더 먹을 수 있는 양'은 그 밑 한 줄 '운동으로 {t.burn}kcal 더 · {left}kcal 더 먹을 수 있어요'(넘치면 '목표보다 {n}kcal 더 먹었어요' warn). 큰 숫자 왼쪽 링(1297-1333)은 '한눈에'에서만. 탄 {%} · 단 {%} · 지 {%} 알약 셋(먹은 열량 비율 carbs×4 · protein×4 · fat×9 ÷ kcal, 자료는 eaten 249)과 옆에 작게 '목표 {c}:{p}:{f}'(computeTargets 결과 g → %). 막대 셋 n / 목표 g(1409-1447)는 그대로. '자세히'면 당류 · 나트륨 줄(2차, dbChanges) + 정보 없음 안내(1449) + 체중 권유(1457) + assumed 안내(1484). '한눈에'는 큰 숫자 · 알약 · 막대만.
3. 새 '내 계획' 카드(components 는 nutrition/plan-card 가 아니라 nutrition/my-plan-card.tsx, hasProfile 일 때 '기록' 맨 위 · PC 오른쪽 열 맨 위): 기초대사량 {bmr} · 활동대사량 {tdee} · 운동 전 목표 {base}kcal ✎ · 탄단지 {C} · {P} · {F}g ✎ · 목표 {targetWeightKg}kg → 약 {etaWeeks}주 · 작은 예상 선(weight-forecast, 유지면 없음). ✎ 는 GoalSheet 를 그 줄로 연다(initialTab 'goal' + 새 focus 칸). 끼움 '추천 계획 완성'과 같은 부품(공용)이라 가입에서 본 화면이 탭에 그대로 있다.
4. GoalSheet(goal-sheet.tsx) [목표] 칸: 목표 Segmented(444-460) → 카드 5(goalKind, 나이별 거름) · 속도 · 목표 체중 · 언제까지 그대로(478-534) · 평소 움직임 그대로(541) · 단백질 g/kg Segmented(556-577)는 '탄단지 나누기' 묶음 안으로: 식단 계획 칩 3(macroPreset) + g 세 칸(ROW_INPUT 세 줄, 탄 고치면 kcalTarget · 단 → proteinTargetG · 지 → fatTargetG, 합계 줄과 % 가 즉시). 기존 '칼로리 직접' · '단백질 직접' 스위치(584-664)는 이 묶음으로 합친다(값은 같은 칸). 미리보기(667-722)에 활동대사량 줄 추가. [식단 취향] 칸(828-934) 그대로. 저장(251-311)은 saveNutritionProfile 에 goalKind · macroPreset · fatTargetG 를 더해 보내고 → saveDietPrefs 차례 그대로.
5. hasProfile 배너(437-453): 'NutritionProfile 없음 또는 onboardedAt null' 이면 '10가지 질문으로 내 계획을 만들어요' + [시작하기] → /nutrition/setup(끼움 마지막 줄). 목표가 이미 있는데 onboardedAt 만 없는 옛 계정은 배너 글을 '새 계획 화면으로 다시 정해 볼까요'로.
6. 끼니 칸(MealSection 1528-1832) · PlanCard · FoodSheet · EditRow · WeekStrip · DateNav 는 그대로. 당류 · 나트륨은 2차에서 EntryRow 에 작은 글로.

그대로 두는 것(손대지 않음)
- 홈 영양 전부: app/(app)/today/nutrition-card.tsx · today-rings.tsx 영양 링(83-95) · page.tsx:127-133 · lib/nutrition/advice.ts(내보내는 타입 AdviceInput · Advice · MoreToEat · MacroRange · TrainingKind · MealCheck 의 있는 칸) · advice-load.ts · advice-input.ts · lib/day-detail.ts nutrition 부분 · today/day-detail.tsx NutritionDetail · history.ts nutritionByDay · scripts/nutrition-advice-test.mts.
- 탭 맨 위 AdviceCard(1124-1245)는 같은 Advice 를 그리므로 모양만 두고 '나의 하루' 위에 그대로(오늘만). GuideCard 그대로.
- computeTargets 의 기존 숫자: 새 칸(macroPreset · fatTargetG)이 null 이면 1kcal 도 안 바뀐다(아래 calcChanges) — 홈 링 · 카드 · 달력이 같은 함수를 읽어서.
- 물 기록 · 단식 · AI 코치 · 캐릭터 · 사회적 증거 숫자: 넣지 않는다.

#### 계산 변경
모두 lib/nutrition/*(순수)에 '더하기만'. 새 칸이 비면 지금 숫자와 같다(셀프테스트 scripts/nutrition-selftest.mts:1313-1324 유지 2750 · 증량 3050 · 감량 2350, :182-196 BMR 1830 · 단백질 144 · 지방 76 그대로 통과해야 한다).

1. 활동량 5단계 ↔ 3단계(ACTIVITIES lib/nutrition/meta.ts:63-67 키 · 배수 그대로): 매우 적음 · 적음 → 'low' 1.3, 보통 → 'mid' 1.5, 많음 · 매우 많음 → 'high' 1.7. 일반 계산기의 1.725 · 1.9 는 쓰지 않는다 — 운동 · 투구는 OUT(lib/nutrition/burn.ts)으로 날마다 더해서 두 번 세게 된다(meta.ts:56-62). 화면 글만 투수식으로(16번). 소속 → 기본값: defaultActivity(level) = 초등학교 'mid' · 중 · 고 · 대학 · 프로 'high' · 성인리그 'mid' · 사회인 'low'(lib/nutrition/onboarding.ts, 미리 고르기만 · 저장은 사용자가 고른 activity).

2. 목표 5 → 3 접기 foldGoalKind(kind, age)(lib/nutrition/onboarding.ts) → { goal, proteinPerKg }:
   gain → ('gain', 나이 기본 ageRule(age).proteinDefault 1.8 · 1.5 · 1.2)
   muscle → ('gain', 성인 2.0 · 성장기 1.8 · 어린이는 카드 없음) — 속도는 기본(0.25)으로 두고 단백질만 높임
   maintain → ('maintain', 기본)
   lose → ('lose', 기본) — 성장기 −200(AGE_RULES.teen.goalDelta age.ts:85) · 어린이는 카드 없음(goalDelta null)
   lean → ('lose', 2.2) 성인만
   delta 는 지금 그대로 paceDelta(age, goal, rate)(age.ts:213) → base = kcalTarget ?? round10(bmr × factor + delta) + adjust(targets.ts:185). 어린이 · 성장기 규칙(effectiveGoal · effectiveProtein 당김 · effectiveAdjust)은 접은 뒤 그대로 걸린다. 홈 조언은 접은 goal 만 본다.

3. 활동대사량: Targets 에 선택 칸 tdee: number 추가(targets.ts:94-127) = round10(bmr × activity.factor). base 에서 역산하지 않는다(round10 · delta · adjust 때문). 부르는 곳(goal-sheet · nutrition-view · day-detail · advice-input · meal-plan · 셀프테스트)은 칸이 늘어도 안 깨진다.

4. 식단 계획(macroPreset) → 지방 몫: FAT_SHARE = { balanced: 0.25, carb: 0.20, protein: 0.25 }(targets.ts 새 상수), null → 0.25. fat = fatTargetG ?? round(max(kcal × share ÷ 9, 0.8 × W))(targets.ts:194). 바닥 0.8g/kg 은 그대로. 'protein' 프리셋은 계산이 아니라 저장 때 proteinPerKg = max(지금, 2.0)(성장기는 effectiveProtein 이 1.8 로 당김). 키토(탄수 제한)는 던지는 날 탄수화물 원칙 · 성장기 보호와 어긋나 없고, 비건은 avoidFoods 로.

5. 탄단지 g 직접 고치기(인아웃 17): 주인은 kcal 그대로.
   단백질 g → proteinTargetG(있는 칸, 10~450) · 지방 g → fatTargetG(새 칸, 20~200, 바닥 0.8 × W 밑이면 '지방은 N g 밑으로 못 내려요') · 탄수화물 g → kcalTarget = 4C + 4P + 9F(운동 전, 1,000~6,000 범위 검사 그대로 app/actions/nutrition.ts:815-823), manual = true.
   carbs = max(0, round((kcal − 4P − 9F) ÷ 4))(targets.ts:195) 그대로라 쉬는 날은 적은 C 와 같고, 운동한 날은 burn ÷ 4 만큼 저절로 늘어난다 — 화면이 '운동한 날은 탄수화물이 늘어요'로 말한다. % = (4C · 4P · 9F) ÷ kcal.

6. 목표 체중 · 속도 · 주 수(인아웃 8 · 10): targetRange(weight-goal.ts:456, 증량 지금 +0.5 ~ 110%(성장기) · 115%(성인), 감량 max(90%, BMI 20) ~ −0.5, 성인만) · 화면 즉시 '지금보다 ±Nkg' = target − now. 속도는 paceChoices(age, goal, refKg)(age.ts:226) 그대로(성인 0.25 | 0.35, 증량 0.35 는 70kg 이상, 성장기 한 가지, 어린이 없음) — 인아웃 연속 슬라이더 대신 Segmented 두 칸. 주 수 etaWeeks(|target − now|, rate)(weight-goal.ts:428, 52주 넘으면 null). '언제까지' 날짜 → 속도: pickPeriod(goal-sheet.tsx:375-412 를 lib/nutrition/period.ts 로 옮김) needed = remaining ÷ (dayGap ÷ 7), needed 이상인 가장 느린 속도, 없으면 가장 빠른 속도 + '약 N주 걸려요'. 예상 체중 선: w(k) = now ∓ rate × k(k = 0…weeks), 새 순수 함수 forecastWeights(now, target, rate) in weight-goal.ts(그림 부품 components/nutrition/weight-forecast.tsx).

7. 끼움 숫자의 출처(화면이 같은 함수를 부른다): 투구 한도 dailyPitchCap(age)(lib/report/plan.ts:56) · 휴식일 requiredRestDays(n)(:63) · 평소 부하 estimateDailyLoad(lib/baseline.ts:293) = 회수 × 구수 × 강도 ÷ 7 · 운동 부하 estimateTrainingDailyLoad(:320) · 운동 소모 kcalFor(MET 5, W, 60) = (5 − 1) × 3.5 × W ÷ 200 × 60(burn.ts:34, 75kg → 315kcal) · 불펜 40구 pitchingBurn('불펜', 40, 6, W)(:54) · 한 끼 단백질 mealProteinGoal(하루 ÷ 4, 20~40g · 어린이 15~30g, lib/nutrition/meal-protein.ts:38) · 기초대사량 basalKcal(targets.ts:144: 18세 이상 10W + 6.25H − 5A + s(남 +5 · 여 −161 · 모름 −78), 18세 밑 Schofield age.ts:179).

8. 체중 읽기 규칙은 안 바꾼다(load.ts:354-376 그날 → 30일 안 최근 → User.weightKg, recentWeightKg :198). 가입 · 설정이 User.weightKg 와 그날 DailyNutrition.weightKg 둘 다 적어 두 화면의 목표가 같고 체중 흐름의 첫 점이 생긴다. planSince 는 가입 날(planOnSave 규칙 그대로).

9. 시즌 단계 · 식단 스타일 · 끼니 구성 · 못 먹는 것은 계산이 아니라 식단 짜기(buildMealPlan meal-plan.ts:1043: styleScore :425 · 끼니 몫 · CONTAINS 꼬리표)와 트레이닝(app/(app)/training/page.tsx:255 seasonPhase)이 읽는다 — 키는 하나도 바꾸지 않는다(DB 문자열 · 시험 EXPECTED_AVOIDS).

10. 서버 검사 공용화: saveNutritionProfile(app/actions/nutrition.ts:795-937)의 검사 · 속도 · 목표 체중 · planOnSave 부분을 lib/nutrition/profile-save.ts(server-only) buildProfileData(input, user, prev, today)로 떼어 가입(trySignup) · 목표 창 · /nutrition/setup 셋이 같은 규칙으로 저장한다. 새 입력 goalKind(5 키 거름) · macroPreset(3 키) · fatTargetG(20~200) 추가, undefined = 저장값 그대로(ProfileInput :773-793 규칙).

시험: npm run nutrition:test(413)에 goalKind 접기 15가지 × 나이 3 · FAT_SHARE null 동일성 · fatTargetG 바닥 · 탄 고치기 → kcalTarget 왕복 · tdee · forecastWeights 사례를 더한다. npm run nutrition:advice-test(43)는 그대로 통과해야 한다(홈 안 바뀜의 증거).

#### DB 칸
- NutritionProfile.goalKind String? — 온보딩 · 목표 창의 원답 'gain'|'muscle'|'maintain'|'lose'|'lean'. null = 옛 줄(goal 로만 봄). 계산은 goal(접은 값)만 읽는다.
- NutritionProfile.macroPreset String? — 'balanced'|'carb'|'protein'. null = balanced(지방 25%, 지금과 같은 숫자). computeTargets 가 읽는다.
- NutritionProfile.fatTargetG Float? — 직접 정한 하루 지방 g(20~200). null = 계산. computeTargets 가 읽는다(proteinTargetG 와 같은 모양).
- NutritionProfile.onboardedAt DateTime? — 온보딩(가입 또는 /nutrition/setup)을 끝낸 시각. null = 옛 계정 · 안 함. 영양 탭 배너가 읽는다(hasProfile 만으로는 취향 저장만 해도 true 라 틀림, load.ts:556).
- 마이그레이션 prisma/migrations/20261008120000_nutrition_onboarding/migration.sql(손으로, 데스크톱에서 migrate diff 로 대조): -- AlterTable / -- 인아웃식 온보딩(2026-10-08). 넷 다 비워 둘 수 있어 이 칸을 모르는 코드도 그대로 돈다(비면 목표 숫자는 예전과 같다). / ALTER TABLE "NutritionProfile" ADD COLUMN     "fatTargetG" DOUBLE PRECISION, ADD COLUMN     "goalKind" TEXT, ADD COLUMN     "macroPreset" TEXT, ADD COLUMN     "onboardedAt" TIMESTAMP(3); — 절차: 김민에게 미리 알림 → npm run backup → schema 고침 → migrate deploy → generate → HANDOFF.md('받아서 npx prisma generate'). prisma format 금지.
- User: 새 칸 없음. heightCm · weightKg · birthDate · sex · throwingHand · competitionLevel · baseline* · trainingLevel 모두 있는 칸. 가입이 weightKg 를 새로 받아 적는다(lib/dal.ts:24-39 select 에 이미 있음).
- DailyNutrition: 새 칸 없음. 가입 · 설정이 그날 줄을 upsert(weightKg) — 체중 흐름의 첫 점(app/actions/nutrition.ts:286 setWeight 와 같은 20~250 범위, lib/profile.ts 20~200 과 맞춰 20~200 으로 통일).
- goal · activity 값 목록은 안 넓힌다(String 칸 그대로, GoalKey 3 · ActivityKey 3 유지 — AGE_RULES Record · advice.ts 규칙 · 시험이 모두 걸리는 값).
- [2차 · 사용자 확인 뒤] 당류 · 나트륨: MealEntry.sugarG Float? · MealEntry.sodiumMg Float? · UserFood 같은 둘(null = 모름) + MealPlan.items · MealCombo.items 는 Json 이라 칸만 더함 + Food · MealEntryView(meta.ts:128-169) · cleanFood(app/actions/nutrition.ts:95-141) · 음식 창 직접 입력 칸 · 식약처 변환(mfds-parse.ts:84 — 03 API 의 당류 · 나트륨 칸 번호 확인 필요) · 기본 음식표 foods.ts 542줄은 값이 없어 '모름'. 마이그레이션 따로(20261009…_nutrition_sugar_sodium).

#### 단계표
| 번호 | 이름 | 무엇 | 파일 | 시간 |
|---|---|---|---|---|
| 1 | 질문 정의 · 공용 온보딩 셸 | lib/onboarding/questions.ts(순수: id · title(answers) · why(answers, ageBand) · choices(answers, age) · visible(answers) · store) + components/onboarding/{shell,option-cards,number-unit-field,summary-card}.tsx. 셸 = ‹ 뒤로 44px · width 진행 막대(auth-form.tsx:113 꼴) · 제목 page-title · 부제 · 내용 · 바닥 BigButton h-12 알약 bottom: var(--kb). PC 분기는 AuthCard 두 칸(md:grid) 그대로 감쌈. velocity 의 OptionCards · StepBar 는 공용으로 복제(원본은 그대로, HANDOFF). 단계 넘김은 animate-step-next/back(globals.css:1216). | lib/onboarding/questions.ts · components/onboarding/* · (복제) components/velocity/setup-art.tsx · kit.tsx | 3 |
| 2 | 계산 더하기(순수) + 시험 | targets.ts: Targets.tdee · FAT_SHARE · fatTargetG 분기(null 이면 1kcal 도 안 바뀜). lib/nutrition/onboarding.ts: foldGoalKind · defaultActivity · GOAL_KINDS · MACRO_PRESETS. weight-goal.ts: forecastWeights. lib/nutrition/period.ts: pickPeriod · PERIOD_WEEKS(goal-sheet 에서 옮김). nutrition-selftest 에 사례 추가, advice-test 그대로 통과 확인. | lib/nutrition/targets.ts · onboarding.ts(새) · weight-goal.ts · period.ts(새) · meta.ts(글) · scripts/nutrition-selftest.mts | 2 |
| 3 | DB 칸 넷 + 저장 공용화 | schema NutritionProfile 네 칸 · 손 SQL · 데스크톱에서 backup → migrate diff 대조 → deploy → generate · HANDOFF. toProfile(load.ts:153) · ProfileInput(nutrition.ts:773) · saveNutritionProfile 검사를 lib/nutrition/profile-save.ts buildProfileData 로 떼기(목표 창 동작 그대로). GoalSheet 저장이 새 칸을 보냄. | prisma/schema.prisma · prisma/migrations/20261008120000_nutrition_onboarding/migration.sql · lib/nutrition/load.ts · lib/nutrition/profile-save.ts(새) · app/actions/nutrition.ts · HANDOFF.md | 1.5 |
| 4 | 가입 25단계로 재구성 + 끼움 7 | auth-form.tsx STEPS 를 questions.ts 에서 만들고(한 폼 · hidden 판 · noValidate · stepOfField · checkStep 유지, 영양 답은 hidden input), checkSignupEmail 을 22번 단계로, guardFormAction field 를 마지막 칸으로. trySignup: 영양 칸 읽기 → buildProfileData → prisma.$transaction(user.create + nutritionProfile.create + dailyNutrition.upsert). 끼움: 투구 한도 · 부하 지수 · 운동 소모 시트 · 계획 만드는 중 · 추천 계획 · 탄단지 · 요약 + 약속. 로그인 쪽(LoginForm)은 그대로. | app/login/auth-form.tsx · app/actions/auth.ts · components/onboarding/* · lib/onboarding/questions.ts | 5 |
| 5 | 휴대폰 · 앱 모양 맞추기 | 바닥 단추 --kb · 틀 h-[var(--vvh)] · 생년월일 type=date(coarse pointer) vs MiniCalendar(PC) · 시트(data-sheet) 둘 · in-data-[app=native] 분기 · 375 · 1536×700 · 1920×960 세 크기에서 넘침 0 · short: 여백. impeccable detect 는 데스크톱에서. | app/login/auth-form.tsx · components/onboarding/* · app/globals.css(필요하면 토큰만) | 2 |
| 6 | 영양 탭 '나의 하루' · [기록 | 통계] · 내 계획 카드 | SummaryCard → 큰 숫자 eaten / target · 탄단지 % 알약 · 자세히/한눈에 · 소모 줄. 휴대폰 위 고르개 [기록 ｜ 통계](오른쪽 열을 통계로). components/nutrition/my-plan-card.tsx(bmr · tdee · base ✎ · 탄단지 ✎ · N주 · weight-forecast) — 가입 끼움과 같은 부품. hasProfile/onboardedAt 배너. | app/(app)/nutrition/nutrition-view.tsx · components/nutrition/my-plan-card.tsx(새) · components/nutrition/weight-forecast.tsx(새) · app/(app)/nutrition/loading.tsx | 3 |
| 7 | 목표 창: 목표 카드 5 · 탄단지 나누기 · 식단 계획 칩 | GoalSheet [목표] 칸에 goalKind 카드(나이별) · '탄단지 나누기' 묶음(macroPreset 칩 3 + g 세 칸 연동 · 합계 · %) · 미리보기 활동대사량 줄. 기존 두 스위치를 묶음으로 합침(값 칸 같음). 저장에 goalKind · macroPreset · fatTargetG. | app/(app)/nutrition/goal-sheet.tsx · lib/nutrition/period.ts | 2 |
| 8 | /nutrition/setup 기존 사용자 온보딩 | (app) 안 전체 화면: questions.ts 의 11~21번 + 끼움 넷(계획 만드는 중 · 추천 계획 · 탄단지 · 요약) 같은 셸. 서버 동작 finishNutritionSetup(키 · 체중 · 목표 · 취향 · 그날 체중 · onboardedAt 한 트랜잭션, orOffline) → toast → /nutrition. setBarBack · data-nav push. | app/(app)/nutrition/setup/page.tsx · setup-client.tsx · app/actions/nutrition.ts(finishNutritionSetup) | 2 |
| 9 | [사용자 확인 뒤] 당류 · 나트륨 | MealEntry · UserFood 칸 둘(마이그레이션 따로) · Food 타입 · cleanFood · 음식 창 직접 입력 칸 · 식약처 03 당류 · 나트륨 칸 읽기 · 나의 하루 '자세히' 줄 · EntryRow 작은 글. 기본 음식은 '모름'. | prisma/schema.prisma · lib/nutrition/meta.ts · mfds-parse.ts · app/actions/nutrition.ts · food-sheet.tsx · nutrition-view.tsx | 3 |
| 10 | 시험 · 마무리 | npm run nutrition:test · nutrition:advice-test · npx tsc --noEmit · 바꾼 파일 eslint · 임시 경로 app/dev-preview-onboarding 으로 폰 375 · PC 두 높이 확인 뒤 지우고 서버 재시작 · 로그인 폼 회귀(자동 로그인 · 아이디 기억) · 패치노트(커밋 제목 · 본문) · HANDOFF(김민: generate · auth-form · app-shell 안 건드림 확인) · geum-yunho.md 진행 줄. | scripts/* · HANDOFF.md · docs/claude/geum-yunho.md | 1.5 |

#### 사용자에게 물을 것
- 가입 길이: 투구 3문항(6~8번)을 인아웃식 한 화면 한 질문으로 셋으로 나눌지, 지금처럼 한 화면에 셋(칩)으로 둘지. 셋으로 나누면 가입이 25화면(인아웃 23)이고, 합치면 23화면.
- 계정(이메일 · 비밀번호 · 약관)을 맨 뒤(22~24번)에 둬도 되나. 인아웃처럼 이름부터 묻지만, 20여 화면 답한 뒤 이메일이 중복이면 그 단계에서 막힌다(checkSignupEmail 미리 확인으로 끝까지 가서 막히진 않음).
- 목표 카드 다섯(증량 · 근육 키우기 · 유지 · 감량 · 군살만 빼기)으로 갈지, 셋(증량 · 유지 · 감량)만 두고 단백질은 식단 계획(21번)에서만 바꿀지. 다섯이면 성인에게 '감량'과 '군살만 빼기'의 차이(단백질 1.8 vs 2.2)를 카드 설명으로 가른다.
- 키를 가입에서 필수로 바꿔도 되나(지금은 선택 auth.ts:138-143). 필수여야 기초대사량 · BMI 바닥 · 목표 체중 범위가 짐작 없이 나온다. 서버는 옛 화면 호환으로 선택을 유지한다.
- 성장기 '천천히 빼기'(−200) 카드를 보일지 말지. age.ts 는 허용하지만 사용자 규칙 '성장기엔 덜 먹어라 없음'과 가까워서, 성장기엔 증량 · 근육 키우기 · 유지만 보이고 감량은 성인만으로 좁히는 쪽이 더 안전하다.
- 영양 탭 위 고르개를 [기록 | 통계] 둘로 할지, 인아웃처럼 [기록 | 단식 | 통계] 셋으로 할지. 단식 기능은 없고 투수 설계(던지는 날 탄수화물)와도 맞지 않아 빼는 것을 권한다.
- 당류 · 나트륨(인아웃 24번)을 2차로 넣을지. 기본 음식 542개에 값이 없어 '모름'이 대부분이고 식약처 '수집' 자료만 채워진다(HANDOFF: 수집 자료는 kcal · 단백질 · 당 · 나트륨만). 넣으면 DB 칸 둘 + 마이그레이션 하나 더.
- 물 질문(인아웃 11번)은 2026-09-25 에 뺀 기능(로드맵 '하지 않을 것')이라 넣지 않았다. 되살릴지.
- 체지방률 · 인바디(인아웃 18번 그림)는 칸이 없어 뺐다. 받을지.
- 큰 그림 카드의 그림: lucide 아이콘으로 갈지, setup-art 식 200×150 선 그림(currentColor)을 새로 그릴지(카드 10여 장 분량, 그리면 +2시간).
- /nutrition/setup(기존 사용자)을 온보딩이 없는 모든 기존 계정(onboardedAt null)에게 배너로 권할지, NutritionProfile 이 아예 없는 계정에만 권할지. 목표가 있는 계정이 다시 돌리면 planOnSave 로 체중 흐름 판정이 18일 뒤로 밀린다(바꾼 것만 보내게 짜면 피할 수 있음).
- 활동량 3단계 유지(권장) vs 5단계로 넓히기. 넓히면 ACTIVITIES 에 키 둘 추가(DB 변경 없음)지만 운동 OUT 과 두 번 세지 않게 배수를 낮게 잡아야 하고 세 키의 값은 지켜야 한다.
- 가입 뒤 첫 화면: 지금처럼 /today(CheckinGate 첫 체크인)로 갈지, 영양 탭 '나의 하루'로 보낼지. 투수 앱이라 홈(오늘 던져도 되는 양)을 권한다.
- DB 작업 시점: 김민에게 알리고 백업할 날짜(이 클라우드엔 .env 가 없어 migrate diff · deploy 는 데스크톱에서만 된다).


---

## ④ 합친 안(메인, 2026-10-08) — 연동 우선: 읽히지 않는 질문은 넣지 않는다

안 1(인아웃 충실)과 안 2(투수 우선)를 사용자 원칙 "질문에는 이유가 있고 답이 설정 · 계산 · 추천을 바꿔야 한다"로 심사해 합쳤다.
기준: 답이 계산(computeTargets · 부하 지수) · 설정(NutritionProfile · User) · 추천(식단 짜기 · 가이드) 가운데 적어도 하나를 바꾸면 남기고, 글 · 동기에만 쓰이면 뺀다.

### 뺀 것(두 안에서) 과 까닭
- 목표 이유 · 식단 경험 · 물 습관 · 운동 종류 · 코치 말투 · 기대감 · 손글씨 서명 · 사회적 증거 · 알림 허용 끼움 — 계산을 안 바꾸거나(이유 · 경험 · 기대 · 말투) 되살리지 않기로 한 기능(물) 이거나 기록에서 저절로 오는 것(운동 종류는 OUT 으로 셈)이다. 격려 · 설명은 끼움 화면이 숫자(실제 함수값)로 대신한다.
- 활동량 5단계 → **3단계 유지**(안 2): OUT 이중 계산 · 기존 사용자 목표 보호. 소속으로 미리 고른다(defaultActivity).
- 키토 · 비건 → **탄단지 프리셋 3**(균형 · 탄수화물 넉넉히 · 단백질 넉넉히, 안 2): 던지는 날 탄수화물 원칙 · 성장기 보호와 맞는다. 비건은 '못 먹는 것'으로.
- 탄단지 g 고치기의 주인은 **kcal**(두 안 같음): 단백질 → proteinTargetG · 지방 → fatTargetG · 탄수화물 → kcalTarget = 4C + 4P + 9F.
- 당류 · 나트륨 · 순탄수는 **2차**(DB 칸 둘 · 식약처 칸 번호 확인) — 사용자 확인 뒤.

### 가입 차례(질문 19 + 끼움 6 = 25화면)
| # | 화면 | 바꾸는 것 |
|---|---|---|
| 1 | 반가워요. 뭐라고 부를까요? | nickname → 뒤 제목에 이름 |
| 2 | 생년월일 (+ 성별 시트) | 나이 칸 · BMR · 투구 한도 · 소속 막힘 · 목표 카드 거름 |
| 끼움 | {나이}세는 하루 {dailyPitchCap}구까지예요 | — (실제 함수값) |
| 3 | 어느 손으로 던지세요? | 암케어 · 폼 · 구속 |
| 4 | 어디서 야구를 하세요?(소속) | 평소 움직임 미리 고르기(defaultActivity) · 또래 기준 |
| 5 | 평소 얼마나 던지세요?(횟수 · 구수 · 강도 한 화면, 셋 다 고르면 부하 숫자 count-up) | estimateDailyLoad → ACWR 씨앗 |
| 6 | 웨이트 횟수 + 경력(한 화면) | estimateTrainingDailyLoad · filterByLevel |
| 7 | 키 [cm｜in] | BMR · BMI 바닥 · 포즈 cm/px (온보딩에선 필수) |
| 8 | 지금 체중 + 목표 체중(targetAllowed 일 때만 둘째 칸, 범위 즉시 표시) | computeTargets · 체중 흐름 첫 점(DailyNutrition) · etaWeeks |
| 끼움 | 운동과 투구를 적으면 쓴 만큼 더 먹어요(시트, 체중으로 셈한 kcal 예) | — |
| 9 | {이름} 님, 몸을 어떻게 만들고 싶으세요?(카드 5, 나이별 거름 · 성장기는 감량 숨김) | goalKind → fold → goal · proteinPerKg → delta · protein |
| 10 | {목표 체중}kg 까지 얼마나 빨리?(목표 체중 있을 때만 · Segmented 2 + N주 + '언제까지' 칩) | weeklyRateKg · goalEndDate → paceDelta |
| 11 | 운동과 훈련을 뺀 하루는 어때요?(3단계, 소속으로 미리) | activity → tdee · base |
| 12 | 지금 시즌은 어느 때예요? | seasonPhase → 식단 짜기 · 트레이닝 |
| 13 | 탄단지는 어떻게 나눌까요?(프리셋 3 + 미리보기 g) | macroPreset → FAT_SHARE → fat · carbs |
| 14 | 어떤 음식을 주로 · 하루 몇 번에(한 화면) | dietStyle · mealPattern → 식단 짜기 |
| 15 | 못 먹거나 안 먹는 것 | avoidFoods → 식단 빼기 |
| 끼움 | 계획 만드는 중(답이 한 줄씩) → 추천 계획(bmr · tdee · base ✎ · 예상 체중 선) → 탄단지 g 고치기 | kcalTarget · fatTargetG · proteinTargetG |
| 16 | 이메일(중복 미리 확인) | — |
| 17 | 비밀번호 | — |
| 18 | 약관 | — |
| 19 | {이름} 님의 목표예요(요약 카드 + '던지는 날 앞뒤로 끼니를 거르지 않기로 약속해요' 체크) → [가입하고 시작하기] | trySignup 한 트랜잭션: User + NutritionProfile(onboardedAt · planSince) + DailyNutrition |

계정(16~18)을 뒤에 둔 까닭: 인아웃처럼 이름부터 묻고, 중복 이메일은 그 자리에서 미리 확인(checkSignupEmail)해 끝에서 막히지 않는다. 가입 뒤는 지금처럼 /today(첫 체크인).

### 영양 탭(홈은 손대지 않음)
안 2 그대로: 휴대폰 위 [기록 ｜ 통계] · '나의 하루'(먹은/목표 큰 숫자 · 탄단지 % 알약 · 자세히｜한눈에 · 운동 소모 줄) · '내 계획' 카드(bmr · tdee · base ✎ · 탄단지 ✎ · N주 · 예상 선, 가입 끼움과 같은 부품) · 목표 창에 목표 카드 5 + 탄단지 나누기 · 기존 사용자는 /nutrition/setup(질문 7~15 + 끼움 셋, 한 트랜잭션).

### 계산 · DB
계산(안 2 1~10, 모두 더하기만 · 새 칸이 비면 지금 숫자와 같다): Targets.tdee · FAT_SHARE · fatTargetG · foldGoalKind · defaultActivity · forecastWeights · period.ts · profile-save.ts 공용화.
DB: NutritionProfile 네 칸(goalKind · macroPreset · fatTargetG · onboardedAt) 한 마이그레이션(`20261008…_nutrition_onboarding`), 백업 → 김민 알림 → diff 대조 → deploy → generate.

### 단계표
| 번호 | 이름 | 시간 |
|---|---|---|
| 1 | 계산 더하기(순수) + 시험 — tdee · FAT_SHARE · fatTargetG · foldGoalKind · defaultActivity · forecastWeights · period.ts | 2 |
| 2 | DB 네 칸 + 저장 공용화(profile-save.ts) + HANDOFF(백업 · 김민 알림) | 1.5 |
| 3 | 질문 정의 questions.ts + 공용 온보딩 부품(셸 · 카드 · 숫자 칸 · 요약 · 예상 선) | 3 |
| 4 | 가입 마법사 19 + 끼움 6 · trySignup 트랜잭션 | 5 |
| 5 | 휴대폰 · 앱 · PC 모양(--kb · 시트 · 375 · 1536×700 · 1920×960) | 2 |
| 6 | 영양 탭 나의 하루 · [기록｜통계] · 내 계획 카드 | 3 |
| 7 | 목표 창 확장(카드 5 · 탄단지 나누기) | 2 |
| 8 | /nutrition/setup 기존 사용자 | 2 |
| 9 | 검증 · 마무리(tsc · eslint · nutrition:test · advice-test 그대로 · 임시 경로 확인 · HANDOFF · 메모) | 1.5 |
(2차 · 확인 뒤) 당류 · 나트륨 · 순탄수 | 3 |

### 사용자에게 물은 것(답이 오면 여기에)
1. 계정(이메일 · 비밀번호 · 약관)을 맨 뒤에 — 추천 그대로?
2. 성장기 '천천히 빼기' 카드 — 숨김 추천('성장기엔 덜 먹어라 없음' 원칙).
3. 당류 · 나트륨 · 순탄수 — 2차로 미룸 추천.
