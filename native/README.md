# 불펜로그 아이폰 앱(Expo)

**담당: 김민**(2026-10-17 김민 결정 — 이 폴더는 김민 영역이다. 금윤호 쪽에서 고치면 HANDOFF 로 알린다).
웹사이트는 사용자용으로 계속 두고, 앱은 기능을 웹과 다르게 가져간다(같은 날 결정) — 옮긴 화면을 웹과 똑같이 맞출 필요는 없다.

지금 앱(mobile/, Capacitor 껍데기)을 대신할 네이티브 앱이다. 계획 · 결정은 2026-10-17 엔지니어링 검토(D1~D11)
— 요약: 아이폰 먼저, 같은 번들 ID(com.bullpenlog.app)로 지금 앱의 업데이트로 나가고, 구속 측정 · 촬영 · 투구 영상 화면부터
네이티브로 옮긴다. 아직 안 옮긴 화면은 사이트를 웹뷰로 띄운다.

## 지금 상태(1판)

- 사이트(`https://bullpen-log.vercel.app/today`)를 화면 가득 띄운 웹뷰 하나 — 지금 Capacitor 앱과 같은 모습. User-Agent 에
  `BullpenLogApp/2.0 BullpenNative/1` 을 붙여 사이트가 앱 안임을 안다(lib/app-env.ts).
- 로그인은 사이트 'session' 쿠키 그대로(sharedCookiesEnabled). 네이티브 화면은 같은 쿠키로 `/api/rpc/<파일>.<함수>` 를 부른다
  (요청 머리 `x-bullpen-app: <lib/app-api.ts APP_API_LEVEL>` 필수).
- 우리 사이트 밖 주소는 폰의 앱 · 사파리로 연다.

## 경로 별칭

- `~/…` = 이 폴더의 `src/…`
- `@/…` = 저장소 뿌리(웹과 같은 뜻) — 웹과 같이 쓰는 계산은 `@/lib/…` 로 그대로 부른다. 서버 · 브라우저 전용 파일을 부르면
  저장소 뿌리에서 `npm run shared-lib:test` 가 잡는다.

## 명령

```bash
npm install                      # 처음 한 번(이 폴더)
npx expo run:ios                 # 시뮬레이터에 굽고 켜기(맥만)
npx expo run:ios --device --configuration Release   # 폰에 깔아 구속 측정을 볼 때는 꼭 Release 로
npx expo start                   # 굽고 난 뒤 화면 코드만 고칠 때
npx tsc --noEmit && npx expo lint
```

**폰에 깔 때는 `--configuration Release`** — Debug(기본값)는 Swift 최적화가 없어 구속 측정 카메라의 공 찾기가 장면마다 수십 ms 걸리고, 10-20 엔
장면을 반이나 버려 측정이 거의 안 됐다(`docs/velocity/native-measure-recovery-prompt.md`). 카메라 화면 알약에 `DEBUG` 가 보이면 그 빌드다.
개발용 현장 기록(30Mbps) · 화각 재기는 `-labRecord YES` · `-fovProbe YES` 로 켤 때만 돈다(`scripts/velocity-lab/README.md`).

패키지는 `npx expo install <이름>` 으로 더한다(SDK 에 맞는 판). `ios/` · `android/` 는 만들어지는 폴더라 손으로 고치지 않고
git 에도 안 올린다 — 설정은 `app.json` 에.

개발 중에 내 컴퓨터 서버를 띄우려면 `EXPO_PUBLIC_SITE_URL=http://localhost:3000 npx expo start`.
