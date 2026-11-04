import Foundation

@main struct BackupTest {
    static func main() throws {
        let fm = FileManager.default
        let root = fm.temporaryDirectory.appendingPathComponent("sinker-backup-test-\(UUID().uuidString)")
        try fm.createDirectory(at: root, withIntermediateDirectories: true)
        defer { try? fm.removeItem(at: root) }
        let store = root.appendingPathComponent("store")
        try fm.createDirectory(at: store, withIntermediateDirectories: true)
        let original = root.appendingPathComponent("recording.mov")
        let bytes = Data((0..<(2 * 1024 * 1024 + 5)).map { UInt8($0 % 251) })
        try bytes.write(to: original)
        let backup = try LocalVideoBackup.prepare(source: original, temporaryRoot: root.appendingPathComponent("tmp"))
        let copyBytes = try Data(contentsOf: backup.file)
        precondition(copyBytes == bytes)
        precondition(backup.bytes == bytes.count && backup.sha256.count == 64)
        precondition(fm.fileExists(atPath: original.path))
        let id = UUID().uuidString
        try LocalVideoBackup.restore(source: backup.file, store: store, id: id, sha256: backup.sha256)
        let restoredBytes = try Data(contentsOf: store.appendingPathComponent("\(id).mov"))
        precondition(restoredBytes == bytes)
        var rejected = 0
        func rejects(_ job: () throws -> Void) { do { try job(); preconditionFailure("Must reject") } catch { rejected += 1 } }
        rejects { try LocalVideoBackup.restore(source: backup.file, store: store, id: id, sha256: backup.sha256) }
        rejects { try LocalVideoBackup.restore(source: backup.file, store: store, id: id.lowercased(), sha256: backup.sha256) }
        rejects { try LocalVideoBackup.restore(source: backup.file, store: store, id: "../bad", sha256: backup.sha256) }
        rejects { try LocalVideoBackup.restore(source: backup.file, store: store, id: UUID().uuidString, sha256: String(repeating: "a", count: 64)) }
        let tampered = root.appendingPathComponent("tampered.mp4")
        try Data("different original".utf8).write(to: tampered)
        rejects { try LocalVideoBackup.restore(source: tampered, store: store, id: UUID().uuidString, sha256: backup.sha256) }
        precondition(rejected == 5)
        let remaining = try fm.contentsOfDirectory(atPath: store.path)
        precondition(remaining.count == 1)
        let originalBytes = try Data(contentsOf: original)
        precondition(originalBytes == bytes)
        print("local video backup: round trip, checksum, collision, traversal, cleanup, original preservation passed")
    }
}
