#!/bin/bash
# 공 찾기 시험대 — 앱(mobile/ios/App/App/DualCameraPlugin.swift)의 BALL_TRIGGER 구간을 그대로 떼어 맥에서 영상에 돌린다.
# 앱과 같은 코드라 폰에서 무엇을 알릴지 그대로 나온다(ball = 날아가는 공이 확실 · motion = 움직임만). BALL_NET = 학습 모델 알림(--concat --net=, native/ DualCameraCore.swift 의 그 구간).
#   scripts/velocity-lab/ball-trigger/run.sh <영상.mov|mp4|y8>...      V=1 이면 이은 길(TRACK)까지 찍는다
# 빌드는 ~/bullpen-velocity-lab/ball-trigger/ 에(영상과 같이 저장소 밖).
set -e
HERE="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$HERE/../../.." && pwd)"
OUT="$HOME/bullpen-velocity-lab/ball-trigger"
mkdir -p "$OUT"
sed -n '/BALL_TRIGGER_BEGIN/,/BALL_TRIGGER_END/p' "$ROOT/mobile/ios/App/App/DualCameraPlugin.swift" > "$OUT/trigger.swift"
# 학습 모델 알림은 새 앱(native/)에만 있다 — 그 구간을 그대로
sed -n '/BALL_NET_BEGIN/,/BALL_NET_END/p' "$ROOT/native/modules/dual-camera/ios/DualCameraCore.swift" > "$OUT/ballnet.swift"
if [ ! -x "$OUT/run" ] || [ "$OUT/trigger.swift" -nt "$OUT/run" ] || [ "$HERE/main.swift" -nt "$OUT/run" ] || [ "$OUT/ballnet.swift" -nt "$OUT/run" ]; then
  swiftc -O -suppress-warnings -o "$OUT/run" "$OUT/trigger.swift" "$OUT/ballnet.swift" "$HERE/main.swift"
fi
exec "$OUT/run" "$@"
