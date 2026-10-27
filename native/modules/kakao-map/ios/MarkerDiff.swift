/// Compute changes without depending on the map SDK, so unchanged markers stay attached.
func markerChanges<T>(current: [String: T], desired: [String: T], same: (T, T) -> Bool) -> (removed: [String], added: [T]) {
  let removed = current.compactMap { id, old -> String? in
    guard let next = desired[id] else { return id }
    return same(old, next) ? nil : id
  }
  let added = desired.compactMap { id, next -> T? in
    guard let old = current[id] else { return next }
    return same(old, next) ? nil : next
  }
  return (removed, added)
}
