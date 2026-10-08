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
/// 그것, 안 오면 폰마다 잰 자른 몫(STAB_CROP_MEASURED)이나 짐작한 값이다(fovSource 'intrinsics' · 'measured' · 'estimate' ·
/// 보정이 꺼졌으면 'format'). 15 Pro Max 는 보정을 켜면 렌즈 값을 주지 않는다(2026-10-08 잼).
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
///   setTrigger({ armed, roi })                   던짐 알아채기 켜기/끄기 · 볼 자리(세로 화면 0~1). 켜면 초점을 한 번 맞추고 잠근다
///   focus({ focus?: { x, y }, far? })            초점 다시 맞추기(세로 화면 0~1 — 보통 스트라이크 존 가운데)
///   (start 의 focus · focusFar — 초점 자리 · 먼 곳만 볼까)
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
        CAPPluginMethod(name: "focus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "diag", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tune", returnType: CAPPluginReturnPromise),
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
            wide: call.getBool("wide") ?? true,
            focusPoint: DualCameraPlugin.devicePoint(call.getObject("focus")) ?? CGPoint(x: 0.5, y: 0.5),
            /* 사이트가 정한다(투수 뒤 · 네트면 먼 곳만). 안 보내면 끔 */
            focusFar: call.getBool("focusFar") ?? false
        )
        let preview = DualCameraPlugin.rect(call.getObject("preview"))
        let controller = DualCameraController()
        controller.onThrow = { [weak self] at, strength, kind in
            self?.notifyListeners("throw", data: ["atSec": at, "strength": strength, "kind": kind])
        }
        controller.onError = { [weak self] message in
            self?.notifyListeners("error", data: ["message": message])
        }
        controller.onFps = { [weak self] fps, dropped in
            self?.notifyListeners("fps", data: ["fps": fps, "dropped": dropped])
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
        let armed = call.getBool("armed")
        controller?.trigger.update(
            armed: armed,
            roi: DualCameraPlugin.rect(call.getObject("roi"))
        )
        /* 측정을 시작하면 초점을 한 번 맞추고 잠그고, 멈추면 다시 계속 맞추기로 */
        if let armed { controller?.refocus(once: armed) }
        call.resolve()
    }

    /// 초점 다시 맞추기 — focus({ x, y, far }) 세로 화면 0~1(없으면 그 자리 그대로). 측정 중이면 맞춘 뒤 잠근다
    /// 카메라 상태 — 고른 형식(묶어 읽기 · 늘리기 시작 배율 · 2배가 진짜인가) · 줌 · 손떨림 보정 · 초점 · 노출
    @objc func diag(_ call: CAPPluginCall) {
        guard let controller else {
            call.reject("카메라가 꺼져 있어요.", "off")
            return
        }
        controller.diag { call.resolve($0) }
    }

    /// 지금 켠 카메라를 바로 바꿔 본다 — { stabilization?: Bool, zoom?: Number, lens?: 0~1(수동 초점), autoFocus?: true } → diag
    @objc func tune(_ call: CAPPluginCall) {
        guard let controller else {
            call.reject("카메라가 꺼져 있어요.", "off")
            return
        }
        controller.tune(
            stabilization: call.getBool("stabilization"),
            zoom: call.getDouble("zoom"),
            lens: call.getDouble("lens"),
            autoFocus: call.getBool("autoFocus") == true
        ) { call.resolve($0) }
    }

    @objc func focus(_ call: CAPPluginCall) {
        guard let controller else {
            call.reject("카메라가 꺼져 있어요.", "off")
            return
        }
        controller.refocus(point: DualCameraPlugin.devicePoint(call.getObject("focus")), far: call.getBool("far"))
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

    /// 세로 화면의 점(0~1, { x, y }) → 장치 좌표(가로 센서 기준 — 초점 · 노출 자리). 세로 (u, v) = 장치 (v, 1 − u)
    static func devicePoint(_ object: JSObject?) -> CGPoint? {
        guard let o = object, let u = number(o["x"]), let v = number(o["y"]) else { return nil }
        return CGPoint(x: v, y: 1 - u)
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
        /// 초점 자리(장치 좌표 — 가로 센서 기준 0~1) · 먼 곳만 볼까
        var focusPoint = CGPoint(x: 0.5, y: 0.5)
        var focusFar = true
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
    var onThrow: ((Double, Double, String) -> Void)?
    var onError: ((String) -> Void)?
    /// 실제로 받은 초당 장면 수 · 그 사이 버린 장면 수 — 1초마다. 약속한 60 과 달리 처리가 밀리면 장면을 버린다(구형 폰 · 개발용 빌드)
    var onFps: ((Double, Int) -> Void)?
    private var fpsCount = 0
    private var fpsDropped = 0
    private var fpsSince = -1.0

    private let sessionQueue = DispatchQueue(label: "bullpen.dualcam.session")
    private let mainQueue = DispatchQueue(label: "bullpen.dualcam.main", qos: .userInitiated)
    private let wideQueue = DispatchQueue(label: "bullpen.dualcam.wide", qos: .userInitiated)
    private let clipQueue = DispatchQueue(label: "bullpen.dualcam.clip", qos: .userInitiated)
    private let mainOutput = AVCaptureVideoDataOutput()
    private let wideOutput = AVCaptureVideoDataOutput()
    private let mainRecorder = SegmentRecorder(bitrate: 12_000_000)
    #if DEBUG
    private let lab = LabRecorder()
    #endif
    private let wideRecorder = SegmentRecorder(bitrate: 8_000_000)
    private var main: Picked?
    private var wide: Picked?
    private var mainFov: Double = 0
    /// 형식의 화각(줌 전) — 줌을 바꾸면 mainFov 를 다시 셈한다
    private var formatFov: Double = 0
    private var previewConnection: AVCaptureConnection?
    /// 수동 초점(렌즈 자리 0~1) — 있으면 자동초점 · 잠금이 건드리지 않는다
    private var manualLens: Float?
    private var wideFov: Double = 0
    private var observers: [NSObjectProtocol] = []
    private var mainConnection: AVCaptureConnection?
    private var mainDevice: AVCaptureDevice?
    /// 렌즈 값(intrinsics)으로 구한 일반 카메라의 긴 변 화각 — 안 오면 nil
    private var intrinsicFov: Double?
    private var intrinsicFrames = 0
    private let fovLock = NSLock()
    /// 렌즈 보정용 장면을 기다리는 부름 — 다음 장면에서 풀어 준다
    private var snapshotWaiters: [(short: Int, done: ([String: Any]?) -> Void)] = []
    private let snapshotLock = NSLock()

    /// 표준 손떨림 보정이 잘라 내는 배율(긴 변 tan) — 애플은 밝히지 않아 폰마다 잰다: 개발용 앱이 멈춘 장면을 보정 켬 · 끔으로 찍고
    /// (fovProbe) 맥의 scripts/velocity-lab/fov-crop.mjs 가 두 장의 배율을 잰다(1080p · 2배, 기준 조건). 기종 이름은 utsname.
    /// 15 Pro Max(iPhone16,2) 2026-10-08: 1.096(상관 0.998).
    static let STAB_CROP_MEASURED: [String: Double] = ["iPhone16,2": 1.096]
    /// 안 잰 폰 — 화각이 약 10% 준다고 알려져 있다(VisionCamera 문서, 15 Pro Max 잰 값과 0.4% 차이). 'estimate' 라 엔진이 ± 를 넓힌다.
    static let STAB_CROP_GUESS = 1.1
    static let model: String = {
        var info = utsname()
        uname(&info)
        return withUnsafeBytes(of: &info.machine) { String(decoding: $0.prefix { $0 != 0 }, as: UTF8.self) }
    }()
    /// 이 폰의 보정 배율과 잰 값인가
    static let stabCrop: (factor: Double, measured: Bool) = STAB_CROP_MEASURED[model].map { ($0, true) } ?? (STAB_CROP_GUESS, false)

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
            self.mainQueue.async {
                self.mainRecorder.finish()
                #if DEBUG
                self.lab.finish()
                #endif
            }
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
        self.previewConnection = previewConnection
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
        var mainPick = try DualCameraController.pick(
            mainDevice, fps: config.fps, short: config.short, multi: isMulti, zoom: config.zoom
        )
        /*
         * 자동(고른 화질 없음)이면 60fps 를 못 낼 때 '안 됨' — 사이트가 웹 카메라로 잰다. 화질을 정해 청했으면 60fps 아래도
         * 켠다 — 화면이 주황으로 경고한다(사용자 2026-10-04: "경고는 띄우되 막지는 않게").
         */
        if config.short == nil {
            guard mainPick.fps >= DualCameraController.MIN_MEASURE_FPS else { throw DualCameraError.unsupported("fps") }
        }
        try DualCameraController.apply(mainDevice, mainPick, zoom: config.zoom)
        var widePick: Picked?
        if let wideDevice, let multi {
            var pick = try DualCameraController.pick(wideDevice, fps: config.fps, multi: true)
            try DualCameraController.apply(wideDevice, pick)
            if multi.hardwareCost > 1.0 {
                pick = try DualCameraController.pick(wideDevice, fps: 30, multi: true)
                try DualCameraController.apply(wideDevice, pick)
            }
            if multi.hardwareCost > 1.0 {
                pick = try DualCameraController.pick(wideDevice, fps: 30, smallest: true, multi: true)
                try DualCameraController.apply(wideDevice, pick)
            }
            /*
             * 일반 카메라의 화면 줄이기는 자동일 때만 — 화질을 정해 청했으면 몰래 줄이지 않고 '안 됨'(cost)으로 끝낸다(2026-10-04).
             */
            if multi.hardwareCost > 1.0, config.short == nil {
                let smaller = try DualCameraController.pick(
                    mainDevice, fps: mainPick.fps, smallest: true, multi: true, zoom: config.zoom
                )
                if smaller.fps >= DualCameraController.MIN_MEASURE_FPS {
                    mainPick = smaller
                    try DualCameraController.apply(mainDevice, mainPick, zoom: config.zoom)
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
        self.mainDevice = mainDevice
        focusPoint = config.focusPoint
        focusFar = config.focusFar
        focusOnce = config.armed
        try mainDevice.lockForConfiguration()
        DualCameraController.focus(mainDevice, at: focusPoint, far: focusFar, once: focusOnce)
        mainDevice.unlockForConfiguration()

        #if DEBUG
        DualCameraController.logFormats(mainDevice, picked: mainPick.format)
        #endif
        main = mainPick
        wide = widePick
        /* 줌을 걸었으면 화각은 그만큼 좁다(가운데를 잘라 키움) — tan(화각/2) 이 줌의 역수로 */
        let zoomed = Double(mainDevice.videoZoomFactor)
        formatFov = Double(mainPick.format.videoFieldOfView)
        mainFov = DualCameraController.narrow(formatFov, by: zoomed)
        wideFov = widePick.map { Double($0.format.videoFieldOfView) } ?? 0
        /* 센서는 가로로 찍는다 — 영상 파일에 '세로로 돌려 보기' 표시만 달아 세로 영상이 되게(픽셀은 안 돌린다) */
        let rotate = CGAffineTransform(rotationAngle: .pi / 2)
        mainRecorder.configure(width: mainPick.width, height: mainPick.height, fps: mainPick.fps, transform: rotate)
        #if DEBUG
        lab.configure(
            width: mainPick.width, height: mainPick.height, fps: mainPick.fps, transform: rotate,
            info: ["format": String(describing: mainPick.format), "zoom": config.zoom, "fovDeg": mainFov, "net": config.net]
        )
        #endif
        if let widePick {
            wideRecorder.configure(width: widePick.width, height: widePick.height, fps: widePick.fps, transform: rotate)
        }

        return [
            "mainFps": Int(mainPick.fps), "wideFps": Int(widePick?.fps ?? 0),
            "mainWidth": mainPick.height, "mainHeight": mainPick.width,
            "wideWidth": widePick?.height ?? 0, "wideHeight": widePick?.width ?? 0,
            "mainFovDeg": stabilized ? DualCameraController.narrow(mainFov, by: DualCameraController.stabCrop.factor) : mainFov,
            "wideFovDeg": wideFov,
            "hardwareCost": Double(multi?.hardwareCost ?? 0),
            "stabilization": stabilized ? "standard" : "off",
            /*
             * 기준 조건(모든 사용자 같게 — 2026-10-08 사용자: "폰 기종에 상관없이 일관성 있게") — 1080p · 60fps · 2배가 진짜 줌 · 손떨림
             * 보정. 못 맞춰도 막지 않고 사이트가 알린다(몰래 낮추지 않는다).
             */
            "standard": [
                "resolution": mainPick.width == 1920 && mainPick.height == 1080,
                "fps": mainPick.fps >= DualCameraController.MIN_MEASURE_FPS,
                "zoom": DualCameraController.nativeAt(mainPick.format, zoom: zoomed),
                "stabilization": stabilized,
            ],
        ]
    }

    /// 이 줌에서 화면을 늘리지 않나(진짜 해상도) — 늘리기 시작 배율이 그보다 크거나(3% 안), 진짜 줌 목록에 있으면
    static func nativeAt(_ format: AVCaptureDevice.Format, zoom: Double) -> Bool {
        guard zoom > 1.001 else { return true }
        if Double(format.videoZoomFactorUpscaleThreshold) > zoom - 0.1 { return true }
        if #available(iOS 16.0, *) {
            return format.secondaryNativeResolutionZoomFactors.contains { abs(Double($0) - zoom) < 0.05 }
        }
        return false
    }

    /// 화각(도)을 배율만큼 좁힌 값 — 가운데를 잘라 키우면 tan(화각/2) 이 배율의 역수로 준다
    static func narrow(_ fovDeg: Double, by factor: Double) -> Double {
        guard factor > 1.001 else { return fovDeg }
        return 2 * atan(tan(fovDeg * .pi / 360) / factor) * 180 / .pi
    }

    /// 클립에 실을 일반 카메라의 화각과 그 출처. 렌즈 값이 손떨림 보정이 자른 몫까지 셈한 것 같으면(자르기 전보다 좁다) 그것,
    /// 보정이 꺼져 있으면 형식의 화각, 아니면 자른 몫(stabCrop — 이 폰에서 잰 값이거나 짐작)만큼 좁힌 값.
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
        let crop = DualCameraController.stabCrop
        return (DualCameraController.narrow(mainFov, by: crop.factor), crop.measured ? "measured" : "estimate", true)
    }

    /// 켤 수 있는 모양(두 카메라면 함께 켤 수 있는 것) 중 8비트(HDR 아님), 바라는 fps 를 낼 수 있는 것.
    /// short 를 주면 그 짧은 변의 16:9 모양 중에서(사용자가 고른 화질), 아니면 1080p 쪽(긴 변 1280~1920)에서 가장 큰 것.
    /// smallest 면 가장 작은 화면(두 카메라의 하드웨어 몫을 줄일 때).
    private static func pick(
        _ device: AVCaptureDevice, fps: Int32, short: Int32? = nil, smallest: Bool = false, multi: Bool, zoom: Double = 1
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
        /* 16:9 만 — 1920×1440(4:3) 같은 모양이 넓이로 1080p 를 이기지 않게 */
        let sized = all.filter { c in
            guard Int(c.1) * 9 == Int(c.2) * 16 else { return false }
            if let short { return c.2 == short }
            return smallest || c.1 <= 1920
        }
        /* 고른 화질이 없으면(다른 아이폰에서 고른 설정) 1080p 쪽으로 */
        let candidates = sized.isEmpty ? all.filter { $0.1 <= 1920 } : sized
        /* fps 를 채우는 것 중 가장 큰(smallest 면 가장 작은) 화면 → 없으면 fps 가 가장 높은 것 */
        let enough = candidates.filter { $0.3 >= Double(fps) - 0.5 }
        let area = { (c: (AVCaptureDevice.Format, Int32, Int32, Double)) in Int(c.1) * Int(c.2) }
        /*
         * 줌(2배)을 걸어도 화면을 늘리지 않는 모양을 먼저 — 센서를 넓게 읽는 모양이면 가운데를 잘라도 1080 픽셀이 다 찬다. 늘리는
         * 모양이면 2배에서 화면이 뭉개져 뿌옇게 보인다(2026-10-08 사용자). 같은 크기 모양이 여럿이라 크기만 보면 아무것이나 걸렸다.
         */
        let sharp = { (c: (AVCaptureDevice.Format, Int32, Int32, Double)) -> Double in
            guard zoom > 1.001 else { return 0 }
            /* 1.94 처럼 2 에 조금 못 미쳐도 늘리는 몫은 3% 라 진짜로 본다 */
            if Double(c.0.videoZoomFactorUpscaleThreshold) > zoom - 0.1 { return 2 }
            if #available(iOS 16.0, *),
               c.0.secondaryNativeResolutionZoomFactors.contains(where: { abs(Double($0) - zoom) < 0.01 }) {
                return 1
            }
            return 0
        }
        /*
         * 넓이(1080p)가 먼저 — 그 안에서 2배가 진짜인 것 → 센서를 묶어 읽지 않는 것 → 늘리기 시작 배율이 큰 것. 예전에는 '2배가
         * 진짜인가'를 넓이보다 먼저 봐서 720p 가 1080p 를 이길 수 있었다.
         */
        let best = (enough.isEmpty ? candidates : enough).max { a, b in
            if enough.isEmpty { return a.3 < b.3 }
            if area(a) != area(b) { return smallest ? area(a) > area(b) : area(a) < area(b) }
            if sharp(a) != sharp(b) { return sharp(a) < sharp(b) }
            if a.0.isVideoBinned != b.0.isVideoBinned { return a.0.isVideoBinned }
            return a.0.videoZoomFactorUpscaleThreshold < b.0.videoZoomFactorUpscaleThreshold
        }
        guard let best else { throw DualCameraError.unsupported("format") }
        let actual = Int32(min(Double(fps), best.3).rounded(.down))
        return Picked(format: best.0, fps: max(1, actual), width: Int(best.1), height: Int(best.2))
    }

    private static func apply(_ device: AVCaptureDevice, _ pick: Picked, zoom: Double = 1) throws {
        try device.lockForConfiguration()
        defer { device.unlockForConfiguration() }
        device.activeFormat = pick.format
        let duration = CMTime(value: 1, timescale: pick.fps)
        device.activeVideoMinFrameDuration = duration
        device.activeVideoMaxFrameDuration = duration
        let want = CGFloat(max(1, min(zoom, Double(pick.format.videoMaxZoomFactor))))
        if device.videoZoomFactor != want { device.videoZoomFactor = want }
        if device.isFocusModeSupported(.continuousAutoFocus) { device.focusMode = .continuousAutoFocus }
    }

    /*
     * 초점 — 스트라이크 존(먼 곳)에 맞춘다. 준비하는 동안은 계속 맞추고(폰을 옮겨도 따라온다), 측정을 시작하면(armed) 그 자리에서 한
     * 번 맞춘 뒤 잠근다(.autoFocus 는 맞춘 뒤 저절로 locked) — 던질 때 투수 몸이 앞을 지나가도 렌즈가 그쪽으로 끌려가지 않게.
     * far 면 먼 곳만 본다(autoFocusRangeRestriction) — 눈앞의 그물코 · 투수 몸에 맞지 않게.
     *
     * 예전에는 네트 있음이면 렌즈를 1.0(가장 먼 끝)에 고정했다. 그 자리는 무한대보다 멀어 화면이 통째로 뿌옇게 나왔다
     * (2026-10-08 사용자: "초점이 안 맞아서 뿌옇게"). 네트 없음은 계속 맞추기라 던지는 순간 투수에게 초점이 끌려갔다.
     */
    private var focusPoint = CGPoint(x: 0.5, y: 0.5)
    private var focusFar = true
    private var focusOnce = false

    /// 초점을 다시 건다 — point(장치 좌표, nil 이면 그대로) · far · once(잠그기). 세션 줄에서
    func refocus(point: CGPoint? = nil, far: Bool? = nil, once: Bool? = nil) {
        sessionQueue.async {
            if let point { self.focusPoint = point }
            if let far { self.focusFar = far }
            if let once { self.focusOnce = once }
            guard let device = self.mainDevice, self.manualLens == nil else { return }
            do { try device.lockForConfiguration() } catch { return }
            defer { device.unlockForConfiguration() }
            DualCameraController.focus(device, at: self.focusPoint, far: self.focusFar, once: self.focusOnce)
        }
    }

    func diag(_ done: @escaping ([String: Any]) -> Void) {
        sessionQueue.async { done(self.diagNow()) }
    }

    /// 세션 줄에서
    private func diagNow() -> [String: Any] {
        guard let device = mainDevice else { return [:] }
        let format = device.activeFormat
        var native: [Double] = []
        if #available(iOS 16.0, *) { native = format.secondaryNativeResolutionZoomFactors.map { Double($0) } }
        let fov = clipFov()
        let stab = mainConnection?.activeVideoStabilizationMode ?? .off
        return [
            "format": String(describing: format),
            "binned": format.isVideoBinned,
            "upscaleAt": Double(format.videoZoomFactorUpscaleThreshold),
            "nativeZooms": native,
            "zoom": Double(device.videoZoomFactor),
            "stabilization": stab == .off ? "off" : (stab == .standard ? "standard" : "on(\(stab.rawValue))"),
            "stabilizationSupported": mainConnection?.isVideoStabilizationSupported ?? false,
            "focusMode": device.focusMode == .locked ? "locked" : (device.focusMode == .autoFocus ? "auto" : "continuous"),
            "manualFocus": manualLens != nil,
            "lens": Double(device.lensPosition),
            "adjusting": device.isAdjustingFocus,
            "farOnly": device.autoFocusRangeRestriction == .far,
            "iso": Double(device.iso),
            "shutter": device.exposureDuration.seconds,
            "fovDeg": fov.deg,
            "fovSource": fov.source,
        ]
    }

    func tune(stabilization: Bool?, zoom: Double?, lens: Double?, autoFocus: Bool, done: @escaping ([String: Any]) -> Void) {
        sessionQueue.async {
            guard let device = self.mainDevice else {
                done([:])
                return
            }
            if let stabilization {
                let mode: AVCaptureVideoStabilizationMode = stabilization ? .standard : .off
                if let c = self.mainConnection, c.isVideoStabilizationSupported { c.preferredVideoStabilizationMode = mode }
                if let c = self.previewConnection, c.isVideoStabilizationSupported { c.preferredVideoStabilizationMode = mode }
            }
            if (try? device.lockForConfiguration()) != nil {
                if let zoom {
                    let z = CGFloat(max(1, min(zoom, Double(device.activeFormat.videoMaxZoomFactor))))
                    device.videoZoomFactor = z
                    self.mainFov = DualCameraController.narrow(self.formatFov, by: Double(z))
                }
                if let lens, device.isLockingFocusWithCustomLensPositionSupported {
                    let p = Float(min(1, max(0, lens)))
                    self.manualLens = p
                    device.setFocusModeLocked(lensPosition: p, completionHandler: nil)
                }
                if autoFocus {
                    self.manualLens = nil
                    DualCameraController.focus(device, at: self.focusPoint, far: self.focusFar, once: self.focusOnce)
                }
                device.unlockForConfiguration()
            }
            /* 렌즈 · 보정이 자리 잡을 틈 */
            self.sessionQueue.asyncAfter(deadline: .now() + 0.4) { done(self.diagNow()) }
        }
    }

    /// 잠금 안에서 부른다
    private static func focus(_ device: AVCaptureDevice, at point: CGPoint, far: Bool, once: Bool) {
        if device.isAutoFocusRangeRestrictionSupported { device.autoFocusRangeRestriction = far ? .far : .none }
        if device.isSmoothAutoFocusSupported { device.isSmoothAutoFocusEnabled = false }
        /* 초점 자리는 모드를 걸 때 쓰인다 — 자리를 먼저 */
        if device.isFocusPointOfInterestSupported {
            device.focusPointOfInterest = CGPoint(x: min(1, max(0, point.x)), y: min(1, max(0, point.y)))
        }
        if once, device.isFocusModeSupported(.autoFocus) {
            device.focusMode = .autoFocus
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
            countFrame(CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds)
            #if DEBUG
            logState()
            #endif
            mainRecorder.append(sampleBuffer)
            #if DEBUG
            lab.append(sampleBuffer, armed: trigger.isArmed)
            #endif
            readIntrinsics(sampleBuffer)
            #if DEBUG
            fovProbe(sampleBuffer)
            #endif
            serveSnapshots(sampleBuffer)
            if let d = mainDevice, d.isAdjustingFocus {
                /* 렌즈가 움직이는 동안은 화면 전체가 바뀐다 */
                trigger.quiet(until: CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds + 0.3)
            }
            #if DEBUG
            let feedStart = CACurrentMediaTime()
            let hitNow = trigger.feed(sampleBuffer)
            feedMs += (CACurrentMediaTime() - feedStart) * 1000
            #else
            let hitNow = trigger.feed(sampleBuffer)
            #endif
            #if DEBUG
            fakeThrow(CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds)
            #endif
            if let hit = hitNow {
                #if DEBUG
                print(String(format: "[cam] throw %@ at %.2f strength %.1f len %d area %.0f→%.0f pos %.0f,%.0f",
                             hit.kind, hit.atSec, hit.strength, hit.length, hit.areaFirst, hit.areaLast, hit.x, hit.y))
                #endif
                #if DEBUG
                lab.event(hit)
                #endif
                onThrow?(hit.atSec, hit.strength, hit.kind)
            }
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

    #if DEBUG
    /// 개발용 빌드(맥에 폰을 연결해 깐 앱)에서만 — 일반 카메라의 1080p · 4K 60fps 형식 전부와 고른 것을 콘솔에
    static func logFormats(_ device: AVCaptureDevice, picked: AVCaptureDevice.Format) {
        for format in device.formats {
            let d = CMVideoFormatDescriptionGetDimensions(format.formatDescription)
            let fps = format.videoSupportedFrameRateRanges.map(\.maxFrameRate).max() ?? 0
            guard Int(d.width) * 9 == Int(d.height) * 16, d.width >= 1920, fps >= 59 else { continue }
            var native: [CGFloat] = []
            if #available(iOS 16.0, *) { native = format.secondaryNativeResolutionZoomFactors }
            print("[cam] \(format === picked ? "PICK" : "    ") \(format) binned=\(format.isVideoBinned) up=\(format.videoZoomFactorUpscaleThreshold) native=\(native) stab=\(format.isVideoStabilizationModeSupported(.standard))")
        }
    }

    private var logFrame = 0
    private var logSince = 0.0
    private var feedMs = 0.0
    /// 2초마다 줌 · 초점 · 손떨림 · 노출 · 실제로 받은 fps · 장면당 공 찾기 시간
    private func logState() {
        logFrame += 1
        let now = CACurrentMediaTime()
        if logSince == 0 { logSince = now }
        guard now - logSince >= 2, let d = mainDevice else { return }
        let fps = Double(logFrame) / (now - logSince)
        let ms = feedMs / Double(max(1, logFrame))
        logFrame = 0
        logSince = now
        feedMs = 0
        let stab = mainConnection?.activeVideoStabilizationMode.rawValue ?? -1
        print(String(format: "[cam] fps=%.1f feed=%.2fms ", fps, ms) + "zoom=\(d.videoZoomFactor) lens=\(d.lensPosition) focus=\(d.focusMode.rawValue) adj=\(d.isAdjustingFocus) far=\(d.autoFocusRangeRestriction.rawValue) stab=\(stab) iso=\(d.iso) ss=\(d.exposureDuration.seconds) manual=\(manualLens.map { "\($0)" } ?? "nil")")
    }

    /*
     * 화각 재기(앱을 켠 뒤 카메라를 처음 켤 때 한 번) — 폰이 1초 멈춰 있으면 손떨림 보정을 켠 장면(on) → 보정을 끄고 멈춘 장면(off) →
     * 다시 켜고 멈춘 장면(on2)을 밝기 원본(PGM)으로 Documents/lab/fov-<시각>/ 에 남기고 렌즈 값(intrinsics)을 info.json 에 적는다.
     * 맥에서 scripts/velocity-lab/fov-crop.mjs 가 on · off 를 견줘 보정이 화면을 몇 배 키웠나(STAB_CROP_MEASURED 에 넣을 값)를 재고, on · on2 로 그새 폰이
     * 움직이지 않았나 본다. 멈추지 않으면 찍지 않고, 끈 채로 5초 넘게 흔들리면 보정을 되켜고 처음부터.
     */
    /*
     * 가짜 공 알림 — 맥에서 `devicectl … process launch … com.bullpenlog.app -fakeThrow YES` 로 켰을 때만, 측정을 시작하고 5초 뒤 한 번.
     * 공을 던지지 않고 알림 → 클립 → 옮기기 → 계산의 걸린 시간을 잰다(사이트 콘솔 '[velo] clip …').
     */
    private var fakeArmedAt: Double?
    private var fakeDone = false
    private func fakeThrow(_ t: Double) {
        guard !fakeDone, UserDefaults.standard.bool(forKey: "fakeThrow"), trigger.isArmed else {
            if !trigger.isArmed { fakeArmedAt = nil }
            return
        }
        if fakeArmedAt == nil { fakeArmedAt = t }
        guard let since = fakeArmedAt, t - since > 5 else { return }
        fakeDone = true
        print(String(format: "[cam] fake throw at %.2f (wall %.3f)", t, Date().timeIntervalSince1970))
        onThrow?(t - 0.05, 10, "ball")
    }

    private static var probeDone = false
    private var probeStage = 0
    private var probeWait = 0
    private var probeStill = 0
    private var probeGrid: [UInt8] = []
    private var probeDir: URL?
    private var probeInfo: [String: Any] = [:]

    private func fovProbe(_ buffer: CMSampleBuffer) {
        guard !DualCameraController.probeDone, let conn = mainConnection, conn.isVideoStabilizationSupported,
              let pixels = CMSampleBufferGetImageBuffer(buffer)
        else { return }
        probeStill = DualCameraController.isStill(pixels, grid: &probeGrid) ? probeStill + 1 : 0
        probeWait += 1
        let want: AVCaptureVideoStabilizationMode = probeStage == 1 ? .off : .standard
        if probeStage == 1, probeWait > 300 {
            setProbeStab(.standard)
            probeStage = 0
            probeWait = 0
            return
        }
        /* 보정을 바꾼 뒤 0.75초는 기다리고, 바뀐 모드로 1초 멈춰 있으면 */
        guard probeWait > 45, probeStill >= 60, (conn.activeVideoStabilizationMode == .off) == (want == .off) else { return }
        if probeStage == 0 {
            let stamp = DateFormatter()
            stamp.dateFormat = "yyyyMMdd-HHmmss"
            guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
            let dir = docs.appendingPathComponent("lab/fov-\(stamp.string(from: Date()))", isDirectory: true)
            try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
            probeDir = dir
            probeInfo = [
                "model": DualCameraController.model,
                "format": String(describing: mainDevice?.activeFormat),
                "zoom": Double(mainDevice?.videoZoomFactor ?? 1),
                "formatFovDeg": formatFov,
                "mainFovDeg": mainFov,
                "intrinsicsSupported": conn.isCameraIntrinsicMatrixDeliverySupported,
                "intrinsicsEnabled": conn.isCameraIntrinsicMatrixDeliveryEnabled,
            ]
        }
        guard let dir = probeDir else { return }
        let name = ["on", "off", "on2"][probeStage]
        var shot: [String: Any] = [
            "stab": conn.activeVideoStabilizationMode.rawValue,
            "width": CVPixelBufferGetWidth(pixels), "height": CVPixelBufferGetHeight(pixels),
        ]
        DualCameraController.writePGM(pixels, to: dir.appendingPathComponent("\(name).pgm"))
        if let data = CMGetAttachment(buffer, key: kCMSampleBufferAttachmentKey_CameraIntrinsicMatrix, attachmentModeOut: nil) as? Data,
           data.count >= MemoryLayout<matrix_float3x3>.size {
            let m = data.withUnsafeBytes { $0.loadUnaligned(as: matrix_float3x3.self) }
            shot["fx"] = Double(m.columns.0.x)
            shot["fy"] = Double(m.columns.1.y)
            shot["cx"] = Double(m.columns.2.x)
            shot["cy"] = Double(m.columns.2.y)
        }
        probeInfo[name] = shot
        print("[cam] fov probe \(name) \(shot)")
        probeStage += 1
        probeWait = 0
        probeStill = 0
        if probeStage == 1 { setProbeStab(.off) }
        if probeStage == 2 { setProbeStab(.standard) }
        if probeStage == 3 {
            DualCameraController.probeDone = true
            if let data = try? JSONSerialization.data(withJSONObject: probeInfo, options: [.prettyPrinted, .sortedKeys]) {
                try? data.write(to: dir.appendingPathComponent("info.json"))
            }
        }
    }

    private func setProbeStab(_ mode: AVCaptureVideoStabilizationMode) {
        sessionQueue.async {
            if let c = self.mainConnection, c.isVideoStabilizationSupported { c.preferredVideoStabilizationMode = mode }
            if let p = self.previewConnection, p.isVideoStabilizationSupported { p.preferredVideoStabilizationMode = mode }
        }
    }

    /// 밝기 48×27 점이 앞 장면과 거의 같나(평균 차 4 밑 — 어두운 방의 잡음은 넘김) — 폰이 멈춰 있나
    static func isStill(_ pixels: CVPixelBuffer, grid: inout [UInt8]) -> Bool {
        CVPixelBufferLockBaseAddress(pixels, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixels, 0) else { return false }
        let w = CVPixelBufferGetWidthOfPlane(pixels, 0)
        let h = CVPixelBufferGetHeightOfPlane(pixels, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(pixels, 0)
        let p = base.assumingMemoryBound(to: UInt8.self)
        var next = [UInt8](repeating: 0, count: 48 * 27)
        for j in 0 ..< 27 { for i in 0 ..< 48 { next[j * 48 + i] = p[(h * (2 * j + 1) / 54) * stride + w * (2 * i + 1) / 96] } }
        defer { grid = next }
        guard grid.count == next.count else { return false }
        var sum = 0
        for k in 0 ..< next.count { sum += abs(Int(next[k]) - Int(grid[k])) }
        return Double(sum) / Double(next.count) < 4
    }

    /// 밝기 면(Y)을 그대로 PGM(P5)으로 — 센서 방향(가로)
    static func writePGM(_ pixels: CVPixelBuffer, to url: URL) {
        CVPixelBufferLockBaseAddress(pixels, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
        guard let base = CVPixelBufferGetBaseAddressOfPlane(pixels, 0) else { return }
        let w = CVPixelBufferGetWidthOfPlane(pixels, 0)
        let h = CVPixelBufferGetHeightOfPlane(pixels, 0)
        let stride = CVPixelBufferGetBytesPerRowOfPlane(pixels, 0)
        var out = Data("P5\n\(w) \(h)\n255\n".utf8)
        for y in 0 ..< h { out.append(base.advanced(by: y * stride).assumingMemoryBound(to: UInt8.self), count: w) }
        try? out.write(to: url)
    }
    #endif

    /// 받은 장면을 세어 1초마다 알린다(카메라 장면 줄에서)
    private func countFrame(_ t: Double) {
        if fpsSince < 0 { fpsSince = t }
        fpsCount += 1
        guard t - fpsSince >= 1 else { return }
        onFps?(Double(fpsCount - 1) / (t - fpsSince), fpsDropped)
        fpsSince = t
        fpsCount = 1
        fpsDropped = 0
    }

    /// 늦어서 버린 장면(alwaysDiscardsLateVideoFrames) — 처리가 밀렸다
    func captureOutput(_ output: AVCaptureOutput, didDrop sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
        if output === mainOutput { fpsDropped += 1 }
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
            #if DEBUG
            print(String(format: "[cam] clip %.2f~%.2f ready (wall %.3f)", at - before, until, Date().timeIntervalSince1970))
            #endif
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

// MARK: - 현장 기록(개발용 빌드만)

#if DEBUG
/// 맥에 연결해 깐 개발용 앱에서만 — 측정 중(armed)인 장면을 높은 화질(H.264 30Mbps, 키 장면 0.5초)로 앱 문서 폴더
/// Documents/lab/<세션 시각>/ 에 1분 조각 영상으로 남기고, 던짐 알림(공 · 움직임)을 events.jsonl 에 적는다. 맥에서
/// scripts/velocity-lab/pull-device.sh 로 가져와 공 찾기(ball-trigger 시험대) · 구속 엔진을 실제 현장 장면으로 맞춘다.
/// 조각 이름의 숫자는 첫 장면의 카메라 시계(초) — 알림의 시각과 같은 시계다. 모두 합쳐 60조각(약 1시간 · 13GB — 스피드건과 같이 던지는
/// 불펜 한 번이 다 남게)이 넘거나 폰의 남은 공간이 5GB 밑이면 오래된 것부터 지운다.
final class LabRecorder {
    private var root: URL?
    private var dir: URL?
    private var settings: (width: Int, height: Int, fps: Int32, transform: CGAffineTransform)?
    private var writer: AVAssetWriter?
    private var input: AVAssetWriterInput?
    private var fileStart = 0.0
    private let segmentSec = 60.0
    private let keepFiles = 60
    private let minFreeBytes: Int64 = 5_000_000_000

    func configure(width: Int, height: Int, fps: Int32, transform: CGAffineTransform, info: [String: Any]) {
        finish()
        guard let docs = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask).first else { return }
        let stamp = DateFormatter()
        stamp.dateFormat = "yyyyMMdd-HHmmss"
        let root = docs.appendingPathComponent("lab", isDirectory: true)
        let dir = root.appendingPathComponent(stamp.string(from: Date()), isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        var meta = info
        meta["width"] = width
        meta["height"] = height
        meta["fps"] = Int(fps)
        if let data = try? JSONSerialization.data(withJSONObject: meta, options: [.prettyPrinted]) {
            try? data.write(to: dir.appendingPathComponent("session.json"))
        }
        self.root = root
        self.dir = dir
        settings = (width, height, fps, transform)
    }

    /// 카메라 장면 줄에서
    func append(_ buffer: CMSampleBuffer, armed: Bool) {
        guard armed else {
            finish()
            return
        }
        let t = CMSampleBufferGetPresentationTimeStamp(buffer).seconds
        if writer == nil || t - fileStart >= segmentSec {
            finish()
            start(at: CMSampleBufferGetPresentationTimeStamp(buffer))
        }
        guard let writer, let input, writer.status == .writing, input.isReadyForMoreMediaData else { return }
        input.append(buffer)
    }

    func event(_ hit: MotionTrigger.Hit) {
        guard let dir else { return }
        let line = String(
            format: "{\"t\":%.4f,\"kind\":\"%@\",\"strength\":%.2f,\"length\":%d,\"areaFirst\":%.1f,\"areaLast\":%.1f,\"x\":%.1f,\"y\":%.1f}\n",
            hit.atSec, hit.kind, hit.strength, hit.length, hit.areaFirst, hit.areaLast, hit.x, hit.y
        )
        let url = dir.appendingPathComponent("events.jsonl")
        if let h = try? FileHandle(forWritingTo: url) {
            h.seekToEndOfFile()
            h.write(Data(line.utf8))
            try? h.close()
        } else {
            try? Data(line.utf8).write(to: url)
        }
    }

    func finish() {
        guard let writer, let input else { return }
        self.writer = nil
        self.input = nil
        if writer.status == .writing {
            input.markAsFinished()
            writer.finishWriting { [weak self] in self?.prune() }
        }
    }

    private func start(at pts: CMTime) {
        guard let dir, let s = settings else { return }
        let url = dir.appendingPathComponent(String(format: "%.3f.mp4", pts.seconds))
        guard let writer = try? AVAssetWriter(outputURL: url, fileType: .mp4) else { return }
        let input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264,
            AVVideoWidthKey: s.width,
            AVVideoHeightKey: s.height,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: 30_000_000,
                AVVideoMaxKeyFrameIntervalDurationKey: 0.5,
                AVVideoExpectedSourceFrameRateKey: Int(s.fps),
                AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
                AVVideoAllowFrameReorderingKey: false,
            ] as [String: Any],
        ])
        input.expectsMediaDataInRealTime = true
        input.transform = s.transform
        guard writer.canAdd(input) else { return }
        writer.add(input)
        guard writer.startWriting() else { return }
        writer.startSession(atSourceTime: pts)
        self.writer = writer
        self.input = input
        fileStart = pts.seconds
    }

    /// 모든 세션의 조각을 합쳐 keepFiles 개 · 남은 공간 minFreeBytes 를 지킨다(오래된 것부터 지움, 가장 새 조각은 남김)
    private func prune() {
        guard let root else { return }
        let fm = FileManager.default
        let dirs = (try? fm.contentsOfDirectory(at: root, includingPropertiesForKeys: nil)) ?? []
        var files: [(URL, Date)] = []
        for d in dirs {
            let items = (try? fm.contentsOfDirectory(at: d, includingPropertiesForKeys: [.creationDateKey])) ?? []
            for f in items where f.pathExtension == "mp4" {
                let date = (try? f.resourceValues(forKeys: [.creationDateKey]).creationDate) ?? .distantPast
                files.append((f, date))
            }
        }
        var left = files.count
        for (f, _) in files.sorted(by: { $0.1 < $1.1 }).dropLast() {
            let free = (try? root.resourceValues(forKeys: [.volumeAvailableCapacityForImportantUsageKey]))?
                .volumeAvailableCapacityForImportantUsage ?? Int64.max
            guard left > keepFiles || free < minFreeBytes else { break }
            try? fm.removeItem(at: f)
            left -= 1
        }
    }
}
#endif

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

// BALL_TRIGGER_BEGIN — 맥 시험대(scripts/velocity-lab 의 ball-trigger 하네스)가 이 구간을 그대로 떼어 쓴다. Capacitor 없이 돌아야 한다.
import CoreMedia

/// 날아가는 공으로 던짐을 알아챈다(2026-10-08 사용자: "공을 던지지도 않았는데 투구를 인식했다고 계산으로 넘어간다 — 실제로 날아가는
/// 투구를 인식했을 때만"). 예전에는 볼 자리의 움직임 크기만 봐서, 측정을 시작할 때 초점을 다시 맞추느라 렌즈가 움직이거나(화면 전체가
/// 바뀜) 사람이 지나가도 던짐으로 알렸다.
///
/// 장면을 짧은 변 270칸 남짓으로 줄여, 앞 장면 · 뒤 장면 모두와 다른 곳(세 장면 차이 — 지나간 자리의 잔상이 안 남는다)만 남긴다.
/// 그중 작고 옹골진 덩어리를 장면마다 이어, 6장 넘게 같은 길로 가면서 투수 뒤면 크기가 0.4배 밑으로 줄 때(멀어지는 공), 포수 뒤면
/// 2배 넘게 클 때(다가오는 공)만 알린다. 투수 손 · 팔은 공처럼 빨리 작아지지 않는다(0.1초에 공은 3m → 6.5m 로 넓이 0.2배, 손은 0.6배쯤).
/// 화면의 12% 넘게 한꺼번에 바뀌면(초점 · 노출 · 폰 흔들림) 그 장면은 버린다. 시각은 공이 처음 보인 장면.
final class MotionTrigger {
    static let defaultRoi = CGRect(x: 0.15, y: 0.15, width: 0.7, height: 0.7)

    struct Hit {
        /// 'ball' = 날아가는 공이 확실함(바로 알린다) · 'motion' = 볼 자리가 크게 움직임(공인지는 사이트가 영상으로 가른다)
        let kind: String
        let atSec: Double
        let strength: Double
        /// 이은 장면 수 · 처음 · 끝 넓이(줄인 칸) · 처음 자리(줄인 칸) — 시험대 · 콘솔용
        let length: Int
        let areaFirst: Double
        let areaLast: Double
        let x: Double
        let y: Double
    }

    private struct Point {
        let f: Int
        let t: Double
        let x: Double
        let y: Double
        let a: Double
        let fill: Double
        /// 그 장면에서 바뀐 칸의 몫 — 화면이 통째로 움직이면(손에 든 폰) 크다
        let moved: Double
    }

    private struct Blob {
        var area = 0
        var sx = 0.0
        var sy = 0.0
        var minX = Int.max, maxX = 0, minY = Int.max, maxY = 0
    }

    private let lock = NSLock()
    private var armed = true
    private var receding = true

    /// 측정 중인가(알림을 내는가)
    var isArmed: Bool {
        lock.lock()
        defer { lock.unlock() }
        return armed
    }
    private var quietUntil = -Double.infinity

    private var step = 0
    private var gw = 0
    private var gh = 0
    private var grids: [[UInt8]] = []
    private var times: [Double] = []
    private var frame = 0
    private var tracks: [[Point]] = []
    private var lastHit = -Double.infinity

    /// 장면의 몇 할이 한꺼번에 바뀌면 그 장면을 버리나
    static let GLOBAL_FRACTION = 0.12
    /// 이을 장면 수 · 투수 뒤 줄어든 배율 · 포수 뒤 커진 배율 · 처음(투수 뒤) · 끝(포수 뒤) 넓이의 바닥(줄인 칸)
    static let MIN_LENGTH = 6
    static let SHRINK = 0.35
    static let GROW = 2.5
    static let MIN_AREA = 22.0
    /// 이은 자리가 직선에서 벗어난 정도(줄인 칸, 제곱평균) — 잡티 길은 이리저리 튄다
    static let MAX_WOBBLE = 6.0
    /// 한 장면의 덩어리가 이보다 많으면 공 찾기를 쉰다
    static let MAX_BLOBS = 80
    /// 공 길 동안 바뀐 칸 몫의 평균 상한
    static let MAX_MOVED = 0.016
    /// 알린 뒤 쉬는 시간(초)
    static let REST_SEC = 1.0
    /// 시험대용 — 6장 넘게 이은 길을 볼 때마다(앱에서는 nil)
    var debug: ((String) -> Void)?

    func update(armed: Bool?, roi: CGRect?) {
        lock.lock()
        if let armed {
            /* 측정을 시작하면 초점을 다시 맞춘다(렌즈가 움직여 화면 전체가 바뀐다) — 1초는 보지 않는다 */
            if armed, !self.armed { quietUntil = max(quietUntil, lastFrameTime + 1.0) }
            self.armed = armed
        }
        _ = roi
        lock.unlock()
    }

    /// 공이 멀어지나(투수 뒤) · 다가오나(포수 뒤)
    func setReceding(_ v: Bool) {
        lock.lock()
        receding = v
        lock.unlock()
    }

    /// 이 시각까지 보지 않는다(초점이 움직이는 동안 등)
    func quiet(until t: Double) {
        lock.lock()
        quietUntil = max(quietUntil, t)
        lock.unlock()
    }

    private var lastFrameTime = 0.0

    func feed(_ sampleBuffer: CMSampleBuffer) -> Hit? {
        guard let pixels = CMSampleBufferGetImageBuffer(sampleBuffer) else { return nil }
        let t = CMSampleBufferGetPresentationTimeStamp(sampleBuffer).seconds
        CVPixelBufferLockBaseAddress(pixels, .readOnly)
        defer { CVPixelBufferUnlockBaseAddress(pixels, .readOnly) }
        guard CVPixelBufferGetPlaneCount(pixels) >= 1,
              let base = CVPixelBufferGetBaseAddressOfPlane(pixels, 0)
        else { return nil }
        return feed(
            luma: base.assumingMemoryBound(to: UInt8.self),
            width: CVPixelBufferGetWidthOfPlane(pixels, 0),
            height: CVPixelBufferGetHeightOfPlane(pixels, 0),
            stride: CVPixelBufferGetBytesPerRowOfPlane(pixels, 0),
            t: t
        )
    }

    func feed(luma: UnsafePointer<UInt8>, width: Int, height: Int, stride: Int, t: Double) -> Hit? {
        lock.lock()
        let armed = self.armed
        let receding = self.receding
        let quietUntil = self.quietUntil
        lastFrameTime = t
        lock.unlock()

        let s = max(1, Int((Double(min(width, height)) / 270).rounded()))
        if s != step || gw != width / s || gh != height / s {
            step = s
            gw = width / s
            gh = height / s
            grids = []
            times = []
            tracks = []
        }
        let n = gw * gh
        var g = [UInt8](repeating: 0, count: n)
        let o1 = s / 4, o2 = (3 * s) / 4
        g.withUnsafeMutableBufferPointer { gp in
            for j in 0..<gh {
                let r1 = (j * s + o1) * stride, r2 = (j * s + o2) * stride
                for i in 0..<gw {
                    let x1 = i * s + o1, x2 = i * s + o2
                    let sum = Int(luma[r1 + x1]) + Int(luma[r1 + x2]) + Int(luma[r2 + x1]) + Int(luma[r2 + x2])
                    gp[j * gw + i] = UInt8(truncatingIfNeeded: sum >> 2)
                }
            }
        }
        grids.append(g)
        times.append(t)
        frame += 1
        if grids.count > 3 {
            grids.removeFirst()
            times.removeFirst()
        }
        guard grids.count == 3 else { return nil }
        /* 가운데 장면(b)을 본다 — 앞(a) · 뒤(c) 모두와 다른 곳만 */
        let tb = times[1]
        let fb = frame - 1
        guard tb >= quietUntil else {
            tracks.removeAll()
            motionQuietSince = tb
            return nil
        }

        var d = [UInt8](repeating: 0, count: n)
        var sumD = 0
        var sumE = 0
        var nE = 0
        let ex0 = gw * 15 / 100, ex1 = gw * 85 / 100, ey0 = gh * 15 / 100, ey1 = gh * 85 / 100
        grids[0].withUnsafeBufferPointer { a in
            grids[1].withUnsafeBufferPointer { b in
                grids[2].withUnsafeBufferPointer { c in
                    d.withUnsafeMutableBufferPointer { dp in
                        for k in 0..<n {
                            let bb = Int(b[k])
                            let m = min(abs(bb - Int(a[k])), abs(bb - Int(c[k])))
                            dp[k] = UInt8(m)
                            sumD += m
                        }
                    }
                    /* 움직임 세기 — 가운데 70% 에서 장면 b 와 c 의 차이(예전 알아채기와 같은 뜻) */
                    for j in Swift.stride(from: ey0, to: ey1, by: 2) {
                        for i in Swift.stride(from: ex0, to: ex1, by: 2) {
                            let k = j * gw + i
                            sumE += abs(Int(c[k]) - Int(b[k]))
                            nE += 1
                        }
                    }
                }
            }
        }
        let energy = Double(sumE) / Double(max(1, nE))
        let thr = max(12, Int((Double(sumD) / Double(n) * 4).rounded()))
        /* 가장자리 3% 는 보지 않는다 */
        let mx = max(1, gw * 3 / 100), my = max(1, gh * 3 / 100)
        var over = 0
        for j in my..<(gh - my) { for i in mx..<(gw - mx) where Int(d[j * gw + i]) > thr { over += 1 } }
        if Double(over) / Double(n) > MotionTrigger.GLOBAL_FRACTION {
            /* 초점 · 노출 · 폰 흔들림 — 공도 움직임도 아니다 */
            tracks.removeAll()
            motionQuietSince = tb
            return nil
        }

        /* 덩어리(4이웃) */
        var seen = [Bool](repeating: false, count: n)
        var blobs: [Blob] = []
        var stack: [Int] = []
        let maxArea = max(40, n / 250)
        outer: for j in my..<(gh - my) {
            for i in mx..<(gw - mx) {
                let k0 = j * gw + i
                guard !seen[k0], Int(d[k0]) > thr else { continue }
                var bl = Blob()
                stack.removeAll(keepingCapacity: true)
                stack.append(k0)
                seen[k0] = true
                while let k = stack.popLast() {
                    let x = k % gw, y = k / gw
                    bl.area += 1
                    bl.sx += Double(x)
                    bl.sy += Double(y)
                    bl.minX = min(bl.minX, x); bl.maxX = max(bl.maxX, x)
                    bl.minY = min(bl.minY, y); bl.maxY = max(bl.maxY, y)
                    if bl.area > maxArea * 4 { continue }
                    for nb in [k - 1, k + 1, k - gw, k + gw] {
                        guard nb >= 0, nb < n, !seen[nb], Int(d[nb]) > thr else { continue }
                        let nx = nb % gw
                        guard abs(nx - x) <= 1, nx >= mx, nx < gw - mx, nb / gw >= my, nb / gw < gh - my else { continue }
                        seen[nb] = true
                        stack.append(nb)
                    }
                }
                blobs.append(bl)
                if blobs.count > MotionTrigger.MAX_BLOBS { break outer }
            }
        }
        /* 잔 덩어리가 너무 많은 장면(흔들리는 그물 · 잎) — 공을 믿고 가를 수 없다. 움직임 세기만 본다 */
        guard blobs.count <= MotionTrigger.MAX_BLOBS else {
            tracks.removeAll()
            return armed ? motionHit(energy: energy, t: tb) : nil
        }
        var points: [Point] = []
        for bl in blobs where bl.area >= 2 && bl.area <= maxArea {
            let w = bl.maxX - bl.minX + 1, h = bl.maxY - bl.minY + 1
            let fill = Double(bl.area) / Double(w * h)
            guard Double(max(w, h)) / Double(min(w, h)) <= 3, fill >= 0.3 else { continue }
            points.append(Point(
                f: fb, t: tb, x: bl.sx / Double(bl.area), y: bl.sy / Double(bl.area), a: Double(bl.area), fill: fill,
                moved: Double(over) / Double(n)
            ))
        }

        /* 잇기 — 직전 두 장면 안에 끝난 길에서, 예상 자리에 가깝고 넓이가 3배 넘게 안 바뀐 것 */
        let maxStep = Double(max(gw, gh)) * 0.06
        var used = [Bool](repeating: false, count: points.count)
        var kept: [[Point]] = []
        for var tr in tracks {
            guard let last = tr.last, fb - last.f <= 2 else { continue }
            var px = last.x, py = last.y
            if tr.count >= 2 {
                let prev = tr[tr.count - 2]
                let df = Double(max(1, last.f - prev.f))
                px += (last.x - prev.x) / df * Double(fb - last.f)
                py += (last.y - prev.y) / df * Double(fb - last.f)
            }
            var best = -1
            var bestD = maxStep * Double(fb - last.f)
            for (k, p) in points.enumerated() where !used[k] {
                let r = p.a / last.a
                guard r > 0.33, r < 3 else { continue }
                let dd = hypot(p.x - px, p.y - py)
                if dd <= bestD { bestD = dd; best = k }
            }
            if best >= 0 {
                used[best] = true
                tr.append(points[best])
            }
            kept.append(tr)
        }
        for (k, p) in points.enumerated() where !used[k] && kept.count < 80 { kept.append([p]) }
        tracks = kept

        guard armed else { return nil }
        if tb - lastHit >= MotionTrigger.REST_SEC, let hit = ballHit(fb: fb, receding: receding) {
            lastHit = tb
            tracks.removeAll()
            return hit
        }
        return motionHit(energy: energy, t: tb)
    }

    /// 확실한 공 — 6장 넘게 이은 길이 투수 뒤면 0.35배 밑으로 줄고(포수 뒤면 2.5배 넘게 크고), 거의 직선으로 갈 때
    private func ballHit(fb: Int, receding: Bool) -> Hit? {
        for tr in tracks where tr.count >= MotionTrigger.MIN_LENGTH && tr.last?.f == fb {
            let first = tr[0], last = tr[tr.count - 1]
            /* 빠진 장면이 많지 않게 · 처음 두 장 · 끝 두 장의 넓이 */
            guard last.f - first.f <= tr.count + 2 else { continue }
            let a0 = (tr[0].a + tr[1].a) / 2
            let a1 = (tr[tr.count - 1].a + tr[tr.count - 2].a) / 2
            var trend = 0
            for k in 1..<tr.count where receding ? tr[k].a <= tr[k - 1].a : tr[k].a >= tr[k - 1].a { trend += 1 }
            let wobble = MotionTrigger.wobble(tr)
            if tr.count == MotionTrigger.MIN_LENGTH {
                debug?("TRACK \(first.t) " + tr.map { String(format: "%.1f:%.1f:%.0f", $0.x, $0.y, $0.a) }.joined(separator: " ")
                       + String(format: " W=%.2f", wobble))
            }
            guard Double(trend) >= 0.6 * Double(tr.count - 1), wobble <= MotionTrigger.MAX_WOBBLE else { continue }
            /*
             * 길 동안 화면이 통째로 움직였으면 공이 아니다 — 손에 든 폰 · 폰을 만짐(2026-10-08 맥에 연결해 본 헛것: 바뀐 칸 평균 1.9~3.2%,
             * 진짜 공 10개는 0.3~1.4%)
             */
            guard tr.reduce(0, { $0 + $1.moved }) / Double(tr.count) <= MotionTrigger.MAX_MOVED else { continue }
            /* 가운데 70% 에서 시작 — 수평 단계에서 릴리스 포인트를 가운데 표적에 맞춘다. 가장자리(발 · 바닥 · 그물 끝)의 헛것을 뺀다 */
            let fx = first.x / Double(gw), fy = first.y / Double(gh)
            guard fx >= 0.15, fx <= 0.85, fy >= 0.15, fy <= 0.85 else { continue }
            let ok = receding
                ? (a0 >= MotionTrigger.MIN_AREA && a1 <= MotionTrigger.SHRINK * a0)
                : (a1 >= MotionTrigger.MIN_AREA && a1 >= MotionTrigger.GROW * a0)
            guard ok else { continue }
            return Hit(
                kind: "ball", atSec: first.t, strength: receding ? a0 / max(1, a1) : a1 / max(1, a0),
                length: tr.count, areaFirst: a0, areaLast: a1, x: first.x, y: first.y
            )
        }
        return nil
    }

    /// 자리(x, y)를 장면 차례에 맞춘 직선에서 벗어난 정도(제곱평균)
    private static func wobble(_ tr: [Point]) -> Double {
        let n = Double(tr.count)
        let fs = tr.map { Double($0.f) }
        let mf = fs.reduce(0, +) / n
        let vf = fs.reduce(0) { $0 + ($1 - mf) * ($1 - mf) }
        guard vf > 0 else { return 0 }
        var sum = 0.0
        for coord in [tr.map(\.x), tr.map(\.y)] {
            let mv = coord.reduce(0, +) / n
            var cov = 0.0
            for k in 0..<tr.count { cov += (fs[k] - mf) * (coord[k] - mv) }
            let b = cov / vf
            for k in 0..<tr.count {
                let r = coord[k] - (mv + b * (fs[k] - mf))
                sum += r * r
            }
        }
        return (sum / n).squareRoot()
    }

    /*
     * 움직임(예전 알아채기) — 볼 자리의 움직임 세기가 0.35초 넘게 조용하다가 평소의 3배(그리고 +4) 넘게 커지면. 투수의 와인드업에
     * 먼저 반응한다. 이것만으로는 공인지 모른다 — 사이트가 화면에 띄우지 않고 클립을 재 보고, 공이 없으면 조용히 넘긴다.
     */
    private var baseline = 0.0
    private var lastAbove = -Double.infinity
    private var lastMotion = -Double.infinity
    private var motionQuietSince = -Double.infinity

    private func motionHit(energy: Double, t: Double) -> Hit? {
        if baseline == 0 { baseline = max(0.5, energy) }
        let threshold = max(baseline * 3, baseline + 4)
        guard energy > threshold else {
            baseline = baseline * 0.97 + energy * 0.03
            return nil
        }
        defer { lastAbove = t }
        guard t - lastAbove >= 0.35, t - lastMotion >= 1.5, t - motionQuietSince >= 0.5 else { return nil }
        lastMotion = t
        return Hit(kind: "motion", atSec: t, strength: energy / max(0.5, baseline), length: 0, areaFirst: 0, areaLast: 0, x: 0, y: 0)
    }
}
// BALL_TRIGGER_END
