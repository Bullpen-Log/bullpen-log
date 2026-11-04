import Foundation
import CryptoKit

/// Explicit original copies. No transcoding, no deletion of originals, no overwriting during restore.
enum LocalVideoBackup {
    struct Prepared { let file: URL; let bytes: Int; let sha256: String }
    enum Failure: Error { case invalid, exists, checksum }
    private static let restoreLock = NSLock()

    static func checksum(_ url: URL) throws -> String {
        let file = try FileHandle(forReadingFrom: url)
        defer { try? file.close() }
        var hash = SHA256()
        while let bytes = try file.read(upToCount: 1024 * 1024), !bytes.isEmpty { hash.update(data: bytes) }
        return hash.finalize().map { String(format: "%02x", $0) }.joined()
    }

    static func prepare(source: URL, temporaryRoot: URL) throws -> Prepared {
        guard ["mov", "mp4", "m4v"].contains(source.pathExtension.lowercased()) else { throw Failure.invalid }
        let dir = temporaryRoot.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        do {
            let copy = dir.appendingPathComponent("original.\(source.pathExtension.lowercased())")
            try FileManager.default.copyItem(at: source, to: copy)
            let bytes = try copy.resourceValues(forKeys: [.fileSizeKey]).fileSize ?? 0
            guard bytes > 0 else { throw Failure.invalid }
            return Prepared(file: copy, bytes: bytes, sha256: try checksum(copy))
        } catch { try? FileManager.default.removeItem(at: dir); throw error }
    }

    static func restore(source: URL, store: URL, id: String, sha256: String) throws {
        guard UUID(uuidString: id) != nil, sha256.count == 64, sha256.allSatisfy({ $0.isHexDigit }),
              ["mov", "mp4", "m4v"].contains(source.pathExtension.lowercased()) else { throw Failure.invalid }
        restoreLock.lock()
        defer { restoreLock.unlock() }
        let fm = FileManager.default
        let names = try fm.contentsOfDirectory(atPath: store.path)
        guard !names.contains(where: { ($0 as NSString).deletingPathExtension.lowercased() == id.lowercased() }) else { throw Failure.exists }
        let staged = store.appendingPathComponent("restore-\(UUID().uuidString).tmp")
        defer { try? fm.removeItem(at: staged) }
        try fm.copyItem(at: source, to: staged)
        guard try checksum(staged) == sha256.lowercased() else { throw Failure.checksum }
        try fm.moveItem(at: staged, to: store.appendingPathComponent("\(id).\(source.pathExtension.lowercased())"))
    }
}
