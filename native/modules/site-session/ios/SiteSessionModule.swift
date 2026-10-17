import ExpoModulesCore
import WebKit

/// 사이트 로그인('session' 쿠키)을 앱의 요청에 — 로그인은 웹뷰(WKWebView) 안에서 하고 쿠키도 그 저장소에 남는데, 앱 화면의 fetch(/api/rpc)는
/// 앱의 쿠키 저장소(HTTPCookieStorage)를 쓴다. react-native-webview 의 sharedCookiesEnabled 는 웹뷰 쿠키가 '바뀔 때'만 옮겨서, 옛 앱에서
/// 로그인해 둔 채 업데이트한 사람은 비어 있을 수 있다 — 앱 화면이 서버를 부르기 전에 sync 로 한 번 옮긴다.
public class SiteSessionModule: Module {
    public func definition() -> ModuleDefinition {
        Name("SiteSession")

        /// host(예 'bullpen-log.vercel.app')의 웹뷰 쿠키를 앱 저장소로 → 옮긴 수
        AsyncFunction("sync") { (host: String, promise: Promise) in
            DispatchQueue.main.async {
                WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                    let mine = cookies.filter { c in
                        let d = c.domain.hasPrefix(".") ? String(c.domain.dropFirst()) : c.domain
                        return host == d || host.hasSuffix("." + d)
                    }
                    mine.forEach { HTTPCookieStorage.shared.setCookie($0) }
                    promise.resolve(mine.count)
                }
            }
        }
    }
}
