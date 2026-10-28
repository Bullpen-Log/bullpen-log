/**
 * 앱 설정 — 기본은 app.json 그대로(싱커). APP_VARIANT=dugout 이면 덕아웃 앱(docs/designs/sinker-dugout.md 7절 · 2026-10-24 김민: 섞기 방식)으로 바꿔 낸다.
 * 두 앱이 앱 코드 · 부품 · 패키지를 같이 쓰고 이름 · 번들 ID · 그림 · 화면 폴더(src/dugout/app) · 플러그인만 다르다.
 *
 * 덕아웃 앱은 굽기 · Metro · 업데이트 내보내기를 모두 APP_VARIANT=dugout 을 붙여 돌린다 — 안 붙이면 싱커 화면이 묶인다.
 * 싱커는 app.json 을 손대지 않고 돌려준다 — 바닥 판 지문이 그대로라 이 파일이 생겨도 싱커를 새로 굽지 않는다.
 */
/* 푸시(expo-notifications)는 싱커만 — 덕아웃 앱은 아직 푸시 토큰을 등록하지 않고, 서명에 푸시 권한을 더하지 않게(2026-10-28) */
const DUGOUT_DROP = new Set(['./plugins/rest-activity', './plugins/library-videos', 'expo-notifications']);

module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'dugout') return config;
  return {
    ...config,
    /* Xcode 프로젝트 이름(ios/Dugout.xcworkspace) — 홈 화면 이름은 locales 의 CFBundleDisplayName('덕아웃') */
    name: 'Dugout',
    slug: 'dugout',
    scheme: ['dugout'],
    icon: './assets/dugout/icon.png',
    ios: {
      ...config.ios,
      bundleIdentifier: 'com.bullpenlog.dugout',
      infoPlist: {
        ...config.ios.infoPlist,
        NSCameraUsageDescription: '장터에 올릴 물건 사진을 찍는 데 카메라를 씁니다.',
        NSMicrophoneUsageDescription: '영상을 찍을 때 소리를 함께 담는 데 마이크를 씁니다.',
        NSPhotoLibraryUsageDescription: '장터 · 커뮤니티에 올릴 사진을 앨범에서 고르는 데 씁니다.',
        NSPhotoLibraryAddUsageDescription: '사진을 앨범에 저장하는 데 씁니다.',
      },
    },
    locales: { ko: './locales/dugout/ko.json', en: './locales/dugout/en.json' },
    /* 싱커 것만 뺀다: 쉬는 시간 Live Activity(확장 타깃 · 번들 ID 가 하나 더 든다) · 운동 영상 묶음 */
    plugins: config.plugins
      .filter((p) => !DUGOUT_DROP.has(p))
      .map((p) => {
        if (p === 'expo-router') return ['expo-router', { root: './src/dugout/app' }];
        if (Array.isArray(p) && p[0] === 'expo-splash-screen') return [p[0], { ...p[1], image: './assets/dugout/splash.png' }];
        return p;
      }),
  };
};
