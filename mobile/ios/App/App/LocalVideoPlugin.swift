import Capacitor
import UIKit

/// 회원 영상을 폰의 앱 안(Application Support/bullpen-videos)에 둔다 — 서버(Supabase)에도, 사진 앱 · 아이클라우드에도 두지 않는다
/// (2026-10-10 사용자: 회원 영상은 폰 → "아이클라우드에 저장돼서 별로, 앱 내부에만"). 아이폰 백업(아이클라우드)에서도 뺀다.
/// 그래서 앱을 지우면 영상도 지워진다. 사이트(lib/local-video.ts)가 부르는 약속:
///   status()                              → { version: 2, access: 'authorized' }   (사진 접근이 필요 없다 — 옛 약속 모양만 지킴)
///   requestAccess()                       → { access: 'authorized' }
///   begin({ ext })                        → { token }            사이트가 만든 영상을 조금씩 받을 임시 파일
///   append({ token, data(base64) })       → { size }             4MB 까지씩
///   finish({ token })                     → { id }               앱 안 폴더로 옮김 · id = UUID
///   saveFile({ path })                    → { id }               앱이 이미 가진 파일(앱 임시 폴더 안)을 복사
///   load({ id })                          → { path, size }       그 영상 파일 · 없으면 code 'missing'
///   read({ path, offset, length })        → { data, size, eof }  load 가 준 경로만
///   discard({ paths })                    읽기 끝(앱 안 영상은 지우지 않는다)
///   exists({ ids })                       → { found: [id] }
///   remove({ ids })                       앱 안 영상 지우기
///
/// 운동 · 드릴(라이브러리) 영상 — 2026-10-13 김민: "영상을 줄여서 앱 안에 넣는 방안". 서버 전송 비용을 줄인다.
///   libraryStatus()                       → { bundled, cached, cacheBytes }   앱에 든 영상 수 · 폰에 받아 둔 수
///   libraryLoad({ key })                  → { path, size, source }  앱 안(LibraryVideos/<key>.mp4) → 받아 둔 것 순, 없으면 'missing'
///   libraryFetch({ key, url })            → { path, size }          https 주소에서 한 번 받아 둠(Caches — 공간이 모자라면 iOS 가 지울 수 있음)
///   libraryPrune({ keep: [key] })         → { removed }             받아 둔 것 중 keep 에 없는 것(지운 · 바꾼 영상) 지우기
/// key 는 저장소 경로 'library/<uuid>.mp4' 의 <uuid> — 올릴 때마다 새로 붙어, 영상을 고치면 key 도 바뀐다.
/// 앱 안 영상은 npm run library:bundle 이 넣는다(720p). read · discard 는 회원 영상과 같이 쓴다.
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
        CAPPluginMethod(name: "remove", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "libraryStatus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "libraryLoad", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "libraryFetch", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "libraryPrune", returnType: CAPPluginReturnPromise),
    ]

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

    /// 앱 안 영상 폴더 — 아이폰 백업에서 뺀다
    private static var store: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        var url = base.appendingPathComponent("bullpen-videos", isDirectory: true)
        if !FileManager.default.fileExists(atPath: url.path) {
            try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? url.setResourceValues(values)
        }
        return url
    }

    /// id(UUID) → 앱 안 파일. 꼴이 틀리거나 없으면 nil
    private static func stored(_ id: String) -> URL? {
        guard UUID(uuidString: id) != nil,
              let names = try? FileManager.default.contentsOfDirectory(atPath: store.path),
              let name = names.first(where: { ($0 as NSString).deletingPathExtension == id }) else { return nil }
        return store.appendingPathComponent(name)
    }

    @objc func status(_ call: CAPPluginCall) {
        call.resolve(["version": 2, "access": "authorized"])
    }

    @objc func requestAccess(_ call: CAPPluginCall) {
        call.resolve(["access": "authorized"])
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
        keep(url, move: true, call)
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
        keep(url, move: false, call)
    }

    private func keep(_ url: URL, move: Bool, _ call: CAPPluginCall) {
        let id = UUID().uuidString
        let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension.lowercased()
        let dest = Self.store.appendingPathComponent("\(id).\(ext)")
        do {
            if move { try FileManager.default.moveItem(at: url, to: dest) } else { try FileManager.default.copyItem(at: url, to: dest) }
            call.resolve(["id": id])
        } catch {
            if move { try? FileManager.default.removeItem(at: url) }
            call.reject("폰에 저장하지 못했어요.", "failed")
        }
    }

    // MARK: 꺼내기

    @objc func load(_ call: CAPPluginCall) {
        guard let id = call.getString("id"), let url = Self.stored(id) else {
            call.reject("이 폰에 그 영상이 없어요.", "missing")
            return
        }
        let size = ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int) ?? 0
        lock.lock(); issued.insert(url.path); lock.unlock()
        call.resolve(["path": url.path, "size": size])
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

    /// 읽기 끝 — 앱 안 영상 자체는 그대로 둔다(지우기는 remove)
    @objc func discard(_ call: CAPPluginCall) {
        for path in call.getArray("paths", String.self) ?? [] {
            lock.lock(); issued.remove(path); lock.unlock()
        }
        call.resolve()
    }

    @objc func exists(_ call: CAPPluginCall) {
        let ids = call.getArray("ids", String.self) ?? []
        call.resolve(["found": ids.filter { Self.stored($0) != nil }])
    }

    @objc func remove(_ call: CAPPluginCall) {
        for id in call.getArray("ids", String.self) ?? [] {
            if let url = Self.stored(id) { try? FileManager.default.removeItem(at: url) }
        }
        call.resolve()
    }

    // MARK: 라이브러리 영상

    /// 받아 둔 영상 상한 — 넘으면 가장 오래 안 본 것부터 지운다
    private static let libraryCacheLimit: Int64 = 1024 * 1024 * 1024

    private static var libraryCache: URL {
        let base = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        let url = base.appendingPathComponent("bullpen-library", isDirectory: true)
        try? FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
        return url
    }

    private static func validKey(_ key: String?) -> String? {
        guard let key, !key.isEmpty, key.count <= 64,
              key.allSatisfy({ $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }) else { return nil }
        return key
    }

    private static func bundled(_ key: String) -> URL? {
        Bundle.main.url(forResource: key, withExtension: "mp4", subdirectory: "LibraryVideos")
    }

    private static func cached(_ key: String) -> URL? {
        let url = libraryCache.appendingPathComponent("\(key).mp4")
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    private static func fileSize(_ url: URL) -> Int {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int) ?? 0
    }

    @objc func libraryStatus(_ call: CAPPluginCall) {
        let inBundle = Bundle.main.urls(forResourcesWithExtension: "mp4", subdirectory: "LibraryVideos")?.count ?? 0
        let files = (try? FileManager.default.contentsOfDirectory(at: Self.libraryCache, includingPropertiesForKeys: nil)) ?? []
        let mp4 = files.filter { $0.pathExtension == "mp4" }
        call.resolve(["bundled": inBundle, "cached": mp4.count, "cacheBytes": mp4.reduce(0) { $0 + Self.fileSize($1) }])
    }

    @objc func libraryLoad(_ call: CAPPluginCall) {
        guard let key = Self.validKey(call.getString("key")) else {
            call.reject("영상 이름이 올바르지 않아요.", "key")
            return
        }
        let source: String
        let url: URL
        if let b = Self.bundled(key) {
            source = "bundle"; url = b
        } else if let c = Self.cached(key) {
            source = "cache"; url = c
            /* 본 때를 남긴다 — 상한을 넘으면 오래 안 본 것부터 지운다 */
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: c.path)
        } else {
            call.reject("폰에 없는 영상이에요.", "missing")
            return
        }
        lock.lock(); issued.insert(url.path); lock.unlock()
        call.resolve(["path": url.path, "size": Self.fileSize(url), "source": source])
    }

    @objc func libraryFetch(_ call: CAPPluginCall) {
        guard let key = Self.validKey(call.getString("key")) else {
            call.reject("영상 이름이 올바르지 않아요.", "key")
            return
        }
        guard let raw = call.getString("url"), let remote = URL(string: raw), remote.scheme == "https" else {
            call.reject("주소가 올바르지 않아요.", "url")
            return
        }
        if Self.bundled(key) != nil || Self.cached(key) != nil {
            libraryLoad(call)
            return
        }
        URLSession.shared.downloadTask(with: remote) { tmp, response, error in
            guard let tmp, error == nil, (response as? HTTPURLResponse)?.statusCode == 200 else {
                call.reject("영상을 받지 못했어요.", "failed")
                return
            }
            let dest = Self.libraryCache.appendingPathComponent("\(key).mp4")
            do {
                try? FileManager.default.removeItem(at: dest)
                try FileManager.default.moveItem(at: tmp, to: dest)
            } catch {
                call.reject("폰에 저장하지 못했어요.", "failed")
                return
            }
            Self.trimLibraryCache(keeping: dest)
            self.lock.lock(); self.issued.insert(dest.path); self.lock.unlock()
            call.resolve(["path": dest.path, "size": Self.fileSize(dest), "source": "cache"])
        }.resume()
    }

    @objc func libraryPrune(_ call: CAPPluginCall) {
        let keep = Set(call.getArray("keep", String.self) ?? [])
        let files = (try? FileManager.default.contentsOfDirectory(at: Self.libraryCache, includingPropertiesForKeys: nil)) ?? []
        var removed = 0
        for url in files where !keep.contains(url.deletingPathExtension().lastPathComponent) {
            try? FileManager.default.removeItem(at: url)
            removed += 1
        }
        call.resolve(["removed": removed])
    }

    /// 상한을 넘으면 가장 오래 안 본(바뀐 때가 오랜) 것부터 지운다 — 방금 받은 것은 남긴다
    private static func trimLibraryCache(keeping: URL) {
        let keys: [URLResourceKey] = [.contentModificationDateKey, .fileSizeKey]
        guard var files = try? FileManager.default.contentsOfDirectory(at: libraryCache, includingPropertiesForKeys: keys) else { return }
        func date(_ u: URL) -> Date { (try? u.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate ?? .distantPast }
        func size(_ u: URL) -> Int64 { Int64((try? u.resourceValues(forKeys: [.fileSizeKey]))?.fileSize ?? 0) }
        var total = files.reduce(Int64(0)) { $0 + size($1) }
        files.sort { date($0) < date($1) }
        for url in files where total > libraryCacheLimit && url != keeping {
            total -= size(url)
            try? FileManager.default.removeItem(at: url)
        }
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
