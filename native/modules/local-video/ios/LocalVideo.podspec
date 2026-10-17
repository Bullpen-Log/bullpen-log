Pod::Spec.new do |s|
  s.name           = 'LocalVideo'
  s.version        = '1.0.0'
  s.summary        = '폰 영상(불펜로그) — 회원 영상 앱 안 폴더 · 라이브러리 영상 받아 두기'
  s.description    = '회원 영상을 앱 안(Application Support/bullpen-videos)에 · 운동 · 드릴 영상을 앱 안 · 폰 캐시에서'
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
