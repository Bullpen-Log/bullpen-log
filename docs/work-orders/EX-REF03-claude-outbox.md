# EX-REF03 — Claude outbox

## Receipt — 2026-11-16 (Claude 싱커 출시 · 운동영상, `local_755647bb-4e87-410e-bf93-0cd121daa074`)

- Received EX-REF03 v1 from the user's input in this existing session; read `docs/work-orders/EX-REF03.md` in full. Implementation started on receipt, in the same isolated checkout `/Users/yuno/.codex/worktrees/sub1-native-journeys/bullpen-log` (detached HEAD `80e444234f4826b4ff83b73e9573dd6bb6b86494`, unchanged).
- Accepted EX-REF02 files present and byte-identical to my last delivery (sha256 prefixes: `schema.ts` 4e99b70897786c89, `original.ts` f5975772938a994b, `load.ts` 8b3ff957aa763ad2, `view.ts` 01fe495d641a1610, `[id]/page.tsx` cad9601709ccdf88, `[id]/detail-parts.tsx` 4f81f1868a875346, selftest 33738fa1b37609f3). Baseline copied to session scratch to produce the incremental diff. Not reset/cleaned/switched; EX-REF01 / EX-RX01 not restarted.
- Pre-existing changes not mine, left untouched: `HANDOFF.md` (+8 lines, appeared after my last check), `docs/work-orders/EX-REF02*.md`, `EX-REF03.md`, `native/node_modules` symlink.
- Guard: no conflicts, no other active claims. Claimed: `lib/admin-references`, `app/(app)/admin/references`, `scripts/admin-references-selftest.mts`, this outbox. API route not claimed (no proven need).
- Actual settings (`get_session self`): model `claude-opus-5-5`, effort `xhigh` (UI "Extra"), Fast `off` (`sdk_opt_in_required`), permission `auto`. Unchanged. No sessions/subagents.

## Delivery — 2026-11-16 (implementation only; stopped for GPT independent review)

Not committed / pushed / deployed. No DB, Prisma schema, migration, package, native, storage-setting, bucket or RLS change; no source upload or deletion; no server-side URL fetch. Shared Prisma client / main `node_modules` untouched (main client mtime still 2026-11-02 18:35). Source verification and corpus review are **not** complete and not claimed.

### What changed (incremental vs accepted EX-REF02 files)

| File | Change | Lines now | sha256 |
| --- | --- | --- | --- |
| `lib/admin-references/schema.ts` | `externalVideo` parse + YouTube canonicalizer; video MIMEs removed from `ASSET_MIMES`; video file-name keys and any asset on a video entry rejected | +68 −5 → 517 | 85601a9f22fe8e34 |
| `lib/admin-references/load.ts` | status `external-video` for video entries; `OriginalKind` drops `video` | +9 −7 → 128 | f0d1ed82c5b2d85c |
| `lib/admin-references/original.ts` | defense in depth: catalog `kind === 'video'` → 404 before any detail read | +2 −1 → 170 | a434ba2e2f890007 |
| `app/(app)/admin/references/[id]/detail-parts.tsx` | `ExternalVideoNotice` (link / "원본 링크 확인 중"); PDF notice wording no longer mentions video | +37 −2 → 120 | 67f21cda4480f7d8 |
| `app/(app)/admin/references/[id]/page.tsx` | video entries render `ExternalVideoNotice` instead of the file-original notice; `#t=` jumps only for audio originals | +11 −5 → 321 | 89842f52de83432f |
| `lib/admin-references/README.md` | `externalVideo` format + no-hosted-video policy | +19 −3 → 117 | 17dacd3ab9d2d8aa |
| `scripts/admin-references-selftest.mts` | EX-REF03 section (synthetic only) | +197 −1 → 789 | 401fd79c3b0dc84a |

Unchanged (byte-identical): `view.ts` (search/coverage), `local-source.ts`, `storage.ts`, list `page.tsx`, `fail-screen.tsx`, API `route.ts` (not claimed — no dependency required it). Rights enum unchanged.

### Contract as implemented

- **Detail JSON**: optional `externalVideo: {url, title, author, checkedAt} | null`. Missing/`null` → `null` (old details load unchanged). Non-null only allowed when the catalog entry `kind === 'video'`; otherwise the whole detail is rejected. `title` (≤300), `author` (≤120) non-empty; `checkedAt` must parse as a date. Detail-level fail closed on any malformed field.
- **URL rule (YouTube only)**: `https://` + host exactly `www.youtube.com` | `youtube.com` | `m.youtube.com` with path exactly `/watch` and **only** the `v` query key (exactly once), or host exactly `youtu.be` with path `/<id>` and no query; id `^[A-Za-z0-9_-]{11}$`. Rejected: userinfo, any explicit port including `:443` (checked on the raw authority before URL normalization), `#`, whitespace/backslash, >200 chars, non-https schemes, protocol-relative/scheme-less, other hosts (lookalikes, trailing-dot, IDN homograph, IP, localhost, `googlevideo`, `ytimg`, `youtube-nocookie`, `music.youtube.com`), other paths (`/shorts`, `/embed`, `/v`, `/watch/`, encoded `?`), extra query keys (`si`, `list`, `t`, `feature`, redirect values). Stored/rendered form: `https://www.youtube.com/watch?v=<id>`. Never fetched by the server. Additional platforms: not accepted — please specify a concrete need to add one.
- **UI (video entries)**: with a link → "원본 영상 보기" (`target="_blank"`, `rel="noopener noreferrer"`), title · author, and "원래 올라온 사이트(YouTube)에서 열려요. 영상 파일은 우리 서버에 두지 않아요. 링크가 연결됐다고 영상 · 음성을 다 확인했다는 뜻은 아니에요. 확인한 범위는 위 기록 그대로예요. 링크 확인 <date>". Without → "원본 링크 확인 중이에요…" and no link (no search/fabricated link). No player, iframe, thumbnail, download, cache or proxy. Owner guard unchanged and still precedes private reads.
- **No hosted video**: `ASSET_MIMES` = `application/pdf`, `audio/mp4`, `audio/mpeg`, `image/jpeg`, `image/png` (all video/stream MIMEs rejected); asset keys ending in video extensions (`.mp4 .m4v .mov .qt .webm .mkv .avi .wmv .flv .mpg .mpeg .3gp .ogv .m2ts .mts`) rejected even if declared PDF; any `asset` on a `kind: "video"` entry rejects the whole detail. Proxy additionally returns 404 for catalog `kind === 'video'` before reading the detail. PDF/audio/image originals and Range behaviour unchanged. No storage deletion performed (none needed).
- **Coverage/search**: unchanged. `externalVideo` lives only in the detail; catalog `coverage`, list projection and totals do not read it.

### Checks (original exit codes)

| Check | Exit | Result |
| --- | --- | --- |
| `node --import ./scripts/alias-register.mjs scripts/admin-references-selftest.mts` | 0 | **282 passed · 0 failed** (173 existing unchanged + 109 EX-REF03): old details parse; 7 valid URL forms → one canonical form; 50 bad URLs rejected (helper and detail); 5 malformed `externalVideo` shapes rejected; `externalVideo` on document/research rejected; video status `external-video` regardless of rights; coverage/list totals identical with and without a link (26 s video / 40 s audio of 100 s, duration not counted as reviewed); null/USER/MANAGER blocked for video detail and proxy with 0 storage reads/0 asset fetches; 12 video/stream MIMEs and 8 video extensions rejected with 0 asset fetches; forged licensed video entry with PDF asset rejected by parser/loader and proxy (404, catalog-only read, 0 fetches); PDF 206/no-store and audio/image originals still accepted; static checks (link attrs, pending branch has no link, no iframe/video/ytimg/embed/search link, no `fetch(` in schema/load/view, no video MIME in allowlist). |
| Mutation sanity (each restored, files byte-identical after) | — | proxy video guard removed → 2 failures; `video/mp4` re-allowed → 3; video-entry asset allowed → 3; extra query allowed → 7; `externalVideo` on non-video allowed → 2. |
| scoped `tsc --noEmit` (EX-REF02/03 graph; temp tsconfig removed) | 0 | 0 errors |
| `npx eslint` (references app/api/lib + selftest) | 0 | clean |
| Visual (disposable scratch copy, COW clone of main `node_modules`, no Prisma generate, scratch-only page, fabricated title/ID; deleted after) | — | 375×812: no page overflow, link text "원본 영상 보기", href canonical, `_blank` + `noopener noreferrer`, 0 iframe/video/img; pending state has 0 links. External link not clicked. |
| Full `next build` | — | not run in the checkout (same `node_modules` symlink blocker: `Symlink [project]/node_modules is invalid, it points out of the filesystem root`). Final integrated build left to the coordinator. |

### Not verified / limits

- Real owner session with GPT's private details and real YouTube links; real USER/MANAGER sessions; native app WebView opening the external link (native unchanged).
- `checkedAt` is displayed as given (Asia/Seoul date); it is not proof of content review.
- Whether a given YouTube video is the author's original upload is GPT's verification responsibility; the code only enforces URL shape.

### Coordination

Claims released after this write-up: `lib/admin-references`, `app/(app)/admin/references`, `scripts/admin-references-selftest.mts`, this outbox. `HANDOFF.md` (+8, not mine) untouched. Settings unchanged: `claude-opus-5-5`, effort `xhigh`, Fast `off`, permission `auto`; no subagents/sessions.

### Appendix — exact incremental diff (vs accepted EX-REF02 file contents)

```diff
--- a/lib/admin-references/schema.ts
+++ b/lib/admin-references/schema.ts
@@ -16,9 +16,53 @@
 /** 원본 파일 열쇠(버킷 external-intake) — 이름은 불투명, 끝의 확장자는 있어도 없어도 된다 */
 export const ASSET_PREFIX = `${STORAGE_PREFIX}assets/`;
 export const ASSET_KEY = /^admin-references\/v1\/assets\/[A-Za-z0-9_-]{6,80}(\.[a-z0-9]{2,5})?$/;
-/** 원본으로 보낼 수 있는 형식 — HTML · SVG · 스크립트처럼 브라우저가 실행할 수 있는 형식은 넣지 않는다 */
-export const ASSET_MIMES = ['application/pdf', 'video/mp4', 'video/quicktime', 'video/webm', 'audio/mp4', 'audio/mpeg', 'image/jpeg', 'image/png'] as const;
+/**
+ * 원본으로 보낼 수 있는 형식 — HTML · SVG · 스크립트처럼 브라우저가 실행할 수 있는 형식은 넣지 않는다.
+ * 영상도 넣지 않는다(EX-REF03, 2026-11-16 사용자: 참고 영상 원본은 우리 서버에 두지 않는다 — 원래 올라온 곳의 링크로만 연다).
+ */
+export const ASSET_MIMES = ['application/pdf', 'audio/mp4', 'audio/mpeg', 'image/jpeg', 'image/png'] as const;
+/** 열쇠 이름이 영상 파일처럼 보이면 형식 값과 상관없이 거절 */
+const VIDEO_FILE_EXT = /\.(mp4|m4v|mov|qt|webm|mkv|avi|wmv|flv|mpg|mpeg|3gp|ogv|m2ts|mts)$/;

+/**
+ * 원본 영상 링크(EX-REF03) — 지금은 YouTube 만. 정해 둔 주소 모양만 받아 https://www.youtube.com/watch?v=<11자> 로 바꾼다.
+ * 서버는 이 주소를 읽지 않는다(화면 링크로만). 계정 · 포트 · # · v 밖의 쿼리(공유 토큰 si · 재생목록 · 시각 · 돌려보내기 값) ·
+ * 다른 호스트(닮은 이름 · IP · localhost · googlevideo 같은 영상 파일 주소) · http · javascript: · data: 는 모두 거절.
+ * 다른 영상 사이트가 필요하면 GPT 와 정한 뒤 이 목록에 더한다(아무 주소나 받지 않는다).
+ */
+const YOUTUBE_WATCH_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);
+const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;
+
+export function canonicalYouTubeUrl(raw: unknown): string | null {
+  if (typeof raw !== 'string') return null;
+  const s = raw.trim();
+  if (!s || s.length > 200 || /[\s\\#]/.test(s) || !/^https:\/\//i.test(s)) return null;
+  /* 주소 머리(호스트 자리)에 계정 · 포트가 있으면 거절 — URL 이 기본 포트 :443 을 지워 버리기 전에 본다 */
+  const authority = s.slice('https://'.length).split(/[/?]/)[0];
+  if (authority.includes('@') || authority.includes(':')) return null;
+  let u: URL;
+  try {
+    u = new URL(s);
+  } catch {
+    return null;
+  }
+  if (u.protocol !== 'https:' || u.username || u.password || u.port || u.hash) return null;
+  let id: string | null = null;
+  if (YOUTUBE_WATCH_HOSTS.has(u.hostname)) {
+    if (u.pathname !== '/watch') return null;
+    const keys = [...u.searchParams.keys()];
+    if (keys.length !== 1 || keys[0] !== 'v') return null;
+    id = u.searchParams.get('v');
+  } else if (u.hostname === 'youtu.be') {
+    if (u.search) return null;
+    id = u.pathname.slice(1);
+  } else {
+    return null;
+  }
+  if (!id || !YOUTUBE_ID.test(id)) return null;
+  return `https://www.youtube.com/watch?v=${id}`;
+}
+
 export const MAX_CATALOG_BYTES = 8 * 1024 * 1024;
 export const MAX_DETAIL_BYTES = 16 * 1024 * 1024;

@@ -126,6 +170,8 @@
 };
 export type GlossaryItem = { en: string; ko: string; meaning: string };
 export type Asset = { key: string; mime: (typeof ASSET_MIMES)[number]; filename: string; rightsConfirmed: boolean };
+/** 원본 영상 링크 — url 은 바꿔 둔 YouTube 주소, checkedAt 은 링크를 확인한 때(영상 전체를 검토했다는 뜻이 아니다) */
+export type ExternalVideo = { url: string; title: string; author: string; checkedAt: string };

 export type Detail = {
   id: string;
@@ -137,8 +183,10 @@
   glossary: GlossaryItem[];
   claims: Claim[];
   limitationsKo: string[];
-  /** 서버에서만 — 원본 파일 열쇠. 화면에는 대표관리자 원본 통로(app/api/admin/references/[id]/original) 주소만 간다(README) */
+  /** 서버에서만 — 원본 파일 열쇠. 화면에는 대표관리자 원본 통로(app/api/admin/references/[id]/original) 주소만 간다(README). 영상 자료는 늘 null */
   asset: Asset | null;
+  /** 영상 자료만 — 원래 올라온 곳의 원본 영상 링크(EX-REF03). 없는 옛 JSON 은 null */
+  externalVideo: ExternalVideo | null;
 };

 /* ─────────────────────────── 검사 도우미 ─────────────────────────── */
@@ -348,6 +396,18 @@
   };
 }

+/** 원본 영상 링크 — 없으면 null(옛 JSON 그대로 읽힘). 영상이 아닌 자료에 있거나 모양이 틀리면 자료 전체 거절 */
+function parseExternalVideo(v: unknown, kind: Kind): ExternalVideo | null {
+  if (v === undefined || v === null) return null;
+  if (kind !== 'video') fail('externalVideo');
+  const o = obj(v, 'externalVideo');
+  const url = canonicalYouTubeUrl(o.url);
+  if (!url) fail('externalVideo');
+  const checkedAt = str(o.checkedAt, 'externalVideo', 40);
+  if (!Number.isFinite(Date.parse(checkedAt))) fail('externalVideo');
+  return { url, title: str(o.title, 'externalVideo', TEXT.title), author: str(o.author, 'externalVideo', TEXT.short), checkedAt };
+}
+
 /** 한 자료 JSON 검사 — 목록의 그 항목과 같은 자료인지(id · 종류)도 본다 */
 export function parseDetail(raw: unknown, entry: Pick<Entry, 'id' | 'kind' | 'pageCount' | 'durationSeconds'>): ParseResult<Detail> {
   try {
@@ -415,10 +475,12 @@
     });
     let asset: Asset | null = null;
     if (o.asset !== undefined && o.asset !== null) {
+      /* 영상 자료에는 원본 파일을 두지 않는다(EX-REF03) — 어떤 형식이든 거절 */
+      if (kind === 'video') fail('asset');
       const a = obj(o.asset, 'asset');
       const key = str(a.key, 'asset', 300);
-      /* 원본은 비공개 버킷 external-intake 의 이 자리 안에서만(storage.ts) — '..' · 다른 폴더 열쇠는 거절 */
-      if (!ASSET_KEY.test(key)) fail('asset');
+      /* 원본은 비공개 버킷 external-intake 의 이 자리 안에서만(storage.ts) — '..' · 다른 폴더 열쇠 · 영상 파일 이름은 거절 */
+      if (!ASSET_KEY.test(key) || VIDEO_FILE_EXT.test(key)) fail('asset');
       asset = {
         key,
         /* 저장소에는 application/octet-stream 으로 있다 — 보낼 때 쓸 실제 형식을 여기서 정한다(이 목록 밖은 거절) */
@@ -440,6 +502,7 @@
         claims,
         limitationsKo: optArr(o.limitationsKo, 'limitationsKo', LIMITS.limitations).map((l) => str(l, 'limitationsKo', TEXT.line)),
         asset,
+        externalVideo: parseExternalVideo(o.externalVideo, kind),
       },
     };
   } catch (e) {
--- a/lib/admin-references/load.ts
+++ b/lib/admin-references/load.ts
@@ -34,7 +34,8 @@
 }

 /**
- * 원본 보기 상태 — 이미 있는 두 값(목록의 rights · 한 건의 asset)으로만 정한다(저장소를 따로 묻지 않는다).
+ * 원본 보기 상태 — 이미 있는 값(목록의 kind · rights, 한 건의 asset)으로만 정한다(저장소를 따로 묻지 않는다).
+ * - external-video: 영상 자료 — 원본 파일을 우리 서버에 두지 않는다(EX-REF03). 원본은 한 건의 externalVideo 링크로만(없으면 '링크 확인 중')
  * - original-not-offered: rights 'private-summary' — 옮긴 글 · 해설 · 요약은 비공개로 보여 주되(전체를 옮긴 자료일 수도 있다)
  *   원본 파일은 이 화면에서 제공하지 않는다
  * - permission-pending: rights 'pending', 또는 허락 자료인데 asset.rightsConfirmed 가 true 가 아님
@@ -42,10 +43,12 @@
  * - eligible: rights 'licensed-private' + asset.rightsConfirmed === true — 원본 통로(original.ts resolveOriginal)도 같은 두 조건을 따로 다시 본다
  * eligible 이어도 저장소에 실제 파일이 올라갔는지는 이 화면이 확인하지 않는다(없으면 원본 통로가 404).
  */
-export type OriginalStatus = 'eligible' | 'permission-pending' | 'not-linked' | 'original-not-offered';
-export type OriginalKind = 'pdf' | 'video' | 'audio' | 'image';
+export type OriginalStatus = 'eligible' | 'permission-pending' | 'not-linked' | 'original-not-offered' | 'external-video';
+/** 우리 원본 통로로 여는 파일의 종류 — 영상은 없다(EX-REF03) */
+export type OriginalKind = 'pdf' | 'audio' | 'image';

-export function originalStatusOf(entry: Pick<Entry, 'rights'>, detail: Pick<Detail, 'asset'>): OriginalStatus {
+export function originalStatusOf(entry: Pick<Entry, 'rights' | 'kind'>, detail: Pick<Detail, 'asset'>): OriginalStatus {
+  if (entry.kind === 'video') return 'external-video';
   if (entry.rights === 'private-summary') return 'original-not-offered';
   if (entry.rights !== 'licensed-private') return 'permission-pending';
   if (!detail.asset) return 'not-linked';
@@ -55,7 +58,6 @@

 function originalKindOf(mime: string): OriginalKind {
   if (mime === 'application/pdf') return 'pdf';
-  if (mime.startsWith('video/')) return 'video';
   if (mime.startsWith('audio/')) return 'audio';
   return 'image';
 }
@@ -63,10 +65,10 @@
 /** 원본 통로 주소 — 자료 번호만 담는다(저장소 열쇠 · 서명 주소 없음) */
 export const originalHref = (id: string) => `/api/admin/references/${id}/original`;

-/** 화면으로 보내는 한 자료 — 원본 열쇠(asset)는 빼고, 열 수 있을 때만 종류(쪽 · 시간 바로가기용) */
+/** 화면으로 보내는 한 자료 — 원본 열쇠(asset)는 빼고, 열 수 있을 때만 종류(쪽 · 시간 바로가기용). externalVideo 는 바꿔 둔 공개 링크 그대로 */
 export type PublicDetail = Omit<Detail, 'asset'> & { original: OriginalStatus; originalKind: OriginalKind | null };

-export function publicDetailOf(detail: Detail, entry: Pick<Entry, 'rights'>): PublicDetail {
+export function publicDetailOf(detail: Detail, entry: Pick<Entry, 'rights' | 'kind'>): PublicDetail {
   const { asset, ...rest } = detail;
   const original = originalStatusOf(entry, detail);
   return { ...rest, original, originalKind: original === 'eligible' && asset ? originalKindOf(asset.mime) : null };
--- a/lib/admin-references/original.ts
+++ b/lib/admin-references/original.ts
@@ -7,6 +7,7 @@
  *
  * 순서: 보는 사람 → 번호 모양 → 목록 → 그 항목의 한 건 → 한 건의 asset. 열쇠는 늘 목록 · 한 건에서만 온다(주소 · 화면이 정하지 못함).
  * 원본을 여는 조건: 목록의 rights 가 'licensed-private' 이고 한 건의 asset.rightsConfirmed === true. 아니면 저장소의 원본을 묻지 않는다.
+ * 영상 자료는 원본 파일을 두지 않는다(EX-REF03) — 목록의 kind 가 'video' 면 한 건도 읽지 않고 404. 한 건 검사(schema.ts)도 영상 형식 · 영상 자료의 asset 을 거절한다.
  * 원본은 비공개 버킷 external-intake 의 admin-references/v1/assets/ 에 application/octet-stream 으로 있다 —
  * 보내는 Content-Type 은 검사한 한 건의 asset.mime(허용 목록)이다. 저장소의 형식 · 주소 · 오류 글은 응답에 싣지 않는다.
  *
@@ -93,7 +94,7 @@
     const catalog = parseCatalog(parseJson(cat.text));
     if (!catalog.ok) return unavailable;
     const entry = catalog.value.entries.find((e) => e.id === id);
-    if (!entry || entry.rights !== 'licensed-private') return notFound;
+    if (!entry || entry.rights !== 'licensed-private' || entry.kind === 'video') return notFound;
     const det = await source.read(entry.detailKey, MAX_DETAIL_BYTES);
     if (!det.ok) return det.reason === 'missing' ? notFound : unavailable;
     const detail = parseDetail(parseJson(det.text), entry);
--- a/app/(app)/admin/references/[id]/page.tsx
+++ b/app/(app)/admin/references/[id]/page.tsx
@@ -21,7 +21,7 @@
   reviewLabel,
 } from '@/lib/admin-references/view';
 import { FailScreen } from '../fail-screen';
-import { OriginalNotice, SourceTable } from './detail-parts';
+import { ExternalVideoNotice, OriginalNotice, SourceTable } from './detail-parts';

 /**
  * 참고자료 한 건(대표관리자만, EX-REF02). 쉬운 요약 · 원저자 내용(한국어로 옮김) · 최신 근거로 본 판단을 서로 다른 칸으로 나눠 보인다.
@@ -50,7 +50,7 @@
   const translations = detail.sections.filter((s) => s.kind === 'translation' || s.kind === 'table');
   const notes = detail.sections.filter((s) => s.kind === 'note');
   const limitSections = detail.sections.filter((s) => s.kind === 'limitation');
-  /* 원본 바로가기 — 열 수 있을 때만(PDF 는 #page=, 영상 · 소리는 #t=) */
+  /* 원본 바로가기 — 열 수 있을 때만(PDF 는 #page=, 소리는 #t=. 영상 자료는 원본 파일이 없어 바로가기 없음) */
   const jump: Jump | null = detail.original === 'eligible' && detail.originalKind ? { href: originalHref(entry.id), kind: detail.originalKind } : null;

   return (
@@ -103,7 +103,12 @@
         </dl>
       </Block>

-      <OriginalNotice status={detail.original} href={jump ? jump.href : null} />
+      {/* 영상 자료는 원래 올라온 곳의 링크로만(EX-REF03), 그 밖의 자료는 우리 원본 통로 상태 */}
+      {entry.kind === 'video' ? (
+        <ExternalVideoNotice video={detail.externalVideo} />
+      ) : (
+        <OriginalNotice status={detail.original} href={jump ? jump.href : null} />
+      )}

       <Block title="쉽게 요약" note="검토자가 쉬운 말로 쓴 요약이에요. 원저자의 말과 다를 수 있어요.">
         {detail.digestKo ? <Prose text={detail.digestKo} /> : <Empty>요약이 아직 없어요.</Empty>}
@@ -211,7 +216,7 @@
 type Jump = { href: string; kind: OriginalKind };

 /**
- * 원본 위치 — '원문 3–5쪽' · '영상 1:02–3:40'. 원본을 열 수 있으면 원본을 여는 링크(PDF 는 첫 쪽 #page=, 영상 · 소리는 시작 #t=).
+ * 원본 위치 — '원문 3–5쪽' · '영상 1:02–3:40'. 원본을 열 수 있으면 원본을 여는 링크(PDF 는 첫 쪽 #page=, 소리는 시작 #t=).
  * 그 쪽 · 시각으로 실제로 가는지는 브라우저 · 앱의 보기 프로그램에 따른다 — 화면 글로 약속하지 않는다.
  */
 function Where({ pages, start, end, seconds, jump }: { pages?: readonly number[]; start?: number | null; end?: number | null; seconds?: readonly number[]; jump: Jump | null }) {
@@ -224,7 +229,8 @@
     ) : (
       <span key={key}>{text}</span>
     );
-  const media = jump && (jump.kind === 'video' || jump.kind === 'audio');
+  /* 우리 통로로 여는 원본에는 영상이 없다(EX-REF03) — 시각 바로가기는 소리 원본만 */
+  const media = jump?.kind === 'audio';
   if (pages && pages.length) {
     const first = [...pages].sort((a, b) => a - b)[0];
     parts.push(link('p', `원문 ${pagesText(pages)}`, jump?.kind === 'pdf' ? `page=${first}` : null));
--- a/app/(app)/admin/references/[id]/detail-parts.tsx
+++ b/app/(app)/admin/references/[id]/detail-parts.tsx
@@ -1,9 +1,10 @@
 import { ExternalLink, Lock } from '@/components/icon';
 import type { OriginalStatus } from '@/lib/admin-references/load';
+import type { ExternalVideo } from '@/lib/admin-references/schema';
 import { TABLE_CELL_REM, tableMinRem } from '@/lib/admin-references/view';

 /**
- * 참고자료 한 건의 표 · 원본 상태 한 줄(EX-REF02). 서버 컴포넌트로만 그린다(브라우저 컴포넌트 표시 없음).
+ * 참고자료 한 건의 표 · 원본 상태 한 줄(EX-REF02) · 원본 영상 링크(EX-REF03). 서버 컴포넌트로만 그린다(브라우저 컴포넌트 표시 없음).
  */

 const cellBox = { minWidth: `${TABLE_CELL_REM.min}rem`, maxWidth: `${TABLE_CELL_REM.max}rem` } as const;
@@ -64,7 +65,7 @@
           <ExternalLink aria-hidden className="h-3.5 w-3.5" />
         </a>
         <span>
-          저자 허락을 받은 원본이에요. 대표관리자만 볼 수 있어요. 쪽 · 시간 표시를 누르면 원본을 열어요. 그 쪽 · 시각으로 바로 가는지는 PDF · 영상을 보는
+          저자 허락을 받은 원본이에요. 대표관리자만 볼 수 있어요. 쪽 · 시간 표시를 누르면 원본을 열어요. 그 쪽 · 시각으로 바로 가는지는 원본을 여는
           프로그램에 따라 달라요.
         </span>
       </p>
@@ -83,3 +84,37 @@
     </p>
   );
 }
+
+const dateText = (iso: string) =>
+  new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
+
+/**
+ * 영상 자료의 원본 — 원래 올라온 곳(지금은 YouTube)으로 가는 링크 하나(EX-REF03). 우리 서버는 영상을 두지도 · 받지도 · 틀지도 않는다
+ * (플레이어 · iframe · 썸네일 · 통로 없음). 링크가 없으면 '링크 확인 중'만 — 찾기 결과 같은 링크를 만들어 넣지 않는다.
+ * 링크가 연결됐다는 것이 영상 · 음성을 다 확인했다는 뜻이 아님을 같이 적는다(확인한 범위는 위 칸의 기록 그대로).
+ */
+export function ExternalVideoNotice({ video }: { video: ExternalVideo | null }) {
+  if (!video) {
+    return (
+      <p className="flex items-start gap-2 rounded-2xl border border-line bg-surface-2 px-(--block-pad) py-3 text-sm leading-relaxed text-muted">
+        <Lock aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
+        원본 링크 확인 중이에요. 확인된 원본 영상 링크가 연결되면 여기서 원래 사이트로 열 수 있어요. 영상 파일은 우리 서버에 두지 않아요.
+      </p>
+    );
+  }
+  return (
+    <div className="rounded-2xl border border-line bg-surface px-(--block-pad) py-3 text-sm leading-relaxed text-muted">
+      <a href={video.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-sky hover:underline">
+        원본 영상 보기
+        <ExternalLink aria-hidden className="h-3.5 w-3.5" />
+      </a>
+      <p className="mt-1 break-words text-ink">
+        {video.title} <span className="text-muted">· {video.author}</span>
+      </p>
+      <p className="mt-1 text-xs">
+        원래 올라온 사이트(YouTube)에서 열려요. 영상 파일은 우리 서버에 두지 않아요. 링크가 연결됐다고 영상 · 음성을 다 확인했다는 뜻은 아니에요. 확인한
+        범위는 위 기록 그대로예요. 링크 확인 {dateText(video.checkedAt)}.
+      </p>
+    </div>
+  );
+}
--- a/lib/admin-references/README.md
+++ b/lib/admin-references/README.md
@@ -13,8 +13,11 @@
 | 한 건 | `admin-references/v1/entries/<id>.json` (16 MB 까지, 열쇠는 목록의 `detailKey` 만) |
 | 원본 파일 | **버킷 `external-intake`** 의 `admin-references/v1/assets/<불투명 이름>[.확장자]` (`application/octet-stream` 으로 올림) |

-버킷 설정 · 정책은 바꾸지 않는다. 원본의 실제 형식은 한 건 JSON 의 `asset.mime` 이 정한다(PDF · mp4 · mov · webm · m4a · mp3 · jpeg · png 만).
+버킷 설정 · 정책은 바꾸지 않는다. 원본의 실제 형식은 한 건 JSON 의 `asset.mime` 이 정한다(PDF · m4a · mp3 · jpeg · png 만).

+**참고 영상 원본은 우리 서버에 두지 않는다**(EX-REF03, 2026-11-16 사용자). 영상 형식 `asset.mime`, 영상 파일 이름의 열쇠(.mp4 · .mov · .webm 등),
+영상 자료(`kind: "video"`)의 `asset` 은 모두 한 건 전체를 거절한다. 영상은 한 건의 `externalVideo` 링크로 원래 올라온 곳에서 연다.
+
 내 컴퓨터에서만 미리 볼 때: 서버 환경변수 `ADMIN_REFERENCES_LOCAL_DIR` 에 폴더를 주면, 운영이 아닐 때(`NODE_ENV !== 'production'`)
 그 폴더에서 `catalog.json` · `entries/<id>.json` · `assets/<이름>` 을 읽는다. 폴더 밖 열쇠는 거절한다. 그 폴더는 저장소 · 배포물에 넣지 않는다.

@@ -79,7 +82,9 @@
                               "limitations": "…", "applicability": "direct" }] }],   // direct | inferred
   "limitationsKo": ["…"],
   "asset": { "key": "admin-references/v1/assets/ref_abc123.pdf", "mime": "application/pdf",
-             "filename": "…", "rightsConfirmed": true }    // 선택. 열쇠는 external-intake 버킷 안
+             "filename": "…", "rightsConfirmed": true },   // 선택. 열쇠는 external-intake 버킷 안. 영상 자료에는 두지 않는다
+  "externalVideo": { "url": "https://www.youtube.com/watch?v=<11자>", "title": "…", "author": "…",
+                     "checkedAt": "2026-11-16T00:00:00Z" }  // 선택, 영상 자료만(아니면 거절). 없거나 null 이면 '원본 링크 확인 중'
 }
 ```

@@ -94,8 +99,19 @@
   열쇠는 주소가 아니라 목록 → 한 건 → `asset.key` 에서만 온다. 서버가 요청마다 60초 서명 주소를 만들어 그 자리에서 받고 버린다(응답 · 화면 · 캐시에 없음).
   응답: `Content-Type` = `asset.mime`, `Cache-Control: private, no-store`, `nosniff`, `Accept-Ranges: bytes`.
   Range 는 한 구간(`bytes=a-b` · `a-` · `-n`)만, 한 번에 4 MB 까지로 줄여 넘긴다(영상 · PDF 보기는 다음 구간을 다시 청한다). 여러 구간 · 틀린 모양은 무시하고 처음부터.
-  화면의 원본 상태(목록 `rights` · 한 건 `asset` 으로만 정함, 저장소는 따로 묻지 않음):
+  화면의 원본 상태(목록 `kind` · `rights`, 한 건 `asset` 으로만 정함, 저장소는 따로 묻지 않음). 영상 자료는 아래 대신 '원본 영상 보기' 링크(아래 절):
   `private-summary` → 옮긴 글 · 해설 · 요약은 비공개로 보이고(전체를 옮긴 자료일 수도 있음) 원본 파일은 제공하지 않음 · `pending`(또는 허락 자료인데 `asset.rightsConfirmed` 가 true 아님) → 허락 확인 중 ·
   `licensed-private` + `asset` 없음 → 허락은 됐지만 파일 연결 전 · `licensed-private` + `rightsConfirmed: true` → '원본 열기'.
   열 수 있을 때 쪽 · 시각 표시는 원본을 여는 링크가 되고 `#page=` · `#t=` 를 붙이지만, 그 자리로 가는지는 브라우저 · 앱의 보기 프로그램에 따른다.
 - 페이지는 요청마다 새로 읽는다(쿠키를 읽어 늘 동적, `connection()`), 받은 글을 서버에 기억해 두지 않는다.
+
+## 원본 영상 링크 `externalVideo` (EX-REF03)
+
+- 영상 자료만. 모양 `{ url, title, author, checkedAt }` 또는 없음/null. 없는 옛 JSON 은 그대로 읽힌다.
+- 지금은 YouTube 만: `https://www.youtube.com/watch?v=<11자>`(호스트 `www.youtube.com` · `youtube.com` · `m.youtube.com`, 쿼리는 `v` 하나뿐) 또는
+  `https://youtu.be/<11자>`(쿼리 없음). 저장할 때 `https://www.youtube.com/watch?v=<id>` 로 바꾼다.
+  계정 · 포트(:443 포함) · `#` · 다른 쿼리(공유 토큰 `si` · 재생목록 · 시각 · 돌려보내기 값) · 다른 호스트(닮은 이름 · IP · localhost ·
+  영상 파일 주소) · http · javascript: · data: 는 한 건 전체 거절. 다른 사이트가 필요하면 GPT 와 정한 뒤 더한다.
+- 서버는 이 주소를 읽지 않는다. 화면은 '원본 영상 보기'(새 창, noopener noreferrer) 링크와 제목 · 올린 사람 · 링크 확인 날짜만 보인다.
+  플레이어 · iframe · 썸네일 · 내려받기 · 원본 통로 없음. 링크가 연결된 것은 영상 · 음성을 다 확인했다는 뜻이 아니다(확인한 범위는 목록의 `coverage` 그대로).
+- 원본 통로(`/api/admin/references/<id>/original`)는 목록의 `kind` 가 `video` 면 한 건도 읽지 않고 404 다.
--- a/scripts/admin-references-selftest.mts
+++ b/scripts/admin-references-selftest.mts
@@ -6,7 +6,7 @@
 import { readdirSync, readFileSync, statSync } from 'node:fs';
 import os from 'node:os';
 import path from 'node:path';
-import { parseCatalog, parseDetail, validEntryId, CATALOG_KEY, type Entry } from '../lib/admin-references/schema.ts';
+import { canonicalYouTubeUrl, parseCatalog, parseDetail, validEntryId, CATALOG_KEY, type Entry } from '../lib/admin-references/schema.ts';
 import { loadCatalogFor, loadDetailFor, originalHref, publicDetailOf, type ReferenceSource, type SourceRead } from '../lib/admin-references/load.ts';
 import {
   bibNote,
@@ -148,6 +148,12 @@
 });

 const ADMIN = { role: 'ADMIN' };
+/** 목록에서 읽은 허락 문서 항목(lic_delta4) */
+const LICENSED_ENTRY = (): Entry => {
+  const p = parseCatalog(catalog());
+  if (!p.ok) throw new Error('fixture');
+  return p.value.entries.find((x) => x.id === 'lic_delta4')!;
+};
 const viewers: [string, { role: string } | null][] = [
   ['로그인 안 함', null],
   ['일반(USER)', { role: 'USER' }],
@@ -587,6 +593,196 @@
   check('원본 상태 글 넷이 서로 다름', ['연결되지 않았어요', '원본 파일은 이 화면에서 제공하지 않아요', '허락을 확인하는 중', '원본 열기'].every((t) => parts.includes(t)));
   check("private-summary 를 '요약만'이라고 쓰지 않음(라벨 · 원본 상태 글)", !RIGHTS_LABEL['private-summary'].includes('요약만') && !/요약만/.test(parts) && RIGHTS_LABEL['private-summary'].includes('옮김') && RIGHTS_LABEL['private-summary'].includes('원본'));
   check("바로가기를 '그 자리로 가요'라고 단정하지 않음", !/그 자리로 가요/.test(parts + det + read('lib/admin-references/README.md')));
+}
+
+
+/* ─────────────── 10. EX-REF03 — 원본 영상은 링크로만, 영상 원본 파일은 받지 않음 ─────────────── */
+console.log('\n[EX-REF03 — 원본 영상 링크 · 영상 원본 파일 거절]');
+{
+  const ID = 'AbCdEfGhIj0';
+  const CANON = `https://www.youtube.com/watch?v=${ID}`;
+  const ev = (url: unknown, over: Record<string, unknown> = {}) => ({ url, title: '지어낸 영상 제목', author: '지어낸 채널', checkedAt: '2026-11-16T00:00:00Z', ...over });
+  const parsedCat = parseCatalog(catalog());
+  const cat = parsedCat.ok ? parsedCat.value.entries : [];
+  const vidE = cat.find((x) => x.id === 'vid_beta22')!;
+  const docE = cat.find((x) => x.id === 'doc_alpha1')!;
+  const resE = cat.find((x) => x.id === 'res_gamma3')!;
+  const vidDetail = (over: Record<string, unknown> = {}) =>
+    detail('vid_beta22', 'video', { title: '가짜 영상', sections: [{ id: 'v1', title: '구간', kind: 'note', startSeconds: 5, endSeconds: 20, textKo: '지어낸 화면 메모' }], claims: [], ...over });
+
+  /* 옛 JSON · null */
+  const old = parseDetail(vidDetail(), vidE);
+  check('옛 영상 한 건(externalVideo 없음) 그대로 읽힘 → null', old.ok && old.value.externalVideo === null);
+  const nul = parseDetail(vidDetail({ externalVideo: null }), vidE);
+  check('externalVideo: null 도 읽힘', nul.ok && nul.value.externalVideo === null);
+  const oldDoc = parseDetail(detail('doc_alpha1'), docE);
+  check('옛 문서 한 건도 그대로 읽힘(externalVideo null)', oldDoc.ok && oldDoc.value.externalVideo === null);
+
+  /* 바른 주소 → 하나의 모양 */
+  for (const [input, note] of [
+    [CANON, 'www watch'],
+    [`https://youtube.com/watch?v=${ID}`, 'youtube.com'],
+    [`https://m.youtube.com/watch?v=${ID}`, 'm.youtube.com'],
+    [`https://youtu.be/${ID}`, 'youtu.be'],
+    [`HTTPS://WWW.YOUTUBE.COM/watch?v=${ID}`, '대문자 머리'],
+    [`https://youtu.be/${ID}?`, '빈 쿼리'],
+    [`https://www.youtube.com/watch?v=Zz_-0123456`, '_ · - 든 번호'],
+  ] as const) {
+    const want = input.includes('Zz_-0123456') ? 'https://www.youtube.com/watch?v=Zz_-0123456' : CANON;
+    check(`바른 주소(${note}) → ${want}`, canonicalYouTubeUrl(input) === want, String(canonicalYouTubeUrl(input)));
+  }
+  const good = parseDetail(vidDetail({ externalVideo: ev(`https://youtu.be/${ID}`) }), vidE);
+  check('한 건에서 바꿔 둔 주소 · 제목 · 올린 사람 · 확인 시각', good.ok && good.value.externalVideo?.url === CANON && good.value.externalVideo.title === '지어낸 영상 제목' && good.value.externalVideo.author === '지어낸 채널' && good.value.externalVideo.checkedAt === '2026-11-16T00:00:00Z');
+
+  /* 틀린 주소 — 모두 null, 한 건 전체 거절 */
+  const bad: [string, unknown][] = [
+    ['계정:비밀번호', `https://user:pw@www.youtube.com/watch?v=${ID}`],
+    ['계정', `https://user@www.youtube.com/watch?v=${ID}`],
+    ['기본 포트 :443', `https://www.youtube.com:443/watch?v=${ID}`],
+    ['포트 :8080', `https://www.youtube.com:8080/watch?v=${ID}`],
+    ['# 붙음', `https://www.youtube.com/watch?v=${ID}#t=10`],
+    ['닮은 호스트(뒤에 붙임)', `https://www.youtube.com.evil.example/watch?v=${ID}`],
+    ['닮은 호스트(.co)', `https://youtube.co/watch?v=${ID}`],
+    ['닮은 호스트(점 빠짐)', `https://wwwyoutube.com/watch?v=${ID}`],
+    ['닮은 호스트(키릴 о)', `https://www.yоutube.com/watch?v=${ID}`],
+    ['닮은 호스트(youtu.be.)', `https://youtu.be.evil.example/${ID}`],
+    ['끝에 점 붙은 호스트', `https://www.youtube.com./watch?v=${ID}`],
+    ['다른 호스트 경로에 이름', `https://evil.example/www.youtube.com/watch?v=${ID}`],
+    ['nocookie embed', `https://www.youtube-nocookie.com/embed/${ID}`],
+    ['music 호스트', `https://music.youtube.com/watch?v=${ID}`],
+    ['IP', `https://127.0.0.1/watch?v=${ID}`],
+    ['localhost', `https://localhost/watch?v=${ID}`],
+    ['IPv6', `https://[::1]/watch?v=${ID}`],
+    ['http', `http://www.youtube.com/watch?v=${ID}`],
+    ['javascript:', 'javascript:alert(1)'],
+    ['data:', 'data:text/html,hi'],
+    ['file:', 'file:///tmp/x.mp4'],
+    ['머리 없음(//)', `//www.youtube.com/watch?v=${ID}`],
+    ['머리 없음', `www.youtube.com/watch?v=${ID}`],
+    ['영상 파일 주소(googlevideo)', 'https://rr1---sn-abc.googlevideo.com/videoplayback?id=x'],
+    ['썸네일 주소(ytimg)', `https://i.ytimg.com/vi/${ID}/hqdefault.jpg`],
+    ['YouTube 돌려보내기', 'https://www.youtube.com/redirect?q=https://evil.example'],
+    ['공유 토큰 si', `https://www.youtube.com/watch?v=${ID}&si=tok123`],
+    ['youtu.be 공유 토큰', `https://youtu.be/${ID}?si=tok123`],
+    ['재생목록', `https://www.youtube.com/watch?v=${ID}&list=PLxyz`],
+    ['시각 t', `https://www.youtube.com/watch?v=${ID}&t=30`],
+    ['돌려보내기 값', `https://www.youtube.com/watch?v=${ID}&redirect=https://evil.example`],
+    ['v 둘', `https://www.youtube.com/watch?v=${ID}&v=Zz_-0123456`],
+    ['v 앞에 다른 값', `https://www.youtube.com/watch?feature=share&v=${ID}`],
+    ['번호 10자', 'https://www.youtube.com/watch?v=AbCdEfGhIj'],
+    ['번호 12자', 'https://www.youtube.com/watch?v=AbCdEfGhIj01'],
+    ['번호에 !', 'https://www.youtube.com/watch?v=AbCdEfGhIj!'],
+    ['빈 v', 'https://www.youtube.com/watch?v='],
+    ['/watch/', `https://www.youtube.com/watch/?v=${ID}`],
+    ['shorts', `https://www.youtube.com/shorts/${ID}`],
+    ['embed', `https://www.youtube.com/embed/${ID}`],
+    ['/v/', `https://www.youtube.com/v/${ID}`],
+    ['인코딩된 ?', `https://www.youtube.com/watch%3Fv=${ID}`],
+    ['번호 뒤 .mp4', `https://youtu.be/${ID}.mp4`],
+    ['youtu.be 하위 경로', `https://youtu.be/${ID}/x`],
+    ['빈칸', `https://www.youtube.com/watch?v=AbCdE fGhIj0`],
+    ['줄바꿈', `https://www.youtube.com/watch?v=${ID}\nhttps://evil.example`],
+    ['역슬래시', `https://www.youtube.com\\@evil.example/watch?v=${ID}`],
+    ['너무 김', `https://www.youtube.com/watch?v=${ID}${'&x'.repeat(200)}`],
+    ['문자열 아님', 42],
+    ['null 주소', null],
+  ];
+  for (const [name, url] of bad) {
+    const r = parseDetail(vidDetail({ externalVideo: ev(url) }), vidE);
+    check(`틀린 주소 거절: ${name}`, canonicalYouTubeUrl(url) === null && !r.ok);
+  }
+  for (const [name, over] of [
+    ['제목 없음', { title: '' }],
+    ['올린 사람 없음', { author: undefined }],
+    ['확인 시각 없음', { checkedAt: undefined }],
+    ['확인 시각이 날짜 아님', { checkedAt: 'yesterday' }],
+    ['객체 아님', null],
+  ] as const) {
+    const value = over === null ? 'https://youtu.be/x' : ev(CANON, over as Record<string, unknown>);
+    check(`externalVideo 모양 틀림 거절: ${name}`, !parseDetail(vidDetail({ externalVideo: value }), vidE).ok);
+  }
+
+  /* 영상이 아닌 자료에는 원본 영상 링크를 두지 않는다 */
+  check('문서 자료에 externalVideo → 한 건 거절', !parseDetail(detail('doc_alpha1', 'document', { externalVideo: ev(CANON) }), docE).ok);
+  check('연구 자료에 externalVideo → 한 건 거절', !parseDetail(detail('res_gamma3', 'research', { externalVideo: ev(CANON) }), resE).ok);
+
+  /* 영상 자료의 화면 상태 */
+  const m = memSource({ ...files(), [key('vid_beta22')]: vidDetail({ externalVideo: ev(`https://m.youtube.com/watch?v=${ID}`) }) });
+  const vd = await loadDetailFor(ADMIN, 'vid_beta22', m.source);
+  check('영상 한 건: 원본 상태 external-video · 우리 통로 종류 없음 · 바꿔 둔 링크', vd.ok && vd.detail.original === 'external-video' && vd.detail.originalKind === null && vd.detail.externalVideo?.url === CANON);
+  const noLink = await loadDetailFor(ADMIN, 'vid_beta22', memSource(files()).source);
+  check('링크 없는 영상 한 건: externalVideo null(화면은 링크 확인 중)', noLink.ok && noLink.detail.externalVideo === null && noLink.detail.original === 'external-video');
+  const licVidCat = catalog([entry(), entry({ ...VIDEO, rights: 'licensed-private' }), UNREAD, LICENSED]);
+  const licVid = await loadDetailFor(ADMIN, 'vid_beta22', memSource({ ...files(), [CATALOG_KEY]: licVidCat }).source);
+  check('허락 받은 영상 자료도 원본 파일 상태가 아니라 external-video', licVid.ok && licVid.detail.original === 'external-video' && licVid.detail.originalKind === null);
+
+  /* 확인한 범위는 링크와 상관없이 목록 기록 그대로 */
+  const plain = await loadDetailFor(ADMIN, 'vid_beta22', memSource(files()).source);
+  check('링크가 붙어도 확인한 범위 같음(화면 26초 · 음성 40초, 길이 100초를 확인으로 치지 않음)',
+    vd.ok && plain.ok && JSON.stringify(vd.entry.coverageView) === JSON.stringify(plain.entry.coverageView) && vd.entry.coverageView.videoSeconds === 26 && vd.entry.coverageView.audioSeconds === 40 && vd.entry.coverageView.audioPending === 60);
+  check('목록 전체 범위도 같음(한 건의 링크는 목록 계산에 안 들어감)', JSON.stringify(totalsOf(cat)) === JSON.stringify(totalsOf(parseCatalog(catalog()).ok ? (parseCatalog(catalog()) as { ok: true; value: { entries: Entry[] } }).value.entries : [])) && !('externalVideo' in listItemOf(vidE)));
+
+  /* 보는 사람 — 영상 자료도 저장소를 묻기 전에 막힘 */
+  for (const [name, v] of viewers) {
+    const mm = memSource(files());
+    const d = await loadDetailFor(v, 'vid_beta22', mm.source);
+    const f = recFetch(() => fakeUpstream(200, {}));
+    const r = await serveOriginal({ viewer: v, id: 'vid_beta22', rangeHeader: null, source: mm.source, fetchAsset: f.fetchAsset });
+    check(`${name}: 영상 자료 한 건 · 원본 통로 모두 막힘, 저장소 0번`, !d.ok && d.reason === 'forbidden' && r.status === (v ? 403 : 401) && mm.reads.length === 0 && f.calls.length === 0);
+  }
+
+  /* 영상 원본 파일 — 형식 · 이름 · 영상 자료 어디로든 거절, 원본 받기 전에 */
+  const licDocCat = catalog([entry(), VIDEO, UNREAD, LICENSED]);
+  const VIDEO_MIMES = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/ogg', 'video/x-msvideo', 'video/mpeg', 'video/3gpp', 'application/x-mpegURL', 'application/vnd.apple.mpegurl', 'application/dash+xml', 'application/octet-stream'];
+  for (const mime of VIDEO_MIMES) {
+    const forged = { ...files(), [CATALOG_KEY]: licDocCat, [key('lic_delta4')]: detail('lic_delta4', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/lic_delta4.bin', mime } }) };
+    const pr = parseDetail(forged[key('lic_delta4')], LICENSED_ENTRY());
+    const f = recFetch(() => fakeUpstream(200, { 'content-type': mime }));
+    const r = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=0-', source: memSource(forged).source, fetchAsset: f.fetchAsset });
+    check(`영상 · 스트림 형식 ${mime} → 거절, 원본 받기 0번`, !pr.ok && r.status !== 200 && r.status !== 206 && f.calls.length === 0);
+  }
+  for (const ext of ['mp4', 'mov', 'webm', 'm4v', 'mkv', 'avi', 'mpeg', '3gp']) {
+    const forged = { ...files(), [key('lic_delta4')]: detail('lic_delta4', 'document', { asset: { ...ASSET, key: `admin-references/v1/assets/lic_delta4.${ext}` } }) };
+    const f = recFetch(() => fakeUpstream(200, {}));
+    const r = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: null, source: memSource(forged).source, fetchAsset: f.fetchAsset });
+    check(`영상 파일 이름 .${ext}(형식은 PDF 라고 적어도) → 거절, 원본 받기 0번`, !parseDetail(forged[key('lic_delta4')], LICENSED_ENTRY()).ok && f.calls.length === 0 && r.status === 503);
+  }
+  {
+    /* 영상 자료에 원본 파일을 적은 위조 한 건 — 허락 · 확인 표시까지 다 달아도 */
+    const forgedVid = { ...files(), [CATALOG_KEY]: licVidCat, [key('vid_beta22')]: vidDetail({ asset: { ...ASSET, key: 'admin-references/v1/assets/vid_beta22.pdf' } }) };
+    check('영상 자료의 asset(PDF 라도) → 한 건 거절', !parseDetail(forgedVid[key('vid_beta22')], vidE).ok);
+    const viaLoad = await loadDetailFor(ADMIN, 'vid_beta22', memSource(forgedVid).source);
+    check('화면 로더도 거절(malformed)', !viaLoad.ok && viaLoad.reason === 'malformed');
+    const mm = memSource(forgedVid);
+    const f = recFetch(() => fakeUpstream(206, { 'content-range': 'bytes 0-4/100' }));
+    const r = await serveOriginal({ viewer: ADMIN, id: 'vid_beta22', rangeHeader: 'bytes=0-4', source: mm.source, fetchAsset: f.fetchAsset });
+    check('원본 통로: 영상 자료는 한 건도 안 읽고 404, 원본 받기 0번', r.status === 404 && f.calls.length === 0 && mm.reads.length === 1 && mm.reads[0] === CATALOG_KEY);
+  }
+
+  /* PDF · 소리 원본은 그대로 */
+  {
+    const f = recFetch(() => fakeUpstream(206, { 'content-range': 'bytes 0-9/1000' }));
+    const r = await serveOriginal({ viewer: ADMIN, id: 'lic_delta4', rangeHeader: 'bytes=0-9', source: memSource(files()).source, fetchAsset: f.fetchAsset });
+    check('PDF 원본은 그대로 206 · application/pdf · 저장 금지', r.status === 206 && r.headers.get('content-type') === 'application/pdf' && /no-store/.test(r.headers.get('cache-control') ?? '') && f.calls[0]?.key === ASSET.key);
+    const audio = parseDetail(detail('lic_delta4', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/lic_delta4.m4a', mime: 'audio/mp4' } }), LICENSED_ENTRY());
+    check('소리 원본(.m4a · audio/mp4)은 문서 자료에 그대로 허용 · 종류 audio', audio.ok && publicDetailOf(audio.value, LICENSED_ENTRY()).originalKind === 'audio');
+    const img = parseDetail(detail('lic_delta4', 'document', { asset: { ...ASSET, key: 'admin-references/v1/assets/lic_delta4.png', mime: 'image/png' } }), LICENSED_ENTRY());
+    check('그림 원본(png)도 그대로', img.ok && publicDetailOf(img.value, LICENSED_ENTRY()).original === 'eligible');
+  }
+
+  /* 화면 코드 — 링크만, 플레이어 · 썸네일 · 서버 읽기 없음 */
+  const rd = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
+  const parts = rd('app/(app)/admin/references/[id]/detail-parts.tsx');
+  const page = rd('app/(app)/admin/references/[id]/page.tsx');
+  const ext = parts.slice(parts.indexOf('export function ExternalVideoNotice'));
+  check("원본 영상 링크: '원본 영상 보기' · 새 창 · noopener noreferrer", ext.includes('원본 영상 보기') && ext.includes('target="_blank"') && ext.includes('rel="noopener noreferrer"') && ext.includes('href={video.url}'));
+  check("링크 없으면 '원본 링크 확인 중' · 그 갈래에 링크 없음", (() => { const pend = ext.slice(ext.indexOf('if (!video)'), ext.indexOf('return (', ext.indexOf('if (!video)') + 20) + 400); return pend.includes('원본 링크 확인 중') && !pend.slice(0, pend.indexOf('</p>')).includes('href='); })());
+  check('링크가 영상 · 음성 확인을 뜻하지 않는다고 적음', ext.includes('다 확인했다는 뜻은 아니에요'));
+  check('영상 자료는 우리 원본 통로 상태 대신 원본 영상 링크', page.includes("entry.kind === 'video' ?") && page.includes('<ExternalVideoNotice video={detail.externalVideo} />'));
+  const allFiles = ['lib/admin-references/schema.ts', 'lib/admin-references/load.ts', 'lib/admin-references/view.ts', 'lib/admin-references/original.ts', 'app/(app)/admin/references/page.tsx', 'app/(app)/admin/references/[id]/page.tsx', 'app/(app)/admin/references/[id]/detail-parts.tsx'].map(rd).join('\n');
+  check('플레이어 · iframe · 썸네일 · 찾기 결과 링크 없음', !/<iframe|<video|ytimg|youtube-nocookie|\/embed\/|results\?search_query/.test(allFiles));
+  check('서버가 영상 주소를 읽지 않음(검사 · 화면 모듈에 fetch 없음)', !['lib/admin-references/schema.ts', 'lib/admin-references/load.ts', 'lib/admin-references/view.ts'].map(rd).join('\n').includes('fetch('));
+  check('우리 통로로 여는 형식 목록에 영상 없음', !/'video\//.test(rd('lib/admin-references/schema.ts').split('export const ASSET_MIMES')[1].split('\n')[0]));
 }

 console.log(`\n통과 ${passed} · 실패 ${failed}`);
```
