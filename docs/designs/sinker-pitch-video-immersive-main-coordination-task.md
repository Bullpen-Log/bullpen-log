# Claude main comparison handoff instruction

Continue the currently authorized SS01–SS07 remediation. Do not abandon or interrupt it for the new immersive presentation work.

The user has authorized EXISTING Claude sub1 (Opus5.5 HIGH) to implement IM01–IM12 as complementary work. Both sessions use `/Users/yuno/Developer/bullpen-log`.

Read `docs/designs/sinker-pitch-video-immersive-coordination.md` and obey its ownership protocol. MAIN owns all existing comparison source, route, regression files, ledger and HANDOFF until the explicit handoff. Sub1 owns only new `native/src/compare/immersive/` files, its separate new test and its own status document before that point. Do not edit sub1's independent files. Do not duplicate IM implementation in MAIN.

Once SS corrections/checks are done and you will stop editing released source files, write `docs/designs/sinker-pitch-video-single-screen-main-ready.md` with:

- task ID `sinker-immersive-2026-11-03-im01-im12`;
- status `ready-for-sub1-integration`;
- current HEAD, completed/remaining SS items and actual test results;
- public API notes for fit, toolbar, note/draft and playback changes;
- exact released files/scope and explicit statement that MAIN will stop editing them after handoff.

Do not publish ready while still editing or waiting on an unresolved correction. This is a file-ownership handoff, not a permission to overwrite newer code. After releasing, let sub1 connect its modules to the actual updated source and rerun SS and IM checks. MAIN should not continue making competing source changes after publication.

Preserve all current constraints: no simulator/Metro, DB writes, fake data, secret/.env access, new dependencies, commit/push/OTA/deployment. Report in Korean and distinguish mock tests from physical-device verification.
