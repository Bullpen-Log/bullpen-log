import Capacitor
import UIKit
import UserNotifications

/// 불펜로그 앱 기능 — 화면 켜 두기 · 휴식 끝 알림(사이트 lib/native-bridge.ts, 2026-10-03 아이폰 점검).
///
/// - 화면 켜 두기: 웹의 navigator.wakeLock 은 iOS 18.4 전의 앱 웹뷰에서 잡힌 척만 하고 화면이 꺼졌다(WebKit 254545).
///   세트 사이 · 구속 측정 삼각대에서 폰이 잠기면 시계 · 카메라가 멈춘다. 여기서 isIdleTimerDisabled 로 확실히 잡는다.
///   앱이 뒤로 가면 놓고, 앞으로 오면 사이트가 청한 대로 되돌린다.
/// - 휴식 끝 알림: 화면을 잠그거나 다른 앱에 가면 사이트의 시계 · 소리가 멈춘다. 쉬는 시간이 끝날 시각에 로컬 알림을
///   미리 걸어 두면 주머니 속 폰이 알려 준다. 앱이 앞에 떠 있으면 알림을 띄우지 않는다(화면의 시계 · 소리가 맡는다).
///
/// 부르는 법(사이트, window.Capacitor.nativePromise('BullpenNative', …)):
///   keepAwake({ on })                         화면 꺼짐 막기 켜기 / 끄기
///   scheduleAlarm({ id, at, title, body })    at(밀리초, Date.now 기준)에 알림. 같은 id 면 바꾼다. 처음엔 허락을 묻는다
///   cancelAlarm({ id })                       건 알림 지우기(이미 뜬 것도)
@objc(BullpenNativePlugin)
public class BullpenNativePlugin: CAPPlugin, CAPBridgedPlugin, UNUserNotificationCenterDelegate {
    public let identifier = "BullpenNativePlugin"
    public let jsName = "BullpenNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "keepAwake", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "scheduleAlarm", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "cancelAlarm", returnType: CAPPluginReturnPromise),
    ]

    /// 알림 이름표 앞머리 — 다른 알림과 섞이지 않게
    private static let prefix = "bullpen."
    /// 사이트가 켜 달라고 했나 — 앱이 앞으로 돌아오면 이대로 되돌린다
    private var wantAwake = false

    override public func load() {
        UNUserNotificationCenter.current().delegate = self
        let center = NotificationCenter.default
        center.addObserver(self, selector: #selector(didEnterBackground), name: UIApplication.didEnterBackgroundNotification, object: nil)
        center.addObserver(self, selector: #selector(willEnterForeground), name: UIApplication.willEnterForegroundNotification, object: nil)
    }

    deinit {
        NotificationCenter.default.removeObserver(self)
    }

    @objc func keepAwake(_ call: CAPPluginCall) {
        wantAwake = call.getBool("on") ?? false
        let on = wantAwake
        DispatchQueue.main.async {
            UIApplication.shared.isIdleTimerDisabled = on
        }
        call.resolve()
    }

    @objc private func didEnterBackground() {
        UIApplication.shared.isIdleTimerDisabled = false
    }

    @objc private func willEnterForeground() {
        UIApplication.shared.isIdleTimerDisabled = wantAwake
    }

    @objc func scheduleAlarm(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let at = call.getDouble("at") else {
            call.reject("id · at 이 필요해요")
            return
        }
        let title = call.getString("title") ?? ""
        let body = call.getString("body") ?? ""
        let seconds = at / 1000 - Date().timeIntervalSince1970
        let key = Self.prefix + id
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [key])
        // 이미 지났거나 1초도 안 남았으면 걸지 않는다 — 화면의 시계가 곧 알린다
        guard seconds >= 1 else {
            call.resolve(["scheduled": false])
            return
        }
        center.requestAuthorization(options: [.alert, .sound]) { granted, _ in
            guard granted else {
                call.resolve(["scheduled": false, "denied": true])
                return
            }
            let content = UNMutableNotificationContent()
            content.title = title
            content.body = body
            content.sound = .default
            let trigger = UNTimeIntervalNotificationTrigger(timeInterval: seconds, repeats: false)
            center.add(UNNotificationRequest(identifier: key, content: content, trigger: trigger)) { error in
                if let error = error {
                    call.reject(error.localizedDescription)
                } else {
                    call.resolve(["scheduled": true])
                }
            }
        }
    }

    @objc func cancelAlarm(_ call: CAPPluginCall) {
        guard let id = call.getString("id") else {
            call.reject("id 가 필요해요")
            return
        }
        let key = Self.prefix + id
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [key])
        center.removeDeliveredNotifications(withIdentifiers: [key])
        call.resolve()
    }

    /// 앱이 앞에 떠 있을 때 온 알림 — 휴식 알림은 띄우지 않는다(화면의 시계 · 소리 · 진동이 이미 알린다).
    /// 홈 캘린더 일정 알림(id 'event-…')은 화면이 따로 알리지 않으므로 띄운다
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        if notification.request.identifier.hasPrefix(Self.prefix + "event-") {
            completionHandler([.banner, .list, .sound])
        } else {
            completionHandler([])
        }
    }

    /// 알림을 눌러 앱으로 들어옴 — 따로 할 일은 없다(앱이 열리면 화면이 지난 시간을 따라잡는다)
    public func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        completionHandler()
    }
}
