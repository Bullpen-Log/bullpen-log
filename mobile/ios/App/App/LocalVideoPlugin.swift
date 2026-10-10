import Capacitor
import Photos
import UIKit

/// 회원 영상을 폰의 사진 앱 '불펜로그' 앨범에 둔다 — 서버(Supabase)에는 올리지 않는다(2026-10-10 사용자: 회원 영상은 폰, 관리자 ·
/// 나중의 유료 클라우드 · 팀 기능만 서버). 사이트(lib/local-video.ts)가 부르는 약속:
///   status()                              → { version: 1, access: 'authorized' | 'limited' | 'denied' | 'notDetermined' }
///   requestAccess()                       → { access }
///   begin({ ext })                        → { token }            사이트가 만든 영상을 조금씩 받을 임시 파일
///   append({ token, data(base64) })       → { size }             4MB 까지씩
///   finish({ token })                     → { id }               앨범에 넣고 임시 파일 지움 · id = PHAsset.localIdentifier
///   saveFile({ path })                    → { id }               앱이 이미 가진 파일(앱 임시 폴더 안)을 앨범에
///   load({ id })                          → { path, size }       앨범 영상을 임시 파일로 꺼냄(아이클라우드에만 있으면 받음) · 없으면 code 'missing'
///   read({ path, offset, length })        → { data, size, eof }  load 가 준 경로만
///   discard({ paths })                    다 읽은 파일 지우기
///   exists({ ids })                       → { found: [id] }      아직 사진 앱에 있는 것만
/// 사진 접근은 '읽고 쓰기'로 청한다 — 저장한 영상을 다시 찾아 재생해야 해서(쓰기만 허락하면 다시 못 읽는다). 사용자가 '선택한 사진만'(limited)을
/// 골라도 이 앱이 넣은 영상은 저절로 그 선택에 든다.
@objc(LocalVideoPlugin)
public class LocalVideoPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "LocalVideoPlugin"
    public let jsName = "LocalVideo"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "status", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "requestAccess", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "begin", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "append", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finish", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "saveFile", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "load", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "read", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "discard", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "exists", returnType: CAPPluginReturnPromise),
    ]

    static let albumTitle = "불펜로그"
    private static let maxChunk = 4 * 1024 * 1024

    /// begin 이 준 토큰 → 받는 중인 임시 파일
    private var incoming: [String: URL] = [:]
    /// load 가 준 경로만 read · discard 한다
    private var issued = Set<String>()
    private let lock = NSLock()

    private static var folder: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("bullpen-local-video", isDirectory: true)
    }

    override public func load() {
        /* 하루 지난 임시 파일 — 앱이 중간에 꺼진 것 */
        let fm = FileManager.default
        guard let files = try? fm.contentsOfDirectory(at: Self.folder, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
        let dayAgo = Date().addingTimeInterval(-86_400)
        for url in files {
            let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
            if let date, date < dayAgo { try? fm.removeItem(at: url) }
        }
    }

    // MARK: 권한

    private static func accessText(_ s: PHAuthorizationStatus) -> String {
        switch s {
        case .authorized: return "authorized"
        case .limited: return "limited"
        case .denied, .restricted: return "denied"
        default: return "notDetermined"
        }
    }

    private static var canUse: Bool {
        let s = PHPhotoLibrary.authorizationStatus(for: .readWrite)
        return s == .authorized || s == .limited
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["version": 1, "access": Self.accessText(PHPhotoLibrary.authorizationStatus(for: .readWrite))])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        PHPhotoLibrary.requestAuthorization(for: .readWrite) { s in
            call.resolve(["access": Self.accessText(s)])
        }
    }

    // MARK: 저장

    @objc func begin(_ call: CAPPluginCall) {
        let ext = (call.getString("ext") ?? "mp4").lowercased().filter { $0.isLetter || $0.isNumber }
        do {
            try FileManager.default.createDirectory(at: Self.folder, withIntermediateDirectories: true)
            let token = UUID().uuidString
            let url = Self.folder.appendingPathComponent("in-\(token).\(ext.isEmpty ? "mp4" : ext)")
            guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw CocoaError(.fileWriteUnknown) }
            lock.lock(); incoming[token] = url; lock.unlock()
            call.resolve(["token": token])
        } catch {
            call.reject("임시 파일을 만들지 못했어요.", "failed")
        }
    }

    @objc func append(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), let url = fileFor(token) else {
            call.reject("받는 중인 영상이 아니에요.", "token")
            return
        }
        guard let b64 = call.getString("data"), let data = Data(base64Encoded: b64), data.count <= Self.maxChunk else {
            call.reject("조각이 올바르지 않아요.", "data")
            return
        }
        do {
            let handle = try FileHandle(forWritingTo: url)
            defer { try? handle.close() }
            let size = try handle.seekToEnd()
            try handle.write(contentsOf: data)
            call.resolve(["size": Int(size) + data.count])
        } catch {
            call.reject("영상을 쓰지 못했어요.", "failed")
        }
    }

    @objc func finish(_ call: CAPPluginCall) {
        guard let token = call.getString("token"), let url = fileFor(token) else {
            call.reject("받는 중인 영상이 아니에요.", "token")
            return
        }
        lock.lock(); incoming.removeValue(forKey: token); lock.unlock()
        saveToAlbum(url, removeAfter: true, call)
    }

    /// 앱이 이미 가진 파일(구속 측정 클립 등) — 앱 임시 폴더 안의 것만
    @objc func saveFile(_ call: CAPPluginCall) {
        guard let path = call.getString("path") else {
            call.reject("경로가 없어요.", "path")
            return
        }
        let url = URL(fileURLWithPath: path).standardizedFileURL
        let tmp = FileManager.default.temporaryDirectory.standardizedFileURL.path
        guard url.path.hasPrefix(tmp + "/"), FileManager.default.fileExists(atPath: url.path) else {
            call.reject("저장할 수 없는 파일이에요.", "path")
            return
        }
        saveToAlbum(url, removeAfter: false, call)
    }

    private func saveToAlbum(_ url: URL, removeAfter: Bool, _ call: CAPPluginCall) {
        guard Self.canUse else {
            if removeAfter { try? FileManager.default.removeItem(at: url) }
            call.reject("사진 접근이 꺼져 있어요.", "denied")
            return
        }
        Self.album { album in
            var placeholder: PHObjectPlaceholder?
            PHPhotoLibrary.shared().performChanges({
                guard let req = PHAssetChangeRequest.creationRequestForAssetFromVideo(atFileURL: url) else { return }
                placeholder = req.placeholderForCreatedAsset
                if let album, let ph = placeholder,
                   let add = PHAssetCollectionChangeRequest(for: album) {
                    add.addAssets([ph] as NSArray)
                }
            }) { ok, _ in
                if removeAfter { try? FileManager.default.removeItem(at: url) }
                if ok, let id = placeholder?.localIdentifier {
                    call.resolve(["id": id])
                } else {
                    call.reject("사진 앱에 저장하지 못했어요.", "failed")
                }
            }
        }
    }

    /// '불펜로그' 앨범 — 없으면 만든다. 못 만들면 nil(영상은 '최근 항목'에만 들어간다)
    private static func album(_ done: @escaping (PHAssetCollection?) -> Void) {
        let find: () -> PHAssetCollection? = {
            let opts = PHFetchOptions()
            opts.predicate = NSPredicate(format: "title = %@", albumTitle)
            return PHAssetCollection.fetchAssetCollections(with: .album, subtype: .albumRegular, options: opts).firstObject
        }
        if let found = find() { return done(found) }
        var ph: PHObjectPlaceholder?
        PHPhotoLibrary.shared().performChanges({
            ph = PHAssetCollectionChangeRequest.creationRequestForAssetCollection(withTitle: albumTitle).placeholderForCreatedAssetCollection
        }) { ok, _ in
            if ok, let id = ph?.localIdentifier {
                done(PHAssetCollection.fetchAssetCollections(withLocalIdentifiers: [id], options: nil).firstObject)
            } else {
                done(find())
            }
        }
    }

    // MARK: 꺼내기

    @objc func load(_ call: CAPPluginCall) {
        guard Self.canUse else {
            call.reject("사진 접근이 꺼져 있어요.", "denied")
            return
        }
        guard let id = call.getString("id"),
              let asset = PHAsset.fetchAssets(withLocalIdentifiers: [id], options: nil).firstObject else {
            call.reject("사진 앱에 그 영상이 없어요.", "missing")
            return
        }
        let resources = PHAssetResource.assetResources(for: asset)
        guard let res = resources.first(where: { $0.type == .fullSizeVideo }) ?? resources.first(where: { $0.type == .video }) else {
            call.reject("영상이 아니에요.", "missing")
            return
        }
        do {
            try FileManager.default.createDirectory(at: Self.folder, withIntermediateDirectories: true)
        } catch {
            call.reject("임시 폴더를 만들지 못했어요.", "failed")
            return
        }
        let ext = (res.originalFilename as NSString).pathExtension.lowercased()
        let url = Self.folder.appendingPathComponent("out-\(UUID().uuidString).\(ext.isEmpty ? "mp4" : ext)")
        let opts = PHAssetResourceRequestOptions()
        opts.isNetworkAccessAllowed = true
        PHAssetResourceManager.default().writeData(for: res, toFile: url, options: opts) { error in
            if error != nil {
                call.reject("영상을 꺼내지 못했어요.", "failed")
                return
            }
            let size = ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int) ?? 0
            self.lock.lock(); self.issued.insert(url.path); self.lock.unlock()
            call.resolve(["path": url.path, "size": size])
        }
    }

    @objc func read(_ call: CAPPluginCall) {
        guard let path = call.getString("path"), isIssued(path) else {
            call.reject("읽을 수 없는 파일이에요.", "path")
            return
        }
        let offset = UInt64(max(0, call.getInt("offset") ?? 0))
        let length = max(1, min(Self.maxChunk, call.getInt("length") ?? 1024 * 1024))
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
        for path in call.getArray("paths", String.self) ?? [] where isIssued(path) {
            try? FileManager.default.removeItem(atPath: path)
            lock.lock(); issued.remove(path); lock.unlock()
        }
        call.resolve()
    }

    @objc func exists(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        guard Self.canUse, !ids.isEmpty else {
            call.resolve(["found": []])
            return
        }
        var found: [String] = []
        PHAsset.fetchAssets(withLocalIdentifiers: ids, options: nil).enumerateObjects { a, _, _ in found.append(a.localIdentifier) }
        call.resolve(["found": found])
    }

    // MARK: 도움

    private func fileFor(_ token: String) -> URL? {
        lock.lock(); defer { lock.unlock() }
        return incoming[token]
    }

    private func isIssued(_ path: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return issued.contains(path)
    }
}
