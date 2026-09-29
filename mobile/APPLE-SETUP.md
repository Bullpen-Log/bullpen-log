# 애플 쪽 설정 — 처음 한 번 (C-6 · C-7 · C-8)

애플 개발자 계정(김민 명의, 개인)이 승인된 뒤 **한 번만** 한다. 약 30분.
끝나면 GitHub 의 맥(`.github/workflows/ios.yml`)이 앱에 배포 도장을 찍어 TestFlight 에 올리고,
두 사람(김민 · 금윤호)이 아이폰의 TestFlight 앱으로 받는다.

- 미리 준비: **금윤호의 애플 ID 이메일**.
- 애플 화면은 한국어로 나온다. 괄호 안은 영어 화면의 이름이다.
- 화면 위에 **약관 · 계약 동의** 알림이 떠 있으면 먼저 동의한다 — 남아 있으면 올리기가 막힌다.

## 1. 팀 ID 적어 두기

[developer.apple.com/account](https://developer.apple.com/account) → **멤버십 세부 사항(Membership details)** →
**팀 ID(Team ID)**. 영문 대문자 · 숫자 10자다(예: `A1B2C3D4E5`).

## 2. 앱 고유번호 등록 (App ID)

developer.apple.com/account → **인증서, 식별자 및 프로파일(Certificates, Identifiers & Profiles)** →
**식별자(Identifiers)** → **＋**

1. **App IDs** → 계속 → **앱(App)** → 계속
2. 설명(Description): `Bullpen Log`
3. 번들 ID(Bundle ID): **명시적(Explicit)** → `com.bullpenlog.app`
4. 기능(Capabilities)은 아무것도 켜지 않는다 → 계속 → **등록(Register)**

## 3. App Store Connect 에 앱 만들기

[appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **앱(Apps)** → **＋** → **신규 앱(New App)**

| 칸 | 넣을 값 |
|---|---|
| 플랫폼 | iOS |
| 이름 | `Bullpen Log` — 이미 쓰는 이름이라고 나오면 `Bullpen Log 불펜로그` 처럼 조금 바꾼다(홈 화면 이름과는 따로다) |
| 기본 언어 | 한국어 |
| 번들 ID | `com.bullpenlog.app` (2번에서 등록한 것) |
| SKU | `bullpenlog-ios` (남에게 안 보이는 관리 번호) |
| 사용자 액세스 | 전체 액세스 |

## 4. 비밀 열쇠(API 키) 만들기

App Store Connect → **사용자 및 액세스(Users and Access)** → **통합(Integrations)** → **App Store Connect API**

1. 처음이면 **액세스 요청(Request Access)** → 동의
2. **팀 키(Team Keys)** → **API 키 생성(Generate API Key)** 또는 ＋
   - 이름: `GitHub Actions`
   - 액세스: **관리자(Admin)** ← 꼭 관리자. 아니면 배포 도장(클라우드 서명)을 못 찍는다
3. 적어 둘 것 두 가지
   - **키 ID(Key ID)**: 표의 그 줄. 영문 대문자 · 숫자 10자
   - **발급자 ID(Issuer ID)**: 표 위. `57246542-96fe-1a63-e053-0824d011072a` 같은 모양
4. **API 키 다운로드(Download)** → `AuthKey_<키 ID>.p8` 파일
   - **딱 한 번만 받을 수 있다.** 잃어버리면 그 키를 지우고(취소) 새로 만든다.
   - 저장소 폴더 밖에 둔다. 채팅 · 메일 · 깃에 올리지 않는다(공개 저장소다).

## 5. GitHub 비밀 금고(Secrets)에 넣기

[github.com/Bullpen-Log/bullpen-log](https://github.com/Bullpen-Log/bullpen-log) → **Settings** →
**Secrets and variables** → **Actions** → **New repository secret** — 네 개를 하나씩:

| Name (그대로) | Secret (값) |
|---|---|
| `ASC_KEY_ID` | 4번의 키 ID |
| `ASC_ISSUER_ID` | 4번의 발급자 ID |
| `ASC_KEY_P8` | `.p8` 파일을 **메모장으로 열어 전부 복사** — `-----BEGIN PRIVATE KEY-----` 부터 `-----END PRIVATE KEY-----` 까지 |
| `APPLE_TEAM_ID` | 1번의 팀 ID |

- 한 번 넣은 값은 다시 볼 수 없다(바꾸기만 된다). 틀렸으면 **Update** 로 다시 넣는다.
- Settings 가 안 보이면 저장소 관리자 권한이 없는 것이다 — 조직(Bullpen-Log) 주인이 넣는다.

## 6. 금윤호 초대

App Store Connect → **사용자 및 액세스** → **사용자(People)** → **＋**

- 이름 · 성 · 이메일(금윤호의 애플 ID) → 역할(Roles): **개발자(Developer)** → 앱: Bullpen Log(또는 모든 앱) → 초대
- 금윤호가 메일의 초대를 **수락**한다. 개인 계정은 이렇게 최대 50명까지 부를 수 있다.

## 7. 첫 번째로 올리기 (C-7)

GitHub → **Actions** → 왼쪽 **아이폰 앱 굽기** → 오른쪽 **Run workflow** → (main) **Run workflow**.
3~5분이면 끝난다. 초록 ✓ 면 올라간 것이다 — 애플이 처리하는 데 5~30분 더 걸린다.
실패하면 그 실행을 눌러 **Annotations** 에 이유가 나온다(아래 '막히면').

`mobile/` 을 바꾼 커밋이 main 에 올라와도 저절로 돈다.

## 8. TestFlight 에 사람 넣기 (C-8, 첫 빌드가 처리된 뒤)

App Store Connect → 앱 → **Bullpen Log** → **TestFlight** → 왼쪽 **내부 테스팅(Internal Testing)** 옆 **＋**

1. 그룹 이름: `우리 팀` · **자동 배포(Enable automatic distribution)** 켜기 — 새 빌드가 저절로 간다
2. **테스터(Testers)** ＋ → 김민 · 금윤호 체크 → 추가

두 사람의 아이폰:

1. App Store 에서 **TestFlight** 앱(애플, 무료) 설치
2. 초대 메일의 **View in TestFlight(TestFlight에서 보기)** → **설치**
3. 다음부터는 새 빌드가 올라오면 TestFlight 가 알려 준다 → **업데이트**

## 막히면 — Annotations 에 나오는 말

| 나오는 말 | 뜻 · 고치는 법 |
|---|---|
| `TestFlight 건너뜀` | 5번의 비밀 넷이 아직 없다 |
| `애플 열쇠가 빠졌다` / `… 모양이 틀렸다` / `ASC_KEY_P8 내용이 틀렸다` | 5번에서 빠졌거나 잘못 붙여 넣은 칸을 Update 로 다시 넣는다 |
| `Cloud signing permission error` | 4번 키의 액세스가 관리자가 아니다 → 관리자 키를 새로 만들어 `ASC_KEY_ID` · `ASC_KEY_P8` 를 바꾼다 |
| `No suitable application records` | 3번이 안 됐거나 번들 ID 가 `com.bullpenlog.app` 이 아니다 |
| `agreement` · `PLA` · `계약` | developer.apple.com/account 와 App Store Connect 의 약관 알림에 동의한다 |
| `bundle version must be higher` | 빌드 번호가 겹쳤다 — Run workflow 를 한 번 더 누른다 |

- **TestFlight 빌드는 90일이면 만료된다.** 그 전에 7번(Run workflow)으로 새로 올린다.
- **개발자 회비(1년)를 갱신하지 않으면** TestFlight 를 못 쓴다. 사이트(홈 화면에 추가)는 그대로 쓸 수 있다.
