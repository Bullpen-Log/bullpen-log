# 불펜로그 아이폰 앱 껍데기 (Capacitor)

아이폰에 까는 **Bullpen Log** 앱이다. 앱 안에서 사이트(`https://bullpen-log.vercel.app/today`)를
그대로 연다. 그래서 **기능 · 화면 · 문구를 고치면 지금처럼 사이트만 올리면(push) 앱에도 바로
반영된다.** 이 폴더를 다시 구워야 하는 것은 폰 기계를 직접 쓰는 부분(카메라 등) · 아이콘 · 이름 ·
권한을 바꿀 때뿐이다.

이 폴더는 사이트와 따로다 — 패키지(`package.json`)도 따로라 뿌리의 `npm install` · Vercel 배포와
상관없다.

## 어떻게 돌아가나

| 파일 | 하는 일 |
|---|---|
| `capacitor.config.json` | 앱 이름 · 고유번호(`com.bullpenlog.app`), 여는 주소, 앱 표시(`BullpenLogApp/1.0`) |
| `www/offline.html` | 인터넷이 끊겨 사이트를 못 불러올 때 보이는 화면(연결되면 저절로 다시 연다) |
| `www/index.html` | 자리표. 앱은 이 파일을 열지 않는다(Capacitor 가 요구해서 둔다) |
| `ios/` | Xcode 프로젝트. `Info.plist` 에 카메라 · 마이크 · 사진 권한 문구, 세로 고정, 아이폰 전용 |
| `ios/App/App/MainViewController.swift` | 앱의 첫 화면 — 사이트를 여는 Capacitor 화면 위에 시작 연출 판을 얹는다(`SceneDelegate.swift` 가 쓴다) |
| `scripts/make-ios-assets.mjs` | 앱 아이콘(1024) · 시작 화면(한가운데 큰 B, 밝은 판) · 시작 연출의 글자 그림(ULLPEN LOG)을 지금 로고로 만든다 |

- **앱 표시**: 앱은 브라우저 이름표(User-Agent) 끝에 `BullpenLogApp/1.0` 을 붙인다. 사이트의
  `lib/app-env.ts` 가 이것(과 `window.Capacitor`)을 보고 앱 안인지 가린다 — 구속 측정처럼 앱에서만
  여는 기능이 이것으로 열린다. 표시를 바꾸면 `lib/app-env.ts` 의 `NATIVE_UA_MARK` 도 같이 바꾼다.
- **여는 주소는 `server.url` 에 경로까지 적는다**(`https://bullpen-log.vercel.app/today`). `server.appStartPath`
  는 쓰지 않는다 — Capacitor 는 그 경로를 폰 안의 파일(`public/today`)로도 찾아보고, 없으면 켜자마자
  `exit(1)` 로 앱을 스스로 끈다(충돌 기록도 안 남는다). 2026-09-29 첫 TestFlight 빌드가 이것으로 켜지지 않았다.
  주소에 경로가 붙으면 Capacitor 가 같은 사이트의 다른 경로를 '바깥 주소'로 보고 사파리로 여니,
  `server.allowNavigation` 에 사이트 호스트를 넣어 앱 안에서 열리게 한다.
- **고유번호** `com.bullpenlog.app` 은 애플(App Store Connect)에 앱을 등록하는 순간 못 바꾼다.
  등록 전이면 `capacitor.config.json` 의 `appId` 와 `ios/App/App.xcodeproj/project.pbxproj` 의
  `PRODUCT_BUNDLE_IDENTIFIER` 두 곳을 같이 바꾼다.
- **화면 끝까지 그린다**(`ios.contentInset: never`, 2026-09-30). 예전(`automatic`)에는 시계 · 홈 막대
  자리를 비워 두어 스크롤하면 그 틈으로 내용이 지나가 위아래 막대만 떠 보였다. 이제 사이트가 그 자리를
  스스로 채운다 — 뿌리 레이아웃의 `viewportFit: 'cover'` 로 `env(safe-area-inset-*)` 가 살아나고,
  앱 틀(`components/app-shell.tsx`)이 시계 쪽을 막대 색으로 채우고 하단 탭을 홈 막대까지 늘린다.
  위아래 막대가 없는 화면(로그인 · 약관 · 오류)은 `app/globals.css` '아이폰 앱 안'이 여백을 더한다.
- **앱 안에서만 도는 것**은 `lib/native-app.ts`(뿌리 레이아웃의 첫 스크립트)가 켠다 — `<html data-app="native">`
  표시, 상태바 글자색을 앱 테마에 맞추기(`SystemBars`, Capacitor 안에 있음), 첫 화면이 그려지면 시작 연출 판에
  알리기(`window.webkit.messageHandlers.bullpenIntro`). 사이트는 Capacitor 패키지 없이 `window.Capacitor.nativePromise` 로 부른다.
- **시작 화면 · 시작 연출**(2026-09-30, 사용자: "넷플릭스 N 처럼, 통통 튀지 않게"): 아이콘을 누르면 아이폰이 앱 코드가
  돌기 전에 시작 화면(`LaunchScreen` — 한가운데 큰 B 그림 한 장, 애플 규칙이라 움직일 수 없다)을 띄운다. 앱이 켜지는
  첫 장면에 `MainViewController.swift` 의 연출 판이 똑같은 B 를 그려 이어 받고, 곧바로 B 가 부드럽게 작아지며 이름의
  첫 글자 자리로 가고 'ULLPEN LOG' 가 왼쪽부터 펼쳐진다(큰 B 0.4초 뒤 움직이기 시작, 약 2.5초). 그동안 사이트는 판 뒤에서 불러오고, 사이트가 첫 화면을
  다 그렸다고 알리면(인터넷이 끊겨 `offline.html` 이 떠도 알린다) 판이 옅어지며 걷힌다. 알림이 끝내 안 오면 10초에 걷힌다.
  움직임 줄이기를 켠 폰은 움직이지 않고 걷히기만 한다. 로딩 그림 부품(`@capacitor/splash-screen`)은 이것으로 바꾸며 뺐다.
  판은 밝은 판 하나다 — 앱 테마가 폰의 다크 모드와 따로 라이트로 시작해서, 폰 설정을 따르면 어두운 로딩 → 밝은 첫 화면으로
  번쩍였다. 시작 화면 그림의 B 크기(2732px 중 437px)와 글자 그림의 둘레(`WORD_PAD`)는 `make-ios-assets.mjs` 와
  `MainViewController.swift` 두 곳이 같아야 넘어가는 순간이 안 보인다.
- **진동**(`@capacitor/haptics`, 2026-09-30): 아이폰은 웹(사파리)에서 진동을 쓸 수 없고, 무음 모드면 끝 소리도 안 난다.
  그래서 암케어 버티기 · 쉬기 끝과 체크를 앱의 진동으로 알린다 — 사이트의 `lib/haptics.ts` 가 `window.Capacitor.nativePromise`
  로 부르고, 진동이 든 앱을 아직 안 깔았으면 웹과 같다(아무 일 없음).
- **세로 고정**: 삼각대에 둔 폰이 구속 측정 중에 돌아가지 않게 했다. 가로가 필요해지면
  `ios/App/App/Info.plist` 의 `UISupportedInterfaceOrientations` 에 더한다.

## 명령

```bash
cd mobile
npm ci              # 처음 한 번 (Capacitor 패키지)
npx cap sync ios    # capacitor.config.json · www 를 바꾼 뒤 — ios 프로젝트에 옮겨 담는다
npm run assets      # 로고를 바꾼 뒤 — 아이콘 · 시작 화면 · 연출 글자 다시 만들기 (뿌리에서 npm install, 크롬 · 인터넷 필요)
```

`ios/App/App/public` · `ios/App/App/capacitor.config.json` 은 `cap sync` 가 만드는 것이라 올리지 않는다
(`ios/.gitignore`). 그래서 굽기 전에는 늘 `npx cap sync ios` 를 먼저 한다.

**윈도우에서는 앱을 구울 수 없다** — 아이폰 앱은 맥의 Xcode 로만 만들어진다. 윈도우에서는 이 폴더를
고치기만 하고, 굽기는 GitHub 의 맥(GitHub Actions)이나 맥북에서 한다.

## GitHub 의 맥에서 굽기 — `.github/workflows/ios.yml`

`mobile/` 을 바꾼 커밋이 main 에 올라오면 저절로 돈다(사이트만 고친 커밋에는 안 돈다). 손으로 돌리려면
GitHub → Actions → **아이폰 앱 굽기** → Run workflow. 공개 저장소라 무료다.

- 서명 없이 아카이브를 만들고, 앱 안에 아이콘 · 설정 · 끊김 화면 · 카메라 권한 문구가 들었는지 본다.
- **애플 열쇠 넷이 GitHub Secrets 에 있으면** 이어서 배포 도장(클라우드 서명)을 찍어 TestFlight 에 올린다.
  없으면 굽기만 하고 끝낸다. 열쇠를 만들고 넣는 순서는 **[APPLE-SETUP.md](APPLE-SETUP.md)**.
- 빌드 번호는 굽는 시각(UTC)이다 — `20260930.123045`. 올릴 때마다 커져야 애플이 받는다.
- 서명은 굽는 단계가 아니라 내보내는 단계에서만 한다. 굽는 단계에서 자동 서명을 하면 새 맥마다
  개발 인증서가 새로 생겨 애플 한도(3개)에 막힌다 — 자세한 까닭은 워크플로 파일 머리말.
- 결과는 그 실행의 주석(annotation)으로 남는다 — 성공은 '굽기 성공'(이름 · 버전 · 고유번호 · 최소 iOS ·
  크기)과 'TestFlight 올리기 성공', 실패는 '실패'(오류 줄) 또는 열쇠 문제를 짚는 말. 공개 저장소의 주석은 로그인 없이 읽힌다:
  `https://api.github.com/repos/Bullpen-Log/bullpen-log/actions/runs?head_sha=<커밋>` → 실행의 jobs →
  `check_run_url` 뒤에 `/annotations`.
- `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` 는 굽기 설정(스킴)이다. 템플릿에 없어서
  더했다 — 없으면 맥이 새로 받은 프로젝트에서 `-scheme App` 을 못 찾을 수 있다.

## 앞으로 할 일 (2026-09-29 계획)

1. ~~GitHub 의 맥에서 서명 없이 시험 굽기~~ — 끝(2026-09-29, 1.3MB · 약 1분).
2. ~~애플 개발자 가입(김민, 연 99달러)~~ — 끝(2026-09-29 승인). [APPLE-SETUP.md](APPLE-SETUP.md) 1~5번(App ID
   `com.bullpenlog.app` 등록 · App Store Connect 에 앱 만들기 · 관리자 API 열쇠 · GitHub Secrets 넷)도 끝 —
   이 줄을 고친 커밋이 첫 TestFlight 올리기를 시작한다(`mobile/` 이 바뀐 커밋이라 워크플로가 저절로 돈다).
3. 두 사람(김민 · 금윤호)을 TestFlight 내부 테스터로 넣어 설치. TestFlight 빌드는 90일마다 새로 올린다.
4. 구속 측정용 빠른 카메라(초당 240장 · 초점 · 셔터)를 앱 쪽 코드로 붙인다. 값은 사이트가 보내게 만들어
   값 조정은 사이트만 고쳐서 하게 한다. 이 코드를 처음 만들 때는 맥북에 폰을 연결해 시험한다.
