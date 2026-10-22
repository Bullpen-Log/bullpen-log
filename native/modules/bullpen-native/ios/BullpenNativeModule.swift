import ExpoModulesCore
import UIKit
import UserNotifications
import WebKit

/// 앱 공용 부품 — 웹뷰 화면과 네이티브 화면이 같이 쓰는 작은 것들.
///   sync(host)                              웹뷰(WKWebView)의 사이트 쿠키(로그인 'session')를 앱 요청 저장소로 → 옮긴 수
///   mirror(host)                            거꾸로 — 웹뷰 저장소를 앱 저장소와 같게(앱에 없는 'session' 은 웹뷰에서 지움) → 넣은 수
///   clearSession(host)                      두 저장소의 'session' 지우기(로그인 화면에 왔을 때)
///   keepAwake(on)                           화면 꺼짐 막기 켜기 / 끄기(앱이 앞으로 돌아오면 되살린다)
///   scheduleAlarm(id, at, title, body)      at(밀리초, Date.now 기준)에 로컬 알림. 같은 id 면 바꾼다. 처음엔 허락을 묻는다
///   cancelAlarm(id)                         건 알림 지우기(이미 뜬 것도)
///   liveShow(kind, symbol, label, title, detail, sinceMs, untilMs)  운동하는 동안의 시계를 다이나믹 아일랜드 · 잠금 화면에(RestActivity.swift)
///   liveEnd()                               그 시계 거두기
///
/// keepAwake · 알림은 옛 Capacitor 앱의 BullpenNativePlugin.swift(mobile/)를 그대로 옮겼다 — 웹뷰 화면은 window.Capacitor 흉내 다리
/// (native/src/lib/cap-bridge.ts, 2026-10-17 검토 D4)로 부른다.
///
/// sync: 로그인은 웹뷰 안에서 하고 쿠키도 그 저장소에 남는데, 앱 화면의 fetch(/api/rpc)는 앱의 쿠키 저장소(HTTPCookieStorage)를 쓴다.
/// react-native-webview 의 sharedCookiesEnabled 는 웹뷰 쿠키가 '바뀔 때'만 옮겨서, 옛 앱에서 로그인해 둔 채 업데이트한 사람은 비어 있을 수 있다.
public class BullpenNativeModule: Module {
    /// 알림 이름표 앞머리 — 다른 알림과 섞이지 않게(옛 앱과 같다)
    static let prefix = "bullpen."
    /// 사이트 로그인 쿠키 이름(lib/session.ts SESSION_COOKIE)
    static let session = "session"
    /// 이 사이트(host)의 쿠키인가 — '.bullpen-log.vercel.app' 같은 앞 점도 받는다
    static func matches(_ c: HTTPCookie, _ host: String) -> Bool {
        let d = c.domain.hasPrefix(".") ? String(c.domain.dropFirst()) : c.domain
        return host == d || host.hasSuffix("." + d)
    }
    static func isSession(_ c: HTTPCookie, _ host: String) -> Bool { c.name == session && matches(c, host) }
    static func sameKey(_ a: HTTPCookie, _ b: HTTPCookie) -> Bool { a.name == b.name && a.domain == b.domain && a.path == b.path }
    /// 앱 저장소의 'session' 을 keep 그대로 — keep 에 없는 것은 지우고, keep 의 것은 다시 넣는다
    static func restoreSessions(_ keep: [HTTPCookie], _ host: String) {
        let jar = HTTPCookieStorage.shared
        for c in jar.cookies ?? [] where isSession(c, host) && !keep.contains(where: { sameKey($0, c) }) {
            jar.deleteCookie(c)
        }
        for c in keep where c.name == session { jar.setCookie(c) }
    }
    static let styleKey = "bullpen-launch-style"
    static func applyLaunchStyle() {
        let pick = UserDefaults.standard.string(forKey: styleKey) ?? "light"
        let style: UIUserInterfaceStyle = pick == "system" ? .unspecified : pick == "light" ? .light : .dark
        for scene in UIApplication.shared.connectedScenes {
            for w in (scene as? UIWindowScene)?.windows ?? [] { w.overrideUserInterfaceStyle = style }
        }
    }
    private var wantAwake = false
    private let presenter = AlarmPresenter()

    public func definition() -> ModuleDefinition {
        Name("BullpenNative")

        OnCreate {
            /* 앱 테마로 창을 칠한다 — 시작 화면(SplashScreenBackground 의 라이트 · 다크)이 기기 밝기가 아니라 앱 테마를 따르게.
               JS 의 설정 읽기(AsyncStorage)는 늦어서, 다크를 골랐는데 흰 시작 화면이 한 번 번쩍였다 */
            DispatchQueue.main.async { BullpenNativeModule.applyLaunchStyle() }
            UNUserNotificationCenter.current().delegate = self.presenter
            let center = NotificationCenter.default
            center.addObserver(forName: UIApplication.didEnterBackgroundNotification, object: nil, queue: .main) { _ in
                UIApplication.shared.isIdleTimerDisabled = false
            }
            center.addObserver(forName: UIApplication.willEnterForegroundNotification, object: nil, queue: .main) { [weak self] _ in
                UIApplication.shared.isIdleTimerDisabled = self?.wantAwake ?? false
            }
        }

        AsyncFunction("sync") { (host: String, promise: Promise) in
            DispatchQueue.main.async {
                WKWebsiteDataStore.default().httpCookieStore.getAllCookies { cookies in
                    let mine = cookies.filter { Self.matches($0, host) }
                    mine.forEach { HTTPCookieStorage.shared.setCookie($0) }
                    promise.resolve(mine.count)
                }
            }
        }

        /// 앱 화면이 로그인 · 가입 · 비밀번호 바꾸기 · 로그아웃 · 탈퇴를 한 뒤 — 서버의 Set-Cookie 는 앱 저장소에 들어온다. 웹뷰 저장소를 그와 같게:
        /// 앱 저장소의 사이트 쿠키는 넣고, 앱에 없는 'session' 은 웹뷰에서도 지운다. react-native-webview 는 넣기만 옮기고 지우기는 안 옮긴다
        /// (RNCWebViewImpl cookiesDidChangeInCookieStore · syncCookiesToWebView) — 그대로 두면 지운 로그인이 다음 실행에 웹뷰로 되살아났다.
        ///
        /// 차례가 중요하다: 웹뷰 쿠키가 바뀔 때마다 react-native-webview 가 웹뷰의 쿠키 전부를 앱 저장소로 되옮긴다(cookiesDidChange). 그래서
        /// 웹뷰의 옛 로그인을 먼저 지우고 → 앱 것을 넣고 → 끝에 앱 저장소의 'session' 을 처음 본 그대로 되돌린다(그 사이 되옮겨진 옛 값이 남지 않게).
        AsyncFunction("mirror") { (host: String, promise: Promise) in
            DispatchQueue.main.async {
                let store = WKWebsiteDataStore.default().httpCookieStore
                let app = (HTTPCookieStorage.shared.cookies ?? []).filter { Self.matches($0, host) }
                store.getAllCookies { web in
                    let stale = DispatchGroup()
                    for c in web where Self.isSession(c, host) && !app.contains(where: { Self.sameKey($0, c) }) {
                        stale.enter()
                        store.delete(c) { stale.leave() }
                    }
                    stale.notify(queue: .main) {
                        let put = DispatchGroup()
                        for c in app {
                            put.enter()
                            store.setCookie(c) { put.leave() }
                        }
                        put.notify(queue: .main) {
                            Self.restoreSessions(app, host)
                            promise.resolve(app.count)
                        }
                    }
                }
            }
        }

        /// 로그인 화면에 왔다 = 로그아웃 상태 — 두 저장소의 'session' 을 지운다(앞사람 로그인이 앱 요청 · 웹뷰에 남지 않게).
        /// 웹뷰부터 지운다 — 앱 것을 먼저 지우면 웹뷰가 바뀌는 사이 옛 로그인이 앱 저장소로 되옮겨질 수 있다.
        AsyncFunction("clearSession") { (host: String, promise: Promise) in
            DispatchQueue.main.async {
                let store = WKWebsiteDataStore.default().httpCookieStore
                store.getAllCookies { web in
                    let group = DispatchGroup()
                    for c in web where Self.isSession(c, host) {
                        group.enter()
                        store.delete(c) { group.leave() }
                    }
                    group.notify(queue: .main) {
                        Self.restoreSessions([], host)
                        promise.resolve(nil)
                    }
                }
            }
        }

        /// 앱 테마(light · dark · navy · system)를 기억 — 다음 시작 화면이 이 테마로 뜬다
        Function("setLaunchStyle") { (pick: String) in
            UserDefaults.standard.set(pick, forKey: BullpenNativeModule.styleKey)
            /* iOS 가 맨 먼저 그리는 시작 화면 그림도 이 테마로(LaunchSnapshot.swift) — 다음에 켤 때부터 */
            LaunchSnapshot.refresh(pick)
        }

        AsyncFunction("keepAwake") { (on: Bool) in
            self.wantAwake = on
            DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = on }
        }

        /// 운동하는 동안의 시계(다이나믹 아일랜드 · 잠금 화면) — kind rest · hold · work, untilMs 0 이면 올라가는 시계. RestActivity.swift
        AsyncFunction("liveShow") { (kind: String, symbol: String, label: String, title: String, detail: String, sinceMs: Double, untilMs: Double) in
            await SessionLive.show(.init(
                kind: kind, symbol: symbol, label: label, title: title, detail: detail,
                since: Date(timeIntervalSince1970: sinceMs / 1000),
                until: untilMs > 0 ? Date(timeIntervalSince1970: untilMs / 1000) : nil
            ))
        }

        AsyncFunction("liveEnd") {
            await SessionLive.end()
        }

        AsyncFunction("scheduleAlarm") { (id: String, at: Double, title: String, body: String, promise: Promise) in
            let seconds = at / 1000 - Date().timeIntervalSince1970
            let key = Self.prefix + id
            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: [key])
            /* 이미 지났거나 1초도 안 남았으면 걸지 않는다 — 화면의 시계가 곧 알린다 */
            guard seconds >= 1 else { return promise.resolve(["scheduled": false]) }
            center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
                guard granted else { return promise.resolve(["scheduled": false, "denied": true]) }
                let content = UNMutableNotificationContent()
                content.title = title
                content.body = body
                content.sound = .default
                let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
                center.add(UNNotificationRequest(identifier: key, content: content, trigger: trigger)) { error in
                    if let error { promise.reject("failed", error.localizedDescription) } else { promise.resolve(["scheduled": true]) }
                }
            }
        }

        AsyncFunction("cancelAlarm") { (id: String) in
            let key = Self.prefix + id
            let center = UNUserNotificationCenter.current()
            center.removePendingNotificationRequests(withIdentifiers: [key])
            center.removeDeliveredNotifications(withIdentifiers: [key])
        }
    }
}

/// 앱이 앞에 떠 있을 때 온 알림 — 휴식 알림은 띄우지 않는다(화면의 시계 · 소리 · 진동이 이미 알린다). 홈 캘린더 일정 알림(id 'event-…')은
/// 화면이 따로 알리지 않으므로 띄운다(옛 앱과 같다)
final class AlarmPresenter: NSObject, UNUserNotificationCenterDelegate {
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if notification.request.identifier.hasPrefix(BullpenNativeModule.prefix + "event-") {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([])
        }
    }

    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}
