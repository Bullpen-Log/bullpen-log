import ExpoModulesCore
import UIKit

/// 시작 화면을 앱 테마로 — 창이 처음 뜨는 그 순간에 칠한다. 예전엔 모듈 OnCreate(JS 가 뜬 뒤)에서 칠해, 네이비 · 다크를 골라도
/// 흰 시작 화면이 1초쯤 보인 뒤에 바뀌었다(2026-10-21 김민).
/// 출시 판은 업데이트를 확인하는 동안(최대 1.5초, app.json fallbackToCacheTimeout) expo-updates 가 시작 스토리보드를 따로 띄운다.
/// 그 판에는 뿌리 화면 손질(customizeRootView)이 안 닿아 기기 밝기(흰색)로 떴다 — 네이비 → 흰색 → 네이비(2026-10-23 김민 녹화).
/// 그래서 창 자체에 테마를 걸고, 창이 보이는 순간(UIWindow.didBecomeVisibleNotification, 첫 그림 전) 그 판까지 칠한다.
/// 그 앞의 첫 장면(iOS 가 찍어 둔 그림)은 LaunchSnapshot 이 테마 그림으로 바꿔 둔다. 그게 안 먹은 시작(앱을 새로 깐 뒤 처음 · 우회가 안 되는
/// iOS 판)이면 iOS 가 방금 보인 그림(LaunchSnapshot.shownImage)을 창 맨 위에 얹었다가, 앱이 화면에 뜬 뒤 테마 바탕으로 스르르 걷는다.
/// 시작 화면 색 묶음(SplashScreenBackground)은 라이트 · 다크 둘뿐이라, 네이비는 그 판 바탕만 앱 네이비(lib/ui.ts page #0b1220)로 덮는다.
public class LaunchStyleSubscriber: ExpoAppDelegateSubscriber {
  /// 앱이 뜬 뒤 덮개를 둔 채 기다리는 시간 · 걷는 시간. 뜨기 전에 걷으면 iOS 의 여는 움직임에 묻혀, 흰색이 툭 바뀌어 보였다(2026-10-23 김민 폰)
  private static let hold = 0.3
  private static let fade = 0.4

  private static var pick: String { UserDefaults.standard.string(forKey: BullpenNativeModule.styleKey) ?? "light" }

  public func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
    /* 창은 이 뒤 장면(scene)이 붙을 때 만들어진다 — 보이는 순간을 기다린다. 알림은 보이게 하는 그 자리에서 바로 돈다(queue nil) */
    var token: NSObjectProtocol?
    token = NotificationCenter.default.addObserver(forName: UIWindow.didBecomeVisibleNotification, object: nil, queue: nil) { note in
      guard let window = note.object as? UIWindow, window.windowScene != nil, window.rootViewController != nil else { return }
      if let token { NotificationCenter.default.removeObserver(token) }
      Self.styleWindow(window)
    }
    return true
  }

  /// 실제 앱 화면(업데이트 확인 뒤 갈아 끼우는 판 포함) — 창에 건 테마를 그대로 따르게, 네이비는 시작 판 바탕을 칠한다
  public func customizeRootView(_ rootView: UIView) {
    let pick = Self.pick
    rootView.overrideUserInterfaceStyle = Self.style(pick)
    BullpenNativeModule.applyLaunchStyle()
    /* 시작 화면 판은 expo-splash-screen 의 같은 단계(customizeRootView)가 붙인다 — 그 뒤에 찾는다 */
    DispatchQueue.main.async {
      if pick == "navy" { Self.paintNavy(rootView) }
    }
  }

  private static func style(_ pick: String) -> UIUserInterfaceStyle {
    pick == "system" ? .unspecified : pick == "light" ? .light : .dark
  }

  private static func styleWindow(_ window: UIWindow) {
    let pick = Self.pick
    window.overrideUserInterfaceStyle = style(pick)
    /* 창에서 세면 그 판이 넷째 칸(창 · 전환 판 · 그림자 판 · 판)이라, 판에서부터 칠한다 */
    if pick == "navy", let root = window.rootViewController?.view {
      paintNavy(root)
      DispatchQueue.main.async { paintNavy(root) }
    }
    guard pick != "system", let veil = launchVeil(over: window, pick: pick) else { return }
    whenActive {
      UIView.animate(withDuration: fade, delay: hold, options: [.curveEaseInOut]) {
        veil.alpha = 0
      } completion: { _ in
        veil.removeFromSuperview()
      }
    }
  }


  /// 앱이 화면에 뜬 뒤(활성) 한 번
  private static func whenActive(_ go: @escaping () -> Void) {
    if UIApplication.shared.applicationState == .active { return go() }
    var token: NSObjectProtocol?
    token = NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil, queue: .main) { _ in
      if let token { NotificationCenter.default.removeObserver(token) }
      go()
    }
  }

  private static func themed(_ pick: String) -> UIColor? {
    if pick == "navy" { return navy }
    return UIColor(named: "SplashScreenBackground")?.resolvedColor(with: UITraitCollection(userInterfaceStyle: pick == "light" ? .light : .dark))
  }

  /// iOS 가 막 보인 장면이 테마 바탕이 아닐 때만 그 장면을 창 맨 위에 — 찍어 둔 그림 파일 그대로, 못 읽으면 기기 밝기의 시작 스토리보드.
  /// 우회가 먹어 테마 그림이면 얹지 않는다(같은 그림이 늦게 걷히면 시작 연출의 B 위에 멈춘 B 가 겹쳐 보인다).
  /// 창에 얹어야 업데이트 확인 뒤 뿌리 화면을 갈아 끼워도 남는다. zPosition 이라 뒤에 붙는 화면보다도 위
  private static func launchVeil(over window: UIWindow, pick: String) -> UIView? {
    guard let want = themed(pick) else { return nil }
    let veil: UIView
    if let shown = LaunchSnapshot.shownImage() {
      guard let c = LaunchSnapshot.corner(shown), !close(c, want) else { return nil }
      let iv = UIImageView(image: UIImage(cgImage: shown))
      iv.contentMode = .scaleAspectFill
      veil = iv
    } else {
      guard let splash = UIColor(named: "SplashScreenBackground"), let c = rgb(splash.resolvedColor(with: UIScreen.main.traitCollection)),
            !close(c.map { UInt8($0) }, want) else { return nil }
      let name = Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String ?? "SplashScreen"
      guard let board = UIStoryboard(name: name, bundle: .main).instantiateInitialViewController()?.view else { return nil }
      board.overrideUserInterfaceStyle = UIScreen.main.traitCollection.userInterfaceStyle
      veil = board
    }
    veil.frame = window.bounds
    veil.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    veil.isUserInteractionEnabled = false
    veil.layer.zPosition = 10_000
    veil.tag = veilTag
    window.addSubview(veil)
    return veil
  }

  /// 그림의 한 점이 이 색인가 — 찍어 둔 그림(ATX)은 압축이라 몇 칸 어긋난다(f2f2f7 이 f3f3f7 로)
  private static func close(_ px: [UInt8], _ color: UIColor) -> Bool {
    guard let c = rgb(color) else { return false }
    return zip(px, c).allSatisfy { abs(Int($0) - $1) <= 12 }
  }

  /// sRGB 0~255 셋 — 에셋의 색(Display P3 등)과 코드의 색은 isEqual 로는 같은 색도 다르다고 나와, 숫자로 견준다
  private static func rgb(_ color: UIColor) -> [Int]? {
    guard let srgb = CGColorSpace(name: CGColorSpace.sRGB),
          let c = color.cgColor.converted(to: srgb, intent: .defaultIntent, options: nil)?.components, c.count >= 3
    else { return nil }
    return c.prefix(3).map { Int(($0 * 255).rounded()) }
  }

  /// 덮개 표시 — 네이비 칠하기가 덮개(기기 밝기 그대로여야 함)를 건너뛰게
  private static let veilTag = 0x5EA1

  private static let navy = UIColor(red: 11 / 255, green: 18 / 255, blue: 32 / 255, alpha: 1)

  private static func paintNavy(_ root: UIView) {
    guard let splash = UIColor(named: "SplashScreenBackground") else { return }
    let dark = UITraitCollection(userInterfaceStyle: .dark)
    guard let want = rgb(splash.resolvedColor(with: dark)) else { return }
    func walk(_ v: UIView, _ depth: Int) {
      if v.tag == veilTag { return }
      if let bg = v.backgroundColor, let c = rgb(bg.resolvedColor(with: dark)), zip(c, want).allSatisfy({ abs($0 - $1) <= 2 }) { v.backgroundColor = navy }
      if depth < 3 { v.subviews.forEach { walk($0, depth + 1) } }
    }
    walk(root, 0)
  }
}
