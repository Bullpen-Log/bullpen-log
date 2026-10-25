# Claude implementation brief: DUGOUT trusted resale commerce

Prepared 2026-10-25. Read the companion `dugout-market-commerce-plan.md` first.

## Mission and delivery boundaries

Turn DUGOUT's baseball-equipment classifieds into a trustworthy, purchase-first resale marketplace. Buying should feel as straightforward as ordinary online shopping. Selling should require a few clear decisions, not a merchant-designed promotional page. The visual experience should feel at home beside Apple's first-party apps: calm, photographic, legible, predictable, and precise.

This is a phased implementation brief, not permission to enable live payments or modify the shared production database. Begin with the repository audit and a working Phase 1 visual implementation using existing data. Continue independent reversible work without repeatedly asking for permission. Prepare concrete proposals for the decisions and external dependencies identified below. Never imply that a demo completes a real transaction.

Read AGENTS.md, HANDOFF.md, relevant current project design guidance, and the installed Next.js documentation before editing. Preserve others' work. Follow the current AGENTS rule to work in the main checkout serving localhost:3000 unless the user explicitly selects another worktree. Check git status before each phase. The database is shared with production: never run prisma migrate dev, db push, or migrate reset. Do not run the package build script as a harmless verification: it includes migrate deploy. Follow AGENTS coordination and backup procedures before any authorized schema deployment.

Read the current code instead of assuming historical paths or UI decisions remain valid. The current site helper defaults to https://dugout-baseball.com; use the canonical URL helper and configured environment, not new hardcoded domains. Do not commit, push, deploy, contact providers, or write production test data without applicable user authorization.

## Verified starting point

- `app/(dugout)/market/page.tsx`: listing discovery.
- `app/(dugout)/market/[id]/page.tsx`: square cropped gallery, static thumbnails, price/specification panel, chat-first CTA, text-only description, seller activity metrics.
- `components/dugout/listing-form.tsx`: one long form, sequential uploads and five-photo limit.
- `app/actions/market.ts`: logged-in seller access and ownership checks; these are not verified identity checks.
- `lib/market/specs.ts`: category schemas and MAX_IMAGES=5.
- `app/api/market/upload-url/route.ts`: signed upload targets; inspect server-side content validation before expanding uploads.
- `components/dugout/pay-shell.tsx`: shared payment placeholder used outside the marketplace too. Do not alter lessons or venues accidentally.
- `app/(dugout)/pay/listing/[id]/page.tsx`: disabled checkout; misleading unsupported escrow/three-day release copy; displayed percentage uses Math.round(3.5), although calculation uses 3.5% rounded up to 100 won.
- `lib/market/pay.ts`: provisional fee assumptions, not approved pricing.
- `prisma/schema.prisma`: Listing, favorites and chat exist; design the real order/payment/refund/payout lifecycle after a fresh audit.
- Native navigation currently recognizes marketplace web routes. Preserve working webview routing and return paths; do not build a second inconsistent marketplace before checking actual clients.
- The user removed category landing carousel banners. Do not reintroduce them.

## Product rules

1. Anyone may browse. An authenticated user may prepare a private draft. Only a seller whose required identity and payout-account checks have passed may publish a purchasable listing. Enforce this on the server, including alternate APIs and edits.
2. Identity verification is not product authentication, creditworthiness, or a guarantee against fraud. Display precise evidence labels: '본인 확인', '정산 계좌 확인', and transaction-based metrics. Never use '100% 안전', '정품 보장', or '검수 완료' without a real applicable service.
3. Ship-to-buyer, fixed-price, single-item orders are the initial live scope. Every used item has quantity one. No multi-seller cart, bidding, installments invented by us, or elaborate coupon ecosystem in MVP.
4. '안전하게 구매하기' is primary only when protected purchasing is genuinely available. '문의하기' is secondary. Browsing or asking a question must not reserve the item. An unsupported checkout must clearly say it is unavailable; never silently substitute direct bank transfer.
5. In-person handoff remains a separate path, not a fake shipment. Initially keep it inquiry-only or disable protected handoff until its protocol is independently implemented and supported by the provider.
6. Shipping cost and every buyer fee must be disclosed before payment; the server computes the exact total. Show sellers their net proceeds. No fake discounts, false scarcity, fabricated reviews, seller scores or delivery guarantees.
7. Do not derive marketplace reputation from Sinker pitching activity, health records, or training history. Do not expose those as a seller trust signal.
8. Reviews belong to verified completed orders. Label seller reviews separately from reviews of this unique used item. Use understandable counts; do not invent a mystery trust score.

## Design direction

Use Apple Photos for photo inspection, Apple Settings for grouped factual rows, and Wallet for a calm final confirmation. These are behavioral references, not assets to copy.

Keep the existing DUGOUT brand and supplied icon system. Use green primarily for the main action and selected states. Use system font stacks where appropriate; preserve Korean readability and existing tokens. Do not download proprietary Apple fonts or arbitrarily replace project icons with SF Symbols in the web client. Selective translucency may be used on navigation/action chrome, with opaque fallbacks. Product content stays on readable solid surfaces.

Avoid gradients behind every section, floating decorative blobs, repeated rounded cards, large empty marketing banners, oversized icon circles, huge hero typography, three equally prominent CTAs, or rotating carousels. Quality comes from photo size, alignment, restrained hierarchy, exact spacing, and credible details.

Mobile: approximately 16–20px body text where suitable, 44px minimum touch targets, safe-area-aware sticky purchase bar, no horizontal page overflow, native-like sheet dismissal and focus management. Desktop: appropriate readable density and the existing shell width, not a stretched phone. Support keyboard navigation, visible focus, image alt text, 200% zoom, reduced motion, increased contrast and reduced transparency. Avoid hover-only controls. Do not let sticky controls cover content or keyboard fields.

## Listing discovery

Photographic cards with image, short title, price, key equipment fit and factual condition. State shipping cost or included shipping clearly. Keep search/filter state in the URL. Use filters that matter for baseball: handedness, position, size, material and actual use condition. Explain glove handedness clearly to avoid confusing throwing hand with glove hand.

Do not launch a complex recommendation model with no data. Start with user-selected filters, recency, and category relevance; introduce profile-based matching only with explicit scope/consent and no health-data leakage. Preserve search position when returning from a detail page. Show sold/reserved states accurately.

## Product detail specification

Desktop top section: large left gallery and a narrower right purchase summary. Gallery thumbnails are actual accessible buttons; selecting one changes the main image and selected state. Provide full-screen inspection, next/previous and keyboard controls. Main inspection images use contain so wear is not cropped; card covers may crop, with the full image available on detail.

Summary hierarchy:
- Brand/model and concise title.
- Price with visible shipping and fees, or an honest quote-unavailable state.
- A short condition statement and the two or three relevant specifications.
- Server-backed seller verification facts and a link explaining their meaning.
- Dispatch commitment supplied by seller, not a fabricated delivery date.
- One primary purchase action; secondary inquiry and favorite actions.

Below the hero, build a real readable detail section:
1. Condition summary and explicit known defects; put significant defects near the purchase summary too.
2. Vertically stacked original-aspect photos with optional seller-authored captions. These are the same ordered listing assets, not a second mandatory upload set. Do not stitch them into one giant bitmap, stretch them, or hide defect images behind a collapsed marketing section.
3. Seller description in actual text, not text burned into images.
4. Category-specific specifications.
5. Seller profile and completed-order reviews when real data exists.
6. Shipping, returns, protection scope and report/help entry points.

Reserve image dimensions to prevent layout shift. Load the first important photo promptly and lazy-load lower photos. Handle signed URL refresh/expiration and a broken photo without breaking the page. Allow zoom; avoid visual enhancement or generative edits that remove wear or invent product detail.

Mobile: single-column gallery → summary → condition → vertical photos → seller/policy details. Sticky bottom row contains total/price context and purchase, with inquiry less prominent. Desktop purchase summary may be sticky within its column, bounded by content and navigation heights.

## Seller experience

Four short stages with a saved draft and live preview:
1. Photos: multi-select, progressive upload, per-file retry, cover selection and accessible reordering. Suggest category-specific shots (glove palm/back/label/worn area; bat barrel/end cap/grip/markings). Start with 8–12 photos as a proposed limit, validated against storage/performance. Handle HEIC only if the actual pipeline supports it; otherwise explain conversion clearly. Check actual file content and strip location metadata. Preserve evidence of wear.
2. Equipment and condition: category, brand/model, essential fit fields, purchase/use history if known, defects and repair history. '모르겠어요' is a legitimate option. Ask follow-ups only where relevant. Never auto-mark an item as defect-free.
3. Price and fulfillment: fixed price, shipping cost, dispatch commitment, seller net proceeds, private shipping/return details. Suggested prices require genuine comparable completed sales and sample counts; otherwise omit. No fabricated market prices.
4. Preview and publish: show the real buyer-facing result. Resolve verification immediately before publishing if not already done, without discarding the draft. Server-side enforcement is mandatory.

Automatically compose a neutral description from confirmed structured fields, editable by the seller. Do not require sellers to design a long image-based promotional page. If AI assistance is later introduced, make it optional and require explicit seller confirmation of all factual claims.

Autosave must show saved/saving/error states, survive navigation and retry, and keep abandoned uploads private. A local-only preview may use local drafts but must clearly distinguish them from synced drafts. Account data and upload ownership remain isolated. Do not delete objects referenced by an active listing or order evidence when cleaning up drafts.

## Checkout and order lifecycle

Design the complete flow, not only a payment button:
Listing → checkout (address, shipping, exact fees, payment method, required agreements) → provider → authoritative confirmation → order timeline → shipment → receipt check → purchase confirmation → payout.

Provide buyer order history, seller order management, shipment entry/tracking, cancellation/refund initiation, problem reporting, and an operations queue. Keep buyer/seller explanations specific to what happens next. Opening checkout is not proof of payment. Provider return URLs and client messages are untrusted; verify server-side.

Use orthogonal state machines for inventory reservation, order, payment, fulfillment, dispute, refund, and payout. Illustrative happy path: AVAILABLE → RESERVED → PAID → SHIPPED → DELIVERED → CONFIRMED → SETTLED. This is a UX summary, not one overloaded database enum.

Required invariants:
- At most one active allocation and one successful fulfilled sale per single-item listing.
- A short configurable checkout reservation with expiration. Prevent indefinite reservation spam; rate-limit and avoid extending on refresh. Use database constraints/transactions, not disabled buttons alone.
- Verify listing eligibility, seller verification, buyer identity, amount, currency and ownership on every sensitive server operation. No self-purchases.
- Handle successful payment arriving after reservation expiry: reconcile and cancel/refund if inventory can no longer be assigned; do not deliver the item twice.
- Authenticated provider events, idempotent handlers, unique provider/event IDs, out-of-order and duplicated events, durable event records, retries and reconciliation. Use the actual provider's supported event-authentication mechanism rather than inventing a signature convention.
- Do not hold a database transaction open while waiting on network calls. Use durable workflow/outbox records and compensating actions.
- Immutable listing/order snapshot at purchase: price, fees, seller, condition, description and evidence image references. Ordinary edits/deletion must not destroy evidence or invalidate an active order.
- No payout while a dispute, refund, payment ambiguity or seller eligibility hold is active. Provider request acceptance is not settlement success. Separate payout failure and retry states.
- Refunds and chargebacks must be reconciled with inventory and payout. No double refund or double payout. Do not automatically relist a returned item before its condition is confirmed.
- Changing payout accounts requires reauthentication, account checks, notification and risk review/cooldown as applicable.
- Store minimum identity-provider references and status; keep identity documents with the provider where possible. Never store card numbers/security codes. Restrict addresses and payout details to the necessary actors. Redact logs and analytics.

## Protection and operations

Before selecting a provider, verify in writing: support for individual C2C sellers, supported payment methods, actual custody/protection model, marketplace payouts, identification/KYC, refunds/chargebacks, shipping evidence, disputes, payout holds and operational fees. A generic PG widget or payout API alone does not provide all of these. Treat Toss Payments as a candidate, not an already-approved integration. Card, easy-pay and bank-transfer protection may differ; do not promise identical escrow coverage without confirmation.

Define and review: seller type (individual/business), minor participation/guardian requirements, return grounds, undisclosed defects, wrong item, non-delivery, damage, authenticity disputes, shipping/return cost responsibility, inspection window, automatic confirmation, appeal process, evidence retention and customer-service responsibilities. These are policy decisions requiring provider/business/legal review, not developer-invented guarantees. No unconditional 'used goods cannot be returned' rule.

Suggested first release: adult verified sellers, shipped fixed-price physical equipment, no direct handoff protection or authentication guarantee. Expand after pilot evidence. Minors may browse; establish any purchase permissions before launch because youth baseball is relevant.

Operations must be able to view evidence, pause disbursement, process eligible refunds and record reasons with audit history and restricted roles. Include notification deadlines and a documented manual fallback. Shipping scans alone do not prove that the correct item is inside the parcel. Buyer protection must include a path to report mismatched contents. Seller protection needs dispatch evidence and a fair dispute/appeal workflow.

## Phases and acceptance gates

Phase 0: repo audit, current screenshots, confirmed flow/state map, provider capability matrix and policy decision list. Label facts, assumptions and unavailable integrations separately.

Phase 1: implement listing detail, real vertical image section, working thumbnails/fullscreen inspection and photo-first discovery against existing data. Remove unsupported protection promises and stop rounding a 3.5% fee label to 4%. Preserve unavailable payment status until real integration exists. Build seller flow and checkout previews with deterministic local fixtures where persistence is unavailable; label simulations visibly. No production schema changes required for this phase. Show the user a complete realistic worn-glove detail page, not just a design-system gallery.

Phase 2: after authorized additive schema migration, implement private drafts, listing assets/captions/order, seller eligibility and verification adapters, shipping fields and order snapshots. Existing listings are migrated compatibly and cannot silently become verified. Reverify eligibility before making old listings purchasable. Backfill only under an approved plan.

Phase 3: provider sandbox integration, concurrency-safe inventory/order/payment logic, buyer/seller timelines, cancellations, refunds, webhook reconciliation, disputes, holds and payout workflows. Use a separate test database and provider test environment, never fake transactions against shared production.

Phase 4: controlled live pilot only after contracts, policy review, configured production credentials, operational support and explicit launch authorization. Limit volume/value and eligible sellers. Reconcile daily. Roll back by disabling NEW purchases while preserving all in-flight order, refund and payout processing.

Phase 5: improve fit filters, credible recommendations, fulfillment integration and optional high-value inspection only after baseline usage and dispute data justify them.

## Verification and deliverables

- Inspect UI at 390px mobile, 768px tablet, 1440px desktop and 1536×700 short desktop; also test 320px overflow, keyboard, 200% zoom, reduced motion and long Korean copy.
- Cover zero/one/many photos, portrait/landscape photos, severe defect, missing specifications, high/zero price (giveaway is not a paid order), new seller, failed verification, sold/hidden/reserved state, slow/failed upload and expired image links.
- Focus critical automated tests on unauthorized publishing, two concurrent buyers, expired reservations, tampered amounts, duplicate/out-of-order callbacks, timeout after approval, seller deletion during order, disputed payout, duplicate refund, failed payout and privacy boundaries.
- Run relevant lint/type checks and report pre-existing failures separately. Do not claim sandbox or real payment tests succeeded if they did not.
- Measure draft completion, time to publish, detail-to-checkout conversion, payment completion, order cancellation, dispatch compliance, disputes per 100 completed orders, refund resolution and buyer/seller support load. Metrics are hypotheses until measured; do not fabricate improvement percentages.
- Provide screenshots, changed-file list, phase status, tests actually run, provider-dependent limitations and next blocking decisions. Leave a concise HANDOFF.md update when handing off cross-owned files or setup requirements. Never silently overwrite unrelated changes.

Proceed with Phase 0 and Phase 1 first when this brief is submitted for implementation. Deliver a concrete reviewable result before requesting live integration or database approval.
