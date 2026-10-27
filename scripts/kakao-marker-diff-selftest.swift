struct Sample: Equatable { let id: String; let lat: Double; let name: String }

@main struct MarkerDiffTest {
  static func main() {
    let samples = (0..<1000).map { Sample(id: String($0), lat: Double($0), name: "place \($0)") }
    let current = Dictionary(uniqueKeysWithValues: samples.map { ($0.id, $0) })
    var desired = current
    var changes = markerChanges(current: current, desired: desired, same: ==)
    precondition(changes.removed.isEmpty && changes.added.isEmpty)
    desired["500"] = Sample(id: "500", lat: -5, name: "moved")
    changes = markerChanges(current: current, desired: desired, same: ==)
    precondition(changes.removed == ["500"] && changes.added.map(\.id) == ["500"])
    desired.removeValue(forKey: "999")
    desired["new"] = Sample(id: "new", lat: 3, name: "new")
    changes = markerChanges(current: current, desired: desired, same: ==)
    precondition(Set(changes.removed) == Set(["500", "999"]))
    precondition(Set(changes.added.map(\.id)) == Set(["500", "new"]))
    changes = markerChanges(current: desired, desired: [:], same: ==)
    precondition(changes.removed.count == 1000 && changes.added.isEmpty)
    print("마커 차이 검사 통과: 1,000개 유지 · 변경 · 추가 · 삭제 · 초기화")
  }
}
