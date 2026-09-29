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
| `scripts/make-ios-assets.mjs` | 앱 아이콘(1024) · 시작 화면(밝은 판 · 어두운 판)을 지금 로고로 만든다 |

- **앱 표시**: 앱은 브라우저 이름표(User-Agent) 끝에 `BullpenLogApp/1.0` 을 붙인다. 사이트의
  `lib/app-env.ts` 가 이것(과 `window.Capacitor`)을 보고 앱 안인지 가린다 — 구속 측정처럼 앱에서만
  여는 기능이 이것으로 열린다. 표시를 바꾸면 `lib/app-env.ts` 의 `NATIVE_UA_MARK` 도 같이 바꾼다.
- **고유번호** `com.bullpenlog.app` 은 애플(App Store Connect)에 앱을 등록하는 순간 못 바꾼다.
  등록 전이면 `capacitor.config.json` 의 `appId` 와 `ios/App/App.xcodeproj/project.pbxproj` 의
  `PRODUCT_BUNDLE_IDENTIFIER` 두 곳을 같이 바꾼다.
- **화면 위아래 여백**: 사이트는 `viewport-fit=cover` 를 쓰지 않아서, 앱은 상태 표시줄 · 홈 막대만큼
  비켜 그리게 했다(`ios.contentInset: automatic`). 실제 폰에서 위아래가 어색하면 여기부터 본다.
- **세로 고정**: 삼각대에 둔 폰이 구속 측정 중에 돌아가지 않게 했다. 가로가 필요해지면
  `ios/App/App/Info.plist` 의 `UISupportedInterfaceOrientations` 에 더한다.

## 명령

```bash
cd mobile
npm ci              # 처음 한 번 (Capacitor 패키지)
npx cap sync ios    # capacitor.config.json · www 를 바꾼 뒤 — ios 프로젝트에 옮겨 담는다
npm run assets      # 로고를 바꾼 뒤 — 아이콘 · 시작 화면 다시 만들기 (뿌리에서 npm install 을 해 둔 상태로)
```

`ios/App/App/public` · `ios/App/App/capacitor.config.json` 은 `cap sync` 가 만드는 것이라 올리지 않는다
(`ios/.gitignore`). 그래서 굽기 전에는 늘 `npx cap sync ios` 를 먼저 한다.

**윈도우에서는 앱을 구울 수 없다** — 아이폰 앱은 맥의 Xcode 로만 만들어진다. 윈도우에서는 이 폴더를
고치기만 하고, 굽기는 GitHub 의 맥(GitHub Actions)이나 맥북에서 한다.

## GitHub 의 맥에서 굽기 — `.github/workflows/ios.yml`

`mobile/` 을 바꾼 커밋이 main 에 올라오면 저절로 돈다(사이트만 고친 커밋에는 안 돈다). 손으로 돌리려면
GitHub → Actions → **아이폰 앱 굽기** → Run workflow. 공개 저장소라 무료다.

- 지금은 **시험 굽기**만 한다: 서명 없이 아카이브를 만들고, 앱 안에 아이콘 · 설정 · 끊김 화면 ·
  카메라 권한 문구가 들었는지 본다. 폰에 깔 수 있는 앱은 아직 아니다(서명이 없다).
- 결과는 그 실행의 주석(annotation)으로 남는다 — 성공은 '시험 굽기 성공'(이름 · 고유번호 · 최소 iOS ·
  크기), 실패는 '굽기 실패'(오류 줄). 공개 저장소의 주석은 로그인 없이 읽힌다:
  `https://api.github.com/repos/Bullpen-Log/bullpen-log/actions/runs?head_sha=<커밋>` → 실행의 jobs →
  `check_run_url` 뒤에 `/annotations`.
- `ios/App/App.xcodeproj/xcshareddata/xcschemes/App.xcscheme` 는 굽기 설정(스킴)이다. 템플릿에 없어서
  더했다 — 없으면 맥이 새로 받은 프로젝트에서 `-scheme App` 을 못 찾을 수 있다.

## 앞으로 할 일 (2026-09-29 계획)

1. GitHub 의 맥에서 서명 없이 시험 굽기 — 만들어지기만 하는지 본다(무료, 위의 굽기).
2. 애플 개발자 가입(김민, 연 99달러) → 앱 등록 · API 열쇠를 GitHub 비밀 금고(Secrets)에 → TestFlight 로 올리기.
3. 두 사람(김민 · 금윤호)을 TestFlight 내부 테스터로 넣어 설치. TestFlight 빌드는 90일마다 새로 올린다.
4. 구속 측정용 빠른 카메라(초당 240장 · 초점 · 셔터)를 앱 쪽 코드로 붙인다. 값은 사이트가 보내게 만들어
   값 조정은 사이트만 고쳐서 하게 한다. 이 코드를 처음 만들 때는 맥북에 폰을 연결해 시험한다.
