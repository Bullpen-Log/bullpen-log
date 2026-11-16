# EX-REF02 — Claude outbox

## Receipt — 2026-11-16 (Claude 싱커 출시 · 운동영상, `local_755647bb-4e87-410e-bf93-0cd121daa074`)

- Received EX-REF02 v1 from the user's input in this existing session. Implementation started on receipt. EX-REF01 was not implemented (superseded/deferred per this order). EX-RX01 not restarted; human exercise review records untouched.
- Checkout: isolated `/Users/yuno/.codex/worktrees/sub1-native-journeys/bullpen-log`, detached HEAD `80e444234f4826b4ff83b73e9573dd6bb6b86494`; pre-existing untracked: `docs/work-orders/EX-REF02.md`, `native/node_modules` (not mine, untouched). Main checkout and intake/local-server worktrees not edited.
- Actual settings (`get_session self`, 2026-11-16): model `claude-opus-5-5`, effort `xhigh` (UI "Extra"), Fast mode `off` (`sdk_opt_in_required`), permission `auto`. Preserved as selected; no Fable/Max. No subagents/workflows used for this order.
- session-guard check: no conflicts, no other active claims. Claimed: `app/(app)/admin/references`, `lib/admin-references`, `scripts/admin-references-selftest.mts`, `app/(app)/admin/page.tsx`, `native/src/app/admin/index.tsx`, this outbox.

## Delivery — 2026-11-16 (v1 + user addendum: ADMIN-only original streaming proxy)

**Status:** delivered for independent review (GPT Sub1 / GPT03). Not committed, not pushed, no deploy, no DB/schema/migration/dependency/bucket/policy change. No corpus content read or stored by Claude; no claim of reading the corpus. Stopped here.

**Scope received mid-turn from the user (verbatim):** "user confirmed author permission. Add ADMIN-only authenticated original streaming proxy with no-store/safe Range. Original files use existing private external-intake bucket admin-references/v1/assets/, MIME application/octet-stream. Catalog remains pitch-videos. No bucket or policy changes. GPT supplies private uploads. Read before delivery." — implemented below; all delivered files re-read before this write-up. `EX-REF02.md` unchanged since receipt (31 lines, md5 `92e85538…`).

### Files

Tracked edits (exact):

```diff
--- a/app/(app)/admin/page.tsx
+++ b/app/(app)/admin/page.tsx
@@ -2,7 +2,7 @@
-import { ChevronRight, Clapperboard, Film, Gauge, ScrollText } from '@/components/icon';
+import { BookOpen, ChevronRight, Clapperboard, Film, Gauge, ScrollText } from '@/components/icon';
@@ -228,6 +228,23 @@ (inside the existing owner-only fragment, right after the 패치노트 card)
+      {/* 참고자료(EX-REF02) — 대표관리자만. 비공개 훈련 자료 · 확인한 범위 · 근거로 다시 본 주장 */}
+      <Link href="/admin/references" className="…same card classes as 패치노트…">
+        … <BookOpen aria-hidden className="h-4 w-4" /> … 참고자료 …
+        비공개 훈련 자료와 확인한 범위, 최신 근거로 다시 본 판단을 봅니다.
+        <ChevronRight aria-hidden className="h-4 w-4 shrink-0 text-muted" />
+      </Link>
--- a/native/src/app/admin/index.tsx
+++ b/native/src/app/admin/index.tsx
-import { openWebAfter } from '~/shell/web-nav';
+import { leaveTo, openWebAfter } from '~/shell/web-nav';
@@ inside `data.perms.owner` group, after 패치노트
+            {/* 참고자료(EX-REF02) — 대표관리자만. 앱 화면 없이 웹 화면으로(leaveTo). 막기는 웹 화면이 한다 */}
+            <MenuRow icon="book-open" label="참고자료" detail="비공개 훈련 자료 · 근거" onPress={() => leaveTo('/admin/references')} web c={c} />
```
(`git diff --stat`: 2 files, +21 −2. Full hunks: `git diff -- 'app/(app)/admin/page.tsx' native/src/app/admin/index.tsx` in the checkout.) `/admin/references` matches no `NATIVE_ROUTES` entry, so the app keeps it as the authenticated web page; no new native screen/API contract.

New files (untracked; lines · sha256 prefix):

| File | Lines | sha256 |
| --- | --- | --- |
| `app/(app)/admin/references/page.tsx` | 265 | 9d41e05908e22c50 |
| `app/(app)/admin/references/[id]/page.tsx` | 348 | 14129dc9d8e4c6e8 |
| `app/(app)/admin/references/fail-screen.tsx` | 20 | c8fb565bf890210c |
| `app/api/admin/references/[id]/original/route.ts` | 21 | b41602c4cdff92ca |
| `lib/admin-references/schema.ts` (pure validation) | 454 | 4e99b70897786c89 |
| `lib/admin-references/view.ts` (pure labels/coverage/filters) | 289 | 184633b27dac579e |
| `lib/admin-references/load.ts` (pure loader core) | 119 | b8939e3923504ee9 |
| `lib/admin-references/original.ts` (pure proxy core) | 169 | f5975772938a994b |
| `lib/admin-references/local-source.ts` (key check + dev-only folder) | 91 | 5002f7b1c078e343 |
| `lib/admin-references/storage.ts` (`server-only` adapters) | 96 | 39abdbef51c20ad5 |
| `lib/admin-references/README.md` (format) | 98 | 88870587f4ec85c3 |
| `scripts/admin-references-selftest.mts` (synthetic only) | 535 | 68b92d82d95aa583 |

No file under `public/`, no client component (`'use client'` absent in all new app files — list/detail render on the server, so `searchText`/`detailKey`/asset keys never reach the browser).

### Private loader contract (no licensed content)

- Storage: catalog `pitch-videos/admin-references/v1/catalog.json` (≤ 8 MB); entry `pitch-videos/<detailKey>` where `detailKey` must match `admin-references/v1/entries/<id>.json` (≤ 16 MB). Originals: bucket **`external-intake`**, key `admin-references/v1/assets/<6–80 [A-Za-z0-9_-]>[.<2–5 lowercase ext>]`, stored as `application/octet-stream`.
- Order (all server-side): `requireAdmin()` (pages) / `getCurrentUser()` + role check (route) → loader re-checks `role === 'ADMIN'` → id shape `^[A-Za-z0-9_-]{6,80}$` → catalog → entry → `detailKey` from the catalog only → detail → (proxy only) `asset.key` from the detail only. Logged out / USER / MANAGER / beta-locked never reach storage (tested: 0 reads, 0 asset fetches).
- Fail closed: `missing` · `unavailable` · `too_large` · `malformed` → Korean screen with "다시 시도"; unknown/invalid id → 404. Failure reasons carry only `entry:N`-style locations, never values/paths/secrets.
- Catalog shape: `schemaVersion: 1`, `title`, `updatedAt` (parsable), `entries[≤3000]` with `id, title, collection, kind (document|video|research), language, categories[⊆ 8], availability, rights (private-summary|licensed-private|pending), sha256 (64 hex), bytes, pageCount?, durationSeconds?, coverage {textPages, visualPages, videoIntervals, audioIntervals}, reviewStatus, topics?[≤40], searchText?, detailKey`; optional `bibliography[≤3000]` `{id, url (http/https, no credentials), kind, title?, publisher?, authors?, year?, doi?, metadataStatus?, uses[{reviewId?, exercise?, note?}]}` — any other use fields (e.g. record file paths) are dropped on parse. Duplicate entry ids, duplicate detailKeys, duplicate bibliography ids, pages outside 1..pageCount, pages without pageCount, intervals outside 0..duration or start ≥ end → whole catalog rejected. Status words must be lowercase tokens; unknown ones render as "상태 미정".
- Detail shape: as the work order, plus validation: `id`/`kind` must equal the catalog entry; unique section/claim ids; `kind: 'table'` requires `table` with every row length = column count; claim `sourceSeconds` only when the entry has a duration; evidence URLs http(s) only (never fetched server-side); optional `asset {key, mime, filename, rightsConfirmed}` with `mime ∈ {application/pdf, video/mp4, video/quicktime, video/webm, audio/mp4, audio/mpeg, image/jpeg, image/png}` (no HTML/SVG/script types).
- Synthetic example (shape only): catalog entry `{"id":"ref_abc123","title":"…","collection":"…","kind":"document","language":"en","categories":["strength"],"availability":"pending","rights":"licensed-private","sha256":"<64 hex>","bytes":123,"pageCount":40,"coverage":{"textPages":[1,2],"visualPages":[3],"videoIntervals":[],"audioIntervals":[]},"reviewStatus":"partial","detailKey":"admin-references/v1/entries/ref_abc123.json"}`; detail `asset` `{"key":"admin-references/v1/assets/ref_abc123.pdf","mime":"application/pdf","filename":"….pdf","rightsConfirmed":true}`. Full annotated format: `lib/admin-references/README.md`.

### Original streaming proxy (addendum)

- `GET /api/admin/references/<id>/original` — only parameter is the entry id. 401 logged out, 403 USER/MANAGER/beta-locked, before any storage access.
- **Opens only if both** catalog `rights === 'licensed-private'` **and** detail `asset.rightsConfirmed === true` (strict `true`); otherwise 404 and the asset store is never asked. **Sub1 action:** for author-permitted items set catalog `rights: "licensed-private"` and detail `asset.rightsConfirmed: true`; items left `pending`/`private-summary` stay closed by design.
- Server creates a fresh 60 s signed URL per request via existing `storageBucket('external-intake')`, fetches it server-side (`cache: 'no-store'`, `redirect: 'manual'` → any 3xx becomes 502), streams the body through, discards the URL. No signed URL/key in any response, page or cache.
- Response headers: `Content-Type` = validated `asset.mime` (not the stored octet-stream), `Content-Disposition: inline` with sanitized ASCII fallback + `filename*`, `Cache-Control: private, no-store, max-age=0`, `X-Content-Type-Options: nosniff`, `Accept-Ranges: bytes`, `Referrer-Policy: no-referrer`, `X-Robots-Tag: noindex, nofollow`, `Cross-Origin-Resource-Policy: same-origin`.
- Range: single `bytes=a-b` | `a-` | `-n` only, capped to 4 MiB per response (`a-` → `a-(a+4MiB−1)`); multi-range/malformed/CRLF → ignored (full 200). Upstream 206 `Content-Range` is validated (`bytes s-e/total`, s ≤ e < total) else 502; upstream 416 passes `bytes */N`; upstream 400/404 → 404; other/throw → 502/503 with generic Korean text (no upstream body/paths).
- Detail page shows "원본 열기" plus page (`#page=N`, PDF) / time (`#t=S`, video/audio) jump links **only** when eligible; otherwise "원본 열람 권한을 확인하는 중이에요…". No dead links.
- Dev-only `ADMIN_REFERENCES_LOCAL_DIR` (ignored when `NODE_ENV=production`) serves `catalog.json` / `entries/` / `assets/` from a local folder with realpath confinement (symlink/`..` escapes rejected) and the same Range semantics. All dynamic fs calls carry `/*turbopackIgnore: true*/` — without them `next build` warned "Dynamic filesystem access causes tracing of the whole project" (found and fixed during this delivery).

### Checks (original exit codes)

| Check | Exit | Result |
| --- | --- | --- |
| `node --import ./scripts/alias-register.mjs scripts/admin-references-selftest.mts` | 0 | 159 passed · 0 failed (auth/no-storage-touch for null/USER/MANAGER, fail-closed catalog/detail (21 + 13 malformed cases), traversal & unknown ids, pending rights/asset gating, coverage merge (overlapping `[0,10]+[5,15]+[20,30]+[30,31]` = 26 s), totals incl. unread/unknown, filters/facets, proxy auth/gating/Range/headers/upstream errors/redirect, local folder confinement + byte-exact Range, static order/no raw HTML/no private paths). Mutation sanity: removing the role check → 7 failures; removing rights gating → 3; disabling interval merge → 5; all restored. |
| scoped `tsc --noEmit` over EX-REF02 graph (temp tsconfig extends repo tsconfig; deleted after) | 0 | 0 errors |
| `npx tsc --noEmit -p .` in checkout | 2 | 1179 errors, **all in `lib/intake/**` + `scripts/intake-*`**, none in EX-REF02 files. Cause: checkout `node_modules` is a symlink to the main checkout, whose generated Prisma client lacks the intake models present at this HEAD. Not regenerated (would mutate the main checkout's client). |
| `cd native && npx tsc --noEmit` | 0 | clean |
| `npx eslint` (5 web paths) / `cd native && npx eslint src/app/admin/index.tsx` | 0 / 0 | clean |
| `npx next build` in checkout | 1 | Turbopack `Symlink [project]/node_modules is invalid, it points out of the filesystem root` (environment; before compile). |
| `npx next build` in isolated scratch copy (rsync of this checkout + APFS copy-on-write clone of `intake-r05-release/node_modules`, whose `package-lock.json`, `package.json`, `prisma/schema.prisma` are byte-identical to this HEAD; `prisma generate` only inside the clone; dummy `DATABASE_URL`) | 0 | Compiled, full-project TypeScript passed, 0 warnings after the turbopackIgnore fix; `/admin/references`, `/admin/references/[id]`, `/api/admin/references/[id]/original` all ƒ (dynamic). First isolated attempt (main `node_modules` clone) exited 1 on missing `@noble/hashes`/`tus-js-client` (intake deps) and showed the 5 tracing warnings now fixed. Never `npm run build`. |
| `next start` smoke on that build (port 3917, logged out, then stopped) | — | API `/original` → 401 + `private, no-store` + nosniff (also for `..%2F` id); `/admin/references` and `/[id]` → 307 `/login` with `no-store`. |

Logs were in this session's ephemeral scratchpad (not committed; can be re-run with the commands above).

### Requested vs actual settings

- Requested: preserve user-selected model/effort, record actual UI settings and Fast; no Fable/Max; no subagents.
- Actual (`get_session self`, re-read at delivery): model `claude-opus-5-5`, effort `xhigh` (UI "Extra"), Fast mode `off` (`sdk_opt_in_required`), permission `auto`. Unchanged through the turn. No subagents/workflows, no simulator/Metro/native build.

### Not verified / remaining (needs reviewer or runtime with real owner session + private data)

1. Owner-session runtime with GPT's real private catalog/detail/asset (not available to Claude): list totals, filters, detail rendering, Korean labels, long tables, desktop/phone layout — no screenshot taken (would expose content).
2. Real Supabase behaviour: `pitch-videos` download for the JSON keys; `external-intake` `createSignedUrl` + server-side Range fetch returning 206/`Content-Range`; error shape for a missing asset (mapped to 404 via status/message heuristics).
3. Browser behaviour on the proxy: Chrome/Safari inline PDF (initial non-Range GET streams the whole file; `Accept-Ranges` advertised), `<video>`/`#t=` seeking via repeated 4 MiB 206s, `#page=` jumps. Vercel response size/duration limits for a full non-Range stream of a large file are unverified. HEAD is not explicitly implemented (relies on Next defaults).
4. USER/MANAGER with real sessions against the deployed route (covered by unit tests and code order only); app WebView path via `leaveTo('/admin/references')` not run on device.
5. Client router cache (`staleTimes.dynamic: 30`) can keep an owner's rendered page in that browser's memory for 30 s; server responses are `no-store`.

### Coordination

- Claims held during work: `app/(app)/admin/references`, `app/api/admin/references`, `lib/admin-references`, `scripts/admin-references-selftest.mts`, `app/(app)/admin/page.tsx`, `native/src/app/admin/index.tsx`, this outbox — released after this write-up. Pre-existing untracked `docs/work-orders/EX-REF02.md` and `native/node_modules` symlink untouched. No other checkout edited (the `intake-r05-release` `node_modules` was only read via copy-on-write clone into scratch).

## GPT checkpoint acknowledgement — 2026-11-16

- Original-proxy amendment receipt: confirmed (implemented in the delivery above).
- Claim on `app/api/admin/references`: honest sequence — `route.ts` was created first, the claim was registered right after (before any further route edit), and all claims were released at delivery. **Any further route edit will be preceded by a fresh claim/check.** No route edits since delivery.
- Shared Prisma client / main `node_modules`: **not regenerated, not altered.** Verified after the work: main `node_modules/.prisma/client/index.d.ts` mtime 2026-11-02 18:35, 0 `IntakeInvitation` symbols (unchanged); `intake-r05-release` client mtime 2026-11-13 17:29 (unchanged). My only `prisma generate` ran inside an APFS copy-on-write clone in this session's scratchpad (new inodes; sources unaffected); that scratch copy has now been deleted.
- Exact full-build blocker in the checkout (`npx next build`, exit 1): `Error [TurbopackInternalError]: Symlink [project]/node_modules is invalid, it points out of the filesystem root` (checkout `node_modules` → `/Users/…/bullpen-log/node_modules`). Root `tsc` (exit 2): 1179 errors confined to `lib/intake/**` and `scripts/intake-*` because the symlinked shared client lacks intake models. The isolated scratch build (exit 0) is supplementary evidence only; GPT may coordinate the authoritative isolated generated-client build.
- Scoped results (unchanged): selftest 159/0 (exit 0), scoped `tsc` 0 errors (exit 0), native `tsc` exit 0, web/native `eslint` exit 0.
- Delivery is implementation-only. Corpus content review/translation is incomplete and not claimed; nothing published; no corpus marked complete.

## Review fixes — 2026-11-16 (independent review: two corrections)

Reclaimed only the affected paths before editing: `app/(app)/admin/references/[id]`, `lib/admin-references/load.ts`, `lib/admin-references/view.ts`, `lib/admin-references/README.md`, `scripts/admin-references-selftest.mts`, this outbox (no conflicts, HEAD unchanged `80e44423…`). Route, proxy, storage, schema, list page, admin links untouched. No publish, no shared dependency/Prisma change (main client mtime still 2026-11-02 18:35).

**(1) Detail table — bounded, wrapping cells.** `min-w-max` removed. New `SourceTable` (`app/(app)/admin/references/[id]/detail-parts.tsx`): each th/td content box has `minWidth 7rem` / `maxWidth 22rem`, `break-keep` + `overflow-wrap:anywhere` + `whitespace-pre-line` (words stay whole, unspaced long tokens wrap); cell padding in rem (`0.375rem 0.5rem`) so the declared table minimum is exact on every breakpoint: `tableMinRem(cols) = cols × (7 + 2×0.5)` rem (`view.ts` `TABLE_CELL_REM`). Wrapper `overflow-x-auto` (`role="region"`, labelled, focusable) therefore scrolls only when the viewport is narrower than that minimum.

Browser check with a **fabricated** long Korean table (scratch-only preview page in a disposable copy; real `SourceTable`/`OriginalNotice`; no licensed content; copy deleted after):

| Viewport | Case | Box / table width | Scrolls | Cell widths | Tallest text cell |
| --- | --- | --- | --- | --- | --- |
| 375×812 | 3 columns, multi-sentence choice cells | 301 / 384 px (= 24rem declared) | yes, inside the box only | 112 px (min) | 195 px |
| 375×812 | 6 columns | 301 / 768 px (= 48rem) | yes, inside the box only | 112 px | 195 px |
| 375×812 | 2 columns incl. ~120-char unspaced URL | 301 / 301 px | no | 112–157 px (URL wrapped) | 137 px |
| 1440×900 | all three | 1080 / 1080 px | no | 121–352 px (352 = 22rem cap) | 59 px |

Page-level horizontal overflow: none at either width. Screenshots were taken of fabricated text only and not saved to the repo.

**(2) Original status — permission pending vs not linked.** `originalStatusOf` (`load.ts`) now uses only existing rights + asset state (no storage probe):

| Catalog `rights` | Detail `asset` | Status | Screen text (summary) |
| --- | --- | --- | --- |
| `private-summary` | any | `summary-only` | 요약만 비공개로 보관 · 원본은 열지 않음 |
| `pending` | any | `permission-pending` | 원본 이용 허락을 확인하는 중 |
| `licensed-private` | `null` | `not-linked` | 이용 허락은 확인됐지만 원본 파일이 아직 연결되지 않음 |
| `licensed-private` | present, `rightsConfirmed !== true` | `permission-pending` | 허락 확인 중 |
| `licensed-private` | present, `rightsConfirmed === true` | `eligible` | '원본 열기' link |

The proxy gate is unchanged (still `licensed-private` + `rightsConfirmed === true`; `private-summary` now has an explicit 404/no-fetch test). Note: `eligible` does not prove the object was actually uploaded to `external-intake`; a declared-but-missing object yields the proxy's generic 404 text (runtime item).

**Jump wording.** The categorical sentence "아래 쪽 · 시간 표시를 누르면 원본의 그 자리로 가요" (my Delivery section above, and the earlier UI) is withdrawn. Now: "쪽 · 시간 표시를 누르면 원본을 열어요. 그 쪽 · 시각으로 바로 가는지는 PDF · 영상을 보는 프로그램에 따라 달라요." The links still append `#page=N` (PDF) / `#t=S` (video/audio), but landing on that page/time is **not verified** in any browser, the app WebView, or native PDF viewers. README updated the same way.

**Tests.** Selftest 159 → 168, all pass: new status cases (licensed + no asset → `not-linked`; pending + no asset → `permission-pending`; licensed + unconfirmed → `permission-pending`; `private-summary` + confirmed asset → `summary-only`, no kind), `private-summary` proxy → 404 with 0 asset fetches, `TABLE_CELL_REM`/`tableMinRem` values, static checks (no `min-w-max`, bounded/wrapping cell styles, four distinct notice texts, no "그 자리로 가요" claim).

| Check | Exit | Result |
| --- | --- | --- |
| `node --import ./scripts/alias-register.mjs scripts/admin-references-selftest.mts` | 0 | 168 passed · 0 failed |
| scoped `tsc --noEmit` (EX-REF02 graph, temp tsconfig removed) | 0 | 0 errors |
| `npx eslint` (references app/api/lib + selftest) | 0 | clean |
| Full build | — | not re-run; blocker unchanged (checkout `node_modules` symlink → Turbopack `Symlink [project]/node_modules is invalid, it points out of the filesystem root`). Awaiting GPT-coordinated isolated generated-client build. |

Changed files after review (lines · sha256 prefix):

| File | Lines | sha256 |
| --- | --- | --- |
| `app/(app)/admin/references/[id]/page.tsx` | 315 | ea88b69b5e522999 |
| `app/(app)/admin/references/[id]/detail-parts.tsx` (new) | 85 | e0cd6b5f5825fd03 |
| `lib/admin-references/load.ts` | 125 | 7d96c1ac62826ed4 |
| `lib/admin-references/view.ts` | 296 | ee204de3727b0a14 |
| `lib/admin-references/README.md` | 101 | c7d0ce02f23d622a |
| `scripts/admin-references-selftest.mts` | 555 | 7c202cb289037da7 |

Settings unchanged: `claude-opus-5-5`, effort `xhigh`, Fast `off` (`sdk_opt_in_required`), permission `auto`; no subagents. Still implementation-only; corpus review/translation incomplete; nothing published.

## Copy correction — 2026-11-16 (`EX-REF02-gpt-review.md` "Additional copy correction requested")

Read the review checkpoint (17 lines) and the work-order amendment (now 37 lines, md5 `a5aa1d2a…`; consistent with the delivered proxy). Reclaimed only: `app/(app)/admin/references/[id]/detail-parts.tsx`, `…/[id]/page.tsx` (comment only), `lib/admin-references/load.ts`, `lib/admin-references/view.ts`, `lib/admin-references/README.md`, `scripts/admin-references-selftest.mts`, this outbox.

- `private-summary` badge (`view.ts` `RIGHTS_LABEL`): "요약만 보관(비공개)" → **"비공개 옮김 · 해설 · 요약(원본 파일 제공 안 함)"** — covers private renditions/notes/summaries (a full translation is possible); says only that the original file is not offered.
- Original-status notice for that state: "이 자료는 요약만 비공개로 보관해요…" → **"이 자료는 비공개로 정리한 내용(옮긴 글 · 해설 · 요약)을 보여 줘요. 원본 파일은 이 화면에서 제공하지 않아요. 쪽 · 시간 표시는 원본 위치를 가리켜요."**
- Internal display status renamed `summary-only` → `original-not-offered` (`load.ts` `OriginalStatus`; not the schema enum). Comments and README line updated the same way. This supersedes the "summary-only" row/wording in my Review fixes section above.
- **Unchanged (byte-identical sha prefixes):** schema enum `RIGHTS = ['private-summary', 'licensed-private', 'pending']` in `schema.ts` (`4e99b70897786c89`), proxy gate `original.ts` (`f5975772938a994b`), `storage.ts` (`39abdbef51c20ad5`), route (`b41602c4cdff92ca`). ADMIN gate and `licensed-private` + `rightsConfirmed === true` requirement untouched.
- Synthetic test added: `private-summary` entry with two full translation sections, a translated table and a note, **no asset** → all sections returned, status `original-not-offered`, no original kind/link, label text as above, proxy 404 with 0 asset-store calls. Static check: label/notice never say "요약만". Existing `private-summary` + confirmed-asset cases still 404 / not offered.

| Check | Exit | Result |
| --- | --- | --- |
| `node --import ./scripts/alias-register.mjs scripts/admin-references-selftest.mts` | 0 | 173 passed · 0 failed |
| scoped `tsc --noEmit` (temp tsconfig removed) | 0 | 0 errors |
| `npx eslint` (references app/api/lib + selftest) | 0 | clean |
| Full build | — | not re-run by Claude (checkout symlink blocker unchanged); GPT reported an independent isolated `npx --no-install next build` exit 0 on the prior revision — this copy change touches only strings/a TS union/comments in already-built files. |

| File | Lines | sha256 |
| --- | --- | --- |
| `app/(app)/admin/references/[id]/page.tsx` | 315 | cad9601709ccdf88 |
| `app/(app)/admin/references/[id]/detail-parts.tsx` | 85 | 4f81f1868a875346 |
| `lib/admin-references/load.ts` | 126 | 8b3ff957aa763ad2 |
| `lib/admin-references/view.ts` | 297 | 01fe495d641a1610 |
| `lib/admin-references/README.md` | 101 | 8a821a67f293977b |
| `scripts/admin-references-selftest.mts` | 593 | 33738fa1b37609f3 |

No browser re-check for this text-only change. Settings unchanged (`claude-opus-5-5`, effort `xhigh`, Fast `off`, permission `auto`; no subagents). Not committed, not published; corpus review/translation still incomplete.
