# OPS-CLAUDE-INPUT01 — Shared desktop input/send diagnosis

Human requested 2026-11-17 in GPT Sub3. Owner GPT Sub3 `01a1e508-0870-70d3-b755-165b8ae04ea1`. This is operational diagnosis, not product/dependency/permission change authorization.

## Confirmed observations

- Exact existing Sub3 local954f session received EX-REF04 revision1 as message5. Claude main.log confirms LocalSessions.sendMessage at15:36:51 KST, length1863, then workflow start15:39:09. No duplicate implementation message is needed.
- Earlier supported `typeText` returned success, immediate AX readback still showed EMPTY input and screenshot unchanged. User later saw the full exact text and clicked Send. Therefore unchanged immediate AX/screenshot is NOT proof that input failed. Do not paste the same message repeatedly on that assumption.
- Coordinate clicks/Raise repeatedly fail `Computer Use server error -10005: noWindowsAvailable`; AX element clicks may return unchanged state. System Settings selection also failed noWindowsAvailable/timeoutReached. This locates the immediate failure in automation window targeting/observation, not proof of a Claude network/auth/subscription failure.
- Input and keyboard event execution can succeed while readback remains stale. A diagnostic `pressKey(Escape)` at15:42:52 interrupted Sub3: Claude log LocalSessions.interrupt and healthy cycle/hadFirstResponse=true. This was GPT Sub3 diagnostic error; preserve work, resume SAME order once, no duplicate dispatch. Never test Escape on running Claude agents.
- CUA runtime reset only (js_reset; no app/process restart) did not restore window recognition. Claude and ChatGPT processes remain running. No app restart, permission reset, credential read/write or installation was done.

## Scope of cause and uncertainty

Confirmed failure chain: text/keyboard channel may execute -> window target/click fails or observation lags -> sender cannot safely verify intended draft/submit/receipt. Different sessions share the same app window, so simultaneous input/navigation is an additional proven collision risk. Serialization does not by itself cure noWindows errors.

Underlying OS accessibility/window-cache/capture-service bug is NOT conclusively isolated. Native computer-use service logs show TCC access requests result1 without timeout, and invalid capture-frame status, but this does not establish every effective permission or a precise implementation bug. Claude a11y support disabled nativeAPIs/webContents entries are observations, not proven causation. Do not claim missing permission or toggle permissions from these logs alone.

Versions observed: Claude5.11492.5; ChatGPT desktop26.1103.60933 build25894. Diagnostic log scans output only timestamps, event names and error patterns; no raw prompts, cookies, credentials or full logs saved here.

## Safe operational handling

1. Cooperatively reserve `.coordination/claude-ui-control`; all senders verify actual target URL and current draft, not just title. Preserve active work and other sessions.
2. Treat written draft / sent message / actual response / delivery as distinct facts. If readback is inconsistent, do not blindly retype or send on a possibly different session.
3. Do not use Escape as harmless diagnosis: it interrupts active Claude. Avoid Return until the exact intended draft/target is verified; keyboard delivery can succeed even when click/readback fails.
4. No supported direct Claude-to-GPT or local-Claude messaging API has been verified; do not invent one or use private app state/endpoints. Existing work orders/outboxes remain durable handoff.
5. Full app/helper restart or OS permission intervention has not been performed because other sessions are running. Any recovery that interrupts their work needs coordination first.

## Recovery status

Sub3 initial EX-REF04 dispatch actually received. Its unintended diagnostic interruption needs SAME-batch resume. At15:44 KST GPT01 owns desktop input for its authorized separate task; GPT Sub3 requested a safe handoff and will reserve only after release. EX-REF04 implementation acceptance and central import remain incomplete.

## Recovery and coordination update

- Human confirmed sending SAME EX-REF04 resume instruction after the diagnostic interruption. Actual subsequent source delivery/receipt still needs verification; no duplicate send by GPT.
- Current intake-r05-release source base changed by overlapping GPT05 work. FPS owner committed ONLY four intake files as a664d0c181f7e0eabaa2a48308560f81a3e6e6f5, preserved untracked review-evidence, and stopped all builds/servers/tests there. It will move to a separate FPS checkout. Do not restore59c444cf or remove FPS files. Evidence author must re-read current ref/status, keep unrelated files untouched and record real baseline.
- Pre-delivery evidence url.ts98 CONTROL regex contains literal U+2028/U+2029; FPS owner's build reported TS1128/TS1161. Fix belongs to SAME Claude Sub3 approved implementation/self-check phase; not GPT post-delivery reorder or FPS correction.
- Cooperative shared desktop input is released. Underlying native window/capture/AX consistency bug remains unresolved; no reliable automatic transport workaround has been demonstrated. No active Claude restart or permission toggles were performed.

## Independent overall replication

After human foreground and exclusive reservation, overall observed AX tree targeting c668; named Sub2 options click produced no menu and AX switched to954f, while simultaneous screenshot still showed c668. Coordinate fallback returned noWindowsAvailable. No text/Enter/Escape was sent by overall. This independently confirms target/readback inconsistency and rules out foreground alone as a demonstrated remedy. A working automatic-send workaround has NOT been established.
