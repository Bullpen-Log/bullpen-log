import ImageIO
import UIKit

/// 앱을 켤 때 iOS 가 맨 먼저 그리는 시작 화면을 앱 테마 색으로(2026-10-22 김민: "네이비인데 처음에 흰색이 떴다가 네이비로 바뀐다").
///
/// 그 첫 장면은 우리 코드가 돌기 전에 iOS 가 그린다 — 시작 스토리보드를 미리 찍어 둔 그림(Library/SplashBoard/Snapshots 의 라이트 · 다크
/// 두 장)이고, 기기 밝기만 따른다. 공식 길이 없어, 테마가 정해지면 그 그림 파일을 같은 크기 · 같은 형식(ATX/KTX)의 테마 그림으로 갈아 끼운다.
/// 라이트 · 다크 두 장 모두 같은 그림이 되어 기기 밝기와 상관없이 앱 테마로 뜬다. 다음에 켤 때부터 보인다.
/// 공식 기능이 아니라 iOS 판이 바뀌면 안 먹을 수 있다 — 그래서 셋을 지킨다(2026-10-22 김민: "그 위험을 해결"):
///  ① 쓴 그림을 다시 읽어 크기 · 바탕색이 맞을 때만 바꿔 끼운다(깨진 파일로 검은 시작 화면이 되지 않게)
///  ② iOS 가 우리 그림을 또 되돌리면(지문이 바뀜) 세다가 두 번이면 그 iOS 판에서는 그만둔다(판이 바뀌면 다시 해 본다)
///  ③ 안 먹었으면(iOS 가 보인 그림이 테마 색이 아니면) LaunchStyleSubscriber 가 그 그림을 덮었다가 앱이 화면에 뜬 뒤 스르르 걷는다
/// '자동'으로 돌리면 바꿔 둔 파일을 지운다(iOS 가 스토리보드에서 다시 찍는다). 앱을 새로 깔면 iOS 가 새로 찍어 지문이 달라져 다시 칠한다.
enum LaunchSnapshot {
    /// 마지막으로 칠한 테마 + 파일 지문 — 같으면 다시 안 칠한다(앱을 켤 때마다 불린다)
    private static let doneKey = "bullpen-launch-snapshot"
    /// iOS 가 우리 그림을 되돌린 횟수 · 그 iOS 판 — 두 번이면 그 판에서는 그만둔다
    private static let revertKey = "bullpen-launch-snapshot-reverts"
    private static let maxReverts = 2

    /**
     * 이번 시작에 iOS 가 보인 그림 — 기록으로 짐작하지 않고 파일을 그대로 읽는다(2026-10-23 김민 녹화: 우회는 먹어 네이비로 떴는데
     * 기록 짐작이 틀려 흰 덮개를 얹어 흰색이 한 번 번쩍였다). 기기가 라이트면 두 장 중 밝은 쪽, 다크면 어두운 쪽 — 안 칠한 두 장(라이트 · 다크),
     * 다 칠한 두 장(같은 그림), 한 장만 칠한 경우 모두 iOS 가 고른 그림과 같다(네이비는 검정보다 밝고 라이트보다 어둡다).
     */
    static func shownImage() -> CGImage? {
        let images = snapshotFiles().compactMap { url -> (CGImage, Int)? in
            guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
                  let img = CGImageSourceCreateImageAtIndex(src, 0, nil),
                  let c = corner(img)
            else { return nil }
            return (img, c.reduce(0) { $0 + Int($1) })
        }
        let light = UIScreen.main.traitCollection.userInterfaceStyle != .dark
        return (light ? images.max { $0.1 < $1.1 } : images.min { $0.1 < $1.1 })?.0
    }
    /// 네이비 바탕 — lib/ui.ts page(navy) · LaunchStyleSubscriber 와 같은 값
    private static let navy = UIColor(red: 11 / 255, green: 18 / 255, blue: 32 / 255, alpha: 1)

    /// 칠하는 중이면 끝난 뒤 마지막으로 고른 것으로 한 번 더 — 둘이 겨루면 늦게 끝난 쪽(흰 그림)이 네이비를 덮었다(2026-10-23)
    private static var busy = false
    private static var pending: String?

    static func refresh(_ pick: String) {
        DispatchQueue.main.async {
            if busy { pending = pick } else { paint(pick) }
        }
    }

    private static func finish() {
        busy = false
        if let next = pending {
            pending = nil
            paint(next)
        }
    }

    private static func paint(_ pick: String) {
        let files = snapshotFiles()
        guard !files.isEmpty else { return }
        let defaults = UserDefaults.standard
        let done = defaults.string(forKey: doneKey)
        if done == signature(pick, files) { return }
        /* 같은 테마로 칠했는데 지문이 바뀌었다 = iOS 가 되돌렸다. 이 iOS 판에서 두 번이면 그만둔다 */
        /* 판 = iOS 판 + 앱 빌드 — 앱을 새로 깔면 iOS 가 새로 찍는 것도 '되돌림'이라, 빌드가 바뀌면 다시 센다 */
        let os = UIDevice.current.systemVersion + "|" + (Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "")
        var reverts = defaults.dictionary(forKey: revertKey) as? [String: Int] ?? [:]
        if let done, done.hasPrefix(pick + "|") { reverts[os, default: 0] += 1; defaults.set(reverts, forKey: revertKey) }
        if reverts[os, default: 0] >= maxReverts { return }
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
        busy = true
        DispatchQueue.global(qos: .utility).async {
            /* 모두 옆에 써서 다 맞을 때만 한꺼번에 바꿔 끼운다 — 한 장만 바뀌어 라이트 · 다크가 엇갈리지 않게 */
            let staged = jobs.compactMap { job in stage(job.2, type: job.1).map { (job.0, $0) } }
            guard staged.count == jobs.count else {
                staged.forEach { try? FileManager.default.removeItem(at: $0.1) }
                return DispatchQueue.main.async(execute: finish)
            }
            for (url, tmp) in staged {
                if (try? FileManager.default.replaceItemAt(url, withItemAt: tmp)) == nil { try? FileManager.default.removeItem(at: tmp) }
            }
            DispatchQueue.main.async {
                defaults.set(signature(pick, snapshotFiles()), forKey: doneKey)
                finish()
            }
        }
    }

    private static func snapshotFiles() -> [URL] {
        guard let lib = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask).first else { return [] }
        let root = lib.appendingPathComponent("SplashBoard/Snapshots", isDirectory: true)
        guard let walk = FileManager.default.enumerator(at: root, includingPropertiesForKeys: [.isRegularFileKey]) else { return [] }
        /* 시작 화면 묶음({DEFAULT GROUP})만 — 앱 전환기 그림(sceneID:… 폴더)은 건드리지 않는다 */
        return walk.compactMap { $0 as? URL }.filter {
            $0.deletingLastPathComponent().lastPathComponent.hasSuffix("{DEFAULT GROUP}")
                && ["ktx", "png", "jpeg", "jpg"].contains($0.pathExtension.lowercased())
        }
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

    /// 같은 형식으로 옆에 쓰고 다시 읽어 맞는지 본다 — 맞으면 그 임시 파일, 아니면 nil(원래 그림은 그대로)
    private static func stage(_ image: CGImage, type: CFString) -> URL? {
        let tmp = FileManager.default.temporaryDirectory.appendingPathComponent("launch-\(UUID().uuidString)")
        guard let dest = CGImageDestinationCreateWithURL(tmp as CFURL, type, 1, nil) else { return nil }
        CGImageDestinationAddImage(dest, image, nil)
        guard CGImageDestinationFinalize(dest), readsBack(tmp, like: image) else {
            try? FileManager.default.removeItem(at: tmp)
            return nil
        }
        return tmp
    }

    /// 쓴 파일을 다시 풀어 크기와 모서리 바탕색이 그린 그림과 같은지(글자 · 그림이 없는 곳이라 바탕만 본다)
    private static func readsBack(_ url: URL, like image: CGImage) -> Bool {
        guard let src = CGImageSourceCreateWithURL(url as CFURL, nil),
              let back = CGImageSourceCreateImageAtIndex(src, 0, nil),
              back.width == image.width, back.height == image.height,
              let a = corner(back), let b = corner(image)
        else { return false }
        return zip(a, b).allSatisfy { abs(Int($0) - Int($1)) <= 12 }
    }

    static func corner(_ image: CGImage) -> [UInt8]? {
        var px = [UInt8](repeating: 0, count: 4)
        let ok = px.withUnsafeMutableBytes { buf -> Bool in
            guard let ctx = CGContext(data: buf.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4,
                                      space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)
            else { return false }
            /* 왼쪽 위에서 조금 안쪽 한 점 */
            ctx.draw(image, in: CGRect(x: -20, y: -CGFloat(image.height) + 21, width: CGFloat(image.width), height: CGFloat(image.height)))
            return true
        }
        return ok ? Array(px.prefix(3)) : nil
    }
}
