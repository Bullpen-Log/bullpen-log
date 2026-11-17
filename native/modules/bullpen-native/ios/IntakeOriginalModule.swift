import ExpoModulesCore
import Photos
import PhotosUI
import UIKit

public class IntakeOriginalModule: Module {
    public func definition() -> ModuleDefinition {
        Name("IntakeOriginal")
        AsyncFunction("authorize") { (promise: Promise) in
            PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
                promise.resolve(status == .authorized || status == .limited)
            }
        }
        AsyncFunction("pick") { (promise: Promise) in
            DispatchQueue.main.async { OriginalPicker.shared.open(promise) }
        }
        AsyncFunction("cancel") { (promise: Promise) in
            DispatchQueue.main.async { OriginalPicker.shared.cancel(); promise.resolve(nil) }
        }
    }
}

/// Copy the Photos original resource directly to an application-private file, without export/transcoding.
private final class OriginalPicker: NSObject, PHPickerViewControllerDelegate {
    static let shared = OriginalPicker()
    private var promise: Promise?
    private var picker: PHPickerViewController?
    private var generation = UUID()
    private var cleaned = false

    func cancel() {
        generation = UUID()
        picker?.dismiss(animated: false)
        picker = nil
        promise?.reject("cancelled", "원본 선택이 취소되었습니다.")
        promise = nil
    }

    func open(_ next: Promise) {
        guard promise == nil else { next.reject("busy", "이미 원본을 선택하고 있습니다."); return }
        generation = UUID()
        let operation = generation
        if !cleaned {
            // All pre-existing copies belong to an earlier app process. Never back them up.
            let old = FileManager.default.temporaryDirectory.appendingPathComponent("intake-original", isDirectory: true)
            try? FileManager.default.removeItem(at: old)
            cleaned = true
        }
        promise = next
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { status in
            DispatchQueue.main.async {
                guard self.generation == operation else { return }
                guard status == .authorized || status == .limited else { self.fail("사진 접근을 허용한 뒤 다시 선택합니다."); return }
                guard var presenter = UIApplication.shared.connectedScenes.compactMap({ $0 as? UIWindowScene }).flatMap({ $0.windows }).first(where: { $0.isKeyWindow })?.rootViewController else { self.fail("선택 화면을 열지 못했습니다."); return }
                while let shown = presenter.presentedViewController { presenter = shown }
                var config = PHPickerConfiguration(photoLibrary: .shared())
                config.filter = .videos
                config.selectionLimit = 1
                config.preferredAssetRepresentationMode = .current
                let view = PHPickerViewController(configuration: config)
                view.delegate = self
                self.picker = view
                presenter.present(view, animated: true)
            }
        }
    }
    func picker(_ picker: PHPickerViewController, didFinishPicking results: [PHPickerResult]) {
        guard self.picker === picker, promise != nil else { return }
        picker.dismiss(animated: true)
        self.picker = nil
        guard let chosen = results.first else { promise?.resolve(nil); promise = nil; return }
        guard let id = chosen.assetIdentifier, let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject,
              let resource = PHAssetResource.assetResources(for: asset).first(where: { $0.type == .video }) else {
            fail("선택한 영상의 원본에 접근하지 못했습니다. 사진 접근 설정을 확인하거나 파일 방식을 사용합니다.")
            return
        }
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent("intake-original", isDirectory: true)
        do { try FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true) }
        catch { fail("원본을 저장할 공간을 준비하지 못했습니다."); return }
        let ext = (resource.originalFilename as NSString).pathExtension.lowercased()
        guard ["mov", "mp4", "m4v"].contains(ext) else { fail("MOV 또는 MP4 원본을 선택합니다."); return }
        let url = folder.appendingPathComponent(UUID().uuidString).appendingPathExtension(ext)
        var values = URLResourceValues(); values.isExcludedFromBackup = true
        var excluded = folder; try? excluded.setResourceValues(values)
        let options = PHAssetResourceRequestOptions()
        options.isNetworkAccessAllowed = true
        let operation = generation
        PHAssetResourceManager.default().writeData(for: resource, toFile: url, options: options) { error in
            DispatchQueue.main.async {
                guard self.generation == operation else { try? FileManager.default.removeItem(at: url); return }
                if error != nil { try? FileManager.default.removeItem(at: url); self.fail("iCloud 원본을 준비하지 못했습니다. 연결과 저장 공간을 확인합니다."); return }
                self.promise?.resolve(["uri": url.absoluteString, "name": resource.originalFilename])
                self.promise = nil
            }
        }
    }
    private func fail(_ message: String) { promise?.reject("original_unavailable", message); promise = nil }
}
