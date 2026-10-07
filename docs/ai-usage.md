# 불펜 로그의 AI 사용 — 없음 (2026-10-07)

2026-10-07 김민(사용자): "AI 사용을 없애려고 해." → 앱에서 AI 를 모두 뺐다. 지금은 **AI 를 부르는 곳이 0** 이다.
숫자 · 판정 · 문장은 전부 코드(규칙)가 낸다.

| 예전 기능 | 지금 |
|---|---|
| 트레이닝 'AI 맞춤' | **'자동 맞춤'** — 규칙 초안(`lib/report/auto-setup.ts` 의 `decideAutoFence().draft`)으로 목표 · 시간을 정한다. 기다림 없음 |
| 분석 '리포트'(꺼져 있었음) | 지움 — /coach 는 투구 · 트레이닝 두 칸. 홈 하이라이트 · 투구 계획 줄 · 그래프가 대신한다 |
| 영양 '사진으로 담기'(꺼져 있었음) | 지움 — 바코드 · 식약처 검색 · 자주 먹는 조합 · 어제와 같이 · 식단 짜기 |

- 지운 것: `lib/ai/*` · `app/actions/ai-report.ts` · `coach/ai-report-card.tsx` · `lib/report/cadence.ts` · `lib/report/history.ts` ·
  `app/api/nutrition/photo` · `lib/nutrition/photo.ts` · `photo-match.ts` · `nutrition/photo-panel.tsx`, 패키지 `@anthropic-ai/sdk` · `zod`,
  처리방침의 Anthropic PBC 줄, 환경변수 `ANTHROPIC_API_KEY` · `AI_MODEL` · `AI_PHOTO_MODEL`(Vercel 에서도 지우고 콘솔에서 키 폐기).
- 남긴 것(DB 구조 그대로): `AiReport` 표(옛 리포트 10줄) · `DailyNutrition.photoCalls` 칸 · `DailyTrainingSetup.plan` JSON 안의 옛 `auto.by 'ai'` · `aiCalls`.
  지우려면 구조 변경이라 백업 · 친구에게 알림 · 2단계로 따로 한다.
- 미룬 것(TODOS.md): 자동 맞춤 규칙 보완(부위 강조 · 다시 만들기 다른 후보) · 분석 화면 문장 요약 카드.
- 예전 문서(어디서 · 얼마나 · 비용 표)는 git 기록에 있다.
