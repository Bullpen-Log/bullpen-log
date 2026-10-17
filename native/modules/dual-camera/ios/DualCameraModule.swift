import AVFoundation
import ExpoModulesCore
import UIKit

/// 구속 측정 카메라 — Expo 모듈 껍데기. 카메라 핵심(DualCameraController · MotionTrigger · SegmentRecorder)은 DualCameraCore.swift.
///
/// mobile/ 의 Capacitor 부품(DualCameraPlugin)과 같은 기능 · 같은 인자 · 같은 답을 낸다 — 사이트의 lib/dual-camera.ts ·
/// lib/velocity-engine/dual-capture.ts 가 쓰던 약속 그대로라 RN 쪽도 같은 모양으로 부른다. 다른 것은 미리보기 하나:
/// Capacitor 는 투명한 웹뷰 뒤에 그렸지만(setPreview 의 CSS 자리), 여기서는 RN 화면에 놓는 뷰(DualCameraPreview)가 품는다.
///
/// 알림: 'throw' { atSec, strength, kind, thermal } · 'error' { message } · 'fps' { fps, dropped, shutter, iso }
public class DualCameraModule: Module {
    private var controller: DualCameraController?
    /// 넘겨준 클립 파일 — read · discard 는 이것만 받는다(다른 파일을 읽히지 않게)
    private var issued = Set<String>()
    private let issuedLock = NSLock()

    public func definition() -> ModuleDefinition {
        Name("DualCamera")

        Events("throw", "error", "fps")

        OnDestroy {
            self.controller?.stop()
            DispatchQueue.main.async { PreviewHub.shared.setPreview(nil) }
        }

        AsyncFunction("status") { () -> [String: Any] in
            DualCameraController.probe()
        }

        AsyncFunction("start") { (options: [String: Any], promise: Promise) in
            switch AVCaptureDevice.authorizationStatus(for: .video) {
            case .authorized:
                self.begin(options, promise)
            case .notDetermined:
                AVCaptureDevice.requestAccess(for: .video) { granted in
                    if granted { self.begin(options, promise) } else { Self.denied(promise) }
                }
            default:
                Self.denied(promise)
            }
        }

        AsyncFunction("stop") { (promise: Promise) in
            self.controller?.stop()
            self.controller = nil
            DispatchQueue.main.async {
                PreviewHub.shared.setPreview(nil)
                promise.resolve(nil)
            }
        }

        /// 웹뷰 껍데기와 맞춘 자리만 남긴 것 — 미리보기는 DualCameraPreview 가 품으니 보이기 · 숨기기만 한다
        AsyncFunction("setPreview") { (options: [String: Any], promise: Promise) in
            let visible = (options["visible"] as? Bool) ?? true
            DispatchQueue.main.async {
                PreviewHub.shared.visible = visible
                promise.resolve(nil)
            }
        }

        AsyncFunction("setTrigger") { (options: [String: Any]) in
            let armed = options["armed"] as? Bool
            self.controller?.trigger.update(armed: armed, roi: Self.rect(options["roi"]))
            /* 측정을 시작하면 초점을 한 번 맞추고 잠그고, 멈추면 다시 계속 맞추기로 */
            if let armed { self.controller?.refocus(once: armed) }
        }

        AsyncFunction("diag") { (promise: Promise) in
            guard let controller = self.controller else { return Self.off(promise) }
            controller.diag { promise.resolve($0) }
        }

        AsyncFunction("tune") { (options: [String: Any], promise: Promise) in
            guard let controller = self.controller else { return Self.off(promise) }
            controller.tune(
                stabilization: options["stabilization"] as? Bool,
                zoom: Self.number(options["zoom"]),
                lens: Self.number(options["lens"]),
                autoFocus: (options["autoFocus"] as? Bool) == true
            ) { promise.resolve($0) }
        }

        AsyncFunction("focus") { (options: [String: Any], promise: Promise) in
            guard let controller = self.controller else { return Self.off(promise) }
            controller.refocus(point: Self.devicePoint(options["focus"]), far: options["far"] as? Bool)
            promise.resolve(nil)
        }

        AsyncFunction("clip") { (options: [String: Any], promise: Promise) in
            guard let controller = self.controller else { return Self.off(promise) }
            guard let at = Self.number(options["atSec"]) else {
                return promise.reject("args", "atSec 가 없어요.")
            }
            let before = max(0.1, min(4, Self.number(options["beforeSec"]) ?? 0.6))
            let after = max(0.3, min(4, Self.number(options["afterSec"]) ?? 1.4))
            controller.makeClips(at: at, before: before, after: after) { result in
                switch result {
                case .success(let clips):
                    self.remember([clips.main.path] + (clips.wide.map { [$0.path] } ?? []))
                    promise.resolve(["main": clips.main.json, "wide": clips.wide.map { $0.json as Any } ?? NSNull()])
                case .failure(let error):
                    promise.reject(error.code, error.message)
                }
            }
        }

        AsyncFunction("snapshot") { (options: [String: Any], promise: Promise) in
            guard let controller = self.controller else { return Self.off(promise) }
            let short = max(120, min(1080, (options["short"] as? Int) ?? 720))
            controller.requestSnapshot(short: short) { result in
                if let result { promise.resolve(result) } else { promise.reject("snapshot", "장면을 받지 못했어요.") }
            }
        }

        AsyncFunction("read") { (options: [String: Any], promise: Promise) in
            guard let path = options["path"] as? String, self.isIssued(path) else {
                return promise.reject("path", "읽을 수 없는 파일이에요.")
            }
            let offset = UInt64(max(0, (options["offset"] as? Int) ?? 0))
            let length = max(1, min(4 * 1024 * 1024, (options["length"] as? Int) ?? 1024 * 1024))
            do {
                let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
                defer { try? handle.close() }
                let size = try handle.seekToEnd()
                try handle.seek(toOffset: min(offset, size))
                let data = try handle.read(upToCount: length) ?? Data()
                promise.resolve([
                    "data": data.base64EncodedString(),
                    "size": Int(size),
                    "eof": offset + UInt64(data.count) >= size,
                ])
            } catch {
                promise.reject("read", "클립을 읽지 못했어요.")
            }
        }

        AsyncFunction("discard") { (options: [String: Any]) in
            for path in (options["paths"] as? [String]) ?? [] where self.isIssued(path) {
                try? FileManager.default.removeItem(atPath: path)
                self.issuedLock.lock()
                self.issued.remove(path)
                self.issuedLock.unlock()
            }
        }

        View(DualCameraPreview.self) {}
    }

    private func begin(_ options: [String: Any], _ promise: Promise) {
        controller?.stop()
        DispatchQueue.main.async { PreviewHub.shared.setPreview(nil) }
        let config = DualCameraController.Config(
            fps: Int32(max(24, min(240, (options["fps"] as? Int) ?? 60))),
            preferFps: Int32(max(0, min(240, (options["preferFps"] as? Int) ?? 0))),
            short: (options["short"] as? Int).map { Int32($0) },
            net: (options["net"] as? Bool) ?? false,
            roi: Self.rect(options["roi"]) ?? MotionTrigger.defaultRoi,
            armed: (options["armed"] as? Bool) ?? true,
            zoom: max(1, min(4, Self.number(options["zoom"]) ?? 1)),
            wide: (options["wide"] as? Bool) ?? false,
            focusPoint: Self.devicePoint(options["focus"]) ?? CGPoint(x: 0.5, y: 0.5),
            /* 부르는 쪽이 정한다(투수 뒤 · 네트면 먼 곳만). 안 보내면 끔 */
            focusFar: (options["focusFar"] as? Bool) ?? false
        )
        let controller = DualCameraController()
        controller.onThrow = { [weak self] at, strength, kind, thermal in
            /* thermal — ProcessInfo.ThermalState(0 보통 · 1 따뜻 · 2 뜨거움 · 3 아주 뜨거움) */
            self?.sendEvent("throw", ["atSec": at, "strength": strength, "kind": kind, "thermal": thermal])
        }
        controller.onError = { [weak self] message in
            self?.sendEvent("error", ["message": message])
        }
        controller.onFps = { [weak self] fps, dropped, shutter, iso in
            self?.sendEvent("fps", ["fps": fps, "dropped": dropped, "shutter": shutter, "iso": iso])
        }
        self.controller = controller
        controller.start(
            config: config,
            attach: { view in PreviewHub.shared.setPreview(view) },
            completion: { [weak self] result in
                switch result {
                case .success(let info):
                    promise.resolve(info)
                case .failure(let error):
                    controller.stop()
                    DispatchQueue.main.async { PreviewHub.shared.setPreview(nil) }
                    if self?.controller === controller { self?.controller = nil }
                    promise.reject(error.code, error.message)
                }
            }
        )
    }

    // MARK: - 도움

    private static func denied(_ promise: Promise) {
        promise.reject("denied", "카메라를 쓸 수 없어요. 설정에서 카메라를 허락해 주세요.")
    }

    private static func off(_ promise: Promise) {
        promise.reject("off", "카메라가 꺼져 있어요.")
    }

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

    private static func number(_ value: Any?) -> Double? {
        if let v = value as? Double { return v }
        if let v = value as? Int { return Double(v) }
        if let v = value as? NSNumber { return v.doubleValue }
        return nil
    }

    /// 세로 화면의 점(0~1, { x, y }) → 장치 좌표(가로 센서 기준 — 초점 · 노출 자리). 세로 (u, v) = 장치 (v, 1 − u)
    static func devicePoint(_ value: Any?) -> CGPoint? {
        guard let o = value as? [String: Any], let u = number(o["x"]), let v = number(o["y"]) else { return nil }
        return CGPoint(x: v, y: 1 - u)
    }

    static func rect(_ value: Any?) -> CGRect? {
        guard let o = value as? [String: Any],
              let x = number(o["x"]), let y = number(o["y"]),
              let w = number(o["w"]), let h = number(o["h"]),
              w > 0, h > 0
        else { return nil }
        return CGRect(x: x, y: y, width: w, height: h)
    }
}

/// 카메라가 만든 미리보기 화면(DualPreviewView)과 RN 화면에 놓인 자리(DualCameraPreview)를 잇는다. 카메라를 먼저 켜든 자리를
/// 먼저 그리든, 둘이 다 있으면 붙인다. 주 스레드에서만 만진다.
final class PreviewHub {
    static let shared = PreviewHub()
    private var preview: DualPreviewView?
    private weak var host: DualCameraPreview?
    var visible = true {
        didSet { preview?.isHidden = !visible }
    }

    func setPreview(_ view: DualPreviewView?) {
        preview?.removeFromSuperview()
        preview = view
        view?.isHidden = !visible
        attach()
    }

    func setHost(_ view: DualCameraPreview?) {
        host = view
        attach()
    }

    func hostGone(_ view: DualCameraPreview) {
        if host === view {
            host = nil
            preview?.removeFromSuperview()
        }
    }

    private func attach() {
        guard let preview, let host else { return }
        preview.frame = host.bounds
        preview.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        host.insertSubview(preview, at: 0)
    }
}

/// RN 화면에 놓는 미리보기 자리 — <DualCameraPreview style={…} />. 카메라가 켜져 있으면 그 화면이 이 안을 가득 채운다.
final class DualCameraPreview: ExpoView {
    required init(appContext: AppContext? = nil) {
        super.init(appContext: appContext)
        clipsToBounds = true
        backgroundColor = .black
    }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        if window != nil { PreviewHub.shared.setHost(self) } else { PreviewHub.shared.hostGone(self) }
    }
}
