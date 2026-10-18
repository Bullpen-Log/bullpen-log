import ExpoModulesCore
import UIKit

/// 폰 영상 — Expo 모듈. 옛 Capacitor 앱의 LocalVideoPlugin(mobile/ios/App/App/LocalVideoPlugin.swift)을 그대로 옮겼다.
/// 같은 번들 id 라 같은 폴더 · 같은 파일 이름 · 같은 id 규칙을 지킨다 — 옛 앱이 남긴 영상을 새 앱이 그대로 찾는다.
///
/// 회원 영상은 앱 안(Application Support/bullpen-videos/<UUID>.<확장자>)에만 둔다 — 서버에도, 사진 앱 · 아이클라우드에도 두지 않는다
/// (2026-10-10 사용자: "앱 내부에만"). 아이폰 백업에서도 뺀다. 그래서 앱을 지우면 영상도 지워진다.
///   status()                              → { version: 2, access: 'authorized' }   (사진 접근이 필요 없다 — 옛 약속 모양만 지킴)
///   requestAccess()                       → { access: 'authorized' }
///   begin({ ext })                        → { token }            조금씩 받을 임시 파일
///   append({ token, data(base64) })       → { size }             4MB 까지씩
///   finish({ token })                     → { id }               앱 안 폴더로 옮김 · id = UUID
///   saveFile({ path })                    → { id }               앱 임시 · 캐시 폴더 안의 파일을 복사(경로 또는 file:// 주소)
///   load({ id })                          → { path, size }       그 영상 파일 · 없으면 code 'missing'
///   fileUrl({ id })                       → { url }              그 영상의 file:// 주소(RN 재생기가 바로 튼다) · 없으면 'missing'
///   read({ path, offset, length })        → { data, size, eof }  load · libraryLoad 가 준 경로만
///   discard({ paths })                    읽기 끝(앱 안 영상은 지우지 않는다)
///   exists({ ids })                       → { found: [id] }
///   remove({ ids })                       앱 안 영상 지우기
///
/// 운동 · 드릴(라이브러리) 영상 — 2026-10-13 김민: "영상을 줄여서 앱 안에 넣는 방안".
///   libraryStatus()                       → { bundled, cached, cacheBytes }
///   libraryLoad({ key })                  → { path, size, source }  앱 안(LibraryVideos/<key>.mp4) → 받아 둔 것 순, 없으면 'missing'
///   libraryFetch({ key, url })            → { path, size, source }  https 주소에서 한 번 받아 둠(Caches — 모자라면 iOS 가 지울 수 있음)
///   libraryPrune({ keep: [key] })         → { removed }             받아 둔 것 중 keep 에 없는 것 지우기
/// key 는 저장소 경로 'library/<uuid>.mp4' 의 <uuid>. 새 앱은 아직 LibraryVideos 를 안 넣을 수 있다 — 그러면 bundled 0.
public class LocalVideoModule: Module {
    private static let maxChunk = 4 * 1024 * 1024

    /// begin 이 준 토큰 → 받는 중인 임시 파일
    private var incoming: [String: URL] = [:]
    /// load 가 준 경로만 read · discard 한다
    private var issued = Set<String>()
    private let lock = NSLock()

    public func definition() -> ModuleDefinition {
        Name("LocalVideo")

        OnCreate {
            /* 하루 지난 임시 파일 — 앱이 중간에 꺼진 것 */
            let fm = FileManager.default
            guard let files = try? fm.contentsOfDirectory(at: Self.folder, includingPropertiesForKeys: [.contentModificationDateKey]) else { return }
            let dayAgo = Date().addingTimeInterval(-86_400)
            for url in files {
                let date = (try? url.resourceValues(forKeys: [.contentModificationDateKey]))?.contentModificationDate
                if let date, date < dayAgo { try? fm.removeItem(at: url) }
            }
        }

        AsyncFunction("status") { () -> [String: Any] in
            ["version": 2, "access": "authorized"]
        }

        AsyncFunction("requestAccess") { () -> [String: Any] in
            ["access": "authorized"]
        }

        // MARK: 저장

        AsyncFunction("begin") { (options: [String: Any], promise: Promise) in
            let ext = ((options["ext"] as? String) ?? "mp4").lowercased().filter { $0.isLetter || $0.isNumber }
            do {
                try FileManager.default.createDirectory(at: Self.folder, withIntermediateDirectories: true)
                let token = UUID().uuidString
                let url = Self.folder.appendingPathComponent("in-\(token).\(ext.isEmpty ? "mp4" : ext)")
                guard FileManager.default.createFile(atPath: url.path, contents: nil) else { throw CocoaError(.fileWriteUnknown) }
                self.lock.lock(); self.incoming[token] = url; self.lock.unlock()
                promise.resolve(["token": token])
            } catch {
                promise.reject("failed", "임시 파일을 만들지 못했어요.")
            }
        }

        AsyncFunction("append") { (options: [String: Any], promise: Promise) in
            guard let token = options["token"] as? String, let url = self.fileFor(token) else {
                return promise.reject("token", "받는 중인 영상이 아니에요.")
            }
            guard let b64 = options["data"] as? String, let data = Data(base64Encoded: b64), data.count <= Self.maxChunk else {
                return promise.reject("data", "조각이 올바르지 않아요.")
            }
            do {
                let handle = try FileHandle(forWritingTo: url)
                defer { try? handle.close() }
                let size = try handle.seekToEnd()
                try handle.write(contentsOf: data)
                promise.resolve(["size": Int(size) + data.count])
            } catch {
                promise.reject("failed", "영상을 쓰지 못했어요.")
            }
        }

        AsyncFunction("finish") { (options: [String: Any], promise: Promise) in
            guard let token = options["token"] as? String, let url = self.fileFor(token) else {
                return promise.reject("token", "받는 중인 영상이 아니에요.")
            }
            self.lock.lock(); self.incoming.removeValue(forKey: token); self.lock.unlock()
            Self.keep(url, move: true, promise)
        }

        /// 앱이 이미 가진 파일 — 앱 임시 폴더 · 캐시 폴더(사진 고르기가 주는 file:// 주소) 안의 것만. 늘 복사한다(원본은 부른 쪽 몫)
        AsyncFunction("saveFile") { (options: [String: Any], promise: Promise) in
            guard let raw = options["path"] as? String else {
                return promise.reject("path", "경로가 없어요.")
            }
            let url = URL(fileURLWithPath: Self.plainPath(raw)).resolvingSymlinksInPath()
            var isDir: ObjCBool = false
            guard Self.savableRoots.contains(where: { url.path.hasPrefix($0 + "/") }),
                  FileManager.default.fileExists(atPath: url.path, isDirectory: &isDir), !isDir.boolValue else {
                return promise.reject("path", "저장할 수 없는 파일이에요.")
            }
            Self.keep(url, move: false, promise)
        }

        // MARK: 꺼내기

        AsyncFunction("load") { (options: [String: Any], promise: Promise) in
            guard let id = options["id"] as? String, let url = Self.stored(id) else {
                return promise.reject("missing", "이 폰에 그 영상이 없어요.")
            }
            self.lock.lock(); self.issued.insert(url.path); self.lock.unlock()
            promise.resolve(["path": url.path, "size": Self.fileSize(url)])
        }

        /// 새 앱만의 것 — RN 재생기는 file:// 주소를 바로 튼다(base64 로 나눠 읽지 않는다)
        AsyncFunction("fileUrl") { (options: [String: Any], promise: Promise) in
            guard let id = options["id"] as? String, let url = Self.stored(id) else {
                return promise.reject("missing", "이 폰에 그 영상이 없어요.")
            }
            promise.resolve(["url": url.absoluteString])
        }

        AsyncFunction("read") { (options: [String: Any], promise: Promise) in
            guard let path = options["path"] as? String, self.isIssued(path) else {
                return promise.reject("path", "읽을 수 없는 파일이에요.")
            }
            /* JS 숫자는 Double 로 온다 — as? Int 는 nil 이 된다 */
            let offset = UInt64(max(0, Self.int(options["offset"]) ?? 0))
            let length = max(1, min(Self.maxChunk, Self.int(options["length"]) ?? 1024 * 1024))
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
                promise.reject("read", "영상을 읽지 못했어요.")
            }
        }

        /// 읽기 끝 — 앱 안 영상 자체는 그대로 둔다(지우기는 remove)
        AsyncFunction("discard") { (options: [String: Any]) in
            for path in (options["paths"] as? [String]) ?? [] {
                self.lock.lock(); self.issued.remove(path); self.lock.unlock()
            }
        }

        AsyncFunction("exists") { (options: [String: Any]) -> [String: Any] in
            let ids = (options["ids"] as? [String]) ?? []
            return ["found": ids.filter { Self.stored($0) != nil }]
        }

        AsyncFunction("remove") { (options: [String: Any]) in
            for id in (options["ids"] as? [String]) ?? [] {
                if let url = Self.stored(id) { try? FileManager.default.removeItem(at: url) }
            }
        }

        // MARK: 라이브러리 영상

        AsyncFunction("libraryStatus") { () -> [String: Any] in
            let inBundle = Bundle.main.urls(forResourcesWithExtension: "mp4", subdirectory: "LibraryVideos")?.count ?? 0
            let files = (try? FileManager.default.contentsOfDirectory(at: Self.libraryCache, includingPropertiesForKeys: nil)) ?? []
            let mp4 = files.filter { $0.pathExtension == "mp4" }
            return ["bundled": inBundle, "cached": mp4.count, "cacheBytes": mp4.reduce(0) { $0 + Self.fileSize($1) }]
        }

        AsyncFunction("libraryLoad") { (options: [String: Any], promise: Promise) in
            guard let key = Self.validKey(options["key"] as? String) else {
                return promise.reject("key", "영상 이름이 올바르지 않아요.")
            }
            self.libraryLoad(key, promise)
        }

        AsyncFunction("libraryFetch") { (options: [String: Any], promise: Promise) in
            guard let key = Self.validKey(options["key"] as? String) else {
                return promise.reject("key", "영상 이름이 올바르지 않아요.")
            }
            guard let raw = options["url"] as? String, let remote = URL(string: raw), remote.scheme == "https" else {
                return promise.reject("url", "주소가 올바르지 않아요.")
            }
            if Self.bundled(key) != nil || Self.cached(key) != nil {
                return self.libraryLoad(key, promise)
            }
            URLSession.shared.downloadTask(with: remote) { tmp, response, error in
                guard let tmp, error == nil, (response as? HTTPURLResponse)?.statusCode == 200 else {
                    return promise.reject("failed", "영상을 받지 못했어요.")
                }
                let dest = Self.libraryCache.appendingPathComponent("\(key).mp4")
                do {
                    try? FileManager.default.removeItem(at: dest)
                    try FileManager.default.moveItem(at: tmp, to: dest)
                } catch {
                    return promise.reject("failed", "폰에 저장하지 못했어요.")
                }
                Self.trimLibraryCache(keeping: dest)
                self.lock.lock(); self.issued.insert(dest.path); self.lock.unlock()
                promise.resolve(["path": dest.path, "size": Self.fileSize(dest), "source": "cache"])
            }.resume()
        }

        AsyncFunction("libraryPrune") { (options: [String: Any]) -> [String: Any] in
            let keep = Set((options["keep"] as? [String]) ?? [])
            let files = (try? FileManager.default.contentsOfDirectory(at: Self.libraryCache, includingPropertiesForKeys: nil)) ?? []
            var removed = 0
            for url in files where !keep.contains(url.deletingPathExtension().lastPathComponent) {
                try? FileManager.default.removeItem(at: url)
                removed += 1
            }
            return ["removed": removed]
        }
    }

    // MARK: 폴더

    private static var folder: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("bullpen-local-video", isDirectory: true)
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

    /// saveFile 이 받는 곳 — 앱 임시 폴더 · 캐시 폴더(심볼릭 링크를 풀어 /var · /private/var 차이를 없앤다)
    private static var savableRoots: [String] {
        let fm = FileManager.default
        return [fm.temporaryDirectory, fm.urls(for: .cachesDirectory, in: .userDomainMask)[0]]
            .map { $0.resolvingSymlinksInPath().path }
    }

    /// id(UUID) → 앱 안 파일. 꼴이 틀리거나 없으면 nil
    private static func stored(_ id: String) -> URL? {
        guard UUID(uuidString: id) != nil,
              let names = try? FileManager.default.contentsOfDirectory(atPath: store.path),
              let name = names.first(where: { ($0 as NSString).deletingPathExtension == id }) else { return nil }
        return store.appendingPathComponent(name)
    }

    private static func keep(_ url: URL, move: Bool, _ promise: Promise) {
        let id = UUID().uuidString
        let ext = url.pathExtension.isEmpty ? "mp4" : url.pathExtension.lowercased()
        let dest = store.appendingPathComponent("\(id).\(ext)")
        do {
            if move { try FileManager.default.moveItem(at: url, to: dest) } else { try FileManager.default.copyItem(at: url, to: dest) }
            promise.resolve(["id": id])
        } catch {
            if move { try? FileManager.default.removeItem(at: url) }
            promise.reject("failed", "폰에 저장하지 못했어요.")
        }
    }

    // MARK: 라이브러리

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

    private func libraryLoad(_ key: String, _ promise: Promise) {
        let source: String
        let url: URL
        if let b = Self.bundled(key) {
            source = "bundle"; url = b
        } else if let c = Self.cached(key) {
            source = "cache"; url = c
            /* 본 때를 남긴다 — 상한을 넘으면 오래 안 본 것부터 지운다 */
            try? FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: c.path)
        } else {
            return promise.reject("missing", "폰에 없는 영상이에요.")
        }
        lock.lock(); issued.insert(url.path); lock.unlock()
        promise.resolve(["path": url.path, "size": Self.fileSize(url), "source": source])
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

    private static func fileSize(_ url: URL) -> Int {
        ((try? FileManager.default.attributesOfItem(atPath: url.path))?[.size] as? Int) ?? 0
    }

    /// 'file:///…' 주소면 경로로(퍼센트 글자도 풂), 아니면 그대로
    private static func plainPath(_ raw: String) -> String {
        guard raw.hasPrefix("file://") else { return raw }
        return URL(string: raw)?.path ?? String(raw.dropFirst("file://".count))
    }

    private static func int(_ value: Any?) -> Int? {
        if let v = value as? Int { return v }
        /* 범위 밖 · NaN 이면 nil(Int(v) 는 넘치면 앱이 죽는다) */
        if let v = value as? Double { return Int(exactly: v.rounded(.towardZero)) }
        if let v = value as? NSNumber { return v.intValue }
        return nil
    }

    private func fileFor(_ token: String) -> URL? {
        lock.lock(); defer { lock.unlock() }
        return incoming[token]
    }

    private func isIssued(_ path: String) -> Bool {
        lock.lock(); defer { lock.unlock() }
        return issued.contains(path)
    }
}
