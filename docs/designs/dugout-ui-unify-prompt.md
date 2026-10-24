# Dugout UI unification — prompt

> Written 2026-10-24 for 금윤호 ("each tab's UI isn't unified. I want everything to feel like Home and Market").
> Paste the block below into a fresh Claude Code session in this repo. Product copy stays Korean (해요체, no em dashes); this prompt is English by request.

---

## Goal

Make every Dugout tab (`app/(dugout)/*`) look and behave like **one product**, using **Home (`app/(dugout)/page.tsx`) and Market (`app/(dugout)/market/page.tsx`) as the reference design**. Today each tab invented its own header, width, chip style, section title and card. The fix is not to restyle each page by hand. Extract the Home/Market language into a small set of shared Dugout primitives, then move every tab onto them, one tab per commit.

Done means: a user switching tabs on PC (1440px) or phone (375px) sees the same page frame, the same header shape, the same section headings, the same chips and the same card families. Only the content changes.

## Read first

1. `AGENTS.md`, `HANDOFF.md`, `docs/claude/geum-yunho.md`. Key rules: shared production DB (no test accounts or bookings), never `prisma migrate dev`, push only when the user says "올려줘", Korean commit messages ending with the Co-Authored-By line, no secrets.
2. Next.js in this repo has breaking changes. Read the relevant guide in `node_modules/next/dist/docs/` before touching routing or layouts.
3. The reference screens and their parts:
   - Home: `app/(dugout)/page.tsx` (its local `SectionHead`: small eyebrow, 20px bold title, "더보기 ›"), `components/dugout/dugout-main.tsx` (white top band, big logo, search, icon row), `market-hero.tsx`, `games-panel.tsx`, `listing-card.tsx`.
   - Market: `app/(dugout)/market/page.tsx`. Full-bleed white band via `before:bg-surface before:w-screen`, an underline category row (17px bold, `border-b`), a dark banner carousel, 72px `rounded-[22px]` shortcut tiles, a 26px black page heading, black-pill sort and filter chips, and a 2/3/5/6-column photo grid with `gap-y-10`.
   - Frame: `app/(dugout)/layout.tsx`, `components/dugout/dugout-shell.tsx`, `dugout-topbar.tsx` (Bunjang-style two rows, `max-w-6xl`).
4. Every other tab, to audit: `community/*`, `lessons/*` (just redesigned for PC with `components/dugout/lesson-frame.tsx`, `lesson-filter-rail.tsx`, `coach-card.tsx`), `venues/*` (`place-map.tsx`), `baseball/*` (`game-parts.tsx`, `[id]` detail with comments), `search/page.tsx`, `chat/*` (`chat-shell.tsx`, two-pane DM), `me/*`, `notifications/page.tsx`, `u/*`, `gear` (`gear-guide.tsx` popup), `pay/*` (`pay-shell.tsx`), `market/[id]`, `market/new`, `market/[id]/edit`.
5. Design process: run the `impeccable` skill if it is installed (`sh ~/.claude/skills/impeccable/scripts/impeccable context`; read `reference/craft-floor.md` before UI edits, run `impeccable detect --json <files>` after). If it is not installed on this machine, say so in the report and continue.

## Step 0. Audit before designing (write it down)

Screenshot every Dugout route at **1440×900** and **375×812**, logged out, in light theme. Then make a table in `docs/designs/dugout-ui-audit.md` with one row per route and these columns: content width, page header (font size, weight, eyebrow or breadcrumb, actions), section title style, chip style (active and idle colors, height, radius), card families used, empty state, background (white band or gray page), and phone differences.

Known drift found on 2026-10-24, to confirm and extend:

- **Widths:** Home and Market use `max-w-6xl`, Lessons is `max-w-2xl` on phone and `lg:max-w-6xl`, Baseball is `max-w-4xl`, Search mixes `max-w-2xl` and `max-w-5xl`, Notifications is `max-w-2xl`, Me has its own layout.
- **Page headers:** Market has a 26px black h1 with no eyebrow. Baseball has a "덕아웃 야구" eyebrow and a 24px title. Lessons has a breadcrumb, a 24px title and a bottom border. Venues has a 24px title and a gray subtitle. Me and Notifications use 24px black. Search uses 20px bold. Chat uses 20px black.
- **Chips:** Market and Baseball use black active pills. Lessons and Venues mix green (`bg-sky`) active chips with bordered idle chips. The lesson filter rail uses `rounded-lg` blocks.
- **Section titles:** Home uses eyebrow + 20px bold + "더보기 ›". Lessons uses `SectionTitle` (14 to 16px). Search uses 15px with an icon. Baseball uses 18px.
- **Backgrounds:** Home and Market sit on a full-bleed white band. Other tabs sit straight on the gray page.
- **Community** redirects logged-out users to `/login`. That is a product decision. Do not change it, but note that its header and empty state should still match.

Review the audit twice before designing: once for "what is Home/Market actually doing", once for "which differences are content-driven and should stay" (for example, chat must stay full-height and two-pane, and the map page needs a tall split).

## Step 1. Write the rules (one short spec, then code)

Add a section to `docs/designs/dugout-ui-audit.md` named "Dugout UI rules" that fixes these decisions. Derive them from Home/Market; when Home and Market disagree, prefer Market.

- **Frame:** content width `max-w-6xl` for every tab. Exceptions, each named and justified: chat (full width two-pane), auth or forms (`max-w-xl` centered card), and detail reading pages if a narrower column reads better (`max-w-3xl` body inside a `max-w-6xl` frame).
- **Top band:** every tab's first screen starts with the same full-bleed white band, in Market's style. The band holds the page header plus that tab's primary navigation (category underline row or tab row). Below it, the gray page holds content. Build this once (`DugoutBand`); do not copy the `before:` trick into every page.
- **Page header:** one component (`DugoutPageHeader`). It has an optional eyebrow (13px muted), a title (26px black, `tracking-tight`; mind that `desk:` lowers 16px+ text, so use the same class Market uses and verify the rendered size), an optional one-line subtitle, and a right-side actions slot. Breadcrumbs only on depth ≥2 pages (detail, booking, compare), and small.
- **Primary in-tab navigation:** Market's underline category row is the standard for "switch the list's category" (Market categories, Community boards, Lessons specialties, Venues kinds, Baseball leagues). Market's 72px shortcut tiles are the standard for "jump to a feature" rows (Home icon row, Lessons hub categories).
- **Chips:** one `Chip` and one `ChipRow`. Active is a black pill (`bg-ink text-page`, readable in dark theme). Idle is a gray fill (`bg-ink/6`). Height 32px on desktop and 36 to 40px on touch. Green (`sky` under `[data-brand='dugout']`) is reserved for primary CTAs, status (open now, confirmed) and links, never for selected chips.
- **Section heading:** promote Home's `SectionHead` to a shared component (eyebrow, 20px bold title, optional count, "더보기 ›" link on the right). Use it for every content section in every tab.
- **Cards:** at most three families.
  1. **Photo card:** Market `listing-card.tsx`. Borderless image, price first. Used for listings and venues with photos.
  2. **Bordered info card:** Home coach card and `CoachTile`. `rounded-2xl border border-line bg-surface p-5`, desk-only hover lift. Used for coaches, venues without photos, games.
  3. **List row inside one card:** `divide-y` rows. Used for posts, notifications, chat list, search results.
  Document which family each data type uses, and consolidate duplicates.
- **Spacing rhythm:** sections `space-y-10` on desktop (Market), `space-y-8` on phone. Inside a section, heading to content `space-y-4`. Grid gaps follow Market (`gap-x-4 gap-y-10` for photo grids, `gap-4` for bordered cards).
- **Empty states:** one Dugout empty state (Market's centered `py-20`, bold line, muted line, one green pill CTA).
- **Loading:** one skeleton set matching the band + header + grid, so tab switches don't jump.
- **Motion:** same as the rest of the app. `motion-safe:` only, enter 160 to 200ms, exit about 120ms. Row-in for grids (`animate-row-in` with `--row`), desk-only hover lift, no bounce.
- **Phone:** the band becomes edge-to-edge, the header is 22 to 24px, category rows scroll horizontally, and the grid follows Market's 2 columns. The bottom tab bar is untouched.

## Step 2. Build the primitives

Create `components/dugout/ui/` with `band.tsx`, `page-header.tsx`, `section-head.tsx`, `chip.tsx` (Chip, ChipRow, ChipLink for URL-driven filters with `scroll={false}` and `data-nav="none"`), `category-row.tsx` (underline row), `shortcut-tiles.tsx`, `empty.tsx` and `skeletons.tsx`. Port Market and Home to them first, with **zero visual change**. Prove that by screenshot diff at 1440 and 375 before touching any other tab.

Constraints: no new npm packages. Reuse tokens in `app/globals.css` and icons from `@/components/icon` and `components/round-icon.tsx`. Keep server components server-side; only chips with local state are client components.

## Step 3. Migrate tabs (one commit each, in this order)

1. **Lessons:** replace the custom `LessonFrame` PC header with `DugoutBand` + `DugoutPageHeader`. Keep the filter rail but restyle its options as `Chip`s. Specialties become the category row. Hub categories become shortcut tiles. Coach cards stay in family 2. Keep the sticky booking panel and the compare table.
2. **Venues:** band + header + kinds as category row. Keep the map split, but make the list rows family 3 and the map card match family 2.
3. **Baseball:** band + header + leagues as category row, date strip as `ChipRow`, games as family 2 cards. Game detail: header with score in the band, sections with `SectionHead`.
4. **Community:** band + header + boards as category row, posts as family 3 rows. Post detail and write screens use the form frame.
5. **Search:** band with the big search input (Home style) + result tabs as category row + sections with `SectionHead`.
6. **Me, Notifications, `u/*`:** band + header, lists as family 3.
7. **Chat:** keep the two-pane full-height layout, but match the header type, chips and empty state.
8. **Detail and form pages** (`market/[id]`, `market/new`, edit, `pay/*`, `gear` popup): headers, buttons, inputs and empty states from the shared set.

After each tab, screenshot at 1440 and 375 and compare against Market side by side. Header baseline, band height, chip look and section heading must line up.

## Step 4. Guardrails so it stays unified

- Add a cheap check to `npm run dugout:test`: every `app/(dugout)/**/page.tsx` (except the named exceptions) renders `DugoutPageHeader`, uses no `max-w-*` other than the allowed ones, and has no raw `text-[NNpx]` heading sizes. Grep is fine.
- Short JSDoc on each primitive saying when to use it. Add a line to `docs/claude/geum-yunho.md` so future sessions use the primitives.

## Constraints (do not break)

- **Phone behavior stays correct.** Phone may change visually to match the rules, but nothing may overflow at 375px (`getBoundingClientRect().right <= innerWidth`), the bottom tab bar stays clear, and nothing hides behind the fixed top bar (the Dugout top bar bottom is about 81px on desktop; sticky things go at `lg:top-28` or lower).
- Same data loaders, server actions, URLs and query params. Filters stay in the URL.
- Dark and navy themes must stay readable. Use `text-page` on `bg-ink`, never `text-white` on `bg-ink`.
- The Dugout home first-screen behavior (top bar hidden while `[data-dugout-main]` is visible, logo landing target `[data-dugout-logo]`) and the sinker ↔ dugout morph (`components/shell-morph.tsx`) must keep working. Do not rename those data attributes.
- Do not touch `native/` or the Sinker shell (`app/(app)`).

## Verification (before saying done)

- `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run dugout:test`.
- Screenshots at 1440×900, 1536×700, 1920×960 and 375×812 for every tab, logged out. Log in with the user's own account only if the user offers. Never create test accounts.
- If the in-app browser pane is hidden, animations and `requestAnimationFrame` stop. Check `document.timeline.currentTime` before trusting motion checks, and show the pane or say what wasn't verified.
- Temporary `app/dev-preview-*` routes with fake data are allowed for logged-in-only screens. Delete them afterward and restart the dev server.

## Deliverable

A Korean report with these parts:
- the audit table summary
- the rules
- per-tab before and after screenshots (1440 and 375)
- what was not verified
- commit hashes

Do not push until the user says "올려줘".
