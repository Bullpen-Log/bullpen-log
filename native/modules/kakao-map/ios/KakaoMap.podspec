Pod::Spec.new do |s|
  s.name           = 'KakaoMap'
  s.version        = '1.0.0'
  s.summary        = '카카오맵(덕아웃 연습장 · 레슨장 지도)'
  s.description    = '카카오맵 iOS SDK(KakaoMapsSDK v2)를 Expo 뷰로 감싼다 — 점 · 누름 · 화면 맞춤'
  s.author         = 'Bullpen Log'
  s.homepage       = 'https://bullpen-log.vercel.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.dependency 'KakaoMapsSDK', '~> 2.12'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
