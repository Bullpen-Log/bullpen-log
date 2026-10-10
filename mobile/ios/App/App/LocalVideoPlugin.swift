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
