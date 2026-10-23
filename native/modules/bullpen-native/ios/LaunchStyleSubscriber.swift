import ExpoModulesCore
import UIKit

/// 시작 화면을 앱 테마로 — 뿌리 화면을 만드는 그 순간에 칠한다. 예전엔 모듈 OnCreate(JS 가 뜬 뒤)에서 칠해, 네이비 · 다크를 골라도
/// 흰 시작 화면이 1초쯤 보인 뒤에 바뀌었다(2026-10-21 김민).
/// 그 앞의 첫 장면(iOS 가 찍어 둔 그림)은 LaunchSnapshot 이 테마 그림으로 바꿔 둔다. iOS 가 방금 보인 그 그림(LaunchSnapshot.shownImage)을
/// 맨 위에 얹었다가 걷는다 — 우회가 먹었으면 같은 테마 그림이라 아무 일 없고, 안 먹었으면(iOS 판 · 처음 켬) 흰 → 네이비가 스르르 넘어간다.
/// 시작 화면 색 묶음(SplashScreenBackground)은 라이트 · 다크 둘뿐이라, 네이비는 그 판 바탕만 앱 네이비(lib/ui.ts page #0b1220)로 덮는다.
public class LaunchStyleSubscriber: ExpoAppDelegateSubscriber {
  /// 넘어가는 시간 — 나가는 것은 빠르게(디자인 규칙 120~200ms), 첫 장면이라 조금 길게
  private static let fade = 0.32

  public func customizeRootView(_ rootView: UIView) {
    let pick = UserDefaults.standard.string(forKey: BullpenNativeModule.styleKey) ?? "light"
    rootView.overrideUserInterfaceStyle = pick == "system" ? .unspecified : pick == "light" ? .light : .dark
    BullpenNativeModule.applyLaunchStyle()
    let veil = Self.needsVeil(pick) ? Self.launchVeil(over: rootView) : nil
    /* 시작 화면 판은 expo-splash-screen 의 같은 단계(customizeRootView)가 붙인다 — 그 뒤에 찾는다 */
    DispatchQueue.main.async {
      if pick == "navy" { Self.paintNavy(rootView) }
      guard let veil else { return }
      UIView.animate(withDuration: Self.fade, delay: 0.05, options: [.curveEaseOut]) {
        veil.alpha = 0
      } completion: { _ in
        veil.removeFromSuperview()
      }
    }
  }

  /// 덮개가 필요한가 — 기기 밝기의 시작 화면과 테마 바탕이 다를 때만(같으면 무엇을 보였든 그대로라 안 얹는다)
  private static func needsVeil(_ pick: String) -> Bool {
    guard pick != "system", let splash = UIColor(named: "SplashScreenBackground") else { return false }
    let shown = splash.resolvedColor(with: UIScreen.main.traitCollection)
    let themed = pick == "navy" ? navy : splash.resolvedColor(with: UITraitCollection(userInterfaceStyle: pick == "light" ? .light : .dark))
    return !shown.isEqual(themed)
  }

  /// iOS 가 막 보인 장면을 맨 위에 — 찍어 둔 그림 파일 그대로, 못 읽으면 기기 밝기의 시작 스토리보드. zPosition 이라 나중에 붙는 시작 판보다도 위
  private static func launchVeil(over root: UIView) -> UIView? {
    let veil: UIView
    if let shown = LaunchSnapshot.shownImage() {
      let iv = UIImageView(image: UIImage(cgImage: shown))
      iv.contentMode = .scaleAspectFill
      veil = iv
    } else {
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
