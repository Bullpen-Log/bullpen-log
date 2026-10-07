import AVFoundation
import Capacitor
import simd
import UIKit
import UniformTypeIdentifiers
import WebKit

/// 앱 카메라 — 구속 측정을 앱이 직접 잡은 카메라로 한다(사이트 lib/dual-camera.ts). 처음엔 '광각 영상도 같이 저장'용
/// 일반 · 광각 동시 촬영이었고(2026-10-03), 2026-10-08 부터는 광각 없이 일반 카메라 하나로도 켠다(start 의 wide: false —
/// 모든 아이폰). 사용자: "웹카메라가 아닌 앱 자체의 카메라로" — 웹 카메라(getUserMedia)는 손떨림 보정을 켤 수 없다.
///
/// 웹 화면(앱 안의 웹뷰도)은 카메라를 한 번에 하나만 켠다 — 두 번째를 켜면 앞의 카메라가 멈춘다(WebKit). 그래서 이
/// 부품이 앱에서 카메라를 직접 잡는다(광각도 같이면 AVCaptureMultiCamSession — iPhone 11 이후). 측정은 일반 카메라로 한다.
///
/// 일반 카메라에는 표준 손떨림 보정을 건다 — 화면 가장자리를 잘라 화각이 좁아지므로, 클립의 화각은 렌즈 값(intrinsics)이 오면
/// 그것, 안 오면 자른 몫을 짐작한 값이다(fovSource 'intrinsics' · 'estimate' · 보정이 꺼졌으면 'format').
///
/// 측정용 장면을 웹으로 실시간(초당 60장) 넘기지 않는다 — 그 길이 충분히 빠를지 알 수 없어서다. 대신
///   1. 두 카메라를 1초 조각(fMP4)으로 이어 녹화해 최근 8초를 쥐고 있다(SegmentRecorder)
///   2. 일반 카메라 장면의 움직임으로 던짐을 알아채 사이트에 알린다(MotionTrigger → 'throw' 알림, 시각 atSec)
///   3. 사이트가 clip({ atSec }) 으로 청하면 그 앞뒤를 두 카메라 다 잘라 파일로 넘긴다(read 로 조금씩 읽어 간다)
///   4. 사이트는 일반 카메라 클립을 영상 파일 엔진(lib/velocity-engine/analyze-video.ts)으로 잰다 — 보정을 마친 길이다
/// 그래서 결과는 던진 뒤 1~3초에 뜬다(카메라 실시간보다 늦다). 클립의 fps · 화각(videoFieldOfView)은 여기서 알려 준다.
///
/// 미리보기(뷰파인더)는 앱이 웹뷰 뒤에 그린다 — 웹뷰를 투명하게 하고 setPreview 의 자리(CSS px)에 둔다. 사이트는 그 자리를
/// 비워(투명) 존 · 안내만 위에 그린다. 사이트가 쓰던 웹 카메라(getUserMedia)는 start 전에 꺼야 한다(같은 카메라를 둘이 못 쓴다).
///
/// 부르는 법(사이트, window.Capacitor.nativePromise('DualCamera', …)):
///   status()                                    → { supported, reason?, modes?, single }   modes = [{ short, long, maxFps }](일반 카메라, 16:9)
///                                                  supported · reason 은 광각 동시 촬영: multicam · no-ultrawide · pair · fps(함께 켤 때 60fps 를 못 냄)
///                                                  single = 일반 카메라 하나로 60fps 를 낼 수 있다(이 칸이 있으면 wide · snapshot 을 안다)
///   start({ fps, short?, net, preview, roi, armed, wide? }) → { mainFps, wideFps, mainWidth, mainHeight, wideWidth, wideHeight, mainFovDeg, wideFovDeg, hardwareCost, stabilization }
///                                                  wide 기본 true(옛 사이트) — false 면 일반 카메라만(wideFps · wide* 는 0)
///   setPreview({ x, y, w, h, visible })          미리보기 자리(뷰포트 CSS px)
///   setTrigger({ armed, roi })                   던짐 알아채기 켜기/끄기 · 볼 자리(세로 화면 0~1)
///   clip({ atSec, beforeSec, afterSec })         → { main: Clip, wide: Clip | null }   Clip = { path, eventSec, durationSec, bytes, fps, width, height, fovDeg, fovSource, stabilized }
///   snapshot({ short })                          → { luma(base64, 세로 화면 · 0~255), width, height, sourceWidth, sourceHeight } — 렌즈 보정용 지금 장면
///   (start 의 zoom — 일반 카메라 줌 배율, 기본 1. 걸면 fovDeg 는 줌만큼 좁힌 값)
///   read({ path, offset, length })               → { data(base64), size, eof }
///   discard({ paths })                           다 읽은 클립 파일 지우기
///   stop()
/// 알림: 'throw' { atSec, strength } · 'error' { message }
@objc(DualCameraPlugin)
public class DualCameraPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "DualCameraPlugin"
    public let jsName = "DualCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setTrigger", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clip", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "snapshot", returnType: CAPPluginReturnPromise),
    ]

    private var controller: DualCameraController?
    private weak var previewView: DualPreviewView?
    /// 미리보기를 붙이기 전 웹뷰 모양 — 끄면 되돌린다
    private var savedWebView: (opaque: Bool, background: UIColor?, scrollBackground: UIColor?)?
    /// 넘겨준 클립 파일 — read · discard 는 이것만 받는다(다른 파일을 읽히지 않게)
    private var issued = Set<String>()
    private let issuedLock = NSLock()

    deinit {
        controller?.stop()
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(DualCameraController.probe())
    }

    @objc func start(_ call: CAPPluginCall) {
        switch AVCaptureDevice.authorizationStatus(for: .video) {
        case .authorized:
            begin(call)
        case .notDetermined:
            AVCaptureDevice.requestAccess(for: .video) { [weak self] granted in
                if granted {
                    self?.begin(call)
                } else {
                    call.reject("카메라를 쓸 수 없어요. 설정에서 카메라를 허락해 주세요.", "denied")
                }
            }
        default:
            call.reject("카메라를 쓸 수 없어요. 설정에서 카메라를 허락해 주세요.", "denied")
        }
    }

    private func begin(_ call: CAPPluginCall) {
        controller?.stop()
        /* 화면(UIKit)은 주 스레드에서만 — 부품 부름은 다른 줄에서 온다. 새 미리보기는 그 뒤 차례로 붙는다 */
        DispatchQueue.main.async { [weak self] in self?.detachPreview() }
        let config = DualCameraController.Config(
            fps: Int32(max(24, min(240, call.getInt("fps") ?? 60))),
            short: call.getInt("short").map { Int32($0) },
            net: call.getBool("net") ?? false,
            roi: DualCameraPlugin.rect(call.getObject("roi")) ?? MotionTrigger.defaultRoi,
            armed: call.getBool("armed") ?? true,
            zoom: max(1, min(4, call.getDouble("zoom") ?? 1)),
            wide: call.getBool("wide") ?? true
        )
        let preview = DualCameraPlugin.rect(call.getObject("preview"))
        let controller = DualCameraController()
        controller.onThrow = { [weak self] at, strength in
            self?.notifyListeners("throw", data: ["atSec": at, "strength": strength])
        }
        controller.onError = { [weak self] message in
            self?.notifyListeners("error", data: ["message": message])
        }
        self.controller = controller
        controller.start(
            config: config,
            attach: { [weak self] view in self?.attachPreview(view, rect: preview) },
            completion: { [weak self] result in
                switch result {
                case .success(let info):
                    call.resolve(info)
                case .failure(let error):
                    controller.stop()
                    DispatchQueue.main.async { self?.detachPreview() }
                    if self?.controller === controller { self?.controller = nil }
                    call.reject(error.message, error.code)
                }
            }
        )
    }

    @objc func stop(_ call: CAPPluginCall) {
        controller?.stop()
        controller = nil
        DispatchQueue.main.async { [weak self] in
            self?.detachPreview()
            call.resolve()
        }
    }

    @objc func setPreview(_ call: CAPPluginCall) {
        var rect: CGRect?
        if let x = call.getDouble("x"), let y = call.getDouble("y"),
           let w = call.getDouble("w"), let h = call.getDouble("h"), w > 0, h > 0 {
            rect = CGRect(x: x, y: y, width: w, height: h)
        }
        let visible = call.getBool("visible") ?? true
        DispatchQueue.main.async { [weak self] in
            guard let self, let view = self.previewView else {
                call.resolve()
                return
            }
            if let rect, let frame = self.hostFrame(for: rect) { view.frame = frame }
            view.isHidden = !visible
            call.resolve()
        }
    }

    @objc func setTrigger(_ call: CAPPluginCall) {
        controller?.trigger.update(
            armed: call.getBool("armed"),
            roi: DualCameraPlugin.rect(call.getObject("roi"))
        )
        call.resolve()
    }

    @objc func clip(_ call: CAPPluginCall) {
        guard let controller else {
            call.reject("카메라가 꺼져 있어요.", "off")
            return
        }
        guard let at = call.getDouble("atSec") else {
            call.reject("atSec 가 없어요.", "args")
            return
        }
        let before = max(0.1, min(4, call.getDouble("beforeSec") ?? 0.6))
        let after = max(0.3, min(4, call.getDouble("afterSec") ?? 1.4))
        controller.makeClips(at: at, before: before, after: after) { [weak self] result in
            switch result {
            case .success(let clips):
                var out: [String: Any] = ["main": clips.main.json]
                out["wide"] = clips.wide.map { $0.json as Any } ?? NSNull()
                self?.remember([clips.main.path] + (clips.wide.map { [$0.path] } ?? []))
                call.resolve(out)
            case .failure(let error):
                call.reject(error.message, error.code)
            }
        }
    }

    @objc func snapshot(_ call: CAPPluginCall) {
        guard let controller else {
            call.reject("카메라가 꺼져 있어요.", "off")
            return
        }
        let short = max(120, min(1080, call.getInt("short") ?? 720))
        controller.requestSnapshot(short: short) { result in
            if let result {
                call.resolve(result)
            } else {
                call.reject("장면을 받지 못했어요.", "snapshot")
            }
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), isIssued(path) else {
            call.reject("읽을 수 없는 파일이에요.", "path")
            return
        }
        let offset = UInt64(max(0, call.getInt("offset") ?? 0))
        let length = max(1, min(4 * 1024 * 1024, call.getInt("length") ?? 1024 * 1024))
        do {
            let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
            defer { try? handle.close() }
            let size = try handle.seekToEnd()
            try handle.seek(toOffset: min(offset, size))
            let data = try handle.read(upToCount: length) ?? Data()
            call.resolve([
                "data": data.base64EncodedString(),
                "size": Int(size),
                "eof": offset + UInt64(data.count) >= size,
            ])
        } catch {
            call.reject("클립을 읽지 못했어요.", "read")
        }
    }

    @objc func discard(_ call: CAPPluginCall) {
        let paths = call.getArray("paths", String.self) ?? []
        for path in paths where isIssued(path) {
            try? FileManager.default.removeItem(atPath: path)
            issuedLock.lock()
            issued.remove(path)
            issuedLock.unlock()
        }
        call.resolve()
    }

    // MARK: - 미리보기(웹뷰 뒤)

    private func attachPreview(_ view: DualPreviewView, rect: CGRect?) {
        guard let webView = bridge?.webView, let host = webView.superview else { return }
        if savedWebView == nil {
            savedWebView = (webView.isOpaque, webView.backgroundColor, webView.scrollView.backgroundColor)
        }
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        host.insertSubview(view, belowSubview: webView)
        if let rect, let frame = hostFrame(for: rect) {
            view.frame = frame
        } else {
            view.frame = webView.frame
        }
        previewView = view
    }

    private func detachPreview() {
        previewView?.removeFromSuperview()
        previewView = nil
        if let saved = savedWebView, let webView = bridge?.webView {
            webView.isOpaque = saved.opaque
            webView.backgroundColor = saved.background
            webView.scrollView.backgroundColor = saved.scrollBackground
        }
        savedWebView = nil
    }

    /// 뷰포트 CSS px(getBoundingClientRect) → 웹뷰를 품은 화면의 좌표. 웹뷰 확대는 1 이라 CSS px = 포인트
    private func hostFrame(for rect: CGRect) -> CGRect? {
        guard let webView = bridge?.webView, let host = webView.superview else { return nil }
        return webView.convert(rect, to: host)
    }

    // MARK: - 도움

    private func remember(_ paths: [String]) {
        issuedLock.lock()
        paths.forEach { issued.insert($0) }
        issuedLock.unlock()
    }

    private func isIssued(_ path: String) -> Bool {
        issuedLock.lock()
        defer { issuedLock.unlock() }
        return issued.contains(path)
    }

    private static func number(_ value: JSValue?) -> Double? {
        if let v = value as? Double { return v }
        if let v = value as? Int { return Double(v) }
        if let v = value as? NSNumber { return v.doubleValue }
        return nil
    }

    static func rect(_ object: JSObject?) -> CGRect? {
        guard let o = object,
              let x = number(o["x"]), let y = number(o["y"]),
              let w = number(o["w"]), let h = number(o["h"]),
              w > 0, h > 0
        else { return nil }
        return CGRect(x: x, y: y, width: w, height: h)
    }
}

// MARK: - 카메라 둘

struct DualCameraError: Error {
    let code: String
    let message: String

    static func unsupported(_ why: String) -> DualCameraError {
        DualCameraError(code: "unsupported-\(why)", message: "이 아이폰에서는 앱 카메라를 이렇게 켤 수 없어요.")
    }
}

final class DualPreviewView: UIView {
    override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }
    // swiftlint:disable:next force_cast
    var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }
}

/// 잘라 낸 클립 하나
struct DualClip {
    let path: String
    /// 클립 안에서 던짐이 일어난 시각(초)
    let eventSec: Double
    let durationSec: Double
    let bytes: Int
    let fps: Int32
    /// 세로 화면 기준 너비 · 높이(픽셀)
    let width: Int
    let height: Int
    /// 긴 변 방향 화각(도) — 엔진의 '카메라 가로 화각'과 같은 뜻(videoFieldOfView, 손떨림 보정이 자른 만큼 좁힘)
    let fovDeg: Double
    /// 화각을 어디서 얻었나 — intrinsics(렌즈 값) · format(보정 없음) · estimate(보정이 자른 몫을 짐작)
    let fovSource: String
    let stabilized: Bool

    var json: [String: Any] {
        [
            "path": path, "eventSec": eventSec, "durationSec": durationSec, "bytes": bytes,
            "fps": Int(fps), "width": width, "height": height, "fovDeg": fovDeg,
            "fovSource": fovSource, "stabilized": stabilized,
        ]
    }
}

final class DualCameraController: NSObject, AVCaptureVideoDataOutputSampleBufferDelegate {
    struct Config {
        var fps: Int32
        /// 일반 카메라의 짧은 변(720 · 1080 · 2160 …) — 사용자가 고른 화질. nil 이면 1080p 쪽에서 알아서
        var short: Int32?
        var net: Bool
        var roi: CGRect
        var armed: Bool
        /// 일반 카메라의 줌(1 · 2) — 구속 엔진 2.0(거리 자)은 2배로 찍은 영상에 맞췄다(먼 공이 두 배 크기). 광각은 늘 1
        var zoom: Double = 1
        /// 광각도 같이 찍나 — false 면 일반 카메라 하나(AVCaptureSession, 모든 아이폰)
        var wide: Bool = true
    }

    /// 한 카메라의 잡은 모양
    private struct Picked {
        let format: AVCaptureDevice.Format
        let fps: Int32
        let width: Int
        let height: Int
    }

    /// 광각도 같이면 AVCaptureMultiCamSession, 일반만이면 AVCaptureSession — start 가 정한다
    private(set) var session = AVCaptureSession()
    let trigger = MotionTrigger()
    var onThrow: ((Double, Double) -> Void)?
    var onError: ((String) -> Void)?

    private let sessionQueue = DispatchQueue(label: "bullpen.dualcam.session")
    private let mainQueue = DispatchQueue(label: "bullpen.dualcam.main", qos: .userInitiated)
    private let wideQueue = DispatchQueue(label: "bullpen.dualcam.wide", qos: .userInitiated)
    private let clipQueue = DispatchQueue(label: "bullpen.dualcam.clip", qos: .userInitiated)
    private let mainOutput = AVCaptureVideoDataOutput()
    private let wideOutput = AVCaptureVideoDataOutput()
    private let mainRecorder = SegmentRecorder(bitrate: 12_000_000)
    private let wideRecorder = SegmentRecorder(bitrate: 8_000_000)
    private var main: Picked?
    private var wide: Picked?
    private var mainFov: Double = 0
    private var wideFov: Double = 0
    private var observers: [NSObjectProtocol] = []
    private var mainConnection: AVCaptureConnection?
    /// 렌즈 값(intrinsics)으로 구한 일반 카메라의 긴 변 화각 — 안 오면 nil
    private var intrinsicFov: Double?
    private var intrinsicFrames = 0
    private let fovLock = NSLock()
    /// 렌즈 보정용 장면을 기다리는 부름 — 다음 장면에서 풀어 준다
    private var snapshotWaiters: [(short: Int, done: ([String: Any]?) -> Void)] = []
    private let snapshotLock = NSLock()

    /// 표준 손떨림 보정이 잘라 내는 배율(긴 변 tan) — 애플은 밝히지 않는다. 화각이 약 10% 준다고 알려져 있다(VisionCamera
    /// 문서). ponytail: 짐작값 — 렌즈 값이 안 오는 폰에서만 쓴다. 스피드건 짝 · 렌즈 보정(공으로 초점거리 재기)이 쌓이면 맞춘다.
    static let STAB_CROP = 1.1

    /// 이 아이폰이 일반 + 광각을 함께 켤 수 있나 — 되면 일반 카메라로 고를 수 있는 화질(16:9)과 그 최고 fps 도 싣는다.
    /// 측정 카메라는 30fps 이하를 쓰지 않는다(사용자 규칙 2026-10-03) — 함께 켤 때 60fps 를 못 내는 아이폰은 '안 됨'(fps).
    /// single 은 일반 카메라 하나로 1080p 쪽 60fps 를 낼 수 있나(앱 카메라로 재기 — 광각과 상관없이).
    static func probe() -> [String: Any] {
        let (mainDevice, wideDevice) = devices()
        let single = mainDevice.map { device in
            device.formats.contains { format in
                let d = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
                let fps = format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0
                return d.width >= 1280 && d.width <= 1920 && fps >= Double(MIN_MEASURE_FPS)
                    && pixelFormats.contains(CMFormatDescriptionGetMediaSubType(format.formatDescription))
            }
        } ?? false
        guard AVCaptureMultiCamSession.isMultiCamSupported else {
            return ["supported": false, "reason": "multicam", "single": single]
        }
        guard let mainDevice, let wideDevice else {
            return ["supported": false, "reason": "no-ultrawide", "single": single]
        }
        guard pairSupported(mainDevice, wideDevice) else {
            return ["supported": false, "reason": "pair", "single": single]
        }
        let list = modes(mainDevice)
        guard list.contains(where: { ($0["maxFps"] as? Int ?? 0) >= Int(MIN_MEASURE_FPS) }) else {
            return ["supported": false, "reason": "fps", "single": single]
        }
        return ["supported": true, "modes": list, "single": single]
    }

    /// 측정 카메라의 가장 낮은 fps — 이보다 낮으면 켜지 않는다(59.94 를 받게 59)
    static let MIN_MEASURE_FPS: Int32 = 59

    private static let pixelFormats: Set<FourCharCode> = [
        kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
        kCVPixelFormatType_420YpCbCr8BiPlanarFullRange,
    ]

    /// 함께 켤 수 있는 16:9 모양을 짧은 변마다 하나씩 — [{ short, long, maxFps }], 짧은 변 순
    static func modes(_ device: AVCaptureDevice) -> [[String: Any]] {
        var best: [Int32: (long: Int32, fps: Double)] = [:]
        for format in device.formats {
            guard format.isMultiCamSupported,
                  pixelFormats.contains(CMFormatDescriptionGetMediaSubType(format.formatDescription))
            else { continue }
            let d = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            guard d.width >= 1280, Int(d.width) * 9 == Int(d.height) * 16 else { continue }
            let fps = format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0
            if fps > (best[d.height]?.fps ?? 0) { best[d.height] = (d.width, fps) }
        }
        return best.keys.sorted().map { short in
            ["short": Int(short), "long": Int(best[short]!.long), "maxFps": Int(best[short]!.fps.rounded(.down))]
        }
    }

    static func devices() -> (AVCaptureDevice?, AVCaptureDevice?) {
        (
            AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
            AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back)
        )
    }

    static func pairSupported(_ a: AVCaptureDevice, _ b: AVCaptureDevice) -> Bool {
        let discovery = AVCaptureDevice.DiscoverySession(
            deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera],
            mediaType: .video,
            position: .back
        )
        return discovery.supportedMultiCamDeviceSets.contains { $0.contains(a) && $0.contains(b) }
    }

    func start(
        config: Config,
        attach: @escaping (DualPreviewView) -> Void,
        completion: @escaping (Result<[String: Any], DualCameraError>) -> Void
    ) {
        trigger.update(armed: config.armed, roi: config.roi)
        /* 광각도 같이면 두 카메라 세션 — 못 하는 아이폰은 configure 가 '안 됨'(multicam)으로 끝낸다 */
        session = config.wide && AVCaptureMultiCamSession.isMultiCamSupported
            ? AVCaptureMultiCamSession() : AVCaptureSession()
        DispatchQueue.main.async {
            let view = DualPreviewView()
            view.backgroundColor = .black
            view.previewLayer.videoGravity = .resizeAspectFill
            view.previewLayer.setSessionWithNoConnection(self.session)
            attach(view)
            let layer = view.previewLayer
            self.sessionQueue.async {
                do {
                    let info = try self.configure(config: config, previewLayer: layer)
                    self.observe()
                    self.session.startRunning()
                    completion(.success(info))
                } catch let error as DualCameraError {
                    completion(.failure(error))
                } catch {
                    completion(.failure(DualCameraError(code: "start", message: "카메라를 켜지 못했어요. \(error.localizedDescription)")))
                }
            }
        }
    }

    func stop() {
        observers.forEach { NotificationCenter.default.removeObserver($0) }
        observers.removeAll()
        /* 장면을 기다리던 부름은 빈손으로 풀어 준다(카메라가 꺼지면 다음 장면이 안 온다) */
        snapshotLock.lock()
        let waiters = snapshotWaiters
        snapshotWaiters.removeAll()
        snapshotLock.unlock()
        waiters.forEach { $0.done(nil) }
        sessionQueue.async {
            if self.session.isRunning { self.session.stopRunning() }
            self.mainQueue.async { self.mainRecorder.finish() }
            self.wideQueue.async { self.wideRecorder.finish() }
        }
    }

    private func observe() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(
            forName: .AVCaptureSessionRuntimeError, object: session, queue: nil
        ) { [weak self] note in
            let error = note.userInfo?[AVCaptureSessionErrorKey] as? NSError
            self?.onError?("카메라가 멈췄어요. \(error?.localizedDescription ?? "")")
        })
        observers.append(center.addObserver(
            forName: .AVCaptureSessionWasInterrupted, object: session, queue: nil
        ) { [weak self] _ in
            self?.onError?("다른 앱이나 화면이 카메라를 쓰고 있어요.")
        })
    }

    private func configure(config: Config, previewLayer: AVCaptureVideoPreviewLayer) throws -> [String: Any] {
        let multi = session as? AVCaptureMultiCamSession
        if config.wide, multi == nil { throw DualCameraError.unsupported("multicam") }
        let (mainDevice, wideFound) = DualCameraController.devices()
        guard let mainDevice else { throw DualCameraError.unsupported("camera") }
        var wideDevice: AVCaptureDevice?
        if config.wide {
            guard let wideFound else { throw DualCameraError.unsupported("no-ultrawide") }
            guard DualCameraController.pairSupported(mainDevice, wideFound) else { throw DualCameraError.unsupported("pair") }
            wideDevice = wideFound
        }

        session.beginConfiguration()
        defer { session.commitConfiguration() }
        /* 한 카메라 세션은 기기의 activeFormat 을 따르게(기본 preset 이면 켤 때 화질을 덮는다) */
        if multi == nil, session.canSetSessionPreset(.inputPriority) { session.sessionPreset = .inputPriority }

        let mainInput = try AVCaptureDeviceInput(device: mainDevice)
        guard session.canAddInput(mainInput) else { throw DualCameraError.unsupported("inputs") }
        session.addInputWithNoConnections(mainInput)
        var wideInput: AVCaptureDeviceInput?
        if let wideDevice {
            let input = try AVCaptureDeviceInput(device: wideDevice)
            guard session.canAddInput(input) else { throw DualCameraError.unsupported("inputs") }
            session.addInputWithNoConnections(input)
            wideInput = input
        }

        for output in wideDevice == nil ? [mainOutput] : [mainOutput, wideOutput] {
            output.videoSettings = [
                kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange,
            ]
            output.alwaysDiscardsLateVideoFrames = true
            guard session.canAddOutput(output) else { throw DualCameraError.unsupported("outputs") }
            session.addOutputWithNoConnections(output)
        }
        mainOutput.setSampleBufferDelegate(self, queue: mainQueue)
        if wideDevice != nil { wideOutput.setSampleBufferDelegate(self, queue: wideQueue) }

        guard let mainPort = mainInput.ports(for: .video, sourceDeviceType: mainDevice.deviceType, sourceDevicePosition: .back).first
        else { throw DualCameraError.unsupported("ports") }
        let mainConnection = AVCaptureConnection(inputPorts: [mainPort], output: mainOutput)
        guard session.canAddConnection(mainConnection) else { throw DualCameraError.unsupported("connections") }
        session.addConnection(mainConnection)
        if let wideDevice, let wideInput {
            guard let widePort = wideInput.ports(for: .video, sourceDeviceType: wideDevice.deviceType, sourceDevicePosition: .back).first
            else { throw DualCameraError.unsupported("ports") }
            let wideConnection = AVCaptureConnection(inputPorts: [widePort], output: wideOutput)
            guard session.canAddConnection(wideConnection) else { throw DualCameraError.unsupported("connections") }
            session.addConnection(wideConnection)
            /* 광각은 보기용 — 손떨림 보정 없이(두 카메라의 하드웨어 몫을 아낀다) */
            if wideConnection.isVideoStabilizationSupported { wideConnection.preferredVideoStabilizationMode = .off }
        }
        let previewConnection = AVCaptureConnection(inputPort: mainPort, videoPreviewLayer: previewLayer)
        let hasPreview = session.canAddConnection(previewConnection)
        if hasPreview {
            session.addConnection(previewConnection)
            DualCameraController.portrait(previewConnection)
        }

        /*
         * 일반은 1080p 60(사이트가 늘 청한다), 광각도 같게 시도한다. 두 카메라의 하드웨어 몫이 넘치면 광각부터 낮춘다
         * (30fps → 가장 작은 화면 30fps). 그래도 넘치면 일반의 화면을 줄이되 fps 는 지킨다 — 측정 카메라는 30fps 이하를
         * 쓰지 않는다(사용자 규칙 2026-10-03). 그래도 안 되면 '안 됨'(cost)으로 끝내고, 사이트가 일반 카메라만으로 다시 켠다.
         */
        let isMulti = multi != nil
        var mainPick = try DualCameraController.pick(mainDevice, fps: config.fps, short: config.short, multi: isMulti)
        /*
         * 자동(고른 화질 없음)이면 60fps 를 못 낼 때 '안 됨' — 사이트가 웹 카메라로 잰다. 화질을 정해 청했으면 60fps 아래도
         * 켠다 — 화면이 주황으로 경고한다(사용자 2026-10-04: "경고는 띄우되 막지는 않게").
         */
        if config.short == nil {
            guard mainPick.fps >= DualCameraController.MIN_MEASURE_FPS else { throw DualCameraError.unsupported("fps") }
        }
        try DualCameraController.apply(mainDevice, mainPick, lockFocus: config.net, zoom: config.zoom)
        var widePick: Picked?
        if let wideDevice, let multi {
            var pick = try DualCameraController.pick(wideDevice, fps: config.fps, multi: true)
            try DualCameraController.apply(wideDevice, pick, lockFocus: false)
            if multi.hardwareCost > 1.0 {
                pick = try DualCameraController.pick(wideDevice, fps: 30, multi: true)
                try DualCameraController.apply(wideDevice, pick, lockFocus: false)
            }
            if multi.hardwareCost > 1.0 {
                pick = try DualCameraController.pick(wideDevice, fps: 30, smallest: true, multi: true)
                try DualCameraController.apply(wideDevice, pick, lockFocus: false)
            }
            /*
             * 일반 카메라의 화면 줄이기는 자동일 때만 — 화질을 정해 청했으면 몰래 줄이지 않고 '안 됨'(cost)으로 끝낸다(2026-10-04).
             */
            if multi.hardwareCost > 1.0, config.short == nil {
                let smaller = try DualCameraController.pick(mainDevice, fps: mainPick.fps, smallest: true, multi: true)
                if smaller.fps >= DualCameraController.MIN_MEASURE_FPS {
                    mainPick = smaller
                    try DualCameraController.apply(mainDevice, mainPick, lockFocus: config.net, zoom: config.zoom)
                }
            }
            guard multi.hardwareCost <= 1.0 else { throw DualCameraError.unsupported("cost") }
            widePick = pick
        }

        /*
         * 손떨림 보정(표준) — 손에 든 폰 · 바람에 흔들리는 삼각대(2026-10-08 사용자: "떨림 보조기능을 활성화"). 형식을 정한 뒤에
         * 건다(되는지는 형식에 달렸다). 미리보기도 같게 걸어 뷰파인더 · 존이 녹화되는 장면과 같은 자리를 보이게 한다.
         * 보정은 가장자리를 잘라 화각이 좁아진다 — 렌즈 값(intrinsics)을 받을 수 있으면 장면마다 실려 오는 그 값으로 화각을 잰다.
         */
        let stabilized = mainConnection.isVideoStabilizationSupported
        if stabilized {
            mainConnection.preferredVideoStabilizationMode = .standard
            if hasPreview, previewConnection.isVideoStabilizationSupported {
                previewConnection.preferredVideoStabilizationMode = .standard
            }
        }
        if mainConnection.isCameraIntrinsicMatrixDeliverySupported {
            mainConnection.isCameraIntrinsicMatrixDeliveryEnabled = true
        }
        self.mainConnection = mainConnection

        main = mainPick
        wide = widePick
        /* 줌을 걸었으면 화각은 그만큼 좁다(가운데를 잘라 키움) — tan(화각/2) 이 줌의 역수로 */
        let zoomed = Double(mainDevice.videoZoomFactor)
        mainFov = DualCameraController.narrow(Double(mainPick.format.videoFieldOfView), by: zoomed)
        wideFov = widePick.map { Double($0.format.videoFieldOfView) } ?? 0
        /* 센서는 가로로 찍는다 — 영상 파일에 '세로로 돌려 보기' 표시만 달아 세로 영상이 되게(픽셀은 안 돌린다) */
        let rotate = CGAffineTransform(rotationAngle: .pi / 2)
        mainRecorder.configure(width: mainPick.width, height: mainPick.height, fps: mainPick.fps, transform: rotate)
        if let widePick {
            wideRecorder.configure(width: widePick.width, height: widePick.height, fps: widePick.fps, transform: rotate)
        }

        return [
            "mainFps": Int(mainPick.fps), "wideFps": Int(widePick?.fps ?? 0),
            "mainWidth": mainPick.height, "mainHeight": mainPick.width,
            "wideWidth": widePick?.height ?? 0, "wideHeight": widePick?.width ?? 0,
            "mainFovDeg": stabilized ? DualCameraController.narrow(mainFov, by: DualCameraController.STAB_CROP) : mainFov,
            "wideFovDeg": wideFov,
            "hardwareCost": Double(multi?.hardwareCost ?? 0),
            "stabilization": stabilized ? "standard" : "off",
        ]
    }

    /// 화각(도)을 배율만큼 좁힌 값 — 가운데를 잘라 키우면 tan(화각/2) 이 배율의 역수로 준다
    static func narrow(_ fovDeg: Double, by factor: Double) -> Double {
        guard factor > 1.001 else { return fovDeg }
        return 2 * atan(tan(fovDeg * .pi / 360) / factor) * 180 / .pi
    }

    /// 클립에 실을 일반 카메라의 화각과 그 출처. 렌즈 값이 손떨림 보정이 자른 몫까지 셈한 것 같으면(자르기 전보다 좁다) 그것,
    /// 보정이 꺼져 있으면 형식의 화각, 아니면 자른 몫(STAB_CROP)을 짐작한 값.
    private func clipFov() -> (deg: Double, source: String, stabilized: Bool) {
        let stabilized = (mainConnection?.activeVideoStabilizationMode ?? .off) != .off
        fovLock.lock()
        let measured = intrinsicFov
        fovLock.unlock()
        if let measured {
            let ratio = tan(measured * .pi / 360) / tan(mainFov * .pi / 360)
            /* 줌을 빼먹은 값(2배 넓음) · 보정 중인데 자르기 전과 같은 값은 버린다 */
            if ratio > 0.6, ratio < (stabilized ? 0.98 : 1.03) { return (measured, "intrinsics", stabilized) }
        }
        if !stabilized { return (mainFov, "format", false) }
        return (DualCameraController.narrow(mainFov, by: DualCameraController.STAB_CROP), "estimate", true)
    }

    /// 켤 수 있는 모양(두 카메라면 함께 켤 수 있는 것) 중 8비트(HDR 아님), 바라는 fps 를 낼 수 있는 것.
    /// short 를 주면 그 짧은 변의 16:9 모양 중에서(사용자가 고른 화질), 아니면 1080p 쪽(긴 변 1280~1920)에서 가장 큰 것.
    /// smallest 면 가장 작은 화면(두 카메라의 하드웨어 몫을 줄일 때).
    private static func pick(
        _ device: AVCaptureDevice, fps: Int32, short: Int32? = nil, smallest: Bool = false, multi: Bool
    ) throws -> Picked {
        let all: [(AVCaptureDevice.Format, Int32, Int32, Double)] = device.formats.compactMap { format in
            guard !multi || format.isMultiCamSupported,
                  pixelFormats.contains(CMFormatDescriptionGetMediaSubType(format.formatDescription))
            else { return nil }
            let d = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            guard d.width >= 1280 else { return nil }
            let maxFps = format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0
            return (format, d.width, d.height, maxFps)
        }
        let sized = all.filter { c in
            if let short { return c.2 == short && Int(c.1) * 9 == Int(c.2) * 16 }
            return smallest || c.1 <= 1920
        }
        /* 고른 화질이 없으면(다른 아이폰에서 고른 설정) 1080p 쪽으로 */
        let candidates = sized.isEmpty ? all.filter { $0.1 <= 1920 } : sized
        /* fps 를 채우는 것 중 가장 큰(smallest 면 가장 작은) 화면 → 없으면 fps 가 가장 높은 것 */
        let enough = candidates.filter { $0.3 >= Double(fps) - 0.5 }
        let area = { (c: (AVCaptureDevice.Format, Int32, Int32, Double)) in Int(c.1) * Int(c.2) }
        let best = (enough.isEmpty ? candidates : enough).max { a, b in
            if enough.isEmpty { return a.3 < b.3 }
            return smallest ? area(a) > area(b) : area(a) < area(b)
        }
        guard let best else { throw DualCameraError.unsupported("format") }
        let actual = Int32(min(Double(fps), best.3).rounded(.down))
        return Picked(format: best.0, fps: max(1, actual), width: Int(best.1), height: Int(best.2))
    }

    private static func apply(_ device: AVCaptureDevice, _ pick: Picked, lockFocus: Bool, zoom: Double = 1) throws {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        device.activeFormat = pick.format
        let duration = CMTime(value: 1, timescale: pick.fps)
        device.activeVideoMinFrameDuration = duration
        device.activeVideoMaxFrameDuration = duration
        let want = CGFloat(max(1, min(zoom, Double(pick.format.videoMaxZoomFactor))))
        if device.videoZoomFactor != want { device.videoZoomFactor = want }
        /* 네트 있음 = 수동초점(사용자 규칙 2026-09-27) — 자동초점이면 눈앞의 그물코에 초점이 잡혀 공이 흐려진다 */
        if lockFocus, device.isLockingFocusWithCustomLensPositionSupported {
            device.setFocusModeLocked(lensPosition: 1.0, completionHandler: nil)
        } else if device.isFocusModeSupported(.continuousAutoFocus) {
            device.focusMode = .continuousAutoFocus
        }
    }

    private static func portrait(_ connection: AVCaptureConnection) {
        if #available(iOS 17.0, *) {
            if connection.isVideoRotationAngleSupported(90) { connection.videoRotationAngle = 90 }
        } else if connection.isVideoOrientationSupported {
            connection.videoOrientation = .portrait
        }
    }

    // MARK: 장면

    func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output === mainOutput {
            mainRecorder.append(sampleBuffer)
            readIntrinsics(sampleBuffer)
            serveSnapshots(sampleBuffer)
            if let hit = trigger.feed(sampleBuffer) { onThrow?(hit.atSec, hit.strength) }
        } else if output === wideOutput {
            wideRecorder.append(sampleBuffer)
        }
    }

    /// 렌즈 값(intrinsics) — 장면에 실려 오면 긴 변 화각으로 바꿔 둔다. 보정이 자리 잡은 뒤(15장째부터) 1.5초 안에 한 번
    private func readIntrinsics(_ buffer: CMSampleBuffer) {
        guard intrinsicFrames < 90 else { return }
        intrinsicFrames += 1
        guard intrinsicFrames > 15,
              let data = CMGetAttachment(buffer, key: kCMSampleBufferAttachmentKey_CameraIntrinsicMatrix, attachmentModeOut: nil) as? Data,
              data.count >= MemoryLayout<matrix_float3x3>.size,
              let pixels = CMSampleBufferGetImageBuffer(buffer)
        else { return }
        let fx = Double(data.withUnsafeBytes { $0.loadUnaligned(as: matrix_float3x3.self) }.columns.0.x)
        guard fx > 0 else { return }
        /* 장면은 가로(센서) — 너비가 긴 변 */
        let fov = 2 * atan(Double(CVPixelBufferGetWidth(pixels)) / 2 / fx) * 180 / .pi
        intrinsicFrames = 90
        fovLock.lock()
        intrinsicFov = fov
        fovLock.unlock()
    }

    // MARK: 렌즈 보정용 장면

    func requestSnapshot(short: Int, done: @escaping ([String: Any]?) -> Void) {
        snapshotLock.lock()
        snapshotWaiters.append((short, done))
        snapshotLock.unlock()
    }

    private func serveSnapshots(_ buffer: CMSampleBuffer) {
        snapshotLock.lock()
        let waiters = snapshotWaiters
        snapshotWaiters.removeAll()
        snapshotLock.unlock()
        for waiter in waiters { waiter.done(DualCameraController.portraitLuma(buffer, short: waiter.short)) }
    }

    /// 장면의 밝기만 세로 화면으로, 짧은 변 short 픽셀로 줄여(2×2 평균) — 영상 범위(16~235)를 0~255 로 편다(웹 캔버스의 밝기와 같게)
    static func portraitLuma(_ buffer: CMSampleBuffer, short: Int) -> [String: Any]? {
        guard let pixels = CMSampleBufferGetImageBuffer(buffer) else { return nil }
        CVPixelBufferLockBaseAddress(pixels, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
        guard CVPixelBufferGetPlaneCount(pixels) >= 1,
              let base = CVPixelBufferGetBaseAddressOfPlane(pixels, 0)
        else { return nil }
        let width = CVPixelBufferGetWidthOfPlane(pixels, 0)
        let height = CVPixelBufferGetHeightOfPlane(pixels, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(pixels, 0)
        let src = base.assumingMemoryBound(to: UInt8.self)
        /* 세로 화면: 너비 = 센서 높이, 높이 = 센서 너비. (u, v) = 장면의 (x = v, y = 1 − u) — MotionTrigger 와 같다 */
        let outW = min(short, height)
        let outH = Int((Double(width) * Double(outW) / Double(height)).rounded())
        guard outW >= 2, outH >= 2 else { return nil }
        var range = [UInt8](repeating: 0, count: 256)
        for v in 0..<256 { range[v] = UInt8(max(0, min(255, (v - 16) * 255 / 219))) }
        var out = [UInt8](repeating: 0, count: outW * outH)
        for j in 0..<outH {
            let x = min(width - 2, max(0, Int((Double(j) + 0.5) * Double(width) / Double(outH) - 0.5)))
            for i in 0..<outW {
                let y = min(height - 2, max(0, Int((1 - (Double(i) + 0.5) / Double(outW)) * Double(height) - 0.5)))
                let a = y * stride + x
                let sum = Int(src[a]) + Int(src[a + 1]) + Int(src[a + stride]) + Int(src[a + stride + 1])
                out[j * outW + i] = range[sum >> 2]
            }
        }
        return [
            "luma": Data(out).base64EncodedString(),
            "width": outW, "height": outH,
            "sourceWidth": height, "sourceHeight": width,
        ]
    }

    // MARK: 클립

    func makeClips(
        at: Double,
        before: Double,
        after: Double,
        completion: @escaping (Result<(main: DualClip, wide: DualClip?), DualCameraError>) -> Void
    ) {
        clipQueue.async {
            /* 던진 뒤 after 초까지 담긴 조각이 닫힐 때까지 기다린다(조각 1초 — 보통 2초 안) */
            let deadline = Date().addingTimeInterval(5)
            let until = at + after
            while Date() < deadline, (self.mainRecorder.latestEnd ?? 0) < until {
                Thread.sleep(forTimeInterval: 0.1)
            }
            while self.wide != nil, Date() < deadline, (self.wideRecorder.latestEnd ?? 0) < until {
                Thread.sleep(forTimeInterval: 0.1)
            }
            let fov = self.clipFov()
            guard let main = self.main,
                  let mainClip = self.write(
                    self.mainRecorder, from: at - before, to: until, event: at, label: "main", picked: main,
                    fov: fov.deg, fovSource: fov.source, stabilized: fov.stabilized
                  )
            else {
                completion(.failure(DualCameraError(code: "clip", message: "그 순간의 영상이 없어요(너무 오래됐거나 아직 안 찍혔어요).")))
                return
            }
            let wideClip = self.wide.flatMap {
                self.write(
                    self.wideRecorder, from: at - before, to: until, event: at, label: "wide", picked: $0,
                    fov: self.wideFov, fovSource: "format", stabilized: false
                )
            }
            completion(.success((mainClip, wideClip)))
        }
    }

    private func write(
        _ recorder: SegmentRecorder, from: Double, to: Double, event: Double, label: String, picked: Picked,
        fov: Double, fovSource: String, stabilized: Bool
    ) -> DualClip? {
        guard let cut = recorder.clip(from: from, to: to) else { return nil }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("bullpen-dualcam", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        let url = dir.appendingPathComponent("\(UUID().uuidString)-\(label).mp4")
        do {
            try cut.data.write(to: url)
        } catch {
            return nil
        }
        return DualClip(
            path: url.path,
            eventSec: max(0, event - cut.start),
            durationSec: cut.end - cut.start,
            bytes: cut.data.count,
            fps: picked.fps,
            width: picked.height,
            height: picked.width,
            fovDeg: fov,
            fovSource: fovSource,
            stabilized: stabilized
        )
    }
}

// MARK: - 이어 녹화(fMP4 조각) — 최근 몇 초를 쥐고 있다가 청하면 잘라 준다

final class SegmentRecorder: NSObject, AVAssetWriterDelegate {
    private struct Segment {
        let start: Double
        let end: Double
        let data: Data
    }

    private let bitrate: Int
    /// 쥐고 있는 길이(초) — 클립은 길어야 앞뒤 4초라 넉넉히
    private let keepSec: Double = 8
    private let lock = NSLock()
    private var settings: (width: Int, height: Int, fps: Int32, transform: CGAffineTransform)?
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var initData: Data?
    private var segments: [Segment] = []
    private var failed = false

    init(bitrate: Int) {
        self.bitrate = bitrate
    }

    func configure(width: Int, height: Int, fps: Int32, transform: CGAffineTransform) {
        lock.lock()
        settings = (width, height, fps, transform)
        writer = nil
        input = nil
        initData = nil
        segments = []
        failed = false
        lock.unlock()
    }

    /// 닫힌 조각 중 가장 늦은 끝 시각(초, 카메라 시계)
    var latestEnd: Double? {
        lock.lock()
        defer { lock.unlock() }
        return segments.last?.end
    }

    func append(_ sampleBuffer: CMSampleBuffer) {
        lock.lock()
        let settings = self.settings
        let failed = self.failed
        lock.unlock()
        guard let settings, !failed else { return }
        if writer == nil { start(at: CMSampleBufferGetPresentationTimeStamp(sampleBuffer), settings) }
        guard let writer, let input, writer.status == .writing else { return }
        if input.isReadyForMoreMediaData, !input.append(sampleBuffer) {
            lock.lock()
            self.failed = true
            lock.unlock()
        }
    }

    private func start(at pts: CMTime, _ s: (width: Int, height: Int, fps: Int32, transform: CGAffineTransform)) {
        let writer = AVAssetWriter(contentType: UTType.mpeg4Movie)
        writer.outputFileTypeProfile = .mpeg4AppleHLS
        writer.preferredOutputSegmentInterval = CMTime(seconds: 1, preferredTimescale: 600)
        writer.initialSegmentStartTime = pts
        writer.delegate = self
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: s.width,
            AVVideoHeightKey: s.height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoMaxKeyFrameIntervalDurationKey: 1.0,
                AVVideoExpectedSourceFrameRateKey: Int(s.fps),
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                /* B 장면 없이 — 보이는 차례 = 담긴 차례라 장면 시각을 그대로 쓴다 */
                AVVideoAllowFrameReorderingKey: false,
            ] as [String: Any],
        ])
        input.expectsMediaDataInRealTime = true
        input.transform = s.transform
        guard writer.canAdd(input) else {
            lock.lock()
            failed = true
            lock.unlock()
            return
        }
        writer.add(input)
        guard writer.startWriting() else {
            lock.lock()
            failed = true
            lock.unlock()
            return
        }
        writer.startSession(atSourceTime: pts)
        self.writer = writer
        self.input = input
    }

    func finish() {
        guard let writer, let input, writer.status == .writing else { return }
        input.markAsFinished()
        writer.finishWriting {}
        self.writer = nil
        self.input = nil
    }

    func assetWriter(
        _ writer: AVAssetWriter,
        didOutputSegmentData segmentData: Data,
        segmentType: AVAssetSegmentType,
        segmentReport: AVAssetSegmentReport?
    ) {
        lock.lock()
        defer { lock.unlock() }
        switch segmentType {
        case .initialization:
            initData = segmentData
        case .separable:
            guard let report = segmentReport?.trackReports.first else { return }
            let start = report.earliestPresentationTimeStamp.seconds
            let end = start + report.duration.seconds
            segments.append(Segment(start: start, end: end, data: segmentData))
            let keepFrom = end - keepSec
            segments.removeAll { $0.end < keepFrom }
        @unknown default:
            break
        }
    }

    /// [from, to] 에 걸친 조각들을 한 파일로 — 시작 시각을 0 으로 옮긴다
    func clip(from: Double, to: Double) -> (data: Data, start: Double, end: Double)? {
        lock.lock()
        let initData = self.initData
        let picked = segments.filter { $0.end > from && $0.start < to }
        lock.unlock()
        guard let initData, let first = picked.first, let last = picked.last else { return nil }
        var out = initData
        for part in FMP4.rebase(picked.map(\.data)) { out.append(part) }
        return (out, first.start, last.end)
    }
}

// MARK: - fMP4 시각 옮기기

/// 잘라 낸 조각들은 녹화를 시작한 때부터의 시각(tfdt · sidx)을 들고 있다 — 그대로 이으면 영상이 몇 분 뒤에서 시작하는
/// 파일이 된다. 첫 조각의 시각을 0 으로 빼 준다.
enum FMP4 {
    private struct Box {
        let type: String
        let start: Int
        let header: Int
    }

    static func rebase(_ segments: [Data]) -> [Data] {
        var tfdtBase: UInt64?
        var sidxBase: UInt64?
        return segments.map { segment in
            var bytes = [UInt8](segment)
            for box in boxes(bytes, from: 0, to: bytes.count) {
                switch box.type {
                case "tfdt":
                    shift(&bytes, versionAt: box.start + box.header, valueAt: box.start + box.header + 4, base: &tfdtBase)
                case "sidx":
                    /* 판 · 표시(4) · reference_ID(4) · timescale(4) 다음이 earliest_presentation_time */
                    shift(&bytes, versionAt: box.start + box.header, valueAt: box.start + box.header + 12, base: &sidxBase)
                default:
                    break
                }
            }
            return Data(bytes)
        }
    }

    /// 상자들 — moof · traf 는 안까지 들어간다
    private static func boxes(_ b: [UInt8], from: Int, to: Int) -> [Box] {
        var out: [Box] = []
        var pos = from
        while pos + 8 <= to {
            var size = Int(be32(b, pos))
            let type = String(bytes: b[(pos + 4)..<(pos + 8)], encoding: .ascii) ?? ""
            var header = 8
            if size == 1 {
                guard pos + 16 <= to else { break }
                size = Int(be64(b, pos + 8))
                header = 16
            } else if size == 0 {
                size = to - pos
            }
            guard size >= header, pos + size <= to else { break }
            out.append(Box(type: type, start: pos, header: header))
            if type == "moof" || type == "traf" {
                out.append(contentsOf: boxes(b, from: pos + header, to: pos + size))
            }
            pos += size
        }
        return out
    }

    private static func shift(_ b: inout [UInt8], versionAt: Int, valueAt: Int, base: inout UInt64?) {
        guard versionAt < b.count else { return }
        let wide = b[versionAt] == 1
        guard valueAt + (wide ? 8 : 4) <= b.count else { return }
        let value = wide ? be64(b, valueAt) : UInt64(be32(b, valueAt))
        if base == nil { base = value }
        let next = value >= base! ? value - base! : 0
        if wide {
            for i in 0..<8 { b[valueAt + i] = UInt8((next >> (56 - 8 * UInt64(i))) & 0xff) }
        } else {
            let v = UInt32(truncatingIfNeeded: next)
            for i in 0..<4 { b[valueAt + i] = UInt8((v >> (24 - 8 * UInt32(i))) & 0xff) }
        }
    }

    private static func be32(_ b: [UInt8], _ at: Int) -> UInt32 {
        (UInt32(b[at]) << 24) | (UInt32(b[at + 1]) << 16) | (UInt32(b[at + 2]) << 8) | UInt32(b[at + 3])
    }

    private static func be64(_ b: [UInt8], _ at: Int) -> UInt64 {
        (UInt64(be32(b, at)) << 32) | UInt64(be32(b, at + 4))
    }
}

// MARK: - 던짐 알아채기

/// 일반 카메라 장면의 움직임으로 던짐을 알아챈다 — 볼 자리(roi, 세로 화면 0~1) 안의 48×48 점의 밝기가 앞 장면과 얼마나
/// 달라졌나(움직임 세기). 0.35초 넘게 조용하다가 평소의 3배(그리고 +4) 넘게 움직이면 그 장면의 시각을 알린다. 한 번
/// 알리면 1.5초는 쉰다. 잘못 알아채도(사람 움직임) 사이트의 영상 엔진이 공을 못 찾고 넘긴다 — 문턱은 폰 시험(3단계)에서 맞춘다.
final class MotionTrigger {
    static let defaultRoi = CGRect(x: 0.15, y: 0.15, width: 0.7, height: 0.7)

    private let lock = NSLock()
    private var armed = true
    private var roi = MotionTrigger.defaultRoi
    private var previous: [UInt8] = []
    private var baseline: Double = 0
    private var lastAbove: Double = -10
    private var lastFire: Double = -10
    private let grid = 48

    func update(armed: Bool?, roi: CGRect?) {
        lock.lock()
        if let armed { self.armed = armed }
        if let roi { self.roi = roi }
        lock.unlock()
    }

    func feed(_ sampleBuffer: CMSampleBuffer) -> (atSec: Double, strength: Double)? {
        guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return nil }
        let t = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        lock.lock()
        let roi = self.roi
        let armed = self.armed
        lock.unlock()

        CVPixelBufferLockBaseAddress(pixels, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
        guard CVPixelBufferGetPlaneCount(pixels) >= 1,
              let base = CVPixelBufferGetBaseAddressOfPlane(pixels, 0)
        else { return nil }
        let width = CVPixelBufferGetWidthOfPlane(pixels, 0)
        let height = CVPixelBufferGetHeightOfPlane(pixels, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(pixels, 0)
        let luma = base.assumingMemoryBound(to: UInt8.self)

        /* 센서는 가로(오른쪽으로 누운 폰)로 찍는다 — 세로 화면의 (u 왼→오, v 위→아래) = 장면의 (x = v, y = 1 − u) */
        var current = [UInt8](repeating: 0, count: grid * grid)
        for j in 0..<grid {
            let v = roi.minY + (Double(j) + 0.5) / Double(grid) * roi.height
            let x = min(width - 1, max(0, Int(v * Double(width))))
            for i in 0..<grid {
                let u = roi.minX + (Double(i) + 0.5) / Double(grid) * roi.width
                let y = min(height - 1, max(0, Int((1 - u) * Double(height))))
                current[j * grid + i] = luma[y * stride + x]
            }
        }
        defer { previous = current }
        guard previous.count == current.count else { return nil }
        var sum = 0
        for k in 0..<current.count { sum += abs(Int(current[k]) - Int(previous[k])) }
        let energy = Double(sum) / Double(current.count)
        if baseline == 0 { baseline = max(0.5, energy) }

        let threshold = max(baseline * 3, baseline + 4)
        guard energy > threshold else {
            baseline = baseline * 0.97 + energy * 0.03
            return nil
        }
        defer { lastAbove = t }
        guard armed, t - lastAbove >= 0.35, t - lastFire >= 1.5 else { return nil }
        lastFire = t
        return (t, energy / max(0.5, baseline))
    }
}
