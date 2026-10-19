import ActivityKit
import SwiftUI
import WidgetKit

/** 휴식 시계 — 마지막 세트로부터 올라가는 시계. 앱의 10분 상한과 같게 10분에서 멈춘다 */
private func clock(_ s: RestActivityAttributes.ContentState) -> some View {
  Text(timerInterval: s.since...s.since.addingTimeInterval(600), countsDown: false)
    .monospacedDigit()
}

private func targetText(_ s: RestActivityAttributes.ContentState) -> String {
  s.target > 0 ? String(format: "권장 %d:%02d", s.target / 60, s.target % 60) : "쉬는 중"
}

private let sky = Color(red: 0.04, green: 0.52, blue: 0.84)

struct RestActivityWidget: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: RestActivityAttributes.self) { ctx in
      // 잠금 화면 · 알림 배너
      HStack(spacing: 12) {
        Image(systemName: "timer").font(.title2).foregroundStyle(sky)
        VStack(alignment: .leading, spacing: 2) {
          Text(ctx.state.exercise.isEmpty ? "쉬는 시간" : ctx.state.exercise).font(.subheadline).lineLimit(1)
          Text(targetText(ctx.state)).font(.caption).foregroundStyle(.secondary)
        }
        Spacer()
        clock(ctx.state).font(.system(size: 34, weight: .semibold)).frame(maxWidth: 110, alignment: .trailing)
      }
      .padding(16)
      .activityBackgroundTint(Color.black.opacity(0.35))
    } dynamicIsland: { ctx in
      DynamicIsland {
        DynamicIslandExpandedRegion(.leading) {
          Label("휴식", systemImage: "timer").font(.subheadline).foregroundStyle(sky)
        }
        DynamicIslandExpandedRegion(.trailing) {
          clock(ctx.state).font(.title2.weight(.semibold)).frame(maxWidth: 90, alignment: .trailing)
        }
        DynamicIslandExpandedRegion(.bottom) {
          HStack {
            Text(ctx.state.exercise).lineLimit(1)
            Spacer()
            Text(targetText(ctx.state)).foregroundStyle(.secondary)
          }
          .font(.caption)
        }
      } compactLeading: {
        Image(systemName: "timer").foregroundStyle(sky)
      } compactTrailing: {
        clock(ctx.state).frame(maxWidth: 46).foregroundStyle(sky)
      } minimal: {
        Image(systemName: "timer").foregroundStyle(sky)
      }
    }
  }
}

@main
struct RestActivityBundle: WidgetBundle {
  var body: some Widget {
    RestActivityWidget()
  }
}
