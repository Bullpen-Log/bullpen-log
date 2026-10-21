import AVFoundation
import CoreMotion
import ExpoModulesCore
import UIKit

/// 구속 측정 카메라 — Expo 모듈 껍데기. 카메라 핵심(DualCameraController · MotionTrigger · SegmentRecorder)은 DualCameraCore.swift.
///
/// mobile/ 의 Capacitor 부품(DualCameraPlugin)과 같은 기능 · 같은 인자 · 같은 답을 낸다 — 사이트의 lib/dual-camera.ts ·
/// lib/velocity-engine/dual-capture.ts 가 쓰던 약속 그대로라 RN 쪽도 같은 모양으로 부른다. 다른 것은 미리보기 하나:
/// Capacitor 는 투명한 웹뷰 뒤에 그렸지만(setPreview 의 CSS 자리), 여기서는 RN 화면에 놓는 뷰(DualCameraPreview)가 품는다.
///
/// 알림: 'throw' { atSec, strength, kind, thermal } · 'error' { message } · 'fps' { fps, dropped, shutter, iso, thermal, feedMs, feedSkipped } · 'level' { x, y, z }(중력, 폰 좌표)
///
/// 앱만의 것(2026-10-17 3판): level(폰 기울기 — 웹은 deviceorientation) · keep(회원 클립을 앱 안 폴더에, Capacitor LocalVideo 와 같은 자리) ·
/// upload(관리자 클립을 서명 주소로 PUT) · speak(소리 안내).
public class DualCameraModule: Module {
    private var controller: DualCameraController?
    /// 넘겨준 클립 파일 — read · discard 는 이것만 받는다(다른 파일을 읽히지 않게)
    private var issued = Set<String>()
    private let issuedLock = NSLock()
    private let motion = CMMotionManager()
    /// 소리 안내(speak) — 하나를 두고 새 말이 오면 앞 말을 끊는다
    private let speech = AVSpeechSynthesizer()

    public func definition() -> ModuleDefinition {
        Name("DualCamera")

        Events("throw", "error", "fps", "level")

        OnDestroy {
            self.motion.stopDeviceMotionUpdates()
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

        /// 카메라 시계(초) — 장면 시각 · 던짐 알림 atSec 과 같은 시계(호스트 시계). 세션 통째 녹화가 '지금까지'를 자를 때 쓴다
        Function("now") { () -> Double in CACurrentMediaTime() }

        AsyncFunction("clip") { (options: [String: Any], promise: Promise) in
            guard let controller = self.controller else { return Self.off(promise) }
            guard let at = Self.number(options["atSec"]) else {
                return promise.reject("args", "atSec 가 없어요.")
            }
            let before = max(0.1, min(4, Self.number(options["beforeSec"]) ?? 0.6))
            /*
             * 뒤 길이 상한 6초(2026-10-19, 금윤호) — 조용할 때 훑기(capture.ts sweep)가 지난 6초 창을 한 번에 자른다. 4초였을 때는
             * 5초마다 4초만 훑어 매번 1~2초가 빈틈이었다(옛 Capacitor 앱 · 웹도 같은 상태). 앱이 쥔 영상은 8초(keepSec)라 여유가 있다.
             */
            let after = max(0.3, min(6, Self.number(options["afterSec"]) ?? 1.4))
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
            let short = max(120, min(1080, Self.int(options["short"]) ?? 720))
            controller.requestSnapshot(short: short) { result in
                if let result { promise.resolve(result) } else { promise.reject("snapshot", "장면을 받지 못했어요.") }
            }
        }

        AsyncFunction("read") { (options: [String: Any], promise: Promise) in
            guard let path = options["path"] as? String, self.isIssued(path) else {
                return promise.reject("path", "읽을 수 없는 파일이에요.")
            }
            let offset = UInt64(max(0, Self.int(options["offset"]) ?? 0))
            let length = max(1, min(4 * 1024 * 1024, Self.int(options["length"]) ?? 1024 * 1024))
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

        /// 폰 기울기 — 켜면 0.1초마다 'level' { x, y, z }(중력 방향, x 오른쪽 · y 위 · z 화면 밖 — 웹 lib/device-tilt.ts gravityOf 와 같은 좌표)
        AsyncFunction("level") { (options: [String: Any]) in
            let on = (options["on"] as? Bool) ?? false
            guard self.motion.isDeviceMotionAvailable else { return }
            if !on { return self.motion.stopDeviceMotionUpdates() }
            if self.motion.isDeviceMotionActive { return }
            /* 0.2초 — 0.1초면 JS 가 10Hz 로 화면을 다시 그려 계산기 · 다리와 CPU 를 다퉜다(2026-10-20). 수평계는 0.2초로도 매끈하다 */
            self.motion.deviceMotionUpdateInterval = 0.2
            self.motion.startDeviceMotionUpdates(to: .main) { [weak self] data, _ in
                guard let g = data?.gravity else { return }
                self?.sendEvent("level", ["x": g.x, "y": g.y, "z": g.z])
            }
        }

        /// 회원 클립을 앱 안 영상 폴더(Application Support/bullpen-videos, 백업 제외)로 옮긴다 → { id }(UUID). 옛 Capacitor 앱의
        /// LocalVideoPlugin 과 같은 폴더 · 같은 이름이라 그 영상 번호(서버 clipPath 의 local-…)로 다시 찾는다.
        AsyncFunction("keep") { (options: [String: Any], promise: Promise) in
            guard let path = options["path"] as? String, self.isIssued(path) else {
                return promise.reject("path", "옮길 수 없는 파일이에요.")
            }
            let fm = FileManager.default
            let base = fm.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            var store = base.appendingPathComponent("bullpen-videos", isDirectory: true)
            if !fm.fileExists(atPath: store.path) {
                try? fm.createDirectory(at: store, withIntermediateDirectories: true)
                var values = URLResourceValues()
                values.isExcludedFromBackup = true
                try? store.setResourceValues(values)
            }
            let id = UUID().uuidString
            let src = URL(fileURLWithPath: path)
            let ext = src.pathExtension.isEmpty ? "mp4" : src.pathExtension.lowercased()
            do {
                try fm.moveItem(at: src, to: store.appendingPathComponent("\(id).\(ext)"))
                self.forget(path)
                promise.resolve(["id": id])
            } catch {
                promise.reject("failed", "폰에 저장하지 못했어요.")
            }
        }

        /// 소리 안내 — 잰 구속 · 측정 불가를 한국어로 읽는다(웹 측정 화면 speechSynthesis 와 같은 말, 2026-10-21 김민). 앞 말은 끊는다.
        /// 무음 스위치를 켜 둔 현장에서도 들리게 playback, 다른 앱 소리(음악)는 그대로 섞는다
        AsyncFunction("speak") { (text: String) in
            DispatchQueue.main.async {
                let session = AVAudioSession.sharedInstance()
                try? session.setCategory(.playback, mode: .spokenAudio, options: [.mixWithOthers])
                try? session.setActive(true)
                if self.speech.isSpeaking { self.speech.stopSpeaking(at: .immediate) }
                let utterance = AVSpeechUtterance(string: text)
                utterance.voice = AVSpeechSynthesisVoice(language: "ko-KR")
                utterance.rate = min(AVSpeechUtteranceMaximumSpeechRate, AVSpeechUtteranceDefaultSpeechRate * 1.05)
                self.speech.speak(utterance)
            }
        }

        /// 클립 파일을 서명 주소로 PUT → { status }. 관리자 클립(서버 저장소)용
        AsyncFunction("upload") { (options: [String: Any], promise: Promise) in
            guard let path = options["path"] as? String, self.isIssued(path),
                  let target = (options["url"] as? String).flatMap(URL.init(string:)), target.scheme == "https"
            else { return promise.reject("args", "올릴 수 없는 파일이에요.") }
            var request = URLRequest(url: target)
            request.httpMethod = "PUT"
            request.setValue((options["contentType"] as? String) ?? "video/mp4", forHTTPHeaderField: "Content-Type")
            /*
             * 앱을 잠깐 내려도(LTE 로 마저 올리는 중 · 전화) 올리던 조각은 끝내게 — iOS 가 주는 몇십 초 안에서. 세션 녹화는 LTE · 5G 에서 조각이
             * 밀리면 폰에 두었다 측정을 끝낸 뒤 올리는데, 그사이 앱을 내리면 올리기가 멈췄다(2026-10-20 검토)
             */
            DispatchQueue.main.async {
                var bg = UIBackgroundTaskIdentifier.invalid
                let end = {
                    if bg != .invalid { UIApplication.shared.endBackgroundTask(bg) }
                    bg = .invalid
                }
                bg = UIApplication.shared.beginBackgroundTask(withName: "bullpen.dualcam.upload") { end() }
                Self.uploadSession.uploadTask(with: request, fromFile: URL(fileURLWithPath: path)) { _, response, error in
                    DispatchQueue.main.async { end() }
                    if let error { return promise.reject("network", error.localizedDescription) }
                    promise.resolve(["status": (response as? HTTPURLResponse)?.statusCode ?? 0])
                }.resume()
            }
        }

        View(DualCameraPreview.self) {}
    }

    private func begin(_ options: [String: Any], _ promise: Promise) {
        controller?.stop()
        DispatchQueue.main.async { PreviewHub.shared.setPreview(nil) }
        let config = DualCameraController.Config(
            fps: Int32(max(24, min(240, Self.int(options["fps"]) ?? 60))),
            preferFps: Int32(max(0, min(240, Self.int(options["preferFps"]) ?? 0))),
            short: Self.int(options["short"]).map { Int32($0) },
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
        controller.onFps = { [weak self] stats in
            /* 칸 뜻은 DualCameraController.onFps — thermal · feedMs · feedSkipped(2026-10-20 진단), droppedLate · droppedBuffers · writerSkipped · writerResets(같은 날 밤) */
            self?.sendEvent("fps", stats)
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

    private func forget(_ path: String) {
        issuedLock.lock()
        issued.remove(path)
        issuedLock.unlock()
    }

    /// 이 앱이 내준 클립인가 — 이번 실행에 내준 것, 또는 클립 폴더(tmp/bullpen-dualcam) 바로 안의 파일. 폴더 쪽은 앱을 껐다 켜도
    /// 저장 안 한 세션(JS 가 폰에 맡겨 둔 공 목록)의 클립을 붙일 수 있게 — 이름에 '/' · '..' 가 없는 파일만
    private func isIssued(_ path: String) -> Bool {
        issuedLock.lock()
        let known = issued.contains(path)
        issuedLock.unlock()
        if known { return true }
        let dir = FileManager.default.temporaryDirectory.appendingPathComponent("bullpen-dualcam", isDirectory: true).standardizedFileURL.path
        let url = URL(fileURLWithPath: path).standardizedFileURL
        return url.deletingLastPathComponent().path == dir && !url.lastPathComponent.contains("..")
            && FileManager.default.fileExists(atPath: url.path)
    }

    /// Expo 는 JS 숫자를 Double 로 넘긴다 — `as? Int` 는 nil 이라 offset · length · fps 를 못 읽어 늘 기본값이었다(2026-10-18 찾음:
    /// read 가 늘 처음 1MB 만 돌려줘 1MB 넘는 클립이 계산기에 망가진 채 갔다)
    /*
     * 올리기 한 번의 상한을 여기서 — 예전엔 JS 가 90초에 포기하고 같은 파일을 새 주소로 다시 올렸는데 앞선 올리기는 뒤에서 계속 돌아, 느린 LTE 에서
     * 대역폭을 두 배로 쓰고 어디에도 안 붙은 파일이 남았다(2026-10-20 검토). 이제 이 상한이 지나면 올리기 자체가 끝나고, JS 는 그보다 조금 더 기다린다
     * (native/src/velocity/session-recorder.ts PUT_TIMEOUT_MS). 끊김 없이 30초 동안 한 바이트도 못 보내도 끝낸다.
     */
    static let uploadTimeoutSec: TimeInterval = 120
    private static let uploadSession: URLSession = {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 30
        config.timeoutIntervalForResource = uploadTimeoutSec
        return URLSession(configuration: config)
    }()

    private static func int(_ value: Any?) -> Int? {
        number(value).map { Int($0) }
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
