import AVFoundation
import ExpoModulesCore
import UIKit

/// 촬영 모드 앱 카메라 — 뒤 카메라(기본 0.5배 광각, 1배로 바꿀 수 있음)를 1080p · 60fps 로 찍고, 찍은 파일을 사이트에 조금씩 넘긴다.
/// 옛 Capacitor 부품(mobile/ios/App/App/ShootCameraPlugin.swift)과 같은 약속(사이트 lib/shoot-camera.ts, docs/designs/shoot-camera-native.md) —
/// 새 앱은 웹 촬영 화면이 작은 다리(native/src/lib/cap-bridge.ts 의 window.Capacitor)로 이 모듈을 부른다. 소리는 담지 않는다.
public class ShootCameraModule: Module {
    /// 카메라 화면이 떠 있는 동안의 부름 — 메인 스레드에서만 만진다
    private var pending: Promise?
    /// record 가 준 경로만 read · discard 한다(DualCamera 의 issued 와 같은 방식)
    private var issued = Set<String>()
    private let lock = NSLock()

    static var folder: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("bullpen-shoot", isDirectory: true)
    }

    public func definition() -> ModuleDefinition {
        Name("ShootCamera")

        OnCreate {
            /* 하루 지난 촬영 파일 — 사이트가 넘겨받기 전에 앱이 꺼진 것 */
            let fm = FileManager.default
            guard let files = try? fm.contentsOfDirectory(at: Self.folder, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
            let dayAgo = Date().addingTimeInterval(-86_400)
            for url in files {
                let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
                if let date, date < dayAgo { try? fm.removeItem(at: url) }
            }
        }

        AsyncFunction("status") { () -> [String: Any] in
            let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil
            return ["version": 1, "camera": camera, "fps": ShootRecorderViewController.targetFps]
        }

        AsyncFunction("record") { (options: [String: Any], promise: Promise) in
            let maxSeconds = (options["maxSeconds"] as? NSNumber)?.doubleValue ?? 180
            DispatchQueue.main.async {
                if self.pending != nil {
                    promise.reject("busy", "카메라가 이미 열려 있어요.")
                    return
                }
                guard AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) != nil else {
                    promise.reject("unavailable", "이 기기에는 카메라가 없어요.")
                    return
                }
                switch AVCaptureDevice.authorizationStatus(for: .video) {
                case .denied, .restricted:
                    promise.reject("denied", "카메라 권한이 꺼져 있어요.")
                case .notDetermined:
                    AVCaptureDevice.requestAccess(for: .video) { ok in
                        DispatchQueue.main.async {
                            if ok { self.present(promise, maxSeconds) } else { promise.reject("denied", "카메라 권한이 꺼져 있어요.") }
                        }
                    }
                default:
                    self.present(promise, maxSeconds)
                }
            }
        }

        AsyncFunction("read") { (options: [String: Any], promise: Promise) in
            guard let path = options["path"] as? String, self.isIssued(path) else {
                return promise.reject("path", "읽을 수 없는 파일이에요.")
            }
            /* JS 숫자는 Double 로 온다 — as? Int 는 nil 이 된다(DualCamera 에서 겪음) */
            let offset = UInt64(max(0, (options["offset"] as? NSNumber)?.intValue ?? 0))
            let length = max(1, min(4 * 1024 * 1024, (options["length"] as? NSNumber)?.intValue ?? 1024 * 1024))
            do {
                let handle = try FileHandle(forReadingFrom: URL(fileURLWithPath: path))
                defer { try? handle.close() }
                let size = try handle.seekToEnd()
                try handle.seek(toOffset: min(offset, size))
                let data = try handle.read(upToCount: length) ?? Data()
                promise.resolve(["data": data.base64EncodedString(), "size": Int(size), "eof": offset + UInt64(data.count) >= size])
            } catch {
                promise.reject("read", "영상을 읽지 못했어요.")
            }
        }

        AsyncFunction("discard") { (options: [String: Any]) in
            for path in (options["paths"] as? [String]) ?? [] where self.isIssued(path) {
                try? FileManager.default.removeItem(atPath: path)
                self.lock.lock()
                self.issued.remove(path)
                self.lock.unlock()
            }
        }
    }

    private func present(_ promise: Promise, _ maxSeconds: Double) {
        guard var top = appContext?.utilities?.currentViewController() else {
            promise.reject("failed", "화면을 찾지 못했어요.")
            return
        }
        pending = promise
        let recorder = ShootRecorderViewController(maxSeconds: maxSeconds) { [weak self] result in
            guard let self, let promise = self.pending else { return }
            self.pending = nil
            switch result {
            case .cancelled:
                promise.resolve(["cancelled": true])
            case .failed(let message):
                promise.reject("failed", message)
            case .saved(let url):
                let size = (try? FileManager.default.attributesOfItem(atPath: url.path)[.size] as? NSNumber)?.intValue ?? 0
                self.lock.lock()
                self.issued.insert(url.path)
                self.lock.unlock()
                promise.resolve(["path": url.path, "size": size])
            }
        }
        recorder.modalPresentationStyle = .fullScreen
        /* 웹뷰 위에 다른 화면이 떠 있으면 그 위에 */
        while let next = top.presentedViewController { top = next }
        top.present(recorder, animated: true)
    }

    private func isIssued(_ path: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return issued.contains(path)
    }
}
