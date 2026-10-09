# 촬영 모드 앱 카메라 — 네이티브 부품 `ShootCamera` (김민에게)

2026-10-09 · 금윤호(Claude) 씀 · **만들 사람: 김민**(`mobile/` 은 김민 영역, 맥에서 굽고 폰에서 확인)

## 왜

- 사용자: "웹 카메라에서 못 찍게 하고 앱 카메라로 찍게 해줘."
- 관리자 촬영 모드(`/admin/shoot/N/run`)에서 운동 시범 영상을 찍어, 앞뒤를 자르고 소리를 빼서 라이브러리 영상으로 올린다(사이트 쪽은 끝남 — `lib/clip/`, `components/clip/clip-editor.tsx`).
- 웹의 `<input type="file" accept="video/*" capture>` 는 WebKit(`WKFileUploadPanel`)이 `UIImagePickerController.videoQuality` 를 안 정해 기본값 `.typeMedium`(약 480×360)으로 찍힌다. 라이브러리 영상으로 못 쓴다.
- 그래서 사이트는 웹 카메라를 걷었다. 앱에 이 부품이 있으면 [영상 찍기]가 보이고, 없으면(웹 · 옛 앱) "앱을 업데이트하면 여기서 바로 찍어요"만 보인다. 720p 보다 작은 영상은 편집 창이 올리기를 막는다.

## 약속(사이트 `lib/shoot-camera.ts` 가 이대로 부른다)

사이트는 Capacitor 패키지 없이 `window.Capacitor.nativePromise('ShootCamera', method, options)` 로 부르고, `isPluginAvailable('ShootCamera')` 로 있는지 본다.

| 메서드 | 받는 것 | 돌려주는 것 |
|---|---|---|
| `status()` | — | `{ version: 1, camera: boolean }` |
| `record({ maxSeconds })` | `maxSeconds` 기본 180 | 찍고 [비디오 사용] → `{ path, size }` · 취소 → `{ cancelled: true }` |
| `read({ path, offset, length })` | `length` 4MB 까지(사이트는 2MB 씩) | `{ data(base64), size, eof }` |
| `discard({ paths })` | 다 읽은 경로 | — |

거절(reject) 코드 — 사이트가 이 코드로 사람 말을 고른다:

| 코드 | 언제 | 사이트가 보이는 말 |
|---|---|---|
| `denied` | 카메라 권한 거절 · 제한 | "카메라 권한이 꺼져 있어요. 아이폰 설정 → 불펜로그 → 카메라를 켜 주세요." |
| `busy` | 카메라가 이미 열려 있음 | "카메라가 이미 열려 있어요." |
| `unavailable` | 카메라 없음 | 메시지 그대로 |
| 그 밖 | 실패 | 메시지 그대로 |

카메라 화면 조건:
- `sourceType = .camera`, `mediaTypes = [UTType.movie.identifier]`, `cameraCaptureMode = .video`, `cameraDevice = .rear`
- **`videoQuality = .typeHigh`**(뒤 카메라 1920×1080)
- `videoMaximumDuration = maxSeconds`, `allowsEditing = false`(자르기는 사이트 편집 창이 한다), 전체 화면
- 소리는 같이 녹음돼도 된다 — 사이트가 올릴 때 소리 트랙을 뺀다.

파일:
- 찍은 파일(`info[.mediaURL]`)을 `tmp/bullpen-shoot/<uuid>.mov` 로 옮기고 그 경로를 준다.
- `read` · `discard` 는 `record` 가 준 경로만 받는다(DualCamera 의 `issued` 와 같은 방식).
- 부품이 켜질 때(`load`) 하루 지난 `tmp/bullpen-shoot` 파일은 지운다.

## 참고 구현(컴파일 안 해 봄 — 윈도에서 썼다. 그대로 쓰지 말고 확인하며)

`mobile/ios/App/App/ShootCameraPlugin.swift` 새 파일(Xcode 에서 App 대상에 넣기), 그리고 `MainViewController.capacitorDidLoad()` 에 한 줄:

```swift
bridge?.registerPluginInstance(ShootCameraPlugin())
```

```swift
import AVFoundation
import Capacitor
import UIKit
import UniformTypeIdentifiers

/// 촬영 모드 앱 카메라 — 아이폰 기본 카메라 화면을 1080p 로 띄워 찍고, 찍은 파일을 사이트에 조금씩 넘긴다(사이트 lib/shoot-camera.ts).
@objc(ShootCameraPlugin)
public class ShootCameraPlugin: CAPPlugin, CAPBridgedPlugin, UIImagePickerControllerDelegate,
    UINavigationControllerDelegate
{
    public let identifier = "ShootCameraPlugin"
    public let jsName = "ShootCamera"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "record", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise),
    ]

    private var pending: CAPPluginCall?
    private var issued = Set<String>()
    private let lock = NSLock()

    private static var folder: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("bullpen-shoot", isDirectory: true)
    }

    override public func load() {
        // 하루 지난 촬영 파일 지우기(앱이 넘기기 전에 꺼진 것)
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(
            at: Self.folder, includingPropertiesForKeys: [.contentModificationDateKey])
        else { return }
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
        guard UIImagePickerController.isSourceTypeAvailable(.camera) else {
            call.reject("이 기기에는 카메라가 없어요.", "unavailable")
            return
        }
        let auth = AVCaptureDevice.authorizationStatus(for: .video)
        if auth == .denied || auth == .restricted {
            call.reject("카메라 권한이 꺼져 있어요.", "denied")
            return
        }
        let maxSeconds = call.getDouble("maxSeconds") ?? 180
        DispatchQueue.main.async {
            if self.pending != nil {
                call.reject("카메라가 이미 열려 있어요.", "busy")
                return
            }
            guard let host = self.bridge?.viewController else {
                call.reject("화면을 찾지 못했어요.", "failed")
                return
            }
            let picker = UIImagePickerController()
            picker.sourceType = .camera
            picker.mediaTypes = [UTType.movie.identifier]
            picker.cameraCaptureMode = .video
            picker.cameraDevice = .rear
            picker.videoQuality = .typeHigh
            picker.videoMaximumDuration = maxSeconds
            picker.allowsEditing = false
            picker.modalPresentationStyle = .fullScreen
            picker.delegate = self
            self.pending = call
            // 웹뷰 위에 다른 화면(창)이 떠 있으면 그 위에
            var top = host
            while let next = top.presentedViewController { top = next }
            top.present(picker, animated: true)
        }
    }

    public func imagePickerController(
        _ picker: UIImagePickerController,
        didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]
    ) {
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
            call.resolve([
                "data": data.base64EncodedString(),
                "size": Int(size),
                "eof": offset + UInt64(data.count) >= size,
            ])
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
```

확인할 것(내가 모르는 것):
- `UIImagePickerController` 의 영상 녹화는 마이크 권한도 묻는다. `Info.plist` 의 `NSMicrophoneUsageDescription` 이 지금 "투구 영상을 소리와 함께 찍을 때 마이크를 씁니다." 다. 촬영 영상은 소리를 빼고 올리니 "영상을 찍을 때 마이크 권한을 물어요. 운동 촬영 영상은 소리를 빼고 올려요." 쯤으로 바꿔도 된다(네 판단).
- 마이크를 거절해도 영상은 찍히는지(소리 없이) — 그러면 좋다.
- 앱은 세로 고정이다. 카메라 화면을 가로로 돌려 찍어도 영상 방향 정보가 맞게 붙는지(사이트 편집 창이 회전 정보를 읽는다).
- `.typeHigh` 가 HEVC 로 주는지 H.264 로 주는지. 둘 다 괜찮다 — 사이트가 H.264 로 다시 만든다(HEVC 를 못 풀면 잘라 붙이기).
- 가져오는 시간: 1080p 30초 ≈ 60MB → base64 2MB 조각 30번. 느리면 조각을 4MB 로(사이트 `lib/shoot-camera.ts` CHUNK).

## 폰에서 확인(새 앱을 깐 뒤)

1. 관리자로 `/admin/shoot/1/run` → 아래 [영상 찍기]가 보인다(옛 앱 · 사파리면 "앱을 업데이트하면…" 한 줄과 [찍음 · 다음으로]).
2. [영상 찍기] → 아이폰 카메라 화면(비디오) → 5초 찍기 → [비디오 사용] → '영상을 가져오는 중 n%' → 편집 창.
3. 편집 창 위에 화질 경고가 **없어야** 한다(1080×1920 또는 1920×1080). 경고가 뜨면 `videoQuality` 가 안 먹은 것.
4. 카메라에서 [취소] → 편집 창이 닫히고 그대로 촬영 모드.
5. 설정에서 카메라 권한을 끄고 [영상 찍기] → "카메라 권한이 꺼져 있어요…" 한 줄.
6. 편집 창에서 [올리기] → 라이브러리에서 그 운동 영상이 우리 영상(소리 없음)으로 바뀐다.
