/**
 * 카카오맵 네이티브 앱 키를 Info.plist 의 KakaoAppKey 로(modules/kakao-map 이 읽는다).
 * 키는 저장소에 안 둔다 — 로컬은 native/.env, GitHub 굽기는 저장소 비밀값 KAKAO_NATIVE_APP_KEY(ios-native.yml 이 env 로 넘긴다).
 * 키가 없으면 비워 둔다 — 앱은 지도 자리에 '지도를 불러오지 못했어요'를 띄우고 목록은 그대로 쓴다.
 * 카카오 개발자 콘솔 › 플랫폼 › iOS 에 번들 ID(com.bullpenlog.app · com.bullpenlog.dugout)가 있어야 인증이 된다.
 */
const { withInfoPlist } = require('expo/config-plugins');

module.exports = (config) =>
  withInfoPlist(config, (c) => {
    const key = (process.env.KAKAO_NATIVE_APP_KEY ?? '').trim();
    if (key) c.modResults.KakaoAppKey = key;
    else delete c.modResults.KakaoAppKey;
    return c;
  });
