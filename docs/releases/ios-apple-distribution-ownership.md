# 싱커·덕아웃 iOS 배포 팀 전환 안내

2026-11-16 결정. 앞으로 두 앱의 iOS 배포 주체는 **금윤호가 Account Holder인 Apple Developer 팀**이다. 김민은 자기 Apple Account로 초대받아 협업한다. 이번 인계의 첫 작업은 금윤호의 가입 형태 선택과 김민의 기존 앱 조사다. 실제 계정 상태와 이전 여부는 앱별로 확인한다.

## 1. 금윤호가 먼저 할 일

1. 기존 Apple Account로 개발자 계정에 로그인해 본인 법적 이름, 이중 인증, 신뢰하는 전화번호와 기기를 확인한다. 이미 유료 멤버십이 있으면 Membership details에서 선택한 팀, 가입 형태, Account Holder, 만료일을 확인한다. 다른 팀 초대 이력이 있어도 같은 Apple Account로 여러 팀을 쓸 수 있다. [개발자 계정 안내](https://developer.apple.com/help/account/basics/about-your-developer-account/)
2. 본인 명의 또는 한국의 개인사업자 형태로 시작한다면 **Individual**을 선택한다. 스토어 판매자란에 금윤호의 법적 개인 이름이 표시된다. 앱 이름 ‘싱커’·‘덕아웃’과 판매자란은 별개다. 회사 법인명을 판매자로 표시하려면 Apple과 계약할 수 있는 법인을 준비해 **Organization**으로 가입한다. 대표 권한, 법인명, D‑U‑N‑S 번호, 회사 도메인 이메일과 운영 중인 공식 사이트를 확인한다. 상호만 등록한 개인사업자는 개인 가입 기준을 적용한다. [Apple 가입 안내](https://developer.apple.com/programs/enroll/)
3. Apple Developer Program의 Enroll에서 정보를 제출하고 본인 또는 법인 확인, 계약, 연회비 결제를 마친다. 금액은 가입 화면의 현지 통화를 확인한다. 활성화 후 Membership details에 금윤호가 Account Holder로 나오고 App Store Connect에서 올바른 팀을 선택할 수 있는지 확인한다. 이미 해당 유료 팀의 보유자라면 여기서 이어간다. [가입 절차](https://developer.apple.com/programs/enroll/)
4. 개인 가입 후 법인화한다면 창업자·공동창업자인 금윤호가 Apple에 **개인 멤버십의 조직 전환**을 신청한다. 법인의 D‑U‑N‑S 번호와 Apple이 요구하는 증빙을 준비한다. 승인 뒤 판매자명과 팀 권한을 재확인한다. 개인 계정의 표시 이름만 바꾸는 것으로 스토어 판매자명은 바뀌지 않는다. 다른 팀이 가진 앱은 별도로 아래 3절을 따른다. [멤버십 전환](https://developer.apple.com/help/account/membership/updating-your-account-information/)

## 2. 김민 초대

금윤호가 App Store Connect → Users and Access → People → ＋에서 김민의 이름과 본인이 확인한 이메일을 입력한다. 개발·빌드 전달·내부 테스트가 업무라면 **Developer**로 시작한다. 버전 제출과 스토어 운영까지 맡기면 해당 앱의 **App Manager**를 검토한다. 가능한 경우 싱커·덕아웃 두 앱만 선택하고, 이전 전 목록에 없는 앱은 이전 완료 후 접근을 추가한다. 김민은 이메일 초대를 자기 Apple Account로 수락한 뒤 팀을 전환하고 Apps와 TestFlight를 확인한다. 초대가 만료되면 다시 보낸다. [사용자 추가](https://developer.apple.com/help/app-store-connect/manage-your-team/add-and-edit-users/) · [역할별 권한](https://developer.apple.com/help/app-store-connect/reference/account-management/role-permissions/)

**개인 가입**에서는 초대자가 App Store Connect의 허용된 작업을 할 수 있지만 개발자 멤버십의 Certificates, Identifiers & Profiles에는 접근할 수 없다. 서명 리소스와 계약·갱신은 금윤호가 관리한다. **조직 가입**에서는 서명 업무를 실제 맡길 때 역할과 추가 권한을 검토한다. 인증서·식별자 권한을 부여하면 앱 단위 접근 제한에도 영향이 있다. 김민의 사람 계정 권한과 배포 자동화용 팀 API 키 권한은 따로 관리한다. [팀 종류별 차이](https://developer.apple.com/help/app-store-connect/manage-your-team/overview-of-accounts-and-roles/) · [추가 권한의 범위](https://developer.apple.com/help/app-store-connect/manage-your-team/add-and-edit-users/)

## 3. 두 앱의 경로를 각각 결정하기

현재 팀의 Apps → 해당 앱 → App Information, 버전 이력, TestFlight를 확인한다. **스토어 숫자 Apple ID**, **번들 ID**, **멤버십 Team ID**, **App ID prefix**를 구분해 대조한다. 공개 페이지가 검색되지 않아도 과거 다른 국가에 출시했거나 판매를 중단했을 수 있다. 조회 권한이 없다면 현재 Account Holder에게 확인한다.

| 확인 결과 | 금윤호·김민의 다음 행동 |
|---|---|
| 이미 금윤호 팀 소유 | 기존 앱 레코드와 번들 ID를 유지한다. 김민 초대와 서명·배포 검증으로 넘어간다. |
| 다른 팀 소유, App Store 정식 출시 이력 있음 | 기존 레코드의 Transfer App 자격을 확인한다. 자격이 맞으면 기존 설치자의 업데이트 경로와 평점·리뷰 및 번들 ID를 보존하는 공식 이전을 선택한다. |
| 다른 팀 소유, TestFlight만 사용 | 일반 앱 이전에는 정식 출시 이력이 최소 한 버전 필요하다. 기존 번들 ID·설치 연속성이 중요하면 현재 보유자와 Apple Developer Support에 가능한 절차를 확인한다. 기존 팀 명의 첫 출시 후 이전하는 선택은 이번 소유 정책과 충돌하므로 금윤호가 별도로 결정해야 한다. 새 베타로 시작하기로 결정하면 금윤호 팀에 사용 가능한 새 번들 ID와 새 앱 레코드를 만들고 테스터를 재초대한다. 기존 설치를 자동 업데이트할 수 없으며 기기 전용 영상·초안의 백업과 복원 가능 여부를 먼저 확인한다. |
| 레코드만 있고 업로드한 빌드가 없음 | 이전 요건과 식별자 예약 상태를 따로 확인한다. 양쪽 계정에서 같은 ID를 쓸 수 있다고 가정하지 말고 기존 ID가 꼭 필요하면 Apple에 문의한다. |
| 레코드가 없음 | 금윤호 팀의 Certificates, Identifiers & Profiles에서 사용 가능한 explicit App ID를 등록한다. Apps → ＋ → New App에서 iOS, 이름, 기본 언어, 동일 번들 ID, 고유 SKU를 선택하고 생성된 숫자 Apple ID를 기록한다. 기록된 앱이 안 보이면 먼저 팀 선택과 권한을 재확인한다. |

기존 빌드가 올라간 앱의 번들 ID는 변경할 수 없고 해당 explicit App ID는 삭제할 수 없다. 레코드 삭제를 ID 확보 절차로 사용하지 않는다. [이전 조건](https://developer.apple.com/help/app-store-connect/transfer-an-app/app-transfer-criteria/) · [기존 설치자·리뷰 처리](https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer/) · [App ID 삭제 제한](https://developer.apple.com/help/account/identifiers/delete-an-app-id/) · [새 앱 등록](https://developer.apple.com/help/app-store-connect/create-an-app-record/add-a-new-app/)

### 공식 이전을 선택한 앱

1. 양 팀이 계약·멤버십 상태와 심사 중 버전·예약 주문·인앱 결제 등 Apple 자격표를 점검한다. 기존 보유자가 메타데이터와 테스터 운영 정보를 안전하게 보관한다. 이전 일정 합의 후 Apple 지침에 따라 베타 빌드·테스터와 언어별 Test Information을 정리한다. [이전 조건](https://developer.apple.com/help/app-store-connect/transfer-an-app/app-transfer-criteria/) · [기능별 이전 준비](https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer/)
2. 기존 팀 **Account Holder**가 App Information → Additional Information → Transfer App에서 금윤호의 Account Holder Apple Account와 수신 Team ID를 입력한다. 금윤호는 수신 팀의 Business → Agreements → App Transfers에서 요청을 확인하고 **60일 이내** 수락한다. 지원·개인정보 URL, 심사 연락처와 사용자 접근을 검토한다. [이전 시작](https://developer.apple.com/help/app-store-connect/transfer-an-app/initiate-an-app-transfer/) · [수신·수락](https://developer.apple.com/help/app-store-connect/transfer-an-app/accept-an-app-transfer/)
3. 완료 후 금윤호 팀의 앱 레코드·App ID와 프로비저닝 프로파일을 확인한다. 이전 팀이 사용하던 서명 개인키를 넘겨받는 방식 대신 수신 팀의 서명 자원을 사용한다. 실제 entitlement에 맞춰 푸시, Keychain 그룹, App Groups, Associated Domains, iCloud, Sign in with Apple 및 결제를 점검한다. Apple 로그인을 쓴다면 사용자별 transfer identifier 절차, 키체인 그룹을 쓴다면 업데이트 뒤 재로그인, APNs 키를 쓴다면 수신 팀 키와 발송 서비스 설정까지 확인한다. [기능별 Apple 이전 지침](https://developer.apple.com/help/app-store-connect/transfer-an-app/overview-of-app-transfer/)

## 4. 이 저장소의 실제 배포 구성

| 항목 | 싱커 | 덕아웃 |
|---|---|---|
| 앱 / 번들 ID | Sinker · `com.bullpenlog.app` | Dugout · `com.bullpenlog.dugout` |
| 추가 식별자·연동 | 휴식 Live Activity 확장 `com.bullpenlog.app.RestActivity`, Expo 푸시, URL 스킴 `sinker`·`bullpenlog` | `APP_VARIANT=dugout`, URL 스킴 `dugout`, 카카오 지도. 이 변형은 휴식 확장과 푸시 플러그인을 제외한다. |
| App Store Connect 단서 | 기존 문서에 Bullpen Log 명칭. 숫자 Apple ID는 콘솔에서 확인한다. | 배포 설정에 ‘덕아웃 DUGOUT’과 숫자 Apple ID `6826576447` 기록. 현재 팀·판매자·출시 이력은 콘솔에서 확인한다. |
| 실제 업로드 증거 | [싱커 TestFlight 업로드 단계 성공](https://github.com/Bullpen-Log/bullpen-log/actions/runs/40487819156) | [덕아웃 TestFlight 업로드 단계 성공](https://github.com/Bullpen-Log/bullpen-log/actions/runs/40494475719) |
| 업데이트 경로 | main의 지정 파일 변경 시 runtime 지문을 계산하고 자체 서버에 화면 코드 게시. 새 runtime이면 바이너리도 빌드한다. | 현재 자동 OTA 게시 작업은 싱커용이다. 덕아웃은 수동 워크플로에서 `app=dugout`과 `upload=true`로 TestFlight에 올린다. |

두 앱은 같은 `native/`를 사용한다. Expo 설정의 owner와 projectId는 Apple 판매자 또는 팀의 증거가 아니다. 두 빌드는 현재 **동일한** GitHub Secrets 이름 `APPLE_TEAM_ID`, `ASC_ISSUER_ID`, `ASC_KEY_ID`, `ASC_KEY_P8`를 사용해 아카이브를 자동 서명·업로드한다. 한 앱만 이전한 상태에서 이 네 값을 일괄 교체하면 다른 앱 업로드도 영향을 받는다. 두 앱의 전환 일정을 맞추거나, 따로 전환해야 한다면 앱별 서명 설정을 분리하는 변경부터 별도로 준비한다. 기존 `mobile/APPLE-SETUP.md`의 초대 방향과 옛 앱 빌드 예시는 이 정책에 맞게 읽는다. [앱 설정](../../native/app.json) · [덕아웃 변형](../../native/app.config.js) · [확장 설정](../../native/plugins/rest-activity/index.js) · [정식 배포 워크플로](../../.github/workflows/ios-native.yml)

싱커 OTA는 설치된 바이너리가 운영 서버에서 같은 runtime의 화면 코드를 받는 기능이다. Team ID·Apple 소유권·서명·entitlement는 새 서명 바이너리에서 검증해야 한다. `binary.json`의 기존 빌드 표시는 runtime 기준이라 새 팀 서명을 증명하지 않는다. 같은 runtime의 구·신 설치본은 같은 화면 코드를 받을 수 있으므로 새 팀 전용 변경을 게시하기 전 구 설치본과의 호환성을 확인한다. 현재 OTA 게시 작업은 main 푸시에서 실행한다. 기존 runtime이어도 새 팀의 첫 바이너리는 수동 실행에서 `app=sinker`, `upload=true`로 명시해 올린다. 두 앱 모두 수동 `upload=false`는 빌드 검사이므로 새 팀 TestFlight 수신 증거가 되지 않는다. [OTA 저장 규칙](../../lib/app-update.ts) · [게시 및 빌드 분기](../../.github/workflows/ios-native.yml)

## 5. 금윤호 팀의 첫 배포 완료 기준

- [ ] 두 앱 각각의 기존 소유 팀·숫자 Apple ID·출시 이력·설치 연속성 요구를 확인하고 3절의 경로를 선택했다. 새 앱이면 테스터에게 새 초대와 기기 전용 데이터 보관 방법을 전달했다.
- [ ] 새 팀의 배포 서명과 App Store Connect API 접근을 확인했다. 팀 키는 발급 화면에서 직접 비밀 저장소로 등록한다. 실제 키·인증 코드·인증서 개인키는 Git, 채팅, 인계 문서에 남기지 않는다.
- [ ] 금윤호 팀에서 내보낸 **서명된 배포본**의 `application-identifier`, `com.apple.developer.team-identifier`, 프로파일과 번들 ID를 앱·확장별로 대조했다. App ID prefix와 Team ID는 별도 항목으로 비교한다. 싱커 푸시의 `aps-environment`와 휴식 확장 버전·빌드 번호도 확인했다.
- [ ] 기존 테스터의 업데이트와 새 설치를 각각 시험했다. 싱커는 로그인·영상 접근·휴식 시계·푸시 수신 및 알림 이동·딥링크·OTA 수신을, 덕아웃은 올바른 앱 첫 화면·지도·로그인·사진 선택·딥링크를 실제 iPhone에서 확인했다. 새 앱 ID를 선택했다면 기존 앱과 동시 설치 시 URL 스킴과 외부 서비스의 앱 ID 등록도 확인했다.
- [ ] 금윤호 팀 App Store Connect → TestFlight에서 앱별 처리 완료 빌드 번호를 대조했다. 정식 출시는 별도 심사·공개 단계다. 일본어는 금윤호, 미국 영어는 김민이 앱 설명·스크린샷·권한 문구·개인정보 표시를 확인한다. [출시 범위와 국가별 분담](sinker-us-jp-launch-2026-11.md)
