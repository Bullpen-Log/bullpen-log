import UIKit
import WebKit
import Capacitor

/// 앱의 첫 화면 — Capacitor 화면(사이트를 여는 웹뷰) 위에 시작 연출 판(IntroOverlay)을 얹는다.
///
/// 아이폰은 앱 코드가 돌기 전에 시작 화면(LaunchScreen — 한가운데 큰 B 그림 한 장)을 띄운다. 그 그림이
/// 걷히는 첫 장면에 이 판이 똑같은 B 를 그려 두었다가 곧바로 움직인다 — 넷플릭스 'N' 처럼 사이트를
/// 기다리지 않는다(2026-09-30 사용자). 사이트는 그동안 판 뒤에서 불러오고, 첫 화면을 다 그렸다고
/// 알려 오면(lib/native-app.ts) 판이 걷힌다.
///
/// SceneDelegate.swift 가 이 화면을 창의 첫 화면으로 쓴다.
class MainViewController: CAPBridgeViewController {
    private weak var intro: IntroOverlay?
    private var introShowing = true

    override func capacitorDidLoad() {
        super.capacitorDidLoad()
        // 사이트가 첫 화면을 다 그렸다는 알림을 받을 곳 — 사이트는 window.webkit.messageHandlers.bullpenIntro 로 보낸다
        webView?.configuration.userContentController.add(self, name: IntroOverlay.messageName)
        // 구속 측정의 일반 · 광각 동시 촬영(DualCameraPlugin.swift) — 앱 안 부품이라 여기서 등록한다
        bridge?.registerPluginInstance(DualCameraPlugin())
        // 화면 켜 두기 · 휴식 끝 알림(BullpenNativePlugin.swift, 사이트 lib/native-bridge.ts)
        bridge?.registerPluginInstance(BullpenNativePlugin())
        // 화면 왼쪽 끝을 밀어 뒤로 — 앱에는 브라우저의 뒤로 단추가 없어, 약관 같은 화면에서 돌아갈 길이 화면 속 단추뿐이었다
        // (2026-10-03 아이폰 점검). 사파리 · 다른 아이폰 앱과 같은 손동작이다
        webView?.allowsBackForwardNavigationGestures = true
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        let overlay = IntroOverlay(frame: view.bounds)
        overlay.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        overlay.onFinish = { [weak self] in
            self?.introShowing = false
            self?.setNeedsStatusBarAppearanceUpdate()
        }
        view.addSubview(overlay)
        intro = overlay
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        intro?.frame = view.bounds
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        intro?.play()
    }

    /// 연출 판은 늘 밝다 — 앱 테마가 어두워 사이트가 흰 시계 글자를 청해도 판이 걷힐 때까지는 검은 글자
    override var preferredStatusBarStyle: UIStatusBarStyle {
        return introShowing ? .darkContent : super.preferredStatusBarStyle
    }
}

extension MainViewController: WKScriptMessageHandler {
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        intro?.pageReady()
    }
}

/// 시작 연출 판 — 큰 B 가 부드럽게 작아지며 이름의 첫 글자 자리로 가고, 자리에 닿을 무렵부터 'ULLPEN LOG' 의
/// 글자가 U → L → L → P → E → N → L → O → G 순서로 하나씩 연하게 나타나 진해지며 살짝 밀려 나온다. 글자는 B 끝 자리의
/// 오른쪽에만 보이는 창 안에 있고 B 보다 아래 층이라 B 와 겹쳐 보이지 않는다. 다 나온 뒤 사이트가 준비되면
/// (pageReady) 옅어지며 살짝 다가오듯 커져 걷힌다. 튀는 움직임(작아졌다 커졌다)은 넣지 않는다(2026-09-30 사용자).
final class IntroOverlay: UIView {
    static let messageName = "bullpenIntro"

    // 시작 화면 그림 — mobile/scripts/make-ios-assets.mjs. 2732px 네모를 가운데 기준으로 화면에 꽉 차게
    // 보이고(긴 변이 그림 한 변), 한가운데 B 높이가 437px 이다. 이 판의 첫 장면이 그 그림과 똑같아야
    // 넘어가는 순간이 안 보인다.
    private static let splashSidePx: CGFloat = 2732
    private static let splashMarkPx: CGFloat = 437
    // B 그림의 칸 — components/logo.tsx 의 MARK_VIEWBOX(594 × 613)
    private static let markUnits = CGSize(width: 594, height: 613)
    // 글자 그림(IntroWord) 둘레의 빈자리 — B 높이에 대한 비율. make-ios-assets.mjs 의 WORD_PAD 와 같아야 한다
    private static let wordPad: CGFloat = 0.05

    // app/globals.css 의 밝은 바탕(--color-page) · 로고 파랑(--color-brand)
    private static let paper = UIColor(red: 244 / 255, green: 247 / 255, blue: 251 / 255, alpha: 1)
    private static let brand = UIColor(red: 2 / 255, green: 151 / 255, blue: 228 / 255, alpha: 1)

    // 움직임의 때(초) — 앱이 보인 뒤부터. 처음 큰 B 를 0.4초 보인 뒤 1초 동안 제자리로 가고, 닿을 무렵(1.25초)부터
    // 글자가 0.075초 간격으로 하나씩 0.65초 동안 연하게 나타나 진해진다(마지막 G 는 2.5초에 다 나온다).
    // (2026-09-30 사용자: "아주 조금만 느리게, 처음 B 도 조금만 더 길게" · "글자 앞쪽이 작아지는 B 와 겹쳐 나온다 —
    // 뒤에서 나오게" · "흐렸다가 진해지게" · "전체가 한꺼번에 연하게 말고 글자별로 나오는 순서에 따라"
    // — 단어 통째로 끌려 나오게 했을 땐 기계 같았고, 통째로 옅어졌다 진해지게 했을 땐 한 덩어리로 보였다)
    private static let markStart: TimeInterval = 0.4
    private static let markDuration: TimeInterval = 1.0
    private static let wordStart: TimeInterval = 1.25
    /// 글자 하나가 연하게 나타나 진해지는 시간 · 다음 글자가 뒤따르는 간격
    private static let letterDuration: TimeInterval = 0.65
    private static let letterStagger: TimeInterval = 0.075
    /// 글자가 밀려 나오는 거리 — 대문자 높이의 배수. 첫 글자 U 는 이만큼 B 뒤에서 나온다
    private static let letterSlide: CGFloat = 0.35
    private static let settleAt: TimeInterval = 2.9
    private static let leaveDuration: TimeInterval = 0.55
    /// 사이트가 끝내 알려 오지 않아도 이때는 걷는다 — 판이 사이트를 가린 채 남지 않게
    private static let giveUpAt: TimeInterval = 10

    /// 판이 걷히고 나서 부른다
    var onFinish: (() -> Void)?

    private let stage = UIView()
    private let mark = UIView()
    private let markShape = CAShapeLayer()
    private let wordImage = UIImage(named: "IntroWord")
    /// 글자가 보이는 창 — B 끝 자리의 오른쪽 끝부터 오른쪽만. 글자는 처음에 조금 왼쪽(B 뒤)에서 투명하게 기다린다
    private let wordWindow = UIView()
    /// 창의 왼쪽 가장자리를 옅게 — 글자가 B 뒤에서 나올 때 칼로 자른 듯 끊겨 보이지 않게
    private let edgeFade = CAGradientLayer()
    /// 글자 하나하나(U · L · L · P · E · N · L · O · G)의 칸 — 칸마다 제 글자 범위만 보이게 자르고 같은 글자 그림을 넣는다
    private var letterCells: [UIView] = []
    /// 글자 그림 속 글자마다의 가로 범위(그림 폭에 대한 비율) — 그림을 한 번 읽어 찾는다
    private lazy var letterRanges: [(CGFloat, CGFloat)] = IntroOverlay.letterBounds(of: self.wordImage)
    /// 글자들이 나오는 움직임 — 끝날 때까지 붙들어 둔다
    private var letterReveals: [UIViewPropertyAnimator] = []

    private var started = false
    private var settled = false
    private var ready = false
    private var leaving = false

    override init(frame: CGRect) {
        super.init(frame: frame)
        backgroundColor = Self.paper
        isAccessibilityElement = true
        accessibilityLabel = "Bullpen Log"

        stage.frame = bounds
        stage.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        addSubview(stage)

        // 글자 창을 먼저(아래 층), B 를 나중에(위 층) — 혹시 둘이 닿아도 B 가 글자 위에 그려진다
        edgeFade.startPoint = CGPoint(x: 0, y: 0.5)
        edgeFade.endPoint = CGPoint(x: 1, y: 0.5)
        edgeFade.colors = [UIColor.clear.cgColor, UIColor.black.cgColor, UIColor.black.cgColor]
        wordWindow.layer.mask = edgeFade
        stage.addSubview(wordWindow)

        markShape.fillColor = Self.brand.cgColor
        mark.layer.addSublayer(markShape)
        stage.addSubview(mark)
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        // 손으로 만든 층은 1배로 그려진다 — 화면 배율에 맞춰야 B 와 가리개 가장자리가 흐리지 않다
        let scale = traitCollection.displayScale
        guard window != nil, scale > 0 else { return }
        markShape.contentsScale = scale
        edgeFade.contentsScale = scale
    }

    /// 자리 계산 — 시작 장면(큰 B)과 끝 장면(가운데에 [B]ULLPEN LOG).
    private struct Layout {
        /// 시작 장면의 B 높이
        var bigHeight: CGFloat
        /// 끝 장면의 B 높이(= 이름의 대문자 높이)
        var capHeight: CGFloat
        /// 끝 장면의 B 가운데
        var markCenter: CGPoint
        /// 끝 장면의 B 오른쪽 끝 — 글자 창이 여기서 시작한다
        var markRight: CGFloat
        /// 끝 장면의 글자 그림 자리
        var wordFrame: CGRect
    }

    private func layout(for size: CGSize) -> Layout {
        let bigHeight = Self.splashMarkPx * max(size.width, size.height) / Self.splashSidePx
        // 이름의 크기는 사이트 머리의 이름과 같은 비율 — 글자 크기 = 화면 폭의 15%(최대 68pt), 대문자 높이 = 그 0.7
        let cap = 0.7 * min(0.15 * size.width, 68)
        let midY = size.height / 2
        let markWidth = cap * Self.markUnits.width / Self.markUnits.height
        guard let image = wordImage, image.size.width > 0, image.size.height > 0 else {
            // 글자 그림이 없으면 B 만 가운데에서 작아진다
            return Layout(bigHeight: bigHeight, capHeight: cap, markCenter: CGPoint(x: size.width / 2, y: midY),
                          markRight: (size.width + markWidth) / 2, wordFrame: .zero)
        }
        let pad = Self.wordPad * cap
        let wordHeight = cap + 2 * pad
        let wordWidth = wordHeight * image.size.width / image.size.height
        let inkWidth = wordWidth - 2 * pad // B 왼쪽 끝부터 글자 오른쪽 끝까지 — 이것을 가운데에 둔다
        let left = (size.width - inkWidth) / 2
        return Layout(
            bigHeight: bigHeight,
            capHeight: cap,
            markCenter: CGPoint(x: left + markWidth / 2, y: midY),
            markRight: left + markWidth,
            wordFrame: CGRect(x: left - pad, y: midY - wordHeight / 2, width: wordWidth, height: wordHeight)
        )
    }

    override func layoutSubviews() {
        super.layoutSubviews()
        guard !started, bounds.width > 0, bounds.height > 0 else { return }
        let spot = layout(for: bounds.size)

        // 시작 장면 — 시작 화면 그림과 같은 자리 · 같은 크기의 B
        let unit = spot.bigHeight / Self.markUnits.height
        mark.transform = .identity
        mark.bounds = CGRect(x: 0, y: 0, width: Self.markUnits.width * unit, height: spot.bigHeight)
        mark.center = CGPoint(x: bounds.midX, y: bounds.midY)
        var scale = CGAffineTransform(scaleX: unit, y: unit)

        CATransaction.begin()
        CATransaction.setDisableActions(true)
        markShape.frame = mark.bounds
        markShape.path = Self.markPath().copy(using: &scale)
        // 글자 창은 B 끝 자리의 오른쪽 끝부터 글자 그림 오른쪽 끝까지
        let windowLeft = spot.markRight
        wordWindow.frame = CGRect(x: windowLeft, y: spot.wordFrame.minY,
                                  width: max(spot.wordFrame.maxX - windowLeft, 0), height: spot.wordFrame.height)
        placeLetters(wordFrame: spot.wordFrame, windowLeft: windowLeft, slide: Self.letterSlide * spot.capHeight)
        // 옅은 가장자리는 B 와 글자 사이 틈(대문자 높이의 0.1 넘게) 안에서만 — 다 나온 글자는 흐려지지 않는다
        edgeFade.frame = wordWindow.bounds
        let fade = wordWindow.bounds.width > 0 ? 0.08 * spot.capHeight / wordWindow.bounds.width : 0
        edgeFade.locations = [0, NSNumber(value: Double(fade)), 1]
        CATransaction.commit()
    }

    /// 글자 칸들을 끝 자리에 놓는다 — 칸마다 제 글자 범위만 보이게 잘라 같은 글자 그림을 넣고, 처음엔 투명하게 조금 왼쪽에 둔다
    private func placeLetters(wordFrame: CGRect, windowLeft: CGFloat, slide: CGFloat) {
        letterCells.forEach { $0.removeFromSuperview() }
        letterCells = []
        guard let image = wordImage, wordFrame.width > 0 else { return }
        for (start, end) in letterRanges {
            let cell = UIView(frame: CGRect(x: wordFrame.minX - windowLeft + start * wordFrame.width, y: 0,
                                            width: (end - start) * wordFrame.width, height: wordFrame.height))
            cell.clipsToBounds = true
            let picture = UIImageView(image: image)
            picture.contentMode = .scaleToFill
            picture.frame = CGRect(x: -start * wordFrame.width, y: 0, width: wordFrame.width, height: wordFrame.height)
            cell.addSubview(picture)
            cell.alpha = 0
            cell.transform = CGAffineTransform(translationX: -slide, y: 0)
            wordWindow.addSubview(cell)
            letterCells.append(cell)
        }
    }

    /// 움직이기 시작한다 — 화면이 처음 보인 뒤(viewDidAppear) 한 번
    func play() {
        guard !started else { return }
        started = true
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.giveUpAt) { [weak self] in
            self?.settled = true
            self?.pageReady()
        }
        guard !UIAccessibility.isReduceMotionEnabled, bounds.width > 0, bounds.height > 0 else {
            // 움직임 줄이기 — 큰 B 그대로 있다가 사이트가 준비되면 걷힌다
            settled = true
            leaveIfDone()
            return
        }
        let spot = layout(for: bounds.size)

        // 1. 큰 B 가 작아지며 이름의 첫 글자 자리로 — 부드럽게 빨라졌다 느려진다(튀지 않는다)
        let small = spot.capHeight / spot.bigHeight
        UIView.animate(withDuration: Self.markDuration, delay: Self.markStart, options: [.curveEaseInOut], animations: {
            self.mark.center = spot.markCenter
            self.mark.transform = CGAffineTransform(scaleX: small, y: small)
        }, completion: nil)

        // 2. B 가 자리에 닿을 무렵부터 글자가 U → L → … → G 순서로 하나씩, 연하게 나타나 진해지며 살짝 밀려 나온다
        //    — 글자마다 천천히 시작해 부드럽게 멈춘다(CSS 의 ease 와 같은 곡선, 튀지 않는다)
        for (index, cell) in letterCells.enumerated() {
            let reveal = UIViewPropertyAnimator(duration: Self.letterDuration,
                                                controlPoint1: CGPoint(x: 0.25, y: 0.1),
                                                controlPoint2: CGPoint(x: 0.25, y: 1)) {
                cell.alpha = 1
                cell.transform = .identity
            }
            reveal.startAnimation(afterDelay: Self.wordStart + Double(index) * Self.letterStagger)
            letterReveals.append(reveal)
        }

        // 3. 다 나온 모습을 잠깐 보인 뒤 — 사이트가 준비됐으면 걷는다(아니면 준비될 때까지 이 모습으로 기다린다)
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleAt) { [weak self] in
            self?.settled = true
            self?.leaveIfDone()
        }
    }

    /// 사이트가 첫 화면을 다 그렸다 — 다 나온 뒤라면 걷는다
    func pageReady() {
        ready = true
        leaveIfDone()
    }

    private func leaveIfDone() {
        guard settled, ready, !leaving else { return }
        leaving = true
        isUserInteractionEnabled = false
        UIView.animate(withDuration: Self.leaveDuration, delay: 0, options: [.curveEaseIn], animations: {
            self.alpha = 0
            self.stage.transform = CGAffineTransform(scaleX: 1.06, y: 1.06)
        }, completion: { _ in
            self.removeFromSuperview()
            self.onFinish?()
        })
    }

    /// 글자 그림에서 글자마다의 가로 범위(그림 폭에 대한 비율)를 찾는다 — 잉크가 있는 세로줄이 이어진 덩어리 하나가
    /// 글자 하나(띄어쓰기는 덩어리가 없어 저절로 빠진다). 이웃 글자와의 경계는 둘 사이 빈틈의 한가운데.
    /// 그림을 못 읽으면 그림 전체를 한 덩어리로 돌려준다(그때는 이름 전체가 한꺼번에 나타난다).
    private static func letterBounds(of image: UIImage?) -> [(CGFloat, CGFloat)] {
        let whole: [(CGFloat, CGFloat)] = [(0, 1)]
        guard let cg = image?.cgImage else { return whole }
        let width = cg.width
        let height = cg.height
        guard width > 0, height > 0 else { return whole }
        var pixels = [UInt8](repeating: 0, count: width * height * 4)
        let drawn = pixels.withUnsafeMutableBytes { raw -> Bool in
            guard let context = CGContext(data: raw.baseAddress, width: width, height: height, bitsPerComponent: 8,
                                          bytesPerRow: width * 4, space: CGColorSpaceCreateDeviceRGB(),
                                          bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue) else { return false }
            context.draw(cg, in: CGRect(x: 0, y: 0, width: width, height: height))
            return true
        }
        guard drawn else { return whole }

        var runs: [(Int, Int)] = []
        var runStart = -1
        for x in 0..<width {
            var ink = false
            for y in 0..<height where pixels[(y * width + x) * 4 + 3] > 40 {
                ink = true
                break
            }
            if ink && runStart < 0 {
                runStart = x
            } else if !ink && runStart >= 0 {
                runs.append((runStart, x))
                runStart = -1
            }
        }
        if runStart >= 0 {
            runs.append((runStart, width))
        }
        guard !runs.isEmpty else { return whole }

        var bounds: [(CGFloat, CGFloat)] = []
        for (index, run) in runs.enumerated() {
            let left = index == 0 ? 0 : (runs[index - 1].1 + run.0) / 2
            let right = index == runs.count - 1 ? width : (run.1 + runs[index + 1].0) / 2
            bounds.append((CGFloat(left) / CGFloat(width), CGFloat(right) / CGFloat(width)))
        }
        return bounds
    }

    /// B — components/logo.tsx 의 MARK_PATH 를 그대로 옮겼다(594 × 613 칸). 두 반원은 타원의 반쪽이다.
    private static func markPath() -> CGPath {
        let path = CGMutablePath()
        path.addRect(CGRect(x: 0, y: 0, width: 237, height: 613))
        // 위 반원 — M281 0 H453 A125 141 0 0 1 453 282 H281 Z
        path.move(to: CGPoint(x: 281, y: 0))
        path.addLine(to: CGPoint(x: 453, y: 0))
        path.addArc(center: .zero, radius: 1, startAngle: -.pi / 2, endAngle: .pi / 2, clockwise: false,
                    transform: CGAffineTransform(a: 125, b: 0, c: 0, d: 141, tx: 453, ty: 141))
        path.addLine(to: CGPoint(x: 281, y: 282))
        path.closeSubpath()
        // 아래 반원 — M281 329 H470 A124 142 0 0 1 470 613 H281 Z
        path.move(to: CGPoint(x: 281, y: 329))
        path.addLine(to: CGPoint(x: 470, y: 329))
        path.addArc(center: .zero, radius: 1, startAngle: -.pi / 2, endAngle: .pi / 2, clockwise: false,
                    transform: CGAffineTransform(a: 124, b: 0, c: 0, d: 142, tx: 470, ty: 471))
        path.addLine(to: CGPoint(x: 281, y: 613))
        path.closeSubpath()
        return path
    }
}
