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

/// 시작 연출 판 — 큰 B 가 부드럽게 작아지며 이름의 첫 글자 자리로 가고, 'ULLPEN LOG' 가 B 뒤에서 왼쪽부터
/// 스르르 펼쳐진다. 다 펼친 뒤 사이트가 준비되면(pageReady) 옅어지며 살짝 다가오듯 커져 걷힌다.
/// 튀는 움직임(작아졌다 커졌다)은 넣지 않는다(2026-09-30 사용자).
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

    // 움직임의 때(초) — 앱이 보인 뒤부터. 처음 큰 B 를 0.4초 보인 뒤 움직이고, 움직임은 조금 느긋하게
    // (2026-09-30 사용자: "아주 조금만 느리게, 처음 B 도 조금만 더 길게" — 예전 0.1 · 0.8 · 0.55 · 0.9 · 1.8 · 걷힘 0.45)
    private static let markStart: TimeInterval = 0.4
    private static let markDuration: TimeInterval = 1.0
    private static let wordStart: TimeInterval = 0.95
    private static let wordDuration: TimeInterval = 1.1
    private static let settleAt: TimeInterval = 2.45
    private static let leaveDuration: TimeInterval = 0.55
    /// 사이트가 끝내 알려 오지 않아도 이때는 걷는다 — 판이 사이트를 가린 채 남지 않게
    private static let giveUpAt: TimeInterval = 10

    /// 판이 걷히고 나서 부른다
    var onFinish: (() -> Void)?

    private let stage = UIView()
    private let mark = UIView()
    private let markShape = CAShapeLayer()
    private let word = UIImageView(image: UIImage(named: "IntroWord"))
    /// 글자를 가리는 가리개 — 왼쪽은 보이고 오른쪽은 가리는 부드러운 띠. 오른쪽으로 밀면 글자가 펼쳐진다
    private let wipe = CAGradientLayer()

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

        markShape.fillColor = Self.brand.cgColor
        mark.layer.addSublayer(markShape)
        stage.addSubview(mark)

        word.contentMode = .scaleToFill
        word.alpha = 0
        wipe.startPoint = CGPoint(x: 0, y: 0.5)
        wipe.endPoint = CGPoint(x: 1, y: 0.5)
        wipe.colors = [UIColor.black.cgColor, UIColor.black.cgColor, UIColor.clear.cgColor, UIColor.clear.cgColor]
        wipe.locations = [0, 0.6, 0.7, 1]
        word.layer.mask = wipe
        stage.addSubview(word)
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
        wipe.contentsScale = scale
    }

    /// 자리 계산 — 시작 장면(큰 B)과 끝 장면(가운데에 [B]ULLPEN LOG).
    private struct Layout {
        /// 시작 장면의 B 높이
        var bigHeight: CGFloat
        /// 끝 장면의 B 높이(= 이름의 대문자 높이)
        var capHeight: CGFloat
        /// 끝 장면의 B 가운데
        var markCenter: CGPoint
        /// 끝 장면의 글자 그림 자리
        var wordFrame: CGRect
    }

    private func layout(for size: CGSize) -> Layout {
        let bigHeight = Self.splashMarkPx * max(size.width, size.height) / Self.splashSidePx
        // 이름의 크기는 사이트 머리의 이름과 같은 비율 — 글자 크기 = 화면 폭의 15%(최대 68pt), 대문자 높이 = 그 0.7
        let cap = 0.7 * min(0.15 * size.width, 68)
        let midY = size.height / 2
        guard let image = word.image, image.size.width > 0, image.size.height > 0 else {
            // 글자 그림이 없으면 B 만 가운데에서 작아진다
            return Layout(bigHeight: bigHeight, capHeight: cap,
                          markCenter: CGPoint(x: size.width / 2, y: midY), wordFrame: .zero)
        }
        let pad = Self.wordPad * cap
        let wordHeight = cap + 2 * pad
        let wordWidth = wordHeight * image.size.width / image.size.height
        let inkWidth = wordWidth - 2 * pad // B 왼쪽 끝부터 글자 오른쪽 끝까지 — 이것을 가운데에 둔다
        let left = (size.width - inkWidth) / 2
        let markWidth = cap * Self.markUnits.width / Self.markUnits.height
        return Layout(
            bigHeight: bigHeight,
            capHeight: cap,
            markCenter: CGPoint(x: left + markWidth / 2, y: midY),
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
        // 글자는 끝 자리에 두고 가리개로 숨겨 둔다
        word.transform = .identity
        word.frame = spot.wordFrame
        let width = spot.wordFrame.width
        wipe.bounds = CGRect(x: 0, y: 0, width: 3 * width, height: spot.wordFrame.height)
        wipe.position = CGPoint(x: Self.hiddenWipeX(width), y: spot.wordFrame.height / 2)
        CATransaction.commit()
    }

    // 가리개 띠(글자 폭의 3배)의 가운데 자리 — 보이는 부분(왼쪽 60%)이 글자 왼쪽 끝 밖에 있을 때와 글자 전체를 덮을 때
    private static func hiddenWipeX(_ width: CGFloat) -> CGFloat { return -0.6 * width }
    private static func shownWipeX(_ width: CGFloat) -> CGFloat { return 0.7 * width }

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

        // 2. ULLPEN LOG 가 B 뒤에서 왼쪽부터 스르르 — 가리개가 오른쪽으로 걷히며 글자가 조금 따라 들어온다
        if word.image != nil {
            let width = spot.wordFrame.width
            word.transform = CGAffineTransform(translationX: -0.35 * spot.capHeight, y: 0)
            UIView.animate(withDuration: Self.wordDuration, delay: Self.wordStart, options: [.curveEaseOut], animations: {
                self.word.alpha = 1
                self.word.transform = .identity
            }, completion: nil)

            let reveal = CABasicAnimation(keyPath: "position.x")
            reveal.fromValue = Self.hiddenWipeX(width)
            reveal.toValue = Self.shownWipeX(width)
            reveal.beginTime = CACurrentMediaTime() + Self.wordStart
            reveal.duration = Self.wordDuration
            reveal.timingFunction = CAMediaTimingFunction(name: .easeOut)
            reveal.fillMode = .backwards
            CATransaction.begin()
            CATransaction.setDisableActions(true)
            wipe.position.x = Self.shownWipeX(width)
            CATransaction.commit()
            wipe.add(reveal, forKey: "reveal")
        }

        // 3. 다 펼친 모습을 잠깐 보인 뒤 — 사이트가 준비됐으면 걷는다(아니면 준비될 때까지 이 모습으로 기다린다)
        DispatchQueue.main.asyncAfter(deadline: .now() + Self.settleAt) { [weak self] in
            self?.settled = true
            self?.leaveIfDone()
        }
    }

    /// 사이트가 첫 화면을 다 그렸다 — 다 펼친 뒤라면 걷는다
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
