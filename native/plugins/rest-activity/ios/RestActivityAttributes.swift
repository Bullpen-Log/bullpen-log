import ActivityKit
import Foundation

/**
 * 세트 사이 휴식 — 다이나믹 아일랜드 · 잠금 화면에 뜨는 시계의 모양.
 * 앱(modules/bullpen-native BullpenNativeModule.swift)에도 같은 이름 · 같은 칸으로 하나 더 있다 — ActivityKit 은 이름과 칸으로 맞춰 본다.
 * 칸을 바꾸면 두 곳을 같이 고친다.
 */
struct RestActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    /** 마지막 세트를 남긴 때 — 시계는 여기서 0:00 부터 올라간다(앱 휴식 시계와 같다) */
    var since: Date
    /** 권장 쉬는 시간(초), 없으면 0 */
    var target: Int
    /** 다음에 할 운동 이름 */
    var exercise: String
  }
}
