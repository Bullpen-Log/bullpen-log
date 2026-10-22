import ImageIO
import UIKit

/// 앱을 켤 때 iOS 가 맨 먼저 그리는 시작 화면을 앱 테마 색으로(2026-10-22 김민: "네이비인데 처음에 흰색이 떴다가 네이비로 바뀐다").
///
/// 그 첫 장면은 우리 코드가 돌기 전에 iOS 가 그린다 — 시작 스토리보드를 미리 찍어 둔 그림(Library/SplashBoard/Snapshots 의 라이트 · 다크
/// 두 장)이고, 기기 밝기만 따른다. 공식 길이 없어, 테마가 정해지면 그 그림 파일을 같은 크기 · 같은 형식(ATX/KTX)의 테마 그림으로 갈아 끼운다.
/// 라이트 · 다크 두 장 모두 같은 그림이 되어 기기 밝기와 상관없이 앱 테마로 뜬다. 다음에 켤 때부터 보인다.
/// 공식 기능이 아니라 iOS 판이 바뀌면 안 먹을 수 있다 — 실패하면 아무것도 안 하고 예전처럼 기기 밝기로 뜬다.
/// '자동'으로 돌리면 바꿔 둔 파일을 지운다(iOS 가 스토리보드에서 다시 찍는다). 앱을 새로 깔면 iOS 가 새로 찍어 지문이 달라져 다시 칠한다.
enum LaunchSnapshot {
    /// 마지막으로 칠한 테마 + 파일 지문 — 같으면 다시 안 칠한다(앱을 켤 때마다 불린다)
    private static let doneKey = "bullpen-launch-snapshot"
    /// 네이비 바탕 — lib/ui.ts page(navy) · LaunchStyleSubscriber 와 같은 값
    private static let navy = UIColor(red: 11 / 255, green: 18 / 255, blue: 32 / 255, alpha: 1)

    static func refresh(_ pick: String) {
        DispatchQueue.main.async {
            let files = snapshotFiles()
            guard !files.isEmpty else { return }
            let defaults = UserDefaults.standard
            if defaults.string(forKey: doneKey) == signature(pick, files) { return }
            if pick == "system" {
                /* 우리가 칠한 적이 있을 때만 — 지우면 iOS 가 스토리보드(기기 밝기)로 다시 찍는다 */
                guard defaults.string(forKey: doneKey) != nil else { return }
                for f in files { try? FileManager.default.removeItem(at: f) }
                defaults.removeObject(forKey: doneKey)
                return
            }
            /* 그리기(UIKit)는 여기 메인에서, 압축 · 쓰기는 뒤에서 */
            let jobs: [(URL, CFString, CGImage)] = files.compactMap { url in
                guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
                      let type = CGImageSourceGetType(src),
                      let old = CGImageSourceCreateImageAtIndex(src, 0, nil),
                      let img = render(width: old.width, height: old.height, pick: pick)
                else { return nil }
                return (url, type, img)
            }
            guard jobs.count == files.count else { return }
            DispatchQueue.global(qos: .utility).async {
                let ok = jobs.allSatisfy { write($0.2, to: $0.0, type: $0.1) }
                guard ok else { return }
                DispatchQueue.main.async { defaults.set(signature(pick, snapshotFiles()), forKey: doneKey) }
            }
        }
    }

    private static func snapshotFiles() -> [URL] {
        guard let lib = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return [] }
        let root = lib.appendingPathComponent("SplashBoard/Snapshots", isDirectory: true)
        guard let walk = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey]) else { return [] }
        return walk.compactMap { $0 as? URL }.filter { ["ktx", "png", "jpeg", "jpg"].contains($0.pathExtension.lowercased()) }
    }

    private static func signature(_ pick: String, _ files: [URL]) -> String {
        let parts = files.map { url -> String in
            let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? Int) ?? 0
            return "\(url.lastPathComponent):\(size)"
        }
        return pick + "|" + parts.sorted().joined(separator: ",")
    }

    /// 시작 스토리보드를 그 테마로 그린다 — 가로로 찍힌 그림(아이패드)은 가로로
    private static func render(width: Int, height: Int, pick: String) -> CGImage? {
        let name = Bundle.main.object(forInfoDictionaryKey: "UILaunchStoryboardName") as? String ?? "SplashScreen"
        guard let view = UIStoryboard(name: name, bundle: .main).instantiateInitialViewController()?.view else { return nil }
        let screen = UIScreen.main.bounds.size
        let long = max(screen.width, screen.height)
        let points = width > height ? long : min(screen.width, screen.height)
        let scale = CGFloat(width) / points
        let size = CGSize(width: CGFloat(width) / scale, height: CGFloat(height) / scale)
        let traits = UITraitCollection(userInterfaceStyle: pick == "light" ? .light : .dark)
        view.overrideUserInterfaceStyle = pick == "light" ? .light : .dark
        view.frame = CGRect(origin: .zero, size: size)
        view.setNeedsLayout()
        view.layoutIfNeeded()
        /* 창 밖의 뷰라 색 · 그림을 그 테마로 직접 풀어 둔다. 네이비는 다크 바탕을 네이비로 */
        func resolve(_ v: UIView) {
            if let bg = v.backgroundColor {
                let c = bg.resolvedColor(with: traits)
                v.backgroundColor = pick == "navy" && c.cgColor.alpha > 0.99 ? navy : c
            }
            if let iv = v as? UIImageView, let asset = iv.image?.imageAsset { iv.image = asset.image(with: traits) }
            v.subviews.forEach(resolve)
        }
        resolve(view)
        let format = UIGraphicsImageRendererFormat()
        format.scale = scale
        format.opaque = true
        return UIGraphicsImageRenderer(size: size, format: format).image { ctx in view.layer.render(in: ctx.cgContext) }.cgImage
    }

    /// 같은 형식으로 옆에 쓰고 바꿔 끼운다 — 쓰다 끊겨도 반쯤 쓴 그림이 남지 않게
    private static func write(_ image: CGImage, to url: URL, type: CFString) -> Bool {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("launch-\(UUID().uuidString)")
        guard let dest = CGImageDestinationCreateWithURL(tmp as CFURL, type, 1, nil) else { return false }
        CGImageDestinationAddImage(dest, image, nil)
        guard CGImageDestinationFinalize(dest) else { return false }
        do {
            _ = try FileManager.default.replaceItemAt(url, withItemAt: tmp)
            return true
        } catch {
            try? FileManager.default.removeItem(at: tmp)
            return false
        }
    }
}
