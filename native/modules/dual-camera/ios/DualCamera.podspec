Pod::Spec.new do |s|
  s.name           = 'DualCamera'
  s.version        = '1.0.0'
  s.summary        = '구속 측정 카메라(불펜로그)'
  s.description    = '구속 측정 카메라 — 이어 녹화 · 던짐 알아채기 · 클립 자르기'
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
