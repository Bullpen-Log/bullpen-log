# 영양 전체 점검 — 2026-10-16

김민 세션(영양 담당). 읽기만 했고 코드는 안 바꿨다. 근거는 파일:줄. ✔ 표시는 점검 뒤 코드를 다시 읽어 확인한 것.

- 시험: `nutrition:test` 486 통과 · `nutrition:advice-test` 42 통과 · 영양 파일 eslint 0 · tsc 영양 오류 0
- 이상 없음: 모든 액션 · API 의 userId 는 세션에서 · 수정/삭제는 userId 로 거름 · '오늘'은 모두 appNow · 저장 단추는 모두 orOffline ·
  AI 사진 기록 흔적 없음 · 조언에 상표/보충제 이름 없음 · 식약처 8,807줄 자료는 폰으로 안 내려감 · 식단 짜기는 못 먹는 것 · 보충식품을 모든 길에서 막음

## 1. 지금 구조

| 층 | 무엇 | 핵심 파일 |
|---|---|---|
| 표 | NutritionProfile(목표 · 취향) · MealEntry(먹은 것 = 1인분 값 × amount) · DailyNutrition(체중 · 식욕 카드) · MealPlan(짠 식단) · UserFood · MealCombo | prisma/schema.prisma |
| 계산 | meta · age(나이 규칙) → targets(기초대사량 × 활동 + 목표 몫 + 운동 소모) → weight-goal(체중 흐름) · fuel-check(7일 깃발) · guide(던지는 날) → advice(할 일 한 줄 · 점수) · meal-protein · nudge(순간 한 줄) | lib/nutrition/* |
| 음식 | 기본 음식 · 한글 검색 · 식약처(품목대표 8,807 + 포털) · 바코드(OFF) · 조합 · 식단 짜기(틀 192개) | foods · hangul · mfds* · barcode* · combos · meal-plan · meal-templates |
| 읽기 | loadNutritionDay(조회 약 14) · loadAdvice → day-detail(약 17, 홈과 공유) · loadFuelState(5) · popularFoods(10분 캐시) | lib/nutrition/load.ts · advice-load.ts · fuel-load.ts · popular.ts |
| 화면 | @nutrition/default → NutritionPage → NutritionView(2155줄) · food-sheet(1956) · goal-sheet(1070) · plan-parts · charts · setup | app/(app)/nutrition/* |

**다른 영역과 만나는 곳**(★ = 금윤호 영역)
1. ★ 투구 기록 그날 화면 → 던진 뒤 회복식 한 줄(nudge) — pitch-log/[date]/load.ts · day-client.tsx
2. 운동 끝 축하 화면 → 운동 뒤 단백질 한 줄 — workout/done
3. ★ 홈 링 '영양'(균형 점수) · 요약 칸 영양 장 · 캘린더 그날 칸 — today-rings.tsx · feed.tsx · day-detail.ts
4. ★ 투구 탭 던지는 일정 카드(throwPlan) → 가이드 · 조언 · 회복식이 읽음 — day-cards.ts
5. ★ 체크인 수면의 질 → 조언 '짧은 밤' 신호
6. 트레이닝 세션 · 투구 기록 → 목표 kcal 에 운동 몫 더함(burn-load)
7. 영양 추세 깃발 → 근력 프로그램 · 자유 운동 무게 올림 멈춤(fuel-load → program/next-weight)
8. ★ 분석 '잘 던진 날' → 전날 단백질
9. ★ 앱 틀: 판 넷이 늘 떠 있음 → 영양 판 조회가 어느 탭을 열든 돈다

## 2. 바로 고칠 것 — 사용자가 틀린 값 · 위험한 말을 봄

1. ✔ **못 먹는 음식을 조언이 권함** — advice.ts:309·325·378·415 · guide.ts · meal-protein.ts proteinTip 이 `prefs.avoid` 를 안 받음.
   달걀 · 유제품을 뺀 사람(알레르기 포함)에게 매일 '달걀 2개 + 우유' · '자기 전 우유'. → avoid 를 넘겨 예시를 SUBSTITUTES 로 거르기.
   같은 묶음: ✔ `finishNutritionSetup`(actions/nutrition.ts:862~)이 오늘 식단에서 새로 뺀 음식을 안 걷음(saveDietPrefs:667 만 dropAvoided).
2. ✔ **성장기도 하루 칼로리를 1,000kcal 까지 직접 정할 수 있음** — profile-save.ts:149(나이 무관), 단백질 직접값 10g 까지.
   '성장기 덜 먹어라 금지' 규칙을 우회. 계산값에도 기초대사량 바닥 없음(targets.ts:210 — 성인 여 50kg 감량이면 base 1,150 < 기초대사량 1,189, 에너지 부족 위험).
   → 미성년은 직접값 바닥 = 계산 base, 모두 base ≥ 기초대사량.
3. ✔ **홈 요약 칸 '최근 7일 평균 kcal' 이 틀림** — today/feed.tsx:46~58 이 `kcal` 만 더함(amount 안 곱함). 1.5인분 담으면 1인분으로 셈. ★ 금윤호 파일 → HANDOFF.
4. ✔ **← → 키가 다른 탭에서도 영양 날짜를 바꿈** — nutrition-view.tsx:689 useArrowKeys 가 window 에 늘 붙음. 판 넷이 늘 떠 있어서
   PC · 키보드 아이패드의 홈 · 트레이닝 화면, 녹화 편집기 프레임 이동까지 가로챔. → 영양 판이 보일 때만.
5. **모르는 탄 · 단 · 지를 0 으로 셈** — day-detail.ts:184 → advice-input.ts:102 → advice.ts:253. 탭은 '모름'으로 보이는데
   조언은 '탄수화물 N g 더' · 점수 깎음, 식단 짜기는 단백질 더 얹음(actions/nutrition.ts:431). → 모르는 칸은 빼고 셈.

## 3. 고치면 좋은 것 — 정확도 · 안정

**계산 · 문구**
1. ✔ 오후 '오늘 등판'(아직 투구 기록 없음): 홈은 '던진 뒤 1시간 안에'(advice.ts:362~), 탭 가이드는 '3~4시간 전 든든히' — 같은 시각 반대말.
2. 회복 단백질을 두 곳에서 따로 셈 — 홈 '25~35g' vs 탭 · 투구 화면 '25g'(advice.ts:273 vs guide.ts:114). meal-protein 범위 하나로.
3. 조언 예시가 적은 g 을 못 채움 — '우유 2컵 + 바나나' ≈14g 인데 문구는 20~40g(advice.ts:309·325·471). guide 는 시험까지 있는데 advice 엔 없음.
4. 성장기 단백질 권장 범위를 성인 1.6~2.2g/kg 로 보임(advice.ts:123·216) — 성장기 최대 1.8 넘음. 만 18세가 지나도 저장된 1.5g/kg 그대로(onboarding-answers.ts:126).
5. ✔ '평소 움직임' 글이 '주 3~4일 운동 · 거의 매일 운동'(meta.ts:66) — 운동을 뺀 생활이어야 하는데, 앱에 적은 운동을 또 더해 이중 계산 소지.
   중 · 고 · 대 · 프로는 '많음'(1.7) 기본. 감량 카드 '−300kcal 부터'인데 기본 속도는 −400(onboarding.ts:126 vs age.ts:347).
6. 직접 kcal 이 낮으면 탄수화물이 0 으로 잘려 탄단지 합 > 목표(targets.ts:223, 예: 1,000kcal 목표에 합 1,440).
7. 생년월일 모르는 옛 계정은 성인 한도(−400) · 쉐이크 허용(targets.ts:189 · age.ts ageBand(null)='adult'). 처음 쓰는 사람 음식 목록에 쉐이크가 미성년에게도 보임(foods.ts:504).

**저장 · 데이터**
1. ✔ 인기 음식 순위가 '담긴 횟수' 먼저 + 식약처 값 검증 없음(popular.ts:58 · actions:109) — 한 사람이 가짜 이름 · kcal 을 반복해 담으면 모두의 음식 창 1위.
2. ✔ 내 음식 300개 저장 · 화면은 100개만 읽음(load.ts:344 vs actions:337) — 101번째부터 사라지고 별이 꺼진 채 보임.
3. ✔ 식단 '먹었어요'가 검사에 떨어진 줄도 완료 처리(actions:508) — 기록 없이 계획에서만 사라짐.
4. ✔ '식단 지우기' 확인 · 되돌리기 없음(plan-parts.tsx:289), '짜는 중'에도 눌려 지운 계획이 되살아날 수 있음.
5. 날짜를 옮겨도 끼니 편집 상태 · 오류 띠가 따라감(nutrition-view.tsx:565 — `?date=` 가 화면 키에 안 들어감).
6. '어제와 같이' · 조합 담기 두 번 누르면 두 벌(food-sheet.tsx:654·827). addMealEntries 중복 방지 열쇠 없음(actions:170).
7. 목표 창 저장이 둘로 갈림(목표 → 취향) — 뒤만 실패하면 앞은 저장된 채 실패로 보임(goal-sheet.tsx:328).

**검색 · 바코드**
1. 식약처 상품 검색이 일부 실패해도 말없이 품목대표만(mfds.ts:270) — 화면은 최대 18초 돌다 멈춤. 포털이 죽어도 새 검색어마다 호출.
2. 검색 · 바코드 API 에 사용자별 호출 제한 없음(search/route.ts:42) — 식약처 하루 한도를 한 사람이 다 쓸 수 있음.
3. 한글 치는 중간('닭가슴사' · '닭ㄱ')을 못 맞춰 목록이 비었다 참 + 그 미완성 말로 포털 호출(hangul.ts:62).
4. 같은 바코드가 12 · 13자리로 갈라져 내가 적은 음식을 다른 읽개에서 못 찾음(barcode.ts:45). OFF '없는 제품'도 일주일 저장(barcode-lookup.ts:49).

## 4. 속도 — 조회가 너무 많음

1. **음식 하나 담을 때마다 네 탭 전부 다시 계산** — 판 넷이 늘 떠 있는데 영양 액션이 revalidatePath 를 부름(actions:184 외).
   영양 판 하나가 조회 약 23개(공유분 포함 36). 식욕 카드 · 첫 설정은 그 뒤 router.refresh 로 한 번 더. ★ 앱 틀과 얽힘 → 금윤호와 맞춤.
2. 그릴 때마다 1년치 식사 기록을 읽고, 같은 표를 42일 · 30일 · 그날로 또 읽음(load.ts:296·325·354) — 기록이 쌓일수록 모든 탭 첫 로드가 느려짐.
3. 같은 자료를 여러 번 — NutritionProfile 3번, 오늘 DailyNutrition · 투구 · 세션 · 체크인 각 3번(advice-load.ts:26 · fuel-load.ts:42).
4. 식단 짜기 · 체중 권유 단추가 탭 전체 읽기(조회 14)를 부르고 또 다시 그림(actions:415·835).
5. PitchLog 색인 없음 — HANDOFF 에 김민 앞 할 일로 대기 중. 영양 로더도 한 번 그릴 때 세 번 훑음.

## 5. 정리 — 코드 건강

1. **큰 파일**: nutrition-view 2155줄(날짜 · 오늘 카드 · 끼니 · 체중 · 저장 함수로), food-sheet 1956줄(조합 · 둘러보기 · 줄 · 직접 입력 · 검색 hook),
   goal-sheet 1070줄, meal-plan.ts planDay 한 함수 약 750줄(고칠 때마다 특례가 붙는 구조).
2. **죽은 코드**: 안 쓰는 액션 updateMealAmount · deleteMealEntry(actions:188·282) · legacySex(actions:810) · DailyNutrition.photoCalls 칸 ·
   seasonPhase 갈래(늘 null) · NutritionDay.burnItems(매번 보내는데 안 읽음) · advice 의 weight(늘 null) · timing 점수 조각 · GuideCard bare 가지 ·
   영양 튜토리얼 슬라이드(안 뜸) · 안 쓰는 내보내기 8개.
3. **이미 있는 부품을 안 씀**: 스위치(SwitchRow) · 펼침(Expand) · 조사(withJosa) · 날짜/나이 도우미(days.ts · ageFromBirthDate) · 양 −/+ 칸 3벌 · 작은 달력 판 2벌
   (트레이닝 쪽만 320px 넘침 고침 — 영양 원본은 오른쪽이 잘림, nutrition-view.tsx:807).
4. **화면 규칙**: 색 다섯이 섞임(nutrition-view.tsx:1007·1026·1532·1467·896) · 휴대폰 누르는 자리 40px 미달 10여 곳(닫기 24px 포함) ·
   줄표 2곳(nutrition-steps.tsx:409·574) · 문장 속 굵게 3곳 · 낡은 안내 '내 정보(오른쪽 위 내 사진)'(goal-sheet.tsx:846) · 로딩 뼈대가 휴대폰에서도 두 열.
5. **시험 구멍**: 식약처 순위 정답표(50개 · NDCG)가 저장소 밖 스크래치에만 · 알레르기(조언) · 모르는 탄단지 · 설정 저장 빼기 · 한글 조합 중간 · 바코드 같은 값 시험 없음.
   plan-parts 가 식단 틀 표(약 17KB)를 폰으로 끌고 옴 · mfds-reps.ts 에 server-only 없음.

## 6. 정할 것 — 제품 방향

1. **10-14 정리 때 자세한 정보를 숨기지 않고 지움** — 까닭 · 권하는 범위 · 점수 조각 · 운동별 소모는 계속 계산해 보내는데 안 그림.
   규칙 '겉은 단순, 누르면 자세히'와 어긋남. 되살릴지(점수 · 링을 누르면 시트) 계산을 걷을지.
2. **끊긴 곳**: '언제까지'(goalEndDate) 저장만 · 분석 화면이 13개월 체중 · kcal 을 읽고 안 그림 · 트레이닝 '이렇게 짰어요'의 체중 흐름 줄(nutritionTrend) 안 이어짐 ·
   트레이닝 첫 설정이 영양 체중을 조회만 함 · 영양 추세 깃발은 7일 중 5일 기록해야 서서 사실상 안 뜸.
3. **순간 한 줄(오늘 만든 것)**: 감량 목표를 늘 '유지'로 넘김(nudge.ts:88) · 구속 측정 저장 · 재활 불펜에도 뜸 · 운동 뒤 줄이 힘듦 칩 위(설계는 밑) ·
   금윤호 파일(pitch-log/[date])을 고쳤는데 HANDOFF 안 적음(cf0db02b) · 숙제(사회인 투수 3명 인터뷰) 결과 없음 · 반응 표가 없어 4주 판정의 숫자 갈래를 못 잼.
4. **식욕 · 끼니 카드(설계 열린 질문)**: '식욕만 식단 짜기에 쓰인다'는 전제가 틀림 — 끼니 양 · 걸른 끼니도 홈 · 탭 조언이 읽음. 지우면 안 적는 날 조언이 빔.
5. **성장기 기준이 셋**: 영양 만 18세 미만 · 트레이닝 만 16세 미만(D4) · 투구 한도 만 19세 미만. 일부러면 age.ts 머리에 적기.
