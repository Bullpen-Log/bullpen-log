# Implementation prompt: DUGOUT desktop experience redesign

## Role and objective

Act as a senior product designer and frontend engineer working in the existing DUGOUT/Sinker repository. Implement a coherent, desktop-first redesign of DUGOUT's public browsing experience. Deliver functioning local pages, not just a design proposal, a component showcase, or a disconnected mockup.

The user wants the clarity and operational usefulness of https://www.plabfootball.com/ with the restraint and predictable interactions of Apple's first-party apps. Preserve DUGOUT's identity, green accent, Korean language, and user-supplied icons. Reference the information hierarchy and interaction patterns; do not clone PLAB branding, artwork, or page markup.

The central problem is misallocated attention: duplicate navigation and large low-information elements occupy the top of the screen, while important product and coach information is compressed into narrow columns and small text. Solve that structural problem before adding decorative polish.

The first viewport should answer four questions immediately:
1. Where am I?
2. What conditions am I browsing under?
3. What actual items can I choose from?
4. What should I do next?

Do not interpret “fits on one screen” as hiding overflow, shrinking all typography, removing necessary information, or preventing scrolling. It means the first useful decision is possible without scrolling past a navigation or promotional wall.

## Read first and establish precedence

Read these files before editing:
- `AGENTS.md` and `HANDOFF.md`.
- Relevant repository guidance in `CLAUDE.md` and `docs/claude/geum-yunho.md`.
- `docs/designs/dugout-desktop-information-design.md` — the latest desktop audit and design direction.
- `docs/designs/dugout-market-commerce-plan.md`.
- `docs/designs/dugout-market-commerce-claude-prompt.md`.
- `docs/designs/dugout-market-commerce-phase0.md`, if present, for work already completed by another session.
- Relevant installed documentation under `node_modules/next/dist/docs/` before writing Next.js code.

This prompt takes precedence over older design preferences for desktop presentation: replace the large desktop launcher tiles, content-delaying home entrance, and floating-pill-heavy desktop treatment as specified below. Preserve the earlier commerce plan's honesty, identity, payment and transaction-safety requirements. Do not execute its full payment roadmap as part of this visual redesign.

Reinspect current files. The repository may have changed since the audit. Preserve uncommitted work and improvements made by other sessions; do not copy stale worktree files over them.

## Scope and working environment

Implement the DUGOUT desktop shell and these routes:
- `/`: home.
- `/market`: marketplace discovery.
- `/market/[id]`: align with the approved commerce detail direction; reuse any existing implementation.
- `/lessons` and its existing list route: coach discovery/comparison.
- `/community`: community browsing.
- `/venues`: venue list and map.
- `/baseball`: game schedule/results.

Keep existing routes, authentication, authorization, filters, forms, ownership controls, and real data access working. Existing search query parameters must continue to work. Do not rename routes casually.

Work in `/Users/yuno/Developer/bullpen-log`, which serves localhost:3000, unless the user explicitly selects another checkout. Verify the development process uses that directory. Save changes there and check their rendered result. If the server is down, start it; do not start a second conflicting process or kill unrelated servers.

This task authorizes local UI implementation and verification. Do not push, deploy, publish content, enable live transactions, or alter the shared production database. Do not generate fake listings, orders, reviews, or accounts in that database. Do not run `npm run build` without inspecting its scripts: this project has historically included `prisma migrate deploy` in the build command. Never use `prisma migrate dev`, `db push`, or `migrate reset`.

Avoid unnecessary package additions. Use existing components and dependencies where they fit. Do not stop repeatedly for routine choices; choose a coherent implementation and show the result. Ask only for an actual blocker that cannot be resolved from the repository and this brief, while continuing independent work.

## Verified audit observations, not assumptions to preserve

At the time of the audit:
- Market viewport: 1280×720 CSS pixels, DPR 1.
- Main container: 1152px wide.
- First market heading began around y281px; first product photos around y327px.
- Desktop market used six columns, making images approximately 174px wide and truncating important names/specifications.
- Category navigation was duplicated in centered 72px shortcut tiles.
- Several product images were generated dummy graphics; coach tiles showed large initials instead of portraits.
- Desktop `--spacing` was globally changed to `.2rem`, while fixed 72px shortcuts, fixed 26px headings and other overrides remained.
- Home hid the shared header, displayed a large logo/search/launcher area, and intercepted scrolling through HomeSnap.
- The market's default and filtered views exposed different filter controls.

Remeasure rather than treating these numbers as the current state. The PLAB reference was viewed at a different viewport and theme; do not present that comparison as a controlled benchmark.

## Design principles

### Reference interpretation

PLAB's useful principle is the separation of global navigation, local filters, time/date context and repeatable result rows. Its real venue photography provides visual identity and substance. It also uses promotions and banners; do not import those merely because the reference does.

Apple-inspired quality means legible hierarchy, familiar controls, predictable transitions, accessible behavior and restrained material use. It does not mean putting glass, large corner radii and animations on every element.

### Visual language

- Keep DUGOUT green. Use it mainly for the primary action, selected state and meaningful status.
- Use calm solid surfaces and readable text. Reduce elevation on ordinary content; reserve shadows for overlays where layering matters.
- Preserve the existing Korean font unless there is a documented rendering issue. Improve hierarchy through size, weight, line height and spacing rather than introducing a fashionable unrelated font.
- Preserve the user's icon library. Most navigation and control icons should be compact, approximately 18–24px. Icons support labels; they do not substitute for content photographs.
- Avoid repeated giant initials, abstract colored product illustrations, full-width marketing slogans, decorative gradients, ornamental blobs and generic “feature card” grids.
- No fake scarcity, fake recommendation labels, fake testimonials, invented ratings or fabricated transaction counts.
- Use real photography only when supplied, already legitimately available in the project, or otherwise authorized. Do not copy PLAB's assets or generate photos that pretend to document a real used item or seller.

### Initial desktop token targets

These are starting points, not inflexible pixel mandates:
- Header height: approximately 64px.
- Main max width: 1200–1280px, with at least 24px side gutters at ordinary desktop widths.
- Local filter column: 200–216px; content gap approximately 24px.
- Page title: approximately 24px, weight 600–700.
- Section title: 18–20px, weight 600–700.
- Product/coach/title text: 15–16px, comfortably readable.
- Body: 14–15px; supporting metadata: 12–13px with adequate contrast.
- Use a limited spacing scale: 4, 8, 12, 16, 24, 32, 48px.
- Suggested radii: image 8–12px, controls 8–10px, overlays 12–16px. Use pills selectively.
- Ordinary desktop controls approximately 36–40px high where appropriate; touch targets at least 44px on touch layouts.

Do not blindly reset global Tailwind spacing or typography: Sinker and management screens share the stylesheet. Audit computed values and introduce semantic tokens scoped to the intended DUGOUT surface. Ensure nested Sinker surfaces do not accidentally inherit the new treatment. Prefer a small maintainable set of variants over growing selector specificity and `!important` overrides.

## Desktop shell

Create a stable, understated top header: logo, primary services, search and account tools. It should remain in the same place on home and interior pages. Replace the heavily floating pill appearance with a quiet solid header and subtle boundary. Do not make header height or content position jump on navigation.

Preserve the primary destinations: community, market, lessons, venues and games. The logo can provide home navigation if the separate Home item is redundant. Keep selected-page state clear. Respect all existing role-dependent links and notifications. Check the widest logged-in configuration, not only the shorter logged-out header.

The shared topbar is also used by Sinker and management views. Add an explicit scoped treatment where needed; do not redesign those surfaces accidentally.

Global navigation selects a service. Local navigation selects a category. Filters narrow results. Action buttons perform tasks. Give these distinct visual treatment; do not render all four as equivalent pills or icon tiles.

At narrower widths, move local filters into an accessible sheet/popover and adjust the grid. Do not squeeze the desktop arrangement into a phone. Retain the native app/webview's existing navigation contract and avoid duplicate app chrome.

## First-viewport budget

For market, coach discovery and community at default text size, aim for the first actual result to begin within approximately 200–240px of the viewport top.

A possible allocation is:
- Header: 64px.
- Top gap: 24px.
- Title/action row: 32–36px.
- Gap: 16px.
- Filter-summary/sort row: 36–40px.
- Gap before results: 16–24px.

Remove redundant rows to meet this target. Do not cheat by reducing body text, clipping information, hiding controls required for the task, or measuring an offscreen duplicate. At larger text sizes, natural reflow takes precedence over this budget.

## Route specifications

### Marketplace discovery

Desktop arrangement:
- Local filter column on the left.
- Title/result context and a visible '물건 올리기' action on the right.
- Stable selected-filter summary and sort controls.
- Photo-first product grid below.

Remove desktop shortcut tiles duplicating categories, favorites, chat or selling. Favorites and chat belong in the appropriate user tools; selling belongs in the page action. Put the equipment guide near relevant category/filter decisions as a compact secondary link, not a large introductory card.

Expose applicable filters consistently in both the unfiltered landing state and filtered state. Region should be a compact select/searchable control rather than every region expanded across several chip rows. Preserve URL filter state, reset pagination appropriately when changing filters, and support back/forward restoration. Keep accessibility and empty-result recovery intact.

Implement only filters supported by real data/query logic. Do not add attractive nonfunctional filter controls or imply that category-specific fields are searchable when the backend cannot filter them. Complete feasible query wiring without schema changes; report genuine data limitations.

Choose columns from actual result-area width. Start with a minimum readable card width of 200–220px and adjust through visual testing. With a filter sidebar, three or four columns are often appropriate; without one, four or five may fit. Do not force six columns solely because the viewport reaches an `xl` breakpoint.

Card order: photo, up to two lines of title, price, one or two concise condition/fit lines, then secondary location/time information. Keep the pattern identical across products. Keep meaningful condition visible; do not concatenate every raw spec into an unreadable string. Omit unlabeled '없음'/'모름' from listing summaries. Show those values in detail with context if needed.

Choose one price/title order and apply it consistently after testing with realistic Korean names. Preserve truthful reserved/sold states. The heart must be a working accessible favorite action or be omitted; do not show a decorative icon that appears actionable. Avoid a button nested inside a product link.

Do not call a chronological feed 'recommended' unless real recommendation logic supports that wording.

### Product detail

Reuse the latest commerce detail implementation instead of rebuilding from an old version. Align typography, container and controls with the new system.

Keep a large inspectable gallery and clear purchase summary on desktop, followed by original-aspect photos stacked vertically with seller text and condition details. Do not crop away damage in the inspection view. Keep important defects visible near the summary too. Thumbnails must actually select images; full-screen inspection must support keyboard and dismiss behavior.

Do not represent payment, verification, escrow, delivery timing or refunds as operational unless backed by the actual implementation. This redesign does not authorize live commerce integration. Preserve accurate unavailable states and links.

### Coach discovery

Make this a comparison task, not a wall of colored initial-letter tiles.

Use a local filter column where relevant: area, specialty, available time and price, backed by existing capabilities. The main area uses stable rows with a modest portrait/avatar, coach name, specialties, location, availability, price and real review count.

Do not repeat the same coaches in several large sections when one list with a condition selector is clearer. Preserve current recommendation logic and booking links, and distinguish supported availability from unknown availability. Keep any personalized match reasons short and factual.

When no portrait exists, show a small neutral avatar in a fully designed text row. Do not enlarge a single initial into the main visual. Do not fabricate people. Keep existing list/detail routes coherent so switching between hub and list does not reintroduce a different design language.

### Community

Use a compact title/'글쓰기' row, one board-tab row, a stable search/sort area as supported, and readable post rows. Remove duplicate desktop shortcut tiles.

Make the post title the primary visual anchor. Align author, reply count and time in consistent positions. Preserve board-specific functionality, tags, region filters, moderation and visibility permissions. Do not force lengthy team-recruitment or meetup information into a generic truncated row; provide a structured variant when needed.

An empty board gets a compact honest explanation and one action, approximately 120–160px as a starting point. Do not fill the screen with a large empty icon or invent posts. Test populated boards with local fixtures instead of writing to production.

### Venues

Retain the list/map split: approximately 340–380px for the list and the remaining space for the map on desktop. Use available viewport height after header and tools without making the whole page inaccessible or hard-clipping content.

Keep list and map selections synchronized. Use consistent fields for place, location, price and supported availability. Handle loading, failure, retry and missing coordinates explicitly. Do not judge a transient blank map as a completed layout. Preserve map attribution and provider requirements. If map/list use independent scrolling, make the regions obvious and keyboard usable.

### Games

Keep league selection and a compact date strip. Make each game easy to scan in a consistent schedule row: time/status, away team/score, home team/score, venue and relevant supporting information.

The layout must work for zero games, one game and a full schedule without stretching one card or scattering a seven-day strip across an unnecessarily wide canvas. Preserve local date/time correctness, cancelled/postponed/live/final states and detail links. Do not pad sparse days with invented games.

### Home

Home should introduce actual content immediately while keeping the stable shared header. Reduce the large logo/search/launcher entrance and remove the desktop two-stop scroll behavior. Audit `HomeSnap`, data attributes and dependent CSS together; do not leave hidden-header states or scroll locks behind. Preserve unrelated Sinker transitions and mobile behavior unless a specific correction is necessary.

Desktop starting composition:
- Main column around 2/3: a small row of recent equipment and useful community content.
- Secondary column around 1/3: compact current games and, when real data permits, relevant personal updates.
- Lessons/venues below as the next meaningful section.

Do not force all services to appear equally above the fold. Do not repeat global navigation as a large home launcher. If the home needs a short search introduction, constrain its height so real content still appears in the first viewport. Logged-out users need concise orientation; logged-in users need relevant content. Use existing loaders and never invent activity.

Avoid rendering duplicate hidden interactive page trees just to produce mobile/desktop layouts; prefer one semantic content structure with responsive layout when feasible. If separate presentations are necessary, avoid double fetching, duplicate IDs and hidden focusable content.

## Content quality and honest previews

The audit's dummy product graphics and missing coach portraits strongly affected perceived quality. Fixing CSS alone cannot create realistic merchandising.

Use two deliberate preview sets:
1. Representative real/authorized content with varied photo ratios, Korean titles and wear details.
2. Missing-photo, long-title, empty and sparse-content states.

Use existing authorized assets where available. If suitable photography is unavailable, complete the structural redesign with truthful fallbacks and report that visual evaluation is limited by missing assets. Do not stop all work or substitute invented product evidence. Never upload preview fixtures to shared production data.

Any temporary preview route must be development-only and must not bypass production authentication. Keep fixtures clearly identified as preview data. Follow repository cleanup requirements for temporary routes and restart the relevant dev server if removing them causes stale Next.js route artifacts.

## Architecture and implementation discipline

Inspect these likely locations, but verify their current names and contents:
- `components/dugout/dugout-shell.tsx`
- `components/dugout/dugout-topbar.tsx`
- `components/dugout/dugout-main.tsx`
- `components/dugout/home-snap.tsx`
- `components/dugout/ui/`
- `components/dugout/listing-card.tsx`
- `components/dugout/coach-card.tsx`
- `components/dugout/place-map.tsx`
- `components/dugout/game-parts.tsx`
- `app/(dugout)/` routes
- `app/globals.css`

Reuse and evolve current components. Introduce a small set of meaningful layout primitives if useful: browse layout, local filter panel, page toolbar, result row and compact empty state. Do not build a generic schema-driven page engine for this task. Keep distinct layouts for photos, text, comparisons and maps.

Keep server-side data loading and access checks intact. Client components should handle interaction, not unnecessarily absorb entire pages. Avoid duplicate fetches and new waterfalls. Reserve image space to prevent layout shift; load below-fold images lazily. Inspect current shared CSS, selector specificity and breakpoint behavior before adding overrides.

## Execution sequence

1. Audit current state, uncommitted changes and prior commerce work. Capture baseline screens with the viewport and theme recorded. Write a short plan and then implement.
2. Establish scoped tokens and the shell, validating header fit with logged-out and logged-in tool configurations.
3. Implement market and coach discovery as the two reference screens. Inspect both in the browser and correct weak hierarchy before applying the system elsewhere.
4. Apply the same semantic design rules to community; align existing product detail.
5. Rework home to be content-first with normal desktop scrolling.
6. Refine venue and game layouts without breaking provider/data behavior.
7. Run targeted functional checks and responsive visual review. Fix defects discovered by the review, not only describe them.
8. Produce a concise Korean handoff with screenshots, actual verification and remaining limitations.

These are sequential milestones within one task. Do not stop after building the first screen merely because it is reviewable; continue through the requested UI scope unless a real blocker requires user input. Keep progress updates short and useful. Avoid large parallel agent workflows unless requested.

## Verification and acceptance criteria

Test the same content and theme at:
- 1280×720 desktop.
- 1536×700 short desktop.
- 1920×960 desktop.
- 390px mobile and approximately 768px tablet for regressions.

At minimum:
- First real results start around y200–240 or earlier in market/coach/community at default text size, with exceptions explained.
- Product names remain readable across up to two lines; price and key condition/fit do not depend on hover or hidden truncation.
- Filter/sort placement remains stable before and after applying conditions.
- Search, filtering, pagination, browser back, favorites, write/sell actions and detail links continue to work.
- Full header tools fit without overflow in supported user states.
- Zero/one/many results, missing photos, broken images, unknown metadata, long Korean text and sold/reserved states remain coherent.
- Map and schedule are inspected after loading finishes, with loading/error states also checked.
- No horizontal page overflow at narrow widths, no sticky controls covering content, no duplicate mobile/app navigation.
- Keyboard focus is visible and logical. Popovers/sheets trap and restore focus correctly where appropriate. Controls have names and selected states.
- Text works at 200% zoom. Respect reduced motion; avoid scroll interception and hover-only actions. Preserve adequate text/control contrast.
- New CSS does not regress Sinker and management surfaces sharing the topbar/tokens.

Run lint on changed files, appropriate type checks and relevant existing tests. Investigate failures enough to distinguish introduced errors from environment/pre-existing ones. Do not weaken tests merely to accommodate a regression; update obsolete visual assertions only when the new requirement explains the change. Do not write low-value tests that merely assert exact class strings. Add focused behavior tests only where new filter/state or accessibility logic merits them.

Capture before/after screenshots at matching dimensions and theme. Report measured first-result position and representative card width, not guessed improvement percentages. A screenshot of a loading skeleton does not prove a completed layout. A successful HTTP response alone does not prove visual quality. If browser access is blocked, say which visual checks remain unverified rather than claiming success.

## Final quality review

Before finishing, inspect the result as a user:
- Is the primary task obvious in five seconds?
- Does every large region contain useful information?
- Can I compare adjacent results without opening each one?
- Do elements that look actionable actually work?
- Are repeated colors, shapes or labels conveying meaning rather than decoration?
- Does the layout still feel intentional with no photos or only one result?
- Does each page belong to the same product while using a layout suited to its task?

If the result still looks like repeated pastel placeholder cards beneath oversized icon shortcuts, the redesign is not complete.

## Deliverables

Provide in Korean:
1. The main improvements and why they help desktop scanning.
2. Before/after screenshots with viewport dimensions and theme.
3. Changed files and major shared-component decisions.
4. Checks actually completed and any pre-existing/environment failures.
5. Honest remaining dependencies, such as photography, missing filter data or unavailable payment integration.
6. Confirmation that localhost:3000 reflects the work, with links to representative routes.

Update HANDOFF.md when the repository's cross-owner/setup rules require it. Do not claim another agent has read the handoff. Leave production publishing to a separate explicit user request.
