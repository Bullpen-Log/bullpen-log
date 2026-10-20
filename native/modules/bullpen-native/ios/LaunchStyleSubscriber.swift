import ExpoModulesCore
import UIKit

/// 시작 화면을 앱 테마로 — 뿌리 화면을 만드는 그 순간에 칠한다. 예전엔 모듈 OnCreate(JS 가 뜬 뒤)에서 칠해, 네이비 · 다크를 골라도
/// 흰 시작 화면이 1초쯤 보인 뒤에 바뀌었다(2026-10-21 김민). 앱이 켜지기 전 iOS 가 그리는 첫 장면은 기기 밝기를 따라 어쩔 수 없다.
/// 시작 화면 색 묶음(SplashScreenBackground)은 라이트 · 다크 둘뿐이라, 네이비는 그 판 바탕만 앱 네이비(lib/ui.ts page #0b1220)로 덮는다.
public class LaunchStyleSubscriber: ExpoAppDelegateSubscriber {
  public func customizeRootView(_ rootView: UIView) {
    let pick = UserDefaults.standard.string(forKey: BullpenNativeModule.styleKey) ?? "light"
    rootView.overrideUserInterfaceStyle = pick == "system" ? .unspecified : pick == "light" ? .light : .dark
    BullpenNativeModule.applyLaunchStyle()
    guard pick == "navy" else { return }
    /* 시작 화면 판은 expo-splash-screen 의 같은 단계(customizeRootView)가 붙인다 — 그 뒤에 찾는다 */
    DispatchQueue.main.async { Self.paintNavy(rootView) }
  }

  private static func paintNavy(_ root: UIView) {
    guard let splash = UIColor(named: "SplashScreenBackground") else { return }
    let dark = UITraitCollection(userInterfaceStyle: .dark)
    let want = splash.resolvedColor(with: dark)
    let navy = UIColor(red: 11 / 255, green: 18 / 255, blue: 32 / 255, alpha: 1)
    func walk(_ v: UIView, _ depth: Int) {
      if let bg = v.backgroundColor, bg.resolvedColor(with: dark).isEqual(want) { v.backgroundColor = navy }
      if depth < 3 { v.subviews.forEach { walk($0, depth + 1) } }
    }
    walk(root, 0)
  }
}
