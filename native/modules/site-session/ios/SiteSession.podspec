Pod::Spec.new do |s|
  s.name           = 'SiteSession'
  s.version        = '1.0.0'
  s.summary        = '사이트 로그인 쿠키를 앱 요청에(불펜로그)'
  s.description    = '웹뷰(WKWebView)의 사이트 쿠키를 앱의 쿠키 저장소로 옮긴다'
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
