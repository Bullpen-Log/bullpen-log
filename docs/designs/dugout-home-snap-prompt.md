# Dugout home: two-stop scroll snap + rounded top bar — prompt

> Written 2026-10-24 for 금윤호. Request (Korean, paraphrased): "On the Dugout home, one scroll from the first screen (big DUGOUT logo + search + icons)
> should glide straight down to the content (the dark banner at the top, under the bar). The top bar should appear right away when that happens.
> Scrolling up from there should bring the first screen back. Smooth animation matters most. Also redesign the top bar to feel round and simple, like the
> rest of our interface."
> Paste the block below into a fresh Claude Code session in this repo. Product copy stays Korean (해요체, no em dashes). Push only when the user says "올려줘".

---

## Goal

Two things, one commit each.

1. **Two-stop home.** `/` (Dugout home, `app/(dugout)/page.tsx`) has exactly two resting positions near the top:
   - **Stop A, "hero":** `scrollY = 0`. The finder panel (`components/dugout/dugout-main.tsx`, `[data-dugout-main]`) fills the first screen and the top bar is hidden.
   - **Stop B, "content":** the content grid (the dark banner `MarketHero slim` and the right `GamesPanel`) sits just under the top bar, and the top bar is visible.
   From A, any downward intent (one wheel notch, one trackpad swipe, one finger swipe, PageDown, Space, ArrowDown) glides to B in a single smooth motion.
   From B, any upward intent glides back to A. Below B the page scrolls natively as it does today. Nothing may ever rest between A and B.
2. **Round, simple top bar.** Restyle `components/dugout/dugout-topbar.tsx` into a floating rounded capsule that matches our pill and chip language.
   Keep every feature. Use one row on desktop instead of two.

Done means that on a Mac trackpad, a mouse wheel, an iPhone and a keyboard, the transition feels like one deliberate, Apple-like glide with no jitter, no double jump, no leftover inertia scroll and no flash of the bar. It must also work in dark and navy themes, logged in and out.

## Read first

1. `AGENTS.md`, `HANDOFF.md`, `docs/claude/geum-yunho.md`. Key rules: shared production DB (no test accounts), push only on "올려줘", Korean commit messages ending with the Co-Authored-By line, no secrets. No DB change is needed for this task.
2. Next.js in this repo has breaking changes. Read `node_modules/next/dist/docs/` before touching layouts or routing.
3. The current pieces:
   - `components/dugout/dugout-main.tsx` — the hero. Right now an `IntersectionObserver` (threshold 0) sets `html[data-dugout-top]` and `data-top` on the section while the hero is on screen. A `useLayoutEffect` sets `html[data-dugout-instant]` for one frame so the bar does not fade out on arrival.
   - `app/globals.css` around the comment "덕아웃 첫 화면" (search `data-dugout-top`): on home the bar (`[data-morph-bar]`) is `position: fixed`. While `data-dugout-top` is set it is hidden with `translateY(-100%)` and `opacity: 0`, using a 480ms transition.
   - `components/dugout/dugout-topbar.tsx` — `DugoutTopBar`, two rows on desktop: logo, wide search pill, S, 관리, chat, bell, settings, profile, then `≡ 카테고리`, nav links and `+ 물건 올리기`. The same component is used by `components/dugout/dugout-shell.tsx` (Dugout), `app/(app)/layout.tsx` (Sinker PC, `brand="sinker"`) and `app/(master)/layout.tsx` (manage).
   - `components/dugout/dugout-shell.tsx` — `main` has `pt-5 md:pt-8`. The phone tab bar is the glass pill `[data-tab-bar]`.
   - `components/shell-morph.tsx` and the CSS under "덕아웃 ↔ 싱커 변형": the Sinker ↔ Dugout morph uses `[data-morph-bar]`, `[data-morph-chrome] > *` (nth-child stagger), `[data-morph-side]`, `[data-dugout-logo]` (logo landing target, both the hero logo and the bar logo) and `[data-dugout-main]`. **Do not rename or remove any of these attributes.** The morph lands the logo on the hero logo when the target is `/`.
   - Sticky side panels hard-code the bar height: `lg:top-28` (lessons list, coach detail, book form, find wizard) and `lg:top-32` (search). The PC bar bottom is about 81px today.

## Why the current behavior falls short (analysis)

- **The bar only appears after the hero is completely gone.** The `IntersectionObserver` reports "not intersecting" when the hero's bottom passes the viewport top. Stop B (content just under the bar) leaves about `barHeight + gap` of the hero still on screen, so at B the bar would still be hidden. The bar state must come from the snap controller, not from the observer.
- **Native scroll cannot do "one gesture = one stop".** A trackpad swipe yields 30 to 120 wheel events with decaying inertia. A mouse notch is about 100px. A finger flick on iOS uses momentum. Any of these can leave the page between A and B, or overshoot far past B.
- **CSS `scroll-snap` is not enough.** `mandatory` on the root fights the long free-scrolling content below B. iOS Safari behaves inconsistently with root snapping. `proximity` lets the page rest mid-zone. And the snap animation's speed and curve cannot be controlled, while the user explicitly wants a smooth, tuned motion.
- **A "curtain" overlay (hero as a fixed layer that slides away while the page stays at scroll 0) is smooth but rejected.** It breaks find-in-page, anchor links, keyboard Tab into the content, screen readers, back/forward scroll restoration and `position: sticky` math. Keep real scrolling.
- **Chosen approach: a small scroll controller.** Real scroll positions (A = 0, B = measured), input interception only inside the A–B zone, one custom `requestAnimationFrame` tween per transition with our own easing, an input lock that swallows trackpad inertia, and a bar state that flips the moment a transition starts. This is how Lenis-style smooth sections work, without adding a package.

## Part 1. The two-stop controller

### Files

- New `components/dugout/home-snap.tsx` (`'use client'`). Mount it once in `app/(dugout)/page.tsx` next to `DugoutMain`. It renders nothing.
- `app/(dugout)/page.tsx`: put `data-dugout-content` on the content grid wrapper (the `div.mx-auto.grid` right after `<DugoutMain/>`). Give it `scroll-margin-top` equal to the gap you want under the bar, about 16px on desktop and 12px on phone.
- `components/dugout/dugout-main.tsx`: stop driving the bar from the `IntersectionObserver`. Keep the observer only as a passive fallback for browsers where the controller is disabled (see the gating rules below), or remove it and let the controller own `html[data-dugout-top]`. Keep the `data-dugout-instant` first-frame trick.
- `app/globals.css`: the bar show/hide rules (see "Bar choreography").

### Measuring stop B

`B = contentEl.getBoundingClientRect().top + window.scrollY - barHeight - scrollMarginTop`, where `barHeight` is the bar's laid-out height including its top inset (measure `[data-morph-bar]` even while hidden, since transforms do not change layout). Clamp to `[0, document.scrollingElement.scrollHeight - innerHeight]` so a short page cannot ask for an unreachable stop. Re-measure on `resize` and `visualViewport.resize`, on fonts ready (`document.fonts.ready`), and when content above B changes height (a `ResizeObserver` on the hero and on `data-dugout-content`). Expose the bar height as a CSS variable `--dugout-bar-h` on `<html>`. Part 2 reuses it.

### State machine

States: `hero` (scrollY ≤ 2), `content` (|scrollY − B| ≤ 4), `below` (scrollY > B + 4), `between` (anything else), and `animating`.

- **hero + downward intent** → animate to B.
- **content + upward intent** → animate to 0.
- **below**: do nothing and let native scroll run. If native scroll (inertia, scrollbar drag, find-in-page, a keyboard Home press) carries the page into `between`, settle it: once scrolling has been idle for about 90ms, animate to whichever stop matches the last direction (up → 0, down → B). Do not start an animation while a scrollbar drag is in progress (`pointerdown` on the scrollbar region, or `buttons` set).
- **between on load** (scroll restoration, back/forward, refresh): jump without animation to the nearest stop. Also respect `history.scrollRestoration`. If the URL has a hash, do nothing.

### Input interception (only in hero, content-at-B and while animating)

- **Wheel:** one `wheel` listener on `window` with `{ passive: false }`. Ignore it when `e.ctrlKey` is set (pinch zoom), when `|deltaX| > |deltaY|`, when a modal or popover is open (`document.querySelector('dialog[open], [role=dialog][data-open]')`), or when the event target sits inside an element that can still scroll vertically in that direction (walk up from `e.target` checking `scrollHeight > clientHeight` and `overflow-y` auto or scroll, for example the bell popover list). Otherwise call `preventDefault()` and trigger.
- **Touch (phone, iPad):** `touchstart` records Y. On `touchmove` with `{ passive: false }`, if in hero and the finger moved up more than 6px, or at B and the finger moved down more than 6px while `scrollY` is at B, call `preventDefault()` once and trigger. Add `overscroll-behavior-y: none` on `html` while on home, so iOS rubber-banding does not fight the tween.
- **Keyboard:** PageDown, Space (not with Shift), ArrowDown and End trigger down from hero. PageUp, Shift+Space, ArrowUp and Home trigger up from B. Skip when focus is in `input`, `textarea`, `select` or `[contenteditable]`, since the hero has a search field and Space must type.
- **Focus:** if keyboard focus moves into the content while in hero (Tab), animate to B. If it moves into the hero while at B (Shift+Tab), animate to 0. Use `focusin`.

### Swallowing trackpad inertia (the most important detail)

After a transition starts, keep an input lock: every wheel event is `preventDefault()`ed and ignored until both conditions hold:

1. The tween has finished.
2. No wheel event has arrived for 180ms, **or** a new gesture is detected. A new gesture means `|deltaY|` rises sharply after a decline (current ≥ 2× the previous and ≥ 12), or the sign flips with `|deltaY| ≥ 12`.

Mouse notches are discrete and large, so they satisfy the quiet rule quickly. Without this lock the leftover inertia scrolls past B, or bounces back to A.

### The tween

- Write a tiny `animateScrollTo(to, { duration, easing, onFrame, onDone })` with `requestAnimationFrame` and `window.scrollTo({ top, behavior: 'instant' })`. Pass `behavior: 'instant'` explicitly: `globals.css` sets `scroll-behavior` in places, and a smooth root would double-smooth every frame.
- Duration grows with distance: `clamp(420, 360 + distance * 0.35, 680)` ms. Easing: `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint feel), implemented as a function. No bounce.
- Cancel the tween only on `pointerdown` or `touchstart` (the user grabbing the page). On cancel, settle to the nearest stop.
- **Reduced motion** (`prefers-reduced-motion: reduce`): jump instantly and show or hide the bar without a transition.

### Gating

- Run only on the Dugout home (`/`, or `/?dugout=1` inside the Sinker app). Never run on other routes.
- Inside the Sinker app webview (`sinkerApp`) and the Dugout app: enable it, but test the touch path in the in-app browser at 375×812 with a mobile UA.
- Disable it while `html[data-morph]` is set (a Sinker ↔ Dugout morph is running). After a morph into `/`, start at stop A. The logo landing target is the hero logo.
- Disable it while a page-wide dialog is open (settings sheet, gear guide popup, bell popover).

## Part 2. Bar choreography

- The controller owns `html[data-dugout-top]`. Set it while in hero; remove it **the instant** a down-transition starts, so the bar slides in together with the glide and lands as the content settles. On an up-transition, set it at the start as well, so the bar slides away first.
- CSS for the bar on home: show/hide with `transform` and `opacity` only. The hidden state is `translateY(calc(-100% - var(--bar-gap, 12px)))` with `opacity: 0`. The transition uses the same curve as the tween. Use about 520ms with an 60ms delay when showing, and about 260ms with no delay and an ease-in when hiding. Never animate `backdrop-filter`, `height` or `box-shadow` per frame. The blur stays constant. Transitions on elements with backdrop-filter used to leave ghost rectangles in this repo (see `docs/claude/geum-yunho.md` §3).
- Optional polish, only if it stays smooth: during the down glide, fade the hero's logo and search slightly (opacity 1 → 0.6, `translateY` up to −12px), driven by tween progress through a CSS variable written in `onFrame`. Reverse it on the way up. Skip it under reduced motion.

## Part 3. Round, simple top bar (`dugout-topbar.tsx`)

### Design

- **A floating capsule, not a full-width strip.** The outer `header` is `sticky top-0` (fixed on home, as today) with a transparent background, `pointer-events-none` and `pt-3`. Inside, the capsule is `pointer-events-auto mx-auto max-w-6xl h-14 rounded-full bg-surface/85 backdrop-blur-xl ring-1 ring-line/70 shadow-[0_10px_30px_-14px_rgba(0,0,0,0.22)] px-2`. Remove the full-width `border-b`. On phone the capsule gets side margin `mx-3`.
- **One row on desktop.** Left to right: DUGOUT wordmark (smaller, `text-xl`, inside a rounded hit area) · nav pills · a compact search field · icon buttons.
  - **Nav:** 홈 · 커뮤니티 · 장터 · 레슨 · 연습장 · 경기, as `h-10 rounded-full px-3.5 text-[15px] font-semibold`. The active item gets a soft filled pill (`bg-ink/7 text-ink font-bold`). Idle items are `text-ink/70 hover:bg-ink/5`. Animate the active pill as a single sliding indicator: one absolutely positioned span whose `transform` and `width` follow the active link, measured with `getBoundingClientRect`, with a 280ms ease-out and no indicator jump on first paint. Respect reduced motion.
  - Remove `≡ 카테고리`. It only links to `/market` and duplicates 장터.
  - Turn `+ 물건 올리기` into a round icon button (40px, `RoundPlus`, tooltip "물건 올리기"), shown only inside Dugout like today.
  - **Search:** `h-10 rounded-full bg-ink/6 w-56` that grows to `w-80` on focus (transition `width` 220ms, which is fine since it is not per scroll frame), placeholder "통합검색". Hide it on phone, as today.
  - **Icons:** S (Sinker), chat, bell, settings and profile all use the same 40px ghost circle (`rounded-full hover:bg-ink/6`). Remove the border on the S button. The profile avatar is 34px. "관리" becomes a ghost pill in the same height (`h-10 rounded-full px-3 hover:bg-ink/6`), with no border, shown only to manage accounts.
- **Spacing rhythm:** 4px between icon buttons and 2px between nav pills. Sizes are the same at every breakpoint. Mind that the `desk:` variant lowers 16px+ text and scales spacing (3.2px), so verify rendered sizes in the browser rather than trusting class names.
- **Themes:** use tokens only (`bg-surface`, `text-ink`, `ring-line`). On `bg-ink` use `text-page`, never `text-white`. Check light, dark and navy.

### Keep working (must not break)

- Every data attribute: `data-morph-bar` (on the outer header), `data-morph-side` (logo link), `data-dugout-logo` (logo link, Dugout brand only), `data-morph-chrome` (keep it on the containers whose direct children should stagger during the morph, so `> :nth-child(n)` still matches meaningful items), and `data-brand`.
- `brand="sinker"` (Sinker PC shell) and the manage shell use the same component. Give them the same capsule, with no nav and the SINKER wordmark. The Sinker ↔ Dugout morph must still look right in both directions. Run it on `localhost:3000` from `/` to `/today` and back, then compare against the current behavior.
- `slim` (Sinker app Dugout tab): DUGOUT, chat and bell only.
- `native`: keep the `pt-[env(safe-area-inset-top)]` on the outer header.
- Logged out: show 로그인 (ghost) and 시작하기 (green pill).

### Knock-on layout updates

- Set `--dugout-bar-h` from the measured capsule plus its top gap (the controller already measures it; other pages can measure it in the shell, or use a CSS constant if the height is fixed: `pt-3` + `h-14` = 68px).
- Replace the hard-coded sticky offsets with `lg:top-[calc(var(--dugout-bar-h)+1rem)]`: lessons list, coach detail, book form, find wizard and search aside.
- `dugout-shell.tsx` `main` top padding: keep the first content clear of the capsule on non-home pages (the bar is sticky there, so its height already pushes content. Check the visual gap stays about 20 to 32px).
- The home hero corner row (S, chat, bell, settings, profile) stays as is. It is the bar's stand-in while the bar is hidden.

## Constraints

- No new npm packages. Reuse tokens in `app/globals.css`, `@/components/icon` and `components/round-icon.tsx`.
- Do not touch `native/` or `app/(app)` content, only the shared bar component.
- Phone: nothing may overflow at 375px (`getBoundingClientRect().right <= innerWidth`). The bottom glass tab bar stays clear. Nothing may hide behind the capsule.
- `npm run dugout:test` must still pass, and so must its `[UI 통일]` guardrails.

## Verification (before saying done)

- `npx tsc --noEmit`, `npx eslint <changed files>`, `npm run dugout:test`.
- **Motion cannot be verified in a hidden browser pane**: `requestAnimationFrame` and `document.timeline` freeze there. Either show the pane, or drive headless Chrome over CDP (`--headless=new --remote-debugging-port`, a temporary profile) at 60fps, and record frame timings.
- Synthesize input with CDP `Input.dispatchMouseEvent` type `mouseWheel` and test these cases:
  - one 100px notch;
  - a trackpad-like burst of about 60 events with decaying deltas (40 → 1) over 900ms;
  - a second burst started 250ms after the first finishes (it must count as a new gesture and scroll natively below B, or go back up if it was upward at B);
  - an upward burst at B;
  - an upward burst from deep below B (native scroll, then settle at A only if it enters the zone).
- Touch: `Input.dispatchTouchEvent` flicks at 375×812.
- Keyboard: Space, PageDown, ArrowUp and Home, plus typing a space in the hero search.
- Sample `scrollY` every frame during each transition. It must be monotonic, have no frame longer than 20ms, end exactly at 0 or B, and never rest between them.
- Bar: hidden at A, fully visible at B, with no flash on first paint, after a Sinker → Dugout morph, or after a refresh at B.
- Screenshots of A and B and of the new bar at 1440×900, 1536×700, 1920×960 and 375×812, in light, dark and navy, logged out. Log in with the user's own account only if the user offers.
- Reduced motion: instant jumps, and the bar toggles without a transition.

## Deliverable

A Korean report:
- what changed, per part;
- the timing numbers (durations and the inertia lock);
- what was verified, and how;
- what was not verified (for example, a real iPhone or a real trackpad);
- commit hashes.

Do not push until the user says "올려줘".
