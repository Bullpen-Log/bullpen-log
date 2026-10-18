import ExpoModulesCore
import UIKit
import UserNotifications
import WebKit

/// 앱 공용 부품 — 웹뷰 화면과 네이티브 화면이 같이 쓰는 작은 것들.
///   sync(host)                              웹뷰(WKWebView)의 사이트 쿠키(로그인 'session')를 앱 요청 저장소로 → 옮긴 수
///   keepAwake(on)                           화면 꺼짐 막기 켜기 / 끄기(앱이 앞으로 돌아오면 되살린다)
///   scheduleAlarm(id, at, title, body)      at(밀리초, Date.now 기준)에 로컬 알림. 같은 id 면 바꾼다. 처음엔 허락을 묻는다
///   cancelAlarm(id)                         건 알림 지우기(이미 뜬 것도)
///
/// keepAwake · 알림은 옛 Capacitor 앱의 BullpenNativePlugin.swift(mobile/)를 그대로 옮겼다 — 웹뷰 화면은 window.Capacitor 흉내 다리
/// (native/src/lib/cap-bridge.ts, 2026-10-17 검토 D4)로 부른다.
///
/// sync: 로그인은 웹뷰 안에서 하고 쿠키도 그 저장소에 남는데, 앱 화면의 fetch(/api/rpc)는 앱의 쿠키 저장소(HTTPCookieStorage)를 쓴다.
/// react-native-webview 의 sharedCookiesEnabled 는 웹뷰 쿠키가 '바뀔 때'만 옮겨서, 옛 앱에서 로그인해 둔 채 업데이트한 사람은 비어 있을 수 있다.
public class BullpenNativeModule: Module {
    /// 알림 이름표 앞머리 — 다른 알림과 섞이지 않게(옛 앱과 같다)
    static let prefix = "bullpen."
    private var wantAwake = false
    private let presenter = AlarmPresenter()

    public func definition() -> ModuleDefinition {
        Name("BullpenNative")

        OnCreate {
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
                    let mine = cookies.filter { c in
                        let d = c.domain.hasPrefix(".") ? String(c.domain.dropFirst()) : c.domain
                        return host == d || host.hasSuffix("." + d)
                    }
                    mine.forEach { HTTPCookieStorage.shared.setCookie($0) }
                    promise.resolve(mine.count)
                }
            }
        }

        AsyncFunction("keepAwake") { (on: Bool) in
            self.wantAwake = on
            DispatchQueue.main.async { UIApplication.shared.isIdleTimerDisabled = on }
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
