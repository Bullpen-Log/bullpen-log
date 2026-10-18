Pod::Spec.new do |s|
  s.name           = 'BullpenNative'
  s.version        = '1.0.0'
  s.summary        = '앱 공용 부품(불펜로그) — 로그인 쿠키 · 화면 켜 두기 · 로컬 알림'
  s.description    = '웹뷰 사이트 쿠키를 앱 요청에 · 화면 켜 두기 · 쉬는 시간 · 일정 알림'
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
