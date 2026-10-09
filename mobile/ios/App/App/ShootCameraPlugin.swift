import AVFoundation
import Capacitor
import UIKit
import UniformTypeIdentifiers

/// 촬영 모드 앱 카메라 — 아이폰 기본 카메라 화면을 1080p 로 띄워 찍고, 찍은 파일을 사이트에 조금씩 넘긴다(사이트 lib/shoot-camera.ts,
/// 약속은 docs/designs/shoot-camera-native.md). 웹의 <input capture> 는 WebKit 이 화질을 안 정해 약 480×360 으로 찍혀 걷었다.
@objc(ShootCameraPlugin)
public class ShootCameraPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
    public let identifier = "ShootCameraPlugin"
    public let jsName = "ShootCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "record", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise),
    ]

    /// 카메라 화면이 떠 있는 동안의 부름 — 메인 스레드에서만 만진다
    private var pending: CAPPluginCall?
    /// record 가 준 경로만 read · discard 한다(DualCamera 의 issued 와 같은 방식)
    private var issued = Set<String>()
    private let lock = NSLock()

    private static var folder: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("bullpen-shoot", isDirectory: true)
    }

    override public func load() {
        /* 하루 지난 촬영 파일 — 사이트가 넘겨받기 전에 앱이 꺼진 것 */
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: Self.folder, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let dayAgo = Date().addingTimeInterval(-86_400)
        for url in files {
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            if let date, date < dayAgo { try? fm.removeItem(at: url) }
        }
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["version": 1, "camera": UIImagePickerController.isSourceTypeAvailable(.camera)])
    }

    @objc func record(_ call: CAPPluginCall) {
        let maxSeconds = call.getDouble("maxSeconds") ?? 180
        DispatchQueue.main.async {
            guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
                call.reject("이 기기에는 카메라가 없어요.", "unavailable")
                return
            }
            let auth = AVCaptureDevice.authorizationStatus(for: .video)
            if auth == .denied || auth == .restricted {
                call.reject("카메라 권한이 꺼져 있어요.", "denied")
                return
            }
            if self.pending != nil {
                call.reject("카메라가 이미 열려 있어요.", "busy")
                return
            }
            guard var top = self.bridge?.viewController else {
                call.reject("화면을 찾지 못했어요.", "failed")
                return
            }
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.mediaTypes = [UTType.movie.identifier]
            picker.cameraCaptureMode = .video
            picker.cameraDevice = .rear
            /* 뒤 카메라 1920×1080 — 기본값(.typeMedium)은 480×360 이라 라이브러리 영상으로 못 쓴다 */
            picker.videoQuality = .typeHigh
            picker.videoMaximumDuration = maxSeconds
            /* 앞뒤 자르기는 사이트 편집 창이 한다 */
            picker.allowsEditing = false
            picker.modalPresentationStyle = .fullScreen
            picker.delegate = self
            self.pending = call
            /* 웹뷰 위에 다른 화면이 떠 있으면 그 위에 */
            while let next = top.presentedViewController { top = next }
            top.present(picker, animated: true)
        }
    }

    public func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
        let call = pending
        pending = nil
        picker.dismiss(animated: true)
        guard let call else { return }
        guard let source = info[.mediaURL] as? URL else {
            call.reject("영상을 받지 못했어요.", "failed")
            return
        }
        do {
            let fm = FileManager.default
            try fm.createDirectory(at: Self.folder, withIntermediateDirectories: true)
            let ext = source.pathExtension.isEmpty ? "mov" : source.pathExtension.lowercased()
            let dest = Self.folder.appendingPathComponent(UUID().uuidString + "." + ext)
            try fm.moveItem(at: source, to: dest)
            let size = (try fm.attributesOfItem(atPath: dest.path)[.size] as? NSNumber)?.intValue ?? 0
            lock.lock()
            issued.insert(dest.path)
            lock.unlock()
            call.resolve(["path": dest.path, "size": size])
        } catch {
            call.reject("찍은 영상을 저장하지 못했어요.", "failed")
        }
    }

    public func imagePickerControllerDidCancel(_ picker: UIImagePickerController) {
        let call = pending
        pending = nil
        picker.dismiss(animated: true)
        call?.resolve(["cancelled": true])
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
            call.resolve(["data": data.base64EncodedString(), "size": Int(size), "eof": offset + UInt64(data.count) >= size])
        } catch {
            call.reject("영상을 읽지 못했어요.", "read")
        }
    }

    @objc func discard(_ call: CAPPluginCall) {
        let paths = call.getArray("paths", String.self) ?? []
        for path in paths where isIssued(path) {
            try? FileManager.default.removeItem(atPath: path)
            lock.lock()
            issued.remove(path)
            lock.unlock()
        }
        call.resolve()
    }

    private func isIssued(_ path: String) -> Bool {
        lock.lock()
        defer { lock.unlock() }
        return issued.contains(path)
    }
}
