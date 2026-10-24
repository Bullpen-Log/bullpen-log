# Dugout Lessons — PC redesign prompt

> Written 2026-10-24 for 금윤호. Paste the block below into a fresh Claude Code session in this repo.
> User-facing text in the product stays Korean (해요체, no em dashes). This prompt is English by request.

---

## Role and goal

You are redesigning the **Lessons tab of Dugout** (the web site of this repo, route group `app/(dugout)/lessons`) so that it feels like a **polished desktop product** on PC, while keeping the current phone layout intact. Today every lesson screen is a single narrow centered column (`max-w-2xl`, phone-style "‹ back + centered title" header from `components/dugout/lesson-frame.tsx`). On a 1440px screen that leaves ~65% of the width empty and reads like a stretched mobile app.

Target feeling: **Doctor-Now's flow and trust signals, laid out like a modern desktop marketplace** (think Airbnb / Soomgo / class101 on desktop): wide multi-column layouts, a persistent filter rail, a sticky booking panel, generous whitespace, calm motion. Keep Dugout's own identity: green brand (`[data-brand='dugout']` maps `sky` → green), Pretendard-like system type, rounded cards, the existing round icon set (`@/components/icon`, `components/round-icon.tsx`).

## Read first (do not skip)

1. `AGENTS.md`, `HANDOFF.md`, `docs/claude/geum-yunho.md` (project rules: shared production DB, no `prisma migrate dev`, push only on request, Korean commit messages, no secrets).
2. Next.js in this repo has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before touching routing or data fetching.
3. Current screens and parts:
   - `app/(dugout)/lessons/page.tsx` (hub), `list/page.tsx` (coach list), `compare/page.tsx`, `[orgId]/page.tsx` (coach detail), `[orgId]/book/page.tsx` (booking), `find/find-wizard.tsx` (one-question-per-screen finder)
   - `components/dugout/lesson-frame.tsx`, `coach-card.tsx`, `coach-list.tsx`, `lesson-book-form.tsx`, `lesson-feed-card.tsx`
   - Rules and data: `lib/market/lessons.ts` (`matchCoach`, `reviewSummary`, `nextOpenLabel`, labels), `lib/market/lesson-load.ts`
   - Reference for the desktop language already used elsewhere in Dugout: `components/dugout/dugout-topbar.tsx`, `app/(dugout)/market/page.tsx`, `app/(dugout)/venues/page.tsx` (map + list split).
4. Design rules: run the `impeccable` skill context once (`sh ~/.claude/skills/impeccable/scripts/impeccable context`), read `reference/craft-floor.md` before UI edits, and run `impeccable detect --json <changed files>` after.

## Constraints

- **Phone stays as is.** All new layout is behind `md:` / `lg:` breakpoints. At 375px the screens must look and behave exactly like today (verify by DOM measurement, no horizontal overflow).
- **No data or DB changes.** Same loaders, same server actions, same URLs and query params (`/lessons/list?...`, `/lessons/compare?ids=`). Filters keep living in the URL.
- **No new npm packages.** Tailwind v4 tokens already in `app/globals.css`; reuse `Button size=…`, `Segmented`, `Modal`, `EmptyState`, icons from `@/components/icon`.
- Korean UI copy, 해요체, short, no em dashes, no bold inside sentences.
- Motion: `motion-safe:` on every transition; enter 160 to 200ms, exit about 120ms, ease-out; no bouncing on content. Respect the global reduced-motion safety net.
- Accessibility: visible focus rings, 44px hit targets on touch, 32px minimum on desktop, semantic headings, `aria-current` on selected filters.

## Plan (do in this order, commit after each step with a Korean message)

### 1. Desktop frame for lessons (`lesson-frame.tsx`)
- Keep the phone header. On `md+`, replace the centered "‹ title" with a left-aligned page header: breadcrumb (`레슨 › 코치 목록`), large title (24px, font-black), one-line subtitle, optional right-side actions slot. Content width `max-w-6xl` to match the rest of Dugout (top bar and home use `max-w-6xl`).
- Add a `layout` prop: `'single' | 'rail' | 'detail'` so each page picks a desktop grid without duplicating markup.

### 2. Hub (`/lessons`)
- Desktop hero band: left = big search field ("코치 · 레슨장 · 동네") + primary CTA "나에게 맞는 코치 찾기"; right = a small trust panel (number of public coaches, average rating, typical response time from `bookings.confirmedAt`).
- Category row becomes a 2-row grid of larger tiles (icon + label + coach count) instead of a horizontal phone strip.
- "추천 코치" becomes a 3-column card grid (`lg:grid-cols-3`), "오늘 · 내일 가능" a horizontal shelf of compact cards with "다음 가능 시간" chips, "내 레슨" moves into a right sidebar card when logged in.

### 3. Coach list (`/lessons/list`)
- `lg`: left **sticky filter rail** (260px): specialty, audience, region, price range, weekday/time band, preferences; each group collapsible; a "필터 초기화" link. On phone keep today's chip row.
- Center: sort `Segmented` + result count in a header row; coach cards in a 2-column grid on `lg`, 1 column on `md`. Card desktop variant: avatar circle (initial for now), name + org, rating and review count, "왜 추천" chips from `matchCoach`, price from / trial price, next open slot, and two actions ("자세히", "비교함에 담기").
- Compare tray: on desktop a floating bottom bar (max 3) with mini avatars and "비교하기" button, slides up with `motion-safe` transform.

### 4. Coach detail (`/lessons/[orgId]`)
- `lg`: two columns. Left (main): header block (avatar, name, org, region, rating summary), tabs or anchored sections (소개 · 경력 · 전문 · 후기 · 위치). Review summary as a horizontal bar chart (star distribution) and "좋았던 점" tag cloud with counts.
- Right: **sticky booking panel** (`top-24`): price from / trial price, slot length, weekly availability mini-calendar (next 7 days with open counts), primary "레슨 요청" button, small trust lines (확정까지 보통 N시간, 결제는 아직 저장만). On phone keep the bottom fixed CTA.
- If the org has coordinates (`Org.lat/lng`, added 2026-10-24), show a small static location card that links to `/venues?kind=lesson` (the Kakao map page). Do not embed a second map instance.

### 5. Booking (`/lessons/[orgId]/book`)
- `lg`: left = steps stacked as clear cards (날짜 → 시간 → 누가 → 무엇을 → 결제 수단 → 메모) with completed steps collapsing to a one-line summary; right = sticky summary card (coach, chosen slots, price, policy) with the submit button. Phone layout unchanged.
- Date strip: on desktop show a 2-week calendar grid instead of the horizontal 14-day strip.

### 6. Compare (`/lessons/compare`)
- Real comparison table on desktop: sticky first column (row labels), one column per coach (max 3), highlight the best value per row (lowest price, highest rating, fastest confirm) with a subtle green tint, CTA row at the bottom.

### 7. Finder (`/lessons/find`)
- Desktop: keep one question per step but put it in a centered card (`max-w-xl`) with a left progress rail listing the five steps and answers so far; allow clicking a previous step to edit.

### 8. Motion and polish pass
- Cards: hover lift (`translate-y-[-2px]`, shadow from none to soft) only on pointer-fine devices (`desk:` variant exists in globals.css).
- Filter changes: keep scroll position (`scroll={false}`, `data-nav="none"` on same-page filter links); results fade in 160ms.
- Skeletons for list and detail that match the new desktop grids (no layout shift).
- Empty states use `EmptyState` with an icon and one clear action.

## Verification (required before saying done)

- `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run dugout:test`.
- Browser at **1440×900, 1536×700, 1920×960** and **375×812**: no horizontal overflow (`getBoundingClientRect().right <= innerWidth`), sticky panels stay inside the viewport on 700px height, phone screens identical to before (compare screenshots).
- Dark theme and navy theme check on desktop.
- Do not create test accounts or bookings in the shared DB. Use a temporary `app/dev-preview-*` route with fake data if needed, delete it after, then restart the dev server.

## Deliverable

A short Korean report: what changed per screen, screenshots at 1440 and 375, anything not verified, and the commit hashes. Do not push until the user says "올려줘".
