# 앱 화면 공통 부품 — 웹과 같은 느낌으로 (2026-10-18 · 네이티브1)

김민: "하단 바도 다르고 느낌도 다르다". 앱 화면을 웹 휴대폰과 같게 맞출 때 아래 부품 · 값을 쓴다. 화면마다 손으로 크기 · 색을 정하지 않는다.

## 값 — `native/src/lib/ui.ts`

| 이름 | 무엇 | 웹 |
|---|---|---|
| `c.float` | 카드 그림자 네 겹(다크 · 네이비는 가장자리 빛). 카드에 `{ backgroundColor: c.card, boxShadow: c.float }` | `--card-float` |
| `c.skyTint` · `c.skyStrong` | 하늘색 판 · 짙은 하늘 글자(안내 카드 · 칠한 아이콘) | `sky-tint` · `sky-strong` |
| `c.warnBg` · `c.warnLine` · `c.warn` | 주의 카드(통증 · 회복) — 빨강 말고 주황 | `warn-*` |
| `c.dangerBg` · `c.dangerLine` | 위험 판 | `danger-*` |
| `TYPE.title` | 큰 제목 34 · 굵기 800 · 자간 −1 | `.text-heading` |
| `TYPE.heading` | 카드 제목(크기만 덧붙임) | `.text-heading` |
| `TYPE.num` | 둥근 고정폭 숫자(SF Pro Rounded) — `[TYPE.num, { fontSize: 28 }]` | `.text-numeric` |
| `SPACE` | 카드 안 20 · 카드 사이 16 · 큰 덩이 사이 24 · 양옆 16 | `--block-pad` 등 |
| `PRESSED` | 누른 카드 0.985 배 — `style={({ pressed }) => [..., pressed && PRESSED]}` | `[data-pressed]` |

탭 첫 화면 위 여백은 `inset.top + SPACE.section`(24).

## 부품 — `native/src/shell/heading.tsx`

- `PageHead title="트레이닝"` + 자식(오른쪽 도구) — 웹 PageHeading inlineAction 과 같은 큰 제목 줄.
- `AnalysisPill view="training"` — 44pt 옅은 면 + 파란 그래프 '분석'.
- `ToolCircle icon="…" label="…"` — 그림만 있는 40pt 동그라미.
- `Segmented options value onChange label` — 회색 바탕 위로 흰 칸이 미끄러지는 고르개(칸 40pt).

## 하지 않는 것

- **당겨서 새로고침(RefreshControl) 없음** — 웹이 2026-10-15 에 뺐다. 화면에 돌아올 때(useFocusEffect) · 앱을 5분 넘게 떠났다 올 때 새로 받는다(홈 `home/tab.tsx` 참고).
- **체크인은 `openCheckin(next?)`**(`native/src/shell/web-nav.ts`) — 앱 전용 체크인 화면(`app/checkin.tsx`)은 지웠다. 웹의 한 화면 흐름(3D 몸 그림 · 쉬라는 카드)을 연다. 끝나면 `next`(웹 주소, 없으면 홈)로.
- 경고를 빨간 테두리 흰 판으로 그리지 않는다 — 주의는 주황 판(`warnBg` · `warnLine`), 위험만 빨강.

## 네이티브1 이 다른 세션 파일에 한 줄씩 고친 것

- `native/src/training/tab.tsx` · `native/src/app/training-today.tsx` · `native/src/app/training-armcare.tsx`: 체크인 열기 `router.push('/checkin', …)` → `openCheckin('/training?view=home')`.
