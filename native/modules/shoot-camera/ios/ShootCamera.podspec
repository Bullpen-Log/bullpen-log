Pod::Spec.new do |s|
  s.name           = 'ShootCamera'
  s.version        = '1.0.0'
  s.summary        = '촬영 모드 앱 카메라(불펜로그) — 1080p · 60fps 로 찍어 사이트에 조금씩 넘긴다'
  s.description    = '옛 Capacitor ShootCameraPlugin 을 Expo 모듈로 옮긴 것 — 웹 촬영 모드(lib/shoot-camera.ts)가 작은 다리로 부른다'
  s.author         = 'Bullpen Log'
  s.homepage       = 'https://bullpen-log.vercel.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift,hpp,cpp}"
end
