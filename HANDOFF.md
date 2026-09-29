# 받은 뒤 할 일 — 서로에게 남기는 말

두 사람 다 Claude 로 작업한다. 이 파일은 `CLAUDE.md` 가 불러오므로, 이 저장소에서
Claude 로 작업을 시작하면 저절로 읽힌다. 규칙은 `AGENTS.md` 6번.

- **Claude 에게**: `git config user.name` 으로 지금 누가 작업하는지 본다(`Kim Min` =
  김민, `금윤호` = 금윤호). 그 사람 앞으로 온 말이 아래에 있으면, 다른 일을 하기 전에
  사용자에게 먼저 알린다. 명령 실행 같은 할 일은 사용자 허락을 받고 한다.
- 처리한 말은 이 파일에서 지우고 커밋한다. 지난 말은 git 이력에 남는다.
- 공개 저장소다. 비밀번호·키·`.env` 값은 절대 적지 않는다.

---

## 금윤호에게 — 2026-09-29 · 김민(Claude) — 아이폰 앱 껍데기(`mobile/`)

받은 뒤 할 일 없음(뿌리의 패키지 · DB 그대로). 사용자가 불펜로그를 아이폰 앱으로 만들기로 했다 — 구속 측정에
폰의 빠른 촬영(초당 120~240장)을 쓰려고. 새 폴더 `mobile/` 에 Capacitor 껍데기를 만들었다(설명 `mobile/README.md`).

- 앱은 사이트(`/today`)를 그대로 연다 — 사이트를 고치면 앱에도 바로 반영된다.
- 앱은 User-Agent 끝에 `BullpenLogApp/1.0` 을 붙인다. 네 `lib/app-env.ts` 가 이것으로 앱을 가리니 그대로 쓰면 된다.
- 새 GitHub Actions `.github/workflows/ios.yml`('아이폰 앱 굽기'): `mobile/` 을 바꾼 커밋이 main 에 올라오면
  GitHub 의 맥이 앱을 서명 없이 시험 굽기한다. 사이트만 고친 커밋에는 안 돈다(Vercel 배포와도 상관없다).
- 계획: GitHub 의 맥에서 굽기 → TestFlight 로 두 사람 폰에. 애플 개발자 계정은 김민 명의(결제 끝, 승인 대기),
  너는 App Store Connect 팀원(개발자) · TestFlight 테스터로 초대된다 — **초대 메일이 오면 수락해 줘.**
- 애플 열쇠 넷(`ASC_KEY_ID` · `ASC_ISSUER_ID` · `ASC_KEY_P8` · `APPLE_TEAM_ID`)이 GitHub Secrets 에 들어가면, 그 뒤로
  `mobile/` 을 바꾼 커밋을 올릴 때마다 TestFlight 에 새 빌드가 올라간다(두 사람 폰에 업데이트 알림). 순서는 `mobile/APPLE-SETUP.md`.
- 구속 측정의 네이티브 카메라(240fps · 초점 · 셔터)는 나중 단계다. 초당 장수 · 초점 · 셔터 값을 사이트가 보내게 만들어
  값 조정은 사이트만 고쳐서 하자는 안이다. 누가 무엇을 맡을지는 사용자끼리 정한다.
