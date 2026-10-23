import ExpoModulesCore
import UIKit

/// 시작 화면을 앱 테마로 — 뿌리 화면을 만드는 그 순간에 칠한다. 예전엔 모듈 OnCreate(JS 가 뜬 뒤)에서 칠해, 네이비 · 다크를 골라도
/// 흰 시작 화면이 1초쯤 보인 뒤에 바뀌었다(2026-10-21 김민).
/// 그 앞의 첫 장면(iOS 가 찍어 둔 그림)은 LaunchSnapshot 이 테마 그림으로 바꿔 둔다. 그게 안 먹은 시작(앱을 새로 깐 뒤 처음 · 우회가 안 되는
/// iOS 판)이면 iOS 가 방금 보인 그림(LaunchSnapshot.shownImage)을 맨 위에 얹었다가, 앱이 화면에 뜬 뒤 테마 바탕으로 스르르 걷는다.
/// 시작 화면 색 묶음(SplashScreenBackground)은 라이트 · 다크 둘뿐이라, 네이비는 그 판 바탕만 앱 네이비(lib/ui.ts page #0b1220)로 덮는다.
public class LaunchStyleSubscriber: ExpoAppDelegateSubscriber {
  /// 앱이 뜬 뒤 덮개를 둔 채 기다리는 시간 · 걷는 시간. 뜨기 전에 걷으면 iOS 의 여는 움직임에 묻혀, 흰색이 툭 바뀌어 보였다(2026-10-23 김민 폰)
  private static let hold = 0.3
  private static let fade = 0.4

  public func customizeRootView(_ rootView: UIView) {
    let pick = UserDefaults.standard.string(forKey: BullpenNativeModule.styleKey) ?? "light"
    rootView.overrideUserInterfaceStyle = pick == "system" ? .unspecified : pick == "light" ? .light : .dark
    BullpenNativeModule.applyLaunchStyle()
    let veil = pick == "system" ? nil : Self.launchVeil(over: rootView, pick: pick)
    /* 시작 화면 판은 expo-splash-screen 의 같은 단계(customizeRootView)가 붙인다 — 이미 붙었으면 지금, 아니면 그 뒤에 칠한다 */
    if pick == "navy" { Self.paintNavy(rootView) }
    DispatchQueue.main.async {
      if pick == "navy" { Self.paintNavy(rootView) }
    }
    guard let veil else { return }
    Self.whenActive {
      UIView.animate(withDuration: Self.fade, delay: Self.hold, options: [.curveEaseInOut]) {
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

  /// iOS 가 막 보인 장면이 테마 바탕이 아닐 때만 그 장면을 맨 위에 — 찍어 둔 그림 파일 그대로, 못 읽으면 기기 밝기의 시작 스토리보드.
  /// 우회가 먹어 테마 그림이면 얹지 않는다(같은 그림이 늦게 걷히면 시작 연출의 B 위에 멈춘 B 가 겹쳐 보인다). zPosition 이라 나중에 붙는 시작 판보다도 위
  private static func launchVeil(over root: UIView, pick: String) -> UIView? {
    guard let want = themed(pick) else { return nil }
    let veil: UIView
    if let shown = LaunchSnapshot.shownImage() {
      guard let c = LaunchSnapshot.corner(shown), !close(c, want) else { return nil }
      let iv = UIImageView(image: UIImage(cgImage: shown))
      iv.contentMode = .scaleAspectFill
      veil = iv
    } else {
      guard let splash = UIColor(named: "SplashScreenBackground"), !splash.resolvedColor(with: UIScreen.main.traitCollection).isEqual(want) else { return nil }
      let name = Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String ?? "SplashScreen"
      guard let board = UIStoryboard(name: name, bundle: .main).instantiateInitialViewController()?.view else { return nil }
      board.overrideUserInterfaceStyle = UIScreen.main.traitCollection.userInterfaceStyle
      veil = board
    }
    veil.frame = root.bounds
    veil.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    veil.isUserInteractionEnabled = false
    veil.layer.zPosition = 10_000
    veil.tag = veilTag
    root.addSubview(veil)
    return veil
  }

  /// 그림의 한 점이 이 색인가 — 찍어 둔 그림(ATX)은 압축이라 몇 칸 어긋난다(f2f2f7 이 f3f3f7 로)
  private static func close(_ px: [UInt8], _ color: UIColor) -> Bool {
    var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
    guard color.getRed(&r, green: &g, blue: &b, alpha: &a) else { return false }
    return zip(px, [r, g, b]).allSatisfy { abs(Int($0) - Int(($1 * 255).rounded())) <= 12 }
  }

  /// 덮개 표시 — 네이비 칠하기가 덮개(기기 밝기 그대로여야 함)를 건너뛰게
  private static let veilTag = 0x5EA1

  private static let navy = UIColor(red: 11 / 255, green: 18 / 255, blue: 32 / 255, alpha: 1)

  private static func paintNavy(_ root: UIView) {
    guard let splash = UIColor(named: "SplashScreenBackground") else { return }
    let dark = UITraitCollection(userInterfaceStyle: .dark)
    let want = splash.resolvedColor(with: dark)
    func walk(_ v: UIView, _ depth: Int) {
      if v.tag == veilTag { return }
      if let bg = v.backgroundColor, bg.resolvedColor(with: dark).isEqual(want) { v.backgroundColor = navy }
      if depth < 3 { v.subviews.forEach { walk($0, depth + 1) } }
    }
    walk(root, 0)
  }
}
